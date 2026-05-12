# Cumulus Installed Package Inventory

**Org:** `jdo-fw51xz` (Cumulus Financial Services, USA844)
**Generated:** 2026-05-11
**Total installed packages:** 100
**Source:** `sf package installed list --target-org jdo-fw51xz`

This inventory categorizes every installed package by its likely status in
Cumulus today. It is the deliverable for audit Phase A7. **No packages
were uninstalled.** A future hygiene pass can use this document to drive
targeted, dependency-checked uninstalls.

## Summary

| Category | Count | Recommendation |
|---|---:|---|
| **CORE** — Salesforce platform / FSC stack / actively-used | 30 | Keep |
| **DEMO_FACTORY** — qbranch, XDO, NXDO, NBA, etc. | 7 | Keep (essential to demo provisioning) |
| **SUNSET** — Salesforce-deprecated products | 4 | High uninstall confidence |
| **OLD_DEMO** — B2B LE 2020-era commerce accelerators | 6 | High uninstall confidence |
| **MKTG_LEGACY** — Old Marketing/Engagement components | 3 | Medium uninstall confidence |
| **UTILITY** — Small Lightning/Flow components, age varies | 21 | Per-package review needed |
| **UNCLASSIFIED** — Need individual research | 29 | Per-package research needed |
| **Total** | **100** | — |

## Classifier caveats

- **`Pardot` (pi namespace)** is classified as CORE because Pardot is a Salesforce
  product, but the modern equivalent is "Marketing Cloud Account Engagement". The
  legacy `Pardot` namespace package may or may not still be the active integration
  surface in this org. Worth confirming before considering uninstall.
- **`PardotEngagementHistoryDemo` (no namespace, Winter 18)** got classified as
  CORE due to keyword match but is **clearly a 2018-era demo package, not core**.
  Treat as MKTG_LEGACY / high-uninstall-confidence.
- **`Sales Insights` (`OIQ` namespace, version 1.0)** appears to be the legacy
  SalesforceIQ insights component, NOT the modern Sales Cloud Einstein "Sales
  Insights" tier. Treat as SUNSET candidate.

## Detailed inventory

### CORE (30) — Keep

These are Salesforce platform packages, the FSC stack, or products actively used
by current demos. Do not uninstall without explicit project rationale.

| Package | Namespace | Version | Notes |
|---|---|---|---|
| Advanced Approvals | `sbaa` | Spring '23 | CPQ companion |
| Agent Creator App | `agentcreator` | ver 2.0 | Agentforce Builder |
| Code Builder | `CodeBuilder` | ver 1.3.0 | Web IDE |
| Data Cloud for Financial Services Cloud | (none) | Summer 2024 | FSC + Data Cloud bridge |
| DevOps Center | `sf_devops` | 12.2.0 | DevOps tooling |
| Field Service Appointment Assistant | `FSAA` | Spring '25 | Field Service |
| Field Service Dashboard V3 | (none) | — | Field Service |
| **Financial Services Cloud** | `FinServ` | r260.0 | Core FSC |
| FSC Service Processes for Retail Banking | (none) | Winter 24 | FSC accelerator |
| FSC Service Processes for Wealth Management | (none) | Spring 24 | FSC accelerator |
| Lightning Flow for Financial Services Cloud | `FinServFlowsExt` | r220.2 | FSC flows |
| Marketing Cloud | `et4ae5` | Marketing Cloud | MC integration |
| OMS Order Entry Framework | `OMSOrderEntry` | 10-Mar-23 | OMS |
| **OmniStudio** | `omnistudio` | Spring 2026 | Industries core |
| OmniStudio Utilities | `vlocity_lwc15` | Utilities 1.2 | OmniStudio helpers |
| Pardot | `pi` | Pardot Package v5.9 | ⚠️ Verify still primary integration |
| PardotEngagementHistoryDemo | (none) | Winter 18 | ⚠️ **Misclassified — should be MKTG_LEGACY** |
| Sales Cloud | `cdp_crm_dk1` | Summer 2025 | Sales Cloud DataKit |
| Sales Insights | `OIQ` | 1.0 | ⚠️ **Misclassified — should be SUNSET (legacy SalesforceIQ insights)** |
| Salesforce Billing | `blng` | Spring '23 | Billing |
| Salesforce CPQ | `SBQQ` | Spring '23 | CPQ |
| Salesforce Data Cloud - Flow Integration | `datacloudflow` | Winter 2026 | Data Cloud |
| Salesforce Field Service App Package | `sf_fieldservice` | 1.60 | Field Service |
| Salesforce Field Service Starter Kit | `FSSK` | SFS Starter Kit V2 | Field Service |
| Salesforce Maps | `maps` | Summer 25 | Maps |
| **Salesforce Standard Data Model** | `ssot` | 1.130 | Data Cloud foundation |
| Service Cloud | `cdp_crm_dk2` | Spring 2025 | Service Cloud DataKit |
| Slack | `slackv2` | Slack | Slack integration |
| Tableau Viz Lightning Web Component | `tab` | February 2023 | Embedded analytics |
| p13n-data-kit-pack | `sf_persnl` | ver 1.9.x | Personalization |

