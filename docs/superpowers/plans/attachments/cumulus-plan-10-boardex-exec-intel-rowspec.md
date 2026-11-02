# Plan 10 — BoardEx Exec Intel rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §13 (BoardEx / Equilar / ISS) + the live `CLIENT_CATEGORY` distribution on Commercial Banking anchors in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.
>
> **Plan 10 is the smallest Cumulus dataset, dethroning Plan 8 by 4×.** Commercial Banking is **960 anchors** — 4.1× smaller than the next-smallest plan (MGP Financial Plans at 3,920) and 11.9× smaller than the next-after-that (MSCI ESG / D&B at 11,389). Property-test design must shift even harder than Plan 8 toward **per-anchor deterministic invariants**: at SAMPLE_ANCHORS' 100-anchor scale the L1 fixture has **zero** Commercial Banking anchors (the fixture is Retail / Wealth / Household / Small Business heavy), so the L1 conftest must build an inline synthetic mini-fixture rather than filter SAMPLE_ANCHORS.

## Mimics

**BoardEx + Equilar + ISS Governance** — vendor-grade director-and-executive intelligence used by commercial bankers, RM teams, and corporate-development analysts to map the people behind the entity. Real BoardEx publishes board membership, executive compensation, governance scores, and committee assignments (~80 distinct fields per company); we mirror 14 that hit the demo's "who runs this client and how is the board healthy?" use case.

## Audience

`CLIENT_CATEGORY = 'Commercial Banking'` — **960 distinct anchors** (probed 2026-05-28). The canonical literal is `'Commercial Banking'` (per the v1.5 9-value CLIENT_CATEGORY caveat in the umbrella spec — verify defensively before SP runs). The cohort is overwhelmingly BUSINESS-typed (Commercial Banking is enterprise by definition). A defensive `_row_for` should still tolerate any PERSON rows that drift in: in that case skip Person-only fields (no PERSON-specific synthesis here, so the row is simply emitted with the BUSINESS shape).

Why Commercial-Banking-only: BoardEx-style governance intelligence is a Commercial / Corporate Banking product. Retail customers don't have boards, Wealth clients are individuals, and Small Business is too small to maintain formal governance structures. Commercial Banking is the only audience where every anchor is plausibly an enterprise with a board.

## Table: `FINS.PUBLIC.BOARDEX_EXEC_INTEL`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID |
| `PROFILE_MONTH` | DATE | NOT NULL | First-of-month for the run timestamp |
| `BOARD_SIZE` | NUMBER(2,0) | NOT NULL | Number of directors. Range [5, 15]. Biased by EMPLOYEE_COUNT. |
| `BOARD_INDEPENDENCE_PCT` | NUMBER(5,2) | NOT NULL | % independent (non-executive) directors. Range [50.00, 100.00]. Biased toward 70-90 for established banks. |
| `WOMEN_BOARD_PCT` | NUMBER(5,2) | NOT NULL | % women on the board. Range [0.00, 100.00]. Demographic distribution. |
| `MINORITY_BOARD_PCT` | NUMBER(5,2) | NOT NULL | % racial / ethnic minorities. Range [0.00, 100.00]. |
| `BOARD_AVG_TENURE_YEARS` | NUMBER(4,1) | NOT NULL | Average years on the board across all directors. Range [1.0, 20.0]. |
| `CEO_TENURE_YEARS` | NUMBER(4,1) | NOT NULL | Current CEO tenure: years since the last CEO change on the account's C-suite timeline (see below). Grows ~1/12 per month, resets on a CEO change. Range [0.0, 25.0]. Larger employers skew longer. |
| `EXEC_TURNOVER_FLAG` | BOOLEAN | NOT NULL | True if any C-suite change in the trailing 12 months. ~20% True overall, biased lower for long-CEO-tenure firms. Window read over the account's C-suite timeline, so a change in month M keeps the flag True for M..M+11 (sticky; fixed 2026-11-02, was an iid monthly draw). |
| `GOVERNANCE_RATING` | VARCHAR(15) | NOT NULL | One of `Excellent` / `Strong` / `Adequate` / `Weak` / `Concerning`. Biased by independence + tenure inputs. |
| `INTERLOCK_COUNT` | NUMBER(2,0) | NOT NULL | Count of board members who sit on other Commercial Banking client boards. Range [0, 5]. |
| `KEY_DIRECTOR_NAME` | VARCHAR(80) | NOT NULL | Exemplar synthesized director full name (single-row example for narrative). |
| `RECENT_GOVERNANCE_EVENT_DATE` | DATE | NULL | Last reported governance change (e.g., chair swap, audit-committee restructure). NULL for ~70% of rows. |
| `LAST_DATA_REFRESH_DATE` | DATE | NOT NULL | Vendor's last data refresh. Always ≤ run_ts.date(). Within 1-30 days ago. |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Month-bucketed for byte-identical mid-month re-runs. |

