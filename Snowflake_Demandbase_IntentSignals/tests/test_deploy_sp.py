"""L1 tests for scripts/deploy_sp.py and the hand-run SQL artifacts.

The generated CREATE PROCEDURE must be self-contained (no cumulus_common
imports, helpers inlined), carry the BACKFILL_WEEKS signature, contain no
ampersand (snow sql template trap), and its Python body must execute and
produce the same rows as the module."""
import importlib.util
import re
from datetime import datetime
from pathlib import Path

import pytest

import sp_generate_demandbase_intent_signals as mod

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("deploy_sp", ROOT / "scripts" / "deploy_sp.py")
deploy_sp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(deploy_sp)


@pytest.fixture(scope="module")
def sql():
    return deploy_sp.build_sql()


def _body(sql_text: str) -> str:
    return re.search(r"\$\$\n(.*)\$\$;\n$", sql_text, flags=re.S).group(1)


def test_signature_and_handler(sql):
    assert ("CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC."
            "SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(BACKFILL_WEEKS INTEGER DEFAULT 0)") in sql
    assert "HANDLER = 'main'" in sql and "RUNTIME_VERSION = '3.11'" in sql
    assert not re.search(r"^IMPORTS\s*=", sql.split("$$")[0], flags=re.M)
    assert not sql.startswith("DROP")


def test_drop_old_signature_flag():
    s = deploy_sp.build_sql(drop_old_signature=True)
    assert s.startswith("DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC."
                        "SP_GENERATE_DEMANDBASE_INTENT_SIGNALS();")


def test_body_is_self_contained(sql):
    body = _body(sql)
    assert not re.search(r"^\s*(from|import) cumulus_common", body, flags=re.M)
    for fn in ("seed_for", "assert_coverage", "record_id_for"):
        assert re.search(rf"^def {fn}\(", body, flags=re.M), fn
    assert body.count("$$") == 0


def test_no_ampersand_in_generated_or_hand_run_sql(sql):
    assert "&" not in sql
    files = [*ROOT.glob("tasks/*.sql"), *ROOT.glob("tests/integration/*.sql"),
             ROOT / "procedures" / "sp_create_procedure.sql"]
    assert len(files) >= 3
    for f in files:
        assert "&" not in f.read_text(), f


def test_committed_sql_matches_generator(sql):
    """procedures/sp_create_procedure.sql must be regenerated after SP edits."""
    assert (ROOT / "procedures" / "sp_create_procedure.sql").read_text() == sql


def test_inlined_body_executes_and_matches_module(sql, in_audience_anchors):
    ns: dict = {"__name__": "sp_body"}
    exec(compile(_body(sql), "sp_body", "exec"), ns)
    wk = datetime(2026, 11, 2)
    for a in in_audience_anchors:
        assert ns["_rows_for"](a, wk, "Competitor") == mod._rows_for(a, wk, "Competitor")
    assert ns["record_id_for"]("JDO", "x", "2026-11-02", "t") == mod.record_id_for("JDO", "x", "2026-11-02", "t")


def test_task_sql_schedule_and_wrapper():
    raw = (ROOT / "tasks" / "task_weekly_demandbase_intent_signals.sql").read_text()
    t = " ".join(ln for ln in raw.splitlines() if not ln.lstrip().startswith("--"))
    t = re.sub(r"\(\s+", "(", re.sub(r"\s+\)", ")", re.sub(r"\s+", " ", t)))
    assert "WAREHOUSE = MAIN_WH_XS" in t
    assert "SCHEDULE = 'USING CRON 15 3 * * 1 America/New_York'" in t
    assert ("SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC."
            "SP_GENERATE_DEMANDBASE_INTENT_SIGNALS()', 2)") in t
    assert "ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS RESUME" in t
