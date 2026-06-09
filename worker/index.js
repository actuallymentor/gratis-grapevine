import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { log } from 'mentie'

import { answer_grapevine_query, generate_weekly_summary, is_person_specific_question, prompt_version, transcribe_audio_with_workers_ai } from './modules/ai.js'
import { base64url_to_bytes, bytes_to_base64url, hash_password, random_base64url, sha256_base64url, verify_password } from './modules/crypto.js'
import { normalize_city_name, resolve_signup_hub, slugify } from './modules/hubs.js'
import { has_usable_phone, normalize_whatsapp_telephone } from './modules/phone.js'
import { clear_session_cookie, create_session, require_accepted, require_admin, read_session, session_cookie, validate_origin } from './modules/session.js'
import { is_scheduled_summary_window, resolve_time_window, scheduled_summary_period, summary_period_to_utc_range, validate_manual_period } from './modules/time.js'
import { error_response, ok_response, read_json } from './modules/response.js'

const route = ( method, pattern, handler ) => ( { method, pattern, handler } )

const routes = [
    route( `POST`, /^\/api\/signup$/, signup ),
    route( `POST`, /^\/api\/auth\/password\/login$/, password_login ),
    route( `POST`, /^\/api\/auth\/logout$/, logout ),
    route( `POST`, /^\/api\/auth\/passkey\/register\/options$/, passkey_register_options ),
    route( `POST`, /^\/api\/auth\/passkey\/register\/verify$/, passkey_register_verify ),
    route( `POST`, /^\/api\/auth\/passkey\/login\/options$/, passkey_login_options ),
    route( `POST`, /^\/api\/auth\/passkey\/login\/verify$/, passkey_login_verify ),
    route( `POST`, /^\/api\/auth\/password\/reset$/, password_reset ),
    route( `GET`, /^\/api\/me$/, get_me ),
    route( `GET`, /^\/api\/grapevine\/latest$/, latest_grapevine_update ),
    route( `GET`, /^\/api\/grapevine\/archive$/, grapevine_archive ),
    route( `GET`, /^\/api\/grapevine\/archive\/([^/]+)$/, grapevine_archive_entry ),
    route( `GET`, /^\/api\/messages$/, list_own_messages ),
    route( `POST`, /^\/api\/messages$/, create_message ),
    route( `PATCH`, /^\/api\/messages\/([^/]+)$/, update_message ),
    route( `DELETE`, /^\/api\/messages\/([^/]+)$/, delete_message ),
    route( `POST`, /^\/api\/transcriptions$/, transcribe_update_audio ),
    route( `GET`, /^\/api\/hubs$/, list_hubs ),
    route( `GET`, /^\/api\/members$/, list_members ),
    route( `POST`, /^\/api\/grapevine\/query$/, grapevine_query ),
    route( `GET`, /^\/api\/admin\/users$/, admin_list_users ),
    route( `GET`, /^\/api\/admin\/users\/([^/]+)$/, admin_get_user ),
    route( `PATCH`, /^\/api\/admin\/users\/([^/]+)\/status$/, admin_update_user_status ),
    route( `PATCH`, /^\/api\/admin\/users\/([^/]+)\/role$/, admin_update_user_role ),
    route( `PATCH`, /^\/api\/admin\/users\/([^/]+)\/profile$/, admin_update_user_profile ),
    route( `POST`, /^\/api\/admin\/users\/([^/]+)\/password-reset$/, admin_create_password_reset ),
    route( `GET`, /^\/api\/admin\/hubs$/, admin_list_hubs ),
    route( `POST`, /^\/api\/admin\/hubs$/, admin_create_hub ),
    route( `PATCH`, /^\/api\/admin\/hubs\/([^/]+)$/, admin_update_hub ),
    route( `GET`, /^\/api\/admin\/ai-requests$/, admin_list_ai_requests ),
    route( `GET`, /^\/api\/admin\/messages$/, admin_list_messages ),
    route( `POST`, /^\/api\/admin\/grapevine\/generate$/, admin_generate_grapevine ),
]

const default_transcription_max_audio_bytes = 25_000_000
const supported_transcription_audio_types = new Set( [
    `application/octet-stream`,
    `audio/mp3`,
    `audio/mp4`,
    `audio/mpeg`,
    `audio/ogg`,
    `audio/wav`,
    `audio/webm`,
    `audio/x-m4a`,
    `audio/x-wav`,
    `video/webm`,
] )

const serialize_user = user => ( {
    id: user.id,
    name: user.name,
    email: user.email,
    whatsapp_telephone: user.whatsapp_telephone,
    whatsapp_telephone_digits: user.whatsapp_telephone_digits,
    hub_id: user.hub_id,
    hub_name: user.hub_name,
    requested_hub_name: user.requested_hub_name,
    status: user.status,
    role: user.role,
    review_message: user.review_message,
    created_at: user.created_at,
    approved_at: user.approved_at,
    blocked_at: user.blocked_at,
} )

const public_member_row = row => ( {
    id: row.id,
    name: row.name,
    hub: row.hub_name || `Elsewhere`,
    whatsapp_telephone: row.whatsapp_telephone,
    whatsapp_telephone_digits: row.whatsapp_telephone_digits,
    whatsapp_url: `https://wa.me/${ row.whatsapp_telephone_digits }`,
} )

const admin_user_row = row => ( {
    ...serialize_user( row ),
    hub_name: row.hub_name,
    email_url: `mailto:${ row.email }`,
    whatsapp_url: `https://wa.me/${ row.whatsapp_telephone_digits }`,
} )

/**
 * Worker fetch entry point.
 * @param {Request} request - Incoming request
 * @param {Object} env - Worker environment
 * @param {Object} ctx - Worker context
 * @returns {Promise<Response>} Response
 */
async function fetch_handler( request, env, ctx ) {

    const url = new URL( request.url )

    if( request.method === `OPTIONS` ) return new Response( null, { headers: cors_headers( request, env ) } )

    if( url.pathname.startsWith( `/api/` ) ) {
        try {
            validate_origin( env, request )
            const matched_route = routes.find( candidate => candidate.method === request.method && candidate.pattern.test( url.pathname ) )
            if( !matched_route ) return error_response( `not_found`, `No API route matched this request.`, 404 )

            const matches = url.pathname.match( matched_route.pattern )
            const response = await matched_route.handler( { request, env, ctx, url, params: matches.slice( 1 ) } )
            return with_cors( response, request, env )
        } catch ( error ) {
            if( error.response ) return with_cors( error.response, request, env )
            log.error( `Unhandled API error`, error )
            return with_cors( error_response( `server_error`, `Something went wrong.`, 500 ), request, env )
        }
    }

    if( env.ASSETS ) return env.ASSETS.fetch( request )
    return new Response( `Gratis Grapevine API`, { headers: { "content-type": `text/plain; charset=utf-8` } } )
}

