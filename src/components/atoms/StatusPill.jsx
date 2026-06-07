import styled from 'styled-components'
import { Ban, CheckCircle2, Clock3, Info } from 'lucide-react'

const Pill = styled.span`
    display: inline-flex;
    min-height: 2rem;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink);
    background: var(--surface-raised);
    font-size: 0.88rem;
    font-weight: 700;
`

const icon_by_status = {
    accepted: CheckCircle2,
    pending: Clock3,
    blocked: Ban,
}

/**
 * Renders a labelled status pill.
 * @param {Object} props - Status props
 * @returns {JSX.Element} Status pill
 */
export function StatusPill( { status = `info` } ) {

    const Icon = icon_by_status[ status ] || Info
    return <Pill>
        <Icon size={ 16 } aria-hidden="true" />
        { status }
    </Pill>
}
