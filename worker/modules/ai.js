import { multiline_trim } from 'mentie'

export const prompt_version = `2026-06-07`

const contact_patterns = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /(?:\+|00)?[\d][\d\s().-]{7,}\d/g,
    /\bwa\.me\/\d+\b/gi,
]

const chunk_array = ( items, size ) => Array.from(
    { length: Math.ceil( items.length / size ) },
    ( _, index ) => items.slice( index * size, ( index + 1 ) * size ),
)

const sort_by_created_at = messages => [ ...messages ].sort( ( left, right ) => `${ left.created_at || `` }`.localeCompare( `${ right.created_at || `` }` ) )

const escape_regexp = value => `${ value }`.replace( /[.*+?^${}()|[\]\\]/g, `\\$&` )

const max_input_messages = env => Math.max( 1, Number( env.OPENROUTER_MAX_INPUT_MESSAGES || 80 ) || 80 )

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
 * Chunks messages by hub and time order for context-window-safe AI calls.
 * @param {Array} messages - Message rows
 * @param {Number} max_messages - Maximum messages per chunk
 * @returns {Array} Message chunks
 */
export function chunk_messages_by_hub_and_time( messages, max_messages ) {

    const groups = sort_by_created_at( messages ).reduce( ( grouped_messages, message ) => {
        const hub_name = message.hub_name || `Unknown hub`

        return {
            ...grouped_messages,
            [ hub_name ]: [ ... grouped_messages[ hub_name ] || [] , message ],
        }
    }, {} )

    return Object.entries( groups ).flatMap( ( [ hub_name, hub_messages ] ) => {
        return chunk_array( hub_messages, max_messages ).map( ( chunk_messages, index ) => ( {
            id: `${ hub_name } ${ index + 1 }`,
            hub_name,
            messages: chunk_messages,
        } ) )
    } )
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
    const first_names = member_names
        .map( name => name.split( /\s+/ )[ 0 ] )
        .filter( name => name.length >= 3 )
    const personal_cue = /\b(up to|doing|from|about|with|shared|posted|update|updates)\b/i.test( question )

    return direct_patterns.some( pattern => pattern.test( question ) )
        || member_names.some( name => name && normalized_question.includes( name ) )
        || personal_cue && first_names.some( name => new RegExp( `\\b${ escape_regexp( name ) }\\b`, `i` ).test( question ) )
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

    const max_messages = max_input_messages( env )
    const model = env.OPENROUTER_SUMMARY_MODEL || `openai/gpt-4.1-mini`
    const source_messages = sort_by_created_at( messages )

    if( source_messages.length > max_messages ) {
        const chunks = chunk_messages_by_hub_and_time( source_messages, max_messages )
        const chunk_summaries = await Promise.all( chunks.map( async chunk => {
            const context = sanitize_model_context( chunk.messages )
            const result = await call_openrouter( env, {
                model,
                messages: [
                    {
                        role: `system`,
                        content: multiline_trim( `
                            Summarize this source chunk for a later Gratis Grapevine community bulletin.
                            Preserve hubs, themes, uncertainty, and upcoming items. Do not mention individual people, contact details, or raw source wording.
                        ` ),
                    },
                    {
                        role: `user`,
                        content: multiline_trim( `
                            Period: ${ period.period_start } through ${ period.period_end }.
                            Chunk: ${ chunk.id }

                            Safe source context:
                            ${ context }
                        ` ),
                    },
                ],
            } )

            return `Chunk ${ chunk.id }\n${ result.markdown }`
        } ) )

        const result = await call_openrouter( env, {
            model,
            messages: [
                {
                    role: `system`,
                    content: multiline_trim( `
                        You write the final Gratis Grapevine community bulletin from chunk summaries.
                        Be concise and community-facing. Mention hubs and themes, never individual people.
                        Preserve uncertainty. Do not invent facts, dates, attendance, commitments, names, phone numbers, email addresses, or WhatsApp details.
                        Group naturally by themes, hubs, and upcoming items. Include a short "Signals" section only when repeated topics are visible.
                        Never quote or expose raw source messages.
                    ` ),
                },
                {
                    role: `user`,
                    content: multiline_trim( `
                        Period: ${ period.period_start } through ${ period.period_end }.

                        Chunk summaries:
                        ${ chunk_summaries.join( `\n\n` ) }
                    ` ),
                },
            ],
        } )

        return {
            ...result,
            model,
            status: `success`,
            usage: {
                ... result.usage || {} ,
                chunk_count: chunks.length,
            },
        }
    }

    const context = sanitize_model_context( source_messages )

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
    const max_messages = max_input_messages( env )
    const source_messages = sort_by_created_at( messages )

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

    if( source_messages.length > max_messages ) {
        const chunks = chunk_messages_by_hub_and_time( source_messages, max_messages )
        const chunk_summaries = await Promise.all( chunks.map( async chunk => {
            const context = sanitize_model_context( chunk.messages )
            const result = await call_openrouter( env, {
                model,
                messages: [
                    {
                        role: `system`,
                        content: multiline_trim( `
                            Summarize this source chunk for a later Gratis Grapevine answer.
                            ${ instruction }
                            Do not expose raw source messages, snippets, source links, contact details, account metadata, review notes, or admin-only fields.
                        ` ),
                    },
                    {
                        role: `user`,
                        content: multiline_trim( `
                            Time window: ${ time_window }
                            Filters: ${ filters_description || `all visible messages` }
                            Question: ${ question || `Give me the scoped update.` }
                            Chunk: ${ chunk.id }

                            Safe source context:
                            ${ context }
                        ` ),
                    },
                ],
            } )

            return `Chunk ${ chunk.id }\n${ result.markdown }`
        } ) )

        const result = await call_openrouter( env, {
            model,
            messages: [
                {
                    role: `system`,
                    content: multiline_trim( `
                        You answer member questions for Gratis Grapevine from chunk summaries.
                        ${ instruction }
                        Do not expose raw source messages, snippets, source links, phone numbers, emails, WhatsApp details, account metadata, review notes, or admin-only fields.
                        If evidence is insufficient, say: "I don't have enough Grapevine updates to answer that."
                        Preserve uncertainty and do not invent facts.
                    ` ),
                },
                {
                    role: `user`,
                    content: multiline_trim( `
                        Time window: ${ time_window }
                        Filters: ${ filters_description || `all visible messages` }
                        Question: ${ question || `Give me the scoped update.` }

                        Chunk summaries:
                        ${ chunk_summaries.join( `\n\n` ) }
                    ` ),
                },
            ],
        } )

        return {
            ...result,
            model,
            usage: {
                ... result.usage || {} ,
                chunk_count: chunks.length,
            },
        }
    }

    const context = sanitize_model_context( source_messages )

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
