import { buildPushHTTPRequest } from '@pushforge/builder'
import { log } from 'mentie'

import { sha256_base64url } from './crypto.js'
import { error_response } from './response.js'

const default_push_ttl_seconds = 60 * 60 * 24
const default_push_delivery_batch_size = 10
const default_push_delivery_limit = 40
const stale_failure_limit = 8
const notification_icon = `/icons/icon-192.svg`
const notification_badge = `/icons/icon-192.svg`

const notification_event = ( type, payload ) => ( {
    type,
    icon: notification_icon,
    badge: notification_badge,
    timestamp: Date.now(),
    ...payload,
} )

const push_error = ( code, message, status = 400, details = {} ) => Object.assign( new Error( code ), {
    response: error_response( code, message, status, details ),
} )

const required_text = ( value, field, max_characters ) => {

    const normalized = `${ value || `` }`.trim()
    if( !normalized ) throw push_error( `missing_${ field }`, `${ field } is required.` )
    if( normalized.length > max_characters ) throw push_error( `${ field }_too_long`, `${ field } is too long.`, 413, { max_characters } )

    return normalized
}

const optional_text = ( value, field, max_characters, fallback = `` ) => {

    const normalized = `${ value || `` }`.trim()
    if( !normalized ) return fallback
    if( normalized.length > max_characters ) throw push_error( `${ field }_too_long`, `${ field } is too long.`, 413, { max_characters } )

    return normalized
}

const assert_https_endpoint = endpoint => {

    try {
        const url = new URL( endpoint )
        if( url.protocol === `https:` ) return
    } catch {
        // Fall through to the shared validation error below.
    }

    throw push_error( `invalid_push_endpoint`, `Send a valid push endpoint.` )
}

const normalize_subscription = payload => {

    const subscription = payload?.subscription || payload || {}
    const endpoint = required_text( subscription.endpoint, `endpoint`, 2_048 )
    const keys = subscription.keys || {}
    const p256dh = required_text( keys.p256dh, `p256dh`, 512 )
    const auth = required_text( keys.auth, `auth`, 256 )
    const content_encoding = optional_text( payload?.content_encoding || subscription.content_encoding, `content_encoding`, 32, `aes128gcm` )
    const expiration_time = Number.isFinite( Number( subscription.expirationTime ) ) ? Number( subscription.expirationTime ) : null

    assert_https_endpoint( endpoint )

    return {
        endpoint,
        keys: { p256dh, auth },
        content_encoding,
        expiration_time,
    }
}

const subscription_from_row = row => ( {
    endpoint: row.endpoint,
    keys: {
        p256dh: row.p256dh,
        auth: row.auth,
    },
} )

const notification_admin_contact = env => `${ env.VAPID_SUBJECT || `` }`.trim()

const bounded_integer = ( value, fallback, { min, max } ) => {

    const normalized = Number.parseInt( `${ value || `` }`, 10 )
    if( !Number.isFinite( normalized ) ) return fallback

    return Math.min( max, Math.max( min, normalized ) )
}

const push_delivery_batch_size = env => bounded_integer(
    env.PUSH_DELIVERY_BATCH_SIZE,
    default_push_delivery_batch_size,
    { min: 1, max: 25 },
)

const push_delivery_limit = env => bounded_integer(
    env.PUSH_DELIVERY_LIMIT,
    default_push_delivery_limit,
    { min: 1, max: 1_000 },
)

const push_delivery_summary = ( total, results, remaining = 0 ) => ( {
    total,
    attempted: results.length,
    ok: results.filter( result => result?.ok ).length,
    failed: results.filter( result => result?.ok === false ).length,
    skipped: results.filter( result => result?.skipped ).length,
    remaining,
    results,
} )

/**
 * Checks whether Web Push delivery is configured.
 * @param {Object} env - Worker environment
 * @returns {Boolean} Whether push notifications are configured
 */
