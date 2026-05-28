# Idempotency

Every record this package writes carries an External-ID. Account rows
use the `MDMP#####` (persons) / `MDM#####` (businesses) namespace as
of Phase 6 (2026-05-27); every other object still uses the legacy
`HYDRATE-{TYPE}-{SEQ}` convention. Re-running with `--append` is safe;
re-running without `--append` against an org that already has hydrated
records refuses to proceed; `--reset --confirm` deletes only the
hydration cohort (Account `MDM%` + child-object `HYDRATE-%`) and never
touches anything else.

This document is the canonical reference for those guarantees. The
authoritative implementation is in `customer_hydration/loader/reset.py`
and `customer_hydration/cli.py`.

## Phase 6 namespace migration (2026-05-27)

Phase 6 renumbered the Account cohort fleet-wide:

```
HYDRATE-RT-NNNNNN  →  MDMP#####  (Retail Person Account)
HYDRATE-WL-NNNNNN  →  MDMP#####  (Wealth Person Account)
HYDRATE-HH-NNNNNN  →  MDMP#####  (Household Person Account)
HYDRATE-SMB-NNNNNN →  MDM#####   (Small Business Account)
HYDRATE-COM-NNNNNN →  MDM#####   (Commercial Account)
```

Persons → `MDMP00001..MDMP25424` (25,424 rows). Businesses →
`MDM00001..MDM10798` (10,798 rows). Existing 159 MDM seed rows + 19
previously-NULL rows folded into the same sequence; total cohort
36,222.

**Width is not capped.** The 5-digit width was demo-convenient; if
a future hydration pass exceeds it, expand to whatever sequence is
needed.

**Child objects (Contact, ACR, FinancialAccount, Card, Goal,
Opportunity, Case, Task, Event, Campaign, CampaignMember, etc.)
were NOT renumbered** — they keep the `HYDRATE-{TYPE}-{SEQ}`
convention below. The `External_ID__c LIKE 'HYDRATE-%'` filter in
side-DMO joins still resolves correctly because the parent Account
relationship traverses via `Id`, not `External_ID__c`.

**Segment side effect:** the 21 live DC segments still hold a
`External_ID_c__c contains "HYDRATE-"` server-side criteria from
Phase 2/3d. The renumber invalidated that filter (every Account is
now `MDM*`/`MDMP*`), so segments return 0 members until recreated.
Tracked in [`ROADMAP.md`](ROADMAP.md) § Phase 6 follow-ups.

## External-ID namespace (child objects)

```
HYDRATE-{TYPE}-{SEQ}
```

`SEQ` is zero-padded to 6 digits. `TYPE` is a 2-5 letter object family
prefix. Account-row prefixes (`HYDRATE-RT/WL/SMB/COM/HH-*`) are
historical — current Account External_IDs follow the `MDMP/MDM`
convention above.

