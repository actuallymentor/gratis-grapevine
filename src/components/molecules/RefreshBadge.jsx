import styled from 'styled-components'
import { RotateCcw } from 'lucide-react'

import { use_pwa_store } from '../../stores/pwa_store.js'

const Badge = styled.button`
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 15;
    display: inline-flex;
    min-height: 48px;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink);
    background: var(--surface-raised);
    font-weight: 800;
    box-shadow: var(--shadow);
`

/**
 * Renders a persistent update badge when the service worker has a new build.
 * @returns {JSX.Element|null} Refresh badge
 */
export function RefreshBadge() {

    const update_ready = use_pwa_store( state => state.update_ready )
    const refresh_handler = use_pwa_store( state => state.refresh_handler )

    if( !update_ready ) return null

    return <Badge type="button" onClick={ refresh_handler }>
        <RotateCcw size={ 18 } aria-hidden="true" />
        Reload
    </Badge>
}
