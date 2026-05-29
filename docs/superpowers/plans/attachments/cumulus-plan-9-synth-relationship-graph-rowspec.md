# Plan 9 — Synth Relationship Graph rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §17 ("Synth Behavior" — relationship-graph composition) + the live cardinalities of upstream Cumulus tables (`CLARITAS_DEMOGRAPHICS`, `DNB_BUSINESS_CREDIT`) and the all-accounts `V_ACCOUNT_ANCHORS` audience.
>
> **Plan 9 is the second 1:N dataset (Plan 6 was first), the second weekly cadence (Plan 6 was first; Plan 12 will be the third), and the only edge-scoped dataset in the rollout.** Each anchor produces 1–N edge rows describing relationships to other accounts. Coverage assertion is "every anchor contributes ≥1 row," guaranteed by a `SELF` self-edge fallback when no other edge applies.

## Mimics

**Composition** — there is no single vendor mimic for Plan 9. The dataset is synthesized from the *outputs* of prior Cumulus plans plus a small amount of internally-generated structure (`ADVISOR_BOOK`, `REFERRAL`, `BUSINESS_OWNER`). It is the only Cumulus dataset without a single-vendor mimic. The brainstorming doc §17 ("Synth Behavior") is the conceptual source.

The narrative shape: a director-of-customer-graph view that lets Agentforce ground "show me everyone connected to this account" — household members from Claritas, corporate parents from D&B, board memberships from BoardEx, advisor-book peers, internal referrals, business-owner bridges between PERSON and BUSINESS accounts.

## Audience

`1=1` — **all 36,813 distinct anchors** (probed 2026-05-28; 37,445 raw V_ACCOUNT_ANCHORS rows due to the known 1.7% MASTER_ACCOUNTS dup). Audience SQL must use `SELECT DISTINCT ACCOUNT_ID, ...` defensively.

```sql
SELECT DISTINCT *
FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
```

Why all-accounts: a relationship graph that excludes any account is a graph with holes. The SELF fallback (see below) makes coverage cheap — every anchor contributes at least one self-loop, so `COUNT(DISTINCT SRC_ACCOUNT_ID) = 36,813` always holds, even when every cross-plan edge source is empty or absent.

