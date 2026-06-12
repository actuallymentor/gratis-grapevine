import assert from 'node:assert/strict'
import test from 'node:test'

import { check_service_worker_update, force_app_update_reload } from '../../src/modules/pwa_update.js'

const replace_global = ( name, value ) => {
    const original_descriptor = Object.getOwnPropertyDescriptor( globalThis, name )

    Object.defineProperty( globalThis, name, {
        configurable: true,
        writable: true,
        value,
    } )

    return () => {
        if( original_descriptor ) {
            Object.defineProperty( globalThis, name, original_descriptor )
            return
        }

        delete globalThis[ name ]
    }
}

const with_browser_globals = async ( globals, run ) => {
    const restore_globals = Object.entries( globals ).map( ( [ name, value ] ) => replace_global( name, value ) )

    try {
        await run()
    } finally {
        restore_globals.reverse().forEach( restore_global => restore_global() )
    }
}

test( `service worker update checks pause during forced app updates`, async () => {
    let did_fetch = false
    let did_update_registration = false

    await with_browser_globals( {
        fetch: async () => {
            did_fetch = true
            return new Response( ``, { status: 200 } )
        },
        navigator: { onLine: true },
        window: { __grapevine_forcing_update: true },
    }, async () => {
        const did_check = await check_service_worker_update( `/sw.js`, {
            update: async () => {
                did_update_registration = true
            },
        } )

        assert.equal( did_check, false )
        assert.equal( did_fetch, false )
        assert.equal( did_update_registration, false )
    } )
} )

test( `forced app updates clear the in-flight guard after reloading`, async () => {
    let did_reload = false

    await with_browser_globals( {
        caches: {
            delete: async () => true,
            keys: async () => [],
        },
        fetch: async () => new Response( ``, { status: 200 } ),
        navigator: {
            onLine: true,
            serviceWorker: {
                getRegistrations: async () => [],
            },
        },
        window: {
            __grapevine_reload_app: () => {
                did_reload = true
            },
            location: {
                origin: `https://grapevine.example.test`,
                reload: () => {
                    did_reload = true
                },
            },
        },
    }, async () => {
        await force_app_update_reload()

        assert.equal( did_reload, true )
        assert.equal( globalThis.window.__grapevine_forcing_update, false )
    } )
} )
