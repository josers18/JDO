# Flow guide — Business Profile Widget

All Flows must be **autolaunched** (no screens).

---

## Two Flow roles

| Role | App Builder settings | Behavior |
|------|----------------------|----------|
| **Profile assembly** | **Profile assembly Flow API name** + **Flow record Id variable** | Fills slots whose **Field: …** mappings start with **`flow:`**. SOQL fills other mapped slots from Account. |
| **Insight / prediction** | **Autolaunched flow API name (predictions)** + output variable names | Supplies **prediction** text and **recommendations** JSON for the Insight tab. |

---

## Field mapping: `flow:` vs Account path

The LWC sends a JSON object **`fieldMappingsJson`** to Apex. Each logical key (for example `fieldCity`) maps to a **string**:

- **`flow:VariableApiName`** — value is read from the assembly Flow interview after `start()`.  
- **Account field path** — validated with `validateAccountFieldPath` (e.g. `Name`, `BillingCity`, `Custom__c`, `Owner.Name`).  
- If the string is **not** `flow:` and **fails** validation, Apex treats it as a **legacy Flow variable name** (same as Customer Profile’s backward-compatible behavior for bare names).

The assembly Flow runs only when there is at least one mapping that **requires** Flow (a `flow:` token or a non-validating legacy name). If every mapped value is valid SOQL-only, the Flow is **not** started for field assembly (Insight may still use a separate prediction Flow).

---

## Assembly Flow inputs

- Pass the current **Account Id** into the variable named by **Flow record Id variable** (default `recordId`).

---

## Insight Flow

- Configure **Insight flow input: record Id** if it differs from the assembly input.  
- Default outputs: **prediction**, **recommendations** (override with **Flow output: …** properties).  
- Errors during merge are logged; the rest of the card still renders.

---

## Einstein summary

Optional **generateSummary** uses the same prompt input pattern as the Customer Profile Widget but sets **`predictionType`** to **`business_profile`** in the JSON payload. See [PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md).

---

[ARCHITECTURE.md](ARCHITECTURE.md) · [APEX_REFERENCE.md](APEX_REFERENCE.md)
