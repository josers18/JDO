# Troubleshooting

Common issues when using **DC AgentForce Output**.

---

## Error: no access to Apex class (`DcAgentforceOutputController` or `LlmOutputSanitizer`)

Assign permission set **DC AgentForce Output User** (`DC_AgentForce_Output_User`) or enable both classes on the user’s **profile** (**Apex Class Access**). See [SETUP_GUIDE.md](SETUP_GUIDE.md).

---

## Flow does not run / “Flow not found”

- Confirm the flow **API name** in App Builder matches an **active** autolaunched flow.
- Confirm the flow type is **Autolaunched** (not screen flow).

---

## “Variable does not exist” or Flow interview errors

- **Flow input: record variable** must match the Flow input variable API name **exactly** (case-sensitive).
- **Record** variable object type in Flow must match the **page object** (e.g. Account page → Account SObject in Flow).

---

## Empty output

- Confirm the flow assigns a value to the **Text** output you configured as **Flow output: response variable**.
- Run the flow in Flow debugger with a real record Id to verify outputs.

---

## Thumbs disabled

- **Flow output: generation Id variable** must be set and the flow must assign a non-empty **generation Id** after the prompt step.
- User may lack **Models API** / Einstein feedback permission — check Apex debug or toast message.

---

## Thumbs error toast

- Verify `aiplatform.ModelsAPI.submitFeedback` is allowed for the user and the Id is still valid for feedback.
- Check **Debug Logs** for `DcAgentforceOutputController.submitGenerationFeedback`.

---

## Markdown not rendering / “marked” errors

- Confirm static resource **marked** deployed and **View All** / CDN not blocking `loadScript`.
- Try **Output format** = **text** to confirm Apex returns content; then switch back to **markdown**.

---

## HTML looks stripped or wrong

- **lightning-formatted-rich-text** sanitizes markup. Unsupported tags are removed by design.
- Use **text** mode for literal angle brackets if you are not intending HTML.

---

## Copy does nothing

- Try **Expand** then use copy from the expand modal, or the **Copy** button in the small copy modal (nested-modal / clipboard policy workaround).
- Some browsers require a user gesture; the buttons are wired as clicks.

---

## Print blank or blocked

- Disable popup blockers for the Salesforce domain for the blob-window fallback.
- Try again after output has finished loading.

---

## Title color not applied

- Use `#RRGGBB` or `#RGB` only (optional `#RRGGBBAA`). No spaces.
- Hard refresh after changing App Builder properties.

---

## Wrong icon

- Use `namespace:name` (e.g. `utility:einstein`). Invalid names fall back to `utility:agent_astro`.

---

## Still stuck

Collect:

1. Flow API name and variable API names (screenshot of Flow resources + App Builder).
2. Apex debug log for `DcAgentforceOutputController.runPromptFlow`.
3. Browser console errors (F12) when reproducing.

See [FLOW_GUIDE.md](FLOW_GUIDE.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
