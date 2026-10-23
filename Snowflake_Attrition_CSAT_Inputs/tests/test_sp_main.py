import pytest

import attrcsat.sp_main as sp
from attrcsat.sp_main import (
    FEATURES_SQL, TASK_NAME, assert_inputs, dedupe_anchors, gate_problems, main,
)
from attrcsat.vocab import ATTRITION_COLUMNS, CSAT_COLUMNS, ENROLLMENT_COLUMNS

P = "DATA_JEDAIS.FINS__PUBLIC."
ATT, CSAT, ENR = "ATTRITION_INPUTS", "CSAT_ATTRITION_INPUTS", "ENROLLMENTS"
TABLES = {ATT: ATTRITION_COLUMNS, CSAT: CSAT_COLUMNS, ENR: ENROLLMENT_COLUMNS}
FEATURE_KEYS = (
    "ACCOUNT_ID", "ACCOUNT_TYPE_FLAG", "CLIENT_CATEGORY", "BIRTHDATE", "ANNUAL_INCOME", "ANNUAL_REVENUE",
    "CREDIT_SCORE", "NPS_SCORE", "NPS_DESCRIPTION", "DETRACTOR_12M", "N_PRODUCTS", "N_DEPOSIT", "N_LOAN",
    "N_INVESTMENT", "N_LINE", "DD_AMOUNT", "BONUS_AMOUNT", "FIRST_OPEN_DATE", "TOTAL_BALANCE", "AVG_BALANCE",
    "EARLY_AVG_BALANCE", "LATE_AVG_BALANCE", "CREDITS", "DEBITS", "ADB_TXN", "ADB_DAYS", "FT_TXN", "CALLS",
    "GONG_WEEKS", "LAST_CALL_DATE", "NEG_WEEKS", "VNEG_WEEKS", "RISK_RATING", "SANCTIONS_HIT", "PEP_HIT",
    "ADVERSE_MEDIA_HIT",
)


DIRECT_COLUMNS = ("ACCOUNT_ID", "ACCOUNT_TYPE_FLAG", "CLIENT_CATEGORY", "BIRTHDATE", "ANNUAL_INCOME",
                  "ANNUAL_REVENUE", "CREDIT_SCORE", "NPS_SCORE", "NPS_DESCRIPTION", "SANCTIONS_HIT", "PEP_HIT",
                  "ADVERSE_MEDIA_HIT")


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def collect(self):
        return self._rows


class FakeSession:
    def __init__(self, features=None, canned=None, fail_on=None):
        self.features = features
        self.canned = canned or {}
        self.fail_on = fail_on
        self.log: list[str] = []
        self.params: list = []
        self.frames: list = []

    def sql(self, q, params=None):
        q = " ".join(q.split())
        self.log.append(q)
        if params is not None:
            self.params.append(params)
        if self.fail_on and self.fail_on in q:
            raise RuntimeError("boom")
        if q.startswith("WITH aud AS") and "SELECT aud.*" in q and self.features is not None:
            return _Result(self.features)
        for key, rows in self.canned.items():
            if key in q:
                return _Result(rows)
        return _Result([[0]])

    def write_pandas(self, df, table, **kw):
        self.frames.append((table, df.copy()))
        self.log.append(f"WRITE_PANDAS {table}")
        self.kw = kw


def _stmts(sess, needle):
    return [i for i, q in enumerate(sess.log) if q.startswith(needle)]


