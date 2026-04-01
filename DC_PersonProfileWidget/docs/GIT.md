# Git and monorepo path

## Clone path

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_PersonProfileWidget
```

## Deploy from this folder only

```bash
sf project deploy start --source-dir force-app --target-org <alias>
```

## Naming

| Concept | Value |
|---------|--------|
| DX project folder | `DC_PersonProfileWidget` |
| LWC bundle directory | `customerProfileWidget` |
| Apex class | `CustomerProfileWidgetController` |
| App Builder label | Customer Profile Widget |

Documentation lives in **`README.md`**, **`artifacts.md`**, and **`docs/`**. Root JDO hub: [../../README.md](../../README.md).
