import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { CircleHelp, MapPin, Newspaper, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'

import { use_app_actions } from '../molecules/AppShell.jsx'
import { community_update_seen_event, is_unseen_community_update, load_latest_community_update } from '../../modules/community_updates.js'

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

const ActionGrid = styled.div`
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
    gap: 0.75rem;
`

const ActionTile = styled.button`
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 9.5rem;
    align-content: space-between;
    gap: var(--space-m);
    padding: var(--space-m);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--surface);
    box-shadow: 0 8px 18px rgb(36 40 39 / 6%);
    overflow-wrap: anywhere;
    text-align: left;
    transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;

    &:hover {
        border-color: var(--accent-dark);
        box-shadow: var(--shadow);
    }

    &:focus-visible {
        border-color: var(--focus-outline);
        box-shadow: 0 0 0 3px var(--focus-ring), var(--shadow);
        outline: none;
    }

    &:active {
        transform: translateY(1px);
    }
`

const TileIcon = styled.span`
    display: inline-flex;
    width: 2.6rem;
    height: 2.6rem;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: ${ ( { $accent } ) => $accent ? `var(--on-accent)` : `var(--ink)` };
    background: ${ ( { $accent } ) => $accent ? `var(--accent)` : `var(--surface-raised)` };
`

const NotificationBubble = styled.span`
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: inline-flex;
    min-width: 1.35rem;
    height: 1.35rem;
    align-items: center;
    justify-content: center;
    padding: 0 0.3rem;
    border: 2px solid var(--surface);
    border-radius: 999px;
    color: #ffffff;
    background: #d92d20;
    font-size: 0.76rem;
    font-weight: 800;
    line-height: 1;
`

const TileText = styled.span`
    display: grid;
    min-width: 0;
    gap: 0.35rem;

    strong {
        font-family: "Montserrat", "Montserrat Variable", system-ui, sans-serif;
        font-size: 1.06rem;
        font-weight: 500;
        line-height: 1.25;
    }

    span {
        color: var(--muted);
        font-size: 0.94rem;
        line-height: 1.45;
    }
`

/**
 * Renders the member home action hub.
 * @returns {JSX.Element} Home page
 */
export function HomePage() {

    const { open_ask } = use_app_actions()
    const navigate = useNavigate()
    const [ has_unseen_community_update, set_has_unseen_community_update ] = useState( false )
    const open_bulletins = () => navigate( `/bulletins` )

    useEffect( () => {
        let is_active = true

        const refresh_community_update_badge = async () => {
            const update = await load_latest_community_update()
            const is_unseen = await is_unseen_community_update( update )
            if( is_active ) set_has_unseen_community_update( is_unseen )
        }

        refresh_community_update_badge()
        window.addEventListener( community_update_seen_event, refresh_community_update_badge )

        return () => {
            is_active = false
            window.removeEventListener( community_update_seen_event, refresh_community_update_badge )
        }
    }, [] )

    return <Page>
        <Header>
            <h1>What do you need from the Grapevine?</h1>
            <p>Open the latest community update, ask about people or hubs, or bring a broader question to the community record.</p>
        </Header>

        <ActionGrid aria-label="Grapevine actions">
            <ActionTile type="button" aria-label={ has_unseen_community_update ? `Community bulletins, 1 new update` : undefined } onClick={ open_bulletins }>
                { has_unseen_community_update ? <NotificationBubble aria-hidden="true" data-community-update-badge="true">1</NotificationBubble> : null }
                <TileIcon $accent>
                    <Newspaper size={ 24 } aria-hidden="true" />
                </TileIcon>
                <TileText>
                    <strong>Community bulletins</strong>
                    <span>Read the latest Grapevine update.</span>
                </TileText>
            </ActionTile>

            <ActionTile type="button" onClick={ () => open_ask( `people` ) }>
                <TileIcon>
                    <UserRound size={ 24 } aria-hidden="true" />
                </TileIcon>
                <TileText>
                    <strong>Ask about people</strong>
                    <span>Choose specific members and ask for recent context.</span>
                </TileText>
            </ActionTile>

            <ActionTile type="button" onClick={ () => open_ask( `hubs` ) }>
                <TileIcon>
                    <MapPin size={ 24 } aria-hidden="true" />
                </TileIcon>
                <TileText>
                    <strong>Ask about hubs</strong>
                    <span>Focus on one or more community hubs.</span>
                </TileText>
            </ActionTile>

            <ActionTile type="button" onClick={ () => open_ask( `question` ) }>
                <TileIcon>
                    <CircleHelp size={ 24 } aria-hidden="true" />
                </TileIcon>
                <TileText>
                    <strong>Ask a question</strong>
                    <span>Ask anything that belongs in the Grapevine.</span>
                </TileText>
            </ActionTile>
        </ActionGrid>
    </Page>
}
