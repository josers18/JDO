# Prompt template guide (Einstein / Prompt Builder)

For the **Multiclass Prediction** Lightning component (`multiclassPredictionLwc`), the optional **AI summary** block calls Apex, which uses:

`ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`

with a **single flex text input** containing JSON. Your Prompt Builder template must define that input with an API name that matches the LWC.

---

## Prerequisites (org)

- Einstein **Generative AI** features enabled and licensed for your org (product names vary by edition; see current Salesforce Help).
- User permissions to **run** the prompt template assigned to profiles/permission sets as required by your admin.
- A deployed **prompt template** (Prompt Builder) with at least one **text** input resource.

---

## Required input on the template

Apex sends **one** parameter into the map `inputParams`:

| Key | Value |
|-----|--------|
| API name from LWC (default: `Input:Prediction_Context`) | String: JSON document (see below) |

**Critical:** Prompt Builder flex inputs use API names like `Input:Something`. The LWC property **Prompt template text input API name** must match **exactly** (including `Input:` if that is how the template defines it).

Default in code and metadata: **`Input:Prediction_Context`**.

If your template uses e.g. `Input:Model_Context`, set that string in App Builder.

---

## JSON payload (what the model receives)

Apex builds:

```json
{
  "prediction": "Wealth_Management",
  "predictionType": "multiclass_label",
  "recommendations": "[{\"fields\":[{\"name\":\"risk_tolerance__c\",\"inputValue\":\"Aggressive\",\"prescribedValue\":\"\"}],\"value\":317.61}, ...]"
}
```

Notes:

- `prediction` is always a **JSON string**: the raw class label from the flow (not the humanized display string).
- `predictionType` is always **`multiclass_label`** so one template family can distinguish this payload from numeric **DC_Prediction_Model_LWC** payloads if you reuse instructions.
- `recommendations` is a **string** (often escaped JSON). In the prompt body, instruct the model to parse it or treat it as opaque text for summarization.
- There is **no** `factors` or `predictionOutputFormat` in this project.

Example snippet you might put in the template instructions:

> You are assisting a relationship manager. You receive JSON with `prediction` (string — predicted class code or label), `predictionType` (`multiclass_label`), and `recommendations` (a stringified JSON array of fields and impact values). Explain the predicted class in plain language and summarize the top suggested improvements in 2–3 sentences. Do not invent data not present in the JSON.

---

## Template Id vs API name

The LWC property **Prompt template Id or API name** accepts either:

- The template’s **Salesforce Id** (15/18 character), or  
- The template **API name** (if supported by `generateMessagesForPromptTemplate` in your API version — verify in org).

If one form fails, try the other from Setup → Prompt Builder → your template.

---

## App Builder settings

| Property | Recommendation |
|----------|----------------|
| **Prompt template Id or API name** | Set to your production template. |
| **Prompt template text input API name** | Must match the flex text input (e.g. `Input:Prediction_Context`). |
| **Auto-generate AI summary** | On: runs after successful flow. Off: summary is not requested automatically. |

---

## Security and data minimization

- The entire payload is sent to the LLM. **Do not include PII** in recommendation labels/values if policy forbids it, or filter in the flow before outputting JSON.
- Review **Einstein Trust** and audit features for your org.

---

## Troubleshooting

| Error / symptom | What to check |
|-----------------|---------------|
| Toast “AI summary failed” | Template Id/API name; user prompt access; Einstein not enabled; input API name mismatch. |
| Empty summary | Template returns no generation; inspect Apex exception message (controller appends details). |
| Hallucinations | Tighten template instructions: “Only use fields present in the JSON.” |

---

## Related

- [GIT.md](GIT.md) — repository path and naming
- [UI_LAYOUT.md](UI_LAYOUT.md) — class hero and recommendation rows
- [FLOW_GUIDE.md](FLOW_GUIDE.md) — shape `recommendations` consistently for both UI and prompt
- [ARCHITECTURE.md](ARCHITECTURE.md) — sequence diagram including Einstein call
