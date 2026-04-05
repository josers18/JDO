# Component reference — Multiclass Prediction

All properties are configured in **Lightning App Builder** when you select the **Multiclass Prediction** component (bundle `multiclassPredictionLwc`). Defaults below match `multiclassPredictionLwc.js-meta.xml` / `multiclassPredictionLwc.js`.

**Repository:** DX project `DC_Multiclass_Prediction_LWC` — see [GIT.md](GIT.md). **On-screen layout:** [UI_LAYOUT.md](UI_LAYOUT.md).

---

## Titles and labels

| Property | Type | Default | Meaning |
|----------|------|---------|---------|
| **Main card title** | String | `Model prediction` | Heading at the top of the card. |
| **Recommendations section title** | String | `Suggested improvements` | Heading above the recommendation rows. |
| **AI summary card title** | String | `Analysis summary` | Reserved; the summary block has no separate heading in the current markup. |
| **Subtitle under predicted class** | String | `Predicted class` | Caption under the large class label (e.g. “Product line”, “Segment”). |
| **Humanize class label for display** | Boolean | true | When true, underscores/spaces split and words are title-cased (`Wealth_Management` → `Wealth Management`). When false, show the exact string from the flow. |

---

## Flow wiring

| Property | Type | Required | Meaning |
|----------|------|----------|---------|
| **Autolaunched flow API name** | String | Yes (record page) | API name of the **active** autolaunched flow. |
| **Flow input variable for record Id** | String | No | Name of the flow input that receives the current record Id. Default: `recordId`. |
| **Flow output: prediction (text label)** | String | No | Flow output variable for the **text** class label. Default: `prediction`. |
| **Flow output: recommendations variable** | String | No | Flow output for recommendations JSON. Default: `recommendations`. |

There is **no** factors / top-drivers output in this component.

---

## Diverging bar semantics (recommendations)

Signed **contribution** values (for example SHAP scores) drive **diverging** bar direction (right vs left from center), **bar color**, and the **±x.x** value text (**no** percent sign). Rows sort by **largest \|value\|** first.

| Property | Default | Meaning |
|----------|---------|---------|
| **Recommendations: treat positive % as good** | false | **Unchecked:** positive contribution → **risk** color; negative → **good** color. **Checked:** invert. Same mapping drives the **Supports prediction** / **Works against** **legend** dots. |

**Section color overrides** (optional hex). If blank, **Default risk / good color** is used.

| Property | Meaning |
|----------|---------|
| **Default risk color** | Global risk-style color (`#D4537E` default). |
| **Default good color** | Global good-style color (`#1D9E75` default). |
| **Recommendations: risk color override** | Overrides default risk for recommendations only. |
| **Recommendations: good color override** | Overrides default good for recommendations only. |

---

## Theme (profile-aligned)

Same **preset names** and **CSS variables** as the profile widgets and **Prediction Model** (`--wp-shell-bg`, `--wp-accent`, etc.).

**Visual reference:** [Widget theme catalog (PDF)](assets/widget_theme_catalog.pdf) · [THEME_CATALOG.md](../../docs/THEME_CATALOG.md).

| Property | Default | Meaning |
|----------|---------|---------|
| **Theme** (`themeMode`) | `default` | **`default`** — original light card; other values match profile-widget theme picklist (obsidian … union). |
| **Show theme switcher in header** | false | Quick **O / M / G / I** preset buttons next to **Refresh** when true. |
| **Theme accent (optional)** | (empty) | Optional hex accent for dark presets. |
| **Theme warning / negative overrides** | meta defaults | Semantic token overrides. |
| **Summary & label text color (optional)** | (empty) | **`summaryAndLabelTextColor`** — GenAI summary, section title, recommendation row labels, legend text; blank uses theme default. |

**Source module:** `lwc/multiclassPredictionLwc/predictionThemes.js` — export **`THEMES`**. Maintain **parity** with `classificationModelLwc/predictionThemes.js` when editing tokens.

---

## Einstein / Prompt Builder

| Property | Default | Meaning |
|----------|---------|---------|
| **Prompt template Id or API name** | (empty) | If empty, the AI summary block is hidden and no LLM call is made. |
| **Prompt template text input API name** | `Input:Prediction_Context` | Must match a **flex text** input on the template (include `Input:` prefix if the template uses it). |
| **Auto-generate AI summary** | true | After a successful flow run, call the prompt with JSON context. If false, summary is not requested automatically. |

Prompt JSON shape: see [PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md).

---

## Record page object restriction

`multiclassPredictionLwc.js-meta.xml` lists allowed objects under `lightning__RecordPage`. Currently **Account** is listed. Add other `<object>` entries and redeploy to use the component on other record pages.

---

## Runtime requirements

- **recordId** must be provided by the page (standard on record pages). Without it, the flow does not run.
- **flowApiName** must be set in App Builder for the flow to run.
- **Refresh** (header button) clears errors/summary state, re-runs the flow, and—if a prompt template is configured and **Auto-generate AI summary** is not turned off—runs the summary again after a successful flow.

See [FLOW_GUIDE.md](FLOW_GUIDE.md), [PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md), [UI_LAYOUT.md](UI_LAYOUT.md), and [GIT.md](GIT.md).
