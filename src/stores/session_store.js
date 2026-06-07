import { create } from 'zustand'
import toast from 'react-hot-toast'

import { api_error_message, api_get, api_post } from '../modules/api.js'

/**
 * Global session store.
 */
export const use_session_store = create( set => ( {
    user: null,
    is_loading: true,
    load_error: null,
    async load_me() {
        set( { is_loading: true, load_error: null } )

        try {
            const { user } = await api_get( `/api/me` )
            set( { user, is_loading: false } )
        } catch ( error ) {
            set( { user: null, is_loading: false, load_error: error } )
        }
    },
    set_user( user ) {
        set( { user } )
    },
    async logout() {
        try {
            await api_post( `/api/auth/logout` )
            set( { user: null } )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        }
    },
} ) )
