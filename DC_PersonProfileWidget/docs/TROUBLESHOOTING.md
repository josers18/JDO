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
| Insufficient privileges | No Apex class access | Permission set with `CustomerProfileWidgetController`; see [SETUP.md](SETUP.md). |

## UI

| Symptom | Cause | Fix |
|---------|--------|-----|
| Bars don’t animate | No data or zero widths | Signal rows need scores; animation runs 400 ms after load. |
| Tab missing | Visibility property false | Set **`show…Tab`** unset or true. |

---

[SETUP.md](SETUP.md) · [DATA_GRAPH.md](DATA_GRAPH.md)
