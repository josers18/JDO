# Git and folder location

## Get the code

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_PersonProfileWidget
```

## Deploy from this folder

```bash
sf project deploy start --source-dir force-app --target-org <your-alias>
```

Full deploy instructions: **[DEPLOY.md](DEPLOY.md)**.

## Names you might hear

| Name people use | What it is |
|-----------------|------------|
| Folder **DC_PersonProfileWidget** | This Salesforce project |
| **Customer Profile Widget** | Name in Lightning App Builder |
| **customerProfileWidget** | Technical folder name of the component |
| **CustomerProfileWidgetController** | Apex class that loads data |

## Where documentation lives

- **[README.md](../README.md)** — Overview and doc map  
- **[docs/INDEX.md](INDEX.md)** — Full table of contents  
- **[../../README.md](../../README.md)** — Whole **JDO** monorepo (if you use other packages)
