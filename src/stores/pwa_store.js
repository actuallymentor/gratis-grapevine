import { create } from 'zustand'

/**
 * PWA install/update state.
 */
export const use_pwa_store = create( ( set, get ) => ( {
    install_prompt: null,
    is_install_prompt_dismissed: false,
    is_installed: window.matchMedia?.( `(display-mode: standalone)` ).matches || navigator.standalone === true,
    should_focus_install_action: false,
    update_ready: false,
    refresh_handler: null,
    set_install_prompt( install_prompt ) {
        set( current_state => ( {
            install_prompt,
            is_install_prompt_dismissed: install_prompt ? current_state.is_install_prompt_dismissed : false,
        } ) )
    },
    async install_app() {
        const { install_prompt } = get()
        if( !install_prompt ) return

        try {
            await install_prompt.prompt()
        } catch {
            // Browsers may reject a stale or already-consumed prompt; clear it either way.
        } finally {
            set( { install_prompt: null, is_install_prompt_dismissed: false, should_focus_install_action: false } )
        }
    },
    set_installed( is_installed ) {
        set( { is_installed, is_install_prompt_dismissed: false, should_focus_install_action: false } )
    },
    dismiss_install_prompt() {
        set( { is_install_prompt_dismissed: true, should_focus_install_action: true } )
    },
    clear_install_focus_request() {
        set( { should_focus_install_action: false } )
    },
    set_update_ready( update_ready ) {
        set( { update_ready } )
    },
    set_refresh_handler( refresh_handler ) {
        set( { refresh_handler } )
    },
} ) )
