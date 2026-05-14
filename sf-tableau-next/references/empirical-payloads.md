# Empirical Payloads — Real-World GET Responses

These are ground-truth payloads captured by `GET`-ing real assets in a live Salesforce org (jdo-fw51xz, 2026-05-13). Use them as templates — they reveal fields the public AMF spec doesn't document.

> **Always GET an existing example before composing a POST.** The spec is the type catalog; live responses are the schema-by-example.

## Table of contents

1. [Visualization (full GET)](#1-visualization-full-get)
2. [Visualization list response (shallow)](#2-visualization-list-response-shallow)
3. [Workspace](#3-workspace)
4. [Semantic Model — full inline](#4-semantic-model--full-inline)
5. [Semantic Model — sub-endpoints](#5-semantic-model--sub-endpoints)

---

## 1. Visualization (full GET)

`GET /services/data/v66.0/tableau/visualizations/Amounts_by_Category`

```jsonc
{
  "id": "1AKam00000CnDurGAF",
  "name": "Amounts_by_Category",
  "label": "Amounts by Category",
  "sourceVersion": 9,                              // ← server-managed, don't send on POST
  "createdBy": { "id": "...", "name": "..." },
  "createdDate": "2025-01-31T21:23:26.000Z",
  "lastModifiedBy": { "id": "...", "name": "..." },
  "lastModifiedDate": "2026-03-24T03:18:59.000Z",

  "permissions": { "delete": true, "edit": true, "share": true, "view": true },

  "workspace": {
    "id": "1Dyam0000004cptCAA",
    "name": "DC_Financial_Transactions_TE",
    "label": "Financial Transactions",
    "url": "/services/data/v66.0/tableau/workspaces/DC_Financial_Transactions_TE"
  },

  "dataSource": {
    "id": "2SMam0000003D2LGAU",
    "name": "Transactions",
    "label": "Financial Transactions",
    "type": "SemanticModel",
    "url": "/services/data/v66.0/ssot/semantic/models/Transactions"
  },

  // fields is an OBJECT keyed by alias — make up F1, F2, ...
  "fields": {
    "F1": {
      "id": "1Hbam000000239tCAA",
      "type": "Field",
      "role": "Dimension",
      "displayCategory": "Discrete",
      "fieldName": "Merchant_Category_Code",
      "objectName": "Financial_Account_Transaction"
    },
    "F2": {
      "id": "1Hbam000000239uCAA",
      "type": "Field",
      "role": "Measure",
      "function": "Count",
      "displayCategory": "Continuous",
      "fieldName": "Transaction_Amount",
      "objectName": "Financial_Account_Transaction"
    },
    "F4": { /* same shape, different field */ },
    "F7": { /* same shape, different field */ },
    "F9": { /* same shape, different field */ }
  },

  "view": {
    "id": "1Haam000000FyK1CAK",
    "name": "default",
    "label": "default",
    "isOriginal": true,
    "viewSpecification": {
      "filters": [],
      "sortOrders": {
        "columns": [],
        "rows": [],
        "fields": {
          "F1": { "byField": "F9", "order": "Descending", "type": "Nested" }
        }
      }
    }
  },

  "visualSpecification": {
    "mode": "Visualization",
    "columns": ["F2"],
    "rows":    ["F1"],
    "measureValues": [],
    "forecasts": {},                               // empty {} when no forecast
    "referenceLines": {},                          // empty {} when none

    // marks is an OBJECT keyed by mark group; "ALL" is conventional
    "marks": {
      "ALL": {
        "type": "Bar",
        "isAutomatic": true,
        "stack": { "isAutomatic": true, "isStacked": true },
        "encodings": [
          { "fieldKey": "F4", "type": "Label" },
          { "fieldKey": "F7", "type": "Color" }
        ]
      }
    },

    "legends": {
      "F7": {
        "isVisible": false,
        "position": "Right",
        "title": { "isVisible": true }
      }
    },

    "style": {
      "fit": "Standard",
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
      },
      "fieldLabels": {
        "columns": { "showDividerLine": false, "showLabels": true },
        "rows":    { "showDividerLine": false, "showLabels": true }
      },
      // allHeaders is REQUIRED in practice but NOT in the public spec
      "allHeaders": {
        "columns": { "mergeRepeatedCells": true, "showIndex": false },
        "rows":    { "mergeRepeatedCells": true, "showIndex": false },
        "fields":  {
          "F1": {
            "hiddenValues": [],
            "isVisible": true,
            "showMissingValues": false
          }
        }
      }
      // headers, marks, panes, title, referenceLines, showDataPlaceholder also valid
    }
  },

  "interactions": []                               // empty by default; AnalyticsActionsInput[]
}
```

### What to strip when reusing as a POST template

Drop these server-managed fields before POSTing:
- All `id` fields at every level
- All `createdBy`, `createdDate`, `lastModifiedBy`, `lastModifiedDate`
- `permissions`
- `sourceVersion`
- `view.isOriginal`
- The `url` fields inside `workspace` / `dataSource`

Keep `workspace.name` and `dataSource` (`name`, `label`, `type`) — those are how the new viz binds.

## 2. Visualization list response (shallow)

`GET /services/data/v66.0/tableau/visualizations`

```jsonc
{
  "visualizations": [
    {
      "id": "1AKam00000CnDurGAF",
      "name": "Amounts_by_Category",
      "label": "Amounts by Category",
      "createdBy": { "id": "...", "name": "..." },
      "createdDate": "...",
      "lastModifiedBy": { "id": "...", "name": "..." },
      "lastModifiedDate": "...",
      "permissions": { "delete": true, "edit": true, "share": true, "view": true },
      "workspace": { "id": "...", "name": "...", "label": "...", "url": "..." },
      "dataSource": { "id": "...", "name": "...", "label": "...", "type": "SemanticModel", "url": "..." }
      // No fields/view/visualSpecification/interactions in list — must GET by id
    }
    // ...
  ]
}
```

## 3. Workspace

`GET /services/data/v66.0/tableau/workspaces`

```jsonc
{
  "workspaces": [
    {
      "id": "1Dyam0000004cptCAA",
      "name": "DC_Financial_Transactions_TE",
      "label": "Financial Transactions",
      "createdBy": { "id": "...", "name": "Jose Sifontes" },
      "createdDate": "2025-01-31T21:14:17.000Z",
      "lastModifiedBy": { "id": "...", "name": "Jose Sifontes" },
      "lastModifiedDate": "2025-03-27T14:18:02.000Z",
      "permissions": { "delete": true, "edit": true, "share": true, "view": true },
      "url": "/services/data/v66.0/tableau/workspaces/DC_Financial_Transactions_TE"
    }
  ]
}
```

POST body for create is just:

```jsonc
{
  "name": "MyNewWorkspace",
  "label": "My New Workspace",
  "description": "Optional"
}
```

## 4. Semantic Model — full inline

`GET /services/data/v65.0/ssot/semantic/models/Case_Model`

```jsonc
{
  "id": "2SMam0000003D5ZGAU",
  "apiName": "Case_Model",
  "label": "Case Model",
  "dataspace": "default",
  "agentEnabled": false,
  "categories": [],
  "isLocked": false,
  "isPartialSdm": false,
  "isQueryable": "Queryable",
  "isAiDrafted": false,
  "hasUnmapped": false,
  "queryUnrelatedDataObjects": "Union",
  "sourceCreation": "DataCloud",
  "currency": { "useOrgDefault": true },
  "lockedActions": {},

  // Sub-collection URL pointers (you can GET each one separately)
  "semanticDataObjectsUrl": "/services/data/v65.0/ssot/semantic/models/Case_Model/data-objects",
  "semanticRelationshipsUrl": "/services/data/v65.0/ssot/semantic/models/Case_Model/relationships",
  "semanticCalculatedDimensionsUrl": "/services/data/v65.0/ssot/semantic/models/Case_Model/calculated-dimensions",
  "semanticCalculatedMeasurementsUrl": "/services/data/v65.0/ssot/semantic/models/Case_Model/calculated-measurements",
  "semanticGroupingsUrl": "/services/data/v65.0/ssot/semantic/models/Case_Model/groupings",
  "semanticParametersUrl": "/services/data/v65.0/ssot/semantic/models/Case_Model/parameters",

  "semanticDataObjects":            [ /* ... */ ],
  "semanticRelationships":          [ /* ... */ ],
  "semanticCalculatedDimensions":   [],
  "semanticCalculatedMeasurements": [ /* ... */ ],
  "semanticDimensionHierarchies":   [],
  "semanticGroupings":              [],
  "semanticLogicalViews":           [],
  "semanticMetrics":                [ /* ... */ ],
  "semanticModelFilters":           [],
  "semanticParameters":             [],
  "fieldsOverrides":                [],

  "semanticModelInfo": {
    "definitionsCount": 8,
    "maxDefinitionCount": 5000,
    "modelHierarchyDepth": 1
  }
}
```

## 5. Semantic Model — sub-endpoints

### `GET /ssot/semantic/models/{m}/data-objects`

```jsonc
[
  {
    "id": "1DOam000001RlLdGAK",
    "apiName": "Account1",
    "label": "Account",
    "dataObjectName": "ssot__Account__dlm",
    "dataObjectType": "Dmo",
    "shouldIncludeAllFields": true,
    "filters": [],
    "tableType": "...",
    "semanticDimensions": [
      {
        "id": "18mam0000007d6IAAQ",
        "apiName": "Account_Id1",
        "label": "Account Id",
        "dataObjectFieldName": "ssot__Id__c",
        "dataType": "Text",
        "displayCategory": "Discrete",
        "semanticDataType": "None",
        "sortOrder": "Ascending",
        "isVisible": true
      }
      // ...
    ],
    "semanticMeasurements": [ /* same shape with aggregationType */ ],
    "semanticDimensionsUrl": "/services/.../{m}/data-objects/{do}/dimensions",
    "semanticMeasurementsUrl": "/services/.../{m}/data-objects/{do}/measurements"
  }
]
```

### `GET /ssot/semantic/models/{m}/relationships`

```jsonc
[
  {
    "id": "1DOam000001RlLgGAK",
    "apiName": "relationship1",
    "label": "relationship",
    "leftSemanticDefinitionApiName": "Case",
    "rightSemanticDefinitionApiName": "Account1",
    "cardinality": "ManyToMany",
    "joinType": "Auto",
    "isEnabled": true,
    "criteria": [
      {
        "joinOperator": "Equals",
        "leftFieldType": "TableField",
        "leftSemanticFieldApiName": "Account",
        "rightFieldType": "TableField",
        "rightSemanticFieldApiName": "Account_Id1"
      }
    ]
  }
]
```

### `GET /ssot/semantic/models/{m}/calculated-measurements`

```jsonc
[
  {
    "id": "1DOam000001RpQrGAK",
    "apiName": "gen_ai_Count_Of_Open_Cases_clc",
    "label": "Count Of Open Cases",
    "description": "...",
    "expression": "COUNT(IF [Case].[Closed] &lt;&gt; &#39;true&#39; THEN [Case].[Case_Id] END)",
    "aggregationType": "UserAgg",
    "totalAggregationType": "Sum",
    "dataType": "Number",
    "decimalPlace": 2,
    "directionality": "Up",
    "displayCategory": "Continuous",
    "level": "AggregateFunction",
    "semanticDataType": "None",
    "sentiment": "SentimentTypeUpIsGood",
    "shouldTreatNullsAsZeros": false,
    "sortOrder": "None",
    "isVisible": true,
    "isOverrideBase": false,
    "filters": []
  }
]
```

### `GET /ssot/semantic/models/{m}/calculated-dimensions`

```jsonc
[
  {
    "id": "1DOam000003XmYnGAK",
    "apiName": "Accounts_With_Low_Deposit_Balance_5000_clc",
    "label": "Accounts With Low Deposit Balance &lt; 5000",
    "description": "...",
    "expression": "[Deposits].[current_balance] &lt; 5000",
    "dataType": "Boolean",
    "displayCategory": "Discrete",
    "level": "Row",
    "semanticDataType": "None",
    "sortOrder": "None",
    "isVisible": true,
    "isOverrideBase": false,
    "filters": []
  }
]
```

> Note: `expression` is HTML-encoded in stored payloads — `&lt;` for `<`, `&#39;` for `'`. Decode before reading; encode before writing.
