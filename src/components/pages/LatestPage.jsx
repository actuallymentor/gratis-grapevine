import { useEffect, useState } from 'react'
import styled from 'styled-components'

import { MarkdownBlock } from '../atoms/MarkdownBlock.jsx'
import { LoadingBlock } from '../atoms/StateBlock.jsx'
import { api_get } from '../../modules/api.js'
import { get_cached_value, set_cached_value } from '../../modules/offline_store.js'

const Page = styled.section`
    display: grid;
    min-width: 0;
    gap: var(--space-l);
`

const Bulletin = styled.article`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
`

const SilentState = styled.p`
    place-self: center;
    margin-top: min(20vh, 8rem);
    color: var(--muted);
    text-align: center;
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
        <h1 className="sr-only">Latest Grapevine</h1>

        { is_loading ? <LoadingBlock label="Loading latest update" /> : null }

        { !is_loading && !update ? <SilentState>The Grapevine is currently silent.</SilentState> : null }

        { update ? <Bulletin>
            <MarkdownBlock markdown={ update.summary_markdown } />
        </Bulletin> : null }
    </Page>
}
