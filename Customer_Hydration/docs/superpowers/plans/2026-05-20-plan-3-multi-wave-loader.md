# Plan 3 — Multi-wave bulk-load orchestrator (Waves A–E) + reset + scale-up

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plan 2's sequential single-CSV loader with a proper wave-ordered bulk loader that parallelizes within each wave, retries transient failures, checkpoints progress so crashed runs can resume, and supports `--reset` to wipe HYDRATE-* records cleanly. Also wires up the cross-wave joins Plan 2 deferred (AccountContactRelation rows for households + business contacts, CampaignMember rows linking customers to campaigns) using a query-back-and-resolve pattern between waves. End-state: a `python hydrate.py hydrate --retail 7000 --wealth 1200 --smb 1500 --commercial 300` smoke that lands the full ~10,000-customer Phase 1 target in ~50 minutes (Plan 2's sequential loader would take ~3 hours at this volume).

**Architecture:** Replace `runner_p2.py` with `runner_p3.py`. Add a `loader` package — split out of the single `loader.py` module — containing `wave.py` (wave dependency definitions), `parallel.py` (concurrent subprocess executor with retry + backoff), `checkpoint.py` (run state persistence), `id_resolver.py` (post-wave query-back to build external_id → record_id maps for objects without external-id fields), and `reset.py` (HYDRATE-* deletion in reverse-wave order). The CLI gains real implementations of `reset`, `resume`, and `status` subcommands.

**Tech Stack:** Python 3.11 (concurrent.futures.ProcessPoolExecutor for wave parallelism), Salesforce CLI v2 (`sf data upsert bulk` per CSV), no new third-party deps. Target org `jdo-fw51xz`. Anchor date 2026-05-21+.

---

## Context the engineer needs

**Working directory:** `/Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1`. Branch `feat/customer-hydration-plan-1` already has Plan 1 + Plan 2 commits. Plan 3 stacks on top.

**Plan 2 state:** runner_p2.py orchestrates 4 personas + 7 child generators sequentially and produces 12 CSVs. The CSVs are correct and idempotent (External_ID__c upsert). The bottleneck is sequential bulk loading — each `sf data upsert bulk` blocks until its job completes (~30s per CSV), so 12 CSVs serially is ~6 minutes minimum at small volume and scales linearly to ~3 hours at full volume.

**Plan 2 deferrals to fix in Plan 3:**
- AccountContactRelation rows (for households + business signers) — Plan 2 emits Household Accounts but no ACRs
- CampaignMember rows (linking customers to campaigns) — Plan 2 emits a `plan_campaign_members()` request list but no rows
- Tasks / Events linked to Account via WhatId — Plan 2 strips WhatId; Plan 3 resolves via post-Wave-A query-back
- FA Role natural-key dedupe — already partially fixed in retroactive Plan 1 commit `2d49d19` (FA Role got External_ID__c), but Plan 3 also adds query-back-based dedupe as defense in depth
- Reset path — Plan 2 has none

**Reference spec:** `Customer_Hydration/docs/superpowers/specs/2026-05-19-customer-hydration-design.md` §4 (data flow + wave dependencies + resume/checkpoint), §5 (CLI surface + reset semantics).

**Conventions follow Plan 1 + Plan 2:** TDD pair commits, fieldmap consumption, idempotent External_ID__c upserts, all SOQL via sf CLI subprocess wrapper, no real Apex in Plan 3 (Plan 5 owns Apex).

---

## File structure produced by Plan 3