14 columns total: 13 NOT NULL + 1 NULLable (RECENT_GOVERNANCE_EVENT_DATE). 1 BOOLEAN.

## Primary key

`(ACCOUNT_ID, PROFILE_MONTH)` — one row per Commercial Banking account per month. Re-runs same month replace.

## BOARD_SIZE

```python
def _board_size(employee_count, rng):
    """Larger firms have larger boards. BoardEx median ~9 across public companies."""
    if employee_count >= 10000:  # large enterprise: 9-15
        return rng.choices([9, 10, 11, 12, 13, 14, 15], weights=[0.10, 0.20, 0.25, 0.20, 0.15, 0.07, 0.03])[0]
    if employee_count >= 1000:   # mid-market: 7-12
        return rng.choices([7, 8, 9, 10, 11, 12], weights=[0.10, 0.20, 0.30, 0.25, 0.10, 0.05])[0]
    if employee_count >= 100:    # small-to-mid: 5-10
        return rng.choices([5, 6, 7, 8, 9, 10], weights=[0.10, 0.20, 0.25, 0.25, 0.15, 0.05])[0]
    return rng.choices([5, 6, 7, 8], weights=[0.30, 0.35, 0.25, 0.10])[0]  # smallest: 5-8
```

## BOARD_INDEPENDENCE_PCT

```python
def _board_independence_pct(rng):
    """Established commercial-banking clients are mostly mature corporates with
    NYSE/NASDAQ-style governance norms (≥75% independent). Skew toward 70-90."""
    return round(rng.uniform(50.0, 100.0) * 0.4 + rng.uniform(70.0, 90.0) * 0.6, 2)
```

## Diversity and tenure scalars

```python
def _women_board_pct(rng):
    """Real BoardEx 2026 mean ~32% women across S&P 500; skews 20-45."""
    return round(rng.uniform(0.0, 50.0) * 0.3 + rng.uniform(20.0, 45.0) * 0.7, 2)

def _minority_board_pct(rng):
    """Real BoardEx 2026 mean ~22% minorities; skews 10-35."""
    return round(rng.uniform(0.0, 50.0) * 0.3 + rng.uniform(10.0, 35.0) * 0.7, 2)

def _board_avg_tenure(rng):
    """Established commercial banks: avg board tenure 6-10 years. Range [1.0, 20.0]."""
    return round(rng.uniform(3.0, 14.0), 1)

```

## C-suite change timeline → CEO_TENURE_YEARS + EXEC_TURNOVER_FLAG

> **Fixed 2026-11-02.** Until then both fields were re-drawn independently every month from the monthly rng (`_ceo_tenure` uniform per band, then `_exec_turnover_flag` as an iid 35/20/10% Bernoulli keyed on that tenure). The flag flickered: live 2024-06 → 2026-11 on BUSINESS rows showed 49,962 FALSE→TRUE rises, 49,941 TRUE→FALSE falls and only 12,457 TRUE→TRUE stays. That contradicts "trailing 12 months", so both fields now read one account-lifetime timeline.

