# Plan 4 — Native FSC lineage (Phase 3 + Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the legacy `FinServ__*` records into the **native FSC standard objects** (`FinancialAccount`, `FinancialAccountParty`, `FinancialGoal`, `BusinessMilestone`, `PartyRelationshipGroup`, `PartyProfile`, `ContactPointAddress`/`Email`/`Phone`) using the dual-lineage strategy from spec §3. The native records bridge to legacy via `LegacyId__c` on the native record, so any Data Cloud / Tableau Next / Agentforce solution that reads from the native model gets parity coverage. End-state: a `python hydrate.py hydrate ...` run with `--skip-natives` REMOVED produces both legacy AND native records, with the native records linked back to their legacy counterparts.

**Architecture:** Add a new `customer_hydration/native/` sub-package that mirrors the legacy generators. The native generators consume the SAME persona Bundles as legacy (no re-generation of demographic data) and produce native-shaped CSVs. Plan 3's runner_p3 gains a Phase 3 step (post-Wave-E query-back to resolve native parent Ids) and a Phase 4 step (load native CSVs in two sub-waves, F and G). The CLI's `--skip-natives` flag (which has been a no-op since Plan 1) becomes functional: when omitted, the native lineage runs; when present, it skips.

**Tech Stack:** No new third-party dependencies. Uses Plan 3's parallel loader + checkpoint + ID resolver. Target org `jdo-fw51xz` (verified during Plan 1 prelude that the native objects exist, except `FinServ__BusinessMilestone__c` legacy is NOT installed — only the native `BusinessMilestone` is, which simplifies the bridge).

---

## Context the engineer needs

**Working directory:** `/Users/jsifontes/Documents/Git/JDO/.worktrees/customer-hydration-plan-1`. Branch `feat/customer-hydration-plan-1`. Plan 3 is fully committed (waves, parallel loader, reset, ID resolver) before Plan 4 starts.

**Spec:** §3 dual-lineage strategy, §4 Phase 3 + Phase 4 wave dependencies (F, G).

**Key findings from Plan 1's prelude (verified directly in jdo-fw51xz):**

| Native object | Status | External-Id field | Notes |
|---|---|---|---|
| `FinancialAccount` | installed | `LegacyId__c` (already exists) | bridge to legacy `FinServ__FinancialAccount__c.Id` |
| `FinancialAccountParty` | installed | NONE | Plan 4 uses Phase-3 query-back to resolve `FinancialAccountId` + `AccountId` from external-id maps |
| `FinancialGoal` (native) | installed | `External_ID__c` exists, plus `LegacyId__c` | use `LegacyId__c` for the bridge |
| `BusinessMilestone` (native) | installed | `External_ID__c` + `OriginalLegacyGoalId__c` | the second field name is misleading but is the legacy-bridge field per the org's existing data model |
| `PartyRelationshipGroup` | installed | NONE | use AccountId external-id for bridge |
| `PartyProfile` | installed | NONE | use AccountId / ContactId external-id for bridge |
| `ContactPointAddress` / `Email` / `Phone` | installed | NONE | use ParentId / RelatedRecordId via Phase 3 resolution |
| `FinancialAccountTransaction` | installed | NONE | **Plan 4 SKIPS this object — owned by Phase 2 Data Cloud spec per §3** |

**Legacy `FinServ__BusinessMilestone__c` is NOT installed** in jdo-fw51xz (verified). So Plan 4's milestone work is **native-only** — no dual emission for milestones. Plan 5's `force-app/` no longer needs to ship the legacy `External_ID__c` field for that object.

---

## §1 Lineage map summary

For each concept, what gets emitted:

