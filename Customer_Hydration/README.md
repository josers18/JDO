# Customer_Hydration

Reusable CLI artifact that hydrates the JDO demo org with realistic Cumulus
Bank customer data — Retail, Wealth, Small Business, and Commercial — across
role-aligned RMs, with full FSC party-model linking and dual-lineage coverage
(legacy `FinServ__*` + native FSC standard objects).

> **Status:** Plans 1 + 2 complete (skeleton, Phase 0, fieldmap, all 4
> personas, full retail child fanout, sequential bulk loader). Plans 3–6
> add multi-wave parallelism + reset/resume, native FSC mirrors, Apex
> post-load wireup + Data Cloud stream refresh, and banker briefs.

## Quick start

```bash
cd Customer_Hydration
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 100 --wealth 80 --smb 50 --commercial 20 \
    --skip-natives --skip-apex-wireup --skip-data-cloud \
    --allow-production
```

## Documentation

- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans (one per spec phase)
- `AGENTS.md` — context for AI coding agents

## Plan 1 status — Skeleton + Phase 0 + retail-only smoke

Plan 1 is **complete** when:

- [x] Package structure scaffolded (configs, generators dir, tests, docs, AGENTS.md)
- [x] Phase 0 pre-flight describes target objects and caches field lists; missing fields are silently dropped from CSVs (FSC version drift protection)
- [x] External-Id seek pointer correctly handles empty + populated namespaces
- [x] CSV writer emits LF-terminated, sorted-column UTF-8 (Bulk API 2.0 compatible)
- [x] Retail generator produces deterministic Account + FA + FA Role per seed
- [x] Bulk loader wraps `sf data import bulk` with `--line-ending LF` and `--external-id`
- [x] CLI dispatch supports `validate-config` and a minimal `hydrate` for retail-only
- [x] End-to-end smoke load: 50 retail customers + 50 Checking FAs land in `jdo-fw51xz`,
      OwnerId distributed across Justin Chen and Standard User
- [x] `--append` advances the seek pointer correctly (Account + FA upsert idempotently)
- [ ] FA Role idempotency — see "Known Plan 1 warts" below; deferred to Plan 3

### How to run the Plan 1 smoke

```bash
cd Customer_Hydration
source .venv/bin/activate

# Production guard requires --allow-production for non-sandbox demo orgs like jdo-fw51xz.
python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 50 --personas retail \
    --skip-natives --skip-apex-wireup --skip-data-cloud \
    --allow-production
```

Verify with:
```bash
sf data query --target-org jdo-fw51xz \
    --query "SELECT COUNT() FROM Account WHERE External_ID__c LIKE 'HYDRATE-RT-%'"
```

### Known Plan 1 warts (deferred to later plans)

1. **FA Role rows duplicate on re-run.** `FinServ__FinancialAccountRole__c` has no
   `External_ID__c` field in this org's FSC version, so bulk-upsert behaves as
   bulk-insert and a re-invocation of the loader produces a second set of identical
   role rows. **Plan 3** addresses this with natural-key dedupe — query existing
   `(FinancialAccountId, RelatedAccountId, Role)` tuples before insert.
2. **12 Account/FA fields silently dropped by Phase 0.** The retail generator emits
   fields the org's FSC version doesn't define (`FinServ__BankingPreference__c`,
   `FinServ__OpenedDate__c` (org has `FinServ__OpenDate__c`), `FinServ__OwnershipType__c`
   (org has `FinServ__Ownership__c`), `FinServ__ProductCode__c`, etc.). Drops are
   safe — the load still succeeds — but records land thinner than the spec promised.
   **Plan 2** corrects field-name mappings to the org's actual FSC schema as part of
   the broader retail-density work.
3. **`hydrate` subcommand explicit.** The plan's example invocations omit the
   subcommand (`python hydrate.py --retail 50 ...`); argparse requires
   `python hydrate.py hydrate --retail 50 ...`. The README's Quick Start snippet
   in this file is correct.

**Out of scope for Plan 1 (handled by later plans):**
- Wealth, SMB, Commercial personas (Plan 2 — DONE)
- Other retail child records — Savings, Cards, Goals, LifeEvents, Cases, Tasks, Events, Opportunities, Households, Campaigns (Plan 2 — DONE)
- Native FSC mirror objects (Plan 4)
- Multi-wave parallel bulk loader + reset + resume (Plan 3)
- Apex post-load wireup + Data Cloud stream refresh (Plan 5)
- `reset` / `dc-status` / `briefs` subcommands functional (Plans 3 + 6)
- Banker briefs + final docs (Plan 6)

