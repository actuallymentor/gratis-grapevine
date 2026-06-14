# Sandbox, Grapevine Implementation Specification

This document is the implementation handoff for the first production version of Sandbox, Grapevine. It turns `RAMBLE.md` into concrete product, technical, design, deployment, and verification requirements for an LLM or engineer that will build the application.

## Product Goal

Build a progressive web app for the configured Sandbox, Grapevine deployment origin that lets accepted members of a global community submit spoken updates into "the Grapevine", read the latest weekly AI-generated community update, and ask scoped questions about recent community activity.

The product should feel like a quiet member tool, not a marketing site: immediate app surface, dense enough for repeated use, clear boundaries, calm typography, and bottom-edge mobile actions.

## Core Decisions

- Use a single JavaScript monorepo with a Vite React PWA frontend and Cloudflare Workers backend.
- Use Cloudflare Workers Static Assets to serve the React SPA and Worker API from the same deployment.
- Use Cloudflare D1 as the primary relational database.
- Do not store raw audio remotely. When online, upload raw audio transiently to the authenticated Worker and Cloudflare Workers AI for transcription, then save only the reviewed transcript. When offline, transcribe locally in the browser; local raw audio storage is allowed only for drafts/transcription recovery.
- Use OpenRouter only for summary and question-answer generation, never for login or transcription.
- Use passkeys as the preferred authentication method, with email/password fallback because the owner explicitly mentioned username/password comfort.
- Do not use external auth, email delivery, SMS, OAuth, or magic-link services.
- Gate all non-auth API routes by account status. Pending and blocked users may only fetch their own review state after login.
- Keep GitHub Actions as the source of deploy-time configuration for non-secret operational values. Generate the final Wrangler deploy config in CI so Cron Triggers still live in Wrangler configuration at deploy time.
- Accepted members can browse/search other accepted members and see only member name, hub, and WhatsApp telephone number.
- Weekly Grapevine updates are community bulletins: mention hubs and themes, not individual people.
- Keep transcripts, generated summaries, and AI request logs indefinitely for the first version.
- Raw member messages are private to their author and admins. Public/member-facing AI outputs expose summaries only, never source message inspection.
- The PWA should be offline-first wherever the action can reasonably complete locally or be safely queued.

## Preferred Stack

- Runtime: Node.js 24 where Node tooling is needed; Workers runtime for production backend.
- Language: JavaScript, not TypeScript.
- Frontend: React, Vite, `react-router`, `styled-components`, `zustand`, `use-query-params`, `react-hot-toast`, `vite-plugin-pwa`, `less-lazy`.
- Utilities: install `mentie`; use `log` instead of `console.*`.
- Auth helpers: `@simplewebauthn/server` and `@simplewebauthn/browser` for passkeys.
- Cloud transcription: Cloudflare Workers AI in the Worker, defaulting to `@cf/openai/whisper-large-v3-turbo`, with authenticated upload and no raw-audio persistence.
- Offline transcription fallback: `@huggingface/transformers` in the browser, defaulting to `onnx-community/whisper-small` with `q8` weights; make the model configurable with build variables. Support WebGPU when available, WASM fallback otherwise.
- Backend persistence: Cloudflare D1 migrations and Worker bindings.
- AI providers: Cloudflare Workers AI for transcription; OpenRouter Chat Completions API for summaries and questions.
- Lint/style: install the `airier` scaffold at project setup.

## Repository Shape

Create this structure unless implementation constraints force a small adjustment:

```text
.
├── .github/workflows/deploy.yml
├── .nvmrc
├── README.md
├── package.json
├── public/
├── scripts/
│   ├── render_deploy_config.js
│   └── bootstrap_admin.js
├── src/
│   ├── App.jsx
│   ├── index.css
│   ├── index.jsx
│   ├── components/
│   │   ├── atoms/
│   │   ├── molecules/
│   │   └── pages/
│   ├── hooks/
│   ├── modules/
│   ├── routes/Routes.jsx
│   └── stores/
├── worker/
│   ├── index.js
│   ├── modules/
│   └── migrations/
├── wrangler.template.jsonc
└── wrangler.generated.jsonc
```