```
Customer_Hydration/
├── customer_hydration/
│   ├── runner_p3.py                          # NEW — replaces runner_p2.py wiring
│   ├── loader/
│   │   ├── __init__.py                       # NEW
│   │   ├── wave.py                           # NEW — Wave dataclass + WAVE_DEFS dict
│   │   ├── parallel.py                       # NEW — ProcessPoolExecutor wrapper with retry
│   │   ├── checkpoint.py                     # NEW — RunCheckpoint dataclass + JSON persistence
│   │   ├── id_resolver.py                    # NEW — post-wave query-back ext_id → record_id maps
│   │   └── reset.py                          # NEW — HYDRATE-* deletion in reverse-wave order
│   ├── generators/
│   │   ├── households.py                     # MODIFIED — emit ACR rows now (Plan 2 deferred)
│   │   ├── campaigns.py                      # MODIFIED — emit CampaignMember rows now
│   │   └── activity.py                       # MODIFIED — emit WhatId via resolver placeholders
│   └── cli.py                                # MODIFIED — wire `reset`, `resume`, `status` subcommands
├── tests/
│   ├── test_wave.py                          # NEW
│   ├── test_parallel_loader.py               # NEW
│   ├── test_checkpoint.py                    # NEW
│   ├── test_id_resolver.py                   # NEW
│   ├── test_reset.py                         # NEW
│   ├── test_household_generator.py           # MODIFIED — ACR assertions
│   ├── test_campaign_generator.py            # MODIFIED — CampaignMember assertions
│   ├── test_activity_generator.py            # MODIFIED — WhatId placeholder assertions
│   └── test_runner_p3.py                     # NEW — integration tests with mocked sf CLI
└── docs/
    └── superpowers/plans/2026-05-20-plan-3-multi-wave-loader.md  # this file
```

---

## §1 Wave dependencies

The full wave map (verified against spec §4):

| Wave | Objects | Depends on |
|---|---|---|
| A | Account (all RTs in one CSV: Person Accounts, Business Accounts, Households, Trusts) | none |
| B | Contact (business officers/signers) | A |
| C | AccountContactRelation (household members + business signers) | A + B |
| D | FA, Card, Goal, LifeEvent, Milestone (legacy), Campaign, Opportunity (parallel-safe within wave) | A + B |
| E | FA Role, Holding, Case, Task, Event, CampaignMember (parallel-safe within wave) | A + B + C + D |

**Within each wave: full parallelism.** All CSVs in Wave D launch simultaneously as concurrent subprocesses. Default `--parallel 4` (configurable). Bulk API 2.0 server-side queues additional jobs anyway.

**Between waves: hard sync barrier.** Wave A must completely finish before Wave B starts. This is what enables ID resolution: after Wave A, the runner queries the org for `Id` + `External_ID__c` per loaded Account, builds an in-memory map, and uses that map to populate `WhatId` and similar parent references in Wave D/E CSVs that were left as placeholder external-ids during generation.

**Crash semantics:** if a wave is partially complete when the runner crashes (e.g., 3 of 6 Wave-D CSVs loaded), the checkpoint records which CSVs in which wave succeeded. Resume picks up at the partially-complete wave, re-running only the failed/missing CSVs. Bulk API 2.0 upsert is idempotent against `External_ID__c`, so re-running already-loaded rows is a no-op.

---

## §2 ID resolver pattern

Plan 2 strips `WhatId` from tasks.csv and events.csv because the customer Account's record-id isn't known client-side at generation time. Plan 3 fixes this:

