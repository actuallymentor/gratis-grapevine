import { useEffect, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { Search } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { EmptyState, LoadingBlock } from '../atoms/StateBlock.jsx'
import { Field, Input, Select, Textarea } from '../atoms/Field.jsx'
import { MarkdownBlock } from '../atoms/MarkdownBlock.jsx'
import { Modal } from '../atoms/Modal.jsx'
import { api_error_message, api_get, api_post } from '../../modules/api.js'
import { get_cached_value, set_cached_value } from '../../modules/offline_store.js'

const Stack = styled.form`
    display: grid;
    gap: var(--space-m);
`

const Segments = styled.div`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
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
    gap: var(--space-m);
`

const CheckboxRow = styled.label`
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 0.6rem;
`

const ChipList = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
`

const Chip = styled.button`
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--accent-dark);
    border-radius: 999px;
    color: var(--on-accent);
    background: var(--accent);
    font-weight: 700;
`

const Answer = styled.section`
    display: grid;
    gap: var(--space-m);
    padding-top: var(--space-m);
    border-top: 1px solid var(--line);
`

const Metadata = styled.details`
    color: var(--muted);
    font-size: 0.92rem;
`

const windows = [
    [ `last_week`, `Last week` ],
    [ `last_month`, `Last month` ],
    [ `last_quarter`, `Last quarter` ],
    [ `last_year`, `Last year` ],
]

/**
 * Renders the ad hoc Grapevine query flow.
 * @param {Object} props - Modal props
 * @returns {JSX.Element|null} Modal
 */
export function AskGrapevineModal( { is_open, close } ) {

    const [ mode, set_mode ] = useState( `scope` )
    const [ time_window, set_time_window ] = useState( `last_month` )
    const [ hubs, set_hubs ] = useState( [] )
    const [ members, set_members ] = useState( [] )
    const [ hub_ids, set_hub_ids ] = useState( [] )
    const [ user_ids, set_user_ids ] = useState( [] )
    const [ filter_query, set_filter_query ] = useState( `` )
    const [ question, set_question ] = useState( `` )
    const [ answer, set_answer ] = useState( null )
    const [ is_submitting, set_is_submitting ] = useState( false )
    const [ is_loading_filters, set_is_loading_filters ] = useState( false )
    const [ filter_source, set_filter_source ] = useState( `network` )

    const selected_filter_labels = [
        ...hubs.filter( hub => hub_ids.includes( hub.id ) ).map( hub => `Hub: ${ hub.name }` ),
        ...members.filter( member => user_ids.includes( member.id ) ).map( member => `Member: ${ member.name }` ),
    ]
    const normalized_filter_query = filter_query.trim().toLocaleLowerCase()
    const visible_hubs = hubs.filter( hub => !normalized_filter_query || hub.name.toLocaleLowerCase().includes( normalized_filter_query ) )
    const visible_members = members.filter( member => !normalized_filter_query || [ member.name, member.hub ].some( value => `${ value || `` }`.toLocaleLowerCase().includes( normalized_filter_query ) ) )
    const ask_disabled = is_submitting
        || mode === `scope` && hub_ids.length === 0 && user_ids.length === 0
        || mode === `question` && !question.trim()

    useEffect( () => {
        if( !is_open ) return

        const load_filters = async () => {
            set_is_loading_filters( true )

            try {
                const [ hub_payload, member_payload ] = await Promise.all( [ api_get( `/api/hubs` ), api_get( `/api/members` ) ] )
                set_hubs( hub_payload.hubs )
                set_members( member_payload.members )
                set_filter_source( `network` )
                await set_cached_value( `hubs`, hub_payload.hubs )
                await set_cached_value( `members`, member_payload.members )
            } catch {
                const [ cached_hubs, cached_members ] = await Promise.all( [ get_cached_value( `hubs` ), get_cached_value( `members` ) ] )
                set_hubs( cached_hubs?.value || [] )
                set_members( cached_members?.value || [] )
                set_filter_source( cached_hubs?.value || cached_members?.value ? `cache` : `unavailable` )
            } finally {
                set_is_loading_filters( false )
            }
        }

        load_filters()
    }, [ is_open ] )

    const toggle_value = ( value, values, set_values ) => {
        set_values( values.includes( value ) ? values.filter( item => item !== value ) : [ ...values, value ] )
    }

    const clear_filter_label = label => {
        if( label.startsWith( `Hub: ` ) ) {
            const hub_name = label.replace( `Hub: `, `` )
            const hub = hubs.find( item => item.name === hub_name )
            set_hub_ids( current_ids => current_ids.filter( id => id !== hub?.id ) )
        }

        if( label.startsWith( `Member: ` ) ) {
            const member_name = label.replace( `Member: `, `` )
            const member = members.find( item => item.name === member_name )
            set_user_ids( current_ids => current_ids.filter( id => id !== member?.id ) )
        }
    }

    const submit_query = async event => {
        event.preventDefault()
        set_is_submitting( true )
        set_answer( null )

        try {
            const payload = await api_post( `/api/grapevine/query`, {
                mode,
                time_window,
                hub_ids: mode === `scope` ? hub_ids : [],
                user_ids: mode === `scope` ? user_ids : [],
                question,
            } )
            set_answer( payload.answer )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        } finally {
            set_is_submitting( false )
        }
    }

    return <Modal title="Ask Grapevine" is_open={ is_open } close={ close }>
        <Stack onSubmit={ submit_query }>
            <Field label="Time span">
                <Select value={ time_window } onChange={ event => set_time_window( event.target.value ) }>
                    { windows.map( ( [ value, label ] ) => <option key={ value } value={ value }>{ label }</option> ) }
                </Select>
            </Field>

            <Segments>
                <Button type="button" variant={ mode === `scope` ? `primary` : `default` } onClick={ () => set_mode( `scope` ) }>Scoped update</Button>
                <Button type="button" variant={ mode === `question` ? `primary` : `default` } onClick={ () => set_mode( `question` ) }>Open question</Button>
            </Segments>

            { mode === `scope` ? <>
                <p>Selected people may be summarized directly.</p>
                { filter_source === `cache` ? <p>Showing cached filters.</p> : null }
                { selected_filter_labels.length ? <ChipList aria-label="Selected filters">
                    { selected_filter_labels.map( label => <Chip key={ label } type="button" onClick={ () => clear_filter_label( label ) }>
                        { label }
                    </Chip> ) }
                </ChipList> : null }
                <FilterTools>
                    <Field label="Find hubs or people">
                        <Input value={ filter_query } onChange={ event => set_filter_query( event.target.value ) } autoComplete="off" />
                    </Field>
                    { is_loading_filters ? <LoadingBlock label="Loading filters" /> : null }
                    { !is_loading_filters && filter_source === `unavailable` ? <EmptyState title="Filters unavailable">
                        Open Ask Grapevine once online to cache hubs and members.
                    </EmptyState> : null }
                    <Field label="Hubs">
                        <CheckboxList>
                            { visible_hubs.map( hub => <CheckboxRow key={ hub.id }>
                                <input type="checkbox" checked={ hub_ids.includes( hub.id ) } onChange={ () => toggle_value( hub.id, hub_ids, set_hub_ids ) } />
                                { hub.name }
                            </CheckboxRow> ) }
                            { !is_loading_filters && visible_hubs.length === 0 ? <p>No hubs match.</p> : null }
                        </CheckboxList>
                    </Field>
                    <Field label="People">
                        <CheckboxList>
                            { visible_members.map( member => <CheckboxRow key={ member.id }>
                                <input type="checkbox" checked={ user_ids.includes( member.id ) } onChange={ () => toggle_value( member.id, user_ids, set_user_ids ) } />
                                { member.name } · { member.hub }
                            </CheckboxRow> ) }
                            { !is_loading_filters && visible_members.length === 0 ? <p>No people match.</p> : null }
                        </CheckboxList>
                    </Field>
                </FilterTools>
            </> : <>
                <p>Questions are for themes, hubs, and community activity, not individual people.</p>
                <Field label="Question">
                    <Textarea value={ question } onChange={ event => set_question( event.target.value ) } />
                </Field>
            </> }

            <Button type="submit" variant="primary" disabled={ ask_disabled }>
                <Search size={ 18 } aria-hidden="true" />
                Ask
            </Button>

            { is_submitting ? <LoadingBlock label="Asking Grapevine" /> : null }

            { answer ? <Answer>
                <MarkdownBlock markdown={ answer.markdown } />
                <Metadata>
                    <summary>Answer details</summary>
                    <p>{ answer.source_message_count } source updates · { answer.time_window } · { answer.model }</p>
                    <p>{ selected_filter_labels.length ? selected_filter_labels.join( `, ` ) : `All visible messages` }</p>
                </Metadata>
            </Answer> : null }
        </Stack>
    </Modal>
}