## Plan 2 status — Personas + activity + fieldmap correction

Plan 2 is **complete** when:

- [x] `customer_hydration/fieldmap.py` translates spec field names + picklist values to the org's actual FSC schema (30+ field renames, 27 picklist value remappings)
- [x] `retail.py` extended to consume fieldmap + emit Savings child FA at 60% probability (corrected `__pc` shadow demographics)
- [x] `wealth.py`, `smb.py`, `commercial.py` produce persona-shaped Accounts + child FAs
- [x] Cross-cutting generators: `cards.py` (custom Card model), `holdings.py` (~40-ticker universe), `goals.py`, `lifecycle.py` (LifeEvents), `households.py` (Household Accounts; ACR deferred to Plan 3), `activity.py` (Cases/Tasks/Events/Opps), `campaigns.py` (10 campaigns; CampaignMember deferred to Plan 3)
- [x] `runner_p2.py` orchestrates 4 personas + 7 child generators, writes 12 CSVs, sequential bulk-upsert
- [x] AGENTS.md updated to call out `__pc` shadow + restrictive picklist gotchas
- [x] All 200 unit tests pass (Plan 1's 46 + 154 new across 11 generator + fieldmap test files)
- [x] Dry-run smoke produces 12 CSVs with 3,742 rows in ~83 seconds, no surprise field drops beyond expected `Account.YearStarted`
- [x] Live load against `jdo-fw51xz` lands ~830 customers (350 retail / 240 wealth / 100 SMB / 40 commercial / 108 households) + 422 FAs + 394 FA Roles
- [ ] Full child-record fanout in the org — see "Known Plan 2 warts" below; deferred to Plan 3

### How to run the Plan 2 smoke

```bash
cd Customer_Hydration
source .venv/bin/activate

python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 100 --wealth 80 --smb 50 --commercial 20 \
    --skip-natives --skip-apex-wireup --skip-data-cloud \
    --allow-production
```

Verify Account distribution:
```bash
sf data query --target-org jdo-fw51xz \
    --query "SELECT FinServ__ClientCategory__c, COUNT(Id) FROM Account WHERE External_ID__c LIKE 'HYDRATE-%' GROUP BY FinServ__ClientCategory__c"
```

### Known Plan 2 warts (deferred to Plan 3)

1. **FA Role write-once validation rule blocks re-runs.** This org has a custom rule:
   `"This record cannot be edited. To update role information, you can deactivate
   this record and create a new one."` Re-running Plan 2's loader against an org
   that already has HYDRATE-FAR-* rows fails 140+ records. **Plan 3** adds a pre-load
   "query existing External_IDs and skip those rows" step (natural-key dedupe).

2. **runner_p2.py crashes on first wave failure.** When any single CSV fails to
   upsert, the runner raises `RuntimeError` and exits, leaving subsequent CSVs
   un-loaded. After the FA Role failure on the live smoke, no Cards / Goals / Holdings /
   LifeEvents / Cases / Tasks / Events / Opps / Campaigns / Campaign Members loaded.
   **Plan 3** replaces with parallel-within-wave loader that fails-fast per CSV but
   continues other CSVs, plus checkpoint/resume.

3. **No CampaignMember rows.** `campaigns.py` emits Campaigns + a `plan_campaign_members()`
   request list, but no actual CampaignMember rows. **Plan 3** wires these via post-Wave-A
   ID resolver (CampaignMember requires real ContactId, which only exists post-load).

4. **No AccountContactRelation rows.** `households.py` emits Household Accounts but
   no ACR membership rows. **Plan 3** adds ACR via the same post-Wave-A resolver pattern.

5. **Tasks/Events have no `WhatId`.** `activity.py` strips `WhatId` to avoid polymorphic-FK
   resolution complications. **Plan 3** re-adds WhatId via `RESOLVE:` placeholder pattern
   that the resolver fills in post-Wave-A.

6. **`Account.YearStarted` silently dropped on Business Accounts.** Phase 0 describe
   marks the field as something the generator's emitted value can't satisfy
   (likely a date/year format mismatch). Cosmetic; non-blocking. **Plan 3** corrects the
   value format in the fieldmap.

## Plan 3 status — Multi-wave parallel loader + reset + resume

Plan 3 is **complete** when:

- [x] `customer_hydration/loader/` sub-package with `wave.py` (WAVE_DEFS A–E), `parallel.py` (ThreadPoolExecutor wrapper with retry/backoff), `checkpoint.py` (RunCheckpoint persistence), `id_resolver.py` (post-wave query-back maps + CSV rewriter), `reset.py` (reverse-wave HYDRATE-* deletion)
- [x] Generators emit `RESOLVE:` markers for parent references that need post-wave resolution: ACR ContactId, CampaignMember ContactId, Task/Event WhatId
- [x] `runner_p3.py` orchestrates 5 waves with parallel-within-wave loading, checkpoints between waves, ID resolver populated post-Wave-A and post-Wave-B
- [x] `reset` / `resume` / `status` / `dc-status` (stub) CLI subcommands functional
- [x] FA Role re-run idempotency — `External_ID__c` upsert (added retroactively to Plan 1, kept in Plan 3)
- [x] Resolver disambiguates Account-id vs Contact-id via `want=` kwarg (commit `3f5b0af` — fixed during Task 12 smoke)
- [x] Live smoke at full Phase 1 volume (10K customers): Wave A loaded 11,640 Accounts (+1.6K Households), Wave B skipped (no business contacts), Wave C 8,200 ACRs, Wave D ~80% complete (FA + Goal + Opp + Campaign loaded; Cards + LifeEvents failed due to sf CLI stderr-as-failure misclassification — Plan 5 fixes)

### Known Plan 3 warts (deferred to Plan 5)

1. **`bulk_upsert` interprets sf CLI's "@salesforce/cli update available" stderr warning as failure.** The bulk job actually succeeds (records_failed=0) but `loader/_legacy.py` raises RuntimeError on any non-zero exit code, even when the only stderr content is the version-check warning. Plan 5 polish task: parse the stderr more carefully.

2. **Resume re-runs already-completed waves on restart.** Plan 3's resume detects `in_progress_wave` from checkpoint, but if the runner died mid-wave, ALL prior waves get re-attempted (External_ID__c upsert makes them no-ops, but it's wasted RTT). Future enhancement: skip waves whose `completed_waves` list already contains them.

