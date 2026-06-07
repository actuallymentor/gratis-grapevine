import { useEffect, useState } from 'react'
import { log } from 'mentie'
import toast from 'react-hot-toast'

import { replay_sync_queue } from '../modules/sync_queue.js'
import { list_queue } from '../modules/offline_store.js'
import { use_session_store } from '../stores/session_store.js'

/**
 * Replays queued writes when the browser comes online.
 * @returns {Object} Queue state
 */
export function use_sync_queue() {

    const [ queue, set_queue ] = useState( [] )
    const [ is_syncing, set_is_syncing ] = useState( false )
    const set_user = use_session_store( state => state.set_user )

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
                if( error.user ) set_user( error.user )
            } finally {
                set_is_syncing( false )
                refresh_queue()
            }
        }

        window.addEventListener( `online`, sync )
        window.addEventListener( `grapevine:queue-changed`, refresh_queue )
        sync()

        return () => {
            window.removeEventListener( `online`, sync )
            window.removeEventListener( `grapevine:queue-changed`, refresh_queue )
        }
    }, [ set_user ] )

    return { queue, is_syncing, refresh_queue }
}
