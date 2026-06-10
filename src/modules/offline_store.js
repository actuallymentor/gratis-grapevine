import { log } from 'mentie'

const database_name = `sandbox-grapevine`
const database_version = 1
const sensitive_cache_prefixes = [ `grapevine-` ]

const announce_queue_changed = () => {

    if( typeof window !== `undefined` ) window.dispatchEvent( new Event( `grapevine:queue-changed` ) )
}

/**
 * Opens the app IndexedDB database.
 * @returns {Promise<IDBDatabase>} Database
 */
export function open_grapevine_db() {

    return new Promise( ( resolve, reject ) => {
        const request = indexedDB.open( database_name, database_version )

        request.onupgradeneeded = () => {
            const db = request.result
            if( !db.objectStoreNames.contains( `cache` ) ) db.createObjectStore( `cache`, { keyPath: `key` } )
            if( !db.objectStoreNames.contains( `drafts` ) ) db.createObjectStore( `drafts`, { keyPath: `key` } )
            if( !db.objectStoreNames.contains( `queue` ) ) db.createObjectStore( `queue`, { keyPath: `id` } )
        }

        request.onsuccess = () => resolve( request.result )
        request.onerror = () => reject( request.error )
    } )
}

const with_store = async ( store_name, mode, callback ) => {
    const db = await open_grapevine_db()

    return new Promise( ( resolve, reject ) => {
        const transaction = db.transaction( store_name, mode )
        const store = transaction.objectStore( store_name )
        const request = callback( store )

        request.onsuccess = () => resolve( request.result )
        request.onerror = () => reject( request.error )
        transaction.oncomplete = () => db.close()
        transaction.onerror = () => {
            db.close()
            reject( transaction.error )
        }
    } )
}

/**
 * Stores cached API data.
 * @param {String} key - Cache key
 * @param {Object} value - Cache value
 * @returns {Promise<void>} Completion promise
 */
export async function set_cached_value( key, value ) {

    await with_store( `cache`, `readwrite`, store => store.put( {
        key,
        value,
        cached_at: new Date().toISOString(),
    } ) )
}

/**
 * Reads cached API data.
 * @param {String} key - Cache key
 * @returns {Promise<Object|null>} Cache row
 */
export async function get_cached_value( key ) {

    return with_store( `cache`, `readonly`, store => store.get( key ) ).catch( error => {
        log.warn( `Failed to read offline cache`, error )
        return null
    } )
}

/**
 * Stores a local draft.
 * @param {String} key - Draft key
 * @param {Object} value - Draft value
 * @returns {Promise<void>} Completion promise
 */
export async function set_draft( key, value ) {

    await with_store( `drafts`, `readwrite`, store => store.put( {
        key,
        value,
        updated_at: new Date().toISOString(),
    } ) )
}

/**
 * Reads a local draft.
 * @param {String} key - Draft key
 * @returns {Promise<Object|null>} Draft row
 */
export async function get_draft( key ) {

    return with_store( `drafts`, `readonly`, store => store.get( key ) ).catch( () => null )
}

/**
 * Deletes a local draft.
 * @param {String} key - Draft key
 * @returns {Promise<void>} Completion promise
 */
export async function delete_draft( key ) {

    await with_store( `drafts`, `readwrite`, store => store.delete( key ) )
}

/**
 * Adds a member write to the sync queue.
 * @param {Object} item - Queue item
 * @returns {Promise<Object>} Stored queue item
 */
export async function enqueue_write( item ) {

    const queued_item = {
        id: item.id || crypto.randomUUID(),
        status: `pending`,
        attempts: 0,
        created_at: new Date().toISOString(),
        ...item,
    }

    await with_store( `queue`, `readwrite`, store => store.put( queued_item ) )
    announce_queue_changed()
    return queued_item
}

/**
 * Lists queued writes.
 * @returns {Promise<Array>} Queue items
 */
export async function list_queue() {

    return with_store( `queue`, `readonly`, store => store.getAll() ).catch( () => [] )
}

/**
 * Updates a queued write.
 * @param {Object} item - Queue item
 * @returns {Promise<void>} Completion promise
 */
export async function update_queue_item( item ) {

    await with_store( `queue`, `readwrite`, store => store.put( item ) )
    announce_queue_changed()
}

/**
 * Removes a queued write.
 * @param {String} id - Queue id
 * @returns {Promise<void>} Completion promise
 */
export async function remove_queue_item( id ) {

    await with_store( `queue`, `readwrite`, store => store.delete( id ) )
    announce_queue_changed()
}

/**
 * Clears locally persisted member, update, draft, and queue data.
 * @param {Object} options - Clear options
 * @param {Boolean} options.include_queue - Whether to delete queued writes too
 * @returns {Promise<void>} Completion promise
 */
export async function clear_local_grapevine_data( options = {} ) {

    const { include_queue = true } = options

    await Promise.all( [
        include_queue ? delete_grapevine_database() : clear_member_data_stores(),
        clear_sensitive_caches(),
    ] )
    announce_queue_changed()
}

function delete_grapevine_database() {

    return new Promise( ( resolve, reject ) => {
        if( typeof indexedDB === `undefined` ) {
            resolve()
            return
        }

        const request = indexedDB.deleteDatabase( database_name )

        request.onsuccess = () => resolve()
        request.onerror = () => reject( request.error )
        request.onblocked = () => resolve()
    } )
}

async function clear_member_data_stores() {

    if( typeof indexedDB === `undefined` ) return

    const db = await open_grapevine_db()

    await new Promise( ( resolve, reject ) => {
        const transaction = db.transaction( [ `cache`, `drafts` ], `readwrite` )

        transaction.objectStore( `cache` ).clear()
        transaction.objectStore( `drafts` ).clear()
        transaction.oncomplete = () => {
            db.close()
            resolve()
        }
        transaction.onerror = () => {
            db.close()
            reject( transaction.error )
        }
    } )
}

async function clear_sensitive_caches() {

    if( typeof caches === `undefined` ) return

    const cache_names = await caches.keys()
    await Promise.all(
        cache_names
            .filter( cache_name => sensitive_cache_prefixes.some( prefix => cache_name.startsWith( prefix ) ) )
            .map( cache_name => caches.delete( cache_name ) ),
    )
}
