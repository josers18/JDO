# Deploy — Multiclass Prediction

**Audience:** Admin or developer with **Salesforce CLI**.

## Install

```bash
cd DC_Multiclass_Prediction_LWC
sf org login web --alias my-org --set-default
sf project deploy start --source-dir force-app --target-org my-org --wait 10
```

**JDO monorepo:** `cd JDO/DC_Multiclass_Prediction_LWC`.

## If your org requires Apex tests

```bash
sf project deploy start --source-dir force-app --target-org my-org \
  --test-level RunSpecifiedTests --tests MulticlassPredictionLwcControllerTest --wait 30
```

Some sandboxes allow `--test-level NoTestRun`—follow your org policy.

## What gets deployed

- **Multiclass Prediction** (LWC)  
- **`MulticlassPredictionLwcController`** + **`LlmOutputSanitizer`** + tests  
- Permission set **DC Multiclass Prediction User**

## After deploy

1. Assign **DC Multiclass Prediction User**.  
2. Create the **autolaunched Flow** and optional **prompt template** in the org (**[FLOW_GUIDE.md](FLOW_GUIDE.md)**, **[PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md)**).  
3. Add the component to an **Account** record page (or extend objects in metadata).

**Help:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [HOW_TO.md](HOW_TO.md)
