import re

import pytest

import prodrec.sp_main as sp
from prodrec.sp_main import (
    BUSINESS_FEATURES_SQL, PERSONAL_FEATURES_SQL, TASK_NAME, assert_inputs, dedupe_anchors, main,
)
from prodrec.vocab import BUSINESS_SUBSET_COLUMNS, PERSONAL_SUBSET_COLUMNS

BIZ_SUBSET = "BUSINESS_PRODUCT_RECOMMENDATION_SUBSET"
PER_SUBSET = "PERSONAL_PRODUCT_RECOMMENDATION_SUBSET"


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def collect(self):
        return self._rows


class FakeSession:
    """Records SQL; serves canned rows keyed by substring; scalar queries default to [[0]]."""

    def __init__(self, features=None, canned=None, fail_on=None):
        self.features = features or {}
        self.canned = canned or {}
        self.fail_on = fail_on
        self.log: list[str] = []
        self.params: list = []
        self.frames: list[tuple[str, object]] = []

    def sql(self, q, params=None):
        q = " ".join(q.split())
        self.log.append(q)
        if params is not None:
            self.params.append(params)
        fails = (self.fail_on,) if isinstance(self.fail_on, str) else (self.fail_on or ())
        for needle in fails:
            if needle in q:
                raise RuntimeError("boom" if needle == fails[0] else f"secondary failure: {needle}")
        for key, rows in self.features.items():
            if q.startswith("WITH") and key in q and "SELECT aud.*" in q:
                return _Result(rows)
        for key, rows in self.canned.items():
            if key in q:
                return _Result(rows)
        return _Result([[0]])

    def write_pandas(self, df, table, **kw):
        self.frames.append((table, df.copy()))
        self.log.append(f"WRITE_PANDAS {table}")
        self.kw = kw


def _features(business_anchors, person_anchors):
    return {"'BUSINESS'": [dict(a) for a in business_anchors], "'PERSON'": [dict(a) for a in person_anchors]}


def _stmts(sess, needle):
    return [i for i, q in enumerate(sess.log) if q.startswith(needle)]


def test_feature_sql_key_substrings():
    for sql in (BUSINESS_FEATURES_SQL, PERSONAL_FEATURES_SQL):
        assert "COUNT(DISTINCT FINANCIAL_ACCOUNT_TYPE)" in sql
        assert "SUM(IFF(PRODUCT_KIND = 'deposit', BALANCE, NULL))" in sql
        assert "QUALIFY" in sql
        assert "&" not in sql
    assert "'001am%'" in BUSINESS_FEATURES_SQL
    assert "DIRECT_DEPOSIT_AMOUNT, NULL" in PERSONAL_FEATURES_SQL
    assert "PROFILE_QUARTER" in PERSONAL_FEATURES_SQL and "PROFILE_MONTH" in PERSONAL_FEATURES_SQL
    # audience text is shared with the live recount
    assert sp._sp_BIZ_AUD in BUSINESS_FEATURES_SQL and sp._sp_PER_AUD in PERSONAL_FEATURES_SQL


def test_dedupe_anchors():
    rows = [
        {"ACCOUNT_ID": "A", "ANNUAL_REVENUE": 5},
        {"ACCOUNT_ID": "A", "ANNUAL_REVENUE": 9},
        {"ACCOUNT_ID": "B", "ANNUAL_REVENUE": 1},
    ]
    out = dedupe_anchors(rows)
    assert [r["ACCOUNT_ID"] for r in out] == ["A", "B"]
    assert out[0]["ANNUAL_REVENUE"] == 5


def test_bad_mode_raises():
    sess = FakeSession()
    with pytest.raises(ValueError):
        main(sess, "NOPE")
    assert sess.log == []


