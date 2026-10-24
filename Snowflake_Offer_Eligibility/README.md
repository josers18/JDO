# Snowflake_Offer_Eligibility

Next-best-offer scores for Cumulus **business** accounts — 5 treasury
(`BIZ-TM-ACH/RDC/PP/SWP`) and lending (`BIZ-LOC/TL/EQF/CRE/SBA`) action codes per
account — in `DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY`, keyed to the Salesforce
Account Id.

The Databricks offer model (`Offer_Eligibility_Model__dlm`) only scores person
accounts by MDM key, so business accounts had no offers. The React cockpits
(`_shared/src/data/offerModel.ts`, `commercialWhoToCall.ts`) UNION both sources.

| Piece | Name |
|---|---|
| Table | `OFFER_ELIGIBILITY` (`schemas/offer_eligibility.sql`) |
| Generator | `SP_GENERATE_OFFER_ELIGIBILITY(RUN_DATE)` — SQL, deterministic per account/code/month (`procedures/`) |
| Task | `TASK_MONTHLY_OFFER_ELIGIBILITY`, 1st of month 08:00 UTC, after D&B (`tasks/`) |
| DC stream | `BT_Offer_Eligibility` (`1dsam000000Q1gPAAS`, `BT_Managed_Snowflake`, DIRECT_ACCESS, TOTAL_REPLACE) |
| DLO / DMO | `BT_Offer_Eligibility__dll` → `BT_Offer_Eligibility__dlm` (`0gjam000001EhULAA0`), PK `record_id` |

First run 2026-10-01: 204,192 rows, 11,344 accounts, 11,026 with at least one
eligible offer. Eligibility rules and scoring are in the procedure header.

## Deploy

```bash
R="-c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN"   # siblings are ACCOUNTADMIN-owned
snow sql ${=R} -f schemas/offer_eligibility.sql
snow sql ${=R} -f procedures/sp_generate_offer_eligibility.sql
snow sql ${=R} -f tasks/task_monthly_offer_eligibility.sql
snow sql ${=R} -q "CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_OFFER_ELIGIBILITY()"
```

DC payloads used to create the stream, DMO and mapping are in `output/`
(mapping POST succeeded on v64.0).
