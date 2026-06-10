import { marked } from 'marked'

const safe_link_protocols = new Set( [ `http:`, `https:`, `mailto:`, `tel:` ] )

const escape_html_attribute = value => `${ value }`
    .replaceAll( `&`, `&amp;` )
    .replaceAll( `"`, `&quot;` )
    .replaceAll( `<`, `&lt;` )
    .replaceAll( `>`, `&gt;` )

const link_is_safe = href => {

    const value = `${ href || `` }`.trim()
    if( !value || value.startsWith( `//` ) ) return false
    if( value.startsWith( `/` ) || value.startsWith( `#` ) ) return true

    try {
        return safe_link_protocols.has( new URL( value ).protocol )
    } catch {
        return false
    }
}

const normalize_marked_href = href => `${ href || `` }`.replaceAll( `&amp;`, `&` )

marked.use( {
    gfm: true,
    breaks: true,
    renderer: {
        link( token ) {
            const text = this.parser.parseInline( token.tokens )
            const normalized_href = normalize_marked_href( token.href )
            if( !link_is_safe( normalized_href ) ) return text

            const href = escape_html_attribute( normalized_href )
            const title = token.title ? ` title="${ escape_html_attribute( token.title ) }"` : ``
            const rel = new URL( normalized_href, `https://sandbox-grapevine.local` ).origin === `https://sandbox-grapevine.local`
                ? ``
                : ` rel="noopener noreferrer"`

            return `<a href="${ href }"${ title }${ rel }>${ text }</a>`
        },
    },
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
