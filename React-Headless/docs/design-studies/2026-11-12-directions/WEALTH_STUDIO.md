# Atlas Wealth visual scenes

`wealth-studio.js` decorates the existing Wealth facade after `wealth-atlas.js`. It replaces the main Pipeline, Plans & Goals, Review Horizon and Workbench scenes. Household detail, source forms, proposal preparation, search and native-style shell continue through the existing facade. This is a local captured-data design study, with no Salesforce writes.

## Design decisions

The four scenes have different working structures rather than identical panels:

- **Pipeline:** native stage value composition; household/opportunity search and stage filtering; keyboard-selectable close-date/value landscape; an exact-deal conversation inspector. The ordinate is explicitly logarithmic. The large Qualification segment reflects the captured stage amount; tiny stages are not artificially enlarged. All 25 labels remain in the selector.
- **Plans & Goals:** a compact grid calendar with a separate goal counter; illustrated education, career, home and family milestones; day selection and native month selection; CRM goal paths representing actual funding. Source Contact links and editable LifeEvent identities remain attached.
- **Review Horizon:** a compact book composition and native due/stale counts, probability/date landscape beside the selected review, then source worklist and provider assumptions. Review actions precede assumptions. On mobile, the selected review comes first. `reviewAccount=<exact AccountId>` and optional `reviewMode=risk|critical|due|stale` open a specific plan; the lens expands when necessary to show the requested captured account.
- **Workbench:** a preparation spine and review folio introduce the workflow; date-stamped source task rows, actual meeting calendar and selected commitment preserve source operations; service cases form native-status lanes containing all 12 captured cases; local proposals become paper-like review folios. No fabricated SLA, stage progression, scheduled meeting or successful write is implied.

Atlas keeps the SF Pro/system type stack and iris/lavender palette. Muted coral encodes below-50% planning success; lavender encodes 50–under-70%; green/gray distinguish actual source task statuses. Essential controls are at least 44px high with visible keyboard focus. SVG coordinates adapt on narrow screens, rather than simply shrinking desktop labels. The bounded deal and review lists scroll vertically within their workspaces; no horizontal customer carousel is introduced. Reduced-motion preferences suppress transitions.

## Source and operation contract

| Capability | Evidence and action |
| --- | --- |
| Pipeline total/count | Independent native `pipelineStages` aggregate; bounded open Opportunity list is labeled separately. Never infer the 231 aggregate count from the 149 captured open rows. |
| Deal selection | Exact Opportunity ID, Account ID, source stage/value/date. Follow-up proposal carries `opportunityId`, `opportunityAccountId`, `sourceAccountId`, `sourceKey` and `sourceKind=Opportunity`. If the captured Account is absent from lookup options, the exact ID is added explicitly rather than silently dropped. |
| Review composition | `planSignals_summarySql`. The remainder after native at-risk count is labeled **Outside attention tier**, since a non-risk count does not prove known success of 70% or more. |
| Review selection | `planSignals_reviewRowsSql` / `planSignals_atRiskRowsSql` retain their actual dataset. A selected at-risk row proposes a meeting with the at-risk dataset as provenance. |
| Goal funding | CRM goals are scoped by `FinancialPlan.AccountId`; no provider plan total is substituted for actual CRM funding. Missing actual/target amounts remain unavailable. |
| Life events | Native LifeEvent IDs and PrimaryPerson/Contact links; existing source edit/create handlers retained. Actual historical dates are never moved into the future for presentation. |
| Tasks, meetings, drafts | Existing source worklist, selected commitment, forms and local-draft handlers retained. Native Who/What/Owner links, null source links and UTC meeting instants remain under the existing operations contract. |
| Service cases | All captured cases grouped by their native `Status`. Read-source buttons retain exact Case IDs. Counts describe the deep-household sample, not the entire book. |
| Shell | View-as, multi-object search, waffle, bell, avatar/admin/setup/Data Cloud links are outside this decorator and remain intact. |

Some opportunities have exact Account IDs but no captured Account name; these display an explicit linked-record suffix with the full ID in source details. Some plan records have no next-review date and are retained in the worklist but excluded from the dated plot. The opportunity plot shows a deduplicated sample of the 12 largest plus 12 earliest-close captured deals; exact source fields are in the inspector and the search/list. Missing records are not represented as zero. Captures are dated snapshots, not refreshed feeds; proposals are private local preparation.

## Verification

`tests/wealth-studio.browser.cjs` exercises native stage filtering, empty search, keyboard point selection, exact source Opportunity proposals including an Account absent from the visible dictionary, risk-dataset provenance, review deep links, Contact-linked milestone editing, month/day reset, unchanged source Event instants, local proposals, case actions, and overflow checks at 1512/1024/768/390. Browser requests are checked for non-GET writes and page errors. Screenshots cover all four scenes at 1512/390 plus task, meeting and draft subviews at 1512. Evidence is written to `output/playwright/wealth-studio/`.

Run using the existing local Playwright module / Chromium paths and the preview on port 5187. Visual inspection found and corrected a mobile flex-shrink overlap missed by document overflow checks, a stage-width readability floor that distorted amount proportions, an overly tall full-width Review Horizon chart, and tiny mobile chart coordinates.
