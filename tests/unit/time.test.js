import assert from 'node:assert/strict'
import test from 'node:test'

import { is_scheduled_summary_window, resolve_time_window, scheduled_summary_period, validate_manual_period } from '../../worker/modules/time.js'

const env = {
    GRAPEVINE_TIMEZONE: `Europe/Amsterdam`,
    GRAPEVINE_SUMMARY_LOCAL_HOUR: `9`,
    GRAPEVINE_SUMMARY_PERIOD_DAYS: `7`,
}

test( `detects the Amsterdam Monday summary hour`, () => {
    assert.equal( is_scheduled_summary_window( env, new Date( `2026-06-08T07:15:00.000Z` ) ), true )
    assert.equal( is_scheduled_summary_window( env, new Date( `2026-06-08T08:15:00.000Z` ) ), false )
} )

test( `builds the previous seven-day summary period`, () => {
    assert.deepEqual( scheduled_summary_period( env, new Date( `2026-06-08T07:15:00.000Z` ) ), {
        period_start: `2026-06-01`,
        period_end: `2026-06-07`,
    } )
} )

test( `validates manual summary periods`, () => {
    assert.deepEqual( validate_manual_period( `2026-06-01`, `2026-06-07` ), {
        period_start: `2026-06-01`,
        period_end: `2026-06-07`,
    } )
    assert.throws( () => validate_manual_period( `2026-06-08`, `2026-06-07` ), /invalid_period_order/ )
} )

test( `resolves supported query windows`, () => {
    const window = resolve_time_window( `last_week`, new Date( `2026-06-08T00:00:00.000Z` ) )

    assert.equal( window.days, 7 )
    assert.equal( window.since_iso, `2026-06-01T00:00:00.000Z` )
} )
