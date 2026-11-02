"""L1 tests for the BoardEx Exec Intel row factory — Plan 10 REBROADCAST.

Plan 10 was originally Commercial Banking only (~960 anchors → 960 rows =
97% empty profiles). The rebroadcast widens the audience to ALL ACCOUNTS
(36,813 anchors) × 24-month history → ~884K rows. Audience predicate
collapses to "ACCOUNT_ID non-empty" — no CLIENT_CATEGORY filter.

Contract with sibling SP (T4):
  _rows_for(anchor, profile_month) -> list[dict] of length 1
      `profile_month` is an external `date` (or `datetime`) input. Cycle is
      driven by the external month, NOT by run_ts. Same shape as Plan 8.
  _anchor_in_audience(anchor) -> bool
      True iff `ACCOUNT_ID` is a non-empty string.
  EXPECTED_OUTPUT_COLUMNS: frozenset[str]  — the unchanged 15 column names.

PERSON-anchor fallback contract (load-bearing for tests):
  PERSON anchors get a "personal household" governance shape — DDL has 14
  NOT NULL columns so a "minimal" NULL-row is impossible. Defaults assumed:
    BOARD_SIZE                    = 1   (self only)
    BOARD_INDEPENDENCE_PCT        = 100.0
    WOMEN_BOARD_PCT               = 100.0
    MINORITY_BOARD_PCT            = 100.0
    BOARD_AVG_TENURE_YEARS        = neutral default (>= 1.0)
    CEO_TENURE_YEARS              = neutral default (>= 0.0)
    EXEC_TURNOVER_FLAG            = False
    GOVERNANCE_RATING             = 'Adequate'
    INTERLOCK_COUNT               = 0
    KEY_DIRECTOR_NAME             = 'Self'
    RECENT_GOVERNANCE_EVENT_DATE  = None
    LAST_DATA_REFRESH_DATE        = month_start (a coarse but valid date)

Six property classes plus bonus tests:
  1. Same-month determinism — _rows_for(anchor, month) byte-identical across calls.
  2. Audience scoping (degenerate; all-accounts) — empty/missing audience set.
  3. Boring case — every fixture anchor produces 15-key dict.
  4. Per-anchor invariants over 24-month roll:
       4a BUSINESS anchors (EMPLOYEE_COUNT > 100) — full governance bands.
       4b PERSON anchors — personal-household defaults.
       4c Date-coherence — refresh / event dates <= month_start.
       4d INTERLOCK_COUNT in [0, 5].
       4e GOVERNANCE_RATING canonical 5-set.
  5. 24-month history determinism — load-bearing for backfill SP.
  6. Schema contract — 15 keys.

Bonus:
  - Year-over-year governance drift — over a 24-month roll for at least one
    anchor, at least one governance attribute must change at least once
    (the row factory must not return the same dict for all 24 months).
"""
from datetime import date, datetime, timedelta

import pytest

from sp_generate_boardex_exec_intel import (
    _rows_for,
    _anchor_in_audience,
    EXPECTED_OUTPUT_COLUMNS,
)


_VALID_GOVERNANCE_RATINGS = {
    "Excellent",
    "Strong",
    "Adequate",
    "Weak",
    "Concerning",
}


def _month_start(d) -> date:
    """Return first-of-month as `date`. Accepts `date` or `datetime`."""
    if isinstance(d, datetime):
        d = d.date()
    return d.replace(day=1)


def _roll_24_months(start: date):
    """Generate 24 consecutive month_start dates, starting at `start.replace(day=1)`."""
    cur = start.replace(day=1)
    for _ in range(24):
        yield cur
        # Advance by one calendar month.
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)


# ---------- Property 1: Same-month determinism ----------

def test_determinism_same_inputs_same_list(in_audience_anchors):
    """Two back-to-back calls with the same (anchor, profile_month) produce
    byte-identical list[dict]."""
    pm = date(2026, 5, 1)
    for anchor in in_audience_anchors[:10]:
        a = _rows_for(anchor, pm)
        b = _rows_for(anchor, pm)
        assert a == b, f"non-deterministic for {anchor['ACCOUNT_ID']}"
        assert len(a) == 1, (
            f"{anchor['ACCOUNT_ID']}: expected list-of-1, got len={len(a)}"
        )


