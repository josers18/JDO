"""L1 tests for the ZoomInfo Firmographics row factory.

Plan 11 is the most "boring" Plan structurally — same audience as Plans 2
(MSCI) and 3 (D&B). With 50 BUSINESS anchors in the fixture cohort the
property tests can use lightweight per-anchor consistency invariants
(EMPLOYEE_BAND / REVENUE_BAND deterministic from anchor numerics) plus
distributional checks where the 12K-row scale calls for it.

Five property classes per rowspec / Plan 11 §4 task 3:
  1. Same-month determinism (mid-month re-runs byte-identical, day/hour
     collapse to month_start)
  2. Audience scoping (BUSINESS filter — Person / Wealth / Retail anchors
     must raise; every BUSINESS anchor emits)
  3. Boring case — every BUSINESS fixture anchor produces a non-None dict
     with required-non-null fields populated
  4. Per-anchor / per-row invariants (load-bearing for Plan 11 — defensive
     string handling per Plan 4 v1.5 findings):
     a. EMPLOYEE_BAND consistent with EMPLOYEE_COUNT (7-bucket ladder)
     b. REVENUE_BAND consistent with ANNUAL_REVENUE (6-bucket ladder)
     c. HQ_COUNTRY_CODE == 'US' for every row (literal projection per
        v1.5 finding #5)
     d. len(HQ_POSTAL_CODE) == 5 for every row (synth-fallback handles
        empty raw POSTAL_CODE per v1.5 finding #4)
     e. len(HQ_STATE_CODE) == 2 for every row (_state_from_zip fallback
        per v1.5 finding #4)
     f. FOUNDED_YEAR <= run_ts.year (no future-founded businesses)
     g. LINKEDIN_FOLLOWERS in [0, 5_000_000]
     h. NAICS 6 digits / SIC 4 digits (regex format)
  5. Schema contract — output dict matches the 15 table columns

Plus bonus tests:
  - EMPLOYEE_BAND in 7-band canonical set
  - REVENUE_BAND in 6-band canonical set
  - WEBSITE_DOMAIN format when populated (alnum + .com)
  - TECH_STACK_FLAGS is str or None
  - PROFILE_MONTH / GENERATED_AT match month_start
"""
import re
from datetime import date, datetime, timedelta

import pytest

# Imports from the SP module (Task 4 in the same diff as this file).
from sp_generate_zoominfo_firmographics import (
    _row_for,
    _anchor_in_audience,
    EXPECTED_OUTPUT_COLUMNS,
)


_VALID_EMPLOYEE_BANDS = {
    "1-10",
    "11-50",
    "51-200",
    "201-1000",
    "1001-5000",
    "5001-25000",
    "25001+",
}
_VALID_REVENUE_BANDS = {
    "<$1M",
    "$1M-$10M",
    "$10M-$50M",
    "$50M-$200M",
    "$200M-$1B",
    "$1B+",
}

_NAICS_RE = re.compile(r"^\d{6}$")
_SIC_RE = re.compile(r"^\d{4}$")
_WEBSITE_RE = re.compile(r"^[a-z0-9]+\.com$")


def _expected_employee_band(count):
    """Mirror the rowspec's 7-bucket ladder. NULL/0 -> 1-10."""
    if count is None or count <= 0:
        return "1-10"
    if count <= 10:
        return "1-10"
    if count <= 50:
        return "11-50"
    if count <= 200:
        return "51-200"
    if count <= 1000:
        return "201-1000"
    if count <= 5000:
        return "1001-5000"
    if count <= 25000:
        return "5001-25000"
    return "25001+"


def _expected_revenue_band(revenue):
    """Mirror the rowspec's 6-bucket ladder. NULL/0 -> <$1M."""
    if revenue is None or revenue <= 0:
        return "<$1M"
    if revenue < 1_000_000:
        return "<$1M"
    if revenue < 10_000_000:
        return "$1M-$10M"
    if revenue < 50_000_000:
        return "$10M-$50M"
    if revenue < 200_000_000:
        return "$50M-$200M"
    if revenue < 1_000_000_000:
        return "$200M-$1B"
    return "$1B+"


