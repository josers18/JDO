# AGENTS.md — Financial_KPI_Widget

Context for AI coding agents working on the **Premium Financial Overview** Lightning Web Component — a glassmorphic 3-tile KPI widget (Deposits / Loans / Investments) for FSC customer record pages, with animated count-up and hand-rolled SVG sparklines.

# Product context

A record-page LWC for **Account / Person Account / Contact** that replaces the stock FSC tile widget. Renders three glass cards — Deposits (green), Loans (amber), Investments (purple) — each with a primary metric, two sub-metrics, a 6-month sparkline, and a percent-change badge. Data sourced via two `@wire` Apex calls against `FinServ__FinancialAccount__c` and (optionally) `Account_Financial_Snapshot__c`. Flow-variable string overrides let demos short-circuit live data without code changes.

This is a **smaller, self-contained** project than the `DC_*_LWC` family — one LWC, one Apex controller, one test class. No shared theme system, no sibling parity contract.

# Tech stack

- **Apex** — `with sharing` controller; two `@AuraEnabled(cacheable=true)` reads. DTO inner classes (`FinancialMetrics`, `TrendData`) with every field `@AuraEnabled`. No throw sites — `cacheable=true` errors are surfaced via the wire `error` callback and reduced client-side.
- **LWC** — single bundle `premiumFinancialOverview`. Uses `@wire` (not imperative Apex) — different pattern from the `DC_*_LWC` family which is mostly imperative. Plain class fields for reactivity (no `@track`). RAF-driven count-up animation with `disconnectedCallback` cleanup.
- **No theming system.** Three CSS custom properties at `:host` (`--pfo-deposits`, `--pfo-loans`, `--pfo-investments`) drive the entire palette. No `--wp-*` token import; no inline THEMES map.
- **Salesforce DX** — `sourceApiVersion: 62.0`, `sf` CLI v2.

# Project structure

```
Financial_KPI_Widget/
├── force-app/main/default/
│   ├── classes/
│   │   ├── FinancialOverviewController.cls       ← 176 lines, two @AuraEnabled methods
│   │   └── FinancialOverviewControllerTest.cls
│   └── lwc/
│       └── premiumFinancialOverview/
│           ├── premiumFinancialOverview.js          ← 237 lines, @wire-pattern
│           ├── premiumFinancialOverview.html
│           ├── premiumFinancialOverview.css         ← `:host` CSS variables drive palette
│           └── premiumFinancialOverview.js-meta.xml ← 4 targets: RecordPage, AppPage, HomePage, FlowScreen
├── README.md                                     ← user-facing install + customization
└── sfdx-project.json
```

# Commands

```bash
# Deploy (run from project root)
sf project deploy start \
  --source-dir force-app/main/default/lwc/premiumFinancialOverview \
  --source-dir force-app/main/default/classes \
  --target-org <alias>

# Run Apex tests
sf apex run test \
  --class-names FinancialOverviewControllerTest \
  --result-format human --code-coverage --wait 10
```

**IMPORTANT:** Use `sf` (CLI v2). Deprecated `sfdx force:source:push`-style commands are flagged by the JDO repo guardrail.

# Architecture

```
Account / Person Account / Contact record page
   └─ App Builder properties:
         ├─ trendMonths (Integer, default 6)
         ├─ headline (String, optional)
         └─ override* string fields (10× — for Flow-variable demos)
   │
   └─ recordId (auto-populated)
        │
        ▼
LWC premiumFinancialOverview
   ├─ @wire getFinancialMetrics({ recordId: '$recordId' })   → reactive on recordId change
   ├─ @wire getTrendData({ recordId, months: '$trendMonths' })
   │
   ├─ effective getter — overrides win over Apex values
   ├─ kickoffCountUp() — RAF-driven 1.2s easeOut animation
   ├─ buildSpark() — pure-JS SVG path generation (M / L / Z)
   └─ disconnectedCallback() — cancelAnimationFrame
        │
        ▼
   Render: 3 glass cards, each with primary + 2 sub + sparkline + % badge
```

## Effective-value precedence

Each KPI has a string `@api override<Name>` property. The `pick()` helper parses the string (`parseFloat` after stripping non-numeric characters) and returns the parsed number when non-empty, otherwise the Apex value. Same pattern for trends with `parseCsv()` (comma-separated string of numbers). This lets the same component drive a record page (Apex live values) and a Flow screen (Flow-variable strings) without modification.

## Data contract

