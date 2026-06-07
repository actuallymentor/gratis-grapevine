/**
 * Returns a JSON response with consistent headers.
 * @param {Object} payload - Response payload
 * @param {Number} status - HTTP status
 * @param {Object} headers - Extra headers
 * @returns {Response} JSON response
 */
export function json_response( payload, status = 200, headers = {} ) {

    return new Response( JSON.stringify( payload ), {
        status,
        headers: {
            "content-type": `application/json; charset=utf-8`,
            ...headers,
        },
    } )
}

/**
 * Returns a successful JSON envelope.
 * @param {Object} data - Data payload
 * @param {Number} status - HTTP status
 * @param {Object} headers - Extra headers
 * @returns {Response} JSON response
 */
export function ok_response( data = {}, status = 200, headers = {} ) {

    return json_response( { ok: true, ...data }, status, headers )
}

/**
 * Returns an error JSON envelope.
 * @param {String} code - Stable error code
 * @param {String} message - Human-readable message
 * @param {Number} status - HTTP status
 * @param {Object} details - Optional details
 * @returns {Response} JSON response
 */
export function error_response( code, message, status = 400, details = {} ) {

    return json_response( {
        ok: false,
        error: {
            code,
            message,
            ...details,
        },
    }, status )
}

/**
 * Reads a JSON request body.
 * @param {Request} request - Incoming request
 * @returns {Promise<Object>} Parsed JSON
 */
export async function read_json( request ) {

    if( [ `GET`, `HEAD` ].includes( request.method ) ) return {}

    try {
        return await request.json()
    } catch {
        throw Object.assign( new Error( `invalid_json` ), {
            response: error_response( `invalid_json`, `Send a valid JSON request body.`, 400 ),
        } )
    }
}