def test_determinism_across_anchor_population(in_audience_anchors):
    """The full SAMPLE_ANCHORS slice is byte-identical on re-run for a fixed
    profile_month — sanity check that no global RNG state leaks across anchors."""
    pm = date(2026, 5, 1)
    first = [_rows_for(a, pm) for a in in_audience_anchors]
    second = [_rows_for(a, pm) for a in in_audience_anchors]
    assert first == second, "global RNG state leaked across anchors on re-run"


# ---------- Property 2: Audience scoping (degenerate; all-accounts) ----------

def test_audience_violators_dont_exist(out_of_audience_anchors):
    """Plan 10 rebroadcast is all-accounts. There is no real-anchor
    out-of-audience class — `out_of_audience_anchors` is empty by design."""
    if not out_of_audience_anchors:
        pytest.skip(
            "Plan 10 rebroadcast: all-accounts audience — no out-of-audience "
            "anchors exist (only synthetic empty-ACCOUNT_ID anchors, "
            "covered by test_empty_account_id_raises)"
        )
    # Defense-in-depth — if a future change ever populates this fixture,
    # surface failures rather than silently passing.
    pm = date(2026, 5, 1)
    for bad in out_of_audience_anchors:
        with pytest.raises((ValueError, AssertionError, KeyError)):
            _rows_for(bad, pm)


def test_every_anchor_emits_a_row(in_audience_anchors):
    """Every in-audience anchor produces exactly one row whose ACCOUNT_ID
    matches the anchor."""
    pm = date(2026, 5, 1)
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, pm)
        assert isinstance(rows, list), (
            f"{anchor['ACCOUNT_ID']}: _rows_for did not return a list"
        )
        assert len(rows) == 1, (
            f"{anchor['ACCOUNT_ID']}: expected list-of-1, got len={len(rows)}"
        )
        assert rows[0]["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]


def test_anchor_in_audience_predicate(in_audience_anchors):
    """`_anchor_in_audience` returns True for any non-empty ACCOUNT_ID,
    False for empty / missing ACCOUNT_ID."""
    for good in in_audience_anchors:
        assert _anchor_in_audience(good) is True, good["ACCOUNT_ID"]
    for bad in (
        {"ACCOUNT_ID": ""},
        {"ACCOUNT_ID": None},
        {},
    ):
        assert _anchor_in_audience(bad) is False, bad


def test_empty_account_id_raises():
    """Defense-in-depth: an anchor with empty ACCOUNT_ID must raise."""
    pm = date(2026, 5, 1)
    for bad in (
        {"ACCOUNT_ID": "", "ACCOUNT_TYPE_FLAG": "BUSINESS"},
        {"ACCOUNT_ID": None, "ACCOUNT_TYPE_FLAG": "PERSON"},
        {},
    ):
        with pytest.raises((ValueError, AssertionError, KeyError)):
            _rows_for(bad, pm)


# ---------- Property 3: Boring case ----------

def test_boring_case_every_anchor_full_row(in_audience_anchors):
    """Every fixture anchor produces a list-of-1 whose dict has 15 keys.
    All 14 NOT NULL columns are populated; only RECENT_GOVERNANCE_EVENT_DATE
    is allowed to be None."""
    pm = date(2026, 5, 1)
    required_non_null = {
        "ACCOUNT_ID",
        "PROFILE_MONTH",
        "BOARD_SIZE",
        "BOARD_INDEPENDENCE_PCT",
        "WOMEN_BOARD_PCT",
        "MINORITY_BOARD_PCT",
        "BOARD_AVG_TENURE_YEARS",
        "CEO_TENURE_YEARS",
        "EXEC_TURNOVER_FLAG",
        "GOVERNANCE_RATING",
        "INTERLOCK_COUNT",
        "KEY_DIRECTOR_NAME",
        "LAST_DATA_REFRESH_DATE",
        "GENERATED_AT",
    }
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, pm)
        assert len(rows) == 1
        row = rows[0]
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
        for f in required_non_null:
            assert row[f] is not None, (
                f"{anchor['ACCOUNT_ID']}: required field {f} is None"
            )


