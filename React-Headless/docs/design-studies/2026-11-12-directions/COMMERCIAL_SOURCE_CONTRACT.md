# Commercial Atlas source contract

This is a standalone, read-only design build, captured November 13, 2026. It changes no production bundle, Apex, bank record or external service record. Org `00Dam00000Uo32qEAB` is Cumulus Financial Services; the freshly queried active Commercial banker is Allen Carter, `005am000003PbFDAA0`. The Data 360 owner scope contains 5,630 Accounts. A limited SQL result is a sample, even when its response says `ResultsProduced`.

## Source and metric rules

| Value | Contract and presentation |
|---|---|
| PAYDEX | D&B supplier-payment observation. Higher values indicate more timely payment in the existing source contract. This is not a bank-loan repayment or covenant status. |
| Days beyond terms | D&B average supplier days beyond terms. The four payment bands independently aggregate the latest monthly source profile. They total 5,626 profiled companies, distinct from the 5,630-Account owner scope. No conclusion is drawn for the four missing profiles. |
| Failure score / supplier risk tier | Raw D&B fields remain separate. A tier is not a default probability. |
| Delinquency predictor | **Unresolved source disagreement:** `customerDataReal.ts` treats values >=50 as risk, while home comments and `commercialWhoToCall.ts` invert it as higher-is-safer. Show the raw predictor without assigning a new directional risk color. No production interpretation was changed. |
| Composite credit index | Current native SQL is `.5*(100-failure) + .3*(100-PAYDEX) + .2*(100-predictor)`. Preserve this captured input to the existing ranking; do not certify the disputed predictor meaning by repeating that formula. |
| Who-to-Call | Native credit/Gong/outlook/fees/offer weights are 30/25/10/20/15%. Eight captured rows, independently 5,614 companies scored and 179 with multiple risk drivers. Driver points and priority scores are not conversion probabilities. Source SQL does not retain each driver period, so the UI states capture time rather than inventing observation dates. |
| Gong | Call sentiment and deal-risk score remain source observations. A next call date is not a newly booked Event. |
| Moody's / BoardEx / MSCI | Outlook, leadership and ESG rating movement retain their native source fields, event dates and nullable prior values. Provider outlook and ESG observations are not lending/compliance decisions. |
| AML | Native source query admits qualifying Changed escalations or first New High/Severe screenings. Null prior rating remains null; it is not relabeled as Low. False/null flags are shown distinctly in raw evidence. No disposition is completed. |
| Treasury eligibility | Exact Account + action code; native rank, modeled conversion, expected value and channels. Grouped products choose lowest eligible rank, then highest EV. Open matching CRM holdings override acquisition scores. No eligible row is not proof of a need. |
| Offer history / movers | 1,007 actual Account/product/month history rows, May–November 2026. Missing history is unavailable. Native book-wide Rising/Falling queries preserve their own source thresholds and EV ranking; no synthetic points fill absent mover histories. |
| Grid outcomes | Independent live CRM aggregates: **0 open** grid Opportunities, null SUM(amount), **5 Won** in the captured 30-day window. Saving local proposals changes none of these. Existing-product Opportunity detection uses the current source's grid LeadSource and product-name prefix convention; it is not a verified Product2 relationship. |
| Pipeline | 3,412 live open Opportunities / $3,634,463,888.71, separate from the bounded 100-deal working sample. The 56-row native Data 360 history reconstructs eight weekly open snapshots; comparisons remain within that series. Stages cover currently open deals, not transition counts. |
| Business net flow | Credits minus debits from business financial transactions. Show the last eight completed weeks from ten returned weeks. Negative values are valid movement, not negative account balances. No percentage delta is inferred across signs. |
| Harmonic | Round size is reported funding, not verified cash available to move. Future funding dates stay future dates; native act-by clamping is a ranking policy, not evidence the event occurred. |
| Directed referrals / owner handoffs | Keep referrer, business, target person Account, graph confidence, discovered date and actual CRM WhoId distinct. Confidence is not consent, conversion or beneficial-ownership certification. A company name never manufactures a Contact. |
| ServiceNow | Source object `service_now_cases`, external reference and lowercase status remain distinct from Salesforce Case IDs. No external request is sent through a CRM Case editor. |
| ESRI | ZIP-level recommendation and matched-book count are market context. “Consolidate” is not an approved closure. Company ZIP membership was not captured, and the inspector says so. |