| Concept | Legacy (Plan 3) | Native (Plan 4) | Bridge |
|---|---|---|---|
| Financial account | `FinServ__FinancialAccount__c` | `FinancialAccount` | `LegacyId__c` on native = legacy record's Id (resolved Phase 3) |
| Account-party linkage | `FinServ__FinancialAccountRole__c` | `FinancialAccountParty` | natural key (FA + Account/Contact + Role); no field bridge |
| Goal | `FinServ__FinancialGoal__c` | `FinancialGoal` | `LegacyId__c` on native |
| Business milestone | (legacy not installed — skip) | `BusinessMilestone` | `OriginalLegacyGoalId__c` left null — no legacy counterpart |
| Household / group | Account RT=Household + ACR | `PartyRelationshipGroup` + `PartyProfile` | shared AccountId |
| Person profile | Account (Person) | `PartyProfile` | shared AccountId |
| Contact points | Account/Contact direct fields | `ContactPointAddress` + `Email` + `Phone` | parent-id via Phase 3 resolution |
| Holdings | `FinServ__FinancialHolding__c` | (no native equivalent — skip) | n/a |
| Cards | `FinServ__Card__c` | (no native equivalent — skip) | n/a |
| Life events | `FinServ__LifeEvent__c` | (no native equivalent — skip) | n/a |
| **Transactions** | n/a | (Phase 2 Data Cloud — skip Plan 4) | n/a |

So Plan 4 emits 9 new sObject types: FinancialAccount, FinancialAccountParty, FinancialGoal, BusinessMilestone, PartyRelationshipGroup, PartyProfile, ContactPointAddress, ContactPointEmail, ContactPointPhone.

---

## §2 New waves (added to Plan 3's wave map)

| Wave | Objects | Depends on |
|---|---|---|
| F | `FinancialAccount` (native, bridged via `LegacyId__c`), `FinancialGoal` (native, bridged), `BusinessMilestone` (native, no bridge), `PartyRelationshipGroup`, `ContactPointAddress` / `Email` / `Phone` | A + B + D + Phase-3 resolved Ids |
| G | `FinancialAccountParty`, `PartyProfile` (RelatedPartyProfileId resolved post-F) | F |

Phase 3 sits between Wave E and Wave F:

```
Wave E completes
  → Phase 3: query-back for native parent ids
       SELECT Id, External_ID__c FROM FinServ__FinancialAccount__c WHERE External_ID__c LIKE 'HYDRATE-FA-%'
       SELECT Id, External_ID__c FROM FinServ__FinancialGoal__c   WHERE External_ID__c LIKE 'HYDRATE-GOAL-%'
       SELECT Id, External_ID__c FROM Account                     WHERE External_ID__c LIKE 'HYDRATE-%'
       SELECT Id, External_Id__c FROM Contact                     WHERE External_Id__c LIKE 'HYDRATE-CT-%'
  → builds maps: legacy_fa_external_id → legacy_fa_id, etc.
Wave F starts
```

Wave F's CSVs use external-id-bound headers where bridge fields exist (`LegacyId__c` for FA + Goal, `External_ID__c` for native BusinessMilestone) and the resolved Ids directly (no external-id reference syntax) for `AccountId` / `ContactId` / `HouseholdAccountId` on `PartyRelationshipGroup` / `ContactPoint*` / `PartyProfile`.

Wave G's two CSVs (`FinancialAccountParty`, `PartyProfile`) load with:
- All parent references resolved to real Salesforce Ids via Phase 3
- No External-Id field on either object — Plan 3's natural-key dedupe pattern applies (query existing rows by `(FinancialAccountId, AccountId, Role)` before insert)

---

## §3 New generators

```
customer_hydration/native/
├── __init__.py
├── financial_account.py        # FinancialAccount mirror
├── financial_account_party.py  # FinancialAccountParty mirror
├── financial_goal.py           # FinancialGoal mirror
├── business_milestone.py       # BusinessMilestone (native-only, no legacy bridge)
├── party_relationship_group.py
├── party_profile.py
└── contact_points.py           # all 3 ContactPoint* in one module
```

Each native generator takes a Plan 3 Bundle (e.g., `LegacyFinancialAccountBundle`) plus the Phase-3 ID resolver, and emits native rows. Generators are thin — no new Faker draws, no new randomization. Just shape transformation + bridge population.

Example signature (financial_account.py):

```python
def generate_native_financial_accounts(
    *,
    legacy_fa_rows: list[dict],
    legacy_id_resolver: IdResolver,  # ext_id → legacy SF Id (post-Wave-E)
    starting_seq: int,
) -> list[dict]:
    """Mirror each legacy FA row into a FinancialAccount native row.
    Sets LegacyId__c to the legacy record's Salesforce Id."""
```

---

## §4 Tasks (12 total)

