import styled from 'styled-components'

import { render_markdown } from '../../modules/markdown.js'

const Block = styled.div`
    max-width: 65ch;
    color: var(--ink);

    & > * + * {
        margin-top: 1rem;
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
