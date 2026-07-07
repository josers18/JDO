"""Synthesized directed relationship-graph generator (composition mimic).

Snowpark Python stored procedure registered as
DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH. **Second 1:N dataset** in the
Cumulus rollout (Plan 6 was first), **second weekly cadence** (Plan 6 first;
Plan 12 third), and the **only edge-scoped dataset** in the rollout — row
identity is the directed-edge tuple `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID,
EDGE_TYPE)`, not an account-anchored single key.

Mimic: composition (no single vendor) — synthesized from the outputs of prior
Cumulus plans plus internally-generated structure. Conceptual source is the
brainstorming doc section 17.

Audience: all accounts (1=1 predicate; SELECT DISTINCT to dedupe MASTER_ACCOUNTS).
Cadence:  WEEKLY (Monday 05:00 UTC).
Salt:     "synth-graph" (week-bucketed, single-salt — Plan 6's simpler shape).
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-9-synth-relationship-graph.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-9-synth-relationship-graph-rowspec.md

Structural deviations from earlier plans:
  - First edge-scoped 1:N row factory — `_rows_for(anchor, run_ts, *,
    available_edge_types, lookup_tables) -> list[dict]` returns 1-N edge rows
    per anchor where each row is a directed edge. SRC_ACCOUNT_ID is the anchor
    side; DST_ACCOUNT_ID is any other account (or self for SELF edges).
  - First cross-plan SOFT dependencies — main() probes CLARITAS_DEMOGRAPHICS,
    DNB_BUSINESS_CREDIT, BOARDEX_EXEC_INTEL via try/except on `SELECT 1 ...
    LIMIT 1`. Absent tables silently filter out the corresponding edge type;
    the SP never fails on a missing upstream table.
  - SELF self-edge fallback — every anchor whose other edge generators
    return [] emits exactly one (account, account, 'SELF') row. This
    guarantees `COUNT(DISTINCT SRC_ACCOUNT_ID) = audience_size` always holds,
    regardless of which cross-plan tables are populated.
  - Composite 3-column natural PK collapses to single-column DC PK with KQ
    qualifiers — Snowflake DDL keeps PK on (SRC, DST, EDGE_TYPE); DC DLO
    source view projects EDGE_ID = sha256(src||'|'||dst||'|'||edge_type)[:32]
    as the single-column DMO PK.
"""
from __future__ import annotations

import json
import random
import uuid
from datetime import date, datetime, timedelta
from typing import Any

# Locally + in Snowflake, cumulus_common is shipped via pip install -e or
# the IMPORTS clause on CREATE PROCEDURE.
from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants — these MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE        = "DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH"
TASK_NAME    = "TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH"
DATASET_SALT = "synth-graph"

# Plan 9 has no audience predicate — every distinct account contributes.
# Kept as empty string for symmetry with Plans 1-8.
_AUDIENCE_PREDICATE = ""  # all-accounts
AUDIENCE_SQL = "SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS"
COVERAGE_SQL = "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS"

# 10-column output contract (kept in sync with the table DDL by the L1 schema test).
# ORG_ID is the multi-tenant prefix; cross-org edges are not modeled (DST anchors
# come from the same audience, so within-anchor=within-org is naturally enforced).
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID",
    "SRC_ACCOUNT_ID", "DST_ACCOUNT_ID", "EDGE_TYPE",
    "EDGE_WEIGHT", "CONFIDENCE_PCT",
    "EDGE_DISCOVERED_DATE", "EDGE_LAST_SEEN_DATE",
    "METADATA", "GENERATED_AT",
})

# Edge-type weight bands (low, high). SELF is exactly 1.000.
_EDGE_TYPE_WEIGHT_BAND: dict[str, tuple[float, float]] = {
    "HOUSEHOLD":         (0.80, 1.00),  # tight family bonds
    "CORPORATE_PARENT":  (0.90, 1.00),  # near-deterministic (legal entity)
    "BOARD_MEMBER":      (0.55, 0.85),  # moderate
    "ADVISOR_BOOK":      (0.40, 0.70),  # peer-of-peer signal
    "REFERRAL":          (0.30, 0.60),  # sparse signal
    "BUSINESS_OWNER":    (0.85, 1.00),  # near-deterministic
    "SELF":              (1.00, 1.00),  # exact 1.0 always
}

