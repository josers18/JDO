# Tableau Next REST API Reference

**Base URL:** `https://<your-instance>.my.salesforce.com/services/data/v66.0/tableau/...`

> v66.0 is empirically verified. The published AMF spec at `/static/.../v64.0/...` lags behind the active server. v64 returns `DOWNGRADE_VERSION_ERROR` on real visualizations.

## Endpoints

### Visualizations

| Method | Path | Operation | Body | Returns |
|---|---|---|---|---|
| GET | `/tableau/visualizations` | List visualizations available to the user | — | `{ visualizations: [...] }` (shallow) |
| **POST** | `/tableau/visualizations` | Create a visualization | VisualizationInput | Visualization |
| GET | `/tableau/visualizations/{idOrApiName}` | Get full viz | — | Visualization |
| PATCH | `/tableau/visualizations/{idOrApiName}` | Update | VisualizationInput | Visualization |
| DELETE | `/tableau/visualizations/{idOrApiName}` | Delete | — | — |

### Workspaces

| Method | Path | Operation | Body | Returns |
|---|---|---|---|---|
| GET | `/tableau/workspaces` | List | — | `{ workspaces: [...] }` |
| **POST** | `/tableau/workspaces` | Create | `WorkspaceInput { name, label, description }` | Workspace |
| GET | `/tableau/workspaces/{idOrApiName}` | Get | — | Workspace |
| PATCH | `/tableau/workspaces/{idOrApiName}` | Update | WorkspaceInput | Workspace |
| DELETE | `/tableau/workspaces/{idOrApiName}` | Delete | — | — |
| GET | `/tableau/workspaces/{id}/assets` | List assets in workspace | — | WorkspaceAssetCollection |
| **POST** | `/tableau/workspaces/{id}/assets` | Add asset to workspace | WorkspaceAssetInput | WorkspaceAsset |
| DELETE | `/tableau/workspaces/{id}/assets/{assetId}` | Remove asset | — | — |

**Asset types** (`ConnectWorkspaceAssetTypeEnum`): `AnalyticsDashboard`, `AnalyticsVisualization`, `Flexipage`, `MktCalculatedInsightObject`, `MktDataConnection`, `MktDataLakeObject`, `MktDataModelObject`, `SemanticModel`

**Usage type** (`ConnectWorkspaceAssetUsageTypeEnum`): `Created`, `Referenced`

### Downloads, Followers, Subscriptions, Record Access Shares

| Method | Path |
|---|---|
| POST | `/tableau/download` — body: `DashboardDownloadInput` \| `MetricDownloadInput` \| `DownloadAssetInput` |
| GET/POST/PATCH/DELETE | `/tableau/follow/...` |
| GET/PATCH | `/tableau/subscriptions/digest/{owner}` |
| GET/POST/PATCH/DELETE | `/tableau/records/{recordId}/shares` |

## VisualizationInput body

Composed of `BaseAnalyticsInput` (`name`, `label`, `description`) + viz fields:

| Field | Required | Notes |
|---|---|---|
| `name` | n | Unique developer name |
| `label` | n | Display label |
| `description` | n | |
| `workspace` | **y** | `{ name: "<workspaceApiName>" }` |
| `dataSource` | **y** | `{ label, type: "SemanticModel" }` — only enum value today |
| `view` | **y** | VisualizationViewInput |
| `fields` | **y** | **object** keyed by alias (`F1`, `F2`, ...), each value is VisualizationFieldInput |
| `interactions` | **y** | array of AnalyticsActionsInput (often `[]`) |
| `templateSource` | n | `{ name, assetName }` |
| `visualSpecification` | **y** | The chart |

### VisualizationFieldInput

```jsonc
"F1": {
  "type": "Field",                    // Field | MeasureNames | MeasureValues
  "role": "Dimension",                // Dimension | Measure
  "fieldName": "Case_Status",         // semantic-model field API name
  "objectName": "Case",               // semantic-model object API name
  "displayCategory": "Discrete",      // Continuous | Discrete
  "function": "Sum",                  // optional, see enums.md
  "label": "Status"                   // optional
}
```

### VisualizationVisualSpecInput

