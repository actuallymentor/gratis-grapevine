import { useEffect, useRef, useState } from 'react'
import styled, { css } from 'styled-components'
import toast from 'react-hot-toast'
import { CircleHelp, KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '../atoms/Button.jsx'
import { Field, Input, Select } from '../atoms/Field.jsx'
import { Modal } from '../atoms/Modal.jsx'
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

    p {
        color: var(--muted);
    }
`

const Lead = styled.p`
    color: var(--ink);
    font-size: 1.08rem;
    line-height: 1.55;
`

const Segments = styled.div`
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    margin-bottom: var(--space-l);
`

const MethodGrid = styled.div`
    display: grid;
    min-width: 0;
    grid-template-columns: 1fr;
    gap: 0.5rem;

    @media (min-width: 40rem) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
`

const MethodChoice = styled.div`
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) 32px;
    align-items: center;
    gap: 0.5rem;
`

const MethodLabel = styled.label`
    display: flex;
    min-width: 0;
    min-height: 48px;
    align-items: center;
    gap: 0.55rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--surface-raised);
    cursor: pointer;
    font-weight: 800;
    overflow-wrap: anywhere;
    transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;

    &:focus-within {
        border-color: var(--focus-outline);
        box-shadow: 0 0 0 3px var(--focus-ring);
        outline: none;
    }

    ${ ( { $selected } ) => $selected && css`
        border-color: var(--accent-dark);
        background: rgb(33 26 255 / 7%);
        box-shadow: inset 0 0 0 1px var(--accent-dark);
    ` }
`

const MethodInput = styled.input`
    position: relative;
    display: inline-grid;
    width: 22px;
    min-width: 22px;
    height: 22px;
    margin: 0;
    place-items: center;
    border: 2px solid var(--muted);
    border-radius: 5px;
    appearance: none;
    background: var(--surface);
    cursor: pointer;
    transition: border-color 140ms ease, background 140ms ease;

    &::after {
        display: block;
        width: 0.42rem;
        height: 0.72rem;
        border: solid var(--on-accent);
        border-width: 0 2px 2px 0;
        content: "";
        opacity: 0;
        transform: rotate(45deg) translate(-0.04rem, -0.06rem);
    }

    &:checked {
        border-color: var(--accent-dark);
        background: var(--accent);
    }

    &:checked::after {
        opacity: 1;
    }

    &:focus-visible {
        outline: none;
    }
`

const MethodName = styled.span`
    min-width: 0;
`

const TooltipTrigger = styled.button`
    display: inline-flex;
    width: 32px;
    min-width: 32px;
    height: 32px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink);
    background: var(--surface);

    &:hover,
    &:focus-visible {
        border-color: var(--accent-dark);
    }
`

const TooltipBubble = styled.span`
    position: absolute;
    right: 0;
    bottom: calc(100% + 0.45rem);
    z-index: 4;
    width: min(18rem, calc(100vw - 4rem));
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: 0.88rem;
    font-weight: 600;
    line-height: 1.35;
    opacity: 0;
    pointer-events: none;
    transform: translateY(0.25rem);
    transition: opacity 140ms ease, transform 140ms ease;
    visibility: hidden;
`

const TooltipWrap = styled.span`
    position: relative;
    display: inline-flex;
    min-width: 0;

    ${ TooltipTrigger }:hover + ${ TooltipBubble },
    ${ TooltipTrigger }:focus + ${ TooltipBubble },
    ${ TooltipTrigger }:focus-visible + ${ TooltipBubble } {
        opacity: 1;
        transform: translateY(0);
        visibility: visible;
    }
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

const NamePromptStack = styled.div`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
`

