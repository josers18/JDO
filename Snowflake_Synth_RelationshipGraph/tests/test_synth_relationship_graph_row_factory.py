"""L1 tests for the Synth Relationship Graph row factory.

Second **1:N** dataset in the Cumulus rollout (Plan 6 was first), and the
**only edge-scoped** dataset — `_rows_for(anchor, run_ts, ...)` returns a
sorted list of 1-N edge dicts where the row identity is the directed-edge
tuple `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)`, not an account-anchored
single key.

Six property classes per rowspec §"Anchor-influence test target" — Plan 9
deviates from Plans 1-7's distributional rate-convergence tests because the
unit-test environment lacks Claritas/D&B/BoardEx, so most anchors SELF-fall-back.
Tests target per-anchor and per-row invariants instead:
  1. Determinism (same inputs + week-bucketing) — multi-row equality
  2. Audience scoping (empty/missing ACCOUNT_ID raises)
  3. SELF-fallback semantics (unconditional safety net; never `[]`)
  4. EDGE_TYPE invariants (canonical set, SELF identity, non-SELF bounds)
  5. Date-coherence (last_seen >= discovered; SELF dates anchored on week_start)
  6. Schema contract — output dict keys EXACTLY match the 9 table columns
     plus EXPECTED_OUTPUT_COLUMNS in the SP module matches.

Plus bonus tests:
  - METADATA is str or None per row
  - GENERATED_AT equals week_start datetime
  - Edge-count distribution: with `lookup_tables=None` mean rows ~= 1.0 (every
    anchor SELF-falls-back).
"""
from datetime import date, datetime, timedelta

import pytest

# Imports from the SP module (T4 builds it).
from sp_generate_synth_relationship_graph import (
    _rows_for,
    _anchor_in_audience,
    EXPECTED_OUTPUT_COLUMNS,
)


# Canonical 7-value EDGE_TYPE set — matches rowspec §"EDGE_TYPE values".
_ALL_EDGE_TYPES = frozenset({
    "SELF", "HOUSEHOLD", "CORPORATE_PARENT", "BOARD_MEMBER",
    "ADVISOR_BOOK", "REFERRAL", "BUSINESS_OWNER",
})

# Per-type weight bands from rowspec `_EDGE_TYPE_WEIGHT_BAND`.
_WEIGHT_BAND = {
    "HOUSEHOLD":         (0.80, 1.00),
    "CORPORATE_PARENT":  (0.90, 1.00),
    "BOARD_MEMBER":      (0.55, 0.85),
    "ADVISOR_BOOK":      (0.40, 0.70),
    "REFERRAL":          (0.30, 0.60),
    "BUSINESS_OWNER":    (0.85, 1.00),
    "SELF":              (1.00, 1.00),
}


def _week_start(run_ts: datetime) -> datetime:
    """Mirror rowspec `_week_start` — floor `run_ts` to Monday 00:00."""
    monday = run_ts - timedelta(days=run_ts.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


# ---------- Property 1: Determinism ----------

def test_determinism_same_inputs_same_list(in_audience_anchors, available_edge_types):
    """Same (anchor, ts, available_edge_types) -> same list, dict-by-dict, same order."""
    ts = datetime(2026, 5, 4)  # Monday
    for anchor in in_audience_anchors[:5]:
        a = _rows_for(anchor, ts, available_edge_types=available_edge_types)
        b = _rows_for(anchor, ts, available_edge_types=available_edge_types)
        assert a == b, f"non-deterministic for {anchor['ACCOUNT_ID']}"
        assert len(a) == len(b)


def test_determinism_buckets_by_week(in_audience_anchors, available_edge_types):
    """Different timestamps within the same calendar week -> identical output.
    Mid-week and end-of-week re-runs collapse to the Monday seed via `week_start`."""
    anchor = in_audience_anchors[0]
    monday = datetime(2026, 5, 4, 0, 0, 0)
    wednesday = datetime(2026, 5, 6, 12, 0, 0)
    sunday = datetime(2026, 5, 10, 23, 30, 0)
    a = _rows_for(anchor, monday, available_edge_types=available_edge_types)
    b = _rows_for(anchor, wednesday, available_edge_types=available_edge_types)
    c = _rows_for(anchor, sunday, available_edge_types=available_edge_types)
    assert a == b, "Wednesday mid-week re-run differs from Monday"
    assert a == c, "Sunday end-of-week re-run differs from Monday"


# ---------- Property 2: Audience scoping ----------

def test_audience_violators_raise_value_error():
    """Empty/missing ACCOUNT_ID is the only audience-violation mode (1=1 audience).
    Defense-in-depth: row factory raises rather than emitting a blank-src edge."""
    ts = datetime(2026, 5, 4)
    bad_anchors = [
        {"ACCOUNT_ID": ""},
        {"ACCOUNT_ID": None},
        {},  # missing entirely
    ]
    for bad in bad_anchors:
        assert _anchor_in_audience(bad) is False, (
            f"_anchor_in_audience should reject {bad!r}"
        )
        with pytest.raises(ValueError):
            _rows_for(bad, ts, available_edge_types={"SELF"})


def test_every_anchor_emits_at_least_one_row(in_audience_anchors, available_edge_types):
    """Every anchor in the all-accounts audience produces >= 1 row.
    Coverage invariant — guaranteed by the SELF-fallback when no other edge applies."""
    ts = datetime(2026, 5, 4)
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, ts, available_edge_types=available_edge_types)
        assert rows, f"empty rows for {anchor['ACCOUNT_ID']}"
        assert len(rows) >= 1