# ---------- Property 4a: BUSINESS anchors — full governance bands ----------

def test_4a_business_anchor_full_governance(business_anchors):
    """For BUSINESS anchors with EMPLOYEE_COUNT > 100, over a 24-month roll:
      - BOARD_SIZE in [5, 15]
      - BOARD_INDEPENDENCE_PCT, WOMEN_BOARD_PCT, MINORITY_BOARD_PCT in [0, 100]
      - GOVERNANCE_RATING in canonical 5-set
      - EXEC_TURNOVER_FLAG is Python `bool`
    """
    if not business_anchors:
        pytest.skip("no BUSINESS anchors with EMPLOYEE_COUNT > 100 in fixture")
    pct_fields = ("BOARD_INDEPENDENCE_PCT", "WOMEN_BOARD_PCT", "MINORITY_BOARD_PCT")
    for anchor in business_anchors[:5]:
        for pm in _roll_24_months(date(2024, 6, 1)):
            row = _rows_for(anchor, pm)[0]
            board_size = row["BOARD_SIZE"]
            assert 5 <= board_size <= 15, (
                f"{anchor['ACCOUNT_ID']} on {pm}: BOARD_SIZE={board_size} "
                f"outside [5, 15]"
            )
            for f in pct_fields:
                v = row[f]
                assert 0.0 <= v <= 100.0, (
                    f"{anchor['ACCOUNT_ID']} on {pm}: {f}={v} outside [0, 100]"
                )
            rating = row["GOVERNANCE_RATING"]
            assert rating in _VALID_GOVERNANCE_RATINGS, (
                f"{anchor['ACCOUNT_ID']} on {pm}: GOVERNANCE_RATING="
                f"{rating!r} not in {sorted(_VALID_GOVERNANCE_RATINGS)}"
            )
            flag = row["EXEC_TURNOVER_FLAG"]
            assert isinstance(flag, bool), (
                f"{anchor['ACCOUNT_ID']} on {pm}: EXEC_TURNOVER_FLAG is "
                f"{type(flag).__name__}, expected bool"
            )


# ---------- Property 4b: PERSON anchors — personal-household defaults ----------

def test_4b_person_anchor_personal_governance_defaults(person_anchors):
    """For PERSON anchors over a 24-month roll, the SP must emit personal-
    household defaults. PERSON anchors have null EMPLOYEE_COUNT and don't
    fit the BoardEx governance shape — the SP collapses to a "self only"
    fallback. See module docstring for the full PERSON contract."""
    if not person_anchors:
        pytest.skip("no PERSON anchors in fixture")
    for anchor in person_anchors[:5]:
        for pm in _roll_24_months(date(2024, 6, 1)):
            row = _rows_for(anchor, pm)[0]
            assert row["BOARD_SIZE"] == 1, (
                f"{anchor['ACCOUNT_ID']} on {pm}: PERSON BOARD_SIZE="
                f"{row['BOARD_SIZE']}, expected 1 (self only)"
            )
            assert row["KEY_DIRECTOR_NAME"] == "Self", (
                f"{anchor['ACCOUNT_ID']} on {pm}: PERSON KEY_DIRECTOR_NAME="
                f"{row['KEY_DIRECTOR_NAME']!r}, expected 'Self'"
            )
            assert row["BOARD_INDEPENDENCE_PCT"] == 100.0, (
                f"{anchor['ACCOUNT_ID']} on {pm}: PERSON "
                f"BOARD_INDEPENDENCE_PCT={row['BOARD_INDEPENDENCE_PCT']}, "
                f"expected 100.0"
            )
            # SP uses deterministic Bernoulli per ACCOUNT_ID for both diversity
            # percentages — values are 0.0 OR 100.0, year-stable per anchor.
            assert row["WOMEN_BOARD_PCT"] in (0.0, 100.0), (
                f"{anchor['ACCOUNT_ID']} on {pm}: PERSON "
                f"WOMEN_BOARD_PCT={row['WOMEN_BOARD_PCT']}, expected 0.0 or 100.0"
            )
            assert row["MINORITY_BOARD_PCT"] in (0.0, 100.0), (
                f"{anchor['ACCOUNT_ID']} on {pm}: PERSON "
                f"MINORITY_BOARD_PCT={row['MINORITY_BOARD_PCT']}, expected 0.0 or 100.0"
            )
            assert row["GOVERNANCE_RATING"] == "Adequate", (
                f"{anchor['ACCOUNT_ID']} on {pm}: PERSON GOVERNANCE_RATING="
                f"{row['GOVERNANCE_RATING']!r}, expected 'Adequate'"
            )
            assert row["EXEC_TURNOVER_FLAG"] is False, (
                f"{anchor['ACCOUNT_ID']} on {pm}: PERSON EXEC_TURNOVER_FLAG="
                f"{row['EXEC_TURNOVER_FLAG']!r}, expected False"
            )
            assert row["INTERLOCK_COUNT"] == 0, (
                f"{anchor['ACCOUNT_ID']} on {pm}: PERSON INTERLOCK_COUNT="
                f"{row['INTERLOCK_COUNT']}, expected 0"
            )
            assert row["RECENT_GOVERNANCE_EVENT_DATE"] is None, (
                f"{anchor['ACCOUNT_ID']} on {pm}: PERSON "
                f"RECENT_GOVERNANCE_EVENT_DATE="
                f"{row['RECENT_GOVERNANCE_EVENT_DATE']!r}, expected None"
            )


