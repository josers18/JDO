"""L1 tests for the UserGems Job Changes row factory (Plan 15 Task 3).

Contract with the SP module (procedures/sp_generate_usergems_job_changes.py):
  _events_for(anchor, event_month, boardex_rise, ctx) -> list[dict]
      Every event with EVENT_DATE in event_month for this anchor, including
      paired Joined mirrors written to another account. [] is the normal case.
  _rows_for_week(anchors, week_start, run_ts, boardex, ctx) -> list[dict]
      Events with DETECTED_DATE in [week_start, min(week_start+6, run date)].
  _boardex_rise(boardex, account_id, month) -> bool
      flag(M) TRUE and flag(M-1) present and FALSE. A missing M or M-1 row is
      NOT a rise.
  _csuite_gate_violations(rows, boardex, run_date, window_start) -> list[str]
      Python mirror of _assert_event_contract (d).

Property classes (plan section 4 Task 3, rowspec "L1 property targets"):
  1  Determinism (same inputs; same event from any computing week)
  2  Sparsity
  3/4c BoardEx gate (bidirectional: rise => exactly one C-suite departure,
       non-rise => zero)
  4a Range   4b Vocabulary   4d Pairing   4e Cross-field
  5  Lag-window completeness
  6  Boring case
  plus schema, audience, record_id parity and draw-order discipline.
"""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from tests.conftest import (
    BORING_ANCHOR,
    EMPLOYERS,
    WEALTH_POOL,
    make_boardex,
    months_between,
)
from sp_generate_usergems_job_changes import (
    EXPECTED_OUTPUT_COLUMNS,
    Ctx,
    _CSUITE,
    _MAX_DETECTION_LAG_DAYS,
    _MAX_MIRROR_OFFSET_DAYS,
    _PERSONAS,
    _anchor_in_audience,
    _boardex_months_for_week,
    _boardex_rise,
    _candidate_months,
    _csuite_gate_violations,
    _event_id,
    _events_for,
    _record_id_for,
    _roster_for,
    _rows_for_week,
)

MONTHS_24 = months_between(date(2024, 11, 1), date(2026, 10, 1))
FAR_FUTURE = datetime(2030, 1, 1)

EVENT_TYPES = {"Departed", "Joined", "Promoted"}
SENIORITIES = {"C-Suite", "VP", "Director", "Manager"}
STATUSES = {"Existing Client", "Prospect", "Unknown", "Not Applicable"}
ALL_TITLES = {t for (_s, bank, _f) in _PERSONAS.values() for t in bank}
EMPLOYER_IDS = {a["ACCOUNT_ID"] for a in EMPLOYERS + [BORING_ANCHOR]}


def _is_csuite_departure(ev):
    return ev["EVENT_TYPE"] == "Departed" and ev["SENIORITY"] == "C-Suite"


def _all_events(ctx, anchors=EMPLOYERS, months=MONTHS_24, rise=False):
    out = []
    for a in anchors:
        for m in months:
            out += _events_for(a, m, rise, ctx)
    return out


@pytest.fixture(scope="module")
def big_ctx():
    """A wider pool (10 fixture employers + 200 synthetic) so pairing and
    Wealth paths fire often enough to test their invariants."""
    extra = [
        {"ORG_ID": "JDO", "ACCOUNT_ID": f"001UGX{n:012d}", "ACCOUNT_NAME": f"Synthetic Co {n}",
         "ACCOUNT_TYPE_FLAG": "BUSINESS", "CLIENT_CATEGORY": "Small Business",
         "INDUSTRY": ["Restaurant", "Technology", "Manufacturing", None][n % 4],
         "EMPLOYEE_COUNT": [5, 40, 150, 600, 3000][n % 5]}
        for n in range(200)
    ]
    return Ctx(EMPLOYERS + extra, WEALTH_POOL), EMPLOYERS + extra


@pytest.fixture(scope="module")
def big_events(big_ctx):
    """24 months x 210 anchors with a rise in every 3rd month per anchor."""
    ctx, anchors = big_ctx
    out = []
    for i, a in enumerate(anchors):
        for j, m in enumerate(MONTHS_24):
            out += _events_for(a, m, (i + j) % 3 == 0, ctx)
    return out


# ---------------------------------------------------------------------------
# Schema, audience, identity
# ---------------------------------------------------------------------------

