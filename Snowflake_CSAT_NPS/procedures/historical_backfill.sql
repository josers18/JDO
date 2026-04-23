-- =============================================================================
-- Historical Backfill: CSAT/NPS Data (Jan 2023 - Mar 2026)
-- =============================================================================
-- ONE-TIME EXECUTION ONLY. This script was used to populate CSAT_NPS_DATA
-- with 28,892 rows of realistic historical data across 741 accounts.
--
-- This file is preserved for reference/auditability. Do NOT re-run it;
-- the monthly procedure (SP_GENERATE_MONTHLY_CSAT) handles ongoing generation.
--
-- Methodology:
--   - 741 accounts from MASTER_ACCOUNTS assigned to 5 archetypes via HASH:
--       Positive (30%) | Negative (20%) | Neutral (30%) | Recovery (10%) | Volatile (10%)
--   - 39 months generated (Jan 2023 through Mar 2026)
--   - CSAT scores: Archetype-specific base + monthly drift + HASH-based noise
--   - NPS scores: Derived from CSAT via correlated mapping bands
--   - One existing account (001al00000cWIyXAAW, 7 rows) was gap-filled, not overwritten
--   - Total rows inserted: 28,892 (741 accounts x 39 months - 7 existing)
-- =============================================================================

INSERT INTO FINS.PUBLIC.CSAT_NPS_DATA (ROWID, ACCOUNTID, CONTACTID, CSAT_SCORE, CSAT_DESCRIPTION, NPS_SCORE, NPS_DESCRIPTION, SCORE_DATE)
WITH months AS (
    SELECT DATEADD('MONTH', seq4(), '2023-01-01'::DATE) AS score_date
    FROM TABLE(GENERATOR(ROWCOUNT => 39))
),
accounts AS (
    SELECT DISTINCT ACCOUNT_ID FROM FINS.PUBLIC.MASTER_ACCOUNTS
),
-- Assign each account to one of 5 trajectory archetypes using deterministic hash
archetypes AS (
    SELECT
        ACCOUNT_ID,
        ABS(HASH(ACCOUNT_ID)) % 100 AS bucket,
        CASE
            WHEN ABS(HASH(ACCOUNT_ID)) % 100 < 30  THEN 'POSITIVE'     -- 30%
            WHEN ABS(HASH(ACCOUNT_ID)) % 100 < 50  THEN 'NEGATIVE'     -- 20%
            WHEN ABS(HASH(ACCOUNT_ID)) % 100 < 80  THEN 'NEUTRAL'      -- 30%
            WHEN ABS(HASH(ACCOUNT_ID)) % 100 < 90  THEN 'RECOVERY'     -- 10%
            ELSE 'VOLATILE'                                              -- 10%
        END AS archetype
    FROM accounts
),
-- Cross join accounts x months, compute raw CSAT per archetype
raw_scores AS (
    SELECT
        a.ACCOUNT_ID,
        a.archetype,
        m.score_date,
        DATEDIFF('MONTH', '2023-01-01', m.score_date) AS month_idx,
        ABS(HASH(a.ACCOUNT_ID || m.score_date::VARCHAR)) % 100 AS noise,
        CASE a.archetype
            -- POSITIVE: starts ~55, trends up to ~85 over 39 months
            WHEN 'POSITIVE' THEN GREATEST(20, LEAST(100, ROUND(
                55 + (month_idx * 0.8) + ((noise % 11) - 5)
            )))
            -- NEGATIVE: starts ~75, trends down to ~40 over 39 months
            WHEN 'NEGATIVE' THEN GREATEST(20, LEAST(100, ROUND(
                75 - (month_idx * 0.9) + ((noise % 11) - 5)
            )))
            -- NEUTRAL: stays ~65-70 with minor drift
            WHEN 'NEUTRAL' THEN GREATEST(20, LEAST(100, ROUND(
                67 + ((noise % 13) - 6)
            )))
            -- RECOVERY: starts low ~40, dips further, then recovers after month 18
            WHEN 'RECOVERY' THEN GREATEST(20, LEAST(100, ROUND(
                CASE
                    WHEN month_idx < 12 THEN 40 - (month_idx * 0.5) + ((noise % 9) - 4)
                    WHEN month_idx < 18 THEN 34 + ((month_idx - 12) * 2) + ((noise % 9) - 4)
                    ELSE 46 + ((month_idx - 18) * 1.5) + ((noise % 9) - 4)
                END
            )))
            -- VOLATILE: swings wildly between 30 and 90
            WHEN 'VOLATILE' THEN GREATEST(20, LEAST(100, ROUND(
                60 + ((noise % 41) - 20)
            )))
        END AS csat_score
    FROM archetypes a
    CROSS JOIN months m
),
-- Derive NPS from CSAT using correlated mapping bands
with_nps AS (
    SELECT
        ACCOUNT_ID,
        score_date,
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
    FROM raw_scores
),
-- Exclude months already present for account 001al00000cWIyXAAW (7 existing rows)
filtered AS (
    SELECT *
    FROM with_nps w
    WHERE NOT EXISTS (
        SELECT 1 FROM FINS.PUBLIC.CSAT_NPS_DATA e
        WHERE e.ACCOUNTID = w.ACCOUNT_ID AND e.SCORE_DATE = w.score_date
    )
)
SELECT
    (SELECT COALESCE(MAX(ROWID), 0) FROM FINS.PUBLIC.CSAT_NPS_DATA) + ROW_NUMBER() OVER (ORDER BY ACCOUNT_ID, score_date),
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
    score_date
FROM filtered
ORDER BY ACCOUNT_ID, score_date;
