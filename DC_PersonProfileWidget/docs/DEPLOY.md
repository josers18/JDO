# Deploy — DC Person Profile Widget

## Standard deploy

From the `DC_PersonProfileWidget` directory:

```bash
sf project deploy start --source-dir force-app --target-org <alias> --wait 10
```

Deploys:

- LWC bundle `customerProfileWidget`
- Apex `CustomerProfileWidgetController` + test class
- Permission sets `Customer_Profile_Widget_User`, `Customer_Profile_Widget_DC_Callout`
- Optional: Connected App, External Credential **D360**, Named Credential **DataCloud**
- Remote Site Settings: **Nominatim_OpenStreetMap**, **Photon_Komoot_Geocoder** (for billing-address geocoding)

## Tests

The default command above does not run tests. For production pipelines, add your org’s required test level, for example:

```bash
sf project deploy start --source-dir force-app --target-org <alias> --test-level RunLocalTests --wait 30
```

(or `RunSpecifiedTests` with `CustomerProfileWidgetControllerTest` if your policy allows).

## Remote sites and geocoding

If **`geocodeBillingAddress`** is true (default), Apex calls public geocoders **only when** lat/long are not already on `ProfileResult` and the org is not running tests.

- Ensure **Nominatim** and **Photon** remote sites are deployed **or** create equivalent Remote Site Settings in the target org.
- Turn off geocoding per component: **[Location] Geocode billing address for map** = false.

## Optional metadata failures

Deploying **Customer_Profile_Widget_DC_Callout** can fail if External Credential **D360** does not exist in the target org. Options:

- Deploy without that permission set, or  
- Edit the permission set XML to reference credentials that exist in your org, or  
- Remove optional Connected App / External Credential / Named Credential from the deploy manifest if you do not use them.

## After deploy

1. Assign **Customer_Profile_Widget_User** to users.  
2. Complete [SETUP.md](SETUP.md) (pages, optional Flows, prompt template).

---

[README.md](../README.md) · [GIT.md](GIT.md)
