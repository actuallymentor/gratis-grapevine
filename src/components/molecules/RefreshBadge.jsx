import styled from 'styled-components'
import { RefreshCw } from 'lucide-react'

import { use_pwa_store } from '../../stores/pwa_store.js'

const Badge = styled.button`
    position: fixed;
    top: calc(1rem + env(safe-area-inset-top));
    left: 50%;
    z-index: 30;
    display: flex;
    width: min(28rem, calc(100vw - 2rem));
    min-height: 64px;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.8rem 1rem;
    border: 1px solid var(--accent-dark);
    border-radius: 8px;
    color: var(--on-accent);
    background: var(--accent);
    box-shadow: var(--shadow);
    text-align: left;
    transform: translateX(-50%);

    svg {
        flex: 0 0 auto;
    }
`

const Text = styled.span`
    display: grid;
    min-width: 0;
    gap: 0.1rem;
`

const Title = styled.span`
    font-size: 0.98rem;
    font-weight: 900;
`

const Hint = styled.span`
    font-size: 0.88rem;
    font-weight: 700;
`

/**
 * Renders a persistent update badge when the service worker has a new build.
 * @returns {JSX.Element|null} Refresh badge
 */
export function RefreshBadge() {

    const update_ready = use_pwa_store( state => state.update_ready )
    const refresh_handler = use_pwa_store( state => state.refresh_handler )

    if( !update_ready ) return null

    return <Badge type="button" aria-label="Update available. Click here to update app." onClick={ refresh_handler }>
        <RefreshCw size={ 18 } aria-hidden="true" />
        <Text>
            <Title>Update available</Title>
            <Hint>Click here to update app</Hint>
        </Text>
    </Badge>
}