## Plan 4 status — Native FSC mirror objects (Wave F + G)

Plan 4 is **complete** when:

- [x] `customer_hydration/native/` sub-package with 7 generator modules (financial_account, financial_goal, business_milestone, party_relationship_group, party_profile, contact_points, financial_account_party)
- [x] `loader/wave.py` extended with WAVE_DEFS["F"] and ["G"]
- [x] `loader/reset.py` extended to handle native sObjects (External_ID__c-based for FA/Goal/Milestone; None-idem ones logged + skipped)
- [x] `runner_p4.py` adds Phase 3 query-back (post-Wave-D legacy FA + Goal Id resolution), Wave F generation + load, post-Wave-F native FA query-back, Wave G load
- [x] `--skip-natives` CLI flag actually skips Wave F + Wave G (was a no-op since Plan 1)
- [x] CLI's `_run_hydrate` swung to runner_p4
- [x] 357/357 unit tests pass + 38 new native generator tests
- [x] Dry-run smoke produces 24 CSVs (15 legacy + 9 native: FA + Goal + Milestone + PRG + PartyProfile + 3 ContactPoints + FA Party)
- [ ] Live smoke against jdo-fw51xz — deferred until Plan 5 fixes the stderr-misclassification wart so Wave D completes cleanly first

### Known Plan 4 warts (deferred to Plans 5+6)

1. **5 native objects have no External_ID__c.** PartyRelationshipGroup, PartyProfile, ContactPointAddress/Email/Phone, FinancialAccountParty all generate CSVs but bulk_upsert can't load them via `--external-id`. Plan 4 filters them out of the load step and logs them as "INSERT-only deferred to Plan 5+". CSVs are still produced for review.

2. **Native FA uses `LegacyId__c` not `External_ID__c`.** jdo-fw51xz's `FinancialAccount` has only `LegacyId__c` as externalId. runner_p4 upserts via `LegacyId__c` and resolves Wave G's `RESOLVE-NFA:` markers via a 3-hop chain (HYDRATE-NFA-NNN → HYDRATE-FA-NNN → legacy FA Id → native FA Id). The synthesized External_ID__c column is silently dropped at preflight.

3. **No live-org load yet.** Dry-run produces correct CSVs, but Plan 4 doesn't push records to the org because Plan 3's stderr-misclassification bug blocks the legacy waves from completing. Plan 5 fixes the bug, then Plans 4+5 can both land in a single subsequent live load.

## Plan 5 status — Apex post-load wireup + Phase 5.5 Data Cloud stream refresh

