import styled from 'styled-components'

import { Button } from '../atoms/Button.jsx'
import { StatusPill } from '../atoms/StatusPill.jsx'
import { use_session_store } from '../../stores/session_store.js'

const Wrap = styled.main`
    display: grid;
    min-height: 100dvh;
    align-items: center;
    padding: var(--space-l);
`

const Panel = styled.section`
    display: grid;
    width: min(100%, 38rem);
    gap: var(--space-m);
    margin: 0 auto;
    padding: var(--space-l);
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
`

/**
 * Renders pending or blocked account state.
 * @param {Object} props - Review props
 * @returns {JSX.Element} Review state
 */
export function ReviewState( { user } ) {

    const logout = use_session_store( state => state.logout )
    const is_blocked = user?.status === `blocked`

    return <Wrap>
        <Panel>
            <StatusPill status={ user?.status } />
            <h1>{ is_blocked ? `Your account is not currently active.` : `Your account is being reviewed.` }</h1>
            <p>{ is_blocked ? `The Grapevine is paused for this account.` : `Please come back in a couple of hours.` }</p>
            { user?.review_message ? <p>{ user.review_message }</p> : null }
            <Button type="button" onClick={ logout }>Log out</Button>
        </Panel>
    </Wrap>
}