# ---------- Property 4c: Date-coherence ----------

def test_4c_date_coherence(in_audience_anchors):
    """For every (anchor, month) row over a 24-month roll on a sample slice:
      - LAST_DATA_REFRESH_DATE <= month_start  (always; NOT NULL)
      - RECENT_GOVERNANCE_EVENT_DATE <= month_start  (when populated)
    No future-dated vendor refresh; no future-dated governance events."""
    sample = in_audience_anchors[:10]
    for anchor in sample:
        for pm in _roll_24_months(date(2024, 6, 1)):
            row = _rows_for(anchor, pm)[0]
            last_refresh = row["LAST_DATA_REFRESH_DATE"]
            assert last_refresh is not None, (
                f"{anchor['ACCOUNT_ID']} on {pm}: LAST_DATA_REFRESH_DATE is None"
            )
            assert last_refresh <= pm, (
                f"{anchor['ACCOUNT_ID']} on {pm}: future-dated "
                f"LAST_DATA_REFRESH_DATE={last_refresh}"
            )
            recent_event = row["RECENT_GOVERNANCE_EVENT_DATE"]
            if recent_event is not None:
                assert recent_event <= pm, (
                    f"{anchor['ACCOUNT_ID']} on {pm}: future-dated "
                    f"RECENT_GOVERNANCE_EVENT_DATE={recent_event}"
                )


# ---------- Property 4d: INTERLOCK_COUNT range ----------

def test_4d_interlock_count_in_range(in_audience_anchors):
    """For every (anchor, month) over a 24-month roll on a sample slice:
    INTERLOCK_COUNT in [0, 5]."""
    sample = in_audience_anchors[:10]
    for anchor in sample:
        for pm in _roll_24_months(date(2024, 6, 1)):
            row = _rows_for(anchor, pm)[0]
            interlock = row["INTERLOCK_COUNT"]
            assert isinstance(interlock, int), (
                f"{anchor['ACCOUNT_ID']} on {pm}: INTERLOCK_COUNT type "
                f"{type(interlock).__name__}, expected int"
            )
            assert 0 <= interlock <= 5, (
                f"{anchor['ACCOUNT_ID']} on {pm}: INTERLOCK_COUNT="
                f"{interlock} outside [0, 5]"
            )


# ---------- Property 4e: GOVERNANCE_RATING canonical ----------

