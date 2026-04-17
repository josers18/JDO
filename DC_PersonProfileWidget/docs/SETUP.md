# Setup guide — Customer Profile Widget

Follow these steps **after** the package is deployed to your org. If you have not deployed yet, start with **[DEPLOY.md](DEPLOY.md)**.

---

## 1. What you need in Salesforce

- **Lightning Experience** (not Classic).  
- A **Lightning record page** for **Account** and/or **Contact** where you want the card (recommended).  
- **Optional — AI summary on Insight:** Einstein Generative AI enabled where your contract allows, plus a **Prompt template** (see **[PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md)**).  
- **Optional — Overview Agentforce summary:** A second **Prompt template** (record context) and the **Agentforce summary** properties on the component; uses **`getAgentforceOverviewSummary`** (see **§6b** below and **[HOW_TO.md](HOW_TO.md)**).  
- **Optional — Overview Unified relationships:** An **`@InvocableMethod`** Apex class in the org (e.g. **`DC_UnifiedAccounts`**) that returns JSON or plain text; set **Unified relationships: Apex class API name** on the component (see **§6c**). **Not** a Flow—deprecated **flow** properties on older pages are ignored.  
- **Optional — Flow-driven data:** One or more **autolaunched** Flows (no screens). “Autolaunched” means the Flow runs in the background and can pass values **out** to the widget through **output variables**.

---

## 2. Give users access (required)

The widget calls a small piece of Apex code. Every user who should **see the card working** needs this permission set:

| Permission set | When to use it |
|----------------|----------------|
| **Customer_Profile_Widget_User** | **Always** assign this to users (or a public group) who use the widget. |

**Optional (most orgs skip this for the widget alone):**

| Permission set | When to use it |
|----------------|----------------|
| **Customer_Profile_Widget_DC_Callout** | Only if your team uses the optional **DataCloud** / **D360** Named Credential from this repo for **other** integrations. **Not** required for normal Account/Contact data and Flows. |

**In Setup (clicks):** Setup → **Permission Sets** → open **Customer_Profile_Widget_User** → **Manage Assignments** → add users or groups.

**Command line (optional):**

```bash
sf org assign permset --name Customer_Profile_Widget_User --target-org <alias> --on-behalf-of user@company.com
```

---

## 3. Put the widget on a Lightning page

1. Open **Lightning App Builder** (Setup → **User Interface** → Lightning App Builder, or edit an app and open a record page).  
2. Choose an **Account** or **Contact** **record** page.  
3. Drag **Customer Profile Widget** into a region.  
4. Adjust properties if needed (see **[COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)** or **[HOW_TO.md](HOW_TO.md)**).  
5. Click **Save**, then **Activate** (or complete your org’s usual activation steps so the right apps and profiles see the page).

**Record pages:** Salesforce automatically passes the current record to the widget. You do **not** wire **Record Id** by hand.

**App or Home pages:** There is no automatic customer record. The widget shows a reduced set of options; your team may need custom work to pass a record Id.

---

## 4. Optional — Flow that fills the card

1. Build an **autolaunched** Flow with an input for the open record (often named `recordId`).  
2. Use **Assignments** (and **Get Records**, formulas, subflows, etc.) to set **output variables** for the fields you want on the card.  
3. In the widget properties, set **Profile assembly flow API name** and map outputs using **[Asm flow output] …** fields and/or **Profile output map JSON (advanced)**.  
4. Any slot the Flow leaves **empty** can still be filled from **standard Salesforce fields** (query) if you configured those mappings.

More detail: **[FLOW_GUIDE.md](FLOW_GUIDE.md)**.

---

## 5. Optional — Flow for Insight (prediction + recommendations)

1. Autolaunched Flow with the record Id as input.  
2. Outputs: short **prediction** text and **recommendations** (often a text value containing a JSON list).  
3. In the widget, set **Autolaunched flow API name (predictions)** and the output variable names to match.

If this Flow **fails**, the rest of the card still tries to load; empty Insight usually means the Flow name is wrong or the Flow errored—your developer can check **debug logs**.

---

## 6. Optional — Einstein (two independent features)

### 6a. Insight tab AI summary

1. Create a **Prompt template** with a text input whose API name matches the widget (default **`Input:Prediction_Context`**).  
2. Set **Prompt template Id or API name** on the widget.  
3. Leave **Auto-generate AI summary** on unless you want to turn generation off.

Details: **[PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md)**.

### 6b. Overview Agentforce summary (above Contact)

1. Set **Agentforce summary: prompt template ID** (record page only).  
2. Optionally set **Agentforce summary: prompt input API name**; blank defaults by **Contact** vs **Account** (see **[COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)**).  
3. Leave **Auto-generate Agentforce summary** on unless you want to skip the extra Apex call.  
4. The same **Customer_Profile_Widget_User** Apex access covers **`getAgentforceOverviewSummary`**.

Use a template meant for **CRM record** context, not necessarily the same template as Insight. If the section is blank, read the **orange hint** under the card and **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**.

### 6c. Overview Unified relationships table (invocable Apex)

1. Deploy or install an Apex class with an **`@InvocableMethod`** that accepts the page record Id (default request variable **`id`**) and writes a **String** output (default **`queryResultJSON`**) with JSON rows or a plain message.  
2. Grant users **Apex class access** if your org restricts it (the same **`Customer_Profile_Widget_User`** permission set typically covers **`CustomerProfileWidgetController`**; ensure the **invocable** class is executable by the profile or a permission set).  
3. In App Builder, set **[Overview] Unified relationships: Apex class API name** and, if needed, the **invocable input** / **JSON output** API names to match your class.  
4. The widget calls **`getUnifiedRelationshipsQueryJson`** after profile load (and after optional Overview Agentforce). See **[HOW_TO.md](HOW_TO.md)** and **[APEX_REFERENCE.md](APEX_REFERENCE.md)**.

---

## 7. Quick checklist after setup

- [ ] Open a real **Account** or **Contact** — Overview shows expected name and fields.  
- [ ] If you use a profile Flow — custom values appear where mapped.  
- [ ] If you use Insight Flow — prediction text appears; if you use the Insight prompt template — summary appears on **Insight**.  
- [ ] If you use **Overview Agentforce** — narrative appears **above Contact** when the template is active.  
- [ ] If you use **Unified relationships** — table or message appears **below Relationship**; if blank, confirm the **Apex class API name** and invocable permissions.  
- [ ] Change **Theme** or accent color — save and activate the page, then refresh the live record (preview and live can differ until you activate).

---

**Next:** [HOW_TO.md](HOW_TO.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
