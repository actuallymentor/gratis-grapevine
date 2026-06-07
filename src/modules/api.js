import { log } from 'mentie'

/**
 * Performs a JSON API request.
 * @param {String} path - API path
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} API payload
 */
export async function api_request( path, options = {} ) {

    const { method = `GET`, body, headers = {} } = options
    const response = await fetch( path, {
        method,
        credentials: `include`,
        headers: {
            ... body ? { "content-type": `application/json` } : {} ,
            ...headers,
        },
        body: body ? JSON.stringify( body ) : undefined,
    } )

    const content_type = response.headers.get( `content-type` ) || ``
    const payload = content_type.includes( `application/json` ) ? await response.json() : { ok: false }

    if( !response.ok || payload.ok === false ) {
        const error = new Error( payload.error?.message || `Request failed` )
        error.code = payload.error?.code || `request_failed`
        error.status = response.status
        error.payload = payload
        throw error
    }

    return payload
}

/**
 * Reads JSON from the API.
 * @param {String} path - API path
 * @returns {Promise<Object>} API payload
 */
export const api_get = path => api_request( path )

/**
 * Posts JSON to the API.
 * @param {String} path - API path
 * @param {Object} body - JSON body
 * @returns {Promise<Object>} API payload
 */
export const api_post = ( path, body ) => api_request( path, { method: `POST`, body } )

/**
 * Patches JSON through the API.
 * @param {String} path - API path
 * @param {Object} body - JSON body
 * @returns {Promise<Object>} API payload
 */
export const api_patch = ( path, body ) => api_request( path, { method: `PATCH`, body } )

/**
 * Deletes through the API.
 * @param {String} path - API path
 * @returns {Promise<Object>} API payload
 */
export const api_delete = path => api_request( path, { method: `DELETE` } )

/**
 * Reports API errors consistently.
 * @param {Error} error - Error object
 * @returns {String} Human-readable message
 */
export function api_error_message( error ) {

    log.warn( `API request failed`, error )
    return error.message || `Something went wrong.`
}
