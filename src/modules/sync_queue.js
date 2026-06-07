import { log } from 'mentie'

import { api_delete, api_get, api_patch, api_post } from './api.js'
import { list_queue, remove_queue_item, update_queue_item } from './offline_store.js'

/**
 * Replays pending offline writes when the account is accepted.
 * @returns {Promise<Array>} Synced queue ids
 */
export async function replay_sync_queue() {

    const { user } = await api_get( `/api/me` )
    if( user?.status !== `accepted` ) {
        const error = new Error( `Account is not accepted` )
        error.code = user?.status === `blocked` ? `account_blocked` : `account_pending`
        throw error
    }

    const queue = await list_queue()
    const synced_items = await queue.reduce( async ( synced_items_promise, item ) => {
        const current_synced_items = await synced_items_promise

        try {
            await update_queue_item( { ...item, status: `syncing`, attempts: item.attempts + 1 } )

            if( item.action === `create_message` ) await api_post( `/api/messages`, item.body )
            if( item.action === `update_message` ) await api_patch( `/api/messages/${ item.message_id }`, item.body )
            if( item.action === `delete_message` ) await api_delete( `/api/messages/${ item.message_id }` )

            await remove_queue_item( item.id )
            return [ ...current_synced_items, item.id ]
        } catch ( error ) {
            log.warn( `Failed to replay queued write`, error )
            await update_queue_item( {
                ...item,
                status: error.code === `account_pending` || error.code === `account_blocked` ? `paused` : `error`,
                last_error: error.message,
                attempts: item.attempts + 1,
            } )
            return current_synced_items
        }
    }, Promise.resolve( [] ) )

    return synced_items
}
