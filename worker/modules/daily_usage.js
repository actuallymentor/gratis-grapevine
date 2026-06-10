import { add_days, zoned_datetime_to_utc_iso, zoned_parts } from './time.js'
import { error_response } from './response.js'

export const daily_usage_scopes = {
    recording_seconds: `recording_seconds`,
    messages: `messages`,
    grapevine_questions: `grapevine_questions`,
}

const default_limits = {
    recording_minutes: 60,
    messages: 5,
    grapevine_questions: 10,
}

const positive_integer = ( value, fallback ) => {

    const parsed_value = Number( value )
    return Number.isFinite( parsed_value ) && parsed_value > 0 ? Math.floor( parsed_value ) : fallback
}

const usage_timezone = env => env.GRAPEVINE_TIMEZONE || `Europe/Amsterdam`

const is_daily_usage_constraint_error = error => /CHECK constraint failed/i.test( `${ error?.message || `` }` )

const scope_details = {
    [ daily_usage_scopes.recording_seconds ]: {
        label: `recording upload`,
        limit: env => positive_integer( env.GRAPEVINE_DAILY_RECORDING_MINUTES, default_limits.recording_minutes ) * 60,
        message: `You have reached today's recording upload limit. Try again after the daily reset.`,
        code: `daily_recording_limit_reached`,
    },
    [ daily_usage_scopes.messages ]: {
        label: `message`,
        limit: env => positive_integer( env.GRAPEVINE_DAILY_MESSAGE_LIMIT, default_limits.messages ),
        message: `You have reached today's message limit. Try again after the daily reset.`,
        code: `daily_message_limit_reached`,
    },
    [ daily_usage_scopes.grapevine_questions ]: {
        label: `Ask Grapevine question`,
        limit: env => positive_integer( env.GRAPEVINE_DAILY_QUESTION_LIMIT, default_limits.grapevine_questions ),
        message: `You have reached today's Ask Grapevine limit. Try again after the daily reset.`,
        code: `daily_grapevine_question_limit_reached`,
    },
}

/**
 * Resolves configured per-user daily usage limits.
 * @param {Object} env - Worker environment
 * @returns {Object} Daily usage limits
 */
export function resolve_daily_usage_limits( env ) {

    return {
        recording_minutes: positive_integer( env.GRAPEVINE_DAILY_RECORDING_MINUTES, default_limits.recording_minutes ),
        recording_seconds: scope_details.recording_seconds.limit( env ),
        messages: scope_details.messages.limit( env ),
        grapevine_questions: scope_details.grapevine_questions.limit( env ),
    }
}

/**
 * Returns the active usage date and reset timestamp in the deployment timezone.
 * @param {Object} env - Worker environment
 * @param {Date} now - Current date
 * @returns {Object} Daily usage window
 */
export function daily_usage_window( env, now = new Date() ) {

    const timezone = usage_timezone( env )
    const { year, month, day } = zoned_parts( now, timezone )
    const usage_date = `${ year }-${ month }-${ day }`
    const reset_date = add_days( usage_date, 1 )
    const reset_at = zoned_datetime_to_utc_iso( timezone, {
        year: Number( reset_date.slice( 0, 4 ) ),
        month: Number( reset_date.slice( 5, 7 ) ),
        day: Number( reset_date.slice( 8, 10 ) ),
        hour: 0,
    } )

    return { timezone, usage_date, reset_at }
}

/**
 * Reads the current daily usage state for one scope.
 * @param {Object} env - Worker environment
 * @param {Object} options - Usage options
 * @param {String} options.user_id - User id
 * @param {String} options.scope - Usage scope
 * @param {Date} options.now - Current date
 * @returns {Promise<Object>} Usage state
 */
export async function daily_usage_state( env, { user_id, scope, now = new Date() } ) {

    const details = scope_details[ scope ]
    if( !details ) throw new Error( `unknown_daily_usage_scope` )

    const window = daily_usage_window( env, now )
    const limit = details.limit( env )
    const row = await env.DB.prepare( `
        SELECT used, limit_value
        FROM daily_usage
        WHERE user_id = ? AND usage_date = ? AND scope = ?
    ` ).bind( user_id, window.usage_date, scope ).first()
    const used = Number( row?.used || 0 )

    return {
        ...window,
        scope,
        used,
        limit,
        remaining: Math.max( 0, limit - used ),
    }
}

/**
 * Builds a D1 statement that reserves daily usage inside a larger batch.
 * @param {Object} env - Worker environment
 * @param {Object} options - Reservation options
 * @param {String} options.user_id - User id
 * @param {String} options.scope - Usage scope
 * @param {Number} options.amount - Amount to reserve
 * @param {Date} options.now - Current date
 * @returns {Object} Reservation statement and metadata
 */