def test_4e_governance_rating_canonical(in_audience_anchors):
    """For every (anchor, month) over a 24-month roll on a sample slice:
    GOVERNANCE_RATING in {Excellent, Strong, Adequate, Weak, Concerning}."""
    sample = in_audience_anchors[:10]
    for anchor in sample:
        for pm in _roll_24_months(date(2024, 6, 1)):
            row = _rows_for(anchor, pm)[0]
            rating = row["GOVERNANCE_RATING"]
            assert rating in _VALID_GOVERNANCE_RATINGS, (
                f"{anchor['ACCOUNT_ID']} on {pm}: GOVERNANCE_RATING="
                f"{rating!r} not in {sorted(_VALID_GOVERNANCE_RATINGS)}"
            )


# ---------- Property 5: 24-month history determinism ----------

def test_24month_history_per_anchor(in_audience_anchors):
    """Load-bearing for the backfill SP.

    For 5 fixture anchors × 24 months: assert (a) total 120 rows emitted,
    (b) all 24 PROFILE_MONTH values per anchor are distinct, (c) byte-identical
    re-run produces the same 120 rows."""
    sample = in_audience_anchors[:5]
    if len(sample) < 5:
        pytest.skip(f"need >=5 anchors, got {len(sample)}")
    months = list(_roll_24_months(date(2024, 6, 1)))
    assert len(months) == 24

    first_pass = []
    per_anchor_months = {}
    for anchor in sample:
        per_anchor_months[anchor["ACCOUNT_ID"]] = set()
        for pm in months:
            rows = _rows_for(anchor, pm)
            assert len(rows) == 1
            row = rows[0]
            per_anchor_months[anchor["ACCOUNT_ID"]].add(row["PROFILE_MONTH"])
            first_pass.append(row)

    assert len(first_pass) == 5 * 24, (
        f"expected 120 rows, got {len(first_pass)}"
    )
    for aid, mset in per_anchor_months.items():
        assert len(mset) == 24, (
            f"{aid}: only {len(mset)} distinct PROFILE_MONTH values across "
            f"24-month roll (expected 24)"
        )

    # Re-run determinism — second pass byte-identical.
    second_pass = []
    for anchor in sample:
        for pm in months:
            second_pass.append(_rows_for(anchor, pm)[0])
    assert first_pass == second_pass, "24-month roll non-deterministic on re-run"


# ---------- Property 6: Schema contract ----------

EXPECTED_KEYS = frozenset({
    "ORG_ID",
    "ACCOUNT_ID",
    "PROFILE_MONTH",
    "BOARD_SIZE",
    "BOARD_INDEPENDENCE_PCT",
    "WOMEN_BOARD_PCT",
    "MINORITY_BOARD_PCT",
    "BOARD_AVG_TENURE_YEARS",
    "CEO_TENURE_YEARS",
    "EXEC_TURNOVER_FLAG",
    "GOVERNANCE_RATING",
    "INTERLOCK_COUNT",
    "KEY_DIRECTOR_NAME",
    "RECENT_GOVERNANCE_EVENT_DATE",
    "LAST_DATA_REFRESH_DATE",
    "GENERATED_AT",
})


def test_output_schema_matches_table(in_audience_anchors):
    """Each row's keys EXACTLY match the 15 table columns."""
    pm = date(2026, 5, 1)
    rows = _rows_for(in_audience_anchors[0], pm)
    assert rows
    for row in rows:
        assert set(row.keys()) == EXPECTED_KEYS, (
            f"row keys {sorted(row.keys())} != expected {sorted(EXPECTED_KEYS)}"
        )


def test_output_schema_constant_matches_test_set():
    """Defense against EXPECTED_OUTPUT_COLUMNS in the SP module drifting
    away from this test's EXPECTED_KEYS — they must be the same set."""
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS, (
        "SP module's EXPECTED_OUTPUT_COLUMNS drifted from test's EXPECTED_KEYS"
    )


# ---------- Property 7: Cohort-specific Commercial Banking band ----------

