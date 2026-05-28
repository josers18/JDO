# Phase 5 — Account DMO Backfill Implementation Plan (v2.0)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.
> **Replaces v1.0:** v1.0 covered 17 fields; the comprehensive audit revealed ~50. v2.0 reorders sub-phases and adds 5b "Universal field backfill" + 5c "Phase 4 regression fix".

**Goal:** Close the gaps identified in `output/account-dmo-audit-2026-05-27/REPORT.md` via 6 sub-phases.

**Spec:** `docs/superpowers/specs/2026-05-27-phase-5-dmo-backfill-design.md`

**Tech stack:** Python 3.11, simple_salesforce + sf CLI, Bulk API 2.0 upsert, DC Connect API, pytest. Reuses Phase 4 v1.1 backfill infrastructure (`customer_hydration/backfill/*`).

---

## File structure

**New files (~25):**
- `customer_hydration/backfill/derivers/branch_assignment.py` (5a)
- `customer_hydration/backfill/derivers/multipicklist_segments.py` (5b — InvestmentObjectives, PersonalInterests, CustomerSegment, MarketingSegment, FinancialInterests)
- `customer_hydration/backfill/derivers/fsc_pc_shadows.py` (5b — FinServ_Category__pc, FinServ_Contact_Status__pc, FinServ__IndividualType__pc)
- `customer_hydration/backfill/derivers/biz_parity.py` (5b — CountryOfBirth, CountryOfResidence, InvestmentExperience, RiskTolerance, ServiceModel, BorrowingHistory, TimeHorizon, NetWorth, CreditRating, Tier, ContactPreference for biz cohort)
- `customer_hydration/backfill/derivers/person_parity.py` (5b — Rating, Type, BillingAddress mirror, ShippingAddress mirror for person cohort)
- `customer_hydration/backfill/derivers/account_source_phone_website.py` (5b — AccountSource, Phone, Website both cohorts)
- `customer_hydration/backfill/derivers/individual_type_full.py` (5b — fill IndividualType__c on the 5,610 missing biz rows)
- `customer_hydration/backfill/derivers/primary_contact.py` (5b)
- `customer_hydration/backfill/derivers/regression_replay.py` (5c — re-runs 6 Phase 4 derivers on the 50 missing person rows)
- `customer_hydration/backfill/derivers/pa_address_mirror.py` (5d)
- `customer_hydration/backfill/dmo_mapping_verify.py` (5e — verifies the 2 no-op mappings now produce values; offers drop for 1)
- `customer_hydration/backfill/audit_runner.py` (Task 0 — comprehensive audit CLI)
- `customer_hydration/generators/branch.py`, `customer_hydration/generators/multipicklist_segments.py` — forward-run generator integration
- `config/multipicklist_templates.yaml` — persona × risk × experience templates for 5 multipicklists
- `config/branches_snapshot.json` — fetched once from `BranchUnit`
- `config/branch_state_weights.yaml`
- `tests/test_phase5_branch_assignment.py` (11 tests)
- `tests/test_phase5_multipicklist_segments.py` (8 tests)
- `tests/test_phase5_fsc_pc_shadows.py` (6 tests)
- `tests/test_phase5_biz_parity.py` (12 tests)
- `tests/test_phase5_person_parity.py` (6 tests)
- `tests/test_phase5_account_source_phone_website.py` (4 tests)
- `tests/test_phase5_primary_contact.py` (5 tests)
- `tests/test_phase5_regression_replay.py` (4 tests)
- `tests/test_phase5_pa_address_mirror.py` (5 tests)
- `tests/test_phase5_audit_runner.py` (3 tests)
- `tests/test_phase5_runner_integration.py` (4 tests)
- `tests/test_phase5_e2e_live.py` (4 SKIPPED unless RUN_LIVE_TESTS=1)

**Modified files:**
- `customer_hydration/backfill/backfill_accounts.py` — register new derivers; new coverage rules
- `customer_hydration/backfill/coverage_rules.py` — `multipicklists_populated`, `pc_shadows_populated`, `biz_parity_populated`, `person_parity_populated`, `account_source_assigned`, `phone_assigned`, `regression_replay_complete`, `branch_assigned`, `primary_contact_assigned`, `pa_addr_mirrored`, `individual_type_complete`
- `customer_hydration/backfill/preflight.py` — add `BranchUnit` describe; check writability of all new fields
- `customer_hydration/cli.py` — add `--phase 5a/5b/5c/5d/5e/5f` flags; add `account-dmo-audit` subcommand; add `dc-mapping verify` subcommand
- `customer_hydration/generators/person_accounts.py` — write multipicklists, FSC `__pc` shadows, Billing/Shipping mirror in forward runs
- `customer_hydration/generators/business_accounts.py` — write biz parity fields
- `customer_hydration/augment_phase3.py` — pick up new generator outputs
- `AGENTS.md` — Phase 5 entry under Plans history

