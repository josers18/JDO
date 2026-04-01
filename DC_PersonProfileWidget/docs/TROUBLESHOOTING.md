# Troubleshooting — Customer Profile Widget

## Deploy / metadata

| Symptom | Cause | Fix |
|---------|--------|-----|
| `LWC1503` invalid public property `data*` | Property name starts with `data` | Use **`graphApiName`** only (already fixed in this bundle). |
| `propertyGroup` target not supported | Org or metadata type limitation | This repo **flattens** properties; use label prefixes in App Builder. |
| Apex compile errors on deploy | API version mismatch | Project uses **62.0**; org can be higher—usually fine. |

## Runtime — graph

| Symptom | Cause | Fix |
|---------|--------|-----|
| `invalid_request` / **`scope parameter not supported`** | **Scope** set on External Credential **D360** | Clear **Scope** on D360 (client-credentials to Salesforce must not send `scope` on the token request). Set **`api`** on the **Connected App** scopes instead. |
| `invalid_grant` / `request not supported on this domain` (OAuth token) | Token URL uses **`login.salesforce.com`** instead of **My Domain** | Set External Credential **D360** token URL to `https://<instanceUrl-host>/services/oauth2/token`; re-auth principal. See [SETUP.md §2a](SETUP.md). |
| Toast: Data Graph / Named Credential | NC missing, wrong URL, or auth failure | Create **`DataCloud`** NC; test callout with a simple GET. |
| HTTP 404 on graph path | API version or resource path changed | Compare with current **SSOT Data Graph** REST docs; update path in `fetchDataGraphRecord`. |
| Empty graph fields but no error | Wrong **graph API name** or paths | Verify name; adjust **Path: …** properties to match JSON (use dot paths). |
| Wrong record | `recordId` is CRM Id; graph expects another key | Align Data Graph identity to CRM Id or add integration layer. |

## Runtime — CRM

| Symptom | Cause | Fix |
|---------|--------|-----|
| Only partial data | SOQL only fills **blank** graph fields | Expected; graph wins when present. |
| Contact vs Account | Id type | Apex branches on `recordId` sObject type. |

## Runtime — Flow

| Symptom | Cause | Fix |
|---------|--------|-----|
| No prediction on Insight | Flow not configured or failed silently | Set **`flowApiName`**; check **debug logs** (errors swallowed in Apex). |
| Wrong variable names | Mismatch with component properties | Match **Flow input/output** names to designer fields. |

## Runtime — Einstein

| Symptom | Cause | Fix |
|---------|--------|-----|
| Summary error text | Template Id wrong or input API name mismatch | Match **`promptInputApiName`** to template; verify Einstein entitlements. |
| No summary | **`promptTemplateId`** blank or **`autoGenerateSummary`** false | Set template Id; leave auto summary on. |

## Runtime — permissions

| Symptom | Cause | Fix |
|---------|--------|-----|
| “Couldn’t access the credential(s)” / external credential **D360** | Running user lacks **External Credential Principal** access | Assign **`Customer_Profile_Widget_DC_Callout`** (or add **D360** / **DataCloud_Integration** principal to your perm set). |
| Insufficient privileges (Apex) | No class access | Assign **`Customer_Profile_Widget_User`**. |
| Principal deploy fails (`invalid cross reference`) | Org has no External Credential **D360** or different principal name | Deploy only **Customer_Profile_Widget_User**, or edit `Customer_Profile_Widget_DC_Callout.permissionset-meta.xml` to match your EC API name and principal parameter. |

## UI

| Symptom | Cause | Fix |
|---------|--------|-----|
| Bars don’t animate | No data or zero widths | Signal rows need scores; animation runs 400 ms after load. |
| Tab missing | Visibility property false | Set **`show…Tab`** unset or true. |

---

[SETUP.md](SETUP.md) · [DATA_GRAPH.md](DATA_GRAPH.md)
