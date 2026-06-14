import { readFile, writeFile } from 'node:fs/promises'
import { log } from 'mentie'

export const default_deploy_env = {
    GRAPEVINE_DOMAIN: ``,
    WEBAUTHN_RP_ID: ``,
    WEBAUTHN_RP_NAME: `Sandbox, Grapevine`,
    VAPID_PUBLIC_KEY: ``,
    VAPID_SUBJECT: ``,
    PUSH_DELIVERY_BATCH_SIZE: `10`,
    PUSH_DELIVERY_LIMIT: `40`,
    WORKER_CPU_MS: ``,
    GRAPEVINE_SUMMARY_CRON: `0 * * * *`,
    GRAPEVINE_TIMEZONE: `Europe/Amsterdam`,
    GRAPEVINE_SUMMARY_LOCAL_HOUR: `9`,
    GRAPEVINE_SUMMARY_PERIOD_DAYS: `7`,
    OPENROUTER_BASE_URL: ``,
    OPENROUTER_CHAT_COMPLETIONS_URL: ``,
    OPENROUTER_SUMMARY_MODEL: `openai/gpt-4.1-mini`,
    OPENROUTER_QUERY_MODEL: `openai/gpt-4.1-mini`,
    OPENROUTER_MAX_INPUT_MESSAGES: `80`,
    OPENROUTER_MAX_OUTPUT_TOKENS: `900`,
    GRAPEVINE_MAX_SOURCE_MESSAGES: `240`,
    GRAPEVINE_MAX_SUMMARY_SOURCE_MESSAGES: `500`,
    GRAPEVINE_MAX_CHUNKS: `4`,
    GRAPEVINE_AI_CONTEXT_MESSAGE_CHARACTERS: `2000`,
    GRAPEVINE_MAX_MESSAGE_CHARACTERS: `5000`,
    GRAPEVINE_MAX_QUESTION_CHARACTERS: `1200`,
    GRAPEVINE_MAX_FILTER_IDS: `50`,
    GRAPEVINE_DAILY_RECORDING_MINUTES: `60`,
    GRAPEVINE_DAILY_MESSAGE_LIMIT: `5`,
    GRAPEVINE_DAILY_QUESTION_LIMIT: `10`,
    WORKERS_AI_TRANSCRIPTION_MODEL: `@cf/openai/whisper-large-v3-turbo`,
    WORKERS_AI_TRANSCRIPTION_LANGUAGE: ``,
    WORKERS_AI_TRANSCRIPTION_INITIAL_PROMPT: `Sandbox, Grapevine member voice update.`,
    WORKERS_AI_TRANSCRIPTION_MAX_AUDIO_BYTES: `10000000`,
    WORKERS_AI_TRANSCRIPTION_MIN_SECONDS_PER_MEGABYTE: `60`,
    VITE_TRANSCRIPTION_MODEL: `onnx-community/whisper-small`,
    VITE_TRANSCRIPTION_DEVICE: `auto`,
    VITE_TRANSCRIPTION_DTYPE: `q8`,
    VITE_TRANSCRIPTION_MAX_AUDIO_BYTES: `10000000`,
    SESSION_TTL_DAYS: `30`,
    DATA_RETENTION_POLICY: `indefinite`,
    LOG_LEVEL: `info`,
    D1_DATABASE_NAME: `sandbox-grapevine`,
    D1_DATABASE_ID: `replace-with-cloudflare-d1-database-id`,
}

const placeholder_values = new Set( [
    `replace-with-cloudflare-d1-database-id`,
] )

const required_deploy_keys = [
    `D1_DATABASE_ID`,
]

const is_blank_value = value => value === undefined || value === null || String( value ).trim() === ``

const positive_integer_value = ( value, key ) => {
    if( is_blank_value( value ) ) return ``

    const normalized = String( value ).trim()
    if( !/^[1-9][0-9]*$/.test( normalized ) ) throw new Error( `${ key } must be a positive integer` )

    return normalized
}

/**
 * Ensures deploy config values are concrete enough for production deploys.
 * @param {Object} values - Config values
 * @returns {void}
 */
export function assert_deploy_config_values( values ) {

    required_deploy_keys.forEach( key => {
        if( is_blank_value( values[ key ] ) ) throw new Error( `Missing required deploy config value: ${ key }` )
    } )

    Object.entries( values ).forEach( ( [ key, value ] ) => {
        if( placeholder_values.has( String( value ) ) ) throw new Error( `Replace deploy config placeholder: ${ key }` )
    } )

    positive_integer_value( values.WORKER_CPU_MS, `WORKER_CPU_MS` )
}

/**
 * Renders the optional Worker CPU limit block.
 *
 * Cloudflare Free plans reject the `limits.cpu_ms` field. Keeping it opt-in
 * lets paid-plan deployments add the ceiling without breaking Free deploys.
 * @param {Object} values - Config values
 * @returns {String} Rendered JSONC fragment
 */
export function render_worker_limits_block( values ) {

    const cpu_ms = positive_integer_value( values.WORKER_CPU_MS, `WORKER_CPU_MS` )
    if( !cpu_ms ) return ``

    return `,
    "limits": {
        "cpu_ms": ${ cpu_ms }
    }`
}

/**
 * Renders the Wrangler deploy configuration from a template.
 * @param {Object} options - Render options
 * @returns {Promise<String>} Rendered config
 */
export async function render_deploy_config( options = {} ) {

    const {
        template_path = `wrangler.template.jsonc`,
        output_path = `wrangler.generated.jsonc`,
        env = process.env,
    } = options
    const template = await readFile( template_path, `utf8` )
    const values = { ...default_deploy_env, ...env }
    assert_deploy_config_values( values )
    const raw_values = {
        WORKER_LIMITS_BLOCK: render_worker_limits_block( values ),
    }

    const rendered = template.replace( /\$\{([A-Z0-9_]+)\}/g, ( match, key ) => {
        if( raw_values[ key ] !== undefined ) return raw_values[ key ]
        if( values[ key ] === undefined ) throw new Error( `Missing deploy config value: ${ key }` )
        return String( values[ key ] ).replaceAll( `\\`, `\\\\` ).replaceAll( `"`, `\\"` )
    } )

    await writeFile( output_path, rendered )
    return rendered
}

if( import.meta.url === `file://${ process.argv[ 1 ] }` ) {
    render_deploy_config()
        .then( () => log.info( `Rendered wrangler.generated.jsonc` ) )
        .catch( error => {
            log.error( `Failed to render deploy config`, error )
            process.exitCode = 1
        } )
}
