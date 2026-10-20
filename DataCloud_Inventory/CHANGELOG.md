# Changelog

All notable changes to `DataCloud_Inventory` are documented here. The format is
loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); entries
are dated newest-first and grouped by month. Treat shipped entries as immutable
history — when new work lands, add a NEW dated entry rather than retroactively
editing prior ones.

## [October 2026] — 2026-10-20

### 2026-10-20 — Stale browser edits clear themselves

- `fix(datacloud-inventory)` — On load, the HTML editor now shrinks each saved
  (localStorage) edit to what the current rules don't already give, and drops
  it when that matches the committed corrections. Edits made before a rule
  change or commit no longer linger as pending and get re-exported.
- `fix(datacloud-inventory)` — Persona tags are compared as a set, so
  `Business; Personal` no longer counts as a correction against a rule giving
  `Personal; Business`.

### 2026-10-20 — Transactions rule covers both personas

- `feat(datacloud-inventory)` — The `transactions` rule now tags
  Personal + Business (transaction feeds carry person and business account
  activity, e.g. `Financial_Transactions_Generation`'s personal + business
  accounts). Retags 11 streams, including the uncorrected
  `Financial_Transactions_AWSRedshift`.
- `data(datacloud-inventory)` — Dropped the 7 per-stream transaction persona
  corrections the rule now covers and the persona half of
  `Financial_Transactions_Heroku_Postgres` (its suppression stays):
  114 → 107 corrections.

### 2026-10-20 — Salesforce core personas under a person-account model

- `feat(datacloud-inventory)` — Reviewed all 199 SalesforceDotCom streams
  assuming person accounts are on (Account / Contact / Lead / financial
  accounts carry both personas). Shared objects move to `All`:
  `FinancialAccountTransaction` and `FinServ__FinancialAccountRole__c` (any
  account type owns financial accounts; matches `FinancialAccountParty`),
  `Meeting_Note__c`, the `Offer*` / `Personalization*` objects (Cumulus offers
  include business deposit and lending offers), and `Pricebook2` /
  `PricebookEntry` / `Quote` (product catalog, not a business-only signal).
  Holdings, securities, goals, plans, assets/liabilities, households and life
  events stay `Personal` (FSC wealth / individual objects). 23 streams retagged.

### 2026-10-20 — BT_ dataset personas from generator source

- `feat(datacloud-inventory)` — Persona rules for the BT_ Snowflake datasets
  now follow each generator's audience SQL (`Snowflake_*/README.md`,
  `Financial_*_Generation/README.md`) instead of name guesses. A new
  `all-account BT_ datasets` rule tags Personal + Business: BoardEx, Gong,
  Synth Relationship Graph and MGP (all `V_ACCOUNT_ANCHORS`), Esri (branch-ZIP
  scoped), Financial Trades (person + business tiers) and
  `Financial_Transactions_BT_Snow`. MSCI ESG moves to Business
  (`ACCOUNT_TYPE_FLAG = 'BUSINESS'`). 8 streams retagged; no others change.

### 2026-10-20 — Corrections skill docs

- `docs(datacloud-inventory)` — README and AGENTS.md point to the Claude Code
  skills: `applying-datacloud-inventory-corrections` (export → validate →
  prune → regenerate → PR) and `generating-datacloud-inventory`.

### 2026-10-20 — Insurance suppression rule

- `feat(datacloud-inventory)` — `persona_rules.json` gains a persona-based
  `suppress_rules` entry, `Insurance` → *Initiative-specific: Insurance*, so
  every stream the Insurance rule tags (including new ones) auto-suppresses.
- `data(datacloud-inventory)` — Dropped the 18 per-stream Insurance
  corrections from `corrections/jdo-oe0sdd.json` (99 → 81) that the rule now
  covers; regenerated output is unchanged (238 suppressed) apart from those
  rows' blank *Corrected By*.

### 2026-10-20 — Personas, suppression flags, collaborative corrections

- `feat(datacloud-inventory)` — Every stream is tagged with a **Persona**
  (`Personal` incl. wealth, `Business`, `All`, plus `Insurance` / `Platform` /
  `Other Industry` / `Unclassified`) from ordered regex rules in the new
  `persona_rules.json`, with a `Persona Basis` column naming the rule. Workbook
  gains `Personal Datasets` / `Business Datasets` (persona + `All`) and
  `Summary by Persona`; the HTML gains a persona picker.
- `feat(datacloud-inventory)` — **Suppression flags** (`Suppressed`,
  `Suppress Reason`) for streams that aren't customer-useful: `test_*` /
  sample / demo-connector streams (`Test`), `Platform` (`Internal`),
  `Other Industry` (`Non-FS demo data`). Flag only — rows stay listed; a
  `Suppressed Streams` sheet collects them.
- `feat(datacloud-inventory)` — **Collaborative corrections.** The HTML's
  *Edit classifications* mode lets anyone re-tag or (un)suppress a stream with a
  note; edits persist in the browser and *Export corrections* writes the merged
  `corrections/<org>.json`, which the generator applies on every run
  (`--corrections`). Changes are shared via PR.
- `feat(datacloud-inventory)` — **Spreadsheet-style mass editing** in the
  HTML editor: checkbox selection (shift-click ranges, select-all-shown),
  **Bulk edit…** (replace/add/remove persona, suppress/unsuppress with reason,
  set/clear note, revert to rules), and in-place cells (click *Suppressed* to
  toggle, double-click *Suppress Reason* / *Notes* to type).
- `data(datacloud-inventory)` — First collaborator corrections for
  `jdo-oe0sdd`: 18 Insurance streams suppressed as *Initiative-specific:
  Insurance*, `asset_Databricks` as *Test*.
- `feat(datacloud-inventory)` — Live runs write `output/raw_snapshot.json`;
  `--from-snapshot` rebuilds every artifact from it in seconds.
- Verified against `jdo-oe0sdd` (v67): 434 streams · 317 mapped · 117 unmapped ·
  30 need attention · 262 orphaned DLOs · 162 suppressed (135 Internal,
  18 Initiative-specific: Insurance, 5 Non-FS, 4 Test) · 1 unclassified
  (`asset_Databricks`, suppressed as Test).

## [October 2026] — 2026-10-17

### 2026-10-17 — Export from the HTML page

- `feat(datacloud-inventory)` — The `.html` page gains **Export CSV** and
  **Export Excel** buttons. Both export the rows currently shown (after search,
  per-column filters, and sort). CSV is UTF-8 with a BOM so Excel reads accents;
  the `.xlsx` is built in the browser (a stored zip of SpreadsheetML parts) with
  a frozen, styled header and autofilter, and numbers/booleans kept as typed
  cells. The page stays dependency-free.
- `docs(datacloud-inventory)` — README and AGENTS.md describe the exports.
- Verified run against `jdo-oe0sdd` (v67): 433 streams · 316 mapped ·
  117 unmapped · 30 need attention · 261 orphaned DLOs.

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
