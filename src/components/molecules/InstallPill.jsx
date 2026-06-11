import styled from 'styled-components'
import { Download, X } from 'lucide-react'

import { use_install_prompt } from '../../hooks/use_install_prompt.js'
import { use_pwa_store } from '../../stores/pwa_store.js'
import { use_session_store } from '../../stores/session_store.js'

const InstallPrompt = styled.div`
    position: fixed;
    bottom: calc(6rem + var(--fixed-viewport-bottom));
    left: 1rem;
    z-index: 15;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;

    @media (min-width: 760px) {
        bottom: calc(1rem + var(--fixed-viewport-bottom));
    }
`

const Pill = styled.button`
    display: inline-flex;
    min-height: 48px;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--accent-dark);
    border-radius: 999px;
    color: var(--on-accent);
    background: var(--accent);
    font-weight: 800;
    box-shadow: var(--shadow);
`

const DismissButton = styled.button`
    display: inline-flex;
    width: 44px;
    min-width: 44px;
    height: 44px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink);
    background: var(--surface);
    box-shadow: var(--shadow);
`

/**
 * Renders the PWA install prompt pill.
 * @returns {JSX.Element|null} Install pill
 */
export function InstallPill() {

    use_install_prompt()

    const install_prompt = use_pwa_store( state => state.install_prompt )
    const is_install_prompt_dismissed = use_pwa_store( state => state.is_install_prompt_dismissed )
    const is_installed = use_pwa_store( state => state.is_installed )
    const install_app = use_pwa_store( state => state.install_app )
    const dismiss_install_prompt = use_pwa_store( state => state.dismiss_install_prompt )
    const user = use_session_store( state => state.user )
    const is_loading = use_session_store( state => state.is_loading )

    const dismiss_prompt = () => {
        dismiss_install_prompt()
        window.setTimeout( () => document.getElementById( `bottom-install-app` )?.focus( { preventScroll: true } ), 0 )
    }

    if( is_loading || !user || is_installed || !install_prompt || is_install_prompt_dismissed ) return null

    return <InstallPrompt role="group" aria-label="Install prompt">
        <Pill type="button" onClick={ install_app }>
            <Download size={ 18 } aria-hidden="true" />
            Install App
        </Pill>
        <DismissButton type="button" aria-label="Dismiss install prompt" title="Dismiss install prompt" onClick={ dismiss_prompt }>
            <X size={ 16 } aria-hidden="true" />
        </DismissButton>
    </InstallPrompt>
}
