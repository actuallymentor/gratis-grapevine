import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../../worker/index.js'
import {
    active_admin_subscriptions,
    active_member_subscriptions,
    drain_push_notification_jobs,
    public_notification_config,
    record_push_failure,
    record_push_success,
    save_push_subscription,
    send_push_notification,
    send_push_notifications,
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
                first: async () => {
                    calls.push( { action: `first`, sql, bindings } )
                    return null
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
            first: async () => {
                calls.push( { action: `first`, sql, bindings: [] } )
                return null
            },
        } ),
    }
}

const create_push_job_db = ( options = {} ) => {

    const { claim_changes = 1 } = options
    const calls = []
    const subscriptions = [
        {
            id: `subscription_3`,
            endpoint: `https://push.example.test/send/subscription-3`,
            created_at: `2026-06-14T12:02:00.000Z`,
        },
        {
            id: `subscription_4`,
            endpoint: `https://push.example.test/send/subscription-4`,
            created_at: `2026-06-14T12:03:00.000Z`,
        },
    ]
    const job = {
        id: `job_1`,
        payload_json: JSON.stringify( { title: `Queued bulletin` } ),
        options_json: JSON.stringify( { urgency: `low` } ),
        created_at: `2026-06-14T12:04:00.000Z`,
        last_subscription_created_at: `2026-06-14T12:01:00.000Z`,
        last_subscription_id: `subscription_2`,
    }

    const result_for = async ( action, sql, bindings ) => {
        calls.push( { action, sql, bindings } )

        if( action === `first` && sql.includes( `FROM push_notification_jobs` ) ) return job
        if( action === `first` && sql.includes( `remaining_count` ) ) return { remaining_count: 2 }
        if( action === `all` && sql.includes( `FROM push_subscriptions` ) ) return { results: subscriptions }
        if( action === `all` ) return { results: [] }
        if( action === `run` && sql.includes( `SET lease_expires_at = ?` ) ) return { meta: { changes: claim_changes } }

        return { success: true }
    }

    return {
        calls,
        prepare: sql => ( {
            bind: ( ...bindings ) => ( {
                run: () => result_for( `run`, sql, bindings ),
                all: () => result_for( `all`, sql, bindings ),
                first: () => result_for( `first`, sql, bindings ),
            } ),
            run: () => result_for( `run`, sql, [] ),
            all: () => result_for( `all`, sql, [] ),
            first: () => result_for( `first`, sql, [] ),
        } ),
    }
}

const configured_env = db => ( {
    DB: db,
    VAPID_PUBLIC_KEY: `public-key`,
    VAPID_PRIVATE_KEY: JSON.stringify( { kty: `EC`, crv: `P-256`, x: `x`, y: `y`, d: `d` } ),
    VAPID_SUBJECT: `mailto:admin@example.test`,
} )

const create_scheduled_db = () => {

    const calls = []
    const statement = ( sql, bindings = [] ) => ( {
        sql,
        bindings,
        bind: ( ...next_bindings ) => statement( sql, next_bindings ),
        run: async () => {
            calls.push( { action: `run`, sql, bindings } )
            return { meta: { changes: 1 } }
        },
        first: async () => {
            calls.push( { action: `first`, sql, bindings } )
            return null
        },
        all: async () => {
            calls.push( { action: `all`, sql, bindings } )
            return { results: [] }
        },
    } )

    return {
        calls,
        prepare: sql => statement( sql ),
        batch: async statements => Promise.all( statements.map( prepared_statement => prepared_statement.run() ) ),
    }
}

const run_scheduled = async ( event, env ) => {

    const tasks = []
    await worker.scheduled( event, env, {
        waitUntil: task => tasks.push( task ),
    } )
    await Promise.all( tasks )
}

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

