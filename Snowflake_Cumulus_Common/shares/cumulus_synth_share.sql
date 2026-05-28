-- =============================================================================
-- FINS.PUBLIC.CUMULUS_SYNTH_SHARE
-- Outbound zero-copy share carrying all 13 Cumulus dataset tables to
-- Salesforce Data Cloud.
-- =============================================================================
-- Per-dataset plans append a GRANT SELECT ON TABLE FINS.PUBLIC.<DATASET>
-- TO SHARE CUMULUS_SYNTH_SHARE once their table exists.
--
-- See spec §8 for the egress design rationale (single share + 13 tables vs
-- 13 separate shares).
-- =============================================================================

CREATE SHARE IF NOT EXISTS CUMULUS_SYNTH_SHARE
COMMENT = 'Outbound share carrying all 13 Cumulus synthetic dataset tables to Data Cloud. See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md §8.';

-- The share needs USAGE on FINS database / PUBLIC schema before per-dataset
-- table grants land. Idempotent — safe to re-run.
GRANT USAGE ON DATABASE FINS TO SHARE CUMULUS_SYNTH_SHARE;
GRANT USAGE ON SCHEMA FINS.PUBLIC TO SHARE CUMULUS_SYNTH_SHARE;

-- The consumer Salesforce Data Cloud account is added to the share
-- separately (environment-specific) via:
--     ALTER SHARE CUMULUS_SYNTH_SHARE ADD ACCOUNTS = <DC_ACCOUNT_LOCATOR>;
-- after this scaffold is deployed. Per-dataset plans do NOT touch this line.
