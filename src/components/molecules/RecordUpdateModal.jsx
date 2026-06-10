import { useEffect, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import toast from 'react-hot-toast'
import { AlertCircle, CheckCircle2, Clock3, Mic, RotateCcw, Send, Square } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Field, Textarea } from '../atoms/Field.jsx'
import { Modal } from '../atoms/Modal.jsx'
import { api_error_message, api_post } from '../../modules/api.js'
import { delete_draft, enqueue_write, get_draft, set_draft } from '../../modules/offline_store.js'
import { preload_transcriber, transcribe_audio_blob } from '../../modules/transcription.js'

const Stack = styled.div`
    display: grid;
    min-width: 0;
    gap: var(--space-m);
`

const Actions = styled.div`
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.65rem;
`

const PrimaryAction = styled( Button )`
    width: 100%;
`

const Meter = styled.div`
    display: grid;
    min-width: 0;
    min-height: 48px;
    gap: 0.45rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--muted);
    background: var(--surface-raised);
`

const MeterLine = styled.div`
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.45rem;

    span {
        min-width: 0;
        overflow-wrap: anywhere;
    }
`

const Timer = styled.span`
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.3rem;
    color: var(--ink);
    font-weight: 800;
`

const transcribing = keyframes`
    from {
        transform: translateX(-40%);
    }

    to {
        transform: translateX(130%);
    }
`

const ProgressTrack = styled.div`
    overflow: hidden;
    height: 0.5rem;
    border-radius: 999px;
    background: #e7edf2;
`

const ProgressBar = styled.div`
    width: ${ ( { $progress } ) => $progress || $progress === 0 ? `${ $progress }%` : `45%` };
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    animation: ${ ( { $progress } ) => $progress || $progress === 0 ? `none` : transcribing } 1.2s ease-in-out infinite alternate;
`

const ErrorText = styled.p`
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: #641f1f;
    font-weight: 700;
`

const Intro = styled.p`
    margin: 0;
    color: var(--ink);
    line-height: 1.45;
`

const Disclosure = styled.p`
    margin: 0;
    color: var(--muted);
    font-size: 0.92rem;
    line-height: 1.45;
`

const format_duration = total_seconds => {

    const minutes = Math.floor( total_seconds / 60 )
    const seconds = `${ total_seconds % 60 }`.padStart( 2, `0` )
    return `${ minutes }:${ seconds }`
}

const progress_percent = progress_info => {

    const progress = Number( progress_info.progress )
    return Number.isFinite( progress ) ? Math.round( progress ) : null
}

const get_microphone_stream = async () => {

    if( !import.meta.env.DEV ) return navigator.mediaDevices.getUserMedia( { audio: true } )
    const delayed_microphone = globalThis.__grapevine_get_microphone_stream
    if( typeof delayed_microphone === `function` ) return delayed_microphone()

    return navigator.mediaDevices.getUserMedia( { audio: true } )
}

const transcription_disclosure_id = `voice-transcription-disclosure`
const max_update_characters = 5_000

/**
 * Renders local voice recording, automatic transcription, and message submission.
 * @param {Object} props - Modal props
 * @returns {JSX.Element|null} Modal
 */
