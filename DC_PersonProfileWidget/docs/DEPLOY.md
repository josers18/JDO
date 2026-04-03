# Deploy — Customer Profile Widget

This page explains **how to install** the widget into a Salesforce org. You need someone who can run **Salesforce CLI** (`sf`) on a computer, or use your team’s normal deployment process (pipeline, change set, etc.) with the same files.

---

## Before you start

- **Salesforce CLI** installed ([install guide](https://developer.salesforce.com/tools/salesforcecli)).  
- **Access** to log in to the target org (sandbox or production, per your policy).  
- This repo folder on disk: **`DC_PersonProfileWidget`**.

---

## Simple install (three steps)

1. **Open a terminal** and go to the project folder:

   ```bash
   cd DC_PersonProfileWidget
   ```

2. **Log in** to the org if you have not already (example):

   ```bash
   sf org login web --alias my-org --set-default
   ```

3. **Deploy** everything under `force-app`:

   ```bash
   sf project deploy start --source-dir force-app --target-org my-org --wait 10
   ```

Wait until the command prints **Succeeded**. If it fails, see **If deploy fails** below.

---

## What this deploy puts in your org

| What | Why it matters |
|------|----------------|
| **Customer Profile Widget** (Lightning Web Component) | The card you add in App Builder |
| **CustomerProfileWidgetController** (Apex) + test class | Loads data for the card |
| **Customer_Profile_Widget_User** (permission set) | **Required.** Users need this to use the widget |
| **Customer_Profile_Widget_DC_Callout** (permission set) | **Optional.** Only if you use the bundled Data Cloud–style Named Credential elsewhere |
| **Remote sites** (Nominatim, Photon) | Lets the map **look up coordinates** from a billing address when you leave that option on |
| **Connected App / External Credential / Named Credential** (if in package) | **Optional** integration pieces; the widget does not require them for normal Account/Contact + Flow use |

---

## After deploy (do not skip)

1. Assign **Customer_Profile_Widget_User** to everyone who should see the widget.  
2. Open **[SETUP.md](SETUP.md)** and add the component to a Lightning page, then **Save** and **Activate**.

---

## Tests in production orgs

The command above does **not** run tests. Some orgs require tests on deploy. Ask your Salesforce team which rule applies. Examples:

```bash
# Run only this project’s test class (if your policy allows)
sf project deploy start --source-dir force-app --target-org my-org --test-level RunSpecifiedTests --tests CustomerProfileWidgetControllerTest --wait 30

# Run many tests (slower)
sf project deploy start --source-dir force-app --target-org my-org --test-level RunLocalTests --wait 30
```

---

## Map and “geocoding” (billing address → pin)

If the **Location** tab should place a pin from the **billing address** when you do not pass latitude/longitude from a Flow:

- Keep **Geocode billing address for map** turned on in the component (default).  
- Make sure the **Nominatim** and **Photon** remote sites from this project exist in the org (they deploy with `force-app`).

To **avoid** any external address lookup: turn **Geocode billing address for map** **off** and supply coordinates from a Flow instead.

---

## If deploy fails

| Situation | What to do |
|-----------|------------|
| Error about **External Credential** or **D360** | Your org may not have that credential. Deploy without the optional permission set **Customer_Profile_Widget_DC_Callout**, or ask a developer to align the permission set XML with your org. |
| You only want the widget, not Data Cloud extras | Deploy `force-app` but exclude optional Connected App / credential files if your process allows, or fix errors in Setup after deploy. |
| “Insufficient access” | Your user needs permission to deploy metadata in that org. |

More symptoms: **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**.

---

## Related links

- [README.md](../README.md) — Product overview  
- [SETUP.md](SETUP.md) — Next steps after deploy  
- [GIT.md](GIT.md) — Repo location
