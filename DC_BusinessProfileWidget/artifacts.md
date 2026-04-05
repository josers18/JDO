# Artifacts — DC Business Profile Widget

Inventory of **`force-app/main/default/`**.

---

## Apex

| File | Role |
|------|------|
| `classes/BusinessProfileWidgetController.cls` | Account profile load: SOQL + optional assembly/insight Flows, structure enrich, **`enrichActiveFinancialAccountsAndPipeline`** (open Opps with configurable **`LIMIT`** up to 2000 + FinServ Financial Account count when available), geocode, JSON result. |
| `classes/BusinessProfileWidgetControllerTest.cls` | Unit tests. |

---

## Lightning Web Component

| Path | Role |
|------|------|
| `lwc/businessProfileWidget/` | **Business Profile Widget** bundle: **Pipeline** tab, icon field rows (Overview, Credit facilities, Structure), themes, Flow + field maps. |
| `lwc/businessProfileWidget/profileInsightRows.js` | Insight tab row helpers. |

---

## Remote site settings

| Name | Purpose |
|------|---------|
| `Nominatim_OpenStreetMap` | Primary geocoder. |
| `Photon_Komoot_Geocoder` | Fallback geocoder. |

---

## Permission sets

None shipped. Grant **Apex class access** to **`BusinessProfileWidgetController`** in your org.

---

[docs/SETUP.md](docs/SETUP.md) · [docs/DEPLOY.md](docs/DEPLOY.md)
