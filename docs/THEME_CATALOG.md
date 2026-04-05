# Widget theme catalog (PDF)

Visual reference for **42 themes** (eight families) shared by the profile and prediction Lightning cards.

**[Open or download: widget_theme_catalog.pdf](assets/widget_theme_catalog.pdf)**

The same PDF is also copied into each themed package so it appears next to that widget’s docs on GitHub:

`DC_PersonProfileWidget/docs/assets/` · `DC_BusinessProfileWidget/docs/assets/` · `DC_Prediction_Model_LWC/docs/assets/` · `DC_Multiclass_Prediction_LWC/docs/assets/`

## Which components use these presets

| Package | LWC bundle | Notes |
|---------|------------|--------|
| DC_PersonProfileWidget | `customerProfileWidget` | **Theme** dropdown + optional in-card switcher |
| DC_BusinessProfileWidget | `businessProfileWidget` | **Theme mode** + optional switcher (42 presets in meta) |
| DC_Prediction_Model_LWC | `classificationModelLwc` | **`predictionThemes.js`** — same CSS variable tokens |
| DC_Multiclass_Prediction_LWC | `multiclassPredictionLwc` | **`predictionThemes.js`** — keep in sync with Prediction Model |

The PDF title page lists **customerProfileWidget** and **businessProfileWidget**; Prediction and Multiclass use the **same named presets** via `THEMES` in code.

## GitHub Pages

If this repository publishes from the **`/docs`** folder, the catalog is available at:

`…/assets/widget_theme_catalog.pdf`

(relative to your Pages site root.)