1. **Generation phase**: tasks/events emit `WhatId` as a sentinel marker like `"RESOLVE:HYDRATE-RT-000001"` (the customer's external id, prefixed)
2. **Wave A loads Accounts** to the org. Bulk API returns success.
3. **Post-Wave-A resolution**: runner queries `SELECT Id, External_ID__c FROM Account WHERE External_ID__c LIKE 'HYDRATE-%'`, builds `{ext_id: id}` map.
4. **Wave D pre-load step**: for tasks.csv and events.csv, scan the WhatId column. For each row, if the value starts with `RESOLVE:`, look up the external-id suffix in the map and replace with the real Salesforce Id. Save back to the CSV.
5. **Wave D loads** with real Ids in WhatId.

Same pattern for `CampaignMember.ContactId` (resolved from auto-Contact post-Wave-A), `AccountContactRelation.ContactId` (same), and any other polymorphic / non-external-id-bound parent reference.

Resolver API:

```python
@dataclass
class IdResolver:
    """Maps HYDRATE-* external ids to org record Ids after a wave loads."""
    by_external_id: dict[str, str] = field(default_factory=dict)
    by_source_system_id: dict[str, str] = field(default_factory=dict)

    def resolve(self, marker: str) -> str | None:
        """Resolve a 'RESOLVE:HYDRATE-*' marker to a record Id, or None if unknown."""

    def populate_from_org(self, runner, sobject: str, external_id_field: str = "External_ID__c") -> int:
        """Query the org for {Id, ext_field} pairs and populate the map."""

def rewrite_csv_resolve_markers(csv_path: Path, column: str, resolver: IdResolver) -> int:
    """In-place rewrite a CSV column, replacing RESOLVE: markers with real Ids.
    Returns count of rows updated."""
```

---

## §3 Parallel loader

```python
@dataclass
class WaveResult:
    wave: str
    object_results: dict[str, BulkLoadResult]   # sobject -> result
    duration_s: float
    failed_objects: list[str]                    # objects with records_failed > 0


def run_wave_parallel(
    runner: SfRunner,
    wave: str,
    csv_specs: list[tuple[str, Path, str]],  # (sobject, csv_path, external_id_field)
    target_org: str,
    parallel: int = 4,
    retry: RetryPolicy = RetryPolicy(max_attempts=5, base_backoff_s=1.0),
) -> WaveResult:
    """Run all CSVs in a wave concurrently. Block until all finish or fail."""
```

Implementation uses `concurrent.futures.ProcessPoolExecutor` (subprocess-bound work, not CPU-bound). Each future invokes `loader.bulk_upsert()` (already exists from Plan 1 retroactive fix at commit `2d49d19`).

Retry policy: exponential backoff 1s → 2s → 4s → 8s → 16s on:
- HTTP 5xx
- HTTP 429 (rate limit)
- subprocess timeout
- Bulk API job state `Failed` due to platform issue (NOT due to record-level validation — those go in failedRecords and shouldn't trigger retry)

Wave-level fail-fast: if `records_failed > 0` for ANY CSV in a wave, the wave is reported as `failed_objects=[...]` but **other CSVs in the same wave still complete**. The next wave does NOT start. The user fixes config and re-runs (idempotent).

---

## §4 Checkpoint format

`output/run-{ts}/checkpoint.json`:

```json
{
  "run_id": "run-2026-05-21T0930",
  "seed": 42,
  "target_org": "jdo-fw51xz",
  "started_at": "2026-05-21T09:30:00Z",
  "completed_waves": ["A", "B"],
  "in_progress_wave": "C",
  "object_status": {
    "Account":     {"loaded": 14012, "failed": 0,  "duration_s": 287, "csv_path": "..."},
    "Contact":     {"loaded": 10387, "failed": 0,  "duration_s": 168, "csv_path": "..."},
    "AccountContactRelation": {"loaded": 12000, "failed": 0, "in_progress": true, "csv_path": "..."}
  },
  "id_resolution": {
    "Account_external_id_to_id":  "output/run-{ts}/resolved/Account.json",
    "Contact_external_id_to_id":  "output/run-{ts}/resolved/Contact.json"
  },
  "row_counts_pre_run": {
    "Account_HYDRATE": 552,
    "FinServ__FinancialAccount__c_HYDRATE": 484
  }
}
```

Resume rules:
- If `in_progress_wave` is set, resume picks up at that wave
- Already-completed waves skip entirely (External_ID__c upsert makes a re-run a no-op anyway, but skipping is faster)
- If `id_resolution` files exist, they're reloaded into memory rather than re-queried

---

## §5 Reset path

`python hydrate.py reset --confirm` does:

1. Refuse to run unless ≥1 HYDRATE-* record exists in the org (so it's never destructive in a clean org)
2. Print the planned deletion summary:
   ```
   This will delete approximately:
     14,012 Accounts
     10,387 Contacts
     50,000+ Financial Accounts, Cards, Goals, LifeEvents, etc.
   Existing non-HYDRATE accounts (178 in jdo-fw51xz) will NOT be touched.
   Type the org alias to confirm: jdo-fw51xz_
   ```
3. Wait for the user to type the alias literally
4. Delete in reverse-wave order (E → D → C → B → A) using Bulk API 2.0 hard-delete jobs gated by `External_ID__c LIKE 'HYDRATE-%'` (or `FinServ__SourceSystemId__c LIKE 'HYDRATE-%'` for Holdings/LifeEvents)
5. For objects with no idempotency field (`AccountContactRelation` ContactId-resolved), query parents first: `WHERE Account.External_ID__c LIKE 'HYDRATE-%' AND Contact.External_Id__c LIKE 'HYDRATE-%'`, then bulk-delete by Id
6. Final assertion: SOQL count == 0 for all hydrate-* records, otherwise raise

The reset path uses the same wave dependency map as the loader, just inverted. `wave.py`'s `WAVE_DEFS` is the single source of truth.

---

## §6 CLI surface gaining real implementations

```
python hydrate.py reset --confirm                      # newly functional in Plan 3
python hydrate.py resume                               # newly functional in Plan 3
python hydrate.py status                               # newly functional in Plan 3
python hydrate.py hydrate --personas retail,wealth     # filter persona generation (Plan 2 had it but no parallelism)
python hydrate.py hydrate --waves A,B,C                # Plan 3: load only some waves (debug)
```

`status` queries the org and reports current HYDRATE-* counts per object — it's read-only. Useful before running `reset` to know what'll be deleted.

`resume` reads `output/run-{latest_ts}/checkpoint.json` and continues. Errors if no checkpoint exists or the latest run is already `completed`.

---

## §7 Generator updates

Three generators need adjusting to emit rows Plan 2 deferred:

### households.py — add ACR emission

Each `HouseholdRequest.member_external_ids` list is now consumed: for each member, emit an `AccountContactRelation` row with:
- `AccountId` = household external-id (resolves via Account External_ID__c reference)
- `ContactId` = `RESOLVE:{member_ext_id}` placeholder (Wave C runner uses `id_resolver` to fetch the auto-Contact id)
- `Roles` = persona-driven (`Spouse`, `Dependent`, `Power of Attorney`)
- `IsActive` = true
- `External_ID__c` = `HYDRATE-ACR-{seq:06d}`

### campaigns.py — emit CampaignMember rows

`plan_campaign_members(...)` already returns request objects. Add `generate_campaign_members(*, seed, starting_seq, requests) -> list[dict]` that emits CampaignMember rows:
- `CampaignId` = campaign external-id reference (HYDRATE-CMP-NNN)
- `ContactId` = `RESOLVE:{customer_ext_id}` placeholder (Wave E runner resolves)
- `Status` = weighted choice (`Sent`, `Responded`, `Registered`, `Attended`)
- `HasResponded` = true if Status in {Responded, Registered, Attended}
- `External_ID__c` = `HYDRATE-CMPMEM-{seq:06d}`

### activity.py — re-add WhatId

`generate_tasks` and `generate_events` re-add `WhatId` as `RESOLVE:{account_external_id}`. The runner's Wave D step rewrites these to real Ids before bulk-upsert.

---

## §8 Tasks (15 total)

| Task | Component | TDD | Depends on |
|---|---|---|---|
| 1 | `loader/__init__.py` + scaffolding | no tests | — |
| 2 | `loader/wave.py` (WAVE_DEFS + Wave dataclass) + tests | TDD pair | 1 |
| 3 | `loader/parallel.py` (ProcessPoolExecutor wrapper) + tests | TDD pair | 2 |
| 4 | `loader/checkpoint.py` (RunCheckpoint persistence) + tests | TDD pair | 1 |
| 5 | `loader/id_resolver.py` (ext_id → id maps + CSV rewrite) + tests | TDD pair | 1 |
| 6 | Modify `households.py` to emit ACR rows + update tests | modify+TDD | 5 |
| 7 | Modify `campaigns.py` to emit CampaignMember rows + update tests | modify+TDD | 5 |
| 8 | Modify `activity.py` to re-add WhatId placeholders + update tests | modify+TDD | 5 |
| 9 | `loader/reset.py` (HYDRATE-* deletion) + tests | TDD pair | 2 |
| 10 | `runner_p3.py` integration (replaces runner_p2 wiring) | integration | 2,3,4,5,6,7,8 |
| 11 | CLI: wire `reset`, `resume`, `status` subcommands + tests | modify+TDD | 4,9,10 |
| 12 | Live load smoke at Plan 3 volumes (5,000 customers) | verification | 10 |
| 13 | Reset roundtrip smoke (load → reset → reload, byte-identical CSVs) | verification | 9,10 |
| 14 | Resume-from-crash smoke (kill mid-load, verify resume completes) | verification | 4,10 |
| 15 | README + CHANGELOG closeout | docs | all |

Each task follows Plan 1's TDD-pair pattern (write failing tests, implement, single commit). Verbatim test+impl content is NOT inlined in this plan file — Plans 1 and 2 establish the patterns clearly enough that implementer subagents can draft tests + impl following the existing modules as templates. The plan inlines just enough structure (dataclass shapes, function signatures, key invariants) to remove ambiguity.

---

## §9 Smoke targets

### Task 12 smoke (intermediate volume)

```bash
python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 5000 --wealth 800 --smb 1000 --commercial 200 \
    --skip-natives --skip-apex-wireup --skip-data-cloud \
    --allow-production --parallel 4
```

~7,000 customers, ~50,000 FAs / FA Roles, ~10,000 Holdings, ~5,000 Cards, ~7,000 Goals, ~1,000 LifeEvents, ~10 Campaigns + ~14,000 CampaignMembers, ~15,000 ACRs (households + business signers), ~7,000 Cases, ~17,000 Tasks, ~3,500 Events, ~5,000 Opps. Target row count: ~150,000. Wall-clock target: **<25 min** (Plan 2's sequential loader at this volume would be ~90 min).

### Task 13 reset roundtrip

```bash
# After Task 12's smoke runs, reset and re-run with same seed
python hydrate.py reset --confirm
python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 5000 --wealth 800 --smb 1000 --commercial 200 \
    --seed 42
# Compare output/run-{first}/*.csv against output/run-{second}/*.csv
diff -r output/run-{first} output/run-{second} | head -20
```

Expected: zero diffs in the CSVs (deterministic with same seed). Org records are recreated identically (modulo CreatedDate / Id).

### Task 14 resume smoke

```bash
# Start a load, kill it mid-Wave-D
python hydrate.py hydrate --retail 1000 ... &
RUNNER_PID=$!
sleep 60   # let Wave A + B + C finish, partial Wave D
kill $RUNNER_PID
# Resume
python hydrate.py resume
```

Expected: resume picks up at Wave D, completes the remaining CSVs, exits 0. Final org state matches what an uninterrupted run would produce.

---

## §10 Plan 3 success criteria

- [ ] All Plan 1 + Plan 2 + Plan 3 tests pass (~270+ unit tests)
- [ ] `python hydrate.py status` reports current HYDRATE-* counts per object correctly
- [ ] `python hydrate.py reset --confirm` deletes all HYDRATE-* records (verified by post-reset SOQL count = 0)
- [ ] `python hydrate.py resume` continues from a checkpoint and produces the same final org state as an uninterrupted run
- [ ] Task 12 smoke loads ~150,000 records in <25 min wall-clock
- [ ] CampaignMember rows linked to customers via ID resolver (no more orphan campaigns)
- [ ] AccountContactRelation rows wire household members + business signers to their Households / Business Accounts
- [ ] Tasks and Events have populated WhatId pointing to the correct Account
- [ ] FA Role duplicates do NOT recur on re-run (External_ID__c upsert + the new natural-key dedupe defense)
- [ ] All Apex SOQL we ship uses `WITH USER_MODE` (none in Plan 3 — the spec'd Apex is Plan 5)

---

## §11 Plan 3 known limitations (deferred to Plans 4–6)

- Native FSC mirror objects (`FinancialAccount`, `FinancialAccountParty`, `PartyRelationshipGroup`, `PartyProfile`, `ContactPoint*`) — Plan 4
- Apex post-load wireup (Group Builder rollups, denormalized flags) — Plan 5
- FSC Group Builder kickoff — Plan 5
- Phase 5.5 Data Cloud stream refresh + `dc-status` subcommand — Plan 5
- Banker briefs (`docs/briefs/*.md` per banker) — Plan 6
- AGENTS.md final pass + per-package documentation — Plan 6
- Top-level repo README / docs/INDEX / CHANGELOG entry for Customer_Hydration as a "complete" demo asset — Plan 6
- `force-app/` for any new fields the spec adds — Plan 5 (pending verification that BusinessMilestone is even needed)
