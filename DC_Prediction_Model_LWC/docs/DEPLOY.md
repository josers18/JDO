# Deploy — Prediction Model

**Audience:** Admin or developer with **Salesforce CLI**.

## Install

```bash
cd DC_Prediction_Model_LWC
sf org login web --alias my-org --set-default
sf project deploy start --source-dir force-app --target-org my-org --wait 10
```

**JDO:** `cd JDO/DC_Prediction_Model_LWC`.

## If your org requires Apex tests

```bash
sf project deploy start --source-dir force-app --target-org my-org \
  --test-level RunSpecifiedTests --tests ClassificationModelLwcControllerTest --wait 30
```

## What gets deployed

- **Prediction Model** (LWC)  
- **`ClassificationModelLwcController`** + test class  
- Permission set **DC Prediction Model User**

## After deploy

1. Assign **DC Prediction Model User**.  
2. Build **autolaunched Flow** + optional **prompt template** (**[FLOW_GUIDE.md](FLOW_GUIDE.md)**, **[PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md)**).  
3. Add component to an **Account** page (or add objects in `classificationModelLwc.js-meta.xml`).

**Help:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [HOW_TO.md](HOW_TO.md)
