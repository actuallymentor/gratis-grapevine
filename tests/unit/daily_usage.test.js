import assert from 'node:assert/strict'
import test from 'node:test'

import { daily_usage_window, resolve_daily_usage_limits, throw_daily_usage_limit_if_exhausted } from '../../worker/modules/daily_usage.js'

test( `daily usage limits default to product caps`, () => {
    assert.deepEqual( resolve_daily_usage_limits( {} ), {
        recording_minutes: 60,
        recording_seconds: 3_600,
        messages: 5,
        grapevine_questions: 10,
    } )
} )

test( `daily usage limits accept positive integer env overrides`, () => {
    assert.deepEqual( resolve_daily_usage_limits( {
        GRAPEVINE_DAILY_RECORDING_MINUTES: `90`,
        GRAPEVINE_DAILY_MESSAGE_LIMIT: `7`,
        GRAPEVINE_DAILY_QUESTION_LIMIT: `12`,
    } ), {
        recording_minutes: 90,
        recording_seconds: 5_400,
        messages: 7,
        grapevine_questions: 12,
    } )
} )

test( `daily usage window resets at midnight in configured timezone`, () => {
    const window = daily_usage_window( {
        GRAPEVINE_TIMEZONE: `Europe/Amsterdam`,
    }, new Date( `2026-06-10T21:30:00.000Z` ) )

    assert.equal( window.usage_date, `2026-06-10` )
    assert.equal( window.timezone, `Europe/Amsterdam` )
    assert.equal( window.reset_at, `2026-06-10T22:00:00.000Z` )
} )

test( `daily usage conversion preserves unrelated reservation errors`, async () => {
    const original_error = new Error( `database unavailable` )
    const env = {
        GRAPEVINE_DAILY_MESSAGE_LIMIT: `5`,
        DB: {
            prepare: () => ( {
                bind: () => ( {
                    first: async () => ( { used: 5, limit_value: 5 } ),
                } ),
            } ),
        },
    }

    await assert.rejects( () => throw_daily_usage_limit_if_exhausted( env, {
        user_id: `user_1`,
        scope: `messages`,
        amount: 1,
        limit: 5,
        now: new Date( `2026-06-10T12:00:00.000Z` ),
    }, original_error ), error => error === original_error )
} )
