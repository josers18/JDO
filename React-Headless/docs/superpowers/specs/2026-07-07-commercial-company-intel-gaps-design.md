# §2 Data Gaps, Round 2 — Commercial Company Intel + Delinquency Watch

**Date:** 2026-07-07
**Scope:** `ReactCommercial` UI bundle only.
**Depends on:** merged PR #16 (`3527645b`); the CoreLogic Property tab (`0b53932e`) is the reference pattern.

## Goal

Wire the remaining §2 data-inventory gaps that this org actually has data for, into the
Commercial cockpit. Chosen gaps: ZoomInfo firmographics, BoardEx exec intel, SEC filings,
MSCI ESG, and loan delinquency.

## Live-schema findings (probed on jdo-1lrnov / storm-16a17dc388fbe6, 2026-07-07)

These correct two guesses in `docs/customer-360-inventory-and-gaps.md`:

1. **MSCI ESG is corporate-entity ESG, not per-holding.** Omega (`001am00000qvjs6AAA`) has a
   row; the Wealth person account Jennifer (`001am00002AYR5KAAX`) has **0 rows**. So MSCI is a
   *Commercial* signal in this org, not a Wealth-holdings one.
2. **Loan delinquency is not customer-joinable.** All 750 rows in `Loan_Delinquencies__dlm`
   belong to one synthetic FinancialAccount (`a4l5f000000JMR4AAO`) with random borrower names.
   It can only be a **book-level aggregate**, not a per-client 360 tile.

Omega has clean rows for ZoomInfo, BoardEx, and SEC — verified.

### DMO columns and join keys (verified)

| DMO | Join key | Columns used |
|---|---|---|
| `CumulusZoomInfoFirmographics__dlm` | `ssot__AccountId__c` | `revenueBand__c`, `employeeBand__c`, `industryNaicsCode__c`, `industrySicCode__c`, `foundedYear__c`, `websiteDomain__c`, `hqStateCode__c`, `hqCountryCode__c`, `linkedinFollowers__c`, `techStackFlags__c`, `profileMonth__c` |
| `CumulusBoardExExecIntel__dlm` | `ssot__AccountId__c` | `boardSize__c`, `ceoTenureYears__c`, `boardAvgTenureYears__c`, `governanceRating__c`, `keyDirectorName__c`, `interlockCount__c`, `execTurnoverFlag__c`, `recentGovernanceEventDate__c`, `profileMonth__c` |
| `CumulusMSCIESG__dlm` | `ssot__AccountId__c` | `esgScoreOverall__c`, `environmentalScore__c`, `socialScore__c`, `governanceScore__c`, `msciEsgRating__c`, `carbonIntensityTonsPerMRevenue__c`, `controversyFlagCount__c`, `topControversyCategory__c`, `lastRatingChangeDirection__c`, `industryClassification__c`, `profileMonth__c` |
| `SEC_Filings__dlm` | `accountid__c` | `filingtype__c`, `section__c`, `section_text__c`, `uniqueid__c` |
| `Loan_Delinquencies__dlm` | (book only — not account) | `delinquency_status__c`, `loan_balance__c`, `recovered_amount__c`, `recovery_status__c`, `uniqueid__c` |

Snowflake text (SEC `section_text__c`, controversy names) arrives HTML-entity-encoded
(`&quot;`, `&#39;`, `&amp;`, `&lt;`) — reuse the existing `decode` helper in `full360DataReal.ts`.

## Design

### 1. New "Company Intel" tab on the Commercial 360

The four corporate signals (ZoomInfo, BoardEx, MSCI ESG, SEC) describe the *same business
entity*, so they live together as one tab, mirroring how the Property tab was added.

Tab position: insert `'Company Intel'` into `FULL_TABS` in `Full360Tabs.tsx` (after `Property`).
Renders four cards, each null-safe:

- **Firmographics** (ZoomInfo) — revenue band, employee band, industry (NAICS/SIC), founded
  year, HQ, website, LinkedIn followers, tech-stack chips.
- **Board & Governance** (BoardEx) — board size, CEO tenure, avg board tenure, governance
  rating badge, key director, interlock count, exec-turnover flag.
- **ESG** (MSCI) — overall score + rating badge, E/S/G sub-scores (small bars), carbon
  intensity, controversy flag count + top category.
