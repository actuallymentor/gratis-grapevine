import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig( {
    plugins: [
        react(),
        VitePWA( {
            strategies: `injectManifest`,
            srcDir: `src`,
            filename: `service_worker.js`,
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
            injectManifest: {
                globIgnores: [ `**/*.wasm` ],
            },
        } ),
    ],
} )
