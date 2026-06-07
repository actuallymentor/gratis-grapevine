import { create } from 'zustand'

/**
 * PWA install/update state.
 */
export const use_pwa_store = create( set => ( {
    install_prompt: null,
    is_installed: window.matchMedia?.( `(display-mode: standalone)` ).matches || navigator.standalone === true,
    update_ready: false,
    refresh_handler: null,
    set_install_prompt( install_prompt ) {
        set( { install_prompt } )
    },
    set_installed( is_installed ) {
        set( { is_installed } )
    },
    set_update_ready( update_ready ) {
        set( { update_ready } )
    },
    set_refresh_handler( refresh_handler ) {
        set( { refresh_handler } )
    },
} ) )
