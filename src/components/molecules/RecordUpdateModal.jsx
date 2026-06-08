import { useEffect, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import toast from 'react-hot-toast'
import { AlertCircle, Clock3, Mic, RotateCcw, Send, Square, Wand2 } from 'lucide-react'

import { Button } from '../atoms/Button.jsx'
import { Field, Textarea } from '../atoms/Field.jsx'
import { Modal } from '../atoms/Modal.jsx'
import { api_error_message, api_post } from '../../modules/api.js'
import { delete_draft, enqueue_write, get_draft, set_draft } from '../../modules/offline_store.js'
import { transcribe_audio_blob } from '../../modules/transcription.js'

const Stack = styled.div`
    display: grid;
    gap: var(--space-m);
`

const Actions = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
`

const Meter = styled.div`
    display: grid;
    min-height: 48px;
    gap: 0.35rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--muted);
    background: var(--surface-raised);
`

const MeterLine = styled.div`
    display: flex;
    align-items: center;
    gap: 0.45rem;
`

const Timer = styled.span`
    display: inline-flex;
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

const format_duration = total_seconds => {

    const minutes = Math.floor( total_seconds / 60 )
    const seconds = `${ total_seconds % 60 }`.padStart( 2, `0` )
    return `${ minutes }:${ seconds }`
}

/**
 * Renders local voice recording, transcription, and transcript submission.
 * @param {Object} props - Modal props
 * @returns {JSX.Element|null} Modal
 */
