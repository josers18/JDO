# Atlas Wealth — customer/workflow gap closure

November 13, 2026. Atlas is the selected Wealth design. This milestone closes the remaining captured-data customer/design gaps identified in `WEALTH_REMAINING_GAPS.md`; it does not claim an authenticated production cutover or executed CRM actions.

## Closed in Atlas

| Gap | Implemented result | Evidence |
| --- | --- | --- |
| Customer satisfaction | Relationship pulse and selectable observed CSAT history, individual recommendation response, date/previous-response change, source rating descriptions and exact-source follow-up. | 400 actual observations across all 73 captured households; eight maximum per Account. Source categories are not presented as customer quotations. |
| Prediction context | Separate predicted satisfaction, attrition and cross-sell source scores; actual digital-engagement/complaint/segment input context and source inspector. Observed scores, product conversion and predictions remain separate. | Current sources return one prediction/attrition record, for Julie. No causal feature weights or model run period were supplied; the UI does not fabricate them or reuse Julie for other households. |
| Money and Property | Grouped financial accounts, bounded transaction/execution workspaces, exact-row inspectors and filters; source mortgage/HELOC, equity/value, flood/wildfire and owner/renter controls. Broader external-assets/source-signal sections remain. | 79 financial accounts across 16 households; 180 transactions across 15; 730 trades across all 73; seven property observations. Zero/null and non-owner gates are tested. Balances are not mislabeled AUM. |
| Customer depth | Fresh exact-account details, CSAT, confirmed executions, Gong, screening and latest provider plans across the entire existing 73-household capture. Additional activity/notes/campaign/property domains queried for the same allowlist. | Fourteen source envelopes in `wealth-customer-evidence.js`, each with its scope/owner/allowlist and completion metadata. Source coverage is explicit; successful empty does not mean unqueried or unavailable. |
| Customer overview | Source-based household brief connecting observed care, provider planning, investable held-away, CRM goals, exact next-step actions and the preserved product/folio/financial views. | Julie, Anika and a third household tested with different actual source results; Draft provider plans do not become review priorities or CRM plans. |
| Review packet | Eight selectable evidence sections, tone, private questions, proposed prompt, deterministic packet preview, actual local HTML download and separate printable view. Native Notebook source notes remain separate. | Account-scoped persistence, fresh-source precedence, one paper/studio, downloadable artifact and printable window tested. No generated/sent/saved-to-CRM claims. |
| Cross-view continuity | Return to the exact finder, Capital paths or review origin with filters/selection. Finder return restores its internal scroll and the original Open control; unsafe return URLs are rejected. | Last-row/all-73 finder regression plus exact household/product/month and exact review return journeys. Browser Back/reload and original source editors remain covered. |
| Review coverage | Active/Stale source plans in the supplemental capture are reachable from directory/customer views. Native review/risk feeds retain their source keys when already present. | Supplement plans are merged before native feeds, Drafts excluded; staleness computed in Data 360. Independent book aggregates remain unchanged and separate from this worklist sample. |

## Read-only capture provenance

Target Organization `00Dam00000Uo32qEAB` (Cumulus Financial Services) was verified through the configured `jdo-oe0sdd` alias. The connected API verified advisor `005am000003PbCLAA0` and Julie's exact owner link. CRM Account queries used exact ID chunks of at most 50 and the same OwnerId predicate; all 73 returned under that owner. Financial-account query returned 79 rows and `hasNextPage=false`.

Data 360 SQL used only the existing verified query fields, the exact 73-Account allowlist and a strict owner subquery. Every query completed `ResultsProduced`; first-chunk length, returnedRows and query rowCount agree and remain below the 2,000 transport limit. Per-account history windows are explicit and do not claim full historical completeness. Query text and IDs are committed with the envelopes. SQL POST requests were read-only query transport; no CRM/configuration changes, model calls or deployment were performed.

## Real source limits

- `csatd` and `npsd` contain rating categories such as Poor/Detractor, not free-text customer verbatims.
- The prediction source supplies model output and input context, not signed feature contributions or a run timestamp.
- Some sources genuinely have narrow coverage or no qualifying rows. Missing property, predictions, source notes or campaigns are never filled from another household.
- Anika's external provider Draft remains separate from her absent captured CRM FinancialPlan/goals.
- The 73-household directory is still a subset of the original advisor book; this is not a newly implemented full-book live search.

## Runtime phase remains separate

Production GraphQL/Data 360 adapters and lifecycle, executed action receipts/refetch, authenticated ACC/grounding, full server theme/model configuration persistence, ordinary/restricted-user acceptance and deployment remain governed by `WEALTH_MIGRATION_CONTRACT.md`, `WEALTH_ACTION_CONTRACT.md` and the production migration plan. The actual ReactWealth/Apex implementation was not changed by this milestone. This explicit boundary supersedes any reading of “gap closure” as a production release claim.

## Verification

New suites: `wealth-customer-source.test.cjs`, `wealth-customer-studio.browser.cjs`, `wealth-money-studio.browser.cjs`, `wealth-review-packet.browser.cjs`, `wealth-context.browser.cjs`. Screenshots and reports are under the corresponding `output/playwright/wealth-*` folders. Existing Wealth journeys, source-edge final review, approved Capital paths, shell and persona-isolation suites form the preservation floor. Failed-source and phone-width inspection are tested separately from page-overflow checks.
