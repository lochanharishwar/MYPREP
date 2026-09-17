# Interaction inventory

Updated 17 September 2026. Repeated per-record controls are represented once per control family; each listed input belongs to the named form. UI primitives not rendered by the application are excluded. No checkout/subscription/purchase flow exists; workspace automation limits do not purchase provider subscriptions.

Permission key: **M** = signed-in workspace member with access to the selected brand; **E** = owner/editor; **A** = owner/approver plus configured approval stage; **O** = owner; **C** = customer-data permission; **X** = export permission. Server and database checks remain authoritative. Unauthenticated navigation exposes the unconfigured shell, not private records.

Verification key: **S** = source reviewed, implementation exists, populated/live interaction not verified; **T** = targeted local API/database coverage; **B** = browser-verified shell interaction (recorded separately below); **Blocked** = service/role fixtures required. These labels are not interchangeable. All persisted/provider actions below remain **S / Blocked** unless explicitly marked T.

| Page | Control / inputs | Expected result | Backend | Permission | Failure behavior | Verification |
|---|---|---|---|---|---|---|
| Shared | Wordmark; six dock links; dashboard quick links; Explore Brand DNA | Navigate to the named page; preserve workspace selection | Routes, /api/state | Shell public; records M | Route recovery or notice | S; earlier shell B |
| Shared | Skip to workspace | Move focus to main content | None | Any | Native anchor | S |
| Shared | Brand dropdown | Load selected brand only | /api/resources, /api/jobs | M with assigned brand | Notice; no foreign rows | T scope, S UI |
| Shared | Settings icon, account avatar, Connect workspace | Open settings dialog | None until action | Any | Dialog remains usable | Earlier B |
| Shared | Dialog close, Escape, cancel | Close and restore trigger focus | None | Any | No mutation | Earlier settings B |
| Shared | Dismiss notice | Remove current notice | None | Any | No mutation | S |
| Shared | Load older records disclosure; More [resource] | Append next scoped resource page | GET /api/resources | M; customer kinds C | Notice; retain rows | S; totals fixed |
| Shared | Error-page retry; Back to dashboard | Retry rendering or recover from missing route | Routes | Any | Generic error, no stack | New; browser pending |
| Dashboard | Website URL; Discover my brand | Save new brand if necessary, reserve budget and enqueue scan | POST brands, scan; outbox/Inngest | E; configured budget | Notice, preserved URL | T command/limits; live Blocked |
| Dashboard | Resume analysis | Continue partial/blocked crawl | POST resume-scan | E | Notice; persisted job status | S / Blocked |
| Dashboard | Agent orb / activity | Display actual status; pause standby/frozen campaigns | Poll /api/jobs | M | Status remains last observation | B standby; active Blocked |
| Brand DNA | Export JSON | Download current version as JSON | Current scoped DNA | M | Native download | S |
| Brand DNA | Correct details; name/tagline; Save new version | Persist labeled correction and new version | POST dna | E | Keep dialog/input, show notice | S / Blocked |
| Brand DNA | Values/aesthetics/voice/strategy evidence disclosures | Reveal cited evidence and source links | Versioned DNA | M | Missing evidence not invented | S |
| Brand DNA | Palette page links; competitor/source links | Open source in new tab | External public source | M | Browser/source availability | S |
| Brand DNA | Search page insights | Search all stored URL/title/summary/SEO findings | GET resources → search_page_insights | M | Distinct error and retry | New T; live Blocked |
| Brand DNA | Clear search | Reset to all brand page findings | Same API | M | Retry on failure | New S |
| Brand DNA | Load more / Refresh / Retry page findings | Append, replace, or retry the failed page; stable total | Same API | M | Preserve previous results; no false empty success | New T backend, S UI |
| Brand DNA | Page source link / screenshot | Inspect actual source/observed image | Stored source URL | M | HTTP(S) only; inaccessible source remains unavailable | S |
| Brand policy | Review facts/creative/rights disclosure | Expand current policy inputs | Current DNA/assets | M | Missing facts stay missing | S |
| Brand policy | Original asset file; source/rights fields; upload | Validate PNG/JPEG/WebP and save private immutable asset | /api/assets + private Storage | E | Reject invalid bytes/size; notice | T media rules; live Blocked |
| Brand policy | Pin asset checkboxes; remove asset action | Change policy references / requested asset operation | assets / brand-policy | O policy approval | Server gate; notice | S / Blocked |
| Brand policy | Claims/citations, forbidden phrases, disclaimers, palette, fonts, tone, language, market, visual direction, rights expiry; approve policy | Persist approved constraints in a versioned Brand DNA | POST brand-policy | O | Validation; keep input | T policy rules; live Blocked |
| Content | Idea; format selectors; platform selectors | Require idea and at least one supported format/platform | campaign schema | E for submission | Disabled submit / validation | Earlier B mandatory controls; T schema |
| Content | Audience/scenario/event/creative direction/budget; Generate | Enqueue grounded generation within spending limits | POST campaign; providers/Inngest | E | Preserve form; notice/job failure | T budget/idempotency; live Blocked |
| Content | Media image/video playback | Show finished private media | GET /api/media | M | Expired/unavailable media notice | S / Blocked |
| Content | Review breakdown disclosure | Display weighted review scores and feedback | Versioned review | M | Nonqualifying media absent | T scoring; S UI |
| Content | Edit caption disclosure; textarea; original disclosure; submit review | Create and review separate content version | POST decision(edit) | E | Original approval remains separate; preserve text | T data rules; live Blocked |
| Content | Approve; destination/stage selection; confirm | Bind approval to exact content/account/stage | POST decision(approve) | A | Reject wrong account/stage/version | T approval rules; live Blocked |
| Content | Redo; feedback; confirm | New bounded run using correction feedback | POST decision(redo) | E | Budget/attempt error | T bounds; live Blocked |
| Content | Reject | Delete rejected content/media with operational audit | POST decision(reject), Storage | A | Notice; partial deletion needs operational inspection | S / Blocked; destructive confirmation review remains |
| Schedule | List/calendar tabs; platform filter | Change view/filter loaded schedules | Scoped resources | M | Empty state | S |
| Schedule | Previous/next month; calendar event | Navigate month / open post editor | None until save | M | Empty days stay empty | S |
| Schedule | Schedule content; approved version/account; date/time/timezone; save | Persist approved destination schedule and durable dispatch | POST schedule | E; exact approval | Validation; dialog preserved | T timezone/approval/idempotency |
| Schedule | Reschedule; date/time save | Increment revision, invalidate previous job | POST change-schedule | E | Cancellation/dispatch race denied | T database rules; live Blocked |
| Schedule | Cancel | Block undispatched upload | POST change-schedule | E | Already-dispatched work reconciled | T database rules; live Blocked |
| Schedule | Approved-media preview disclosure; published URL | Show exact approved media/provider post | Storage/provider | M | No invented published link | S / Blocked |
| Schedule | Verify publication | Reconcile ambiguous provider response | POST reconcile | E | Bounded attempts, actionable unresolved state | T terminal guards; live Blocked |
| Schedule | Candidate ID/URL; resolution reason; confirm | Audited operator resolution after provider evidence | Publication resolution endpoint | Authorized operator | Require valid evidence/reason | S / Blocked |
| Analytics | Platform/campaign/metric filters | Query period metrics for chosen scope | GET /api/reports | M | Report error separate from missing metrics | T report aggregation; S UI |
| Analytics / Insights | From/until dates; Refresh report | Re-query full period, exclusive end date | GET /api/reports | M; attribution C as enforced | Bounded date range; error notice | T period rules; S UI |
| Analytics | Chart hover/focus; accessible data-table disclosure | Inspect available values without inventing nulls | Report result | M | Unavailable/stale distinct from zero | S / Blocked populated |
| Analytics | Metric definitions disclosure | Show provider-specific definitions | Observations | M | Unsupported values unavailable | S |
| Analytics | Feedback/news/source/evidence links | Inspect cited comments/news | evidence action / external URLs | M; feedback C | Deleted/unavailable notice | S / Blocked |
| Insights | Attribution comparison; currency/platform/model controls | Compare actual linked revenue/spend/journeys | reports; Python Markov result | M/C | Insufficient data; currencies separated | T fixtures; S UI |
| Insights | Refresh customer insights | Enqueue supported experiments from real data | POST refresh-insights | E | Provider/budget status | S / Blocked |
| Insights | Import data; import-kind selection; file/pasted CSV; Import | Validate and store selected events/customers/accounts/spend/feedback | POST imports | Authorized E/C | Row validation, duplicate rejection; preserve text | T domain/event rules; live Blocked |
| Insights | Tracking setup; snippet/endpoint/secret fields | Create scoped tracking configuration, expose copyable setup | POST tracking | O | Requires backend; never fictitious success | S / Blocked |
| Insights | Customer journey disclosure; load more | Read explicit first-party linked events | POST journey | C | Missing/deleted events explained | T identity logic; S UI |
| Insights | Account funnel disclosure | Show actual linked account events | POST funnel | C | No inferred customer identities | S / Blocked |
| Insights | Customer export; download | Download audited scoped CSV | GET /api/export | C + X | Denial/no file on failure | T CSV rules; live Blocked |
| Insights | Delete customer; confirmation/cancel | Delete linked records, embeddings and derived data | POST delete-customer | Authorized O/C | Preserve other shared-device customers | T deletion regression; live Blocked |
| Settings | Workspace/Connections/Team/Governance tabs | Select settings panel | None | Any; actions gated | Disabled while submitting | S |
| Settings | Email input; email sign-in link | Supabase sends passwordless sign-in/registration link | Supabase Auth | Public | Provider error; duplicate submit blocked | S / Blocked SMTP |
| Settings | Continue with Google | Start provider OAuth and restore session | Supabase Auth | Public | Disabled until configured | S / Blocked Google setup |
| Settings | SSO domain; enterprise sign-in | Start configured SSO login | Supabase Auth | Configured tenant | Provider setup error | S / Blocked |
| Settings | Enroll authenticator; QR/secret; OTP verification | Enroll and verify TOTP | Supabase MFA | Signed-in user | Code/provider failure | S / Blocked |
| Settings | Sign out | Clear session only after supported sign-out response | Supabase Auth | Signed-in user | Error shown; no false successful reload | New source fix |
| Settings | Workspace name; Create workspace | Persist organization + owner membership | POST workspace | Signed-in user | Keep name; duplicate submit guarded | S / Blocked |
| Settings | Accept invitation(s) | Join matching unexpired invited memberships | POST workspace(accept) | Matching authenticated email | Expired/mismatch denied | T invitation DB; live Blocked |
| Settings | Active workspace select | Load chosen membership/workspace | /api/state/resources | Member of chosen workspace | Scoped records reset | T access; S UI |
| Settings | Monthly automation limit; Save | Persist owner spending limit | POST settings | O | Invalid limit rejected | T budget; live Blocked |
| Settings | Brand URL; Add brand | Persist normalized brand | POST brands | E | URL validation; input retained | S / Blocked |
| Connections | Connect [Instagram/YouTube/X/LinkedIn/Reddit] | Begin validated OAuth with state | POST connect; callback | O | Missing setup/access restrictions displayed | S / Blocked all providers |
| Connections | Destination/account settings; Save | Persist valid connected account settings | POST connection | O | Provider/validation notice | S / Blocked |
| Connections | Disconnect | Remove/revoke connection as implemented | POST connection | O | Provider failure/action notice | S / Blocked |
| Team | Invite email; role; Save invitation | Store expiring invitation | POST team | O | Owner-only/validation error | T database; live Blocked |
| Governance | Member role, brand access/assignments, customer/export permissions, approval stages; Save | Persist bounded member privileges | /api/governance(member) | O | Invariant/access denial | T permissions; live Blocked |
| Governance | Remove member / Transfer ownership; confirm/cancel | Offboard or atomically transfer ownership | /api/governance(member) | O | Preserve last-owner rule | T ownership; live Blocked |
| Governance | MFA, session duration, retention setting, stages, separation, approval expiry, emergency stop; Save policy | Persist workspace policy | /api/governance(policy) | O | Validate bounds; notice | T policy guards; live Blocked |
| Governance | Refresh operations; queue retry | Reload queue or retry permitted dead letter | /api/governance | O | Bounded attempts; no fake recovery | T command recovery; live Blocked |
| Governance | Freeze/unfreeze campaign | Persist freeze unaffected by worker payloads | /api/governance(freeze) | O | Server error notice | T freeze regression |
| Governance | Revoke approval / invitation | Invalidate future use | /api/governance | O | Protected terminal publication | T approval gates; live Blocked |
| Governance | Audit paging / details | Read scoped immutable operational history | /api/governance | O | Explicit failure notice | T immutable audit; S UI |

## Browser verification in this stage

Dedicated browser pass completed for the unconfigured shell: six mobile routes, Brand DNA at mobile/desktop sizes, disabled search with a connection message, disabled sign-in providers, settings Escape/focus restoration, and the missing-page dashboard recovery link. No console errors were returned for the six-route pass. See STAGE_VERIFICATION.md. Populated search/load-more, authenticated settings, role-specific workflows and provider side effects remain blocked pending staging credentials and fixtures. API tests explicitly mock only the service boundary; migration tests run actual SQL in disposable PGlite.

## Audit findings still requiring follow-up

Generic resource pagination now has a loading state and duplicate-click guard; failed background polling now shows a stale-status notice. Some destructive content/connection controls still need consistent user confirmation. Other endpoints expose raw error text and need the safe response contract used by resources. These are tracked findings, not claims that every interaction is complete.
