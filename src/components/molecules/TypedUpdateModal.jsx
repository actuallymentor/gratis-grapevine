import { useEffect, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { Send } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Field, Textarea } from '../atoms/Field.jsx'
import { Modal } from '../atoms/Modal.jsx'
import { api_error_message, api_post } from '../../modules/api.js'
import { delete_draft, enqueue_write, get_draft, set_draft } from '../../modules/offline_store.js'

const Form = styled.form`
    display: grid;
    gap: var(--space-m);
`

const Meta = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.9rem;
`

/**
 * Renders typed update submission.
 * @param {Object} props - Modal props
 * @returns {JSX.Element|null} Modal
 */
export function TypedUpdateModal( { is_open, close } ) {

    const [ body, set_body ] = useState( `` )
    const [ is_submitting, set_is_submitting ] = useState( false )

    useEffect( () => {
        if( !is_open ) return
        get_draft( `typed-update` ).then( draft => {
            if( draft?.value?.body ) set_body( draft.value.body )
        } )
    }, [ is_open ] )

    useEffect( () => {
        if( is_open ) set_draft( `typed-update`, { body } )
    }, [ body, is_open ] )

    const submit_update = async event => {
        event.preventDefault()
        if( !body.trim() ) return

        set_is_submitting( true )

        try {
            const payload = { body: body.trim(), source: `typed` }
            if( navigator.onLine ) {
                await api_post( `/api/messages`, payload )
            } else {
                await enqueue_write( { action: `create_message`, body: payload } )
            }

            await delete_draft( `typed-update` )
            set_body( `` )
            toast.success( navigator.onLine ? `Update submitted.` : `Update queued.` )
            window.dispatchEvent( new Event( `grapevine:messages-changed` ) )
            close()
        } catch ( error ) {
            if( !navigator.onLine ) {
                await enqueue_write( { action: `create_message`, body: { body: body.trim(), source: `typed` } } )
                toast.success( `Update queued.` )
                window.dispatchEvent( new Event( `grapevine:messages-changed` ) )
                close()
            } else {
                toast.error( api_error_message( error ) )
            }
        } finally {
            set_is_submitting( false )
        }
    }

    return <Modal title="Type update" is_open={ is_open } close={ close }>
        <Form onSubmit={ submit_update }>
            <Field label="Update">
                <Textarea value={ body } onChange={ event => set_body( event.target.value ) } placeholder="Share what should go into the Grapevine." />
            </Field>
            <Meta>
                <span>{ body.trim().length } characters</span>
                { body ? <span>Draft saved locally</span> : null }
            </Meta>
            <Button type="submit" variant="primary" disabled={ is_submitting || !body.trim() }>
                <Send size={ 18 } aria-hidden="true" />
                Submit update
            </Button>
        </Form>
    </Modal>
}
