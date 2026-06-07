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

    &:hover {
        border-color: var(--accent-dark);
    }

    &:active {
        transform: translateY(1px);
    }
`

/**
 * Renders a circular icon button with an accessible label.
 * @param {Object} props - Button props
 * @returns {JSX.Element} Icon button
 */
export function IconButton( { label, children, ...props } ) {

    return <IconSurface aria-label={ label } title={ label } { ...props }>
        { children }
    </IconSurface>
}
