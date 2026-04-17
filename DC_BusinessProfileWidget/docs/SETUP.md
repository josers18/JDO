# Setup — Business Profile Widget

After [DEPLOY.md](DEPLOY.md), complete these steps so the card loads for users.

---

## 1. Apex class access

The widget calls **`BusinessProfileWidgetController`**.

- **Option A — Standard profile (monorepo):** Deploy **`profiles/Standard.profile-meta.xml`** from this package (or deploy the whole `force-app`). It enables **all** JDO Apex classes used by these widgets—including **`*Test`** classes—on the **Standard** profile.  
- **Option B:** Edit a **permission set** or **profile** used by the page viewers and under **Apex Class Access** enable **`BusinessProfileWidgetController`**.

Without Apex access, the Lightning page may show an error when loading the component.

---

## 2. Remote site settings (map geocoding)

If **Geocode billing address for map** is **on** (default), the org needs the deployed remote sites:

- **Nominatim_OpenStreetMap**  
- **Photon_Komoot_Geocoder**

If geocoding is **off**, external callouts are skipped; coordinates must come from mapped fields or Flow.

---

## 3. Lightning page

1. Open **Lightning App Builder** on an **Account** record page (or create one).  
2. Drag **Business Profile Widget** onto the layout.  
3. Set **Profile assembly Flow API name** whenever any **Field: …** value uses **`flow:VariableApiName`** (required for Flow-backed slots; omit only if every mapping is a valid Account SOQL path). Map each property to either an Account path or `flow:…`. In Flow Builder, mark output variables **Available for output** so Apex can read them after `start()`.  
4. Optionally adjust **Pipeline: max open opportunities** (**0** = up to **2000** open opps; **1–2000** = explicit cap).  
5. Optionally set **Autolaunched flow API name (predictions)** for the Insight tab.  
6. **Save** and **Activate** the page.

---

## 4. Optional: Einstein summary

- Enable **Einstein Generative AI** per your org policy.  
- **Insight tab:** Create or choose a **prompt template** whose text input matches **Prompt template text input API name** (default `Input:Prediction_Context`). The payload includes `predictionType: business_profile` (see [PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md)).  
- **Overview Agentforce summary:** Set **Agentforce summary: prompt template ID** on the component. The same **`BusinessProfileWidgetController`** Apex access covers **`getAgentforceOverviewSummary`** (invoked automatically after **`getProfileData`** when auto-generate is on). Use an Account Record Snapshot–style template or equivalent with **Account** context; see [FLOW_GUIDE.md](FLOW_GUIDE.md) and [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if the summary is blank.

---

## 5. Smoke test

Open an **Account** that the running user can read. Confirm tabs load and mapped fields appear. If Insight is configured, check prediction and recommendations.

---

[HOW_TO.md](HOW_TO.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