Each BUSINESS anchor gets **one lifetime timeline of C-suite change events** from its own rng stream, independent of the profile month and run timestamp:

```python
rng = random.Random(seed_for(account_id + "_csuite", "boardex", datetime(2000, 1, 1)))

# Firm stability: expected CEO tenure (years) per EMPLOYEE_COUNT band.
# Same ordering as the retired _ceo_tenure bands (>=10k longest).
_CEO_TENURE_MEAN_BANDS = ((10000, (8.0, 16.0)), (1000, (6.0, 13.0)), (0, (4.5, 13.0)))
mean_tenure = rng.uniform(*band_range)        # per-firm
ceo_rate    = 1 / mean_tenure                 # CEO changes per year
other_rate  = 0.8 * ceo_rate                  # CFO/COO/CRO/CTO/CIO/GC departures

# Incumbent CEO started 0-15 years before 2000-01-01 ("CEO_START", not a change).
# CEO changes: exponential gaps (mean = mean_tenure), each clamped to
# [0.25, 22] years so tenure stays inside [0, 25]; generated to 2031-01-01.
# Other C-suite changes: Poisson process (exponential gaps) 2000-01-01 → 2031-01-01,
# role drawn from {CFO, COO, CRO, CTO, CIO, General Counsel}.
```

Per profile month M (month_end = last day of M):

```python
EXEC_TURNOVER_FLAG(M) = any change (CEO or other role) dated in (month_end(M-12), month_end(M)]
CEO_TENURE_YEARS(M)   = round((month_end(M) - last CEO start/change <= month_end(M)) / 365.25, 1)
```

Consequences:

- **Sticky.** A FALSE→TRUE rise at M implies TRUE for M..M+11. TRUE→TRUE stays outnumber rises ~12×. Projected on the live audience (offline replay of the deployed SP logic over the live `V_ACCOUNT_ANCHORS` audience (36,949 anchors, 10,864 BUSINESS) for 2024-06 → 2026-11, run 2026-11-02: monthly TRUE rate 19.85%-21.12% (20.55% overall), 4,682 rises / 60,110 stays / 4,673 falls (stays ≈ 12.8× rises), 0 stickiness violations out of 2,929 checkable rises). The logic is deterministic, so the live in-place re-run must reproduce these exact numbers; it has not run yet (see Snowflake_BoardEx_ExecIntel/AGENTS.md).
- **~20% TRUE.** For a homogeneous Poisson process, P(TRUE) = 1 − exp(−1.8 / mean_tenure). With the live BUSINESS band mix (90% < 100 employees) the projected rate is 20.55%. Per band, the band means imply a lower rate for the larger bands, and that holds on average over a synthetic population (enforced by L1). On the live audience the bands are tiny, so the per-band numbers are noisy. Projected: <1k 20.6% (10,728 anchors), 1k-9,999 16.1% (119), ≥10k 20.6% (only 17 anchors).
- **Biased lower for long-tenure firms.** Firms with a longer mean CEO tenure change both CEO and other C-suite less often. Rows with CEO_TENURE ≥ 7 have a lower TRUE rate than the population.
- **A CEO change implies the flag is TRUE** (the change is inside the window), and CEO_TENURE_YEARS resets below 1.0.
- **No monthly-rng draws.** The tenure/flag pair no longer consumes the monthly rng, so every later draw in the row (GOVERNANCE_RATING noise, INTERLOCK_COUNT, KEY_DIRECTOR_NAME, dates) shifted once on 2026-11-02. `_governance_rating` still reads `exec_turnover`.
- PERSON anchors are unchanged: flag False, CEO_TENURE_YEARS = 5.0.

## GOVERNANCE_RATING