# ---------- Property 1: Same-month determinism ----------

def test_determinism_same_inputs_same_dict(in_audience_anchors):
    """Two back-to-back calls with the same inputs produce the same dict."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture; "
            f"need >=3 for cohort-specific assertions"
        )
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors[:5]:
        a = _row_for(anchor, ts)
        b = _row_for(anchor, ts)
        assert a == b, f"non-deterministic same-inputs for {anchor['ACCOUNT_ID']}"


def test_determinism_buckets_by_month(in_audience_anchors):
    """All `run_ts` values within the same calendar month produce IDENTICAL
    rows (the SP collapses to month_start). A different month flips the dict."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    day1 = datetime(2026, 5, 1, 0, 0, 0)
    day15 = datetime(2026, 5, 15, 0, 0, 0)
    eom_late = datetime(2026, 5, 28, 23, 30, 0)
    next_month = datetime(2026, 6, 1, 0, 0, 0)
    flipped = 0
    for anchor in in_audience_anchors[:10]:
        a = _row_for(anchor, day1)
        b = _row_for(anchor, day15)
        c = _row_for(anchor, eom_late)
        assert a == b, (
            f"{anchor['ACCOUNT_ID']}: day-1 vs day-15 differ within May 2026"
        )
        assert a == c, (
            f"{anchor['ACCOUNT_ID']}: day-1 vs eom-late differ within May 2026"
        )
        d = _row_for(anchor, next_month)
        if d != a:
            flipped += 1
    assert flipped >= 1, (
        "no anchor changed across May->June; month-bucketed seed may be "
        "missing the month component"
    )


# ---------- Property 2: Audience scoping ----------

def test_audience_violators_raise(out_of_audience_anchors):
    """Plan 11 audience is `ACCOUNT_TYPE_FLAG = 'BUSINESS'`. The SP must
    reject anchors that fail the predicate (PERSON anchors — Wealth /
    Retail / Commercial Banking customers) — accept any of the canonical
    guard exceptions."""
    if not out_of_audience_anchors:
        pytest.skip("no out-of-audience anchors in fixture")
    ts = datetime(2026, 5, 1)
    for bad in out_of_audience_anchors[:5]:
        with pytest.raises((ValueError, AssertionError, KeyError)):
            _row_for(bad, ts)


def test_anchor_in_audience_predicate(in_audience_anchors, out_of_audience_anchors):
    """`_anchor_in_audience` returns True for BUSINESS, False for PERSON."""
    for good in in_audience_anchors:
        assert _anchor_in_audience(good) is True, good["ACCOUNT_ID"]
    for bad in out_of_audience_anchors:
        assert _anchor_in_audience(bad) is False, bad["ACCOUNT_ID"]


