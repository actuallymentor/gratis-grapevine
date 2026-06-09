import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'

import { chunk_messages_by_hub_and_time, is_person_specific_question, sanitize_model_context, sanitize_text_for_ai, transcribe_audio_with_workers_ai } from '../../worker/modules/ai.js'
import { render_markdown } from '../../src/modules/markdown.js'

test( `strips contact details from AI-visible text`, () => {
    const sanitized = sanitize_text_for_ai( `Email ada@example.com or +31 6 12 34 56 78 or wa.me/31612345678` )

    assert.equal( sanitized.includes( `ada@example.com` ), false )
    assert.equal( sanitized.includes( `31612345678` ), false )
    assert.equal( sanitized.includes( `[contact removed]` ), true )
} )

test( `keeps hub and author context while sanitizing message bodies`, () => {
    const context = sanitize_model_context( [
        {
            author_name: `Ada Example`,
            hub_name: `Amsterdam`,
            body: `Planning dinner. Phone +31612345678.`,
            created_at: `2026-06-07T12:00:00.000Z`,
        },
    ] )

    assert.match( context, /Ada Example/ )
    assert.match( context, /Amsterdam/ )
    assert.equal( context.includes( `+31612345678` ), false )
} )

test( `detects named-person open questions`, () => {
    assert.equal( is_person_specific_question( `What is Ada Example doing?`, [ { name: `Ada Example` } ] ), true )
    assert.equal( is_person_specific_question( `What's Ada up to?`, [ { name: `Ada Example` } ] ), true )
    assert.equal( is_person_specific_question( `What are people talking about in Berlin?`, [ { name: `Ada Example` } ] ), false )
} )

test( `chunks messages by hub and time`, () => {
    const chunks = chunk_messages_by_hub_and_time( [
        { id: `3`, hub_name: `Berlin`, created_at: `2026-06-03T00:00:00.000Z` },
        { id: `1`, hub_name: `Amsterdam`, created_at: `2026-06-01T00:00:00.000Z` },
        { id: `2`, hub_name: `Amsterdam`, created_at: `2026-06-02T00:00:00.000Z` },
    ], 1 )

    assert.deepEqual( chunks.map( chunk => chunk.messages.map( message => message.id ) ), [ [ `1` ], [ `2` ], [ `3` ] ] )
} )

test( `transcribes audio with configured Workers AI model`, async () => {
    const audio_buffer = new Uint8Array( [ 1, 2, 3, 4 ] ).buffer
    let provider_request = null

    const transcript = await transcribe_audio_with_workers_ai( {
        WORKERS_AI_TRANSCRIPTION_MODEL: `@cf/test/transcriber`,
        WORKERS_AI_TRANSCRIPTION_LANGUAGE: `nl`,
        WORKERS_AI_TRANSCRIPTION_INITIAL_PROMPT: `Community voice update.`,
        AI: {
            run: async ( model, input ) => {
                provider_request = { model, input }
                return { text: ` Cloud transcript. `, word_count: 2, vtt: `WEBVTT` }
            },
        },
    }, audio_buffer )

    assert.equal( provider_request.model, `@cf/test/transcriber` )
    assert.equal( provider_request.input.audio, Buffer.from( audio_buffer ).toString( `base64` ) )
    assert.equal( provider_request.input.task, `transcribe` )
    assert.equal( provider_request.input.language, `nl` )
    assert.equal( provider_request.input.initial_prompt, `Community voice update.` )
    assert.equal( provider_request.input.vad_filter, true )
    assert.equal( provider_request.input.condition_on_previous_text, false )
    assert.deepEqual( transcript, {
        text: `Cloud transcript.`,
        model: `@cf/test/transcriber`,
        word_count: 2,
        vtt: `WEBVTT`,
    } )
} )

test( `rejects unusable Workers AI transcription results`, async () => {
    const env = {
        AI: {
            run: async () => ( { text: `   ` } ),
        },
    }

    await assert.rejects( () => transcribe_audio_with_workers_ai( env, new Uint8Array( [ 1 ] ).buffer ), /empty_transcription/ )
    await assert.rejects( () => transcribe_audio_with_workers_ai( {}, new Uint8Array( [ 1 ] ).buffer ), /missing_workers_ai_binding/ )
    await assert.rejects( () => transcribe_audio_with_workers_ai( env, new Uint8Array().buffer ), /empty_audio/ )
} )

test( `escapes raw HTML in generated markdown`, () => {
    const html = render_markdown( `<img src=x onerror=alert(1)> **safe**` )

    assert.equal( html.includes( `<img` ), false )
    assert.equal( html.includes( `&lt;img` ), true )
    assert.equal( html.includes( `<strong>safe</strong>` ), true )
} )
