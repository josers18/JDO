# Flow guide

The **Multiclass Prediction** LWC does not include a Flow in source. You create an **autolaunched** flow in your org that returns a **text** class label and **recommendations** as JSON (no separate “factors” output).

---

## Contract overview

| Direction | Name in UI (configurable) | Typical Flow type | Purpose |
|-----------|---------------------------|-------------------|---------|
| **Input** | Flow input variable for record Id (default: `recordId`) | `Text` or `Record` Id input | Current record the prediction is for. |
| **Output** | Prediction variable (default: `prediction`) | **Text** (or assignable to text) | **Predicted class label** (e.g. `Wealth_Management`). Apex coerces non-string values with `String.valueOf`. |
| **Output** | Recommendations variable (default: `recommendations`) | `Text` (JSON string) or collection Apex can serialize | Suggested improvements list (same JSON array shape as the regression/classification sibling project). |

In **Lightning App Builder**, set:

- **Autolaunched flow API name** → your flow’s API name.
- **Flow input variable for record Id** → must **exactly match** the flow input variable name (e.g. `recordId`).
- **Flow output: prediction (text label)** and **Flow output: recommendations variable** → must match the **output** variable API names your flow assigns.

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

---

## JSON shape for `recommendations`

The LWC parses **JSON arrays** only for recommendations. Each element is usually an object with:

- A numeric **`value`** (or `Value`) — impact used for sorting, bar length, and `+/-x.x%` display.
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

Recommendations are sorted by **ascending** `value` (same bar semantics as the sibling prediction component; **Recommendations: treat positive % as good** can invert risk/good colors).

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
