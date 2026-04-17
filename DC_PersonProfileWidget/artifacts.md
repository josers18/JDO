# What ships in this package — DC Person Profile Widget

This is a **plain-language inventory** of files under `force-app/main/default/`. Sample Flows are **not** in Git; you build those in your org (see **[docs/SETUP.md](docs/SETUP.md)**).

**Quick takeaway:** The important pieces for most teams are the **widget**, **Apex controller**, **Customer_Profile_Widget_User** permission set, and (if you use address-based maps) **remote site** settings.

---

## Optional: Data Cloud–style integration (many teams skip)

These files help teams that already use a **Named Credential** called **DataCloud** with an **External Credential** **D360**. **The profile widget does not require them** for normal Account/Contact + Flow behavior.

| File / folder | In simple terms |
|---------------|-----------------|
| `connectedApps/DataCloud_Profile_Widget_NC.connectedApp-meta.xml` | A **Connected App** template for API access (your org stores secrets, not Git). |
| `externalCredentials/D360.externalCredential-meta.xml` | Login/token settings for that integration; often **edited per org**. |
| `namedCredentials/DataCloud.namedCredential-meta.xml` | A named “address” for callouts; **not** used by the profile widget’s main code path. |

---

## Permission sets

| API name | Assign to users? |
|----------|------------------|
| **Customer_Profile_Widget_User** | **Yes** — required so the widget can run. |
| **Customer_Profile_Widget_DC_Callout** | Only if you use the optional D360/DataCloud credential above for other apps. |

---

## Remote sites (for map address lookup)

| Name | Purpose |
|------|---------|
| **Nominatim_OpenStreetMap** | Looks up coordinates from an address (primary service). |
| **Photon_Komoot_Geocoder** | Backup if the primary lookup fails. |

If you turn **off** geocoding on the widget, these matter less.

---

## Apex (server code)

| Class | Role |
|-------|------|
| **CustomerProfileWidgetController** | Loads profile data (Salesforce + optional Flows + optional address lookup), optional **Insight** Einstein summary (`generateSummary`), optional **Overview** Einstein narrative via **`getAgentforceOverviewSummary`** (separate request; **Contact** / **Account** dual **Id + object** Connect inputs, anonymous-parity path, `without sharing` Connect bridge), optional **Overview Unified relationships** via **`getUnifiedRelationshipsQueryJson`** (**`Invocable.Action`** on an **`@InvocableMethod`** class), optional Flow calls for gauge rings; **Account** enrichment may set **`openCasesCount`** and **`openOpportunitiesAmount`**. |
| **CustomerProfileWidgetControllerTest** | Automated tests for deployment pipelines (includes **`getAgentforceOverviewSummary`** blank template, non–person record hint, blank record Id). |

---

## Lightning Web Component (the card)

| Item | Role |
|------|------|
| Folder **`customerProfileWidget`** | The **Customer Profile Widget** in App Builder. |
| `customerProfileWidget.js` / `.html` / `.css` | Layout, styling, behavior; **icon + label** field rows on key tabs. |
| `customerProfileWidget.js-meta.xml` | Which pages the component can be placed on and which properties appear. |
| `profileInsightRows.js` | Helper logic for the Insight tab list. |

**Where it can be placed:** Account and Contact **record** pages (full settings), plus **App** and **Home** pages (reduced settings).

---

## Project file

| File | Role |
|------|------|
| `sfdx-project.json` | Tells Salesforce CLI where `force-app` lives; API version **62.0**. |

---

## Not stored in Git (you create in the org)

- Autolaunched **Flows** for profile, Insight, or gauges.  
- **Prompt templates** for Einstein.  
- **Lightning page** XML, unless your team versions pages in source control.
