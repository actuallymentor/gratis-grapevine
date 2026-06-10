# Sandbox, Grapevine

Sandbox, Grapevine is a production-oriented PWA for accepted members of a global community to submit spoken or typed updates, read weekly AI-generated community bulletins, browse accepted members, and ask scoped questions about recent activity.

The frontend is Vite React. The backend is a Cloudflare Worker served with Cloudflare Workers Static Assets, D1, Cron Triggers, passkeys/password fallback, Workers AI for online voice transcription, and OpenRouter for summary/question generation. Online raw audio is sent transiently to the Worker and Cloudflare Workers AI for transcription, but it is not stored; offline transcription stays local in the browser.

Members can adjust local text size and line height from the profile menu. The app uses responsive mobile navigation, accessible dialogs, cached/offline state labels, and confirmation dialogs for destructive update and admin actions.

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
npx wrangler d1 create sandbox-grapevine
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
- `GRAPEVINE_DOMAIN` as a full origin with scheme if the Worker should enforce a specific production origin
- `WEBAUTHN_RP_ID` if passkeys should use a specific relying-party domain

For one-off deploys outside GitHub Actions, set equivalent Worker secrets with Wrangler before deploying.

Do not commit `.env` or `wrangler.generated.jsonc`.

## Deployment

`.github/workflows/deploy.yml` deploys production on pushes to `main` with `cloudflare/wrangler-action`. Non-secret operational settings live in the workflow `env:` block, including optional domain and WebAuthn RP values, summary cadence, timezone, OpenRouter models, Workers AI transcription settings, AI/source-size caps, daily member usage limits, offline transcription model/dtype, session TTL, and D1 database name. The D1 database id comes from the repository variable `D1_DATABASE_ID`, and Worker runtime secrets come from GitHub repository secrets.

The deploy workflow installs Playwright Chromium, verifies the app, builds the PWA, renders `wrangler.generated.jsonc`, prepares a temporary Worker secrets JSON file, applies remote D1 migrations, deploys the Worker plus static assets with Wrangler v4 and `--secrets-file`, and removes the temp secrets file.

`scripts/render_deploy_config.js` renders `wrangler.generated.jsonc` from `wrangler.template.jsonc` so Wrangler owns the Cron Trigger and Worker CPU ceiling at deploy time. The default cron is hourly (`0 * * * *`) so cleanup can prune expired transient rows regularly. Worker code only generates a scheduled summary during the configured Amsterdam local hour and is idempotent for scheduled periods.

The Worker and default D1 lookup name are `sandbox-grapevine`. For an in-place rebrand of an existing Cloudflare deployment, confirm the custom domain or route points at this Worker after deploy. If you reuse an existing D1 database with a different Cloudflare name, keep `D1_DATABASE_ID` pointed at that database and pass `--database <existing-name>` to one-off commands such as `npm run admin:bootstrap`.

The rebrand changes browser storage identifiers. Active sessions may need to log in again after deploy, and same-origin installs may not carry over unsynced offline drafts or queued updates. Ask members to sync important pending updates before cutover. Passkeys are scoped to the configured RP ID or request hostname; if the production hostname or RP ID changes, members may need to use password fallback and register a new passkey.

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

Source updates are treated as untrusted data inside model prompts. The Worker wraps member text as quoted source material, tells the model to ignore instructions inside source updates or chunk summaries, rejects obvious raw-source export requests, and caps model-visible source rows, chunks, per-message text, and output tokens.

## Cost And Security Controls

The Worker rejects JSON bodies over 128 KB, typed/voice update bodies over 5,000 characters, open Ask questions over 1,200 characters, and Ask filter lists over 50 ids. Ask Grapevine defaults to at most 240 source messages, 80 messages per AI chunk, 4 chunks, 2,000 model-visible characters per message, and 900 OpenRouter output tokens. Weekly summaries default to at most 500 source messages before the same chunking caps apply.