def test_features_sql_shape():
    assert "LIKE '001am%'" in FEATURES_SQL
    assert "DATE_TRUNC('month', CURRENT_DATE())" in FEATURES_SQL
    assert "QUALIFY ROW_NUMBER()" in FEATURES_SQL
    for k in FEATURE_KEYS:
        if k in DIRECT_COLUMNS:  # selected by name from the feed or anchor, not aliased
            assert f" {k}," in FEATURES_SQL or f" {k}\n" in FEATURES_SQL, k
        else:
            assert f"AS {k}" in FEATURES_SQL, k
    for t in ("CSAT_NPS_DATA", "FINANCIAL_TRANSACTION_ACCOUNTS", "ACCOUNT_DAILY_BALANCE",
              "FINANCIAL_TRANSACTIONS", "GONG_CALL_SENTIMENT", "WORLD_CHECK_AML"):
        assert t in FEATURES_SQL
    assert "Household" not in FEATURES_SQL
    assert sp._sp_AUD in FEATURES_SQL
    assert "$$" not in FEATURES_SQL and "&" not in FEATURES_SQL


def test_features_sql_covers_profile_keys(feature_rows):
    # every key build_profile can read is selected by the SQL
    assert set(feature_rows[0]) <= set(FEATURE_KEYS)


def test_dedupe_anchors():
    out = dedupe_anchors([{"ACCOUNT_ID": "A", "x": 1}, {"ACCOUNT_ID": "A", "x": 2}, {"ACCOUNT_ID": "B"}])
    assert [r["ACCOUNT_ID"] for r in out] == ["A", "B"] and out[0]["x"] == 1


def test_main_writes_three_tables_in_one_transaction(feature_rows):
    sess = FakeSession(feature_rows)
    out = main(sess, "INPUTS")
    assert "SUCCEEDED" in out and TASK_NAME in out
    begin, commit = _stmts(sess, "BEGIN"), _stmts(sess, "COMMIT")
    assert len(begin) == 1 and len(commit) == 1
    begin, commit = begin[0], commit[0]
    order = []
    for t in (ATT, CSAT, ENR):
        i = next(i for i, q in enumerate(sess.log) if q == f"DELETE FROM {P}{t}")
        assert begin < i < commit
        assert sess.log[i + 1].startswith(f"INSERT INTO {P}{t} ")
        order.append(i)
    assert order == sorted(order)
    assert all(i < begin for i in _stmts(sess, "WRITE_PANDAS"))
    asserts = [i for i, q in enumerate(sess.log) if "NOT LIKE '001am%'" in q]
    assert asserts and all(begin < i < commit for i in asserts)
    assert not any(q.startswith(("DROP", "CREATE")) for q in sess.log[begin:commit])
    drops = _stmts(sess, "DROP TABLE IF EXISTS")
    assert len(drops) == 3 and all(i > commit for i in drops)
    cols = {t: list(df.columns) for t, df in sess.frames}
    for t, c in TABLES.items():
        assert cols[f"{P}{t}_STAGING".split(".")[-1]] == list(c)
    enr_insert = next(q for q in sess.log if q.startswith(f"INSERT INTO {P}{ENR} "))
    assert "TO_TIMESTAMP_NTZ(SNAPSHOT_DATE)" in enr_insert
    logs = [q for q in sess.log if "TASK_EXECUTION_LOG" in q]
    assert len(logs) == 1 and "NULLIF(?, '')" in logs[0]
    prm = sess.params[-1]
    assert prm[1] == "TASK_MONTHLY_ATTRITION_CSAT_INPUTS[INPUTS]" and prm[3] == "SUCCEEDED"
    assert prm[4] == 3 * len(feature_rows) and prm[5] == len(feature_rows) and prm[6] == ""


def test_main_gate_failure_no_dml(monkeypatch, feature_rows):
    monkeypatch.setattr(sp, "cross_table_problems", lambda a, c, e: ["x"])
    sess = FakeSession(feature_rows)
    with pytest.raises(RuntimeError, match="gate"):
        main(sess, "INPUTS")
    assert not any(q in ("BEGIN", "COMMIT", "ROLLBACK") or q.startswith(("DELETE", "INSERT INTO DATA_JEDAIS.FINS__PUBLIC.ATTRITION_INPUTS", "INSERT INTO DATA_JEDAIS.FINS__PUBLIC.CSAT", "INSERT INTO DATA_JEDAIS.FINS__PUBLIC.ENROLL")) for q in sess.log)
    assert sess.frames == []
    assert sess.params[-1][3] == "FAILED"


