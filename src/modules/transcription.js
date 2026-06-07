import { log } from 'mentie'

let transcriber_promise = null

/**
 * Loads the browser-local speech recognition pipeline on demand.
 * @returns {Promise<Function>} Transformers.js pipeline
 */
export async function load_transcriber() {

    if( transcriber_promise ) return transcriber_promise

    transcriber_promise = import( '@huggingface/transformers' ).then( async transformers => {
        const model = import.meta.env.VITE_TRANSCRIPTION_MODEL || `onnx-community/whisper-base`
        const device = import.meta.env.VITE_TRANSCRIPTION_DEVICE || `auto`
        const pipeline_options = device === `auto` ? {} : { device }

        log.info( `Loading transcription model`, { model, device } )
        return transformers.pipeline( `automatic-speech-recognition`, model, pipeline_options )
    } )

    return transcriber_promise
}

/**
 * Transcribes local audio without uploading raw audio.
 * @param {Blob} audio_blob - Recorded audio blob
 * @returns {Promise<String>} Transcript
 */
export async function transcribe_audio_blob( audio_blob ) {

    const transcriber = await load_transcriber()
    const audio_url = URL.createObjectURL( audio_blob )

    try {
        const result = await transcriber( audio_url )
        return result.text || ``
    } finally {
        URL.revokeObjectURL( audio_url )
    }
}
