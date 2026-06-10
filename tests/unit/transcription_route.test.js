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

const create_env = ( options = {} ) => {
    const {
        user = accepted_user,
        rate_limit_count = 1,
        daily_usage_used = 4,
        daily_usage_fails = false,
        ai_run = async () => ( { text: `Cloud route transcript.` } ),
        max_audio_bytes = `10000000`,
    } = options
    const calls = {
        ai: [],
        sql: [],
    }

    return {
        calls,
        env: {
            SESSION_SECRET: `test-session-secret`,
            GRAPEVINE_DAILY_RECORDING_MINUTES: `60`,
            WORKERS_AI_TRANSCRIPTION_MODEL: `@cf/test/transcriber`,
            WORKERS_AI_TRANSCRIPTION_MAX_AUDIO_BYTES: max_audio_bytes,
            AI: {
                run: async ( model, input ) => {
                    calls.ai.push( { model, input } )
                    return ai_run( model, input )
                },
            },
            DB: {
                prepare: sql => ( {
                    bind: ( ...bindings ) => ( {
                        run: async () => {
                            calls.sql.push( { action: `run`, sql, bindings } )
                            if( sql.includes( `INSERT INTO daily_usage` ) && daily_usage_fails ) throw new Error( `CHECK constraint failed: used <= limit_value` )
                            return { meta: { changes: 1 } }
                        },
                        first: async () => {
                            calls.sql.push( { action: `first`, sql, bindings } )

                            if( sql.includes( `FROM sessions` ) ) {
                                return user ? { session_id: `session_1`, expires_at: `2999-01-01T00:00:00.000Z`, ...user } : null
                            }

                            if( sql.includes( `FROM rate_limits` ) ) {
                                return { count: rate_limit_count, reset_at: `2999-01-01T00:00:00.000Z` }
                            }

                            if( sql.includes( `FROM daily_usage` ) ) {
                                return { used: daily_usage_used, limit_value: 3_600 }
                            }

                            return null
                        },
                        all: async () => {
                            calls.sql.push( { action: `all`, sql, bindings } )
                            return { results: [] }
                        },
                    } ),
                } ),
            },
        },
    }
}

const transcription_request = ( options = {} ) => {
    const {
        cookie = `sg_session=test-token`,
        blob = new Blob( [ `audio bytes` ], { type: `audio/webm` } ),
        field = `audio`,
        headers = {},
        include_duration = true,
    } = options
    const form_data = new FormData()
    if( field ) form_data.append( field, blob, `recording.webm` )
    if( include_duration ) form_data.append( `duration_seconds`, `${ options.duration_seconds || 4 }` )

    return new Request( `https://example.test/api/transcriptions`, {
        method: `POST`,
        headers: {
            ... cookie ? { cookie } : {} ,
            ...headers,
        },
        body: form_data,
    } )
}

test( `accepted members can transcribe audio through the Worker`, async () => {
    const { env, calls } = create_env()
    const response = await worker.fetch( transcription_request(), env, {} )
    const payload = await response.json()

    assert.equal( response.status, 200 )
    assert.equal( payload.ok, true )
    assert.equal( payload.transcript.text, `Cloud route transcript.` )
    assert.equal( payload.transcript.model, `@cf/test/transcriber` )
    assert.equal( calls.ai.length, 1 )
    assert.equal( calls.ai[ 0 ].model, `@cf/test/transcriber` )
    assert.equal( calls.ai[ 0 ].input.task, `transcribe` )
} )

test( `transcription accepts stale clients without recording duration`, async () => {
    const { env, calls } = create_env()
    const response = await worker.fetch( transcription_request( { include_duration: false } ), env, {} )
    const payload = await response.json()

    assert.equal( response.status, 200 )
    assert.equal( payload.ok, true )
    assert.equal( calls.ai.length, 1 )
} )

