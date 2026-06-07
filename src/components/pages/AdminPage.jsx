import { useEffect, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { Play, Plus } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Field, Input, Select, Textarea } from '../atoms/Field.jsx'
import { StatusPill } from '../atoms/StatusPill.jsx'
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
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
`

const InlineForm = styled.form`
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: end;
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
    const [ period, set_period ] = useState( {
        period_start: new Date().toISOString().slice( 0, 10 ),
        period_end: new Date().toISOString().slice( 0, 10 ),
    } )

    const load_admin = async () => {
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
    }

    useEffect( () => {
        load_admin().catch( error => toast.error( api_error_message( error ) ) )
    }, [] )

    const update_status = async ( user_id, status, hub_id = null ) => {
        try {
            await api_patch( `/api/admin/users/${ user_id }/status`, { status, review_message, hub_id } )
            set_review_message( `` )
            await load_admin()
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        }
    }

    const update_role = async ( user_id, role ) => {
        try {
            await api_patch( `/api/admin/users/${ user_id }/role`, { role } )
            await load_admin()
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        }
    }

    const create_password_reset = async user_id => {
        try {
            const payload = await api_post( `/api/admin/users/${ user_id }/password-reset`, {} )
            await navigator.clipboard?.writeText( payload.reset_token )
            toast.success( `Reset token copied: ${ payload.reset_token }` )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        }
    }

    const create_hub = async event => {
        event.preventDefault()
        if( !new_hub.trim() ) return

        try {
            await api_post( `/api/admin/hubs`, { name: new_hub.trim() } )
            set_new_hub( `` )
            await load_admin()
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        }
    }

    const generate_summary = async event => {
        event.preventDefault()

        try {
            await api_post( `/api/admin/grapevine/generate`, period )
            await load_admin()
            toast.success( `Grapevine update generated.` )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        }
    }

    return <Page>
        <h1>Admin</h1>

        <Panel>
            <h2>Review queue and members</h2>
            <Field label="Review message">
                <Textarea value={ review_message } onChange={ event => set_review_message( event.target.value ) } />
            </Field>
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
                        { users.map( user => <tr key={ user.id }>
                            <td>{ user.name }</td>
                            <td>{ user.hub_name || user.requested_hub_name || `Elsewhere` }</td>
                            <td><StatusPill status={ user.status } /></td>
                            <td>
                                <Select value={ user.role } onChange={ event => update_role( user.id, event.target.value ) }>
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
                                    <Select aria-label="Hub" defaultValue={ user.hub_id || `hub_elsewhere` } onChange={ event => update_status( user.id, user.status, event.target.value ) }>
                                        { hubs.map( hub => <option key={ hub.id } value={ hub.id }>{ hub.name }</option> ) }
                                    </Select>
                                    <Button type="button" onClick={ () => update_status( user.id, `accepted` ) }>Approve</Button>
                                    <Button type="button" onClick={ () => update_status( user.id, `pending` ) }>Pending</Button>
                                    <Button type="button" variant="danger" onClick={ () => update_status( user.id, `blocked` ) }>Block</Button>
                                    <Button type="button" onClick={ () => create_password_reset( user.id ) }>Reset</Button>
                                </InlineForm>
                            </td>
                        </tr> ) }
                    </tbody>
                </table>
            </TableWrap>
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
            <InlineForm onSubmit={ generate_summary }>
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
    </Page>
}
