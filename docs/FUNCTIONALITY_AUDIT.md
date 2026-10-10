# BrandCurrent functional repair — 21 September 2026

The app can run locally without a BrandCurrent account. This assessment distinguishes tested code paths from activated external services.

## Illustrated sections and reliability — 9 October 2026

Added 19 original cartoon robot mascots to information sections across all six pages, following the user's final robot-badge reference. Strengths, weaknesses, gaps, experiments, values, voice, aesthetics and competitors each have a distinct character. The images are decorative and separate from evidence. Their combined optimized payload is approximately 595 KB; see `ROBOT_ARTWORK.md` for prompts and asset paths.

Saved reports now hydrate even when a recovery write fails. Recovery respects an active mutation in another tab, while legacy unreviewed content remains quarantined in memory even when storage cannot be written. Scan progress counts pages as saved only after persistence succeeds. Storage failures preserve previous data and show a recovery explanation. The React context was moved to its own module to preserve its identity during provider hot reloads.

Local generation now carries bounded Brand DNA voice, aesthetics, values, fonts, citations and policy constraints through caption generation, image generation and finished-output review. Thousands of unrelated color declarations are omitted from the request. Website statements are labeled first-party claims and interpretation remains distinct from verified product facts.

Verification: 127 tests passed, including quota recovery, active-tab preservation, legacy-content quarantine, and all three provider prompt bodies retaining brand guidance. Provider transport tests are mocked; these changes do not establish live generation or publishing. Existing external activation requirements below still apply.

| Area | Delivered and verified | Activation/coverage limit |
| --- | --- | --- |
| Local access | Browser workspace is selected in development even when Supabase is configured. Settings has no login/signup form. `npm run local` and PowerShell launcher provided. | Keep the local server running; use the same browser origin for saved data. |
| Website extraction | Real server HTTP requests, public DNS/redirect validation, internal link discovery, bounded page and CSS reads, original observed asset URLs, exact tagline candidates, source evidence and searchable page summaries. Live local scan of `https://21st.dev` read six pages without a failed page; one bounded stylesheet was disclosed. Streaming saves page findings incrementally. DOM parsing excludes executable scripts/code examples; Organization JSON-LD and exact identity selectors retain provenance. Sitemap indexes and a best-effort public reader recover some homepage failures. Incorrect animated-word tagline and demo font attribution were removed. | Basic scan is partial, up to six page attempts/100 discoveries. Reader text is separately labeled; computed styles are not available. Firecrawl/Browserless workflow requires owner credentials. No synthesized facts on network failure. |
| Persistence | Shared provider survives route navigation; reads filter by workspace/brand; interrupted browser runs are labeled; legacy unverified content stays outside the qualified gallery. Large generated images use IndexedDB instead of localStorage. | Local browser storage is not a shared or durable server database. |
| Creative workflow | Native Gemini image generation, product references, full brief inputs, finished-image/caption review, code-calculated threshold, bounded corrections per variant, explicit cost prerequisites and conservative local reservations. Placeholder SVG generation and fixed passing scores removed. | No Gemini key is configured. Provider transport is mocked in tests, not a live generation result. Hosted paid generation requires atomic server spending controls; browser-only generation remains local. |
| Scheduling | Existing five adapters retained. YouTube authorization includes public-status update permission. Reconnect migration retains destination IDs and atomically updates credentials. Final dispatch checks credentials/account scope/status while holding the connection lock. Missing Inngest keys reject new schedules. | No social account or durable worker is activated. New migration is tested in PGlite, not applied to the remote BrandOS project. Supabase service credentials, schema, OAuth apps, Inngest and reachable signed endpoints remain required. |
| Analytics | YouTube watch minutes convert to seconds; share/watch percentage reports are supported with missing values preserved. Retryable failures remain failures. Local pages distinguish unavailable data from zero and show setup prerequisites. | No publication/metrics have been verified live. YouTube accounts connected with older scopes must reconnect. Platform-specific access and analytics restrictions still apply. |
| Customer insights | Existing server tracking/import/attribution implementation retained. Unsupported local actions now show prerequisites instead of returning fabricated empty response shapes. | Requires linked first-party events, authenticated revenue data and configured server services. Video/Markov service requires the Python processor. |

## Verification

- 111 Vitest checks passed, including real-data contracts with mocked HTTP transport, private redirect denial, no-key/no-fabrication behavior, reference/finished-media review wiring, persistence isolation, reconnect and dispatch gates, and YouTube metrics. Watch-time reporting also checks historical field compatibility and prevents summing percentages across videos.
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

## Brand DNA analysis and URL recovery — 23 September 2026

The browser-mode scanner previously assigned empty arrays to every strategic section, regardless of the evidence collected. It now runs a deterministic website-evidence analysis with cited strengths, website issues, explicit values where stated, language observations, color observations, proposed gaps to investigate, campaign experiments, and relevant channel tests. These are labeled observations/interpretations/hypotheses, not simulated AI or independent market research. No paid key is needed for this analysis. English-language rules have limited coverage; unknown values, competitor identities, and demand remain explicitly unestablished.

Older saved reports can be upgraded with **Analyze saved evidence**, without another network request. Corrections now cite the user's evidence and survive subsequent scans. Brand switching clears the previous URL draft. Streaming page findings refresh the inventory, and server scan completion correctly refreshes DNA at both `complete` and `partial` states. Color tables load on demand in batches so hundreds of declarations do not slow the initial report.

URL normalization no longer removes meaningful trailing path slashes. Live Apple requests confirmed `/mac` redirects to `/mac/`; rewriting the redirect target previously broke retrieval. The repaired crawler retrieved six Apple pages (previously one), while explicitly recording remaining failed destinations. Navigation ranking deprioritizes account/cart links and allows failed page attempts to be replaced within the time/request limits. Global font parsing handles nested CSS and aliases without accepting descendant demo fonts. Product-page taglines, quotes, contact boilerplate, and internal plan-comparison language are excluded from misleading brand conclusions.

Verification: 122 tests passed, including source-reference integrity, missing-evidence handling, meaningful-slash redirects, correction retention, brand isolation for saved analysis, real scan terminal statuses, and extraction contamination. TypeScript and lint checks passed. Live development API tests read Amul and Linear and generated source-backed strategic sections. Browser checks upgraded the existing 21st.dev report and scanned `apple.com` without requiring a scheme or app login. These checks do not activate image/video generation, social publishing, analytics, or independently sourced competitor research; the activation requirements above remain applicable.

## Hosted scraper repair and compact studio — 21 September 2026

The production scan endpoint returned HTTP 403 because the current Sites dispatcher supplied authenticated email without the assumed user-ID header. The browser-workspace guard now accepts either trusted dispatch identity and checks the configured application origin. It still rejects missing identity and cross-site calls. Regression tests cover this exact request shape, script/demo identity contamination, structured data, large response prefixes, sitemap recovery and interrupted streams. Content studio groups the brief and delivery settings, with optional creative fields collapsed and format/platform selection preserved.

Reader integration follows https://github.com/jina-ai/reader and was checked against its live JSON endpoint. Browser-rendered HTML requires a key and is not advertised as available in the keyless path. A failed reader returns a coverage limitation, never synthesized facts.

22 September follow-up: Sites bearer-authorized verification requests carry no visitor identity headers. The keyless public-website scan now also accepts trusted Sites dispatch at the exact configured app origin, relying on the existing private Sites audience gate. This exception does not apply to paid generation, server records or account actions. Cross-site calls remain rejected. Regression tests cover the identity-free dispatch path and its scope.