Online transcription uploads are capped at 10 MB. Recording-minute usage is charged as the greater of reported duration, one minute, or a size floor of 60 seconds per uploaded megabyte so stale or manipulated clients cannot submit large audio as a one-second recording.

The generated Wrangler config sets `limits.cpu_ms` to 1,000 ms by default. Cloudflare plan-level controls still need to be configured in the Cloudflare dashboard or API: add WAF/rate-limit rules for unauthenticated auth/signup/reset endpoints, configure budget or usage alerts, and route OpenRouter through Cloudflare AI Gateway if you want dashboard-enforced AI spend limits.

## Daily Usage Limits

The Worker enforces per-user daily limits in D1 using the configured `GRAPEVINE_TIMEZONE` day. Defaults are 60 uploaded recording minutes, 5 submitted messages, and 10 Ask Grapevine questions per accepted member per day. Tune them with `GRAPEVINE_DAILY_RECORDING_MINUTES`, `GRAPEVINE_DAILY_MESSAGE_LIMIT`, and `GRAPEVINE_DAILY_QUESTION_LIMIT` in the deployment environment.

Recording minutes are reserved when online audio reaches `/api/transcriptions`, using app-reported duration metadata with the one-minute and size-based floors described above. This recording-minute cap is an operational fairness guard, not tamper-proof decoded media-duration enforcement. Message limits apply to `POST /api/messages` for typed and voice transcript creates; edits and deletes do not count. Ask limits apply to both scoped updates and open questions through `POST /api/grapevine/query`.

Raising a daily limit takes effect on the next write. Lowering a limit also takes effect immediately, so members already above the new cap wait until the next configured daily reset.

## Offline Behavior

Cached after first successful load:

- latest Grapevine update
- opened archive entries
- loaded member directory searches, with offline filtering from the cached full directory after it has been loaded once
- minimal hubs and member-name filters used by Ask Grapevine

Queued locally in IndexedDB:

- creating typed updates
- creating voice transcript updates
- editing/deleting own updates from the "Your Updates Archive" section

Queued writes replay only after `/api/me` confirms the account is still accepted. Daily message limits are enforced when queued creates replay, using the server-side daily bucket at replay time. Raw recorded audio is stored only as a local draft for recovery/transcription and is deleted after message submission, offline queueing, or when the recording modal is closed. Online transcription uploads raw audio transiently to `/api/transcriptions`; offline transcription uses the cached browser model when available. Audio uploads are capped by `WORKERS_AI_TRANSCRIPTION_MAX_AUDIO_BYTES` and `VITE_TRANSCRIPTION_MAX_AUDIO_BYTES`.

Explicit logout and account switches clear the app IndexedDB database plus old `grapevine-*` service-worker caches. Session expiry clears cached reads and drafts while preserving queued offline writes for re-login by the same stored user id. The service worker no longer runtime-caches authenticated API responses; the Hugging Face transcription model cache remains because it does not contain member data.

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

Passkeys require the configured RP ID and browser origin to match. If `GRAPEVINE_DOMAIN` and `WEBAUTHN_RP_ID` are unset, the Worker derives them from the current request origin. Use password fallback for local smoke tests.

Microphone recording starts only after the user clicks the record action. Stopping a recording automatically transcribes it with Cloudflare Workers AI when online, or with the browser-local model when offline, then submits or queues the transcript without a review step. Transcription failure or empty speech keeps retry and manual transcript recovery available. Browser permission denial leaves raw audio local and unsent.

The recording flow uploads audio only to the authenticated transcription endpoint while online. It starts loading the configured Transformers.js model only for offline transcription and shows model-loading progress when transcription is waiting on it. Offline transcription only works after the model and ONNX Runtime assets have already been cached.

Cloudflare Cron Trigger changes can take time to propagate. The Worker is safe to run hourly because scheduled summaries are idempotent by period and cleanup deletes only expired transient rows.
