import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router'
import { ArrowLeft, CircleHelp, Home, MapPin, Search, UserRound } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { EmptyState, LoadingBlock } from '../atoms/StateBlock.jsx'
import { Field, Input, Select, Textarea } from '../atoms/Field.jsx'
import { MarkdownBlock } from '../atoms/MarkdownBlock.jsx'
import { Modal } from '../atoms/Modal.jsx'
import { api_error_message, api_get, api_post } from '../../modules/api.js'
import { get_cached_value, set_cached_value } from '../../modules/offline_store.js'

const Stack = styled.form`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
`

const Segments = styled.div`
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
    gap: 0.5rem;
`

const ChoicePrompt = styled.p`
    color: var(--muted);
`

const CheckboxList = styled.div`
    display: grid;
    max-height: 12rem;
    gap: 0.4rem;
    overflow: auto;
    padding: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-raised);
`

const FilterTools = styled.div`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
`

const CheckboxRow = styled.label`
    display: flex;
    min-width: 0;
    min-height: 44px;
    align-items: center;
    gap: 0.6rem;
    overflow-wrap: anywhere;
`

const ChipList = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.45rem;
`

const Chip = styled.button`
    display: inline-flex;
    max-width: 100%;
    min-width: 0;
    min-height: 44px;
    align-items: center;
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--accent-dark);
    border-radius: 999px;
    color: var(--on-accent);
    background: var(--accent);
    font-weight: 700;
    overflow-wrap: anywhere;
    text-align: left;
`

const Answer = styled.section`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
    padding-top: var(--space-m);
    border-top: 1px solid var(--line);
