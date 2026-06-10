import { create } from 'zustand'
import toast from 'react-hot-toast'
import { log } from 'mentie'

import { api_error_message, api_get, api_post } from '../modules/api.js'
import { clear_local_grapevine_data } from '../modules/offline_store.js'

const session_owner_key = `grapevine:last-user-id`

const local_storage = () => typeof localStorage === `undefined` ? null : localStorage

const session_owner_id = () => local_storage()?.getItem( session_owner_key ) || null

const remember_session_owner = user => {

    if( user?.id ) local_storage()?.setItem( session_owner_key, user.id )
    else local_storage()?.removeItem( session_owner_key )
}

const clear_session_data = ( options = {} ) => clear_local_grapevine_data( options ).catch( error => log.warn( `Failed to clear local session data`, error ) )

const clear_if_user_changed = async user => {

    const owner_id = session_owner_id()
    if( owner_id && user?.id && owner_id !== user.id ) await clear_session_data()
    remember_session_owner( user )
}

/**
 * Global session store.
 */
export const use_session_store = create( ( set, get ) => ( {
    user: null,
    is_loading: true,
    load_error: null,
    async load_me() {
        set( { is_loading: true, load_error: null } )

        try {
            const { user } = await api_get( `/api/me` )
            if( user ) await clear_if_user_changed( user )
            else await clear_session_data( { include_queue: false } )
            set( { user, is_loading: false } )
        } catch ( error ) {
            if( [ 401, 403 ].includes( error.status ) ) await clear_session_data( { include_queue: false } )
            set( { user: null, is_loading: false, load_error: error } )
        }
    },
    set_user( user ) {
        const current_user = get().user
        if( current_user?.id && current_user.id !== user?.id ) {
            void clear_session_data().then( () => remember_session_owner( user ) )
        } else {
            void clear_if_user_changed( user )
        }
        set( { user } )
    },
    async logout() {
        try {
            await api_post( `/api/auth/logout` )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        } finally {
            await clear_session_data()
            remember_session_owner( null )
            set( { user: null } )
        }
    },
} ) )
