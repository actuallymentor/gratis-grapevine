import styled from 'styled-components'
import { Download } from 'lucide-react'

import { use_install_prompt } from '../../hooks/use_install_prompt.js'
import { use_pwa_store } from '../../stores/pwa_store.js'

const Pill = styled.button`
    position: fixed;
    bottom: 6rem;
    left: 1rem;
    z-index: 15;
    display: inline-flex;
    min-height: 48px;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--accent-dark);
    border-radius: 999px;
    color: #102f36;
    background: var(--accent);
    font-weight: 800;
    box-shadow: var(--shadow);

    @media (min-width: 760px) {
        bottom: 1rem;
    }
`

/**
 * Renders the PWA install prompt pill.
 * @returns {JSX.Element|null} Install pill
 */
export function InstallPill() {

    use_install_prompt()

    const install_prompt = use_pwa_store( state => state.install_prompt )
    const is_installed = use_pwa_store( state => state.is_installed )
    const set_install_prompt = use_pwa_store( state => state.set_install_prompt )

    const install_app = async () => {
        if( !install_prompt ) return
        await install_prompt.prompt()
        set_install_prompt( null )
    }

    if( is_installed || !install_prompt ) return null

    return <Pill type="button" onClick={ install_app }>
        <Download size={ 18 } aria-hidden="true" />
        Install App
    </Pill>
}
