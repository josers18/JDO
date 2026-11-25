# Retail Today — prioritization and pulse milestone

Implemented November 13, 2026, on `design/retail-atlas-gap-closure`. This is the second implementation milestone in the [Retail gap-closure plan](../../superpowers/plans/2026-11-12-retail-atlas-gap-closure.md).

## Behavior

- **First move:** uses the current app's recent-recognized-browser (within 48 hours) preference, then the top captured Who-to-Call item. Recency is pinned to the capture timestamp, not the viewer's clock. The current capture's first move is Michelle S Foster, with her actual captured CSAT/stress/offer evidence. No live browsing is implied.
- **Ranked queue:** blends captured Who-to-Call, recognized browsing, recent bonus/tax-refund inflows and liquidity events with linked overdue tasks and open opportunities. It preserves the current score/severity rules, source-based/SLA act-by dates, top-eight cap and eligible liquidity reservation. All / Today / This week / Watch views share the selected-record inspector. A bounded list is not a book-level count.
- **Source and actions:** Why shows the actual score drivers; Quick view shows the source/date/reason. Prep, call and task proposals carry the exact Account. The customer Overview now receives source-linked Retail evidence instead of depending on the old blank-ID Retail signal examples. Preparation is authored from source context, not an AI response.
- **Snooze:** hides a recommendation in this browser session, persists over reload, and offers Restore. Queue snoozes refill from available captured candidates. It does not alter source records, dates or status. Snoozing every first-move candidate has an explicit restore state; unavailable evidence has a distinct message.
- **Portfolio pulse:** weekly net flow, multi-risk-driver customer count and open Lead history value. Drill-ins show the eight-week credits/debits/net series, attention definition and Prospecting. The latest completed week has $9,225.10 net flow, displayed as $9.2K. The 91 multiple-risk-driver customers are a different population/definition from the older persistent-stress count.
- **Pipeline:** remains directly below the hero. Pipeline now also offers dated total and stage history. These are reconstructed open amounts, not stage-transition events; stage history is for opportunities still open in the capture.

The prior service/task list is replaced with the ranked workspace rather than duplicated. The health/milestone band is compacted below it. Other personas retain their independent Today compositions and original pulse.

## Capture evidence and scope

Read-only verification returned **Cumulus Financial Services**, Organization `00Dam00000Uo32qEAB`. All new Data 360 queries use Kim Johnson's owner scope `005am000003PbFAAA0`; no org-wide fallback was used. Captures are committed in `retail-priority-data.js`, and the SQL is logged in `tests/retail-priority-capture.sql`.

| Source | Capture | Meaning and limit |
|---|---|---|
| Who-to-Call | 8 highest source scores | Current production CTEs: CSAT 30%, Gong 30%, stress 25%, offer 15%. This query initially returned an unsettled state, was polled to Finished, then fetched; it was not treated as empty. |
| Who-to-Call summary | 1,304 with any driver; 91 with two or more risk drivers | Independent owner-scoped aggregate, not a count of visible queue items. |
| Net flow | 10 returned weeks, last 8 retained | Same Personal-account query/window and truncation rule as `fetchNetFlow`; latest completed week starts Nov 2. Credits minus debits, not balances or returns. |
| UserGems liquidity | 8 examples; separate aggregate 10 customers | Source employer-departure/liquidity flag in a 180-day window. The queue considers up to three after covered-account dedupe, matching the current feed cap. No proceeds are assumed received. |
| Large inflows | 4 returned examples | Each customer's largest qualifying bonus/tax-refund credit in seven days, production query limit 8. A returned amount is a source transaction, not an offer or source-bank outflow. |
| CRM/Data 360 history | 56 metric/date rows | Eight dates for pipeline, open opportunities, cases, leads and currently open stage cohorts. End-of-date reconstruction follows current `historySql`, including its close-date approximation. The Nov 13 Lead value is reconstructed Data 360 history, not a newly fetched live CRM aggregate. |
| Opportunity probabilities | 6 existing source IDs, `done=true` | Fresh read-only CRM query, all six owned by Kim. Restores Probability absent in the old fixture, avoiding NaN ranking. The existing captured order/account names are retained. |

Recognized browsing and selected Task/Case records remain November 12 captures, with their dates intact. Missing probability evidence is excluded from ranking rather than assigned zero. Source failures are unavailable states, not empty/zero results. The local preview makes no live API calls.

## Deliberate identity and safety adaptations

The queue mirrors the current production formulas, with two identity adaptations: dedupe by exact AccountId + action (rather than name + action), and retain known Account/source IDs on opportunity-derived work. This avoids merging duplicate customer names or losing relationship context. Ordinary risk/opportunity/task scoring, ordering and due buckets are tested against the actual current production `buildPriorityQueue` implementation.

Future-dated browsing is not considered a recent visit. Session snoozing applies before the queue cut so available candidates can refill it. These are explicit mock workflow behaviors; they are not claims that the current production app already implements the same complete session workflow.

**Inherited source limitation:** the current Who-to-Call stress CTE aggregates High observations without enforcing its documented six-month window. The new read returned counts above six for some customers. The captured score is retained, but UI copy says High-stress observations instead of an impossible “7 of 6 months.” Correcting the production source calculation is separate work; the stress Health feed's own six-month aggregates are not replaced by this metric.

## Verification

- Nine priority-core tests passed: captured score/driver preservation, ID dedupe, reserved slot, date buckets, browsing precedence/staleness/future dates, snooze exclusions, signed net flow, missing probability, and comparison with the actual production blender including opportunity/task inputs.
- Six prior customer-context tests passed.
- New browser suite passed Today at 1512/1024/768/390px plus Wealth/Commercial isolation; tier/empty states, keyboard selection, Why/Quick View, exact-account prep/call/task defaults, source-preserving session snooze/reload/restore, all-snoozed and unavailable states, queue refill, customer evidence handoff, flow/attention/Lead/history drill-ins and stage selection. Recency override and source failures are simulated only in isolated test browser contexts, never saved to the user-facing data.
- The earlier Growth → customer → exact-product draft → Workbench suite passed after these changes, across two Retail customers and three viewport widths.
- No page errors, document-level horizontal overflow or non-GET browser requests in the new suite. Screenshots reviewed under `output/playwright/retail-priorities/`.

Commands and browser environment options are in [tests/README.md](tests/README.md). This is prototype verification, not production acceptance.

## Remaining work

Milestone 3 is business development: editable Lead source/value, real relationship-graph introductions, cross-sell reasons/movers/outcomes and needs cohorts. Broader independent AML/Gong/campaign/equity/stress/retention feeds are still covered by later signal work; the new queue does not claim complete production feed coverage. Live data, configured AI, actual writes/refetch, identity/View As, source retry and full theme configuration remain migration work. Production code and metadata are unchanged.