def test_schema_22_data_columns(ctx, big_events):
    assert len(EXPECTED_OUTPUT_COLUMNS) == 22
    assert "ORG_ID" not in EXPECTED_OUTPUT_COLUMNS
    assert "RECORD_ID" not in EXPECTED_OUTPUT_COLUMNS
    assert big_events
    for ev in big_events:
        assert set(ev) == EXPECTED_OUTPUT_COLUMNS


def test_out_of_audience_anchor_raises(ctx, out_of_audience_anchors):
    for a in out_of_audience_anchors:
        assert not _anchor_in_audience(a)
        with pytest.raises(ValueError):
            _events_for(a, date(2026, 1, 1), False, ctx)


def test_in_audience_fixture(employers, boring_anchor):
    assert all(_anchor_in_audience(a) for a in employers + [boring_anchor])


def test_fixture_spans_all_five_bands(employers):
    sizes = Counter(len(_roster_for(a["EMPLOYEE_COUNT"])) for a in employers)
    assert sizes == {2: 2, 3: 2, 5: 2, 8: 2, 12: 2}


def test_record_id_matches_cumulus_common():
    from cumulus_common.record_id import record_id_for
    args = ("001UG0000000001AAA", "2026-01-01", "3", "hazard")
    assert _record_id_for(*args) == record_id_for(*args)
    assert _event_id("001UG0000000001AAA", date(2026, 1, 1), 3, "hazard") == record_id_for(*args)


def test_event_ids_unique_and_kind_specific(big_events):
    ids = [ev["EVENT_ID"] for ev in big_events]
    assert len(ids) == len(set(ids))
    a = "001UG0000000001AAA"
    m = date(2026, 1, 1)
    assert len({_event_id(a, m, 0, k) for k in ("hazard", "csuite", "pair")}) == 3


def test_roster_always_has_a_csuite_persona():
    for n in (None, 0, 1, 10, 11, 50, 51, 200, 201, 1000, 1001, 50000):
        roster = _roster_for(n)
        assert roster[0] == "CEO-Owner"
        assert any(p in _CSUITE for p in roster)
    assert len(_roster_for(5000)) == 12


# ---------------------------------------------------------------------------
# 1  Determinism
# ---------------------------------------------------------------------------

def test_events_for_deterministic(ctx):
    for a in EMPLOYERS:
        for m in MONTHS_24[:6]:
            for rise in (False, True):
                assert _events_for(a, m, rise, ctx) == _events_for(a, m, rise, ctx)


def test_event_month_normalised(ctx):
    a = EMPLOYERS[9]
    assert _events_for(a, date(2026, 3, 17), True, ctx) == _events_for(a, date(2026, 3, 1), True, ctx)
    assert _events_for(a, datetime(2026, 3, 9, 7), True, ctx) == _events_for(a, date(2026, 3, 1), True, ctx)


def test_numeric_coercion(ctx):
    a = EMPLOYERS[8]
    m = date(2026, 2, 1)
    base = _events_for(a, m, True, ctx)
    for v in (Decimal("2500"), "2500", 2500.0):
        assert _events_for(dict(a, EMPLOYEE_COUNT=v), m, True, ctx) == base


def test_same_event_from_any_computing_week(ctx):
    """An event of month M is detected over several weeks; the row emitted by
    each week (and by _events_for directly) is byte-identical, and the EVENT_ID
    set of month M does not depend on the week."""
    m = date(2026, 3, 1)
    months = months_between(date(2025, 11, 1), date(2026, 6, 1))
    rises = {(EMPLOYERS[9]["ACCOUNT_ID"], m)}
    bx = make_boardex(EMPLOYERS, months, true_cells=rises)
    direct = {}
    for a in EMPLOYERS:
        for ev in _events_for(a, m, _boardex_rise(bx, a["ACCOUNT_ID"], m), ctx):
            direct[ev["EVENT_ID"]] = ev
    assert direct
    seen = {}
    week = date(2026, 2, 23)
    while week <= date(2026, 6, 1):
        for ev in _rows_for_week(EMPLOYERS, week, FAR_FUTURE, bx, ctx):
            if ev["EVENT_ID"] in direct:
                assert ev == direct[ev["EVENT_ID"]]
                seen[ev["EVENT_ID"]] = ev
        week += timedelta(days=7)
    assert set(seen) == set(direct)