export function has_push_configuration( env ) {

    return Boolean( env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && notification_admin_contact( env ) )
}

/**
 * Builds the public notification capability payload.
 * @param {Object} env - Worker environment
 * @returns {Object} Public notification configuration
 */
export function public_notification_config( env ) {

    return {
        supported: has_push_configuration( env ),
        public_key: has_push_configuration( env ) ? env.VAPID_PUBLIC_KEY : null,
    }
}

/**
 * Stores or refreshes a browser push subscription for the current user.
 * @param {Object} env - Worker environment
 * @param {Request} request - Incoming request
 * @param {Object} user - Current session user
 * @param {Object} payload - Push subscription payload
 * @returns {Promise<Object>} Normalized subscription
 */
export async function save_push_subscription( env, request, user, payload ) {

    if( !has_push_configuration( env ) ) throw push_error( `notifications_unavailable`, `Notifications are not configured.`, 503 )

    const subscription = normalize_subscription( payload )
    const now = new Date().toISOString()
    const user_agent_hash = await sha256_base64url( request.headers.get( `user-agent` ) || `` )

    await env.DB.prepare( `
        INSERT INTO push_subscriptions (
            id, user_id, endpoint, p256dh, auth, content_encoding, expiration_time,
            user_agent_hash, created_at, updated_at, disabled_at, failure_count
        )
        VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0 )
        ON CONFLICT( endpoint ) DO UPDATE SET
            user_id = excluded.user_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            content_encoding = excluded.content_encoding,
            expiration_time = excluded.expiration_time,
            user_agent_hash = excluded.user_agent_hash,
            updated_at = excluded.updated_at,
            disabled_at = NULL,
            failure_count = 0
    ` ).bind(
        crypto.randomUUID(),
        user.id,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        subscription.content_encoding,
        subscription.expiration_time,
        user_agent_hash,
        now,
        now,
    ).run()

    return subscription
}

/**
 * Deletes push subscriptions for the current user.
 * @param {Object} env - Worker environment
 * @param {Object} user - Current session user
 * @returns {Promise<void>} Completion promise
 */
export async function delete_push_subscriptions( env, user ) {

    await env.DB.prepare( `DELETE FROM push_subscriptions WHERE user_id = ?` ).bind( user.id ).run()
}

/**
 * Sends one Web Push notification and records delivery health.
 * @param {Object} env - Worker environment
 * @param {Object} subscription_row - Stored subscription row
 * @param {Object} payload - Notification payload
 * @param {Object} options - Web Push protocol options
 * @returns {Promise<Object>} Delivery result
 */
export async function send_push_notification( env, subscription_row, payload, options = {} ) {

    if( !has_push_configuration( env ) ) return { skipped: true, reason: `not_configured` }

    const now = new Date().toISOString()

    try {
        const { endpoint, headers, body } = await buildPushHTTPRequest( {
            privateJWK: env.VAPID_PRIVATE_KEY,
            subscription: subscription_from_row( subscription_row ),
            message: {
                payload,
                adminContact: notification_admin_contact( env ),
                options: {
                    ttl: default_push_ttl_seconds,
                    urgency: `normal`,
                    ...options,
                },
            },
        } )
        const response = await fetch( endpoint, { method: `POST`, headers, body } )

        if( response.ok ) {
            await record_push_success( env, subscription_row, now )

            return { ok: true, status: response.status }
        }

        await record_push_failure( env, subscription_row, response.status, now )
        return { ok: false, status: response.status }
    } catch ( error ) {
        log.warn( `Push notification delivery failed`, error )
        await record_push_failure( env, subscription_row, 0, now )
        return { ok: false, status: 0 }
    }
}

/**
 * Sends a notification payload to every selected subscription.
 * @param {Object} env - Worker environment
 * @param {Array} subscription_rows - Stored subscription rows
 * @param {Object} payload - Notification payload
 * @param {Object} options - Web Push protocol options
 * @param {Function} delivery_function - Single-subscription delivery implementation
 * @returns {Promise<Object>} Delivery summary
 */
