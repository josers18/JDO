# Flow guide — DC AgentForce Output

The LWC runs an **autolaunched** flow and reads **Text** outputs (and optionally a **generation Id**). The flow itself is built **in the org**; this repo includes a **sample** flow you can replace or clone.

---

## Contract overview

| Direction | Designer label (configurable) | Flow type | Purpose |
|-----------|------------------------------|-----------|---------|
| **Input** | Flow input: record variable (default `recordID`) | **Record** (single) **SObject** | Current page record, passed as a real **SObject** (Id-only row from Apex). |
| **Output** | Flow output: response variable (default `promptResponse`) | **Text** | Main body shown in the component. |
| **Output** | Flow output: generation Id variable (optional) | **Text** | Models API generation Id for thumbs feedback. |

**Important:** The Record input variable’s **object type** in Flow (e.g. Account) must match the **object type of the Lightning record page**. Mismatch causes Flow runtime errors.

---

## Apex and the Record input

`DcAgentforceOutputController` does **not** pass a string Id into a Record variable. It runs:

`SELECT Id FROM <ObjectApiName> WHERE Id = :recordId LIMIT 1`

and puts the resulting **SObject** into the interview input map under your configured variable name (default `recordID`). Your Flow variable API name must match **exactly** (case-sensitive).

---

## promptResponse (display text)

- Use a **Text** variable marked as **Output**.
- If your Gen AI / Prompt action stores output in an internal variable, add an **Assignment** to copy it into `promptResponse` (or whatever name you set in App Builder).

---

## generation Id (thumbs feedback)

1. Create a **Text** output variable (e.g. `generationId`).
2. After the step that returns a **generation Id** from Einstein / Models API, assign that value into the output variable.
3. In App Builder, set **Flow output: generation Id variable** to that variable’s API name.

If this is blank or the flow does not assign a value, **thumbs stay disabled** and the tooltip explains why.

---

## Sample flow in repo

**DC_Agentforce_Output_Prompt** (autolaunched):

- Input: `recordID` — SObject, object type **Account** (change in metadata/Flow to match your page).
- Output: `promptResponse` — placeholder string until you wire a real prompt step.

Edit the flow in Setup, add your production logic, and point the LWC **Autolaunched Flow API name** at your flow.

---

## Output format vs Flow

The flow always returns **strings** for the configured outputs. The LWC decides how to render:

- **auto** — Detect HTML vs Markdown vs plain text heuristically.
- **text** / **html** / **markdown** — Force a mode (Markdown is parsed client-side).

---

## Testing the flow alone

Use Flow **Run** / debug with a valid record Id, or anonymous Apex with `Flow.Interview`, and confirm:

1. `promptResponse` is non-empty when you expect.
2. `generationId` (if used) matches what `submitFeedback` expects.

---

## See also

- [REQUIREMENTS.md](REQUIREMENTS.md) — Models API / Einstein prerequisites
- [ARCHITECTURE.md](ARCHITECTURE.md) — sequence diagrams
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — Flow errors
