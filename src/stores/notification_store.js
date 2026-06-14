import { create } from 'zustand'
import toast from 'react-hot-toast'

import {
    dismiss_notification_prompt,
    enable_push_notifications,
    load_notification_config,
    notification_browser_state,
    sync_existing_push_subscription,
} from '../modules/notifications.js'
import { api_error_message } from '../modules/api.js'

/**
 * Browser notification permission and subscription state.
 */
export const use_notification_store = create( ( set, get ) => ( {
    is_supported: false,
    is_configured: false,
    is_dismissed: false,
    permission: `default`,
    is_subscribed: false,
    is_loading: false,
    error: null,
    async initialize() {
        const browser_state = notification_browser_state()
        set( { ...browser_state, is_loading: true, error: null } )

        const config = await load_notification_config()
        set( current_state => ( {
            ...current_state,
            is_configured: Boolean( config.supported && config.public_key ),
            is_loading: false,
        } ) )

        if( browser_state.permission === `granted` ) await get().sync_existing_subscription()
    },
    async enable( options = {} ) {
        set( { is_loading: true, error: null } )

        try {
            const subscription = await enable_push_notifications( options )
            const browser_state = notification_browser_state()
            set( {
                ...browser_state,
                is_configured: true,
                is_subscribed: Boolean( subscription ),
                is_loading: false,
            } )
        } catch ( error ) {
            set( { ...notification_browser_state(), is_loading: false, error } )
            toast.error( api_error_message( error ) )
        }
    },
    async sync_existing_subscription() {
        try {
            const subscription = await sync_existing_push_subscription()
            set( {
                ...notification_browser_state(),
                is_subscribed: Boolean( subscription ),
            } )
        } catch {
            set( { ...notification_browser_state(), is_subscribed: false } )
        }
    },
    dismiss() {
        set( dismiss_notification_prompt() )
    },
} ) )

