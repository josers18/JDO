# UI layout — Multiclass Prediction

How the **Multiclass Prediction** component (`multiclassPredictionLwc`) structures the card: **predicted class** (text) and **recommendations** only — no gauge, no numeric KPI panel, no top-drivers section.

---

## Main areas

| Region | Markup / CSS | Notes |
|--------|----------------|-------|
| **Shell** | `.lwc-shell`, header with title + Refresh | Same shell pattern as sibling projects. |
| **Class hero** | `.class-hero-panel` → `.class-hero` → `.class-hero__label`, `.class-hero__caption` | Large **text** label (humanized or raw per App Builder). Empty state shows an em dash. Caption from **Subtitle under predicted class**. |
| **Recommendations** | `.improve-section`, `.factor-row`, `.bar-track`, `.bar-fill` | Sorted rows with `+/-x.x%`, horizontal bar, ellipsis label (`Field: value`). |
| **AI summary** | `.agent-summary` | Optional; shown when a prompt template Id/API name is set. |

---

## Typography and responsiveness

- The shell (`.lwc-shell`) uses **`container-type: inline-size`** so the class label can scale with card width (`clamp` + `cqw`).
- Narrow containers (`@container (max-width: 340px)`) reduce hero padding and slightly shrink the label and section labels.

---

## Customization

- **Structural or typographic tweaks:** Edit `multiclassPredictionLwc.css` in this repo and redeploy.
- **Colors:** Use App Builder **Default risk / good color** and optional recommendation overrides; or CSS host variables `--lwc-model-delta-risk` / `--lwc-model-delta-good` on `:host` if you extend the bundle.

---

## Related

- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — all App Builder properties
- [ARCHITECTURE.md](ARCHITECTURE.md) — sequence and payload to Einstein
- [FLOW_GUIDE.md](FLOW_GUIDE.md) — JSON shape for recommendations
