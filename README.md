# Gratis Grapevine

Gratis Grapevine is a production-oriented PWA for accepted members of a global community to submit spoken or typed updates, read weekly AI-generated community bulletins, browse accepted members, and ask scoped questions about recent activity.

The frontend is Vite React. The backend is a Cloudflare Worker served with Cloudflare Workers Static Assets, D1, Cron Triggers, passkeys/password fallback, Workers AI for online voice transcription, and OpenRouter for summary/question generation. Online raw audio is sent transiently to the Worker and Cloudflare Workers AI for transcription, but it is not stored; offline transcription stays local in the browser.

Members can adjust local text size and line height from the account display settings. The app uses responsive mobile navigation, accessible dialogs, cached/offline state labels, and confirmation dialogs for destructive update and admin actions.

## Local Development

Use Node 24:

```bash
nvm use
npm ci
npm run dev
```

The Vite dev server runs the frontend. For Worker API development, render config and run Wrangler separately:

```bash
npm run deploy:config
npx wrangler dev --config wrangler.generated.jsonc
```

## D1 Setup

Create the production database and store its database id in the GitHub repository variable `D1_DATABASE_ID`, or export it in the environment used by `npm run deploy:config`.

```bash
npx wrangler d1 create gratis-grapevine
npm run db:migrate:local
npm run db:migrate:remote
```

Migrations live in `worker/migrations`. The first migration creates the account, session, passkey, message, summary, AI request, rate-limit, reset-token, and WebAuthn challenge tables, plus the initial hubs: Amsterdam, London, Madrid, Berlin, Paris, Lisbon, Elsewhere.

## Secrets

GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `OPENROUTER_API_KEY`
- `SESSION_SECRET`

The Cloudflare token must be able to deploy Workers assets, bind Workers AI, and run D1 migrations for the target account. CI uploads `OPENROUTER_API_KEY` and `SESSION_SECRET` as Worker runtime secrets during deploy.

GitHub repository variables:

- `D1_DATABASE_ID`

For one-off deploys outside GitHub Actions, set equivalent Worker secrets with Wrangler before deploying.

Do not commit `.env` or `wrangler.generated.jsonc`.

## Deployment

`.github/workflows/deploy.yml` deploys production on pushes to `main` with `cloudflare/wrangler-action`. Non-secret operational settings live in the workflow `env:` block, including domain, WebAuthn RP values, summary cadence, timezone, OpenRouter models, Workers AI transcription settings, offline transcription model/dtype, session TTL, and D1 database name. The D1 database id comes from the repository variable `D1_DATABASE_ID`, and Worker runtime secrets come from GitHub repository secrets.

The deploy workflow installs Playwright Chromium, verifies the app, builds the PWA, renders `wrangler.generated.jsonc`, prepares a temporary Worker secrets JSON file, applies remote D1 migrations, deploys the Worker plus static assets with Wrangler v4 and `--secrets-file`, and removes the temp secrets file.

`scripts/render_deploy_config.js` renders `wrangler.generated.jsonc` from `wrangler.template.jsonc` so Wrangler owns the Cron Trigger at deploy time. The cron is hourly on Mondays (`0 * * * 1`); Worker code only generates during the configured Amsterdam local hour and is idempotent for scheduled periods.

## Admin Bootstrap

1. Deploy the app and run migrations.
2. Create the first account through normal signup.
3. Promote it once:

```bash
npm run admin:bootstrap -- --email person@example.com
```

Use `--local` for local D1. The script refuses to replace an existing accepted admin.

## Hubs

Initial hubs are seeded by migration. Signup includes a static hub list and a "Request new hub" option. Requested hubs are sanitized and validated with the maintained `city-timezones` dataset, which includes city names plus ISO2/ISO3 country codes. If validation succeeds, the hub is created or reused immediately; otherwise the request is stored for admin mapping.

## Summaries And Questions

Weekly summaries and manual admin summaries use the same prompt path and storage table. Manual generation accepts `period_start` and `period_end` whole-day dates and always creates a new row.

OpenRouter inputs strip emails, phone numbers, WhatsApp links, session/auth data, review notes, and admin-only fields. Weekly/all-community summaries must mention hubs and themes, not individual people. Open question mode rejects person-specific prompts; scoped mode may name explicitly selected members.

## Offline Behavior

Cached after first successful load:

- latest Grapevine update
- opened archive entries
- loaded member directory searches, with offline filtering from the cached full directory after it has been loaded once
- hubs and member filters used by Ask Grapevine

Queued locally in IndexedDB:

- creating typed updates
- creating voice transcript updates
- editing/deleting own updates from the "Your updates" section

Queued writes replay only after `/api/me` confirms the account is still accepted. Raw recorded audio is stored only as a local draft for recovery/transcription and is deleted after transcript submission or when the recording modal is closed. Online transcription uploads raw audio transiently to `/api/transcriptions`; offline transcription uses the cached browser model when available. Audio uploads are capped by `WORKERS_AI_TRANSCRIPTION_MAX_AUDIO_BYTES` and `VITE_TRANSCRIPTION_MAX_AUDIO_BYTES`.

## Retention

Transcripts, generated summaries, and AI request logs are retained indefinitely in this first version. Edits and deletes affect future reads and future AI only; historical generated updates and stored AI answers remain snapshots.

## Tests

```bash
npm run lint
npm run build
npm run test:unit
npm run test:e2e
```

Playwright uses fake microphone devices. If a new container is missing browsers:

```bash
npx playwright install chromium
sudo npx playwright install-deps chromium
```

## Troubleshooting

Passkeys require the configured RP ID and browser origin to match production (`grapevine.gratis.sh`). Use password fallback for local smoke tests.

Microphone recording starts only after the user clicks the record action. Stopping a recording automatically transcribes it with Cloudflare Workers AI when online, or with the browser-local model when offline, then opens the editable transcript. Browser permission denial leaves raw audio local and unsent.

The recording flow uploads audio only to the authenticated transcription endpoint while online. It starts loading the configured Transformers.js model only for offline transcription and shows model-loading progress when transcription is waiting on it. Offline transcription only works after the model and ONNX Runtime assets have already been cached.

Cloudflare Cron Trigger changes can take time to propagate. The Worker is safe to run hourly on Mondays because scheduled summaries are idempotent by period.