---

## Pre-task setup

- [ ] **Pre-Step 1:** Confirm baseline test suite green (`pytest tests/ -q | tail -5` → 787 PASS + 5 SKIPPED).
- [ ] **Pre-Step 2:** Branch out: `git checkout -b feat/customer-hydration-phase-5`.
- [ ] **Pre-Step 3:** Confirm comprehensive audit artifact exists at `output/account-dmo-audit-2026-05-27/comprehensive_audit.json` and `REPORT.md`. These are the baseline for Phase 5f verification.

---

## Task 0 — Audit runner CLI (enables idempotent re-audit)

- [ ] **0.1:** Failing test: given mock DC + CRM clients, runner emits `comprehensive_audit.json` with the same shape as today's hand-built file.
- [ ] **0.2:** Implement `customer_hydration/backfill/audit_runner.py` with `run_comprehensive_audit(org, output_dir)`. Persists `dmo_mapping_digest.json`, `audit_field_inventory.json`, `comprehensive_audit.json`, `REPORT.md` from a Jinja template.
- [ ] **0.3:** Add `account-dmo-audit` subcommand to `cli.py`.
- [ ] **0.4:** Run baseline: `python hydrate.py account-dmo-audit --target-org jdo-uqj0jr --output output/account-dmo-audit-2026-05-27-pre/`. Confirm parity with hand-built audit.
- [ ] **0.5:** Commit: `feat(customer-hydration): comprehensive Account DMO audit CLI`.

---

## Sub-phase 5a — Branch backfill (2 fields × 36,044)

- [ ] **5a.1:** Probe `BranchUnitCustomer` row count. Persist outcome.
- [ ] **5a.2:** Pull all 26 BranchUnit rows; persist `config/branches_snapshot.json`.
- [ ] **5a.3:** Build `config/branch_state_weights.yaml`.
- [ ] **5a.4:** Failing tests for `branch_assignment` deriver (deterministic, weighted-by-state, fallback uniform, idempotent — 11 tests). 5,000-row chi-squared.
- [ ] **5a.5:** Implement deriver. Register coverage rule `branch_assigned` (both BranchCode + BranchName populated for every HYDRATE row).
- [ ] **5a.6:** Generator + augment-phase3 integration.
- [ ] **5a.7:** Live dry-run + live run. Verify via DC SQL.
- [ ] **5a.8:** Commit: `feat(customer-hydration): Phase 5a branch backfill`.

---

## Sub-phase 5b — Universal field backfill (~31 fields × 36,044 rows)

The biggest sub-phase. Six derivers ship in this commit; each addresses a logical field group from the audit's bucket structure.

### 5b.1 — Multipicklist segments (5 fields)

- [ ] **5b.1.1:** Author `config/multipicklist_templates.yaml` keyed by `(persona, risk, experience)` for `InvestmentObjectives`, `PersonalInterests`, `CustomerSegment`, `MarketingSegment`, `FinancialInterests`. Each template returns a `;`-delimited string.
- [ ] **5b.1.2:** Failing tests (8 — persona × risk × experience grid coverage; reproducibility; persona NULL fallback; semicolon delimiter; YAML reload).
- [ ] **5b.1.3:** Implement `multipicklist_segments.py` deriver.
- [ ] **5b.1.4:** Coverage rule `multipicklists_populated` — all 5 fields non-NULL on every HYDRATE row.

### 5b.2 — FSC `__pc` shadow fields (3 fields)

- [ ] **5b.2.1:** Failing tests (6 — `Category__pc` mirrors `ClientCategory`; `Contact_Status__pc` recency-band logic; `IndividualType__pc` mirrors `IndividualType__c`).
- [ ] **5b.2.2:** Implement `fsc_pc_shadows.py`.
- [ ] **5b.2.3:** Coverage rule `pc_shadows_populated`.

### 5b.3 — Biz parity (14 fields)

