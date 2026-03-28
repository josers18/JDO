# Deployment guide

## Prerequisites

- [Salesforce CLI v2](https://developer.salesforce.com/tools/salesforcecli) (`sf`)
- Authorized org: `sf org login web --alias <alias>`

## Standard deploy (per project)

From the project root (the directory that contains `sfdx-project.json`):

```bash
sf project deploy start --source-dir force-app --target-org <alias> --wait 10
```

Examples:

```bash
cd DC_Prediction_Model_LWC && sf project deploy start --source-dir force-app --target-org JDO
cd ../DC_Query_to_Table_LWC && sf project deploy start --source-dir force-app --target-org JDO
```

## Default org (optional)

```bash
sf config set target-org JDO
```

Then omit `--target-org` if you prefer.

## Validate only

```bash
sf project deploy start --source-dir force-app --target-org <alias> --dry-run --wait 10
```

## Run Apex tests (when required by org policy)

```bash
sf project deploy start --source-dir force-app --target-org <alias> --test-level RunLocalTests --wait 30
```

Adjust `--test-level` per your pipeline.

## After deploy

1. **Lightning App Builder** — Add the component to an **app**, **home**, or **record** page; set properties.
2. **Activation** — Assign the page to apps and profiles (and record types for record pages).
3. **Permissions** — Grant **Apex class** access (and **Flow** / **Data Cloud** rights as each project requires). See each project’s `docs/SETUP_GUIDE.md` or `docs/REQUIREMENTS.md`.

## Artifacts reference

Each project’s **`artifacts.md`** lists metadata in `force-app/main/default/` and dependencies.
