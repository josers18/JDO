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

- **`flow:VariableApiName`** — value is read from the assembly Flow interview after `start()`. The API name after `flow:` should match your Flow **variable** resource. Apex tries many **name variants** (exact, spaces→underscores, case changes, camelCase, `Interest_Expense`-style splits, and names with a trailing **`Var`** removed). The variable must be assigned **on the same autolaunched flow** that the widget starts (assign subflow outputs to **parent** variables if needed). In Flow Builder, ensure the resource is **Available for output** where required, or `getVariableValue` in Apex may return null even when the debugger shows a value inside a subflow. Currency and number outputs are parsed with the same rules as Account fields (including `$`, commas, and wrapped quotes in text values).  
- **Account field path** — validated with `validateAccountFieldPath` (e.g. `Name`, `BillingCity`, `Custom__c`, `Owner.Name`).  
- If the string is **not** `flow:` and **fails** validation, Apex treats it as a **legacy Flow variable name** (same as Customer Profile’s backward-compatible behavior for bare names).

The assembly Flow runs only when there is at least one mapping that **requires** Flow (a `flow:` token or a non-validating legacy name). If every mapped value is valid SOQL-only, the Flow is **not** started for field assembly (Insight may still use a separate prediction Flow).

**Agentforce summary (Overview)** — two options:

1. **Einstein prompt template (Account summary):** Set **Agentforce summary: prompt template ID** and **Agentforce summary: prompt text input API name** (default **`Input:Account.Id`**). The LWC calls **`getAgentforceOverviewSummary`** after **`getProfileData`** so Einstein runs in its own Apex request (same isolation as Execute Anonymous). On success, the returned text **overwrites** `agentforceSummary`. Turn off **Auto-generate Agentforce summary (Overview)** to skip the call on load.
2. **Flow or SOQL only:** Leave the prompt template ID blank and map **Field: Agentforce summary** to **`flow:YourTextVariable`** on the assembly Flow, or to an Account long-text field.

For **`flow:`** mappings, mark output text variables **Available for output**. The card appears above **Company** (separate from the Insight tab Einstein summary).

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

- **Insight tab:** Optional **`generateSummary`** uses the same prompt input pattern as the Customer Profile Widget but sets **`predictionType`** to **`business_profile`** in the JSON payload. See [PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md).  
- **Overview Agentforce summary:** Optional **Agentforce summary: prompt template ID** passes the **Account Id** only (default input **`Input:Account.Id`**). Use a dedicated summary template, not the Insight prediction JSON template unless you redesign it for Id-only input.

---

## Troubleshooting: liquidity waterfall Int. expense stays $0

1. **Profile assembly Flow API name** — If **Field: interest expense** is `flow:…`, the Lightning page property **Profile assembly Flow API name** must be the API name of the **same** autolaunched flow you debug (namespace prefix included if managed). If it is blank, Apex never runs the flow for field assembly; other rows can still populate from Account SOQL.
2. **Available for output** — Open the Flow → **Manager** → **Variables** → your output variable (e.g. `InterestExpenseVar`). Enable **Available for output** (Flow Builder wording may vary). `Flow.Interview.getVariableValue` in Apex returns null without this, even when the Flow debugger shows a value.
3. **Subflows** — Values assigned only inside a subflow are not visible on the parent interview. Add an **Assignment** on the **assembly** flow to copy the subflow output into a parent variable, then map `flow:` to that parent name.

The widget may show an orange hint under **Liquidity waterfall** when it detects a missing assembly flow or an unreadable Flow output.

[ARCHITECTURE.md](ARCHITECTURE.md) · [APEX_REFERENCE.md](APEX_REFERENCE.md)
