# Deploy — DC AgentForce Output

**Audience:** Admin or developer with **Salesforce CLI** (`sf`).

## Before you start

- Read **[REQUIREMENTS.md](REQUIREMENTS.md)** for org capabilities.  
- Working directory: **`DC_AgentForce_Output_LWC`** (folder with `sfdx-project.json`).

## Install

```bash
cd DC_AgentForce_Output_LWC
sf org login web --alias my-org --set-default
sf project deploy start --source-dir force-app --target-org my-org --wait 10
```

From **JDO**: `cd JDO/DC_AgentForce_Output_LWC`.

## If tests are required

```bash
sf project deploy start --source-dir force-app --target-org my-org \
  --test-level RunSpecifiedTests --tests DcAgentforceOutputControllerTest --wait 30
```

Your org may also require **`LlmOutputSanitizerTest`** in the same deploy—ask your release policy.

## What gets deployed

- **DC AgentForce Output** (main LWC) + modals  
- Apex **`DcAgentforceOutputController`**, **`LlmOutputSanitizer`**, tests  
- Static resource **marked** (Markdown)  
- Permission set **DC AgentForce Output User**  
- Sample Flow **DC_Agentforce_Output_Prompt** (optional starting point)

## After deploy

1. Assign **DC AgentForce Output User** to viewers.  
2. **[SETUP_GUIDE.md](SETUP_GUIDE.md)** — build or point to your Flow, add the component to a page.

**Problems?** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
