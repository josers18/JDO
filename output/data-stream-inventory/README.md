# Data Stream Inventory — jdo-0pz8au

Complete audit of every Data Cloud data stream in the org, enriched with data
source, connector type, DLO details, record counts, DMO mapping status, and
health indicators.

- **Org:** `jdo-0pz8au` (storm-16a17dc388fbe6.demo.my.salesforce.com)
- **API version:** v65.0
- **Generated:** 2026-07-02

## Files

| File | Rows | What it is |
|------|------|-----------|
| `data_stream_inventory.csv` | 319 | **Master table** — one row per unique data stream, 23 columns |
| `orphaned_dlos.csv` | 247 | DLOs with no linked visible data stream |
| `summary_by_connector.csv` | 18 | Per-connector-type rollup (streams, active, failed, mapped, records) |
| `summary_by_category.csv` | 5 | Per-DLO-category rollup |
| `summary_by_source_object.csv` | 118 | Per-source-object rollup (streams + DMOs it feeds) |
| `streams_needing_attention.csv` | 55 | Streams with a failed/warning last run or non-active status |
| `unmapped_streams.csv` | 181 | Streams whose data flows to no DMO (sorted by record volume) |
| `dlo_field_reference.csv` | 566 | Every DLO with field count, primary key(s), created/refreshed dates |
| `data_stream_inventory Profile Use.csv` | 319 | Working copy of the master table (byte-identical) — a scratch duplicate for profile-specific edits; not a generated artifact |

## Key findings

- **319 unique streams**, 314 ACTIVE, **7 failed on last run** (see attention list)
- **138 streams mapped** to DMOs; 181 unmapped (raw ingestion only)
- **566 unique DLOs**, of which **247 are orphaned** (no linked stream)
- **Record volume concentrates in Snowflake** (~109M rows) and one DATACLOUD
  share (~10M); the largest single stream is `Financial_Transactions_Snow_XL`
  at 100M rows (unmapped).

### Connector mix (streams)
SalesforceDotCom 142 · Snowflake 43 · Databricks 28 · IngestApi 27 ·
AIPlatform 15 · HerokuPostgres 14 · StreamingApp 14 · EventBusConnector 11 ·
ECI 6 · UploadedFiles 5 · AwsS3 5 · others 9

## Column guide (`data_stream_inventory.csv`)

`Stream Name`, `Label`, `Data Source`, `Source Object`, `Connector Type`,
`Data Stream Type`, `Category`, `Status`, `Status Health` (OK/WARN/UNKNOWN),
`Enabled`, `Last Run Status`, `Run Health` (OK/FAIL/WARN), `Last Refresh Date`,
`Total Records`, `Last Added Records`, `Last Processed Records`, `DLO Name`,
`DLO Status`, `Mapped DMO(s)` (`;`-separated), `Mapping Count`, `Refresh Mode`,
`Frequency Type`, `Record ID`.

## Method notes / caveats

- **Streams** deduped by developer `name` across 2 API pages.
- **Mappings** resolved via *both* a forward lookup (`sourceObjectName`, CRM
  streams) and a reverse lookup (`dmoDeveloperName`, all 44 mapped DMOs). The
  reverse pass is required because non-CRM streams (Snowflake/Databricks/Heroku)
  expose no source object and would otherwise appear unmapped. Streams are
  joined to mappings via the mapping `developerName` prefix (`{stream}_map_…`).
- **Record counts:** 65 null `totalRecords` values were backfilled with
  `SELECT COUNT(*)` via `queryv2`. One DLO (`Intermediary__dll`, a federated
  foreign data source) errors on COUNT and is left blank.
- **DMO enumeration** skipped 2 org-side "poison" DMO records (offsets 284–285
  and 1360–1379) that fail to serialize with `ILLEGAL_QUERY_PARAMETER_VALUE`
  (unknown category enum `CG_Audience`). These are DMOs, not streams, and do
  not affect the stream inventory.
- All CSVs are UTF-8 with a header row — open in Excel/Sheets or edit in place.