```python
_GOVERNANCE_TIERS = ["Excellent", "Strong", "Adequate", "Weak", "Concerning"]

def _governance_rating(independence_pct, avg_tenure, exec_turnover, rng):
    """High independence = better; very-low or very-high avg tenure = worse
    (board churn or stagnation). EXEC_TURNOVER nudges toward lower tiers."""
    score = 0.0
    score += 2.0 if independence_pct >= 85.0 else (1.0 if independence_pct >= 70.0 else 0.0)
    if 5.0 <= avg_tenure <= 10.0: score += 1.0
    elif avg_tenure < 3.0 or avg_tenure > 14.0: score -= 1.0
    if exec_turnover: score -= 0.5
    score += rng.uniform(-1.0, 1.0)
    if score >= 2.0: return "Excellent"
    if score >= 1.0: return "Strong"
    if score >= -0.5: return "Adequate"
    if score >= -1.5: return "Weak"
    return "Concerning"
```

## INTERLOCK_COUNT

```python
def _interlock_count(interlock_degree, rng):
    """Anchor INTERLOCK_DEGREE drives this; default to a small distribution at 1-2."""
    base = int(interlock_degree or 0)
    if base >= 4:
        return rng.choices([2, 3, 4, 5], weights=[0.20, 0.35, 0.30, 0.15])[0]
    if base >= 2:
        return rng.choices([0, 1, 2, 3, 4], weights=[0.10, 0.25, 0.35, 0.20, 0.10])[0]
    return rng.choices([0, 1, 2, 3], weights=[0.40, 0.30, 0.20, 0.10])[0]
```

## KEY_DIRECTOR_NAME

```python
_FIRST_NAMES = ["James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael",
                "Linda", "David", "Elizabeth", "Aisha", "Diego", "Priya", "Wei",
                "Carlos", "Fatima", "Hiroshi", "Chen"]
_LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
               "Davis", "Rodriguez", "Martinez", "Patel", "Nguyen", "Kim", "Khan",
               "O'Connor", "Hassan"]

def _key_director_name(rng):
    """Single-row exemplar director used for narrative generation downstream.
    Synthesized from a small name pool — clearly fake; not real-person PII."""
    return f"{rng.choice(_FIRST_NAMES)} {rng.choice(_LAST_NAMES)}"
```

## Date fields

```python
def _recent_governance_event(run_ts, rng):
    """30% populated within the last 365 days; 70% NULL (no notable event)."""
    if rng.random() >= 0.30:
        return None
    return run_ts.date() - timedelta(days=rng.randint(1, 365))

def _last_data_refresh(run_ts, rng):
    """Vendor refresh cadence: 1-30 days ago. Always ≤ run_ts.date()."""
    return run_ts.date() - timedelta(days=rng.randint(1, 30))
```

## Bias logic for `_row_for` (skeleton)

```python
import random
from datetime import datetime, timedelta

# Anchor extraction.
account_id     = anchor["ACCOUNT_ID"]
employee_count = int(anchor.get("EMPLOYEE_COUNT") or 0)
interlock_deg  = int(anchor.get("INTERLOCK_DEGREE") or 0)

# Month-bucketed seed.
month_start = run_ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
rng = random.Random(seed_for(account_id, "boardex", month_start))

# 1. Board structure (size + independence drive most downstream signals).
board_size       = _board_size(employee_count, rng)
independence_pct = _board_independence_pct(rng)
women_pct        = _women_board_pct(rng)
minority_pct     = _minority_board_pct(rng)
avg_tenure       = _board_avg_tenure(rng)

# 2. CEO and exec-suite signals come from the account-lifetime C-suite
#    timeline (own rng stream — no monthly-rng draws); governance rating
#    is the composite.
timeline          = _csuite_timeline(account_id, _employee_band_floor(employee_count))
ceo_tenure, exec_turnover = _exec_state_for_month(timeline, month_start.date())
governance_rating = _governance_rating(independence_pct, avg_tenure, exec_turnover, rng)

# 3. Network exemplar and dates.
interlock_count   = _interlock_count(interlock_deg, rng)
director_name     = _key_director_name(rng)
recent_event_date = _recent_governance_event(run_ts, rng)
last_refresh_date = _last_data_refresh(run_ts, rng)

return {
    "ACCOUNT_ID": account_id, "PROFILE_MONTH": month_start.date(),
    "BOARD_SIZE": board_size, "BOARD_INDEPENDENCE_PCT": independence_pct,
    "WOMEN_BOARD_PCT": women_pct, "MINORITY_BOARD_PCT": minority_pct,
    "BOARD_AVG_TENURE_YEARS": avg_tenure, "CEO_TENURE_YEARS": ceo_tenure,
    "EXEC_TURNOVER_FLAG": exec_turnover, "GOVERNANCE_RATING": governance_rating,
    "INTERLOCK_COUNT": interlock_count, "KEY_DIRECTOR_NAME": director_name,
    "RECENT_GOVERNANCE_EVENT_DATE": recent_event_date,
    "LAST_DATA_REFRESH_DATE": last_refresh_date,
    "GENERATED_AT": month_start,
}
```

