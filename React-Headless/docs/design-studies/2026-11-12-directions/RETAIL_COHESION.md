# Retail information architecture: prospecting vs customer growth

The user finds the standalone life-stage and lead/referral surfaces sparse and disconnected. Reorganize the work by its purpose, not by the dataset.

- **Prospecting** becomes a first-class Retail navigation destination for inbound leads/referrals. Use a compact, filterable lead worklist with a selected-record action inspector and source/status context. Integrate private follow-up preparation instead of a large generic narrative card. Today links into the same selected prospect. The source set is seven actual CRM Leads; do not imply that seven is a full-book total.
- **Growth** serves existing-customer opportunities. Life-stage mix becomes a persistent compact cohort selector beside the need/opportunity workspace; selecting a stage filters actual captured eligible customers and the probability grid. Keep the original needs explorer and history. Stop giving the standalone donut an otherwise-empty page.
- Keep source scopes separate: life-stage counts/average propensities are book aggregates, while offer probabilities are per-customer/product. Only filter customers using their actual latest Claritas stage; never infer individual membership from a cohort average.
- **Intelligence** remains the home for recognized browsing; **Life & goals**, **Relationships**, **Health**, and **Workbench** retain their current roles.

Atlas tokens remain iris #5548AD, ink #2C2C52, paper #FFFFFF, mist #E9E7F8, muted #60617E and line #DCDCEB. Use 17px working text and 14–15px metadata, compact spacing and a stable selection/action inspector. Density should come from real useful context and a tighter hierarchy, not tiny type or fabricated data.

## Implemented

Retail Atlas now has a primary Prospecting tab. Today prospect cards open the same selected Lead there. The page combines source filters, recorded status mix, searchable/status-filtered worklist, source/contact details, editable private preparation, and Lead-linked task/email drafts. Preparing a follow-up updates that Lead's inspector/worklist; it does not change CRM status or imply an outreach happened. Lead preparation avoids unrelated Account selection. Switching persona from this Retail-only destination returns to Today.

Growth uses a compact persistent life-stage selector next to the existing customer-needs explorer and probability map. Each cohort filters source-joined customer rows in both views. A native opportunity selector replaces a long card ribbon. Movement filters remain available where actual captured history exists, including Kyle's existing monthly series. Added source rows show actual baseline/with-outreach model comparisons and same-product cohort peers instead of invented history. The probability map is a separate view, not another long section appended below the explorer.

Intelligence retains recognized browsing. Life & goals retains the annual calendar and story cards. Relationships retains its search-led book finder. Production apps and Salesforce metadata are untouched.

## Data scope

Read-only capture on November 12, 2026, in Cumulus Financial Services (`00Dam00000Uo32qEAB`), Kim Johnson's owner scope (`005am000003PbFAAA0`). `retail-cohort-data.js` contains 99 native-product eligibility rows for up to three ranked customers per latest Claritas stage (14 customers), 15 joined life-stage profiles including existing Kyle, and 14 captured FinancialAccount rows (GraphQL `hasNextPage: false`). Original Kyle rows/history are retained, yielding 105 displayed scores across 15 sampled customers. Null-ranked scores may appear as evidence cells but are excluded from recommended needs. Eligibility run dates were not returned for the added rows and are not invented. Claritas profiles are dated November 1.

The selected cohort examples are not a full-book ranking or a replacement for production reserved-holder/movers rules. The 1,312-profile stage counts are independent owner-scoped book aggregates. Cohort averages are not customer probabilities. Prospecting displays seven selected real CRM Leads, with source counts 2 Employee Referral, 4 Web, 1 Existing Customer. Missing contact fields remain visibly unavailable.

## Verification

Browser checks passed for 42 layout/interaction/regression cases: Growth, every stage, map and Prospecting at 1512/1024/768/390px; source membership, referral/search/status filters, no-match/reset, source-linked draft creation and preparation persistence; evidence cell identity; Wealth/Commercial Growth isolation; Retail Today, Relationships, Life & goals, Intelligence, Health and Workbench route smoke checks. No page errors or document-level horizontal overflow in that matrix.

Additional checks passed for Today-to-Prospecting selected Lead continuity, pipeline remaining in the first desktop viewport, final draft review accepting the exact Lead WhoId, persona-switch fallback, retained actual Kyle history, and no non-GET browser requests during mock actions. Changed JavaScript files passed `node --check`. Screenshots reviewed under `output/playwright/retail-cohesion/`. These are local prototype checks, not production integration acceptance.
