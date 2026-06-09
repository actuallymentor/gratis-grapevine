import { readFile, writeFile } from 'node:fs/promises'
import { log } from 'mentie'

export const default_deploy_env = {
    GRAPEVINE_DOMAIN: `https://grapevine.gratis.sh`,
    WEBAUTHN_RP_ID: `grapevine.gratis.sh`,
    WEBAUTHN_RP_NAME: `Gratis Grapevine`,
    GRAPEVINE_SUMMARY_CRON: `0 * * * 1`,
    GRAPEVINE_TIMEZONE: `Europe/Amsterdam`,
    GRAPEVINE_SUMMARY_LOCAL_HOUR: `9`,
    GRAPEVINE_SUMMARY_PERIOD_DAYS: `7`,
    OPENROUTER_SUMMARY_MODEL: `openai/gpt-4.1-mini`,
    OPENROUTER_QUERY_MODEL: `openai/gpt-4.1-mini`,
    OPENROUTER_MAX_INPUT_MESSAGES: `80`,
    WORKERS_AI_TRANSCRIPTION_MODEL: `@cf/openai/whisper-large-v3-turbo`,
    WORKERS_AI_TRANSCRIPTION_LANGUAGE: ``,
    WORKERS_AI_TRANSCRIPTION_INITIAL_PROMPT: `Gratis Grapevine member voice update.`,
    WORKERS_AI_TRANSCRIPTION_MAX_AUDIO_BYTES: `10000000`,
    VITE_TRANSCRIPTION_MODEL: `onnx-community/whisper-small`,
    VITE_TRANSCRIPTION_DEVICE: `auto`,
    VITE_TRANSCRIPTION_DTYPE: `q8`,
    VITE_TRANSCRIPTION_MAX_AUDIO_BYTES: `10000000`,
    SESSION_TTL_DAYS: `30`,
    DATA_RETENTION_POLICY: `indefinite`,
    LOG_LEVEL: `info`,
    D1_DATABASE_NAME: `gratis-grapevine`,
    D1_DATABASE_ID: `replace-with-cloudflare-d1-database-id`,
}

const placeholder_values = new Set( [
    `replace-with-cloudflare-d1-database-id`,
] )

const required_deploy_keys = [
    `D1_DATABASE_ID`,
]

const is_blank_value = value => value === undefined || value === null || String( value ).trim() === ``

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

    const rendered = template.replace( /\$\{([A-Z0-9_]+)\}/g, ( match, key ) => {
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