`wrangler.generated.jsonc` may be generated locally for development but should not contain secrets. The implementation can choose whether to commit a sample generated file; the deploy workflow must render its own production config.

Add `.gitignore` entries for generated deploy config, local Wrangler state, build output, dependency folders, and local environment files. If a generated config example is useful, commit it under a clearly named sample path instead of committing the active deploy output.

## Account Model

### User Statuses

- `pending`: default after signup. User sees a review screen and optional admin message.
- `accepted`: user can read updates, submit transcripts, and ask the Grapevine.
- `blocked`: user sees a blocked/review screen and optional admin message.

Pending and blocked users must not be able to create messages, run searches, run summaries, submit audio/transcripts, list members, list hubs beyond their own signup data, or trigger OpenRouter calls.

### Roles

- `member`: normal accepted user.
- `admin`: can review accounts, edit account status, leave review messages, manage hubs, inspect usage, read submitted transcripts, and manually trigger Grapevine summary generation.

Account status and role are separate. An admin can be moved to `pending` or `blocked`, but there must always be at least one accepted admin.

### Signup Fields

Require:

- name
- email
- WhatsApp telephone number
- hub
- passkey or password credential

Normalize the WhatsApp telephone number to E.164 where possible. Store a display value and a digits-only link value. Admin user tables link the number as `https://wa.me/<digits>` and email as `mailto:<email>`.

### Hubs

Use an admin-managed `hubs` table. Seed the initial hubs:

- Amsterdam
- London
- Madrid
- Berlin
- Paris
- Lisbon
- Elsewhere

Signup should show a searchable combobox of active hubs plus "Request new hub". Hubs are geographic, with `Elsewhere` as the fallback for members who are not in a listed hub.

Requested hubs are optimistically accepted when the sanitized value corresponds to a city in the selected ISO city dataset. In that case, create or reuse the matching active hub immediately and assign the pending user to it. Sanitization should normalize whitespace, casing, punctuation, and accents before comparison. The implementation must document the exact city dataset it uses; if there is no practical canonical ISO city list, choose a maintained world-city dataset that includes ISO country codes and treat that as the validation source.

If a requested hub fails city validation, keep it as `requested_hub_name` and let an admin map it to an existing hub, create a hub, or assign `Elsewhere` during approval.

### Member Directory

Accepted members can browse and search other accepted members. Member-facing directory rows and profiles expose only:

- name
- hub
- WhatsApp telephone number as a `wa.me` link

Email, account status, role, admin review notes, message counts, and raw submitted messages are admin-only.

## Authentication

### Preferred Login

Use passkeys/WebAuthn for primary login:

- Relying Party ID: derive from the current request origin unless `WEBAUTHN_RP_ID` is configured.
- Relying Party Name: `Sandbox, Grapevine`
- Store credential public keys, counters, transports, and backup state in D1.
- Use SimpleWebAuthn passkey-ready options.
- Set `CBOR_NATIVE_ACCELERATION_DISABLED=true` for Worker bundling if the chosen build path needs it.

Passkeys do not require a third-party auth provider. The browser/platform authenticator creates and protects the private key; the app stores only public credential material.

### Password Fallback

Support email/password fallback for users without passkey support:

- The login/signup UI should offer both passkeys and password credentials, visually preferring passkeys.
- No email verification or email reset flow in MVP.
- Hash passwords with Workers-compatible Web Crypto. Use PBKDF2-HMAC-SHA-256 with a unique random salt and a high iteration count acceptable for Cloudflare Workers. Store algorithm and parameters per password hash for future migration.
- Add an admin-driven password reset flow: admin generates a short-lived one-time reset token that the user can redeem after direct community verification.

### Sessions

