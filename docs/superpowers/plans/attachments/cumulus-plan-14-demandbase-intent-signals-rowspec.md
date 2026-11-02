# Plan 14 — Demandbase Intent Signals rowspec

> Per-dataset attachment for the dataset template. Authored 2026-11-02 from the vendor-gap assessment (Hunter B2B data list → "Buying intent" category) plus live probes of `DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS` (INDUSTRY / ANNUAL_REVENUE distribution on the 6,435-anchor audience) and `GONG_CALL_SENTIMENT.KEY_TOPICS_FLAGS` vocabulary (`Pricing` / `Renewal` / `Competitor` / `FeatureRequest`, pipe-delimited).
>
> **First 1:N dataset with a variable fan-out per period.** Plan 6 (Plaid) fans out per held-away account, which is stable. Plan 9 fans out per edge. Plan 14's topic fan-out changes week to week as scores cross the reporting threshold. That is why the SP rewrites each week wholesale (DELETE+INSERT) instead of MERGE-only.

## Mimics

**Demandbase Intent + G2 Buyer Intent + Bombora Company Surge®.** These are third-party, account-level signals showing which companies are researching which topics across the B2B publisher co-op and review sites. Real Demandbase reports per-(account, keyword-set) intent strength with a surge flag and trend; G2 adds "viewed category / compared vendors" signals. We mirror 17 fields scoped to 10 **commercial-banking product topics**, the slice a bank RM or treasury-sales team would subscribe to.

## Audience

`ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'`, which gives **6,435 anchors** (probed 2026-11-02).

INDUSTRY mix of the audience (top rows):

| INDUSTRY | Anchors | Median revenue |
|---|---|---|
| Restaurant | 876 | $0.72M |
| Retail Trade | 720 | $0.72M |
| Construction | 706 | $0.71M |
| Professional Services | 702 | $0.78M |
| Healthcare | 657 | $0.77M |
| NULL | 565 | — |
| Wholesale | 550 | $0.73M |
| Real Estate | 443 | $0.80M |
| Manufacturing / Logistics / Healthcare Systems / PS Mid-Market / RE Holdings / Wholesale Distribution / Hospitality | 1,082 | $22M–$29M |
| Technology / Financial Services / long tail | 134 | varies |

The book is **main-street-heavy**: about 75% of the audience is under $1M revenue with ~5 employees. The topic affinity map must make SBA Lending, Merchant Services and Business Credit Cards dominant for that cohort. Treasury Management and International Payments and FX belong to the ~1.2K mid-market anchors.

