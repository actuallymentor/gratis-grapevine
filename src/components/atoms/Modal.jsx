import { useEffect, useId, useRef } from 'react'
import styled from 'styled-components'
import { X } from 'lucide-react'

import { IconButton } from './IconButton.jsx'

const Backdrop = styled.div`
    position: fixed;
    inset: 0 0 var(--fixed-viewport-bottom) 0;
    z-index: 20;
    display: grid;
    width: 100vw;
    max-width: 100vw;
    min-width: 0;
    max-height: 100dvh;
    align-items: end;
    overflow-x: hidden;
    overflow-x: clip;
    background: rgb(36 40 39 / 38%);

    @media (min-width: 720px) {
        align-items: center;
        justify-items: center;
        padding: var(--space-xl);
    }

    @supports (width: 100dvw) {
        width: 100dvw;
        max-width: 100dvw;
    }
`

const Panel = styled.section`
    width: min(100%, 100vw);
    max-width: 100vw;
    min-width: 0;
    max-height: min(calc(100dvh - var(--fixed-viewport-bottom)), 52rem);
    overflow: auto;
    overflow-x: hidden;
    padding: var(--space-l);
    border: 1px solid var(--line);
    border-radius: 8px 8px 0 0;
    background: var(--surface);
    overflow-wrap: anywhere;
    overscroll-behavior: contain;

    @media (min-width: 720px) {
        width: min(46rem, calc(100vw - var(--space-xl) - var(--space-xl)));
        max-width: min(46rem, calc(100vw - var(--space-xl) - var(--space-xl)));
        border-radius: 8px;
        box-shadow: var(--shadow);
    }

    @supports (width: 100dvw) {
        width: min(100%, 100dvw);
        max-width: 100dvw;

        @media (min-width: 720px) {
            width: min(46rem, calc(100dvw - var(--space-xl) - var(--space-xl)));
            max-width: min(46rem, calc(100dvw - var(--space-xl) - var(--space-xl)));
        }
    }
`

const Header = styled.header`
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-m);
    margin-bottom: var(--space-l);

    h2 {
        min-width: 0;
    }
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
