"""L1 tests for the Plaid Held-Away row factory.

First **1:N** dataset in the Cumulus rollout — `_rows_for(anchor, run_ts)`
returns a sorted list of 1-5 dicts, NOT a single dict like Plans 1-5.

Five property classes per rowspec §"Anchor-influence test target":
  1. Determinism (same inputs + month-bucketing) — multi-row equality
  2. Audience scoping (Household/SMB/Commercial Banking raise)
  3. Boring-case coverage (every Retail+Wealth anchor produces >=1 row)
  4. Anchor influence — FOUR assertions:
     a. Multi-row determinism (same anchor -> same list, same length, same order)
     b. Income -> balance shift (high vs low income)
     c. Age -> investment risk shift (older = more Conservative)
     d. Wealth -> row count shift (Wealth >= 2x Retail)
  5. Schema contract — output dict keys EXACTLY match the 14 table columns
     plus EXPECTED_OUTPUT_COLUMNS in the SP module matches.

Plus bonus tests:
  - Stable HELD_AWAY_ACCOUNT_ID across months
  - Row count in 1-5 range
  - Sorted output by HELD_AWAY_ACCOUNT_ID
  - Active ratio approximately right (~92%)
  - NULL semantics (IS_ACTIVE=false; investment-only fields; rate-only fields)
  - Loan accounts have negative balance
  - Institution-type cohesion
"""
from datetime import datetime
from statistics import mean

import pytest

# Imports from the SP module (T4 builds it).
from sp_generate_plaid_held_away import (
    _rows_for,
    EXPECTED_OUTPUT_COLUMNS,
    _INSTITUTIONS,
)


# Loan and investment account-type sets used by multiple tests.
_LOAN_TYPES = {"Mortgage", "Auto Loan", "Credit Card"}
_INVESTMENT_TYPES = {"Brokerage", "IRA", "401k", "HSA"}
_RATE_BEARING = {"Savings", "Mortgage", "Auto Loan", "Credit Card"}


# ---------- Property 1: Determinism ----------

def test_determinism_same_inputs(in_audience_anchors):
    """Same (anchor, ts) -> same list, dict-by-dict, same order."""
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors[:5]:
        a = _rows_for(anchor, ts)
        b = _rows_for(anchor, ts)
        assert a == b, f"non-deterministic for {anchor['ACCOUNT_ID']}"
        assert len(a) == len(b)


def test_determinism_buckets_by_month(in_audience_anchors):
    """Different days within the same month -> identical output;
    a new month -> potentially different list (but same anchor)."""
    anchor = in_audience_anchors[0]
    a = _rows_for(anchor, datetime(2026, 5, 1))
    b = _rows_for(anchor, datetime(2026, 5, 17))
    c = _rows_for(anchor, datetime(2026, 5, 31))
    assert a == b, "mid-month (May 17) re-run differs from May 1"
    assert a == c, "end-month (May 31) re-run differs from May 1"


# ---------- Property 2: Audience scoping ----------

def test_audience_violators_raise(out_of_audience_anchors):
    """Household / Small Business / Commercial Banking / null-CLIENT_CATEGORY
    anchors must raise (defense in depth).

    Caller-side audience SQL filters them out, but if such a row leaks
    through, the row factory catches it loudly.
    """
    if not out_of_audience_anchors:
        pytest.skip("no out-of-audience anchors in fixture")
    # Sample a mix of out-of-audience values.
    by_cat = {}
    for a in out_of_audience_anchors:
        by_cat.setdefault(a.get("CLIENT_CATEGORY"), []).append(a)
    # At least include one Small Business + one Commercial Banking.
    sampled = []
    for cat in ("Small Business", "Commercial Banking", "Household", None):
        if cat in by_cat:
            sampled.extend(by_cat[cat][:2])
    if not sampled:
        sampled = out_of_audience_anchors[:4]
    for bad in sampled:
        with pytest.raises((ValueError, AssertionError)):
            _rows_for(bad, datetime(2026, 5, 1))


# ---------- Property 3: Boring-case coverage ----------

