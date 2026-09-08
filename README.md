# BrandCurrent

A six-page, private marketing workspace with nine agent roles: discovery, Brand DNA, generation, review, scheduling, feedback, analysis, attribution, and customer insights. Real provider integrations are implemented; there is no fabricated demo brand or analytics dataset in the application.

## Run locally

Requires Node 22.13+ and npm. The generated Sites/Vinext project and lockfile are preserved.

```sh
npm ci
npm run dev
```

Without credentials, all six pages render and settings explain activation requirements. Real account, campaign, metric, and publishing operations fail closed. Copy `.env.example` to `.env`, configure the values below, and restart the server after configuration changes.

## Activate the services

1. **Supabase:** Create/select a project. Apply every SQL file in `supabase/migrations` in numerical order. Configure `SUPABASE_URL`, public anon key, and server-only service role key. The migrations create private `media` storage, public `published-media` storage for explicitly approved Reddit media links, pgvector, row-level policies, and privileged transactional functions. Enable Google and email-link authentication. Configure SMTP for production email delivery, the site origin, and allowed redirect URLs in Supabase Auth.
2. **Private team:** Sign in and create a workspace. The creator becomes Owner. Owners manage expiring invitations, membership, ownership transfer, assigned-brand access, customer/export permissions and creative/brand/legal approval stages. Users switch workspaces explicitly. Editors create campaigns, Approvers approve/schedule, and Viewers inspect authorized records. Supabase SSO and authenticator MFA controls are available; activation depends on the configured Supabase project.
3. **Budget and providers:** Configure Firecrawl, Browserless, Gemini, and conservative positive `COST_*` estimates in USD. Configure actual text token prices to reconcile returned token usage; other provider estimates remain marked estimated. Set a monthly workspace limit and a separate limit for every campaign. A missing or zero limit blocks paid work. A measured operation exceeding its reserved estimate pauses further workspace spending until an owner reviews configuration. Provider subscriptions are separate charges.
4. **Python processor:** Build `services/processor/Dockerfile` using its hashed dependency lock. Deploy with at least 1 GiB memory, concurrency 1 and a 900-second request timeout. Configure `PROCESSOR_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`; set the same processor secret and HTTPS URL in the app. Requests are HMAC-authenticated with five-minute freshness. Durable media jobs transfer assets directly through private storage, encode JPEG/H.264/AAC, persist metadata/checksums and supply Google Files references for review. Supported transfers are bounded to 18 MB. See `docs/OPERATIONS.md` for leases, timeouts and required workload tests.
5. **Inngest:** Configure production event and signing keys. Register the app's `/api/inngest` endpoint in Inngest. The endpoint must be reachable by Inngest; a Sites owner-only access gate prevents external callbacks. For email/Google team access, host the sign-in shell and signed webhook endpoints on a reachable origin while preserving the app's Supabase authentication and membership checks. The owner-private initial deployment is suitable for reviewing the app but cannot activate external callbacks behind that gate. Jobs include an outbox, resumable scan batches, content review, scheduled publication, feedback refresh, nightly insights, and ten-minute recovery/cleanup.
6. **Social OAuth:** Register callbacks as `APP_ORIGIN/api/oauth/PLATFORM/callback` for `instagram`, `youtube`, `x`, `linkedin`, and `reddit`. Add corresponding client IDs/secrets. Generate `TOKEN_ENCRYPTION_KEY` locally as 32 random bytes encoded in base64. Complete authorization from Settings → Connections for each brand. Set a Reddit subreddit, and optionally an authorized LinkedIn organization URN, before scheduling.

YouTube public uploads may be restricted until the API project is verified. Instagram requires a professional account with publishing permissions. Reddit requires approved API access; generated images/videos publish as media links. X requires funded API access. LinkedIn organization publishing/analytics require appropriate scopes and organization rights beyond basic member publishing. Capabilities are checked and failures remain visible. Access requirements are external activation dependencies, not bypassed by this app.

## Workflow and data contracts

