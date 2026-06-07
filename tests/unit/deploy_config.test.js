import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { render_deploy_config } from '../../scripts/render_deploy_config.js'

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
        },
    } )

    assert.equal( rendered, `{"domain":"https://example.test","cron":"0 * * * 1"}` )
    assert.equal( await readFile( output_path, `utf8` ), rendered )
} )
