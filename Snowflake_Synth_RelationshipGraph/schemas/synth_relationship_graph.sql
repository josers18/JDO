-- =============================================================================
-- FINS.PUBLIC.SYNTH_RELATIONSHIP_GRAPH
-- Synthesized directed relationship-graph dataset stitching prior Cumulus plans
-- (Claritas households, DnB corporate parents, BoardEx board seats) plus
-- internally-synthesized advisor-book / referral / business-owner / SELF edges.
-- =============================================================================
-- Plan:       9
-- Cadence:    WEEKLY via TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH
--             (Cron: 0 5 * * 1 UTC — Monday 05:00 UTC)
-- Audience:   All accounts (1=1 predicate; SELECT DISTINCT defensively
--             against the 1.7% MASTER_ACCOUNTS dup) — distinct accounts from
--             V_ACCOUNT_ANCHORS, ~36,813 distinct anchors. 1:N — each anchor
--             emits 1–N edge rows per week (mean 3-5 at full population)
--             → ~110K–180K rows/week. Largest Cumulus table by 2-3× over
--             Plan 6. SELF-fallback guarantees every anchor contributes ≥1
--             row. Re-runs same calendar week MERGE-replace in place.
-- Generator:  SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH (Snowpark Python via
--             SP_RETRY_WRAPPER). Cross-plan SOFT dependencies on
--             CLARITAS_DEMOGRAPHICS, DNB_BUSINESS_CREDIT, BOARDEX_EXEC_INTEL
--             — absent tables silently skip the corresponding edge type.
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusRelationshipGraph__dlm
--             (DC PK collapses to single-column edgeId__c projected at DLO
--             source view; KQ qualifiers srcAccountId__c, dstAccountId__c,
--             edgeType__c.)
-- Plan link:  docs/superpowers/plans/2026-05-28-cumulus-plan-9-synth-relationship-graph.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-9-synth-relationship-graph-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.SYNTH_RELATIONSHIP_GRAPH (
    SRC_ACCOUNT_ID                VARCHAR(16777216) NOT NULL  COMMENT 'Anchor.ACCOUNT_ID — the "from" side of the directed edge. FK to ssot__Account__dlm. PK component.',
    DST_ACCOUNT_ID                VARCHAR(16777216) NOT NULL  COMMENT 'The "to" side of the directed edge. For SELF edges, equals SRC_ACCOUNT_ID. PK component.',
    EDGE_TYPE                     VARCHAR(20)       NOT NULL  COMMENT 'One of HOUSEHOLD / CORPORATE_PARENT / BOARD_MEMBER / ADVISOR_BOOK / REFERRAL / BUSINESS_OWNER / SELF. PK component. Drives weight band, confidence base, NULL semantics on METADATA.',
    EDGE_WEIGHT                   NUMBER(4,3)       NOT NULL  COMMENT 'Strength of the edge in [0.000, 1.000]. Per-type band (SELF=1.000, CORPORATE_PARENT/BUSINESS_OWNER ≥ 0.85, HOUSEHOLD 0.80-1.00, BOARD_MEMBER 0.55-0.85, ADVISOR_BOOK 0.40-0.70, REFERRAL 0.30-0.60).',
    CONFIDENCE_PCT                NUMBER(5,2)       NOT NULL  COMMENT 'Synthesis confidence (%) in [30.00, 100.00]. Independent of weight; stale data lowers it via age-decay starting at 365 days. SELF is exactly 100.00.',
    EDGE_DISCOVERED_DATE          DATE              NOT NULL  COMMENT 'When the edge was first synthesized. Within 1-60 months ago, deterministic per (src, dst, edge_type). ≤ run_ts.date(). SELF rows: equals week_start.date().',
    EDGE_LAST_SEEN_DATE           DATE              NOT NULL  COMMENT 'When the edge was last observed. Always ≥ EDGE_DISCOVERED_DATE; ≤ run_ts.date(). For SELF rows: equals EDGE_DISCOVERED_DATE = week_start.date().',
    METADATA                      VARCHAR(500)      NULL      COMMENT 'Optional JSON-encoded edge-type-specific facts (e.g. ''{"household_role":"member"}'', ''{"board_role":"Director"}'', ''{"link_source":"dnb"}'', ''{"ownership_pct":"majority"}''). NULL for SELF edges and edge types that do not add context.',
    GENERATED_AT                  TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Week-bucketed (= week_start at 00:00:00, Monday of run week UTC) for byte-identical mid-week re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_synth_relationship_graph PRIMARY KEY (SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)
)
COMMENT = 'Synthesized directed relationship-graph dataset for Cumulus. Weekly generation. 1:N — each anchor emits 1–N edge rows per week (mean 3-5 at full population, ~110K-180K rows/week — largest Cumulus table). All-accounts audience (1=1, ~36,813 distinct anchors). Composite 3-column PK (SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE) — DC DMO collapses to single-column PK edgeId__c (projected sha256 at DLO source view) with srcAccountId__c (FK), dstAccountId__c, edgeType__c as KQ qualifiers. 1 NULLable column (METADATA). Cross-plan SOFT dependencies on Claritas/DnB/BoardEx — absent upstream tables silently skip the corresponding edge type. SELF-fallback guarantees every anchor contributes ≥1 row, so COUNT(DISTINCT SRC_ACCOUNT_ID) = audience_size always holds. Re-runs same week MERGE-replace. See Snowflake_Synth_RelationshipGraph/README.md and Plan 9.';