def test_rows_for_week_deterministic_across_run_ts(ctx):
    months = months_between(date(2025, 10, 1), date(2026, 4, 1))
    bx = make_boardex(EMPLOYERS, months, true_cells={(a["ACCOUNT_ID"], date(2026, 2, 1)) for a in EMPLOYERS})
    week = date(2026, 3, 2)
    r1 = _rows_for_week(EMPLOYERS, week, datetime(2026, 3, 9, 9), bx, ctx)
    r2 = _rows_for_week(EMPLOYERS, week, datetime(2026, 3, 30, 23, 59), bx, ctx)
    assert r1 == r2 and r1


# ---------------------------------------------------------------------------
# 2  Sparsity
# ---------------------------------------------------------------------------

def test_sparsity_with_no_rises(ctx):
    pairs = [(a, m) for a in EMPLOYERS for m in MONTHS_24]
    nonempty = sum(1 for a, m in pairs if _events_for(a, m, False, ctx))
    assert nonempty / len(pairs) <= 0.10
    assert nonempty > 0  # the hazard path still fires


# ---------------------------------------------------------------------------
# 3 / 4c  BoardEx gate — bidirectional
# ---------------------------------------------------------------------------

def test_boardex_rise_definition():
    a, m, prev = "A", date(2026, 3, 1), date(2026, 2, 1)
    assert _boardex_rise({(a, m): True, (a, prev): False}, a, m)
    assert not _boardex_rise({(a, m): True, (a, prev): True}, a, m)     # stay
    assert not _boardex_rise({(a, m): False, (a, prev): True}, a, m)    # fall
    assert not _boardex_rise({(a, m): False, (a, prev): False}, a, m)
    assert not _boardex_rise({(a, m): True}, a, m)                      # pre-history
    assert not _boardex_rise({(a, prev): False}, a, m)                  # month missing
    assert not _boardex_rise({}, a, m)
    assert not _boardex_rise({(a, m): True, (a, prev): None}, a, m)
    # January looks back to December of the prior year.
    assert _boardex_rise({(a, date(2026, 1, 1)): True, (a, date(2025, 12, 1)): False}, a, date(2026, 1, 1))


def test_gate_rise_emits_exactly_one_csuite_departure(ctx):
    for a in EMPLOYERS + [BORING_ANCHOR]:
        for m in MONTHS_24:
            evs = _events_for(a, m, True, ctx)
            cs = [e for e in evs if _is_csuite_departure(e)]
            assert len(cs) == 1, (a["ACCOUNT_ID"], m)
            assert cs[0]["ACCOUNT_ID"] == a["ACCOUNT_ID"]
            assert cs[0]["CONTACT_PERSONA"] in _CSUITE
            assert cs[0]["CONTACT_PERSONA"] in _roster_for(a["EMPLOYEE_COUNT"])


def test_gate_non_rise_emits_zero_csuite_departures(ctx):
    evs = _all_events(ctx, EMPLOYERS + [BORING_ANCHOR], MONTHS_24, rise=False)
    assert evs
    assert not [e for e in evs if _is_csuite_departure(e)]


@pytest.mark.parametrize("default", [False, True])
def test_gate_flat_boardex_has_no_rises(ctx, default):
    """All-FALSE and all-TRUE BoardEx both mean zero rises, so zero C-suite
    departures over 24 synthetic months x 10 anchors."""
    months = months_between(date(2024, 6, 1), date(2026, 11, 1))
    bx = make_boardex(EMPLOYERS, months, default=default)
    rows = []
    week = date(2024, 11, 4)
    while week <= date(2026, 10, 26):
        rows += _rows_for_week(EMPLOYERS, week, FAR_FUTURE, bx, ctx)
        week += timedelta(days=7)
    assert rows
    assert not [e for e in rows if _is_csuite_departure(e)]


