# Tableau Next + Semantics — Enum Catalog

All values verbatim from the AMF spec or live org responses.

## Tableau Next visualization enums

### `ConnectVisualizationMarkType`
`Bar`, `Circle`, `Donut`, `Line`, `Square`, `Text`

### `ConnectVisualizationMarkEncodingType`
`Angle`, `Color`, `Detail`, `Label`, `Range`, `Tooltip`

### `ConnectVisualizationModeType`
`Table`, `Visualization`

### `ConnectVisualizationDataSourceType`
`SemanticModel` *(only value)*

### `ConnectVisualizationFieldType`
`Field`, `MeasureNames`, `MeasureValues`

### `ConnectVisualizationFieldRoleType`
`Dimension`, `Measure`

### `ConnectVisualizationFieldDisplayCategoryType`
`Continuous`, `Discrete`

### `ConnectVisualizationFieldFunctionType` (aggregations)
**Numeric:** `Sum`, `Avg`, `Count`, `CountD`, `Max`, `Min`, `Median`, `Stdev`, `Stdevp`, `Var`, `Varp`, `UserAgg`
**Date abbreviations:** `Mdy`, `My`
**Date part:** `DatePartDay`, `DatePartMonth`, `DatePartQuarter`, `DatePartWeek`, `DatePartWeekDay`, `DatePartYear`
**Date trunc:** `DateTruncDay`, `DateTruncMonth`, `DateTruncQuarter`, `DateTruncWeek`, `DateTruncYear`
**Fiscal date part:** `FiscalDatePartMonth`, `FiscalDatePartQuarter`, `FiscalDatePartWeek`, `FiscalDatePartYear`
**Fiscal date trunc:** `FiscalDateTruncMonth`, `FiscalDateTruncQuarter`, `FiscalDateTruncWeek`, `FiscalDateTruncYear`

### `ConnectVisualizationFieldQuickTableCalcType`
`Difference`, `MovingAverage`, `MovingMax`, `MovingMin`, `MovingSum`, `PercentDifference`, `PercentOfTotal`, `Percentile`, `Rank`, `RankDense`, `RankModified`, `RankUnique`, `RunningAvg`, `RunningMax`, `RunningMin`, `RunningSum`

### `ConnectVisualizationFieldTableCalcComputeUsingType`
`Cell`, `PaneAcross`, `PaneAcrossThenDown`, `PaneDown`, `PaneDownThenAcross`, `TableAcross`, `TableAcrossThenDown`, `TableDown`, `TableDownThenAcross`

### `ConnectVisualizationSortType`
`Alphabetic`, `Field`, `Nested`

### `ConnectVisualizationSortOrderType`
`Ascending`, `Descending`

### `ConnectVisualizationLegendPositionType`
`Bottom`, `Left`, `Right`, `Top`

### `ConnectVisualizationStyleFitType`
`Entire`, `RowHeadersWidth`, `Standard`

### `ConnectVisualizationStyleNumberFormatType`
`Currency`, `CurrencyCustom`, `CurrencyShort`, `Number`, `NumberCustom`, `NumberShort`, `Percentage`, `PercentageCustom`, `PercentageShort`

### `ConnectVisualizationNumberFormatInfoDisplayUnitType`
`Auto`, `B`, `G`, `K`, `M`, `None`

### `ConnectVisualizationNumberFormatInfoNegativeValuesType`
`Auto`, `MinusAfterNumber`, `MinusAfterSuffix`, `MinusBeforeNumber`, `MinusBeforePrefix`, `Parenthesis`

### `ConnectVisualizationAxisSynchronizationType`
`FullRange`, `None`, `ZeroPosition`

### `ConnectVisualizationAxisTicksType`
`Auto`, `Fixed`, `None`

### `ConnectVisualizationMarksToLabelType`
`All`, `LineEnds`

### `ConnectVisualizationForecastModelType`
`HoltWinters`, `RidgeRegression`

### `ConnectVisualizationForecastGranularityType`
`InferFromData`

### `ConnectVisualizationForecastPredefinedDateType`
`LatestData`

### `ConnectVisualizationForecastTimeUnitType`
`Days`, `Hours`, `Minutes`, `Months`, `Quarters`, `Weeks`, `Years`

### `ConnectAnalyticsActionTypeEnum`
`Flow`, `Navigate`, `RecordAction`

### `ConnectAnalyticsEventTypeEnum`
`Click`, `Select`

## Workspace asset enums

### `ConnectWorkspaceAssetTypeEnum`
`AnalyticsDashboard`, `AnalyticsVisualization`, `Flexipage`, `MktCalculatedInsightObject`, `MktDataConnection`, `MktDataLakeObject`, `MktDataModelObject`, `SemanticModel`

### `ConnectWorkspaceAssetUsageTypeEnum`
`Created`, `Referenced`

## Semantic Layer enums

### `SemanticCategoryEnum`
`Marketing`, `Commerce`, `Sales`, `Service`, `Other`

### `SemanticEntityQueryableEnum`
`Queryable`, `NonQueryable`

### `SemanticModelSourceCreationTypeEnum` (spec) / observed
**Spec:** `Manual`, `Import`
**Observed in real orgs:** `Manual`, `Import`, `Application`, `DataCloud`

### `SemanticModelVersionStateEnum`
`Draft`, `Published`, `PublishedWithDraft`

### `SemanticQueryUnrelatedDataObjectsTypeEnum`
**Spec:** `Allow`, `Disallow`
**Observed in real orgs:** `Allow`, `Disallow`, `Union`

## Semantic — collection-item field enums (from live probes)

### Cardinality (relationships)
`OneToOne`, `OneToMany`, `ManyToOne`, `ManyToMany`

### JoinType (relationships)
`Auto`, `Inner`, `Left`, `Right`, `Full`

### JoinOperator (relationship criteria)
`Equals` *(observed; `NotEquals`, `GreaterThan`, `LessThan`, etc. are inferred)*

### FieldType (relationship criteria left/right)
`TableField`, `Constant`

### CalcLevel (calculated dimensions / measurements)
`AggregateFunction`, `Row`

### Sentiment (calc & metric)
`SentimentTypeUpIsGood`, `SentimentTypeUpIsBad`, `SentimentNone`

### Directionality (calc)
`Up`, `Down`

### InsightType (semantic metric)
`TopContributors`, `BottomContributors`, `ComparisonToExpectedRangeAlert`, `TrendChangeAlert`, `ConcentratedContributionAlert`, `TopDrivers`, `TopDetractors`, `CurrentTrend`

### DataType (dimensions / measurements)
`Text`, `Number`, `Date`, `DateTime`, `Boolean` *(common; spec is open-ended)*