- Use `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- Store session records in D1 with expiration, user agent hash, IP prefix, and last-used timestamp.
- Rotate session IDs on login and after credential changes.
- Validate `Origin` on state-changing requests.

## Data Model

Create D1 migrations for these tables and indexes.

### `users`

- `id`
- `name`
- `email`
- `email_normalized`
- `whatsapp_telephone`
- `whatsapp_telephone_digits`
- `hub_id`
- `requested_hub_name`
- `status`
- `role`
- `review_message`
- `created_at`
- `updated_at`
- `approved_at`
- `approved_by_user_id`
- `blocked_at`

Indexes:

- unique `email_normalized`
- `status`
- `role`
- `hub_id`
- `created_at`

### `hubs`

- `id`
- `name`
- `slug`
- `is_active`
- `created_at`
- `updated_at`

Indexes:

- unique `slug`
- `is_active`

### `webauthn_credentials`

- `id`
- `user_id`
- `credential_id`
- `public_key`
- `counter`
- `device_type`
- `backed_up`
- `transports_json`
- `created_at`
- `last_used_at`

Indexes:

- unique `credential_id`
- `user_id`

### `password_credentials`

- `id`
- `user_id`
- `password_hash`
- `salt`
- `algorithm`
- `parameters_json`
- `created_at`
- `updated_at`

Indexes:

- unique `user_id`

### `sessions`

- `id`
- `user_id`
- `session_hash`
- `expires_at`
- `last_used_at`
- `created_at`
- `user_agent_hash`
- `ip_prefix`

Indexes:

- unique `session_hash`
- `user_id`
- `expires_at`

### `messages`

- `id`
- `user_id`
- `hub_id`
- `body`
- `body_normalized`
- `source`
- `client_recorded_at`
- `created_at`
- `updated_at`
- `deleted_at`

`source` should be `voice_transcript`, `typed`, or `edited_voice_transcript`.

Edits and deletes affect future reads only. Do not rewrite previously generated Grapevine updates or stored AI answers when a user edits or deletes a source message. Future Grapevine updates and future ad hoc AI requests must use the current message body and exclude soft-deleted messages.

Indexes:

- `user_id`
- `hub_id`
- `created_at`
- composite `hub_id, created_at`
- composite `user_id, created_at`

Add an FTS5 virtual table for message text if D1 migration support allows it cleanly. Use it for keyword prefiltering and admin/message search, but do not depend on it for the first version of scoped summaries.

### `grapevine_updates`

- `id`
- `period_start`
- `period_end`
- `generated_at`
- `model`
- `prompt_version`
- `status`
- `summary_markdown`
- `source_message_count`
- `usage_json`
- `error_message`
- `generation_kind`
- `triggered_by_user_id`

Indexes:

- `generated_at`
- `status`
- composite `period_start, period_end`
- composite `generation_kind, generated_at`

### `ai_requests`

- `id`
- `user_id`
- `kind`
- `model`
- `time_window`
- `filters_json`
- `question`
- `response_markdown`
- `source_message_count`
- `usage_json`
- `created_at`
- `error_message`

Indexes:

- `user_id`
- `kind`
- `created_at`

### `rate_limits`

Use for low-volume app-level throttling on signup, login, and AI endpoints.

- `id`
- `scope`
- `bucket`
- `count`
- `reset_at`

Indexes:

- unique `scope, bucket`
- `reset_at`

## API Contract

All API responses should be JSON. Use consistent error envelopes:

```json
{
  "ok": false,
  "error": {
    "code": "account_pending",
    "message": "Your account is being reviewed."
  }
}
```

### Public/Auth Routes

- `POST /api/signup`
- `POST /api/auth/password/login`
- `POST /api/auth/logout`
- `POST /api/auth/passkey/register/options`
- `POST /api/auth/passkey/register/verify`
- `POST /api/auth/passkey/login/options`
- `POST /api/auth/passkey/login/verify`
- `GET /api/me`

`GET /api/me` returns account status, role, review message, and enough profile data to render the review screen. It must not include admin lists or community data for pending/blocked users.

### Accepted Member Routes

- `GET /api/grapevine/latest`
- `GET /api/grapevine/bulletins?limit=<n>&offset=<n>`
- `GET /api/grapevine/archive`
- `GET /api/grapevine/archive/:id`
- `POST /api/messages`
- `PATCH /api/messages/:id`
- `DELETE /api/messages/:id`
- `POST /api/transcriptions`
- `GET /api/hubs`
- `GET /api/members?query=<text>`
- `POST /api/grapevine/query`

Accepted member writes are subject to deployment-configured daily usage limits in `GRAPEVINE_TIMEZONE`. Defaults are `GRAPEVINE_DAILY_RECORDING_MINUTES=60`, `GRAPEVINE_DAILY_MESSAGE_LIMIT=5`, and `GRAPEVINE_DAILY_QUESTION_LIMIT=10`. Recording minutes are reserved when online audio is uploaded for transcription, using app-reported duration metadata with a one-minute fallback for stale clients; this is an operational fairness guard, not decoded media-duration enforcement. Message creates count for typed and voice transcript submissions; edits and deletes do not count. Ask Grapevine limits apply to both scoped updates and open questions.

`POST /api/grapevine/query` body:

```json
{
  "mode": "scope",
  "time_window": "last_month",
  "hub_ids": ["hub_id"],
  "user_ids": ["user_id"],
  "question": "optional arbitrary question"
}
```

Allowed `time_window` values:

- `last_week`
- `last_month`
- `last_quarter`
- `last_year`

For `mode: "scope"`, require at least one hub or user unless product copy explicitly supports "all community". For `mode: "question"`, allow empty filters and use all visible messages in the time window.

Question mode must reject person-specific questions. If a user asks about a named person or supplies `user_ids` in question mode, return a clear validation error and suggest using scope mode for a direct member update instead.

AI responses must not expose raw source messages, source snippets, or links to contributing messages. Show only the generated summary/answer plus unobtrusive metadata such as source count, period, filters, and model.

### Admin Routes

- `GET /api/admin/users?status=pending`
- `GET /api/admin/users/:id`
- `PATCH /api/admin/users/:id/status`
- `PATCH /api/admin/users/:id/role`
- `PATCH /api/admin/users/:id/profile`
- `GET /api/admin/hubs`
- `POST /api/admin/hubs`
- `PATCH /api/admin/hubs/:id`
- `DELETE /api/admin/hubs/:id`
- `GET /api/admin/ai-requests`
- `GET /api/admin/messages`
- `GET /api/admin/messages/:id`
- `POST /api/admin/grapevine/generate`

`POST /api/admin/grapevine/generate` body:

```json
{
  "time_window": "last_week"
}
```

or, for a custom period:

```json
{
  "time_window": "custom",
  "period_start": "2026-06-01",
  "period_end": "2026-06-07"
}
```

Manual generation defaults to a coverage selector (`last_week`, `last_month`, `last_quarter`, `last_year`) and offers an admin datepicker for custom periods. It must validate that custom `period_start <= period_end`, use whole-day boundaries in `GRAPEVINE_TIMEZONE`, and create a new `grapevine_updates` row with `generation_kind: "manual"`. It must not overwrite previous generated updates.

Deleting a hub deactivates it for future selection and moves current members in that hub to Elsewhere. Historical messages keep their stored hub reference so older Grapevine context remains stable.

Admin message overview lists message date and sender only. Fetch the full body only when an admin opens a message detail.

Admin user list columns:

- name
- hub/requested hub
- status
- role
- email `mailto:` link
- WhatsApp telephone `wa.me` link
- created date
- latest admin review message

## Frontend UX

### App Shell

The first screen after accepted login is the Grapevine action hub. Do not build a marketing landing page.

Use:

- bottom action bar on mobile
- microphone icon for recording
- search icon for asking the Grapevine
- profile/status/admin access in a restrained top bar
- install pill bottom-left when PWA install is available and app is not already installed
- persistent update badge when `vite-plugin-pwa` reports `onNeedRefresh`

### Offline Behavior

Anything that can reasonably happen offline should work offline. Cache readable data after it has been loaded, and queue member writes that can be replayed safely.

Offline-capable:

- reading the latest Grapevine update and loaded bulletin history after they have been loaded once
- reading archive entries after they have been opened once
- browsing/searching cached member directory data
- recording audio locally
- transcribing locally when model assets are already cached
- saving typed and voice transcript drafts
- creating, editing, and deleting a user's own updates through a sync queue

Online-required:

- signup, login, and account status refresh
- first-time transcription model download
- ad hoc Grapevine questions and AI summaries
- admin approval/status changes
- admin manual summary generation

When a queued write is pending, show a clear pending/syncing state. If a queued write later fails because the account is no longer accepted, keep the local draft and show the account review state without submitting the change.

### Visual Direction

- Accent color: `#211aff`; use white text on filled accent surfaces.
- Heading font: `"Montserrat Variable", system-ui, -apple-system, "Segoe UI", sans-serif`, weight 500.
- Body font: `"Nunito Variable", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`.
- Use calm neutral surfaces with clear boundaries. Avoid one-hue palettes, decorative gradients, and floating section cards.
- Repeated items may use cards with radius no greater than 8px.
- Use lucide icons for toolbar actions if the dependency is added.
- Minimum interactive targets: 48px.
- Text must not rely on color alone. Status labels need text plus icon/shape.
- Keep content line length readable with `max-width` around `65ch`.
- Do not scale font size with viewport width. Use rem-based sizes and breakpoint adjustments.

