import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Search } from 'lucide-react'
import { StringParam, useQueryParam } from 'use-query-params'

import { Field, Input } from '../atoms/Field.jsx'
import { api_get } from '../../modules/api.js'
import { get_cached_value, set_cached_value } from '../../modules/offline_store.js'

const Page = styled.section`
    display: grid;
    gap: var(--space-l);
`

const Grid = styled.div`
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
`

const MemberCard = styled.article`
    display: grid;
    gap: 0.35rem;
    padding: 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
`

const SearchRow = styled.div`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: end;
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
    const [ members, set_members ] = useState( [] )

    useEffect( () => {
        const load_members = async () => {
            try {
                const payload = await api_get( `/api/members?query=${ encodeURIComponent( query || `` ) }` )
                const next_members = payload.members.map( public_member )
                set_members( next_members )
                await set_cached_value( `members:${ query || `` }`, next_members )

                if( !query ) await set_cached_value( `members:all`, next_members )
            } catch {
                const cached = await get_cached_value( `members:${ query || `` }` )
                const cached_all = await get_cached_value( `members:all` )
                const fallback_members = cached?.value || cached_all?.value?.filter( member => member_matches_query( member, query ) ) || []
                set_members( fallback_members.map( public_member ) )
            }
        }

        load_members()
    }, [ query ] )

    return <Page>
        <h1>Members</h1>
        <SearchRow>
            <Field label="Search">
                <Input value={ query || `` } onChange={ event => set_query( event.target.value || undefined ) } />
            </Field>
            <Search size={ 24 } aria-hidden="true" />
        </SearchRow>
        <Grid>
            { members.map( member => <MemberCard key={ member.id }>
                <h2>{ member.name }</h2>
                <p>{ member.hub }</p>
                <a href={ member.whatsapp_url }>{ member.whatsapp_telephone }</a>
            </MemberCard> ) }
            { members.length === 0 ? <p>No members found in the cached directory.</p> : null }
        </Grid>
    </Page>
}