def test_every_audience_anchor_emits_at_least_one_row(in_audience_anchors):
    """Every Retail+Wealth anchor produces a non-empty list with 1-5 rows."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, datetime(2026, 5, 1))
        assert rows, f"empty rows for {anchor['ACCOUNT_ID']}"
        assert 1 <= len(rows) <= 5, (
            f"{anchor['ACCOUNT_ID']} produced {len(rows)} rows, expected 1-5"
        )


def test_each_row_has_expected_basics(in_audience_anchors):
    """Each row has ACCOUNT_ID matching the anchor, IS_ACTIVE bool,
    GENERATED_AT populated."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:10]:
        rows = _rows_for(anchor, datetime(2026, 5, 1))
        for row in rows:
            assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
            assert isinstance(row["IS_ACTIVE"], bool), (
                f"IS_ACTIVE for {anchor['ACCOUNT_ID']} is "
                f"{type(row['IS_ACTIVE']).__name__}, expected bool"
            )
            assert row["GENERATED_AT"] is not None
            assert row["HELD_AWAY_ACCOUNT_ID"]
            assert row["INSTITUTION_NAME"]
            assert row["INSTITUTION_TYPE"]
            assert row["ACCOUNT_TYPE"]
            assert row["BALANCE_USD"] is not None
            assert row["LAST_LINKED_DATE"] is not None
            assert row["PROFILE_MONTH"] is not None


# ---------- Property 4: Anchor influence (load-bearing tests) ----------

def _age_at(anchor, when):
    bd = datetime.fromisoformat(anchor["BIRTHDATE"])
    return (when - bd).days // 365


def test_4a_multi_row_determinism(in_audience_anchors):
    """Same anchor, two _rows_for calls -> identical list AND identical length."""
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors[:10]:
        a = _rows_for(anchor, ts)
        b = _rows_for(anchor, ts)
        assert len(a) == len(b)
        assert a == b


def test_4b_income_correlates_with_balance(in_audience_anchors):
    """High-income (>=$250K) anchors have >=3x mean total balance (across
    non-loan rows) vs low-income (<$40K). Roll over 6+ months for stability."""
    high = [a for a in in_audience_anchors if (a["ANNUAL_INCOME"] or 0) >= 250_000]
    low = [a for a in in_audience_anchors if (a["ANNUAL_INCOME"] or 0) < 40_000]
    if not high or not low:
        pytest.skip(
            f"need both income cohorts; got high={len(high)}, low={len(low)}"
        )
    months = [(2026, m) for m in range(1, 13)]
    high_balances, low_balances = [], []
    for a in high:
        for y, m in months:
            for r in _rows_for(a, datetime(y, m, 1)):
                if r["ACCOUNT_TYPE"] not in _LOAN_TYPES:
                    high_balances.append(r["BALANCE_USD"])
    for a in low:
        for y, m in months:
            for r in _rows_for(a, datetime(y, m, 1)):
                if r["ACCOUNT_TYPE"] not in _LOAN_TYPES:
                    low_balances.append(r["BALANCE_USD"])
    if not high_balances or not low_balances:
        pytest.skip("not enough non-loan rows in both cohorts")
    high_mean = mean(high_balances)
    low_mean = mean(low_balances)
    assert high_mean >= 3 * low_mean, (
        f"expected high-income mean balance >= 3x low-income; "
        f"got high={high_mean:.0f} vs low={low_mean:.0f} "
        f"(ratio {high_mean / max(1, low_mean):.2f}x)"
    )