### Accepted Member Views

1. Latest update view
   - Shows generated weekly summary.
   - Uses a community bulletin tone.
   - Shows period covered, generation date, and source message count.
   - Keeps source count, generation metadata, and model details unobtrusive, preferably behind an info icon.
   - Includes an archive entry point for older Grapevine updates.
   - Does not expose raw source messages or source-message drilldowns.
   - If no summary exists, show a quiet empty state and the record/search actions.

2. Record view/modal
   - Opens from microphone button.
   - Requests microphone permission only after user action.
   - Records locally with `MediaRecorder`.
   - Transcribes online recordings through the authenticated Worker and Cloudflare Workers AI.
   - Falls back to local transcription with the configured Transformers.js ASR model only when offline.
   - Starts loading the local transcription model only when offline transcription needs it.
   - Caches model assets for repeat use where browser storage permits, without blocking initial app load.
   - May keep raw audio locally while a draft is being transcribed or recovered, and may upload raw audio transiently for online transcription, but must never persist raw audio remotely.
   - Sends recording duration with online transcription uploads so the Worker can enforce the daily recording-minute limit.
   - Shows progress while cloud transcription runs or the local model loads/transcribes.
   - Lets user edit transcript before submission.
   - Saves draft transcript in IndexedDB while offline.
   - Before submit, re-checks accepted status server-side.