## Boring case (must still emit)

A "boring" Commercial Banking anchor — mid-market enterprise, ~2,500 employees, INTERLOCK_DEGREE=2 — produces: BOARD_SIZE 8-10; BOARD_INDEPENDENCE_PCT 70-85; WOMEN/MINORITY 25-40 / 15-30; BOARD_AVG_TENURE 5-10; CEO_TENURE 4-12; EXEC_TURNOVER_FLAG False most months (~20% of months True, in runs of ≥12 consecutive months after each C-suite change); GOVERNANCE_RATING `Strong` or `Adequate`; INTERLOCK_COUNT 1-3; KEY_DIRECTOR_NAME e.g. `Patricia Garcia`; RECENT_GOVERNANCE_EVENT_DATE NULL (70% likelihood); LAST_DATA_REFRESH_DATE 1-30 days before run_ts.

A large-enterprise anchor (25,000+ employees, INTERLOCK_DEGREE=4) skews to BOARD_SIZE 11-14, CEO_TENURE 5-15, INTERLOCK_COUNT 3-5, GOVERNANCE_RATING `Excellent` / `Strong`.

**No anchor is dropped.** Every Commercial Banking anchor produces exactly one row per month.

## Anchor-influence test target (template L1 property #4)

**Plan 10 deviation: cohort-fixture override.** Plan 10 is the first dataset where the SAMPLE_ANCHORS fixture has zero relevant cohort members at all — Commercial Banking is 960 of ~36,800 anchors (~2.6%), and SAMPLE_ANCHORS is a 100-row Retail / Wealth / Household / Small Business slice that doesn't contain any Commercial Banking rows. The Plan 5/6 graceful-skip pattern would silently skip every cohort-specific test in Plan 10, which defeats the point.

