import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()

precacheAndRoute( self.__WB_MANIFEST )

registerRoute(
    new NavigationRoute( createHandlerBoundToURL( `/index.html` ) ),
)

registerRoute(
    ( { url } ) => url.origin === self.location.origin && url.pathname.endsWith( `.wasm` ),
    new CacheFirst( {
        cacheName: `runtime-wasm`,
        plugins: [
            new ExpirationPlugin( {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 180,
            } ),
        ],
    } ),
)

registerRoute(
    ( { url } ) => /^https:\/\/huggingface\.co\/.*$/i.test( url.href ),
    new CacheFirst( {
        cacheName: `transcription-models`,
        plugins: [
            new ExpirationPlugin( {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 180,
            } ),
        ],
    } ),
)

self.addEventListener( `push`, event => {

    const payload = read_push_payload( event )
    const title = payload.title || `Sandbox, Grapevine`
    const options = {
        body: payload.body || `Open the Grapevine for the latest update.`,
        icon: payload.icon || `/icons/icon-192.svg`,
        badge: payload.badge || `/icons/icon-192.svg`,
        tag: payload.tag,
        renotify: payload.renotify,
        requireInteraction: payload.requireInteraction,
        silent: payload.silent,
        timestamp: payload.timestamp || Date.now(),
        data: {
            url: `/`,
            ...payload.data,
        },
    }

    event.waitUntil( self.registration.showNotification( title, options ) )
} )

self.addEventListener( `notificationclick`, event => {

    event.notification.close()

    const target_url = new URL( event.notification.data?.url || `/`, self.location.origin ).href
    event.waitUntil( focus_or_open_client( target_url ) )
} )

self.addEventListener( `pushsubscriptionchange`, event => {

    event.waitUntil( refresh_push_subscription() )
} )

function read_push_payload( event ) {

    try {
        return event.data?.json() || {}
    } catch {
        return {}
    }
}

async function focus_or_open_client( target_url ) {

    const windows = await self.clients.matchAll( { type: `window`, includeUncontrolled: true } )
    const existing_client = windows.find( client => new URL( client.url ).origin === self.location.origin )

    if( existing_client ) {
        await existing_client.focus()
        if( existing_client.url !== target_url ) return existing_client.navigate( target_url )
        return existing_client
    }

    return self.clients.openWindow( target_url )
}

async function refresh_push_subscription() {

    if( !self.registration.pushManager ) return

    const config_response = await fetch( `/api/notifications/vapid-public-key`, { credentials: `same-origin` } )
    if( !config_response.ok ) return

    const config = await config_response.json()
    if( !config.supported || !config.public_key ) return

    const subscription = await self.registration.pushManager.subscribe( {
        userVisibleOnly: true,
        applicationServerKey: base64url_to_uint8_array( config.public_key ),
    } )

    await fetch( `/api/notifications/subscriptions`, {
        method: `POST`,
        credentials: `same-origin`,
        headers: { "content-type": `application/json` },
        body: JSON.stringify( subscription_payload( subscription ) ),
    } )
}

function subscription_payload( subscription ) {

    const json = subscription.toJSON()

    return {
        ...json,
        content_encoding: supported_content_encoding(),
    }
}

function supported_content_encoding() {

    const encodings = typeof PushManager === `undefined` ? [] : PushManager.supportedContentEncodings || []
    return encodings.includes( `aes128gcm` ) ? `aes128gcm` : `aesgcm`
}

function base64url_to_uint8_array( value ) {

    const padded = `${ value }${ `=`.repeat( ( 4 - value.length % 4 ) % 4 ) }`
        .replaceAll( `-`, `+` )
        .replaceAll( `_`, `/` )
    const raw = atob( padded )

    return Uint8Array.from( raw, character => character.charCodeAt( 0 ) )
}