## Table: `FINS.PUBLIC.SYNTH_RELATIONSHIP_GRAPH`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `SRC_ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID — the "from" side of the directed edge |
| `DST_ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | The "to" side. For SELF edges, equals SRC_ACCOUNT_ID. |
| `EDGE_TYPE` | VARCHAR(20) | NOT NULL | One of `HOUSEHOLD`, `CORPORATE_PARENT`, `BOARD_MEMBER`, `ADVISOR_BOOK`, `REFERRAL`, `BUSINESS_OWNER`, `SELF`. |
| `EDGE_WEIGHT` | NUMBER(4,3) | NOT NULL | 0.000–1.000. Strength of the edge — higher = more confident / closer relationship. |
| `CONFIDENCE_PCT` | NUMBER(5,2) | NOT NULL | 0.00–100.00. Synthesis confidence — independent of weight; stale data lowers it. |
| `EDGE_DISCOVERED_DATE` | DATE | NOT NULL | When the edge was first observed. Within 1–60 months ago, deterministic per (src, dst, edge_type). |
| `EDGE_LAST_SEEN_DATE` | DATE | NOT NULL | When the edge was last observed. Always ≥ EDGE_DISCOVERED_DATE. |
| `METADATA` | VARCHAR(500) | NULL | Optional JSON-encoded edge-type-specific facts (e.g. `{"household_role":"spouse"}`, `{"board_role":"Director"}`). NULL allowed. |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Week-bucketed (Monday 00:00 UTC) for byte-identical mid-week re-runs. |

9 columns total: 8 NOT NULL + 1 NULLable (METADATA).

## Primary key

`(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)` — composite 3-column key. Re-runs same week replace.

**DC PK collapse:** DC enforces single-column PK on DMOs (Plan 4 finding; same as Plan 6). T7 will use a derived `EDGE_ID` column (computed in the Snowflake table, NOT a separate column in this rowspec — DC will receive a synthetic `edgeId__c = sha256(src_account_id + '|' + dst_account_id + '|' + edge_type)[:32]` projected at the DLO source view level) as the single-column PK and add KQ qualifiers `srcAccountId__c` (FK to `ssot__Account__dlm`), `dstAccountId__c`, `edgeType__c` for join semantics. Snowflake itself keeps the natural 3-column PK in the DDL.

## EDGE_TYPE values and provenance

Seven edge types, gated on cross-plan-table availability:

| EDGE_TYPE | Source | Direction | Cross-plan dependency | Boring-case behavior |
|---|---|---|---|---|
| `HOUSEHOLD` | `CLARITAS_DEMOGRAPHICS.householdComposition` ∈ `{Family, Couple}` | bidirectional (emit both `A→B` and `B→A`) | SOFT — `IF EXISTS CLARITAS_DEMOGRAPHICS` | skip type entirely if Claritas absent |
| `CORPORATE_PARENT` | `DNB_BUSINESS_CREDIT` (subsidiary→parent links) | unidirectional `subsidiary→parent` | SOFT — `IF EXISTS DNB_BUSINESS_CREDIT` | skip type entirely if D&B absent |
| `BOARD_MEMBER` | `BOARDEX_EXEC_INTEL` (Plan 10) — director sits on board of company | unidirectional `director→company` | SOFT — `IF EXISTS BOARDEX_EXEC_INTEL` | skip type entirely if BoardEx absent (likely at Plan 9 ship time) |
| `ADVISOR_BOOK` | Synthesized internally — Wealth Management anchors share a hashed-advisor-id, peers in same advisor's book | unidirectional `client→peer` | none (internal) | always emits for ~30% of Wealth anchors |
| `REFERRAL` | Synthesized internally — small probability (~5%) of any anchor having one referrer | unidirectional `referrer→referred` | none (internal) | sparse; absent for most anchors |
| `BUSINESS_OWNER` | Bridges high-income PERSON anchors to BUSINESS accounts (heuristic: BIRTHDATE+income cohort biases toward business owner) | unidirectional `owner_person→business` | none (uses anchors only) | sparse; ~2-3% of PERSON anchors emit |
| `SELF` | Fallback — emitted iff no other edge type produced a row for this anchor | self-loop `src=dst` | none | guaranteed coverage; 1.0 weight |

**Cross-plan dependency strategy:** the SP's `main()` runs a `SELECT 1 FROM FINS.PUBLIC.<TABLE> LIMIT 1` for each of `CLARITAS_DEMOGRAPHICS`, `DNB_BUSINESS_CREDIT`, `BOARDEX_EXEC_INTEL` inside a try/except at the top, building a `available_edge_types: set[str]` containing only the edge-type slugs whose source tables exist. If any table is absent, the corresponding edge type is skipped — *not failed*. Per manifest §3.2: "If any are absent, the corresponding edge type is skipped (not failed)". The SELF fallback then guarantees coverage.

## Edge count distribution

Expected mean edges per anchor — across all edge types, including SELF:

```python
def _expected_edges(anchor, available_edge_types):
    """Rough projection — actual edges emitted depend on bias outputs.

    Mean target [3, 5] across the 36,813 audience:
    - All anchors emit SELF iff no other edge applies (~30-50% of audience).
    - HOUSEHOLD: ~25K Claritas-Family/Couple anchors × ~2 edges each (bidirectional).
    - CORPORATE_PARENT: ~3K D&B subsidiaries × 1 edge each.
    - BOARD_MEMBER (when Plan 10 ships): ~1K Commercial directors × ~3 boards each.
    - ADVISOR_BOOK: ~30% of Wealth (3,920) × ~2 peers each = ~2,400 edges.
    - REFERRAL: ~5% of all anchors × 1 edge each = ~1,800 edges.
    - BUSINESS_OWNER: ~2-3% of PERSON × 1 edge each = ~700 edges.

    Total ~110K-180K edges / 36,813 anchors → mean 3-5 edges/anchor.
    """
```

Volume target: **~110K–180K rows per weekly run**. Larger than Plan 6 (~52K) by 2-3×; this is the largest Cumulus table once shipped.

## EDGE_WEIGHT

```python
_EDGE_TYPE_WEIGHT_BAND = {
    # (low, high) — uniform in band, deterministic per edge
    "HOUSEHOLD":         (0.80, 1.00),  # tight family bonds
    "CORPORATE_PARENT":  (0.90, 1.00),  # near-deterministic (legal entity)
    "BOARD_MEMBER":      (0.55, 0.85),  # moderate
    "ADVISOR_BOOK":      (0.40, 0.70),  # peer-of-peer signal
    "REFERRAL":          (0.30, 0.60),  # sparse signal
    "BUSINESS_OWNER":    (0.85, 1.00),  # near-deterministic
    "SELF":              (1.00, 1.00),  # exact 1.0 always
}

