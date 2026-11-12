# Context.dev scraping in MARKY

Set server-only `CONTEXT_DEV_API_KEY` and `SCRAPING_PROVIDER=context`.
The browser never receives the key. With Context selected, `/api/local/scan`
maps the website then reads one queued page per request. It saves observations,
extractive page summaries, source links and remaining URLs after each request.
The browser retains the run ID to resume interrupted scans. Closing the browser
pauses work; this browser workflow does not claim background execution.

## Credit limits

The owner approved 50 credits per website and 1,000 total monthly. MARKY applies
the website limit across repeated runs in the same Indian calendar month.
Each map or HTML/Markdown scrape reserves one credit atomically before dispatch.
Failed or ambiguous attempts retain their reservation conservatively. No JSON,
product extraction, OCR or browser-action options are requested. The limits cover
this browser workflow, not provider subscriptions or use outside MARKY.

Local development uses ignored `.wrangler/context-scans.sqlite`. Production uses
the `DB` D1 binding and the generated schema-only migration under `drizzle/`.
Missing storage fails closed. Public visitors share the owner's finite allowance.
The existing advanced Supabase workflow has separate workspace dollar budgets
and requires its server credentials, Inngest and analysis configuration.

## Coverage and recovery

Up to 5,000 same-site URLs are inventoried. External and media links are excluded.
Every successfully read page receives a summary and evidence; failed and pending
pages remain visible. Credit, rate-limit and account problems pause the queue.
Access challenges are reported rather than turned into invented brand facts.
HTML is parsed inertly. Embedded CSS is observed, not computed; rendered styles
and inaccessible pages remain explicit coverage limitations.

The adapter uses the official [scrape](https://docs.context.dev/api-reference/web-scraping/scrape),
[map](https://docs.context.dev/map/overview), and
[credit accounting](https://docs.context.dev/account/credits) contracts.
It records retrieval time, request ID and reported scrape credit usage when available.

## Verification

Automated tests exercise queue traversal, summaries, budget denial, account/rate
failures, persistent reservations and concurrent run exclusion. These tests use
mocked transport. A separate authorized live test read `https://example.com`,
returning one completed page, four evidence records and no failed/pending pages.
It reserved two credits (map plus scrape). The result is saved locally in
`outputs/context-live-result.json`. No paid image-generation test was run.
