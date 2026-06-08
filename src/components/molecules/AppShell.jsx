import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, NavLink } from 'react-router'
import { Archive, Cloud, CloudUpload, Mic, PencilLine, Search, Settings2, Shield, Users, WifiOff } from 'lucide-react'

import { IconButton } from '../atoms/IconButton.jsx'
import { Button } from '../atoms/Button.jsx'
import { StatusPill } from '../atoms/StatusPill.jsx'
import { RecordUpdateModal } from './RecordUpdateModal.jsx'
import { TypedUpdateModal } from './TypedUpdateModal.jsx'
import { AskGrapevineModal } from './AskGrapevineModal.jsx'
import { AccountSettingsModal } from './AccountSettingsModal.jsx'
import { use_session_store } from '../../stores/session_store.js'
import { use_sync_queue } from '../../hooks/use_sync_queue.js'

const Shell = styled.div`
    min-height: 100dvh;
    padding-bottom: calc(7.5rem + env(safe-area-inset-bottom));

    @media (min-width: 760px) {
        padding-bottom: 6.5rem;
    }
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
    background: rgb(250 251 252 / 94%);
    backdrop-filter: blur(10px);
`

const Brand = styled( Link )`
    color: var(--ink);
    font-family: "Montserrat", "Montserrat Variable", system-ui, sans-serif;
    font-size: 1.05rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration: none;
    white-space: nowrap;
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
    min-width: 0;
    align-items: center;
    gap: 0.6rem;
    justify-content: flex-end;
`

const DesktopAccount = styled.div`
    display: none;
    align-items: center;
    gap: 0.6rem;

    @media (min-width: 680px) {
        display: flex;
    }
`

const Main = styled.main`
    width: min(100%, 72rem);
    margin: 0 auto;
    padding: var(--space-l);
`

const BottomBar = styled.nav`
    position: fixed;
    right: 0;
    bottom: var(--fixed-viewport-bottom);
    left: 0;
    z-index: 12;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.35rem;
    padding: 0.55rem max(0.75rem, env(safe-area-inset-left)) max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-right));
    border-top: 1px solid var(--line);
    background: var(--surface);

    a.active {
        border-color: var(--accent-dark);
        color: var(--on-accent);
        background: var(--accent);
    }

    @media (min-width: 760px) {
        right: 1rem;
        bottom: calc(1rem + var(--fixed-viewport-bottom));
        left: auto;
        width: auto;
        grid-template-columns: repeat(5, 48px);
        border: 1px solid var(--line);
        border-radius: 999px;
        box-shadow: var(--shadow);
    }
`

const SyncText = styled.span`
    display: inline-flex;
    min-height: 2rem;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    background: var(--surface);
    font-size: 0.85rem;
    font-weight: 700;
    white-space: nowrap;
`

const BottomStatus = styled.div`
    position: fixed;
    right: 1rem;
    bottom: calc(5.5rem + env(safe-area-inset-bottom) + var(--fixed-viewport-bottom));
    left: 1rem;
    z-index: 11;
    display: flex;
    justify-content: center;
    pointer-events: none;

    @media (min-width: 760px) {
        right: 18rem;
        bottom: calc(1.65rem + var(--fixed-viewport-bottom));
        left: auto;
    }

    ${ SyncText } {
        box-shadow: var(--shadow);
    }
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
    const [ is_online, set_is_online ] = useState( navigator.onLine )

    useEffect( () => {
        const mark_online = () => set_is_online( true )
        const mark_offline = () => set_is_online( false )

        window.addEventListener( `online`, mark_online )
        window.addEventListener( `offline`, mark_offline )

        return () => {
            window.removeEventListener( `online`, mark_online )
            window.removeEventListener( `offline`, mark_offline )
        }
    }, [] )

    const close_modal = () => {
        set_modal( null )
        refresh_queue()
    }

    const sync_label = is_online
        ? is_syncing ? `Syncing` : queue.length ? `${ queue.length } queued` : null
        : queue.length ? `${ queue.length } queued offline` : `Offline`

    const SyncIcon = is_online ? queue.length ? CloudUpload : Cloud : WifiOff

    return <Shell>
        <TopBar>
            <Brand to="/">Gratis Grapevine</Brand>
            <Nav aria-label="Primary">
                <NavLink to="/archive"><Archive size={ 16 } aria-hidden="true" />Archive</NavLink>
                <NavLink to="/members"><Users size={ 16 } aria-hidden="true" />Members</NavLink>
                { user?.role === `admin` ? <NavLink to="/admin"><Shield size={ 16 } aria-hidden="true" />Admin</NavLink> : null }
            </Nav>
            <Account>
                { sync_label ? <SyncText><SyncIcon size={ 15 } aria-hidden="true" />{ sync_label }</SyncText> : null }
                <DesktopAccount>
                    <StatusPill status={ user?.status } />
                    <Button type="button" variant="ghost" onClick={ logout }>Log out</Button>
                </DesktopAccount>
                <IconButton label="Account and display settings" type="button" onClick={ () => set_modal( `account` ) }>
                    <Settings2 size={ 21 } aria-hidden="true" />
                </IconButton>
            </Account>
        </TopBar>

        <Main>{ children }</Main>

        { sync_label ? <BottomStatus>
            <SyncText><SyncIcon size={ 15 } aria-hidden="true" />{ sync_label }</SyncText>
        </BottomStatus> : null }

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
            <IconButton as={ NavLink } to="/members" label="Members">
                <Users size={ 22 } aria-hidden="true" />
            </IconButton>
            <IconButton as={ NavLink } to="/archive" label="Archive">
                <Archive size={ 22 } aria-hidden="true" />
            </IconButton>
        </BottomBar>

        <AccountSettingsModal is_open={ modal === `account` } close={ close_modal } user={ user } queue={ queue } is_syncing={ is_syncing } is_online={ is_online } logout={ logout } />
        <RecordUpdateModal is_open={ modal === `record` } close={ close_modal } />
        <TypedUpdateModal is_open={ modal === `typed` } close={ close_modal } />
        <AskGrapevineModal is_open={ modal === `ask` } close={ close_modal } />
    </Shell>
}