/**
 * Worker scheduled entry point.
 * @param {Object} event - Scheduled event
 * @param {Object} env - Worker environment
 * @param {Object} ctx - Worker context
 * @returns {Promise<void>} Completion promise
 */
async function scheduled_handler( event, env, ctx ) {

    void event

    const now = new Date()
    if( !is_scheduled_summary_window( env, now ) ) return

    ctx.waitUntil( create_scheduled_summary( env, now ) )
}

function cors_headers( request, env ) {

    const origin = request.headers.get( `origin` )
    const request_origin = new URL( request.url ).origin
    const configured_origin = env.GRAPEVINE_DOMAIN || request_origin
    const allowed = new Set( [ configured_origin, request_origin, `http://localhost:5173`, `http://127.0.0.1:5173` ] )

    return {
        "access-control-allow-origin": origin && allowed.has( origin ) ? origin : configured_origin,
        "access-control-allow-methods": `GET,POST,PATCH,DELETE,OPTIONS`,
        "access-control-allow-headers": `content-type`,
        "access-control-allow-credentials": `true`,
        vary: `Origin`,
    }
}

function with_cors( response, request, env ) {

    const headers = new Headers( response.headers )
    Object.entries( cors_headers( request, env ) ).forEach( ( [ key, value ] ) => headers.set( key, value ) )
    return new Response( response.body, { status: response.status, statusText: response.statusText, headers } )
}

function required_string( value, field ) {

    const normalized = `${ value || `` }`.trim()
    if( !normalized ) throw Object.assign( new Error( `missing_${ field }` ), {
        response: error_response( `missing_${ field }`, `${ field } is required.`, 400 ),
    } )
    return normalized
}

function api_failure( code, message, status = 400, details = {} ) {

    return Object.assign( new Error( code ), {
        response: error_response( code, message, status, details ),
    } )
}

function positive_integer( value, fallback ) {

    const parsed_value = Number( value )
    return Number.isFinite( parsed_value ) && parsed_value > 0 ? Math.floor( parsed_value ) : fallback
}

const normalized_content_type = value => `${ value || `application/octet-stream` }`.split( `;` )[ 0 ].trim().toLocaleLowerCase()

function transcription_max_audio_bytes( env ) {

    return positive_integer( env.WORKERS_AI_TRANSCRIPTION_MAX_AUDIO_BYTES, default_transcription_max_audio_bytes )
}

async function read_transcription_audio( request, max_audio_bytes ) {

    let form_data

    try {
        form_data = await request.formData()
    } catch {
        throw api_failure( `invalid_audio_upload`, `Upload audio as multipart form data.`, 400 )
    }

    const audio_file = form_data.get( `audio` )
    if( !audio_file || typeof audio_file.arrayBuffer !== `function` ) {
        throw api_failure( `missing_audio`, `Audio is required.`, 400 )
    }

    const size = Number( audio_file.size || 0 )
    if( size <= 0 ) throw api_failure( `empty_audio`, `Audio is empty.`, 400 )
    if( size > max_audio_bytes ) {
        throw api_failure( `audio_too_large`, `Record a shorter update before transcribing.`, 413, {
            max_audio_bytes,
        } )
    }

    const content_type = normalized_content_type( audio_file.type )
    if( !supported_transcription_audio_types.has( content_type ) ) {
        throw api_failure( `unsupported_audio_type`, `Record audio in a supported browser format.`, 415, {
            content_type,
        } )
    }

    return {
        buffer: await audio_file.arrayBuffer(),
        content_type,
        size,
    }
}

function normalize_email( email ) {

    return `${ email }`.trim().toLocaleLowerCase()
}

async function rate_limit( env, scope, bucket, options = {} ) {

    const { limit = 20, window_seconds = 3_600 } = options
    const now = new Date()
    const reset = new Date( now.getTime() + window_seconds * 1_000 ).toISOString()
    const id = `${ scope }:${ bucket }`

    await env.DB.prepare( `
        INSERT INTO rate_limits ( id, scope, bucket, count, reset_at )
        VALUES ( ?, ?, ?, 1, ? )
        ON CONFLICT( scope, bucket ) DO UPDATE SET
            count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
            reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
    ` ).bind( id, scope, bucket, reset, now.toISOString(), now.toISOString() ).run()

    const row = await env.DB.prepare( `SELECT count, reset_at FROM rate_limits WHERE scope = ? AND bucket = ?` ).bind( scope, bucket ).first()
    if( row.count > limit && row.reset_at > now.toISOString() ) {
        throw Object.assign( new Error( `rate_limited` ), {
            response: error_response( `rate_limited`, `Please wait before trying again.`, 429 ),
        } )
    }
}

async function signup( { request, env } ) {

    await rate_limit( env, `signup`, request.headers.get( `cf-connecting-ip` ) || `local`, { limit: 8 } )

    const body = await read_json( request )
    const name = required_string( body.name, `name` )
    const email = required_string( body.email, `email` )
    const email_normalized = normalize_email( email )
    const password = body.password ? `${ body.password }` : null

    if( !password || password.length < 12 ) return error_response( `weak_password`, `Use a password of at least 12 characters.`, 400 )
    if( !has_usable_phone( body.whatsapp_telephone ) ) return error_response( `invalid_phone`, `Enter a WhatsApp telephone number with country code where possible.`, 400 )

    const phone = normalize_whatsapp_telephone( body.whatsapp_telephone )
    const hub_assignment = await resolve_signup_hub( env.DB, body )
    const now = new Date().toISOString()
    const user_id = crypto.randomUUID()
    const password_hash = await hash_password( password )

    try {
        await env.DB.batch( [
            env.DB.prepare( `
                INSERT INTO users (
                    id, name, email, email_normalized, whatsapp_telephone, whatsapp_telephone_digits,
                    hub_id, requested_hub_name, status, role, created_at, updated_at
                )
                VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'member', ?, ? )
            ` ).bind(
                user_id,
                name,
                email,
                email_normalized,
                phone.whatsapp_telephone,
                phone.whatsapp_telephone_digits,
                hub_assignment.hub_id,
                hub_assignment.requested_hub_name,
                now,
                now,
            ),
            env.DB.prepare( `
                INSERT INTO password_credentials ( id, user_id, password_hash, salt, algorithm, parameters_json, created_at, updated_at )
                VALUES ( ?, ?, ?, ?, ?, ?, ?, ? )
            ` ).bind(
                crypto.randomUUID(),
                user_id,
                password_hash.password_hash,
                password_hash.salt,
                password_hash.algorithm,
                password_hash.parameters_json,
                now,
                now,
            ),
        ] )
    } catch ( error ) {
        if( `${ error.message }`.includes( `UNIQUE` ) ) return error_response( `email_exists`, `An account with that email already exists.`, 409 )
        throw error
    }

    const session = await create_session( env, request, user_id )
    const user = await get_user_by_id( env, user_id )

    return ok_response( { user: serialize_user( user ) }, 201, {
        "set-cookie": session_cookie( session.token, session.row.expires_at ),
    } )
}

