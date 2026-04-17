# Artifacts — DC Business Profile Widget

Inventory of **`force-app/main/default/`**.

---

## Apex

| File | Role |
|------|------|
| `classes/BusinessProfileWidgetController.cls` | Account profile load: SOQL + optional assembly/insight Flows, structure enrich, **`enrichActiveFinancialAccountsAndPipeline`** (open Opps with configurable **`LIMIT`** up to 2000 + FinServ Financial Account count when available), geocode, JSON result. **`getAgentforceOverviewSummary`** — separate Aura method for Overview Einstein (**Connect** dual **`Input:Account.Id`** + **`Input:Account`**, anonymous-parity path, `without sharing` Connect bridge). **`getUnifiedRelationshipsQueryJson`** — optional Overview **Unified relationships** table via **`Invocable.Action`** on **`@InvocableMethod`** Apex (same pattern as Customer Profile Widget). |
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
| `profiles/Standard.profile-meta.xml` | Grants **Apex class access** on the **Standard** profile for **all** JDO Apex classes in this monorepo: six widget **`…Controller`** classes, **`LlmOutputSanitizer`**, and every matching **`*Test`** class (so **Standard** users can run those tests from the UI when needed). Deploy with this package. |

## Permission sets

No dedicated permission set for this widget; use the Standard profile patch above or grant **Apex class access** manually.

---

[docs/SETUP.md](docs/SETUP.md) · [docs/DEPLOY.md](docs/DEPLOY.md)