def test_gate_known_rises_via_weekly_path(ctx):
    """Known rise cells (plus a stay, a fall and a pre-history TRUE) through the
    week path: each rise month has exactly one C-suite departure, and no other
    (account, month) has any."""
    months = months_between(date(2025, 6, 1), date(2026, 8, 1))
    a0, a5, a9 = (EMPLOYERS[i]["ACCOUNT_ID"] for i in (0, 5, 9))
    true_cells = {
        (a0, date(2025, 9, 1)),                                   # rise
        (a5, date(2025, 12, 1)), (a5, date(2026, 1, 1)),          # rise then stay
        (a9, date(2026, 1, 1)), (a9, date(2026, 3, 1)),           # two rises
        (a9, date(2025, 6, 1)),                                   # first month: pre-history, not a rise
    }
    bx = make_boardex(EMPLOYERS, months, true_cells=true_cells)
    rises = {(a["ACCOUNT_ID"], m) for a in EMPLOYERS for m in months if _boardex_rise(bx, a["ACCOUNT_ID"], m)}
    assert rises == {(a0, date(2025, 9, 1)), (a5, date(2025, 12, 1)),
                     (a9, date(2026, 1, 1)), (a9, date(2026, 3, 1))}
    rows = []
    week = date(2025, 7, 7)
    while week <= date(2026, 6, 29):
        rows += _rows_for_week(EMPLOYERS, week, FAR_FUTURE, bx, ctx)
        week += timedelta(days=7)
    cs = Counter((e["ACCOUNT_ID"], e["EVENT_DATE"].replace(day=1)) for e in rows if _is_csuite_departure(e))
    assert cs == {r: 1 for r in rises}


def test_gate_does_not_shift_hazard_events(ctx):
    """Draw-order discipline: the rise branch runs after the hazard loop, so
    the hazard events of an account-month are identical with and without a
    rise (the rise only adds the C-suite departure and its mirror)."""
    for a in EMPLOYERS:
        for m in MONTHS_24:
            off = _events_for(a, m, False, ctx)
            on = _events_for(a, m, True, ctx)
            on_hazard = [e for e in on if not _is_csuite_departure(e)
                         and not (e["PAIRED_EVENT_ID"] and any(
                             _is_csuite_departure(x) and x["EVENT_ID"] == e["PAIRED_EVENT_ID"] for x in on))]
            assert on_hazard == off


def test_csuite_gate_violations_helper(ctx):
    months = months_between(date(2025, 6, 1), date(2026, 8, 1))
    a9 = EMPLOYERS[9]["ACCOUNT_ID"]
    bx = make_boardex(EMPLOYERS, months, true_cells={(a9, date(2026, 1, 1))})
    rows = []
    week = date(2025, 12, 29)
    while week <= date(2026, 6, 29):
        rows += _rows_for_week(EMPLOYERS, week, FAR_FUTURE, bx, ctx)
        week += timedelta(days=7)
    run_date, window_start = date(2026, 7, 5), date(2025, 12, 29)
    assert _csuite_gate_violations(rows, bx, run_date, window_start) == []
    # Drop the C-suite departure: the complete, in-window rise month is now missing it.
    missing = [e for e in rows if not _is_csuite_departure(e)]
    assert any("expected 1" in v for v in _csuite_gate_violations(missing, bx, run_date, window_start))
    # A C-suite departure in a non-rise month is a violation.
    cs = next(e for e in rows if _is_csuite_departure(e))
    stray = dict(cs, EVENT_ID="x", ACCOUNT_ID=EMPLOYERS[0]["ACCOUNT_ID"])
    assert any("non-rise" in v for v in _csuite_gate_violations(rows + [stray], bx, run_date, window_start))
    # A rise month too recent for detection to be complete is not required yet.
    assert _csuite_gate_violations(missing, bx, date(2026, 2, 15), window_start) == []
    # A rise month whose detection window starts before the backfill window is not required.
    assert _csuite_gate_violations(missing, bx, run_date, date(2026, 1, 5)) == []


# ---------------------------------------------------------------------------
# 4a Range / 4b Vocabulary
# ---------------------------------------------------------------------------

def test_4a_ranges(big_events):
    mirror_ids = {e["EVENT_ID"] for e in big_events if e["EVENT_TYPE"] == "Joined" and e["PAIRED_EVENT_ID"]}
    for e in big_events:
        assert 0 <= e["OPPORTUNITY_SCORE"] <= 100 and isinstance(e["OPPORTUNITY_SCORE"], int)
        assert 0 <= e["RELATIONSHIP_RISK_SCORE"] <= 100 and isinstance(e["RELATIONSHIP_RISK_SCORE"], int)
        lag = (e["DETECTED_DATE"] - e["EVENT_DATE"]).days
        cap = _MAX_DETECTION_LAG_DAYS + (_MAX_MIRROR_OFFSET_DAYS if e["EVENT_ID"] in mirror_ids else 0)
        assert 3 <= lag <= cap
        assert e["PROFILE_WEEK"] == e["DETECTED_DATE"] - timedelta(days=e["DETECTED_DATE"].weekday())
        assert e["PROFILE_WEEK"].weekday() == 0
        assert e["GENERATED_AT"] == datetime.combine(e["PROFILE_WEEK"], datetime.min.time())
        assert type(e["EVENT_DATE"]) is date and type(e["DETECTED_DATE"]) is date