`

const windows = [
    [ `last_week`, `Last week` ],
    [ `last_month`, `Last month` ],
    [ `last_quarter`, `Last quarter` ],
    [ `last_year`, `Last year` ],
]

const ask_choice_prompt_id = `ask-grapevine-choice-prompt`
const filters_cache_key = `grapevine-filters`
const max_question_characters = 1_200
const max_filter_choices = 50

/**
 * Renders the ad hoc Grapevine query flow.
 * @param {Object} props - Modal props
 * @returns {JSX.Element|null} Modal
 */
export function AskGrapevineModal( { is_open, close } ) {

    const navigate = useNavigate()
    const filter_request = useRef( 0 )
    const filters_loaded = useRef( false )
    const query_request = useRef( 0 )
    const [ ask_kind, set_ask_kind ] = useState( null )
    const [ time_window, set_time_window ] = useState( `last_month` )
    const [ hubs, set_hubs ] = useState( [] )
    const [ members, set_members ] = useState( [] )
    const [ hub_ids, set_hub_ids ] = useState( [] )
    const [ user_ids, set_user_ids ] = useState( [] )
    const [ filter_query, set_filter_query ] = useState( `` )
    const [ question, set_question ] = useState( `` )
    const [ answer, set_answer ] = useState( null )
    const [ has_submitted, set_has_submitted ] = useState( false )
    const [ is_submitting, set_is_submitting ] = useState( false )
    const [ is_loading_filters, set_is_loading_filters ] = useState( false )
    const [ filter_source, set_filter_source ] = useState( `network` )

    const is_people_flow = ask_kind === `people`
    const is_hubs_flow = ask_kind === `hubs`
    const is_question_flow = ask_kind === `question`
    const selected_hub_filters = hubs.filter( hub => hub_ids.includes( hub.id ) ).map( hub => ( { type: `hub`, id: hub.id, label: `Hub: ${ hub.name }` } ) )
    const selected_member_filters = members.filter( member => user_ids.includes( member.id ) ).map( member => ( {
        type: `member`,
        id: member.id,
        label: `Person: ${ member.name }${ member.hub ? ` · ${ member.hub }` : `` }`,
    } ) )
    const selected_filters = is_hubs_flow ? selected_hub_filters : is_people_flow ? selected_member_filters : []
    const normalized_filter_query = filter_query.trim().toLocaleLowerCase()
    const visible_hubs = hubs.filter( hub => !normalized_filter_query || hub.name.toLocaleLowerCase().includes( normalized_filter_query ) )
    const visible_members = members.filter( member => !normalized_filter_query || [ member.name, member.hub ].some( value => `${ value || `` }`.toLocaleLowerCase().includes( normalized_filter_query ) ) )
    const ask_disabled = is_submitting
        || is_people_flow && user_ids.length === 0
        || is_hubs_flow && hub_ids.length === 0
        || is_question_flow && !question.trim()
        || !ask_kind

    useEffect( () => {
        filter_request.current += 1
        query_request.current += 1
        filters_loaded.current = false
        set_is_submitting( false )
        set_is_loading_filters( false )

        if( !is_open ) return

        set_ask_kind( null )
        set_time_window( `last_month` )
        set_hubs( [] )
        set_members( [] )
        set_hub_ids( [] )
        set_user_ids( [] )
        set_filter_query( `` )
        set_question( `` )
        set_answer( null )
        set_has_submitted( false )
        set_filter_source( `network` )
    }, [ is_open ] )

    useEffect( () => {
        if( !is_open || ![ `people`, `hubs` ].includes( ask_kind ) ) return

        if( filters_loaded.current ) return

        const request_id = filter_request.current + 1
        filter_request.current = request_id
        const request_is_current = () => filter_request.current === request_id

        const load_filters = async () => {
            set_is_loading_filters( true )

            try {
                const filter_payload = await api_get( `/api/grapevine/filters` )
                if( !request_is_current() ) return

                filters_loaded.current = true
                set_hubs( filter_payload.hubs )
                set_members( filter_payload.members )
                set_filter_source( `network` )
                await set_cached_value( filters_cache_key, {
                    hubs: filter_payload.hubs,
                    members: filter_payload.members,
                } )
            } catch {
                const cached_filters = await get_cached_value( filters_cache_key )
                if( !request_is_current() ) return

                const cached_value = cached_filters?.value || {}
                filters_loaded.current = true
                set_hubs( cached_value.hubs || [] )
                set_members( cached_value.members || [] )
                set_filter_source( cached_value.hubs || cached_value.members ? `cache` : `unavailable` )
            } finally {
                if( request_is_current() ) set_is_loading_filters( false )
            }
        }

        load_filters()

        return () => {
            filter_request.current += 1
        }
    }, [ is_open, ask_kind ] )

    const choose_ask_kind = next_kind => {
        filter_request.current += 1
        query_request.current += 1
        set_ask_kind( next_kind )
        set_filter_query( `` )
        set_answer( null )
        set_has_submitted( false )
        set_is_loading_filters( false )
        set_is_submitting( false )

        if( next_kind !== `people` ) set_user_ids( [] )
        if( next_kind !== `hubs` ) set_hub_ids( [] )
        if( next_kind !== `question` ) set_question( `` )
    }

    const toggle_value = ( value, values, set_values ) => {
        if( !values.includes( value ) && values.length >= max_filter_choices ) {
            toast.error( `Choose fewer filters.` )
            return
        }

        set_values( values.includes( value ) ? values.filter( item => item !== value ) : [ ...values, value ] )
    }

    const clear_filter = filter => {
        if( filter.type === `hub` ) set_hub_ids( current_ids => current_ids.filter( id => id !== filter.id ) )

        if( filter.type === `member` ) set_user_ids( current_ids => current_ids.filter( id => id !== filter.id ) )
    }

    const submit_query = async event => {
        event.preventDefault()
        if( ask_disabled ) return

        const request_id = query_request.current + 1
        query_request.current = request_id
        const request_is_current = () => query_request.current === request_id
        set_is_submitting( true )
        set_has_submitted( true )
        set_answer( null )

        try {
            const payload = await api_post( `/api/grapevine/query`, {
                mode: is_question_flow ? `question` : `scope`,
                time_window,
                hub_ids: is_hubs_flow ? hub_ids : [],
                user_ids: is_people_flow ? user_ids : [],
                question: is_question_flow ? question : ``,
            } )
            if( !request_is_current() ) return

            set_answer( payload.answer )
        } catch ( error ) {
            if( !request_is_current() ) return

            set_has_submitted( false )
            toast.error( api_error_message( error ) )
        } finally {
            if( request_is_current() ) set_is_submitting( false )
        }
    }

    const close_to_home = () => {
        close()
        navigate( `/` )
    }

    if( has_submitted ) return <Modal title="Ask Grapevine" is_open={ is_open } close={ close_to_home }>
        <Answer aria-live="polite">
            { is_submitting ? <LoadingBlock label="Asking Grapevine" /> : null }
            { !is_submitting && answer ? <MarkdownBlock markdown={ answer.markdown } /> : null }
            { !is_submitting && !answer ? <EmptyState title="Grapevine answer unavailable">
                Try again once the Grapevine is reachable.
            </EmptyState> : null }
            { !is_submitting ? <Button type="button" variant="primary" onClick={ close_to_home }>
                <Home size={ 18 } aria-hidden="true" />
                Back home
            </Button> : null }
        </Answer>
    </Modal>

    return <Modal title="Ask Grapevine" is_open={ is_open } close={ close }>
        <Stack onSubmit={ submit_query }>
            { !ask_kind ? <>
                <ChoicePrompt id={ ask_choice_prompt_id }>What do you want to ask about?</ChoicePrompt>
                <Segments role="group" aria-labelledby={ ask_choice_prompt_id }>
                    <Button type="button" onClick={ () => choose_ask_kind( `people` ) }>
                        <UserRound size={ 18 } aria-hidden="true" />
                        Specific people
                    </Button>
                    <Button type="button" onClick={ () => choose_ask_kind( `hubs` ) }>
                        <MapPin size={ 18 } aria-hidden="true" />
                        Specific hubs
                    </Button>
                    <Button type="button" onClick={ () => choose_ask_kind( `question` ) }>
                        <CircleHelp size={ 18 } aria-hidden="true" />
                        Open question
                    </Button>
                </Segments>
            </> : <>
                <Button type="button" variant="ghost" onClick={ () => choose_ask_kind( null ) }>
                    <ArrowLeft size={ 18 } aria-hidden="true" />
                    Ask something else
                </Button>

                <Field label="Time span">
                    <Select value={ time_window } onChange={ event => set_time_window( event.target.value ) }>
                        { windows.map( ( [ value, label ] ) => <option key={ value } value={ value }>{ label }</option> ) }
                    </Select>
                </Field>

                { ( is_people_flow || is_hubs_flow ) && filter_source === `cache` ? <p>Showing cached filters.</p> : null }

                { is_people_flow || is_hubs_flow ? <>
                    { selected_filters.length ? <ChipList aria-label="Selected filters">
                        { selected_filters.map( filter => <Chip key={ `${ filter.type }:${ filter.id }` } type="button" onClick={ () => clear_filter( filter ) }>
                            { filter.label }
                        </Chip> ) }
                    </ChipList> : null }
                    <FilterTools>
                        <Field label={ is_people_flow ? `Find people` : `Find hubs` }>
                            <Input value={ filter_query } onChange={ event => set_filter_query( event.target.value ) } autoComplete="off" />
                        </Field>
                        { is_loading_filters ? <LoadingBlock label="Loading filters" /> : null }
                        { !is_loading_filters && filter_source === `unavailable` ? <EmptyState title="Filters unavailable">
                            Open Ask Grapevine once online to cache filters.
                        </EmptyState> : null }
                        { is_hubs_flow ? <Field label="Hubs">
                            <CheckboxList>
                                { visible_hubs.map( hub => <CheckboxRow key={ hub.id }>
                                    <input type="checkbox" checked={ hub_ids.includes( hub.id ) } onChange={ () => toggle_value( hub.id, hub_ids, set_hub_ids ) } />
                                    { hub.name }
                                </CheckboxRow> ) }
                                { !is_loading_filters && visible_hubs.length === 0 ? <p>No hubs match.</p> : null }
                            </CheckboxList>
                        </Field> : null }
                        { is_people_flow ? <Field label="People">
                            <CheckboxList>
                                { visible_members.map( member => <CheckboxRow key={ member.id }>
                                    <input type="checkbox" checked={ user_ids.includes( member.id ) } onChange={ () => toggle_value( member.id, user_ids, set_user_ids ) } />
                                    { member.name } · { member.hub }
                                </CheckboxRow> ) }
                                { !is_loading_filters && visible_members.length === 0 ? <p>No people match.</p> : null }
                            </CheckboxList>
                        </Field> : null }
                    </FilterTools>
                </> : null }

                { is_question_flow ? <Field label="Question">
                    <Textarea value={ question } maxLength={ max_question_characters } onChange={ event => set_question( event.target.value ) } />
                </Field> : null }

                <Button type="submit" variant="primary" disabled={ ask_disabled }>
                    <Search size={ 18 } aria-hidden="true" />
                    Ask
                </Button>

                { is_submitting ? <LoadingBlock label="Asking Grapevine" /> : null }
            </> }
        </Stack>
    </Modal>
}
