import assert from 'node:assert/strict'
import test from 'node:test'

import { assert_cloud_audio_size, default_transcription_max_audio_bytes } from '../../src/modules/transcription.js'

test( `cloud transcription rejects audio above the client upload cap`, () => {
    const accepted_blob = new Blob( [ `audio` ], { type: `audio/webm` } )
    const oversized_blob = new Blob( [ `audio bytes` ], { type: `audio/webm` } )

    assert.doesNotThrow( () => assert_cloud_audio_size( accepted_blob, default_transcription_max_audio_bytes ) )
    assert.throws( () => assert_cloud_audio_size( oversized_blob, 1 ), error => {
        assert.equal( error.code, `audio_too_large` )
        assert.match( error.message, /shorter update/ )

        return true
    } )
} )