**Recommended fix (build it, don't skip it):** the L1 conftest builds an inline 5-anchor synthetic Commercial Banking fixture instead of (or alongside) SAMPLE_ANCHORS, with hand-picked EMPLOYEE_COUNT and INTERLOCK_DEGREE values to exercise each bias band:

```python
# conftest.py — Plan 10 only
COMMERCIAL_BANKING_FIXTURE = [
    {"ACCOUNT_ID": "TEST_CB_001", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Commercial Banking", "EMPLOYEE_COUNT": 25000,
     "INTERLOCK_DEGREE": 4, "INDUSTRY": "Manufacturing", "ANNUAL_REVENUE": 500_000_000},
    {"ACCOUNT_ID": "TEST_CB_002", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Commercial Banking", "EMPLOYEE_COUNT": 2500,
     "INTERLOCK_DEGREE": 2, "INDUSTRY": "Healthcare", "ANNUAL_REVENUE": 80_000_000},
    {"ACCOUNT_ID": "TEST_CB_003", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Commercial Banking", "EMPLOYEE_COUNT": 250,
     "INTERLOCK_DEGREE": 1, "INDUSTRY": "Tech", "ANNUAL_REVENUE": 25_000_000},
    {"ACCOUNT_ID": "TEST_CB_004", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Commercial Banking", "EMPLOYEE_COUNT": 50,
     "INTERLOCK_DEGREE": 0, "INDUSTRY": "Finance", "ANNUAL_REVENUE": 5_000_000},
    {"ACCOUNT_ID": "TEST_CB_005", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Commercial Banking", "EMPLOYEE_COUNT": 12000,
     "INTERLOCK_DEGREE": 3, "INDUSTRY": "Energy", "ANNUAL_REVENUE": 200_000_000},
]
```

This fixture, rolled across 6+ months, gives 30+ rows — enough to encounter all 5 governance ratings and exercise every bias band.

The 5 properties test:

1. **Per-anchor range invariants:**
   - `BOARD_SIZE` in [5, 15] for every anchor.
   - `BOARD_INDEPENDENCE_PCT`, `WOMEN_BOARD_PCT`, `MINORITY_BOARD_PCT` all in [0.0, 100.0].
   - `BOARD_AVG_TENURE_YEARS` in [1.0, 20.0].
   - `CEO_TENURE_YEARS` in [0.0, 25.0].
   - `INTERLOCK_COUNT` in [0, 5].

2. **Per-row vocabulary invariants:**
   - `GOVERNANCE_RATING` in `{Excellent, Strong, Adequate, Weak, Concerning}` always.
   - `EXEC_TURNOVER_FLAG` is a Python `bool` (not int 0/1, not string).

3. **Date-coherence invariants:**
   - `LAST_DATA_REFRESH_DATE ≤ run_ts.date()` — always.
   - When populated, `RECENT_GOVERNANCE_EVENT_DATE ≤ run_ts.date()` — no future-dated events.
   - `RECENT_GOVERNANCE_EVENT_DATE` populated rate ≈ 30% across 30+ rows.

4. **Bias-band invariants (cohort-coupled):**
   - Every anchor with `EMPLOYEE_COUNT ≥ 10000` → `BOARD_SIZE ≥ 9` always.
   - Every anchor with `EMPLOYEE_COUNT < 100` → `BOARD_SIZE ≤ 8` always.
   - Every anchor with `INTERLOCK_DEGREE ≥ 4` → `INTERLOCK_COUNT ≥ 2` always.

5. **Schema contract:**
   - 14 keys per dict, every key matches DDL column order.
   - `KEY_DIRECTOR_NAME` is a non-empty string of the form FirstName SPACE LastName.

Plus standard determinism + boring-case + schema-contract tests.

The L1 conftest does **not** filter SAMPLE_ANCHORS for Plan 10 — it ignores SAMPLE_ANCHORS entirely and uses the inline fixture, since SAMPLE_ANCHORS contributes zero rows to the cohort. This is documented as the cohort-fixture deviation in the per-plan file §4.

## Cadence

**Monthly.** CRON: `'USING CRON 0 3 1 * * America/New_York'` (live task schedule; the original spec said `0 7 1 * * UTC`). Idempotent re-runs same month replace.

Why monthly (vs weekly): board composition and CEO tenure are slow-moving signals — boards reorganize quarterly at most, and most months no anchor sees a real governance change. A weekly cadence would emit ~52× the rows for the same demo signal. (Compare Plan 12 Gong, which is weekly because call sentiment is genuinely week-over-week volatile.)

## Volume

**~960 rows/month** (one per Commercial Banking anchor). **Smallest Cumulus dataset of all 13 plans, dethroning Plan 8 (3,920) by 4.1×.** Storage and SP runtime both trivial — expect <1s SP execution.

## Out of scope

- Real BoardEx / Equilar / ISS license / live data fidelity.
- Individual director PII beyond the synthesized exemplar `KEY_DIRECTOR_NAME`.
- Per-director records (this is a board-level snapshot row, not a director-level table).
- Executive compensation detail (cash, equity, bonus components).
- Committee structure (audit, comp, nominating) and board-meeting attendance records.
- Multi-year trend analysis (snapshot per month, no historical comparison).
- Real interlock graph (`INTERLOCK_COUNT` is biased by anchor INTERLOCK_DEGREE but does not actually JOIN to other rows).
