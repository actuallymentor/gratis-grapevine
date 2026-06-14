import { log } from 'mentie'

import { api_delete, api_get, api_post } from './api.js'

const dismissed_key = `grapevine:notification-permission-dismissed`

const local_storage = () => typeof localStorage === `undefined` ? null : localStorage

const browser_permission = () => {

    if( typeof Notification === `undefined` ) return `unsupported`
    return Notification.permission
}

const is_push_supported = () => typeof window !== `undefined`
    && window.isSecureContext
    && `serviceWorker` in navigator
    && `PushManager` in window
    && `Notification` in window

const is_dismissed = () => local_storage()?.getItem( dismissed_key ) === `1`

const set_dismissed = value => {

    if( value ) local_storage()?.setItem( dismissed_key, `1` )
    else local_storage()?.removeItem( dismissed_key )
}

/**
 * Returns current browser notification support state.
 * @returns {Object} Browser notification state
 */
export function notification_browser_state() {

    return {
        is_supported: is_push_supported(),
        permission: browser_permission(),
        is_dismissed: is_dismissed(),
    }
}

/**
 * Marks the notification permission card as dismissed.
 * @returns {Object} Updated browser notification state
 */
export function dismiss_notification_prompt() {

    set_dismissed( true )
    return notification_browser_state()
}

/**
 * Clears the local notification prompt dismissal.
 * @returns {Object} Updated browser notification state
 */
export function clear_notification_prompt_dismissal() {

    set_dismissed( false )
    return notification_browser_state()
}

/**
 * Reads the server-side notification configuration.
 * @returns {Promise<Object>} Public notification config
 */
export async function load_notification_config() {

    if( !is_push_supported() ) return { supported: false, public_key: null }
    return api_get( `/api/notifications/vapid-public-key` ).catch( error => {
        log.warn( `Failed to load notification config`, error )
        return { supported: false, public_key: null }
    } )
}

/**
 * Requests permission, creates a browser push subscription, and optionally stores it server-side.
 * @param {Object} options - Subscription options
 * @param {Boolean} options.sync_immediately - Whether to save the subscription to the API now
 * @returns {Promise<Object|null>} Push subscription payload
 */
export async function enable_push_notifications( options = {} ) {

    const { sync_immediately = true } = options
    if( !is_push_supported() ) return null

    const config = await load_notification_config()
    if( !config.supported || !config.public_key ) throw new Error( `Notifications are not configured yet.` )

    const permission = browser_permission() === `granted`
        ? `granted`
        : await Notification.requestPermission()
    if( permission !== `granted` ) return null

    const registration = await navigator.serviceWorker.ready
    const existing_subscription = await registration.pushManager.getSubscription()
    const subscription = existing_subscription || await registration.pushManager.subscribe( {
        userVisibleOnly: true,
        applicationServerKey: base64url_to_uint8_array( config.public_key ),
    } )
    const payload = push_subscription_payload( subscription )

    if( sync_immediately ) await save_push_subscription( payload )
    clear_notification_prompt_dismissal()

    return payload
}

/**
 * Saves an existing active browser push subscription to the API.
 * @returns {Promise<Object|null>} Stored subscription payload
 */
export async function sync_existing_push_subscription() {

    if( !is_push_supported() || browser_permission() !== `granted` ) return null

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if( !subscription ) return null

    const payload = push_subscription_payload( subscription )
    await save_push_subscription( payload )

    return payload
}

/**
 * Unsubscribes this browser and deletes this user's saved subscriptions.
 * @returns {Promise<void>} Completion promise
 */
export async function disable_push_notifications() {

    if( is_push_supported() ) {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        await subscription?.unsubscribe()
    }

    await api_delete( `/api/notifications/subscriptions` )
}

async function save_push_subscription( payload ) {

    await api_post( `/api/notifications/subscriptions`, payload )
}

function push_subscription_payload( subscription ) {

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
