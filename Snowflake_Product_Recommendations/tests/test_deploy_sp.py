import importlib.util
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("deploy_sp", ROOT / "scripts" / "deploy_sp.py")
deploy_sp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(deploy_sp)

from prodrec.business import business_profile  # noqa: E402

TASK_SQL = ROOT / "tasks" / "task_monthly_product_recommendation_inputs.sql"


def _body(sql: str) -> str:
    return sql.split("$$")[1]


def test_build_sql_compiles_and_runs():
    body = _body(deploy_sp.build_sql())
    code = compile(body, "<sp_body>", "exec")
    ns: dict = {"__name__": "sp_body"}
    exec(code, ns)
    assert callable(ns["main"])
    anchor = {"ACCOUNT_ID": "001am00000TEST1", "INDUSTRY": "Restaurant",
              "ANNUAL_REVENUE": 2_000_000, "EMPLOYEE_COUNT": 20}
    t0 = datetime(2026, 10, 23)
    assert ns["business_profile"](anchor, {}, t0) == business_profile(anchor, {}, t0)


def test_header_and_single_literal():
    sql = deploy_sp.build_sql()
    assert "CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS(MODE STRING DEFAULT 'INPUTS')" in sql
    assert "HANDLER = 'main'" in sql and "EXECUTE AS CALLER" in sql
    assert sql.count("$$") == 2
    assert _body(sql).lstrip().startswith("from __future__ import annotations")


def test_no_unescaped_ampersand():
    for text in (deploy_sp.build_sql(), TASK_SQL.read_text()):
        assert not re.search(r"(?<! )&|&(?! )", text)


def test_no_intra_package_imports_left():
    body = _body(deploy_sp.build_sql())
    assert "prodrec" not in body.replace("# ---- prodrec.", "")
    assert "cumulus_common" not in body.replace("# Inlined from cumulus_common", "")
    assert "from __future__" in body and body.count("from __future__") == 1


def test_committed_sql_is_current():
    assert (ROOT / "procedures" / "sp_create_procedure.sql").read_text() == deploy_sp.build_sql()


def test_task_sql_suspended_and_wrapped():
    sql = TASK_SQL.read_text()
    code = "\n".join(l for l in sql.splitlines() if not l.strip().startswith("--"))
    assert "RESUME" not in code.upper()
    assert "CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS" in code
    assert "WAREHOUSE = MAIN_WH_XS" in code
    assert "'USING CRON 0 4 2 * * America/New_York'" in code
    assert "SP_RETRY_WRAPPER(\n        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS(''INPUTS'')',\n        2" in code
    assert "Task 10" in sql


def test_collision_checker_rejects_duplicates():
    import pytest
    with pytest.raises(ValueError, match="X"):
        deploy_sp.check_name_collisions({"a": "X = 1\n", "b": "X = 2\n"})
    with pytest.raises(ValueError, match="f"):
        deploy_sp.check_name_collisions({"a": "def f(): pass\n", "b": "f = 1\n"})
    deploy_sp.check_name_collisions({"a": "X = 1\n", "b": "Y = 2\n"})


def test_real_modules_have_no_collisions():
    deploy_sp.build_sql()  # raises ValueError on any cross-module duplicate