def test_every_in_audience_anchor_emits_a_row(in_audience_anchors):
    """Every BUSINESS fixture anchor produces a non-None dict whose
    ACCOUNT_ID matches the anchor."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row is not None
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]


def test_empty_account_id_raises():
    """Defense-in-depth: an in-audience anchor with empty ACCOUNT_ID must raise."""
    with pytest.raises((ValueError, AssertionError, KeyError)):
        _row_for(
            {
                "ACCOUNT_ID": "",
                "ACCOUNT_TYPE_FLAG": "BUSINESS",
                "ACCOUNT_NAME": "Acme Industrial Co",
                "INDUSTRY": "Manufacturing",
                "ANNUAL_REVENUE": 25_000_000,
                "EMPLOYEE_COUNT": 120,
                "POSTAL_CODE": "94110",
                "STATE_CODE": "CA",
                "COUNTRY_CODE": "US",
            },
            datetime(2026, 5, 1),
        )


# ---------- Property 3: Boring case ----------

def test_boring_case_every_business_anchor_full_row(in_audience_anchors):
    """Every BUSINESS anchor produces a non-None dict; required (NOT NULL)
    fields populated; NULLable WEBSITE_DOMAIN / TECH_STACK_FLAGS may be None
    but every other field must be populated."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    ts = datetime(2026, 5, 1)
    required_non_null = {
        "ACCOUNT_ID",
        "PROFILE_MONTH",
        "EMPLOYEE_BAND",
        "REVENUE_BAND",
        "INDUSTRY_NAICS_CODE",
        "INDUSTRY_SIC_CODE",
        "FOUNDED_YEAR",
        "HQ_COUNTRY_CODE",
        "HQ_STATE_CODE",
        "HQ_POSTAL_CODE",
        "LINKEDIN_FOLLOWERS",
        "LAST_DATA_REFRESH_DATE",
        "GENERATED_AT",
    }
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row is not None, anchor["ACCOUNT_ID"]
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
        for f in required_non_null:
            assert row[f] is not None, (
                f"{anchor['ACCOUNT_ID']}: required field {f} is None"
            )
        # NULLable fields are allowed to be None — but if populated, must
        # be the right Python type (asserted distributionally below).


# ---------- Property 4a: EMPLOYEE_BAND consistent with EMPLOYEE_COUNT ----------

def test_4a_employee_band_consistent_with_employee_count(in_audience_anchors):
    """For every BUSINESS anchor: EMPLOYEE_BAND matches the deterministic
    7-bucket ladder applied to EMPLOYEE_COUNT. NULL/0 -> '1-10'."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors:
        count = anchor.get("EMPLOYEE_COUNT")
        row = _row_for(anchor, ts)
        expected = _expected_employee_band(count)
        assert row["EMPLOYEE_BAND"] == expected, (
            f"{anchor['ACCOUNT_ID']} EMPLOYEE_COUNT={count}: expected band "
            f"{expected!r}, got {row['EMPLOYEE_BAND']!r}"
        )


# ---------- Property 4b: REVENUE_BAND consistent with ANNUAL_REVENUE ----------

def test_4b_revenue_band_consistent_with_annual_revenue(in_audience_anchors):
    """For every BUSINESS anchor: REVENUE_BAND matches the deterministic
    6-bucket ladder applied to ANNUAL_REVENUE. NULL/0 -> '<$1M'."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors:
        revenue = anchor.get("ANNUAL_REVENUE")
        row = _row_for(anchor, ts)
        expected = _expected_revenue_band(revenue)
        assert row["REVENUE_BAND"] == expected, (
            f"{anchor['ACCOUNT_ID']} ANNUAL_REVENUE={revenue}: expected band "
            f"{expected!r}, got {row['REVENUE_BAND']!r}"
        )


# ---------- Property 4c: HQ_COUNTRY_CODE == 'US' literal projection ----------

def test_4c_country_code_is_us_literal(in_audience_anchors):
    """Per v1.5 finding #5: HQ_COUNTRY_CODE is projected as the literal 'US'
    regardless of source COUNTRY_CODE value (defense against 'USA' /
    'United States' literal drift). Demo is US-only — every row must carry
    the literal 'US'."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert row["HQ_COUNTRY_CODE"] == "US", (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: expected literal 'US', "
                f"got {row['HQ_COUNTRY_CODE']!r}"
            )
            assert len(row["HQ_COUNTRY_CODE"]) == 2, row


# ---------- Property 4d: HQ_POSTAL_CODE non-empty 5-char ZIP ----------

def test_4d_postal_code_non_empty_five_chars(in_audience_anchors):
    """Per v1.5 finding #4: 10,798 V_ACCOUNT_ANCHORS rows carry empty-string
    POSTAL_CODE. The SP synth-fallbacks to a deterministic 5-digit ZIP from
    the seed bytes when raw is empty. Every row must carry a non-empty
    5-char HQ_POSTAL_CODE — real-or-synth."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            zip_code = row["HQ_POSTAL_CODE"]
            assert zip_code is not None, (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: HQ_POSTAL_CODE is None"
            )
            assert zip_code != "", (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: HQ_POSTAL_CODE is empty"
            )
            assert len(zip_code) == 5, (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: HQ_POSTAL_CODE "
                f"{zip_code!r} length {len(zip_code)} != 5"
            )


