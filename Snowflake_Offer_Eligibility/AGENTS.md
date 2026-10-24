# AGENTS.md — Snowflake_Offer_Eligibility

Synthetic treasury + lending next-best-offer scores for BUSINESS accounts; see README.md.

- Unlike the Snowpark vendor siblings, the generator is a **SQL** procedure: randomness is
  `HASH(account, code, run month, salt)`, so re-runs in a month are byte-identical. No deploy script.
- The table holds **one scoring run** (INSERT OVERWRITE), mirroring the Databricks model it sits beside.
- Keep column names aligned with `Offer_Eligibility_Model__dlm` — the React reader UNIONs them positionally.
- Codes must keep the `BIZ-` prefix (commercial family filter) and have a label in `offerModel.ts` `OFFER_LABEL`.
- Deploy as ACCOUNTADMIN; grant SELECT to DATA_ANALYST (DC connector) and MCP_EXPLORE_ROLE.
- A new column needs a DC source field + DLO field + DMO field + field mapping (zero-copy; no refresh).
