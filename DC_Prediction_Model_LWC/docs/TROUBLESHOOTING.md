# Troubleshooting

Quick reference for **Prediction Model** (`classificationModelLwc`) and **`ClassificationModelLwcController`**. **Git / repo path:** [GIT.md](GIT.md).

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

## Gauge shows but lists are empty

- **Flow output variable names** in App Builder must match what the flow assigns (`prediction`, `factors`, `recommendations` by default).
- `factors` / `recommendations` must be a **JSON array** (or a string that parses to one). See [FLOW_GUIDE.md](FLOW_GUIDE.md).

---

## Toast: “AI summary failed”

- **Einstein Generative AI** not enabled or user lacks template access.
- **Prompt template Id or API name** incorrect; try Id vs API name.
- **Prompt template text input API name** does not match the template (must match flex input, e.g. `Input:Prediction_Context`).
- Inspect the toast / Apex message for `ConnectApi` or permission errors.

---

## Gauge color does not change when editing properties

- Perform a **full browser refresh** after deploy; stale inline styles were addressed in recent versions—ensure latest bundle is deployed.
- **Reverse arc colors** has little visible effect near **50%**; test with scores near **0** or **100**.

---

## Deploy errors (Apex tests)

If the org requires tests but you only deploy this project, run commands from the DX root **`DC_Prediction_Model_LWC`** (see [GIT.md](GIT.md)):

```bash
cd JDO/DC_Prediction_Model_LWC   # or your standalone project root
sf project deploy start --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests ClassificationModelLwcControllerTest \
  --wait 30
```

For sandboxes that allow no tests:

```bash
sf project deploy start --source-dir force-app --test-level NoTestRun --wait 30
```

(Subject to org policy.)

---

## Component not available on a record page

The metadata `<objects>` section may list only **Account**. Add your object to `classificationModelLwc.js-meta.xml` and redeploy. See [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md).