## Table: `FINS.PUBLIC.DEMANDBASE_INTENT_SIGNALS`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ORG_ID` | VARCHAR(18) | NOT NULL | DEFAULT `'JDO'` (multi-org Phase A convention) |
| `RECORD_ID` | VARCHAR(36) | NOT NULL | `record_id_for(ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)` |
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID |
| `PROFILE_WEEK` | DATE | NOT NULL | Monday of the run week |
| `INTENT_TOPIC` | VARCHAR(40) | NOT NULL | One of the 10 topics below |
| `TOPIC_CATEGORY` | VARCHAR(20) | NOT NULL | `Lending` / `Payments` / `Cash Management` / `Cards` — fixed by topic |
| `IS_TOP_TOPIC` | BOOLEAN | NOT NULL | True for exactly one row per (account, week) — the highest-affinity topic |
| `INTENT_SCORE` | NUMBER(3,0) | NOT NULL | [0, 100] — `_score_for` |
| `SURGE_FLAG` | BOOLEAN | NOT NULL | `INTENT_SCORE >= 70` |
| `WEEKS_SURGING` | NUMBER(2,0) | NOT NULL | Consecutive weeks (incl. this one) with SURGE_FLAG; 0 when not surging; capped at 12 |
| `SCORE_DELTA_WOW` | NUMBER(4,0) | NOT NULL | `score(W) - score(W-1)`, recomputed |
| `JOURNEY_STAGE` | VARCHAR(15) | NOT NULL | `Awareness` / `Consideration` / `Decision` / `Purchase` — from score + WEEKS_SURGING |
| `UNIQUE_RESEARCHERS` | NUMBER(2,0) | NOT NULL | [1, 40] distinct anonymous researchers; scales with EMPLOYEE_COUNT and score |
| `RESEARCHING_COMPETITOR` | VARCHAR(30) | NULL | Competitor the account compared on G2. NULL below score 50, except on the top row in a Gong-Competitor week. Where the gate is open: NULL ~80% baseline, ~30% when Gong flags Competitor |
| `KEYWORD_SAMPLE` | VARCHAR(200) | NOT NULL | 2–3 keywords from the topic's keyword bank, `; `-joined |
| `SIGNAL_SOURCE` | VARCHAR(12) | NOT NULL | `Demandbase` 55% / `Bombora` 30% / `G2` 15%; G2 forced when RESEARCHING_COMPETITOR is non-NULL |
| `LAST_SIGNAL_DATE` | DATE | NOT NULL | Day within [PROFILE_WEEK-6, PROFILE_WEEK] (the 7 days ending on the Monday run date). This keeps it ≤ the run date and identical for any run_ts in the week (amended 2026-11-02; was [PROFILE_WEEK, PROFILE_WEEK+6]) |
| `INTENT_NOTE` | VARCHAR(200) | NULL | Human-readable one-liner for surging rows only (e.g. `"3-week surge: 7 researchers comparing treasury platforms"`); NULL when not surging |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Week-bucketed (`week_start`) for byte-identical same-week re-runs |

That is 17 data columns plus ORG_ID and RECORD_ID: 15 NOT NULL and 2 NULLable (RESEARCHING_COMPETITOR, INTENT_NOTE). There are 2 BOOLEAN columns.

## Primary key

`(ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)`. The DC PK is `RECORD_ID`. Same-week re-runs DELETE that week's rows and re-INSERT them.

## Topic vocabulary

```python
_TOPICS = {
    # topic                               category          keyword bank
    "Treasury Management":              ("Cash Management", ["treasury management platform", "cash positioning", "sweep account", "liquidity forecasting"]),
    "Commercial Lending":                ("Lending",         ["commercial term loan", "working capital line", "revolving credit facility", "business acquisition financing"]),
    "Equipment Finance":                 ("Lending",         ["equipment lease", "equipment loan rates", "fleet financing", "section 179"]),
    "Merchant Services":                 ("Payments",        ["POS system", "card processing fees", "merchant account", "tap to pay"]),
    "International Payments and FX":     ("Payments",        ["international wire", "FX hedging", "multi-currency account", "cross-border payments"]),
    "Payroll Services":                  ("Cash Management", ["payroll provider", "payroll software small business", "PEO comparison"]),
    "Commercial Real Estate Lending":     ("Lending",         ["CRE loan", "commercial mortgage rates", "construction-to-perm loan", "DSCR loan"]),
    "SBA Lending":                       ("Lending",         ["SBA 7a loan", "SBA 504", "SBA lender", "small business loan requirements"]),
    "AP Automation":                     ("Payments",        ["accounts payable automation", "virtual card payments", "invoice processing", "ACH vendor payments"]),
    "Business Credit Cards":             ("Cards",           ["business credit card", "corporate card", "expense management card", "cash back business card"]),
}
_COMPETITORS = ["JPMorgan Chase", "Bank of America", "Wells Fargo", "U.S. Bank", "PNC",
                "Truist", "Live Oak Bank", "Brex", "Ramp", "Square"]
```

## Base affinity (year-stable, salt `demandbase_year`)

