# Changelog

All notable changes to `Customer_Hydration` are documented here. The
format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
entries are dated newest-first and grouped by month. Treat shipped
entries as immutable history — when new work lands, add a NEW dated
entry rather than retroactively editing prior ones.

## [May 2026] — 2026-05-19 → 2026-05-27

### 2026-05-27 — Phase 6: fleet-wide MDMP/MDM External_ID renumber

- `feat(customer-hydration)` — Renumbered all 36,222 Account
  External_IDs from the legacy `HYDRATE-{RT,WL,SMB,COM,HH}-*`
  prefixes to a sequential `MDMP##### / MDM#####` convention:
  25,424 person Accounts → `MDMP00001..MDMP25424`; 10,798 business
  Accounts → `MDM00001..MDM10798`. Existing seed rows (MDMP002..MDMP048,
  MDM001..MDM111) renumbered to fit the new 5-digit width. 19
  previously-NULL External_ID rows (6 person + 13 business) included
  in the renumber; the 6 Cohort A persons (David Chen, Marcus
  Rodriguez, Anika Patel, Julia Nakamura, Ethan Brooks, Priya
  Venkatesh) now have full MDMP IDs and got synthetic addresses,
  birthdates, emails, phones, demographics.
- `fix(customer-hydration)` — ClientCategory now populated on all
  36,222 rows: 43 previously-NULL rows filled via RecordType-mapping
  bulk upsert (Household RT → "Household", Person Account variants →
  "Retail", Account RT → "Small Business").
- `fix(customer-hydration)` — 11 originally-broken rows from the
  prior session's triage (`MDMP00002`/`MDMP00016`/`MDMP00018`/
  `MDMP00037`/`MDMP00048` + the 6 Cohort A IDs) now fully populated
  with MaritalStatus / CurrentEmployer / Occupation / AnnualIncome /
  BillingStreet via direct bulk-upsert (these fields aren't owned
  by any Phase 4/5 deriver, so generator-driven backfill couldn't
  reach them).
- `feat(customer-hydration)` — `customer_hydration/phase5/segments.
  HYDRATE_PREFIX` switched from `"HYDRATE-"` to `"MDM"` so
  segment-injection clauses target the renumbered cohort.
  `config/segments.yaml` header updated. All 46 segment-orchestration
  + translator-related-to tests still green after the prefix change.
- **Cutover blocker:** the 21 live segments on `jdo-uqj0jr` still
  carry the old `HYDRATE-` server-side criteria; until they're
  recreated they return 0 members. Recreate command requires a
  fresh shell (the current session's token-redaction hook breaks DC
  REST auth) — see `docs/ROADMAP.md` § Phase 6 follow-ups.
- `Account_Home` DC stream refresh triggered via Lightning UI
  (`dc-stream-full-refresh-via-ui` skill) so the DLO/DMO see the
  new IDs.

### 2026-05-27 — Phase 5: cohort-aware Account DMO backfill

- `feat(customer-hydration)` — Closed 56 of 64 gap fields on `ssot__Account__dlm`
  identified by the comprehensive cohort-aware audit at
  `output/account-dmo-audit-2026-05-27/REPORT.md`. Six sub-phases:
  - **5a** Branch backfill — new `BranchAssignmentDeriver`
    (`customer_hydration/derivers/branch.py`) pulls 26 BranchUnit rows + 144
    canonical BranchUnitCustomer links once at startup; per-row assignment
    inherits canonical-if-known else state-weighted random keyed off
    `archetype.home_metro`. Live: 36,044 rows, 0 failures.
  - **5b** Universal field backfill — single `Phase5UniversalDeriver`
    covers ~26 fields across 6 logical groups: 5 multipicklists
    (`InvestmentObjectives`, `PersonalInterests`, `CustomerSegment`,
    `MarketingSegment`, `FinancialInterests`), 3 FSC `__pc` shadows
    (`Category`, `Contact_Status`, `IndividualType` — gated `if is_person`),
    8 person→biz parity (`InvestmentExperience`, `RiskTolerance`,
    `ServiceModel`, etc.), 2 biz→person parity (`Rating`, `Type`), 3
    standards (`AccountSource`, `Phone`, `Website`), `IndividualType__c`
    recovery on 5,610 missing biz rows.
  - **5c** Phase 4 50-row regression replay — `HYDRATE-RT-000001..000050`
    were missing `MaritalStatus`, `CurrentEmployer`, `Occupation`,
    `TaxBracket`, `AnnualIncome`, `LifetimeValue` because the very first
    retail batch had a NULL `AnnualIncome__pc` that short-circuited the
    Phase 4 archetype's income-band coherence. Two-step fix: bulk-upsert
    deterministic salaries (60-90k via External_ID hash), rerun standard
    backfill, then bulk-upsert `MaritalStatus/Employer/Occupation` directly
    (no Phase 4 deriver claims those fields).
  - **5d** PA address mirror — 25,370 person rows: `PersonMailing*` →
    `Billing*` AND `Shipping*` via two-pass export + bulk upsert.
  - **5e** Mapping verify — confirmed `FinServ_Category_pc__c` and
    `FinServ_Contact_Status_pc__c` mappings are correct (the prior audit's
    "GAP_FIELD_NONEXISTENT" was a typo: `FinServ_Category__pc` with single
    underscore, not double, exists on Account). No mapping changes needed.
  - **5f** Stream refresh + verify — `Account_Home` triggered via Lightning
    UI (`dc-stream-full-refresh-via-ui` skill); post-refresh verification
    shows BranchCode/InvestmentObjectives/AccountRatingType/BillingStreet/
    PersonalInterests all 0 missing on the 36,044 HYDRATE rows; `__pc`
    shadows correctly biz-NULL by platform constraint.
