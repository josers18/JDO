# Artifacts — DC Person Profile Widget

Inventory of versioned metadata under `force-app/main/default/`. No static resources, sample Flows, or permission sets are bundled; configure those in the org per [docs/SETUP.md](docs/SETUP.md).

## External Credential & Named Credential (optional in repo)

| Path | Notes |
|------|--------|
| `externalCredentials/D360.externalCredential-meta.xml` | **OAuth token URL** (`AuthProviderUrl`) must match the org My Domain (`…/services/oauth2/token`). Values in Git target the **finsdc3.demo** instance; retrieve and edit for other orgs. |
| `namedCredentials/DataCloud.namedCredential-meta.xml` | **Callout base URL** must match the org you query for Data Graph. |

These files were retrieved from a configured org for repeatability; **client secrets stay in the org** and are not in metadata.

## Permission sets (`permissionsets/`)

| API name | Purpose |
|----------|---------|
| `Customer_Profile_Widget_User` | Apex: `CustomerProfileWidgetController`. |
| `Customer_Profile_Widget_DC_Callout` | External Credential principal `D360-DataCloud_Integration` for Named Credential callouts. |

## Apex (`classes/`)

| API name | Purpose |
|----------|---------|
| `CustomerProfileWidgetController` | `getProfileData` (Data Graph HTTP + SOQL merge + optional Flow merge), `generateSummary` (Einstein prompt template). Inner types: `ProfileResult`, `BranchInfo`. |
| `CustomerProfileWidgetControllerTest` | `HttpCalloutMock` coverage for graph paths, SOQL fallback, invalid JSON mappings, nested dot paths, `generateSummary` null template. |

## Lightning Web Components (`lwc/`)

| Bundle folder | App Builder label | Targets |
|---------------|-------------------|---------|
| `customerProfileWidget` | Customer Profile Widget | `lightning__RecordPage` (Account, Contact), `lightning__AppPage`, `lightning__HomePage` |

| File | Role |
|------|------|
| `customerProfileWidget.js` | `@api` configuration, `recordId`, `loadProfile` / `loadSummary`, `buildFieldMappings` (includes `nearbyBranches` path), `animateBars`, computed getters for UI. |
| `customerProfileWidget.html` | Six panels, SVG gauges/bars/donut/map, tab bar, states. |
| `customerProfileWidget.css` | `:host` `--wp-*` defaults; layout; avatar ring variants; container query. |
| `customerProfileWidget.js-meta.xml` | Exposed properties (flattened; label prefixes group related settings). |

## Project metadata

| File | Role |
|------|------|
| `sfdx-project.json` | Package directory `force-app`, `sourceApiVersion` **62.0**. |

## Not in source (org-specific)

- **Named Credential** `DataCloud` (Data Cloud or CRM API base URL + auth).
- Adjust **Customer_Profile_Widget_DC_Callout** if External Credential / principal names are not `D360` / `DataCloud_Integration`.
- **Autolaunched Flow** (optional) for `prediction` / `recommendations`.
- **Prompt template** (optional) for Einstein summary.
- **FlexiPage** XML (optional) if you version Lightning pages in Git.
