# Workflow improvements and release boundaries

This update preserves the previous security changes and adds the first concrete competitor-informed workflow improvements.

## Implemented
- A shared brand-scoped workflow panel links evidence, qualifying content, approvals, schedules, confirmed publication and metric observations. Counts refer only to loaded records. A verifying publication is never counted as published.
- Reusable campaign briefs are explicitly saved in browser storage per workspace and brand. At most 12 validated briefs are retained. Applying a brief never starts paid work or carries budgets, accounts, media references or approvals. Storage failures preserve existing data.
- Social setup separates account connection from background-publishing readiness and exposes token expiry with refresh guidance.
- Server caption revisions show a platform-labelled preview and original media/copy comparison. Local revisions remain explicitly described as paid regeneration; they are not represented as a free editor.
- Analytics ranks available observations after deduplicating each platform/post by observation time. Zero remains distinct from unavailable. Suggested experiments are labelled, not asserted as causal conclusions.
- Saved security fixes fail closed on authorization lookup errors, redact unexpected API/workflow errors, separate browser event IDs from trusted revenue event IDs, validate ingestion scope, bound concurrent local operations, and stop undispatched generation stages after cancellation.
- URL and DNS validation rejects reserved destinations and malformed responses. Rendered browser requests require an operator-configured network isolation flag. This flag is an attestation, not a firewall. DNS checks do not pin outbound sockets, so transport-level rebinding protection remains an infrastructure requirement.
- Processor validation and timezone-aware attribution ordering repaired.

## Verification
363 application tests and 23 Python tests pass. TypeScript checking and production build pass. These include authorization failures, event replay boundaries, cancelled generation, network input validation and attribution fixtures. Provider transport is mocked; no paid generation or social posts were dispatched. Browser visual/interaction verification was not repeated because localhost browser access was previously blocked by the tool policy.

Dependency audit is NOT clean: the current installed graph reports 16 affected entries (2 high, 12 moderate, 2 low), including nested Zod/Inngest and development/tooling chains. These are not 16 independently demonstrated exploitable application paths. Further targeted dependency work is required; do not describe this release as vulnerability-free. The earlier Python audit also identified a certifi update requirement.

## Still required before claiming full functionality
- Secure Supabase server credentials, isolated schema activation, storage, worker signing/event keys and social OAuth app approvals. Last BrandOS connection attempt failed database authentication. Code changes cannot substitute for these account-side requirements.
- A real end-to-end campaign verification with owner-authorized generation spending and a specifically authorized publishing test. Paid testing remains disabled.
- Full layer-based image editing, cropping/resizing, media replacement with fresh review, and downloadable template library are not implemented in this increment.
- A unified inbox and listening are future work, not active features.
- Historical pre-namespace browser events need a reviewed migration before importing potentially colliding trusted IDs; this update does not mutate live historical records.
- Local monthly budgets remain browser controls, not a server-enforced spending ledger. Public paid automation stays gated.

## Next release acceptance
First activate and verify one platform through exact-version approval, scheduled dispatch, published URL reconciliation and metric collection. Then expand platform coverage. Complete editable-media review/invalidation before offering it in the approval gallery. Preserve evidence provenance and user corrections throughout.
