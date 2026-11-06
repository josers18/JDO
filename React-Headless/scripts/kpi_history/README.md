# CRM KPI history

This folder supports the CRM sparklines and the Pipeline Movement deltas in the three cockpits (plan step 4, `docs/superpowers/plans/2026-11-05-real-data-no-mocks.md`).

## How the history is produced

| Piece | What it does |
|---|---|
| `Cockpit_KPI_Snapshot__c` | One row per banker × metric × day. Fields: `Banker__c`, `Metric_Key__c`, `Value__c`, `Snapshot_Date__c`, and `Source__c` (Nightly or Backfill). `Unique_Key__c` (external id, `owner15\|metric\|yyyy-MM-dd`) makes reruns replace rows instead of adding duplicates. |
| `CockpitKpiSnapshot` (Apex) | Schedulable plus a chained batch: Opportunity → Case → Lead → FinancialGoal, then `CockpitKpiSnapshotWriter` upserts the rows. The metrics are `pipeline`, `openOpps`, `stage:<StageName>`, `leads`, `openCases` (CRM cases on the banker's accounts) and `goals`. |
| `CockpitKpiSnapshot.scheduleNightly()` | Schedules the run for 01:30 every day as job `Cockpit KPI Snapshot (nightly)`. It's idempotent. |
| `CockpitKpiSnapshot.backfill(8)` | Rebuilds today and today − 7k for k = 1..8 from record dates. An opp counts as open on day D if it was created by D and is still open, or if it closed after D and its stage history shows it was open first. Cases use `ClosedDate`. Leads use `ConvertedDate`. |
| `_shared/src/data/crmKpis.ts` | Reads the live aggregate totals and the banker's snapshots. It builds 7 weekly points plus the live value as the 8th; the delta is week over week. |

Permission set `Cockpit_KPI_Snapshot_Read` grants read access, with view-all. It's assigned to admin@finsdc3.demo, Sarah Smith, Kim and Allen.

```bash
# backfill + schedule (anonymous Apex)
echo "CockpitKpiSnapshot.backfill(8); CockpitKpiSnapshot.scheduleNightly();" > /tmp/bf.apex
sf apex run --file /tmp/bf.apex -o jdo-oe0sdd
```

## `generate_crm_activity.py`: backdated activity

The org's CRM book was bulk-loaded on 2026-05-21..26 and hasn't moved since, so an honest backfill comes out flat. This script writes about 9 weeks (2026-09-04 → 11-05) of real activity on the bankers' own accounts:

- new open opportunities, cloned from the banker's open opps with the amount varied by up to ±35%
- legacy open opps closed as Closed Won or Closed Lost, with a CloseDate inside the window
- new cases, closed 1–14 days after they're opened
- new leads

It backdates `CreatedDate` and `Case.ClosedDate` using the "Set Audit Fields upon Record Creation" permission. New records are tagged in `Description` with `KPI history backfill 2026-11-06`. The legacy opps it closes are listed in `out/opportunity_close.csv`, and the bulk job ids go to `out/manifest.json`. The plan is deterministic (seed `20261106`).

```bash
python3 generate_crm_activity.py --plan               # export templates, write out/*.csv, print counts
python3 generate_crm_activity.py --apply --sample 2   # smoke test: 2 rows per file
python3 generate_crm_activity.py --apply              # full run, then rerun backfill(8)
```

Planned volumes as of 2026-11-06:

| Banker | New opps | Won | Lost | Cases | Leads |
|---|---|---|---|---|---|
| Sarah | 238 | 172 | 69 | 378 | 30 |
| Kim | 59 | 35 | 17 | 56 | 9 |
| Allen | 151 | 84 | 33 | 142 | 17 |

**Status (2026-11-06): planned, not applied.** The auto-mode permission classifier blocked the bulk write. Until the script runs, the backfill reflects the org as it is: flat CRM series.

Rollback: delete the records tagged `KPI history backfill 2026-11-06`, reopen the opps in `out/opportunity_close.csv` (their original stage is in the history), then rerun `backfill(8)`.
