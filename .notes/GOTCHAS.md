# Gotchas

- `SPECIFICATION.md` is the active handoff. A tracked lowercase `specifications.md` was already deleted before the implementation session; do not restore it unless the user asks.
- `city-timezones` backs requested-hub city validation. It is a pragmatic maintained dataset with ISO2/ISO3 codes, not a formal ISO city registry.
- Transformers.js emits a large ONNX Runtime WASM asset. `vite.config.js` intentionally excludes `*.wasm` from the PWA precache and caches it on demand.
- The frontend uses `react-router` plus `use-query-params`' window adapter. The React Router adapter requires `react-router-dom`, which is intentionally not installed.
- Playwright in a fresh container may need `npx playwright install chromium` and `sudo npx playwright install-deps chromium`.
- `scripts/render_deploy_config.js` now rejects the placeholder D1 database id. Set `D1_DATABASE_ID` before running `npm run deploy:config` or deploy CI.
- Member update edit/delete is exposed through the `Your updates` section on the latest page and uses the existing IndexedDB queue for offline replay.
- The current local Cloudflare token can upload Worker secrets but fails D1 list/create with API auth code 10000. Full live deploy needs a token with D1 edit/read permissions or an already-created D1 id plus migration access.