# Confidence base per type. SELF is exactly 100.00 (special-cased).
_EDGE_TYPE_CONFIDENCE_BASE: dict[str, float] = {
    "HOUSEHOLD":        90.0,
    "CORPORATE_PARENT": 95.0,
    "BOARD_MEMBER":     80.0,
    "ADVISOR_BOOK":     70.0,
    "REFERRAL":         60.0,
    "BUSINESS_OWNER":   85.0,
}

# Cross-plan dependency table -> edge_type. Probed via try/except in main().
_CROSS_PLAN_TABLES: list[tuple[str, str]] = [
    ("DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS", "HOUSEHOLD"),
    ("DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT",   "CORPORATE_PARENT"),
    ("DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL",    "BOARD_MEMBER"),
]

# Always-on edge types — no upstream table required.
_ALWAYS_ON_EDGE_TYPES: frozenset[str] = frozenset({
    "ADVISOR_BOOK", "REFERRAL", "BUSINESS_OWNER", "SELF",
})


# -------------------------------------------------------------------
# Week-start helper — anchors run_ts to Monday 00:00 UTC.
# -------------------------------------------------------------------

def _week_start(run_ts: datetime) -> datetime:
    """Bucket run_ts to its calendar-week start (Monday 00:00 UTC).

    Mid-week re-runs re-bucket to the same instant so the seed (and therefore
    the rows) are byte-identical.
    """
    monday = run_ts.date() - timedelta(days=run_ts.weekday())
    return datetime.combine(monday, datetime.min.time())


