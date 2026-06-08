import { useEffect, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { Ban, KeyRound, Mail, MessageCircle, Play, Plus, UserCheck } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Field, Input, Select, Textarea } from '../atoms/Field.jsx'
import { LoadingBlock } from '../atoms/StateBlock.jsx'
import { StatusPill } from '../atoms/StatusPill.jsx'
import { ConfirmModal } from '../molecules/ConfirmModal.jsx'
import { api_error_message, api_get, api_patch, api_post } from '../../modules/api.js'

const Page = styled.section`
    display: grid;
    gap: var(--space-xl);
`

const Panel = styled.section`
    display: grid;
    gap: var(--space-m);
    padding-top: var(--space-l);
    border-top: 1px solid var(--line);
`

const TableWrap = styled.div`
    display: none;

    @media (min-width: 860px) {
        display: block;
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
    }
`

const InlineForm = styled.form`
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: end;
`

const UserCards = styled.div`
    display: grid;
    gap: var(--space-m);

    @media (min-width: 860px) {
        display: none;
    }
`

const UserCard = styled.article`
    display: grid;
    gap: var(--space-m);
    padding: var(--space-m);
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
`

const UserCardHeader = styled.header`
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
    justify-content: space-between;
`

const DetailGrid = styled.div`
    display: grid;
    gap: 0.55rem;
`

