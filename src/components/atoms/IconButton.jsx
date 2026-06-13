import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styled from 'styled-components'

const IconSurface = styled.button`
    position: relative;
    display: inline-flex;
    width: 48px;
    max-width: 100%;
    min-width: 48px;
    height: 48px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink);
    background: var(--surface-raised);
    transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;

    &:hover {
        border-color: var(--accent-dark);
    }

    &:focus-visible {
        border-color: var(--focus-outline);
        box-shadow: 0 0 0 3px var(--focus-ring);
        outline: none;
    }

    &:active {
        transform: translateY(1px);
    }

    &.active {
        border-color: var(--accent-dark);
        color: var(--on-accent);
        background: var(--accent);
    }
`

const Tooltip = styled.span`
    position: fixed;
    z-index: 60;
    width: max-content;
    max-width: min(11rem, calc(100vw - 1rem));
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--ink);
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.2;
    opacity: ${ ( { $is_visible } ) => $is_visible ? 1 : 0 };
    overflow-wrap: anywhere;
    pointer-events: none;
    text-align: center;
    transition: opacity 140ms ease;
    white-space: normal;
`

const tooltip_gap = 8
const viewport_padding = 8

const clamp = ( value, min, max ) => Math.min( Math.max( value, min ), max )

/**
 * Renders a circular icon button with an accessible label.
 * @param {Object} props - Button props
 * @returns {JSX.Element} Icon button
 */
export function IconButton( { label, children, onBlur, onFocus, onPointerEnter, onPointerLeave, ...props } ) {

    const button_ref = useRef( null )
    const tooltip_ref = useRef( null )
    const [ is_mouse_hovering, set_is_mouse_hovering ] = useState( false )
    const [ is_focus_visible, set_is_focus_visible ] = useState( false )
    const [ tooltip_position, set_tooltip_position ] = useState( null )
    const is_tooltip_open = is_mouse_hovering || is_focus_visible

    useLayoutEffect( () => {
        if( !is_tooltip_open ) {
            set_tooltip_position( null )
            return
        }

        const position_tooltip = () => {
            const button_box = button_ref.current?.getBoundingClientRect()
            const tooltip_box = tooltip_ref.current?.getBoundingClientRect()
            if( !button_box || !tooltip_box ) return

            const viewport_width = window.innerWidth
            const viewport_height = window.innerHeight
            const button_center = button_box.left + button_box.width / 2
            const tooltip_center_offset = tooltip_box.width / 2
            const preferred_left = button_center - tooltip_center_offset
            const max_left = viewport_width - tooltip_box.width - viewport_padding
            const left = clamp( preferred_left, viewport_padding, Math.max( viewport_padding, max_left ) )
            const preferred_top = button_box.top - tooltip_box.height - tooltip_gap
            const below_top = button_box.bottom + tooltip_gap
            const top = preferred_top >= viewport_padding
                ? preferred_top
                : clamp( below_top, viewport_padding, Math.max( viewport_padding, viewport_height - tooltip_box.height - viewport_padding ) )

            set_tooltip_position( { left, top } )
        }

        position_tooltip()

        window.addEventListener( `resize`, position_tooltip )
        window.addEventListener( `scroll`, position_tooltip, true )
        window.visualViewport?.addEventListener( `resize`, position_tooltip )
        window.visualViewport?.addEventListener( `scroll`, position_tooltip )

        return () => {
            window.removeEventListener( `resize`, position_tooltip )
            window.removeEventListener( `scroll`, position_tooltip, true )
            window.visualViewport?.removeEventListener( `resize`, position_tooltip )
            window.visualViewport?.removeEventListener( `scroll`, position_tooltip )
        }
    }, [ is_tooltip_open, label ] )

    const show_tooltip = event => {
        onPointerEnter?.( event )
        if( event.pointerType === `mouse` ) set_is_mouse_hovering( true )
    }

    const hide_tooltip = event => {
        onPointerLeave?.( event )
        if( event.pointerType === `mouse` ) set_is_mouse_hovering( false )
    }

    const focus_tooltip = event => {
        onFocus?.( event )
        set_is_focus_visible( event.currentTarget.matches( `:focus-visible` ) )
    }

    const blur_tooltip = event => {
        onBlur?.( event )
        set_is_focus_visible( false )
    }

    return <>
        <IconSurface
            ref={ button_ref }
            aria-label={ label }
            onBlur={ blur_tooltip }
            onFocus={ focus_tooltip }
            onPointerEnter={ show_tooltip }
            onPointerLeave={ hide_tooltip }
            { ...props }
        >
            { children }
        </IconSurface>
        { is_tooltip_open && createPortal(
            <Tooltip
                ref={ tooltip_ref }
                role="tooltip"
                $is_visible={ Boolean( tooltip_position ) }
                style={ tooltip_position || { left: 0, top: 0, visibility: `hidden` } }
            >
                { label }
            </Tooltip>,
            document.body,
        ) }
    </>
}
