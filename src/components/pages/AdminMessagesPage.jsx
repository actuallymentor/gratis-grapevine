import { useEffect, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { Clock, UserRound } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Modal } from '../atoms/Modal.jsx'
import { EmptyState, LoadingBlock } from '../atoms/StateBlock.jsx'
import { api_error_message, api_get } from '../../modules/api.js'

const Page = styled.section`
    display: grid;
    min-width: 0;
    gap: var(--space-l);
`

const Header = styled.header`
    display: grid;
    min-width: 0;
    gap: 0.55rem;

    p {
        color: var(--muted);
    }
`

const MessageList = styled.div`
    display: grid;
    min-width: 0;
    gap: 0.65rem;
`

const MessageRow = styled.article`
    display: grid;
    min-width: 0;
    gap: 0.55rem;
    padding: 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
`

const RowActions = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.55rem;
`

const Meta = styled.p`
    color: var(--muted);
    font-size: 0.92rem;
`

const MessageBody = styled.p`
    white-space: pre-wrap;
`

const format_date = value => value?.slice( 0, 10 ) || `Unknown date`

/**
 * Renders an admin-only overview of submitted Grapevine messages.
 * @returns {JSX.Element} Admin messages page
 */
export function AdminMessagesPage() {

    const [ messages, set_messages ] = useState( [] )
    const [ selected_message, set_selected_message ] = useState( null )
    const [ is_loading, set_is_loading ] = useState( true )
    const [ is_loading_detail, set_is_loading_detail ] = useState( false )

    useEffect( () => {
        const load_messages = async () => {
            set_is_loading( true )

            try {
                const payload = await api_get( `/api/admin/messages` )
                set_messages( payload.messages || [] )
            } catch ( error ) {
                toast.error( api_error_message( error ) )
            } finally {
                set_is_loading( false )
            }
        }

        load_messages()
    }, [] )

    const open_message = async message => {
        set_is_loading_detail( true )

        try {
            const payload = await api_get( `/api/admin/messages/${ message.id }` )
            set_selected_message( payload.message )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        } finally {
            set_is_loading_detail( false )
        }
    }

    return <Page>
        <Header>
            <h1>Messages overview</h1>
            <p>A quiet ledger of submitted Grapevine updates.</p>
        </Header>

        { is_loading ? <LoadingBlock label="Loading messages overview" /> : null }

        <MessageList aria-label="Submitted Grapevine messages">
            { !is_loading ? messages.map( message => <MessageRow key={ message.id }>
                <RowActions>
                    <Button type="button" variant="ghost" onClick={ () => open_message( message ) } disabled={ is_loading_detail }>
                        <Clock size={ 18 } aria-hidden="true" />
                        { format_date( message.created_at ) }
                    </Button>
                    <Button type="button" variant="ghost" onClick={ () => open_message( message ) } disabled={ is_loading_detail }>
                        <UserRound size={ 18 } aria-hidden="true" />
                        { message.author_name || `Unknown member` }
                    </Button>
                </RowActions>
            </MessageRow> ) : null }

            { !is_loading && messages.length === 0 ? <EmptyState title="No messages yet">
                Submitted Grapevine messages will appear here.
            </EmptyState> : null }
        </MessageList>

        <Modal title={ selected_message ? `Message from ${ selected_message.author_name || `member` }` : `Message` } is_open={ Boolean( selected_message ) } close={ () => set_selected_message( null ) }>
            { selected_message ? <>
                <Meta>
                    { format_date( selected_message.created_at ) } · { selected_message.hub_name || `Elsewhere` } · { selected_message.source?.replaceAll( `_`, ` ` ) || `message` }
                </Meta>
                <MessageBody>{ selected_message.body }</MessageBody>
            </> : null }
        </Modal>
    </Page>
}