export async function send_push_notifications( env, subscription_rows, payload, options = {}, delivery_function = send_push_notification ) {

    if( !subscription_rows.length ) return push_delivery_summary( 0, [] )
    if( !has_push_configuration( env ) ) return push_delivery_summary(
        subscription_rows.length,
        subscription_rows.map( () => ( { skipped: true, reason: `not_configured` } ) ),
    )

    const batch_size = push_delivery_batch_size( env )
    const results = []

    for( let index = 0; index < subscription_rows.length; index += batch_size ) {
        const batch = subscription_rows.slice( index, index + batch_size )
        const settled_results = await Promise.allSettled(
            batch.map( row => delivery_function( env, row, payload, options ) ),
        )

        results.push( ...settled_results.map( result => {
            if( result.status === `fulfilled` ) return result.value

            log.warn( `Push notification batch item failed`, result.reason )
            return { ok: false, status: 0 }
        } ) )
    }

    return push_delivery_summary( subscription_rows.length, results )
}

/**
 * Notifies admins that a new member needs review.
 * @param {Object} env - Worker environment
 * @param {Object} user - Newly pending user
 * @returns {Promise<Object>} Delivery summary
 */
export async function notify_admins_of_pending_signup( env, user ) {

    const subscriptions = await active_admin_subscriptions( env )
    return send_push_notifications( env, subscriptions, notification_event( `pending_signup`, {
        title: `New member waiting for review`,
        body: `${ user.name } requested Grapevine access.`,
        tag: `pending-signup-${ user.id }`,
        data: {
            url: `/admin`,
            user_id: user.id,
        },
    } ), { urgency: `normal`, topic: `pending-signup-${ user.id }` } )
}

/**
 * Notifies a member that their account status changed.
 * @param {Object} env - Worker environment
 * @param {Object} user - Updated user
 * @returns {Promise<Object>} Delivery summary
 */
export async function notify_user_of_account_status( env, user ) {

    const subscriptions = await active_user_subscriptions( env, user.id )
    const accepted = user.status === `accepted`
    const blocked = user.status === `blocked`
    const title = accepted
        ? `Your Grapevine account was approved`
        : blocked ? `Your Grapevine account changed` : `Your Grapevine account is pending`
    const body = accepted
        ? `You can now open the Grapevine.`
        : blocked ? `Open Grapevine for the latest account note.` : `Your account is back in review.`

    return send_push_notifications( env, subscriptions, notification_event( `account_status`, {
        title,
        body,
        tag: `account-status-${ user.id }`,
        data: {
            url: `/`,
            status: user.status,
        },
    } ), { urgency: `normal`, topic: `account-status-${ user.id }` } )
}

/**
 * Notifies accepted members that a new community bulletin was published.
 * @param {Object} env - Worker environment
 * @param {Object} update - Grapevine update row
 * @returns {Promise<Object>} Delivery summary
 */
export async function notify_users_of_community_bulletin( env, update ) {

    if( update?.status !== `success` ) return push_delivery_summary( 0, [] )

    return enqueue_member_push_notification( env, notification_event( `community_bulletin`, {
        title: `New community bulletin`,
        body: `The latest Grapevine update is ready.`,
        tag: `community-bulletin-${ update.id }`,
        data: {
            url: `/bulletins`,
            update_id: update.id,
        },
    } ), { urgency: `low`, topic: `community-bulletin-${ update.id }` } )
}

/**
 * Creates a resumable member notification job and immediately drains one batch.
 * @param {Object} env - Worker environment
 * @param {Object} payload - Notification payload
 * @param {Object} options - Web Push protocol options
 * @returns {Promise<Object>} Delivery summary
 */
