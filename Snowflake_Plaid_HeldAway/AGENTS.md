# AGENTS.md — Snowflake_Plaid_HeldAway

Synthetic Plaid-style held-away financial accounts dataset for the Cumulus FSC demo. One of 13. **Account-scoped with monthly cadence — first 1:N dataset in the rollout (each anchor produces 1–5 rows).**

> **v1.x multi-org-additive (Phase A, 2026-05-29 commit `c9119d32`).** Table now leads with `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'` as the first column; PK promoted from `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)` to `(ORG_ID, ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)`. **Every emitted row in the held-away slot loop carries ORG_ID** — `_rows_for(anchor, run_ts)` stamps `"ORG_ID": anchor.get("ORG_ID", "JDO")` as the first key on each of the 1–5 dicts produced per anchor. MERGE source SELECT, ON, INSERT lists all lead with ORG_ID; UPDATE SET deliberately skips ORG_ID (PK-component, immutable). Backward-compatible — JDO loaders continue working unchanged via DEFAULT. Multi-org rollout runbook: `Snowflake_Cumulus_Common/docs/ROLLOUT.md`.

## Boundaries
- Owns: `FINS.PUBLIC.PLAID_HELD_AWAY`, `SP_GENERATE_PLAID_HELD_AWAY`, `TASK_MONTHLY_PLAID_HELD_AWAY`, and the DC Data Stream / DLO / DMO that federates this table.
- Does NOT own: `V_ACCOUNT_ANCHORS`, `MASTER_ACCOUNTS`, the seed/coverage helpers — see `Snowflake_Cumulus_Common`.
- Does NOT own any outbound Snowflake share. DC reads through via the existing "Snowflake (Federate / Zero Copy)" connector.
- **Account-scoped** — rows are keyed by composite PK `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)`, with FK `ACCOUNT_ID` to `ssot__Account__dlm`. **1–5 rows per Retail/Wealth anchor per month.**

## Conventions
- The SP uses `cumulus_common.seed_for(...)` for determinism with salt `"plaid"` (month-bucketed).
- **Two seed levels per anchor:**
  - **Parent seed** — `seed_for(account_id, "plaid", run_ts)` → drives `_row_count(...)` (the 1–5 distribution). One stream per anchor.
  - **Per-slot seed** — `seed_for(f"{account_id}_slot{i}", "plaid", run_ts)` → independent stream for each held-away row's 13 other fields. Salt is the same; the per-slot key differs in suffix only.
