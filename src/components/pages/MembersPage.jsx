import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { MessageCircle, Search } from 'lucide-react'
import { StringParam, useQueryParam } from 'use-query-params'

import { Button } from '../atoms/Button.jsx'
import { Field, Input, Select } from '../atoms/Field.jsx'
import { EmptyState, LoadingBlock } from '../atoms/StateBlock.jsx'
import { api_get } from '../../modules/api.js'
import { get_cached_value, set_cached_value } from '../../modules/offline_store.js'

const Page = styled.section`
    display: grid;
    min-width: 0;
    gap: var(--space-l);
`

const Grid = styled.div`
    display: grid;
    min-width: 0;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
`

const MemberCard = styled.article`
    display: grid;
    min-width: 0;
    gap: 0.5rem;
    padding: 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
`

const Filters = styled.div`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
    grid-template-columns: minmax(0, 1fr);
    align-items: end;

    @media (min-width: 680px) {
        grid-template-columns: minmax(0, 1fr) minmax(11rem, 16rem);
    }
`

const SearchWrap = styled.div`
    position: relative;
    min-width: 0;

    svg {
        position: absolute;
        right: 0.85rem;
        bottom: 0.85rem;
        color: var(--muted);
        pointer-events: none;
    }

    input {
        padding-right: 2.75rem;
    }
`

const CardActions = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.5rem;
`

const public_member = member => ( {
    id: member.id,
    name: member.name,
    hub: member.hub,
    whatsapp_telephone: member.whatsapp_telephone,
    whatsapp_telephone_digits: member.whatsapp_telephone_digits,
    whatsapp_url: member.whatsapp_url,
} )

const member_matches_query = ( member, query ) => {

    const normalized_query = `${ query || `` }`.trim().toLocaleLowerCase()
    if( !normalized_query ) return true

    return [ member.name, member.hub ].some( value => `${ value || `` }`.toLocaleLowerCase().includes( normalized_query ) )
}

/**
 * Renders accepted member directory.
 * @returns {JSX.Element} Member page
 */
export function MembersPage() {

    const [ query = ``, set_query ] = useQueryParam( `query`, StringParam )
    const [ hub_filter = ``, set_hub_filter ] = useQueryParam( `hub`, StringParam )
    const [ members, set_members ] = useState( [] )
    const [ is_loading, set_is_loading ] = useState( true )
    const [ data_source, set_data_source ] = useState( `network` )

    const hubs = [ ...new Set( members.map( member => member.hub ).filter( Boolean ) ) ].sort()
    const hub_options = hub_filter && !hubs.includes( hub_filter ) ? [ hub_filter, ...hubs ] : hubs
    const visible_members = members.filter( member => !hub_filter || member.hub === hub_filter )

    useEffect( () => {
        const load_members = async () => {
            set_is_loading( true )

            try {
                const payload = await api_get( `/api/members?query=${ encodeURIComponent( query || `` ) }` )
                const next_members = payload.members.map( public_member )
                set_members( next_members )
                set_data_source( `network` )
                await set_cached_value( `members:${ query || `` }`, next_members )

                if( !query ) await set_cached_value( `members:all`, next_members )
            } catch {
                const cached = await get_cached_value( `members:${ query || `` }` )
                const cached_all = await get_cached_value( `members:all` )
                const fallback_members = cached?.value || cached_all?.value?.filter( member => member_matches_query( member, query ) ) || []
                set_members( fallback_members.map( public_member ) )
                set_data_source( fallback_members.length ? `cache` : `unavailable` )
            } finally {
                set_is_loading( false )
            }
        }

        load_members()
    }, [ query ] )

    return <Page>
        <h1>Members</h1>
        <Filters>
            <SearchWrap>
                <Field label="Search">
                    <Input value={ query || `` } onChange={ event => set_query( event.target.value || undefined ) } autoComplete="off" />
                </Field>
                <Search size={ 20 } aria-hidden="true" />
            </SearchWrap>
            <Field label="Hub">
                <Select value={ hub_filter || `` } onChange={ event => set_hub_filter( event.target.value || undefined ) }>
                    <option value="">All hubs</option>
                    { hub_options.map( hub => <option key={ hub } value={ hub }>{ hub }</option> ) }
                </Select>
            </Field>
        </Filters>
        { data_source === `cache` ? <p>Showing cached members.</p> : null }
        { is_loading ? <LoadingBlock label="Loading members" /> : null }
        <Grid>
            { !is_loading ? visible_members.map( member => <MemberCard key={ member.id }>
                <h2>{ member.name }</h2>
                <p>{ member.hub }</p>
                <CardActions>
                    <Button as="a" href={ member.whatsapp_url }>
                        <MessageCircle size={ 18 } aria-hidden="true" />
                        WhatsApp
                    </Button>
                    <a href={ member.whatsapp_url }>{ member.whatsapp_telephone }</a>
                </CardActions>
            </MemberCard> ) : null }
        </Grid>
        { !is_loading && visible_members.length === 0 ? <EmptyState title={ data_source === `unavailable` ? `Directory unavailable` : `No members found` }>
            { data_source === `unavailable` ? `Open the directory once online to cache members for offline use.` : `Try another search or clear the hub filter.` }
        </EmptyState> : null }
    </Page>
}
