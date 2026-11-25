# Retail Atlas — customer and execution depth

Implemented November 13, 2026, on `design/retail-atlas-gap-closure`. Standalone design study; no production bundle/Apex changes, Salesforce writes or deployment.

[Open Mark S Smith](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=retail&page=relationships&client=001am00000qvjt7AAA&tab=overview&v=retail-customer-12). Relationships also has an entry to this deeper captured customer. In Workbench → Meetings, switch between recorded CRM history and the local planning calendar.

## What changed

- Overview connects the customer's finances, goals, conversations and preparation. Finances separates deposit, loan/card and other balances; financial-account drill-ins retain exact primary-owner and account IDs. The transaction ledger pages six of twelve captured rows, filters money in/out and preserves cents. Missing amounts stay unavailable and partial subtotals are labeled.
- Journey retains the existing Life events section and logging action, with richer native-plan goal progress. Goal create/edit/review includes type, priority, status, description, target/actual amounts and target date. Existing goals keep their FinancialPlan fixed. A new goal requires an exact captured plan; an unspecified amount is distinct from zero.
- Engagement has a selectable source conversation thread, recorded next steps, eight actual CSAT observations, individual 0–10 recommendation responses, task commitments, original assignees and service cases. Repeated source summaries remain visible rather than being silently deduplicated into invented unique conversations.
- Notebook shows recorded Event descriptions alongside private preparation. These descriptions are explicitly separate from saved Meeting Note source records. Private notes remain account-keyed and survive reload in the same mock session; follow-up drafts carry the exact Account.
- Campaign context has an explicit successful-empty state for this customer. Missing captures for other customers remain unavailable; no Wealth customer content is copied into Retail.
- Workbench Meetings separates recorded history from the new-meeting planning calendar. Recorded update/delete proposals never become planned appointments. Source Task/Event operations preserve original record, WhoId, WhatId and assignee. Task completion is a proposal to update the captured Task; Event deletion remains a local proposal. Workbench can reopen the full goal/activity editor.
- Contact-linked conversation follow-up retains both the exact Contact and Account. Changing Related To does not retain an unsupported source Account association. Source account ownership and activity assignment remain distinct.

## Read-only capture

Org reverified: Cumulus Financial Services `00Dam00000Uo32qEAB`; current banker scope Kim Johnson `005am000003PbFAAA0`. Primary customer: Mark S Smith `001am00000qvjt7AAA`, Contact `003am000008yOo0AAE`. Queries and response bounds are committed in `tests/retail-customer-capture.soql`, `.sql`, and `retail-customer-data.js`.

Kyle's initial CRM probe returned no financial accounts, plans, goals, tasks or Events for the queried relationships. Five existing Kim-owned customers with native financial plans were compared; Mark provides a coherent deeper example. This does not change Kyle's preserved offer/history workflow.

| Dataset | Evidence and limits |
|---|---|
| Account / financial accounts | Exact account and five financial accounts; CRM query completed below the 50-row cap. Balances are captured CRM values, not Data Cloud running flow or a net-worth calculation. |
| Plans / goals | One native FinancialPlan, three plan-linked FinancialGoals. Scope follows FinancialPlan.AccountId, not a nonexistent goal Account field. |
| Tasks / Events / cases | 14 Tasks, 21 Events, four cases. Queries completed below their caps. Latest Event is August 7; this is historical activity, not upcoming appointments. Activities are assigned to Jose Sifontes in the source despite Mark's current Kim-owned Account. |
| Transactions | Latest 12 Data Cloud transaction rows; a bounded sample, not a complete account statement or period cash-flow total. Credit/debit signs are derived from the source type, retaining the recorded magnitude and cents. |
| Conversations | Latest eight InteractionSummary rows, including repeated source wording/timestamps. Descriptions and next steps are recorded source statements, not newly generated advice. |
| CSAT | Eight monthly source rows, March–October 2026. Latest CSAT 56/100 and individual recommendation response 5/10. The latter is not aggregate NPS. |
| Property | Latest CoreLogic quarter October 1: renter, null property/equity values. CRM nevertheless has a mortgage account. UI calls out the source mismatch and withholds property/equity/HELOC claims. |
| Saved notes / campaigns | Successful empty results for Mark in the queried Data Cloud sources. Supplemental joins to current Kim-owned ingested Accounts also returned no rows; that join result is not proof that the bank has no campaign or note records. No fabricated notes, touches or referring person is shown. |

Source query contracts: Retail `src/personas/customer/full360DataReal.ts`; shared goal/task/schedule modal/types; `CrmWriteRest.cls`. Data Cloud queries completed with ResultsProduced and returned-row counts matching the result count. Source SQL LIMITs deliberately preserve bounded sample semantics; completion of a limited query does not prove full source coverage.

## Action contract and limitations

All changes are private local proposals. The current bridge supports Task/Event update and delete. Task completion uses update Status=Completed. Supported Task updates preserve subject, status, priority, due date, type, description, Related To and Assigned To. Supported Event updates preserve subject, UTC start time, type, description, location, ShowAs, Related To and Assigned To. WhoId is fixed during these updates. Event duration is shown read-only because the update handler does not write it. Dates edited in the recorded Event form explicitly use UTC and round-trip without local-time shifts.

Current create handlers support fewer fields than update handlers: Task create writes subject/description/priority/status/due/WhoId/WhatId; Event create writes subject/description/start/duration/WhoId/WhatId. They do not currently apply every owner/type/location/ShowAs field surfaced by the production modals. This milestone does not claim to fix that production limitation. Blank optional update fields mean leave the source value unchanged, as in the current bridge; deleting a field value needs a separate production contract.

An actual production execution must revalidate record identities, permissions, owner assignment and source freshness, then call the existing bridge and refetch after success. No such execution happens here. Complete book agenda retrieval, route/subview persistence and full backend migration remain later work.

## Verification

All 42 selector tests passed (11 customer/execution, 16 business, 6 customer-context, 9 priorities). The customer/execution, business, prior customer-context and Today browser suites passed without page errors or network writes.

Eleven new selector/contract tests cover exact owner/account scope, signed transactions and separate balance categories, partial/missing balances, fixed goal plan identity and full fields, zero actual amount, original source IDs/assignee, UTC round-trip, completion/delete operations, planner exclusion, successful-empty versus unavailable sources and Related To reassignment.

The customer browser suite checks the financial drill-in and exact cents; goal edits into Workbench; Contact plus Account follow-up; Task completion and Event update/delete proposals; original assignee; source-operation exclusion from the planning calendar; private-note persistence and account isolation; missing balance/note source states; Life event action retention; four widths (1512/1024/768/390); and Wealth/Commercial isolation. It rejects page errors, horizontal page overflow and network writes. Existing Today, business development and customer-offer browser suites are regression gates. Screenshots under `output/playwright/retail-customer/` are local artifacts.

Independent review findings addressed: retain Life events beside goals, label incomplete balance evidence, consult saved-note source status, and exclude source Event operations from the new-meeting planner. Production functionality remains separate from mock coverage.
