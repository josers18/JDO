# Changelog

All notable changes to **DC_Multiclass_Prediction_LWC** — the Salesforce DX project that ships the Multiclass Prediction LWC, supporting Apex, and permission set.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are grouped by date since the project is delivered as rolling demo metadata rather than a released library. Newest entries appear first.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![Updated](https://img.shields.io/badge/Updated-May_17_2026-2EA44F?style=for-the-badge)](https://github.com/josers18/JDO/commits/main)
[![Monorepo CHANGELOG](https://img.shields.io/badge/Monorepo-CHANGELOG-181717?style=for-the-badge&logo=github&logoColor=white)](../CHANGELOG.md)

</div>

---

## [2026-05-17]

### Changed
- Tinted the **predicted class hero** with `--wp-accent-bg` and a 3px `--wp-accent` left border so it visually anchors to the winning probability row across all 43 themes. Drops the prior neutral surface gradient. ([`c5e028e`](https://github.com/josers18/JDO/commit/c5e028e))

### Added
- **Top-N probability rows** — two new App Builder properties: `enableTopNClasses` (Boolean, default `false`) and `topNClassCount` (Integer, default `5`). When enabled, the sorted-descending chart slices to the top N highest-probability rows. Non-positive or non-numeric N falls back to "show all" so the chart never goes blank from a misconfig. The winner row is always visible since it's the highest-probability row. ([`d92095f`](https://github.com/josers18/JDO/commit/d92095f))

### Fixed
- **Hero falls back to top class** when the Flow's `prediction` output is missing/blank. New `resolvedWinnerApiName` getter is the single source of truth for both the hero label and the chart's winner row, so they stay in sync regardless of which Flow output supplied the value. ([`5d6b16d`](https://github.com/josers18/JDO/commit/5d6b16d))
- **Section labels** (`CLASS PROBABILITIES`, `CONTRIBUTING FACTORS`) bumped from 11px / weight 500 / `--wp-text-tertiary` (#999) to 12px / weight 600 / `--wp-text-primary` (#1a1a1a) so the sections are clearly delineated. ([`5d6b16d`](https://github.com/josers18/JDO/commit/5d6b16d))

---

## [2026-05-16]

### Added
- **Class probabilities chart** — new horizontal-bar visualization rendered between the predicted-class hero and the feature-contributions section. Bars use `--wp-accent` from the active theme with an opacity gradient (`0.35 + 0.65 × probability`); the winning row gets a 3px accent left border + tinted background. Sort is descending by probability with admin-configured CSV order as the tiebreaker. Percentages format as `99.0% / 1.0% / 0.0%`. ([`28c6372`](https://github.com/josers18/JDO/commit/28c6372), [`74b9157`](https://github.com/josers18/JDO/commit/74b9157), [`716945b`](https://github.com/josers18/JDO/commit/716945b))
- **Apex contract** — `MulticlassPredictionLwcController` adds a `ClassProbability` inner class (`apiName` + `Decimal value`), a `classProbabilities` field on `MulticlassResult`, and a 6th `String classVariableNamesCsv` parameter on `runPredictionFlow`. Two new `@TestVisible private static` helpers `parseClassProbabilities` (CSV → list, reading each Flow scalar via the existing `resolveFlowOutput` case-tolerant lookup) and `coerceToDecimal` (handles null, Decimal, Double, Integer, Long, numeric String, with `try/catch (TypeException)` on parse failure). ([`506fd79`](https://github.com/josers18/JDO/commit/506fd79))
- **App Builder properties** — `classProbabilityVariableNames` (String, comma-separated CSV of Flow scalar variable names) and `hideClassProbabilities` (Boolean, default `false`) added to all three `targetConfig` blocks (RecordPage, AppPage, HomePage). ([`1619d47`](https://github.com/josers18/JDO/commit/1619d47))
- **`prefers-reduced-motion: reduce`** safety net on `.prob-bar` — forces `scaleX(1)` so bars are visible even if the JS animation is suppressed. ([`36e3786`](https://github.com/josers18/JDO/commit/36e3786))
- **9 direct unit tests** for `coerceToDecimal` covering null, Decimal, Double-without-binary-noise, Integer, Long, valid numeric String, blank String, garbage String, unsupported type. Brings total Apex test count for this controller to 13. ([`3487e09`](https://github.com/josers18/JDO/commit/3487e09))

### Changed
- **`recommendationsSectionTitle` default** renamed from `"Suggested improvements"` to `"Feature contributions"` to better describe SHAP-style data. Existing component placements that override this title keep their custom value; un-overridden placements adopt the new label on next render. ([`1619d47`](https://github.com/josers18/JDO/commit/1619d47))

### Fixed
- **Apex Double precision artifact** — `Decimal.valueOf(Double)` produces binary-float noise (e.g. `0.7` becomes `0.6999...`). Routed through `Decimal.valueOf(String.valueOf((Double) value))` so values stay clean for the chart. ([`3487e09`](https://github.com/josers18/JDO/commit/3487e09))
- **Case-sensitive winner detection** — relaxed to `.trim().toLowerCase()` on both sides of the comparison so the LWC matches the Apex `resolveFlowOutput` casing tolerance. A Flow that returns `"auto_loans"` while the CSV says `Auto_Loans` still highlights the right row. ([`a2ad5fd`](https://github.com/josers18/JDO/commit/a2ad5fd))
- **`in` reserved keyword in Apex tests** — renamed local variables in 4 places (was breaking the deploy with `Expecting ';' but was: 'in'`). ([`e9278a7`](https://github.com/josers18/JDO/commit/e9278a7))
- **LWC1503 — Boolean `@api` defaults** — inverted `showClassProbabilities = true` (illegal per the LWC compiler rule that attribute presence flips the property to true) into `hideClassProbabilities = false`. Behavior unchanged: chart shows by default, admin checks the box to hide. ([`e9278a7`](https://github.com/josers18/JDO/commit/e9278a7))

---

## [2026-04 and earlier]

Initial release of the Multiclass Prediction LWC and `MulticlassPredictionLwcController` Apex (predicted class hero + diverging "Suggested improvements" chart + optional Einstein summary). For pre-May 2026 history see [git log on `main`](https://github.com/josers18/JDO/commits/main/DC_Multiclass_Prediction_LWC).
