# AGENTS.md — Snowflake_Offer_Eligibility

Synthetic, holdings-aware next-best-offer scores for retail, wealth and business books; see README.md.

- Unlike the Snowpark vendor siblings, the generator is a **SQL** procedure: randomness is
  `HASH(account, code, salt)` (stable across months) plus a ±3% `HASH(account, code, run month)`
  jitter, so re-runs in a month are byte-identical and score moves come from inputs. No deploy script.
- `OFFER_ELIGIBILITY` holds **one scoring run** (the newest); every run also lands in
  `OFFER_ELIGIBILITY_HISTORY`. `SP(RUN_DATE)` re-scores that month as of its inputs and only
  replaces the current table when it is the newest month — backfill oldest first.
- Business codes must keep the `BIZ-` prefix (commercial family filter); person codes set `product_family` to `Retail`/`Wealth`. Every code needs a label in `offerModel.ts` `OFFER_LABEL` and, for the grid, a column in `whitespace.ts` `COLUMNS`.
- Holdings-aware: rerun the SP after loading new FSC FinancialAccounts into `FINANCIAL_TRANSACTION_ACCOUNTS`, so owned products drop out.
- Deploy as ACCOUNTADMIN; grant SELECT to DATA_ANALYST (DC connector) and MCP_EXPLORE_ROLE.
- A new column needs a DC source field + DLO field + DMO field + field mapping (zero-copy; no refresh).
