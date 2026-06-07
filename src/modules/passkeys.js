import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

import { api_post } from './api.js'

/**
 * Starts passkey registration for signup or the current account.
 * @param {Object} profile - Signup profile
 * @returns {Promise<Object>} API response
 */
export async function register_passkey( profile = {} ) {

    const { options, challenge_id } = await api_post( `/api/auth/passkey/register/options`, profile )
    const response = await startRegistration( { optionsJSON: options } )
    return api_post( `/api/auth/passkey/register/verify`, { challenge_id, response } )
}

/**
 * Starts passkey login.
 * @param {String} email - Optional email hint
 * @returns {Promise<Object>} API response
 */
export async function login_with_passkey( email ) {

    const { options, challenge_id } = await api_post( `/api/auth/passkey/login/options`, { email } )
    const response = await startAuthentication( { optionsJSON: options } )
    return api_post( `/api/auth/passkey/login/verify`, { challenge_id, response } )
}
