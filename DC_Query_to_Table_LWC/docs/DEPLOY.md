# Deploy — DC Query to Table

**Audience:** Whoever installs Salesforce metadata (admin or developer with **Salesforce CLI**).

## What you need

- **Same Salesforce org** has **Data Cloud** (or equivalent) and allows **Data Cloud SQL** from Apex (`ConnectApi.CdpQuery`). This package does **not** cover “CRM org calls Data Cloud in another org” (that needs a different integration).
- This folder on disk: **`DC_Query_to_Table_LWC`** (contains `sfdx-project.json`).

## Install (three steps)

```bash
cd DC_Query_to_Table_LWC
sf org login web --alias my-org --set-default
sf project deploy start --source-dir force-app --target-org my-org --wait 10
```

From the **JDO** monorepo: `cd JDO/DC_Query_to_Table_LWC` instead of the first line.

## If your org requires Apex tests

```bash
sf project deploy start --source-dir force-app --target-org my-org \
  --test-level RunSpecifiedTests --tests DcQueryToTableControllerTest --wait 30
```

## What gets deployed

- Lightning component **DC Query to Table**  
- Apex **`DcQueryToTableController`** + test class  
- Permission set **DC Query to Table User** — assign to users who should **open** the component  

## After deploy

1. Assign **DC Query to Table User** (or grant Apex class access another way).  
2. Follow **[SETUP_GUIDE.md](SETUP_GUIDE.md)** to add the component to a page and paste SQL.

**Problems?** [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [README.md](../README.md)
