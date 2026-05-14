# Tableau Semantics Layer API Reference

**Base URL:** `https://<your-instance>.my.salesforce.com/services/data/v65.0/...`

> Empirically v65.0. The Quick Start guide says `POST /semantic/models/` but the published reference uses `PUT /ssot/semantic/models/{newApiName}` for create+replace and `PATCH` for partial updates.

## Authoring Administration endpoints

| Method | Path | Operation | Body |
|---|---|---|---|
| GET | `/ssot/semantic/models` | List models | — |
| GET | `/ssot/semantic/models/{apiNameOrId}` | Get full model (all collections inlined) | — |
| GET | `/ssot/semantic/models/{apiNameOrId}/shallow` | Get model w/o inherited definitions | — |
| **PUT** | `/ssot/semantic/models/{apiNameOrId}` | Create or full replace | SemanticModelInputRepresentation |
| PATCH | `/ssot/semantic/models/{apiNameOrId}` | Partial update | SemanticModelInputRepresentation |
| DELETE | `/ssot/semantic/models/{apiNameOrId}` | Delete | — |
| POST | `/ssot/semantic/models/{apiNameOrId}/clone` | Clone | (parameters in body) |
| GET | `/ssot/semantic/models/{apiNameOrId}/validate` | Validate structure | — |

### Discovered sub-endpoints (not in public spec)

The full-model GET response exposes URL pointers like `semanticDataObjectsUrl`. Each sub-endpoint accepts its own GET:

| Method | Path |
|---|---|
| GET | `/ssot/semantic/models/{m}/data-objects` |
| GET | `/ssot/semantic/models/{m}/relationships` |
| GET | `/ssot/semantic/models/{m}/calculated-dimensions` |
| GET | `/ssot/semantic/models/{m}/calculated-measurements` |
| GET | `/ssot/semantic/models/{m}/groupings` |
| GET | `/ssot/semantic/models/{m}/parameters` |

## SemanticModelInputRepresentation (envelope)

```jsonc
{
  // BaseAnalyticsInput
  "apiName": "My_Model",
  "label": "My Model",
  "description": "...",
  "dataspace": "default",

  // Collections — each item shape captured below
  "semanticDataObjects":           [ /* DataObjects */ ],
  "semanticRelationships":         [ /* Relationships (joins) */ ],
  "semanticCalculatedDimensions":  [ /* row-level calculated cols */ ],
  "semanticCalculatedMeasurements":[ /* aggregate calculations */ ],
  "semanticMetrics":               [ /* metrics for Tableau Pulse */ ],
  "semanticGroupings":             [ /* groupings */ ],
  "semanticLogicalViews":          [ /* virtual data objects */ ],
  "semanticParameters":            [ /* parameters */ ],
  "fieldsOverrides":               [ /* field-level overrides */ ],
  "baseModels":                    [ /* models this extends */ ],
  "externalConnections":           [ /* federation */ ],

  // Metadata
  "agentEnabled": false,           // expose to Agentforce
  "categories": ["Sales"],         // Marketing | Commerce | Sales | Service | Other
  "queryUnrelatedDataObjects": "Union",  // Allow | Disallow | Union
  "currency": { "useOrgDefault": true }
}
```

## Collection item shapes (empirically captured)

### SemanticDataObject

```jsonc
{
  "apiName": "Account1",                     // unique within model
  "label": "Account",
  "dataObjectName": "ssot__Account__dlm",    // points to Data 360 DLO/DMO API name
  "dataObjectType": "Dmo",                   // Dmo | Dlo | ...
  "tableType": "...",
  "shouldIncludeAllFields": true,
  "filters": [],
  "semanticDimensions": [
    {
      "apiName": "Account_Id1",
      "label": "Account Id",
      "dataObjectFieldName": "ssot__Id__c",  // actual DLO/DMO field
      "dataType": "Text",                    // Text | Number | Date | Boolean | DateTime
      "displayCategory": "Discrete",         // Discrete | Continuous
      "semanticDataType": "None",
      "sortOrder": "Ascending",              // Ascending | Descending | None
      "isVisible": true
    }
  ],
  "semanticMeasurements": [
    {
      "apiName": "Amount_msr",
      "label": "Amount",
      "dataObjectFieldName": "ssot__Amount__c",
      "dataType": "Number",
      "displayCategory": "Continuous",
      "aggregationType": "Sum"               // Sum | Avg | Count | ...
    }
  ]
}
```

### SemanticRelationship

```jsonc
{
  "apiName": "Case_to_Account",
  "label": "Case → Account",
  "leftSemanticDefinitionApiName": "Case",
  "rightSemanticDefinitionApiName": "Account1",
  "cardinality": "ManyToMany",               // OneToOne | OneToMany | ManyToOne | ManyToMany
  "joinType": "Auto",                        // Auto | Inner | Left | Right | Full
  "isEnabled": true,
  "criteria": [
    {
      "joinOperator": "Equals",              // Equals | NotEquals | GreaterThan | ...
      "leftFieldType": "TableField",         // TableField | Constant | ...
      "leftSemanticFieldApiName": "Account",
      "rightFieldType": "TableField",
      "rightSemanticFieldApiName": "Account_Id1"
    }
  ]
}
```

