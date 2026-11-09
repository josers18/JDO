-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES (+ _STAGING sibling)
-- UserGems-style synthetic person-level job-change events (departures,
-- inbound hires, promotions) for contacts at non-household business accounts.
-- =============================================================================
-- Cadence:    WEEKLY via TASK_WEEKLY_USERGEMS_JOB_CHANGES
--             (Cron: 0 9 * * 1 UTC -- Monday 09:00 UTC).
-- Audience:   Employers: ACCOUNT_TYPE_FLAG = 'BUSINESS'
--             AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'
--             -- 6,435 anchors (probed 2026-11-02). COALESCE is required:
--             NULL <> 'Household' is NULL and would drop NULL-category anchors.
--             Wealth pool (PERSON_ACCOUNT_ID): CLIENT_CATEGORY = 'Wealth Management'
--             -- 3,920 PERSON anchors (probed 2026-11-02).
-- Shape:      EVENT-scoped (first in the rollout). One row per detected event;
--             most accounts have zero rows in a given week. PK EVENT_ID, a
--             deterministic UUID of (source account, event month, slot, kind).
--             PROFILE_WEEK is the detection week, not part of the PK.
-- BoardEx:    Hard dependency on BOARDEX_EXEC_INTEL (Plan 10). A FALSE to TRUE
--             rise of EXEC_TURNOVER_FLAG in month M emits exactly one C-suite
--             Departed event in M; no other month gets one.
-- Write path: MERGE ON (ORG_ID, EVENT_ID); events never delete.
-- Generator:  SP_GENERATE_USERGEMS_JOB_CHANGES(BACKFILL_WEEKS INTEGER DEFAULT 0)
-- Egress:     DC Snowflake federation -> DLO/DMO BT_UserGems_Job_Changes__dlm
-- Plan:       docs/superpowers/plans/2026-11-02-cumulus-plan-15-usergems-job-changes.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-15-usergems-job-changes-rowspec.md
-- No ampersand anywhere in this file (snow sql template-render trap).
-- CREATE TABLE IF NOT EXISTS (not OR REPLACE) for the target: re-applying this
-- file must never wipe event history. Staging is disposable and is replaced.
-- =============================================================================