test( `transcription requires an accepted member session`, async () => {
    const anonymous = create_env()
    const anonymous_response = await worker.fetch( transcription_request( { cookie: `` } ), anonymous.env, {} )

    assert.equal( anonymous_response.status, 401 )
    assert.equal( anonymous.calls.ai.length, 0 )

    const pending = create_env( { user: { ...accepted_user, status: `pending` } } )
    const pending_response = await worker.fetch( transcription_request(), pending.env, {} )

    assert.equal( pending_response.status, 403 )
    assert.equal( pending.calls.ai.length, 0 )
} )

test( `transcription rejects invalid audio before calling Workers AI`, async () => {
    const unsupported = create_env()
    const unsupported_response = await worker.fetch(
        transcription_request( { blob: new Blob( [ `nope` ], { type: `text/plain` } ) } ),
        unsupported.env,
        {},
    )

    assert.equal( unsupported_response.status, 415 )
    assert.equal( unsupported.calls.ai.length, 0 )

    const oversized = create_env( { max_audio_bytes: `1` } )
    const oversized_response = await worker.fetch( transcription_request(), oversized.env, {} )

    assert.equal( oversized_response.status, 413 )
    assert.equal( oversized.calls.ai.length, 0 )
} )

test( `transcription rejects oversized content length before parsing form data`, async () => {
    const { env, calls } = create_env()
    const response = await worker.fetch( transcription_request( {
        headers: {
            "content-length": `12000000`,
        },
    } ), env, {} )

    assert.equal( response.status, 413 )
    assert.equal( calls.ai.length, 0 )
} )

test( `transcription rejects oversized content length before session lookup`, async () => {
    const { env, calls } = create_env()
    const response = await worker.fetch( transcription_request( {
        cookie: ``,
        headers: {
            "content-length": `12000000`,
        },
    } ), env, {} )

    assert.equal( response.status, 413 )
    assert.equal( calls.sql.length, 0 )
    assert.equal( calls.ai.length, 0 )
} )

test( `transcription rate limits before calling Workers AI`, async () => {
    const { env, calls } = create_env( { rate_limit_count: 31 } )
    const response = await worker.fetch( transcription_request(), env, {} )
    const payload = await response.json()

    assert.equal( response.status, 429 )
    assert.equal( payload.error.code, `rate_limited` )
    assert.equal( calls.ai.length, 0 )
} )

test( `transcription daily recording limit runs before calling Workers AI`, async () => {
    const { env, calls } = create_env( {
        daily_usage_used: 3_600,
        daily_usage_fails: true,
    } )
    const response = await worker.fetch( transcription_request( { duration_seconds: 1 } ), env, {} )
    const payload = await response.json()

    assert.equal( response.status, 429 )
    assert.equal( payload.error.code, `daily_recording_limit_reached` )
    assert.equal( payload.error.limit, 3_600 )
    assert.equal( calls.ai.length, 0 )
} )

test( `transcription usage uses a size floor when reported duration is too small`, async () => {
    const { env, calls } = create_env()
    const response = await worker.fetch( transcription_request( {
        blob: new Blob( [ new Uint8Array( 2_000_000 ) ], { type: `audio/webm` } ),
        duration_seconds: 1,
    } ), env, {} )
    const payload = await response.json()
    const reservation = calls.sql.find( call => call.sql.includes( `INSERT INTO daily_usage` ) )

    assert.equal( response.status, 200 )
    assert.equal( payload.ok, true )
    assert.equal( reservation.bindings[ 4 ], 120 )
    assert.equal( calls.ai.length, 1 )
} )

test( `transcription maps Workers AI failures to stable API errors`, async () => {
    const { env, calls } = create_env( {
        ai_run: async () => {
            throw new Error( `provider unavailable` )
        },
    } )
    const response = await worker.fetch( transcription_request(), env, {} )
    const payload = await response.json()

    assert.equal( response.status, 502 )
    assert.equal( payload.error.code, `transcription_failed` )
    assert.equal( calls.ai.length, 1 )
    assert.equal( calls.sql.filter( call => call.sql.includes( `UPDATE daily_usage` ) ).length, 1 )
} )