| Prefix | Object | Idempotency field | Bridge field | Wave |
|---|---|---|---|---|
| `HYDRATE-RT-{n}` | Retail Person Account | `External_ID__c` | — | A |
| `HYDRATE-WL-{n}` | Wealth Person Account | `External_ID__c` | — | A |
| `HYDRATE-SMB-{n}` | Small Business Account | `External_ID__c` | — | A |
| `HYDRATE-COM-{n}` | Commercial Account | `External_ID__c` | — | A |
| `HYDRATE-HH-{n}` | Household Account | `External_ID__c` | — | A |
| `HYDRATE-TR-{n}` | Trust Account | `External_ID__c` | — | A |
| `HYDRATE-CT-{n}` | Contact (business officers) | `External_Id__c` (lowercase d) | — | B |
| `HYDRATE-ACR-{n}` | AccountContactRelation | `External_ID__c` | — | C |
| `HYDRATE-FA-{n}` | Legacy `FinServ__FinancialAccount__c` | `External_ID__c` | — | D |
| `HYDRATE-NFA-{n}` | Native `FinancialAccount` | `External_ID__c` (synthesized; org may upsert via `LegacyId__c` instead) | `LegacyId__c` -> legacy FA | F |
| `HYDRATE-CARD-{n}` | `FinServ__Card__c` | `External_ID__c` | — | D |
| `HYDRATE-GOAL-{n}` | Legacy `FinServ__FinancialGoal__c` | `External_ID__c` | — | D |
| `HYDRATE-NGOAL-{n}` | Native `FinancialGoal` | `External_ID__c` | `LegacyId__c` -> legacy goal | F |
| `HYDRATE-LE-{n}` | `FinServ__LifeEvent__c` | `FinServ__SourceSystemId__c` | — | D |
| `HYDRATE-MS-{n}` | Legacy `FinServ__BusinessMilestone__c` | `External_ID__c` (NEW field) | — | D |
| `HYDRATE-NMS-{n}` | Native `BusinessMilestone` | `External_ID__c` | `OriginalLegacyGoalId__c` -> legacy milestone | F |
| `HYDRATE-HOLD-{n}` | `FinServ__FinancialHolding__c` | `FinServ__SourceSystemId__c` | — | E |
| `HYDRATE-OPP-{n}` | Opportunity | `External_ID__c` | — | D |
| `HYDRATE-CASE-{n}` | Case | `External_ID__c` | — | E |
| `HYDRATE-TASK-{n}` | Task | `External_ID__c` | — | E |
| `HYDRATE-EVT-{n}` | Event | `External_ID__c` | — | E |
| `HYDRATE-CMP-{n}` | Campaign (~10 only) | `External_ID__c` | — | D |
| `HYDRATE-CMPMEM-{n}` | CampaignMember | `External_ID__c` | — | E |
| `HYDRATE-FAR-{n}` | `FinServ__FinancialAccountRole__c` ("FA Role") | `External_ID__c` | — | E |
| (none — natural key) | `FinancialAccountParty` | (none) | — | G |
| (none — natural key) | `PartyRelationshipGroup` | (none) | — | F |
| (none — natural key) | `PartyProfile` | (none) | — | F |
| (none — natural key) | `ContactPointAddress` | (none) | — | F |
| (none — natural key) | `ContactPointEmail` | (none) | — | F |
| (none — natural key) | `ContactPointPhone` | (none) | — | F |

The `HYDRATE-` prefix is collision-free against the existing 178
non-HYDRATE accounts (verified in `jdo-fw51xz`).

### Per-object External-ID-field map

The per-object idempotency-field map is defined in two places:

- `customer_hydration/loader/reset.py::_IDEM_FIELD` — drives the reset path.
- `customer_hydration/cli.py::_HYDRATE_SOBJECTS` — drives the `status` subcommand.

These two lists must stay in sync. If you add an sObject, update both.

## Why three different idempotency-field conventions

The org schema didn't pick one convention, so neither could we:

| Convention | Used by | Why |
|---|---|---|
| `External_ID__c` (capital ID, unique=True) | Most objects | Org's dominant pattern — the platform team standardized here. |
| `External_Id__c` (lowercase d) | `Contact` | Existing oddity that pre-dates this package. Not ours to fix. |
| `FinServ__SourceSystemId__c` | `FinServ__FinancialHolding__c`, `FinServ__LifeEvent__c` | These FSC managed objects have no `External_ID__c` field at all. |
| natural-key | `FinancialAccountParty`, `PartyProfile`, `PartyRelationshipGroup`, `ContactPoint*` | These native objects have no client-controlled external-id. The runner queries existing rows and de-dupes by parent reference + role / type. |

The `FinServ__SourceSystemId__c` fields exist on most legacy objects too;
when both are present the generator writes both so downstream tools
keying off either field work.

## Reset semantics

Source: `customer_hydration/loader/reset.py`.

### What `--reset --confirm` does