# ---------- Property 4e: HQ_STATE_CODE 2-char fallback ----------

def test_4e_state_code_length_2(in_audience_anchors):
    """Per v1.5 finding #4: STATE_CODE has empty-string drift symmetric with
    POSTAL_CODE. The SP fallbacks via _state_from_zip helper when raw is
    blank. Every row must carry a 2-char HQ_STATE_CODE — real-or-fallback."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            state = row["HQ_STATE_CODE"]
            assert state is not None, (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: HQ_STATE_CODE is None"
            )
            assert len(state) == 2, (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: HQ_STATE_CODE "
                f"{state!r} length {len(state)} != 2"
            )


# ---------- Property 4f: FOUNDED_YEAR <= run_ts.year ----------

def test_4f_founded_year_le_current(in_audience_anchors):
    """For every (anchor, month) row: FOUNDED_YEAR is in [1900, run_ts.year]
    — no future-founded businesses, no pre-1900 'businesses'."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            year = row["FOUNDED_YEAR"]
            assert 1900 <= year <= ts.year, (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: FOUNDED_YEAR={year} "
                f"not in [1900, {ts.year}]"
            )


# ---------- Property 4g: LINKEDIN_FOLLOWERS in [0, 5_000_000] ----------

def test_4g_linkedin_followers_in_range(in_audience_anchors):
    """For every (anchor, month) row: LINKEDIN_FOLLOWERS in
    [0, 5_000_000]. Range invariant from rowspec — clamp guard against
    industry-multiplier blow-out."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            followers = row["LINKEDIN_FOLLOWERS"]
            assert 0 <= followers <= 5_000_000, (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: LINKEDIN_FOLLOWERS"
                f"={followers} not in [0, 5_000_000]"
            )


# ---------- Property 4h: NAICS / SIC code format ----------

def test_4h_naics_sic_code_format(in_audience_anchors):
    """For every row: INDUSTRY_NAICS_CODE matches `^\\d{6}$` (6-digit string)
    and INDUSTRY_SIC_CODE matches `^\\d{4}$` (4-digit string). VARCHAR
    columns preserve leading zeros — no numeric drift."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            naics = row["INDUSTRY_NAICS_CODE"]
            sic = row["INDUSTRY_SIC_CODE"]
            assert _NAICS_RE.match(naics), (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: NAICS={naics!r} "
                f"doesn't match ^\\d{{6}}$"
            )
            assert _SIC_RE.match(sic), (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: SIC={sic!r} "
                f"doesn't match ^\\d{{4}}$"
            )


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    "ACCOUNT_ID",
    "PROFILE_MONTH",
    "EMPLOYEE_BAND",
    "REVENUE_BAND",
    "INDUSTRY_NAICS_CODE",
    "INDUSTRY_SIC_CODE",
    "FOUNDED_YEAR",
    "HQ_COUNTRY_CODE",
    "HQ_STATE_CODE",
    "HQ_POSTAL_CODE",
    "WEBSITE_DOMAIN",
    "LINKEDIN_FOLLOWERS",
    "TECH_STACK_FLAGS",
    "LAST_DATA_REFRESH_DATE",
    "GENERATED_AT",
}


