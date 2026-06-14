import { useEffect } from 'react'
import styled from 'styled-components'
import { Bell, BellOff } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { use_notification_store } from '../../stores/notification_store.js'

const Card = styled.section`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
    padding: var(--space-m);
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-raised);
`

const Header = styled.div`
    display: flex;
    min-width: 0;
    align-items: flex-start;
    gap: 0.75rem;

    svg {
        flex: 0 0 auto;
        margin-top: 0.1rem;
        color: var(--accent-dark);
    }
`

const Text = styled.div`
    display: grid;
    min-width: 0;
    gap: 0.35rem;

    strong {
        font-family: "Montserrat", "Montserrat Variable", system-ui, sans-serif;
        font-weight: 600;
        line-height: 1.3;
    }

    p {
        color: var(--muted);
        font-size: 0.94rem;
        line-height: 1.45;
    }
`

const Actions = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.65rem;
`

/**
 * Renders the in-app prompt before the browser notification permission dialog.
 * @param {Object} props - Prompt props
 * @param {Boolean} props.sync_immediately - Whether to save the subscription immediately
 * @returns {JSX.Element|null} Notification permission prompt
 */
export function NotificationPermissionCard( { sync_immediately = true } ) {

    const {
        is_supported,
        is_configured,
        is_dismissed,
        permission,
        is_subscribed,
        is_loading,
        initialize,
        enable,
        dismiss,
    } = use_notification_store()
    const can_show = is_supported
        && is_configured
        && !is_dismissed
        && permission !== `denied`
        && !is_subscribed

    useEffect( () => {
        initialize()
    }, [ initialize ] )

    if( !can_show ) return null

    return <Card aria-label="Notification permission">
        <Header>
            <Bell size={ 22 } aria-hidden="true" />
            <Text>
                <strong>Enable Grapevine notifications</strong>
                <p>We can let you know when your account review changes, when a community bulletin is published, or when something needs your attention.</p>
            </Text>
        </Header>
        <Actions>
            <Button type="button" variant="primary" disabled={ is_loading } onClick={ () => enable( { sync_immediately } ) }>
                <Bell size={ 18 } aria-hidden="true" />
                Allow notifications
            </Button>
            <Button type="button" variant="ghost" disabled={ is_loading } onClick={ dismiss }>
                <BellOff size={ 18 } aria-hidden="true" />
                Not now
            </Button>
        </Actions>
    </Card>
}

