# Timeline

- 2026-06-07: Created `specifications.md` as the implementation handoff derived from `RAMBLE.md`.
- 2026-06-07: Folded owner clarifications into `specifications.md`, including member browsing, hub rules, archive/manual summaries, typed updates, no remote raw audio, production-only deployment, and indefinite retention.
- 2026-06-07: Clarified that WhatsApp and telephone number are the same field in the product model.
- 2026-06-07: Added final privacy, offline-first, source-message, edit/delete history, and manual-summary period clarifications to `specifications.md`.
- 2026-06-07: Implemented the first Gratis Grapevine app scaffold from `SPECIFICATION.md`: Vite React PWA, Cloudflare Worker/D1 API, migrations, CI deploy rendering, admin bootstrap, README, changelog, and tests.
- 2026-06-07: Chose `city-timezones` as the maintained city validation dataset for requested hubs because it includes city names and ISO2/ISO3 country codes without the bundle size of full world-city datasets.
- 2026-06-07: Excluded Transformers.js WASM from the PWA precache and cache it on demand to avoid Workbox's 2 MiB precache limit while preserving repeat-use offline behavior.
- 2026-06-07: Audited the app against `SPECIFICATION.md` with subagents and filled major gaps: member edit/delete UI, queued-write review-state handling, timezone summary bounds, AI chunking, safer deploy config validation, CI verification, and broader E2E coverage.
