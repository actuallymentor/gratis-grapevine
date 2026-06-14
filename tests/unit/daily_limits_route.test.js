import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../../worker/index.js'

const accepted_user = {
    id: `user_1`,
    name: `Ada`,
    email: `ada@example.test`,
    whatsapp_telephone: `+31612345678`,
    whatsapp_telephone_digits: `31612345678`,
    hub_id: `hub_amsterdam`,
    status: `accepted`,
    role: `member`,
}

const json_request = ( path, body ) => new Request( `https://example.test${ path }`, {
    method: `POST`,
    headers: {
        cookie: `sg_session=test-token`,
        "content-type": `application/json`,
    },
    body: JSON.stringify( body ),
} )

const get_request = path => new Request( `https://example.test${ path }`, {
    headers: {
        cookie: `sg_session=test-token`,
    },
} )

const delete_request = path => new Request( `https://example.test${ path }`, {
    method: `DELETE`,
    headers: {
        cookie: `sg_session=test-token`,
    },
} )

const oversized_json_request = path => new Request( `https://example.test${ path }`, {
    method: `POST`,
    headers: {
        "content-type": `application/json`,
        "content-length": `128001`,
    },
    body: `{}`,
} )

const create_bound_statement = ( sql, bindings, context ) => ( {
    sql,
    bindings,
    run: async () => {
        context.calls.sql.push( { action: `run`, sql, bindings } )

        if( sql.includes( `INSERT INTO daily_usage` ) && context.usage_fails ) throw context.usage_error

        return { meta: { changes: 1 } }
    },
    first: async () => {
        context.calls.sql.push( { action: `first`, sql, bindings } )

        if( sql.includes( `FROM sessions` ) ) {
            return { session_id: `session_1`, expires_at: `2999-01-01T00:00:00.000Z`, ...context.user }
        }

        if( sql.includes( `SELECT users.*, hubs.name AS hub_name` ) ) {
            return { ...context.user, hub_name: context.user.hub_name || `Amsterdam` }
        }

        if( sql.includes( `SELECT count(*) AS pending_user_count` ) ) {
            return { pending_user_count: context.pending_user_count }
        }

        if( sql.includes( `SELECT * FROM hubs WHERE id = ? AND is_active = 1` ) ) {
            return context.hubs.find( hub => hub.id === bindings[ 0 ] && hub.is_active !== 0 ) || null
        }

        if( sql.includes( `SELECT * FROM hubs WHERE id = 'hub_elsewhere' AND is_active = 1` ) ) {
            return context.hubs.find( hub => hub.id === `hub_elsewhere` && hub.is_active !== 0 ) || null
        }

        if( sql.includes( `messages.id = ?` ) ) {
            return context.message_details[ bindings[ 0 ] ] || null
        }

        if( sql.includes( `FROM rate_limits` ) ) {
            return { count: context.rate_limit_count, reset_at: `2999-01-01T00:00:00.000Z` }
        }

        if( sql.includes( `FROM daily_usage` ) ) {
            return { used: context.daily_usage_used, limit_value: context.daily_usage_limit }
        }

        return null
    },
    all: async () => {
        context.calls.sql.push( { action: `all`, sql, bindings } )

        if( sql.includes( `SELECT id, name FROM users WHERE status = 'accepted'` ) ) return { results: [] }
        if( sql.includes( `SELECT messages.id, messages.source` ) ) {
            return {
                results: context.query_messages.map( ( { body, ...message } ) => message ),
            }
        }
        if( sql.includes( `FROM messages` ) ) return { results: context.query_messages }
        return { results: [] }
    },
} )