def test_inputs_mode_replaces_both_subsets_in_transaction(business_anchors, person_anchors):
    sess = FakeSession(_features(business_anchors, person_anchors))
    out = main(sess, "INPUTS")
    assert "SUCCEEDED" in out and TASK_NAME in out
    # one transaction spans both tables and the input asserts
    assert _stmts(sess, "BEGIN") == [_stmts(sess, "BEGIN")[0]] and len(_stmts(sess, "COMMIT")) == 1
    begin, commit = _stmts(sess, "BEGIN")[0], _stmts(sess, "COMMIT")[0]
    for subset in (BIZ_SUBSET, PER_SUBSET):
        i = next(i for i, q in enumerate(sess.log) if q.startswith("DELETE FROM") and subset in q)
        assert begin < i < commit
        assert sess.log[i + 1].startswith("INSERT INTO") and subset in sess.log[i + 1]
    asserts = [i for i, q in enumerate(sess.log) if "NOT LIKE '001am%'" in q]
    assert asserts and all(begin < i < commit for i in asserts)
    assert all(i < begin for i in _stmts(sess, "WRITE_PANDAS"))
    # no DDL inside the transaction; staging dropped after it
    assert not any(q.startswith(("DROP", "CREATE")) for q in sess.log[begin:commit])
    drops = _stmts(sess, "DROP TABLE IF EXISTS")
    assert len(drops) == 2 and all(i > commit for i in drops)
    cols = {t: list(df.columns) for t, df in sess.frames}
    assert cols[BIZ_SUBSET + "_STAGING"] == list(BUSINESS_SUBSET_COLUMNS)
    assert cols[PER_SUBSET + "_STAGING"] == list(PERSONAL_SUBSET_COLUMNS)
    assert sess.kw["auto_create_table"] is True and sess.kw["overwrite"] is True
    log_params = sess.params[-1]
    assert log_params[1] == f"{TASK_NAME}[INPUTS]" and log_params[3] == "SUCCEEDED"
    assert log_params[5] == len(business_anchors) + len(person_anchors)
    assert log_params[4] == len(business_anchors) + len(person_anchors)


def test_insert_failure_rolls_back(business_anchors, person_anchors):
    sess = FakeSession(
        _features(business_anchors, person_anchors),
        fail_on=f"INSERT INTO DATA_JEDAIS.FINS__PUBLIC.{BIZ_SUBSET}",
    )
    with pytest.raises(RuntimeError, match="boom"):
        main(sess, "INPUTS")
    assert "ROLLBACK" in sess.log and "COMMIT" not in sess.log
    assert any(q.startswith("DROP TABLE IF EXISTS") for q in sess.log)
    assert sess.params[-1][3] == "FAILED" and "boom" in sess.params[-1][6]


def test_second_table_insert_failure_rolls_back_both(business_anchors, person_anchors):
    sess = FakeSession(
        _features(business_anchors, person_anchors),
        fail_on=f"INSERT INTO DATA_JEDAIS.FINS__PUBLIC.{PER_SUBSET}",
    )
    with pytest.raises(RuntimeError, match="boom"):
        main(sess, "INPUTS")
    assert len(_stmts(sess, "BEGIN")) == 1
    assert "ROLLBACK" in sess.log and "COMMIT" not in sess.log
    # the first table's DELETE/INSERT ran inside the same (rolled back) transaction
    assert _stmts(sess, "BEGIN")[0] < _stmts(sess, f"DELETE FROM DATA_JEDAIS.FINS__PUBLIC.{BIZ_SUBSET}")[0]
    drops = [q for q in sess.log if q.startswith("DROP TABLE IF EXISTS")]
    assert any(BIZ_SUBSET + "_STAGING" in q for q in drops)
    assert any(PER_SUBSET + "_STAGING" in q for q in drops)
    assert sess.params[-1][3] == "FAILED" and sess.params[-1][4] == 0


def test_assert_inputs_failure_rolls_back(business_anchors, person_anchors):
    sess = FakeSession(_features(business_anchors, person_anchors), canned={" JOIN ": [[1]]})
    with pytest.raises(RuntimeError, match="^coverage gap: 1 accounts appear in both"):
        main(sess, "INPUTS")
    assert "ROLLBACK" in sess.log and "COMMIT" not in sess.log
    assert len([q for q in sess.log if q.startswith("DROP TABLE IF EXISTS")]) == 2
    assert sess.params[-1][3] == "FAILED"


def test_drop_failure_does_not_mask_original_error(business_anchors, person_anchors):
    sess = FakeSession(
        _features(business_anchors, person_anchors),
        fail_on=(f"INSERT INTO DATA_JEDAIS.FINS__PUBLIC.{PER_SUBSET}", "DROP TABLE IF EXISTS"),
    )
    with pytest.raises(RuntimeError, match="^boom$"):
        main(sess, "INPUTS")
    # both drops were still attempted even though the first one failed
    assert len([q for q in sess.log if q.startswith("DROP TABLE IF EXISTS")]) == 2
    assert sess.params[-1][3] == "FAILED" and sess.params[-1][6] == "boom"


