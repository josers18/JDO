# Flow guide

The **Prediction Model** LWC does not include a Flow in source. You create an **autolaunched** flow in your org that returns a numeric prediction and two JSON-compatible collections (or strings) for drivers and recommendations.

---

## Contract overview

| Direction | Name in UI (configurable) | Typical Flow type | Purpose |
|-----------|---------------------------|-------------------|---------|
| **Input** | Flow input variable for record Id (default: `recordId`) | `Text` or `Record` Id input | Current record the prediction is for. |
| **Output** | Prediction variable (default: `prediction`) | `Number`, `Currency`, or assignable numeric | 0–100 style score shown on the gauge. |
| **Output** | Factors variable (default: `factors`) | `Text` (JSON string) or collection Apex can serialize | Top predictors list. |
| **Output** | Recommendations variable (default: `recommendations`) | Same | Suggested improvements list. |

In **Lightning App Builder**, set:

- **Autolaunched flow API name** → your flow’s API name (e.g. `Get_Account_Attrition_Score`).
- **Flow input variable for record Id** → must **exactly match** the flow input variable name (e.g. `recordId`).
- **Flow output: …** → must match the **output** variable API names your flow assigns.

The Apex controller passes:

```apex
inputs.put(recordIdVariableName, recordId);
```

and reads outputs with `interview.getVariableValue(predictionVariableName)` etc., with a small fallback for first-letter case differences.

---

## Building the flow (checklist)

1. **Create** → **Flow** → **Autolaunched Flow** (no screens).
2. Add an input variable for the record (recommended: `recordId`, type **Text** or compatible with Id).
3. Add your logic:  
   - Invocable Apex,  
   - Data Cloud prediction / Einstein,  
   - Subflow,  
   - HTTP (if allowed),  
   - etc.
4. Assign values to **output** variables that match what the LWC expects (`prediction`, `factors`, `recommendations` unless you rename them in App Builder).
5. **Save** and **Activate** the flow.
6. Ensure running users have **Run Flow** for this flow (profile / permission set).

---

## Prediction output

- The controller accepts **Decimal**, **Integer**, or coerces other types via string → Decimal.
- The LWC displays **rounded percent** (`Math.round(prediction)`).
- Keep values in a sensible **0–100** range for the gauge (values are clamped for arc length).

---

## JSON shape for `factors` and `recommendations`

The LWC parses **JSON arrays**. Each element is usually an object with:

- A numeric **`value`** (or `Value`) — impact used for sorting, bar length, and `+/-x.x%` display.
- Optionally **`fields`** — array of field metadata (Einstein / model explanation style).

### Recommended pattern (Einstein-style)

```json
[
  {
    "fields": [
      {
        "name": "Days_Since_Last_Login__c",
        "label": "Days Since Last Login",
        "inputValue": "120",
        "prescribedValue": ""
      }
    ],
    "value": 2.8
  }
]
```

- **Factors** (top predictors): often show current state in `inputValue`; sorted by **descending** `value`.
- **Recommendations**: often use `prescribedValue` for the suggested target; sorted by **ascending** `value` (more negative = stronger suggested improvement in default semantics).

### Simpler pattern (single name on item)

```json
[
  {
    "name": "Tenure_Months__c",
    "inputValue": "14",
    "value": -1.5
  }
]
```

If parsing fails or the value is not an array, the UI shows empty lists (no hard error).

### Double-encoded JSON

If the flow stores JSON as a **string** inside a Text variable, the LWC attempts a second `JSON.parse` when the first parse yields a string.

---

## Testing the flow alone

Use **Flow** → **Run** (debug) with a sample record Id, or call the flow from **Developer Console** / **Anonymous Apex** with `Flow.Interview` and verify output variables in the debug finish elements.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Blank widget, no error | `recordId` missing (wrong page type) or `flowApiName` empty. |
| Toast “Could not run prediction flow” | Flow API name typo, flow inactive, missing Run Flow permission, or flow fault. |
| Gauge works, lists empty | Output variable names mismatch; `factors`/`recommendations` not valid JSON array. |
| Wrong record | Confirm input variable receives current page’s record Id. |

---

## Next steps

- [PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md) — wire the AI summary to the same prediction outputs.
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — map every App Builder property.
