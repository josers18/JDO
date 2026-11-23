-- =============================================================================
-- Supercharge Bankers demo: Rodriguez Industries' new 30% owner (Tomas Vega)
-- One pinned BUSINESS_OWNER edge in DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH,
-- the Zero Copy source for BT_Synth_Relationship_Graph__dlm. The compliance
-- events query (fetchComplianceEvents) reads it as an "ownership" event.
--
-- Idempotent: MERGE keyed on a fixed RECORD_ID. No account exists for Tomas
-- Vega in the org, so DST_ACCOUNT_ID is a stable placeholder.
-- Rollback at the bottom.
-- =============================================================================

MERGE INTO DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH t
USING (
  SELECT
    '001am00002A9jm4AAB'                   AS SRC_ACCOUNT_ID,
    'pin:tomas-vega'                       AS DST_ACCOUNT_ID,
    'BUSINESS_OWNER'                       AS EDGE_TYPE,
    0.300                                  AS EDGE_WEIGHT,
    100.00                                 AS CONFIDENCE_PCT,
    DATE '2026-10-30'                      AS EDGE_DISCOVERED_DATE,
    DATE '2026-11-20'                      AS EDGE_LAST_SEEN_DATE,
    '{"ownership_pct": "30"}'              AS METADATA,
    TO_TIMESTAMP_NTZ('2026-11-20 00:00:00') AS GENERATED_AT,
    'JDO'                                  AS ORG_ID,
    'supercharge-rodriguez-owner-edge'     AS RECORD_ID
) s
ON t.RECORD_ID = s.RECORD_ID
WHEN MATCHED THEN UPDATE SET
  SRC_ACCOUNT_ID = s.SRC_ACCOUNT_ID, DST_ACCOUNT_ID = s.DST_ACCOUNT_ID, EDGE_TYPE = s.EDGE_TYPE,
  EDGE_WEIGHT = s.EDGE_WEIGHT, CONFIDENCE_PCT = s.CONFIDENCE_PCT,
  EDGE_DISCOVERED_DATE = s.EDGE_DISCOVERED_DATE, EDGE_LAST_SEEN_DATE = s.EDGE_LAST_SEEN_DATE,
  METADATA = s.METADATA, GENERATED_AT = s.GENERATED_AT, ORG_ID = s.ORG_ID
WHEN NOT MATCHED THEN INSERT
  (SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE, EDGE_WEIGHT, CONFIDENCE_PCT, EDGE_DISCOVERED_DATE,
   EDGE_LAST_SEEN_DATE, METADATA, GENERATED_AT, ORG_ID, RECORD_ID)
VALUES
  (s.SRC_ACCOUNT_ID, s.DST_ACCOUNT_ID, s.EDGE_TYPE, s.EDGE_WEIGHT, s.CONFIDENCE_PCT, s.EDGE_DISCOVERED_DATE,
   s.EDGE_LAST_SEEN_DATE, s.METADATA, s.GENERATED_AT, s.ORG_ID, s.RECORD_ID);

-- Rollback:
-- DELETE FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH WHERE RECORD_ID = 'supercharge-rodriguez-owner-edge';