def _edge_weight(edge_type, rng):
    lo, hi = _EDGE_TYPE_WEIGHT_BAND[edge_type]
    if lo == hi:
        return lo
    return round(rng.uniform(lo, hi), 3)
```

## CONFIDENCE_PCT

```python
def _confidence_pct(edge_type, edge_discovered_date, run_date, rng):
    """Confidence decays with edge age. SELF is always 100.00."""
    if edge_type == "SELF":
        return 100.00
    age_days = (run_date - edge_discovered_date).days
    age_decay = max(0, age_days - 365) / 30  # decay starts after a year
    base = {
        "HOUSEHOLD":        90.0,
        "CORPORATE_PARENT": 95.0,
        "BOARD_MEMBER":     80.0,
        "ADVISOR_BOOK":     70.0,
        "REFERRAL":         60.0,
        "BUSINESS_OWNER":   85.0,
    }[edge_type]
    base += rng.uniform(-5.0, 5.0)
    base -= age_decay
    return round(max(30.0, min(99.99, base)), 2)
```

## EDGE_DISCOVERED_DATE / EDGE_LAST_SEEN_DATE

```python
def _edge_dates(edge_type, run_ts, rng):
    """Discovered: 1-60 months ago. Last-seen: between discovered and run_date."""
    discovered_days_ago = rng.randint(30, 1800)
    discovered = run_ts.date() - timedelta(days=discovered_days_ago)
    # last_seen is between discovered and today (closer to today for active edges)
    seen_offset = rng.randint(0, max(1, discovered_days_ago - 1))
    last_seen = discovered + timedelta(days=seen_offset)
    if edge_type == "SELF":
        # SELF is always "fresh" — discovered=last_seen=today's Monday week_start.
        last_seen = run_ts.date()
        discovered = run_ts.date()
    return discovered, last_seen
```

Invariant: `EDGE_LAST_SEEN_DATE >= EDGE_DISCOVERED_DATE`.

## Per-EDGE_TYPE synthesis logic

Each edge function takes `(anchor, lookup_table, rng, run_ts)` and returns `list[dict]`. All non-SELF functions short-circuit to `[]` when their edge_type is not in `available_edge_types` or when the anchor / lookup combination doesn't match. Only SELF is unconditional, and only as a fallback (see `_rows_for` below).

```python
def _household_edges(anchor, household_pool, rng, run_ts):
    """Bidirectional household edges. Skip if HOUSEHOLD not available, anchor's
    Claritas composition isn't Family/Couple, or household has <2 members."""
    if "HOUSEHOLD" not in available_edge_types: return []
    if anchor.get("CLARITAS_HOUSEHOLD_COMPOSITION") not in ("Family", "Couple"): return []
    bucket = household_pool.get(_household_bucket(anchor))
    if not bucket or len(bucket) < 2: return []
    return [_make_edge(anchor["ACCOUNT_ID"], peer, "HOUSEHOLD",
                       rng, run_ts, metadata='{"household_role":"member"}')
            for peer in bucket if peer != anchor["ACCOUNT_ID"]]

def _corporate_parent_edges(anchor, dnb_parents, rng, run_ts):
    """One subsidiary→parent edge per BUSINESS anchor with a D&B parent."""
    if "CORPORATE_PARENT" not in available_edge_types: return []
    if anchor.get("ACCOUNT_TYPE_FLAG") != "BUSINESS": return []
    parent = dnb_parents.get(anchor["ACCOUNT_ID"])
    if not parent: return []
    return [_make_edge(anchor["ACCOUNT_ID"], parent, "CORPORATE_PARENT",
                       rng, run_ts, metadata='{"link_source":"dnb"}')]

def _board_member_edges(anchor, boardex_seats, rng, run_ts):
    """director→company edges from BoardEx. Multi-row when director sits on >1 board."""
    if "BOARD_MEMBER" not in available_edge_types: return []
    seats = boardex_seats.get(anchor["ACCOUNT_ID"])
    if not seats: return []
    return [_make_edge(anchor["ACCOUNT_ID"], c, "BOARD_MEMBER",
                       rng, run_ts, metadata='{"board_role":"Director"}') for c in seats]

