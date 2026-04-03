# Troubleshooting — Customer Profile Widget

## Deploy / metadata

| Symptom | Cause | Fix |
|---------|--------|-----|
| `propertyGroup` target not supported | Org or metadata type limitation | This repo **flattens** properties; use label prefixes in App Builder. |
| Apex compile errors on deploy | API version mismatch | Project uses **62.0**; org can be higher—usually fine. |

## Runtime — assembly / prediction Flow

| Symptom | Cause | Fix |
|---------|--------|-----|
| Toast: Profile assembly flow failed | Wrong API name, missing input, or bad output map JSON | Confirm autolaunched flow, **record Id** input name, and **Profile output map** keys + output variable API names. |
| Empty slot though Flow sets it | Output variable API name mismatch (case) | Apex tries common case variants; align names with the map. |
| **`nearbyBranches`** not parsing | Output is not a JSON array string or list | Use a **Text** output with `[{ "name":"...", ... }]` or a serializable collection. |
| No prediction on Insight | Prediction Flow not configured or failed silently | Set **`flowApiName`**; check **debug logs** (errors swallowed in Apex). |
| Wrong variable names | Mismatch with component properties | Match **Flow input/output** names to designer fields. |

## Runtime — CRM

| Symptom | Cause | Fix |
|---------|--------|-----|
| Only partial data | SOQL only fills **blank** fields after assembly Flow | Expected when assembly Flow is set: Flow values win; SOQL fills gaps. |
| Contact vs Account | Id type | Apex branches on `recordId` sObject type. |
| Custom fields missing | Not in **Core custom fields JSON** or not accessible | Add logical key → field API name; check FLS. |

## Runtime — Einstein

| Symptom | Cause | Fix |
|---------|--------|-----|
| Summary error text | Template Id wrong or input API name mismatch | Match **`promptInputApiName`** to template; verify Einstein entitlements. |
| No summary | **`promptTemplateId`** blank or **`autoGenerateSummary`** false | Set template Id; leave auto summary on. |

## Runtime — permissions

| Symptom | Cause | Fix |
|---------|--------|-----|
| Insufficient privileges (Apex) | No class access | Assign **`Customer_Profile_Widget_User`**. |
| External credential errors (optional NC metadata) | Using shipped **D360** / **DataCloud** for other callouts | Assign **`Customer_Profile_Widget_DC_Callout`** or fix principal names in metadata. |
| Principal deploy fails (`invalid cross reference`) | Org has no External Credential **D360** | Deploy only **Customer_Profile_Widget_User**, or edit `Customer_Profile_Widget_DC_Callout.permissionset-meta.xml` to match your org. |

## UI

| Symptom | Cause | Fix |
|---------|--------|-----|
| Bars don’t animate | No data or zero widths | Signal rows need scores; animation runs 400 ms after load. |
| Tab missing | Visibility property false | Set **`show…Tab`** unset or true. |
| Theme correct in App Builder preview, wrong on live record | Page not activated, browser cache, or old bundle | **Save** and **Activate** the Lightning page; hard-refresh or clear cache; redeploy the LWC. The component applies **`themeMode`** on a microtask and sets variables on **host + `.wp-shell`**—if live still mismatches, confirm the activated assignment is the page you edited. |
| Map shows fallback | No coordinates + geocode off or remote sites missing | Set Flow **`mapLatitude`/`mapLongitude`**, or enable geocoding and deploy **Nominatim** / **Photon** remote sites. |

---

[SETUP.md](SETUP.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
