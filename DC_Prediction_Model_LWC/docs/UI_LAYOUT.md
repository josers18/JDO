# UI layout — Prediction Model

How the **Prediction Model** component (`classificationModelLwc`) lays out the **main prediction** area depends on **Prediction output format** in App Builder (see [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)).

---

## Two presentation modes

| Format (`predictionOutputFormat`) | Main prediction UI | Container |
|-----------------------------------|--------------------|-----------|
| **`percent`** (default) or alias `classification` | Semicircle **gauge** (SVG arc), rounded integer + **%**, subtitle under the value | `.gauge-wrap` (fixed **170×170** px, centered) |
| **`integer`**, **`decimal`**, **`currency`** (aliases include `regression` → decimal) | **Metric panel**: large formatted number (`lightning-formatted-number`), prominent **caption** under the value | `.value-hero-panel` (**full width** of the component column, not limited to 170px) |

**Why two layouts:** The gauge exists only for 0–100% semantics. Regression-style outputs use a **wide KPI-style panel** so the value is not squeezed into the gauge column (which would make the number look disproportionately small).

---

## Percent mode (gauge)

- **Markup:** `div.gauge-wrap` → SVG (track + `.gauge-arc`) + `div.gauge-label` with score line and `span.score-sub`.
- **Behavior:** Arc length reflects clamped 0–100; color from `gaugeArcSolidColor` (HSL blend). Animation updates `stroke-dashoffset` only.
- **Subtitle:** **Gauge subtitle (under score)** — shown as `.score-sub` (small, uppercase-style tracking).

---

## Numeric mode (integer / decimal / currency)

- **Markup:** `div.value-hero-panel` → `div.value-hero` → `div.value-hero__amount` → `lightning-formatted-number`, then `span.value-hero__caption` for the label.
- **Panel:** Full-width card with light gradient background, border, radius, and subtle shadow so the prediction reads as the primary metric.
- **Number:** `lightning-formatted-number` is styled via the parent bundle CSS on the **custom element host** (large `font-size` using `clamp()` and **container query width** `cqw`, **font-weight 700**, tight letter-spacing). Locale and currency symbols come from the user’s org/locale.
- **Caption:** **Gauge subtitle (under score)** is reused as the metric label (e.g. “CSAT”, “Predicted revenue”) on `.value-hero__caption` — slightly larger and bolder than the old gauge-only subtitle for readability.

---

## Responsive behavior

- The shell (`.lwc-shell`) uses **`container-type: inline-size`** so font sizes can scale with the card width (`cqw` units).
- Narrow containers (`@container (max-width: 340px)`) reduce panel padding and slightly reduce the formatted-number size.

---

## Customizing appearance

- **Colors / arc / reverse:** App Builder properties (percent mode only for the arc). See [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md).
- **Structural or typographic tweaks:** Edit `classificationModelLwc.css` in this repo and redeploy. Avoid relying on shadow-DOM internals of `lightning-formatted-number` beyond host-level rules.

---

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md) — data flow and rendering notes
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — all properties
- [FLOW_GUIDE.md](FLOW_GUIDE.md) — what the flow returns for `prediction`
