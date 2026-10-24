# Synth Relationship Graph — Cumulus Synthetic Dataset (Account Relationship Edges)

Synthesized directed relationship-graph dataset stitching together household members (Claritas), corporate parents (D&B), board memberships (BoardEx), advisor-book peers, internal referrals, business-owner bridges, and a SELF self-loop fallback for Cumulus's customer footprint. Mirrors
[Snowflake_Plaid_HeldAway](../Snowflake_Plaid_HeldAway) (the closer 1:N template) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 9 is all-accounts with weekly cadence — the second 1:N dataset (Plan 6 was first), the second weekly cadence (Plan 6 first; Plan 12 third), and the only edge-scoped dataset in the rollout. First Cumulus dataset with cross-plan SOFT dependencies (Claritas / D&B / BoardEx) — SP runs green even if any/all of those upstream tables are absent, courtesy of the SELF self-edge fallback.** Each anchor produces 1–N edge rows describing relationships to other accounts. Rows are keyed by composite PK `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)` (38,360 rows on 2026-10-24). Each run MERGEs the whole graph as of the run date and deletes edges no longer in it; the standing graph is stable week to week and new REFERRAL / BUSINESS_OWNER edges are discovered daily (see AGENTS.md § v2 seeds). The DMO is joinable to `ssot__Account__dlm` via FK `srcAccountId__c`; DC PK collapses to single-column `edgeId__c` (a projected `sha256(src||'|'||dst||'|'||edge_type)[:32]` derived at the DLO source view) with `srcAccountId__c`, `dstAccountId__c`, `edgeType__c` as KQ qualifiers (single-column-PK rule from Plan 4).

## Plan
- Plan 9, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-9-synth-relationship-graph.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-9-synth-relationship-graph-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)
- SOFT-depends on: [Snowflake_Claritas_Demographics](../Snowflake_Claritas_Demographics) (Plan 1, HOUSEHOLD edges), [Snowflake_DnB_BusinessCredit](../Snowflake_DnB_BusinessCredit) (Plan 3, CORPORATE_PARENT edges), [Snowflake_BoardEx_ExecIntel](../Snowflake_BoardEx_ExecIntel) (Plan 10, BOARD_MEMBER edges) — each absorbed by the SELF-fallback if absent

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH` (WEEKLY, `0 5 * * 1 UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusRelationshipGraph__dll` → DMO `CumulusRelationshipGraph__dlm`

## Audience
**All Salesforce accounts** — every distinct `001…` anchor in `V_ACCOUNT_ANCHORS` (36,768 on 2026-10-24; ~170 non-CRM hash-keyed anchors are excluded). A relationship graph that excludes any account is a graph with holes. The audience predicate is the most permissive in the rollout:

```sql
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE ACCOUNT_ID LIKE '001%'
QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY SNAPSHOT_DATE DESC) = 1
```

Each anchor emits **1–N edge rows** per week — minimum 1 (SELF-fallback) when no cross-plan edge applies, maximum bounded by HOUSEHOLD bidirectional pairs + ADVISOR_BOOK peers + sparse REFERRAL / BUSINESS_OWNER edges + CORPORATE_PARENT (BUSINESS only) + BOARD_MEMBER (when Plan 10 ships). Live 2026-10-24 (Claritas / D&B / BoardEx edges currently not emitted): SELF 32,161, REFERRAL 3,471 (confidence 30–95), ADVISOR_BOOK 2,410, BUSINESS_OWNER 318 — 38,360 rows.

## Tests
```bash
cd Snowflake_Synth_RelationshipGraph
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/synth_relationship_graph.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_weekly_synth_relationship_graph.sql
```

DC ingest is configured via the existing federation connector (see Plan 9 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