def test_4c_age_correlates_with_investment_risk_tier(in_audience_anchors):
    """Within INVESTMENT_RISK_TIER rows (Brokerage/IRA/401k/HSA), the rate of
    'Conservative' tier is >=2x higher in age 65+ vs age <30. Multi-month roll."""
    today = datetime(2026, 5, 28)
    older = [a for a in in_audience_anchors if _age_at(a, today) >= 65]
    young = [a for a in in_audience_anchors if _age_at(a, today) < 30]
    if not older or not young:
        pytest.skip(
            f"need both age cohorts; got older={len(older)}, young={len(young)}"
        )
    months = [(2026, m) for m in range(1, 13)]

    def conservative_rate(cohort):
        tiers = []
        for a in cohort:
            for y, m in months:
                for r in _rows_for(a, datetime(y, m, 1)):
                    if r["ACCOUNT_TYPE"] in _INVESTMENT_TYPES:
                        tiers.append(r["INVESTMENT_RISK_TIER"])
        if not tiers:
            return None, 0
        n_cons = sum(1 for t in tiers if t == "Conservative")
        return n_cons / len(tiers), len(tiers)

    older_rate, older_n = conservative_rate(older)
    young_rate, young_n = conservative_rate(young)
    if older_rate is None or young_rate is None:
        pytest.skip("not enough investment-type rows in both cohorts")
    # The young cohort might have 0% Conservative — guard the divide.
    if young_rate == 0:
        assert older_rate >= 0.30, (
            f"young Conservative rate is 0; expected older >= 30%, got "
            f"{older_rate:.1%} (older n={older_n}, young n={young_n})"
        )
        return
    assert older_rate >= 2 * young_rate, (
        f"expected older Conservative rate >= 2x young; "
        f"got older={older_rate:.1%} ({older_n}) vs "
        f"young={young_rate:.1%} ({young_n}) "
        f"(ratio {older_rate / young_rate:.2f}x)"
    )


def test_4d_wealth_correlates_with_row_count(in_audience_anchors):
    """Wealth Management anchors have meaningfully higher mean row count
    than Retail anchors with comparable income.

    Rowspec literal weights:
      Retail default  : [40, 30, 18, 8, 4]   -> mean 2.06
      Wealth override : [10, 25, 30, 22, 13] -> mean 3.03
    Best-case mathematical ratio = 3.03 / 2.06 = ~1.47x.

    The rowspec's L1 spec says "Wealth >= 2x Retail row count" but the
    rowspec's own weights only deliver ~1.47x. The directional invariant
    (Wealth > Retail) is what's load-bearing for the demo; we encode the
    numerically-achievable bar of >= 1.35x to leave headroom for the
    L3 smoke check. See "Wealth -> row count shift" deviation note in
    the T3+T4 implementation report.
    """
    wealth = [a for a in in_audience_anchors
              if a["CLIENT_CATEGORY"] == "Wealth Management"]
    retail_mid = [a for a in in_audience_anchors
                  if a["CLIENT_CATEGORY"] == "Retail"
                  and 50_000 <= (a["ANNUAL_INCOME"] or 0) <= 150_000]
    if not wealth or not retail_mid:
        pytest.skip(
            f"need both cohorts; got wealth={len(wealth)}, "
            f"retail_mid={len(retail_mid)}"
        )
    months = [(2026, m) for m in range(1, 13)]
    wealth_counts = [len(_rows_for(a, datetime(y, m, 1)))
                     for a in wealth for y, m in months]
    retail_counts = [len(_rows_for(a, datetime(y, m, 1)))
                     for a in retail_mid for y, m in months]
    wealth_mean = mean(wealth_counts)
    retail_mean = mean(retail_counts)
    assert wealth_mean >= 1.35 * retail_mean, (
        f"expected Wealth mean row count >= 1.35x Retail mid-income; "
        f"got wealth={wealth_mean:.2f} vs retail_mid={retail_mean:.2f} "
        f"(ratio {wealth_mean / retail_mean:.2f}x)"
    )