export async function enqueue_member_push_notification( env, payload, options = {} ) {

    if( !has_push_configuration( env ) ) return push_delivery_summary( 0, [] )

    const now = new Date().toISOString()
    await env.DB.prepare( `
        INSERT INTO push_notification_jobs (
            id, audience, payload_json, options_json, last_subscription_id,
            created_at, updated_at
        )
        VALUES ( ?, 'accepted_members', ?, ?, '', ?, ? )
    ` ).bind(
        crypto.randomUUID(),
        JSON.stringify( payload ),
        JSON.stringify( options ),
        now,
        now,
    ).run()

    return drain_push_notification_jobs( env )
}

/**
 * Drains one bounded notification job batch.
 * @param {Object} env - Worker environment
 * @param {Function} delivery_function - Single-subscription delivery implementation
 * @returns {Promise<Object>} Delivery summary
 */
export async function drain_push_notification_jobs( env, delivery_function = send_push_notification ) {

    if( !has_push_configuration( env ) ) return push_delivery_summary( 0, [] )

    const job = await env.DB.prepare( `
        SELECT *
        FROM push_notification_jobs
        WHERE completed_at IS NULL
            AND failed_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
    ` ).first()
    if( !job ) return push_delivery_summary( 0, [] )

    let payload
    let options

    try {
        payload = JSON.parse( job.payload_json )
        options = JSON.parse( job.options_json || `{}` )
    } catch ( error ) {
        await fail_push_notification_job( env, job.id, error )
        return push_delivery_summary( 0, [] )
    }

    const limit = push_delivery_limit( env )
    const subscriptions = await active_member_subscriptions( env, {
        after_id: job.last_subscription_id,
        limit,
    } )
    const summary = await send_push_notifications( env, subscriptions, payload, options, delivery_function )
    const last_subscription_id = subscriptions.at( -1 )?.id || job.last_subscription_id || ``
    const remaining = last_subscription_id
        ? await count_active_member_subscriptions_after( env, last_subscription_id )
        : 0

    await update_push_notification_job_cursor( env, job.id, last_subscription_id, remaining )

    return {
        ...summary,
        job_id: job.id,
        remaining,
    }
}

/**
 * Queues notification work without delaying the API response.
 * @param {Object} ctx - Worker context
 * @param {Promise} task - Notification task
 * @returns {void}
 */
export function queue_notification_task( ctx, task ) {

    const guarded_task = task
        .then( result => {
            if( result?.remaining > 0 ) log.info( `Notification delivery has remaining subscriptions queued`, result )
            return result
        } )
        .catch( error => log.warn( `Notification task failed`, error ) )
    if( ctx?.waitUntil ) {
        ctx.waitUntil( guarded_task )
        return
    }

    void guarded_task
}

async function update_push_notification_job_cursor( env, job_id, last_subscription_id, remaining ) {

    const now = new Date().toISOString()
    await env.DB.prepare( `
        UPDATE push_notification_jobs
        SET last_subscription_id = ?,
            updated_at = ?,
            completed_at = CASE WHEN ? = 0 THEN ? ELSE completed_at END
        WHERE id = ?
    ` ).bind( last_subscription_id, now, remaining, now, job_id ).run()
}

async function fail_push_notification_job( env, job_id, error ) {

    const now = new Date().toISOString()
    await env.DB.prepare( `
        UPDATE push_notification_jobs
        SET failed_at = ?,
            updated_at = ?,
            last_error = ?
        WHERE id = ?
    ` ).bind( now, now, error.message || `Invalid notification job`, job_id ).run()
}

/**
 * Records a successful push delivery and clears stale failure state.
 * @param {Object} env - Worker environment
 * @param {Object} subscription_row - Stored subscription row
 * @param {String} now - ISO timestamp for the health update
 * @returns {Promise<void>} Completion promise
 */