def test_all_mode_training_gate_blocks_everything(monkeypatch, business_anchors, person_anchors):
    monkeypatch.setattr("prodrec.training.draw_label", lambda scores, rng: "Business_Checking")
    monkeypatch.setattr(sp, "_sp_BIZ_TRAINING_SIZE", 50)
    monkeypatch.setattr(sp, "_sp_PER_TRAINING_SIZE", 50)
    sess = FakeSession(_features(business_anchors, person_anchors))
    with pytest.raises(RuntimeError, match="label mix gate"):
        main(sess, "ALL")
    assert "BEGIN" not in sess.log and sess.frames == []
    assert not any(q.startswith("DELETE") for q in sess.log)
    assert sess.params[-1][1] == f"{TASK_NAME}[ALL]" and sess.params[-1][3] == "FAILED"


def test_all_mode_writes_four_tables_in_one_transaction(monkeypatch, business_anchors, person_anchors):
    monkeypatch.setattr(sp, "_sp_BIZ_TRAINING_SIZE", 30)
    monkeypatch.setattr(sp, "_sp_PER_TRAINING_SIZE", 30)
    monkeypatch.setattr(sp, "mix_problems", lambda labels, **kw: [])
    sess = FakeSession(_features(business_anchors, person_anchors))
    main(sess, "ALL")
    assert len(_stmts(sess, "BEGIN")) == 1 and len(_stmts(sess, "COMMIT")) == 1
    begin, commit = _stmts(sess, "BEGIN")[0], _stmts(sess, "COMMIT")[0]
    staged = _stmts(sess, "WRITE_PANDAS")
    assert len(staged) == 4 and all(i < begin for i in staged)  # staging DDL precedes BEGIN
    assert len(_stmts(sess, "DELETE FROM")) == 4 and all(begin < i < commit for i in _stmts(sess, "DELETE FROM"))
    assert len(_stmts(sess, "DROP TABLE IF EXISTS")) == 4
    assert sess.params[-1][4] == len(business_anchors) + len(person_anchors) + 60


def test_training_gate_blocks_write(monkeypatch, business_anchors, person_anchors):
    monkeypatch.setattr("prodrec.training.draw_label", lambda scores, rng: "Business_Checking")
    monkeypatch.setattr(sp, "_sp_BIZ_TRAINING_SIZE", 50)
    monkeypatch.setattr(sp, "_sp_PER_TRAINING_SIZE", 50)
    sess = FakeSession(_features(business_anchors, person_anchors))
    with pytest.raises(RuntimeError, match=r"label mix gate: business: max share exceeded.*classes: only 1"):
        main(sess, "TRAINING")
    assert not any(q.startswith("DELETE") or q == "BEGIN" for q in sess.log)
    assert sess.frames == []
    assert sess.params[-1][3] == "FAILED"


def test_training_mode_writes_both_tables(monkeypatch, business_anchors, person_anchors):
    monkeypatch.setattr(sp, "_sp_BIZ_TRAINING_SIZE", 30)
    monkeypatch.setattr(sp, "_sp_PER_TRAINING_SIZE", 30)
    monkeypatch.setattr(sp, "mix_problems", lambda labels, **kw: [])
    sess = FakeSession(_features(business_anchors, person_anchors))
    main(sess, "TRAINING")
    deletes = [q for q in sess.log if q.startswith("DELETE FROM")]
    assert deletes == [
        "DELETE FROM DATA_JEDAIS.FINS__PUBLIC.BUSINESS_PRODUCT_RECOMMENDATION_SET",
        "DELETE FROM DATA_JEDAIS.FINS__PUBLIC.PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET",
    ]
    assert sess.params[-1][4] == 60


def test_assert_inputs_overlap_raises():
    sess = FakeSession(canned={" JOIN ": [[1]]})
    with pytest.raises(RuntimeError, match="^coverage gap:"):
        assert_inputs(sess)


