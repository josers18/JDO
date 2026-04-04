# Troubleshooting — Customer Profile Widget

**Start here:** Most “it works in App Builder but not for users” issues are fixed by **Save + Activate** on the Lightning page and a **browser refresh**. Next, confirm **Customer_Profile_Widget_User** is assigned.

---

## Deploy and packaging

| What you see | Likely cause | What to try |
|--------------|--------------|-------------|
| Metadata errors about **property groups** | Older org limitations | Ignore; this project lists properties with label prefixes in App Builder. |
| Apex compile errors | Rare version mismatch | Project targets API **62.0**; your org can be newer—usually still works. Ask a developer if deploy fails. |
| Deploy error about **D360** / **External Credential** | Optional credential not in org | Deploy without **Customer_Profile_Widget_DC_Callout**, or adjust metadata to your org. See **[DEPLOY.md](DEPLOY.md)**. |

---

## Flows (profile or Insight)

| What you see | Likely cause | What to try |
|--------------|--------------|-------------|
| Toast: **Profile assembly flow failed** | Wrong Flow API name, missing input, or bad JSON map | Flow must be **autolaunched**; record Id input name must match; **`flow:`/`flows:`** variables must exist on the Flow. |
| Field empty though Flow sets it | Output variable **API name** does not match the mapping | For Flow-backed slots use **`flow:VarName`**; check spelling/case. For SOQL slots, use a valid **field path** (see [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)). |
| Assembly Flow runs when you expected SOQL only | A mapping string is not a valid field path | Apex treats invalid paths as **legacy Flow** names. Fix the path or prefix Flow outputs with **`flow:`**. |
| **Branches** list missing or broken | Output is not valid JSON list | Use **Text** with a JSON array, or a collection Apex can serialize. [Sample](samples/nearby-branches.sample.json). |
| **Insight** has no prediction | Prediction Flow not set or Flow failed silently | Set **Autolaunched flow API name (predictions)**; developer checks **debug logs** (errors are not always shown to the user). |

---

## Salesforce data

| What you see | Likely cause | What to try |
|--------------|--------------|-------------|
| Some fields empty after using a profile Flow | **Expected** when Flow leaves them blank | Salesforce fills **only empty** slots when assembly Flow is on. |
| Wrong object type | Record is not Account/Contact | Widget is built for those objects. |
| Custom field missing | Not mapped or user cannot see field | Add to **Core custom fields** JSON; check field-level security. |

---

## Einstein / AI summary

| What you see | Likely cause | What to try |
|--------------|--------------|-------------|
| Error message on Insight | Template Id wrong or input name mismatch | Match **Prompt template text input API name** to the template. |
| No summary | Template blank or auto-summary off | Set template Id; turn **Auto-generate AI summary** on. |

---

## Permissions

| What you see | Likely cause | What to try |
|--------------|--------------|-------------|
| Insufficient privileges / Apex error | Missing permission set | Assign **Customer_Profile_Widget_User**. |
| Issues only with optional Data Cloud callouts | Optional credential permission | Assign **Customer_Profile_Widget_DC_Callout** only if you use that integration. |

---

## Look and feel (UI)

| What you see | Likely cause | What to try |
|--------------|--------------|-------------|
| Signal bars do not animate | No numeric data | Bars need scores; animation runs shortly after load. |
| Tab hidden | Visibility toggled off | Set **Show … tab** to visible (or leave default). |
| **Theme** right in preview, wrong on live page | Page not active or cache | **Save** and **Activate** the Lightning page; hard refresh; redeploy if users still see an old version. Confirm users open the **activated** page assignment. |
| Map shows “unavailable” | No coordinates and geocode off, or remote sites missing | Pass lat/long from Flow, or turn geocoding on and deploy **Nominatim** / **Photon** remote sites. |

---

**Next:** [SETUP.md](SETUP.md) · [DEPLOY.md](DEPLOY.md) · [HOW_TO.md](HOW_TO.md)
