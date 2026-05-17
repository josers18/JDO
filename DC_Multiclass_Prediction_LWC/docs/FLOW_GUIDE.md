# Flow guide

The **Multiclass Prediction** LWC does not include a Flow in source. You create an **autolaunched** flow in your org that returns a **text** class label, **recommendations** as JSON (SHAP-style feature contributions), and optionally **per-class probability scalars** (one Flow variable per class).

---

## Contract overview

| Direction | Name in UI (configurable) | Typical Flow type | Purpose |
|-----------|---------------------------|-------------------|---------|
| **Input** | Flow input variable for record Id (default: `recordId`) | `Text` or `Record` Id input | Current record the prediction is for. |
| **Output** | Prediction variable (default: `prediction`) | **Text** (or assignable to text) | **Predicted class label** (e.g. `Wealth_Management`). Apex coerces non-string values with `String.valueOf`. **Optional** — if blank, the LWC's hero falls back to the highest-probability class from the per-class outputs. |
| **Output** | Recommendations variable (default: `recommendations`) | `Text` (JSON string) or collection Apex can serialize | SHAP-style feature contributions list (renamed in UI from "Suggested improvements" to "Feature contributions"). |
| **Output (N×)** | Per-class probability variables (CSV in App Builder) | **Number / Decimal** Flow scalar, one per class | Each variable holds a numeric probability between 0 and 1 for one class. The LWC reads each by name from the comma-separated list configured in App Builder. |

In **Lightning App Builder**, set:

- **Autolaunched flow API name** → your flow's API name.
- **Flow input variable for record Id** → must **exactly match** the flow input variable name (e.g. `recordId`).
- **Flow output: prediction (text label)** and **Flow output: recommendations variable** → must match the **output** variable API names your flow assigns.
- **Flow output: class probability variables (comma-separated)** → optional. List your per-class Flow variable names separated by commas, e.g. `Auto_Loans,Brokerage_Advisory,CDs,Credit_Cards,Wealth_Management`. Leave blank to hide the chart.

The Apex controller passes:

```apex
inputs.put(recordIdVariableName, recordId);
```

and reads outputs with `interview.getVariableValue(...)`, with a small fallback for first-letter case differences on variable names.

---

## Building the flow (checklist)

1. **Create** → **Flow** → **Autolaunched Flow** (no screens).
2. Add an input variable for the record (recommended: `recordId`, type **Text** or compatible with Id).
3. Add your logic (invocable Apex, Data Cloud prediction, subflow, etc.).
4. Assign the **predicted class** to a **Text** output (e.g. `prediction`).
5. Assign **recommendations** to an output that serializes to a JSON **array** (Text variable holding JSON, or a type Apex can `JSON.serialize`).
6. **Save** and **Activate** the flow.
7. Ensure running users have **Run Flow** for this flow (profile / permission set).

---

## Prediction output (text)

