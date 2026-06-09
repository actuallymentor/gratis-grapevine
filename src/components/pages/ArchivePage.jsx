import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Link, useParams } from 'react-router'
import { Archive, UserRound } from 'lucide-react'
import { StringParam, useQueryParam } from 'use-query-params'

import { Button } from '../atoms/Button.jsx'
import { MarkdownBlock } from '../atoms/MarkdownBlock.jsx'
import { EmptyState, LoadingBlock } from '../atoms/StateBlock.jsx'
import { MyUpdates } from '../molecules/MyUpdates.jsx'
import { api_get } from '../../modules/api.js'
import { get_cached_value, set_cached_value } from '../../modules/offline_store.js'

const Page = styled.section`
    display: grid;
    min-width: 0;
    gap: var(--space-l);
`

const List = styled.div`
    display: grid;
    min-width: 0;
    gap: 0.65rem;
`

const ArchiveChoices = styled.div`
    display: grid;
    min-width: 0;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
`

const ChoiceNote = styled.p`
    color: var(--muted);
`

const Entry = styled( Link )`
    display: grid;
    min-width: 0;
    gap: 0.25rem;
    padding: 0.85rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--surface);
    overflow-wrap: anywhere;
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
    const grapevine_archive_loaded = useRef( false )
    const [ archive_kind = ``, set_archive_kind ] = useQueryParam( `kind`, StringParam )
    const [ updates, set_updates ] = useState( [] )
    const [ update, set_update ] = useState( null )
    const [ is_loading, set_is_loading ] = useState( true )
    const [ data_source, set_data_source ] = useState( `network` )
    const is_grapevine_archive = archive_kind === `grapevine`
    const is_member_archive = archive_kind === `mine`
    const has_archive_kind = is_grapevine_archive || is_member_archive

    useEffect( () => {
        if( !id && !is_grapevine_archive ) {
            set_is_loading( false )
            return
        }

        if( !id && grapevine_archive_loaded.current ) {
            set_is_loading( false )
            return
        }

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
                    grapevine_archive_loaded.current = true
                }
                set_data_source( `network` )
            } catch {
                const cached = await get_cached_value( id ? `archive:${ id }` : `archive` )
                if( id ) set_update( cached?.value || null )
                else {
                    set_updates( cached?.value || [] )
                    if( cached?.value ) grapevine_archive_loaded.current = true
                }
                set_data_source( cached?.value ? `cache` : `unavailable` )
            } finally {
                set_is_loading( false )
            }
        }

        load_archive()
    }, [ id, is_grapevine_archive ] )

    const open_grapevine_archive = () => {
        if( !grapevine_archive_loaded.current ) set_is_loading( true )
        set_archive_kind( `grapevine` )
    }

    const open_member_archive = () => set_archive_kind( `mine` )

    if( id ) return <Page>
        <Link to="/archive?kind=grapevine">Back to Grapevine Archive</Link>
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
        <ArchiveChoices role="group" aria-label="Archive choices">
            <Button type="button" variant={ is_grapevine_archive ? `primary` : `default` } aria-pressed={ is_grapevine_archive } onClick={ open_grapevine_archive }>
                <Archive size={ 18 } aria-hidden="true" />
                Grapevine Archive
            </Button>
            <Button type="button" variant={ is_member_archive ? `primary` : `default` } aria-pressed={ is_member_archive } onClick={ open_member_archive }>
                <UserRound size={ 18 } aria-hidden="true" />
                Your Updates Archive
            </Button>
        </ArchiveChoices>

        { !has_archive_kind ? <ChoiceNote>Choose which archive to open.</ChoiceNote> : null }

        { is_grapevine_archive ? <>
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
        </> : null }

        { is_member_archive ? <MyUpdates title="Your Updates Archive" /> : null }
    </Page>
}
