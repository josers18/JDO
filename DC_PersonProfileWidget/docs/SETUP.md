# Setup guide — Customer Profile Widget

Follow these steps after deploying `force-app` to your org.

## 1. Prerequisites

- Salesforce org with **Lightning Experience**.
- **Account** and/or **Contact** record pages where you want the card (or App/Home for summary-only placement).
- If you use **Data Graph**: Data Cloud provisioned, a **Data Graph** published, and API access from the CRM org you deploy into.
- If you use **Insight summary**: **Einstein Generative AI** and a **Prompt template** with a text input whose API name matches the component (default `Input:Prediction_Context`).
- If you use **Flow**: an **autolaunched** Flow that accepts the record Id and outputs prediction text plus recommendations (JSON string or serializable collection).

## 2a. OAuth token URL on External Credential (avoid `invalid_grant`)

If callouts fail with **`Unable to fetch the OAuth token`** / **`invalid_grant`** / **`request not supported on this domain`**, the External Credential’s **token endpoint** is almost certainly wrong.

- Do **not** use `https://login.salesforce.com/services/oauth2/token` for many My Domain / demo orgs.
- Set the token URL to **`https://<your-My-Domain-host>/services/oauth2/token`** — same host as **Setup → My Domain** or **`sf org display` → `instanceUrl`** for the org where the **Connected App** lives.

In metadata, this is **`AuthProviderUrl`** on **External Credential** `D360` (see `force-app/main/default/externalCredentials/D360.externalCredential-meta.xml`). The committed file uses the **Cumulus Financial Services** demo host; **replace it** when you deploy to another org (retrieve your org’s `D360`, edit, redeploy).

After changing the token URL, open **External Credential D360** in Setup and **re-authenticate** the **Named Principal** if the UI prompts you, then reload the record page.

**Do not set Scope on D360** for **Client Credentials** to the Salesforce token URL: sending a `scope` parameter causes **`invalid_request` / `scope parameter not supported`**. Define API access in the **Connected App → Selected OAuth Scopes** instead; leave **Scope** blank on the External Credential.

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

## 3. Permission sets (Apex + Data Cloud callout)

The project includes two permission sets under `force-app/main/default/permissionsets/`:

| API name | Purpose |
|----------|---------|
| **Customer_Profile_Widget_User** | **Apex class access** to `CustomerProfileWidgetController` (required for every org). |
| **Customer_Profile_Widget_DC_Callout** | **External Credential Principal** access for `D360-DataCloud_Integration` (required when using Named Credential **DataCloud** with External Credential **D360** and principal **DataCloud_Integration**). |

Deploy both and assign **both** to every user who should load the widget with graph callouts enabled.

If your External Credential or principal **API names differ**, edit `Customer_Profile_Widget_DC_Callout.permissionset-meta.xml` and change the `externalCredentialPrincipal` value to `YourExternalCredential-YourPrincipalParameterName`, then redeploy.

**Orgs without** External Credential **D360**: deploy and assign only **Customer_Profile_Widget_User** (SOQL-only mode), or create **D360** first, then deploy the DataCloud Callout permission set.

**CLI assign (example):**

```bash
sf org assign permset --name Customer_Profile_Widget_User --name Customer_Profile_Widget_DC_Callout --target-org <alias> --on-behalf-of user@company.com
```

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