- ~445,000 cells written across 5 live executions, 0 bulk failures.

### 2026-05-27 — Phase 3d: cross-DMO segments (v1.0 → v1.1 → v1.2)

- `feat(customer-hydration)` — 15 cross-DMO segments ACTIVE in `jdo-uqj0jr`
  (5 placeholder + 10 campaign-aligned). New `related_to` rule type in
  `customer_hydration/phase5/segments.py` emits a v62 `NumberAggregation
  count(>=1)` envelope (the API's idiom for SQL `EXISTS`). v1.0 emitted
  `NestedAttribute`, which v62 rejected with `cannot determine model class
  of name` — v1.2 reverse-engineered the correct envelope from a
  live UI-built segment (`Recent_Transactions`).
- `feat(customer-hydration)` — Probe-gated relative-date filters: live
  three-segment probe (`segments_probe.py`) detects whether
  `ExactlyRelativeDateComparison` works on Profile DMOs, falling back to
  frozen ISO anchor when broken. Verdict persisted to
  `output/phase3d/probe_latest.json`.
- `feat(customer-hydration)` — DELETE-then-POST recreate migration
  (`execute_recreate_segments`) since PATCH on Dynamic segments returns
  `ENTITY_SAVE_ERROR`. New CLI: `create-segments --recreate <pattern>` and
  `--probe-relative-dates`.
- `fix(customer-hydration)` — `list_segments` now paginates until empty
  page (was capping at 20 silently; the DC v62 endpoint caps page size
  below the requested limit, which broke the recreate's DELETE phase).

### 2026-05-27 — Phase 4 v1.1: live-org compatibility hotfixes

- `fix(customer-hydration)` — Five hotfix waves driven by first live-org
  runs against `jdo-uqj0jr` after v1.0 merge:
  - Wave 1: writability preflight via `Account.describe()` drops
    formula/rollup/managed-pkg fields where `updateable=false`.
  - Wave 2: picklist drift preflight + `_PICKLIST_OVERRIDE` runtime swap +
    length-tolerant `weighted_pick` + `backfill/value_translator.py` w/
    `config/account_value_translator.yaml` for spec→org synonym mapping
    (Diamond→A, Premier→Tier 1, etc.).
  - Wave 3: `numeric_field_constraints()` preflight drops values that
    exceed declared `precision/scale` (D&B Failure Score 1001-1610 vs
    org's `precision=3` field); `PERSONA_PREFIX_MAP` flipped to
    `dict[str, list[str]]` to accept both `HYDRATE-RT-` and `HYDRATE-RTL-`.
  - Wave 4: leap-year clamp in `demographics.py`; gitignore
    `output/backfill-accounts-*/`; refresh `config/backfill_picklists.yaml`
    to org's actual restricted vocabulary.
  - Wave 5: broaden DC refresh classifier in `dc_refresh.py` to recognize
    `policy`/`full_refresh`/`not allowed`/`non-interactive` as
    `PolicySkipped` (rc=0), not `Failed`.
- Final clean run: rc=0, 35,722 rows upserted, 0 bulk failures, 787 PASS
  + 5 SKIPPED.

### 2026-05-26 → 2026-05-27 — Phase 4: Account field backfill (Plans 4a–4d)

- `feat(customer-hydration)` — 7 derivers across 24 coherence rules,
  coverage-rules engine, live SOQL fetch + Bulk API 2.0 upsert + DC stream
  refresh trigger + production guard.
- 4a (skeleton + PersonaArchetype), 4b (person derivers + coherence rules
  1–16, 22–24), 4c (B2B credit_bureau + coverage), 4d (live SOQL + Bulk
  upsert + DC stream refresh + 5 exception/production tests).

### 2026-05-25 → 2026-05-27 — Phase 3a–3c: augment-phase3 + life-events mirror

- `feat(customer-hydration)` — Dual-write augmentation: 25,036 native
  `PersonLifeEvent` rows brought to parity with the legacy `FinServ__LifeEvent__c`
  via the new `mirror-life-events` CLI. Backing data hydrated for loans,
  treasury, life-events, campaign-members across the Phase 3 phases.

### 2026-05-22 — Phase 2: streams + segments

- `feat(customer-hydration)` — Segment provisioning via `config/segments.yaml`,
  CRM-source DC stream refresh CLI, foundational-streams runbook
  (`docs/foundational_streams.md`).
- 21 segments published to `jdo-uqj0jr` against `ssot__Account__dlm`.

### 2026-05-19 → 2026-05-21 — Phase 1: foundational generator + loader

- `feat(customer-hydration)` — Initial 6-plan delivery: Plan 1 skeleton +
  Phase 0 + retail smoke; Plan 2 personas + activity + fieldmap correction;
  Plan 3 multi-wave parallel loader + reset + resume; Plan 4 native FSC
  mirrors (Wave F + G); Plan 5 Apex post-load wireup + Phase 5.5 DC stream
  refresh; Plan 6 verification briefs + docs + repo updates.
- Persona coverage: Retail, Wealth, Small Business, Commercial, Household.
- Idempotency contract: `External_ID__c LIKE 'HYDRATE-%'`. Production
  guard requires `--allow-production` for non-sandbox demo orgs like
  `jdo-fw51xz` and `jdo-uqj0jr`.