def test_commercial_banking_large_employer_board_bias(commercial_banking_fixture):
    """Cohort-specific: BUSINESS Commercial Banking anchors with
    EMPLOYEE_COUNT > 5000 must produce BOARD_SIZE in the upper band [9, 15]
    (rowspec large-enterprise band). Uses the synthetic 5-anchor fixture
    because the shared SAMPLE_ANCHORS has zero CB anchors at this scale."""
    big = [
        a for a in commercial_banking_fixture
        if int(a.get("EMPLOYEE_COUNT") or 0) > 5_000
    ]
    if not big:
        pytest.skip("no Commercial Banking anchors with EMPLOYEE_COUNT > 5000")
    pm = date(2026, 5, 1)
    for anchor in big:
        row = _rows_for(anchor, pm)[0]
        board_size = row["BOARD_SIZE"]
        emp = anchor["EMPLOYEE_COUNT"]
        assert 9 <= board_size <= 15, (
            f"{anchor['ACCOUNT_ID']} (EMPLOYEE_COUNT={emp}) on {pm}: "
            f"BOARD_SIZE={board_size} outside large-enterprise band [9, 15]"
        )


# ---------- Bonus: Year-over-year governance drift ----------

def test_yoy_governance_drift_over_24_months(business_anchors):
    """Over a 24-month roll, at least one BUSINESS anchor's governance must
    drift on at least one tracked attribute. Guards against a stuck-seed bug
    where every (anchor, month) emits identical rows.

    Tracked attributes: BOARD_SIZE, BOARD_INDEPENDENCE_PCT, GOVERNANCE_RATING,
    EXEC_TURNOVER_FLAG, INTERLOCK_COUNT. Skip cleanly if no BUSINESS anchors.
    """
    if not business_anchors:
        pytest.skip("no BUSINESS anchors with EMPLOYEE_COUNT > 100 in fixture")
    tracked = (
        "BOARD_SIZE",
        "BOARD_INDEPENDENCE_PCT",
        "GOVERNANCE_RATING",
        "EXEC_TURNOVER_FLAG",
        "INTERLOCK_COUNT",
    )
    months = list(_roll_24_months(date(2024, 6, 1)))
    drifted_anchor = False
    for anchor in business_anchors[:5]:
        per_field = {f: set() for f in tracked}
        for pm in months:
            row = _rows_for(anchor, pm)[0]
            for f in tracked:
                per_field[f].add(row[f])
        if any(len(v) > 1 for v in per_field.values()):
            drifted_anchor = True
            break
    assert drifted_anchor, (
        "no BUSINESS anchor showed any governance drift over 24 months — "
        "every tracked attribute was constant; suspect a stuck or "
        "month-insensitive seed in _rows_for"
    )


# =====================================================================
# EXEC_TURNOVER_FLAG trailing-12-month stickiness (C-suite timeline model)
#
# Rowspec: "True if any C-suite change in the trailing 12 months. ~20%
# True overall, biased lower for long-CEO-tenure firms." The flag and
# CEO_TENURE_YEARS are window reads over one account-lifetime C-suite
# change timeline, so they must be sticky / monotone month over month.
# =====================================================================

import random as _random  # noqa: E402

from sp_generate_boardex_exec_intel import (  # noqa: E402
    _csuite_timeline,
    _employee_band_floor,
)


def _months(start: date, n: int):
    out, cur = [], start.replace(day=1)
    for _ in range(n):
        out.append(cur)
        cur = cur.replace(year=cur.year + 1, month=1) if cur.month == 12 else cur.replace(month=cur.month + 1)
    return out


_MONTHS_36 = _months(date(2023, 12, 1), 36)

# Live BUSINESS EMPLOYEE_COUNT band mix (probed 2026-11-02 on V_ACCOUNT_ANCHORS:
# 9,776 <100 / 952 100-999 / 119 1k-9,999 / 18 >=10k of 10,865).
_LIVE_BAND_MIX = ((50, 0.900), (500, 0.088), (3_000, 0.011), (30_000, 0.001))


