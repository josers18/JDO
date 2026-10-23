# Deploy — Multiclass Prediction

**Audience:** Admin or developer with **Salesforce CLI**.

## Install

```bash
cd DC_Multiclass_Prediction_LWC
sf org login web --alias my-org --set-default
sf project deploy start --source-dir force-app/main/default/classes --source-dir force-app/main/default/lwc --source-dir force-app/main/default/permissionsets \
  --target-org my-org --wait 10
```

Do **not** deploy `force-app` whole to a new org: `flows/`, `flexipages/` and `genAiPromptTemplates/` are the product-recommendation reference implementation from `jdo-gj9q5q` and need its Data Cloud models and DMOs.

**JDO monorepo:** `cd JDO/DC_Multiclass_Prediction_LWC`.

## If your org requires Apex tests

```bash
sf project deploy start --source-dir force-app/main/default/classes --source-dir force-app/main/default/lwc --source-dir force-app/main/default/permissionsets --target-org my-org \
  --test-level RunSpecifiedTests --tests MulticlassPredictionLwcControllerTest --wait 30
```

Some sandboxes allow `--test-level NoTestRun`—follow your org policy.

## What gets deployed

- **Multiclass Prediction** (LWC)  
- **`MulticlassPredictionLwcController`** + **`LlmOutputSanitizer`** + tests  
- Permission set **DC Multiclass Prediction User**

## Reference implementation (jdo-gj9q5q only)

```bash
sf project deploy start --source-dir force-app/main/default/flows \
  --source-dir force-app/main/default/flexipages \
  --source-dir force-app/main/default/genAiPromptTemplates -o jdo-gj9q5q --wait 10
```

Deploys the two product-recommendation flows, the Account page with both cards, and the two prompt templates (see [artifacts.md](../artifacts.md)). Activate the page in App Builder if it is not already assigned.

## After deploy

1. Assign **DC Multiclass Prediction User**.  
2. Create the **autolaunched Flow** and optional **prompt template** in the org (or adapt the reference ones in `force-app/main/default/flows/` and `genAiPromptTemplates/`) (**[FLOW_GUIDE.md](FLOW_GUIDE.md)**, **[PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md)**).  
3. Add the component to an **Account** record page (or extend objects in metadata).

**Help:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [HOW_TO.md](HOW_TO.md)