def _advisor_book_edges(anchor, advisor_books, rng, run_ts):
    """Wealth anchors → 1-3 advisor-book peers, ~30% emit rate.
    advisor_books built in main() by hashing Wealth anchors into ~200 buckets."""
    if anchor.get("CLIENT_CATEGORY") != "Wealth Management": return []
    if rng.random() >= 0.30: return []
    book = advisor_books.get(_advisor_bucket(anchor))
    if not book: return []
    peers = [p for p in book if p != anchor["ACCOUNT_ID"]][:rng.randint(1, 3)]
    return [_make_edge(anchor["ACCOUNT_ID"], p, "ADVISOR_BOOK", rng, run_ts) for p in peers]

def _referral_edges(anchor, all_account_ids, rng, run_ts):
    """5% of anchors have one referrer."""
    if rng.random() >= 0.05: return []
    referrer = rng.choice(all_account_ids)
    if referrer == anchor["ACCOUNT_ID"]: return []
    return [_make_edge(anchor["ACCOUNT_ID"], referrer, "REFERRAL", rng, run_ts)]

def _business_owner_edges(anchor, business_account_ids, rng, run_ts):
    """High-income PERSON → BUSINESS owner edge. p caps ~10% at $5M income."""
    if anchor.get("ACCOUNT_TYPE_FLAG") != "PERSON": return []
    income = float(anchor.get("ANNUAL_INCOME") or 0)
    if income < 200_000: return []
    if rng.random() >= min(0.10, (income - 200_000) / 5_000_000): return []
    if not business_account_ids: return []
    return [_make_edge(anchor["ACCOUNT_ID"], rng.choice(business_account_ids),
                       "BUSINESS_OWNER", rng, run_ts,
                       metadata='{"ownership_pct":"majority"}')]

def _self_edge(anchor, run_ts):
    """Unconditional fallback. Fixed weight 1.000, confidence 100.00, dates=week_start."""
    return _make_edge(anchor["ACCOUNT_ID"], anchor["ACCOUNT_ID"], "SELF",
                      rng=None, run_ts=run_ts, metadata=None)
```

## Edge factory helper

```python
def _make_edge(src, dst, edge_type, rng, run_ts, metadata=None):
    discovered, last_seen = _edge_dates(edge_type, run_ts, rng) if rng else (run_ts.date(), run_ts.date())
    weight = _edge_weight(edge_type, rng) if rng else 1.000
    confidence = _confidence_pct(edge_type, discovered, run_ts.date(), rng) if rng else 100.00
    week_start = _week_start(run_ts)
    return {
        "SRC_ACCOUNT_ID":       src,
        "DST_ACCOUNT_ID":       dst,
        "EDGE_TYPE":            edge_type,
        "EDGE_WEIGHT":          weight,
        "CONFIDENCE_PCT":       confidence,
        "EDGE_DISCOVERED_DATE": discovered,
        "EDGE_LAST_SEEN_DATE":  last_seen,
        "METADATA":             metadata,
        "GENERATED_AT":         week_start,
    }
```

## Bias logic for `_rows_for` (skeleton)

```python
import random
from datetime import datetime, timedelta

def _week_start(run_ts):
    """Anchor on Monday 00:00 UTC of the run week."""
    return run_ts.replace(
        day=run_ts.day - run_ts.weekday(),
        hour=0, minute=0, second=0, microsecond=0,
    )

def _rows_for(anchor, run_ts, *, available_edge_types,
              household_pool, dnb_parents, boardex_seats,
              advisor_books, all_account_ids, business_account_ids):
    """Return a deterministically-ordered list of edge rows for one anchor.

    The cross-plan lookup tables (household_pool, dnb_parents, boardex_seats,
    advisor_books) are built once in main() and passed in. If a table doesn't
    exist (the corresponding edge_type was filtered out of available_edge_types
    upstream), the lookup will be empty and the edge function will short-circuit.
    """
    account_id = anchor["ACCOUNT_ID"]
    week_start = _week_start(run_ts)

    # Single salt, week-bucketed seed — anchors on Monday of run week.
    seed = seed_for(account_id, "synth-graph", week_start)
    rng = random.Random(seed)

    rows = []
    rows.extend(_household_edges(anchor, household_pool, rng, run_ts))
    rows.extend(_corporate_parent_edges(anchor, dnb_parents, rng, run_ts))
    rows.extend(_board_member_edges(anchor, boardex_seats, rng, run_ts))
    rows.extend(_advisor_book_edges(anchor, advisor_books, rng, run_ts))
    rows.extend(_referral_edges(anchor, all_account_ids, rng, run_ts))
    rows.extend(_business_owner_edges(anchor, business_account_ids, rng, run_ts))

    # Fallback: every anchor must contribute ≥1 row. SELF is the safety net.
    if not rows:
        rows.append(_self_edge(anchor, run_ts))

    # Deterministic ordering: sort by (DST_ACCOUNT_ID, EDGE_TYPE) before MERGE.
    rows.sort(key=lambda r: (r["DST_ACCOUNT_ID"], r["EDGE_TYPE"]))
    return rows
