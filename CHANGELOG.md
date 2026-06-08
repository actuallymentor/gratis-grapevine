# Changelog

## [0.3.3] - 2026-06-08

### Fixed

- Show hubs on duplicate selected Ask member chips.

## [0.3.2] - 2026-06-08

### Fixed

- Keep recording timers outside live announcements.
- Cover stale hub filters and duplicate Ask member labels in E2E.

## [0.3.1] - 2026-06-08

### Fixed

- Guard disabled Ask submissions from Enter in filter search.
- Keep stale member hub filters visible and clearable.
- Improve selected states, live progress, and reduced-motion loading.

## [0.3.0] - 2026-06-08

### Added

- Add display settings, accessible modals, and responsive mobile shell.
- Add searchable Ask filters, member hub filtering, and mobile admin cards.
- Add recording timer, permission feedback, and transcription load progress.

### Changed

- Use cooler app surfaces, Google Fonts, and stronger focus states.
- Confirm destructive member/admin actions before applying them.
- Expand loading, cached, empty, and offline states across member screens.

## [0.2.3] - 2026-06-08

### Changed

- Upload Worker runtime secrets during deploy CI with pinned Wrangler v4.
- Remove the temporary Worker secrets file after deploy CI finishes.

## [0.2.2] - 2026-06-08

### Changed

- Use `#211aff` as the accent with white text on filled accent controls.

## [0.2.1] - 2026-06-07

### Fixed

- Use Workers-supported PBKDF2 iterations for password signup.
- Treat unsupported stored PBKDF2 credentials as invalid instead of crashing login.

## [0.2.0] - 2026-06-07

### Added

- Add member update management with offline edit/delete queueing.
- Add timezone-aware summary windows and AI chunking for larger inputs.
- Add E2E coverage for signup, review gates, submissions, admin approval, and questions.

### Fixed

- Return validation envelopes for invalid JSON, periods, and query windows.
- Prevent pending/blocked member names from leaking into AI filter labels.
- Show review state when queued writes replay after account status changes.

### Changed

- Require concrete D1 deploy config and run lint/tests in deploy CI.
- Use a repository `D1_DATABASE_ID` variable for deploy CI.
- Fail deploy CI early when required deploy settings are missing.
- Install Playwright Chromium and apply D1 migrations before deploy.

## [0.1.0] - 2026-06-07

### Added

- Add Vite React PWA with install/update UX and offline cache/queue foundations.
- Add member flows for latest updates, archive, directory, typed updates, voice transcripts, and questions.
- Add admin console for review, hubs, AI usage, manual summaries, and reset tokens.
- Add Cloudflare Worker API, D1 migration, auth/session gates, OpenRouter jobs, and deploy rendering.
- Add GitHub Actions deploy workflow, admin bootstrap script, README docs, and unit/E2E tests.

### Fixed

- Escape generated markdown HTML before rendering AI output.