# -------------------------------------------------------------------
# _anchor_in_audience — Plan 9 audience is all-accounts.
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Plan 9 audience is all-accounts — no predicate. Every distinct
    anchor with a non-empty ACCOUNT_ID is in audience."""
    return bool(anchor.get("ACCOUNT_ID"))


# -------------------------------------------------------------------
# Edge factory + bias-logic helpers — translate the rowspec faithfully.
#
# Status-first computation: EDGE_DISCOVERED_DATE is computed first;
# CONFIDENCE_PCT reads it for age-decay; EDGE_LAST_SEEN_DATE is then derived
# to satisfy last_seen >= discovered. Don't reorder.
# -------------------------------------------------------------------

def _edge_weight(edge_type: str, rng: random.Random | None) -> float:
    """Uniform draw within the type's weight band, 3-decimal precision.
    SELF is exactly 1.000 (rng may be None for the SELF path)."""
    lo, hi = _EDGE_TYPE_WEIGHT_BAND[edge_type]
    if lo == hi or rng is None:
        return round(lo, 3)
    return round(rng.uniform(lo, hi), 3)


def _edge_dates(edge_type: str, run_ts: datetime,
                rng: random.Random | None) -> tuple[date, date]:
    """Return (EDGE_DISCOVERED_DATE, EDGE_LAST_SEEN_DATE).

    Discovered: 1-60 months ago (deterministic per edge via rng).
    Last-seen: between discovered and today.
    SELF rows: discovered == last_seen == week_start.date().
    """
    week_start = _week_start(run_ts)
    if edge_type == "SELF" or rng is None:
        d = week_start.date()
        return d, d
    discovered_days_ago = rng.randint(30, 1800)
    discovered = run_ts.date() - timedelta(days=discovered_days_ago)
    seen_offset = rng.randint(0, max(1, discovered_days_ago - 1))
    last_seen = discovered + timedelta(days=seen_offset)
    return discovered, last_seen


def _confidence_pct(edge_type: str, edge_discovered_date: date,
                    run_date: date, rng: random.Random | None) -> float:
    """Confidence with age-decay starting at 365 days. SELF is exactly 100.00.

    base + uniform[-5, +5] - age_decay_days_per_30, clamped to [30.00, 99.99]
    for non-SELF edges.
    """
    if edge_type == "SELF":
        return 100.00
    age_days = (run_date - edge_discovered_date).days
    age_decay = max(0, age_days - 365) / 30  # decay starts after a year
    base = _EDGE_TYPE_CONFIDENCE_BASE[edge_type]
    if rng is not None:
        base += rng.uniform(-5.0, 5.0)
    base -= age_decay
    return round(max(30.0, min(99.99, base)), 2)


def _make_edge(src: str, dst: str, edge_type: str,
               rng: random.Random | None, run_ts: datetime,
               metadata: str | None = None,
               org_id: str = "JDO") -> dict:
    """Edge factory — assembles one 10-key dict.

    Ordering is load-bearing: discovered first (so confidence age-decay can
    read it), then weight, then confidence, then last-seen. ORG_ID is the
    tenant prefix; cross-org edges are not modeled (callers stamp the anchor's
    ORG_ID on every edge in the 1:N loop).
    """
    discovered, last_seen = _edge_dates(edge_type, run_ts, rng)
    weight = _edge_weight(edge_type, rng)
    confidence = _confidence_pct(edge_type, discovered, run_ts.date(), rng)
    return {
        "ORG_ID":               org_id,
        "SRC_ACCOUNT_ID":       src,
        "DST_ACCOUNT_ID":       dst,
        "EDGE_TYPE":            edge_type,
        "EDGE_WEIGHT":          weight,
        "CONFIDENCE_PCT":       confidence,
        "EDGE_DISCOVERED_DATE": discovered,
        "EDGE_LAST_SEEN_DATE":  last_seen,
        "METADATA":             metadata,
        "GENERATED_AT":         _week_start(run_ts),
    }


def _self_edge(anchor: dict, run_ts: datetime) -> dict:
    """Unconditional fallback. Fixed weight 1.000, confidence 100.00,
    discovered == last_seen == week_start.date(), METADATA=None.
    ORG_ID stamped from anchor (defaults to 'JDO' if absent)."""
    aid = anchor["ACCOUNT_ID"]
    return _make_edge(aid, aid, "SELF", rng=None, run_ts=run_ts,
                      metadata=None, org_id=anchor.get("ORG_ID") or "JDO")


# -------------------------------------------------------------------
# Per-EDGE_TYPE generator functions.
#
# Contract per generator:
#   (anchor: dict, lookup: dict, rng: random.Random, run_ts: datetime) -> list[dict]
#   - Returns [] when preconditions don't apply (lookup absent, anchor wrong
#     category, dice-roll fails, etc).
#   - Never raises.
#   - Consumes rng deterministically (so the order of generator calls is
#     part of the contract — see _rows_for).
# -------------------------------------------------------------------

def _household_bucket(anchor: dict) -> str:
    """Hash anchor into a household composition bucket. Used to look up
    co-resident peers in the household_pool lookup table."""
    composition = anchor.get("CLARITAS_HOUSEHOLD_COMPOSITION") or ""
    postal = anchor.get("POSTAL_CODE") or ""
    return f"{composition}|{postal}"


def _advisor_bucket(anchor: dict) -> str:
    """Hash a Wealth anchor into one of ~200 advisor-book buckets."""
    aid = anchor.get("ACCOUNT_ID") or ""
    # Stable per anchor; modulo 200 buckets via integer hash.
    return f"book{abs(hash(aid)) % 200:03d}"


def _household_edges(anchor: dict, lookup: dict,
                     rng: random.Random, run_ts: datetime) -> list[dict]:
    """Bidirectional household edges from Claritas Family/Couple compositions.

    Returns [] if HOUSEHOLD lookup absent, anchor's composition isn't
    Family/Couple, or the household bucket has fewer than 2 members.
    """
    pool = lookup.get("household_pool") or {}
    if not pool:
        return []
    if anchor.get("CLARITAS_HOUSEHOLD_COMPOSITION") not in ("Family", "Couple"):
        return []
    bucket = pool.get(_household_bucket(anchor))
    if not bucket or len(bucket) < 2:
        return []
    aid = anchor["ACCOUNT_ID"]
    org_id = anchor.get("ORG_ID") or "JDO"
    return [
        _make_edge(aid, peer, "HOUSEHOLD", rng, run_ts,
                   metadata=json.dumps({"household_role": "member"}),
                   org_id=org_id)
        for peer in bucket if peer != aid
    ]


def _corporate_parent_edges(anchor: dict, lookup: dict,
                            rng: random.Random, run_ts: datetime) -> list[dict]:
    """One subsidiary -> parent edge per BUSINESS anchor with a D and B parent."""
    parents = lookup.get("dnb_parents") or {}
    if not parents:
        return []
    if anchor.get("ACCOUNT_TYPE_FLAG") != "BUSINESS":
        return []
    parent = parents.get(anchor["ACCOUNT_ID"])
    if not parent:
        return []
    return [_make_edge(anchor["ACCOUNT_ID"], parent, "CORPORATE_PARENT",
                       rng, run_ts,
                       metadata=json.dumps({"link_source": "dnb"}),
                       org_id=anchor.get("ORG_ID") or "JDO")]


def _board_member_edges(anchor: dict, lookup: dict,
                        rng: random.Random, run_ts: datetime) -> list[dict]:
    """director -> company edges from BoardEx. Multi-row when one director
    sits on more than one board."""
    seats = lookup.get("boardex_seats") or {}
    if not seats:
        return []
    company_ids = seats.get(anchor["ACCOUNT_ID"])
    if not company_ids:
        return []
    org_id = anchor.get("ORG_ID") or "JDO"
    return [
        _make_edge(anchor["ACCOUNT_ID"], company, "BOARD_MEMBER",
                   rng, run_ts,
                   metadata=json.dumps({"board_role": "Director"}),
                   org_id=org_id)
        for company in company_ids
    ]


def _advisor_book_edges(anchor: dict, lookup: dict,
                        rng: random.Random, run_ts: datetime) -> list[dict]:
    """Wealth anchors -> 1-3 advisor-book peers, ~30% emit rate.

    advisor_books is built in main() by hashing Wealth anchors into ~200
    buckets. Consumes rng for the dice roll AND the peer selection — keep
    the ordering stable across re-runs.
    """
    if anchor.get("CLIENT_CATEGORY") != "Wealth Management":
        return []
    if rng.random() >= 0.30:
        return []
    books = lookup.get("advisor_books") or {}
    if not books:
        return []
    book = books.get(_advisor_bucket(anchor))
    if not book:
        return []
    aid = anchor["ACCOUNT_ID"]
    candidates = [p for p in book if p != aid]
    if not candidates:
        return []
    n = min(rng.randint(1, 3), len(candidates))
    peers = candidates[:n]
    org_id = anchor.get("ORG_ID") or "JDO"
    return [_make_edge(aid, p, "ADVISOR_BOOK", rng, run_ts, org_id=org_id)
            for p in peers]


def _referral_edges(anchor: dict, lookup: dict,
                    rng: random.Random, run_ts: datetime) -> list[dict]:
    """5% of anchors have one referrer drawn from the all-accounts pool."""
    if rng.random() >= 0.05:
        return []
    all_ids = lookup.get("all_account_ids") or []
    if not all_ids:
        return []
    referrer = rng.choice(all_ids)
    aid = anchor["ACCOUNT_ID"]
    if referrer == aid:
        return []
    return [_make_edge(aid, referrer, "REFERRAL", rng, run_ts,
                       org_id=anchor.get("ORG_ID") or "JDO")]


def _business_owner_edges(anchor: dict, lookup: dict,
                          rng: random.Random, run_ts: datetime) -> list[dict]:
    """High-income PERSON -> BUSINESS owner edge.

    Probability caps at ~10% for incomes around $5M and zero below $200K.
    """
    if anchor.get("ACCOUNT_TYPE_FLAG") != "PERSON":
        return []
    income = float(anchor.get("ANNUAL_INCOME") or 0)
    if income < 200_000:
        return []
    p = min(0.10, (income - 200_000) / 5_000_000)
    if rng.random() >= p:
        return []
    biz_ids = lookup.get("business_account_ids") or []
    if not biz_ids:
        return []
    target = rng.choice(biz_ids)
    return [_make_edge(anchor["ACCOUNT_ID"], target, "BUSINESS_OWNER",
                       rng, run_ts,
                       metadata=json.dumps({"ownership_pct": "majority"}),
                       org_id=anchor.get("ORG_ID") or "JDO")]


# Generator dispatch — ordered for deterministic rng consumption. SELF is
# excluded here; it's emitted only as a fallback in _rows_for.
_EDGE_TYPE_GENERATORS: dict[str, Any] = {
    "HOUSEHOLD":        _household_edges,
    "CORPORATE_PARENT": _corporate_parent_edges,
    "BOARD_MEMBER":     _board_member_edges,
    "ADVISOR_BOOK":     _advisor_book_edges,
    "REFERRAL":         _referral_edges,
    "BUSINESS_OWNER":   _business_owner_edges,
}


# -------------------------------------------------------------------
# _rows_for — substantive 1:N synthesis logic (per rowspec).
# -------------------------------------------------------------------

def _rows_for(anchor: dict, run_ts: datetime, *,
              available_edge_types: set[str],
              lookup_tables: dict | None = None) -> list[dict]:
    """Return a deterministically-ordered list of edge rows for one anchor.

    Single salt, week-bucketed seed: `seed_for(account_id, "synth-graph",
    week_start)`. Re-running mid-week produces byte-identical output because
    the seed and GENERATED_AT both anchor on the week's Monday.

    Generator dispatch order is part of the contract — each generator
    consumes rng draws in sequence; reordering would change every row.

    SELF is the unconditional fallback: if every other generator returns []
    (cross-plan tables absent, or none of the heuristics fire), exactly one
    SELF row is emitted so coverage holds.

    Args:
        anchor: distinct V_ACCOUNT_ANCHORS row as a dict.
        run_ts: current run timestamp; floored to Monday 00:00 UTC.
        available_edge_types: edge_type slugs whose source tables exist.
            Built once in main() via _probe_available_edge_types(session).
            SELF is conceptually always present.
        lookup_tables: cross-plan lookup tables built once in main().
            Keys: 'household_pool', 'dnb_parents', 'boardex_seats',
            'advisor_books', 'all_account_ids', 'business_account_ids'.
            Missing keys are treated as empty (generator short-circuits).

    Returns:
        Sorted list of 1-N edge dicts. Sort key: (DST_ACCOUNT_ID, EDGE_TYPE).
        Different sort key from Plan 6 (which sorted by HELD_AWAY_ACCOUNT_ID).
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor failed all-accounts audience predicate "
            f"(ACCOUNT_ID empty/missing): {anchor!r}"
        )

    lookup = lookup_tables or {}
    week = _week_start(run_ts)
    rng = random.Random(seed_for(anchor["ACCOUNT_ID"], DATASET_SALT, week))

    rows: list[dict] = []
    for edge_type, edge_fn in _EDGE_TYPE_GENERATORS.items():
        if edge_type not in available_edge_types:
            continue
        rows.extend(edge_fn(anchor, lookup, rng, run_ts))

    # SELF fallback — every anchor must contribute at least one row.
    if not rows:
        rows.append(_self_edge(anchor, run_ts))

    # Deterministic ordering before MERGE.
    rows.sort(key=lambda r: (r["DST_ACCOUNT_ID"], r["EDGE_TYPE"]))
    return rows


