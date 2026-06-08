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

    ${ ( { $status } ) => $status === `accepted` ? `
        border-color: #b6d7c0;
        color: #214f31;
        background: #eef8f1;
    ` : `` }

    ${ ( { $status } ) => $status === `pending` ? `
        border-color: #e3c693;
        color: #67400f;
        background: #fff7e7;
    ` : `` }

    ${ ( { $status } ) => $status === `blocked` ? `
        border-color: #d69a9a;
        color: #641f1f;
        background: #fff0f0;
    ` : `` }
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
    return <Pill $status={ status }>
        <Icon size={ 16 } aria-hidden="true" />
        { status }
    </Pill>
}
