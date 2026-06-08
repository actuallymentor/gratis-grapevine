# Timeline

- 2026-06-07: Created `specifications.md` as the implementation handoff derived from `RAMBLE.md`.
- 2026-06-07: Folded owner clarifications into `specifications.md`, including member browsing, hub rules, archive/manual summaries, typed updates, no remote raw audio, production-only deployment, and indefinite retention.
- 2026-06-07: Clarified that WhatsApp and telephone number are the same field in the product model.
- 2026-06-07: Added final privacy, offline-first, source-message, edit/delete history, and manual-summary period clarifications to `specifications.md`.
- 2026-06-07: Implemented the first Gratis Grapevine app scaffold from `SPECIFICATION.md`: Vite React PWA, Cloudflare Worker/D1 API, migrations, CI deploy rendering, admin bootstrap, README, changelog, and tests.
- 2026-06-07: Chose `city-timezones` as the maintained city validation dataset for requested hubs because it includes city names and ISO2/ISO3 country codes without the bundle size of full world-city datasets.
- 2026-06-07: Excluded Transformers.js WASM from the PWA precache and cache it on demand to avoid Workbox's 2 MiB precache limit while preserving repeat-use offline behavior.
- 2026-06-07: Audited the app against `SPECIFICATION.md` with subagents and filled major gaps: member edit/delete UI, queued-write review-state handling, timezone summary bounds, AI chunking, safer deploy config validation, CI verification, and broader E2E coverage.
- 2026-06-07: Prepared the Cloudflare deployment path by wiring CI to repository `D1_DATABASE_ID`, installing Playwright Chromium, adding remote D1 migrations before deploy, setting Worker secrets, and confirming live D1 creation is blocked by the current token's D1 permissions.
- 2026-06-07: After D1 permissions were added to the Cloudflare token, created production D1 `gratis-grapevine`, applied `0001_initial.sql`, uploaded Worker secrets, deployed the Worker/assets, and verified `https://grapevine.gratis.sh`.
- 2026-06-07: Fixed production email/password signup 500s by reducing PBKDF2 from 210,000 to Cloudflare Workers' 100,000-iteration maximum, redeployed Worker version `cd9aa174-091e-42b4-8b16-ac3445706dab`, and verified a 201 signup response.
- 2026-06-08: Updated the app accent color to `#211aff` across theme tokens, PWA chrome, app icons, and specification notes, with white text on filled accent controls.
- 2026-06-08: Made deploy CI upload Worker runtime secrets from GitHub repository secrets using a temporary `--secrets-file` with pinned Wrangler 4.98.0, and clean up the temp secrets file after deploy.
- 2026-06-08: Implemented a broad design/UX pass: cooler theme surfaces, Google Fonts loading, display settings, accessible modal focus handling, responsive shell/bottom navigation, richer loading/offline states, guided recording/transcription progress, searchable Ask Grapevine filters, mobile admin cards, confirmation dialogs, and E2E coverage for the new flows.
