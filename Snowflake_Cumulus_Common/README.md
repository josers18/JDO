# Snowflake Cumulus Common

Shared infrastructure for the 13 Cumulus dataset pipelines. Owns:

- `FINS.PUBLIC.V_ACCOUNT_ANCHORS` — the shared anchor view (`schemas/v_account_anchors.sql`)
- `cumulus_common.seed` — deterministic per-row seed function used by all 13 generators
- `cumulus_common.coverage` — coverage-assertion helper used by all 13 generators
- `tests/fixtures/sample_anchors.py` — 100-row pytest fixture (50 person + 50 business) used by every dataset's L1 tests

DC egress is handled per-dataset via the existing **"Snowflake (Federate / Zero Copy)" connector** in Data Cloud — no outbound Snowflake share to manage here.

See the umbrella spec at `../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md`.

## Sibling pipelines (consumers)

- `Snowflake_Claritas_Demographics/` (Plan 1)
- `Snowflake_DnB_BusinessCredit/` (Plan 3)
- `Snowflake_MoneyGuidePro_Plans/` (Plan 8)
- `Snowflake_Plaid_HeldAway/` (Plan 6)
- `Snowflake_CoreLogic_Property/` (Plan 5)
- `Snowflake_WorldCheck_AML/` (Plan 7)
- `Snowflake_Synth_RelationshipGraph/` (Plan 9)
- `Snowflake_BoardEx_ExecIntel/` (Plan 10)
- `Snowflake_ZoomInfo_Firmographics/` (Plan 11)
- `Snowflake_Gong_CallSentiment/` (Plan 12)
- `Snowflake_MSCI_ESG/` (Plan 2)
- `Snowflake_Esri_GeoFootprint/` (Plan 4)
- `Snowflake_Moodys_MarketContext/` (Plan 13)

## Layout

```
schemas/             — Snowflake DDL (views)
cumulus_common/      — Reusable Python helpers
tests/               — pytest tests + fixture
output/              — Deploy probes + recovered metadata
```

## Running tests

```bash
cd Snowflake_Cumulus_Common
python -m venv .venv && source .venv/bin/activate
pip install pytest snowflake-snowpark-python
pytest tests/ -v
```

## Deploying

```bash
# Anchor view (idempotent)
snow sql -f schemas/v_account_anchors.sql
```

Per-dataset Data Cloud streams are configured manually in DC Setup → Data Streams via the existing "Snowflake (Federate / Zero Copy)" connector. See each per-dataset plan's Task 8 for the column mapping.
