import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig( {
    plugins: [
        react(),
        VitePWA( {
            registerType: `prompt`,
            includeAssets: [ `robots.txt`, `icons/icon-192.svg`, `icons/icon-512.svg` ],
            manifest: {
                name: `Gratis Grapevine`,
                short_name: `Grapevine`,
                description: `Member updates for the Gratis community.`,
                theme_color: `#211aff`,
                background_color: `#f7f6f2`,
                display: `standalone`,
                start_url: `/`,
                icons: [
                    {
                        src: `/icons/icon-192.svg`,
                        sizes: `192x192`,
                        type: `image/svg+xml`,
                        purpose: `any maskable`,
                    },
                    {
                        src: `/icons/icon-512.svg`,
                        sizes: `512x512`,
                        type: `image/svg+xml`,
                        purpose: `any maskable`,
                    },
                ],
            },
            workbox: {
                navigateFallback: `/index.html`,
                globIgnores: [ `**/*.wasm` ],
                runtimeCaching: [
                    {
                        urlPattern: ( { url } ) => url.origin === self.location.origin && url.pathname.endsWith( `.wasm` ),
                        handler: `CacheFirst`,
                        options: {
                            cacheName: `runtime-wasm`,
                            expiration: {
                                maxEntries: 12,
                                maxAgeSeconds: 60 * 60 * 24 * 180,
                            },
                        },
                    },
                    {
                        urlPattern: ( { url, request } ) => request.method === `GET` && url.pathname.startsWith( `/api/grapevine` ),
                        handler: `NetworkFirst`,
                        options: {
                            cacheName: `grapevine-updates`,
                            expiration: {
                                maxEntries: 60,
                                maxAgeSeconds: 60 * 60 * 24 * 365,
                            },
                        },
                    },
                    {
                        urlPattern: ( { url, request } ) => request.method === `GET` && url.pathname.startsWith( `/api/members` ),
                        handler: `NetworkFirst`,
                        options: {
                            cacheName: `grapevine-members`,
                            expiration: {
                                maxEntries: 30,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/huggingface\.co\/.*$/i,
                        handler: `CacheFirst`,
                        options: {
                            cacheName: `transcription-models`,
                            expiration: {
                                maxEntries: 120,
                                maxAgeSeconds: 60 * 60 * 24 * 180,
                            },
                        },
                    },
                ],
            },
        } ),
    ],
} )
