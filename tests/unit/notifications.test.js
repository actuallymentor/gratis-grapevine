import assert from 'node:assert/strict'
import test from 'node:test'

import {
    public_notification_config,
    save_push_subscription,
    send_push_notification,
} from '../../worker/modules/notifications.js'

const subscription_payload = {
    endpoint: `https://push.example.test/send/subscription-1`,
    expirationTime: null,
    keys: {
        p256dh: `BNcRd-example-public-key`,
        auth: `test-auth-secret`,
    },
}

const create_db = () => {

    const calls = []

    return {
        calls,
        prepare: sql => ( {
            bind: ( ...bindings ) => ( {
                run: async () => {
                    calls.push( { action: `run`, sql, bindings } )
                    return { success: true }
                },
                all: async () => {
                    calls.push( { action: `all`, sql, bindings } )
                    return { results: [] }
                },
            } ),
            run: async () => {
                calls.push( { action: `run`, sql, bindings: [] } )
                return { success: true }
            },
            all: async () => {
                calls.push( { action: `all`, sql, bindings: [] } )
                return { results: [] }
            },
        } ),
    }
}

const configured_env = db => ( {
    DB: db,
    VAPID_PUBLIC_KEY: `public-key`,
    VAPID_PRIVATE_KEY: JSON.stringify( { kty: `EC`, crv: `P-256`, x: `x`, y: `y`, d: `d` } ),
    VAPID_SUBJECT: `mailto:admin@example.test`,
} )

test( `public notification config stays disabled until VAPID settings are complete`, () => {
    assert.deepEqual( public_notification_config( {} ), {
        supported: false,
        public_key: null,
    } )

    assert.deepEqual( public_notification_config( configured_env( create_db() ) ), {
        supported: true,
        public_key: `public-key`,
    } )
} )

test( `push subscriptions are stored for the current session user`, async () => {
    const db = create_db()
    const request = new Request( `https://example.test/api/notifications/subscriptions`, {
        headers: { "user-agent": `Unit Test Browser` },
    } )

    const subscription = await save_push_subscription(
        configured_env( db ),
        request,
        { id: `pending_user_1`, status: `pending` },
        subscription_payload,
    )
    const [ insert_call ] = db.calls.filter( call => call.sql.includes( `INSERT INTO push_subscriptions` ) )

    assert.equal( subscription.endpoint, subscription_payload.endpoint )
    assert.equal( insert_call.bindings[ 1 ], `pending_user_1` )
    assert.equal( insert_call.bindings[ 2 ], subscription_payload.endpoint )
    assert.equal( insert_call.bindings[ 3 ], subscription_payload.keys.p256dh )
    assert.equal( insert_call.bindings[ 4 ], subscription_payload.keys.auth )
} )

test( `push subscriptions reject non-https endpoints`, async () => {
    const db = create_db()
    const request = new Request( `https://example.test/api/notifications/subscriptions` )

    await assert.rejects(
        save_push_subscription(
            configured_env( db ),
            request,
            { id: `user_1` },
            { ...subscription_payload, endpoint: `http://push.example.test/send/subscription-1` },
        ),
        error => {
            assert.equal( error.response.status, 400 )
            return true
        },
    )
} )

test( `push delivery skips when VAPID settings are not configured`, async () => {
    const result = await send_push_notification( { DB: create_db() }, {
        id: `subscription_1`,
        endpoint: subscription_payload.endpoint,
        p256dh: subscription_payload.keys.p256dh,
        auth: subscription_payload.keys.auth,
    }, { title: `Skipped` } )

    assert.deepEqual( result, { skipped: true, reason: `not_configured` } )
} )

