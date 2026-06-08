import { useEffect, useId, useRef } from 'react'
import styled from 'styled-components'
import { X } from 'lucide-react'

import { IconButton } from './IconButton.jsx'

const Backdrop = styled.div`
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    z-index: 20;
    display: grid;
    height: calc(100vh - var(--fixed-viewport-bottom));
    align-items: end;
    background: rgb(36 40 39 / 38%);

    @media (min-width: 720px) {
        align-items: center;
        justify-items: center;
        padding: var(--space-xl);
    }
`

const Panel = styled.section`
    width: 100%;
    max-height: min(88dvh, 52rem);
    overflow: auto;
    padding: var(--space-l);
    border: 1px solid var(--line);
    border-radius: 8px 8px 0 0;
    background: var(--surface);

    @media (min-width: 720px) {
        max-width: 46rem;
        border-radius: 8px;
        box-shadow: var(--shadow);
    }
`

const Header = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-m);
    margin-bottom: var(--space-l);
`

/**
 * Renders a modal panel.
 * @param {Object} props - Modal props
 * @returns {JSX.Element|null} Modal
 */
export function Modal( { title, is_open, close, children } ) {

    const title_id = useId()
    const panel_ref = useRef( null )
    const previous_focus = useRef( null )

    useEffect( () => {
        if( !is_open ) return

        previous_focus.current = document.activeElement
        const focusable_elements = panel_ref.current?.querySelectorAll( `a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])` )
        const [ first_focusable ] = focusable_elements || []
        if( first_focusable ) first_focusable.focus()
        else panel_ref.current?.focus()

        return () => previous_focus.current?.focus?.()
    }, [ is_open ] )

    const close_from_backdrop = event => {
        if( event.target === event.currentTarget ) close()
    }

    const handle_keydown = event => {
        if( event.key === `Escape` ) {
            event.preventDefault()
            close()
            return
        }

        if( event.key !== `Tab` ) return

        const focusable_elements = [ ...panel_ref.current?.querySelectorAll( `a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])` ) || [] ]
        if( focusable_elements.length === 0 ) return

        const [ first_focusable ] = focusable_elements
        const last_focusable = focusable_elements.at( -1 )

        if( event.shiftKey && document.activeElement === first_focusable ) {
            event.preventDefault()
            last_focusable.focus()
        }

        if( !event.shiftKey && document.activeElement === last_focusable ) {
            event.preventDefault()
            first_focusable.focus()
        }
    }

    if( !is_open ) return null

    return <Backdrop role="presentation" onMouseDown={ close_from_backdrop }>
        <Panel ref={ panel_ref } role="dialog" aria-modal="true" aria-labelledby={ title_id } tabIndex={ -1 } onKeyDown={ handle_keydown }>
            <Header>
                <h2 id={ title_id }>{ title }</h2>
                <IconButton label="Close" type="button" onClick={ close }>
                    <X size={ 20 } aria-hidden="true" />
                </IconButton>
            </Header>
            { children }
        </Panel>
    </Backdrop>
}