CREATE TABLE IF NOT EXISTS DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES (
    ORG_ID                  VARCHAR(18)       NOT NULL DEFAULT 'JDO' COMMENT 'Multi-org tenant identifier (Phase A convention). Stable short-id per logical tenant. PK component (first).',
    RECORD_ID               VARCHAR(36)       NOT NULL COMMENT 'Deterministic UUID = record_id_for(ORG_ID, EVENT_ID) (cumulus_common/record_id.py). Single-column DC primary key recordId__c. No default: the SP writes it on INSERT and UPDATE.',
    EVENT_ID                VARCHAR(36)       NOT NULL COMMENT 'Deterministic UUID = record_id_for(source ACCOUNT_ID, event month, roster slot, kind), kind in hazard / csuite / pair. A paired mirror uses the source event coordinates with kind pair. Same ID whichever week computes it. PK component.',
    ACCOUNT_ID              VARCHAR(16777216) NOT NULL COMMENT 'The employer the event is about: the old employer for Departed / Promoted, the new employer for Joined. FK to ssot__Account__dlm.',
    PROFILE_WEEK            DATE              NOT NULL COMMENT 'Monday of the week containing DETECTED_DATE (detection week). Partition attribute, not part of the PK.',
    EVENT_TYPE              VARCHAR(10)       NOT NULL COMMENT 'Departed / Joined / Promoted.',
    EVENT_DATE              DATE              NOT NULL COMMENT 'Day the move happened, uniform within the event month.',
    DETECTED_DATE           DATE              NOT NULL COMMENT 'EVENT_DATE + 3..45 days (profile-update detection lag). Paired Joined mirrors add 0..7 more days (max 52).',
    CONTACT_NAME            VARCHAR(80)       NOT NULL COMMENT 'Synthetic First Last from the Plan 10 name banks, seeded by EVENT_ID (salt usergems_person). Not real-person PII.',
    CONTACT_PERSONA         VARCHAR(20)       NOT NULL COMMENT 'CFO / CEO-Owner / COO / VP Finance / Controller / Treasurer / AP Manager / Office Manager / Operations Manager. Tracked personas scale with EMPLOYEE_COUNT.',
    SENIORITY               VARCHAR(10)       NOT NULL COMMENT 'C-Suite / VP / Director / Manager, fixed by persona; the new (one level up) seniority on Promoted rows.',
    OLD_TITLE               VARCHAR(80)       NULL     COMMENT 'Title before the move. NULL on ~50 pct of inbound Joined rows (prior employer unknown).',
    NEW_TITLE               VARCHAR(80)       NULL     COMMENT 'Title after the move. NULL for Departed with NEW_EMPLOYER_STATUS Unknown.',
    NEW_EMPLOYER_NAME       VARCHAR(120)      NULL     COMMENT 'Departed only: destination ACCOUNT_NAME (Existing Client) or synthetic company (Prospect). NULL for Unknown, Promoted and Joined.',
    NEW_ACCOUNT_ID          VARCHAR(16777216) NULL     COMMENT 'Destination employer anchor, only on Departed rows with NEW_EMPLOYER_STATUS Existing Client. Never equals ACCOUNT_ID. Second relationship to ssot__Account__dlm.',
    NEW_EMPLOYER_STATUS     VARCHAR(16)       NOT NULL COMMENT 'Existing Client / Prospect / Unknown on Departed; Not Applicable on Promoted and Joined.',
    PAIRED_EVENT_ID         VARCHAR(36)       NULL     COMMENT 'Cross-link between a Departed to Existing Client row and its mirrored Joined row on NEW_ACCOUNT_ID (both directions). The two rows can land in different detection weeks.',
    WAS_CHAMPION            BOOLEAN           NOT NULL COMMENT 'Contact was a champion at the source account (Departed / Promoted) or the prior account (paired Joined). FALSE on inbound Joined. Finance personas 40 pct, others 10 pct.',
    WAS_PRIMARY_CONTACT     BOOLEAN           NOT NULL COMMENT 'Contact was the primary relationship contact at ACCOUNT_ID (Departed / Promoted only; FALSE on Joined).',
    OPPORTUNITY_SCORE       NUMBER(3,0)       NOT NULL COMMENT 'Value of the move as a new-business lead, [0, 100].',
    RELATIONSHIP_RISK_SCORE NUMBER(3,0)       NOT NULL COMMENT 'Risk the move poses to the existing relationship at ACCOUNT_ID, [0, 100].',
    PERSON_ACCOUNT_ID       VARCHAR(16777216) NULL     COMMENT 'Wealth Management PERSON anchor that is this contact. Only on C-Suite / VP Departed rows (~6 pct). Third relationship to ssot__Account__dlm.',
    LIQUIDITY_EVENT_FLAG    BOOLEAN           NOT NULL COMMENT 'PERSON_ACCOUNT_ID IS NOT NULL: a Wealth client just left an executive role (rollover, vesting, deferred comp).',
    GENERATED_AT            TIMESTAMP_NTZ(9)  NOT NULL COMMENT 'PROFILE_WEEK at 00:00:00, so re-runs are byte-identical (audit time is in TASK_EXECUTION_LOG).',
    CONSTRAINT pk_usergems_job_changes PRIMARY KEY (ORG_ID, EVENT_ID)
)
COMMENT = 'UserGems-style synthetic person-level job-change events for contacts at non-household Cumulus business accounts (6,435 employer anchors). Event-scoped: PK (ORG_ID, EVENT_ID), most accounts have no rows in a week. Departed / Joined / Promoted with champion and primary-contact flags, new-employer resolution, opportunity and relationship-risk scores, paired Joined mirrors and a Wealth liquidity tie-in. C-suite departures are gated one-to-one on BoardEx EXEC_TURNOVER_FLAG rises. Weekly MERGE. Two salts: usergems (account-month) + usergems_person (per event). DC PK recordId__c. See Snowflake_UserGems_JobChanges/README.md and Plan 15.';

-- Staging sibling: identical columns, defaults and comments (CREATE ... LIKE
-- copies the column definitions). The SP loads one run here, then MERGEs into
-- the target ON (ORG_ID, EVENT_ID).
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES_STAGING
    LIKE DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES;