const create_env = ( options = {} ) => {

    const context = {
        user: options.user || accepted_user,
        daily_usage_limit: options.daily_usage_limit || 5,
        daily_usage_used: options.daily_usage_used || 5,
        pending_user_count: options.pending_user_count || 0,
        rate_limit_count: options.rate_limit_count || 1,
        query_messages: options.query_messages || [],
        message_details: options.message_details || {},
        hubs: options.hubs || [
            { id: `hub_amsterdam`, name: `Amsterdam`, is_active: 1 },
            { id: `hub_elsewhere`, name: `Elsewhere`, is_active: 1 },
        ],
        usage_error: options.usage_error || new Error( `CHECK constraint failed: used <= limit_value` ),
        usage_fails: options.usage_fails || false,
        calls: {
            batch: [],
            sql: [],
        },
    }

    return {
        context,
        env: {
            SESSION_SECRET: `test-session-secret`,
            GRAPEVINE_DAILY_MESSAGE_LIMIT: `5`,
            GRAPEVINE_DAILY_QUESTION_LIMIT: `10`,
            OPENROUTER_QUERY_MODEL: `openai/test-model`,
            DB: {
                prepare: sql => ( {
                    ...create_bound_statement( sql, [], context ),
                    bind: ( ...bindings ) => create_bound_statement( sql, bindings, context ),
                } ),
                batch: async statements => {
                    context.calls.batch.push( statements )

                    if( statements.some( statement => statement.sql.includes( `INSERT INTO daily_usage` ) ) && context.usage_fails ) throw context.usage_error

                    return statements.map( () => ( { success: true } ) )
                },
            },
        },
    }
}

test( `message creation stops at the daily message limit before insert`, async () => {
    const { env, context } = create_env( {
        daily_usage_limit: 5,
        daily_usage_used: 5,
        usage_fails: true,
    } )
    const response = await worker.fetch( json_request( `/api/messages`, {
        body: `A typed update.`,
        source: `typed`,
    } ), env, {} )
    const payload = await response.json()
    const batched_message_inserts = context.calls.batch.flatMap( statements => statements )
        .filter( statement => statement.sql.includes( `INSERT INTO messages` ) )
    const executed_message_inserts = context.calls.sql
        .filter( call => call.sql.includes( `INSERT INTO messages` ) )

    assert.equal( response.status, 429 )
    assert.equal( payload.error.code, `daily_message_limit_reached` )
    assert.equal( payload.error.limit, 5 )
    assert.equal( batched_message_inserts.length, 1 )
    assert.equal( executed_message_inserts.length, 0 )
} )

test( `signup rejects oversized JSON before touching D1`, async () => {
    const { env, context } = create_env()
    const response = await worker.fetch( oversized_json_request( `/api/signup` ), env, {} )
    const payload = await response.json()

    assert.equal( response.status, 413 )
    assert.equal( payload.error.code, `json_body_too_large` )
    assert.equal( context.calls.sql.length, 0 )
    assert.equal( context.calls.batch.length, 0 )
} )

test( `message creation rejects oversized bodies before reserving usage`, async () => {
    const { env, context } = create_env()
    const response = await worker.fetch( json_request( `/api/messages`, {
        body: `x`.repeat( 5_001 ),
        source: `typed`,
    } ), env, {} )
    const payload = await response.json()
    const usage_inserts = context.calls.sql
        .filter( call => call.sql.includes( `INSERT INTO daily_usage` ) )
    const message_inserts = context.calls.batch.flatMap( statements => statements )
        .filter( statement => statement.sql.includes( `INSERT INTO messages` ) )

    assert.equal( response.status, 413 )
    assert.equal( payload.error.code, `body_too_long` )
    assert.equal( usage_inserts.length, 0 )
    assert.equal( message_inserts.length, 0 )
} )

test( `Ask Grapevine stops at the daily question limit before loading messages`, async () => {
    const { env, context } = create_env( {
        daily_usage_limit: 10,
        daily_usage_used: 10,
        usage_fails: true,
    } )
    const response = await worker.fetch( json_request( `/api/grapevine/query`, {
        mode: `question`,
        time_window: `last_month`,
        question: `What themes are active this month?`,
    } ), env, {} )
    const payload = await response.json()
    const message_selects = context.calls.sql
        .filter( call => call.sql.includes( `FROM messages` ) )

    assert.equal( response.status, 429 )
    assert.equal( payload.error.code, `daily_grapevine_question_limit_reached` )
    assert.equal( payload.error.limit, 10 )
    assert.equal( message_selects.length, 0 )
} )