def test_4e_held_away_account_id_stable_across_months(in_audience_anchors):
    """Same anchor at May 1 and June 1 — slot-0 row (sorted) has the SAME
    HELD_AWAY_ACCOUNT_ID. The hash key has no run_ts component."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    checked = 0
    for anchor in in_audience_anchors[:10]:
        may = _rows_for(anchor, datetime(2026, 5, 1))
        june = _rows_for(anchor, datetime(2026, 6, 1))
        # Both must have at least one row (per audience contract).
        if not may or not june:
            continue
        # Row-count CAN change month-to-month (parent_seed changes), so we
        # find the slot-0 hash deterministically rather than relying on len.
        # Slot 0 hash is sha256("{account_id}_slot0_plaid")[:16]; it must
        # appear in both lists.
        import hashlib
        slot0_hash = hashlib.sha256(
            f"{anchor['ACCOUNT_ID']}_slot0_plaid".encode()
        ).hexdigest()[:16]
        may_hashes = {r["HELD_AWAY_ACCOUNT_ID"] for r in may}
        june_hashes = {r["HELD_AWAY_ACCOUNT_ID"] for r in june}
        assert slot0_hash in may_hashes, (
            f"slot0 hash missing from May rows for {anchor['ACCOUNT_ID']}"
        )
        assert slot0_hash in june_hashes, (
            f"slot0 hash missing from June rows for {anchor['ACCOUNT_ID']}"
        )
        checked += 1
    assert checked >= 5, f"only verified {checked} anchors, need >=5"


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    # v1.x multi-org-additive: ORG_ID leads the schema contract.
    "ORG_ID",
    "ACCOUNT_ID", "HELD_AWAY_ACCOUNT_ID", "PROFILE_MONTH",
    "INSTITUTION_NAME", "INSTITUTION_TYPE", "ACCOUNT_TYPE",
    "BALANCE_USD", "LAST_LINKED_DATE", "IS_ACTIVE",
    "LAST_TRANSACTION_DATE", "MONTHLY_NET_FLOW_USD",
    "INVESTMENT_RISK_TIER", "INTEREST_RATE_PCT", "GENERATED_AT",
}


def test_output_schema_matches_table(in_audience_anchors):
    """Each row's keys EXACTLY match the 14 table columns."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    rows = _rows_for(in_audience_anchors[0], datetime(2026, 5, 1))
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


# ---------- Bonus tests ----------

def test_row_count_in_1_to_5_range(in_audience_anchors):
    """Every anchor returns 1-5 rows, no exceptions. Multi-month roll."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors:
        for m in range(1, 13):
            rows = _rows_for(anchor, datetime(2026, m, 1))
            assert 1 <= len(rows) <= 5, (
                f"{anchor['ACCOUNT_ID']} m={m}: {len(rows)} rows out of [1,5]"
            )


def test_rows_sorted_by_held_away_account_id(in_audience_anchors):
    """Output list is sorted ascending by HELD_AWAY_ACCOUNT_ID."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    checked = 0
    for anchor in in_audience_anchors[:20]:
        rows = _rows_for(anchor, datetime(2026, 5, 1))
        ids = [r["HELD_AWAY_ACCOUNT_ID"] for r in rows]
        assert ids == sorted(ids), (
            f"{anchor['ACCOUNT_ID']} rows not sorted by HELD_AWAY_ACCOUNT_ID: {ids}"
        )
        if len(rows) > 1:
            checked += 1
    # Need at least a few multi-row cases to exercise sort meaningfully.
    assert checked >= 3, f"only {checked} multi-row cases, need >=3"


def test_active_ratio_in_band(in_audience_anchors):
    """Sample 100 rows, IS_ACTIVE rate is in band [0.85, 0.99] (target 0.92)."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    rows = []
    for anchor in in_audience_anchors:
        for m in range(1, 13):
            rows.extend(_rows_for(anchor, datetime(2026, m, 1)))
            if len(rows) >= 200:
                break
        if len(rows) >= 200:
            break
    sample = rows[:200]
    active_rate = sum(1 for r in sample if r["IS_ACTIVE"]) / len(sample)
    assert 0.85 <= active_rate <= 0.99, (
        f"active rate {active_rate:.2%} out of band [0.85, 0.99]"
    )


def test_inactive_rows_have_null_txn_and_flow(in_audience_anchors):
    """When IS_ACTIVE=False, LAST_TRANSACTION_DATE and MONTHLY_NET_FLOW_USD
    are both None. Inverse: when IS_ACTIVE=True, both populated."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    inactive_seen, active_seen = 0, 0
    for anchor in in_audience_anchors:
        for m in range(1, 13):
            for r in _rows_for(anchor, datetime(2026, m, 1)):
                if r["IS_ACTIVE"] is False:
                    assert r["LAST_TRANSACTION_DATE"] is None, (
                        f"inactive row has non-null LAST_TRANSACTION_DATE: "
                        f"{r['LAST_TRANSACTION_DATE']!r}"
                    )
                    assert r["MONTHLY_NET_FLOW_USD"] is None, (
                        f"inactive row has non-null MONTHLY_NET_FLOW_USD: "
                        f"{r['MONTHLY_NET_FLOW_USD']!r}"
                    )
                    inactive_seen += 1
                else:
                    assert r["LAST_TRANSACTION_DATE"] is not None
                    assert r["MONTHLY_NET_FLOW_USD"] is not None
                    active_seen += 1
    assert inactive_seen >= 5, (
        f"too few inactive rows in 12-month roll: {inactive_seen}; "
        f"distribution looks off"
    )
    assert active_seen >= 50, f"too few active rows: {active_seen}"


