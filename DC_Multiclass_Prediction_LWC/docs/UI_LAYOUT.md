# UI layout — Multiclass Prediction

How the **Multiclass Prediction** component (`multiclassPredictionLwc`) structures the card: **predicted class** (text), **class probabilities chart**, and **feature contributions** — no gauge, no numeric KPI panel.

---

## Main areas (top to bottom)

| Region | Markup / CSS | Notes |
|--------|----------------|-------|
| **Shell** | `.lwc-shell`, header with title + Refresh | Same shell pattern as sibling projects. |
| **Class hero** | `.class-hero-panel` → `.class-hero` → `.class-hero__label`, `.class-hero__caption` | Large **text** label (humanized or raw per App Builder). Empty state shows an em dash. Caption from **Subtitle under predicted class**. **Background** uses `--wp-accent-bg` with a 3px `--wp-accent` left border so the hero matches the winning probability row. **Hero falls back** to the highest-probability class when the Flow's `prediction` variable is blank. |
| **Class probabilities** | `.class-prob-section`, `.prob-row` (`.prob-row--winner` on top), `.prob-label-col`, `.prob-track`, `.prob-bar`, `.prob-pct` | One row per class. Sorted **descending** by probability. Bars use `--wp-accent` with an opacity gradient (`0.35 + 0.65 × probability`). Winner row gets a 3px accent left border + tinted background. See **Class probability chart** below. |
| **Feature contributions** | `.improve-section`, `.factor-row`, `.diverge-zone` | **Diverging** horizontal bars from a vertical center line; **SHAP-style** contribution scores (±x.x, **not** percentages). See **Diverging chart** below. |
| **Legend** | `.diverge-legend`, `.legend-item`, `.legend-dot` | "Supports prediction" / "Works against". Dot **background colors** are bound in JS to the same **risk / good** resolution as the bars (including **Recommendations: treat positive % as good**). |
| **AI summary** | `.agent-summary` | Optional; shown when a prompt template Id/API name is set. |

---

## Class probability chart

Renders below the hero and above the feature contributions when `classProbabilityVariableNames` is configured and `hideClassProbabilities` is unchecked. Each row (`.prob-row`) is a flex row with three children:

1. **Label column** (`.prob-label-col` → `.prob-label-text`) — humanized class name (or raw if **Humanize class label for display** is off). Capped at `min(14rem, 40%)` so the bar gets the dominant horizontal space.
2. **Track** (`.prob-track`) — fixed-height (18px) slot with a subtle gray background. Inside, `.prob-bar` is absolutely positioned and animated via `scaleX(probability)`.
3. **Percentage** (`.prob-pct`) — right-aligned, tabular numerals, e.g. `99.0%`, `1.0%`, `0.0%`.

**Winner emphasis:** the row whose `apiName` matches `resolvedWinnerApiName` (case-insensitive) gets `.prob-row--winner` — 3px `--wp-accent` left border and `--wp-accent-bg` background. The same accent backs the hero panel, so the winning class visually owns the top of the card.

**Top N (optional):** when `enableTopNClasses` is checked, the sorted chart is sliced to the top `topNClassCount` rows. Non-positive or non-numeric values fall back to "show all" — the chart never goes blank from a misconfig. The winner is always the first row, so it's always visible in any positive N.

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` forces `.prob-bar` to `scaleX(1)` (with `transition: none`) so bars are visible even if the `animateBars()` setTimeout doesn't run.

### Structure (Mermaid)

```mermaid
flowchart TB
    PR[prob-row]
    PLC[prob-label-col — class label]
    PT[prob-track — fixed height slot]
    PP[prob-pct — percentage text]
    PR --> PLC
    PR --> PT
    PR --> PP
    PT --> PB[prob-bar — scaleX animated, opacity weighted]
```

---

## Diverging chart (feature contributions)

Each row (`.factor-row`) is a flex row:

1. **Label column** (`.factor-label-col` → `.factor-label-text`) — Field / value text (`title` attribute carries full string for hover). Text **wraps** (no forced ellipsis); column width is capped with `max-width: min(22rem, 50%)` so the chart keeps space. **`flex: 0 1 auto`** so the column sizes to content up to that cap.
2. **Diverge zone** (`.diverge-zone`) — `flex: 1 1 0`, `min-width: 8.75rem`, fixed vertical slot for bars. Contains:
   - **Center axis** (`.diverge-center`) at 50%.
   - **Positive** values: `.bar-fill.bar-pos` growing **right** from center (`transform: scaleX` animated in JS).
   - **Negative** or zero: `.bar-fill.bar-neg` growing **left** from center.
   - **Value label** (`.bar-val` + `.val-pos` / `.val-neg`): white text with **text-shadow** for contrast on colored fills.

Rows are ordered by **descending absolute** `value` (strongest contributions first). Bar length is proportional to **|value|** within the row set (`barScale`).

### Structure (Mermaid)

```mermaid
flowchart TB
    FR[factor-row]
    LC[factor-label-col — wrapping label]
    DV[diverge-zone]
    FR --> LC
    FR --> DV
    DV --> AX[diverge-center at 50%]
    DV --> BP[bar-pos right / bar-neg left]
    DV --> BV[bar-val — contribution text]
```

---

## Typography and responsiveness

- The shell (`.lwc-shell`) uses **`container-type: inline-size`** so the class label can scale with card width (`clamp` + `cqw`).
- **Narrow card** (`@container (max-width: 420px)`): both `.factor-row` (feature contributions) and `.prob-row` (probability chart) become **columns** — label full width, **left-aligned**, then bar/track full width below (avoids squeezing labels beside the chart).
- **Very narrow** (`@container (max-width: 340px)`): hero and section label typography tighten; diverge center stays centered.
- **Section labels** (`CLASS PROBABILITIES`, `CONTRIBUTING FACTORS`) use 12px / 600 weight / `--wp-text-primary` so each section is clearly delineated.

---

## Customization

- **Structural or typographic tweaks:** Edit `multiclassPredictionLwc.css` in this repo and redeploy.
- **Bar colors:** App Builder **Default risk / good color** and optional recommendation overrides; legend dots use the same mapping via `legendSupportsDotStyle` / `legendAgainstDotStyle` in JS.
- **Host CSS hooks:** `--lwc-model-delta-risk` / `--lwc-model-delta-good` on `:host` remain available if you extend the bundle.

---

## Related

- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — all App Builder properties
- [ARCHITECTURE.md](ARCHITECTURE.md) — sequence, data flow, recommendation processing diagram
- [FLOW_GUIDE.md](FLOW_GUIDE.md) — JSON shape for recommendations
