import { marked } from 'marked'

marked.use( {
    gfm: true,
    breaks: true,
} )

/**
 * Renders trusted server-generated markdown.
 * @param {String} markdown - Markdown text
 * @returns {String} HTML
 */
export function render_markdown( markdown = `` ) {

    const escaped_markdown = `${ markdown }`
        .replaceAll( `&`, `&amp;` )
        .replaceAll( `<`, `&lt;` )
        .replaceAll( `>`, `&gt;` )

    return marked.parse( escaped_markdown )
}
