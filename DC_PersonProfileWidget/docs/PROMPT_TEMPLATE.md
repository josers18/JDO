# Einstein prompt template — Insight summary

When **`promptTemplateId`** is set and **`autoGenerateSummary`** is not `false`, the LWC calls **`CustomerProfileWidgetController.generateSummary`**, which mirrors the multiclass pattern used elsewhere in JDO (`ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`).

## Payload (serialized JSON)

The Apex method builds one JSON string and passes it to the template’s **text** input (default API name **`Input:Prediction_Context`**):

```json
{
  "prediction": "<string from ProfileResult.predictionLabel>",
  "predictionType": "person_profile",
  "recommendations": "<string — JSON array or raw string; default []>"
}
```

- **`prediction`** — Usually from your **Flow** output; may be null/blank if Flow is not used.
- **`predictionType`** — Fixed to **`person_profile`** so the template can branch logic if it also serves other components.
- **`recommendations`** — Same string stored in `ProfileResult.recommendationsJson` (Flow output or graph). If null, Apex sends `'[]'`.

## Template design tips

1. Create a **Prompt template** in Prompt Builder with a **text** input whose **API name** matches **`promptInputApiName`** (default above).
2. In the template instructions, describe the JSON keys and ask for a **short** executive summary suitable for a sidebar (2–4 sentences unless you want longer copy).
3. If **`recommendations`** is a JSON array of objects, instruct the model to use fields like `title`, `detail`, `description`, or `action` consistently so the UI list on the Insight tab aligns with parsed rows (the LWC parses JSON and shows `title` / `action` / `name` and `detail` / `description` / `body`).

## Permissions and licensing

- Users need access to run the Apex class and org must have **Einstein Generative AI** features enabled where required.
- Template **errors** surface as `AuraHandledException` messages; the LWC shows **`summaryError`** text on the Insight card.

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md) — when summary runs in the sequence diagram.
- Multiclass package [PROMPT_TEMPLATE_GUIDE.md](../../DC_Multiclass_Prediction_LWC/docs/PROMPT_TEMPLATE_GUIDE.md) — same `WrappedValue` / `inputParams` pattern with different `predictionType`.