### SemanticCalculatedMeasurement

```jsonc
{
  "apiName": "Total_Cases_clc",
  "label": "Total Cases",
  "expression": "COUNT([Case].[Case_Id])",   // HTML-encoded in stored payloads
  "aggregationType": "UserAgg",              // UserAgg = use formula's own aggregator
  "totalAggregationType": "Sum",
  "dataType": "Number",
  "decimalPlace": 2,
  "directionality": "Up",                    // Up | Down
  "displayCategory": "Continuous",
  "level": "AggregateFunction",              // AggregateFunction | Row
  "semanticDataType": "None",
  "sentiment": "SentimentTypeUpIsGood",      // SentimentTypeUpIsGood | SentimentTypeUpIsBad | SentimentNone
  "shouldTreatNullsAsZeros": false,
  "sortOrder": "None",
  "isVisible": true,
  "isOverrideBase": false,
  "filters": []
}
```

### SemanticCalculatedDimension

Same shape as CalculatedMeasurement minus aggregation, with `level: "Row"` typically:

```jsonc
{
  "apiName": "Low_Balance_clc",
  "label": "Low Balance",
  "expression": "[Deposits].[current_balance] < 5000",
  "dataType": "Boolean",                     // result type
  "displayCategory": "Discrete",
  "level": "Row"
}
```

### SemanticMetric

Used by Tableau Pulse for AI-driven insights:

```jsonc
{
  "apiName": "Total_Cases_mtc",
  "label": "Total Cases",
  "isCumulative": false,
  "isQueryable": "Queryable",
  "measurementReference": { "calculatedFieldApiName": "Total_Cases_clc" },
  "timeDimensionReference": {
    "tableFieldReference": { "fieldApiName": "Created_Date1", "tableApiName": "Case" }
  },
  "additionalDimensions": [
    { "tableFieldReference": { "fieldApiName": "Case_Status", "tableApiName": "Case" } }
  ],
  "timeGrains": [],
  "filters": [],
  "aggregationType": "UserAgg",
  "insightsSettings": {
    "singularNoun": "Case",
    "pluralNoun": "Cases",
    "sentiment": "SentimentTypeUpIsBad",
    "insightsDimensionsReferences": [
      { "tableFieldReference": { "fieldApiName": "Case_Status", "tableApiName": "Case" } }
    ],
    "insightTypes": [
      { "type": "TopContributors",                 "enabled": true },
      { "type": "BottomContributors",              "enabled": true },
      { "type": "ComparisonToExpectedRangeAlert",  "enabled": true },
      { "type": "TrendChangeAlert",                "enabled": true },
      { "type": "ConcentratedContributionAlert",   "enabled": true },
      { "type": "TopDrivers",                      "enabled": true },
      { "type": "TopDetractors",                   "enabled": true },
      { "type": "CurrentTrend",                    "enabled": true }
    ]
  }
}
```

### SemanticLogicalView

A virtual data object built from one or more underlying data objects:

```jsonc
{
  "apiName": "Campaign_Attribution_lv",
  "label": "Campaign Attribution",
  "isQueryable": "Queryable",
  "filters": [],
  "referenceIntegritySemanticDataObjects": [],
  "semanticDataObjects": [
    /* same shape as top-level SemanticDataObject, with logicalViewId set */
  ]
}
```

> Logical views appear inline on full-model GET only — no separate sub-endpoint.

## Semantic Query API

| Method | Path | Body |
|---|---|---|
| **POST** | `/services/data/v65.0/semantic-engine/gateway` | SemanticQueryRequest |

### SemanticQueryRequest

```jsonc
{
  "dataspace": "default",
  "source": "...",
  "semanticModel": { /* reference */ },
  "structuredSemanticQuery": {
    /* dimensions, measures, filters, sorts, limit */
  }
}
```

### SemanticQueryResponse

```jsonc
{
  "status": "Completed",
  "queryResults": {
    "queryMetadata": { "fields": { /* result column metadata */ } },
    "queryData":     { "rows":   [ /* result rows */ ] }
  }
}
```

Errors:

```jsonc
{ "errorCode": "...", "message": "..." }
```

## Build flow

```
1. PUT  /services/data/v65.0/ssot/semantic/models/{newApiName}
        body: SemanticModelInputRepresentation

2. GET  /services/data/v65.0/ssot/semantic/models/{newApiName}/validate

3. (After viz creation) Validate numbers via:
   POST /services/data/v65.0/semantic-engine/gateway
        body: SemanticQueryRequest
```
