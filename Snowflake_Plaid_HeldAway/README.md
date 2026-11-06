# Plaid Held-Away — Cumulus Synthetic Dataset (External Financial Accounts)

Synthetic Plaid-style held-away financial accounts per Retail/Wealth (personal) and Small Business/Commercial Banking (business) anchor for Cumulus's customer footprint. Mirrors
[Snowflake_CoreLogic_Property](../Snowflake_CoreLogic_Property) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 6 is account-scoped with monthly cadence — the first 1:N dataset in the Cumulus rollout.** Each anchor produces 1–5 held-away account rows. Rows are keyed by composite PK `(ORG_ID, ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)` (~66,500 rows/month). Each customer keeps the same held-away accounts every month; balances drift and are always positive, with `BALANCE_CATEGORY` = asset/liability. The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`; DC PK is the single-column `heldAwayAccountId__c` with `accountId__c` and `profileMonth__c` as KQ qualifiers.

## Plan
- Plan 6, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-6-plaid-held-away-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY(RUN_MONTH DATE DEFAULT NULL)` (`EXECUTE AS OWNER`; pass a month to regenerate it)
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PLAID_HELD_AWAY` (MONTHLY, `35 3 1 * * America/New_York`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → stream `BT_Plaid_Held_Away` → DMO `BT_Plaid_Held_Away__dlm`

## Audience
**Account-scoped** — enrolls Retail + Wealth Management (personal) and Small Business + Commercial Banking (business) anchors:

```sql
SELECT DISTINCT ACCOUNT_ID
FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE CLIENT_CATEGORY IN ('Retail', 'Wealth Management', 'Small Business', 'Commercial Banking')
```

Live cardinality (2026-10-24): **30,997 anchors** — 25,381 personal (Retail 21,461 + Wealth Management 3,920) and 5,616 business (Small Business 4,656 + Commercial Banking 960). Each anchor emits 1–5 held-away rows per month — 66,543 rows/month live (55,247 personal + 11,296 business).

**Business held-away** (added 2026-10-24): account types `Business Checking`, `Business Savings`, `Money Market`, `Sweep Account` (Commercial only) as assets and `Line of Credit`, `Commercial Loan`, `Commercial Card` as liabilities, at banks (Chase, Bank of America, Wells Fargo, Citi, PNC, US Bank, Truist, Capital One) or `Fintech` (Mercury, Brex; checking and cards only). Balances scale with `ANNUAL_REVENUE` (capped at $10M); `INVESTMENT_RISK_TIER` is null. Small Business gets 1–4 accounts, Commercial 1–5. The personal path's draws are unchanged, so personal rows are identical to v2.

## Market drift and moves to another firm (v3, 2026-11-06)
Investment balances (Brokerage, Managed Portfolio, IRA, 401k, HSA, Crypto Wallet) follow one shared market index instead of drifting independently. `_MARKET_RETURNS` holds the monthly returns: a summer rally, an Aug–Sep pullback, then an Oct–Nov rally that leaves the index ~6% above May. Each account scales the index by its own beta (Crypto 2–3×, Brokerage 0.8–1.3×, HSA 0.3–0.6×), plus ±1.5% noise. Months outside the table get a hashed return.

About 4% of personal Brokerage / Managed Portfolio / IRA accounts move to another firm in one month between Jun 2026 and May 2027. That month the balance goes to 0 with `MONTHLY_NET_FLOW_USD = −balance`; later months stay at 0 and inactive.

Both feed the offer model in [Snowflake_Offer_Eligibility](../Snowflake_Offer_Eligibility): the held-away bonus and value basis follow these balances, so a move-out shows up as a falling Investing / Managed Account offer in the cockpits' Rising/Falling lists. **After regenerating Plaid months, re-score the same months with `SP_GENERATE_OFFER_ELIGIBILITY`, oldest first, so the latest month replaces the current table.**

## Tests
```bash
cd Snowflake_Plaid_HeldAway
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/plaid_held_away.sql
python scripts/deploy_sp.py                  # rebuilds sp_create_procedure.sql and runs it as ACCOUNTADMIN
snow sql -f tasks/task_monthly_plaid_held_away.sql
```

The SP is `EXECUTE AS OWNER` and `write_pandas` needs CREATE TABLE, so it must be created (owned) by ACCOUNTADMIN; `deploy_sp.py` passes `--role ACCOUNTADMIN` by default. If you run the SQL by hand, use `snow sql --role ACCOUNTADMIN -f procedures/sp_create_procedure.sql`.

Regenerate a month: `snow sql --role ACCOUNTADMIN -q "CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY('2026-11-01'::DATE)"`.

DC ingest is configured via the existing federation connector (see Plan 6 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