# ---------- Property 3: SELF-fallback semantics ----------

def test_self_fallback_when_no_other_edges(in_audience_anchors):
    """`available_edge_types=set()` strips every emit branch — the unconditional
    SELF-fallback fires. Returns exactly `[r]` with the SELF identity."""
    ts = datetime(2026, 5, 4)
    for anchor in in_audience_anchors[:10]:
        rows = _rows_for(anchor, ts, available_edge_types=set())
        assert len(rows) == 1, (
            f"expected exactly 1 SELF row for {anchor['ACCOUNT_ID']}, got {len(rows)}"
        )
        r = rows[0]
        assert r["EDGE_TYPE"] == "SELF"
        assert r["SRC_ACCOUNT_ID"] == r["DST_ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
        assert r["EDGE_WEIGHT"] == 1.000
        assert r["CONFIDENCE_PCT"] == 100.00


def test_self_fallback_when_lookup_tables_none(in_audience_anchors, available_edge_types):
    """The fallback fires whenever non-SELF edges fail to materialize, NOT only
    when SELF is absent from `available_edge_types`. With `lookup_tables=None`,
    HOUSEHOLD/CORPORATE_PARENT/BOARD_MEMBER/ADVISOR_BOOK/REFERRAL/BUSINESS_OWNER
    all short-circuit; every anchor lands on SELF."""
    ts = datetime(2026, 5, 4)
    for anchor in in_audience_anchors[:10]:
        rows = _rows_for(
            anchor, ts,
            available_edge_types=available_edge_types,
            lookup_tables=None,
        )
        assert len(rows) >= 1
        # No empty-list returns ever.
        # If any non-SELF type emits without lookups (rowspec ambiguity), we
        # still must have >=1 row total.


def test_self_emitted_only_as_fallback(in_audience_anchors, available_edge_types):
    """SELF is the unconditional fallback — present iff no other edge type fired
    for the anchor. With `lookup_tables=None` and the full 7-value set, every
    anchor's rows should contain exactly one SELF (since non-SELF types need
    lookups they don't have)."""
    ts = datetime(2026, 5, 4)
    for anchor in in_audience_anchors[:10]:
        rows = _rows_for(
            anchor, ts,
            available_edge_types=available_edge_types,
            lookup_tables=None,
        )
        self_rows = [r for r in rows if r["EDGE_TYPE"] == "SELF"]
        non_self_rows = [r for r in rows if r["EDGE_TYPE"] != "SELF"]
        if non_self_rows:
            # If any non-SELF edge synthesizes without lookups, SELF must be absent.
            assert not self_rows, (
                f"{anchor['ACCOUNT_ID']} emitted both non-SELF and SELF rows; "
                f"SELF should fire only as fallback"
            )
        else:
            assert len(self_rows) == 1, (
                f"{anchor['ACCOUNT_ID']} has no non-SELF rows but {len(self_rows)} SELF rows"
            )


# ---------- Property 4: EDGE_TYPE invariants ----------

def test_edge_types_in_canonical_set(in_audience_anchors, available_edge_types):
    """Every emitted row's EDGE_TYPE is one of the 7 canonical values."""
    ts = datetime(2026, 5, 4)
    for anchor in in_audience_anchors[:10]:
        rows = _rows_for(anchor, ts, available_edge_types=available_edge_types)
        for r in rows:
            assert r["EDGE_TYPE"] in _ALL_EDGE_TYPES, (
                f"{anchor['ACCOUNT_ID']} emitted unknown EDGE_TYPE {r['EDGE_TYPE']!r}"
            )


def test_self_edge_invariants(in_audience_anchors):
    """For every SELF row: SRC=DST, weight exactly 1.000, confidence exactly 100.00."""
    ts = datetime(2026, 5, 4)
    seen = 0
    for anchor in in_audience_anchors[:20]:
        rows = _rows_for(anchor, ts, available_edge_types=set())
        for r in rows:
            if r["EDGE_TYPE"] == "SELF":
                assert r["SRC_ACCOUNT_ID"] == r["DST_ACCOUNT_ID"]
                assert r["EDGE_WEIGHT"] == 1.000
                assert r["CONFIDENCE_PCT"] == 100.00
                seen += 1
    assert seen >= 1, "no SELF rows seen — fallback path not exercised"


def test_non_self_edge_invariants(in_audience_anchors, available_edge_types):
    """For every non-SELF row: SRC != DST, weight in type's band, confidence in [50, 99].

    Skip cleanly when no non-SELF edges materialize (the L1-default case
    when `lookup_tables=None`).
    """
    ts = datetime(2026, 5, 4)
    non_self_seen = 0
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, ts, available_edge_types=available_edge_types)
        for r in rows:
            if r["EDGE_TYPE"] == "SELF":
                continue
            assert r["SRC_ACCOUNT_ID"] != r["DST_ACCOUNT_ID"], (
                f"non-SELF row has SRC=DST: {r}"
            )
            lo, hi = _WEIGHT_BAND[r["EDGE_TYPE"]]
            assert lo <= r["EDGE_WEIGHT"] <= hi, (
                f"{r['EDGE_TYPE']} weight {r['EDGE_WEIGHT']} out of band [{lo}, {hi}]"
            )
            # Rowspec clamps non-SELF confidence to [30.00, 99.99]; loosen the
            # asserted band slightly (50.00, 99.00) per the task spec property #4.
            assert 50.00 <= r["CONFIDENCE_PCT"] <= 99.00, (
                f"{r['EDGE_TYPE']} confidence {r['CONFIDENCE_PCT']} out of [50, 99]"
            )
            non_self_seen += 1
    if non_self_seen == 0:
        pytest.skip(
            "no non-SELF edges materialized in L1 (lookup_tables=None default); "
            "non-SELF bounds covered by L2/L3 with populated cross-plan tables"
        )


