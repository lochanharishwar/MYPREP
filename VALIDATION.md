# Verification and activation status

Updated 17 September 2026. The original assessment and `outputs/production-audit` evidence are preserved. This is a working preproduction implementation, **not a certified enterprise service or proof of live publication**.

## Local verification

The subsequent full-stack completion stage adds server-side page search, stable pagination totals, resource-error redaction, settings submission guards and route recovery. Its release gate passed **61 application/API/database tests plus 13 Python tests**; see `docs/STAGE_VERIFICATION.md`, `docs/COMPLETION_CHECKLIST.md` and `docs/INTERACTION_INVENTORY.md` for current findings, browser evidence and remaining work. Migration 019 must be applied before activating the new page search on a hosted backend.

The release gate is `npm run check`: TypeScript → lint → actual-migration/domain tests → Python tests → npm and Python dependency audits → production build. `.github/workflows/release.yml` runs the same gate without production secrets.

Executed locally on 17 September 2026: **the complete release gate passed**, including **50 TypeScript/database tests and 13 Python tests**, type checking, lint and the production build. The full npm audit reported **0 vulnerabilities** and the locked Python audit reported **no known vulnerabilities**. The Cloudflare development-tool dependency group was updated together to remove the vulnerable transitive sharp version identified by [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c). The campaign-freeze regression proves that stale worker payloads cannot undo an owner's freeze; an explicit owner unfreeze still works. Nonblocking toolchain notices remain for the middleware convention, a future JSON import convention, a client chunk above 500 kB and Starlette's test-client HTTP library deprecation. These notices are not represented as eliminated.

Browser verification on 8 September 2026: all six routes displayed the correct heading and main content. At a 390 × 844 viewport, each page's document width was 375 px (no horizontal overflow). Desktop dashboard and mobile content studio were inspected visually. Empty format/platform checkboxes and a disabled Generate button were verified. Settings opened with Enter; Escape dismissed it and restored focus to Workspace settings. Temporary viewport overrides were reset. No authenticated provider workflow was exercised. These browser checks were not repeated for the subsequent server freeze fix and development-tool dependency update.

The regression suite covers confirmed publication as a protected terminal state; one dispatch marker; command/outbox idempotency; recovery of stranded schedules; approval revocation; immutable audit entries; workspace and assigned-brand denial; shared-device deletion preserving other customers; derived-summary invalidation; multistage approval; token refresh compare-and-swap; budget caps; source/score rules; UTC/DST conversion; request size and HMAC boundaries; full-period reports with more than 1,500 competing entities; new-customer cohorts, currencies and deterministic attribution fixtures. PGlite provides a disposable PostgreSQL/pgvector engine with simulated Supabase auth/storage schemas. These are local tests, not a hosted database certification.

Browser checks cover the six-page unconfigured shell and mandatory format controls. Authenticated, populated, mobile data tables and all live provider screens still require staging credentials and realistic authorized fixtures. Empty states are intentional; there is no demonstration brand, fabricated revenue or invented integration success.

## Implemented since the assessment

- Compatible dependency upgrades; corrected persisted-page validation and reproducible Python lock.
- Transactional command/outbox receipts, bounded delivery retries, dead-letter visibility, scheduled/media watchdogs, terminal publication protection, revocation and a guarded dispatch marker.
- Direct-storage media jobs, JPEG image preparation, persisted actual media metadata and deterministic platform checks; captions are separately editable/reviewable.
- Scoped resource pagination, complete server reports with explicit periods, lazy private media signing and stale workspace/report response protection.
- Workspace switching, assigned-brand/customer/export permissions, MFA/SSO controls, offboarding, expiring invitations, ownership transfer and staged approval policy.
- Owner-approved brand policies, claim evidence references, disclaimers, forbidden phrases, creative preferences, pinned original assets and rights expiry.
- Account refresh leases, bounded publication verification with an audited human resolution, frozen campaigns, publishing stop, operational queue view and append-only audit history.
- Correct shared-device deletion, export audit, consent withdrawal, encryption key IDs, bounded rolling Markov windows and paginated nightly dispatch.

## Activation blockers — not completed or claimed

1. No live Supabase project, applied migrations, SMTP/Google/SSO setup, signed-in staging users or data fixtures were supplied. Configure these and prove RLS/MFA/refresh/permissions on the hosted project.
2. Firecrawl, Browserless, Gemini/image/video, Inngest, Cloud Run and social credentials are absent locally. Model availability, configured tariffs and provider account quotas need real validation. Cloud Run/FFmpeg maximum-media and cold-start tests have not run on this machine.
3. The private Sites review gate blocks team/external callback access. The owner must select a reachable production/staging audience/origin before Inngest, OAuth callbacks, tracker and purchase webhooks can operate. Sharing is never changed implicitly.
4. Instagram/YouTube/X/LinkedIn/Reddit account and application approvals remain external. All five adapters have implementation paths; none has a recorded test-account publication from this work. YouTube public-upload restrictions and Reddit access approval cannot be bypassed.
5. No approved human-labeled AI evaluation corpus was supplied. An 8.7 score is a code threshold, not demonstrated factual accuracy, rights clearance or performance. Model/prompt/rubric/source versions are persisted; calibrating false passes, false rejects and drift requires reviewed examples and actual provider runs.
6. No controlled-egress deployment or adversarial DNS/redirect/subresource test is established. URL validation and bounded HTTP requests are not proof against DNS rebinding. Configure/test provider egress isolation before unattended crawling.
7. No external paging integration, load/soak measurements, restore drill, penetration test, full accessibility audit, named service owners or customer procurement sign-off exists. The runbook supplies procedures and proposed acceptance targets, not successful drill results or certifications.

## Product scope still requiring further implementation/acceptance

The assessment's broader enterprise expansion is not all delivered: automated SCIM/service-account provisioning, policy-driven retention across provider histories/backups, full social inbox/listening and historical connected-post inventory, customer-specific approval delegation, multilingual asset variants, reusable campaign templates, threaded assignments/bulk campaign operations and a human-calibrated evaluation service remain separate work. Current comments are bounded samples; only Instagram and YouTube retrieve comment bodies, and unavailable metrics remain null. These are explicit limitations, not activated integrations.

For release, record a real scan → approved brand policy → finished generation/review → exact-account approval → schedule → provider-confirmed publication → feedback, including injected worker interruption, token expiry, rate limit, cancellation, feedback delivery failure and ambiguous provider response. Record each destination independently, retain actual provider links and timing, and repeat after material adapter changes. Do not approve unattended publishing until this evidence exists.

See `docs/OPERATIONS.md` for configuration, incident controls, rotation, restore and privacy handoff.