| Task | Component |
|---|---|
| 1 | `customer_hydration/native/__init__.py` + scaffolding |
| 2 | `native/financial_account.py` + tests (TDD pair) |
| 3 | `native/financial_goal.py` + tests (TDD pair) |
| 4 | `native/business_milestone.py` + tests (TDD pair) |
| 5 | `native/party_relationship_group.py` + tests (TDD pair) |
| 6 | `native/party_profile.py` + tests (TDD pair) |
| 7 | `native/contact_points.py` + tests (TDD pair) |
| 8 | `native/financial_account_party.py` + tests (TDD pair, with natural-key dedupe) |
| 9 | Modify `loader/wave.py` to add Wave F + Wave G definitions; update `loader/checkpoint.py` schema |
| 10 | Modify `runner_p3.py` to call native generators after Phase 3, run Wave F + Wave G; rename to `runner_p4.py` |
| 11 | Modify `cli.py`: make `--skip-natives` actually skip Wave F + G (currently a no-op since Plan 1) |
| 12 | Live load smoke (verify both legacy + native records in jdo-fw51xz with `LegacyId__c` populated correctly) + README/CHANGELOG closeout |

Each TDD task follows the Plan 1 / Plan 2 pattern: write failing tests, implement, single commit.

---

## §5 Smoke target (Task 12)

```bash
python hydrate.py reset --confirm
python hydrate.py hydrate --target-org jdo-fw51xz \
    --retail 1000 --wealth 200 --smb 200 --commercial 50 \
    --skip-apex-wireup --skip-data-cloud \
    --allow-production --parallel 4
```

**No `--skip-natives` flag.** Both lineages emit. Volume is moderate (~1,500 customers) — the goal is to verify the native bridge, not stress test (Plan 5+ does that).

Expected counts in jdo-fw51xz post-load:

| Object | Approx rows |
|---|---:|
| Account (legacy + native — same object) | ~1,800 |
| `FinServ__FinancialAccount__c` | ~3,500 |
| `FinancialAccount` (native, mirror) | ~3,500 |
| `FinServ__FinancialGoal__c` | ~1,500 |
| `FinancialGoal` (native, mirror) | ~1,500 |
| `BusinessMilestone` (native, no legacy) | ~600 |
| `FinancialAccountParty` (native) | ~3,500 |
| `PartyRelationshipGroup` | ~500 |
| `PartyProfile` | ~2,000 |
| `ContactPointAddress` / `Email` / `Phone` | ~3 × ~1,800 = ~5,400 |

Verification SOQL:

```sql
SELECT COUNT() FROM FinancialAccount
  WHERE LegacyId__c IN (SELECT Id FROM FinServ__FinancialAccount__c WHERE External_ID__c LIKE 'HYDRATE-%')
```

This count should equal the count of HYDRATE-* legacy FAs — proves the bridge is wired.

---

## §6 Plan 4 success criteria

- [ ] All Plan 1 + 2 + 3 + 4 tests pass (~330+ unit tests)
- [ ] `python hydrate.py hydrate ...` (without `--skip-natives`) loads both legacy AND native records
- [ ] Every native `FinancialAccount` has `LegacyId__c` pointing to a real `FinServ__FinancialAccount__c.Id`
- [ ] Every native `FinancialGoal` has `LegacyId__c` pointing to a real legacy goal
- [ ] `FinancialAccountParty` rows correctly link a legacy FA + Account/Contact + Role
- [ ] Native `PartyRelationshipGroup` mirrors household Accounts
- [ ] `ContactPoint*` rows mirror Person Account / Contact email + phone + address fields
- [ ] `--skip-natives` skips Wave F + Wave G entirely (verified by manifest absence of those waves)
- [ ] Reset path also deletes native records (Plan 3's reverse-wave reset extends to F + G)
- [ ] Phase 3 query-back successfully resolves all parent Ids before Wave F starts (verified in checkpoint.json)

---

## §7 Plan 4 known limitations (deferred to Plans 5–6)

- Apex post-load wireup + FSC Group Builder rollups — Plan 5
- Phase 5.5 Data Cloud stream refresh + `dc-status` subcommand — Plan 5
- Banker briefs — Plan 6
- AGENTS.md final pass + Customer_Hydration as a "complete" demo asset entry in top-level repo docs — Plan 6
- Native `FinancialAccountTransaction` — explicitly out of scope (Phase 2 Data Cloud spec)
