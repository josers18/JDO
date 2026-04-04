# Deploy — Business Profile Widget

Install the **Business Profile Widget** into a Salesforce org using **Salesforce CLI** (`sf`) or your normal pipeline (change set, CI) with the same metadata.

---

## Prerequisites

- [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) installed.  
- Access to the target org.  
- Local path: **`DC_BusinessProfileWidget`**.

---

## Deploy

```bash
cd DC_BusinessProfileWidget
sf org login web --alias my-org --set-default   # if needed
sf project deploy start --source-dir force-app --target-org my-org --wait 10
```

Wait for **Succeeded**.

---

## What deploys

| Type | Name | Notes |
|------|------|--------|
| LWC | `businessProfileWidget` | Record, App, Home targets |
| Apex | `BusinessProfileWidgetController` | `with sharing` |
| Apex | `BusinessProfileWidgetControllerTest` | Tests |
| Remote sites | Nominatim, Photon | Geocoding (optional if geocode off) |

This package does **not** ship a permission set. Grant **Apex class access** to `BusinessProfileWidgetController` via profiles or permission sets. See [SETUP.md](SETUP.md).

---

## If deploy fails

- **Compile errors:** Confirm org API version supports the project (metadata **62.0**).  
- **Test failures:** Run `sf apex run test --tests BusinessProfileWidgetControllerTest --synchronous`.

---

[SETUP.md](SETUP.md) · [README.md](../README.md)
