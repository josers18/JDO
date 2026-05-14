# Polymorphic Types in Tableau Next

The AMF spec uses convention (not `shacl:or`) for polymorphism. Each polymorphic field uses a `type` discriminator and one of several "Parameters" sub-shapes.

## `BaseVisualizationFilterInfoInput.type` → `PolymorphicConnectVisualizationFilterType`

Set `type` to one of these names; include the matching parameters object alongside.

### `GreaterThanFilterParameters`
| Field | Required |
|---|---|
| `beginValue` | y |
| `includeNulls` | y |
| `showOnlyRelevantValues` | y |

### `LessThanFilterParameters`
| Field | Required |
|---|---|
| `endValue` | y |
| `includeNulls` | y |
| `showOnlyRelevantValues` | y |

### `RangeFilterParameters`
| Field | Required |
|---|---|
| `beginValue` | y |
| `endValue` | y |
| `includeNulls` | y |
| `showOnlyRelevantValues` | y |

### `InFilterParameters`
| Field | Required |
|---|---|
| `values` | y (array) |
| `isExcludes` | y (boolean) |
| `useAll` | n |
| `isCustom` | n |

### `NullsFilterParameters`
| Field | Required |
|---|---|
| `nullType` | y |

### `RelativeDateFilterParameters`
| Field | Required |
|---|---|
| `beginPeriod` | y → `RelativeDateFilterPeriod` |
| `endPeriod` | y → `RelativeDateFilterPeriod` |
| `includeNulls` | y |
| `isFiscal` | y |
| `anchorRelativeDate` | n |

`RelativeDateFilterPeriod`:
| Field | Required |
|---|---|
| `unit` | y |
| `value` | y |

### `TopNFilterParameters`
| Field | Required |
|---|---|
| `direction` | y |
| `count` | y (number) |
| `byField` | y (fieldKey) |

## `BaseVisualizationColorAssignmentInput.type` → `PolymorphicConnectVisualizationColorAssignmentType`

### `ContinuousColorAssignmentParameters`
| Field | Required |
|---|---|
| `palette` | y |

### `DiscreteColorAssignmentParameters`
| Field | Required |
|---|---|
| `palette` | y |
| `customColors` | y |

## `BaseVisualizationAxisRangeStyleInput.type` → `PolymorphicAxisStyleRangeType`

### `AutoRangeParameters`
| Field | Required |
|---|---|
| `includeZero` | y (boolean) |

### `CustomRangeParameters`
| Field | Required |
|---|---|
| `start` | y |
| `end` | y |

## `FlowInputDataSchema` (action interactions)

Has discriminator `inputType` with two implicit variants — used when wiring a `Flow` interaction action to bind viz field values to flow input parameters. Field set is runtime-defined.

## `AnalyticsActionParametersInput` (action params)

**Open object** — the parameter bag whose keys depend on the action `type`:

| Action type | Typical parameters |
|---|---|
| `Flow` | `{ flowApiName, inputs: { ... } }` |
| `Navigate` | `{ url \| recordId, target }` |
| `RecordAction` | `{ recordId, action }` |

## Composing example — a TopN filter

```jsonc
"filters": [
  {
    "fieldKey": "F2",
    "isContext": false,
    "filterInfos": [
      {
        "type": "TopN",
        "topN": {
          "direction": "Top",
          "count": 10,
          "byField": "F4"
        }
      }
    ]
  }
]
```

The exact key under which parameters appear (e.g. `topN`, `range`, `relativeDate`) follows the convention `<typeNameLowerCamel>` — empirical examples in real org responses confirm the lower-camel transformation. When in doubt, GET an existing viz that uses a filter and copy its shape.
