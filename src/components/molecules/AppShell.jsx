import { useState } from 'react'
import styled from 'styled-components'
import { Link, NavLink } from 'react-router'
import { Archive, Mic, PencilLine, Search, Shield, Users } from 'lucide-react'

import { IconButton } from '../atoms/IconButton.jsx'
import { Button } from '../atoms/Button.jsx'
import { StatusPill } from '../atoms/StatusPill.jsx'
import { RecordUpdateModal } from './RecordUpdateModal.jsx'
import { TypedUpdateModal } from './TypedUpdateModal.jsx'
import { AskGrapevineModal } from './AskGrapevineModal.jsx'
import { use_session_store } from '../../stores/session_store.js'
import { use_sync_queue } from '../../hooks/use_sync_queue.js'

const Shell = styled.div`
    min-height: 100dvh;
    padding-bottom: 6rem;
`

const TopBar = styled.header`
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-m);
    padding: 0.8rem var(--space-l);
    border-bottom: 1px solid var(--line);
    background: rgb(247 246 242 / 94%);
    backdrop-filter: blur(10px);
`

const Brand = styled( Link )`
    color: var(--ink);
    font-family: "Montserrat Variable", system-ui, sans-serif;
    font-size: 1.05rem;
    font-weight: 500;
    text-decoration: none;
`

const Nav = styled.nav`
    display: none;
    align-items: center;
    gap: 0.4rem;

    @media (min-width: 760px) {
        display: flex;
    }

    a {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.7rem;
        border-radius: 8px;
        color: var(--ink);
        text-decoration: none;
    }

    a.active {
        background: var(--surface-raised);
        box-shadow: inset 0 0 0 1px var(--line);
    }
`

const Account = styled.div`
    display: flex;
    align-items: center;
    gap: 0.6rem;
`

const Main = styled.main`
    width: min(100%, 72rem);
    margin: 0 auto;
    padding: var(--space-l);
`

const BottomBar = styled.nav`
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 12;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.35rem;
    padding: 0.55rem max(0.75rem, env(safe-area-inset-left)) max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-right));
    border-top: 1px solid var(--line);
    background: var(--surface);

    @media (min-width: 760px) {
        right: 1rem;
        bottom: 1rem;
        left: auto;
        width: auto;
        grid-template-columns: repeat(5, 48px);
        border: 1px solid var(--line);
        border-radius: 999px;
        box-shadow: var(--shadow);
    }
`

const SyncText = styled.span`
    color: var(--muted);
    font-size: 0.85rem;
`

/**
 * Renders the accepted member app shell.
 * @param {Object} props - Shell props
 * @returns {JSX.Element} App shell
 */
export function AppShell( { children } ) {

    const user = use_session_store( state => state.user )
    const logout = use_session_store( state => state.logout )
    const { queue, is_syncing, refresh_queue } = use_sync_queue()
    const [ modal, set_modal ] = useState( null )

    const close_modal = () => {
        set_modal( null )
        refresh_queue()
    }

    return <Shell>
        <TopBar>
            <Brand to="/">Gratis Grapevine</Brand>
            <Nav aria-label="Primary">
                <NavLink to="/archive"><Archive size={ 16 } aria-hidden="true" />Archive</NavLink>
                <NavLink to="/members"><Users size={ 16 } aria-hidden="true" />Members</NavLink>
                { user?.role === `admin` ? <NavLink to="/admin"><Shield size={ 16 } aria-hidden="true" />Admin</NavLink> : null }
            </Nav>
            <Account>
                { queue.length ? <SyncText>{ is_syncing ? `Syncing` : `${ queue.length } pending` }</SyncText> : null }
                { user?.role === `admin` ? <Button as={ Link } to="/admin" variant="ghost">
                    <Shield size={ 16 } aria-hidden="true" />
                    Admin
                </Button> : null }
                <StatusPill status={ user?.status } />
                <Button type="button" variant="ghost" onClick={ logout }>Log out</Button>
            </Account>
        </TopBar>

        <Main>{ children }</Main>

        <BottomBar aria-label="Actions">
            <IconButton label="Record update" type="button" onClick={ () => set_modal( `record` ) }>
                <Mic size={ 22 } aria-hidden="true" />
            </IconButton>
            <IconButton label="Type update" type="button" onClick={ () => set_modal( `typed` ) }>
                <PencilLine size={ 22 } aria-hidden="true" />
            </IconButton>
            <IconButton label="Ask Grapevine" type="button" onClick={ () => set_modal( `ask` ) }>
                <Search size={ 22 } aria-hidden="true" />
            </IconButton>
            <IconButton as={ Link } to="/members" label="Members">
                <Users size={ 22 } aria-hidden="true" />
            </IconButton>
            <IconButton as={ Link } to="/archive" label="Archive">
                <Archive size={ 22 } aria-hidden="true" />
            </IconButton>
        </BottomBar>

        <RecordUpdateModal is_open={ modal === `record` } close={ close_modal } />
        <TypedUpdateModal is_open={ modal === `typed` } close={ close_modal } />
        <AskGrapevineModal is_open={ modal === `ask` } close={ close_modal } />
    </Shell>
}
