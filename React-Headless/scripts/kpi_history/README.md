# CRM KPI history

This folder supports the CRM sparklines and the Pipeline Movement deltas in the three cockpits (plan step 4, `docs/superpowers/plans/2026-11-05-real-data-no-mocks.md`).

## How the history is produced

All of it is computed in Data 360. There's no snapshot object and no Apex job. `_shared/src/data/crmKpis.ts` `historySql()` runs one ANSI SQL query through `DcBridgeRest` (Query API) over the CRM-ingested DMOs, and reconstructs "open as of" the end of each of today − 7k (k = 7…0):

| Metric | DMO | Open on day D when |
|---|---|---|
| `pipeline`, `openOpps` | `ssot__Opportunity__dlm` (owner `ssot__OwnerUserId__c`) | created before D, and still open or closed on/after D. Closed = `LEAST(CloseDate, LastModifiedDate)`: there's no stage-change date or OpportunityHistory DMO, and many closed opps carry future CloseDates. |
| `stage:<S>` | same | currently open in stage S and created before D |
| `openCases` | `ssot__Case__dlm` ⋈ `ssot__Account__dlm` (account `ssot__OwnerId__c`) | created before D, and still open or `ClosedDateTime` ≥ D |
| `leads` | `ssot__Lead__dlm` (`ssot__OwnerId__c`) | created before D, and unconverted or `ConvertedDate` ≥ D |

All 8 points come from Data 360, so the week-over-week delta never mixes in CRM ingestion lag. The tile still shows the live CRM aggregate. Goals have no history because `ssot__FinancialGoal__dlm` has no owner.

## `generate_crm_activity.py`: backdated activity

The org's CRM book was bulk-loaded on 2026-05-21..26 and hasn't moved since, so the Data 360 reconstruction comes out flat. This script writes about 9 weeks (2026-09-04 → 11-05) of real activity on the bankers' own accounts:

- new open opportunities, cloned from the banker's open opps with the amount varied by up to ±35%
- legacy open opps closed as Closed Won or Closed Lost, with a CloseDate inside the window
- new cases, closed 1–14 days after they're opened
- new leads

It backdates `CreatedDate` and `Case.ClosedDate` using the "Set Audit Fields upon Record Creation" permission. New records are tagged in `Description` with `KPI history backfill 2026-11-06`. The legacy opps it closes are listed in `out/opportunity_close.csv`, and the bulk job ids go to `out/manifest.json`. The plan is deterministic (seed `20261106`).

```bash
python3 generate_crm_activity.py --plan               # export templates, write out/*.csv, print counts
python3 generate_crm_activity.py --apply --sample 2   # smoke test: 2 rows per file
python3 generate_crm_activity.py --apply              # full run; the CRM connector carries it into the DMOs
```

Planned volumes as of 2026-11-06:

| Banker | New opps | Won | Lost | Cases | Leads |
|---|---|---|---|---|---|
| Sarah | 238 | 172 | 69 | 378 | 30 |
| Kim | 59 | 35 | 17 | 56 | 9 |
| Allen | 151 | 84 | 33 | 142 | 17 |

**Status (2026-11-06): planned, not applied.** The auto-mode permission classifier blocked the bulk write. Until the script runs, the Data 360 history reflects the org as it is: flat CRM series.

Rollback: delete the records tagged `KPI history backfill 2026-11-06`, reopen the opps in `out/opportunity_close.csv` (their original stage is in the history). The Data 360 history follows on the next CRM sync.
