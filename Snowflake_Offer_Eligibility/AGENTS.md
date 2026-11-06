# AGENTS.md — Snowflake_Offer_Eligibility

Synthetic, holdings-aware next-best-offer scores for retail, wealth and business books; see README.md.

- Unlike the Snowpark vendor siblings, the generator is a **SQL** procedure: randomness is
  `HASH(account, code, run month, salt)`, so re-runs in a month are byte-identical. No deploy script.
- The table holds **one scoring run** (INSERT OVERWRITE), mirroring the Databricks model it sits beside.
- Business codes must keep the `BIZ-` prefix (commercial family filter); person codes set `product_family` to `Retail`/`Wealth`. Every code needs a label in `offerModel.ts` `OFFER_LABEL` and, for the grid, a column in `whitespace.ts` `COLUMNS`.
- Holdings-aware: rerun the SP after loading new FSC FinancialAccounts into `FINANCIAL_TRANSACTION_ACCOUNTS`, so owned products drop out.
- Deploy as ACCOUNTADMIN; grant SELECT to DATA_ANALYST (DC connector) and MCP_EXPLORE_ROLE.
- A new column needs a DC source field + DLO field + DMO field + field mapping (zero-copy; no refresh).
