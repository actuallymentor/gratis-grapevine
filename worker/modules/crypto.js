const text_encoder = new TextEncoder()
const text_decoder = new TextDecoder()
const default_password_iterations = 100_000

/**
 * Encodes bytes as base64url.
 * @param {Uint8Array} bytes - Bytes to encode
 * @returns {String} Base64url string
 */
export function bytes_to_base64url( bytes ) {

    const binary = Array.from( bytes, byte => String.fromCharCode( byte ) ).join( `` )
    return btoa( binary ).replaceAll( `+`, `-` ).replaceAll( `/`, `_` ).replaceAll( `=`, `` )
}

/**
 * Decodes a base64url string into bytes.
 * @param {String} value - Base64url value
 * @returns {Uint8Array} Decoded bytes
 */
export function base64url_to_bytes( value ) {

    const padded = `${ value }${ `=`.repeat( ( 4 - value.length % 4 ) % 4 ) }`
    const base64 = padded.replaceAll( `-`, `+` ).replaceAll( `_`, `/` )
    const binary = atob( base64 )
    return Uint8Array.from( binary, character => character.charCodeAt( 0 ) )
}

/**
 * Encodes text as UTF-8 bytes.
 * @param {String} value - Text value
 * @returns {Uint8Array} UTF-8 bytes
 */
export function utf8_bytes( value ) {

    return text_encoder.encode( value )
}

/**
 * Decodes UTF-8 bytes as text.
 * @param {Uint8Array} bytes - UTF-8 bytes
 * @returns {String} Text value
 */
export function bytes_to_utf8( bytes ) {

    return text_decoder.decode( bytes )
}

/**
 * Creates a random base64url token.
 * @param {Number} byte_count - Number of random bytes
 * @returns {String} Token
 */
export function random_base64url( byte_count = 32 ) {

    const bytes = new Uint8Array( byte_count )
    crypto.getRandomValues( bytes )
    return bytes_to_base64url( bytes )
}

/**
 * Hashes a value with SHA-256.
 * @param {String} value - Value to hash
 * @returns {Promise<String>} Base64url hash
 */
export async function sha256_base64url( value ) {

    const digest = await crypto.subtle.digest( `SHA-256`, utf8_bytes( value ) )
    return bytes_to_base64url( new Uint8Array( digest ) )
}

/**
 * Signs a value with HMAC-SHA-256.
 * @param {String} secret - Secret key
 * @param {String} value - Value to sign
 * @returns {Promise<String>} Base64url signature
 */
export async function hmac_sha256_base64url( secret, value ) {

    const key = await crypto.subtle.importKey(
        `raw`,
        utf8_bytes( secret ),
        { name: `HMAC`, hash: `SHA-256` },
        false,
        [ `sign` ],
    )
    const signature = await crypto.subtle.sign( `HMAC`, key, utf8_bytes( value ) )
    return bytes_to_base64url( new Uint8Array( signature ) )
}

/**
 * Hashes a password using Workers-compatible PBKDF2.
 * @param {String} password - Plain password
 * @param {Object} options - Hash options
 * @returns {Promise<Object>} Stored credential fields
 */
export async function hash_password( password, options = {} ) {

    const { iterations = default_password_iterations, salt = random_base64url( 24 ) } = options
    const password_key = await crypto.subtle.importKey( `raw`, utf8_bytes( password ), `PBKDF2`, false, [ `deriveBits` ] )
    const derived_bits = await crypto.subtle.deriveBits(
        {
            name: `PBKDF2`,
            hash: `SHA-256`,
            salt: base64url_to_bytes( salt ),
            iterations,
        },
        password_key,
        256,
    )

    return {
        password_hash: bytes_to_base64url( new Uint8Array( derived_bits ) ),
        salt,
        algorithm: `PBKDF2-HMAC-SHA-256`,
        parameters_json: JSON.stringify( { iterations, hash: `SHA-256`, length_bits: 256 } ),
    }
}

/**
 * Verifies a password against stored PBKDF2 fields.
 * @param {String} password - Plain password
 * @param {Object} credential - Stored credential row
 * @returns {Promise<Boolean>} True when password matches
 */
export async function verify_password( password, credential ) {

    const { password_hash, salt, parameters_json } = credential
    const { iterations = default_password_iterations } = JSON.parse( parameters_json )
    const candidate = await hash_password( password, { iterations, salt } )
    return constant_time_equal( password_hash, candidate.password_hash )
}

/**
 * Compares two strings without early return on differing bytes.
 * @param {String} left - Left value
 * @param {String} right - Right value
 * @returns {Boolean} True when equal
 */
export function constant_time_equal( left, right ) {

    const left_bytes = utf8_bytes( left )
    const right_bytes = utf8_bytes( right )
    const max_length = Math.max( left_bytes.length, right_bytes.length )
    const difference = Array.from( { length: max_length } ).reduce( ( total, _, index ) => {
        const left_byte = left_bytes[ index ] || 0
        const right_byte = right_bytes[ index ] || 0
        return total |  left_byte ^ right_byte 
    }, left_bytes.length ^ right_bytes.length )

    return difference === 0
}

/**
 * Hashes a session token with the configured secret.
 * @param {Object} env - Worker environment
 * @param {String} token - Session token
 * @returns {Promise<String>} Session hash
 */
export async function hash_session_token( env, token ) {

    const can_use_development_secret = !env.GRAPEVINE_DOMAIN || env.GRAPEVINE_DOMAIN.includes( `localhost` ) || env.GRAPEVINE_DOMAIN.includes( `127.0.0.1` )
    const secret = env.SESSION_SECRET || ( can_use_development_secret ? `development-session-secret` : null )

    if( !secret ) throw new Error( `missing_session_secret` )

    return hmac_sha256_base64url( secret, token )
}