```python
_INDUSTRY_AFFINITY = {  # topic -> multiplier on base affinity; unlisted topics = 1.0
    "Restaurant":        {"Merchant Services": 3.0, "Payroll Services": 2.0, "Equipment Finance": 1.8, "Business Credit Cards": 1.6, "SBA Lending": 1.2},  # amended from 1.5, see note
    "Retail Trade":      {"Merchant Services": 3.0, "Business Credit Cards": 1.8, "SBA Lending": 1.5, "Payroll Services": 1.4},
    "Construction":      {"Equipment Finance": 3.0, "Commercial Lending": 1.8, "Payroll Services": 1.5, "SBA Lending": 1.4},
    "Professional Services": {"Business Credit Cards": 2.0, "Payroll Services": 1.8, "AP Automation": 1.4},
    "Healthcare":        {"Equipment Finance": 2.2, "AP Automation": 1.8, "SBA Lending": 1.5, "Payroll Services": 1.4},
    "Wholesale":         {"International Payments and FX": 2.2, "AP Automation": 2.0, "Commercial Lending": 1.5},
    "Real Estate":       {"Commercial Real Estate Lending": 3.5, "Treasury Management": 1.2},
    "Real Estate Holdings": {"Commercial Real Estate Lending": 3.5, "Treasury Management": 1.6},
    "Manufacturing":     {"Equipment Finance": 2.5, "International Payments and FX": 2.0, "Commercial Lending": 1.8, "Treasury Management": 1.5},
    "Logistics":         {"Equipment Finance": 2.5, "International Payments and FX": 2.0, "AP Automation": 1.8},
    "Wholesale Distribution": {"International Payments and FX": 2.5, "AP Automation": 2.0, "Treasury Management": 1.6},
    "Healthcare Systems": {"Treasury Management": 2.0, "AP Automation": 2.0, "Equipment Finance": 1.8},
    "Technology":        {"Treasury Management": 2.2, "Business Credit Cards": 2.0, "International Payments and FX": 1.6},
    "Hospitality":       {"Merchant Services": 2.5, "Commercial Real Estate Lending": 1.8, "Payroll Services": 1.6},
}

def _revenue_tilt(topic, annual_revenue):
    """Main-street (<$1M) skews SBA/cards; mid-market (>=$10M) skews treasury/FX/commercial lending."""
    rev = annual_revenue or 0
    if rev >= 10_000_000:
        return {"Treasury Management": 2.0, "International Payments and FX": 1.6, "Commercial Lending": 1.6,
                "SBA Lending": 0.3, "Business Credit Cards": 0.7}.get(topic, 1.0)
    if rev < 1_000_000:
        return {"SBA Lending": 1.8, "Business Credit Cards": 1.4, "Treasury Management": 0.3,
                "International Payments and FX": 0.4}.get(topic, 1.0)
    return 1.0

def _base_affinity(anchor, topic, year):
    rng = Random(seed_for(anchor["ACCOUNT_ID"] + "_" + topic, "demandbase_year", datetime(year, 1, 1)))
    ind = _INDUSTRY_AFFINITY.get(anchor.get("INDUSTRY") or "", {})
    return rng.uniform(0.6, 1.4) * ind.get(topic, 1.0) * _revenue_tilt(topic, anchor.get("ANNUAL_REVENUE"))
```

**Amended 2026-11-02 (Task 3):** Restaurant × SBA Lending is **1.2**, not 1.5. With the <$1M revenue tilt (SBA ×1.8), 1.5 put SBA at 2.7 against Merchant Services at 3.0. Only 66.8% of main-street restaurant anchor-years then got a top topic in {Merchant, Payroll, Equipment, Cards}, below the ≥80% L1 / ≥75% L3 band. With 1.2 the figure is 88.5% (4,000 synthetic anchor-years, re-run in review).

## `_score_for` — the trajectory function (load-bearing)

This is a pure function of `(anchor, topic, week_start)`. It must **not** depend on any other week's output, because `WEEKS_SURGING` and `SCORE_DELTA_WOW` call it for prior weeks.

