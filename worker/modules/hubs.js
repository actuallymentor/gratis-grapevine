import city_timezones from 'city-timezones'

export const initial_hubs = [ `Amsterdam`, `London`, `Madrid`, `Berlin`, `Paris`, `Lisbon`, `Elsewhere` ]

/**
 * Slugifies names for hub identity and matching.
 * @param {String} value - Raw name
 * @returns {String} Stable slug
 */
export function slugify( value = `` ) {

    return `${ value }`
        .normalize( `NFD` )
        .replace( /[\u0300-\u036f]/g, `` )
        .toLowerCase()
        .replace( /['’]/g, `` )
        .replace( /[^a-z0-9]+/g, `-` )
        .replace( /^-|-$/g, `` )
}

/**
 * Normalizes city names while preserving readable casing.
 * @param {String} value - Raw city name
 * @returns {String} Normalized city name
 */
export function normalize_city_name( value = `` ) {

    const cleaned = `${ value }`
        .normalize( `NFC` )
        .replace( /[._/\\|]+/g, ` ` )
        .replace( /\s+/g, ` ` )
        .trim()

    return cleaned
        .split( ` ` )
        .map( part => part ? `${ part[ 0 ].toLocaleUpperCase() }${ part.slice( 1 ).toLocaleLowerCase() }` : part )
        .join( ` ` )
}

/**
 * Finds whether a requested hub corresponds to a maintained city dataset record.
 * @param {String} requested_name - Submitted hub name
 * @returns {Object|null} Validated city record
 */
export function validate_city_hub( requested_name ) {

    const normalized_name = normalize_city_name( requested_name )
    if( !normalized_name ) return null

    const slug = slugify( normalized_name )
    const matches = city_timezones.lookupViaCity( normalized_name )
    return matches.find( city => slugify( city.city_ascii || city.city ) === slug && city.iso2 && city.iso3 ) || null
}

/**
 * Creates or reuses an active hub by name.
 * @param {Object} db - D1 database
 * @param {String} name - Hub name
 * @returns {Promise<Object>} Hub row
 */
export async function ensure_hub( db, name ) {

    const normalized_name = normalize_city_name( name )
    const slug = slugify( normalized_name )
    const now = new Date().toISOString()
    const id = `hub_${ slug }`

    await db.prepare( `
        INSERT INTO hubs ( id, name, slug, is_active, created_at, updated_at )
        VALUES ( ?, ?, ?, 1, ?, ? )
        ON CONFLICT( slug ) DO UPDATE SET
            is_active = 1,
            updated_at = excluded.updated_at
    ` ).bind( id, normalized_name, slug, now, now ).run()

    return db.prepare( `SELECT * FROM hubs WHERE slug = ?` ).bind( slug ).first()
}

/**
 * Resolves signup hub fields into a hub id or requested hub name.
 * @param {Object} db - D1 database
 * @param {Object} input - Signup hub input
 * @returns {Promise<Object>} Hub assignment
 */
export async function resolve_signup_hub( db, input ) {

    const { hub_id, hub_name, requested_hub_name } = input

    if( hub_id ) {
        const hub = await db.prepare( `SELECT * FROM hubs WHERE id = ? AND is_active = 1` ).bind( hub_id ).first()
        if( hub ) return { hub_id: hub.id, requested_hub_name: null }
    }

    if( hub_name && hub_name !== `Request new hub` ) {
        const hub = await db.prepare( `SELECT * FROM hubs WHERE slug = ? AND is_active = 1` ).bind( slugify( hub_name ) ).first()
        if( hub ) return { hub_id: hub.id, requested_hub_name: null }
    }

    const requested_name = normalize_city_name( requested_hub_name || hub_name )
    if( requested_name ) {
        const city = validate_city_hub( requested_name )
        if( city ) {
            const hub = await ensure_hub( db, city.city_ascii || city.city )
            return { hub_id: hub.id, requested_hub_name: null }
        }

        return { hub_id: `hub_elsewhere`, requested_hub_name: requested_name }
    }

    return { hub_id: `hub_elsewhere`, requested_hub_name: null }
}
