import styled, { keyframes } from 'styled-components'

const shimmer = keyframes`
    0% {
        background-position: 120% 0;
    }

    100% {
        background-position: -120% 0;
    }
`

const Block = styled.section`
    display: grid;
    max-width: 65ch;
    gap: var(--space-s);
    padding: var(--space-l) 0;
    border-top: 1px solid var(--line);
`

const SkeletonLine = styled.span`
    display: block;
    width: ${ ( { $width } ) => $width };
    height: 0.9rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #e9eef2 0%, #f7f9fb 48%, #e9eef2 100%);
    background-size: 240% 100%;
    animation: ${ shimmer } 1.4s ease infinite;
`

const Muted = styled.p`
    color: var(--muted);
`

/**
 * Renders a compact skeleton block while page content loads.
 * @param {Object} props - Loading props
 * @returns {JSX.Element} Loading block
 */
export function LoadingBlock( { label = `Loading` } ) {

    return <Block aria-live="polite" aria-busy="true">
        <Muted>{ label }</Muted>
        <SkeletonLine $width="92%" />
        <SkeletonLine $width="74%" />
        <SkeletonLine $width="58%" />
    </Block>
}

/**
 * Renders an empty or unavailable state with optional action content.
 * @param {Object} props - Empty state props
 * @returns {JSX.Element} Empty state
 */
export function EmptyState( { title, children, action = null } ) {

    return <Block>
        <h2>{ title }</h2>
        { children ? <Muted>{ children }</Muted> : null }
        { action }
    </Block>
}