### DEMO_FACTORY (7) — Keep

These power the Cumulus demo factory toolchain. Removing any of them risks
breaking automated demo provisioning, data refresh, or org-customization
workflows.

| Package | Namespace | Version | Purpose |
|---|---|---|---|
| Data Tool | `NXDO` | Remote Site Settings Fix | Bulk data load/refresh |
| NBA | (none) | Winter '21 | Next Best Action accelerator |
| Order Search for Order Management (OMS) | `qomsos` | ver 1.1 | OMS demo helper |
| Org Customizer | `EDY_ORGCUSTOM` | 3.0.1 | Demo org customization |
| QLabs_Utilities | `qbranch` | Spring 2025 | qbranch shared utilities |
| XDO Automation | `xdo` | Demo Boost Tabs Renamed | Demo experience automation |
| qbrix-devops-tools-v2 | `qbrix_devops` | ver 0.1 | qbrix CI/CD tooling |

### SUNSET (5) — High uninstall confidence; UI uninstall required (2026-05-12)

All 5 are first-generation managed packages (1GP). The CLI's
`sf package uninstall` rejects 1GP packages with the message *"You can
uninstall this package type only in the Salesforce user interface"* —
verified 2026-05-12. These should still be uninstalled; switch to
**Setup → Installed Packages → Uninstall** (one click each, ~2 min per
package, ~10 min total).

| Package | Namespace | Reason |
|---|---|---|
| Quip | `Quip` | Salesforce sunsetting Quip 2025–2026 |
| Quip Connected App | `QuipConnected` | Same as above; uninstall before Quip |
| SalesforceIQ Cloud | `SIQCloud` | SalesforceIQ shut down 2018 |
| SalesforceIQ Inbox | `relateiq` | SalesforceIQ shut down 2018 |
| Sales Insights | `OIQ` | Legacy SalesforceIQ insights component (reclassified from CORE 2026-05-11) |

### OLD_DEMO (1 uninstalled, 4 reclassified to KEEP, 1 deferred to UI) — UPDATED 2026-05-12

The original "high uninstall confidence" rating was correct for 1 of 6 but
wrong for 4. The 2026-05-12 uninstall pass surfaced live dependencies that
the inventory check missed:

| Package | Namespace | Status (2026-05-12) | Why |
|---|---|---|---|
| B2B LE Mood Board | (none) | ✅ **Uninstalled** | No live references |
| B2B LE Bundle Item | (none) | ⚠️ **KEEP** (blocked) | Referenced by 3 active flows: `B2B_Bundle_Items_Create_Unique_Junction_Flow_2_0`, `Subflow_Activate_Order_with_Bundle_Items_2_0`, `B2B_LE_Checkout_with_Bundle` |
| B2B LE Cart Upload | (none) | ⚠️ **KEEP** | In use by `SDO - B2B Commerce Enhanced` site (current demo) |
| B2B LE Cross-Sell | (none) | ⚠️ **KEEP** | In use by `SDO - B2B Commerce Enhanced` and `SDO - Commerce for B2B2C` sites |
| B2B LE Video Player | (none) | ⚠️ **KEEP** | In use by `SDO - Commerce for B2B2C` site (YouTube_iframe_api / YouTube_widget_api components) |
| b2bmaIntegration | `pi3` | 🔧 **UI uninstall pending** | 1GP managed package; CLI rejected with *"You can uninstall this package type only in the Salesforce user interface"* |

**Lesson:** the 4 "KEEP" packages were repurposed by newer SDO Commerce
demo profiles rather than retired with the original B2B LE Commerce arc.
A namespace-only inventory check missed those references. **For future
package-uninstall passes, always run the `sf package uninstall` first
(it's safe — Salesforce refuses with a clear error if anything depends
on the package), and treat the dependency message as authoritative.**

### MKTG_LEGACY (3) — Medium uninstall confidence

| Package | Namespace | Notes |
|---|---|---|
| EngageReports | `engage_reports` | Engage Reports v1.33; older Pardot reporting layer |
| MarketingCloudConnectedApp | `MCCA5PROD` | Spring 2017; check whether modern MC Connected App handles same surface |
| MarketingExternalAction | `MktgExtAction` | External Action Package v1.00 |

**Plus from CORE bucket (misclassified):**
- PardotEngagementHistoryDemo (Winter 18) — clearly a demo, not core

### UTILITY (21) — Per-package review needed

Small Lightning/Flow components. Most are 2017–2022 era. Each needs its own
dependency audit before uninstall — they may be referenced by Lightning pages,
Flows, or Apex in other parts of the org.

