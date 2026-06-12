import { log } from 'mentie'

const service_worker_update_interval_ms = 60 * 60 * 1_000
const no_store_fetch_options = {
    cache: `no-store`,
    headers: {
        "cache-control": `no-store`,
    },
}

const can_reach_network = () => typeof navigator === `undefined` || navigator.onLine !== false
const is_force_update_running = () => typeof window !== `undefined` && window.__grapevine_forcing_update === true

/**
 * Checks the service worker script with cache bypassing and asks the browser to install it if changed.
 * @param {String} service_worker_url - Generated service worker URL
 * @param {ServiceWorkerRegistration} registration - Current registration
 * @returns {Promise<Boolean>} Whether an update check was attempted
 */
export async function check_service_worker_update( service_worker_url, registration ) {

    if( !service_worker_url || !registration || registration.installing || is_force_update_running() || !can_reach_network() ) return false

    const response = await fetch( service_worker_url, no_store_fetch_options )

    if( response?.status !== 200 ) return false

    await registration.update()
    return true
}

/**
 * Starts a guarded periodic service worker update check.
 * @param {String} service_worker_url - Generated service worker URL
 * @param {ServiceWorkerRegistration} registration - Current registration
 * @param {Function} mark_update_waiting - Callback for waiting updates
 * @returns {Function} Cleanup function
 */
export function start_periodic_service_worker_updates( service_worker_url, registration, mark_update_waiting ) {

    if( typeof window === `undefined` || !registration ) return () => {}

    let is_stopped = false

    const check_for_update = async () => {
        if( is_stopped ) return

        if( registration.waiting ) {
            mark_update_waiting?.()
            return
        }

        try {
            await check_service_worker_update( service_worker_url, registration )
            if( registration.waiting ) mark_update_waiting?.()
        } catch ( error ) {
            log.warn( `Service worker update check failed`, error )
        }
    }

    void check_for_update()

    const interval_id = window.setInterval( check_for_update, service_worker_update_interval_ms )

    return () => {
        is_stopped = true
        window.clearInterval( interval_id )
    }
}

/**
 * Forces the app shell to be fetched again by clearing Cache Storage, unregistering service workers, and reloading.
 * @returns {Promise<void>} Completion promise
 */
export async function force_app_update_reload() {

    if( typeof window === `undefined` ) return
    if( !can_reach_network() ) throw new Error( `Connect to the internet before updating the app.` )

    window.__grapevine_forcing_update = true

    try {
        const registrations = await list_service_worker_registrations()

        await assert_update_source_reachable( registrations )

        await delete_all_browser_caches()

        await settle_service_worker_tasks(
            registrations.map( registration => registration.unregister() ),
            `Service worker unregister before forced reload failed`,
        )

        reload_app()
    } catch ( error ) {
        window.__grapevine_forcing_update = false
        throw error
    }
}

async function list_service_worker_registrations() {

    if( typeof navigator === `undefined` || !navigator.serviceWorker ) return []

    if( navigator.serviceWorker.getRegistrations ) return navigator.serviceWorker.getRegistrations()

    const registration = await navigator.serviceWorker.getRegistration?.()
    return registration ? [ registration ] : []
}

async function delete_all_browser_caches() {

    if( typeof caches === `undefined` ) return

    const cache_names = await caches.keys()
    await settle_service_worker_tasks(
        cache_names.map( cache_name => caches.delete( cache_name ) ),
        `Browser cache delete before forced reload failed`,
    )
}

async function assert_update_source_reachable( registrations ) {

    const service_worker_url = registrations
        .map( service_worker_url_for_registration )
        .find( Boolean ) || new URL( `/sw.js`, window.location.origin ).href
    const response = await fetch( service_worker_url, no_store_fetch_options )

    if( response?.status !== 200 ) throw new Error( `The app update could not be reached right now.` )
}

function service_worker_url_for_registration( registration ) {

    return registration.active?.scriptURL
        || registration.waiting?.scriptURL
        || registration.installing?.scriptURL
}

async function settle_service_worker_tasks( tasks, warning ) {

    const results = await Promise.allSettled( tasks )

    results
        .filter( ( { status } ) => status === `rejected` )
        .forEach( ( { reason } ) => log.warn( warning, reason ) )

    return results
}

function reload_app() {

    const test_reload = window.__grapevine_reload_app

    if( typeof test_reload === `function` ) {
        test_reload()
        return
    }

    window.location.reload()
}
