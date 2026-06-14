import { buildPushHTTPRequest } from '@pushforge/builder'
import { log } from 'mentie'

import { sha256_base64url } from './crypto.js'
import { error_response } from './response.js'

const default_push_ttl_seconds = 60 * 60 * 24
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
            await env.DB.prepare( `
                UPDATE push_subscriptions
                SET last_success_at = ?, last_failure_at = NULL, failure_count = 0, updated_at = ?
                WHERE id = ?
            ` ).bind( now, now, subscription_row.id ).run()

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
 * @returns {Promise<Array>} Delivery results
 */
export async function send_push_notifications( env, subscription_rows, payload, options = {} ) {

    if( !has_push_configuration( env ) || !subscription_rows.length ) return []

    return Promise.all( subscription_rows.map( row => send_push_notification( env, row, payload, options ) ) )
}

/**
 * Notifies admins that a new member needs review.
 * @param {Object} env - Worker environment
 * @param {Object} user - Newly pending user
 * @returns {Promise<Array>} Delivery results
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
 * @returns {Promise<Array>} Delivery results
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
 * @returns {Promise<Array>} Delivery results
 */
export async function notify_users_of_community_bulletin( env, update ) {

    if( update?.status !== `success` ) return []

    const subscriptions = await active_member_subscriptions( env )
    return send_push_notifications( env, subscriptions, notification_event( `community_bulletin`, {
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
 * Queues notification work without delaying the API response.
 * @param {Object} ctx - Worker context
 * @param {Promise} task - Notification task
 * @returns {void}
 */
export function queue_notification_task( ctx, task ) {

    const guarded_task = task.catch( error => log.warn( `Notification task failed`, error ) )
    if( ctx?.waitUntil ) {
        ctx.waitUntil( guarded_task )
        return
    }

    void guarded_task
}

async function record_push_failure( env, subscription_row, status, now ) {

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

async function active_user_subscriptions( env, user_id ) {

    const { results } = await env.DB.prepare( `
        SELECT *
        FROM push_subscriptions
        WHERE user_id = ?
            AND disabled_at IS NULL
    ` ).bind( user_id ).all()

    return results
}

async function active_admin_subscriptions( env ) {

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

async function active_member_subscriptions( env ) {

    const { results } = await env.DB.prepare( `
        SELECT push_subscriptions.*
        FROM push_subscriptions
        JOIN users ON users.id = push_subscriptions.user_id
        WHERE users.status = 'accepted'
            AND push_subscriptions.disabled_at IS NULL
    ` ).all()

    return results
}
