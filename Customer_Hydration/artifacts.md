# Customer_Hydration — artifacts

| Path | Purpose |
|---|---|
| `hydrate.py` | CLI entrypoint |
| `customer_hydration/` | Python package |
| `customer_hydration/derivers/` | Phase 4 + Phase 5 deriver modules (relationship, credit, demographics, branch, phase5_universal, etc.) |
| `customer_hydration/backfill/` | Phase 4 backfill engine — query, preflight, value translator, upsert, dc_refresh, production guard |
| `scripts/phase7_generate_csvs.py` | Phase 7 generator — deterministic sha256-keyed CSVs for biz + person cohort completion |
| `config/` | YAML configs (personas, product catalog, RM pool, segments, picklist overrides, value translator) |
| `output/` | Run artifacts (CSVs, manifests). Most subpaths gitignored; see below for retained ones. |
| `output/account-audit-2026-05-26/` | Phase 4 baseline audit (`REPORT.md` + `POST_BACKFILL_VERIFICATION.md` retained; raw JSON ignored) |
| `output/account-dmo-audit-2026-05-27/` | Phase 5 cohort-aware audit (`REPORT.md` retained; raw JSON/CSV ignored) |
| `output/phase3d/` | Phase 3d live-probe artifacts (`probe_latest.json`, `post_recreate_state.json`, `recent_transactions_includecriteria.json`) |
| `output/phase7-2026-05-27/` | Phase 7 update CSVs (`phase7a_biz.csv` full, `phase7a_biz_no_email.csv` loaded variant, `phase7b_person.csv`) |
| `tests/` | pytest suite (820 tests, 5 skipped) |
| `docs/INDEX.md` | Documentation front door — every spec / plan / artifact linked |
| `docs/superpowers/specs/` | Approved design specs (Phase 1, 2, 3d v1.0/v1.1/v1.2, 4, 4 v1.1 retro, 5) |
| `docs/superpowers/plans/` | Implementation plans (one per spec phase) |
| `CHANGELOG.md` | Rolling record of phased deliveries |
| `AGENTS.md` | Context file for AI coding agents |
| `README.md` | Human onboarding |
