"""L1 tests for in-year outlook moves (`_apply_outlook_moves`, 2026-10-24).

The year-stable baseline never moved inside a calendar year, so the Commercial
C2 "outlook changed in the last 90 days" view had nothing to show. Episodes
(Stable -> Negative / Watch -> back to Stable) are layered on the baseline for
accounts on the local Account key prefix. These tests pin the history
contract: every change is dated on the day it happens, consecutive values
differ, dates never move silently, and fresh moves keep appearing at any
later profile date.
"""
from datetime import date, datetime, timedelta

import pytest

from sp_generate_moodys_market_context import (
    _MOVE_ACCOUNT_PREFIX,
    _MOVE_EPISODE_PROB,
    _MOVE_EPISODE_PROB_SMALL,
    _MOVE_SMALL_BOOK_MAX,
    _move_episode_prob,
    _MOVE_FIRST_SLOT_START,
    _apply_outlook_moves,
    _move_first_slot,
    _move_slot,
    _outlook_episode,
    _outlook_last_changed_date,
    _rating_outlook,
    _rows_for,
)

_IDS = [f"{_MOVE_ACCOUNT_PREFIX}{i:013d}" for i in range(1500)]
_ALLOWED = {
    ("Stable", "Negative"), ("Stable", "Watch"),
    ("Negative", "Watch"),
    ("Negative", "Stable"), ("Watch", "Stable"),
}


def _state(account_id, d):
    ts = datetime(d.year, d.month, d.day)
    base = _rating_outlook(account_id, ts)
    base_changed = _outlook_last_changed_date(account_id, base, ts)
    return base, base_changed, _apply_outlook_moves(account_id, d, base, base_changed)


def _days(start, end):
    for i in range((end - start).days + 1):
        yield start + timedelta(days=i)


def test_non_local_ids_never_move():
    for i in range(300):
        acct = f"TEST-BIZ-{i:04d}"
        for d in (date(2026, 3, 1), date(2026, 7, 15), date(2026, 10, 24)):
            base, base_changed, (o, c) = _state(acct, d)
            assert (o, c) == (base, base_changed)


def test_non_stable_baseline_untouched():
    d = date(2026, 10, 24)
    for acct in _IDS:
        for outlook in ("Negative", "Watch", "Positive", "Developing"):
            assert _apply_outlook_moves(acct, d, outlook, date(2025, 6, 1)) == (outlook, date(2025, 6, 1))


def test_history_is_consistent_across_2026():
    """Daily walk Mar 1 -> Dec 31 2026: every outlook change is dated on the
    day it happens, goes through an allowed transition, and the change date
    never moves while the outlook stays put."""
    transitions = 0
    for acct in _IDS:
        prev = None
        for d in _days(date(2026, 3, 1), date(2026, 12, 31)):
            _, _, (o, c) = _state(acct, d)
            if prev is not None:
                if o != prev[0]:
                    transitions += 1
                    assert (prev[0], o) in _ALLOWED, (acct, d, prev[0], o)
                    assert c == d, (acct, d, c)
                else:
                    assert c == prev[1], (acct, d, prev[1], c)
            prev = (o, c)
    assert transitions > 100


def test_episodes_end_on_stable_inside_their_slot():
    for acct in _IDS[:500]:
        k0 = _move_first_slot(acct)
        for k in range(k0 - 3, k0 + 6):
            events = _outlook_episode(acct, k)
            if k < k0:
                assert events == ()
                continue
            if not events:
                continue
            assert events[0][1] in ("Negative", "Watch")
            assert events[-1][1] == "Stable"
            assert all(a[0] < b[0] for a, b in zip(events, events[1:]))
            assert all(_move_slot(acct, ev[0]) == k for ev in events)
            assert events[0][0] >= _MOVE_FIRST_SLOT_START


@pytest.mark.parametrize("as_of", [date(2026, 10, 24), date(2027, 6, 30), date(2029, 2, 14)])
def test_fresh_moves_in_last_90_days_at_any_date(as_of):
    """A meaningful minority (not most) of accounts are on a Negative/Watch
    outlook that changed in the 90 days before `as_of`, at any later date."""
    cutoff = as_of - timedelta(days=90)
    hits = 0
    stable_now = 0
    for acct in _IDS:
        base, _, (o, c) = _state(acct, as_of)
        if o in ("Negative", "Watch") and c is not None and c >= cutoff:
            hits += 1
        if o == "Stable":
            stable_now += 1
    assert 0.01 * len(_IDS) <= hits <= 0.08 * len(_IDS), hits
    assert stable_now >= 0.65 * len(_IDS)


def test_rows_for_applies_moves():
    anchor = {"ACCOUNT_TYPE_FLAG": "BUSINESS", "INDUSTRY": "Manufacturing",
              "ANNUAL_REVENUE": 25_000_000, "EMPLOYEE_COUNT": 120}
    moved = 0
    for acct in _IDS[:400]:
        anchor["ACCOUNT_ID"] = acct
        for d in (date(2026, 5, 1), date(2026, 9, 15)):
            row = _rows_for(anchor, d)[0]
            _, _, (o, c) = _state(acct, d)
            assert (row["RATING_OUTLOOK"], row["OUTLOOK_LAST_CHANGED_DATE"]) == (o, c)
            moved += c is not None and c >= date(2026, 1, 1)
    assert moved > 0


def test_small_book_accounts_move_more_often():
    """Accounts in small advisor books (OWNER_BOOK_SIZE < _MOVE_SMALL_BOOK_MAX)
    use the boosted per-slot rate, so books with a handful of business
    accounts still see occasional moves; big books and unknown owners use
    the base rate. Episodes at the base rate are a subset of the boosted ones
    (same seed stream, only the gate threshold differs)."""
    as_of = date(2026, 10, 24)
    cutoff = as_of - timedelta(days=90)

    def hits(book_size):
        n = 0
        for acct in _IDS:
            ts = datetime(as_of.year, as_of.month, as_of.day)
            base = _rating_outlook(acct, ts)
            bc = _outlook_last_changed_date(acct, base, ts)
            o, c = _apply_outlook_moves(acct, as_of, base, bc, book_size)
            n += o in ("Negative", "Watch") and c is not None and c >= cutoff
        return n

    base_hits, big_hits, small_hits = hits(None), hits(5000), hits(10)
    assert base_hits == big_hits
    assert small_hits >= 3 * base_hits
    assert _move_episode_prob(None) == _MOVE_EPISODE_PROB
    assert _move_episode_prob(_MOVE_SMALL_BOOK_MAX) == _MOVE_EPISODE_PROB
    assert _move_episode_prob(_MOVE_SMALL_BOOK_MAX - 1) == _MOVE_EPISODE_PROB_SMALL
    for acct in _IDS[:300]:
        k = _move_first_slot(acct)
        base_ev = _outlook_episode(acct, k)
        if base_ev:
            assert _outlook_episode(acct, k, _MOVE_EPISODE_PROB_SMALL) == base_ev


def test_small_book_history_is_consistent():
    for acct in _IDS[:400]:
        prev = None
        for d in _days(date(2026, 3, 1), date(2026, 12, 31)):
            ts = datetime(d.year, d.month, d.day)
            base = _rating_outlook(acct, ts)
            bc = _outlook_last_changed_date(acct, base, ts)
            o, c = _apply_outlook_moves(acct, d, base, bc, 7)
            if prev is not None:
                if o != prev[0]:
                    assert (prev[0], o) in _ALLOWED
                    assert c == d
                else:
                    assert c == prev[1]
            prev = (o, c)
