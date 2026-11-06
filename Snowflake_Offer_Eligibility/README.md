# Snowflake_Offer_Eligibility

Holdings-aware next-best-offer scores for **every** Cumulus book. They live in
`DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY` and are keyed to the Salesforce Account Id.

- **Business:** treasury (`BIZ-TM-ACH/RDC/PP/SWP`), lending (`BIZ-LOC/TL/EQF/CRE/SBA`), plus `BIZ-CHK` and `BIZ-CARD`.
- **Retail** (`product_family='Retail'`): `CHK/HYS/CRC/AUTO-ACQ`, `MTG-30`, `HEL/PL/INV-ACQ`.
- **Wealth** (`product_family='Wealth'`): `PCHK-ACQ`, `WM-CASH`, `WM-MAS`, `IRA-RTH`, `IRA-ROL`, `MTG-JMB`, `HEL-ACQ`.

v2 (2026-11-05) extends the scoring from business-only to every book.

- A product the client already holds (an FSC FinancialAccount not marked Closed) gets **no row**.
- Scoring reads Plaid held-away balances, Claritas life stage and income, CoreLogic equity, and FICO.

The React cockpits read only this table (`_shared/src/data/offerModel.ts`,
`whoToCall.ts`, `commercialWhoToCall.ts`, `whitespace.ts`). The Databricks
`Offer_Eligibility_Model__dlm` is no longer read.

| Piece | Name |
|---|---|
| Table | `OFFER_ELIGIBILITY` (`schemas/offer_eligibility.sql`) — the newest run |
| History | `OFFER_ELIGIBILITY_HISTORY` (`schemas/offer_eligibility_history.sql`) — every run, PK adds `START_DATE`, `RECORD_ID = acct\|code\|YYYY-MM` |
| Generator | `SP_GENERATE_OFFER_ELIGIBILITY(RUN_DATE)` — SQL, deterministic per account/code/month (`procedures/`) |
| Task | `TASK_MONTHLY_OFFER_ELIGIBILITY`, 1st of month 08:00 UTC, after D&B (`tasks/`) |
| DC stream | `BT_Offer_Eligibility` (`1dsam000000Q1gPAAS`, `BT_Managed_Snowflake`, DIRECT_ACCESS, TOTAL_REPLACE) |
| DLO / DMO | `BT_Offer_Eligibility__dll` → `BT_Offer_Eligibility__dlm` (`0gjam000001EhULAA0`), PK `record_id` |
| History stream | `BT_Offer_Eligibility_History` (`1dsam000000Q3FBAA0`, same connector / mode) |
| History DLO / DMO | `BT_Offer_Eligibility_History__dll` → `BT_Offer_Eligibility_History__dlm` (`0gjam000001Ek7FAAS`), PK `record_id` |

First run 2026-10-01: 204,192 business rows. v2 run 2026-11-05: 440,070 rows across all books (after the generated card holdings were loaded) (pre-v2 backup clone: `OFFER_ELIGIBILITY_BAK_20261105`). Eligibility rules and scoring are in the procedure header.

### Score history (2026-11-06)

Each call scores one run month into `OFFER_ELIGIBILITY_HISTORY` (DELETE + INSERT
that month) and replaces `OFFER_ELIGIBILITY` only when the month is the newest
in the history, so a past month can be re-scored without touching the current
table. Inputs are read **as of** the run month: Plaid, Claritas and D&B at the
newest `PROFILE_MONTH` ≤ run month, CoreLogic at the newest `PROFILE_QUARTER` ≤
run month, holdings opened before the month ends. The per-account random terms
are stable across months (only a ±3% monthly jitter carries the month), so
month-to-month movement comes from the inputs.

Backfilled 2026-05 → 2026-11 (≈ 440K rows a month; pre-change backup
`OFFER_ELIGIBILITY_BAK_20261106`). The white-space grid
(`_shared/src/data/whitespace.ts`) reads each cell's series from
`BT_Offer_Eligibility_History__dlm`; Data 360 computes the six-month change.

```bash
for m in 2026-05-01 2026-06-01 2026-07-01 2026-08-01 2026-09-01 2026-10-01 2026-11-01; do
  snow sql ${=R} -q "CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_OFFER_ELIGIBILITY('$m'::DATE)"
done   # oldest first; the last (newest) call refreshes OFFER_ELIGIBILITY
```

## Deploy

```bash
R="-c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN"   # siblings are ACCOUNTADMIN-owned
snow sql ${=R} -f schemas/offer_eligibility.sql
snow sql ${=R} -f schemas/offer_eligibility_history.sql
snow sql ${=R} -f procedures/sp_generate_offer_eligibility.sql
snow sql ${=R} -f tasks/task_monthly_offer_eligibility.sql
snow sql ${=R} -q "CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_OFFER_ELIGIBILITY()"
```

DC payloads used to create the stream, DMO and mapping are in `output/`
(`dc-create-*` for the current table, `dc-create-history-*` for the history;
both mapping POSTs succeeded on v64.0).