## Capture bounds and available depth

`commercial-data.js` assembles 684 exact Account records (673 owned by Allen; remaining linked graph/record context), 12 coverage companies including three reserved Corporate Card holders, and 240 distinct offer examples including native movers. Account name lookups were chunked at 50. The searchable directory is explicitly a bounded local snapshot of the larger book.

The dataset contains 100 open Opportunities, 32 Tasks, 31 Events, 32 CRM Cases and 20 Leads after exact-company supplements and ID deduplication. These are bounded working samples. Source Events preserve original Who/What/Owner and UTC timestamps. Recorded activities stay historical; a source Event change proposal never becomes a newly planned meeting.

Two exact-company provider dossiers were queried using `full360DataReal.ts` fields: Cameron-Olson Construction (`001am00002AAAvtAAH`) and Oliver-Leonard Industries (`001am00002AYRm2AAH`). Both returned ZoomInfo, BoardEx, MSCI and campaigns. Both returned **zero** SEC filing, interaction-summary and meeting-note rows. Cameron returned no transaction rows; Oliver returned 12. These are successful-empty responses, not error states or permission to borrow another company's data. Frye Supply (`001am00002AYRUaAAP`) provides an additional recorded execution context. FinancialPlan and plan-scoped FinancialGoal queries across all three returned zero rows; personal-owner goals were not borrowed. A separate fresh mixed-book query also verified four person Accounts, two personal FinancialPlans, six plan-scoped personal goals and twelve bounded personal milestones assigned to Allen. Activity & plans preserves these in an explicitly personal section, without linking them to companies or business ownership.

Fresh source query evidence is in `tests/commercial-source-capture.sql`, `commercial-cohort-capture.sql`, `commercial-history-capture.sql`, `commercial-source-capture.soql` and `commercial-identity-capture.soql`, `commercial-activity-fields-capture.soql` and `commercial-personal-context-capture.soql`. These are review artifacts, not startup commands. Metadata in the fixture preserves returned rows/completion for primary feeds; native SQL LIMITs and SOQL LIMITs remain bounded even if the transport reports completion. History's 1,501 sentinel bound returned 1,007; held-away's 201 bound returned 44. No authentication material is stored.

## Rulings

- Consolidate planned Commercial modules into `commercial-core.js` plus one `commercial-atlas.js` facade and stylesheet. Root owns guarded shared dispatch; this avoids parallel edits to Wealth/Retail integration while keeping persona content independent.
- Repair name-based queue deduplication to exact Account + action, and retain source Opportunity IDs on derived work. Native weights, scoring, caps and reserved market-slot behavior remain recognizable; unknown Opportunity probability is excluded rather than guessed.
- “Your first company check-in” uses the native Who-to-Call lead; the separate ranked worklist blends Tasks, Opportunities and market signals. Its selected detail always belongs to its highlighted row.
- Capture queries always use explicit owner/account scopes, never the shared helper's empty-book fallback. This is a capture policy only; changing production fallback requires a separate decision.
- Keep rank-derived `healthFor` / `healthDropFor` out of this mock. No invented observed health score, health delta or credit outcome substitutes for absent source history.
- Existing Case/Opportunity change proposals are explicitly **review-only** because the current bridge does not update those objects. Task/Event delete and supported updates remain local proposals. Event update duration is fixed to the source duration because the bridge ignores duration changes.
- Opportunity proposals leave amount for banker review instead of silently copying native model EV into a deal amount. Production must explicitly decide how to reconcile this design choice with the existing grid default.
- First-save and later Account reassignment clear incompatible offer/deal/source/graph provenance. Human notes remain editable text, never authoritative record links.
- Initial goal capture mistakenly requested `TargetValue`/`ActualValue`; it was rejected. The corrected current-source `TargetAmount`/`ActualAmount` query returned zero rows. Only the corrected result is presented.

The existing exact-Account Profile and Notes & tools/packet routes are retained through guarded fallback. Their older shared study components retain their dated November 12 source capture semantics; they are not relabeled as newly live integrations.

Runtime integration, permissions, Salesforce write success/refetch, authenticated Agentforce, configuration persistence and production theme storage remain unverified by this read-only mock.
