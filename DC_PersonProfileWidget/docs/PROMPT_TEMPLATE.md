# Einstein prompt templates — Customer Profile Widget

**Audience:** Admins setting up **Einstein** / **Prompt Builder** for the widget.

**Prerequisites:** Generative AI features enabled per your Salesforce agreement; users can run the widget’s Apex; **Prompt templates** exist with the right input names.

This widget can use **two independent** Einstein integrations:

| Feature | App Builder focus | Apex method | Payload |
|---------|-------------------|-------------|---------|
| **Insight tab** summary | **Prompt template Id or API name** (Insight) + **Auto-generate AI summary** | **`generateSummary`** | JSON string: `prediction`, `predictionType`, `recommendations` (see below) |
| **Overview Agentforce** inset (above **Contact**) | **Agentforce summary: prompt template ID** + optional input API name + **Auto-generate Agentforce summary** | **`getAgentforceOverviewSummary`** | **Contact:** **`Input:Contact.Id`** + **`Input:Contact`** (and parity variants). **Account:** **`Input:Account.Id`** + **`Input:Account`**. Not the Insight JSON. |

Overview templates should follow **record / Record Snapshot** patterns (same family as **Business Profile** Account overview). See [APEX_REFERENCE.md](APEX_REFERENCE.md) and [DC_BusinessProfileWidget/docs/PROMPT_TEMPLATE.md](../../DC_BusinessProfileWidget/docs/PROMPT_TEMPLATE.md).

---

## What happens — Insight tab (`generateSummary`)

When **Prompt template Id or API name** is set and **Auto-generate AI summary** is left on, the widget asks the server to run **`generateSummary`**, which calls Salesforce’s **Einstein Prompt Template** API with a small JSON payload.

---

## JSON sent to your template (one text input)

The template should expose a **text**-type input. By default its API name is **`Input:Prediction_Context`** (you can change the widget property **Prompt template text input API name** to match your template).

The value is a **single JSON string** shaped like:

```json
{
  "prediction": "<text from the Insight prediction line>",
  "predictionType": "person_profile",
  "recommendations": "<string — often a JSON array; if empty, '[]'>"
}
```

| Field | Meaning |
|-------|---------|
| **prediction** | Usually from your **Insight Flow**; may be empty if you do not use one. |
| **predictionType** | Always **`person_profile`** so one template could support multiple use cases. |
| **recommendations** | Same content as the widget’s recommendations string; if missing, the server sends **`[]`**. |

---

## Writing good template instructions

1. Tell the model it will receive **JSON** with `prediction`, `predictionType`, and `recommendations`.  
2. Ask for a **short** summary suitable for a sidebar (for example **2–4 sentences**).  
3. If **recommendations** is a list of objects, ask for consistent field names (`title`, `detail`, `action`, etc.) so the on-screen list stays readable (the UI maps several common field names).

---

## If something fails

- **Wrong template Id** or **wrong input API name** → error text may appear on the Insight card.  
- **Licensing / Einstein off** → work with your admin on entitlements.

**Technical note for developers:** Implementation uses `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`, similar to other JDO components. See also [ARCHITECTURE.md](ARCHITECTURE.md).

**Related:** [SETUP.md](SETUP.md) · [Business Profile Widget prompt payload](../../DC_BusinessProfileWidget/docs/PROMPT_TEMPLATE.md) (`predictionType: business_profile`) · Multiclass [PROMPT_TEMPLATE_GUIDE.md](../../DC_Multiclass_Prediction_LWC/docs/PROMPT_TEMPLATE_GUIDE.md).