- The controller treats the prediction as a **label string**: `String` is trimmed; other types use `String.valueOf` then trim.
- The LWC can **humanize** the label for display (underscores and spaces split, words title-cased) unless **Humanize class label for display** is turned off in App Builder — then the exact flow string is shown.
- **Fallback:** when this output is blank or missing, the hero (and the chart's winner border) automatically use the highest-probability class from the per-class scalars.

---

## Per-class probability outputs (optional)

If your model emits a probability score per class (typical multiclass softmax output), expose each one as its own Flow scalar output variable, then list those variable names in App Builder under **Flow output: class probability variables (comma-separated)**.

### Example Flow setup

```
Flow output variables (Decimal):
  Auto_Loans            = 0.00
  Brokerage_Advisory    = 0.01
  CDs                   = 0.00
  Credit_Cards          = 0.00
  Deposits              = 0.00
  HELOC                 = 0.01
  Money_Market          = 0.00
  Personal_Loans        = 0.00
  Residential_Loans     = 0.00
  Savings               = 0.00
  Wealth_Management     = 0.99
```

### App Builder configuration

```
Flow output: class probability variables (comma-separated):
  Auto_Loans,Brokerage_Advisory,CDs,Credit_Cards,Deposits,HELOC,Money_Market,Personal_Loans,Residential_Loans,Savings,Wealth_Management
```

### What Apex does with these

The controller's `parseClassProbabilities` helper splits the CSV (trims tokens, drops blanks), reads each named variable from the Flow interview via the same case-tolerant `resolveFlowOutput` lookup used elsewhere, and coerces each value to `Decimal` through `coerceToDecimal`:

| Input type | Coercion |
|---|---|
| `null` | `null` (row still appears, sorts as 0) |
| `Decimal` | passthrough |
| `Double` | `Decimal.valueOf(String.valueOf(d))` — the `String` round-trip prevents binary-float artifacts (e.g. 0.7 staying 0.7, not 0.6999…) |
| `Integer` / `Long` | `Decimal.valueOf` |
| numeric `String` | `Decimal.valueOf(s)` (catches `TypeException`) |
| anything else | `null` |

Non-numeric / null values do **not** raise an error — that row simply renders with a 0% bar.

### Rendering rules

- Rows are **sorted descending** by probability; the admin-configured CSV order is the tiebreaker.
- Bar length is `scaleX(probability)` — absolute, scaled to 1.0 (a 0.99 bar fills 99%, not relative to the max).
- Bar color is `--wp-accent` from the active theme; opacity is `0.35 + 0.65 × probability`.
- The **predicted-class winner** row gets a 3px accent left border and a tinted background.
- Optional **top-N** toggle slices the sorted chart to the highest-N rows.

---

## JSON shape for `recommendations`

The LWC parses **JSON arrays** only for recommendations. Each element is usually an object with:

- A numeric **`value`** (or `Value`) — SHAP-style **contribution** used for sorting (**largest absolute impact first**), diverging **bar length** (relative to max \|value\|), and on-screen **±x.x** labels (**not** percentages).
- Optionally **`fields`** — array of field metadata (Einstein / model explanation style).

### Recommended pattern (Einstein-style)

```json
[
  {
    "fields": [
      {
        "name": "risk_tolerance__c",
        "label": null,
        "inputValue": "Aggressive",
        "prescribedValue": ""
      }
    ],
    "value": 317.61
  }
]
```

In the LWC, recommendations are sorted by **descending absolute `value`** so the strongest drivers appear first. **Recommendations: treat positive % as good** in App Builder controls which resolved color is used for **positive vs negative** contributions (and matches the **legend** dot colors).

### Simpler pattern (single name on item)

```json
[
  {
    "name": "total_account_balance__c",
    "inputValue": "45871.0",
    "value": -253.31
  }
]
```

If parsing fails or the value is not an array, the recommendations section shows “No recommendations returned.”

### Double-encoded JSON

If the flow stores JSON as a **string** inside a Text variable, the LWC attempts a second `JSON.parse` when the first parse yields a string.

---

## Testing the flow alone

Use **Flow** → **Run** (debug) with a sample record Id, or call the flow from **Developer Console** / **Anonymous Apex** with `Flow.Interview` and verify output variables.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Blank widget, no error | `recordId` missing (wrong page type) or `flowApiName` empty. |
| Toast “Could not run prediction flow” | Flow API name typo, flow inactive, missing Run Flow permission, or flow fault. |
| Class shows but lists empty | Output variable name mismatch for recommendations; invalid JSON array. |
| Raw API name instead of pretty label | Turn on **Humanize class label for display** or adjust flow to output display text. |
| Wrong record | Confirm input variable receives current page’s record Id. |

---

## Next steps

- [GIT.md](GIT.md) — clone path and DX project root
- [UI_LAYOUT.md](UI_LAYOUT.md) — class hero and recommendation rows
- [PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md) — wire the AI summary
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — map every App Builder property
