# AGENTS.md — DataCloud_Inventory

Context for AI coding agents working on the **Data Cloud inventory generator** — a
standalone Python tool that pulls every Data Cloud data stream in a Salesforce org
and joins it to its DLO (Data Lake Object) and mapped DMO(s), then writes two
filterable artifacts (an autofilter `.xlsx` workbook and a self-contained
searchable `.html` page).

For user-facing quick-start / column guide / method caveats, see [README.md](README.md).
This file is the agent-orientation primer.

# Tech stack

- **Python 3** — single script `generate_inventory.py`, standard library only
  except **`openpyxl`** (workbook writer, in `requirements.txt`). No pandas, no
  Salesforce SDK, no framework.
- **Salesforce CLI (`sf`)** for auth — the script shells out to
  `sf org display --json` (instance URL) and `sf org auth show-access-token`
  (bearer). No secrets live in the repo; you must already be authenticated to the
  target org.
- **Data Cloud metadata REST API** — `GET /services/data/v67.0/ssot/*` endpoints
  (`data-streams`, `metadata`, `data-model-object-mappings`). Read-only.
- **No Salesforce DX, no Apex, no LWC, no CI/CD.** This project is
  `force-app/`-free; it's one script you run ad-hoc.

# Project structure

```
DataCloud_Inventory/
├── generate_inventory.py   ← the whole tool (fetch → join → write xlsx + html)
├── requirements.txt        ← openpyxl only
├── README.md               ← quick start, column guide, method/caveats
├── .gitignore              ← ignores output/
└── output/                 ← generated artifacts (gitignored, regenerate anytime)
    ├── data_stream_inventory.xlsx
    └── data_stream_inventory.html
```

# Commands

```bash
cd DataCloud_Inventory
pip install -r requirements.txt          # one-time (needs openpyxl)
python generate_inventory.py             # defaults to org alias jdo-oe0sdd
open output/data_stream_inventory.html   # or the .xlsx

# flags
python generate_inventory.py --org <alias> --out <dir> --api-version 67.0 --workers 16
```

You must be authenticated to the target org first (`sf org login web -o <alias>`).
A full run takes ~4 min — the streams fetch dominates (see Common mistakes).

# Architecture

Four fetch phases, then a join, then two writers. All in `generate_inventory.py`:

1. **`fetch_streams`** — pages `/ssot/data-streams` (`limit=50`). Each stream record
   already embeds its DLO (`dataLakeObjectInfo`), connector, refresh config, status,
   and record counts, so the **Stream → DLO** half of the join needs no extra calls.
2. **`fetch_dmos`** / **`fetch_dlos`** — `/ssot/metadata?entityType=DataModelObject`
   (~618) and `=DataLakeObject` (~673) for DMO field counts and orphan detection.
3. **`fetch_mappings`** — resolves **DLO → DMO** by querying each DMO in reverse
   (`?dmoDeveloperName=…`). See Common mistakes for why forward is avoided.
4. **`build_stream_dmos` / `build_rows` / `build_breakdowns` / `build_connectors`** —
   join maps to streams via the map `developerName` prefix (`{stream}_map_…`),
   emit the 26-column master plus Unmapped / Needs-Attention / Orphaned-DLO /
   Summary / Connectors tables.
5. **`write_xlsx`** (multi-sheet, frozen header + autofilter per sheet) and
   **`write_html`** (one file; embeds rows as JSON, vanilla-JS search/filter/sort).

# Conventions

## Python style

- Standard library first; `openpyxl` is the only third-party dependency — keep it
  that way unless there's a strong reason. No pandas.
- The HTTP client (`Client.get`) treats empty `200` bodies and `400`/`404` on a
  lookup key as "no results" (returns `{}`), not errors — a few odd source
  objects/DMOs must never abort a full run. Only `401`/`403` are fatal.
- Auth is always borrowed from the `sf` CLI (`get_session`) — never hard-code a
  token, instance URL, or org id.

## Idempotency

- The tool is read-only against the org and fully idempotent: every run
  regenerates `output/` from scratch. `output/` is gitignored — never commit
  generated artifacts.

# Common mistakes

- **Do NOT resolve mappings with the forward query.**
  `/ssot/data-model-object-mappings?sourceObjectName=<CRM object>` HANGS / resets
  the connection (HTTP 000) on large CRM objects like `Account` (hundreds of field
  mappings per map) — this caused a multi-minute stall. The **reverse** query
  `?dmoDeveloperName=ssot__X__dlm` returns only that DMO's maps, is fast, AND still
  surfaces CRM streams (e.g. `ssot__Individual__dlm` → `Contact_Home_map_…`).
  Reverse-only over all DMOs is both faster and complete — it caught 155 non-CRM
  streams (Snowflake/Databricks/IngestApi) a forward pass would miss.
- **The `data-streams` payload is heavy.** Each record embeds full DLO + source
  field lists, so `limit=200` times out. Page at `limit=50` with a ~90s timeout;
  ~3 min for ~406 streams is normal. Don't "optimize" by raising the page size.
- **`dataLakeObjectInfo.dataSpaceInfo` is a LIST, not a dict.** Handle both shapes
  when reading the data space (see `build_rows`).
- **Block-buffered stderr through a pipe.** Running `python … | tail` hides all
  progress until the process exits (`tail` buffers). Redirect to a file
  (`python -u … > run.log 2>&1`) to watch progress live.
- **Empty `200` ≠ error.** A source object/DMO with no maps returns an empty body;
  parsing it as JSON throws. `Client.get` already guards this — preserve it.

# Related docs

- @README.md — quick start, column guide, method / caveats
- @../output/data-stream-inventory/README.md — the superseded one-time Jul-2 manual
  snapshot (org `jdo-0pz8au`, now defunct) this tool replaces
- @../React-Headless/AGENTS.md — sibling project whose Data Cloud bridges expose the
  same `ssot` REST surface
