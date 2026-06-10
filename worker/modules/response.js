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
 * @param {Object} options - Read options
 * @param {Number} options.max_bytes - Maximum accepted body size
 * @returns {Promise<Object>} Parsed JSON
 */
export async function read_json( request, options = {} ) {

    if( [ `GET`, `HEAD` ].includes( request.method ) ) return {}

    const { max_bytes = 128_000 } = options
    const content_length = Number( request.headers.get( `content-length` ) || 0 )

    if( Number.isFinite( content_length ) && content_length > max_bytes ) {
        throw Object.assign( new Error( `json_body_too_large` ), {
            response: error_response( `json_body_too_large`, `Send a smaller request body.`, 413, { max_bytes } ),
        } )
    }

    try {
        const body = await read_limited_body( request, max_bytes )
        return JSON.parse( body )
    } catch ( error ) {
        if( error.response ) throw error

        throw Object.assign( new Error( `invalid_json` ), {
            response: error_response( `invalid_json`, `Send a valid JSON request body.`, 400 ),
        } )
    }
}

async function read_limited_body( request, max_bytes ) {

    const reader = request.body?.getReader()
    if( !reader ) return ``

    const chunks = []
    let byte_count = 0

    while( true ) {
        const { done, value } = await reader.read()
        if( done ) break

        byte_count += value.byteLength
        if( byte_count > max_bytes ) {
            await reader.cancel()
            throw Object.assign( new Error( `json_body_too_large` ), {
                response: error_response( `json_body_too_large`, `Send a smaller request body.`, 413, { max_bytes } ),
            } )
        }

        chunks.push( value )
    }

    const body = new Uint8Array( byte_count )
    chunks.reduce( ( offset, chunk ) => {
        body.set( chunk, offset )
        return offset + chunk.byteLength
    }, 0 )

    return new TextDecoder().decode( body )
}