| Package | Namespace | Version |
|---|---|---|
| Address Picker Autocomplete for Flow | `DV_Flow_AP` | 181019 |
| Assign Topics Unscoped | `assigntopics` | — |
| B2B Featured Products | (none) | Product link fix |
| B2B Order Grid Unlocked | (none) | Initial Version |
| Case Timer Unmanaged | (none) | Feb 2023 |
| Content Standard Checklist Lightning Managed | `aqi_ltng_mng` | September 2018 |
| DE Dashboard | (none) | October 2021 |
| DW Datakit | (none) | Without CI |
| Flow Datagrid Pack | `FDGPack` | Summer 2022 |
| FlowActionsBasePack | `usf3` | versionName |
| FlowScreenComponentsBasePack | (none) | 3.2.4.0 |
| Knowledge Dashboard | (none) | — |
| Launch Flow Modal | `sf_flowmodal` | — |
| Lightning Banner Carousel & Slider | `cloudx_cms` | — |
| Lightning Mass Delete | (none) | — |
| Mass Edit Related Lists | `MERL` | Nov 3rd, 2018 |
| NavigateToSObject | (none) | Summer 2018 |
| Partner Onboarding | `Ptnr_Onbd_Fmwk` | Winter 18 |
| Salesforce Communities Management (for Experience Cloud Sites with Chatter) | `ca_collab_2_0` | Spring '21 |
| Utility_Search_Component | (none) | Global Lookup and Apex search |
| datatable | (none) | Datatable v4 |

### UNCLASSIFIED (29) — Per-package research needed

The classifier couldn't auto-categorize these. Most are domain-specific
(Marketing, Loyalty, FSL, MuleSoft) or have ambiguous names. Each needs
individual research.

| Package | Namespace | Version |
|---|---|---|
| B2BLE Multi Cart Switcher | (none) | 20220112 |
| CDPAdvertising | `cdpactvstrgptnr` | 258.12b |
| Data Mask | `datamask` | 6.1 |
| EMC | `EMC` | ECI Initial Release |
| Einstein Playground | `einsteinplay` | Spring '21 |
| Email Video Component | `asj` | July 2021 |
| Engagement_A4S | `lex_engmnt` | 1.0 |
| ExperienceCloudEvent | `exp_dc_integr` | 1.4 |
| FINS_PartipantRoles | (none) | 246.3 |
| FSL | `FSL` | Spring 2025 |
| Incident Management Dashboard | `imdashboard` | March 2022 |
| Lightning Lead Inbox (Community) | (none) | — |
| Marketing - Account Engagement CRM Data | `sf_mktg_ae` | ver 1.1 |
| Marketing Setup Objects | `sf_mktg` | Spring 2026 |
| MessagingEventsEmailEngagement | `UnifiedMsgEmail` | Apr 18 2025 |
| MessagingEventsSms | `UMsgSms` | Sep'25 |
| MuleSoft Composer | `ms_ci` | 1.17.0 |
| PMT | `inov8` | ver 0.21 |
| Qinsight | (none) | autumn2020 |
| Salesforce - Postspin DevOps | `vbtapp` | Winter '26 |
| Salesforce CDP CRM Loyalty | `cdp_crm_dk4` | releasepkg26Oct2023 |
| Salesforce Connected Apps | `sf_com_apps` | Winter '16 |
| Salesforce Mobile Apps | `sf_chttr_apps` | Summer 2025 |
| Service Agent Script | `agentScript` | Winter 2021 |
| UnifiedMessagingConsent | `UMsgConsentProd` | Aug 2025 |
| UnifiedWhatsAppPackage | `UWhatsAppProd` | v258 Fall 2025 |
| Universal Timeline | `slt` | Lightning Ready |
| VRA Scheduling | `tsaa` | Version 1.7 |
| Visual Remote Assistant | `tspa` | VRA Spring'24 |

## Recommended sequencing for a future uninstall pass

If a future hygiene project does choose to act on this inventory:

1. **Start with SUNSET (4 + 1 misclassified) and OLD_DEMO (6).** Lowest dependency
   risk, highest confidence. ~11 packages.
2. **Then MKTG_LEGACY (3 + 1 misclassified).** ~4 packages. Verify Pardot
   integration path before uninstalling `EngageReports` or `MarketingCloudConnectedApp`.
3. **Then UTILITY (21).** Per package: search for references in Apex, Lightning
   pages, Flows, Reports/Dashboards. If zero references, uninstall. If references
   exist, decide case-by-case.
4. **UNCLASSIFIED (29) gets individual research.** Some are likely keepers
   (`MuleSoft Composer`, `Marketing Setup Objects`, `MessagingEvents*`,
   `UnifiedWhatsAppPackage` — these look active/recent). Others may be candidates
   (`Einstein Playground` Spring '21, `Qinsight` autumn 2020, `PMT inov8`).

**Each uninstall takes ~2 minutes when successful, longer when blocked by
dependencies.** Salesforce will refuse to uninstall a package whose objects/classes
are referenced elsewhere; those errors are usually informative and tractable.