export function daily_usage_reservation( env, { user_id, scope, amount = 1, now = new Date() } ) {

    const details = scope_details[ scope ]
    if( !details ) throw new Error( `unknown_daily_usage_scope` )

    const normalized_amount = positive_integer( amount, 0 )
    if( normalized_amount <= 0 ) throw new Error( `invalid_daily_usage_amount` )

    const window = daily_usage_window( env, now )
    const limit = details.limit( env )
    const timestamp = now.toISOString()
    const statement = env.DB.prepare( `
        INSERT INTO daily_usage ( id, user_id, usage_date, scope, used, limit_value, created_at, updated_at )
        VALUES ( ?, ?, ?, ?, ?, ?, ?, ? )
        ON CONFLICT( user_id, usage_date, scope ) DO UPDATE SET
            used = daily_usage.used + excluded.used,
            limit_value = excluded.limit_value,
            updated_at = excluded.updated_at
    ` ).bind(
        `${ user_id }:${ window.usage_date }:${ scope }`,
        user_id,
        window.usage_date,
        scope,
        normalized_amount,
        limit,
        timestamp,
        timestamp,
    )

    return {
        statement,
        amount: normalized_amount,
        limit,
        scope,
        user_id,
        now,
        ...window,
    }
}

/**
 * Returns a stable 429 response for daily usage exhaustion.
 * @param {String} scope - Usage scope
 * @param {Object} state - Usage state
 * @param {Number} requested - Requested usage amount
 * @returns {Error} Error with attached response
 */
export function daily_usage_limit_error( scope, state, requested ) {

    const details = scope_details[ scope ]
    const used = Number( state.used || 0 )
    const limit = Number( state.limit || details.limit( {} ) )

    return Object.assign( new Error( details.code ), {
        response: error_response( details.code, details.message, 429, {
            scope,
            label: details.label,
            usage_date: state.usage_date,
            timezone: state.timezone,
            used,
            limit,
            requested,
            remaining: Math.max( 0, limit - used ),
            reset_at: state.reset_at,
        } ),
    } )
}

/**
 * Reserves daily usage immediately.
 * @param {Object} env - Worker environment
 * @param {Object} options - Reservation options
 * @returns {Promise<Object>} Updated usage state
 */
export async function reserve_daily_usage( env, options ) {

    const reservation = daily_usage_reservation( env, options )

    try {
        await reservation.statement.run()
        return daily_usage_state( env, {
            user_id: reservation.user_id,
            scope: reservation.scope,
            now: reservation.now,
        } )
    } catch ( error ) {
        await throw_daily_usage_limit_if_exhausted( env, reservation, error )
        throw error
    }
}

/**
 * Refunds a previously reserved daily usage amount after downstream failure.
 * @param {Object} env - Worker environment
 * @param {Object} options - Refund options
 * @param {String} options.user_id - User id
 * @param {String} options.scope - Usage scope
 * @param {Number} options.amount - Amount to refund
 * @param {Date} options.now - Original reservation date
 * @returns {Promise<void>} Completion promise
 */
export async function refund_daily_usage( env, { user_id, scope, amount = 1, now = new Date() } ) {

    const details = scope_details[ scope ]
    if( !details ) throw new Error( `unknown_daily_usage_scope` )

    const normalized_amount = positive_integer( amount, 0 )
    if( normalized_amount <= 0 ) throw new Error( `invalid_daily_usage_amount` )

    const window = daily_usage_window( env, now )
    await env.DB.prepare( `
        UPDATE daily_usage
        SET used = CASE WHEN used <= ? THEN 0 ELSE used - ? END,
            updated_at = ?
        WHERE user_id = ? AND usage_date = ? AND scope = ?
    ` ).bind(
        normalized_amount,
        normalized_amount,
        new Date().toISOString(),
        user_id,
        window.usage_date,
        scope,
    ).run()
}

/**
 * Converts a failed reservation batch into a quota error when the scope is exhausted.
 * @param {Object} env - Worker environment
 * @param {Object} reservation - Reservation metadata
 * @param {Error} error - Original database error
 * @returns {Promise<void>} Throws only when the usage limit is exhausted
 */
export async function throw_daily_usage_limit_if_exhausted( env, reservation, error ) {

    if( !is_daily_usage_constraint_error( error ) ) throw error

    const state = await daily_usage_state( env, {
        user_id: reservation.user_id,
        scope: reservation.scope,
        now: reservation.now,
    } ).catch( () => null )
    const used = Number( state?.used || 0 )
    const limit = Number( state?.limit || reservation.limit )
    const would_exceed = used + reservation.amount > limit || reservation.amount > limit

    if( would_exceed ) throw daily_usage_limit_error( reservation.scope, state || reservation, reservation.amount )
    throw error
}
