import { useEffect } from 'react'

import { use_pwa_store } from '../stores/pwa_store.js'

/**
 * Captures the browser PWA install prompt.
 * @returns {void}
 */
export function use_install_prompt() {

    const set_install_prompt = use_pwa_store( state => state.set_install_prompt )
    const set_installed = use_pwa_store( state => state.set_installed )

    useEffect( () => {
        const capture_prompt = event => {
            event.preventDefault()
            set_install_prompt( event )
        }

        const mark_installed = () => set_installed( true )

        window.addEventListener( `beforeinstallprompt`, capture_prompt )
        window.addEventListener( `appinstalled`, mark_installed )

        return () => {
            window.removeEventListener( `beforeinstallprompt`, capture_prompt )
            window.removeEventListener( `appinstalled`, mark_installed )
        }
    }, [ set_install_prompt, set_installed ] )
}
