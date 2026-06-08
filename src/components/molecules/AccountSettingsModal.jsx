import styled from 'styled-components'
import { Link } from 'react-router'
import { LogOut, RotateCcw, Shield, SlidersHorizontal, WifiOff } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Modal } from '../atoms/Modal.jsx'
import { StatusPill } from '../atoms/StatusPill.jsx'
import { use_display_store } from '../../stores/display_store.js'

const Stack = styled.div`
    display: grid;
    gap: var(--space-l);
`

const Section = styled.section`
    display: grid;
    gap: var(--space-m);

    & + & {
        padding-top: var(--space-l);
        border-top: 1px solid var(--line);
    }
`

const Summary = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
`

const Segments = styled.div`
    display: grid;
    gap: 0.5rem;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
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
    const sync_text = is_online
        ? queue.length ? `${ queue.length } queued update${ queue.length === 1 ? `` : `s` }` : `All updates synced`
        : queue.length ? `Offline with ${ queue.length } queued` : `Offline`

    return <Modal title="Account" is_open={ is_open } close={ close }>
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
            </Section>

            <Section>
                <h3>Display</h3>
                <div>
                    <Caption>Text size</Caption>
                    <Segments>
                        { text_size_options.map( ( [ value, label ] ) => <Button key={ value } type="button" variant={ text_size === value ? `primary` : `default` } onClick={ () => set_text_size( value ) }>
                            <SlidersHorizontal size={ 16 } aria-hidden="true" />
                            { label }
                        </Button> ) }
                    </Segments>
                </div>
                <div>
                    <Caption>Line height</Caption>
                    <Segments>
                        { line_height_options.map( ( [ value, label ] ) => <Button key={ value } type="button" variant={ line_height === value ? `primary` : `default` } onClick={ () => set_line_height( value ) }>
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
                    <Button type="button" variant="ghost" onClick={ logout }>
                        <LogOut size={ 18 } aria-hidden="true" />
                        Log out
                    </Button>
                </Summary>
            </Section>
        </Stack>
    </Modal>
}