3. Typed update view/modal
   - Voice is primary, but accepted members must also have a direct typed update option.
   - Typed updates use the same `POST /api/messages` endpoint with `source: "typed"`.
   - Users can edit or delete their own submitted updates.
   - Edits/deletes are queued offline when possible and synced when the app reconnects.
   - Existing generated Grapevine updates and stored AI answers remain historical snapshots and are not rewritten after edits/deletes.

4. Ask Grapevine view/modal
   - Time span selector is always visible.
   - Uses explicit tabs or segmented controls labeled "Scoped update" and "Open question".
   - Scoped update mode lets user choose hubs and/or people.
   - Scoped update helper copy should make clear that selected people may be summarized directly.
   - Scope mode may summarize selected people directly because the user explicitly selected them.
   - Open question mode lets user ask arbitrary non-person-specific text.
   - Open question helper copy should make clear that questions are for themes, hubs, and community activity, not asking about individual people.
   - Open question mode must not allow person-specific questions.
   - Shows answer markdown with time range, filters, source count, and model metadata behind a compact info affordance.
   - Does not expose raw source messages or source-message drilldowns.

5. Account review screen
   - Pending: "Your account is being reviewed. Please come back in a couple of hours."
   - Blocked: "Your account is not currently active."
   - Show admin review message when present.
   - Do not show record/search actions.

### Admin Views

1. Pending review queue
   - Default admin page.
   - Approve, keep pending with message, block.
   - Inline edit hub assignment.

2. Member directory
   - Filter by status, hub, and search text.
   - Admin member directory shows WhatsApp/email contact links.
   - Member-facing directory shows only accepted member name, hub, and WhatsApp telephone link.
   - Status transitions with confirmation for destructive/blocking changes.

3. Hub management
   - Create, rename, deactivate hubs.
   - Show pending users requesting unknown hubs.