# ---------- Property 5: Date-coherence ----------

def test_edge_last_seen_equals_run_ts_week_start(in_audience_anchors):
    """SELF rows: EDGE_LAST_SEEN_DATE == EDGE_DISCOVERED_DATE == week_start.date().
    Per rowspec _edge_dates: SELF anchors both dates on the run-week's Monday."""
    ts = datetime(2026, 5, 6, 12, 0, 0)  # Wednesday
    expected = _week_start(ts).date()
    for anchor in in_audience_anchors[:20]:
        rows = _rows_for(anchor, ts, available_edge_types=set())
        for r in rows:
            if r["EDGE_TYPE"] == "SELF":
                assert r["EDGE_LAST_SEEN_DATE"] == expected, (
                    f"SELF EDGE_LAST_SEEN_DATE {r['EDGE_LAST_SEEN_DATE']} "
                    f"!= week_start {expected}"
                )
                assert r["EDGE_DISCOVERED_DATE"] == expected


def test_edge_discovered_le_last_seen(in_audience_anchors, available_edge_types):
    """For every emitted row: EDGE_DISCOVERED_DATE <= EDGE_LAST_SEEN_DATE."""
    ts = datetime(2026, 5, 4)
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, ts, available_edge_types=available_edge_types)
        for r in rows:
            assert r["EDGE_DISCOVERED_DATE"] <= r["EDGE_LAST_SEEN_DATE"], (
                f"{r['EDGE_TYPE']}: discovered {r['EDGE_DISCOVERED_DATE']} > "
                f"last_seen {r['EDGE_LAST_SEEN_DATE']}"
            )
            assert isinstance(r["EDGE_DISCOVERED_DATE"], date)
            assert isinstance(r["EDGE_LAST_SEEN_DATE"], date)


