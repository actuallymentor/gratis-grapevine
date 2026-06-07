import styled from 'styled-components'
import { X } from 'lucide-react'

import { IconButton } from './IconButton.jsx'

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
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

    if( !is_open ) return null

    return <Backdrop role="presentation">
        <Panel role="dialog" aria-modal="true" aria-label={ title }>
            <Header>
                <h2>{ title }</h2>
                <IconButton label="Close" type="button" onClick={ close }>
                    <X size={ 20 } aria-hidden="true" />
                </IconButton>
            </Header>
            { children }
        </Panel>
    </Backdrop>
}
