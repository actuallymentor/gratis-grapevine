import styled from 'styled-components'
import { Link } from 'react-router'
import toast from 'react-hot-toast'
import { Archive, LogOut, RefreshCw, RotateCcw, Shield, SlidersHorizontal, WifiOff } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Modal } from '../atoms/Modal.jsx'
import { StatusPill } from '../atoms/StatusPill.jsx'
import { use_display_store } from '../../stores/display_store.js'
import { use_pwa_store } from '../../stores/pwa_store.js'

const Stack = styled.div`
    display: grid;
    min-width: 0;
    gap: var(--space-l);
`

const Section = styled.section`
    display: grid;
    min-width: 0;
    gap: var(--space-m);

    & + & {
        padding-top: var(--space-l);
        border-top: 1px solid var(--line);
    }
`

const Summary = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
`

const Segments = styled.div`
    display: grid;
    min-width: 0;
    gap: 0.5rem;
    grid-template-columns: repeat(auto-fit, minmax(min(8rem, 100%), 1fr));
`

const Caption = styled.p`
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
    font-size: 0.92rem;
`

const text_size_options = [
    [ `0.95rem`, `Small` ],
    [ `1rem`, `Regular` ],
    [ `1.12rem`, `Large` ],
    [ `1.25rem`, `Extra large` ],
]

const line_height_options = [
    [ `1.45`, `Compact` ],
    [ `1.55`, `Regular` ],
    [ `1.7`, `Roomy` ],
]

/**
 * Renders account, sync, and local display controls.
 * @param {Object} props - Modal props
 * @returns {JSX.Element|null} Account settings modal
 */
export function AccountSettingsModal( { is_open, close, user, queue, is_syncing, is_online, logout } ) {

    const text_size = use_display_store( state => state.text_size )
    const line_height = use_display_store( state => state.line_height )
    const set_text_size = use_display_store( state => state.set_text_size )
    const set_line_height = use_display_store( state => state.set_line_height )
    const reset_display = use_display_store( state => state.reset_display )
    const force_update_app = use_pwa_store( state => state.force_update_app )
    const is_updating_app = use_pwa_store( state => state.is_updating_app )
    const sync_text = is_online
        ? queue.length ? `${ queue.length } queued update${ queue.length === 1 ? `` : `s` }` : `All updates synced`
        : queue.length ? `Offline with ${ queue.length } queued` : `Offline`

    const update_app = async () => {
        try {
            await force_update_app()
        } catch ( error ) {
            toast.error( error.message || `The app could not update right now.` )
        }
    }

    return <Modal title="Profile" is_open={ is_open } close={ close }>
        <Stack>
            <Section>
                <Summary>
                    <StatusPill status={ user?.status } />
                    <strong>{ user?.name || `Member` }</strong>
                    { user?.hub_name ? <span>{ user.hub_name }</span> : null }
                </Summary>
                <Caption>
                    { is_online ? null : <WifiOff size={ 16 } aria-hidden="true" /> }
                    { is_syncing ? `Syncing queued changes` : sync_text }
                </Caption>
                <Button as={ Link } to="/archive?kind=mine" onClick={ close }>
                    <Archive size={ 18 } aria-hidden="true" />
                    Open Your Updates Archive
                </Button>
            </Section>

            <Section>
                <h3>Display</h3>
                <div>
                    <Caption>Text size</Caption>
                    <Segments>
                        { text_size_options.map( ( [ value, label ] ) => <Button key={ value } type="button" variant={ text_size === value ? `primary` : `default` } aria-pressed={ text_size === value } onClick={ () => set_text_size( value ) }>
                            <SlidersHorizontal size={ 16 } aria-hidden="true" />
                            { label }
                        </Button> ) }
                    </Segments>
                </div>
                <div>
                    <Caption>Line height</Caption>
                    <Segments>
                        { line_height_options.map( ( [ value, label ] ) => <Button key={ value } type="button" variant={ line_height === value ? `primary` : `default` } aria-pressed={ line_height === value } onClick={ () => set_line_height( value ) }>
                            { label }
                        </Button> ) }
                    </Segments>
                </div>
                <Button type="button" onClick={ reset_display }>
                    <RotateCcw size={ 18 } aria-hidden="true" />
                    Reset display
                </Button>
            </Section>

            <Section>
                <Summary>
                    { user?.role === `admin` ? <Button as={ Link } to="/admin" onClick={ close }>
                        <Shield size={ 18 } aria-hidden="true" />
                        Admin
                    </Button> : null }
                    <Button type="button" onClick={ update_app } disabled={ !is_online || is_updating_app }>
                        <RefreshCw size={ 18 } aria-hidden="true" />
                        { is_updating_app ? `Updating app` : `Update app` }
                    </Button>
                    <Button type="button" variant="ghost" onClick={ logout }>
                        <LogOut size={ 18 } aria-hidden="true" />
                        Log out
                    </Button>
                </Summary>
            </Section>
        </Stack>
    </Modal>
}
