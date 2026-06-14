import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { assert_deploy_config_values, default_deploy_env, render_deploy_config } from '../../scripts/render_deploy_config.js'

test( `renders deploy config placeholders`, async () => {
    const dir = await mkdtemp( join( tmpdir(), `grapevine-config-` ) )
    const template_path = join( dir, `wrangler.template.jsonc` )
    const output_path = join( dir, `wrangler.generated.jsonc` )

    await writeFile( template_path, `{"domain":"\${GRAPEVINE_DOMAIN}","cron":"\${GRAPEVINE_SUMMARY_CRON}"}` )

    const rendered = await render_deploy_config( {
        template_path,
        output_path,
        env: {
            GRAPEVINE_DOMAIN: `https://example.test`,
            GRAPEVINE_SUMMARY_CRON: `0 * * * *`,
            D1_DATABASE_ID: `00000000-0000-0000-0000-000000000000`,
        },
    } )

    assert.equal( rendered, `{"domain":"https://example.test","cron":"0 * * * *"}` )
    assert.equal( await readFile( output_path, `utf8` ), rendered )
} )

test( `renders Workers AI transcription config`, async () => {
    const dir = await mkdtemp( join( tmpdir(), `grapevine-config-` ) )
    const output_path = join( dir, `wrangler.generated.jsonc` )

    const rendered = await render_deploy_config( {
        output_path,
        env: {
            D1_DATABASE_ID: `00000000-0000-0000-0000-000000000000`,
        },
    } )

    assert.match( rendered, /"WORKERS_AI_TRANSCRIPTION_MODEL": "@cf\/openai\/whisper-large-v3-turbo"/ )
    assert.match( rendered, /"WORKERS_AI_TRANSCRIPTION_MAX_AUDIO_BYTES": "10000000"/ )
    assert.equal( default_deploy_env.VITE_TRANSCRIPTION_MAX_AUDIO_BYTES, `10000000` )
    assert.match( rendered, /"ai": \{\s+"binding": "AI"\s+\}/ )
} )

test( `renders daily usage limit config`, async () => {
    const dir = await mkdtemp( join( tmpdir(), `grapevine-config-` ) )
    const output_path = join( dir, `wrangler.generated.jsonc` )

    const rendered = await render_deploy_config( {
        output_path,
        env: {
            D1_DATABASE_ID: `00000000-0000-0000-0000-000000000000`,
        },
    } )

    assert.equal( default_deploy_env.GRAPEVINE_DAILY_RECORDING_MINUTES, `60` )
    assert.equal( default_deploy_env.GRAPEVINE_DAILY_MESSAGE_LIMIT, `5` )
    assert.equal( default_deploy_env.GRAPEVINE_DAILY_QUESTION_LIMIT, `10` )
    assert.match( rendered, /"GRAPEVINE_DAILY_RECORDING_MINUTES": "60"/ )
    assert.match( rendered, /"GRAPEVINE_DAILY_MESSAGE_LIMIT": "5"/ )
    assert.match( rendered, /"GRAPEVINE_DAILY_QUESTION_LIMIT": "10"/ )
} )

test( `renders security and cost control config`, async () => {
    const dir = await mkdtemp( join( tmpdir(), `grapevine-config-` ) )
    const output_path = join( dir, `wrangler.generated.jsonc` )

    const rendered = await render_deploy_config( {
        output_path,
        env: {
            D1_DATABASE_ID: `00000000-0000-0000-0000-000000000000`,
        },
    } )

    assert.equal( default_deploy_env.WORKER_CPU_MS, `` )
    assert.equal( default_deploy_env.GRAPEVINE_SUMMARY_CRON, `0 * * * *` )
    assert.equal( default_deploy_env.GRAPEVINE_NOTIFICATION_CRON, `*/5 * * * *` )
    assert.equal( default_deploy_env.OPENROUTER_MAX_OUTPUT_TOKENS, `900` )
    assert.equal( default_deploy_env.GRAPEVINE_MAX_SOURCE_MESSAGES, `240` )
    assert.equal( default_deploy_env.GRAPEVINE_MAX_SUMMARY_SOURCE_MESSAGES, `500` )
    assert.equal( default_deploy_env.GRAPEVINE_MAX_CHUNKS, `4` )
    assert.equal( default_deploy_env.GRAPEVINE_MAX_MESSAGE_CHARACTERS, `5000` )
    assert.equal( default_deploy_env.GRAPEVINE_MAX_QUESTION_CHARACTERS, `1200` )
    assert.equal( default_deploy_env.GRAPEVINE_MAX_FILTER_IDS, `50` )
    assert.equal( default_deploy_env.WORKERS_AI_TRANSCRIPTION_MIN_SECONDS_PER_MEGABYTE, `60` )
    assert.doesNotMatch( rendered, /"limits": \{/ )
    assert.match( rendered, /"crons": \[\s+"0 \* \* \* \*",\s+"\*\/5 \* \* \* \*"\s+\]/ )
    assert.match( rendered, /"GRAPEVINE_MAX_SOURCE_MESSAGES": "240"/ )
    assert.match( rendered, /"OPENROUTER_MAX_OUTPUT_TOKENS": "900"/ )
    assert.match( rendered, /"WORKERS_AI_TRANSCRIPTION_MIN_SECONDS_PER_MEGABYTE": "60"/ )
} )

test( `renders paid-plan Worker CPU limit only when configured`, async () => {
    const dir = await mkdtemp( join( tmpdir(), `grapevine-config-` ) )
    const output_path = join( dir, `wrangler.generated.jsonc` )

    const rendered = await render_deploy_config( {
        output_path,
        env: {
            D1_DATABASE_ID: `00000000-0000-0000-0000-000000000000`,
            WORKER_CPU_MS: `1000`,
        },
    } )

    assert.match( rendered, /"limits": \{\s+"cpu_ms": 1000\s+\}/ )
} )

test( `rejects production deploy placeholders`, () => {
    assert.throws( () => assert_deploy_config_values( {
        D1_DATABASE_ID: `replace-with-cloudflare-d1-database-id`,
    } ), /D1_DATABASE_ID/ )
} )

test( `rejects missing required deploy values`, () => {
    assert.throws( () => assert_deploy_config_values( {
        D1_DATABASE_ID: ``,
    } ), /D1_DATABASE_ID/ )
} )

test( `rejects invalid Worker CPU limits`, () => {
    assert.throws( () => assert_deploy_config_values( {
        D1_DATABASE_ID: `00000000-0000-0000-0000-000000000000`,
        WORKER_CPU_MS: `0`,
    } ), /WORKER_CPU_MS/ )

    assert.throws( () => assert_deploy_config_values( {
        D1_DATABASE_ID: `00000000-0000-0000-0000-000000000000`,
        WORKER_CPU_MS: `1000, "x": true`,
    } ), /WORKER_CPU_MS/ )
} )

test( `rejects missing D1 id while rendering deploy config`, async () => {
    const dir = await mkdtemp( join( tmpdir(), `grapevine-config-` ) )
    const template_path = join( dir, `wrangler.template.jsonc` )
    const output_path = join( dir, `wrangler.generated.jsonc` )

    await writeFile( template_path, `{"database_id":"\${D1_DATABASE_ID}"}` )

    await assert.rejects( () => render_deploy_config( {
        template_path,
        output_path,
        env: {
            D1_DATABASE_ID: ``,
        },
    } ), /D1_DATABASE_ID/ )
} )
