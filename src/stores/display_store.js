import { create } from 'zustand'

const storage_key = `grapevine-display-preferences`

const default_preferences = {
    text_size: `1rem`,
    line_height: `1.55`,
}

const read_preferences = () => {

    try {
        const stored_preferences = JSON.parse( localStorage.getItem( storage_key ) || `null` )
        return { ...default_preferences, ...stored_preferences }
    } catch {
        return default_preferences
    }
}

const write_preferences = preferences => {

    try {
        localStorage.setItem( storage_key, JSON.stringify( preferences ) )
    } catch {
        // Display preferences are optional. Storage failures should never block the app.
    }
}

/**
 * Stores local display preferences for readable long-form updates.
 */
export const use_display_store = create( ( set, get ) => ( {
    ...read_preferences(),
    set_text_size( text_size ) {
        const next_preferences = { ...get(), text_size }
        write_preferences( next_preferences )
        set( { text_size } )
    },
    set_line_height( line_height ) {
        const next_preferences = { ...get(), line_height }
        write_preferences( next_preferences )
        set( { line_height } )
    },
    reset_display() {
        write_preferences( default_preferences )
        set( default_preferences )
    },
} ) )