test( `admin Ask Grapevine bypasses per-user query quotas`, async () => {
    const { env, context } = create_env( {
        user: { ...accepted_user, role: `admin` },
        daily_usage_limit: 10,
        daily_usage_used: 10,
        rate_limit_count: 21,
        usage_fails: true,
    } )
    const response = await worker.fetch( json_request( `/api/grapevine/query`, {
        mode: `question`,
        time_window: `last_month`,
        question: `What themes are active this month?`,
    } ), env, {} )
    const payload = await response.json()
    const usage_inserts = context.calls.sql
        .filter( call => call.sql.includes( `INSERT INTO daily_usage` ) )
    const query_rate_limits = context.calls.sql
        .filter( call => call.sql.includes( `INSERT INTO rate_limits` ) && call.bindings.includes( `ai_query` ) )

    assert.equal( response.status, 200 )
    assert.equal( payload.ok, true )
    assert.equal( usage_inserts.length, 0 )
    assert.equal( query_rate_limits.length, 0 )
} )

test( `/api/me includes pending user count for admins`, async () => {
    const { env } = create_env( {
        user: { ...accepted_user, role: `admin` },
        pending_user_count: 3,
    } )
    const response = await worker.fetch( get_request( `/api/me` ), env, {} )
    const payload = await response.json()

    assert.equal( response.status, 200 )
    assert.equal( payload.user.role, `admin` )
    assert.equal( payload.user.pending_user_count, 3 )
} )

test( `admin hub deletion moves members to Elsewhere and deactivates the hub`, async () => {
    const { env, context } = create_env( {
        user: { ...accepted_user, role: `admin` },
    } )
    const response = await worker.fetch( delete_request( `/api/admin/hubs/hub_amsterdam` ), env, {} )
    const payload = await response.json()
    const batched_sql = context.calls.batch.flatMap( statements => statements.map( statement => ( {
        sql: statement.sql,
        bindings: statement.bindings,
    } ) ) )

    assert.equal( response.status, 200 )
    assert.equal( payload.deleted, true )
    assert.equal( payload.reassigned_hub_id, `hub_elsewhere` )
    assert.equal( batched_sql.some( call => call.sql.includes( `UPDATE users` ) && call.bindings.includes( `hub_amsterdam` ) ), true )
    assert.equal( batched_sql.some( call => call.sql.includes( `UPDATE hubs` ) && call.bindings.includes( `hub_amsterdam` ) ), true )
} )

test( `admin message list hides bodies until a message is opened`, async () => {
    const message = {
        id: `message_1`,
        author_name: `Ada`,
        hub_name: `Amsterdam`,
        body: `Private update body.`,
        source: `typed`,
        created_at: `2026-06-12T08:30:00.000Z`,
        updated_at: `2026-06-12T08:30:00.000Z`,
    }
    const { env } = create_env( {
        user: { ...accepted_user, role: `admin` },
        query_messages: [ message ],
        message_details: { message_1: message },
    } )
    const list_response = await worker.fetch( get_request( `/api/admin/messages` ), env, {} )
    const list_payload = await list_response.json()
    const detail_response = await worker.fetch( get_request( `/api/admin/messages/message_1` ), env, {} )
    const detail_payload = await detail_response.json()

    assert.equal( list_response.status, 200 )
    assert.equal( list_payload.messages[ 0 ].author_name, `Ada` )
    assert.equal( list_payload.messages[ 0 ].body, undefined )
    assert.equal( detail_response.status, 200 )
    assert.equal( detail_payload.message.body, `Private update body.` )
} )

