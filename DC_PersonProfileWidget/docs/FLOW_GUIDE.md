# Flow guide — Customer Profile Widget

This widget integrates with Salesforce Flow in **three independent ways**. They can share the same autolaunched Flow API name in some cases (see **Single interview optimization** below).

## Flow types at a glance

| Integration | Designer fields | Purpose |
|---------------|-----------------|---------|
| **Profile assembly** | `profileAssemblyFlowApiName`, `profileAssemblyFlowRecordIdVariable`, `[Asm flow output] *`, optional `profileFlowOutputMapJson`, `profilePhotoFlowOutputVariable` | Populate `ProfileResult` slots from Flow **output variables**; SOQL fills blanks. |
| **Prediction (Insight)** | `flowApiName`, `flowRecordIdVariable`, `flowPredictionVariable`, `flowRecommendationsVariable` | Insight tab headline + recommendations JSON/string; also feeds Einstein summary. |
| **AI Signals gauges (×3)** | `signalGauge1FlowApiName` … `signalGauge3FlowApiName` (+ record var + output var each) | Client calls `runSignalGaugeFlow` per gauge; numeric **prediction** output drives rings. |

All Flows must be **autolaunched** (no screens). The LWC passes the **current record Id** using the variable name you configure (default `recordId`).

---

## 1. Profile assembly Flow

### When it runs

Apex runs the assembly Flow when **all** of the following are true:

- Valid `recordId` (Account or Contact).
- Non-blank **`profileAssemblyFlowApiName`**.
- Non-empty **output map** built from `[Asm flow output] *` fields and/or **`profileFlowOutputMapJson`**.

If the map is empty, Apex skips the assembly Flow and uses **SOQL only** (plus optional prediction Flow).

### Inputs

- Create a Flow input variable (typically **Text** or **String** holding the record Id) whose API name matches **`profileAssemblyFlowRecordIdVariable`** (default `recordId`).
- Apex may pass a **second** record Id variable when assembly and prediction use the **same** Flow API name (see below).

### Outputs

Use **Assignments** (or formulas, Get Records, subflows) to set **output variables**. Map each widget **logical key** to the Flow variable’s API name:

- Per-slot: fill `[Asm flow output] Full name` with `MyFullNameOut`, etc.
- Advanced: **`profileFlowOutputMapJson`** as `{"fullName":"MyFullNameOut","email":"EmailOut"}`. Keys must be in the allowlist (see [APEX_REFERENCE.md](APEX_REFERENCE.md)). **Per-slot properties override** the same key in JSON.

**Special JSON-backed slots**

- **`nearbyBranches`**: Text (or collection serialized by Apex) containing a **JSON array** of objects. Supported keys include `name`, `distance`, `address`, `hours`, `status`, `assigned`. See [samples/nearby-branches.sample.json](samples/nearby-branches.sample.json).
- **`financialAccounts`**: Text JSON array for Portfolio account rows. Keys: `type`, `accountNumber` (aliases `number`, `mask`, `lastFour`), `balance`, `delta`, `deltaPositive`. See [samples/financial-accounts.sample.json](samples/financial-accounts.sample.json).
- **`mapLatitude` / `mapLongitude`**: Numbers (or text coerced to Decimal) for `lightning-map`. If missing and geocoding is on, Apex may geocode billing address.

**Photo**

- Map **`profilePhotoUrl`** via `[Asm flow output] Profile photo URL`, **`profilePhotoFlowOutputVariable`**, or JSON key `profilePhotoUrl`. Value must be `https://…` or an org-relative path.

### Merge after assembly

Apex builds a SOQL baseline, runs the Flow, then **`mergeEnrichFull`**: Flow values win; **empty** assembly fields are filled from CRM.

---

## 2. Prediction Flow (Insight tab)

### Configuration

- **`flowApiName`**: autolaunched Flow API name.
- **`flowRecordIdVariable`**: input variable for record Id (default `recordId`).
- **`flowPredictionVariable`**: output for headline text (default `prediction`).
- **`flowRecommendationsVariable`**: output for JSON string or serializable list (default `recommendations`).

### Error handling

Failures are **caught in Apex**; the rest of the profile still loads. Use **debug logs** if Insight is empty.

### Single interview optimization

If **`flowApiName`** equals **`profileAssemblyFlowApiName`** (case-insensitive), Apex starts **one** `Flow.Interview`, applies assembly outputs from the map, then reads prediction outputs from the **same** interview. Configure both sets of output variables on that Flow.

If the API names differ, prediction uses a **separate** interview (started once in `getProfileData` when there is no assembly Flow, or a second interview when only prediction is needed).

---

## 3. Signal gauge Flows (AI Signals tab)

Each gauge optionally calls its **own** autolaunched Flow via **`CustomerProfileWidgetController.runSignalGaugeFlow`** from the LWC (after `getProfileData` returns).

| Property | Role |
|----------|------|
| `signalGaugeNFlowApiName` | Blank → gauge uses profile **`propensityScore` / `engagementScore` / `churnScore`** from assembly/SOQL. |
| `signalGaugeNRecordIdVariable` | Flow input for record Id. |
| `signalGaugeNPredictionVariable` | Flow output; must resolve to a **numeric** value for the ring/center display. |
| `signalGaugeNOutputFormat` | `percent`, `integer`, `decimal`, `currency`. |
| `signalGaugeNRingScaleMax` | For non-percent formats: max value for a full ring arc. |

Gauge Flow failures surface as an error state on the ring (tooltip); they do not block the page.

---

## Authoring checklist

1. **Autolaunched** only; no screens.
2. Input variable name matches **Assembly** / **Prediction** / **Gauge** designer field.
3. Output variable API names match what you typed in App Builder (case matters for `getVariableValue`; Apex tries common variants for some paths).
4. For JSON slots, validate JSON in a text editor before pasting into Flow formulas.
5. Test with a real Account/Contact Id in Flow Debug before wiring the page.

**Related:** [samples/](samples/README.md) · [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
