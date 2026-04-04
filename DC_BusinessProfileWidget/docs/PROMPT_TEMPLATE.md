# Prompt template — Business Profile Widget

The widget calls **`BusinessProfileWidgetController.generateSummary`**, which builds a **single JSON string** and passes it to the Einstein prompt template’s **text** input (default API name **`Input:Prediction_Context`**).

---

## Payload shape

```json
{
  "prediction": "<predictionLabel from profile>",
  "predictionType": "business_profile",
  "recommendations": "<array or string from Flow; often JSON array text>"
}
```

The **Customer Profile Widget** uses **`predictionType: customer`** (or equivalent) in its controller. Templates can branch on **`predictionType`** if you reuse one template across both widgets.

---

## Template setup

1. Create or open a **prompt template** in Einstein Prompt Builder.  
2. Add a **text** input whose API name matches **Prompt template text input API name** on the component (default `Input:Prediction_Context`).  
3. Reference that input in the template instructions.  
4. Set **Prompt template ID** on the Lightning component.

---

[SETUP.md](SETUP.md) · [APEX_REFERENCE.md](APEX_REFERENCE.md)