def test_assert_inputs_duplicates_and_bad_prefix_raise():
    with pytest.raises(RuntimeError, match="^coverage gap:"):
        assert_inputs(FakeSession(canned={"COUNT(*) - COUNT(DISTINCT": [[2]]}))
    with pytest.raises(RuntimeError, match="^coverage gap:"):
        assert_inputs(FakeSession(canned={"NOT LIKE": [[3]]}))


def test_assert_inputs_more_rows_than_audience_raises():
    sess = FakeSession(canned={"WHERE ACCOUNTID NOT LIKE": [[0]], f"SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.{BIZ_SUBSET}": [[5]]})
    with pytest.raises(RuntimeError, match=r"^coverage gap: business subset has 5 rows, audience has 0"):
        assert_inputs(sess)


def test_assert_inputs_coverage_gap_via_assert_coverage():
    sess = FakeSession(canned={"FROM aud": [[10]]})
    with pytest.raises(RuntimeError, match="^coverage gap: 10 missing"):
        assert_inputs(sess)


def test_idempotent_rerun(business_anchors, person_anchors):
    frames = []
    for _ in range(2):
        sess = FakeSession(_features(business_anchors, person_anchors))
        main(sess, "INPUTS")
        frames.append({t: df for t, df in sess.frames})
    for t in frames[0]:
        assert frames[0][t].equals(frames[1][t])


def test_empty_audience_raises_before_write(business_anchors):
    sess = FakeSession({"'BUSINESS'": [], "'PERSON'": []})
    with pytest.raises(RuntimeError, match="empty audience"):
        main(sess, "INPUTS")
    assert not any(q.startswith("DELETE") or q == "BEGIN" for q in sess.log)
    assert sess.frames == []
    assert sess.params[-1][3] == "FAILED" and "empty audience" in sess.params[-1][6]


def test_factory_failure_is_zero_tolerance(monkeypatch, business_anchors, person_anchors):
    real = sp.business_profile
    bad = business_anchors[2]["ACCOUNT_ID"]

    def flaky(anchor, feats, run_ts, key=None):
        if anchor["ACCOUNT_ID"] == bad:
            raise ValueError("kaput")
        return real(anchor, feats, run_ts, key)

    monkeypatch.setattr(sp, "business_profile", flaky)
    sess = FakeSession(_features(business_anchors, person_anchors))
    with pytest.raises(RuntimeError, match=f"failed on 1 accounts.*{bad}.*kaput"):
        main(sess, "INPUTS")
    assert not any(q.startswith("DELETE") or q == "BEGIN" for q in sess.log)
    assert sess.frames == []
    assert sess.params[-1][3] == "FAILED" and "kaput" in sess.params[-1][6]


def _has_alias(sql, key):
    return re.search(rf"\bAS {key}\b", sql) or re.search(rf"\b\w+\.{key}\b", sql)


def test_factory_feature_keys_are_selected():
    biz = ["DEPOSIT_BALANCE", "PRODUCT_COUNT", "FIRST_OPEN_DATE", "HAS_LOAN", "HAS_LINE", "HAS_CARD",
           "MONTHLY_CREDITS", "MONTHLY_NET", "MONTHLY_NET_SD", "FEED_MONTHS", "FOUNDED_YEAR"]
    per = ["DEPOSIT_BALANCE", "PRODUCT_COUNT", "FIRST_OPEN_DATE", "HAS_LOAN", "HAS_CARD", "HAS_INVESTMENT",
           "DIRECT_DEPOSIT", "MONTHLY_CREDITS", "IS_OWNER", "MORTGAGE_BALANCE", "INVESTMENT_PROPENSITY",
           "LIFE_STAGE"]
    for k in biz:
        assert _has_alias(BUSINESS_FEATURES_SQL, k), k
    for k in per:
        assert _has_alias(PERSONAL_FEATURES_SQL, k), k


def test_feed_window_anchored_to_month_start():
    anchor = "DATE_TRUNC('month', CURRENT_DATE())"
    for sql in (BUSINESS_FEATURES_SQL, PERSONAL_FEATURES_SQL):
        assert "CURRENT_DATE())" not in sql.replace(anchor, "")  # no bare CURRENT_DATE() reference
        assert f"DATEDIFF(day, TRANSACTIONDATE, {anchor})" in sql
        assert f"TRANSACTIONDATE >= DATEADD(day, -90, {anchor})" in sql
        assert f"TRANSACTIONDATE < {anchor}" in sql  # excludes current-month and future-dated rows
