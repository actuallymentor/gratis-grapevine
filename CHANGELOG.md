# Changelog

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

## [0.1.0] - 2026-06-07

### Added

- Add Vite React PWA with install/update UX and offline cache/queue foundations.
- Add member flows for latest updates, archive, directory, typed updates, voice transcripts, and questions.
- Add admin console for review, hubs, AI usage, manual summaries, and reset tokens.
- Add Cloudflare Worker API, D1 migration, auth/session gates, OpenRouter jobs, and deploy rendering.
- Add GitHub Actions deploy workflow, admin bootstrap script, README docs, and unit/E2E tests.

### Fixed

- Escape generated markdown HTML before rendering AI output.