def _synthetic_business_anchors(n: int, prefix: str, employee_count: int | None = None):
    r = _random.Random(f"{prefix}-{n}")
    anchors = []
    for i in range(n):
        emp = employee_count
        if emp is None:
            x, acc = r.random(), 0.0
            for band_emp, w in _LIVE_BAND_MIX:
                acc += w
                emp = band_emp
                if x < acc:
                    break
        anchors.append({
            "ACCOUNT_ID": f"{prefix}_{i:05d}",
            "ACCOUNT_TYPE_FLAG": "BUSINESS",
            "EMPLOYEE_COUNT": emp,
            "INTERLOCK_DEGREE": 1,
        })
    return anchors


def _history(anchor, months=_MONTHS_36):
    return [_rows_for(anchor, pm)[0] for pm in months]


@pytest.fixture(scope="module")
def synthetic_histories():
    """1,200 live-band-mix BUSINESS anchors x 36 months."""
    return [_history(a) for a in _synthetic_business_anchors(1_200, "SYN_BIZ")]


def test_turnover_determinism_same_inputs():
    """Same (anchor, month) -> identical flag + tenure, including after the
    timeline cache is cleared (no hidden state)."""
    anchors = _synthetic_business_anchors(50, "DET")
    first = [_history(a) for a in anchors]
    _csuite_timeline.cache_clear()
    second = [_history(a) for a in anchors]
    assert first == second


def test_turnover_timeline_stable_across_36_run_ts():
    """The C-suite timeline is account-lifetime: whichever of 36 profile
    months (run_ts) triggers it, the event list is identical, and the flag
    for a fixed month does not depend on what other months were generated."""
    for anchor in _synthetic_business_anchors(20, "STABLE"):
        band = _employee_band_floor(anchor["EMPLOYEE_COUNT"])
        reference = None
        for pm in _MONTHS_36:
            _csuite_timeline.cache_clear()
            _rows_for(anchor, pm)
            tl = _csuite_timeline(anchor["ACCOUNT_ID"], band)
            if reference is None:
                reference = tl
            assert tl == reference, f"{anchor['ACCOUNT_ID']}: timeline changed with run_ts {pm}"
        fixed = _rows_for(anchor, _MONTHS_36[20])[0]
        for pm in reversed(_MONTHS_36):
            _rows_for(anchor, pm)
        assert _rows_for(anchor, _MONTHS_36[20])[0] == fixed


def test_turnover_flag_is_trailing_12_month_sticky(synthetic_histories):
    """A FALSE->TRUE rise at month M implies TRUE for M..M+11 (checked only
    where 11 following months exist)."""
    checked = 0
    for hist in synthetic_histories:
        flags = [r["EXEC_TURNOVER_FLAG"] for r in hist]
        for i in range(1, len(flags)):
            if flags[i] and not flags[i - 1] and i + 11 < len(flags):
                checked += 1
                assert all(flags[i:i + 12]), (
                    f"{hist[0]['ACCOUNT_ID']}: rise at {hist[i]['PROFILE_MONTH']} "
                    f"not sticky for 12 months: {flags[i:i + 12]}"
                )
    assert checked > 100, f"too few rises to test stickiness ({checked})"


def test_turnover_stays_far_outnumber_rises(synthetic_histories):
    """Sticky flag: TRUE->TRUE transitions ~10x FALSE->TRUE rises (an iid
    monthly Bernoulli would give ~1x)."""
    rises = stays = 0
    for hist in synthetic_histories:
        flags = [r["EXEC_TURNOVER_FLAG"] for r in hist]
        for a, b in zip(flags, flags[1:]):
            rises += (not a) and b
            stays += a and b
    assert stays >= 8 * rises, f"stays={stays} rises={rises}"


def test_turnover_true_rate_15_to_25_pct(synthetic_histories):
    """>=1,000 BUSINESS anchors x 36 months: overall TRUE rate in [15%, 25%]."""
    flags = [r["EXEC_TURNOVER_FLAG"] for h in synthetic_histories for r in h]
    assert len(flags) >= 1_000 * 36
    rate = sum(flags) / len(flags)
    assert 0.15 <= rate <= 0.25, f"TRUE rate {rate:.3f} outside [0.15, 0.25]"


