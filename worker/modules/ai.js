import { multiline_trim } from 'mentie'

export const prompt_version = `2026-06-07`

const contact_patterns = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /(?:\+|00)?[\d][\d\s().-]{7,}\d/g,
    /\bwa\.me\/\d+\b/gi,
]

/**
 * Removes contact details and hidden metadata from model-visible text.
 * @param {String} value - Source value
 * @returns {String} Sanitized value
 */
export function sanitize_text_for_ai( value = `` ) {

    return contact_patterns.reduce( ( current_value, pattern ) => {
        return current_value.replace( pattern, `[contact removed]` )
    }, `${ value }` )
}

/**
 * Converts message rows into safe model context.
 * @param {Array} messages - Message rows
 * @returns {String} Sanitized context
 */
export function sanitize_model_context( messages ) {

    return messages.map( ( message, index ) => {
        const hub = sanitize_text_for_ai( message.hub_name || `Unknown hub` )
        const author = sanitize_text_for_ai( message.author_name || `Member` )
        const body = sanitize_text_for_ai( message.body )
        const created_at = message.created_at?.slice( 0, 10 ) || `unknown date`

        return multiline_trim( `
            Update ${ index + 1 }
            Date: ${ created_at }
            Hub: ${ hub }
            Author: ${ author }
            Text: ${ body }
        ` )
    } ).join( `\n\n` )
}

/**
 * Returns true when an open question appears to ask about a named person.
 * @param {String} question - User question
 * @param {Array} members - Accepted member rows
 * @returns {Boolean} True when person-specific
 */
export function is_person_specific_question( question = ``, members = [] ) {

    const normalized_question = `${ question }`.toLocaleLowerCase()
    const direct_patterns = [
        /\bwho\s+is\b/i,
        /\bwhat\s+is\s+[A-Z][a-z]+\s+doing\b/,
        /\babout\s+[A-Z][a-z]+\b/,
        /\bfrom\s+[A-Z][a-z]+\b/,
    ]
    const member_names = members
        .map( ( { name } ) => `${ name }`.trim().toLocaleLowerCase() )
        .filter( name => name.split( /\s+/ ).length >= 2 || name.length >= 4 )

    return direct_patterns.some( pattern => pattern.test( question ) )
        || member_names.some( name => name && normalized_question.includes( name ) )
}

/**
 * Calls OpenRouter Chat Completions.
 * @param {Object} env - Worker environment
 * @param {Object} options - Completion options
 * @returns {Promise<Object>} Completion result
 */
export async function call_openrouter( env, options ) {

    const { model, messages, temperature = 0.2 } = options
    if( !env.OPENROUTER_API_KEY ) throw new Error( `missing_openrouter_api_key` )

    const response = await fetch( `https://openrouter.ai/api/v1/chat/completions`, {
        method: `POST`,
        headers: {
            authorization: `Bearer ${ env.OPENROUTER_API_KEY }`,
            "content-type": `application/json`,
            "http-referer": env.GRAPEVINE_DOMAIN || `https://grapevine.gratis.sh`,
            "x-title": `Gratis Grapevine`,
        },
        body: JSON.stringify( { model, messages, temperature } ),
    } )

    const payload = await response.json()
    if( !response.ok ) throw new Error( payload?.error?.message || `openrouter_request_failed` )

    return {
        markdown: payload.choices?.[ 0 ]?.message?.content || ``,
        usage: payload.usage || null,
    }
}

/**
 * Produces a weekly community bulletin from safe message context.
 * @param {Object} env - Worker environment
 * @param {Array} messages - Message rows
 * @param {Object} period - Period dates
 * @returns {Promise<Object>} Summary result
 */
export async function generate_weekly_summary( env, messages, period ) {

    if( messages.length === 0 ) {
        return {
            markdown: `No Grapevine updates were submitted for this period yet.`,
            model: env.OPENROUTER_SUMMARY_MODEL || null,
            usage: null,
            status: `empty`,
        }
    }

    const max_messages = Number( env.OPENROUTER_MAX_INPUT_MESSAGES || 80 )
    const source_messages = messages.slice( 0, max_messages )
    const context = sanitize_model_context( source_messages )
    const model = env.OPENROUTER_SUMMARY_MODEL || `openai/gpt-4.1-mini`

    const result = await call_openrouter( env, {
        model,
        messages: [
            {
                role: `system`,
                content: multiline_trim( `
                    You write concise community bulletins for Gratis Grapevine.
                    Mention hubs and themes, never individual people.
                    Preserve uncertainty. Do not invent facts, dates, attendance, commitments, names, phone numbers, email addresses, or WhatsApp details.
                    Group naturally by themes, hubs, and upcoming items. Include a short "Signals" section only when repeated topics are visible.
                    Never quote or expose raw source messages.
                ` ),
            },
            {
                role: `user`,
                content: multiline_trim( `
                    Period: ${ period.period_start } through ${ period.period_end }.

                    Safe source context:
                    ${ context }
                ` ),
            },
        ],
    } )

    return { ...result, model, status: `success` }
}

/**
 * Answers a member query from safe message context.
 * @param {Object} env - Worker environment
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Answer result
 */
export async function answer_grapevine_query( env, options ) {

    const { mode, question, messages, time_window, filters_description } = options
    const model = env.OPENROUTER_QUERY_MODEL || `openai/gpt-4.1-mini`
    const context = sanitize_model_context( messages )

    if( messages.length === 0 ) {
        return {
            markdown: `I don't have enough Grapevine updates to answer that.`,
            model,
            usage: null,
        }
    }

    const instruction = mode === `scope`
        ? `Summarize the selected hubs or people directly. You may name explicitly selected members if the filters identify them.`
        : `Answer the open question only from the source context. Do not answer person-specific questions.`

    const result = await call_openrouter( env, {
        model,
        messages: [
            {
                role: `system`,
                content: multiline_trim( `
                    You answer member questions for Gratis Grapevine.
                    ${ instruction }
                    Do not expose raw source messages, snippets, source links, phone numbers, emails, WhatsApp details, account metadata, review notes, or admin-only fields.
                    If evidence is insufficient, say: "I don't have enough Grapevine updates to answer that."
                    Preserve uncertainty and do not invent facts.
                ` ),
            },
            {
                role: `user`,
                content: multiline_trim( `
                    Mode: ${ mode }
                    Time window: ${ time_window }
                    Filters: ${ filters_description || `all visible messages` }
                    Question: ${ question || `Give me the scoped update.` }

                    Safe source context:
                    ${ context }
                ` ),
            },
        ],
    } )

    return { ...result, model }
}
