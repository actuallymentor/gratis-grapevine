import { log } from 'mentie'

import { api_get } from './api.js'
import { get_cached_value, set_cached_value } from './offline_store.js'

export const community_update_seen_event = `grapevine:community-update-seen`

const latest_update_cache_key = `latest-update`
const bulletins_cache_key = `community-bulletins`
const seen_update_cache_key = `latest-update-seen-id`

const update_id = update => update?.id || update?.generated_at || null

const update_ids = updates => new Set( updates.map( update_id ).filter( Boolean ) )

const updates_overlap = ( left_updates, right_updates ) => {

    const left_ids = update_ids( left_updates )
    return right_updates.some( update => left_ids.has( update_id( update ) ) )
}

const prefer_fresh_updates = ( updates, fresh_updates ) => {

    const fresh_by_id = new Map( fresh_updates.map( update => [ update_id( update ), update ] ).filter( ( [ id ] ) => id ) )

    return updates.map( update => fresh_by_id.get( update_id( update ) ) || update )
}

const unique_updates = updates => {

    const seen = new Set()

    return updates.filter( update => {
        const id = update_id( update )
        if( !id ) return true
        if( seen.has( id ) ) return false

        seen.add( id )
        return true
    } )
}

/**
 * Appends freshly loaded bulletins without repeating already displayed rows.
 * @param {Array} current_updates - Updates already rendered
 * @param {Array} next_updates - Updates from the next page
 * @returns {Array} Combined unique update list
 */
export const merge_bulletin_updates = ( current_updates, next_updates ) => {

    const current = Array.isArray( current_updates ) ? current_updates : []
    const next = Array.isArray( next_updates ) ? next_updates : []

    return unique_updates( [ ...current, ...next ] )
}

const loaded_cache_payload = ( payload, limit ) => {

    const updates = Array.isArray( payload?.updates ) ? payload.updates : []

    return {
        ...payload,
        updates,
        pagination: {
            limit: payload?.pagination?.limit || limit,
            offset: 0,
            total_count: updates.length,
            has_more: false,
        },
    }
}

/**
 * Merges a freshly loaded bulletin page into the locally cached history.
 * @param {Object|null} cached_payload - Existing cached bulletin payload
 * @param {Object} page_payload - Fresh API payload
 * @param {Number} offset - Fresh page offset
 * @returns {Object} Cache payload containing all pages loaded locally
 */
export function merge_bulletin_cache( cached_payload, page_payload, offset = 0 ) {

    const cached_updates = Array.isArray( cached_payload?.updates ) ? cached_payload.updates : []
    const page_updates = Array.isArray( page_payload?.updates ) ? page_payload.updates : []
    const cached_history_has_gap = cached_updates.length > 0 && !updates_overlap( page_updates, cached_updates )
    const should_reset_first_page = offset === 0 && ( page_updates.length === 0 || cached_history_has_gap )
    const refreshed_cached_updates = prefer_fresh_updates( cached_updates, page_updates )
    const updates = should_reset_first_page
        ? page_updates
        : unique_updates( offset === 0 ? [ ...page_updates, ...refreshed_cached_updates ] : [ ...refreshed_cached_updates, ...page_updates ] )
    const page_pagination = page_payload?.pagination || {}
    const cached_pagination = cached_payload?.pagination || {}
    const total_count = Number( page_pagination.total_count ?? cached_pagination.total_count ?? updates.length )
    const loaded_total = Math.max( total_count, updates.length )

    return {
        ...cached_payload,
        ...page_payload,
        updates,
        pagination: {
            limit: Number( page_pagination.limit ?? cached_pagination.limit ?? updates.length ),
            offset: 0,
            total_count: loaded_total,
            has_more: updates.length < loaded_total,
        },
    }
}

const announce_seen_update = () => {

    if( typeof window !== `undefined` ) window.dispatchEvent( new Event( community_update_seen_event ) )
}

/**
 * Loads the latest community update from the API, falling back to the local cache.
 * @returns {Promise<Object|null>} Latest community update
 */
export async function load_latest_community_update() {

    try {
        const payload = await api_get( `/api/grapevine/latest` )
        await set_cached_value( latest_update_cache_key, payload.update ).catch( error => {
            log.warn( `Failed to cache latest community update`, error )
        } )
        return payload.update
    } catch {
        try {
            const cached = await get_cached_value( latest_update_cache_key )
            return cached?.value || null
        } catch ( error ) {
            log.warn( `Failed to read cached community update`, error )
            return null
        }
    }
}

/**
 * Loads community bulletins newest-first.
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Bulletin payload
 */
export async function load_community_bulletins( options = {} ) {

    const { limit = 10, offset = 0 } = options
    const params = new URLSearchParams( {
        limit: `${ limit }`,
        offset: `${ offset }`,
    } )

    try {
        const payload = await api_get( `/api/grapevine/bulletins?${ params.toString() }` )
        const cached = await get_cached_value( bulletins_cache_key )
        const merged_payload = merge_bulletin_cache( cached?.value || null, payload, offset )

        await set_cached_value( bulletins_cache_key, merged_payload ).catch( cache_error => {
            log.warn( `Failed to cache community bulletins`, cache_error )
        } )

        const response_payload = offset === 0 ? merged_payload : payload

        return { ...response_payload, data_source: `network` }
    } catch ( error ) {
        if( offset > 0 ) throw error

        try {
            const cached = await get_cached_value( bulletins_cache_key )
            if( cached?.value ) return { ...loaded_cache_payload( cached.value, limit ), data_source: `cache` }

            const cached_latest = await get_cached_value( latest_update_cache_key )
            if( cached_latest?.value ) {
                return {
                    updates: [ cached_latest.value ],
                    pagination: { limit, offset, total_count: 1, has_more: false },
                    data_source: `cache`,
                }
            }
        } catch ( cache_error ) {
            log.warn( `Failed to read cached community bulletins`, cache_error )
        }

        return { updates: [], pagination: { limit, offset, total_count: 0, has_more: false }, data_source: `unavailable` }
    }
}

/**
 * Checks whether a community update has not been marked as seen locally.
 * @param {Object|null} update - Community update
 * @returns {Promise<Boolean>} Whether the update is unseen
 */
export async function is_unseen_community_update( update ) {

    const id = update_id( update )
    if( !id ) return false

    try {
        const seen = await get_cached_value( seen_update_cache_key )
        return seen?.value !== id
    } catch ( error ) {
        log.warn( `Failed to read seen community update marker`, error )
        return false
    }
}

/**
 * Marks a community update as seen for this local member session.
 * @param {Object|null} update - Community update
 * @returns {Promise<void>} Completion promise
 */
export async function mark_community_update_seen( update ) {

    const id = update_id( update )
    if( !id ) return

    try {
        await set_cached_value( seen_update_cache_key, id )
        announce_seen_update()
    } catch ( error ) {
        log.warn( `Failed to mark community update as seen`, error )
    }
}