def test_4b_vocabulary(big_events):
    for e in big_events:
        assert e["EVENT_TYPE"] in EVENT_TYPES
        assert e["SENIORITY"] in SENIORITIES
        assert e["CONTACT_PERSONA"] in _PERSONAS
        assert len(_PERSONAS) == 9
        assert e["NEW_EMPLOYER_STATUS"] in STATUSES
        for t in (e["OLD_TITLE"], e["NEW_TITLE"]):
            assert t is None or t in ALL_TITLES
        for b in ("WAS_CHAMPION", "WAS_PRIMARY_CONTACT", "LIQUIDITY_EVENT_FLAG"):
            assert type(e[b]) is bool
        first_last = e["CONTACT_NAME"].split(" ")
        assert len(first_last) >= 2 and all(first_last)
        for v in e.values():
            if isinstance(v, str):
                assert "&" not in v


def test_4b_all_types_and_statuses_reached(big_events):
    assert {e["EVENT_TYPE"] for e in big_events} == EVENT_TYPES
    assert {e["NEW_EMPLOYER_STATUS"] for e in big_events} == STATUSES
    assert {e["SENIORITY"] for e in big_events} == SENIORITIES


def test_4b_seniority_fixed_by_persona_except_promoted(big_events):
    order = ["Manager", "Director", "VP", "C-Suite"]
    for e in big_events:
        base = _PERSONAS[e["CONTACT_PERSONA"]][0]
        if e["EVENT_TYPE"] == "Promoted":
            assert e["SENIORITY"] == order[min(order.index(base) + 1, 3)]
            assert e["NEW_TITLE"] != e["OLD_TITLE"]
        else:
            assert e["SENIORITY"] == base


# ---------------------------------------------------------------------------
# 4d Pairing
# ---------------------------------------------------------------------------

def test_4d_pairs_cross_linked(big_events):
    by_id = {e["EVENT_ID"]: e for e in big_events}
    existing = [e for e in big_events if e["EVENT_TYPE"] == "Departed" and e["NEW_EMPLOYER_STATUS"] == "Existing Client"]
    assert len(existing) >= 10
    for d in existing:
        m = by_id[d["PAIRED_EVENT_ID"]]
        assert m["EVENT_TYPE"] == "Joined"
        assert m["ACCOUNT_ID"] == d["NEW_ACCOUNT_ID"] != d["ACCOUNT_ID"]
        assert m["PAIRED_EVENT_ID"] == d["EVENT_ID"]
        for k in ("CONTACT_NAME", "CONTACT_PERSONA", "SENIORITY", "OLD_TITLE", "NEW_TITLE",
                  "EVENT_DATE", "WAS_CHAMPION"):
            assert m[k] == d[k], k
        assert 0 <= (m["DETECTED_DATE"] - d["DETECTED_DATE"]).days <= _MAX_MIRROR_OFFSET_DAYS
        assert m["NEW_EMPLOYER_NAME"] is None and m["NEW_ACCOUNT_ID"] is None
        assert m["NEW_EMPLOYER_STATUS"] == "Not Applicable"
        assert m["WAS_PRIMARY_CONTACT"] is False
        assert m["PERSON_ACCOUNT_ID"] is None and m["LIQUIDITY_EVENT_FLAG"] is False
        assert d["NEW_ACCOUNT_ID"] in EMPLOYER_IDS or d["NEW_ACCOUNT_ID"].startswith("001UGX")
    # No PAIRED_EVENT_ID outside Existing Client departures and their mirrors.
    linked = {d["EVENT_ID"] for d in existing} | {d["PAIRED_EVENT_ID"] for d in existing}
    assert {e["EVENT_ID"] for e in big_events if e["PAIRED_EVENT_ID"]} == linked


def test_4d_mirror_id_derives_from_source_coordinates(big_events):
    for d in big_events:
        if d["EVENT_TYPE"] == "Departed" and d["NEW_EMPLOYER_STATUS"] == "Existing Client":
            m = d["EVENT_DATE"].replace(day=1)
            ids = {_event_id(d["ACCOUNT_ID"], m, s, "pair") for s in range(12)}
            assert d["PAIRED_EVENT_ID"] in ids


