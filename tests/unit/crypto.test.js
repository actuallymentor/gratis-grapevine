import assert from 'node:assert/strict'
import test from 'node:test'

import { hash_password, verify_password } from '../../worker/modules/crypto.js'

test( `uses a Workers-supported PBKDF2 iteration count by default`, async () => {
    const credential = await hash_password( `correct horse battery staple` )
    const { iterations } = JSON.parse( credential.parameters_json )

    assert.equal( iterations, 100_000 )
} )

test( `verifies a password against the stored hash parameters`, async () => {
    const credential = await hash_password( `correct horse battery staple` )

    assert.equal( await verify_password( `correct horse battery staple`, credential ), true )
    assert.equal( await verify_password( `wrong horse battery staple`, credential ), false )
} )

test( `verifies a password using stored custom hash parameters`, async () => {
    const credential = await hash_password( `correct horse battery staple`, { iterations: 50_000 } )
    const { iterations } = JSON.parse( credential.parameters_json )

    assert.equal( iterations, 50_000 )
    assert.equal( await verify_password( `correct horse battery staple`, credential ), true )
} )

test( `verifies the maximum Workers-supported iteration count`, async () => {
    const credential = await hash_password( `correct horse battery staple`, { iterations: 100_000 } )

    assert.equal( await verify_password( `correct horse battery staple`, credential ), true )
    assert.equal( await verify_password( `wrong horse battery staple`, credential ), false )
} )

test( `rejects unsupported stored PBKDF2 iteration counts without throwing`, async () => {
    const credential = await hash_password( `correct horse battery staple` )
    const unsupported_credential = {
        ...credential,
        parameters_json: JSON.stringify( { iterations: 210_000, hash: `SHA-256`, length_bits: 256 } ),
    }

    assert.equal( await verify_password( `correct horse battery staple`, unsupported_credential ), false )
    assert.equal( await verify_password( `wrong horse battery staple`, unsupported_credential ), false )
} )

test( `rejects unsupported stored password algorithms without throwing`, async () => {
    const credential = await hash_password( `correct horse battery staple` )
    const unsupported_credential = {
        ...credential,
        algorithm: `Argon2id`,
    }

    assert.equal( await verify_password( `correct horse battery staple`, unsupported_credential ), false )
} )

test( `rejects unsupported stored PBKDF2 hashes without throwing`, async () => {
    const credential = await hash_password( `correct horse battery staple` )
    const unsupported_credential = {
        ...credential,
        parameters_json: JSON.stringify( { iterations: 100_000, hash: `SHA-512`, length_bits: 256 } ),
    }

    assert.equal( await verify_password( `correct horse battery staple`, unsupported_credential ), false )
} )
