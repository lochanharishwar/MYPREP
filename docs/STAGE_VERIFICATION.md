# Completion stage verification — 17 September 2026

## Implemented and checked

The previous 50 application tests remain; 11 new API/database cases bring the total to **61 passing**. **13 Python tests pass**. `npm run check` passed type checking, lint, tests, npm audit (0 vulnerabilities), Python audit (no known vulnerabilities) and production build. After adding final route recovery and polling/pagination UI changes, type checking and lint were rerun; the final build passed. No new dependencies were installed in this stage.

Database tests apply all actual migrations through 019 to disposable PGlite. They cover 30 matching findings across three pages, deterministic cursor traversal, unchanging total, case-insensitive search, literal `%`/`_`, no matches, raw-content omission, wrong workspace/brand, invalid limits and direct authenticated RPC denial. API tests mock the Supabase boundary and verify authorization short-circuiting, bounded inputs, cursor roundtrip, empty responses, no-store and redacted backend failure. They do not prove hosted Supabase configuration.

## Browser evidence

| Flow | Steps / expected result | Actual result | Remaining coverage |
|---|---|---|---|
| Brand DNA | Open /brand-dna without configured Supabase | Search disabled; explicit connection message; no false zero-search success | Authenticated results, pagination, clear/retry need fixtures |
| Settings | Open from settings icon | Dialog visible; email and Google submit disabled; setup explanation visible | SMTP/OAuth delivery and real sessions blocked |
| Keyboard | Escape from settings | Dialog closed; focus returned to Workspace settings | Full keyboard/assistive-technology audit not done |
| Brand DNA responsive | 390×844 and 1440×900 | Screenshots inspected; document/client widths both 375 and both 1425 respectively; no horizontal overflow | Populated tables/cards remain unverified |
| Six routes | Open dashboard, DNA, content, schedule, analytics, insights at 390×844 | Correct h1 on each; document/client width 375 on each; no console errors returned by browser log tool | Empty/unconfigured shells only |
| Missing page | Open /missing-page-audit; click Back to dashboard; wait for / | Useful custom 404 and successful return to dashboard | Render-error boundary was built, not fault-injected in browser |

Temporary viewport overrides were reset. Browser interaction used the local app; no customer records or provider side effects were created.

## Security and performance

- Confirmed defect: page search filtered only loaded client records. Replaced with parameterized scoped SQL search.
- Confirmed defect: counts after a generic pagination cursor represented remaining rather than total records. Added a separately scoped total query for later pages.
- Confirmed defect: unexpected resource errors returned raw database messages. Now return a generic 500 with a correlation ID; logs contain that ID, not raw database text. Other routes remain follow-up work.
- Confirmed defect: settings actions could be submitted repeatedly before completion, and sign-out ignored the provider's returned error. Added pending guard/disabled fieldset and explicit error handling.
- Measured production bundle: largest JS asset `marketing-app-1meJtUUi.js` is 970,396 bytes uncompressed; framework is 190,109 bytes, Vinext is 132,670 bytes. The shared marketing chunk still exceeds the build warning threshold. This is a size observation, not a load-time benchmark or a claimed performance improvement. Route-level chart/code splitting remains a candidate for measured follow-up.
- No new index is claimed to accelerate substring search. Full-brand scans and later-page count queries need representative hosted load measurement before scale acceptance.

## Activation and deployment

Supabase and external-provider secrets are absent locally; no database migration was applied to a hosted project. Source contains migration 019 and its recovery instructions in SEARCH_CONTRACT.md. Existing owner-private hosting is retained. Confirm code deployment using the native Sites deployment receipt; authenticated production functionality remains blocked until backend setup and migration application.

The remaining application-wide controls, broader enterprise capabilities, external approvals, tests and user setup actions are tracked in COMPLETION_CHECKLIST.md and INTERACTION_INVENTORY.md. This stage is not a claim that the full production plan is complete.

## Atomic disconnect and confirmation follow-up

Added migration 020: owner-scoped credential deletion, connection status change and audit insertion are one transaction. Repeat disconnect is idempotent; stale token refresh cannot recreate deleted credentials. Three real SQL regression tests cover successful/repeated disconnect, injected status-update failure rollback, and owner/workspace denial. Full check passed **64 application/API/database tests and 13 Python tests**, type checking, lint, both dependency audits and production build.

Reject and Disconnect now use an accessible confirmation dialog. Browser verification used the real component in `tests/browser/confirmation.tsx` with simulated callbacks, served by `node scripts/preview-confirmation.mjs`; this fixture is not a production route. Verified Cancel initial focus, Escape without mutation and trigger focus recovery, visible failure with dialog retained, retry (call count increments once), cancellation, disabled controls during a five-second pending callback, successful closure and focus return. Browser console returned no errors. This does not prove authenticated reject/storage or live disconnect behavior; nested settings-dialog and populated mobile cases remain unverified.

Apply migration 020 after 019 before deploying this API to an activated backend. No hosted migration was applied here. For rollback, retain this additive function while rolling back the application; reverting to the old API restores the non-atomic defect and is not recommended. Credential deletion is intentionally irreversible: reconnect the account to recover authorization. The operation removes locally stored tokens; it does not revoke permissions at the social provider or remove published posts. Already-dispatched requests may finish.