def test_4d_destination_prefers_same_industry(big_ctx, big_events):
    ctx, anchors = big_ctx
    ind = {a["ACCOUNT_ID"]: a["INDUSTRY"] for a in anchors}
    pool_size = Counter(a["INDUSTRY"] for a in anchors)
    same, fallback = [], []
    for d in big_events:
        if d["NEW_EMPLOYER_STATUS"] != "Existing Client":
            continue
        src = ind[d["ACCOUNT_ID"]]
        (same if src is not None and pool_size[src] >= 2 else fallback).append((src, ind[d["NEW_ACCOUNT_ID"]]))
    assert same and fallback
    # An industry with >= 2 anchors always keeps the move inside the industry.
    assert all(src == dst for src, dst in same)
    # NULL / single-member industries fall back to the full pool.
    assert len({dst for _src, dst in fallback}) >= 2


def test_4d_existing_client_name_is_destination_name(big_ctx, big_events):
    ctx, anchors = big_ctx
    names = {a["ACCOUNT_ID"]: a["ACCOUNT_NAME"] for a in anchors}
    for d in big_events:
        if d["NEW_EMPLOYER_STATUS"] == "Existing Client":
            assert d["NEW_EMPLOYER_NAME"] == names[d["NEW_ACCOUNT_ID"]]


def test_4d_single_member_pool_never_self_pairs():
    solo = dict(EMPLOYERS[9])
    ctx = Ctx([solo], WEALTH_POOL)
    for m in months_between(date(2020, 1, 1), date(2026, 12, 1)):
        for e in _events_for(solo, m, True, ctx):
            assert e["NEW_EMPLOYER_STATUS"] != "Existing Client"
            assert e["NEW_ACCOUNT_ID"] is None and e["PAIRED_EVENT_ID"] is None


# ---------------------------------------------------------------------------
# 4e Cross-field
# ---------------------------------------------------------------------------

def test_4e_cross_field(big_events):
    for e in big_events:
        if e["EVENT_TYPE"] == "Promoted":
            assert e["NEW_EMPLOYER_STATUS"] == "Not Applicable"
            assert e["NEW_EMPLOYER_NAME"] is None and e["NEW_ACCOUNT_ID"] is None
            assert e["OLD_TITLE"] is not None and e["NEW_TITLE"] is not None
        if e["EVENT_TYPE"] == "Departed":
            assert e["NEW_EMPLOYER_STATUS"] in {"Existing Client", "Prospect", "Unknown"}
            assert e["OLD_TITLE"] is not None
            if e["NEW_EMPLOYER_STATUS"] == "Unknown":
                assert e["NEW_TITLE"] is None and e["NEW_EMPLOYER_NAME"] is None
            else:
                assert e["NEW_TITLE"] is not None and e["NEW_EMPLOYER_NAME"]
            assert (e["NEW_ACCOUNT_ID"] is not None) == (e["NEW_EMPLOYER_STATUS"] == "Existing Client")
        if e["EVENT_TYPE"] == "Joined":
            assert e["NEW_EMPLOYER_STATUS"] == "Not Applicable"
            assert e["NEW_EMPLOYER_NAME"] is None and e["NEW_ACCOUNT_ID"] is None
            assert e["NEW_TITLE"] is not None
            assert e["WAS_PRIMARY_CONTACT"] is False
        if e["LIQUIDITY_EVENT_FLAG"]:
            assert e["PERSON_ACCOUNT_ID"] is not None
            assert e["EVENT_TYPE"] == "Departed" and e["SENIORITY"] in ("C-Suite", "VP")
        assert e["LIQUIDITY_EVENT_FLAG"] == (e["PERSON_ACCOUNT_ID"] is not None)
        if e["PERSON_ACCOUNT_ID"] is not None:
            assert e["PERSON_ACCOUNT_ID"] in WEALTH_POOL


def test_4e_inbound_joined_old_title_sometimes_null(big_events):
    inbound = [e for e in big_events if e["EVENT_TYPE"] == "Joined" and not e["PAIRED_EVENT_ID"]]
    assert inbound
    assert any(e["OLD_TITLE"] is None for e in inbound)
    assert any(e["OLD_TITLE"] is not None for e in inbound)
    assert all(e["WAS_CHAMPION"] is False for e in inbound)


