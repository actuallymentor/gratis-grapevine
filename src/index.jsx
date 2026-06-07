import React from 'react'
import { createRoot } from 'react-dom/client'
import { log } from 'mentie'

import App from './App.jsx'
import './index.css'

const root_element = document.getElementById( `root` )

if( root_element ) {
    createRoot( root_element ).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
    )
} else {
    log.error( `Root element was not found` )
}
