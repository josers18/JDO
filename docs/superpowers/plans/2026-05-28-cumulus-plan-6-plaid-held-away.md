# Cumulus Plan 6 — Plaid Held-Away Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the sixth per-dataset Cumulus pipeline — Plaid-style held-away financial accounts (external brokerages, banks, credit unions, robo-advisors, crypto exchanges). **First 1:N dataset** in the rollout — each anchor produces 1–5 rows. Retail+Wealth audience. Monthly cadence. SP emits multiple rows per anchor per month into `FINS.PUBLIC.PLAID_HELD_AWAY` (~52,300 rows expected), federated as `CumulusPlaidHeldAway__dlm`.

**Architecture:** Instantiates the dataset template (v1.5) with **three structural deviations** from Plans 1-5:
1. **1:N row factory** — `_rows_for(anchor, run_ts) -> list[dict]` (returns 1–5 rows) instead of `_row_for(anchor, run_ts) -> dict`.
2. **Composite PK** — `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)`. DC PK collapses to `HELD_AWAY_ACCOUNT_ID` (single-column DMO PK rule from Plan 4).
3. **Two-part coverage assertion** — distinct accounts must equal audience size AND total rows must be in band `[audience, 5 × audience]`.

**Depends on:** Plan 0. Independent of Plans 1-5 — no shared Snowflake objects. **Blueprints Plan 9** (Synth Relationship Graph, edge-scoped, also 1:N).

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `6` |
| `<<DATASET_SLUG>>` | `plaid-held-away` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `plaid_held_away` |
| `<<MIMICS_VENDOR>>` | `Plaid` |
| `<<DATASET_TABLE>>` | `PLAID_HELD_AWAY` |
| `<<DATASET_TABLE_LOWER>>` | `plaid_held_away` |
| `<<REPO_DIR>>` | `Snowflake_Plaid_HeldAway` |
| `<<DC_DMO>>` | `CumulusPlaidHeldAway__dlm` |
| `<<DATASET_SALT>>` | `plaid` |
| `<<CADENCE>>` | `MONTHLY` |
| `<<TASK_NAME>>` | `TASK_MONTHLY_PLAID_HELD_AWAY` |
| `<<TASK_NAME_LOWER>>` | `task_monthly_plaid_held_away` |
| `<<SP_NAME>>` | `SP_GENERATE_PLAID_HELD_AWAY` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `CLIENT_CATEGORY IN ('Retail', 'Wealth Management')` |
| `<<COVERAGE_RULE>>` | distinct accts = audience AND `audience ≤ rows ≤ 5*audience` |
| `<<ROW_PK>>` | `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)` — composite |
| `<<COLUMN_LIST>>` | See rowspec — 14 columns including 4 NULLable fields |

## §2 Audience-predicate probe

`CLIENT_CATEGORY IN ('Retail', 'Wealth Management')`

**Live cardinality (probed 2026-05-28):** Retail 21,461 + Wealth Management 3,920 = **25,381 anchors**. Both BIRTHDATE and ANNUAL_INCOME are 100% populated on this audience (no NULL-fallback needed in bias logic).