def test_main_rejects_other_modes(feature_rows):
    sess = FakeSession(feature_rows)
    for m in ("TRAINING", "ALL", "NOPE"):
        with pytest.raises(ValueError):
            main(sess, m)
    assert sess.log == []


def test_main_empty_audience_fails():
    sess = FakeSession([])
    with pytest.raises(RuntimeError, match="empty audience"):
        main(sess, "INPUTS")
    assert not any(q == "BEGIN" or q.startswith("DELETE") for q in sess.log)
    assert sess.params[-1][3] == "FAILED"


def test_insert_failure_rolls_back(feature_rows):
    sess = FakeSession(feature_rows, fail_on=f"INSERT INTO {P}{CSAT} ")
    with pytest.raises(RuntimeError, match="boom"):
        main(sess, "INPUTS")
    assert "ROLLBACK" in sess.log and "COMMIT" not in sess.log
    assert len(_stmts(sess, "DROP TABLE IF EXISTS")) == 3
    assert sess.params[-1][3] == "FAILED"


def test_assert_inputs_checks():
    sess = FakeSession()
    assert_inputs(sess)
    sqls = "\n".join(sess.log)
    for t, cols in TABLES.items():
        assert f"{P}{t}" in sqls
        for c in cols:
            assert f"{c} IS NULL" in sqls, (t, c)
    assert sqls.count("NOT LIKE '001am%'") == 3
    assert sqls.count("COUNT(*) - COUNT(DISTINCT") == 3
    assert "FROM aud" in sqls


def test_assert_inputs_failures():
    with pytest.raises(RuntimeError, match="^coverage gap:"):
        assert_inputs(FakeSession(canned={"COUNT(*) - COUNT(DISTINCT": [[2]]}))
    with pytest.raises(RuntimeError, match="^coverage gap:"):
        assert_inputs(FakeSession(canned={"NOT LIKE": [[3]]}))
    with pytest.raises(RuntimeError, match="NULL"):
        assert_inputs(FakeSession(canned={" IS NULL": [[4]]}))
    with pytest.raises(RuntimeError, match="^coverage gap: 10 missing"):
        assert_inputs(FakeSession(canned={"FROM aud": [[10]]}))


def _built(feature_rows):
    return sp._sp_build_all(feature_rows, __import__("datetime").datetime(2026, 10, 23))


def test_gate_clean(feature_rows):
    prof, att, csat, enr = _built(feature_rows)
    assert gate_problems(prof, att, csat, enr) == []


@pytest.mark.parametrize("table,col,value,frag", [
    ("att", "NPS_SCORE_C", None, "NULL"),
    ("att", "NPS_SCORE_C", "Hostile", "outside vocabulary"),
    ("csat", "AGE", 5, "outside"),
    ("enr", "KYC_STATUS", "Bogus", "outside vocabulary"),
])
def test_gate_negative_values(feature_rows, table, col, value, frag):
    prof, att, csat, enr = _built(feature_rows)
    {"att": att, "csat": csat, "enr": enr}[table][0][col] = value
    assert any(frag in p for p in gate_problems(prof, att, csat, enr))


def test_gate_non_001am_key(feature_rows):
    prof, att, csat, enr = _built(feature_rows)
    att[0]["UNIQUEID"] = csat[0]["ACCOUNTID"] = enr[0]["ACCOUNTID"] = "001xx0000BAD"
    assert any("001am" in p for p in gate_problems(prof, att, csat, enr))


def test_gate_duplicate_key(feature_rows):
    prof, att, csat, enr = _built(feature_rows)
    att[1], csat[1], enr[1] = att[0], csat[0], enr[0]
    assert any("duplicate" in p for p in gate_problems(prof, att, csat, enr))
