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
                set_members( payload.members )
                await set_cached_value( `members:${ query || `` }`, payload.members )
            } catch {
                const cached = await get_cached_value( `members:${ query || `` }` )
                set_members( cached?.value || [] )
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
