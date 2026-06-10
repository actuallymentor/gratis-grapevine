import { error_response } from './response.js'
import { hash_session_token, random_base64url, sha256_base64url } from './crypto.js'

const cookie_name = `sg_session`

/**
 * Parses the Cookie header into an object.
 * @param {Request} request - Incoming request
 * @returns {Object} Cookie map
 */
export function parse_cookies( request ) {

    const header = request.headers.get( `cookie` ) || ``
    return Object.fromEntries(
        header
            .split( `;` )
            .map( cookie => cookie.trim() )
            .filter( Boolean )
            .map( cookie => {
                const [ name, ...value_parts ] = cookie.split( `=` )
                return [ name, decodeURIComponent( value_parts.join( `=` ) ) ]
            } ),
    )
}

/**
 * Builds the secure session cookie header.
 * @param {String} token - Session token
 * @param {String} expires_at - Expiration timestamp
 * @returns {String} Set-Cookie header
 */
export function session_cookie( token, expires_at ) {

    return `${ cookie_name }=${ encodeURIComponent( token ) }; Expires=${ new Date( expires_at ).toUTCString() }; Path=/; HttpOnly; Secure; SameSite=Lax`
}

/**
 * Builds a session-clearing cookie header.
 * @returns {String} Set-Cookie header
 */
export function clear_session_cookie() {

    return `${ cookie_name }=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax`
}

/**
 * Returns a coarse IP prefix for session audit metadata.
 * @param {Request} request - Incoming request
 * @returns {String} IP prefix
 */
export function request_ip_prefix( request ) {

    const ip = request.headers.get( `cf-connecting-ip` ) || request.headers.get( `x-forwarded-for` ) || ``
    if( ip.includes( `:` ) ) return ip.split( `:` ).slice( 0, 4 ).join( `:` )
    return ip.split( `.` ).slice( 0, 3 ).join( `.` )
}

/**
 * Creates and stores a session.
 * @param {Object} env - Worker environment
 * @param {Request} request - Incoming request
 * @param {String} user_id - User id
 * @returns {Promise<Object>} Session token and row
 */
export async function create_session( env, request, user_id ) {

    const token = random_base64url( 48 )
    const now = new Date()
    const ttl_days = Number( env.SESSION_TTL_DAYS || 30 )
    const expires = new Date( now )
    expires.setUTCDate( expires.getUTCDate() + ttl_days )

    const session_hash = await hash_session_token( env, token )
    const user_agent_hash = await sha256_base64url( request.headers.get( `user-agent` ) || `` )
    const row = {
        id: crypto.randomUUID(),
        user_id,
        session_hash,
        expires_at: expires.toISOString(),
        last_used_at: now.toISOString(),
        created_at: now.toISOString(),
        user_agent_hash,
        ip_prefix: request_ip_prefix( request ),
    }

    await env.DB.prepare( `
        INSERT INTO sessions ( id, user_id, session_hash, expires_at, last_used_at, created_at, user_agent_hash, ip_prefix )
        VALUES ( ?, ?, ?, ?, ?, ?, ?, ? )
    ` ).bind(
        row.id,
        row.user_id,
        row.session_hash,
        row.expires_at,
        row.last_used_at,
        row.created_at,
        row.user_agent_hash,
        row.ip_prefix,
    ).run()

    return { token, row }
}

/**
 * Reads the current session and user, if present.
 * @param {Object} env - Worker environment
 * @param {Request} request - Incoming request
 * @returns {Promise<Object|null>} Session context
 */
export async function read_session( env, request ) {

    const token = parse_cookies( request )[ cookie_name ]
    if( !token ) return null

    const session_hash = await hash_session_token( env, token )
    const now = new Date().toISOString()
    const row = await env.DB.prepare( `
        SELECT
            sessions.id AS session_id,
            sessions.expires_at,
            users.*
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.session_hash = ?
            AND sessions.expires_at > ?
    ` ).bind( session_hash, now ).first()

    if( !row ) return null

    await env.DB.prepare( `UPDATE sessions SET last_used_at = ? WHERE id = ?` ).bind( now, row.session_id ).run()
    return { session_id: row.session_id, user: row }
}

/**
 * Requires a logged-in user.
 * @param {Object} env - Worker environment
 * @param {Request} request - Incoming request
 * @returns {Promise<Object>} Session context
 */
export async function require_session( env, request ) {

    const session = await read_session( env, request )
    if( !session ) throw Object.assign( new Error( `not_authenticated` ), {
        response: error_response( `not_authenticated`, `Please log in.`, 401 ),
    } )

    return session
}

/**
 * Requires an accepted member account.
 * @param {Object} env - Worker environment
 * @param {Request} request - Incoming request
 * @returns {Promise<Object>} Session context
 */
export async function require_accepted( env, request ) {

    const session = await require_session( env, request )
    if( session.user.status !== `accepted` ) {
        const code = session.user.status === `blocked` ? `account_blocked` : `account_pending`
        const message = session.user.status === `blocked` ? `Your account is not currently active.` : `Your account is being reviewed.`
        throw Object.assign( new Error( code ), { response: error_response( code, message, 403 ) } )
    }

    return session
}

/**
 * Requires an accepted admin account.
 * @param {Object} env - Worker environment
 * @param {Request} request - Incoming request
 * @returns {Promise<Object>} Session context
 */
export async function require_admin( env, request ) {

    const session = await require_accepted( env, request )
    if( session.user.role !== `admin` ) {
        throw Object.assign( new Error( `not_admin` ), {
            response: error_response( `not_admin`, `Admin access is required.`, 403 ),
        } )
    }

    return session
}

/**
 * Validates request Origin on state-changing requests.
 * @param {Object} env - Worker environment
 * @param {Request} request - Incoming request
 * @returns {void}
 */
export function validate_origin( env, request ) {

    if( [ `GET`, `HEAD`, `OPTIONS` ].includes( request.method ) ) return

    const origin = request.headers.get( `origin` )
    if( !origin ) return

    const request_origin = new URL( request.url ).origin
    const configured_origin = env.GRAPEVINE_DOMAIN || request_origin
    const allowed_origins = new Set( [ configured_origin, request_origin, `http://localhost:5173`, `http://127.0.0.1:5173` ] )

    if( !allowed_origins.has( origin ) ) {
        throw Object.assign( new Error( `invalid_origin` ), {
            response: error_response( `invalid_origin`, `The request origin is not allowed.`, 403 ),
        } )
    }
}
