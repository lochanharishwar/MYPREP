# BrandCurrent operating guide

This repository contains application controls and verification tools. It does not establish a staffed service, provider approval, an SLA, regulatory compliance, or a completed penetration test.

## Environment promotion

Use separate Supabase projects, Inngest environments, storage, OAuth apps and Cloud Run services for development, staging and production. Never copy customer data into development. Maintain the Sites project currently recorded in `.openai/hosting.json` for private review. An owner-private Sites gate blocks external callbacks and other team members: activate the authenticated application on a reachable origin only after the owner explicitly selects its audience. This is an activation blocker, not a reason to weaken authentication silently.

1. Install Node 22+ and Python 3.11. Create `services/processor/.venv`; install `requirements.lock.txt` with `--require-hashes` and install `pip-audit` for the release gate.
2. Run `npm ci` and `npm run check`. Save the command output and source revision with the release evidence. CI does not have production secrets and never auto-promotes.
3. Apply migrations in numeric order to staging. Take a database/storage backup first. The PGlite test harness executes all migrations but does not prove Supabase Auth or Storage deployment.
4. Deploy the processor container with concurrency **1**, maximum instances bounded by the workspace spending design, at least **1 GiB** memory and a **900 second** request timeout. The caller waits up to 610 seconds; the processing lease is 660 seconds. Measure cold starts, maximum 18 MB media and concurrent uploads before production. The image encoder produces JPEG; videos are H.264/AAC MP4, at most 60 seconds. FFmpeg is restricted to file/pipe protocols.
5. Configure server-side Supabase, Gemini and processor credentials in the processor; use a distinct secret manager reference per environment. No secrets belong in frontend assets. Configure the app with `.env.example` equivalents, monthly limits and conservative cost estimates. The reviewer can use a separately configured model and prices; choosing a model does not establish independent calibration.
6. Register signed Inngest endpoints, OAuth redirects and ingestion callbacks on the reachable staging origin. Configure Supabase Google/email/SMTP and, where available, SSO. Enroll and verify MFA before enforcing it. Test another member's invitation and access denial.
7. Complete the live scenarios in `VALIDATION.md`. Promotion requires recorded results, a named incident owner and rollback decision-maker. Never count a mocked provider test as a live success.

## Incident controls

Owners use Settings → Governance to stop publishing, freeze campaigns, revoke approvals, remove members, inspect queue age and retry dead-letter delivery. Revocation cancels unsent work; an already dispatched provider request cannot be withdrawn by the application.

| Signal | First response | Recovery evidence |
|---|---|---|
| Pending queue older than 15 minutes | Check Inngest callback reachability, signing/event keys and provider status | Original job ID processed once; future schedules recovered or marked missed |
| Dead letter after ten deliveries | Inspect sanitized queue error and fix its cause before retry | Same business command receipt and logical job |
| Verifying publication | Inspect destination; use the operator candidate workflow | Provider record matches destination/version and operator reason is audited |
| Six unsuccessful verification checks | Escalate to the named incident owner/platform support | Keep uncertain state; never erase dispatch markers to force a retry |
| Expired account | Reauthorize the same destination and scopes | Successful refresh and live capability check |
| Processor lease expired | Inspect the job ID in Cloud Run; watchdog retries at most three claims | Completed artifact metadata/checksum or explicit failed job |
| Budget estimate exceeded | Pause paid automation and review tariffs | Corrected owner limits and usage reconciliation |

Configure external monitors for HTTP health, callback delivery, dead letters, queue age, token expiry, media failures and metric freshness. The owner operations view provides database counts; it is **not** an external pager. Provider errors intentionally omit response bodies and secrets. Correlate command UUID, workspace, brand, schedule and media-job IDs in retained logs; do not log imported customer records or tokens.

Proposed pilot acceptance targets (not guarantees): p95 read API latency under 1 second at 20 concurrent users/100 brands/100,000 events; no duplicate provider dispatch in injected crash scenarios; publication within its 15-minute delivery window; alert within 5 minutes of an actionable queue failure; restore within 4 hours with no more than 24 hours of lost data. The organization must agree targets, enable monitoring and run load/restore drills before claiming them.

## Rollback and restore drill

Pause publishing and paid jobs first. Roll back the application to the last validated deployment only if its schema is compatible. Migrations here are additive forward migrations; do not run destructive down migrations on customer data. Restore a backup into a separate isolated Supabase project, restore private storage, validate membership/RLS and checksums, compare event and currency totals, and test one nonpublishing job. Record measured recovery time and data loss. A restored database may predate real public posts: reconcile every in-flight schedule with the provider before unpausing. Never assume a restored dispatch marker proves that a provider request was not sent.

## Rotation and privacy

`TOKEN_ACTIVE_KEY_ID` plus `TOKEN_ENCRYPTION_KEYS` enables versioned AES-GCM envelopes; the key ID is authenticated. Keep old keys during rotation and the legacy `TOKEN_ENCRYPTION_KEY` while legacy two-part envelopes remain. Reauthorize/re-encrypt existing connections, verify decryption in staging, then retire unused keys. Rotate OAuth, processor, webhook and database credentials through their owning services and test callbacks. Rotating a token does not expand its scopes.

Load the tracker after consent. Wire your consent manager's withdrawal callback to `window.brandCurrent?.withdrawConsent()`: it stops future requests, aborts pending browser requests and removes the local identifier. This cannot recall requests already accepted. Use authorized customer deletion for linked stored data. Shared-device deletion preserves another customer's identified records and ambiguous unassigned activity. Derived summaries/embeddings are invalidated. Backups and third-party workflow/provider histories need the organization's deletion/retention procedure; the app cannot promise instantaneous erasure from external backups.

Approved/published media is retained until explicit deletion. Do not use a blanket media retention sweep. Private asset uploads retain the source reference, owner, rights note, byte count and checksum; owner assertions are not independent rights clearance. Customer exports require both customer and export privileges and create audit entries. Audit records contain minimal operational metadata and cannot be rewritten through normal SQL updates/deletes. Workspace erasure therefore requires a controlled administrative retention procedure.

## Organizational handoff

Assign an incident owner, access-review owner, data steward and model-evaluation owner. Record region choices and subprocessors (Sites/hosting, Supabase, Inngest, Google, Firecrawl, Browserless, social platforms). Obtain applicable support terms, data-processing terms, incident commitments and independent assurance. These require organizational/legal review; this codebase does not manufacture certifications or signed commitments. SCIM/service-account provisioning and customer-specific retention/SCIM contracts require a separately specified deployment integration.