```

The SP's main loop flattens the list-of-lists, identical pattern to Plan 6:

```python
records = []
for anchor in audience:
    records.extend(_rows_for(anchor, run_ts, **lookup_tables))
accounts_processed = len(audience)  # 36,813
row_count = len(records)             # ~110K-180K
```

## Cross-plan dependency probe (in main())

```python
def _probe_available_edge_types(session) -> set[str]:
    """Defensive existence check — Plan 9 ships before Plan 10 (BoardEx).
    Skip edge types whose source tables don't exist; never fail the run.
    """
    available = {"ADVISOR_BOOK", "REFERRAL", "BUSINESS_OWNER", "SELF"}  # always-on
    for table, edge_type in [
        ("FINS.PUBLIC.CLARITAS_DEMOGRAPHICS", "HOUSEHOLD"),
        ("FINS.PUBLIC.DNB_BUSINESS_CREDIT",   "CORPORATE_PARENT"),
        ("FINS.PUBLIC.BOARDEX_EXEC_INTEL",    "BOARD_MEMBER"),
    ]:
        try:
            session.sql(f"SELECT 1 FROM {table} LIMIT 1").collect()
            available.add(edge_type)
        except Exception:
            pass  # table absent → skip this edge type, don't fail the run
    return available
```

## Coverage assertion — same shape as Plan 6, single-part

Plan 9's coverage is simpler than Plan 6's two-part band check because the SELF fallback guarantees `distinct(src) == audience` regardless of which cross-plan tables exist.

```python
COVERAGE_SQL = "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS"
ACTUAL_DISTINCT_SQL = "SELECT COUNT(DISTINCT SRC_ACCOUNT_ID) FROM FINS.PUBLIC.SYNTH_RELATIONSHIP_GRAPH"

audience_size = session.sql(COVERAGE_SQL).collect()[0][0]
distinct_srcs = session.sql(ACTUAL_DISTINCT_SQL).collect()[0][0]
if distinct_srcs != audience_size:
    raise RuntimeError(f"missing src anchors: expected {audience_size}, got {distinct_srcs}")
```

No row-count band check — the row-count target is informational (~110K-180K), not enforced. If only SELF edges materialize (worst case: every cross-plan table missing), row count will equal audience size (36,813) and that's still a successful run.

## `_anchor_in_audience`

```python
def _anchor_in_audience(anchor: dict) -> bool:
    return True  # all-accounts audience