- **SEC Filings** (SEC) — list of 10-Q sections; each row expandable to show decoded
  `section_text`. Grouped by `filingtype`.

If **all four** are null (non-business account), the tab shows a single graceful empty state.

### 2. Types (`full360Types.ts`)

New interfaces + three new nullable fields on `Full360`:

```ts
export interface Firmographics {
  revenueBand: string; employeeBand: string; industryNaics: string; industrySic: string;
  foundedYear: number; website: string; hq: string; linkedinFollowers: number;
  techStack: string[]; asOf: string;
}
export interface Governance {
  boardSize: number; ceoTenureYears: number; boardAvgTenureYears: number;
  governanceRating: string; keyDirector: string; interlockCount: number;
  execTurnover: boolean; recentEventDate: string; asOf: string;
}
export interface EsgProfile {
  overall: number; environmental: number; social: number; governance: number;
  rating: string; carbonIntensity: number; controversyCount: number;
  topControversy: string; ratingChangeDirection: string; asOf: string;
}
export interface SecFiling {
  filingType: string;
  sections: { id: string; section: string; text: string }[];
}
// on Full360:
firmographics: Firmographics | null;
governance: Governance | null;
esg: EsgProfile | null;
secFilings: SecFiling[]; // empty array when none
```

### 3. Real fetcher (`full360DataReal.ts`)

Add four `queryDataCloud` calls to the existing `Promise.all` batch (same `rows()` +
`resolve('core', …)` machinery already there). Map results to the new fields; all default to
`null` / `[]` when no rows. SEC rows group by `filingType` into `SecFiling[]`; decode
`section_text`. No new join logic — every key is already established.

### 4. Mock (`full360Data.ts`)

Provide representative Omega-shaped mock values for all four so the dev/mock harness renders
the tab fully (parity with how Property/Plan were mocked).

### 5. Loan Delinquency Watch — Commercial Home book panel

Because delinquency is not client-joinable, it is an **aggregate book metric**, surfaced on the
Commercial *home* dashboard, not the 360.

- `homeTypes.ts`: `DelinquencyWatch { totalDelinquentBalance; totalRecovered; byStatus: {status; count; balance}[]; asOf }`, added as an optional field on the Commercial home dashboard type.
- `homeDataReal.ts` (Commercial): one `queryDataCloud` — `SELECT delinquency_status__c, COUNT(uniqueid__c), SUM(loan_balance__c), SUM(recovered_amount__c) … GROUP BY delinquency_status__c`.
- `homeData.ts`: mock aggregate.
- `HomePage.tsx` (or the Commercial home layout): a compact "Delinquency Watch" panel —
  headline delinquent balance + a small status breakdown (60/90 days late, recovery status).
  Rendered only when the field is present.

## Files touched (ReactCommercial only)

```
src/personas/customer/full360Types.ts      (+4 interfaces, +4 fields)
src/personas/customer/full360DataReal.ts    (+4 DC queries, +mapping)
src/personas/customer/full360Data.ts        (+mock values)
src/personas/customer/Full360Tabs.tsx       (+CompanyIntelTab, +tab entry)
src/home/homeTypes.ts                        (+DelinquencyWatch)
src/home/homeDataReal.ts                     (+delinquency aggregate query)
src/home/homeData.ts                         (+mock)
src/home/HomePage.tsx                        (+panel, render-if-present)
```

## Non-goals / deliberately excluded

- **Retail/Wealth bundles** — no business data for these demo accounts; unchanged.
- **Wealth per-holding ESG** — no per-holding MSCI data exists in this org.
- **Agentforce interaction history** — no clean per-account join (IndividualId=NOT_SET).
- **Moody's, Esri geo** — 0 rows for available demo accounts (deferred).

## Verification

- `npm run build` + `npm run lint` green in ReactCommercial.
- Deploy ReactCommercial (content-only redeploy; no metadata change).
- In-org verify via `browser_evaluate` on Omega 360 (`/app/c__ReactCommercial/client/001am00000qvjs6AAA`):
  Company Intel tab shows firmographics/governance/ESG/SEC; Commercial home shows Delinquency Watch.
- Confirm empty-state grace on a non-business account (e.g. Julie) — tab renders empty, no crash.
