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
        if self.fail_on and self.fail_on in q:
            raise RuntimeError("boom")
        for key, rows in self.features.items():
            if q.startswith("WITH") and key in q and "SELECT aud.*" in q:
                return _Result(rows)
        for key, rows in self.canned.items():
            if key in q:
                return _Result(rows)
        return _Result([[0]])

    def write_pandas(self, df, table, **kw):
        self.frames.append((table, df.copy()))
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
    for subset in (BIZ_SUBSET, PER_SUBSET):
        seq = [
            q for q in sess.log
            if q in ("BEGIN", "COMMIT") or (subset in q and q.startswith(("DELETE", "INSERT")))
        ]
        # filter to this side's statements plus the transaction markers around them
        i = next(i for i, q in enumerate(sess.log) if q.startswith("DELETE FROM") and subset in q)
        assert sess.log[i - 1] == "BEGIN"
        assert sess.log[i + 1].startswith("INSERT INTO") and subset in sess.log[i + 1]
        assert sess.log[i + 2] == "COMMIT"
        assert seq
    cols = {t: list(df.columns) for t, df in sess.frames}
    assert cols[BIZ_SUBSET + "_STAGING"] == list(BUSINESS_SUBSET_COLUMNS)
    assert cols[PER_SUBSET + "_STAGING"] == list(PERSONAL_SUBSET_COLUMNS)
    assert sess.kw["auto_create_table"] is True and sess.kw["overwrite"] is True
    assert sum(q.startswith("DROP TABLE IF EXISTS") for q in sess.log) == 2
    log_params = sess.params[-1]
    assert log_params[1] == TASK_NAME and log_params[3] == "SUCCEEDED"
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


def test_training_gate_blocks_write(monkeypatch, business_anchors, person_anchors):
    monkeypatch.setattr("prodrec.training.draw_label", lambda scores, rng: "Business_Checking")
    monkeypatch.setattr(sp, "_sp_BIZ_TRAINING_SIZE", 50)
    monkeypatch.setattr(sp, "_sp_PER_TRAINING_SIZE", 50)
    sess = FakeSession(_features(business_anchors, person_anchors))
    with pytest.raises(RuntimeError, match="label mix gate"):
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
    sess = FakeSession(canned={"SELECT COUNT(*) FROM aud": [[0]], f"SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.{BIZ_SUBSET}": [[5]]})
    with pytest.raises(RuntimeError, match="^coverage gap:"):
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