def test_4e_liquidity_rate_and_pick(big_events):
    cv = [e for e in big_events if e["EVENT_TYPE"] == "Departed" and e["SENIORITY"] in ("C-Suite", "VP")]
    assert len(cv) >= 300
    rate = sum(e["LIQUIDITY_EVENT_FLAG"] for e in cv) / len(cv)
    assert 0.02 <= rate <= 0.12


def test_wealth_pick_order_independent():
    """The pool is sorted inside Ctx, so input order doesn't change picks."""
    a = EMPLOYERS[9]
    c1 = Ctx(EMPLOYERS, WEALTH_POOL)
    c2 = Ctx(list(reversed(EMPLOYERS)), sorted(WEALTH_POOL, reverse=True))
    for m in MONTHS_24:
        assert _events_for(a, m, True, c1) == _events_for(a, m, True, c2)


def test_empty_wealth_pool_guarded():
    ctx = Ctx(EMPLOYERS, [])
    evs = []
    for a in EMPLOYERS:
        for m in MONTHS_24:
            evs += _events_for(a, m, True, ctx)
    assert all(e["PERSON_ACCOUNT_ID"] is None and e["LIQUIDITY_EVENT_FLAG"] is False for e in evs)


# ---------------------------------------------------------------------------
# Bias: size scaling and champions
# ---------------------------------------------------------------------------

def test_size_scaling(big_ctx):
    ctx, anchors = big_ctx
    small = [a for a in anchors if (a["EMPLOYEE_COUNT"] or 0) <= 10]
    large = [a for a in anchors if (a["EMPLOYEE_COUNT"] or 0) > 200]
    per = lambda group: sum(len(_events_for(a, m, False, ctx)) for a in group for m in MONTHS_24) / len(group)
    assert per(large) >= 3 * per(small)


def test_finance_personas_champion_more(big_events):
    fin = [e for e in big_events if _PERSONAS[e["CONTACT_PERSONA"]][2] and not (e["EVENT_TYPE"] == "Joined" and not e["PAIRED_EVENT_ID"])]
    non = [e for e in big_events if not _PERSONAS[e["CONTACT_PERSONA"]][2] and not (e["EVENT_TYPE"] == "Joined" and not e["PAIRED_EVENT_ID"])]
    rate = lambda xs: sum(e["WAS_CHAMPION"] for e in xs) / len(xs)
    assert rate(fin) > 2 * rate(non)


# ---------------------------------------------------------------------------
# 5  Lag-window completeness
# ---------------------------------------------------------------------------

def test_candidate_and_boardex_months():
    assert _candidate_months(date(2026, 3, 2)) == [date(2025, 12, 1), date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1)]
    # A week straddling a month boundary keys on month(week_end).
    assert _candidate_months(date(2026, 3, 30))[-1] == date(2026, 4, 1)
    assert _boardex_months_for_week(date(2026, 3, 2)) == [date(2025, 11, 1)] + _candidate_months(date(2026, 3, 2))
    assert _candidate_months(date(2026, 1, 5))[0] == date(2025, 10, 1)


def test_lag_window_completeness(big_ctx):
    """Every event generated for months M-3 .. M+1 whose DETECTED_DATE falls in
    the covered weeks is returned by exactly one _rows_for_week call."""
    ctx, anchors = big_ctx
    anchors = anchors[:80]
    M = date(2026, 3, 1)
    months = months_between(date(2025, 11, 1), date(2026, 4, 1))       # M-3 .. M+1 (+ M-4 for the rise lookback)
    bx = {(a["ACCOUNT_ID"], m): ((i + j) % 4 == 1) for i, a in enumerate(anchors) for j, m in enumerate(months)}
    first_week = date(2025, 12, 1)                                      # Monday on/after month(M-3)
    last_week = date(2026, 6, 15)                                       # past month(M+1) end + 52 days
    weeks = []
    w = first_week
    while w <= last_week:
        weeks.append(w)
        w += timedelta(days=7)
    returned = Counter()
    for w in weeks:
        for ev in _rows_for_week(anchors, w, FAR_FUTURE, bx, ctx):
            returned[ev["EVENT_ID"]] += 1
    expected = set()
    for a in anchors:
        for m in months[1:]:
            for ev in _events_for(a, m, _boardex_rise(bx, a["ACCOUNT_ID"], m), ctx):
                if first_week <= ev["DETECTED_DATE"] <= last_week + timedelta(days=6):
                    expected.add(ev["EVENT_ID"])
    assert len(expected) > 100
    assert all(returned[e] == 1 for e in expected)      # every expected event, exactly once
    assert max(returned.values()) == 1                    # and nothing is returned by two weeks