```

## Boring case (must still emit)

A "boring" anchor — no Claritas household, no D&B parent, not on any board, not Wealth, not high-income PERSON, no referrer drawn — produces exactly **one** SELF row: `SRC=DST=ACCOUNT_ID`, `EDGE_TYPE='SELF'`, `EDGE_WEIGHT=1.000`, `CONFIDENCE_PCT=100.00`, `EDGE_DISCOVERED_DATE=EDGE_LAST_SEEN_DATE=week_start.date()`, `METADATA=NULL`.

A Wealth Management anchor with high income and a Claritas Family flag produces 2-4 HOUSEHOLD edges, 1-3 ADVISOR_BOOK edges, possibly 1 REFERRAL, possibly 1 BUSINESS_OWNER, and no SELF (other types fired).

A BUSINESS anchor with a D&B parent produces 1 CORPORATE_PARENT edge plus 1+ BOARD_MEMBER (when Plan 10 ships), and no SELF.

**No anchor is dropped.** Every account in the audience produces at least one row — SELF is the unconditional fallback.

## Anchor-influence test target (template L1 property #4)

**Plan 9 deviation: per-anchor invariants only — no distributional convergence over EDGE_TYPE rates.**

The 100-anchor SAMPLE_ANCHORS fixture has at most a handful of Wealth anchors and effectively zero Claritas / D&B / BoardEx coverage in L1 unit tests (those tables don't exist in the unit-test environment). Most non-SELF edge types resolve to "soft-skip" because `available_edge_types` excludes them — distributional rate testing is meaningless. Tests instead verify **per-anchor and per-edge invariants** that hold regardless of which cross-plan tables are populated:

1. **Determinism on multi-row output:** `_rows_for(anchor, run_ts)` returns the same list (length, dict-by-dict, ordering) on re-run with same `run_ts` and same `available_edge_types` set.

2. **SELF-fallback invariant** (the most load-bearing):
   - If `_rows_for` returns `[r]` with `r["EDGE_TYPE"] == "SELF"`, then `r["SRC_ACCOUNT_ID"] == r["DST_ACCOUNT_ID"]` AND `r["EDGE_WEIGHT"] == 1.000` AND `r["CONFIDENCE_PCT"] == 100.00`.
   - Every anchor with `available_edge_types == {"SELF"}` returns exactly one SELF row. (L1 default — most cross-plan tables absent.)
   - No anchor returns an empty list. Ever.

3. **Edge-weight bounds:** for every emitted row, `EDGE_WEIGHT` is in the type's declared band (`_EDGE_TYPE_WEIGHT_BAND`). SELF is exactly `1.000`. CORPORATE_PARENT and BUSINESS_OWNER ≥ 0.85.

4. **Confidence bounds:** for every emitted row, `CONFIDENCE_PCT` in [30.00, 100.00]. SELF is exactly `100.00`.

5. **Date-coherence invariants:**
   - `EDGE_LAST_SEEN_DATE >= EDGE_DISCOVERED_DATE` for every row.
   - `EDGE_DISCOVERED_DATE <= run_ts.date()` for every row (no future-dated discovery).
   - SELF rows: `EDGE_DISCOVERED_DATE == EDGE_LAST_SEEN_DATE == _week_start(run_ts).date()`.

6. **Edge-count band (per-anchor):** mean edges per anchor across the SAMPLE_ANCHORS fixture is in [1, 5]. With L1's empty cross-plan tables the mean will be 1.0 (every anchor SELF-fallbacks). With the full live data set the mean will be ~3-5. The test asserts the inclusive band; both extremes are valid.

Plus standard determinism + boring-case + schema-contract tests.

The L1 conftest reuses Plan 6's pattern: `SAMPLE_ANCHORS` from Cumulus_Common, `in_audience_anchors = list(all_anchors)` (since audience is `1=1`).

## Cadence

**Weekly.** CRON: `'USING CRON 0 5 * * 1 UTC'` (Monday 05:00 UTC). **Second weekly cadence** in the rollout (Plan 6 was first; Plan 12 will be third). Idempotent re-runs same week replace.

The `seed_for` salt is week-bucketed via `_week_start(run_ts)` which floors `run_ts` to Monday 00:00 UTC. Re-running the SP mid-week (e.g. Wednesday) produces byte-identical output to the Monday run because the seed and the `GENERATED_AT` both anchor on the week's Monday.

## Volume

**~110K–180K rows per weekly run.** 36,813 anchors × mean 3-5 edges/anchor. Largest Cumulus table by 2-3× over Plan 6 (52K) once shipped. write_pandas chunking (default 16K) is fine; Plan 6's pattern carries over unchanged.

If Plan 10 (BoardEx) hasn't shipped at Plan 9 deploy time, expect ~80K-120K rows (BOARD_MEMBER edges absent) — still the largest Cumulus table.

## Out of scope

- Graph algorithms (PageRank, centrality, community detection, shortest-path). Raw edge list only.
- Transitive closure — A→C not inferred from A→B + B→C.
- Time-windowed edges — only most-recent state, no observation-date history.
- Edge polarity / sentiment — only weight (strength), not signed direction.
- Real BoardEx / D&B / Claritas vendor licenses (we read synthesized Cumulus tables).
- Per-row provenance / attribution beyond minimal METADATA hints.
- Dedup across edge types — A↔B can have both HOUSEHOLD and ADVISOR_BOOK rows.
- Inverse edges for unidirectional types. HOUSEHOLD is the only bidirectional type.