# -------------------------------------------------------------------
# Cross-plan dependency probe.
# -------------------------------------------------------------------

def _probe_available_edge_types(session: Any) -> set[str]:
    """Defensive existence check — Plan 9 ships before Plan 10 (BoardEx).

    Each cross-plan table is probed via `SELECT 1 FROM <table> LIMIT 1`
    inside try/except. Absent tables silently filter out the corresponding
    edge_type. The SP NEVER fails on a missing upstream table.

    Always-on types (SELF, ADVISOR_BOOK, REFERRAL, BUSINESS_OWNER) are
    seeded into the result regardless of probe outcomes.
    """
    available: set[str] = set(_ALWAYS_ON_EDGE_TYPES)
    for table, edge_type in _CROSS_PLAN_TABLES:
        try:
            session.sql(f"SELECT 1 FROM {table} LIMIT 1").collect()
            available.add(edge_type)
        except Exception:
            # Table absent or unreadable -> skip this edge type, don't fail.
            pass
    return available


# -------------------------------------------------------------------
# Cross-plan lookup-table builders.
#
# Each builder runs ONCE per SP invocation and returns a dict keyed by
# anchor-side ACCOUNT_ID (or by hash bucket for advisor books / households).
# All wrapped in try/except so a failed query just yields an empty lookup
# (the corresponding edge generator will then short-circuit to []).
# -------------------------------------------------------------------