# ---------- Property 6: Schema contract ----------

EXPECTED_KEYS = frozenset({
    "SRC_ACCOUNT_ID", "DST_ACCOUNT_ID", "EDGE_TYPE",
    "EDGE_WEIGHT", "CONFIDENCE_PCT",
    "EDGE_DISCOVERED_DATE", "EDGE_LAST_SEEN_DATE",
    "METADATA", "GENERATED_AT",
})


def test_output_schema_matches_table(in_audience_anchors, available_edge_types):
    """Each row's keys EXACTLY match the 9 table columns."""
    ts = datetime(2026, 5, 4)
    rows = _rows_for(
        in_audience_anchors[0], ts, available_edge_types=available_edge_types,
    )
    assert rows
    for row in rows:
        assert set(row.keys()) == EXPECTED_KEYS, (
            f"row keys {sorted(row.keys())} != expected {sorted(EXPECTED_KEYS)}"
        )


def test_output_schema_constant_matches_test_set():
    """Defense against EXPECTED_OUTPUT_COLUMNS in the SP module drifting away
    from this test's EXPECTED_KEYS — they must be the same set."""
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS, (
        "SP module's EXPECTED_OUTPUT_COLUMNS drifted from test's EXPECTED_KEYS"
    )


# ---------- Bonus tests ----------

def test_metadata_is_str_or_none(in_audience_anchors, available_edge_types):
    """METADATA column is either a str (JSON-ish blob) or None per row."""
    ts = datetime(2026, 5, 4)
    for anchor in in_audience_anchors[:20]:
        rows = _rows_for(anchor, ts, available_edge_types=available_edge_types)
        for r in rows:
            assert r["METADATA"] is None or isinstance(r["METADATA"], str), (
                f"{r['EDGE_TYPE']} METADATA is "
                f"{type(r['METADATA']).__name__}, expected str or None"
            )


def test_generated_at_is_datetime_at_week_start(in_audience_anchors, available_edge_types):
    """GENERATED_AT == _week_start(run_ts) — Monday 00:00 of the run week."""
    ts = datetime(2026, 5, 6, 12, 30, 0)  # Wednesday afternoon
    expected = _week_start(ts)
    for anchor in in_audience_anchors[:10]:
        rows = _rows_for(anchor, ts, available_edge_types=available_edge_types)
        for r in rows:
            assert isinstance(r["GENERATED_AT"], datetime)
            assert r["GENERATED_AT"] == expected, (
                f"GENERATED_AT {r['GENERATED_AT']} != week_start {expected}"
            )


def test_edge_count_distribution_smoke(in_audience_anchors, available_edge_types):
    """With `lookup_tables=None` and the full 7-value `available_edge_types`,
    most anchors fall back to SELF — mean rows per anchor ~= 1.0.

    Per AGENTS.md: "with L1's empty cross-plan tables the mean will be 1.0".
    Allow a small upper margin in case ADVISOR_BOOK/REFERRAL/BUSINESS_OWNER
    can synthesize without lookups in the SP implementation (rowspec is
    ambiguous on that — see ambiguity note in T3 report).
    """
    ts = datetime(2026, 5, 4)
    counts = []
    for anchor in in_audience_anchors:
        rows = _rows_for(
            anchor, ts,
            available_edge_types=available_edge_types,
            lookup_tables=None,
        )
        counts.append(len(rows))
    mean_count = sum(counts) / len(counts)
    # Inclusive [1, 5] band per rowspec §"Anchor-influence test target" #6.
    assert 1.0 <= mean_count <= 5.0, (
        f"mean rows/anchor {mean_count:.2f} out of band [1.0, 5.0]"
    )
    # No anchor returns 0 rows.
    assert min(counts) >= 1, f"some anchor returned 0 rows: min={min(counts)}"
