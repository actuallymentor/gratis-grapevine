import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, useParams } from 'react-router'

import { MarkdownBlock } from '../atoms/MarkdownBlock.jsx'
import { api_get } from '../../modules/api.js'
import { get_cached_value, set_cached_value } from '../../modules/offline_store.js'

const Page = styled.section`
    display: grid;
    gap: var(--space-l);
`

const List = styled.div`
    display: grid;
    gap: 0.65rem;
`

const Entry = styled( Link )`
    display: grid;
    gap: 0.25rem;
    padding: 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--surface);
    text-decoration: none;
`

const Meta = styled.span`
    color: var(--muted);
    font-size: 0.92rem;
`

/**
 * Renders the update archive or an opened archive entry.
 * @returns {JSX.Element} Archive page
 */
export function ArchivePage() {

    const { id } = useParams()
    const [ updates, set_updates ] = useState( [] )
    const [ update, set_update ] = useState( null )

    useEffect( () => {
        const load_archive = async () => {
            try {
                const payload = id ? await api_get( `/api/grapevine/archive/${ id }` ) : await api_get( `/api/grapevine/archive` )

                if( id ) {
                    set_update( payload.update )
                    await set_cached_value( `archive:${ id }`, payload.update )
                } else {
                    set_updates( payload.updates )
                    await set_cached_value( `archive`, payload.updates )
                }
            } catch {
                const cached = await get_cached_value( id ? `archive:${ id }` : `archive` )
                if( id ) set_update( cached?.value || null )
                else set_updates( cached?.value || [] )
            }
        }

        load_archive()
    }, [ id ] )

    if( id ) return <Page>
        <Link to="/archive">Back to archive</Link>
        { update ? <>
            <h1>{ update.period_start } to { update.period_end }</h1>
            <Meta>{ update.source_message_count } source updates · { update.generation_kind }</Meta>
            <MarkdownBlock markdown={ update.summary_markdown } />
        </> : <p>Archive entry unavailable offline until opened once.</p> }
    </Page>

    return <Page>
        <h1>Archive</h1>
        <List>
            { updates.map( entry => <Entry key={ entry.id } to={ `/archive/${ entry.id }` }>
                <strong>{ entry.period_start } to { entry.period_end }</strong>
                <Meta>{ entry.source_message_count } source updates · { entry.generated_at?.slice( 0, 10 ) }</Meta>
            </Entry> ) }
            { updates.length === 0 ? <p>No archived updates yet.</p> : null }
        </List>
    </Page>
}