export function RecordUpdateModal( { is_open, close } ) {

    const recorder = useRef( null )
    const stream_ref = useRef( null )
    const chunks = useRef( [] )
    const [ recording_state, set_recording_state ] = useState( `idle` )
    const [ audio_blob, set_audio_blob ] = useState( null )
    const [ transcript, set_transcript ] = useState( `` )
    const [ is_submitting, set_is_submitting ] = useState( false )
    const [ recording_seconds, set_recording_seconds ] = useState( 0 )
    const [ transcription_progress, set_transcription_progress ] = useState( null )
    const [ status_message, set_status_message ] = useState( `Ready to record locally.` )
    const [ error_message, set_error_message ] = useState( `` )

    useEffect( () => {
        if( !is_open ) return
        get_draft( `voice-update` ).then( draft => {
            if( draft?.value?.transcript ) {
                set_transcript( draft.value.transcript )
                set_recording_state( `transcribed` )
                set_status_message( `Review the transcript before submitting.` )
            }
            if( draft?.value?.audio_blob ) {
                set_audio_blob( draft.value.audio_blob )
                set_recording_state( draft?.value?.transcript ? `transcribed` : `recorded` )
                set_status_message( draft?.value?.transcript ? `Review the transcript before submitting.` : `Audio is stored locally until submitted.` )
            }
        } )
    }, [ is_open ] )

    useEffect( () => {
        if( is_open ) set_draft( `voice-update`, { transcript, audio_blob } )
    }, [ transcript, audio_blob, is_open ] )

    useEffect( () => {
        if( recording_state !== `recording` ) return

        const interval = window.setInterval( () => {
            set_recording_seconds( current_seconds => current_seconds + 1 )
        }, 1_000 )

        return () => window.clearInterval( interval )
    }, [ recording_state ] )

    useEffect( () => () => {
        recorder.current?.state === `recording` && recorder.current.stop()
        stream_ref.current?.getTracks().forEach( track => track.stop() )
    }, [] )

    useEffect( () => {
        if( is_open ) return

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

        try {
            const stream = await navigator.mediaDevices.getUserMedia( { audio: true } )
            stream_ref.current = stream
            chunks.current = []
            set_recording_seconds( 0 )
            set_audio_blob( null )
            set_transcription_progress( null )

            const media_recorder = new MediaRecorder( stream )
            recorder.current = media_recorder

            media_recorder.ondataavailable = event => {
                if( event.data.size > 0 ) chunks.current.push( event.data )
            }
            media_recorder.onstop = () => {
                const blob = new Blob( chunks.current, { type: media_recorder.mimeType || `audio/webm` } )
                set_audio_blob( blob )
                stream.getTracks().forEach( track => track.stop() )
                stream_ref.current = null
                set_recording_state( `recorded` )
                set_status_message( `Audio is stored locally until submitted.` )
            }

            media_recorder.start()
            set_recording_state( `recording` )
            set_status_message( `Recording locally.` )
        } catch {
            set_error_message( `Microphone permission is needed to record an update.` )
            set_recording_state( `idle` )
        }
    }

    const stop_recording = () => {
        if( recorder.current?.state === `recording` ) recorder.current.stop()
    }

    const reset_recording = () => {
        set_audio_blob( null )
        set_transcript( `` )
        set_recording_seconds( 0 )
        set_transcription_progress( null )
        set_recording_state( `idle` )
        set_status_message( `Ready to record locally.` )
        set_error_message( `` )
    }

    const transcribe = async () => {
        if( !audio_blob ) return

        set_recording_state( `transcribing` )
        set_status_message( `Loading local transcription model.` )
        set_transcription_progress( null )
        try {
            const text = await transcribe_audio_blob( audio_blob, {
                progress_callback( progress_info ) {
                    const progress = Math.round( progress_info.progress )

                    if( progress_info.status === `progress` && Number.isFinite( progress ) ) {
                        set_transcription_progress( progress )
                        set_status_message( `Loading local model: ${ progress }%` )
                    }

                    if( progress_info.status === `ready` ) set_status_message( `Local model ready.` )
                    if( progress_info.status === `transcribing` ) {
                        set_transcription_progress( null )
                        set_status_message( `Transcribing audio locally.` )
                    }
                },
            } )
            set_transcript( text )
            set_recording_state( `transcribed` )
            set_transcription_progress( 100 )
            set_status_message( `Review the transcript before submitting.` )
        } catch ( error ) {
            toast.error( navigator.onLine ? api_error_message( error ) : `Transcription model is not available offline yet.` )
            set_recording_state( `recorded` )
            set_status_message( `Audio is stored locally until submitted.` )
        }
    }

    const submit_update = async () => {
        if( !transcript.trim() ) return
        set_is_submitting( true )

        try {
            const payload = {
                body: transcript.trim(),
                source: `voice_transcript`,
                client_recorded_at: new Date().toISOString(),
            }

            if( navigator.onLine ) {
                await api_post( `/api/messages`, payload )
            } else {
                await enqueue_write( { action: `create_message`, body: payload } )
            }

            await delete_draft( `voice-update` )
            reset_recording()
            toast.success( navigator.onLine ? `Transcript submitted.` : `Transcript queued.` )
            window.dispatchEvent( new Event( `grapevine:messages-changed` ) )
            close()
        } catch ( error ) {
            if( !navigator.onLine ) {
                await enqueue_write( { action: `create_message`, body: { body: transcript.trim(), source: `voice_transcript` } } )
                toast.success( `Transcript queued.` )
                window.dispatchEvent( new Event( `grapevine:messages-changed` ) )
                close()
            } else {
                toast.error( api_error_message( error ) )
            }
        } finally {
            set_is_submitting( false )
        }
    }

    return <Modal title="Record update" is_open={ is_open } close={ close }>
        <Stack>
            <Meter aria-live="polite">
                <MeterLine>
                    { recording_state === `recording` ? <Timer><Clock3 size={ 15 } aria-hidden="true" />{ format_duration( recording_seconds ) }</Timer> : null }
                    <span>{ status_message }</span>
                </MeterLine>
                { recording_state === `transcribing` ? <ProgressTrack role="progressbar" aria-label="Transcription progress" aria-valuemin={ 0 } aria-valuemax={ 100 } aria-valuenow={ transcription_progress ?? undefined }>
                    <ProgressBar $progress={ transcription_progress } />
                </ProgressTrack> : null }
            </Meter>

            { error_message ? <ErrorText><AlertCircle size={ 17 } aria-hidden="true" />{ error_message }</ErrorText> : null }

            <Actions>
                { recording_state !== `recording` ? <Button type="button" variant="primary" onClick={ start_recording }>
                    <Mic size={ 18 } aria-hidden="true" />
                    Record
                </Button> : <Button type="button" variant="danger" onClick={ stop_recording }>
                    <Square size={ 18 } aria-hidden="true" />
                    Stop
                </Button> }
                <Button type="button" disabled={ !audio_blob || recording_state === `transcribing` } onClick={ transcribe }>
                    <Wand2 size={ 18 } aria-hidden="true" />
                    Transcribe
                </Button>
                <Button type="button" disabled={ recording_state === `recording` || recording_state === `transcribing` } onClick={ reset_recording }>
                    <RotateCcw size={ 18 } aria-hidden="true" />
                    Reset
                </Button>
            </Actions>

            <Field label="Transcript">
                <Textarea value={ transcript } onChange={ event => set_transcript( event.target.value ) } />
            </Field>

            <Button type="button" variant="primary" disabled={ is_submitting || !transcript.trim() } onClick={ submit_update }>
                <Send size={ 18 } aria-hidden="true" />
                Submit transcript
            </Button>
        </Stack>
    </Modal>
}
