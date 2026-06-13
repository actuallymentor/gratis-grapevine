import { useEffect, useState } from 'react'
import styled from 'styled-components'

import { MarkdownBlock } from '../atoms/MarkdownBlock.jsx'
import { LoadingBlock } from '../atoms/StateBlock.jsx'
import { load_latest_community_update, mark_community_update_seen } from '../../modules/community_updates.js'

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
    gap: var(--space-m);
`

const SilentState = styled.p`
    place-self: center;
    color: var(--muted);
    text-align: center;
`

/**
 * Renders the latest community bulletin on its own screen.
 * @returns {JSX.Element} Community bulletins page
 */
export function CommunityBulletinsPage() {

    const [ update, set_update ] = useState( null )
    const [ is_loading, set_is_loading ] = useState( true )

    useEffect( () => {
        let is_active = true

        const load_update = async () => {
            set_is_loading( true )

            try {
                const latest_update = await load_latest_community_update()
                if( !is_active ) return

                set_update( latest_update )
                await mark_community_update_seen( latest_update )
            } finally {
                if( is_active ) set_is_loading( false )
            }
        }

        load_update()

        return () => {
            is_active = false
        }
    }, [] )

    return <Page>
        <Header>
            <h1>Community bulletins</h1>
            <p>Read the latest Grapevine update from across the community.</p>
        </Header>

        { is_loading ? <LoadingBlock label="Loading community bulletins" /> : null }

        { !is_loading && !update ? <SilentState>The Grapevine is currently silent.</SilentState> : null }

        { update ? <Bulletin>
            <MarkdownBlock markdown={ update.summary_markdown } />
        </Bulletin> : null }
    </Page>
}
