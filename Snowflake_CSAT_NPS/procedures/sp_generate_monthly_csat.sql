-- =============================================================================
-- FINS.PUBLIC.SP_GENERATE_MONTHLY_CSAT
-- Monthly CSAT/NPS score generation procedure
-- =============================================================================
-- Schedule: Runs on the 1st of each month at 7 AM UTC via TASK_MONTHLY_CSAT.
-- Generates one CSAT and NPS score per active account for the previous month.
--
-- Algorithm:
--   1. Compute baseline from 3-month rolling average of each account's CSAT
--   2. Inject randomized "events" using deterministic HASH-based pseudo-randomness
--      - 15% chance of negative event (score drops 10-20 points)
--      - 15% chance of positive event (score rises 8-15 points)
--      - 70% chance of normal drift (+/- 5 points from baseline)
--   3. Derive NPS from CSAT using correlated mapping bands
--   4. Assign text descriptions (Poor/Fair/Good/Very Good/Excellent for CSAT;
--      Detractor/Passives/Promoter for NPS)
--
-- Idempotency: Deletes any existing rows for the target month before inserting.
-- New accounts (no history): Default baseline of 65.
-- =============================================================================

CREATE OR REPLACE PROCEDURE FINS.PUBLIC.SP_GENERATE_MONTHLY_CSAT()
RETURNS STRING
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
BEGIN
    -- Target = first day of previous month
    LET target_month DATE := (SELECT DATE_TRUNC('MONTH', DATEADD('MONTH', -1, CURRENT_DATE))::DATE);
    LET three_months_ago DATE := (SELECT DATEADD('MONTH', -3, :target_month)::DATE);

    -- Idempotent: remove any existing rows for this month
    DELETE FROM FINS.PUBLIC.CSAT_NPS_DATA WHERE SCORE_DATE = :target_month;

    -- Generate scores
    INSERT INTO FINS.PUBLIC.CSAT_NPS_DATA (ROWID, ACCOUNTID, CONTACTID, CSAT_SCORE, CSAT_DESCRIPTION, NPS_SCORE, NPS_DESCRIPTION, SCORE_DATE)
    WITH recent_avg AS (
        SELECT
            ACCOUNTID,
            AVG(CSAT_SCORE) AS avg_csat
        FROM FINS.PUBLIC.CSAT_NPS_DATA
        WHERE SCORE_DATE >= :three_months_ago
          AND SCORE_DATE < :target_month
        GROUP BY ACCOUNTID
    ),
    accounts AS (
        SELECT DISTINCT ACCOUNT_ID
        FROM FINS.PUBLIC.MASTER_ACCOUNTS
        WHERE SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM FINS.PUBLIC.MASTER_ACCOUNTS)
    ),
    scored AS (
        SELECT
            a.ACCOUNT_ID,
            COALESCE(r.avg_csat, 65) AS baseline,
            ABS(HASH(a.ACCOUNT_ID || :target_month::VARCHAR)) % 100 AS rnd
        FROM accounts a
        LEFT JOIN recent_avg r ON a.ACCOUNT_ID = r.ACCOUNTID
    ),
    with_events AS (
        SELECT
            ACCOUNT_ID,
            GREATEST(20, LEAST(100, ROUND(
                CASE
                    -- Negative event (15% probability)
                    WHEN rnd < 15 THEN baseline - 10 - (rnd % 11)
                    -- Positive event (15% probability)
                    WHEN rnd >= 15 AND rnd < 30 THEN baseline + 8 + (rnd % 8)
                    -- Normal drift (70% probability)
                    ELSE baseline + ((rnd % 11) - 5)
                END
            ))) AS csat_score
        FROM scored
    ),
    with_nps AS (
        SELECT
            ACCOUNT_ID,
            csat_score,
            CASE
                WHEN csat_score <= 50 THEN 'Poor'
                WHEN csat_score <= 65 THEN 'Fair'
                WHEN csat_score <= 80 THEN 'Good'
                WHEN csat_score <= 90 THEN 'Very Good'
                ELSE 'Excellent'
            END AS csat_description,
            GREATEST(0, LEAST(10, ROUND(
                CASE
                    WHEN csat_score <= 50 THEN 1 + (csat_score - 20) / 10.0
                    WHEN csat_score <= 65 THEN 4 + (csat_score - 51) / 7.5
                    WHEN csat_score <= 80 THEN 6 + (csat_score - 66) / 7.5
                    WHEN csat_score <= 90 THEN 8 + (csat_score - 81) / 10.0
                    ELSE 9 + (csat_score - 91) / 10.0
                END
            ))) AS nps_score
        FROM with_events
    )
    SELECT
        (SELECT COALESCE(MAX(ROWID), 0) FROM FINS.PUBLIC.CSAT_NPS_DATA) + ROW_NUMBER() OVER (ORDER BY ACCOUNT_ID),
        ACCOUNT_ID,
        NULL,
        csat_score,
        csat_description,
        nps_score,
        CASE
            WHEN nps_score <= 6 THEN 'Detractor'
            WHEN nps_score <= 8 THEN 'Passives'
            ELSE 'Promoter'
        END,
        :target_month
    FROM with_nps
    ORDER BY ACCOUNT_ID;

    LET row_ct INTEGER := SQLROWCOUNT;
    RETURN 'Generated ' || :row_ct || ' CSAT/NPS scores for ' || :target_month::STRING;
END;
$$;