async function password_login( { request, env } ) {

    const body = await read_json( request )
    const email_normalized = normalize_email( required_string( body.email, `email` ) )
    const password = required_string( body.password, `password` )

    await rate_limit( env, `login`, email_normalized, { limit: 12, window_seconds: 900 } )

    const row = await env.DB.prepare( `
        SELECT users.*, password_credentials.password_hash, password_credentials.salt, password_credentials.algorithm, password_credentials.parameters_json
        FROM users
        JOIN password_credentials ON password_credentials.user_id = users.id
        WHERE users.email_normalized = ?
    ` ).bind( email_normalized ).first()

    if( !row || ! await verify_password( password, row )  ) {
        return error_response( `invalid_credentials`, `The email or password is incorrect.`, 401 )
    }

    await env.DB.prepare( `DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?` ).bind( row.id, new Date().toISOString() ).run()
    const session = await create_session( env, request, row.id )
    const user = await get_user_by_id( env, row.id )

    return ok_response( { user: serialize_user( user ) }, 200, {
        "set-cookie": session_cookie( session.token, session.row.expires_at ),
    } )
}

async function logout( { request, env } ) {

    const session = await read_session( env, request )
    if( session ) await env.DB.prepare( `DELETE FROM sessions WHERE id = ?` ).bind( session.session_id ).run()
    return ok_response( {}, 200, { "set-cookie": clear_session_cookie() } )
}

async function passkey_register_options( { request, env } ) {

    const body = await read_json( request )
    await rate_limit( env, `passkey_register`, body.email ? normalize_email( body.email ) : request.headers.get( `cf-connecting-ip` ) || `local`, { limit: 10, window_seconds: 900 } )

    const existing_session = await read_session( env, request )
    const now = new Date()
    const challenge_id = crypto.randomUUID()
    const expires = new Date( now.getTime() + 10 * 60 * 1_000 ).toISOString()

    const signup_payload = existing_session ? null : {
        name: required_string( body.name, `name` ),
        email: required_string( body.email, `email` ),
        whatsapp_telephone: required_string( body.whatsapp_telephone, `whatsapp_telephone` ),
        hub_id: body.hub_id,
        hub_name: body.hub_name,
        requested_hub_name: body.requested_hub_name,
    }

    const user_id = existing_session?.user?.id || crypto.randomUUID()
    const user_name = existing_session?.user?.email_normalized || normalize_email( signup_payload.email )
    const display_name = existing_session?.user?.name || signup_payload.name
    const existing_credentials = existing_session
        ? await env.DB.prepare( `SELECT credential_id, transports_json FROM webauthn_credentials WHERE user_id = ?` ).bind( user_id ).all()
        : { results: [] }

    const options = await generateRegistrationOptions( {
        rpName: env.WEBAUTHN_RP_NAME || `Gratis Grapevine`,
        rpID: env.WEBAUTHN_RP_ID || `grapevine.gratis.sh`,
        userID: base64url_to_bytes( bytes_to_base64url( new TextEncoder().encode( user_id ) ) ),
        userName: user_name,
        userDisplayName: display_name,
        attestationType: `none`,
        excludeCredentials: existing_credentials.results.map( credential => ( {
            id: credential.credential_id,
            transports: JSON.parse( credential.transports_json || `[]` ),
        } ) ),
        authenticatorSelection: {
            residentKey: `preferred`,
            userVerification: `preferred`,
        },
        preferredAuthenticatorType: `localDevice`,
    } )

    await env.DB.prepare( `
        INSERT INTO webauthn_challenges ( id, user_id, challenge, kind, payload_json, expires_at, created_at )
        VALUES ( ?, ?, ?, 'registration', ?, ?, ? )
    ` ).bind(
        challenge_id,
        user_id,
        options.challenge,
        signup_payload ? JSON.stringify( signup_payload ) : null,
        expires,
        now.toISOString(),
    ).run()

    return ok_response( { options, challenge_id } )
}

