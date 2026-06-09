import { useEffect, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '../atoms/Button.jsx'
import { Field, Input, Select } from '../atoms/Field.jsx'
import { api_error_message, api_post } from '../../modules/api.js'
import { login_with_passkey, register_passkey } from '../../modules/passkeys.js'
import { use_session_store } from '../../stores/session_store.js'

const Wrap = styled.main`
    display: grid;
    min-width: 0;
    min-height: 100dvh;
    align-items: center;
    padding: var(--space-l);
`

const Panel = styled.section`
    width: min(100%, 34rem);
    min-width: 0;
    margin: 0 auto;
    padding: var(--space-l);
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
`

const Header = styled.header`
    display: grid;
    gap: 0.55rem;
    margin-bottom: var(--space-l);
`

const Segments = styled.div`
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    margin-bottom: var(--space-l);
`

const Form = styled.form`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
`

const Actions = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.65rem;
`

const initial_hubs = [ `Amsterdam`, `London`, `Madrid`, `Berlin`, `Paris`, `Lisbon`, `Elsewhere`, `Request new hub` ]

/**
 * Renders login and signup forms.
 * @returns {JSX.Element} Auth panel
 */
export function AuthPanel() {

    const set_user = use_session_store( state => state.set_user )
    const navigate = useNavigate()
    const [ mode, set_mode ] = useState( `login` )
    const [ auth_method, set_auth_method ] = useState( `passkey` )
    const [ form, set_form ] = useState( {
        name: ``,
        email: ``,
        whatsapp_telephone: ``,
        hub_name: `Amsterdam`,
        requested_hub_name: ``,
        password: ``,
    } )
    const [ is_submitting, set_is_submitting ] = useState( false )

    useEffect( () => {
        if( mode === `signup` ) set_auth_method( `passkey` )
    }, [ mode ] )

    const accept_payload = payload => {
        set_user( payload.user )
        if( payload.user?.status === `accepted` ) navigate( `/`, { replace: true } )
    }

    const update_form = event => set_form( current_form => ( {
        ...current_form,
        [ event.target.name ]: event.target.value,
    } ) )

    const submit_password = async event => {
        event.preventDefault()
        set_is_submitting( true )

        try {
            const payload = mode === `signup`
                ? await api_post( `/api/signup`, form )
                : await api_post( `/api/auth/password/login`, { email: form.email, password: form.password } )

            accept_payload( payload )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        } finally {
            set_is_submitting( false )
        }
    }

    const submit_passkey = async () => {
        set_is_submitting( true )

        try {
            const payload = mode === `signup`
                ? await register_passkey( form )
                : await login_with_passkey( form.email )

            accept_payload( payload )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        } finally {
            set_is_submitting( false )
        }
    }

    return <Wrap>
        <Panel>
            <Header>
                <h1>Gratis Grapevine</h1>
                <p>Member updates, weekly summaries, and scoped questions for the community.</p>
            </Header>

            <Segments>
                <Button type="button" variant={ mode === `login` ? `primary` : `default` } onClick={ () => set_mode( `login` ) }>
                    <LogIn size={ 18 } aria-hidden="true" />
                    Login
                </Button>
                <Button type="button" variant={ mode === `signup` ? `primary` : `default` } onClick={ () => set_mode( `signup` ) }>
                    <UserPlus size={ 18 } aria-hidden="true" />
                    Signup
                </Button>
            </Segments>

            <Form onSubmit={ submit_password }>
                { mode === `signup` ? <>
                    <Field label="Name">
                        <Input name="name" value={ form.name } onChange={ update_form } autoComplete="name" required />
                    </Field>
                    <Field label="WhatsApp telephone">
                        <Input name="whatsapp_telephone" value={ form.whatsapp_telephone } onChange={ update_form } autoComplete="tel" required />
                    </Field>
                    <Field label="Hub">
                        <Select name="hub_name" value={ form.hub_name } onChange={ update_form }>
                            { initial_hubs.map( hub => <option key={ hub } value={ hub }>{ hub }</option> ) }
                        </Select>
                    </Field>
                    { form.hub_name === `Request new hub` ? <Field label="Requested hub">
                        <Input name="requested_hub_name" value={ form.requested_hub_name } onChange={ update_form } placeholder="City name" required />
                    </Field> : null }
                </> : null }

                <Field label="Email">
                    <Input name="email" value={ form.email } onChange={ update_form } autoComplete="email" type="email" required />
                </Field>

                <Segments>
                    <Button type="button" variant={ auth_method === `passkey` ? `primary` : `default` } onClick={ () => set_auth_method( `passkey` ) }>
                        <ShieldCheck size={ 18 } aria-hidden="true" />
                        Passkey
                    </Button>
                    <Button type="button" variant={ auth_method === `password` ? `primary` : `default` } onClick={ () => set_auth_method( `password` ) }>
                        <KeyRound size={ 18 } aria-hidden="true" />
                        Password
                    </Button>
                </Segments>

                { auth_method === `password` ? <Field label="Password" help={ mode === `signup` ? `Use at least 12 characters.` : null }>
                    <Input name="password" value={ form.password } onChange={ update_form } autoComplete={ mode === `signup` ? `new-password` : `current-password` } type="password" required />
                </Field> : null }

                <Actions>
                    { auth_method === `passkey` ? <Button type="button" variant="primary" disabled={ is_submitting } onClick={ submit_passkey }>
                        <ShieldCheck size={ 18 } aria-hidden="true" />
                        { mode === `signup` ? `Create with passkey` : `Login with passkey` }
                    </Button> : <Button type="submit" variant="primary" disabled={ is_submitting }>
                        <KeyRound size={ 18 } aria-hidden="true" />
                        { mode === `signup` ? `Create account` : `Login` }
                    </Button> }
                </Actions>
            </Form>
        </Panel>
    </Wrap>
}
