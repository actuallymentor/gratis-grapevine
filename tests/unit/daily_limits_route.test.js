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
            return { session_id: `session_1`, expires_at: `2999-01-01T00:00:00.000Z`, ...accepted_user }
        }

        if( sql.includes( `FROM rate_limits` ) ) {
            return { count: 1, reset_at: `2999-01-01T00:00:00.000Z` }
        }

        if( sql.includes( `FROM daily_usage` ) ) {
            return { used: context.daily_usage_used, limit_value: context.daily_usage_limit }
        }

        return null
    },
    all: async () => {
        context.calls.sql.push( { action: `all`, sql, bindings } )

        if( sql.includes( `SELECT id, name FROM users WHERE status = 'accepted'` ) ) return { results: [] }
        if( sql.includes( `FROM messages` ) ) return { results: context.query_messages }
        return { results: [] }
    },
} )

const create_env = ( options = {} ) => {

    const context = {
        daily_usage_limit: options.daily_usage_limit || 5,
        daily_usage_used: options.daily_usage_used || 5,
        query_messages: options.query_messages || [],
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