const ContactLinks = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
`

/**
 * Renders the admin console.
 * @returns {JSX.Element} Admin page
 */
export function AdminPage() {

    const [ users, set_users ] = useState( [] )
    const [ hubs, set_hubs ] = useState( [] )
    const [ ai_requests, set_ai_requests ] = useState( [] )
    const [ messages, set_messages ] = useState( [] )
    const [ review_message, set_review_message ] = useState( `` )
    const [ new_hub, set_new_hub ] = useState( `` )
    const [ is_loading, set_is_loading ] = useState( true )
    const [ is_confirming, set_is_confirming ] = useState( false )
    const [ pending_action, set_pending_action ] = useState( null )
    const [ period, set_period ] = useState( {
        period_start: new Date().toISOString().slice( 0, 10 ),
        period_end: new Date().toISOString().slice( 0, 10 ),
    } )

    const load_admin = async ( { silent = false } = {} ) => {
        if( !silent ) set_is_loading( true )

        try {
            const [ user_payload, hub_payload, usage_payload, message_payload ] = await Promise.all( [
                api_get( `/api/admin/users` ),
                api_get( `/api/admin/hubs` ),
                api_get( `/api/admin/ai-requests` ),
                api_get( `/api/admin/messages` ),
            ] )

            set_users( user_payload.users )
            set_hubs( hub_payload.hubs )
            set_ai_requests( usage_payload.ai_requests )
            set_messages( message_payload.messages )
        } finally {
            set_is_loading( false )
        }
    }

    useEffect( () => {
        load_admin().catch( error => {
            set_is_loading( false )
            toast.error( api_error_message( error ) )
        } )
    }, [] )

    const run_admin_request = async request => {
        try {
            await request()
            await load_admin( { silent: true } )
            return true
        } catch ( error ) {
            toast.error( api_error_message( error ) )
            return false
        }
    }

    const update_status = async ( user_id, status, hub_id = null ) => {
        return run_admin_request( async () => {
            await api_patch( `/api/admin/users/${ user_id }/status`, { status, review_message, hub_id } )
            set_review_message( `` )
        } )
    }

    const update_role = async ( user_id, role ) => {
        return run_admin_request( async () => {
            await api_patch( `/api/admin/users/${ user_id }/role`, { role } )
        } )
    }

    const create_password_reset = async user_id => {
        try {
            const payload = await api_post( `/api/admin/users/${ user_id }/password-reset`, {} )
            await navigator.clipboard?.writeText( payload.reset_token )
            toast.success( `Reset token copied: ${ payload.reset_token }` )
            return true
        } catch ( error ) {
            toast.error( api_error_message( error ) )
            return false
        }
    }

    const create_hub = async event => {
        event.preventDefault()
        if( !new_hub.trim() ) return

        try {
            await api_post( `/api/admin/hubs`, { name: new_hub.trim() } )
            set_new_hub( `` )
            await load_admin( { silent: true } )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        }
    }

    const generate_summary = async () => {
        const did_generate = await run_admin_request( async () => {
            await api_post( `/api/admin/grapevine/generate`, period )
        } )

        if( did_generate ) toast.success( `Grapevine update generated.` )
        return did_generate
    }

    const confirm_action = action => set_pending_action( action )

    const run_pending_action = async () => {
        if( !pending_action ) return

        set_is_confirming( true )
        const did_complete = await pending_action.run()
        set_is_confirming( false )
        if( did_complete !== false ) set_pending_action( null )
    }

    const confirm_status_update = ( user, status ) => {
        confirm_action( {
            title: status === `blocked` ? `Block member` : `Move member to pending`,
            message: status === `blocked`
                ? `Block ${ user.name } and prevent access until an admin changes the status?`
                : `Move ${ user.name } back to pending review?`,
            confirm_label: status === `blocked` ? `Block` : `Move to pending`,
            variant: status === `blocked` ? `danger` : `default`,
            run: () => update_status( user.id, status ),
        } )
    }

    const confirm_role_update = ( user, role ) => {
        confirm_action( {
            title: `Change role`,
            message: `Change ${ user.name } to ${ role }?`,
            confirm_label: `Change role`,
            variant: role === `admin` ? `primary` : `default`,
            run: () => update_role( user.id, role ),
        } )
    }

    const confirm_password_reset = user => {
        confirm_action( {
            title: `Create reset token`,
            message: `Create and copy a password reset token for ${ user.name }?`,
            confirm_label: `Create token`,
            variant: `primary`,
            run: () => create_password_reset( user.id ),
        } )
    }

    const confirm_generate_summary = event => {
        event.preventDefault()
        confirm_action( {
            title: `Generate Grapevine`,
            message: `Generate a Grapevine update for ${ period.period_start } to ${ period.period_end }?`,
            confirm_label: `Generate`,
            variant: `primary`,
            run: generate_summary,
        } )
    }

    const render_user_actions = user => {

        return <>
            <Select aria-label="Hub" defaultValue={ user.hub_id || `hub_elsewhere` } onChange={ event => update_status( user.id, user.status, event.target.value ) }>
                { hubs.map( hub => <option key={ hub.id } value={ hub.id }>{ hub.name }</option> ) }
            </Select>
            <Button type="button" onClick={ () => update_status( user.id, `accepted` ) }>
                <UserCheck size={ 18 } aria-hidden="true" />
                Approve
            </Button>
            <Button type="button" onClick={ () => confirm_status_update( user, `pending` ) }>Pending</Button>
            <Button type="button" variant="danger" onClick={ () => confirm_status_update( user, `blocked` ) }>
                <Ban size={ 18 } aria-hidden="true" />
                Block
            </Button>
            <Button type="button" onClick={ () => confirm_password_reset( user ) }>
                <KeyRound size={ 18 } aria-hidden="true" />
                Reset
            </Button>
        </>
    }

    return <Page>
        <h1>Admin</h1>

        <Panel>
            <h2>Review queue and members</h2>
            <Field label="Review message">
                <Textarea value={ review_message } onChange={ event => set_review_message( event.target.value ) } />
            </Field>
            { is_loading ? <LoadingBlock label="Loading admin console" /> : null }
            <TableWrap>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Hub</th>
                            <th>Status</th>
                            <th>Role</th>
                            <th>Contact</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        { !is_loading ? users.map( user => <tr key={ user.id }>
                            <td>{ user.name }</td>
                            <td>{ user.hub_name || user.requested_hub_name || `Elsewhere` }</td>
                            <td><StatusPill status={ user.status } /></td>
                            <td>
                                <Select value={ user.role } onChange={ event => confirm_role_update( user, event.target.value ) }>
                                    <option value="member">member</option>
                                    <option value="admin">admin</option>
                                </Select>
                            </td>
                            <td>
                                <a href={ user.email_url }>{ user.email }</a><br />
                                <a href={ user.whatsapp_url }>{ user.whatsapp_telephone }</a>
                            </td>
                            <td>
                                <InlineForm as="div">
                                    { render_user_actions( user ) }
                                </InlineForm>
                            </td>
                        </tr> ) : null }
                    </tbody>
                </table>
            </TableWrap>
            <UserCards>
                { !is_loading ? users.map( user => <UserCard key={ user.id }>
                    <UserCardHeader>
                        <h3>{ user.name }</h3>
                        <StatusPill status={ user.status } />
                    </UserCardHeader>
                    <DetailGrid>
                        <p>{ user.hub_name || user.requested_hub_name || `Elsewhere` }</p>
                        <Field label="Role">
                            <Select value={ user.role } onChange={ event => confirm_role_update( user, event.target.value ) }>
                                <option value="member">member</option>
                                <option value="admin">admin</option>
                            </Select>
                        </Field>
                        <ContactLinks>
                            <Button as="a" href={ user.email_url }>
                                <Mail size={ 18 } aria-hidden="true" />
                                Email
                            </Button>
                            <Button as="a" href={ user.whatsapp_url }>
                                <MessageCircle size={ 18 } aria-hidden="true" />
                                WhatsApp
                            </Button>
                        </ContactLinks>
                        <InlineForm as="div">{ render_user_actions( user ) }</InlineForm>
                    </DetailGrid>
                </UserCard> ) : null }
            </UserCards>
        </Panel>

        <Panel>
            <h2>Hubs</h2>
            <InlineForm onSubmit={ create_hub }>
                <Field label="New hub">
                    <Input value={ new_hub } onChange={ event => set_new_hub( event.target.value ) } />
                </Field>
                <Button type="submit" variant="primary">
                    <Plus size={ 18 } aria-hidden="true" />
                    Add hub
                </Button>
            </InlineForm>
            <p>{ hubs.length } hubs configured.</p>
        </Panel>

        <Panel>
            <h2>AI usage</h2>
            <InlineForm onSubmit={ confirm_generate_summary }>
                <Field label="Start">
                    <Input type="date" value={ period.period_start } onChange={ event => set_period( current => ( { ...current, period_start: event.target.value } ) ) } />
                </Field>
                <Field label="End">
                    <Input type="date" value={ period.period_end } onChange={ event => set_period( current => ( { ...current, period_end: event.target.value } ) ) } />
                </Field>
                <Button type="submit" variant="primary">
                    <Play size={ 18 } aria-hidden="true" />
                    Generate
                </Button>
            </InlineForm>
            <p>{ ai_requests.length } ad hoc AI requests logged. { messages.length } source updates visible to admins.</p>
        </Panel>
        <ConfirmModal
            is_open={ Boolean( pending_action ) }
            title={ pending_action?.title || `Confirm action` }
            message={ pending_action?.message || `` }
            confirm_label={ pending_action?.confirm_label || `Confirm` }
            variant={ pending_action?.variant || `danger` }
            close={ () => set_pending_action( null ) }
            confirm={ run_pending_action }
            is_busy={ is_confirming }
        />
    </Page>
}
