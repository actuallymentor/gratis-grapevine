import styled from 'styled-components'

const IconSurface = styled.button`
    position: relative;
    display: inline-flex;
    width: 48px;
    min-width: 48px;
    height: 48px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink);
    background: var(--surface-raised);
    transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;

    &::after {
        position: absolute;
        bottom: calc(100% + 0.5rem);
        left: 50%;
        z-index: 3;
        width: max-content;
        max-width: 11rem;
        padding: 0.35rem 0.5rem;
        border: 1px solid var(--line);
        border-radius: 6px;
        color: var(--ink);
        background: var(--surface);
        box-shadow: var(--shadow);
        content: attr(data-label);
        font-size: 0.82rem;
        font-weight: 700;
        line-height: 1.2;
        opacity: 0;
        pointer-events: none;
        text-align: center;
        transform: translate(-50%, 0.25rem);
        transition: opacity 140ms ease, transform 140ms ease;
        white-space: normal;
    }

    &:hover {
        border-color: var(--accent-dark);
    }

    &:hover::after,
    &:focus-visible::after {
        opacity: 1;
        transform: translate(-50%, 0);
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

/**
 * Renders a circular icon button with an accessible label.
 * @param {Object} props - Button props
 * @returns {JSX.Element} Icon button
 */
export function IconButton( { label, children, ...props } ) {

    return <IconSurface aria-label={ label } data-label={ label } title={ label } { ...props }>
        { children }
    </IconSurface>
}
