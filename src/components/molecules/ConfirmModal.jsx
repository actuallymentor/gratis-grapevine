import styled from 'styled-components'
import { AlertTriangle } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Modal } from '../atoms/Modal.jsx'

const Stack = styled.div`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
`

const Message = styled.p`
    color: var(--muted);
`

const Actions = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: flex-end;
`

/**
 * Renders a confirmation dialog for destructive or high-impact actions.
 * @param {Object} props - Confirmation props
 * @returns {JSX.Element|null} Confirmation modal
 */
export function ConfirmModal( { is_open, title, message, confirm_label, close, confirm, variant = `danger`, is_busy = false } ) {

    return <Modal title={ title } is_open={ is_open } close={ close }>
        <Stack>
            <Message>{ message }</Message>
            <Actions>
                <Button type="button" onClick={ close }>Cancel</Button>
                <Button type="button" variant={ variant } disabled={ is_busy } onClick={ confirm }>
                    <AlertTriangle size={ 18 } aria-hidden="true" />
                    { confirm_label }
                </Button>
            </Actions>
        </Stack>
    </Modal>
}
