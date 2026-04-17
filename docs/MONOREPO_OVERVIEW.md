# Monorepo overview

## What lives here

Each top-level folder that contains `sfdx-project.json` is a **complete DX project**. There is no shared `force-app` at the repository root; deploy **from the project directory** you care about.

```mermaid
flowchart TB
    subgraph repo [JDO repository]
        P[DC_Prediction_Model_LWC]
        M[DC_Multiclass_Prediction_LWC]
        A[DC_AgentForce_Output_LWC]
        Q[DC_Query_to_Table_LWC]
        C[DC_PersonProfileWidget]
        B[DC_BusinessProfileWidget]
    end
    P --> |Flow + optional Prompt| SF[(Salesforce org)]
    M --> |Flow + optional Prompt| SF
    A --> |Autolaunched Flow| SF
    Q --> |ConnectApi.CdpQuery| SF
    C --> |SOQL + Flow + optional Einstein Overview + Insight| SF
    B --> |Account field map + Flow + optional Overview Agentforce + Insight| SF
```

## Naming vs App Builder labels

| Folder / bundle API name | App Builder (master label) |
|---------------------------|----------------------------|
| `classificationModelLwc` | Prediction Model |
| `multiclassPredictionLwc` | Multiclass Prediction |
| `dcAgentforceOutputLwc` | DC AgentForce Output |
| `dcQueryToTableLwc` | DC Query to Table |
| `customerProfileWidget` | Customer Profile Widget |
| `businessProfileWidget` | Business Profile Widget |

Historical Apex class names (e.g. `ClassificationModelLwcController`) are kept for stable upgrades in orgs that already deployed earlier versions.

## Clone and work on one project

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_Query_to_Table_LWC
sf org login web --alias my-org --set-default
sf project deploy start --source-dir force-app --target-org my-org
```

Repeat with a different subdirectory for other packages.

## Coexistence in one org

- **Prediction Model** and **Multiclass Prediction** use **different** Apex classes and LWC bundle names; both can deploy to the same org.
- **AgentForce Output** and **Query to Table** are independent packages as well.
- Watch for overlapping **permission sets** or **flow API names** only if you name new org metadata identically to samples shipped in-repo.
