# Social connections and posting planner

Implemented 10 October 2026. The scheduler and Workspace settings share one connection hub for YouTube, X, Instagram, LinkedIn and Reddit. Connect opens the registered platform's OAuth consent page and returns to Scheduled posts. The server requires owner access and brand scope, binds the callback to the initiating browser using an HttpOnly SameSite=Lax cookie, consumes state once, and encrypts tokens. No token-entry form is exposed on the public website.

## Current activation blockers

The production environment inspected on 10 October contained only APP_ORIGIN and BROWSER_WORKSPACE_MODE=sites. No social account was connected or test post published during this change. The connection buttons accurately show setup is required.

Before authorization can work, the owner/operator must configure the existing durable backend (Supabase URL, anon and service-role keys, schema and migrations), a valid 32-byte TOKEN_ENCRYPTION_KEY or configured encryption keyring, and each platform's CLIENT_ID and CLIENT_SECRET. Use hosting secret settings, never a public browser form or Git. Register this callback per platform:

`https://brandcurrent-marketing.lochanharishwar.chatgpt.site/api/oauth/{platform}/callback`

The server workspace requires an authenticated owner to bind accounts safely; the currently enabled browser workspace remains available without login. Do not bypass that isolation on a public Site. Enable the server workspace only after configuring its access and migrating any required local content. Inngest event/signing keys and a reachable authenticated workflow endpoint are additionally needed for unattended posting and scheduled metric refresh. Media workflows may require the existing processor and private storage configuration.

Platform-specific activation and permission approval must be completed by the account/app owner. Provider billing and API access are separate from this application's spending limits. Signing into a social website alone does not register this application or grant it API permission.

## Provider references

- YouTube uploads: https://developers.google.com/youtube/v3/docs/videos/insert . The current method reference explicitly says unverified API projects are not restricted to private viewing, contrary to older resource-level documentation. The UI no longer states verification is universally required. Channel restrictions and OAuth requirements still apply.
- YouTube timing guidance: https://support.google.com/youtube/answer/16533387?hl=en . Timing may help initial activity; it is not a guarantee of long-term reach.
- Audience reports: https://support.google.com/youtube/answer/9314416?hl=en . The app does not claim to import the Studio audience heatmap.
- Instagram professional account flow: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
- X authorization: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- LinkedIn: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin . Member posting permission does not automatically grant organization or analytics access.
- Reddit access: https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data

## Timing method

Seven calendar days in the selected IANA timezone, with one-click date/time selection. Future slots exclude the next ten minutes, DST gaps and ambiguous times. Observations must match post/workspace/brand/platform, be finite and nonnegative, and have been collected 24–48 hours after confirmed publication. Duplicate posts are counted once. Planner history is limited to the preceding 90 days.

Use impressions for X, views for YouTube/Instagram, likes for LinkedIn, and comments for Reddit; never blend these into a cross-platform score. Hours need at least three posts on three dates. Prefer same-weekday evidence with at least six posts and two eligible competing hours; otherwise require twelve posts across seven dates for account-wide evidence. Rank by median; equal or zero-only results stay experimental. These thresholds are application choices, not statistical significance or official optimal times. Without enough data, 09:00, 13:00 and 18:00 are explicitly labeled experimental planning choices.

Tests cover sample isolation, outliers, zero/missing data, history freshness, duplicate events, weekday evidence, timezone/DST conversion, activation prerequisites and OAuth browser binding. They use deterministic fixtures and do not establish live platform publication or analytics access.

## Release verification, 11 October 2026

The planner now reads account-specific history independently of the gallery: up to 200 published posts, bounded batches of 20 post measurement windows and up to 1,000 matching observations per batch. Truncated or unavailable history is explicitly reported. The planner refreshes its clock every minute and when the tab becomes visible, rejects stale time selections, and reloads server history every five minutes. Refreshed access-token expiry does not falsely mark account authorization as disconnected.

All 140 deterministic tests and TypeScript checks passed. Browser QA verified time selection and a 390px mobile layout with no horizontal overflow or console errors. Live OAuth consent, provider publishing, and production database execution remain unverified because the required credentials are absent.
