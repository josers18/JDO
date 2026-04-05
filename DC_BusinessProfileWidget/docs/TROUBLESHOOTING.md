# Troubleshooting — Business Profile Widget

---

## Deploy and Apex

| Symptom | Likely cause | Try |
|---------|--------------|-----|
| Component error “Apex not allowed” or similar | **BusinessProfileWidgetController** not enabled for user | Grant Apex class access on profile or permission set ([SETUP.md](SETUP.md)). |
| Deploy compile error | API version / org mismatch | Project uses **62.0**; resolve with developer. |

---

## Field mappings

| Symptom | Likely cause | Try |
|---------|--------------|-----|
| Slot always empty | Invalid Account path | Use **Setup → Object Manager → Account → Fields** API names; test dotted paths like `Owner.Name`. |
| Flow value ignored | Missing `flow:` prefix or wrong variable API name | Use **`flow:OutputVar`**; match Flow **variable** API name exactly. |
| Assembly Flow never runs | All mappings are valid SOQL only | Expected: Flow is optional when every field resolves from Account. |

---

## Insight and AI

| Symptom | Likely cause | Try |
|---------|--------------|-----|
| No prediction | Insight Flow blank or failed silently | Set **Autolaunched flow API name (predictions)**; check debug logs. |
| Summary error | Template Id or input name wrong | Match **Prompt template text input API name**; confirm Einstein enabled. |

---

## Map and geocoding

| Symptom | Likely cause | Try |
|---------|--------------|-----|
| No pin | No coordinates and geocode off | Set **Field: map latitude/longitude** or enable geocoding + remote sites. |
| Callout errors | Remote sites missing or blocked | Deploy **Nominatim** / **Photon** remote sites or disable geocoding. |

---

## Structure tab

| Symptom | Likely cause | Try |
|---------|--------------|-----|
| Empty org chart | Sharing or no related accounts | Confirm user can read **AccountContactRelation** / junction objects. |

---

## Pipeline tab

| Symptom | Likely cause | Try |
|---------|--------------|-----|
| Fewer rows than expected | **Pipeline: max open opportunities** set to a small number | Set **0** for the server maximum (**2000**) or raise the cap. |
| Pipeline empty | No open **Opportunity** on Account, or no **read** on Opportunity | Confirm related opps are **Open** and the user has **Read** on **Opportunity** and needed fields (`StageName`, `Amount`, etc.). |
| List feels heavy | Many hundreds of opps | Lower **Pipeline: max open opportunities** to a smaller **1–2000** value. |

---

[SETUP.md](SETUP.md) · [FLOW_GUIDE.md](FLOW_GUIDE.md)