def test_week_filter_respects_run_date(ctx):
    months = months_between(date(2025, 10, 1), date(2026, 4, 1))
    bx = make_boardex(EMPLOYERS, months, true_cells={(a["ACCOUNT_ID"], date(2026, 2, 1)) for a in EMPLOYERS})
    week = date(2026, 3, 2)
    full = _rows_for_week(EMPLOYERS, week, FAR_FUTURE, bx, ctx)
    partial = _rows_for_week(EMPLOYERS, week, datetime(2026, 3, 4, 9), bx, ctx)
    assert all(e["DETECTED_DATE"] <= date(2026, 3, 4) for e in partial)
    assert {e["EVENT_ID"] for e in partial} <= {e["EVENT_ID"] for e in full}
    assert all(week <= e["DETECTED_DATE"] <= week + timedelta(days=6) for e in full)


def test_missing_boardex_month_means_no_csuite(ctx):
    """New month not yet generated in BoardEx: no rise, no C-suite departure."""
    bx = make_boardex(EMPLOYERS, months_between(date(2025, 10, 1), date(2026, 1, 1)), default=False)
    rows = []
    week = date(2026, 2, 2)
    while week <= date(2026, 4, 27):
        rows += _rows_for_week(EMPLOYERS, week, FAR_FUTURE, bx, ctx)
        week += timedelta(days=7)
    assert not [e for e in rows if _is_csuite_departure(e) and e["EVENT_DATE"] >= date(2026, 2, 1)]


# ---------------------------------------------------------------------------
# 6  Boring case
# ---------------------------------------------------------------------------

def test_boring_case(ctx):
    evs = []
    for m in MONTHS_24:
        evs += _events_for(BORING_ANCHOR, m, False, ctx)
    own = [e for e in evs if e["ACCOUNT_ID"] == BORING_ANCHOR["ACCOUNT_ID"]]
    assert len(own) <= 4
    assert not [e for e in evs if _is_csuite_departure(e)]
    assert _roster_for(None) == _roster_for(0) == ["CEO-Owner", "Office Manager"]


def test_boring_case_null_industry_falls_back_to_full_pool(ctx):
    """With NULL INDUSTRY an Existing Client destination comes from the full
    pool (never the anchor itself)."""
    dests = set()
    for m in months_between(date(2010, 1, 1), date(2026, 12, 1)):
        for e in _events_for(BORING_ANCHOR, m, True, ctx):
            if e["NEW_EMPLOYER_STATUS"] == "Existing Client":
                dests.add(e["NEW_ACCOUNT_ID"])
    assert dests
    assert BORING_ANCHOR["ACCOUNT_ID"] not in dests
    assert dests <= EMPLOYER_IDS


def test_mix_roughly_matches_rowspec(big_ctx):
    """Sanity bands at a realistic rise rate (~1.3% of account-months, the
    projected sticky BoardEx rate on the employer audience). This pool is
    weighted toward big rosters, so it runs Promoted-heavy; the L3 bands in
    plan section 4 Task 8 come from a simulation over the live 6,435-anchor
    band mix instead (Departed ~48 / Joined ~30 / Promoted ~22 pct)."""
    ctx, anchors = big_ctx
    evs = []
    for i, a in enumerate(anchors):
        for j, m in enumerate(MONTHS_24):
            evs += _events_for(a, m, (i * 7 + j) % 75 == 0, ctx)
    c = Counter(e["EVENT_TYPE"] for e in evs)
    n = sum(c.values())
    assert 0.35 <= c["Departed"] / n <= 0.60
    assert 0.15 <= c["Promoted"] / n <= 0.40
    assert 0.15 <= c["Joined"] / n <= 0.40
    dep = [e for e in evs if e["EVENT_TYPE"] == "Departed"]
    s = Counter(e["NEW_EMPLOYER_STATUS"] for e in dep)
    assert 0.07 <= s["Existing Client"] / len(dep) <= 0.17
    assert 0.40 <= s["Prospect"] / len(dep) <= 0.60
