# Prompt template guide (Einstein / Prompt Builder)

The optional **AI summary** card calls Apex, which uses:

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
  "prediction": 51.58,
  "factors": "[{\"fields\":[...],\"value\":2.8}, ...]",
  "recommendations": "[...]"
}
```

Notes:

- `prediction` is a JSON number.
- `factors` and `recommendations` are **strings** (often escaped JSON). In the prompt body, instruct the model to parse them or to treat them as opaque text for summarization.

Example snippet you might put in the template instructions:

> You are assisting a banker. You receive a JSON object with keys `prediction` (number 0–100), `factors` (string, JSON array of drivers), and `recommendations` (string, JSON array). Parse the string fields if needed. Summarize risk in 2–3 sentences and mention the top drivers without inventing data.

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
| **Auto-generate AI summary** | On: runs after successful flow. Off: you could extend the LWC later to add a manual “Generate” only (currently summary runs when flow succeeds and template is set). |

---

## Security and data minimization

- The entire payload is sent to the LLM. **Do not include PII** in factor labels/values if policy forbids it, or filter in the flow before outputting JSON.
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

- [FLOW_GUIDE.md](FLOW_GUIDE.md) — shape `factors` / `recommendations` consistently for both UI and prompt.
- [ARCHITECTURE.md](ARCHITECTURE.md) — sequence diagram including Einstein call.
