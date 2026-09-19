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

## BrandOS activation status

- [x] Restore the selected BrandOS Supabase project and inspect its schema.
- [x] Detect the incompatible pre-existing `public.brands` schema before applying BrandCurrent migrations; the attempted transaction rolled back without changes.
- [x] Add `SUPABASE_DB_SCHEMA` support to the BrandCurrent API server and processor so a dedicated schema can be used without overwriting BrandOS tables.
- [ ] Create and expose the `brandcurrent` schema, then translate and apply BrandCurrent migrations there. See BRANDOS_BACKEND_ACTIVATION.md.
- [ ] Configure BrandOS Auth Site URL/redirect allowlist and the Sites runtime keys, then test an email magic link.
- [ ] Configure a Google OAuth client in the owner's Google Cloud project if Google login is required. Public API keys cannot configure OAuth.

## External activation — blocked

- [ ] Supply and configure the BrandOS public key and server-only service role in Sites. Do not put the server-only key in source or client code.
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

### 18 September continuation

- [x] Apply safe error responses to jobs, media, reports, exports and state; add 18 regression tests (82 application tests total).
- [ ] Extend the same contract to mutation routes, ingestion and OAuth callbacks, preserving actionable domain validation.