- [ ] **5b.3.1:** Failing tests (12 — `CountryOfBirth__pc` for biz = country of incorporation derived from BillingCountry; `RiskTolerance` from biz size+industry; `ServiceModel` from persona; `Tier__c` from persona; etc.). Skip the 6 fields where biz parity is `false` (`EmployedSince__pc`, `HomeOwnership__pc`, `TaxBracket__pc`, `Occupation__pc`, plus 2 person-only address compounds).
- [ ] **5b.3.2:** Implement `biz_parity.py`.
- [ ] **5b.3.3:** Coverage rule `biz_parity_populated`.

### 5b.4 — Person parity (12 fields — Rating, Type, address mirrors)

- [ ] **5b.4.1:** Failing tests (6 — `Rating` persona-mapped picklist; `Type` persona-coherent; address mirror writes idempotent; respects existing biz values).
- [ ] **5b.4.2:** Implement `person_parity.py`. *Note: address mirror lives in 5d, not 5b — this deriver only fills `Rating`, `Type` for persons.*
- [ ] **5b.4.3:** Coverage rule `person_parity_populated`.

### 5b.5 — AccountSource, Phone, Website (3 fields, both cohorts)

- [ ] **5b.5.1:** Failing tests (4 — persona-coherent AccountSource; Phone mirror to person-mobile; Website biz-only synthetic URL; respects existing values).
- [ ] **5b.5.2:** Implement `account_source_phone_website.py`.
- [ ] **5b.5.3:** Coverage rule `account_source_assigned`.

### 5b.6 — IndividualType__c on missing biz rows (1 field × 5,610 rows)

- [ ] **5b.6.1:** Failing test: only writes pure-Business RT rows; skips Household RT.
- [ ] **5b.6.2:** Implement `individual_type_full.py`.
- [ ] **5b.6.3:** Coverage rule `individual_type_complete`.

### 5b.7 — PrimaryContact lookup (1 field × 36,044 rows)

- [ ] **5b.7.1:** Pre-flight: pull `PersonContactId` + `AccountContactRelation` joins; persist `output/phase5/contact_lookup.json`.
- [ ] **5b.7.2:** Failing tests (5 — person path, biz-with-ACR, biz-no-ACR-synth, External_Id__c idempotency, ACR creation).
- [ ] **5b.7.3:** Two-pass deriver: synth missing Contacts + ACRs → write Account.PrimaryContact.
- [ ] **5b.7.4:** Coverage rule `primary_contact_assigned`.

### 5b.8 — Live dry-run + live execute

- [ ] **5b.8.1:** Live dry-run: `python hydrate.py backfill-accounts --target-org jdo-uqj0jr --phase 5b --dry-run`. Inspect manifest.
- [ ] **5b.8.2:** Live run; verify rc=0; spot-check via DC SQL.
- [ ] **5b.8.3:** Commit: `feat(customer-hydration): Phase 5b universal field backfill (~31 fields)`.

---

## Sub-phase 5c — Phase 4 50-row regression fix (6 fields × 50 person rows)

- [ ] **5c.1:** Investigate the 50 missing IDs:
  ```bash
  sf data query --target-org jdo-uqj0jr --query "SELECT Id, External_ID__c, RecordType.Name FROM Account WHERE IsPersonAccount = true AND External_ID__c LIKE 'HYDRATE-%' AND FinServ__MaritalStatus__pc = NULL"
  ```
  Repeat for the other 5 fields. Persist `output/phase5/regression_50_ids.json`.
- [ ] **5c.2:** Confirm whether the 50 IDs are the same set across all 6 fields (one batch failed) or different (random transient).
- [ ] **5c.3:** Failing test for `regression_replay` deriver: takes a row-id list, re-runs the 6 Phase-4 derivers on just those rows, idempotent.
- [ ] **5c.4:** Implement.
- [ ] **5c.5:** Coverage rule `regression_replay_complete` — post-write, all 6 fields show 25,370/25,370 person populated.
- [ ] **5c.6:** Live: `python hydrate.py backfill-accounts --phase 5c --target-org jdo-uqj0jr --rerun-failed-rows output/phase5/regression_50_ids.json`. Verify.
- [ ] **5c.7:** Commit: `fix(customer-hydration): Phase 5c — 50-row regression replay`.

---

## Sub-phase 5d — PA address mirror (10 fields × 25,370 person rows)

