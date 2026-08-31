# Data Cloud Inventory

Generates a filterable inventory of every **Data Cloud data stream** in an org,
joined to its **DLO** (Data Lake Object) and mapped **DMO(s)**. Run it ad-hoc;
it writes two artifacts you can slice on the fly.

## Quick start

```bash
cd DataCloud_Inventory
pip install -r requirements.txt          # one-time (needs openpyxl)
python generate_inventory.py             # defaults to org alias jdo-oe0sdd
open output/data_stream_inventory.html   # or the .xlsx
```

Auth is borrowed from the Salesforce CLI — you must already be authenticated to
the target org (`sf org login web -o <alias>`). No tokens live in the script.

### Options

| Flag | Default | Purpose |
|------|---------|---------|
| `--org` | `jdo-oe0sdd` | sf org alias to inventory |
| `--out` | `output` | output directory |
| `--api-version` | `67.0` | Salesforce API version (org is v67) |
| `--workers` | `16` | parallel mapping queries |

## Outputs (`output/`)

- **`data_stream_inventory.xlsx`** — multi-sheet workbook. Every data sheet has a
  frozen header row and column **autofilter** dropdowns:
  - `Inventory` — the master Stream → DLO → DMO join (one row per stream)
  - `Unmapped Streams` — streams whose data flows to no DMO
  - `Needs Attention` — failed/warning last run, non-active status, or disabled
  - `Orphaned DLOs` — DLOs in the org with no visible stream feeding them
  - `Summary by Connector` / `by Category` / `by Source Object`
  - `Connectors` — per-connector rollup (stream count + source objects)
- **`data_stream_inventory.html`** — one self-contained page (no dependencies)
  with live all-column search, per-column filters, and click-to-sort headers.
  Open in any browser; share as a single file.

## Master column guide (`Inventory`)

`Data Stream Name`, `Data Stream Label`, `Stream Status`, `Enabled`,
`Last Run Status`, `Last Refresh Date`, `Total Records`, `Last Added Records`,
`Connector Type`, `Connector Name`, `Data Source`, `Data Stream Type`,
`Source Object`, `Refresh Mode`, `Frequency Type`, `DLO Name`, `DLO Category`,
`DLO Status`, `DLO Field Count`, `Data Space`, `Mapped DMO(s)` (`;`-separated),
`Mapping Count`, `DMO Field Count`, `Is Mapped`, `Needs Attention`, `Record ID`.

## How it works / caveats

Data comes from the Data Cloud metadata REST API (`/services/data/v67.0/ssot/*`):

1. **Streams** — paged from `/ssot/data-streams`. Each record embeds its DLO
   (`dataLakeObjectInfo`), connector, refresh config, status, and record counts,
   so the stream → DLO half of the join needs no extra calls.
2. **DMO mapping** is resolved from `/ssot/data-model-object-mappings` with a
   **forward pass** (`sourceObjectName`, CRM streams) **and a reverse pass**
   (`dmoDeveloperName`, every DMO). The reverse pass is required: non-CRM streams
   (Snowflake/Databricks/Heroku) return empty on the source-object query and
   would otherwise appear unmapped. Maps are deduped by `developerName` and
   attributed to a stream via the map name prefix (`{stream}_map_…`).
3. **DMOs** and **DLOs** are enumerated from `/ssot/metadata` for field counts
   and orphan detection. If the `DataLakeObject` entity type is unavailable,
   orphan detection is skipped (a warning is printed) and every other sheet is
   still produced.

Empty `200` responses (a valid "no mappings") and `400`s on a bad lookup key are
treated as "no results" rather than errors, so a few odd source objects/DMOs
never abort the run.

## Ad-hoc via Claude

The script is the source of truth, but you can also ask Claude to run it (it uses
the same `sf` auth) or to regenerate against a different org.