export function RecordUpdateModal( { is_open, close } ) {

    const recorder = useRef( null )
    const stream_ref = useRef( null )
    const chunks = useRef( [] )
    const transcription_request = useRef( 0 )
    const transcription_abort = useRef( null )
    const recording_session = useRef( 0 )
    const recording_started_at = useRef( null )
    const transcript_ref = useRef( null )
    const has_opened = useRef( false )
    const [ recording_state, set_recording_state ] = useState( `idle` )
    const [ audio_blob, set_audio_blob ] = useState( null )
    const [ transcript, set_transcript ] = useState( `` )
    const [ is_submitting, set_is_submitting ] = useState( false )
    const [ recording_seconds, set_recording_seconds ] = useState( 0 )
    const [ recording_duration_seconds, set_recording_duration_seconds ] = useState( 0 )
    const [ model_progress, set_model_progress ] = useState( null )
    const [ model_is_ready, set_model_is_ready ] = useState( false )
    const [ model_status_message, set_model_status_message ] = useState( `` )
    const [ status_message, set_status_message ] = useState( `` )
    const [ error_message, set_error_message ] = useState( `` )

    const update_model_progress = progress_info => {
        const progress = progress_percent( progress_info )

        if( progress_info.status === `cloud_transcribing` ) {
            set_model_is_ready( false )
            set_model_status_message( `` )
            set_model_progress( null )
            return
        }

        if( progress_info.status === `ready` ) {
            set_model_is_ready( true )
            set_model_progress( 100 )
            set_model_status_message( `Local model ready.` )
            return
        }

        if( progress_info.status === `transcribing` ) {
            set_model_is_ready( true )
            set_model_status_message( `` )
            set_model_progress( null )
            return
        }

        if( [ `loading`, `initiate`, `download`, `progress`, `done` ].includes( progress_info.status ) ) {
            set_model_is_ready( false )
            set_model_progress( progress )
            set_model_status_message( progress !== null ? `Loading local model: ${ progress }%` : `Loading local model.` )
        }
    }

    const warm_transcriber = () => {
        if( navigator.onLine ) return

        preload_transcriber( update_model_progress ).catch( () => {
            set_model_is_ready( false )
            set_model_status_message( `Local model is not available yet.` )
        } )
    }

    const transcribe_recording = async ( blob, duration_seconds = recording_duration_seconds || 1 ) => {
        if( !blob ) return

        const request_id = transcription_request.current + 1
        transcription_request.current = request_id
        transcription_abort.current?.abort()
        const abort_controller = new AbortController()
        transcription_abort.current = abort_controller
        set_error_message( `` )
        set_recording_state( `transcribing` )
        set_status_message( navigator.onLine ? `Sending audio to Cloudflare for transcription.` : `Transcribing audio offline.` )

        try {
            const text = await transcribe_audio_blob( blob, {
                duration_seconds,
                progress_callback: update_model_progress,
                signal: abort_controller.signal,
            } )

            if( transcription_request.current !== request_id ) return

            const trimmed_text = text.trim()

            if( !trimmed_text ) {
                toast.error( `Audio could not be transcribed right now.` )
                set_recording_state( `recorded` )
                set_status_message( `Transcription failed. You can retry or type the transcript.` )
                set_model_status_message( `` )
                return
            }

            set_transcript( trimmed_text )
            set_model_status_message( `` )
            set_model_progress( 100 )
            await submit_transcript( trimmed_text, { automatic: true, request_id } )
        } catch ( error ) {
            if( transcription_request.current !== request_id ) return

            toast.error( navigator.onLine ? api_error_message( error ) : `Transcription model is not available offline yet.` )
            set_recording_state( `recorded` )
            set_status_message( `Transcription failed. You can retry or type the transcript.` )
            set_model_status_message( `` )
        } finally {
            if( transcription_abort.current === abort_controller ) transcription_abort.current = null
        }
    }

    const dismiss_recording = () => {
        recording_session.current += 1
        transcription_request.current += 1
        transcription_abort.current?.abort()
        transcription_abort.current = null
        set_recording_state( `idle` )
        set_audio_blob( null )
        set_transcript( `` )
        set_recording_seconds( 0 )
        set_recording_duration_seconds( 0 )
        set_status_message( `` )
        set_error_message( `` )
    }

    useEffect( () => {
        if( !is_open ) return

        get_draft( `voice-update` ).then( draft => {
            if( draft?.value?.transcript ) {
                set_transcript( draft.value.transcript )
                set_audio_blob( draft.value.audio_blob || null )
                set_recording_duration_seconds( draft.value.recording_duration_seconds || 1 )
                submit_transcript( draft.value.transcript, { automatic: true } )
                return
            }

            if( draft?.value?.audio_blob ) {
                set_audio_blob( draft.value.audio_blob )
                set_recording_duration_seconds( draft.value.recording_duration_seconds || 1 )
                if( !navigator.onLine ) warm_transcriber()
                transcribe_recording( draft.value.audio_blob, draft.value.recording_duration_seconds || 1 )
            }
        } )
    }, [ is_open ] )

    useEffect( () => {
        if( is_open ) set_draft( `voice-update`, { transcript, audio_blob, recording_duration_seconds } )
    }, [ transcript, audio_blob, recording_duration_seconds, is_open ] )

    useEffect( () => {
        if( recording_state !== `recording` ) return

        const interval = window.setInterval( () => {
            set_recording_seconds( current_seconds => current_seconds + 1 )
        }, 1_000 )

        return () => window.clearInterval( interval )
    }, [ recording_state ] )

    useEffect( () => () => {
        dismiss_recording()
        recorder.current?.state === `recording` && recorder.current.stop()
        stream_ref.current?.getTracks().forEach( track => track.stop() )
    }, [] )

    useEffect( () => {
        if( is_open ) {
            has_opened.current = true
            return
        }

        if( !has_opened.current ) return

        dismiss_recording()
        delete_draft( `voice-update` ).catch( () => {} )
        if( recorder.current?.state === `recording` ) recorder.current.stop()
        stream_ref.current?.getTracks().forEach( track => track.stop() )
        stream_ref.current = null
    }, [ is_open ] )

    const start_recording = async () => {
        set_error_message( `` )

        if( !navigator.mediaDevices?.getUserMedia ) {
            set_error_message( `This browser cannot record audio.` )
            return
        }

        if( !navigator.onLine ) warm_transcriber()

        try {
            const session_id = recording_session.current + 1
            recording_session.current = session_id
            const stream = await get_microphone_stream()

            if( recording_session.current !== session_id ) {
                stream.getTracks().forEach( track => track.stop() )
                return
            }

            stream_ref.current = stream
            chunks.current = []
            set_recording_seconds( 0 )
            set_recording_duration_seconds( 0 )
            set_audio_blob( null )
            set_transcript( `` )
            recording_started_at.current = Date.now()

            const media_recorder = new MediaRecorder( stream )
            recorder.current = media_recorder

            media_recorder.ondataavailable = event => {
                if( event.data.size > 0 ) chunks.current.push( event.data )
            }
            media_recorder.onstop = () => {
                const blob = new Blob( chunks.current, { type: media_recorder.mimeType || `audio/webm` } )
                const duration_seconds = Math.max( 1, Math.ceil( ( Date.now() - recording_started_at.current ) / 1_000 ) )
                stream.getTracks().forEach( track => track.stop() )
                stream_ref.current = null

                if( recording_session.current !== session_id ) return

                set_audio_blob( blob )
                set_recording_duration_seconds( duration_seconds )
                transcribe_recording( blob, duration_seconds )
            }

            media_recorder.start()
            set_recording_state( `recording` )
            set_status_message( `Recording on this device.` )
        } catch {
            set_error_message( `Microphone permission is needed to record an update.` )
            set_recording_state( `idle` )
        }
    }

    const stop_recording = () => {
        if( recorder.current?.state === `recording` ) recorder.current.stop()
    }

    const retry_transcription = () => transcribe_recording( audio_blob, recording_duration_seconds || 1 )

    const type_transcript = () => {
        set_transcript( `` )
        set_recording_state( `manual_transcript` )
        set_status_message( `Type or paste the transcript before submitting.` )
        window.setTimeout( () => transcript_ref.current?.focus(), 0 )
    }

    function reset_recording() {
        transcription_request.current += 1
        transcription_abort.current?.abort()
        transcription_abort.current = null
        set_audio_blob( null )
        set_transcript( `` )
        set_recording_seconds( 0 )
        set_recording_duration_seconds( 0 )
        set_model_status_message( !navigator.onLine && model_is_ready ? `Local model ready.` : `` )
        set_model_progress( !navigator.onLine && model_is_ready ? 100 : null )
        set_recording_state( `idle` )
        set_status_message( `` )
        set_error_message( `` )
        set_is_submitting( false )
    }

    const transcription_disclosure = navigator.onLine
        ? `Online recordings are sent to Cloudflare for transcription. The transcript is submitted automatically.`
        : `Offline recordings stay on this device and use the local model when cached.`

    async function submit_transcript( transcript_text = transcript, options = {} ) {

        const { automatic = false, request_id = null } = options
        const trimmed_transcript = transcript_text.trim()
        if( !trimmed_transcript ) return
        if( trimmed_transcript.length > max_update_characters ) {
            toast.error( `Transcript is too long.` )
            set_recording_state( automatic ? `send_failed` : `manual_transcript` )
            return
        }

        set_is_submitting( true )
        if( automatic ) {
            set_recording_state( `saving` )
            set_status_message( navigator.onLine ? `Saving your message to the Grapevine.` : `Saving your message for offline sync.` )
        }

        const payload = {
            body: trimmed_transcript,
            source: `voice_transcript`,
            client_recorded_at: new Date().toISOString(),
        }

        try {
            if( navigator.onLine ) {
                await api_post( `/api/messages`, payload )
            } else {
                await enqueue_write( { action: `create_message`, body: payload } )
            }

            if( request_id && transcription_request.current !== request_id ) return

            await delete_draft( `voice-update` )
            reset_recording()
            toast.success( navigator.onLine ? `Your message has been sent into the Grapevine.` : `Your message will be sent into the Grapevine when you are back online.` )
            window.dispatchEvent( new Event( `grapevine:messages-changed` ) )
            close()
        } catch ( error ) {
            if( request_id && transcription_request.current !== request_id ) return

            if( !navigator.onLine ) {
                await enqueue_write( { action: `create_message`, body: payload } )
                toast.success( `Your message will be sent into the Grapevine when you are back online.` )
                window.dispatchEvent( new Event( `grapevine:messages-changed` ) )
                close()
            } else {
                toast.error( api_error_message( error ) )
                if( automatic ) {
                    set_recording_state( `send_failed` )
                    set_status_message( `Message could not be sent. You can try again or record again.` )
                }
            }
        } finally {
            if( !request_id || transcription_request.current === request_id ) set_is_submitting( false )
        }
    }

    const show_meter = recording_state !== `idle` || Boolean( model_status_message )
    const is_loading_model_while_recording = recording_state === `recording` && Boolean( model_status_message ) && !model_is_ready
    const show_progress = recording_state === `transcribing` || is_loading_model_while_recording

    return <Modal title="Record update" is_open={ is_open } close={ close }>
        <Stack>
            <Intro>You can record an update here and submit it to the Grapevine so others can keep up with what matters in your life.</Intro>

            { show_meter ? <Meter>
                { status_message ? <MeterLine>
                    { recording_state === `recording` ? <Timer><Clock3 size={ 15 } aria-hidden="true" />{ format_duration( recording_seconds ) }</Timer> : null }
                    { recording_state === `saving` ? <CheckCircle2 size={ 16 } aria-hidden="true" /> : null }
                    <span aria-live="polite">{ status_message }</span>
                </MeterLine> : null }
                { model_status_message ? <MeterLine>
                    <span>{ model_status_message }</span>
                </MeterLine> : null }
                { show_progress ? <ProgressTrack role="progressbar" aria-label="Transcription progress" aria-valuemin={ 0 } aria-valuemax={ 100 } aria-valuenow={ model_progress ?? undefined }>
                    <ProgressBar $progress={ model_is_ready && recording_state === `transcribing` ? null : model_progress } />
                </ProgressTrack> : null }
            </Meter> : null }

            { error_message ? <ErrorText><AlertCircle size={ 17 } aria-hidden="true" />{ error_message }</ErrorText> : null }

            { recording_state === `idle` ? <Disclosure id={ transcription_disclosure_id }>{ transcription_disclosure }</Disclosure> : null }

            { recording_state === `idle` ? <PrimaryAction type="button" variant="primary" aria-describedby={ transcription_disclosure_id } onClick={ start_recording }>
                <Mic size={ 18 } aria-hidden="true" />
                Record
            </PrimaryAction> : null }

            { recording_state === `recording` ? <PrimaryAction type="button" variant="danger" onClick={ stop_recording }>
                <Square size={ 18 } aria-hidden="true" />
                Stop
            </PrimaryAction> : null }

            { recording_state === `recorded` ? <Actions>
                <Button type="button" variant="primary" disabled={ !audio_blob } onClick={ retry_transcription }>
                    Retry transcription
                </Button>
                <Button type="button" onClick={ type_transcript }>
                    Type transcript
                </Button>
                <Button type="button" onClick={ reset_recording }>
                    <RotateCcw size={ 18 } aria-hidden="true" />
                    Record again
                </Button>
            </Actions> : null }

            { recording_state === `send_failed` ? <Actions>
                <Button type="button" variant="primary" disabled={ is_submitting || !transcript.trim() } onClick={ () => submit_transcript( transcript, { automatic: true } ) }>
                    <Send size={ 18 } aria-hidden="true" />
                    Try sending again
                </Button>
                <Button type="button" onClick={ reset_recording }>
                    <RotateCcw size={ 18 } aria-hidden="true" />
                    Record again
                </Button>
            </Actions> : null }

            { recording_state === `manual_transcript` ? <>
                <Field label="Transcript">
                    <Textarea ref={ transcript_ref } value={ transcript } maxLength={ max_update_characters } onChange={ event => set_transcript( event.target.value ) } />
                </Field>
                <Actions>
                    <Button type="button" disabled={ is_submitting } onClick={ reset_recording }>
                        <RotateCcw size={ 18 } aria-hidden="true" />
                        Record again
                    </Button>
                    <Button type="button" variant="primary" disabled={ is_submitting || !transcript.trim() } onClick={ () => submit_transcript() }>
                        <Send size={ 18 } aria-hidden="true" />
                        Submit transcript
                    </Button>
                </Actions>
            </> : null }
        </Stack>
    </Modal>
}
