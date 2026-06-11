import { create } from 'zustand'

/**
 * PWA install/update state.
 */
export const use_pwa_store = create( ( set, get ) => ( {
    install_prompt: null,
    is_install_prompt_dismissed: false,
    is_installed: window.matchMedia?.( `(display-mode: standalone)` ).matches || navigator.standalone === true,
    update_ready: false,
    refresh_handler: null,
    set_install_prompt( install_prompt ) {
        set( { install_prompt, is_install_prompt_dismissed: false } )
    },
    async install_app() {
        const { install_prompt } = get()
        if( !install_prompt ) return

        try {
            await install_prompt.prompt()
        } finally {
            set( { install_prompt: null, is_install_prompt_dismissed: false } )
        }
    },
    set_installed( is_installed ) {
        set( { is_installed, is_install_prompt_dismissed: false } )
    },
    dismiss_install_prompt() {
        set( { is_install_prompt_dismissed: true } )
    },
    set_update_ready( update_ready ) {
        set( { update_ready } )
    },
    set_refresh_handler( refresh_handler ) {
        set( { refresh_handler } )
    },
} ) )
