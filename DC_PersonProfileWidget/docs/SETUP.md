# Setup guide — Customer Profile Widget

Follow these steps after deploying `force-app` to your org.

## 1. Prerequisites

- Salesforce org with **Lightning Experience**.
- **Account** and/or **Contact** record pages where you want the card (or App/Home for summary-only placement).
- If you use **Data Graph**: Data Cloud provisioned, a **Data Graph** published, and API access from the CRM org you deploy into.
- If you use **Insight summary**: **Einstein Generative AI** and a **Prompt template** with a text input whose API name matches the component (default `Input:Prediction_Context`).
- If you use **Flow**: an **autolaunched** Flow that accepts the record Id and outputs prediction text plus recommendations (JSON string or serializable collection).

## 2. Named Credential `DataCloud`

The Apex controller calls:

`callout:DataCloud` + `/services/data/v62.0/ssot/data-graph/{graphApiName}/records/{recordId}`

### Create the credential

1. **Setup → Named Credentials → New** (or **External Credentials** + **Named Credential**, depending on your org’s pattern).
2. **Label:** e.g. `Data Cloud API`  
   **Name:** **`DataCloud`** (must match Apex exactly).
3. **URL:** Base URL for Data Cloud REST from the **same environment** as your graph (often your Data Cloud instance or the documented CRM-to-Data-Cloud API host). Do **not** include the path segment above; Apex appends it.
4. **Authentication:** OAuth 2.0 or the pattern your team uses for Data Cloud server-to-server access (JWT, etc.). Ensure the identity can **read** Data Graph records.

### Validate callouts

- **Remote Site Settings** are not used for Named Credentials, but if you bypass NC you would need a site entry.
- Run a quick Apex test or REST client from the org after auth is wired; 401/403 usually mean wrong scope or wrong base URL.

If **`graphApiName`** is left blank in App Builder, the component **does not** call the graph and relies on **SOQL** enrichment only (see [ARCHITECTURE.md](ARCHITECTURE.md)).

## 3. Apex access

Users who open pages with this component need permission to run:

- `CustomerProfileWidgetController.getProfileData`
- `CustomerProfileWidgetController.generateSummary` (if summaries are enabled)

**Typical approach:**

1. **Setup → Permission Sets → New** (e.g. `Customer_Profile_Widget`).
2. **Apex Class Access:** add `CustomerProfileWidgetController`.
3. Assign the permission set to personas who should see the widget.

Admins with **View Setup** often already have broad Apex access; **standard users** do not until you assign this.

## 4. Add the component to a Lightning page

1. Open **Lightning App Builder** for an **Account** or **Contact** record page (or App/Home).
2. Drag **Customer Profile Widget** onto the region.
3. Configure properties (see [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)). Minimum for graph mode:
   - **Graph API name** (`graphApiName`): developer API name of your Data Graph.
4. Save and **Activate** the page assignment if prompted.

### Record page

The platform injects **`recordId`**. No manual binding is required.

### App / Home

There is no automatic record Id. You must supply context another way (e.g. a wrapper that sets `recordId`, or leave `graphApiName` blank and accept that graph mode may not apply without a valid Id passed by your hosting pattern). For Home/App, the meta file exposes only **data source** and **card label** properties; theme and field paths use **JavaScript defaults** unless you extend the bundle.

## 5. Optional autolaunched Flow

1. Create an **autolaunched** Flow with an input such as `recordId` (type **Record** or **Text** Id—match your variable type to what `Flow.Interview` accepts).
2. Compute **prediction** (text) and **recommendations** (Text containing JSON array, or a type Apex can serialize to JSON).
3. In the component, set:
   - **Flow API name**
   - **Flow input variable** name (default `recordId`)
   - **Flow output** variable names for prediction and recommendations (defaults `prediction`, `recommendations`)

Flow failures are **swallowed** in Apex so CRM + graph data still render; check debug logs if Insight looks empty.

## 6. Optional Einstein prompt template

See [PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md). Set **Prompt template Id or API name** and ensure **Auto-generate AI summary** is on (default in meta).

## 7. Smoke test checklist

- [ ] Open an Account with known CRM fields → Overview shows Name, billing/standard fields after SOQL merge.
- [ ] With `graphApiName` set and NC valid → graph-backed fields appear (tiers, scores, balances as mapped).
- [ ] With `graphApiName` blank → no callout error; CRM-only profile still loads.
- [ ] Insight tab: prediction appears after Flow; summary appears after template is configured.
- [ ] Theming: change accent hex in App Builder → header/accents update after refresh.

## 8. Field mappings

Default **field path** properties assume keys that match a **flattened or nested** JSON object returned from the graph API. Adjust each **Path: …** property to dot paths that match **your** graph payload (see [DATA_GRAPH.md](DATA_GRAPH.md)).

---

**Next:** [DATA_GRAPH.md](DATA_GRAPH.md) for payload construction · [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if something fails.