1. Refuse to run unless `>=1` HYDRATE-* record exists in the org. (So
   it's never used in a brand-new org.)
2. Print a planned-deletion summary:
   ```
   This will delete approximately 21,302 HYDRATE-* records.
   Existing non-HYDRATE accounts will NOT be touched.
   ```
3. Require the user to type the org alias verbatim as extra friction:
   ```
   Type the org alias to confirm: jdo-fw51xz
   jdo-fw51xz: <user types>
   ```
4. Walk waves in **reverse topological order** (G -> F -> E -> D -> C
   -> B -> A) so children delete before parents.
5. Per sObject, `SELECT Id FROM <sobject> WHERE External_ID__c LIKE 'HYDRATE-%'`
   (or `FinServ__SourceSystemId__c` for the SourceSystemId-keyed ones).
6. Write Ids to a CSV, shell out to `sf data delete bulk --file ... --sobject ...`
   (Bulk API 2.0 hard-delete).
7. Parse the JSON job info for `numberRecordsProcessed` and
   `numberRecordsFailed`. On failure, surface the error in
   `ResetReport.error`.
8. Failed reset does NOT proceed to insert.

### Plain-language summary

- `--reset` without `--confirm` -> exit code 2, no action.
- `--reset --confirm` against a non-sandbox org without
  `--allow-production` -> exit code 2, no action.
- `--reset --confirm --allow-production` against `jdo-fw51xz` ->
  prompts for alias, deletes everything HYDRATE-*, exits 0 if all
  bulk jobs succeeded.

### Objects skipped by reset

The 5 native objects with no External_ID__c (`PartyRelationshipGroup`,
`PartyProfile`, `ContactPointAddress/Email/Phone`, `FinancialAccountParty`)
are mapped to `None` in `_IDEM_FIELD` and the reset loop skips them
with a logged warning:

```
PartyRelationshipGroup: skipped — no External_ID__c, natural-key reset deferred to Plan 5
```

A future plan will extend reset with parent-External_ID query-back
(e.g. delete `PartyProfile` rows whose `AccountId.External_ID__c LIKE 'HYDRATE-%'`).

## Safety rails

### Production-org guard

The runner queries `sf org display --json` for `IsSandbox`. If false,
the runner refuses to run unless `--allow-production` is passed. This
guard fires for `hydrate`, `reset`, and `dc-status`.

`jdo-fw51xz` registers as non-sandbox even though it's a demo org —
hence the `--allow-production` shows up in every example.

### `WHERE External_ID__c LIKE 'HYDRATE-%'` everywhere

Every read-and-write query in the reset path includes a `WHERE
External_ID__c LIKE 'HYDRATE-%'` clause (or the equivalent for
`SourceSystemId__c`). The pre-existing 178 non-HYDRATE accounts are
literally unreachable from the reset code.

### Defense in depth

- `LeadSource = 'Hydration'` is stamped on Person Accounts so dashboards
  can additionally filter by source.
- `AccountSource = 'Hydration'` is stamped on Business Accounts.
- `FinServ__FinancialAccountSource__c = 'Cumulus:<product-code>'` on
  every FA.
- All tasks/events/cases set `Description` with prose that mentions
  "hydration" so a Setup-level Recycle Bin scan can spot stragglers.

### Audit trail

Every run writes `output/run-<ts>/manifest.json` with:

- `run_id`, `seed`, full CLI flag set
- Per-object row counts (`loaded`, `failed`, `duration_s`)
- Phase 5 Apex deploy/run results
- Phase 5.5 Data Cloud stream-trigger run Ids
- `dropped_fields` per object (Phase 0 describe-driven drops)
- `data_cloud_stream_failures` (if any)

This is the forensic trail when something goes sideways.

## Re-run scenarios

| Scenario | Command | Result |
|---|---|---|
| Fresh hydrate | `hydrate` | Phase 0 finds 0 HYDRATE-*. Generates seed=42. ~880K rows, ~50 min. |
| Same command twice (no flags) | `hydrate` then `hydrate` | Run 2 refuses unless `--append` or `--reset`. Exit 1. |
| Add 500 retail | `hydrate --retail 500 --smb 0 --wealth 0 --commercial 0 --append` | Adds 500 starting at the next free retail seq. |
| Top up Vince's book | `hydrate --wealth 50 --rm "Vince West" --append` | 50 wealth all owned by Vince. |
| Persona-logic regen | `hydrate --reset --confirm` then `hydrate --seed 42` | Deletes HYDRATE-*, re-loads canonical seed=42 state. |
| Reproducibility | `hydrate --reset --confirm --seed 42` | Same seed produces byte-identical CSV output. |
| Mid-run crash | `hydrate` crashes -> `hydrate resume` | Reads checkpoint.json, continues from interrupted wave. |

### What changes between runs of the same seed

Nothing. The generator is deterministic — `Faker(seed)`,
`random.Random(seed)`, sorted iteration order in dicts, sorted CSV
column output. Two runs of `--seed 42` produce byte-identical CSVs.

### What changes between runs of different seeds

Everything that's RNG-driven: customer names, addresses, phone numbers,
job titles, employer names, FA balances within their bands, holding
allocations, calendar dates within their windows, RM assignment within
the slack budget. The structural shape (who has how many FAs of what
type) is determined by the same random.Random object so it's also
seed-deterministic.

What does NOT change with seed: the org's record types, the user pool,
the picklist surfaces, the field set after Phase 0 describe.

## Known idempotency gaps

Tracked here so future plans can pick them up.

### Five native objects have no External-ID

`PartyRelationshipGroup`, `PartyProfile`, `ContactPointAddress`,
`ContactPointEmail`, `ContactPointPhone`, `FinancialAccountParty`.

Plan 4 emits these objects' CSVs but bulk_upsert can't load them via
`--external-id`. Plan 4 filters them out of the load step and logs them
as "INSERT-only deferred to Plan 5+". CSVs are still produced for review.

The reset path skips them with a logged warning (see "Objects skipped
by reset" above). Future plan will extend reset with parent-External_ID
query-back.

### FA Role write-once validation rule

This org has a custom validation rule on
`FinServ__FinancialAccountRole__c`:

> "This record cannot be edited. To update role information, you can
> deactivate this record and create a new one."

This blocked Plan 2's loader on re-runs (the bulk job tried to UPDATE
the existing role rows on the second invocation, ran the validation
rule, and failed 140+ records). Plan 3 worked around it by giving FA
Role its own `External_ID__c` prefix (`HYDRATE-FAR-{n}`) so upsert is
true upsert: insert if new, no-op if existing. The original Plan 1 spec
had assumed FA Role had no `External_ID__c` field, which was wrong for
this org.

### Plan 2 runner crashed on first failure

`runner_p2.py` raised `RuntimeError` on any single CSV's failure,
leaving subsequent CSVs un-loaded. The Plan 3 `runner_p3.py` replaces
this with a parallel-within-wave loader that fails-fast per CSV but
continues other CSVs in the same wave, plus checkpoint/resume. Plan 4
and Plan 5 build on `runner_p3.py`'s wave engine.

### Native FA External_ID__c synthesis

`HYDRATE-NFA-{n}` is *synthesized* by the native generator but the
`jdo-fw51xz` `FinancialAccount` only exposes `LegacyId__c` as an
external-id field. The runner upserts via `LegacyId__c` (carrying the
legacy FA Salesforce Id), and the synthesized External_ID__c column is
silently dropped at preflight. Wave G's `FinancialAccountParty.FinancialAccountId`
is resolved via a 3-hop chain documented in
[DATA_MODEL.md §FinancialAccountParty](DATA_MODEL.md#financialaccountparty-native).

## Cross-references

- [ARCHITECTURE.md §Wave dependencies](ARCHITECTURE.md#wave-dependencies)
- [DATA_MODEL.md](DATA_MODEL.md) — every object's idempotency field
- [HOW_TO.md §Reset](HOW_TO.md#scenario-3--reset-and-re-seed-deterministically)
- [Phase 1 spec §5](superpowers/specs/2026-05-19-customer-hydration-design.md)
- Source: [`customer_hydration/loader/reset.py`](../customer_hydration/loader/reset.py)
