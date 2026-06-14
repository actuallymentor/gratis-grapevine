import { useEffect, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'

import { Button } from '../atoms/Button.jsx'
import { MarkdownBlock } from '../atoms/MarkdownBlock.jsx'
import { LoadingBlock } from '../atoms/StateBlock.jsx'
import { api_error_message } from '../../modules/api.js'
import { load_community_bulletins, mark_community_update_seen } from '../../modules/community_updates.js'

const Page = styled.section`
    display: grid;
    min-width: 0;
    gap: var(--space-l);
`

const Header = styled.header`
    display: grid;
    min-width: 0;
    gap: 0.55rem;

    p {
        color: var(--muted);
    }
`

const Bulletin = styled.article`
    display: grid;
    min-width: 0;
    gap: 0.85rem;
    padding-top: var(--space-l);
    border-top: 1px solid var(--line);
`

const BulletinHeader = styled.header`
    display: grid;
    min-width: 0;
    gap: 0.35rem;
`

const Meta = styled.p`
    color: var(--muted);
    font-size: 0.92rem;
`

const Counter = styled.p`
    color: var(--muted);
    font-weight: 700;
`

const Feed = styled.div`
    display: grid;
    min-width: 0;
    gap: var(--space-xl);
`

const SilentState = styled.p`
    place-self: center;
    color: var(--muted);
    text-align: center;
`

const pagination_limit = 10

const pluralize = ( count, singular, plural = `${ singular }s` ) => `${ count } ${ count === 1 ? singular : plural }`

const format_date = value => value?.slice( 0, 10 ) || `Unknown date`

/**
 * Renders the latest community bulletin on its own screen.
 * @returns {JSX.Element} Community bulletins page
 */
export function CommunityBulletinsPage() {

    const [ updates, set_updates ] = useState( [] )
    const [ pagination, set_pagination ] = useState( { limit: pagination_limit, offset: 0, total_count: 0, has_more: false } )
    const [ is_loading, set_is_loading ] = useState( true )
    const [ is_loading_more, set_is_loading_more ] = useState( false )
    const [ data_source, set_data_source ] = useState( `network` )

    useEffect( () => {
        let is_active = true

        const load_updates = async () => {
            set_is_loading( true )

            try {
                const payload = await load_community_bulletins( { limit: pagination_limit, offset: 0 } )
                if( !is_active ) return

                set_updates( payload.updates || [] )
                set_pagination( payload.pagination || { limit: pagination_limit, offset: 0, total_count: 0, has_more: false } )
                set_data_source( payload.data_source || `network` )
                await mark_community_update_seen( payload.updates?.[ 0 ] || null )
            } finally {
                if( is_active ) set_is_loading( false )
            }
        }

        load_updates()

        return () => {
            is_active = false
        }
    }, [] )

    const load_older = async () => {
        set_is_loading_more( true )

        try {
            const next_offset = updates.length
            const payload = await load_community_bulletins( { limit: pagination_limit, offset: next_offset } )

            set_updates( current => [ ...current, ...payload.updates ] )
            set_pagination( payload.pagination )
        } catch ( error ) {
            toast.error( api_error_message( error ) )
        } finally {
            set_is_loading_more( false )
        }
    }

    const [ latest_update ] = updates
    const messages_since_generated_count = Number( latest_update?.messages_since_generated_count || 0 )

    return <Page>
        <Header>
            <h1>Community bulletins</h1>
            <p>Read generated Grapevine updates from across the community, newest first.</p>
        </Header>

        { is_loading ? <LoadingBlock label="Loading community bulletins" /> : null }
        { data_source === `cache` ? <Meta>Showing cached bulletins.</Meta> : null }

        { !is_loading && updates.length === 0 ? <SilentState>The Grapevine is currently silent.</SilentState> : null }

        { latest_update ? <>
            <Counter>{ pluralize( messages_since_generated_count, `message` ) } sent since this bulletin was generated.</Counter>
            <Feed aria-label="Generated community bulletins">
                { updates.map( ( update, index ) => <Bulletin key={ update.id }>
                    <BulletinHeader>
                        <h2>{ index === 0 ? `Current bulletin` : `Bulletin from ${ format_date( update.generated_at ) }` }</h2>
                        <Meta>
                            { update.period_start } to { update.period_end } · { pluralize( Number( update.source_message_count || 0 ), `source message` ) } · generated { format_date( update.generated_at ) }
                        </Meta>
                    </BulletinHeader>
                    { update.summary_markdown ? <MarkdownBlock markdown={ update.summary_markdown } /> : <Meta>No source messages were submitted for this period.</Meta> }
                </Bulletin> ) }
            </Feed>
            { pagination?.has_more ? <Button type="button" onClick={ load_older } disabled={ is_loading_more }>
                { is_loading_more ? `Loading older bulletins` : `Load older bulletins` }
            </Button> : null }
        </> : null }
    </Page>
}
