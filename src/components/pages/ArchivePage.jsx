import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, useParams } from 'react-router'

import { MarkdownBlock } from '../atoms/MarkdownBlock.jsx'
import { EmptyState, LoadingBlock } from '../atoms/StateBlock.jsx'
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

const Details = styled.details`
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
    const [ is_loading, set_is_loading ] = useState( true )
    const [ data_source, set_data_source ] = useState( `network` )

    useEffect( () => {
        const load_archive = async () => {
            set_is_loading( true )

            try {
                const payload = id ? await api_get( `/api/grapevine/archive/${ id }` ) : await api_get( `/api/grapevine/archive` )

                if( id ) {
                    set_update( payload.update )
                    await set_cached_value( `archive:${ id }`, payload.update )
                } else {
                    set_updates( payload.updates )
                    await set_cached_value( `archive`, payload.updates )
                }
                set_data_source( `network` )
            } catch {
                const cached = await get_cached_value( id ? `archive:${ id }` : `archive` )
                if( id ) set_update( cached?.value || null )
                else set_updates( cached?.value || [] )
                set_data_source( cached?.value ? `cache` : `unavailable` )
            } finally {
                set_is_loading( false )
            }
        }

        load_archive()
    }, [ id ] )

    if( id ) return <Page>
        <Link to="/archive">Back to archive</Link>
        { is_loading ? <LoadingBlock label="Loading archive entry" /> : null }
        { !is_loading && update ? <>
            <h1>{ update.period_start } to { update.period_end }</h1>
            <Meta>{ update.source_message_count } source updates · { update.generated_at?.slice( 0, 10 ) }{ data_source === `cache` ? ` · cached` : `` }</Meta>
            <Details>
                <summary>Update details</summary>
                <p>{ update.model || `no model` } · { update.generation_kind }</p>
            </Details>
            <MarkdownBlock markdown={ update.summary_markdown } />
        </> : null }
        { !is_loading && !update ? <EmptyState title="Archive entry unavailable">
            Open this update once online to keep it available offline.
        </EmptyState> : null }
    </Page>

    return <Page>
        <h1>Archive</h1>
        { is_loading ? <LoadingBlock label="Loading archive" /> : null }
        <List>
            { !is_loading ? updates.map( entry => <Entry key={ entry.id } to={ `/archive/${ entry.id }` }>
                <strong>{ entry.period_start } to { entry.period_end }</strong>
                <Meta>{ entry.source_message_count } source updates · { entry.generated_at?.slice( 0, 10 ) }</Meta>
            </Entry> ) : null }
            { !is_loading && updates.length === 0 ? <EmptyState title={ data_source === `unavailable` ? `Archive unavailable` : `No archived updates yet` }>
                { data_source === `unavailable` ? `Open the archive once online to cache previous Grapevines.` : `Generated Grapevines will collect here over time.` }
            </EmptyState> : null }
        </List>
    </Page>
}
