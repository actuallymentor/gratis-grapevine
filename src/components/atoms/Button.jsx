import styled, { css } from 'styled-components'

const ButtonSurface = styled.button`
    display: inline-flex;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--surface-raised);
    font-weight: 700;
    text-decoration: none;
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

    &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    ${ ( { $variant } ) => $variant === `primary` && css`
        border-color: var(--accent-dark);
        color: var(--on-accent);
        background: var(--accent);
    ` }

    ${ ( { $variant } ) => $variant === `danger` && css`
        border-color: #d69a9a;
        color: #641f1f;
        background: #fff0f0;
    ` }

    ${ ( { $variant } ) => $variant === `ghost` && css`
        background: transparent;
    ` }
`

/**
 * Renders a consistent command button.
 * @param {Object} props - Button props
 * @returns {JSX.Element} Button
 */
export function Button( { children, variant = `default`, ...props } ) {

    return <ButtonSurface $variant={ variant } { ...props }>
        { children }
    </ButtonSurface>
}
