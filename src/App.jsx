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

export default function App() {

    const load_me = use_session_store( state => state.load_me )
    const set_refresh_handler = use_pwa_store( state => state.set_refresh_handler )
    const set_update_ready = use_pwa_store( state => state.set_update_ready )

    useEffect( () => {
        load_me()
    }, [ load_me ] )

    useEffect( () => {
        const update_service_worker = registerSW( {
            immediate: true,
            onNeedRefresh() {
                set_update_ready( true )
            },
        } )

        set_refresh_handler( () => update_service_worker( true ) )
    }, [ set_refresh_handler, set_update_ready ] )

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
                        border: `1px solid #d8d6cf`,
                        color: `#242827`,
                        background: `#fffdfa`,
                    },
                } }
            />
        </QueryParamProvider>
    </BrowserRouter>
}