test( `notification cron drains push jobs without running summary cleanup`, async () => {
    const db = create_scheduled_db()

    await run_scheduled( { cron: `*/5 * * * *` }, {
        ...configured_env( db ),
        GRAPEVINE_SUMMARY_CRON: `0 * * * *`,
        GRAPEVINE_NOTIFICATION_CRON: `*/5 * * * *`,
    } )

    assert.ok( db.calls.some( call => call.sql.includes( `FROM push_notification_jobs` ) ) )
    assert.ok( db.calls.every( call => !call.sql.includes( `DELETE FROM webauthn_challenges` ) ) )
    assert.ok( db.calls.every( call => !call.sql.includes( `FROM grapevine_updates` ) ) )
} )

test( `summary cron does not drain push jobs`, async () => {
    const db = create_scheduled_db()

    await run_scheduled( { cron: `0 * * * *` }, {
        ...configured_env( db ),
        GRAPEVINE_SUMMARY_CRON: `0 * * * *`,
        GRAPEVINE_NOTIFICATION_CRON: `*/5 * * * *`,
    } )

    assert.ok( db.calls.some( call => call.sql.includes( `DELETE FROM webauthn_challenges` ) ) )
    assert.ok( db.calls.every( call => !call.sql.includes( `SELECT *` ) || !call.sql.includes( `FROM push_notification_jobs` ) ) )
} )

test( `push fan-out is batched and summarized`, async () => {
    const db = create_db()
    const deliveries = []
    const subscriptions = Array.from( { length: 5 }, ( _, index ) => ( {
        id: `subscription_${ index + 1 }`,
        endpoint: `https://push.example.test/send/subscription-${ index + 1 }`,
        p256dh: subscription_payload.keys.p256dh,
        auth: subscription_payload.keys.auth,
        failure_count: 0,
    } ) )
    const env = {
        ...configured_env( db ),
        PUSH_DELIVERY_BATCH_SIZE: `2`,
    }

    const result = await send_push_notifications(
        env,
        subscriptions,
        { title: `Bounded` },
        { urgency: `low` },
        async ( _, subscription, __, options ) => {
            deliveries.push( { id: subscription.id, urgency: options.urgency } )
            return { ok: true, status: 201 }
        },
    )

    assert.deepEqual( deliveries.map( delivery => delivery.id ), [
        `subscription_1`,
        `subscription_2`,
        `subscription_3`,
        `subscription_4`,
        `subscription_5`,
    ] )
    assert.equal( result.total, 5 )
    assert.equal( result.attempted, 5 )
    assert.equal( result.ok, 5 )
    assert.equal( result.failed, 0 )
    assert.equal( result.remaining, 0 )
} )

test( `push notification jobs drain one bounded member batch`, async () => {
    const db = create_push_job_db()
    const deliveries = []

    const result = await drain_push_notification_jobs(
        {
            ...configured_env( db ),
            PUSH_DELIVERY_BATCH_SIZE: `1`,
            PUSH_DELIVERY_LIMIT: `2`,
        },
        async ( _, subscription, payload, options ) => {
            deliveries.push( { id: subscription.id, title: payload.title, urgency: options.urgency } )
            return { ok: true, status: 201 }
        },
    )

    const [ subscription_query ] = db.calls.filter( call => call.sql.includes( `SELECT push_subscriptions.*` ) )
    const [ claim_update ] = db.calls.filter( call => call.sql.includes( `SET lease_expires_at = ?` ) )
    const [ cursor_update ] = db.calls.filter( call => call.sql.includes( `last_subscription_created_at = ?` ) )

    assert.deepEqual( deliveries.map( delivery => delivery.id ), [ `subscription_3`, `subscription_4` ] )
    assert.deepEqual( deliveries.map( delivery => delivery.title ), [ `Queued bulletin`, `Queued bulletin` ] )
    assert.equal( claim_update.bindings[ 2 ], `job_1` )
    assert.match( subscription_query.sql, /push_subscriptions\.created_at = \? AND push_subscriptions\.id > \?/ )
    assert.match( subscription_query.sql, /ORDER BY push_subscriptions\.created_at ASC, push_subscriptions\.id ASC/ )
    assert.deepEqual( subscription_query.bindings, [
        `2026-06-14T12:04:00.000Z`,
        `2026-06-14T12:01:00.000Z`,
        `2026-06-14T12:01:00.000Z`,
        `subscription_2`,
        2,
    ] )
    assert.equal( cursor_update.bindings[ 0 ], `2026-06-14T12:03:00.000Z` )
    assert.equal( cursor_update.bindings[ 1 ], `subscription_4` )
    assert.equal( cursor_update.bindings[ 3 ], 2 )
    assert.equal( cursor_update.bindings[ 5 ], `job_1` )
    assert.equal( result.total, 2 )
    assert.equal( result.ok, 2 )
    assert.equal( result.remaining, 2 )
} )

