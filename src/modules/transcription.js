import { log } from 'mentie'

let transcriber_promise = null
let transcriber_progress = { status: `idle`, progress: 0 }
const progress_listeners = new Set()
const loading_files = new Map()

const default_transcription_model = `onnx-community/whisper-small`
const default_transcription_dtype = `q8`

const positive_number = ( value, fallback ) => {

    const parsed_value = Number( value )
    return Number.isFinite( parsed_value ) && parsed_value > 0 ? parsed_value : fallback
}

const file_key = progress_info => `${ progress_info.name || `model` }:${ progress_info.file || `pipeline` }`

const aggregate_loading_progress = progress_info => {

    if( progress_info.status === `ready` ) {
        loading_files.clear()
        return { ...progress_info, progress: 100 }
    }

    if( progress_info.status === `initiate` || progress_info.status === `download` ) {
        const key = file_key( progress_info )
        if( !loading_files.has( key ) ) loading_files.set( key, { progress: 0, loaded: 0, total: null } )
    }

    if( progress_info.status === `progress` ) {
        loading_files.set( file_key( progress_info ), {
            progress: positive_number( progress_info.progress, 0 ),
            loaded: positive_number( progress_info.loaded, 0 ),
            total: positive_number( progress_info.total, null ),
        } )
    }

    if( progress_info.status === `done` ) {
        const current_file = loading_files.get( file_key( progress_info ) ) || {}
        loading_files.set( file_key( progress_info ), {
            progress: 100,
            loaded: current_file.total || current_file.loaded || 1,
            total: current_file.total || current_file.loaded || 1,
        } )
    }

    const files = [ ...loading_files.values() ]
    const total_bytes = files.reduce( ( sum, file ) => sum + ( file.total || 0 ), 0 )
    const loaded_bytes = files.reduce( ( sum, file ) => sum + ( file.loaded || 0 ), 0 )
    const average_progress = files.length
        ? files.reduce( ( sum, file ) => sum + ( file.progress || 0 ), 0 ) / files.length
        : positive_number( progress_info.progress, 0 )
    const progress = total_bytes
        ? loaded_bytes / total_bytes * 100
        : average_progress

    return {
        ...progress_info,
        progress: Math.max( 0, Math.min( 100, Math.round( progress ) ) ),
        file_count: files.length,
    }
}

const announce_progress = progress_info => {

    transcriber_progress = aggregate_loading_progress( progress_info )
    progress_listeners.forEach( listener => listener( transcriber_progress ) )
}

const subscribe_progress = progress_callback => {

    if( !progress_callback ) return () => {}

    progress_listeners.add( progress_callback )
    progress_callback( transcriber_progress )

    return () => progress_listeners.delete( progress_callback )
}

const test_transcriber = progress_callback => {

    if( !import.meta.env.DEV ) return null
    const factory = globalThis.__grapevine_transcriber_factory
    if( typeof factory !== `function` ) return null

    return factory( { progress_callback } )
}

/**
 * Loads the browser-local speech recognition pipeline on demand.
 * @param {Function|null} progress_callback - Optional model loading progress callback
 * @returns {Promise<Function>} Transformers.js pipeline
 */
export async function load_transcriber( progress_callback = null ) {

    const unsubscribe = subscribe_progress( progress_callback )

    if( !transcriber_promise ) {
        loading_files.clear()
        announce_progress( { status: `loading`, progress: 0 } )

        transcriber_promise = Promise.resolve().then( async () => {
            const model = import.meta.env.VITE_TRANSCRIPTION_MODEL || default_transcription_model
            const device = import.meta.env.VITE_TRANSCRIPTION_DEVICE || `auto`
            const dtype = import.meta.env.VITE_TRANSCRIPTION_DTYPE || default_transcription_dtype
            const mock_transcriber = test_transcriber( announce_progress )

            if( mock_transcriber ) return mock_transcriber

            const transformers = await import( '@huggingface/transformers' )
            const pipeline_options = {
                ... device === `auto` ? {} : { device } ,
                ... dtype === `auto` ? {} : { dtype } ,
                progress_callback: announce_progress,
            }

            log.info( `Loading transcription model`, { model, device, dtype } )
            return transformers.pipeline( `automatic-speech-recognition`, model, pipeline_options )
        } ).catch( error => {
            transcriber_promise = null
            loading_files.clear()
            announce_progress( { status: `error`, progress: 0, error } )
            throw error
        } )
    }

    return transcriber_promise.finally( unsubscribe )
}

/**
 * Starts loading the browser-local speech recognition pipeline before audio is ready.
 * @param {Function|null} progress_callback - Optional model loading progress callback
 * @returns {Promise<Function>} Transformers.js pipeline
 */
export async function preload_transcriber( progress_callback = null ) {

    return load_transcriber( progress_callback )
}

/**
 * Transcribes local audio without uploading raw audio.
 * @param {Blob} audio_blob - Recorded audio blob
 * @param {Object} options - Transcription options
 * @param {Function|null} options.progress_callback - Optional progress callback
 * @returns {Promise<String>} Transcript
 */
export async function transcribe_audio_blob( audio_blob, { progress_callback = null } = {} ) {

    const transcriber = await load_transcriber( progress_callback )
    progress_callback?.( { status: `transcribing`, progress: 100 } )
    const audio_url = URL.createObjectURL( audio_blob )

    try {
        const chunk_length_s = positive_number( import.meta.env.VITE_TRANSCRIPTION_CHUNK_SECONDS, 30 )
        const stride_length_s = positive_number( import.meta.env.VITE_TRANSCRIPTION_STRIDE_SECONDS, 5 )
        const result = await transcriber( audio_url, { chunk_length_s, stride_length_s } )
        return result.text || ``
    } finally {
        URL.revokeObjectURL( audio_url )
    }
}
