-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_OFFER_ELIGIBILITY
-- Re-scores business offers monthly via SP_RETRY_WRAPPER (2 attempts).
-- Schedule: 0 8 1 * * UTC — an hour after TASK_MONTHLY_DNB_BUSINESS_CREDIT
-- (07:00), so each run scores off that month's D&B credit.
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_OFFER_ELIGIBILITY
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 8 1 * * UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_OFFER_ELIGIBILITY()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_OFFER_ELIGIBILITY RESUME;