- **`HELD_AWAY_ACCOUNT_ID` is a stable identity hash, NOT a per-run-bucketed seed.** Computed as `sha256(f"{account_id}_slot{i}_plaid").hexdigest()[:16]`. Slot 0 of account X has the same `HELD_AWAY_ACCOUNT_ID` in May, June, July — forever. Compare to `seed_for()` which IS month-bucketed.
- The SP uses `cumulus_common.assert_coverage(session, expected_sql, actual_sql)` for the **distinct-account** half of coverage; the row-count band check is inline (different shape than Plans 1-5's single-equality assert).
- The MERGE replaces on composite PK `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)`. Re-runs are idempotent within a calendar month.
- **Rows are sorted by `HELD_AWAY_ACCOUNT_ID` before MERGE** — deterministic ordering across re-runs (the `random.choices`-based row count means natural emission order is non-deterministic across slot iterations otherwise).
- Audience SQL is `WHERE CLIENT_CATEGORY IN ('Retail', 'Wealth Management')` on `V_ACCOUNT_ANCHORS` — 25,381 anchors (Retail 21,461 + Wealth Management 3,920, probed 2026-05-28). BIRTHDATE and ANNUAL_INCOME both 100% populated, no NULL-fallback needed in bias logic.
- 20-institution pool spans Brokerage / Bank / Credit Union / Robo-Advisor / Crypto Exchange. Recognisable names mapped to types — see rowspec `_INSTITUTIONS`. NOT license-grade Plaid data.
- `accounts_processed` in `TASK_EXECUTION_LOG` is `len(audience)` — the **distinct customer count**, NOT `len(records)`. The row count goes in a separate audit field (or just into the SP's RuntimeError messages).

## Tests
- L1 (pytest): determinism on multi-row output (re-running `_rows_for` returns identical sorted list), input-shape validation (ACCOUNT_ID non-empty), boring case (Retail mid-income emits 1–2 rows; Wealth high-income emits 3–5), anchor influence (income → balance, age → investment_risk_tier, Wealth → row count), month-bucketed seed produces byte-identical rows on re-runs **AND** stable `HELD_AWAY_ACCOUNT_ID` across months (slot 0 in May = slot 0 in June), schema contract.
- L2 (`tests/integration/`): deploys SP into a fixture-backed schema with `V_ACCOUNT_ANCHORS_FIXTURE` (10 Retail + 4 Wealth + 2 Business filtered out); asserts coverage (distinct accts = 14 AND total rows in `[14, 70]`), idempotency, at least one anchor with >1 row, at least one row with `IS_ACTIVE=false`, NULLable columns NULL when applicable.
- L3 (manual smoke, post-deploy): one CALL against jdo-uqj0jr; row count in `[25,381, 126,905]` band; distinct accounts = 25,381; sample plausibility (Wealth mean ~3 rows, Retail mean ~1.9; income → balance shift; IS_ACTIVE ~92%); spot-check 5 random anchors for distinct `HELD_AWAY_ACCOUNT_ID`s within their row group.

## Gotchas
- **First 1:N dataset.** `_rows_for(anchor, run_ts) -> list[dict]` returns 1–5 rows per anchor, NOT a single dict like Plans 1-5's `_row_for(...)`. The SP's main loop flattens via `records.extend(_rows_for(anchor, run_ts))`.
- **Composite PK.** `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)` in the Snowflake DDL and the MERGE ON. **DC DMO collapses to single-column PK `heldAwayAccountId__c`** + KQ qualifiers `accountId__c` (FK) and `profileMonth__c` (single-column-PK rule from Plan 4).
- **Two seed levels.** Parent seed `seed_for(account_id, "plaid", run_ts)` drives `_row_count`; per-slot seed `seed_for(f"{account_id}_slot{i}", "plaid", run_ts)` drives the 13 other fields. Don't reuse the parent RNG inside the slot loop — that breaks the determinism guarantee on per-slot fields.
- **HELD_AWAY_ACCOUNT_ID is identity-stable, not run-bucketed.** `sha256(f"{account_id}_slot{i}_plaid").hexdigest()[:16]` — no `run_ts` in the hash input, so the value is constant across all months for the same (anchor, slot, salt). DO NOT route through `seed_for` for this column — `seed_for` is intentionally month-bucketed.
- **Rows sorted by HELD_AWAY_ACCOUNT_ID before MERGE.** Each per-slot RNG independently calls `random.choices`, so the natural order of the rows list is non-deterministic across slot count variations. Sort ascending on `HELD_AWAY_ACCOUNT_ID` immediately before returning from `_rows_for`.
- **Two-part coverage assertion.** Plans 1-5's coverage is "rows = audience size." Plan 6 is two checks: (1) distinct `ACCOUNT_ID` count == audience size (every anchor must produce ≥1 row), AND (2) total row count in band `[audience, 5 * audience]`. Inline the band check; reuse `assert_coverage` for the distinct-account half.
- **4 NULLable columns when conditional.** `LAST_TRANSACTION_DATE` and `MONTHLY_NET_FLOW_USD` are NULL when `IS_ACTIVE=false` (~8% of rows). `INVESTMENT_RISK_TIER` is NULL unless `ACCOUNT_TYPE` ∈ {Brokerage, IRA, 401k, HSA}. `INTEREST_RATE_PCT` is NULL unless `ACCOUNT_TYPE` ∈ {Savings, Mortgage, Auto Loan, Credit Card}. The DDL marks all 4 as NULL; the MERGE source SELECT must preserve `None` → `NULL`.
- **`IS_ACTIVE` is BOOLEAN.** DC needs explicit `Boolean` declaration in the DLO + DMO field input (Plan 5 finding — defaulting to Text fails the Boolean parse). Snowflake stores BOOLEAN natively; the MERGE source SELECT casts via `IS_ACTIVE::BOOLEAN` to be explicit (write_pandas could mis-type it on an empty target).
- **`accounts_processed` ≠ `row_count`.** `TASK_EXECUTION_LOG.accounts_processed = len(audience)` (~25,381) for customer-coverage audit. Total rows (~52,300) is logged separately or surfaced via the band check.
- **Audience predicate** `CLIENT_CATEGORY IN ('Retail', 'Wealth Management')` — 25,381 anchors. BIRTHDATE and ANNUAL_INCOME both 100% populated, no NULL-fallback needed.
- Salt is `"plaid"`.
- Cadence is **monthly** (`'USING CRON 0 7 1 * * UTC'`).
- The `write_pandas(auto_create_table=True)` mis-types `datetime64[ns]` as `NUMBER(38,0)`. The MERGE source SELECT casts back via `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)` — see template Task 4 §_merge.
- 14 columns total: 10 NOT NULL (ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH, INSTITUTION_NAME, INSTITUTION_TYPE, ACCOUNT_TYPE, BALANCE_USD, LAST_LINKED_DATE, IS_ACTIVE, GENERATED_AT) + 4 NULLable (LAST_TRANSACTION_DATE, MONTHLY_NET_FLOW_USD, INVESTMENT_RISK_TIER, INTEREST_RATE_PCT).
- L1 conftest provides a synthetic anchor fixture — `SAMPLE_ANCHORS` from Cumulus_Common with `CLIENT_CATEGORY` skewed to Retail+Wealth (10+4 minimum to exercise both row-count distributions).
- The DLO → DMO field mapping must be completed in DC Setup UI for fully-custom DMOs (the API endpoint returns 500). See the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` from Plan 1 T7.
- Snowflake DATE columns auto-discover as `MM/dd/yyyy` in the DC data-stream POST body. Use that format for `PROFILE_MONTH`, `LAST_LINKED_DATE`, and `LAST_TRANSACTION_DATE`'s `sourceFields` entries, NOT `yyyy-MM-dd`.
- **Volume.** ~52,300 rows/month — largest Cumulus table to date (~2× Plan 1 / Plan 5 at 25,424). write_pandas default chunk size is fine, but worth flagging in the SP if memory pressure surfaces in L3.