test( `push notification jobs skip delivery when the lease claim loses`, async () => {
    const db = create_push_job_db( { claim_changes: 0 } )
    const deliveries = []

    const result = await drain_push_notification_jobs(
        {
            ...configured_env( db ),
            PUSH_DELIVERY_LIMIT: `2`,
        },
        async ( _, subscription ) => {
            deliveries.push( subscription.id )
            return { ok: true, status: 201 }
        },
    )

    const [ claim_update ] = db.calls.filter( call => call.sql.includes( `SET lease_expires_at = ?` ) )

    assert.equal( claim_update.bindings[ 2 ], `job_1` )
    assert.deepEqual( deliveries, [] )
    assert.equal( result.total, 0 )
    assert.equal( result.attempted, 0 )
} )

test( `push delivery success resets subscription failure health`, async () => {
    const db = create_db()
    const now = `2026-06-14T12:00:00.000Z`

    await record_push_success( configured_env( db ), { id: `subscription_1` }, now )

    const [ update_call ] = db.calls.filter( call => call.sql.includes( `last_success_at` ) )
    assert.deepEqual( update_call.bindings, [ now, now, `subscription_1` ] )
    assert.match( update_call.sql, /last_failure_at = NULL/ )
    assert.match( update_call.sql, /failure_count = 0/ )
} )

test( `push delivery failures disable stale subscriptions`, async () => {
    const now = `2026-06-14T12:00:00.000Z`
    const gone_db = create_db()

    await record_push_failure( configured_env( gone_db ), { id: `subscription_1`, failure_count: 0 }, 410, now )

    const [ gone_call ] = gone_db.calls.filter( call => call.sql.includes( `last_failure_at` ) )
    assert.deepEqual( gone_call.bindings, [ now, 1, now, now, `subscription_1` ] )

    const transient_db = create_db()
    await record_push_failure( configured_env( transient_db ), { id: `subscription_2`, failure_count: 6 }, 500, now )

    const [ transient_call ] = transient_db.calls.filter( call => call.sql.includes( `last_failure_at` ) )
    assert.deepEqual( transient_call.bindings, [ now, 0, now, now, `subscription_2` ] )

    const stale_db = create_db()
    await record_push_failure( configured_env( stale_db ), { id: `subscription_3`, failure_count: 7 }, 500, now )

    const [ stale_call ] = stale_db.calls.filter( call => call.sql.includes( `last_failure_at` ) )
    assert.deepEqual( stale_call.bindings, [ now, 1, now, now, `subscription_3` ] )
} )

test( `admin notifications only target active accepted admins`, async () => {
    const db = create_db()

    await active_admin_subscriptions( configured_env( db ) )

    const [ query_call ] = db.calls.filter( call => call.sql.includes( `JOIN users` ) )
    assert.match( query_call.sql, /users\.status = 'accepted'/ )
    assert.match( query_call.sql, /users\.role = 'admin'/ )
    assert.match( query_call.sql, /push_subscriptions\.disabled_at IS NULL/ )
} )

test( `community bulletin notifications target active accepted members`, async () => {
    const db = create_db()

    await active_member_subscriptions( configured_env( db ) )

    const [ query_call ] = db.calls.filter( call => call.sql.includes( `JOIN users` ) )
    assert.match( query_call.sql, /users\.status = 'accepted'/ )
    assert.doesNotMatch( query_call.sql, /users\.role/ )
    assert.match( query_call.sql, /push_subscriptions\.disabled_at IS NULL/ )
} )
