# How to — Business Profile Widget

Short recipes for common configuration tasks. Full property list: [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md).

---

## Map a value from the Account record

1. Find the **Field: …** property for that slot (for example **Field: city**).  
2. Enter a valid **Account** API path: single field (`BillingCity`) or dotted (`Owner.Name`).  
3. Apex validates the path against the Account schema; invalid paths are ignored for SOQL and may fall through to Flow if configured.

---

## Map a value from a Flow output

1. Set **Profile assembly Flow API name** to an **autolaunched** Flow.  
2. Add a Flow input for the **Account Id**; its API name must match **Flow record Id variable** (default `recordId`).  
3. In the **Field: …** property, enter **`flow:Your_Output_Variable_Api_Name`** (prefix `flow:` is required for Flow-sourced slots in the field map).  
4. Ensure that variable is assigned before the Flow finishes.

---

## Use one Flow for assembly and Insight

If **Profile assembly Flow API name** and **Autolaunched flow API name (predictions)** are the **same** API name, Salesforce runs the Flow **once** and reads both field-mapping outputs and prediction/recommendation outputs from that interview.

---

## Change themes and typography

- **Theme** lists **42** presets (obsidian default, banking/wealth families, etc.).  
- Override **Accent color** and optional text color overrides as needed.  
- **Text size (%)** and **Emphasis** match the Customer Profile Widget behavior.

---

## Hide tabs or sections

Use the **Show … tab** and **Show …** Boolean properties (org chart, key contacts, branch proximity, etc.). Unset or **true** means visible; set **false** to hide.

---

## Control the Pipeline opportunity list length

1. On the **Account** record page, select the **Business Profile Widget** in App Builder.  
2. Find **Pipeline: max open opportunities** (integer).  
3. Leave **0** (default) to load up to **2000** open opportunities for that Account (server hard cap).  
4. Set **1–2000** to cap how many rows Apex queries and the Pipeline tab displays (useful for very large books or lighter payloads).  

The Pipeline panel uses a **scrollable** area so long lists do not stretch the whole page.

---

## Turn off geocoding

Set **Geocode billing address for map** to **false**. Supply **Field: map latitude** / **longitude** from Account fields or `flow:` outputs.

---

[FLOW_GUIDE.md](FLOW_GUIDE.md) · [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)
