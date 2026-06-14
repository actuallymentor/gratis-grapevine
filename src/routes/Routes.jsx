import { Navigate, Route, Routes as RouterRoutes } from 'react-router'

import { AppShell } from '../components/molecules/AppShell.jsx'
import { AuthPanel } from '../components/molecules/AuthPanel.jsx'
import { ReviewState } from '../components/molecules/ReviewState.jsx'
import { AdminMessagesPage } from '../components/pages/AdminMessagesPage.jsx'
import { AdminPage } from '../components/pages/AdminPage.jsx'
import { ArchivePage } from '../components/pages/ArchivePage.jsx'
import { CommunityBulletinsPage } from '../components/pages/CommunityBulletinsPage.jsx'
import { HomePage } from '../components/pages/HomePage.jsx'
import { MembersPage } from '../components/pages/MembersPage.jsx'
import { LoadingBlock } from '../components/atoms/StateBlock.jsx'
import { use_session_store } from '../stores/session_store.js'

/**
 * Renders the app route tree according to account state.
 * @returns {JSX.Element} Routes
 */
export default function Routes() {

    const user = use_session_store( state => state.user )
    const is_loading = use_session_store( state => state.is_loading )

    if( is_loading ) return <main style={ { padding: `1.5rem` } }>
        <LoadingBlock label="Loading Grapevine" />
    </main>

    if( !user ) return <AuthPanel />
    if( user.status !== `accepted` ) return <ReviewState user={ user } />

    return <AppShell>
        <RouterRoutes>
            <Route path="/" element={ <HomePage /> } />
            <Route path="/bulletins" element={ <CommunityBulletinsPage /> } />
            <Route path="/archive" element={ <ArchivePage /> } />
            <Route path="/archive/:id" element={ <ArchivePage /> } />
            <Route path="/members" element={ <MembersPage /> } />
            <Route path="/admin" element={ user.role === `admin` ? <AdminPage /> : <Navigate to="/" replace /> } />
            <Route path="/admin/messages" element={ user.role === `admin` ? <AdminMessagesPage /> : <Navigate to="/" replace /> } />
            <Route path="*" element={ <Navigate to="/" replace /> } />
        </RouterRoutes>
    </AppShell>
}
