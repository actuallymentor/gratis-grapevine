import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig( {
    plugins: [
        react(),
        VitePWA( {
            registerType: `autoUpdate`,
            includeAssets: [ `robots.txt`, `icons/icon-192.svg`, `icons/icon-512.svg` ],
            manifest: {
                name: `Sandbox, Grapevine`,
                short_name: `Grapevine`,
                description: `Member updates for the Sandbox community.`,
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
                skipWaiting: true,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
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
