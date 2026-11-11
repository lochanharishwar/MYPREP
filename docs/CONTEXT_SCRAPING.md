# Context.dev scraping in MARKY

Context.dev is a server-only provider for the durable website scan and external
research workflows. Set `CONTEXT_DEV_API_KEY` and `SCRAPING_PROVIDER=context`.
No dependency installation is needed. The key is never sent to the target site,
returned to the browser, or saved with extracted evidence.

The adapter follows the official [scrape](https://docs.context.dev/api-reference/web-scraping/scrape),
[map](https://docs.context.dev/map/overview), and
[search](https://docs.context.dev/search/overview) APIs. It maps up to 5,000 URLs,
retrieves full HTML and Markdown, and requests up to five external search results.
It records page URL, retrieval time, request ID, partial-output status, and reported
credit usage. It does not request AI-generated brand facts or inferred colors.
HTML is parsed inertly using the existing identity parser. Missing rendered CSS
falls back to embedded declarations, explicitly marked partial and not computed.

## Activation

Set positive conservative per-request USD estimates in `COST_CONTEXT_MAP`,
`COST_CONTEXT_SCRAPE`, and `COST_CONTEXT_SEARCH`, using the account's billing tier.
The server reserves each estimate atomically before dispatch against the workspace
limit. Credit receipts are retained as evidence; they are **not** converted into a
fabricated dollar cost or automatically refunded. Provider subscription billing is
separate. Failed or ambiguous requests retain the reservation; the client does not
automatically replay them. Durable workflow retries may start another reserved
attempt. Review the provider request history before manually retrying a timeout.

The durable path also needs the configured Supabase server workspace, Inngest,
Gemini analysis settings, and an owner-configured monthly limit. Setting a provider
key alone does not activate that backend. Service settings show missing prerequisites.

The anonymous `/api/local/scan` endpoint remains a free HTML reader, on localhost
and on the public site. It never calls Context.dev or consumes this key's credits.
This prevents public visitors from bypassing the durable spending ledger. No login
wall has been added to local drafting. Context scans require the secure workflow.

## Verification

Transport tests cover authentication headers, bounded output, partial responses,
same-site source validation, failed outputs, map URL deduplication, budget denial,
provider selection and secret-safe errors. These use mocked responses, not live
account credits. Paid testing remains disabled; key validity and live extraction
are not claimed as verified.
