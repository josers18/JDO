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

## Profiles

| File | Role |
|------|------|
| `profiles/Standard.profile-meta.xml` | Grants **Apex class access** on the **Standard** profile for **BusinessProfileWidgetController** and the other JDO LWC controllers (Customer Profile, Prediction Model, Multiclass, AgentForce Output, Query to Table, **LlmOutputSanitizer**). Deploy with this package. |

## Permission sets

No dedicated permission set for this widget; use the Standard profile patch above or grant **Apex class access** manually.

---

[docs/SETUP.md](docs/SETUP.md) · [docs/DEPLOY.md](docs/DEPLOY.md)
