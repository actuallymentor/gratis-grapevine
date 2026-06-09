import styled from 'styled-components'

import { render_markdown } from '../../modules/markdown.js'

const Block = styled.div`
    width: 100%;
    max-width: 65ch;
    min-width: 0;
    color: var(--ink);
    overflow-wrap: anywhere;

    & > * + * {
        margin-top: 1rem;
    }

    pre {
        max-width: 100%;
        overflow-x: auto;
    }

    ul,
    ol {
        padding-left: 1.4rem;
    }

    li + li {
        margin-top: 0.35rem;
    }
`

/**
 * Renders generated markdown.
 * @param {Object} props - Markdown props
 * @returns {JSX.Element} Markdown block
 */
export function MarkdownBlock( { markdown = `` } ) {

    return <Block dangerouslySetInnerHTML={ { __html: render_markdown( markdown ) } } />
}
