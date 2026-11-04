"""L1 tests for scripts/deploy_sp.py (Task 5) and the TASK SQL."""
from __future__ import annotations

import ast
import importlib.util
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location("deploy_sp", ROOT / "scripts" / "deploy_sp.py")
deploy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(deploy)


def test_signature_takes_backfill_months_default_0():
    sql = deploy.build_sql()
    assert ("CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC."
            "SP_GENERATE_HARMONIC_COMPANY_SIGNALS(BACKFILL_MONTHS INTEGER DEFAULT 0)") in sql
    assert "HANDLER = 'main'" in sql and "RUNTIME_VERSION = '3.11'" in sql


def test_header_documents_both_salts():
    sql = deploy.build_sql()
    assert '"harmonic"' in sql and '"harmonic_funding"' in sql
    assert deploy.DATASET_SALT == "harmonic" and deploy.FUNDING_SALT == "harmonic_funding"


def test_body_inlines_helpers_and_drops_cumulus_common_imports():
    body = deploy.build_body()
    for fn in ("seed_for", "assert_coverage", "record_id_for", "main"):
        assert re.search(rf"^def {fn}\(", body, re.MULTILINE), fn
    assert "cumulus_common import" not in body
    assert "import hashlib" in body
    ast.parse(body)


def test_body_salts_match_module():
    body = deploy.build_body()
    assert re.search(r'^DATASET_SALT\s*=\s*"harmonic"', body, re.MULTILINE)
    assert re.search(r'^FUNDING_SALT\s*=\s*"harmonic_funding"', body, re.MULTILINE)


def test_generated_sql_has_no_ampersand_and_one_dollar_body():
    sql = deploy.build_sql()
    assert "&" not in sql
    assert sql.count("$$") == 2


def test_snow_invocation_is_unflagged():
    src = (ROOT / "scripts" / "deploy_sp.py").read_text()
    assert deploy.SNOW_BIN == "/opt/homebrew/bin/snow"
    assert '"-c"' not in src and "'-c'" not in src


def test_task_sql_schedule_warehouse_wrapper():
    sql = (ROOT / "tasks" / "task_monthly_harmonic_company_signals.sql").read_text()
    body = "\n".join(l for l in sql.splitlines() if not l.lstrip().startswith("--"))
    q = " ".join(body.split())
    assert "CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS" in q
    assert "WAREHOUSE = MAIN_WH_XS" in q
    assert "SCHEDULE = 'USING CRON 0 5 1 * * America/New_York'" in q
    assert ("CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER( "
            "'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS()', 2 );") in q
    assert "ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS RESUME;" in q
    assert "&" not in sql