No BUSINESS over-count concern — the predicate excludes BUSINESS-shape categories (Small Business, Commercial Banking, Household).

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-6-plaid-held-away-rowspec.md`

Contains:
- 14-column table DDL inputs (4 NULLable fields)
- Composite PK `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)`
- Row-count distribution by income/Wealth/age
- 20-institution pool with type mapping
- Account type bias by institution × age
- Balance bias (income mult, age glide for retirement, loan negatives)
- Last-linked / IS_ACTIVE / monthly-net-flow logic
- Investment risk tier (age-based glide path)
- Interest rate (APY for savings, APR for loans)
- 1:N `_rows_for` skeleton with per-slot seed pattern
- L1 multi-row determinism + 4-property anchor-influence assertions

## §4 What changes from the v1.5 template

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - This is a **1:N** dataset — `_rows_for(anchor, run_ts) -> list[dict]`, NOT `_row_for(...) -> dict`.
   - **Two seed levels:** parent_seed for the anchor (drives row_count) + per-slot seed `seed_for(f"{account_id}_slot{i}", "plaid", run_ts)` for each held-away account.
   - **Sort rows by HELD_AWAY_ACCOUNT_ID before MERGE** for deterministic ordering.
   - Coverage assertion is two-part: distinct accounts AND row count band.
   - 4 NULLable columns (LAST_TRANSACTION_DATE, MONTHLY_NET_FLOW_USD, INVESTMENT_RISK_TIER, INTEREST_RATE_PCT). Keep NULL semantics consistent with the rowspec.
   - `IS_ACTIVE` is BOOLEAN — DC needs explicit `Boolean` type declaration in DLO+DMO field input (Plan 5 finding).

2. **Task 2 (table DDL).** Composite PK on three columns. `HELD_AWAY_ACCOUNT_ID` is `VARCHAR(64)` (16-hex-char SHA prefix, but pad for safety).

3. **Task 3 (L1 tests).** Plan 1's conftest pattern (importlib + SAMPLE_ANCHORS). Property #4 has FOUR assertions plus a **list-determinism** check (re-running `_rows_for` on the same anchor returns identical list). Add an explicit test that **HELD_AWAY_ACCOUNT_ID is stable across months** (slot 0 of account X is the same hash in May and June).

4. **Task 4 (SP).** Implement `_rows_for` per the rowspec. Three structural points:
   - **Parent-level seed** for `_row_count`; **per-slot seed** for the 13 other fields.
   - The MERGE source SELECT must explicitly cast `HELD_AWAY_ACCOUNT_ID::VARCHAR` and `IS_ACTIVE::BOOLEAN` (write_pandas defaults could mis-type these in an empty table).
   - **Inline two-part coverage** — call `assert_coverage` for distinct-accounts (re-use Plans 1-5's helper), then a manual band check for total rows.

5. **Task 5 (L2).** Fixture has 14 anchors (10 Retail + 4 Wealth + 2 Business filtered out). Plan 6-specific assertions:
   - At least one anchor produces >1 row (verifies 1:N).
   - At least one anchor with IS_ACTIVE=false in its rows.
   - Total row count is in band `[14, 70]` (audience 14, max 5×).
   - `COUNT(DISTINCT ACCOUNT_ID) == 14`.

6. **Task 6 (deploy).** Clone Plan 5's `scripts/deploy_sp.py`. No `&` sanitize ("Plaid" is clean). Monthly cron, `MAIN_WH_XS`. Wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_PLAID_HELD_AWAY()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1-5. **DC PK collapse:** Use `HELD_AWAY_ACCOUNT_ID` as the single-column PK. Add KQ qualifiers `accountId__c` (FK to ssot__Account__dlm) and `profileMonth__c` for join semantics. `IS_ACTIVE` declared as `Boolean` (Plan 5 finding). Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | ACCOUNT_ID | ssot__AccountId__c | Text (FK) |
   | HELD_AWAY_ACCOUNT_ID | heldAwayAccountId__c | Text (PK) |
   | PROFILE_MONTH | profileMonth__c | Date |
   | INSTITUTION_NAME | institutionName__c | Text |
   | INSTITUTION_TYPE | institutionType__c | Text |
   | ACCOUNT_TYPE | accountType__c | Text |
   | BALANCE_USD | balanceUsd__c | Number |
   | LAST_LINKED_DATE | lastLinkedDate__c | Date |
   | IS_ACTIVE | isActive__c | **Boolean** |
   | LAST_TRANSACTION_DATE | lastTransactionDate__c | Date |
   | MONTHLY_NET_FLOW_USD | monthlyNetFlowUsd__c | Number |
   | INVESTMENT_RISK_TIER | investmentRiskTier__c | Text |
   | INTEREST_RATE_PCT | interestRatePct__c | Number |
   | GENERATED_AT | generatedAt__c | DateTime |

   `PROFILE_MONTH` and `LAST_LINKED_DATE` and `LAST_TRANSACTION_DATE` need `format: "MM/dd/yyyy"` per v1.4.1.

8. **Task 8 (L3 smoke).** Verify SP run, ~52,300 rows. Spot-check:
   - Distinct ACCOUNT_ID = 25,381 (audience size).
   - Total rows in `[25,381, 126,905]` band.
   - 5 random anchors — verify each has 1-5 rows with distinct HELD_AWAY_ACCOUNT_IDs.
   - Wealth-vs-Retail row-count distribution: Wealth mean ~3, Retail mean ~1.9.
   - Income vs balance: top decile income has ≥3× mean balance vs bottom decile (non-loan rows only).
   - IS_ACTIVE ratio ~92%.

## §5 Self-review checklist

- [ ] Audience predicate `CLIENT_CATEGORY IN ('Retail', 'Wealth Management')` in 4 places (SP `_AUDIENCE_PREDICATE`, audience SQL, coverage SQL, L1 fixture override).
- [ ] Salt `"plaid"` in SP module constant.
- [ ] `_rows_for(anchor, run_ts) -> list[dict]` shape, not single-dict.
- [ ] Per-slot seed uses `f"{account_id}_slot{i}"` as the account_id arg to `seed_for`.
- [ ] HELD_AWAY_ACCOUNT_ID is sha256 hex prefix, NOT random — must be stable across runs and months.
- [ ] Rows sorted by HELD_AWAY_ACCOUNT_ID before MERGE.
- [ ] Composite PK `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)` in DDL and MERGE ON.
- [ ] Two-part coverage assertion (distinct accts + row band).
- [ ] DC DMO PK is single-column `heldAwayAccountId__c`.
- [ ] `IS_ACTIVE` declared as `Boolean` in DLO+DMO field input (Plan 5 finding).
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Real Plaid license / OAuth flow / token rotation.
- Transaction-level data — month-end balance + 30d net flow only.
- Per-security holdings (Plaid Investments product) — collapsed to balance + risk tier.
- Multi-currency — USD only.
- Reconnect-lifecycle state machine — IS_ACTIVE is a static flag.

## §7 Status

Pending implementation. Plans 1-5 shipping live (5 datasets, 75,356 rows total). Plan 6 is the **first 1:N-row dataset** — validates the recipe handles multi-row-per-anchor before Plan 9 (Synth Relationship Graph, also 1:N edge-scoped).