`FinancialOverviewController.getFinancialMetrics(Id recordId)` returns `FinancialMetrics` DTO with 7 `Decimal` fields. The controller computes:
- Deposits: `SUM(FinServ__Balance__c) WHERE FinancialAccountType IN ('Checking','Savings',...)`
- Loans: `SUM` of balance + interest, filtered to loan-type accounts
- Investments: `SUM(FinServ__Balance__c) + AVG(ROI)` for investment accounts

`getTrendData(Id recordId, Integer months)` returns `TrendData` DTO with 3 `List<Decimal>` series. Reads from `Account_Financial_Snapshot__c` if deployed; falls back to synthesizing month-over-month variations from the current totals.

# Conventions

## Apex
- `with sharing` on the controller. Two `@AuraEnabled(cacheable=true)` methods only — no DML, no callouts.
- DTO inner classes have every field `@AuraEnabled` (else they decode as `undefined` in JS).
- **No throw sites**: `cacheable=true` automatically routes exceptions to the wire `error` callback. The LWC has a `reduceError(error)` helper that handles `error.body` array vs. object vs. plain message shapes — that's the canonical client-side error-message reduction pattern.
- Account-type picklist values are `Set<String>` constants at the top of the controller. If your org uses different labels, edit those constants — they're the canonical customization point.
- ROI default: unweighted `(balance − deposited) / deposited × 100`. To switch to per-investment ROI, swap to `AVG(FinServ__RateOfReturn__c)`.

## LWC
- **`@wire` pattern, not imperative Apex.** Different from the `DC_*_LWC` family. Don't refactor to imperative — the `cacheable=true` round-trip is part of the data-load behavior (LWC dedupes wire requests across components).
- **`disconnectedCallback` MUST cancel `_rafId`.** A torn-down node + in-flight RAF will silently throw mid-frame. The pattern is correct as-is; preserve it when refactoring.
- **`@api` defaults must be primitive literals.** `trendMonths = 6` is fine; `trendMonths = computeDefault()` would not compile.
- **Boolean `@api` defaults must be `false`** (LWC1503) — same trap as everywhere else in the family. None currently in use; if you add one, invert the semantics or set `default="true"` in meta-xml.
- **String overrides are deliberately strings, not numbers.** Flow can only pass scalars; an empty string acts as the "use Apex value" sentinel. Don't change the type to `Number`.

## CSS
- Three `:host` custom properties (`--pfo-deposits`, `--pfo-loans`, `--pfo-investments`) drive the whole palette — including glows, dots, icon tints, and trend-arrow colors. Override on the parent or via App Builder `style` for theming.
- No `--wp-*` import — this widget is **not** part of the cross-component theme system. Don't add `--wp-*` imports unless explicitly bringing it into that family.
- No SLDS internal tokens (`--lwc-brandPrimary`) — LWC compiler rejects them.

# Testing

```bash
sf apex run test --class-names FinancialOverviewControllerTest \
  --result-format human --code-coverage --wait 10
```

Tests cover happy paths through `getFinancialMetrics` and `getTrendData` plus a synthetic-fallback case for `getTrendData` when `Account_Financial_Snapshot__c` doesn't exist or has no rows.

# Common mistakes

- **Treating this as part of the `--wp-*` theme family.** It's not. Theming is via three `:host` CSS custom properties only.
- **Refactoring `@wire` to imperative Apex.** The wire pattern is intentional — `cacheable=true` lets LWC dedupe and cache. Imperative would lose that.
- **Forgetting `@AuraEnabled` on DTO fields** when adding a new KPI — fields decode as `undefined` in JS without it.
- **Breaking the override-string contract** by typing `@api override*` as `Number`. Flow passes string scalars; the empty-string sentinel breaks if you type-narrow.
- **Boolean `@api foo = true;`** would fail LWC1503 — invert or use `default="true"` in meta-xml.
- **Not cancelling `_rafId` in `disconnectedCallback`** — the cleanup is correct as written; don't remove it.
- **For Contact record pages**, `WHERE FinServ__PrimaryOwner__c = :recordId` must change to `WHERE FinServ__PrimaryOwner__r.PersonContactId = :recordId`. FSC stores the PrimaryOwner as the Person Account, not the Contact.

# Related docs

- @README.md — user-facing install + customization
- @../FSC_Audit_Utilities/AGENTS.md — sibling FSC project; canonical reference for `FinServ__FinancialAccount__c` data contract and FSC managed-package quirks
- @../DC_BusinessProfileWidget/AGENTS.md — sibling FSC widget; uses imperative Apex pattern (contrast)