```python
def _score_for(anchor, topic, week_start):
    aff = _base_affinity(anchor, topic, week_start.year)            # ~0.2 .. ~6
    base = min(55.0, 12.0 * aff)                                    # resting level 2..55
    # Surge episodes: an account-topic enters a 2-8 week surge with weekly hazard tied to affinity.
    # Episode boundaries come from a 12-week-block seed, so they are recomputable from week_start alone.
    block = week_start - timedelta(weeks=(week_start.isocalendar()[1] % 12))
    brng = Random(seed_for(anchor["ACCOUNT_ID"] + "_" + topic + "_episode", "demandbase_year", block))
    surging = False
    if brng.random() < min(0.6, 0.08 * aff):                        # this block has an episode
        start = brng.randint(0, 9); length = brng.randint(2, 8)
        offset = (week_start - block).days // 7
        surging = start <= offset < start + length
    wrng = Random(seed_for(anchor["ACCOUNT_ID"] + "_" + topic, "demandbase", week_start))
    bump = wrng.uniform(28, 45) if surging else 0.0
    score = base + bump + wrng.gauss(0, 6)
    return int(max(0, min(100, round(score))))
```

**Amended 2026-11-02 (Task 3): tuned episode values. The code is authoritative.** The values above (hazard `min(0.6, 0.08*aff)`, bump `U(28, 45)`, blocks aligned for every account) gave ~1.3 rows per anchor-week, ~6% surging rows and ~7% of accounts surging on a live sample, below every L3 band. They also gave a book-wide 12-week sawtooth. The shipped scheme is:
- 12-week blocks counted from a Monday epoch (1970-01-05), each shifted by a fixed per-(account, topic) phase.
- At most one 2–8-week episode per block.
- Hazard `min(0.70, 0.15*aff)`, bump `U(35, 50)`.

On 868 real audience anchors over 10 weeks this gave 1.625 rows per anchor-week, 14.4% surging rows and 21.3% of accounts surging.

The `block` math is illustrative. The implementer may choose any recomputable episode scheme, provided that:
- (a) an episode spans consecutive weeks;
- (b) surge probability rises with affinity;
- (c) `_score_for` takes only `(anchor, topic, week_start)`.

Episodes crossing a 12-week block boundary are allowed to truncate. `WEEKS_SURGING` just counts what `_score_for` says.

```python
def _weeks_surging(anchor, topic, week_start, score_now):
    if score_now < 70: return 0
    n = 1
    while n < 12 and _score_for(anchor, topic, week_start - timedelta(weeks=n)) >= 70:
        n += 1
    return n
```

Cost: 10 topics × up to 13 `_score_for` calls ≈ 130 SHA-256 seeds per anchor-week. That is about 840K seeds per weekly run for 6,435 anchors, which is fine on `MAIN_WH_XS`. The 26-week backfill is ~22M seeds, which needs a timing check in L2. If it's too slow, memoize `_score_for` per (account, topic) within the backfill loop.

## Row selection

```python
_REPORT_THRESHOLD = 40

def _rows_for(anchor, run_ts, gong_flags):
    week = week_start_of(run_ts)
    scores = {t: _score_for(anchor, t, week) for t in _TOPICS}
    top = max(_TOPICS, key=lambda t: (_base_affinity(anchor, t, week.year), t))   # year-stable top topic
    emit = [top] + sorted((t for t in _TOPICS if t != top and scores[t] >= _REPORT_THRESHOLD),
                          key=lambda t: -scores[t])[:3]
    return [_row(anchor, t, week, scores[t], is_top=(t == top), gong_flags=gong_flags, run_ts=run_ts) for t in emit]
```

`IS_TOP_TOPIC` is the **year-stable** highest-affinity topic, not this week's highest score. The "what is this account usually in-market for" answer must not flicker.

## JOURNEY_STAGE