export async function record_push_success( env, subscription_row, now ) {

    await env.DB.prepare( `
        UPDATE push_subscriptions
        SET last_success_at = ?, last_failure_at = NULL, failure_count = 0, updated_at = ?
        WHERE id = ?
    ` ).bind( now, now, subscription_row.id ).run()
}

/**
 * Records a failed push delivery and disables stale subscriptions.
 * @param {Object} env - Worker environment
 * @param {Object} subscription_row - Stored subscription row
 * @param {Number} status - Push service HTTP status, or 0 for local failures
 * @param {String} now - ISO timestamp for the health update
 * @returns {Promise<void>} Completion promise
 */
export async function record_push_failure( env, subscription_row, status, now ) {

    const should_disable = [ 404, 410 ].includes( status ) || Number( subscription_row.failure_count || 0 ) + 1 >= stale_failure_limit

    await env.DB.prepare( `
        UPDATE push_subscriptions
        SET last_failure_at = ?,
            failure_count = failure_count + 1,
            disabled_at = CASE WHEN ? = 1 THEN ? ELSE disabled_at END,
            updated_at = ?
        WHERE id = ?
    ` ).bind( now, should_disable ? 1 : 0, now, now, subscription_row.id ).run()
}

/**
 * Lists active push subscriptions for one user.
 * @param {Object} env - Worker environment
 * @param {String} user_id - User id
 * @returns {Promise<Array>} Active subscription rows
 */
export async function active_user_subscriptions( env, user_id ) {

    const { results } = await env.DB.prepare( `
        SELECT *
        FROM push_subscriptions
        WHERE user_id = ?
            AND disabled_at IS NULL
    ` ).bind( user_id ).all()

    return results
}

/**
 * Lists active push subscriptions owned by accepted admins.
 * @param {Object} env - Worker environment
 * @returns {Promise<Array>} Active admin subscription rows
 */
export async function active_admin_subscriptions( env ) {

    const { results } = await env.DB.prepare( `
        SELECT push_subscriptions.*
        FROM push_subscriptions
        JOIN users ON users.id = push_subscriptions.user_id
        WHERE users.status = 'accepted'
            AND users.role = 'admin'
            AND push_subscriptions.disabled_at IS NULL
    ` ).all()

    return results
}

/**
 * Lists active accepted-member push subscriptions with optional keyset bounds.
 * @param {Object} env - Worker environment
 * @param {Object} options - Query options
 * @param {String} options.after_id - Last subscription id already drained
 * @param {Number} options.limit - Maximum rows to return
 * @returns {Promise<Array>} Active member subscription rows
 */
export async function active_member_subscriptions( env, options = {} ) {

    const { after_id = ``, limit = null } = options
    const bindings = []
    const clauses = [
        `users.status = 'accepted'`,
        `push_subscriptions.disabled_at IS NULL`,
    ]

    if( after_id ) {
        clauses.push( `push_subscriptions.id > ?` )
        bindings.push( after_id )
    }

    const limit_clause = limit ? `LIMIT ?` : ``
    if( limit ) bindings.push( limit )

    const query = env.DB.prepare( `
        SELECT push_subscriptions.*
        FROM push_subscriptions
        JOIN users ON users.id = push_subscriptions.user_id
        WHERE ${ clauses.join( ` AND ` ) }
        ORDER BY push_subscriptions.id ASC
        ${ limit_clause }
    ` )
    const { results } = await ( bindings.length ? query.bind( ...bindings ) : query ).all()

    return results
}

async function count_active_member_subscriptions_after( env, subscription_id ) {

    const row = await env.DB.prepare( `
        SELECT count(*) AS remaining_count
        FROM push_subscriptions
        JOIN users ON users.id = push_subscriptions.user_id
        WHERE users.status = 'accepted'
            AND push_subscriptions.disabled_at IS NULL
            AND push_subscriptions.id > ?
    ` ).bind( subscription_id ).first()

    return Number( row?.remaining_count || 0 )
}
