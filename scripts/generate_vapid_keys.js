const base64url_to_bytes = value => {

    const padded = `${ value }${ `=`.repeat( ( 4 - value.length % 4 ) % 4 ) }`
        .replaceAll( `-`, `+` )
        .replaceAll( `_`, `/` )

    return Uint8Array.from( atob( padded ), character => character.charCodeAt( 0 ) )
}

const bytes_to_base64url = bytes => btoa( String.fromCharCode( ...bytes ) )
    .replaceAll( `+`, `-` )
    .replaceAll( `/`, `_` )
    .replaceAll( `=`, `` )

const key_pair = await crypto.subtle.generateKey(
    { name: `ECDSA`, namedCurve: `P-256` },
    true,
    [ `sign`, `verify` ],
)
const public_jwk = await crypto.subtle.exportKey( `jwk`, key_pair.publicKey )
const private_jwk = await crypto.subtle.exportKey( `jwk`, key_pair.privateKey )
const vapid_public_key = bytes_to_base64url( new Uint8Array( [
    0x04,
    ...base64url_to_bytes( public_jwk.x ),
    ...base64url_to_bytes( public_jwk.y ),
] ) )

process.stdout.write( `${ JSON.stringify( {
    VAPID_PUBLIC_KEY: vapid_public_key,
    VAPID_PRIVATE_KEY: JSON.stringify( private_jwk ),
}, null, 4 ) }\n` )

