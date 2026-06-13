import { log } from 'mentie'

import { api_get } from './api.js'
import { get_cached_value, set_cached_value } from './offline_store.js'

export const community_update_seen_event = `grapevine:community-update-seen`

const latest_update_cache_key = `latest-update`
const seen_update_cache_key = `latest-update-seen-id`

const update_id = update => update?.id || update?.generated_at || null

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
