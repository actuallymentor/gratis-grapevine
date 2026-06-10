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
            GRAPEVINE_SUMMARY_CRON: `0 * * * 1`,
            D1_DATABASE_ID: `00000000-0000-0000-0000-000000000000`,
        },
    } )

    assert.equal( rendered, `{"domain":"https://example.test","cron":"0 * * * 1"}` )
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
