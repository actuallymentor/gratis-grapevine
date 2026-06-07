const iso_date = date => date.toISOString().slice( 0, 10 )

/**
 * Adds days to a YYYY-MM-DD date string.
 * @param {String} date_string - Date string
 * @param {Number} days - Day delta
 * @returns {String} Date string
 */
export function add_days( date_string, days ) {

    const date = new Date( `${ date_string }T00:00:00.000Z` )
    date.setUTCDate( date.getUTCDate() + days )
    return iso_date( date )
}

/**
 * Returns localized date parts for a timezone.
 * @param {Date} date - Date object
 * @param {String} timezone - IANA timezone
 * @returns {Object} Date parts
 */
export function zoned_parts( date, timezone ) {

    const parts = new Intl.DateTimeFormat( `en-CA`, {
        timeZone: timezone,
        weekday: `short`,
        year: `numeric`,
        month: `2-digit`,
        day: `2-digit`,
        hour: `2-digit`,
        hourCycle: `h23`,
    } ).formatToParts( date )

    return Object.fromEntries( parts.filter( part => part.type !== `literal` ).map( part => [ part.type, part.value ] ) )
}

/**
 * Checks whether an hourly cron tick is inside the configured local summary window.
 * @param {Object} env - Worker environment
 * @param {Date} now - Current date
 * @returns {Boolean} True when the job should run
 */
export function is_scheduled_summary_window( env, now = new Date() ) {

    const timezone = env.GRAPEVINE_TIMEZONE || `Europe/Amsterdam`
    const local_hour = Number( env.GRAPEVINE_SUMMARY_LOCAL_HOUR || 9 )
    const parts = zoned_parts( now, timezone )
    return parts.weekday === `Mon` && Number( parts.hour ) === local_hour
}

/**
 * Computes the configured scheduled summary period as whole local dates.
 * @param {Object} env - Worker environment
 * @param {Date} now - Current date
 * @returns {Object} Period dates
 */
export function scheduled_summary_period( env, now = new Date() ) {

    const timezone = env.GRAPEVINE_TIMEZONE || `Europe/Amsterdam`
    const period_days = Number( env.GRAPEVINE_SUMMARY_PERIOD_DAYS || 7 )
    const { year, month, day } = zoned_parts( now, timezone )
    const today = `${ year }-${ month }-${ day }`
    const period_end = add_days( today, -1 )
    const period_start = add_days( period_end, -( period_days - 1 ) )

    return { period_start, period_end }
}

/**
 * Converts an app time-window selector into a since timestamp.
 * @param {String} time_window - Window key
 * @param {Date} now - Current date
 * @returns {Object} Window metadata
 */
export function resolve_time_window( time_window = `last_month`, now = new Date() ) {

    const days_by_window = {
        last_week: 7,
        last_month: 31,
        last_quarter: 92,
        last_year: 366,
    }
    const days = days_by_window[ time_window ]
    if( !days ) throw new Error( `invalid_time_window` )

    const since = new Date( now )
    since.setUTCDate( since.getUTCDate() - days )

    return {
        time_window,
        since_iso: since.toISOString(),
        until_iso: now.toISOString(),
        days,
    }
}

/**
 * Validates manual summary date inputs.
 * @param {String} period_start - Start date
 * @param {String} period_end - End date
 * @returns {Object} Period dates
 */
export function validate_manual_period( period_start, period_end ) {

    const date_pattern = /^\d{4}-\d{2}-\d{2}$/
    if( !date_pattern.test( period_start || `` ) || !date_pattern.test( period_end || `` ) ) throw new Error( `invalid_period` )
    if( period_start > period_end ) throw new Error( `invalid_period_order` )
    return { period_start, period_end }
}