- [ ] **5d.1:** Probe FSC PA auto-sync (5 rows, dry update + revert). Persist outcome.
- [ ] **5d.2:** If probe shows auto-sync: 5d becomes a generator-only forward-fix (no backfill needed).
- [ ] **5d.3:** Failing tests (5 — covers person rows, no-ops on biz, persona-gated coverage, idempotent, NULL PersonMailing → no-op).
- [ ] **5d.4:** Implement `pa_address_mirror.py`.
- [ ] **5d.5:** Generator integration in `person_accounts.py` for forward-runs.
- [ ] **5d.6:** Coverage rule `pa_addr_mirrored`.
- [ ] **5d.7:** Live: dry-run, real run, verify.
- [ ] **5d.8:** Commit: `feat(customer-hydration): Phase 5d PA address mirror`.

---

## Sub-phase 5e — DLO→DMO mapping verify + drop

- [ ] **5e.1:** Verify (DC SQL sample query) that `FinServ_Category_pc__c` and `FinServ_Contact_Status_pc__c` now produce values in the DMO post-5b. If yes, no mapping change needed.
- [ ] **5e.2:** Pre-check: grep `config/segments.yaml` and DC for any segment using `FinServ_ShippingAddress_pc__c`.
- [ ] **5e.3:** If no segment uses the compound: drop the field-mapping (single mapping line in `Account_Home_map_*`).
- [ ] **5e.4:** Live: `python hydrate.py dc-mapping drop --target-org jdo-uqj0jr --mapping Account_Home_map_Account_1736375270204 --target-field FinServ_ShippingAddress_pc__c`.
- [ ] **5e.5:** Verify mapping no longer appears in `list_dlo_dmo_mappings` output.
- [ ] **5e.6:** Commit: `feat(customer-hydration): Phase 5e mapping verify + drop ShippingAddress compound`.

---

## Sub-phase 5f — Stream refresh + verification

- [ ] **5f.1:** Trigger `Account_Home` stream refresh:
  ```bash
  python hydrate.py refresh-streams --target-org jdo-uqj0jr --streams Account_Home
  ```
  Wait for SUCCESS. Persist outcome.
  Fallback: `dc-stream-full-refresh-via-ui` skill.
- [ ] **5f.2:** Re-run comprehensive audit:
  ```bash
  python hydrate.py account-dmo-audit --target-org jdo-uqj0jr --output output/account-dmo-audit-2026-05-27-post/
  ```
- [ ] **5f.3:** Diff bucket counts pre vs post:
  ```bash
  diff <(jq -S '.fields[] | "\(.field): \(.classification)"' output/account-dmo-audit-2026-05-27-pre/comprehensive_audit.json) \
       <(jq -S '.fields[] | "\(.field): \(.classification)"' output/account-dmo-audit-2026-05-27-post/comprehensive_audit.json)
  ```
  Expected: 56 gap fields move to OK_FULL or OK_BY_DESIGN per spec § 9 targets.
- [ ] **5f.4:** Investigate `FinServ__CreditScore__c` DMO 70.4% mystery — re-query post-refresh; if persists, file as Phase 6 finding.
- [ ] **5f.5:** Run full test suite: expect ~849 PASS + 5 SKIPPED.
- [ ] **5f.6:** Update `AGENTS.md` Plans history with Phase 5 entry.
- [ ] **5f.7:** Update `docs/segment_briefs.md` if any newly-populated field becomes a segment dimension (likely `FinServ__CustomerSegment__c` or `FinServ__PersonalInterests__c`).
- [ ] **5f.8:** Final commit: `feat(customer-hydration): Phase 5 DMO backfill complete (~50 fields populated)`.

---

## Self-review checklist

- [ ] **Spec coverage:** every numbered subsection of the spec maps to ≥1 task. § 4.1–4.6 → 5a–5f. § 7 testing → 63 new tests. § 8 open Qs → probes in 5a.1, 5c.1, 5d.1, 5f.4.
- [ ] **Idempotency:** every deriver upserts by External_ID; reruns no-op once coverage is green.
- [ ] **No production runs.** All commands target `jdo-uqj0jr`. Production guard from Phase 4 v1.1 wave 4 unchanged.
- [ ] **PII discipline:** SSN/TIN never synthesised. Multipicklist values are anonymous templates.
- [ ] **No segment regression.** 5e.2 checks live segments before dropping any mapping.
- [ ] **Test counts:** 11 + 8 + 6 + 12 + 6 + 4 + 5 + 4 + 5 + 3 + 4 + 4 = **63 new tests**.
- [ ] **Coverage rules:** every deriver has a `*_assigned`/`*_populated`/`*_mirrored`/`*_complete` rule; failures land at rc=4 per the Phase 4 v1.1 exit-code matrix.

## After completion

If autonomous: `superpowers:subagent-driven-development`. Otherwise execute sub-phases in order via `superpowers:executing-plans`.
