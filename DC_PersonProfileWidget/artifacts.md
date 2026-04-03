# Artifacts — DC Person Profile Widget

Inventory of versioned metadata under `force-app/main/default/`. No static resources or sample Flows are bundled; configure optional Flow and Einstein pieces in the org per [docs/SETUP.md](docs/SETUP.md).

## Connected App (optional template)

| Path | Notes |
|------|--------|
| `connectedApps/DataCloud_Profile_Widget_NC.connectedApp-meta.xml` | **Client credentials**–ready Connected App (`Api` scope, placeholder callback). For teams using the shipped External Credential **D360** with Named Credential **DataCloud**. Not required for the widget’s Apex (SOQL + Flow only). |

## External Credential & Named Credential (optional in repo)

| Path | Notes |
|------|--------|
| `externalCredentials/D360.externalCredential-meta.xml` | **OAuth token URL** (`AuthProviderUrl`) must match the org My Domain (`…/services/oauth2/token`). Values in Git may target a sample org; retrieve and edit for other orgs. |
| `namedCredentials/DataCloud.namedCredential-meta.xml` | Optional callout base URL for integrations using **`callout:DataCloud`**. The profile widget controller does **not** reference this Named Credential. |

These files were retrieved from a configured org for repeatability; **client secrets stay in the org** and are not in metadata.

## Permission sets (`permissionsets/`)

| API name | Purpose |
|----------|---------|
| `Customer_Profile_Widget_User` | Apex: `CustomerProfileWidgetController`. |
| `Customer_Profile_Widget_DC_Callout` | External Credential principal `D360-DataCloud_Integration` for optional Named Credential callouts. |

## Remote Site Settings (`remoteSiteSettings/`)

| API name | Purpose |
|----------|---------|
| `Nominatim_OpenStreetMap` | OpenStreetMap Nominatim geocoder (billing address → map coordinates). |
| `Photon_Komoot_Geocoder` | Photon fallback when Nominatim fails or is blocked. |

## Apex (`classes/`)

| API name | Purpose |
|----------|---------|
| `CustomerProfileWidgetController` | `getProfileData` (optional assembly Flow + SOQL merge + optional prediction Flow + optional geocode), `generateSummary` (Einstein prompt template), `runSignalGaugeFlow` (per–AI Signals ring). Inner types: `ProfileResult`, `BranchInfo`, `FinancialAccountInfo`, `SignalGaugeFlowResult`. |
| `CustomerProfileWidgetControllerTest` | SOQL fallback, `generateSummary` null template, gauge/geocode coverage as implemented. |

## Lightning Web Components (`lwc/`)

| Bundle folder | App Builder label | Targets |
|---------------|-------------------|---------|
| `customerProfileWidget` | Customer Profile Widget | `lightning__RecordPage` (Account, Contact), `lightning__AppPage`, `lightning__HomePage` |

| File | Role |
|------|------|
| `customerProfileWidget.js` | `@api` configuration, `recordId`, `loadProfile` / `loadSummary`, `animateBars`, theming, gauge Flow calls, computed getters for UI. |
| `profileInsightRows.js` | Helpers for Insight recommendation row parsing / display. |
| `customerProfileWidget.html` | Six panels, SVG gauges/bars/donut/map, tab bar, states. |
| `customerProfileWidget.css` | `:host` `--wp-*` defaults; layout; avatar ring variants; container query. |
| `customerProfileWidget.js-meta.xml` | Exposed properties (flattened; label prefixes group related settings). |

## Project metadata

| File | Role |
|------|------|
| `sfdx-project.json` | Package directory `force-app`, `sourceApiVersion` **62.0**. |

## Not in source (org-specific)

- **Autolaunched Flow(s)** (optional) for profile assembly outputs and/or `prediction` / `recommendations`.
- **Prompt template** (optional) for Einstein summary.
- **FlexiPage** XML (optional) if you version Lightning pages in Git.
