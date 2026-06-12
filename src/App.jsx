import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter } from 'react-router'
import { QueryParamProvider } from 'use-query-params'
import { WindowHistoryAdapter } from 'use-query-params/adapters/window'
import { registerSW } from 'virtual:pwa-register'

import Routes from './routes/Routes.jsx'
import { RefreshBadge } from './components/molecules/RefreshBadge.jsx'
import { InstallPill } from './components/molecules/InstallPill.jsx'
import { use_pwa_store } from './stores/pwa_store.js'
import { use_session_store } from './stores/session_store.js'
import { use_display_store } from './stores/display_store.js'
import { start_periodic_service_worker_updates } from './modules/pwa_update.js'

export default function App() {

    const load_me = use_session_store( state => state.load_me )
    const set_refresh_handler = use_pwa_store( state => state.set_refresh_handler )
    const set_update_ready = use_pwa_store( state => state.set_update_ready )
    const text_size = use_display_store( state => state.text_size )
    const line_height = use_display_store( state => state.line_height )

    useEffect( () => {
        load_me()
    }, [ load_me ] )

    useEffect( () => {
        let is_active = true
        let stop_periodic_updates = () => {}

        const update_service_worker = registerSW( {
            immediate: true,
            onNeedRefresh() {
                set_update_ready( true )
            },
            onRegisteredSW( service_worker_url, registration ) {
                if( !is_active ) return

                stop_periodic_updates()

                if( registration?.waiting ) set_update_ready( true )

                stop_periodic_updates = start_periodic_service_worker_updates(
                    service_worker_url,
                    registration,
                    () => set_update_ready( true ),
                )
            },
        } )

        set_refresh_handler( () => update_service_worker( true ) )

        return () => {
            is_active = false
            stop_periodic_updates()
            set_refresh_handler( null )
        }
    }, [ set_refresh_handler, set_update_ready ] )

    useEffect( () => {
        document.documentElement.style.setProperty( `--app-font-size`, text_size )
        document.documentElement.style.setProperty( `--app-line-height`, line_height )
    }, [ text_size, line_height ] )

    useEffect( () => {
        const update_fixed_viewport_bottom = () => {
            const visual_viewport = window.visualViewport
            const visual_height = visual_viewport?.height || window.innerHeight
            const visual_offset_top = visual_viewport?.offsetTop || 0
            const document_height = document.documentElement.clientHeight || visual_height
            const visible_height = Math.min( visual_height, document_height )
            const fixed_bottom = Math.max( 0, window.innerHeight - visible_height - visual_offset_top )

            document.documentElement.style.setProperty( `--fixed-viewport-bottom`, `${ fixed_bottom }px` )
        }

        update_fixed_viewport_bottom()
        let animation_frame = null
        let frame_count = 0
        const watch_viewport = () => {
            update_fixed_viewport_bottom()
            frame_count += 1
            if( frame_count < 60 ) animation_frame = window.requestAnimationFrame( watch_viewport )
        }

        animation_frame = window.requestAnimationFrame( watch_viewport )
        const settled_timeout = window.setTimeout( update_fixed_viewport_bottom, 250 )
        window.addEventListener( `resize`, update_fixed_viewport_bottom )
        window.visualViewport?.addEventListener( `resize`, update_fixed_viewport_bottom )
        window.visualViewport?.addEventListener( `scroll`, update_fixed_viewport_bottom )

        return () => {
            if( animation_frame ) window.cancelAnimationFrame( animation_frame )
            window.clearTimeout( settled_timeout )
            window.removeEventListener( `resize`, update_fixed_viewport_bottom )
            window.visualViewport?.removeEventListener( `resize`, update_fixed_viewport_bottom )
            window.visualViewport?.removeEventListener( `scroll`, update_fixed_viewport_bottom )
        }
    }, [] )

    return <BrowserRouter>
        <QueryParamProvider adapter={ WindowHistoryAdapter }>
            <Routes />
            <InstallPill />
            <RefreshBadge />
            <Toaster
                position="top-center"
                toastOptions={ {
                    duration: 4_000,
                    style: {
                        borderRadius: `8px`,
                        border: `1px solid var(--line)`,
                        color: `var(--ink)`,
                        background: `var(--surface)`,
                    },
                } }
            />
        </QueryParamProvider>
    </BrowserRouter>
}