async function passkey_register_verify( { request, env } ) {

    const body = await read_json( request )
    const challenge_id = required_string( body.challenge_id, `challenge_id` )
    const challenge = await env.DB.prepare( `
        SELECT * FROM webauthn_challenges
        WHERE id = ? AND kind = 'registration' AND expires_at > ?
    ` ).bind( challenge_id, new Date().toISOString() ).first()

    if( !challenge ) return error_response( `challenge_expired`, `The passkey challenge expired.`, 400 )

    const verification = await verifyRegistrationResponse( {
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: [ env.GRAPEVINE_DOMAIN || `https://grapevine.gratis.sh`, new URL( request.url ).origin ],
        expectedRPID: env.WEBAUTHN_RP_ID || `grapevine.gratis.sh`,
        requireUserVerification: false,
    } )

    if( !verification.verified ) return error_response( `passkey_verification_failed`, `The passkey could not be verified.`, 400 )

    const now = new Date().toISOString()
    const payload = challenge.payload_json ? JSON.parse( challenge.payload_json ) : null
    const { user_id } = challenge

    if( !payload ) {
        const existing_session = await read_session( env, request )
        if( !existing_session || existing_session.user.id !== user_id ) return error_response( `not_authenticated`, `Please log in before adding a passkey.`, 401 )
    }

    if( payload ) {
        if( !has_usable_phone( payload.whatsapp_telephone ) ) return error_response( `invalid_phone`, `Enter a usable WhatsApp telephone number.`, 400 )
        const phone = normalize_whatsapp_telephone( payload.whatsapp_telephone )
        const hub_assignment = await resolve_signup_hub( env.DB, payload )

        await env.DB.prepare( `
            INSERT INTO users (
                id, name, email, email_normalized, whatsapp_telephone, whatsapp_telephone_digits,
                hub_id, requested_hub_name, status, role, created_at, updated_at
            )
            VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'member', ?, ? )
        ` ).bind(
            user_id,
            payload.name,
            payload.email,
            normalize_email( payload.email ),
            phone.whatsapp_telephone,
            phone.whatsapp_telephone_digits,
            hub_assignment.hub_id,
            hub_assignment.requested_hub_name,
            now,
            now,
        ).run()
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
    await env.DB.batch( [
        env.DB.prepare( `
            INSERT INTO webauthn_credentials (
                id, user_id, credential_id, public_key, counter, device_type, backed_up, transports_json, created_at
            )
            VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ? )
        ` ).bind(
            crypto.randomUUID(),
            user_id,
            credential.id,
            bytes_to_base64url( credential.publicKey ),
            credential.counter,
            credentialDeviceType,
            credentialBackedUp ? 1 : 0,
            JSON.stringify( body.response?.response?.transports || [] ),
            now,
        ),
        env.DB.prepare( `DELETE FROM webauthn_challenges WHERE id = ?` ).bind( challenge_id ),
    ] )

    if( !payload ) await env.DB.prepare( `DELETE FROM sessions WHERE user_id = ?` ).bind( user_id ).run()

    const session = await create_session( env, request, user_id )
    const user = await get_user_by_id( env, user_id )

    return ok_response( { user: serialize_user( user ) }, 201, {
        "set-cookie": session_cookie( session.token, session.row.expires_at ),
    } )
}

async function passkey_login_options( { request, env } ) {

    const body = await read_json( request )
    const email_normalized = body.email ? normalize_email( body.email ) : null
    await rate_limit( env, `passkey_login`, email_normalized || request.headers.get( `cf-connecting-ip` ) || `local`, { limit: 20, window_seconds: 900 } )

    const credentials = email_normalized
        ? await env.DB.prepare( `
            SELECT webauthn_credentials.*
            FROM webauthn_credentials
            JOIN users ON users.id = webauthn_credentials.user_id
            WHERE users.email_normalized = ?
        ` ).bind( email_normalized ).all()
        : await env.DB.prepare( `SELECT * FROM webauthn_credentials LIMIT 50` ).all()

    const options = await generateAuthenticationOptions( {
        rpID: env.WEBAUTHN_RP_ID || `grapevine.gratis.sh`,
        allowCredentials: credentials.results.map( credential => ( {
            id: credential.credential_id,
            transports: JSON.parse( credential.transports_json || `[]` ),
        } ) ),
        userVerification: `preferred`,
    } )

    const challenge_id = crypto.randomUUID()
    const now = new Date()
    const expires = new Date( now.getTime() + 10 * 60 * 1_000 ).toISOString()

    await env.DB.prepare( `
        INSERT INTO webauthn_challenges ( id, challenge, kind, payload_json, expires_at, created_at )
        VALUES ( ?, ?, 'authentication', ?, ?, ? )
    ` ).bind(
        challenge_id,
        options.challenge,
        JSON.stringify( { email_normalized } ),
        expires,
        now.toISOString(),
    ).run()

    return ok_response( { options, challenge_id } )
}

async function passkey_login_verify( { request, env } ) {

    const body = await read_json( request )
    const challenge_id = required_string( body.challenge_id, `challenge_id` )
    const challenge = await env.DB.prepare( `
        SELECT * FROM webauthn_challenges
        WHERE id = ? AND kind = 'authentication' AND expires_at > ?
    ` ).bind( challenge_id, new Date().toISOString() ).first()

    if( !challenge ) return error_response( `challenge_expired`, `The passkey challenge expired.`, 400 )

    const credential_id = body.response?.id
    const stored = await env.DB.prepare( `
        SELECT webauthn_credentials.*, users.status
        FROM webauthn_credentials
        JOIN users ON users.id = webauthn_credentials.user_id
        WHERE credential_id = ?
    ` ).bind( credential_id ).first()

    if( !stored ) return error_response( `invalid_credentials`, `The passkey is not registered.`, 401 )

    const verification = await verifyAuthenticationResponse( {
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: [ env.GRAPEVINE_DOMAIN || `https://grapevine.gratis.sh`, new URL( request.url ).origin ],
        expectedRPID: env.WEBAUTHN_RP_ID || `grapevine.gratis.sh`,
        credential: {
            id: stored.credential_id,
            publicKey: base64url_to_bytes( stored.public_key ),
            counter: stored.counter,
            transports: JSON.parse( stored.transports_json || `[]` ),
        },
        requireUserVerification: false,
    } )

    if( !verification.verified ) return error_response( `passkey_verification_failed`, `The passkey could not be verified.`, 400 )

    await env.DB.batch( [
        env.DB.prepare( `UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE id = ?` )
            .bind( verification.authenticationInfo.newCounter, new Date().toISOString(), stored.id ),
        env.DB.prepare( `DELETE FROM webauthn_challenges WHERE id = ?` ).bind( challenge_id ),
    ] )

    const session = await create_session( env, request, stored.user_id )
    const user = await get_user_by_id( env, stored.user_id )

    return ok_response( { user: serialize_user( user ) }, 200, {
        "set-cookie": session_cookie( session.token, session.row.expires_at ),
    } )
}

async function password_reset( { request, env } ) {

    const body = await read_json( request )
    const email_normalized = normalize_email( required_string( body.email, `email` ) )
    const reset_token = required_string( body.reset_token, `reset_token` )
    const password = required_string( body.password, `password` )
    if( password.length < 12 ) return error_response( `weak_password`, `Use a password of at least 12 characters.`, 400 )
    await rate_limit( env, `password_reset`, email_normalized, { limit: 6, window_seconds: 900 } )

    const token_hash = await sha256_base64url( reset_token )
    const token = await env.DB.prepare( `
        SELECT password_reset_tokens.*, users.email_normalized
        FROM password_reset_tokens
        JOIN users ON users.id = password_reset_tokens.user_id
        WHERE password_reset_tokens.token_hash = ?
            AND password_reset_tokens.expires_at > ?
            AND password_reset_tokens.used_at IS NULL
            AND users.email_normalized = ?
    ` ).bind( token_hash, new Date().toISOString(), email_normalized ).first()

    if( !token ) return error_response( `invalid_reset_token`, `That reset token is invalid or expired.`, 400 )

    const now = new Date().toISOString()
    const password_hash = await hash_password( password )

    await env.DB.batch( [
        env.DB.prepare( `
            INSERT INTO password_credentials ( id, user_id, password_hash, salt, algorithm, parameters_json, created_at, updated_at )
            VALUES ( ?, ?, ?, ?, ?, ?, ?, ? )
            ON CONFLICT( user_id ) DO UPDATE SET
                password_hash = excluded.password_hash,
                salt = excluded.salt,
                algorithm = excluded.algorithm,
                parameters_json = excluded.parameters_json,
                updated_at = excluded.updated_at
        ` ).bind(
            crypto.randomUUID(),
            token.user_id,
            password_hash.password_hash,
            password_hash.salt,
            password_hash.algorithm,
            password_hash.parameters_json,
            now,
            now,
        ),
        env.DB.prepare( `UPDATE password_reset_tokens SET used_at = ? WHERE id = ?` ).bind( now, token.id ),
        env.DB.prepare( `DELETE FROM sessions WHERE user_id = ?` ).bind( token.user_id ),
    ] )

    const session = await create_session( env, request, token.user_id )
    const user = await get_user_by_id( env, token.user_id )

    return ok_response( { user: serialize_user( user ) }, 200, {
        "set-cookie": session_cookie( session.token, session.row.expires_at ),
    } )
}

async function get_me( { request, env } ) {

    const session = await read_session( env, request )
    if( !session ) return ok_response( { user: null } )

    const user = await get_user_by_id( env, session.user.id )
    return ok_response( { user: serialize_user( user ) } )
}

async function latest_grapevine_update( { request, env } ) {

    await require_accepted( env, request )
    const update = await env.DB.prepare( `
        SELECT * FROM grapevine_updates
        WHERE status IN ( 'success', 'empty' )
        ORDER BY generated_at DESC
        LIMIT 1
    ` ).first()

    return ok_response( { update } )
}

async function grapevine_archive( { request, env } ) {

    await require_accepted( env, request )
    const { results } = await env.DB.prepare( `
        SELECT id, period_start, period_end, generated_at, status, source_message_count, generation_kind
        FROM grapevine_updates
        WHERE status IN ( 'success', 'empty' )
        ORDER BY generated_at DESC
        LIMIT 50
    ` ).all()

    return ok_response( { updates: results } )
}

async function grapevine_archive_entry( { request, env, params } ) {

    await require_accepted( env, request )
    const update = await env.DB.prepare( `SELECT * FROM grapevine_updates WHERE id = ?` ).bind( params[ 0 ] ).first()
    if( !update ) return error_response( `not_found`, `That Grapevine update was not found.`, 404 )
    return ok_response( { update } )
}

async function create_message( { request, env } ) {

    const { user } = await require_accepted( env, request )
    const body = await read_json( request )
    const message_body = required_string( body.body, `body` )
    const source = [ `voice_transcript`, `typed`, `edited_voice_transcript` ].includes( body.source ) ? body.source : `typed`
    const now = new Date().toISOString()

    const message = {
        id: crypto.randomUUID(),
        user_id: user.id,
        hub_id: user.hub_id,
        body: message_body,
        body_normalized: message_body.toLocaleLowerCase(),
        source,
        client_recorded_at: body.client_recorded_at || null,
        created_at: now,
        updated_at: now,
    }

    await env.DB.prepare( `
        INSERT INTO messages ( id, user_id, hub_id, body, body_normalized, source, client_recorded_at, created_at, updated_at )
        VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ? )
    ` ).bind(
        message.id,
        message.user_id,
        message.hub_id,
        message.body,
        message.body_normalized,
        message.source,
        message.client_recorded_at,
        message.created_at,
        message.updated_at,
    ).run()

    return ok_response( { message }, 201 )
}

async function list_own_messages( { request, env } ) {

    const { user } = await require_accepted( env, request )
    const { results } = await env.DB.prepare( `
        SELECT id, body, source, client_recorded_at, created_at, updated_at
        FROM messages
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 50
    ` ).bind( user.id ).all()

    return ok_response( { messages: results } )
}

async function update_message( { request, env, params } ) {

    const { user } = await require_accepted( env, request )
    const body = await read_json( request )
    const message_body = required_string( body.body, `body` )
    const now = new Date().toISOString()

    const result = await env.DB.prepare( `
        UPDATE messages
        SET body = ?, body_normalized = ?, source = 'edited_voice_transcript', updated_at = ?
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    ` ).bind( message_body, message_body.toLocaleLowerCase(), now, params[ 0 ], user.id ).run()

    if( result.meta.changes === 0 ) return error_response( `not_found`, `That update was not found.`, 404 )
    const message = await env.DB.prepare( `SELECT * FROM messages WHERE id = ?` ).bind( params[ 0 ] ).first()
    return ok_response( { message } )
}

async function delete_message( { request, env, params } ) {

    const { user } = await require_accepted( env, request )
    const now = new Date().toISOString()
    const result = await env.DB.prepare( `
        UPDATE messages
        SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    ` ).bind( now, now, params[ 0 ], user.id ).run()

    if( result.meta.changes === 0 ) return error_response( `not_found`, `That update was not found.`, 404 )
    return ok_response( { deleted: true } )
}

async function transcribe_update_audio( { request, env } ) {

    const { user } = await require_accepted( env, request )
    await rate_limit( env, `ai_transcription`, user.id, { limit: 30, window_seconds: 3_600 } )

    const audio = await read_transcription_audio( request, transcription_max_audio_bytes( env ) )

    try {
        const transcript = await transcribe_audio_with_workers_ai( env, audio.buffer )

        return ok_response( {
            transcript: {
                ...transcript,
                audio_size_bytes: audio.size,
            },
        } )
    } catch ( error ) {
        log.warn( `Workers AI transcription failed`, {
            error: error.message,
            content_type: audio.content_type,
            size: audio.size,
        } )

        return error_response( `transcription_failed`, `Audio could not be transcribed right now.`, 502 )
    }
}

async function list_hubs( { request, env } ) {

    await require_accepted( env, request )
    const { results } = await env.DB.prepare( `SELECT * FROM hubs WHERE is_active = 1 ORDER BY name` ).all()
    return ok_response( { hubs: results } )
}

async function list_members( { request, env, url } ) {

    await require_accepted( env, request )
    const query = `%${ ( url.searchParams.get( `query` ) || `` ).trim().toLocaleLowerCase() }%`
    const { results } = await env.DB.prepare( `
        SELECT users.id, users.name, users.whatsapp_telephone, users.whatsapp_telephone_digits, hubs.name AS hub_name
        FROM users
        LEFT JOIN hubs ON hubs.id = users.hub_id
        WHERE users.status = 'accepted'
            AND ( lower( users.name ) LIKE ? OR lower( hubs.name ) LIKE ? OR ? = '%%' )
        ORDER BY users.name
        LIMIT 100
    ` ).bind( query, query, query ).all()

    return ok_response( { members: results.map( public_member_row ) } )
}

async function grapevine_query( { request, env } ) {

    const { user } = await require_accepted( env, request )
    await rate_limit( env, `ai_query`, user.id, { limit: 20, window_seconds: 3_600 } )

    const body = await read_json( request )
    const mode = body.mode === `question` ? `question` : `scope`
    const time_window = body.time_window || `last_month`
    let window
    const hub_ids = Array.isArray( body.hub_ids ) ? body.hub_ids.filter( Boolean ) : []
    const user_ids = Array.isArray( body.user_ids ) ? body.user_ids.filter( Boolean ) : []
    const question = `${ body.question || `` }`.trim()

    try {
        window = resolve_time_window( time_window )
    } catch {
        return error_response( `invalid_time_window`, `Choose last_week, last_month, last_quarter, or last_year.`, 400 )
    }

    if( mode === `scope` && hub_ids.length === 0 && user_ids.length === 0 ) {
        return error_response( `missing_scope`, `Choose at least one hub or member for a scoped update.`, 400 )
    }

    const accepted_members = await env.DB.prepare( `SELECT id, name FROM users WHERE status = 'accepted'` ).all()
    if( mode === `question` && ( user_ids.length > 0 || is_person_specific_question( question, accepted_members.results ) ) ) {
        return error_response(
            `person_specific_question`,
            `Open questions are for themes, hubs, and community activity. Use scoped update for a direct member update.`,
            400,
        )
    }

    const messages = await select_messages_for_query( env, { window, hub_ids, user_ids, question, mode } )
    const filters_description = await describe_filters( env, { hub_ids, user_ids } )
    const now = new Date().toISOString()
    const request_id = crypto.randomUUID()
    let answer

    try {
        answer = await answer_grapevine_query( env, {
            mode,
            question,
            messages,
            time_window,
            filters_description,
        } )
    } catch ( error ) {
        const model = env.OPENROUTER_QUERY_MODEL || `openai/gpt-4.1-mini`

        await env.DB.prepare( `
            INSERT INTO ai_requests (
                id, user_id, kind, model, time_window, filters_json, question,
                response_markdown, source_message_count, usage_json, created_at, error_message
            )
            VALUES ( ?, ?, ?, ?, ?, ?, ?, NULL, ?, '{}', ?, ? )
        ` ).bind(
            request_id,
            user.id,
            mode,
            model,
            time_window,
            JSON.stringify( { hub_ids, user_ids } ),
            question,
            messages.length,
            now,
            error.message,
        ).run()

        return error_response( `ai_request_failed`, `The Grapevine could not answer right now.`, 502 )
    }

    await env.DB.prepare( `
        INSERT INTO ai_requests (
            id, user_id, kind, model, time_window, filters_json, question,
            response_markdown, source_message_count, usage_json, created_at
        )
        VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )
    ` ).bind(
        request_id,
        user.id,
        mode,
        answer.model,
        time_window,
        JSON.stringify( { hub_ids, user_ids } ),
        question,
        answer.markdown,
        messages.length,
        JSON.stringify( answer.usage || {} ),
        now,
    ).run()

    return ok_response( {
        answer: {
            id: request_id,
            markdown: answer.markdown,
            source_message_count: messages.length,
            model: answer.model,
            time_window,
            filters: { hub_ids, user_ids },
        },
    } )
}

async function admin_list_users( { request, env, url } ) {

    await require_admin( env, request )
    const status = url.searchParams.get( `status` )
    const query = `%${ ( url.searchParams.get( `query` ) || `` ).trim().toLocaleLowerCase() }%`
    const status_clause = status ? `AND users.status = ?` : ``
    const bindings = status ? [ query, query, query, status ] : [ query, query, query ]

    const { results } = await env.DB.prepare( `
        SELECT users.*, hubs.name AS hub_name
        FROM users
        LEFT JOIN hubs ON hubs.id = users.hub_id
        WHERE ( lower( users.name ) LIKE ? OR lower( users.email ) LIKE ? OR lower( hubs.name ) LIKE ? )
        ${ status_clause }
        ORDER BY users.created_at DESC
        LIMIT 200
    ` ).bind( ...bindings ).all()

    return ok_response( { users: results.map( admin_user_row ) } )
}

async function admin_get_user( { request, env, params } ) {

    await require_admin( env, request )
    const user = await get_user_by_id( env, params[ 0 ] )
    if( !user ) return error_response( `not_found`, `That user was not found.`, 404 )
    return ok_response( { user: admin_user_row( user ) } )
}

async function admin_update_user_status( { request, env, params } ) {

    const { user: admin } = await require_admin( env, request )
    const body = await read_json( request )
    const { status } = body
    if( ![ `pending`, `accepted`, `blocked` ].includes( status ) ) return error_response( `invalid_status`, `Choose pending, accepted, or blocked.`, 400 )

    const target = await get_user_by_id( env, params[ 0 ] )
    if( !target ) return error_response( `not_found`, `That user was not found.`, 404 )
    await assert_not_last_accepted_admin( env, target, { next_status: status, next_role: target.role } )

    const now = new Date().toISOString()
    const approved_at = status === `accepted` ? now : target.approved_at
    const approved_by_user_id = status === `accepted` ? admin.id : target.approved_by_user_id
    const blocked_at = status === `blocked` ? now : null
    const hub_assignment = body.hub_id || body.requested_hub_name
        ? await resolve_signup_hub( env.DB, body )
        : { hub_id: target.hub_id, requested_hub_name: target.requested_hub_name }

    await env.DB.prepare( `
        UPDATE users
        SET status = ?, review_message = ?, hub_id = ?, requested_hub_name = ?,
            approved_at = ?, approved_by_user_id = ?, blocked_at = ?, updated_at = ?
        WHERE id = ?
    ` ).bind(
        status,
        body.review_message || null,
        hub_assignment.hub_id,
        hub_assignment.requested_hub_name,
        approved_at,
        approved_by_user_id,
        blocked_at,
        now,
        target.id,
    ).run()

    return ok_response( { user: admin_user_row( await get_user_by_id( env, target.id ) ) } )
}

async function admin_update_user_role( { request, env, params } ) {

    await require_admin( env, request )
    const body = await read_json( request )
    const { role } = body
    if( ![ `member`, `admin` ].includes( role ) ) return error_response( `invalid_role`, `Choose member or admin.`, 400 )

    const target = await get_user_by_id( env, params[ 0 ] )
    if( !target ) return error_response( `not_found`, `That user was not found.`, 404 )
    await assert_not_last_accepted_admin( env, target, { next_status: target.status, next_role: role } )

    await env.DB.prepare( `UPDATE users SET role = ?, updated_at = ? WHERE id = ?` ).bind( role, new Date().toISOString(), target.id ).run()
    return ok_response( { user: admin_user_row( await get_user_by_id( env, target.id ) ) } )
}

async function admin_update_user_profile( { request, env, params } ) {

    await require_admin( env, request )
    const body = await read_json( request )
    const target = await get_user_by_id( env, params[ 0 ] )
    if( !target ) return error_response( `not_found`, `That user was not found.`, 404 )

    const name = body.name ? required_string( body.name, `name` ) : target.name
    const email = body.email ? required_string( body.email, `email` ) : target.email
    const phone = body.whatsapp_telephone ? normalize_whatsapp_telephone( body.whatsapp_telephone ) : target
    const hub_assignment = body.hub_id || body.requested_hub_name
        ? await resolve_signup_hub( env.DB, body )
        : { hub_id: target.hub_id, requested_hub_name: target.requested_hub_name }

    await env.DB.prepare( `
        UPDATE users
        SET name = ?, email = ?, email_normalized = ?, whatsapp_telephone = ?, whatsapp_telephone_digits = ?,
            hub_id = ?, requested_hub_name = ?, updated_at = ?
        WHERE id = ?
    ` ).bind(
        name,
        email,
        normalize_email( email ),
        phone.whatsapp_telephone,
        phone.whatsapp_telephone_digits,
        hub_assignment.hub_id,
        hub_assignment.requested_hub_name,
        new Date().toISOString(),
        target.id,
    ).run()

    return ok_response( { user: admin_user_row( await get_user_by_id( env, target.id ) ) } )
}

async function admin_create_password_reset( { request, env, params } ) {

    const { user: admin } = await require_admin( env, request )
    const target = await get_user_by_id( env, params[ 0 ] )
    if( !target ) return error_response( `not_found`, `That user was not found.`, 404 )

    const token = random_base64url( 18 )
    const token_hash = await sha256_base64url( token )
    const now = new Date()
    const expires = new Date( now.getTime() + 60 * 60 * 1_000 ).toISOString()

    await env.DB.prepare( `
        INSERT INTO password_reset_tokens ( id, user_id, token_hash, expires_at, created_at, created_by_user_id )
        VALUES ( ?, ?, ?, ?, ?, ? )
    ` ).bind( crypto.randomUUID(), target.id, token_hash, expires, now.toISOString(), admin.id ).run()

    return ok_response( { reset_token: token, expires_at: expires } )
}

async function admin_list_hubs( { request, env } ) {

    await require_admin( env, request )
    const hubs = await env.DB.prepare( `SELECT * FROM hubs ORDER BY is_active DESC, name` ).all()
    const requested = await env.DB.prepare( `
        SELECT requested_hub_name, count(*) AS pending_user_count
        FROM users
        WHERE requested_hub_name IS NOT NULL AND status = 'pending'
        GROUP BY requested_hub_name
        ORDER BY requested_hub_name
    ` ).all()
    return ok_response( { hubs: hubs.results, requested_hubs: requested.results } )
}

async function admin_create_hub( { request, env } ) {

    await require_admin( env, request )
    const body = await read_json( request )
    const name = normalize_city_name( required_string( body.name, `name` ) )
    const now = new Date().toISOString()
    const id = `hub_${ slugify( name ) }`

    await env.DB.prepare( `
        INSERT INTO hubs ( id, name, slug, is_active, created_at, updated_at )
        VALUES ( ?, ?, ?, 1, ?, ? )
        ON CONFLICT( slug ) DO UPDATE SET name = excluded.name, is_active = 1, updated_at = excluded.updated_at
    ` ).bind( id, name, slugify( name ), now, now ).run()

    return ok_response( { hub: await env.DB.prepare( `SELECT * FROM hubs WHERE slug = ?` ).bind( slugify( name ) ).first() }, 201 )
}

async function admin_update_hub( { request, env, params } ) {

    await require_admin( env, request )
    const body = await read_json( request )
    const current = await env.DB.prepare( `SELECT * FROM hubs WHERE id = ?` ).bind( params[ 0 ] ).first()
    if( !current ) return error_response( `not_found`, `That hub was not found.`, 404 )

    const name = body.name ? normalize_city_name( body.name ) : current.name
    const is_active = typeof body.is_active === `boolean` ?  body.is_active ? 1 : 0  : current.is_active
    await env.DB.prepare( `
        UPDATE hubs SET name = ?, slug = ?, is_active = ?, updated_at = ? WHERE id = ?
    ` ).bind( name, slugify( name ), is_active, new Date().toISOString(), current.id ).run()

    return ok_response( { hub: await env.DB.prepare( `SELECT * FROM hubs WHERE id = ?` ).bind( current.id ).first() } )
}

async function admin_list_ai_requests( { request, env } ) {

    await require_admin( env, request )
    const { results } = await env.DB.prepare( `
        SELECT ai_requests.*, users.name AS user_name
        FROM ai_requests
        JOIN users ON users.id = ai_requests.user_id
        ORDER BY ai_requests.created_at DESC
        LIMIT 200
    ` ).all()

    const updates = await env.DB.prepare( `SELECT * FROM grapevine_updates ORDER BY generated_at DESC LIMIT 100` ).all()
    return ok_response( { ai_requests: results, grapevine_updates: updates.results } )
}

async function admin_list_messages( { request, env, url } ) {

    await require_admin( env, request )
    const query = `%${ ( url.searchParams.get( `query` ) || `` ).trim().toLocaleLowerCase() }%`
    const { results } = await env.DB.prepare( `
        SELECT messages.*, users.name AS author_name, hubs.name AS hub_name
        FROM messages
        JOIN users ON users.id = messages.user_id
        LEFT JOIN hubs ON hubs.id = messages.hub_id
        WHERE messages.deleted_at IS NULL
            AND ( lower( messages.body ) LIKE ? OR lower( users.name ) LIKE ? OR lower( hubs.name ) LIKE ? )
        ORDER BY messages.created_at DESC
        LIMIT 200
    ` ).bind( query, query, query ).all()

    return ok_response( { messages: results } )
}

async function admin_generate_grapevine( { request, env } ) {

    const { user } = await require_admin( env, request )
    const body = await read_json( request )
    let period

    try {
        period = validate_manual_period( body.period_start, body.period_end )
    } catch ( error ) {
        const code = error.message === `invalid_period_order` ? `invalid_period_order` : `invalid_period`
        const message = code === `invalid_period_order`
            ? `Choose a period start before or on the period end.`
            : `Choose valid start and end dates.`
        return error_response( code, message, 400 )
    }

    const update = await create_grapevine_update( env, {
        ...period,
        generation_kind: `manual`,
        triggered_by_user_id: user.id,
    } )

    return ok_response( { update }, 201 )
}

async function get_user_by_id( env, id ) {

    return env.DB.prepare( `
        SELECT users.*, hubs.name AS hub_name
        FROM users
        LEFT JOIN hubs ON hubs.id = users.hub_id
        WHERE users.id = ?
    ` ).bind( id ).first()
}

async function assert_not_last_accepted_admin( env, target, next_state ) {

    const is_current_accepted_admin = target.status === `accepted` && target.role === `admin`
    const is_next_accepted_admin = next_state.next_status === `accepted` && next_state.next_role === `admin`
    if( !is_current_accepted_admin || is_next_accepted_admin ) return

    const row = await env.DB.prepare( `
        SELECT count(*) AS accepted_admin_count
        FROM users
        WHERE status = 'accepted' AND role = 'admin'
    ` ).first()

    if( row.accepted_admin_count <= 1 ) {
        throw Object.assign( new Error( `last_admin` ), {
            response: error_response( `last_admin`, `There must always be at least one accepted admin.`, 400 ),
        } )
    }
}

async function select_messages_for_query( env, options ) {

    const { window, hub_ids, user_ids } = options
    const bindings = [ window.since_iso, window.until_iso ]
    const clauses = [
        `messages.deleted_at IS NULL`,
        `messages.created_at >= ?`,
        `messages.created_at <= ?`,
        `users.status = 'accepted'`,
    ]

    if( hub_ids.length ) {
        clauses.push( `messages.hub_id IN ( ${ hub_ids.map( () => `?` ).join( `, ` ) } )` )
        bindings.push( ...hub_ids )
    }

    if( user_ids.length ) {
        clauses.push( `messages.user_id IN ( ${ user_ids.map( () => `?` ).join( `, ` ) } )` )
        bindings.push( ...user_ids )
    }

    const { results } = await env.DB.prepare( `
        SELECT messages.*, users.name AS author_name, hubs.name AS hub_name
        FROM messages
        JOIN users ON users.id = messages.user_id
        LEFT JOIN hubs ON hubs.id = messages.hub_id
        WHERE ${ clauses.join( ` AND ` ) }
        ORDER BY messages.created_at ASC
    ` ).bind( ...bindings ).all()

    return results
}

async function describe_filters( env, filters ) {

    const { hub_ids, user_ids } = filters
    const hub_names = hub_ids.length
        ? ( await env.DB.prepare( `SELECT name FROM hubs WHERE id IN ( ${ hub_ids.map( () => `?` ).join( `, ` ) } )` ).bind( ...hub_ids ).all() ).results.map( row => row.name )
        : []
    const user_names = user_ids.length
        ? ( await env.DB.prepare( `SELECT name FROM users WHERE status = 'accepted' AND id IN ( ${ user_ids.map( () => `?` ).join( `, ` ) } )` ).bind( ...user_ids ).all() ).results.map( row => row.name )
        : []

    return [ ...hub_names.map( name => `hub:${ name }` ), ...user_names.map( name => `member:${ name }` ) ].join( `, ` )
}

async function create_scheduled_summary( env, now ) {

    const period = scheduled_summary_period( env, now )
    const existing = await env.DB.prepare( `
        SELECT id FROM grapevine_updates
        WHERE period_start = ? AND period_end = ? AND generation_kind = 'scheduled'
    ` ).bind( period.period_start, period.period_end ).first()

    if( existing ) return existing
    return create_grapevine_update( env, { ...period, generation_kind: `scheduled`, triggered_by_user_id: null } )
}

async function create_grapevine_update( env, options ) {

    const { period_start, period_end, generation_kind, triggered_by_user_id } = options
    const { start_iso, end_iso } = summary_period_to_utc_range( env, { period_start, period_end } )
    const messages = await env.DB.prepare( `
        SELECT messages.*, users.name AS author_name, hubs.name AS hub_name
        FROM messages
        JOIN users ON users.id = messages.user_id
        LEFT JOIN hubs ON hubs.id = messages.hub_id
        WHERE messages.deleted_at IS NULL
            AND users.status = 'accepted'
            AND messages.created_at >= ?
            AND messages.created_at < ?
        ORDER BY messages.created_at ASC
    ` ).bind( start_iso, end_iso ).all()

    const id = crypto.randomUUID()
    const generated_at = new Date().toISOString()

    try {
        const summary = await generate_weekly_summary( env, messages.results, { period_start, period_end } )
        await env.DB.prepare( `
            INSERT INTO grapevine_updates (
                id, period_start, period_end, generated_at, model, prompt_version, status,
                summary_markdown, source_message_count, usage_json, generation_kind, triggered_by_user_id
            )
            VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )
        ` ).bind(
            id,
            period_start,
            period_end,
            generated_at,
            summary.model,
            prompt_version,
            summary.status,
            summary.markdown,
            messages.results.length,
            JSON.stringify( summary.usage || {} ),
            generation_kind,
            triggered_by_user_id,
        ).run()
    } catch ( error ) {
        await env.DB.prepare( `
            INSERT INTO grapevine_updates (
                id, period_start, period_end, generated_at, model, prompt_version, status,
                summary_markdown, source_message_count, usage_json, error_message, generation_kind, triggered_by_user_id
            )
            VALUES ( ?, ?, ?, ?, ?, ?, 'error', NULL, ?, '{}', ?, ?, ? )
        ` ).bind(
            id,
            period_start,
            period_end,
            generated_at,
            env.OPENROUTER_SUMMARY_MODEL || null,
            prompt_version,
            messages.results.length,
            error.message,
            generation_kind,
            triggered_by_user_id,
        ).run()
    }

    return env.DB.prepare( `SELECT * FROM grapevine_updates WHERE id = ?` ).bind( id ).first()
}

export default {
    fetch: fetch_handler,
    scheduled: scheduled_handler,
}
