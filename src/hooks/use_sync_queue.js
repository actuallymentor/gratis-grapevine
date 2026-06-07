import { useEffect, useState } from 'react'
import { log } from 'mentie'
import toast from 'react-hot-toast'

import { replay_sync_queue } from '../modules/sync_queue.js'
import { list_queue } from '../modules/offline_store.js'

/**
 * Replays queued writes when the browser comes online.
 * @returns {Object} Queue state
 */
export function use_sync_queue() {

    const [ queue, set_queue ] = useState( [] )
    const [ is_syncing, set_is_syncing ] = useState( false )

    const refresh_queue = () => list_queue().then( set_queue )

    useEffect( () => {
        refresh_queue()

        const sync = async () => {
            if( !navigator.onLine ) return

            set_is_syncing( true )
            try {
                const synced = await replay_sync_queue()
                if( synced.length ) toast.success( `Synced ${ synced.length } queued update${ synced.length === 1 ? `` : `s` }.` )
            } catch ( error ) {
                log.warn( `Sync queue paused`, error )
            } finally {
                set_is_syncing( false )
                refresh_queue()
            }
        }

        window.addEventListener( `online`, sync )
        sync()

        return () => window.removeEventListener( `online`, sync )
    }, [] )

    return { queue, is_syncing, refresh_queue }
}
