# How-to guide — Customer Profile Widget

Practical steps for **admins and business users**. You do **not** need to be a developer for most tasks. For Flow design details see **[FLOW_GUIDE.md](FLOW_GUIDE.md)**; for every App Builder field see **[COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)**.

---

## Deploy the package

**If you use the command line:** See **[DEPLOY.md](DEPLOY.md)** (login, deploy, what gets installed).

**If you do not use the command line:** Send **[DEPLOY.md](DEPLOY.md)** to your Salesforce admin or developer and ask them to deploy the `force-app` folder to your org (or use your company’s release process).

---

## Give people access

1. **Setup** → **Permission Sets** → **Customer_Profile_Widget_User**.  
2. **Manage Assignments** → add users or a public group.

Optional CLI:

```bash
sf org assign permset --name Customer_Profile_Widget_User --target-org my-org --on-behalf-of user@company.com
```

---

## Add the card to an Account or Contact page

1. **Lightning App Builder** → open the **Account** or **Contact** record page.  
2. Drag **Customer Profile Widget** into a column or section.  
3. **Save** → **Activate** (so users actually see the new page version).  
4. Open a live record and confirm the card loads.

You do **not** manually connect “Record Id”—Salesforce does that on record pages.

---

## Use Salesforce data only (no Flow)

1. Leave **Profile assembly flow API name** empty.  
2. Leave all **[Asm flow output]** fields empty.  
3. Optionally use **Core custom fields (JSON object)** to show extra Account/Contact fields (example: [samples/core-custom-fields.sample.json](samples/core-custom-fields.sample.json)).  
4. Save the page and refresh the record.

---

## Use a Flow to supply profile fields

1. Create an **autolaunched** Flow (no screens) with an input for the current record Id (often `recordId`).  
2. Set **output variables** for the data you want on the card.  
3. In App Builder, set **Profile assembly flow API name** to that Flow’s API name.  
4. For each slot, fill **[Asm flow output] …** with either **`flow:Variable_Api_Name`** (or **`flows:…`**) **or** a **Contact/Account field path** (e.g. `MailingCity`, `Account.Industry`). *Or* use **Profile output map JSON (advanced)** ([Flow sample](samples/profile-output-map.sample.json), [mixed SOQL + Flow](samples/profile-output-map-mixed.sample.json)).  
5. Save, activate, test.

Empty Flow outputs can still be filled from Salesforce **if** those fields exist on the record and you mapped them.

---

## Add Insight predictions and recommendations

1. Autolaunched Flow with record Id in, and outputs for **prediction** text and **recommendations** (often JSON as text).  
2. Set **Autolaunched flow API name (predictions)** and the output names in the widget (defaults are often `prediction` and `recommendations`).  
3. **Tip:** If the **same** Flow both builds the profile **and** sets prediction, use the **same** Flow API name in both places so Salesforce runs it once.

---

## Turn on the AI summary (Einstein)

1. Create a **Prompt template**; the text input API name should match the widget (default **`Input:Prediction_Context`**).  
2. Set **Prompt template Id or API name** on the widget.  
3. Keep **Auto-generate AI summary** on.

What gets sent to the template: **[PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md)**.

---

## Drive the three AI Signals rings with Flow

1. For ring 1, 2, or 3, set **Inference flow API name** to an autolaunched Flow that outputs a **number**.  
2. Match **Flow input: record Id** and **Flow output: prediction** to your Flow (defaults `recordId` / `prediction`).  
3. Pick **Output format** (percent, number, money, etc.).  
4. Leave a ring’s Flow blank to use scores already on the profile (from Salesforce or your profile Flow).

---

## Show accounts on the Portfolio tab

Best approach: map a Flow output to **financial accounts** as a JSON list ([example](samples/financial-accounts.sample.json)). If empty, the card falls back to simpler placeholders from balances on the profile.

---

## Fix the map (Location tab)

- **Option A:** Your Flow sets **latitude** and **longitude** outputs mapped in the widget.  
- **Option B:** Leave coordinates blank, keep **Geocode billing address for map** on, and ensure **remote sites** for address lookup deployed ([DEPLOY.md](DEPLOY.md)).

---

## Change colors or theme

1. Open the widget on the **record** page in App Builder.  
2. Set **Theme** to a preset (e.g. ivory, glacier).  
3. Optionally change individual color fields.  
4. **Save** and **Activate** the page, then do a **hard refresh** on a live record (browser preview can differ from what users see until activation).

---

## App or Home pages

You can add the widget, but **fewer properties** appear, and there is **no automatic** customer record. For the full experience, use **Account** or **Contact** record pages.

---

**Next:** [SETUP.md](SETUP.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [INDEX.md](INDEX.md)