4. AI usage
   - Show weekly summary runs and ad hoc query usage/errors.
   - Include a manual "Generate Grapevine update" action.
   - Manual generation defaults to coverage presets and exposes custom `period_start` and `period_end` fields only when custom range is selected.
   - Manual generation should use the same prompts, storage path, and idempotency protections as scheduled generation.

## AI Behavior

### Weekly Grapevine Update

Cloudflare Cron Trigger calls the Worker `scheduled()` handler. The target schedule is Monday morning in Amsterdam time.

Algorithm:

1. Determine period using `GRAPEVINE_SUMMARY_PERIOD_DAYS`.
2. Fetch accepted-user messages in that period.
3. If zero messages, create a `grapevine_updates` row with empty-state copy and `source_message_count=0`.
4. If message volume exceeds the configured model context budget, chunk by time and hub, summarize chunks, then summarize summaries.
5. Store the final markdown summary in `grapevine_updates`.

Summary prompt requirements:

- Be concise and community-facing.
- Use a community bulletin tone.
- Preserve uncertainty.
- Do not invent facts, dates, attendance, commitments, or names.
- Do not mention individual people in weekly or all-community summaries.
- Do mention the hub where activity happened when the source messages make that clear.
- Do not include phone numbers, emails, WhatsApp numbers, or hidden account metadata.
- Group naturally by themes, hubs, and upcoming items.
- Include a short "Signals" section for repeated topics when useful.

Before sending source material to OpenRouter, strip contact data and private account metadata. Remove emails, phone numbers, WhatsApp numbers, session/auth data, review messages, and admin-only fields. Keep author name and hub in the model context so scoped member summaries and hub-aware weekly summaries have enough context, while prompt rules still prevent names from appearing in weekly/all-community outputs.

### Ad Hoc Questions

For scoped hub/member updates:

- Fetch messages by selected hubs/users and time window.
- Summarize the activity in a direct update format.
- Member-scoped updates may name the selected members because that is the explicit filter.

For arbitrary questions:

- Fetch messages in the time window.
- Reject person-specific questions.
- If the question has clear keywords and FTS is available, use FTS to prioritize candidate messages, but fall back to chunked full-window summaries.
- Answer only from stored messages.
- Return "I don't have enough Grapevine updates to answer that" when evidence is insufficient.
- Do not expose raw source messages, source snippets, or source-message links in the answer.

The community is high-trust. Do not add topic-specific exclusions beyond normal safety, privacy, and non-hallucination constraints.

Use OpenRouter structured outputs where the chosen model supports them. Otherwise request markdown plus a compact JSON metadata footer and validate defensively.

## Deployment

Use GitHub Actions with `cloudflare/wrangler-action`.

Deploy only production for the first version. Do not create staging environments unless requested later.

### Secrets

GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Cloudflare Worker secrets:

- `OPENROUTER_API_KEY`
- `SESSION_SECRET`
- `ADMIN_BOOTSTRAP_TOKEN` for first setup only

The implementation may set Worker secrets through Wrangler during setup. Do not commit `.env` values.

### Non-Secret Deploy Configuration

Set these in `.github/workflows/deploy.yml` under `env:` so the deploy workflow is the obvious operational control plane. `GRAPEVINE_DOMAIN` and `WEBAUTHN_RP_ID` may be empty so the Worker derives them from the request origin:

- `GRAPEVINE_DOMAIN=${{ vars.GRAPEVINE_DOMAIN }}`
- `WEBAUTHN_RP_ID=${{ vars.WEBAUTHN_RP_ID }}`
- `WEBAUTHN_RP_NAME=Sandbox, Grapevine`
- `GRAPEVINE_SUMMARY_CRON=0 * * * 1`
- `GRAPEVINE_TIMEZONE=Europe/Amsterdam`
- `GRAPEVINE_SUMMARY_LOCAL_HOUR=9`
- `GRAPEVINE_SUMMARY_PERIOD_DAYS=7`
- `OPENROUTER_SUMMARY_MODEL`
- `OPENROUTER_QUERY_MODEL`
- `OPENROUTER_MAX_INPUT_MESSAGES`
- `WORKERS_AI_TRANSCRIPTION_MODEL=@cf/openai/whisper-large-v3-turbo`
- `WORKERS_AI_TRANSCRIPTION_LANGUAGE`
- `WORKERS_AI_TRANSCRIPTION_INITIAL_PROMPT`
- `WORKERS_AI_TRANSCRIPTION_MAX_AUDIO_BYTES=10000000`
- `VITE_TRANSCRIPTION_MODEL=onnx-community/whisper-small`
- `VITE_TRANSCRIPTION_DEVICE=auto`
- `VITE_TRANSCRIPTION_DTYPE=q8`
- `VITE_TRANSCRIPTION_MAX_AUDIO_BYTES=10000000`
- `SESSION_TTL_DAYS=30`
- `DATA_RETENTION_POLICY=indefinite`
- `LOG_LEVEL=info`

Because Cloudflare Cron Triggers are UTC-based while the desired schedule is Monday morning in Amsterdam, run the Worker hourly on Mondays and guard in code with `GRAPEVINE_TIMEZONE` and `GRAPEVINE_SUMMARY_LOCAL_HOUR`. The generation job must be idempotent so the hourly trigger cannot create duplicate summaries for the same period.

Because Wrangler owns Cron Trigger configuration, `scripts/render_deploy_config.js` must read the workflow env values and render `wrangler.generated.jsonc` from `wrangler.template.jsonc` before deployment.

### Wrangler Configuration

The rendered Wrangler config must include:

- Worker entry point `worker/index.js`
- static assets directory `dist`
- `assets.not_found_handling = "single-page-application"`
- D1 database binding, e.g. `DB`
- runtime vars from the deploy config
- Cron Trigger generated from `GRAPEVINE_SUMMARY_CRON`

## Admin Bootstrap

Implement a one-time bootstrap path:

1. Deploy app and run migrations.
2. Create the first account through normal signup.
3. Run `npm run admin:bootstrap -- --email <email>` locally with Cloudflare credentials, or call a protected bootstrap endpoint with `ADMIN_BOOTSTRAP_TOKEN`.
4. The script/endpoint sets the user to `accepted` and `admin`.
5. Rotate or remove `ADMIN_BOOTSTRAP_TOKEN` after first admin exists.

Prefer the script path because it avoids shipping a bootstrap endpoint that can be forgotten.

## Implementation Plan

### Phase 0: Project Setup

- Create `.nvmrc` with Node 24.
- Initialize Vite React app in JavaScript.
- Install preferred frontend/backend dependencies.
- Install `airier` linting scaffold.
- Add PWA configuration with offline cache, app manifest, install prompt, and refresh badge.
- Add `mentie` and central logging helpers.

### Phase 1: Cloudflare Foundation

- Add Worker entry point and API router.
- Add Wrangler template and deploy config renderer.
- Add D1 migrations and local/remote migration commands.
- Add GitHub Actions deploy workflow.
- Add README deployment/setup instructions.
- Add an offline sync queue for member-created updates, edits, and deletes.

### Phase 2: Auth and Account Review

- Implement signup.
- Implement passkey registration/login.
- Implement password fallback login.
- Implement session cookies and account status gate.
- Implement pending/blocked review screen.
- Implement admin bootstrap.

### Phase 3: Admin Console

- Build admin routes and pages.
- Implement pending queue, member directory, status transitions, review messages, hub management, and contact links.
- Add guard preventing removal/blocking of the last accepted admin.

### Phase 4: Member App

- Build home action hub and dedicated community bulletins page.
- Build paginated bulletin history and archive view for older Grapevine updates.
- Cache the latest update, archive entries already opened, member directory data already loaded, and local drafts for offline use.
- Build recording flow with cloud-first transcription, editable transcript, transient authenticated online audio upload, offline local model fallback, local raw audio draft recovery, offline draft, and submit.
- Build typed update flow.
- Build edit/delete controls for a user's own submitted updates.
- Build offline queue handling for create/edit/delete updates.
- Build ask Grapevine flow with time selector, hub/person filters, arbitrary question mode, explicit scope-vs-question labels, and answer display.

