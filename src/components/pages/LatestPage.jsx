import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router'
import { Archive, CloudOff, Info } from 'lucide-react'

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

const Header = styled.header`
    display: grid;
    min-width: 0;
    gap: 0.55rem;
`

const Meta = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.92rem;
`

const SourceNote = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
`

const Details = styled.details`
    color: var(--muted);
    font-size: 0.92rem;
`

const Bulletin = styled.article`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
    padding-top: var(--space-l);
    border-top: 1px solid var(--line);
`

/**
 * Renders the latest Grapevine update.
 * @returns {JSX.Element} Latest page
 */
export function LatestPage() {

    const [ update, set_update ] = useState( null )
    const [ is_loading, set_is_loading ] = useState( true )
    const [ data_source, set_data_source ] = useState( `network` )

    useEffect( () => {
        const load_update = async () => {
            set_is_loading( true )

            try {
                const payload = await api_get( `/api/grapevine/latest` )
                set_update( payload.update )
                set_data_source( `network` )
                await set_cached_value( `latest-update`, payload.update )
            } catch {
                const cached = await get_cached_value( `latest-update` )
                set_update( cached?.value || null )
                set_data_source( cached?.value ? `cache` : `unavailable` )
            } finally {
                set_is_loading( false )
            }
        }

        load_update()
    }, [] )

    return <Page>
        <Header>
            <h1>Latest Grapevine</h1>
            <p>Weekly community bulletin.</p>
        </Header>

        { is_loading ? <LoadingBlock label="Loading latest update" /> : null }

        { !is_loading && !update ? <EmptyState title={ data_source === `unavailable` ? `Latest update unavailable` : `No update yet` }>
            { data_source === `unavailable` ? `Open the app once online to cache the latest Grapevine.` : `The latest community summary will appear after the first Grapevine run.` }
        </EmptyState> : null }

        { update ? <Bulletin>
            <Meta>
                <span>{ update.period_start } to { update.period_end }</span>
                <span>{ update.source_message_count } source updates</span>
                <span>{ update.generated_at?.slice( 0, 10 ) || `not generated yet` }</span>
                { data_source === `cache` ? <SourceNote><CloudOff size={ 15 } aria-hidden="true" />Cached</SourceNote> : null }
            </Meta>
            <Details>
                <summary><Info size={ 14 } aria-hidden="true" /> Update details</summary>
                <p>{ update.model || `no model` } · { update.generation_kind || `scheduled` }</p>
            </Details>
            <MarkdownBlock markdown={ update.summary_markdown } />
            <Button as={ Link } to="/archive">
                <Archive size={ 18 } aria-hidden="true" />
                Archive
            </Button>
        </Bulletin> : null }

        <MyUpdates />
    </Page>
}
