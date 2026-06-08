# Gotchas

- `SPECIFICATION.md` is the active handoff. A tracked lowercase `specifications.md` was already deleted before the implementation session; do not restore it unless the user asks.
- `city-timezones` backs requested-hub city validation. It is a pragmatic maintained dataset with ISO2/ISO3 codes, not a formal ISO city registry.
- Transformers.js emits a large ONNX Runtime WASM asset. `vite.config.js` intentionally excludes `*.wasm` from the PWA precache and caches it on demand.
- The frontend uses `react-router` plus `use-query-params`' window adapter. The React Router adapter requires `react-router-dom`, which is intentionally not installed.
- Playwright in a fresh container may need `npx playwright install chromium` and `sudo npx playwright install-deps chromium`.
- `scripts/render_deploy_config.js` now rejects the placeholder D1 database id. Set `D1_DATABASE_ID` before running `npm run deploy:config` or deploy CI.
- Member update edit/delete is exposed through the `Your updates` section on the latest page and uses the existing IndexedDB queue for offline replay.
- The local Cloudflare token needed D1 Read/Edit added before deployment. That is resolved as of 2026-06-07; `wrangler d1 list/create`, remote migrations, secret uploads, and Worker deploy all work from this container.
- Cloudflare Workers PBKDF2 rejects iteration counts above 100,000. The current password default is capped by that runtime limit, not by ideal PBKDF2 guidance; consider Argon2id/scrypt or a separate password service if password security requirements rise.
- The project intentionally overrides the base design preference accent color. Keep the Gratis Grapevine accent at `#211aff` with white text on filled accent surfaces, even though `~/.agents/preferences/design-preferences.md` lists a different default accent.