- A website scan discovers public same-host URLs, traverses links in batches, and persists coverage/errors. Colors come from computed styles, with screenshot estimates explicitly labeled if extraction fails. Exact taglines are checked against extracted copy. Brand interpretations and research retain evidence references. Every successfully read page has an individual analysis record.
- Generation requires explicit formats, a campaign brief and an owner-approved Brand DNA policy. Owners set supported claims, forbidden phrases, disclaimers, palettes/fonts, rights expiry, creative preferences and pinned private assets. Finished platform media is reviewed in a separate multimodal invocation; an optional separate model is configurable, but independence/calibration is not established by configuration. The code calculates the **8.7 unrounded** threshold with five total attempts per format/platform run. Caption edits create separately reviewed versions against the same spending limit. Failed versions stay outside the approval gallery.
- An approval locks a caption/media/DNA/platform hash to a destination account. SQL functions enforce approval and schedule transitions under row locks. Scheduled UTC time retains its IANA timezone. Ambiguous or interrupted publishing becomes `verifying`; reconciliation never blindly publishes again. Posts more than 15 minutes late are marked missed.
- Feedback observations retain platform-specific definitions and nulls for unsupported metrics. Totals use each post's latest observation; daily charts show snapshots rather than falsely summing cumulative counts. Reach across platforms is not deduplicated.
- Revenue math is SQL; Markov removal effects are pure Python. Currency buckets are separate. Anonymous/customer identities join only through explicit authenticated identify events, and ambiguous identity mappings remain anonymous. Behavioral explanations are hypotheses with linked feedback, not proof of causation.

Shared contracts are in `lib/contracts.ts`. API actions accept JSON, a Supabase Bearer token, `x-workspace-id` and a stable `Idempotency-Key` for retrying one logical command. Scans, campaigns, revisions and schedule commands commit their result, audit receipt and outbox together. Long operations return `202` and a job ID. `/api/state` returns workspace metadata; scoped `/api/resources` pages data by kind, `/api/jobs` uses a stable timestamp/ID cursor and `/api/reports` calculates complete selected-period aggregates. Media URLs are signed on demand. Customer exports require dedicated permissions.

## First-party tracking and imports

Create a tracking connection in Customer insights. Place the generated script only after your site's applicable consent requirements are satisfied. It records page views, ten seconds of active engagement, and clicks on links with `data-bc-track`. Browser events cannot submit purchase, refund, identify, customer ID, account ID, or money fields.

For server events, send JSON `{ "trackingId": "...", "event": { ... } }` to `/api/collect` with:

- `x-timestamp`: current Unix seconds.
- `x-signature`: hexadecimal HMAC-SHA256 of `timestamp + "." + exact_request_body` using the generated webhook secret.

Events require `eventId`, ISO `occurredAt`, `type`, and an `anonymousId` or `customerId`. Purchase/refund events additionally require nonnegative `amount`, uppercase `currency`, and `orderId`. Retry with the same event ID. A purchase order cannot be counted twice. `identify` events must include both the first-party anonymous and customer IDs. Include `utm_source` and `bc_campaign` query parameters to connect website visits to campaigns.

CSV imports validate the entire batch before writing, with up to 500 rows. Headers:

| Import | Fields |
| --- | --- |
| Events | `eventId,occurredAt,type,anonymousId,customerId,channel,amount,currency,orderId` (optional `campaignId,accountId,properties`) |
| Customers | `customerId,name,email,accountId` |
| Accounts | `accountId,name` |
| Spend | `spendId,date,channel,amount,currency,category` (`advertising` or other `acquisition`) |
| Feedback | `sourceId,body,url,customerId` |

Use unique source IDs. Spend, account, and customer imports update matching records rather than doubling them. Feedback and event imports ignore duplicate event/source IDs. Treat rows in a rejected batch as unsaved; resolve validation errors and retry.

## Validation and release

```sh
npm run check
```

Database tests execute the actual migrations in a disposable PGlite PostgreSQL engine with pgvector. Supabase-specific auth/storage schemas are provided only as isolated test fixtures; this does not verify a live Supabase project. Provider smoke tests require real credentials and explicit test accounts/content. No live publication is claimed without its returned destination link and public status verification.

The Sites manifest retains the registered project ID. Do not initialize another site. Deploy the tested source/archive through Sites. Supabase migrations and the Cloud Run processor are separate deployment steps; Sites does not apply them automatically. The private review deployment must not be confused with a fully activated production integration.

See `VALIDATION.md` for the actual checks completed and remaining activation dependencies.