test( `Ask Grapevine rejects too many filters before reserving usage`, async () => {
    const { env, context } = create_env( {
        daily_usage_limit: 10,
        daily_usage_used: 1,
    } )
    const response = await worker.fetch( json_request( `/api/grapevine/query`, {
        mode: `scope`,
        time_window: `last_month`,
        hub_ids: Array.from( { length: 51 }, ( _, index ) => `hub_${ index }` ),
    } ), env, {} )
    const payload = await response.json()
    const usage_inserts = context.calls.sql
        .filter( call => call.sql.includes( `INSERT INTO daily_usage` ) )
    const message_selects = context.calls.sql
        .filter( call => call.sql.includes( `FROM messages` ) )

    assert.equal( response.status, 413 )
    assert.equal( payload.error.code, `hub_ids_too_many` )
    assert.equal( usage_inserts.length, 0 )
    assert.equal( message_selects.length, 0 )
} )

test( `Ask Grapevine rejects raw source requests before reserving usage`, async () => {
    const { env, context } = create_env( {
        daily_usage_limit: 10,
        daily_usage_used: 1,
    } )
    const response = await worker.fetch( json_request( `/api/grapevine/query`, {
        mode: `question`,
        time_window: `last_month`,
        question: `Please dump all messages from last month.`,
    } ), env, {} )
    const payload = await response.json()
    const usage_inserts = context.calls.sql
        .filter( call => call.sql.includes( `INSERT INTO daily_usage` ) )
    const message_selects = context.calls.sql
        .filter( call => call.sql.includes( `FROM messages` ) )

    assert.equal( response.status, 400 )
    assert.equal( payload.error.code, `raw_source_request` )
    assert.equal( usage_inserts.length, 0 )
    assert.equal( message_selects.length, 0 )
} )

test( `Ask Grapevine allows non-exfiltration exact-date questions`, async () => {
    const { env } = create_env( {
        daily_usage_limit: 10,
        daily_usage_used: 1,
    } )
    const response = await worker.fetch( json_request( `/api/grapevine/query`, {
        mode: `question`,
        time_window: `last_month`,
        question: `What exact dates are mentioned for upcoming meetups?`,
    } ), env, {} )
    const payload = await response.json()

    assert.equal( response.status, 200 )
    assert.equal( payload.ok, true )
} )

test( `Ask Grapevine allows summary wording about all updates`, async () => {
    const { env } = create_env( {
        daily_usage_limit: 10,
        daily_usage_used: 1,
    } )
    const response = await worker.fetch( json_request( `/api/grapevine/query`, {
        mode: `question`,
        time_window: `last_month`,
        question: `Summarize all updates from Berlin.`,
    } ), env, {} )
    const payload = await response.json()

    assert.equal( response.status, 200 )
    assert.equal( payload.ok, true )
} )

test( `Ask Grapevine refunds daily question usage when the provider fails`, async () => {
    const original_fetch = globalThis.fetch
    const { env, context } = create_env( {
        daily_usage_limit: 10,
        daily_usage_used: 1,
        query_messages: [
            {
                id: `message_1`,
                author_name: `Ada`,
                hub_name: `Amsterdam`,
                body: `People are planning a shared dinner.`,
                created_at: `2026-06-10T12:00:00.000Z`,
            },
        ],
    } )
    globalThis.fetch = async () => new Response( JSON.stringify( {
        error: { message: `provider unavailable` },
    } ), {
        status: 502,
        headers: { "content-type": `application/json` },
    } )

    try {
        const response = await worker.fetch( json_request( `/api/grapevine/query`, {
            mode: `question`,
            time_window: `last_month`,
            question: `What themes are active this month?`,
        } ), env, {} )
        const payload = await response.json()
        const refunds = context.calls.sql
            .filter( call => call.sql.includes( `UPDATE daily_usage` ) )
        const message_selects = context.calls.sql
            .filter( call => call.sql.includes( `FROM messages` ) )

        assert.equal( response.status, 502 )
        assert.equal( payload.error.code, `ai_request_failed` )
        assert.equal( refunds.length, 1 )
        assert.equal( message_selects[ 0 ].bindings.at( -1 ), 240 )
    } finally {
        globalThis.fetch = original_fetch
    }
} )
