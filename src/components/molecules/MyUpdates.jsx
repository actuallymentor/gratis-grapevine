import { useEffect, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { Clock, PencilLine, Save, Trash2, X } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Field, Textarea } from '../atoms/Field.jsx'
import { EmptyState, LoadingBlock } from '../atoms/StateBlock.jsx'
import { ConfirmModal } from './ConfirmModal.jsx'
import { api_delete, api_error_message, api_get, api_patch } from '../../modules/api.js'
import { enqueue_write, get_cached_value, set_cached_value } from '../../modules/offline_store.js'

const Section = styled.section`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
    padding-top: var(--space-l);
    border-top: 1px solid var(--line);
`

const List = styled.div`
    display: grid;
    min-width: 0;
    gap: 0.75rem;
`

const UpdateRow = styled.article`
    display: grid;
    min-width: 0;
    gap: 0.7rem;
    padding: 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
`

const Meta = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    color: var(--muted);
    font-size: 0.9rem;
`

const Actions = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.6rem;
`

const TinyStatus = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
`

const QueueStatus = styled.span`
    display: inline-flex;
    min-height: 1.7rem;
    align-items: center;
    padding: 0.15rem 0.45rem;
    border: 1px solid #e3c693;
    border-radius: 999px;
    color: #67400f;
    background: #fff7e7;
    font-weight: 700;
`

const changed_event = `grapevine:messages-changed`

/**
 * Renders the accepted member's own submitted updates with edit/delete controls.
 * @param {Object} props - Update list props
 * @param {string} props.title - Section heading
 * @returns {JSX.Element} Recent update manager
 */
export function MyUpdates( { title = `Your updates` } = {} ) {

    const [ messages, set_messages ] = useState( [] )
    const [ editing_id, set_editing_id ] = useState( null )
    const [ draft_body, set_draft_body ] = useState( `` )
    const [ is_saving, set_is_saving ] = useState( false )
    const [ is_loading, set_is_loading ] = useState( true )
    const [ data_source, set_data_source ] = useState( `network` )
    const [ delete_target, set_delete_target ] = useState( null )

    const cache_messages = async next_messages => {
        set_messages( next_messages )
        await set_cached_value( `my-updates`, next_messages )
    }

    const load_messages = async () => {
        set_is_loading( true )

        try {
            const payload = await api_get( `/api/messages` )
            set_data_source( `network` )
            await cache_messages( payload.messages )
        } catch {
            const cached = await get_cached_value( `my-updates` )
            set_messages( cached?.value || [] )
            set_data_source( cached?.value ? `cache` : `unavailable` )
        } finally {
            set_is_loading( false )
        }
    }

    useEffect( () => {
        load_messages()
        window.addEventListener( changed_event, load_messages )
        return () => window.removeEventListener( changed_event, load_messages )
    }, [] )

    const start_edit = message => {
        set_editing_id( message.id )
        set_draft_body( message.body )
    }

    const cancel_edit = () => {
        set_editing_id( null )
        set_draft_body( `` )
    }

    const save_edit = async message => {
        const next_body = draft_body.trim()
        if( !next_body ) return

        set_is_saving( true )

        try {
            const next_message = navigator.onLine
                ? ( await api_patch( `/api/messages/${ message.id }`, { body: next_body } ) ).message
                : {
                    ...message,
                    body: next_body,
                    updated_at: new Date().toISOString(),
                    sync_status: `pending edit`,
                }

            if( !navigator.onLine ) await enqueue_write( {
                action: `update_message`,
                message_id: message.id,
                body: { body: next_body },
            } )

            await cache_messages( messages.map( item => item.id === message.id ? next_message : item ) )
            cancel_edit()
            toast.success( navigator.onLine ? `Update saved.` : `Edit queued.` )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        } finally {
            set_is_saving( false )
        }
    }

    const delete_update = async message => {
        set_is_saving( true )

        try {
            if( navigator.onLine ) await api_delete( `/api/messages/${ message.id }` )
            else await enqueue_write( { action: `delete_message`, message_id: message.id } )

            await cache_messages( messages.filter( item => item.id !== message.id ) )
            set_delete_target( null )
            toast.success( navigator.onLine ? `Update deleted.` : `Delete queued.` )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        } finally {
            set_is_saving( false )
        }
    }

    return <Section>
        <h2>{ title }</h2>
        { data_source === `cache` ? <p>Showing cached updates.</p> : null }
        { is_loading ? <LoadingBlock label="Loading your updates" /> : null }
        <List>
            { !is_loading ? messages.map( message => <UpdateRow key={ message.id }>
                <Meta>
                    <TinyStatus><Clock size={ 15 } aria-hidden="true" />{ message.created_at?.slice( 0, 10 ) || `Draft date` }</TinyStatus>
                    <span>{ message.source?.replaceAll( `_`, ` ` ) || `update` }</span>
                    { message.sync_status ? <QueueStatus>{ message.sync_status }</QueueStatus> : null }
                </Meta>

                { editing_id === message.id ? <>
                    <Field label="Edit update">
                        <Textarea value={ draft_body } onChange={ event => set_draft_body( event.target.value ) } />
                    </Field>
                    <Actions>
                        <Button type="button" variant="primary" disabled={ is_saving || !draft_body.trim() } onClick={ () => save_edit( message ) }>
                            <Save size={ 18 } aria-hidden="true" />
                            Save
                        </Button>
                        <Button type="button" onClick={ cancel_edit }>
                            <X size={ 18 } aria-hidden="true" />
                            Cancel
                        </Button>
                    </Actions>
                </> : <>
                    <p>{ message.body }</p>
                    <Actions>
                        <Button type="button" onClick={ () => start_edit( message ) }>
                            <PencilLine size={ 18 } aria-hidden="true" />
                            Edit
                        </Button>
                        <Button type="button" variant="danger" disabled={ is_saving } onClick={ () => set_delete_target( message ) }>
                            <Trash2 size={ 18 } aria-hidden="true" />
                            Delete
                        </Button>
                    </Actions>
                </> }
            </UpdateRow> ) : null }

            { !is_loading && messages.length === 0 ? <EmptyState title={ data_source === `unavailable` ? `Updates unavailable` : `No submitted updates yet` }>
                { data_source === `unavailable` ? `Open your updates once online to keep them available offline.` : `Submitted updates will appear here for editing or deletion.` }
            </EmptyState> : null }
        </List>
        <ConfirmModal
            is_open={ Boolean( delete_target ) }
            title="Delete update"
            message="Delete this update from future Grapevine summaries and questions?"
            confirm_label="Delete"
            close={ () => set_delete_target( null ) }
            confirm={ () => delete_target ? delete_update( delete_target ) : null }
            is_busy={ is_saving }
        />
    </Section>
}
