import { log } from 'mentie'

let transcriber_promise = null

/**
 * Loads the browser-local speech recognition pipeline on demand.
 * @param {Function|null} progress_callback - Optional model loading progress callback
 * @returns {Promise<Function>} Transformers.js pipeline
 */
export async function load_transcriber( progress_callback = null ) {

    if( transcriber_promise ) return transcriber_promise

    transcriber_promise = import( '@huggingface/transformers' ).then( async transformers => {
        const model = import.meta.env.VITE_TRANSCRIPTION_MODEL || `onnx-community/whisper-base`
        const device = import.meta.env.VITE_TRANSCRIPTION_DEVICE || `auto`
        const pipeline_options = {
            ... device === `auto` ? {} : { device } ,
            progress_callback,
        }

        log.info( `Loading transcription model`, { model, device } )
        return transformers.pipeline( `automatic-speech-recognition`, model, pipeline_options )
    } )

    return transcriber_promise
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
    progress_callback?.( { status: `transcribing` } )
    const audio_url = URL.createObjectURL( audio_blob )

    try {
        const result = await transcriber( audio_url )
        return result.text || ``
    } finally {
        URL.revokeObjectURL( audio_url )
    }
}