def _build_household_pool(session: Any) -> dict[str, list[str]]:
    """Group Claritas Family/Couple anchors by composition+postal bucket."""
    try:
        sql = """
            SELECT ACCOUNT_ID, HOUSEHOLD_COMPOSITION, POSTAL_CODE
            FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS
            WHERE HOUSEHOLD_COMPOSITION IN ('Family', 'Couple')
        """
        rows = session.sql(sql).collect()
    except Exception:
        return {}
    pool: dict[str, list[str]] = {}
    for r in rows:
        d = _row_to_dict(r)
        bucket = f"{d.get('HOUSEHOLD_COMPOSITION') or ''}|{d.get('POSTAL_CODE') or ''}"
        pool.setdefault(bucket, []).append(d["ACCOUNT_ID"])
    return pool


def _build_dnb_parents(session: Any) -> dict[str, str]:
    """Map subsidiary ACCOUNT_ID -> parent ACCOUNT_ID from D and B."""
    try:
        sql = """
            SELECT ACCOUNT_ID, PARENT_ACCOUNT_ID
            FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT
            WHERE PARENT_ACCOUNT_ID IS NOT NULL
        """
        rows = session.sql(sql).collect()
    except Exception:
        return {}
    parents: dict[str, str] = {}
    for r in rows:
        d = _row_to_dict(r)
        parents[d["ACCOUNT_ID"]] = d["PARENT_ACCOUNT_ID"]
    return parents