def test_turnover_lower_for_long_tenure_firms(synthetic_histories):
    """Biased lower for long-CEO-tenure firms: large employers (longer CEO
    tenure bands) turn over less than small ones, and rows whose CEO has
    >=7 years of tenure are flagged less than the population."""
    def rate(anchors):
        rows = [r for a in anchors for r in _history(a)]
        return sum(r["EXEC_TURNOVER_FLAG"] for r in rows) / len(rows)

    large = rate(_synthetic_business_anchors(400, "LARGE", employee_count=30_000))
    small = rate(_synthetic_business_anchors(400, "SMALL", employee_count=50))
    assert large < small, f"large-firm rate {large:.3f} !< small-firm rate {small:.3f}"

    rows = [r for h in synthetic_histories for r in h]
    long_ten = [r["EXEC_TURNOVER_FLAG"] for r in rows if r["CEO_TENURE_YEARS"] >= 7.0]
    overall = sum(r["EXEC_TURNOVER_FLAG"] for r in rows) / len(rows)
    assert sum(long_ten) / len(long_ten) < overall


def test_ceo_tenure_monotone_between_ceo_changes(synthetic_histories):
    """CEO_TENURE_YEARS grows ~1/12 per month and only drops on a CEO change;
    a reset lands below 1 year with EXEC_TURNOVER_FLAG TRUE."""
    resets = 0
    for hist in synthetic_histories:
        for prev, cur in zip(hist, hist[1:]):
            d = cur["CEO_TENURE_YEARS"] - prev["CEO_TENURE_YEARS"]
            if d < 0:
                resets += 1
                assert cur["CEO_TENURE_YEARS"] < 1.0, (cur["ACCOUNT_ID"], prev, cur)
                assert cur["EXEC_TURNOVER_FLAG"] is True, (cur["ACCOUNT_ID"], cur)
            else:
                assert d <= 0.21, f"{cur['ACCOUNT_ID']}: tenure jumped {d:.2f}y in one month"
    assert resets > 0, "no CEO change observed across the synthetic population"


def test_ceo_tenure_column_shape(synthetic_histories):
    """Schema unchanged: CEO_TENURE_YEARS is a 1-dp float in [0.0, 25.0]
    (NUMBER(4,1)); EXEC_TURNOVER_FLAG is a Python bool; key set unchanged."""
    for hist in synthetic_histories[:200]:
        for r in hist:
            t = r["CEO_TENURE_YEARS"]
            assert isinstance(t, float) and 0.0 <= t <= 25.0 and round(t, 1) == t
            assert isinstance(r["EXEC_TURNOVER_FLAG"], bool)
            assert set(r.keys()) == EXPECTED_KEYS


def test_person_anchor_flag_still_false():
    """PERSON anchors keep the personal-household default flag False."""
    person = {"ACCOUNT_ID": "PERSON_X", "ACCOUNT_TYPE_FLAG": "PERSON", "EMPLOYEE_COUNT": None}
    for r in _history(person):
        assert r["EXEC_TURNOVER_FLAG"] is False
        assert r["CEO_TENURE_YEARS"] == 5.0


# -------------------------------------------------------------------
# MERGE result accounting — update-only re-runs must not be logged as
# inserts (review finding 2026-11-02).
# -------------------------------------------------------------------

from sp_generate_boardex_exec_intel import _merge_counts  # noqa: E402


class _FakeRow:
    def __init__(self, d):
        self._d = d

    def asDict(self):
        return dict(self._d)

    def __iter__(self):
        return iter(self._d.values())


def test_merge_counts_full_merge_reads_by_name():
    row = _FakeRow({"number of rows inserted": 7, "number of rows updated": 36000})
    assert _merge_counts([row], update_only=False) == (7, 36000)


def test_merge_counts_update_only_is_not_an_insert():
    row = _FakeRow({"number of rows updated": 36813})
    assert _merge_counts([row], update_only=True) == (0, 36813)


def test_merge_counts_positional_fallback_and_empty():
    assert _merge_counts([(5, 9)], update_only=False) == (5, 9)
    assert _merge_counts([(9,)], update_only=True) == (0, 9)
    assert _merge_counts([], update_only=False) == (0, 0)
