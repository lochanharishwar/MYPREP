# BrandCurrent functional repair — 21 September 2026

The app can run locally without a BrandCurrent account. This assessment distinguishes tested code paths from activated external services.

| Area | Delivered and verified | Activation/coverage limit |
| --- | --- | --- |
| Local access | Browser workspace is selected in development even when Supabase is configured. Settings has no login/signup form. `npm run local` and PowerShell launcher provided. | Keep the local server running; use the same browser origin for saved data. |
| Website extraction | Real server HTTP requests, public DNS/redirect validation, internal link discovery, bounded page and CSS reads, original observed asset URLs, exact tagline candidates, source evidence and searchable page summaries. Live local scan of saved `https://21st.dev` read five pages; one oversized page and one inaccessible CSS resource were explicitly reported. | Basic scan is partial, up to six pages/100 discoveries, without JavaScript rendering. Firecrawl/Browserless workflow requires owner credentials. No synthesized facts on network failure. |
| Persistence | Shared provider survives route navigation; reads filter by workspace/brand; interrupted browser runs are labeled; legacy unverified content stays outside the qualified gallery. Large generated images use IndexedDB instead of localStorage. | Local browser storage is not a shared or durable server database. |
| Creative workflow | Native Gemini image generation, product references, full brief inputs, finished-image/caption review, code-calculated threshold, bounded corrections per variant, explicit cost prerequisites and conservative local reservations. Placeholder SVG generation and fixed passing scores removed. | No Gemini key is configured. Provider transport is mocked in tests, not a live generation result. Hosted paid generation requires atomic server spending controls; browser-only generation remains local. |
| Scheduling | Existing five adapters retained. YouTube authorization includes public-status update permission. Reconnect migration retains destination IDs and atomically updates credentials. Final dispatch checks credentials/account scope/status while holding the connection lock. Missing Inngest keys reject new schedules. | No social account or durable worker is activated. New migration is tested in PGlite, not applied to the remote BrandOS project. Supabase service credentials, schema, OAuth apps, Inngest and reachable signed endpoints remain required. |
| Analytics | YouTube watch minutes convert to seconds; share/watch percentage reports are supported with missing values preserved. Retryable failures remain failures. Local pages distinguish unavailable data from zero and show setup prerequisites. | No publication/metrics have been verified live. YouTube accounts connected with older scopes must reconnect. Platform-specific access and analytics restrictions still apply. |
| Customer insights | Existing server tracking/import/attribution implementation retained. Unsupported local actions now show prerequisites instead of returning fabricated empty response shapes. | Requires linked first-party events, authenticated revenue data and configured server services. Video/Markov service requires the Python processor. |

## Verification

- 101 Vitest checks passed, including real-data contracts with mocked HTTP transport, private redirect denial, no-key/no-fabrication behavior, reference/finished-media review wiring, persistence isolation, reconnect and dispatch gates, and YouTube metrics. Watch-time reporting also checks historical field compatibility and prevents summing percentages across videos.
- TypeScript and lint checks passed. Production build passed with nonfatal Vinext/Vite warnings.
- Browser inspected Dashboard, Brand DNA, Content studio, Scheduled posts, Analytics and Customer insights on localhost. No localhost console errors were observed during this flow. Verified login-free settings and retained website results on navigation.
- No publishing test sent a social post. No tests establish that production integrations are active.

## External activation still required

1. Own Gemini key plus model access/billing and conservative operation cost estimates for text/images.
2. Supabase service configuration, isolated BrandCurrent schema/migrations and private storage for durable workflows; account/token encryption key.
3. Inngest event/signing keys and publicly reachable authenticated workflow callbacks. A private Site access gate cannot be assumed to accept external provider callbacks.
4. Platform OAuth app credentials and authorizations, including any required YouTube project verification or Reddit approval.
5. Firecrawl/Browserless for rendered analysis, and the deployed Python processor for video preparation/Markov attribution.

The remaining activation steps cannot be replaced with scraped public API keys or a website login cookie.
