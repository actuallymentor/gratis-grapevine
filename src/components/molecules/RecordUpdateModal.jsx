import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { Mic, Send, Square, Wand2 } from 'lucide-react'

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
    display: flex;
    min-height: 48px;
    align-items: center;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--muted);
    background: var(--surface-raised);
`

/**
 * Renders local voice recording, transcription, and transcript submission.
 * @param {Object} props - Modal props
 * @returns {JSX.Element|null} Modal
 */
export function RecordUpdateModal( { is_open, close } ) {

    const recorder = useRef( null )
    const chunks = useRef( [] )
    const [ recording_state, set_recording_state ] = useState( `idle` )
    const [ audio_blob, set_audio_blob ] = useState( null )
    const [ transcript, set_transcript ] = useState( `` )
    const [ is_submitting, set_is_submitting ] = useState( false )

    useEffect( () => {
        if( !is_open ) return
        get_draft( `voice-update` ).then( draft => {
            if( draft?.value?.transcript ) set_transcript( draft.value.transcript )
            if( draft?.value?.audio_blob ) set_audio_blob( draft.value.audio_blob )
        } )
    }, [ is_open ] )

    useEffect( () => {
        if( is_open ) set_draft( `voice-update`, { transcript, audio_blob } )
    }, [ transcript, audio_blob, is_open ] )

    const start_recording = async () => {
        const stream = await navigator.mediaDevices.getUserMedia( { audio: true } )
        chunks.current = []
        const media_recorder = new MediaRecorder( stream )
        recorder.current = media_recorder

        media_recorder.ondataavailable = event => {
            if( event.data.size > 0 ) chunks.current.push( event.data )
        }
        media_recorder.onstop = () => {
            const blob = new Blob( chunks.current, { type: media_recorder.mimeType || `audio/webm` } )
            set_audio_blob( blob )
            stream.getTracks().forEach( track => track.stop() )
            set_recording_state( `recorded` )
        }

        media_recorder.start()
        set_recording_state( `recording` )
    }

    const stop_recording = () => recorder.current?.stop()

    const transcribe = async () => {
        if( !audio_blob ) return

        set_recording_state( `transcribing` )
        try {
            const text = await transcribe_audio_blob( audio_blob )
            set_transcript( text )
            set_recording_state( `transcribed` )
        } catch ( error ) {
            toast.error( navigator.onLine ? api_error_message( error ) : `Transcription model is not available offline yet.` )
            set_recording_state( `recorded` )
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
            set_audio_blob( null )
            set_transcript( `` )
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
            <Meter>
                { recording_state === `idle` ? `Ready to record locally.` : null }
                { recording_state === `recording` ? `Recording locally.` : null }
                { recording_state === `recorded` ? `Audio is stored locally until submitted.` : null }
                { recording_state === `transcribing` ? `Loading model and transcribing locally.` : null }
                { recording_state === `transcribed` ? `Review the transcript before submitting.` : null }
            </Meter>

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
