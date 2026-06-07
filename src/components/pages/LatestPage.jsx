import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router'
import { Archive, Info } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { MarkdownBlock } from '../atoms/MarkdownBlock.jsx'
import { api_get } from '../../modules/api.js'
import { get_cached_value, set_cached_value } from '../../modules/offline_store.js'

const Page = styled.section`
    display: grid;
    gap: var(--space-l);
`

const Header = styled.header`
    display: grid;
    gap: 0.55rem;
`

const Meta = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.92rem;
`

const Bulletin = styled.article`
    display: grid;
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

    useEffect( () => {
        const load_update = async () => {
            set_is_loading( true )

            try {
                const payload = await api_get( `/api/grapevine/latest` )
                set_update( payload.update )
                await set_cached_value( `latest-update`, payload.update )
            } catch {
                const cached = await get_cached_value( `latest-update` )
                set_update( cached?.value || null )
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

        { is_loading ? <p>Loading latest update.</p> : null }

        { !is_loading && !update ? <Bulletin>
            <h2>No update yet</h2>
            <p>The latest community summary will appear here after the first Grapevine run.</p>
        </Bulletin> : null }

        { update ? <Bulletin>
            <Meta>
                <span>{ update.period_start } to { update.period_end }</span>
                <span>{ update.source_message_count } source updates</span>
                <span><Info size={ 14 } aria-hidden="true" /> { update.model || `no model` }</span>
            </Meta>
            <MarkdownBlock markdown={ update.summary_markdown } />
            <Button as={ Link } to="/archive">
                <Archive size={ 18 } aria-hidden="true" />
                Archive
            </Button>
        </Bulletin> : null }
    </Page>
}
