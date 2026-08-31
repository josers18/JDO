# Changelog

All notable changes to `DataCloud_Inventory` are documented here. The format is
loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); entries
are dated newest-first and grouped by month. Treat shipped entries as immutable
history — when new work lands, add a NEW dated entry rather than retroactively
editing prior ones.

## [August 2026] — 2026-08-31

### 2026-08-31 — Initial release

- `feat(datacloud-inventory)` — New standalone Python tool
  `generate_inventory.py` that pulls every Data Cloud data stream in an org and
  joins it to its DLO and mapped DMO(s), producing two filterable artifacts: an
  autofilter multi-sheet `.xlsx` workbook (Inventory, Unmapped Streams, Needs
  Attention, Orphaned DLOs, Summary by Connector/Category/Source Object,
  Connectors) and a self-contained `.html` page with live search, per-column
  filters, and click-to-sort. Auth is borrowed from the `sf` CLI; no secrets in
  the repo. Stdlib + `openpyxl` only.
- `feat(datacloud-inventory)` — DLO → DMO mapping resolved **reverse-only** (per
  DMO via `?dmoDeveloperName=…`) rather than forward-by-source-object, which
  hangs/resets the connection on large CRM objects. Reverse still covers CRM
  streams and correctly maps non-CRM (Snowflake/Databricks/IngestApi) streams.
- `docs(datacloud-inventory)` — Added `README.md` (quick start, column guide,
  method caveats) and `AGENTS.md` (agent-orientation primer, including the
  reverse-mapping and heavy-payload traps).
- First verified run against `jdo-oe0sdd` (v67): 406 streams · 288 mapped ·
  118 unmapped · 13 need attention · 284 orphaned DLOs.
- Supersedes the one-time manual snapshot in `../output/data-stream-inventory/`
  (org `jdo-0pz8au`, now defunct).