def test_investment_risk_tier_null_unless_investment_type(in_audience_anchors):
    """INVESTMENT_RISK_TIER is None unless ACCOUNT_TYPE in
    {Brokerage, IRA, 401k, HSA}, and populated when it is (per rowspec)."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        for m in range(1, 13):
            for r in _rows_for(anchor, datetime(2026, m, 1)):
                if r["ACCOUNT_TYPE"] in _INVESTMENT_TYPES:
                    assert r["INVESTMENT_RISK_TIER"] is not None, (
                        f"{r['ACCOUNT_TYPE']} should have risk tier, got None"
                    )
                else:
                    assert r["INVESTMENT_RISK_TIER"] is None, (
                        f"non-investment {r['ACCOUNT_TYPE']} has risk tier "
                        f"{r['INVESTMENT_RISK_TIER']!r}"
                    )


def test_interest_rate_null_unless_rate_bearing(in_audience_anchors):
    """INTEREST_RATE_PCT is None unless ACCOUNT_TYPE in
    {Savings, Mortgage, Auto Loan, Credit Card}."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        for m in range(1, 13):
            for r in _rows_for(anchor, datetime(2026, m, 1)):
                if r["ACCOUNT_TYPE"] in _RATE_BEARING:
                    assert r["INTEREST_RATE_PCT"] is not None, (
                        f"{r['ACCOUNT_TYPE']} should have rate, got None"
                    )
                else:
                    assert r["INTEREST_RATE_PCT"] is None, (
                        f"non-rate-bearing {r['ACCOUNT_TYPE']} has rate "
                        f"{r['INTEREST_RATE_PCT']!r}"
                    )


def test_loan_accounts_have_negative_balance(in_audience_anchors):
    """Mortgage / Auto Loan / Credit Card rows have BALANCE_USD < 0."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    seen = 0
    for anchor in in_audience_anchors:
        for m in range(1, 13):
            for r in _rows_for(anchor, datetime(2026, m, 1)):
                if r["ACCOUNT_TYPE"] in _LOAN_TYPES:
                    assert r["BALANCE_USD"] < 0, (
                        f"{r['ACCOUNT_TYPE']} has non-negative balance: "
                        f"{r['BALANCE_USD']!r}"
                    )
                    seen += 1
    assert seen >= 3, f"too few loan rows seen ({seen}) — distribution off"


def test_institution_type_cohesion(in_audience_anchors):
    """`_INSTITUTIONS` mapping is respected: each (name, type) pair in the
    output must match the canonical mapping."""
    canonical = dict(_INSTITUTIONS)
    if not in_audience_anchors:
        pytest.skip("empty audience")
    seen_names = set()
    for anchor in in_audience_anchors:
        for m in range(1, 13):
            for r in _rows_for(anchor, datetime(2026, m, 1)):
                name = r["INSTITUTION_NAME"]
                expected_type = canonical.get(name)
                assert expected_type is not None, (
                    f"unknown institution name: {name!r}"
                )
                assert r["INSTITUTION_TYPE"] == expected_type, (
                    f"{name} has type {r['INSTITUTION_TYPE']!r}, "
                    f"expected {expected_type!r}"
                )
                seen_names.add(name)
    # Should sample many institutions across the audience.
    assert len(seen_names) >= 10, (
        f"only {len(seen_names)} distinct institutions seen — "
        f"distribution looks narrow"
    )