| Field | Required | Notes |
|---|---|---|
| `mode` | n | `Visualization` \| `Table` |
| `marks` | **y** | object keyed by mark group (`"ALL"` is conventional) |
| `columns` | **y** | array of fieldKey strings |
| `rows` | **y** | array of fieldKey strings |
| `measureValues` | **y** | array (often `[]`) |
| `legends` | **y** | object keyed by fieldKey |
| `forecasts` | **y** | object (often `{}`) |
| `referenceLines` | **y** | object (currently always `{}`) |
| `style` | **y** | VisualizationStyleInput — see below |

### VisualizationMarkInput (per mark group)

```jsonc
"ALL": {
  "type": "Bar",                      // Bar | Circle | Donut | Line | Square | Text
  "isAutomatic": true,
  "stack": { "isAutomatic": true, "isStacked": true },
  "encodings": [
    { "fieldKey": "F4", "type": "Label" },
    { "fieldKey": "F7", "type": "Color" }
  ]
}
```

Encoding types: `Angle`, `Color`, `Detail`, `Label`, `Range`, `Tooltip`

### VisualizationViewInput

```jsonc
"view": {
  "label": "default",
  "name": "default",
  "viewSpecification": {
    "filters": [],                    // VisualizationFilterInput[]
    "sorts": [],                      // BaseVisualizationSortInput[]
    "sortOrders": {                   // optional, table-mode per-field
      "columns": [],
      "rows": [],
      "fields": {
        "F1": { "byField": "F9", "order": "Descending", "type": "Nested" }
      }
    }
  }
}
```

### VisualizationStyleInput

Required sub-blocks. Empty `{}` works as default for most:

```jsonc
"style": {
  "axis": { "F2": { /* per-field axis style */ } },
  "marks": {},
  "panes": {},
  "headers": {},
  "title": {},
  "fieldLabels": {
    "columns": { "showDividerLine": false, "showLabels": true },
    "rows":    { "showDividerLine": false, "showLabels": true }
  },
  "fit": "Standard",                  // Entire | RowHeadersWidth | Standard
  "referenceLines": {},
  "showDataPlaceholder": true,
  "allHeaders": {                     // NOT in public spec, required in practice
    "columns": { "mergeRepeatedCells": true, "showIndex": false },
    "rows":    { "mergeRepeatedCells": true, "showIndex": false },
    "fields":  { "F1": { "hiddenValues": [], "isVisible": true, "showMissingValues": false } }
  }
}
```

### Axis style per field

```jsonc
"axis": {
  "F2": {
    "isVisible": true,
    "isZeroLineVisible": true,
    "range": { "type": "Auto", "includeZero": true },
    "scale": {
      "format": {
        "numberFormatInfo": {
          "type": "NumberCustom",
          "decimalPlaces": 2,
          "displayUnits": "Auto",
          "includeThousandSeparator": true,
          "negativeValuesFormat": "Auto",
          "prefix": "$",
          "suffix": ""
        }
      }
    },
    "ticks": {
      "majorTicks": { "type": "Auto" },
      "minorTicks": { "type": "Auto" }
    },
    "titleText": "Transaction Amount"
  }
}
```

## Workspace asset attachment

```http
POST /services/data/v66.0/tableau/workspaces/{workspaceApiName}/assets
{
  "name": "<assetApiName>",        // existing asset to attach
  "type": "AnalyticsVisualization", // see enum
  "usage": "Referenced"             // Created | Referenced
}
```

A "dashboard" in Tableau Next = a workspace whose assets include `AnalyticsDashboard`/`AnalyticsVisualization`/`Flexipage`/Data 360 objects.

## Common pitfalls

1. **Required-field 400s** — most often `style.allHeaders`, `marks.{group}.stack`, `forecasts: {}`, `referenceLines: {}`, `quickTableCalc`, `computeUsing`. Empty objects work.
2. **`fields` is a dict, not an array** — make up `F1`/`F2`/etc. keys.
3. **`marks` is a dict keyed by mark group**, typically `"ALL"`.
4. **`dataSource.type` only accepts `"SemanticModel"`** — every viz binds to a semantic model.
5. **`sourceVersion` field** appears in real responses but is server-managed — don't send it.