```python
def _journey_stage(score, weeks_surging):
    if weeks_surging >= 4 and score >= 85: return "Purchase"
    if weeks_surging >= 2: return "Decision"
    if score >= 50: return "Consideration"
    return "Awareness"
```

## UNIQUE_RESEARCHERS

```python
def _unique_researchers(employee_count, score, rng):
    cap = 3 if (employee_count or 0) < 20 else (12 if employee_count < 500 else 40)
    return max(1, min(cap, round(cap * (score / 100.0) * rng.uniform(0.5, 1.2))))
```

## RESEARCHING_COMPETITOR (Gong soft-dep)

```python
def _researching_competitor(anchor, topic, week, gong_flags, rng):
    p = 0.70 if (gong_flags and "Competitor" in gong_flags.split("|")) else 0.20
    if rng.random() >= p: return None
    yrng = Random(seed_for(anchor["ACCOUNT_ID"] + "_" + topic + "_comp", "demandbase_year", datetime(week.year, 1, 1)))
    pool = ["Brex", "Ramp", "Square"] if topic in ("Business Credit Cards", "Merchant Services", "AP Automation") else _COMPETITORS[:7]
    return yrng.choice(pool)  # year-stable: an account keeps comparing the same rival
```

The `p` applies only on rows with `score >= 50`. Below that, the value is always NULL, because nobody compares vendors at the awareness stage.

**Amended 2026-11-02 (Task 3 review): Gong override on the top row.** When same-week Gong flags `Competitor`, the score ≥50 gate is **lifted on the IS_TOP_TOPIC row**, so p = 0.70 applies at any score. Non-top rows keep the gate. The reason is that top rows rest at `min(55, 12*aff)` and mostly score below 50. With the gate kept, only ~18% of top rows got a competitor on 868 live anchors even with every week flagged. That would fail the plan's L2 gate (≥3 of 6 flagged anchors' top rows) and its L3 gate (≥55% of top rows in Gong-Competitor weeks). A Gong `Competitor` mention is first-party evidence that the account is comparing banks, and the top topic is its core product need. Measured on L1 synthetic data: 72% of top rows are non-NULL when flagged and 4.2% when unflagged.

## Bias logic for `_rows_for`

- INDUSTRY × topic multiplier, then ANNUAL_REVENUE tilt, then per-(account, topic) year-stable jitter, which gives base affinity.
- Base affinity sets both the resting score and the surge-episode hazard. High-affinity topics surge more often and from a higher floor.
- `EMPLOYEE_COUNT` scales UNIQUE_RESEARCHERS.
- Gong same-week `Competitor` flag raises RESEARCHING_COMPETITOR probability.

## Boring case (must still emit)

Take an anchor with `INDUSTRY=None`, `ANNUAL_REVENUE=None` and `EMPLOYEE_COUNT=None`, with no Gong row. In most weeks it emits exactly **one** row (amended 2026-11-02: ≥60% of weeks asserted, 71% observed over 52 weeks; with the tuned episode hazard a second topic occasionally crosses 40). That row is its year-stable top topic (seed-chosen from uniform affinities), with INTENT_SCORE in roughly [5, 25] in most weeks, SURGE_FLAG=False, WEEKS_SURGING=0, JOURNEY_STAGE=`Awareness`, UNIQUE_RESEARCHERS=1, RESEARCHING_COMPETITOR=None and INTENT_NOTE=None. It never raises.

## L1 property targets

1. **Determinism:** same `(anchor, run_ts)` gives an identical list. Any `run_ts` in the same week gives an identical list.
2. **Fan-out:** `1 <= len(rows) <= 4`; exactly one `IS_TOP_TOPIC`; topics unique.
3. **Top-topic stability:** for 50 weeks within one year, the `IS_TOP_TOPIC` topic is constant per anchor.
4. **Invariants 4a–4e:** as listed in the plan §4 Task 3.
5. **Boring case:** as above.
