# Troubleshooting

Quick reference for **Multiclass Prediction** (`multiclassPredictionLwc`) and **`MulticlassPredictionLwcController`**. **Git / repo path:** [GIT.md](GIT.md).

---

## Widget is empty / never loads

| Cause | Fix |
|-------|-----|
| Not on a **record** page (or no `recordId`) | Flow only runs when `recordId` is set. Home and many App pages do not supply it. |
| **Autolaunched flow API name** missing or wrong | Set exact API name in App Builder; flow must be **Active**. |
| Flow input variable name mismatch | **Flow input variable for record Id** must match the flow’s input (default `recordId`). |

---

## Toast: “Could not run prediction flow”

- Confirm the user has **Run Flow** permission.
- Open the flow in Flow Builder and **Run** with the same record Id to see faults.
- Check that the flow type is **Autolaunched** (not Screen Flow).
- Verify the org has access to any subflows, Apex, or objects the flow uses.

---

## Class label shows but recommendations are empty

- **Flow output variable names** in App Builder must match what the flow assigns (`recommendations` by default).
- `recommendations` must be a **JSON array** (or a string that parses to one). See [FLOW_GUIDE.md](FLOW_GUIDE.md).

---

## Class label looks wrong (underscores, codes)

- Turn on **Humanize class label for display** in App Builder, or change the flow to output a display-friendly string and set humanize to **false** to show it verbatim.

---

## Recommendation labels cramped or chart too narrow

- Widen the **Lightning page column** or place the component in a wider region; labels use up to **50%** / **22rem** before wrapping, and below **420px** container width the layout **stacks** label above the chart.
- Full text still appears on **hover** via the `title` attribute on the label span.

---

## Toast: “AI summary failed”

- **Einstein Generative AI** not enabled or user lacks template access.
- **Prompt template Id or API name** incorrect; try Id vs API name.
- **Prompt template text input API name** does not match the template (must match flex input, e.g. `Input:Prediction_Context`).
- Inspect the toast / Apex message for `ConnectApi` or permission errors.

---

## Deploy errors (Apex tests)

If the org requires tests but you only deploy this project, run commands from the DX root **`DC_Multiclass_Prediction_LWC`** (see [GIT.md](GIT.md)):

```bash
cd JDO/DC_Multiclass_Prediction_LWC   # or your standalone project root
sf project deploy start --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests MulticlassPredictionLwcControllerTest \
  --wait 30
```

For sandboxes that allow no tests:

```bash
sf project deploy start --source-dir force-app --test-level NoTestRun --wait 30
```

(Subject to org policy.)

---

## Component not available on a record page

The metadata `<objects>` section may list only **Account**. Add your object to `multiclassPredictionLwc.js-meta.xml` and redeploy. See [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md).

---

## More documentation

- [UI_LAYOUT.md](UI_LAYOUT.md) — class hero, recommendation rows, CSS overview
- [ARCHITECTURE.md](ARCHITECTURE.md) — sequence and data flow