### Phase 5: AI Jobs

- Implement weekly scheduled summary generation.
- Implement admin-triggered manual summary generation with coverage presets and optional custom datepicker periods.
- Implement ad hoc scoped summaries and arbitrary questions.
- Store AI request metadata and errors.
- Add chunking for token/context limits.
- Add clear empty/insufficient-evidence behavior.
- Add person-question rejection for arbitrary question mode.
- Add OpenRouter input sanitization that strips contact/admin metadata while preserving author name and hub.

### Phase 6: Verification and Polish

- Add end-to-end tests for signup, pending gate, admin approval, accepted submission, latest update display, query flow, and blocked restrictions.
- Add targeted unit tests only for complex pure logic such as time-window calculation, phone normalization, and AI chunking.
- Verify PWA install/update behavior manually.
- Verify mobile layout at narrow widths and desktop admin tables.

## Acceptance Criteria

- A new user can sign up without email/SMS/OAuth.
- New users start pending.
- Pending and blocked users cannot create messages or trigger OpenRouter calls.
- Admins can approve, block, return users to pending, and leave review messages.
- Admin user table shows name, hub, WhatsApp telephone link, and email link.
- Accepted users land on the Grapevine action hub.
- Accepted users can open the current bulletin and browse older generated Grapevine updates.
- Accepted users can browse/search other accepted members and see only name, hub, and WhatsApp telephone number.
- Accepted users can record speech, transcribe it through Workers AI when online or locally when offline, edit it, and submit the transcript.
- Accepted users can submit typed updates.
- Accepted users can edit/delete their own updates.
- Offline-capable member actions and cached reads work offline, then sync when connectivity returns.
- Accepted users can ask for hub/person updates with a time range.
- Accepted users can ask arbitrary non-person-specific questions over a selected time range.
- AI answers and summaries never expose raw source messages to members.
- Weekly summary generation runs from a Cloudflare Cron Trigger.
- Admins can manually trigger summary generation with coverage presets or custom datepicker-selected periods.
- OpenRouter model choices and summary cadence are deploy-time configuration.
- Weekly summaries mention hubs and themes, not individual people.
- OpenRouter prompts strip contact data while preserving author name and hub context.
- No raw audio is stored remotely; online transcription uploads are transient and authenticated.
- Transcripts, summaries, and AI request logs are retained indefinitely.
- The app deploys from GitHub Actions on push.
- README explains setup, deployment, env vars/secrets, D1 migrations, and admin bootstrap.

## README Requirements

The README should be concise but complete for a technical maintainer:

- What the app does.
- Local development commands.
- Required Node version.
- How to install dependencies.
- How to create D1 database and apply migrations.
- How to configure Cloudflare Worker secrets.
- GitHub Actions secrets and configurable env values.
- How deployment works.
- How to bootstrap the first admin.
- How to change summary cadence and AI models.
- How to seed and validate hubs.
- How manual summary generation works.
- Offline behavior and sync limitations.
- Current retention policy.
- How to run tests.
- Troubleshooting notes for passkeys, microphone permissions, local transcription model loading, and Cron Trigger propagation.

## Remaining Clarifying Questions

These are the remaining non-blocking questions after the owner clarified the core product decisions:

1. Which transcription languages matter most? The default Whisper small model is multilingual, but quality and download size trade off against each other.
2. Which exact dataset should count as the "ISO city list" for optimistic hub acceptance, or may the implementer choose and document a maintained city dataset with ISO country codes?

## Reference Docs Used For Decisions

- Cloudflare Workers Static Assets and SPA routing: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare D1 setup and Worker bindings: https://developers.cloudflare.com/d1/get-started/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare Worker bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- Cloudflare Web Crypto in Workers: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Cloudflare Wrangler GitHub Action: https://github.com/cloudflare/wrangler-action
- OpenRouter Chat Completions API: https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
- SimpleWebAuthn passkey guidance: https://simplewebauthn.dev/docs/advanced/passkeys/
- Transformers.js browser-local inference: https://huggingface.co/docs/transformers.js/
- Transformers.js-compatible Whisper model example: https://huggingface.co/onnx-community/whisper-small
