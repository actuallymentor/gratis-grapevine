import { defineConfig, devices } from '@playwright/test'

export default defineConfig( {
    testDir: `./tests/e2e`,
    timeout: 30_000,
    use: {
        baseURL: `http://127.0.0.1:5173`,
        trace: `on-first-retry`,
        permissions: [ `microphone` ],
        launchOptions: {
            args: [ `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream` ],
        },
    },
    webServer: {
        command: `npm run dev`,
        url: `http://127.0.0.1:5173`,
        reuseExistingServer: true,
        timeout: 120_000,
    },
    projects: [
        {
            name: `chromium`,
            use: { ...devices[ `Desktop Chrome` ] },
        },
        {
            name: `mobile`,
            use: { ...devices[ `Pixel 7` ] },
        },
    ],
} )