def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the 15 table columns."""
    if not in_audience_anchors:
        pytest.skip("no BUSINESS anchors in fixture")
    row = _row_for(in_audience_anchors[0], datetime(2026, 5, 1))
    assert set(row.keys()) == EXPECTED_KEYS, (
        f"row keys {sorted(row.keys())} != expected {sorted(EXPECTED_KEYS)}"
    )


def test_output_schema_constant_matches_test_set():
    """Defense against EXPECTED_OUTPUT_COLUMNS in the SP module drifting
    away from this test's EXPECTED_KEYS — they must be the same set."""
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS, (
        "SP module's EXPECTED_OUTPUT_COLUMNS drifted from test's EXPECTED_KEYS"
    )


# ---------- Bonus tests: vocabulary / type / format ----------

def test_employee_band_canonical(in_audience_anchors):
    """EMPLOYEE_BAND in 7-band canonical set over a 3-month roll."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert row["EMPLOYEE_BAND"] in _VALID_EMPLOYEE_BANDS, row


def test_revenue_band_canonical(in_audience_anchors):
    """REVENUE_BAND in 6-band canonical set over a 3-month roll."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert row["REVENUE_BAND"] in _VALID_REVENUE_BANDS, row


def test_website_domain_format_when_populated(in_audience_anchors):
    """WEBSITE_DOMAIN, when not None, matches `^[a-z0-9]+\\.com$` —
    lowercase, alnum-stripped, .com suffix. NULL when normalized name
    slug length < 3 (~0.5% of rows)."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            domain = row["WEBSITE_DOMAIN"]
            if domain is not None:
                assert _WEBSITE_RE.match(domain), (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: WEBSITE_DOMAIN "
                    f"{domain!r} doesn't match ^[a-z0-9]+\\.com$"
                )


def test_tech_stack_flags_is_str_or_none(in_audience_anchors):
    """TECH_STACK_FLAGS is either a string (comma-separated tags) or None
    (~10% of rows when industry-biased tag count rolls 0). No other types."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            flags = row["TECH_STACK_FLAGS"]
            assert flags is None or isinstance(flags, str), (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: TECH_STACK_FLAGS "
                f"is {type(flags).__name__}, expected str or None"
            )


def test_profile_month_matches_run_ts_month(in_audience_anchors):
    """PROFILE_MONTH == month_start.date(); GENERATED_AT == month_start
    (run_ts truncated to first-of-month at 00:00:00). Rerun-determinism
    safety: the SP must NOT bake day/hour into either field."""
    if not in_audience_anchors:
        pytest.skip("no BUSINESS anchors in fixture")
    # Cover a few different mid-month timestamps to exercise the truncation.
    for ts in (
        datetime(2026, 5, 1, 0, 0, 0),
        datetime(2026, 5, 15, 12, 30, 45),
        datetime(2026, 5, 28, 23, 59, 59),
    ):
        anchor = in_audience_anchors[0]
        row = _row_for(anchor, ts)
        expected_month_start = ts.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        assert row["PROFILE_MONTH"] == expected_month_start.date(), row
        assert row["GENERATED_AT"] == expected_month_start, row


def test_last_data_refresh_in_90_day_window(in_audience_anchors):
    """LAST_DATA_REFRESH_DATE is in [run_ts.date() - 90d, run_ts.date()] for
    every row. Vendor-data-refresh window — never future-dated, never older
    than 90 days."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} BUSINESS anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        run_date = ts.date()
        floor = run_date - timedelta(days=90)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            refresh = row["LAST_DATA_REFRESH_DATE"]
            assert isinstance(refresh, date), (
                f"{anchor['ACCOUNT_ID']} on {run_date}: LAST_DATA_REFRESH_DATE "
                f"is {type(refresh).__name__}, expected date"
            )
            assert floor <= refresh <= run_date, (
                f"{anchor['ACCOUNT_ID']} on {run_date}: LAST_DATA_REFRESH_DATE"
                f"={refresh} not in [{floor}, {run_date}]"
            )
