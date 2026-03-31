# Setup guide

Deploy **DC AgentForce Output** and place it on a Lightning page.

---

## 1. Prerequisites

- Salesforce CLI (`sf`) authenticated to your org.
- Org meets [REQUIREMENTS.md](REQUIREMENTS.md).

---

## 2. Deploy the package

From the folder that contains `sfdx-project.json`:

```bash
cd DC_AgentForce_Output_LWC
sf project deploy start --source-dir force-app
```

Or deploy the whole `force-app` tree from your IDE / pipeline.

Verify:

- Apex classes **DcAgentforceOutputController**, **LlmOutputSanitizer**, test class.
- LWCs **dcAgentforceOutputLwc**, **dcAgentforceOutputModal**, **dcAgentforceCopyModal**.
- Static resource **marked**.
- Sample flow **DC_Agentforce_Output_Prompt** (optional; replace with your production flow).
- Permission set **DC AgentForce Output User** (`DC_AgentForce_Output_User`) for Apex class access.

---

## 3. Grant Apex access (standard users)

Users who open pages with **DC AgentForce Output** need access to **`DcAgentforceOutputController`** and **`LlmOutputSanitizer`** (the controller calls the sanitizer).

1. Deploy this project (includes permission set **DC AgentForce Output User**).
2. **Setup → Permission Sets → DC AgentForce Output User → Manage Assignments** and add users or groups.

Without this, users may see errors such as *You do not have access to the Apex class named 'DcAgentforceOutputController'*.

---

## 4. Build or update the autolaunched flow

1. Open **Setup → Flows**.
2. Create or edit an **Autolaunched** flow (no screens).
3. Add a **Record** variable input (single SObject) with API name matching App Builder (e.g. `recordID`). Set object type to match your target page (e.g. Account).
4. Add your Gen AI / assignment logic.
5. Expose a **Text** output for the body (e.g. `promptResponse`).
6. Optionally expose a **Text** output for **generation Id** and assign it from your prompt step.
7. **Activate** the flow.

See [FLOW_GUIDE.md](FLOW_GUIDE.md) for the full contract.

---

## 5. Add the component to a Lightning page

1. **Setup → Lightning App Builder** (or edit a page from the record).
2. Drag **DC AgentForce Output** onto the layout.
3. Configure:

   | Setting | Typical value |
   |---------|----------------|
   | **Autolaunched Flow API name** | Your flow’s API name |
   | **Flow input: record variable** | Must match Flow (e.g. `recordID`) |
   | **Flow output: response variable** | Must match Flow (e.g. `promptResponse`) |
   | **Flow output: generation Id variable** | Your output API name, or leave blank |
   | **Pass record to flow** | On for record pages |
   | **Auto-run flow on load** | On if you want immediate run |
   | **Output format** | `auto` until you know content type |

4. Save and **activate** the page (if required).

---

## 6. Record page object coverage

`dcAgentforceOutputLwc.js-meta.xml` lists **Account** under record page objects. To use **Contact**, **Opportunity**, etc., add `<object>Contact</object>` (etc.) to `targetConfigs` for `lightning__RecordPage` and redeploy.

---

## 7. Smoke test

1. Open a record page with the component.
2. Click **Run** (or wait for auto-run).
3. Confirm text appears; try **Copy**, **Expand**, **Print**.
4. If generation Id is wired, confirm **thumbs** enable and a successful toast (or check debug if permission errors).

---

## See also

- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)
