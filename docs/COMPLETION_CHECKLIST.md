# BrandCurrent completion map

Updated 17 September 2026. This checklist distinguishes implementation, local verification and external activation. Existing source, migrations, design, private hosting and Thinking Orb integration are retained.

## Current completion stage

- [x] Inspect Git state, routes, React/Vinext configuration, Supabase access, resource APIs, orchestration, environment names and existing tests.
- [x] Identify the highest-priority incomplete interaction: Brand DNA search only examined already loaded records.
- [x] Implement bounded database search over all stored page findings, stable result totals, timestamp/ID pagination and safe response projection.
- [x] Connect search, clear, load more, refresh, retry, loading, failed and no-match UI states. Cancel superseded requests and prevent overlapping page loads.
- [x] Preserve role and assigned-brand authorization before the search RPC; restrict direct RPC execution to service_role.
- [x] Prevent duplicate settings submissions and report sign-out failure rather than reloading as though it succeeded.
- [x] Create interaction inventory, API contract, migration recovery and threat notes.
- [x] Run migration/database and API regression tests; type checking, lint, production build and dependency audit: 64 application/API/database tests and 13 Python tests passed; both dependency audits clean.
- [x] Perform dedicated local responsive/browser verification of the available unconfigured shell; see STAGE_VERIFICATION.md for exact scope and limitations.
- [x] Add missing-route recovery and generic render-error recovery; browser-verify the 404 return path.
- [x] Add visible generic pagination loading and notices for failed live-status refreshes.
- [ ] Verify authenticated hosted search after migration 019 and service setup. Native deployment receipts determine code-delivery status; deployment alone does not apply Supabase migrations.

- [x] Add Reject/Disconnect confirmations and atomic owner-scoped disconnect; verify rollback, idempotency and stale-refresh prevention. See STAGE_VERIFICATION.md for isolated browser evidence.

## External activation — blocked

- [ ] Supply and configure Supabase URL, public key and server-only service role; apply migrations 001–020 to staging, configure email/Google and redirect allowlist. No live project or credentials are available locally.
- [ ] Configure Firecrawl, Browserless, Gemini image/video, Inngest, Cloud Run processor and encrypted social OAuth credentials; set owner budgets and provider tariffs before metered work.
- [ ] Obtain required platform approvals and authorized test accounts; run each destination's actual publish/reconcile/metrics flow.
- [ ] Select a callback-reachable origin/audience. Current private review access cannot be assumed reachable by webhooks, tracking, OAuth or durable workers. No sharing changes are made by this work.
- [ ] Run hosted permission/MFA/session tests, real dataset browser journeys, media limits/load tests, egress isolation, restore drills, external alert delivery and human evaluation calibration.

## Remaining product work

- [ ] Complete historical connected-post inventory and ingestion (current new search deliberately covers stored website page findings only).
- [ ] Complete the broader enterprise additions identified in VALIDATION.md: SCIM/service accounts, provider-history retention, social inbox/listening, customer-specific delegation, multilingual variants, campaign templates, assignments/bulk operations, calibrated evaluation service.
- [ ] Standardize safe API error contracts across remaining routes. This stage sanitizes resource-list failures; other endpoints still need equivalent review.
- [ ] Verify all populated interactions in INTERACTION_INVENTORY.md using isolated, authorized role fixtures. Source review is not browser or live integration verification.

## Evidence and handoff

See INTERACTION_INVENTORY.md for controls, SEARCH_CONTRACT.md for the current vertical workflow, VALIDATION.md for previous verified work, and OPERATIONS.md for activation and operations. Do not mark the full application complete while required capabilities or live acceptance remain unchecked.
