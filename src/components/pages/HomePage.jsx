import styled from 'styled-components'
import { CircleHelp, MapPin, Newspaper, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'

import { use_app_actions } from '../molecules/AppShell.jsx'

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
    const open_bulletins = () => navigate( `/bulletins` )

    return <Page>
        <Header>
            <h1>What do you need from the Grapevine?</h1>
            <p>Open the latest community update, ask about people or hubs, or bring a broader question to the community record.</p>
        </Header>

        <ActionGrid aria-label="Grapevine actions">
            <ActionTile type="button" onClick={ open_bulletins }>
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
