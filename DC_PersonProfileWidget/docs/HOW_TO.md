# How-to guide — Customer Profile Widget

Step-by-step recipes for admins and builders. For Flow variable details see [FLOW_GUIDE.md](FLOW_GUIDE.md); for every property see [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md).

---

## How to deploy the package

1. Open a terminal in the project folder: `cd DC_PersonProfileWidget`.
2. Authenticate if needed: `sf org login web --alias my-org --set-default`.
3. Deploy: `sf project deploy start --source-dir force-app --target-org my-org --wait 10`.
4. Confirm **Succeeded** in the CLI output.

See [DEPLOY.md](DEPLOY.md) for scope, remote sites, and optional metadata.

---

## How to grant access

1. In **Setup**, open **Permission Sets**.
2. Open **Customer_Profile_Widget_User**.
3. **Manage Assignments** → add users or groups who should see the widget.
4. Optional: assign **Customer_Profile_Widget_DC_Callout** only if you use the shipped **D360** / **DataCloud** Named Credential for other integrations (not required for SOQL + Flow).

CLI example:

```bash
sf org assign permset --name Customer_Profile_Widget_User --target-org my-org --on-behalf-of user@company.com
```

---

## How to add the widget to a record page

1. **Setup** → **User Interface** → **Lightning App Builder** (or edit an app and open a record page).
2. Open an **Account** or **Contact** record page.
3. Drag **Customer Profile Widget** from the custom components list into a region.
4. **Save**, then **Activate** (or assign the page to the app and profile as your org requires).
5. Open a live Account or Contact record and confirm the card loads.

`recordId` is injected automatically on record pages; no manual binding.

---

## How to run SOQL-only (no Flow)

1. Leave **Profile assembly flow API name** blank.
2. Leave all **[Asm flow output]** fields blank.
3. Optionally set **[Data source] Core custom fields (JSON object)** to map extra Account/Contact fields (see [samples/core-custom-fields.sample.json](samples/core-custom-fields.sample.json)).
4. Save and reload the record.

---

## How to wire a profile assembly Flow

1. Build an **autolaunched** Flow with an input for the current record Id (API name e.g. `recordId`).
2. Add **Assignments** (and Get Records, formulas, etc.) that set **output variables** for the slots you need.
3. In App Builder, set **Profile assembly flow API name** to that Flow’s API name.
4. For each slot, either:
   - Fill the matching **[Asm flow output] …** field with the Flow output variable **API name**, or  
   - Use **Profile output map JSON (advanced)** (see [samples/profile-output-map.sample.json](samples/profile-output-map.sample.json)).
5. Save, activate the page, test with a record that satisfies the Flow’s logic.

SOQL still **fills blank** fields the Flow does not set.

---

## How to add Insight predictions and recommendations

1. Create an **autolaunched** Flow with `recordId` (or your chosen input name) and outputs for prediction text and recommendations (JSON string or serializable collection).
2. Set **Autolaunched flow API name (predictions)** and the **Flow output** property names to match your variables (defaults `prediction` / `recommendations`).
3. To run **one** Flow for both profile assembly and predictions, use the **same** API name for assembly and prediction and configure all outputs on that Flow.

---

## How to enable Einstein summary on Insight

1. Create a **Prompt template** with a text input whose API name matches **Prompt template text input API name** (default `Input:Prediction_Context`).
2. Set **Prompt template Id or API name** on the component.
3. Leave **Auto-generate AI summary** on unless you want to disable generation.

Payload shape: [PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md).

---

## How to drive the three AI Signals rings from Flow

1. For each ring (1–3), set **Inference flow API name** to an autolaunched Flow that outputs a **numeric** value.
2. Match **Flow input: record Id** and **Flow output: prediction** to your Flow variables (defaults `recordId` / `prediction`).
3. Choose **Output format**: `percent`, `integer`, `decimal`, or `currency`; optional **Ring scale max** for non-percent modes.
4. Leave a gauge’s Flow blank to use **propensity / engagement / churn** from profile data (assembly or SOQL).

---

## How to show accounts on the Portfolio tab

1. Prefer a Flow output mapped to **`financialAccounts`** (Text JSON array). Shape: [samples/financial-accounts.sample.json](samples/financial-accounts.sample.json).
2. If empty, the UI falls back to investment/loan placeholders from profile fields.

---

## How to get a map pin (Location tab)

1. **Option A:** Map **`mapLatitude`** / **`mapLongitude`** from the assembly Flow.
2. **Option B:** Leave coordinates blank, keep **[Location] Geocode billing address for map** on, and ensure **Remote Site Settings** for Nominatim and Photon are deployed (see [DEPLOY.md](DEPLOY.md)).
3. **Option B** calls external geocoders from Apex (skipped in tests).

---

## How to change the visual theme

1. On a **record** page instance, open the component properties.
2. Set **Theme** (`themeMode`) to a preset (obsidian, ivory, glacier, etc.).
3. Optionally override individual **[Theme]** hex fields; unchanged fields use preset defaults.
4. **Save** and **Activate** the page, then hard-refresh the live record (App Builder preview and runtime can cache differently).

---

## How to use App / Home pages

1. Add the component to an **App** or **Home** page.
2. Note: the target config exposes a **reduced** property set (data source, labels, theme, typography). There is no automatic `recordId`; supply context via a wrapper or accept placeholder state.
3. For a full experience, use **Account** or **Contact** record pages.

---

**Next:** [SETUP.md](SETUP.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [INDEX.md](INDEX.md)
