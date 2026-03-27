# Component reference — Prediction Model

All properties are configured in **Lightning App Builder** when you select the **Prediction Model** component (bundle `classificationModelLwc`). Defaults below match `classificationModelLwc.js-meta.xml` / `classificationModelLwc.js`.

**Repository:** DX project `DC_Multiclass_Prediction_LWC` — see [GIT.md](GIT.md). **On-screen layout** (gauge vs full-width metric panel): [UI_LAYOUT.md](UI_LAYOUT.md).

---

## Titles and labels

| Property | Type | Default | Meaning |
|----------|------|---------|---------|
| **Main card title** | String | `Model prediction` | Main heading above the prediction area (e.g. “Attrition Risk”). |
| **Top drivers section title** | String | `Top predictors` | Heading for the positive-impact / driver list. |
| **Recommendations section title** | String | `Suggested improvements` | Heading for the recommendations list. |
| **AI summary card title** | String | `Analysis summary` | Heading above the Einstein narrative block. |
| **Gauge subtitle (under score)** | String | `Prediction score` | **Percent mode:** small label under the score + **%**. **Numeric modes:** caption under the large formatted value (e.g. “CSAT”, “Predicted revenue”). See [UI_LAYOUT.md](UI_LAYOUT.md). |

---

## Flow wiring

| Property | Type | Required | Meaning |
|----------|------|----------|---------|
| **Autolaunched flow API name** | String | Yes (record page) | API name of the **active** autolaunched flow. |
| **Flow input variable for record Id** | String | No | Name of the flow input that receives the current record Id. Default: `recordId`. |
| **Flow output: prediction variable** | String | No | Flow output variable for the numeric score. Default: `prediction`. |
| **Flow output: factors variable** | String | No | Flow output for drivers JSON. Default: `factors`. |
| **Flow output: recommendations variable** | String | No | Flow output for recommendations JSON. Default: `recommendations`. |

---

## Prediction output (classification vs regression)

The flow still returns a single numeric **`prediction`** variable. These properties control how that number is **shown** (and what is sent to the AI summary JSON as `predictionOutputFormat`).

| Property | Type | Default | Meaning |
|----------|------|---------|---------|
| **Prediction output format** | String | `percent` | **`percent`** — 0–100 **gauge** + rounded integer + **%** (classification-style). **`integer`** — whole number, no gauge. **`decimal`** — fixed decimal digits, no gauge. **`currency`** — org-locale currency, no gauge. **Aliases:** `classification` → `percent`, `regression` → `decimal`. Unknown values fall back to `percent`. |
| **Currency code (ISO 4217)** | String | `USD` | Used only when format is **`currency`** (e.g. `EUR`, `GBP`). |
| **Min decimal places (decimal/currency)** | Integer | `0` | Clamped 0–8; ignored for `integer` and `percent`. |
| **Max decimal places (decimal/currency)** | Integer | `2` | Clamped 0–8; for `integer` and `percent` the effective max is 0. |

**Gauge colors** (bad/good arc, reverse) apply only when the format is **`percent`**. For other formats, there is **no arc**; the value is shown in a **full-width metric panel** with prominent typography (`lightning-formatted-number`, user/org locale).

**Gauge subtitle (under score)** labels the main value in **all** formats; in numeric modes it appears as the **caption** below the large number.

### Visual layout (summary)

| Format | DOM / CSS (for implementers) | Notes |
|--------|------------------------------|--------|
| `percent` | `.gauge-wrap` (170×170), SVG `.gauge-arc`, `.gauge-label`, `.score-sub` | Semicircle gauge + integer % |
| `integer`, `decimal`, `currency` | `.value-hero-panel`, `.value-hero`, `.value-hero__amount`, `lightning-formatted-number`, `.value-hero__caption` | Full column width KPI card; responsive `clamp` + `cqw` on shell container |

Details: [UI_LAYOUT.md](UI_LAYOUT.md).

---

## Delta / bar semantics (lists)

Model explanations often use signed **contribution** values (positive vs negative). These flags control which color is “good” vs “risk” for **bars** and **delta text**.

| Property | Default | Meaning |
|----------|---------|---------|
| **Top predictors: treat positive % as good** | false | **Unchecked:** positive delta → risk color; negative → good color (typical for “increase in risk”). **Checked:** invert. |
| **Recommendations: treat positive % as good** | false | Same for the recommendations section. |

**Section color overrides** (optional hex). If blank, **Default risk / good color** is used.

| Property | Meaning |
|----------|---------|
| **Default risk color** | Global risk-style color (`#D4537E` default). |
| **Default good color** | Global good-style color (`#1D9E75` default). |
| **Top predictors: risk color override** | Overrides default risk for that section only. |
| **Top predictors: good color override** | Overrides default good for that section only. |
| **Recommendations: risk color override** | Same for recommendations. |
| **Recommendations: good color override** | Same for recommendations. |

---

## Gauge (arc)

Shown only when **Prediction output format** is **`percent`** (or alias `classification`). Otherwise the main prediction uses the **metric panel** (no semicircle); see [UI_LAYOUT.md](UI_LAYOUT.md).

The arc is a **single stroke color** blended between two endpoints by score (0–100%) using **HSL** interpolation.

| Property | Meaning |
|----------|---------|
| **Gauge arc color (0% score — bad / risk)** | Hex for the **low-score** end of the semantic range (e.g. `#E74C3C`). If blank → **Gauge fallback: low / bad** → built-in red. |
| **Gauge arc color (100% score — good)** | Hex for the **high-score** end (e.g. `#1D9E75`). If blank → **Gauge fallback: high / good** → built-in green. |
| **Gauge: reverse arc colors** | **Unchecked:** 0% maps toward bad color, 100% toward good. **Checked:** swap (e.g. “high probability = bad”). |
| **Gauge fallback: low / bad color** | Used when arc bad color is blank. |
| **Gauge fallback: high / good color** | Used when arc good color is blank. |
| **Gauge (legacy — unused for solid arc)** | Reserved; mid color is not used for the current solid arc implementation. |

**Note:** Near **50%**, normal vs reversed modes look almost the same. Differences are obvious at very low or high scores.

---

## Einstein / Prompt Builder

| Property | Default | Meaning |
|----------|---------|---------|
| **Prompt template Id or API name** | (empty) | If empty, the AI summary card is hidden and no LLM call is made. |
| **Prompt template text input API name** | `Input:Prediction_Context` | Must match a **flex text** input on the template (include `Input:` prefix if the template uses it). |
| **Auto-generate AI summary** | true | After a successful flow run, call the prompt with JSON context. If false, summary is not requested automatically. |

---

## Record page object restriction

`classificationModelLwc.js-meta.xml` lists allowed objects under `lightning__RecordPage`. Currently **Account** is listed. Add other `<object>` entries and redeploy to use the component on other record pages.

---

## Runtime requirements

- **recordId** must be provided by the page (standard on record pages). Without it, the flow does not run.
- **flowApiName** must be set in App Builder for the flow to run.
- **Refresh** (header button) clears errors/summary state, re-runs the flow, and—if a prompt template is configured and **Auto-generate AI summary** is not turned off—runs the summary again after a successful flow.

See [FLOW_GUIDE.md](FLOW_GUIDE.md), [PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md), [UI_LAYOUT.md](UI_LAYOUT.md), and [GIT.md](GIT.md) for backend setup, UI structure, and repo layout.