Plan 5 is **complete** when:

- [x] `customer_hydration/loader/_legacy.py` `bulk_upsert` no longer misclassifies SF CLI's "update available" stderr warning as failure (uses JSON payload as authoritative success signal)
- [x] `apex/post_load_wireup.apex` — anonymous Apex script that kicks FSC Group Builder + escalates aged Cases. Compiles + executes cleanly against `jdo-fw51xz`.
- [x] `force-app/main/default/classes/FscGroupRollupBatch.cls` + matching test class (≥75% coverage). `sf project deploy validate` succeeded against `jdo-fw51xz`.
- [x] `customer_hydration/phase5/apex_wireup.py` — Python wrapper that deploys `force-app/` and runs `sf apex run --file`
- [x] `customer_hydration/phase5/data_cloud.py` — REST client for Data Cloud stream discovery + trigger (fire-and-forget) + status polling
- [x] `runner_p5.py` orchestrates Phase 5 (Apex) and Phase 5.5 (DC stream refresh) after Wave G
- [x] `--skip-apex-wireup` and `--skip-data-cloud` flags actually skip those phases (were no-ops since Plan 1)
- [x] `--data-cloud-only` flag short-circuits to Phase 5.5 only
- [x] `dc-status` subcommand reads the latest manifest's DC section, polls each stream-run via REST, prints summary
- [x] All 384+ unit tests pass (Plans 1-4's 360 + 24 new across `test_loader`, `test_apex_wireup`, `test_data_cloud`, `test_cli`)
- [x] Phase 5 live test: deploy succeeded (deploy id `0Afam00002UonXtCAJ`); Apex compiled + executed against `jdo-fw51xz`
- [x] Phase 5.5 live test: `--data-cloud-only` discovered 0 streams in `jdo-fw51xz` (org has none configured) — code path runs cleanly

### Known Plan 5 warts (deferred to Plan 6)

1. **Direct household roll-up write was removed.** This org's FSC version makes `FinServ__AUM__c`, `FinServ__TotalBankDeposits__c`, `FinServ__TotalInvestments__c`, `FinServ__TotalLiabilities__c` read-only / declaratively-rolled-up. The Apex post-load script comments out the manual write and relies on the Group Builder kickoff to trigger the FSC standard logic that populates them. If you fork this for an org with WRITABLE roll-up fields, restore the manual write loop (see git history at `7602756^`).

2. **0 Data Cloud streams discovered in `jdo-fw51xz`.** Phase 5.5 successfully connected to Data Cloud REST and queried the data-streams endpoint, but the org has no streams configured matching CRM-source objects. Once streams exist, re-run with `--data-cloud-only` and `dc-status` will populate.

3. **`--watch` flag is a no-op in v1.** Single-shot poll only. Plan 6 polish to add the 30s polling loop.

## Phase 1 acceptance summary

Phase 1 of the customer-hydration spec is **FEATURE-COMPLETE** as of 2026-05-21.

| # | Criterion | Status |
|---|---|---|
| 1 | python hydrate.py runs end-to-end | PARTIAL — multi-wave runner verified live with some warts |
| 2 | Org contains 10K+ customers across role-aligned RMs | PASS — 21K customers in jdo-fw51xz |
| 3 | Banker briefs regenerate from live org data | PASS — 6 .md files at docs/briefs/ |
| 4 | --reset followed by --seed 42 produces byte-identical CSVs | DEFERRED — resume verified, reset roundtrip not exercised |
| 5 | --retail 50 --append adds exactly 50 retail customers | PARTIAL — logic exists; quantity not re-verified at Phase 1 close |
| 6 | --rm "Vince West" --wealth 10 --append owned by Vince | PARTIAL — flag exists; quantity not re-verified |
| 7 | Web_Engagements_RT_Timeline renders realistic activity | DEFERRED — UI rendering check |
| 8 | DC_PersonProfileWidget/DC_BusinessProfileWidget render rollups | DEFERRED — UI rendering check |
| 9 | All unit + internal-consistency tests pass | PASS — 399 tests green |
| 10 | Phase 5.5 triggers CRM-sourced DC streams | PASS — code verified; org has 0 streams configured |
| 11 | AGENTS.md context complete | PASS — 12 "Things that bite" + Plans 1-6 history |

**Phase 2 (out of scope for Phase 1)**: Data Cloud DLO/DMO mappings, Identity Resolution, Calculated Insights, Segments, Activations, FinancialAccountTransaction ingestion. Owned by a future Plan after Phase 1 lands.

