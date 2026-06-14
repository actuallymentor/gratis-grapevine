import assert from 'node:assert/strict'
import test from 'node:test'

import { merge_bulletin_cache, merge_bulletin_updates } from '../../src/modules/community_updates.js'

const bulletin = ( id, generated_at = `2026-06-${ `${ id }`.padStart( 2, `0` ) }T09:00:00.000Z`, summary_markdown = `Bulletin ${ id }` ) => ( {
    id,
    generated_at,
    summary_markdown,
} )

test( `merges a fresh first bulletin page with older cached pages`, () => {
    const cached = {
        updates: [ bulletin( `1` ), bulletin( `2` ), bulletin( `3` ) ],
        pagination: { limit: 3, offset: 0, total_count: 5, has_more: true },
    }

    const page = {
        updates: [ bulletin( `0` ), bulletin( `1` ) ],
        pagination: { limit: 2, offset: 0, total_count: 5, has_more: true },
    }

    const merged = merge_bulletin_cache( cached, page, 0 )

    assert.deepEqual( merged.updates.map( update => update.id ), [ `0`, `1`, `2`, `3` ] )
    assert.deepEqual( merged.pagination, {
        limit: 2,
        offset: 0,
        total_count: 5,
        has_more: true,
    } )
} )

test( `appends older bulletin pages to the local cache`, () => {
    const cached = {
        updates: [ bulletin( `1` ), bulletin( `2` ) ],
        pagination: { limit: 2, offset: 0, total_count: 4, has_more: true },
    }

    const page = {
        updates: [ bulletin( `3` ), bulletin( `4` ) ],
        pagination: { limit: 2, offset: 2, total_count: 4, has_more: false },
    }

    const merged = merge_bulletin_cache( cached, page, 2 )

    assert.deepEqual( merged.updates.map( update => update.id ), [ `1`, `2`, `3`, `4` ] )
    assert.deepEqual( merged.pagination, {
        limit: 2,
        offset: 0,
        total_count: 4,
        has_more: false,
    } )
} )

test( `replaces cached history when a fresh first page no longer overlaps`, () => {
    const cached = {
        updates: [ bulletin( `20` ), bulletin( `21` ) ],
        pagination: { limit: 2, offset: 0, total_count: 30, has_more: true },
    }

    const page = {
        updates: [ bulletin( `1` ), bulletin( `2` ) ],
        pagination: { limit: 2, offset: 0, total_count: 30, has_more: true },
    }

    const merged = merge_bulletin_cache( cached, page, 0 )

    assert.deepEqual( merged.updates.map( update => update.id ), [ `1`, `2` ] )
    assert.deepEqual( merged.pagination, {
        limit: 2,
        offset: 0,
        total_count: 30,
        has_more: true,
    } )
} )

test( `uses fresh older page data when refreshing cached rows`, () => {
    const cached = {
        updates: [ bulletin( `1` ), bulletin( `2`, undefined, `Stale copy` ) ],
        pagination: { limit: 2, offset: 0, total_count: 2, has_more: false },
    }

    const page = {
        updates: [ bulletin( `2`, undefined, `Fresh copy` ) ],
        pagination: { limit: 1, offset: 1, total_count: 2, has_more: false },
    }

    const merged = merge_bulletin_cache( cached, page, 1 )

    assert.deepEqual( merged.updates.map( update => update.id ), [ `1`, `2` ] )
    assert.equal( merged.updates[ 1 ].summary_markdown, `Fresh copy` )
} )

test( `deduplicates displayed bulletin page appends`, () => {
    const merged = merge_bulletin_updates(
        [ bulletin( `1` ), bulletin( `2` ) ],
        [ bulletin( `2` ), bulletin( `3` ) ],
    )

    assert.deepEqual( merged.map( update => update.id ), [ `1`, `2`, `3` ] )
} )