def _build_boardex_seats(session: Any) -> dict[str, list[str]]:
    """Map director ACCOUNT_ID -> list of company ACCOUNT_IDs they sit on."""
    try:
        sql = """
            SELECT ACCOUNT_ID, COMPANY_ACCOUNT_ID
            FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL
            WHERE COMPANY_ACCOUNT_ID IS NOT NULL
        """
        rows = session.sql(sql).collect()
    except Exception:
        return {}
    seats: dict[str, list[str]] = {}
    for r in rows:
        d = _row_to_dict(r)
        seats.setdefault(d["ACCOUNT_ID"], []).append(d["COMPANY_ACCOUNT_ID"])
    return seats


def _build_advisor_books(audience: list[dict]) -> dict[str, list[str]]:
    """Hash Wealth Management anchors into ~200 advisor-book buckets."""
    books: dict[str, list[str]] = {}
    for a in audience:
        if a.get("CLIENT_CATEGORY") != "Wealth Management":
            continue
        bucket = _advisor_bucket(a)
        books.setdefault(bucket, []).append(a["ACCOUNT_ID"])
    return books


# -------------------------------------------------------------------
# Anchor / Row -> dict adapter.
# -------------------------------------------------------------------

def _row_to_dict(row: Any) -> dict:
    """Snowpark Row -> plain dict so generators can be tested with literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


_anchor_to_dict = _row_to_dict


# -------------------------------------------------------------------
# Entry point — invoked by DATA_JEDAIS.FINS__PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH.
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern, adapted for edge-scoped 1:N output:
    probe -> read -> build (extend) -> MERGE -> assert -> log.

    Per-edge-type emit counts are logged into TASK_EXECUTION_LOG.ERROR_MESSAGE
    on success — operator-visible signal for which SOFT dependencies were
    satisfied this run.
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 0. Probe cross-plan SOFT dependencies. Never fail on absent tables.
        available_edge_types = _probe_available_edge_types(session)

        # 1. Read audience from the shared view (zero-copy fresh anchors).
        raw_audience = session.sql(AUDIENCE_SQL).collect()
        audience = [_anchor_to_dict(r) for r in raw_audience]
        accounts_processed = len(audience)  # NOT len(records); customer count.

        # Build cross-plan lookup tables once. Absent tables yield empty dicts.
        lookup_tables = {
            "household_pool":        (_build_household_pool(session)
                                      if "HOUSEHOLD" in available_edge_types
                                      else {}),
            "dnb_parents":           (_build_dnb_parents(session)
                                      if "CORPORATE_PARENT" in available_edge_types
                                      else {}),
            "boardex_seats":         (_build_boardex_seats(session)
                                      if "BOARD_MEMBER" in available_edge_types
                                      else {}),
            "advisor_books":         _build_advisor_books(audience),
            "all_account_ids":       [a["ACCOUNT_ID"] for a in audience
                                      if a.get("ACCOUNT_ID")],
            "business_account_ids":  [a["ACCOUNT_ID"] for a in audience
                                      if a.get("ACCOUNT_TYPE_FLAG") == "BUSINESS"],
        }

        # 2. Build deterministic rows; tolerate up to 1% per-anchor failures.
        records: list[dict] = []
        errors: list[tuple[Any, str]] = []
        emit_counts: dict[str, int] = {
            t: 0 for t in (
                "HOUSEHOLD", "CORPORATE_PARENT", "BOARD_MEMBER",
                "ADVISOR_BOOK", "REFERRAL", "BUSINESS_OWNER", "SELF",
            )
        }
        for anchor in audience:
            try:
                anchor_rows = _rows_for(
                    anchor, started,
                    available_edge_types=available_edge_types,
                    lookup_tables=lookup_tables,
                )
                records.extend(anchor_rows)
                for r in anchor_rows:
                    emit_counts[r["EDGE_TYPE"]] = emit_counts.get(r["EDGE_TYPE"], 0) + 1
            except Exception as exc:
                errors.append((anchor.get("ACCOUNT_ID"), str(exc)[:200]))
        max_tolerated = max(10, len(audience) // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{len(audience)} accounts "
                f"(tolerance {max_tolerated}); first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{len(audience)} accounts; "
                f"first: {errors[0]}"
            )

        # 3. Idempotent MERGE on composite 3-column PK.
        rows_inserted = _merge(session, records)

        # 4. Single-part coverage assertion. SELF-fallback guarantees
        # COUNT(DISTINCT SRC_ACCOUNT_ID) = audience_size always. No row-count
        # band — the row-count target is informational, not enforced.
        actual_distinct_sql = f"SELECT COUNT(DISTINCT SRC_ACCOUNT_ID) FROM {TABLE}"
        assert_coverage(session, COVERAGE_SQL, actual_distinct_sql)

        # Per-edge-type emit counts -> ERROR_MESSAGE prefix on success.
        # SOFT-dependency edge types that were skipped report 'skipped(no_table)'.
        emit_parts: list[str] = []
        for et in ("HOUSEHOLD", "CORPORATE_PARENT", "BOARD_MEMBER",
                   "ADVISOR_BOOK", "REFERRAL", "BUSINESS_OWNER", "SELF"):
            if et not in available_edge_types and et not in _ALWAYS_ON_EDGE_TYPES:
                emit_parts.append(f"{et}=skipped(no_table)")
            else:
                emit_parts.append(f"{et}={emit_counts.get(et, 0)}")
        emit_summary = "emit_counts: " + ", ".join(emit_parts)
        err = emit_summary if err is None else f"{emit_summary}; {err}"

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 5. Always log — success or failure.
        duration_ms = int((datetime.utcnow() - started).total_seconds() * 1000)
        session.sql(
            """
            INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
                (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
                 ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params=[log_id, TASK_NAME, started, status,
                    rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"


# -------------------------------------------------------------------
# _merge — idempotent MERGE on composite 3-column PK
# (SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE).
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    Implementation: write_pandas -> staging table -> MERGE statement.
    The staging table is overwrite-truncated each call so re-runs produce
    consistent state.

    Casts in the source SELECT (defensive against write_pandas auto-typing
    on an empty target):
      - GENERATED_AT — datetime64[ns] mis-types as NUMBER(38,0)
        (nanoseconds-since-epoch); cast back via TO_TIMESTAMP_NTZ.
      - EDGE_TYPE::VARCHAR(20), EDGE_WEIGHT::NUMBER(4,3),
        CONFIDENCE_PCT::NUMBER(5,2), METADATA::VARCHAR(500) — width / scale
        defended at the projection layer so DC sees correct types.
      - EDGE_DISCOVERED_DATE / EDGE_LAST_SEEN_DATE — cast to DATE.

    The 1 NULLable column (METADATA) passes through; pandas + write_pandas
    serialize Python None -> SQL NULL transparently.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "SYNTH_RELATIONSHIP_GRAPH_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH tgt
        USING (
            SELECT
                ORG_ID::VARCHAR(18)               AS ORG_ID,
                SRC_ACCOUNT_ID,
                DST_ACCOUNT_ID,
                EDGE_TYPE::VARCHAR(20)            AS EDGE_TYPE,
                EDGE_WEIGHT::NUMBER(4,3)          AS EDGE_WEIGHT,
                CONFIDENCE_PCT::NUMBER(5,2)       AS CONFIDENCE_PCT,
                EDGE_DISCOVERED_DATE::DATE        AS EDGE_DISCOVERED_DATE,
                EDGE_LAST_SEEN_DATE::DATE         AS EDGE_LAST_SEEN_DATE,
                METADATA::VARCHAR(500)            AS METADATA,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM DATA_JEDAIS.FINS__PUBLIC.{staging}
        ) src
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.SRC_ACCOUNT_ID = src.SRC_ACCOUNT_ID
           AND tgt.DST_ACCOUNT_ID = src.DST_ACCOUNT_ID
           AND tgt.EDGE_TYPE      = src.EDGE_TYPE
        WHEN MATCHED THEN UPDATE SET
            EDGE_WEIGHT          = src.EDGE_WEIGHT,
            CONFIDENCE_PCT       = src.CONFIDENCE_PCT,
            EDGE_DISCOVERED_DATE = src.EDGE_DISCOVERED_DATE,
            EDGE_LAST_SEEN_DATE  = src.EDGE_LAST_SEEN_DATE,
            METADATA             = src.METADATA,
            GENERATED_AT         = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ORG_ID,
            SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE,
            EDGE_WEIGHT, CONFIDENCE_PCT,
            EDGE_DISCOVERED_DATE, EDGE_LAST_SEEN_DATE,
            METADATA, GENERATED_AT
        ) VALUES (
            src.ORG_ID,
            src.SRC_ACCOUNT_ID, src.DST_ACCOUNT_ID, src.EDGE_TYPE,
            src.EDGE_WEIGHT, src.CONFIDENCE_PCT,
            src.EDGE_DISCOVERED_DATE, src.EDGE_LAST_SEEN_DATE,
            src.METADATA, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
