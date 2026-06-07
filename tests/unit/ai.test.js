import assert from 'node:assert/strict'
import test from 'node:test'

import { chunk_messages_by_hub_and_time, is_person_specific_question, sanitize_model_context, sanitize_text_for_ai } from '../../worker/modules/ai.js'
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

test( `escapes raw HTML in generated markdown`, () => {
    const html = render_markdown( `<img src=x onerror=alert(1)> **safe**` )

    assert.equal( html.includes( `<img` ), false )
    assert.equal( html.includes( `&lt;img` ), true )
    assert.equal( html.includes( `<strong>safe</strong>` ), true )
} )
