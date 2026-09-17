# Page insight search and resource pagination

## HTTP contract

`GET /api/resources?brandId=<UUID>&kinds=page&q=<term>&limit=25&cursor=<opaque cursor>`

- Requires Supabase bearer authentication, workspace membership and access to the specific brand. Optional `x-workspace-id` selects an authorized workspace. All four roles can read permitted brand page findings.
- `q`: trimmed literal substring, case-insensitive, maximum 200 characters. Searches page URL, title, analyzed summary/insights/SEO issues and recorded extraction error. It does not search raw HTML, CSS or markdown. `%`, `_`, quotes and punctuation are literal; no dynamic SQL is constructed.
- `limit`: integer 1–100, default 25. Newest first, with ID as deterministic timestamp tie-breaker. A cursor encodes an ISO timestamp and UUID; invalid input returns 400. Changing the query resets pagination.
- `q` applies only to a single `page` group. Search across historical social posts is not implemented or implied.
- Response: `{groups:[{kind:"page",rows:Entity[],total:number,nextCursor:string|null}]}`. Each record includes workspace/brand IDs, kind, timestamps and a payload excluding HTML, markdown and styles. `total` covers all matches, not just remaining rows after the cursor. An empty successful result is `rows:[],total:0,nextCursor:null`.
- Errors: 400 invalid query, 401 missing/expired session, 403 access denied, 404 inaccessible/missing brand, 500 unavailable backend. Errors contain `error`, `code` and `requestId`; unexpected resource errors expose no database details. Responses are private/no-store.
- Read-only, no paid dispatch, mutation or automatic retry. Repeated GETs have no side effects. Each page observes the current database: concurrent inserts/deletes can change total between requests. Cursor order avoids offset shifts; no snapshot guarantee is claimed.

## Interface behavior

Search is debounced 250 ms. Query, brand, workspace and user changes remount results and abort the old request. Workspace reads time out at 30 seconds. Load-more requests cannot overlap; retry preserves the failed cursor. Clear returns to unfiltered results. Refresh replaces the loaded set. A failed initial request does not present an empty-success card; a failed later page preserves prior results with a retry notice.

## Migration and recovery

019 adds one stable, security-invoker SQL function. It changes no stored records and drops no columns. HTTP authorization runs before a server-only RPC; direct anonymous/authenticated execution is revoked. Existing brand/workspace/kind filtering remains mandatory. Search uses a bounded response but scans matching brand page records; no speedup claim or new speculative search index is made.

Apply migrations in order using the normal Supabase migration workflow. Before rollout, verify the new function in staging with role fixtures. To roll back, first redeploy the previous application version, then optionally drop `public.search_page_insights(uuid,uuid,text,integer,timestamptz,uuid)`. Never drop the function while the new application still depends on it. No data restore is needed for this additive function; retain the ordinary database backup procedure.

## Threat review

Assets: private brand findings, customer/team scope and service-role capability. Entry points: bearer token, workspace/brand identifiers, query and cursor. Boundaries: browser → authenticated API → privileged database client. Protections: scope check before RPC, parameterized SQL arguments, dual workspace/brand filters, strict length/limit/cursor validation, HTTP(S)-only rendered source/image URLs, private cache policy and raw-content omission. Regression coverage must include foreign scopes and direct-RPC denial.

Remaining assumptions: hosted Supabase policies/configuration, provider-supplied payload shape and the original crawl-egress safeguards need live acceptance. No claim of penetration-test coverage or complete application-wide error sanitization is made.