const NamePromptActions = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: flex-end;
`

const initial_hubs = [ `Amsterdam`, `London`, `Madrid`, `Berlin`, `Paris`, `Lisbon`, `Elsewhere`, `Request new hub` ]
const auth_methods = [ `password`, `passkey` ]

function MethodHelp( { id, label, children } ) {

    return <TooltipWrap>
        <TooltipTrigger type="button" aria-label={ label } aria-describedby={ id }>
            <CircleHelp size={ 17 } aria-hidden="true" />
        </TooltipTrigger>
        <TooltipBubble id={ id } role="tooltip">{ children }</TooltipBubble>
    </TooltipWrap>
}

function MethodOption( { value, selected, icon: Icon, children, select } ) {

    return <MethodLabel $selected={ selected }>
        <MethodInput type="radio" name="auth_method" value={ value } checked={ selected } onChange={ () => select( value ) } />
        <Icon size={ 18 } aria-hidden="true" />
        <MethodName>{ children }</MethodName>
    </MethodLabel>
}

/**
 * Renders login and signup forms.
 * @returns {JSX.Element} Auth panel
 */
export function AuthPanel() {

    const set_user = use_session_store( state => state.set_user )
    const navigate = useNavigate()
    const form_ref = useRef( null )
    const name_input_ref = useRef( null )
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
    const [ accepted_single_name, set_accepted_single_name ] = useState( false )
    const [ pending_single_name_method, set_pending_single_name_method ] = useState( null )

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

    const update_name = event => {
        set_accepted_single_name( false )
        update_form( event )
    }

    const request_single_name_confirmation = method => {
        const name_words = form.name.trim().split( /\s+/ ).filter( Boolean )
        if( mode !== `signup` || accepted_single_name || name_words.length !== 1 ) return false

        set_pending_single_name_method( method )
        return true
    }

    const submit_password_request = async () => {
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

    const submit_password = async event => {
        event.preventDefault()
        if( request_single_name_confirmation( `password` ) ) return

        await submit_password_request()
    }

    const submit_passkey_request = async () => {
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

    const submit_passkey = async () => {
        if( !form_ref.current?.reportValidity() ) return
        if( request_single_name_confirmation( `passkey` ) ) return

        await submit_passkey_request()
    }

    const add_last_name = () => {
        set_pending_single_name_method( null )
        window.setTimeout( () => name_input_ref.current?.focus(), 0 )
    }

    const continue_with_single_name = async () => {
        const method = pending_single_name_method
        set_accepted_single_name( true )
        set_pending_single_name_method( null )

        if( method === `password` ) await submit_password_request()
        if( method === `passkey` ) await submit_passkey_request()
    }

    return <Wrap>
        <Panel>
            <Header>
                <h1>Sandbox, Grapevine</h1>
                <Lead>Grapevine is a community app where members share updates into one trusted place, then ask for recent context about a person, a hub, or what is moving through the community.</Lead>
                <p>Sign in or request access to add your own updates and keep up with the Grapevine.</p>
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

            <Form ref={ form_ref } onSubmit={ submit_password }>
                { mode === `signup` ? <>
                    <Field label="Name" help="Use the name people are likely to search for in the community.">
                        <Input ref={ name_input_ref } name="name" value={ form.name } onChange={ update_name } autoComplete="name" required />
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

                <MethodGrid role="radiogroup" aria-label="Sign-in method">
                    <MethodChoice>
                        <MethodOption value="passkey" selected={ auth_method === `passkey` } icon={ ShieldCheck } select={ set_auth_method }>
                            Passkey
                        </MethodOption>
                        <MethodHelp id="passkey-help" label="What is a passkey?">
                            A passkey uses your device lock, fingerprint, face, or password manager to sign in without remembering a Grapevine password.
                        </MethodHelp>
                    </MethodChoice>
                    <MethodChoice>
                        <MethodOption value="password" selected={ auth_method === `password` } icon={ KeyRound } select={ set_auth_method }>
                            Password
                        </MethodOption>
                        <MethodHelp id="password-help" label="What is a password?">
                            A password is a secret phrase you type when signing in. Use a long one and save it in a password manager.
                        </MethodHelp>
                    </MethodChoice>
                </MethodGrid>

                { auth_method === `password` ? <Field label="Password" help={ mode === `signup` ? `Use at least 12 characters. Longer phrases are easier to protect.` : `Enter the secret phrase saved for this account.` }>
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

            <Modal title="Add more of your name?" is_open={ auth_methods.includes( pending_single_name_method ) } close={ add_last_name }>
                <NamePromptStack>
                    <p>You are much easier to find if you add both your first and last name. You can go back and add more of your name, or continue anyway.</p>
                    <NamePromptActions>
                        <Button type="button" onClick={ add_last_name }>Go back and add last name</Button>
                        <Button type="button" variant="primary" disabled={ is_submitting } onClick={ continue_with_single_name }>
                            Continue anyway
                        </Button>
                    </NamePromptActions>
                </NamePromptStack>
            </Modal>
        </Panel>
    </Wrap>
}
