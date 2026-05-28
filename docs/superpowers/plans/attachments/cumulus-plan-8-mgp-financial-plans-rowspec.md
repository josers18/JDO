# Plan 8 — MoneyGuidePro Financial Plans rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §11 (MoneyGuidePro / eMoney / NaviPlan) + the live `ANNUAL_INCOME` / `BIRTHDATE` distribution on Wealth Management anchors in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.
>
> **Plan 8 is the smallest Cumulus dataset.** Wealth Management is 3,920 anchors — 2.9× smaller than the next-smallest plan (MSCI ESG at 11,389). Property-test design must shift from distributional rate convergence (Plans 1-7) to **per-anchor deterministic invariants** because the L1 fixture has only ~4 Wealth anchors at SAMPLE_ANCHORS' 100-anchor scale.

## Mimics

**MoneyGuidePro + eMoney + NaviPlan** — vendor-grade financial-planning software used by wealth advisors to model client retirement projections, goal funding, and Monte Carlo confidence intervals. Real MoneyGuidePro publishes 100+ fields per plan with goal hierarchies and what-if scenarios; we mirror 13 that hit the demo's "show me the plan health" + "what's the success probability" use cases.

## Audience

`CLIENT_CATEGORY = 'Wealth Management'` — **3,920 distinct anchors** (probed 2026-05-28). No duplicates in the cohort. Both BIRTHDATE and ANNUAL_INCOME are 100% populated, no NULL-fallback needed. Income range: $200K–$1.9M (median $333K, mean $381K).

Why Wealth-only: financial-plan tooling like MGP is a Wealth-Advisor product. Retail customers don't get formal financial plans (they self-serve via apps); Commercial / Small Business has its own corporate-treasury planning tools, not personal financial planning. The audience predicate is therefore the cleanest in the rollout.

## Table: `FINS.PUBLIC.MGP_FINANCIAL_PLANS`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID |
| `PROFILE_MONTH` | DATE | NOT NULL | First-of-month for the run timestamp |
| `PLAN_STATUS` | VARCHAR(20) | NOT NULL | `Active`, `Draft`, `Stale`. ~80% Active, 12% Draft, 8% Stale. |
| `PLAN_LAST_UPDATED_DATE` | DATE | NOT NULL | When the plan was last touched. Within 1-36 months ago. |
| `RETIREMENT_TARGET_AGE` | NUMBER(3,0) | NOT NULL | Target retirement age. Biased by current age (already-retired anchors → 65, mid-career → 67, young → 65). |
| `MONTHLY_INCOME_TARGET_USD` | NUMBER(8,0) | NOT NULL | Desired monthly retirement income. Biased by current ANNUAL_INCOME (~70-90% of pre-retirement). |
| `TOTAL_GOAL_AMOUNT_USD` | NUMBER(12,0) | NOT NULL | Sum of all goal amounts. Biased by income + age (older = more accumulated). |
| `GOAL_COUNT` | NUMBER(2,0) | NOT NULL | Number of distinct goals (retirement, college, vacation, legacy). 1-6, mode 2-3. |
| `MONTE_CARLO_SUCCESS_PCT` | NUMBER(5,2) | NOT NULL | Monte Carlo simulation success probability. 30.00-99.00%. Biased by income/age/goal_count. |
| `RECOMMENDED_ASSET_ALLOCATION` | VARCHAR(30) | NOT NULL | `Conservative`, `Moderate Conservative`, `Moderate`, `Moderate Aggressive`, `Aggressive`. Biased by age (glide path). |
| `LAST_REVIEW_DATE` | DATE | NULL | Date of last advisor review. NULL when PLAN_STATUS='Draft'. |
| `NEXT_REVIEW_DATE` | DATE | NULL | Scheduled next review. NULL when PLAN_STATUS='Stale'. |
| `ADVISOR_NOTES_FLAG` | BOOLEAN | NOT NULL | True if advisor has logged free-text notes. ~75% True for Active, 30% for Draft, 15% for Stale. |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Month-bucketed for byte-identical mid-month re-runs. |

14 columns total: 12 NOT NULL + 2 NULLable (LAST_REVIEW_DATE, NEXT_REVIEW_DATE).

## Primary key

`(ACCOUNT_ID, PROFILE_MONTH)` — one row per Wealth account per month. Re-runs same month replace.

## PLAN_STATUS distribution

```python
def _plan_status(rng):
    """Real MGP installs at wealth shops show ~80% active plans, ~12% drafts in
    progress, ~8% stale (advisor hasn't refreshed in 12+ months)."""
    return rng.choices(
        ["Active", "Draft", "Stale"],
        weights=[0.80, 0.12, 0.08],
    )[0]
```

## PLAN_LAST_UPDATED_DATE

```python
def _plan_last_updated(plan_status, run_ts, rng):
    """Stale plans have older update dates by definition."""
    if plan_status == "Stale":
        # 12-36 months ago
        days_ago = rng.randint(365, 1095)
    elif plan_status == "Draft":
        # 0-3 months ago — drafts are recent work
        days_ago = rng.randint(0, 90)
    else:  # Active
        # 1-12 months ago — periodic refresh cadence
        days_ago = rng.randint(30, 365)
    return run_ts.date() - timedelta(days=days_ago)
```

## RETIREMENT_TARGET_AGE

```python
def _retirement_target_age(current_age, rng):
    """Age glide: already-retired prefer 'maintenance' target = current age;
    mid-career anchors target 65-67; young anchors target 60-65 (FIRE-curious)."""
    if current_age >= 70:
        return current_age  # Already there
    if current_age >= 60:
        return rng.choice([62, 65, 67, 70])
    if current_age >= 45:
        return rng.choice([62, 65, 67])
    if current_age >= 30:
        return rng.choice([60, 62, 65, 67])
    # Under 30: more aggressive FIRE crowd
    return rng.choice([55, 60, 62, 65])
```

## MONTHLY_INCOME_TARGET_USD

```python
def _monthly_income_target(annual_income, rng):
    """Wealth clients target 70-90% of pre-retirement income, expressed monthly."""
    replacement_rate = rng.uniform(0.70, 0.90)
    monthly = annual_income * replacement_rate / 12
    return round(monthly)
```

For median Wealth anchor at $333K → monthly target ~$19K-$25K.

## TOTAL_GOAL_AMOUNT_USD

```python
def _total_goal_amount(annual_income, age, rng):
    """Older clients have accumulated bigger goals (legacy, larger retirement nest egg)."""
    base_multiplier = {
        # Years × annual income, biased by life stage
        # Younger: smaller goals (still accumulating)
        # Older: larger goals (closer to spending)
    }
    if age < 35:
        years_mult = rng.uniform(8.0, 15.0)  # 8-15 years' income
    elif age < 50:
        years_mult = rng.uniform(15.0, 25.0)
    elif age < 65:
        years_mult = rng.uniform(20.0, 35.0)
    else:
        years_mult = rng.uniform(15.0, 30.0)  # post-retirement: closer to spend-down
    total = annual_income * years_mult
    return round(min(50_000_000, max(500_000, total)))
```

## GOAL_COUNT

```python
_GOAL_TYPES = ["Retirement", "College", "Vacation Home", "Legacy", "Travel", "Education"]

def _goal_count(age, rng):
    """Most plans have 2-3 goals. Older clients have more (Legacy/Education added)."""
    if age >= 55:
        return rng.choices([2, 3, 4, 5, 6], weights=[0.10, 0.30, 0.30, 0.20, 0.10])[0]
    if age >= 35:
        return rng.choices([1, 2, 3, 4, 5], weights=[0.05, 0.30, 0.40, 0.18, 0.07])[0]
    return rng.choices([1, 2, 3, 4], weights=[0.20, 0.40, 0.30, 0.10])[0]
```

## MONTE_CARLO_SUCCESS_PCT

```python
def _monte_carlo_success(annual_income, age, goal_count, rng):
    """Higher income → higher success; more goals → lower success;
    older near retirement → narrower range."""
    base = 70.0
    # Income bonus: high income gives more cushion
    if annual_income >= 500_000:
        base += 15
    elif annual_income >= 300_000:
        base += 8
    # Goal pressure: more goals means tighter funding
    base -= (goal_count - 2) * 4
    # Age band: near-retirement plans are tighter (less time to recover)
    if age >= 60:
        # Near retirement: outcome is more deterministic (high or low)
        base += rng.uniform(-12, 12)
    else:
        base += rng.uniform(-8, 15)
    return round(max(30.0, min(99.0, base)), 2)
```

## RECOMMENDED_ASSET_ALLOCATION

```python
def _asset_allocation(age, rng):
    """Textbook age-glide. Slight noise so we don't get a 1:1 age→tier mapping."""
    if age < 35:
        return rng.choices(
            ["Aggressive", "Moderate Aggressive"], weights=[0.65, 0.35]
        )[0]
    if age < 50:
        return rng.choices(
            ["Aggressive", "Moderate Aggressive", "Moderate"],
            weights=[0.25, 0.55, 0.20],
        )[0]
    if age < 60:
        return rng.choices(
            ["Moderate Aggressive", "Moderate", "Moderate Conservative"],
            weights=[0.30, 0.50, 0.20],
        )[0]
    if age < 70:
        return rng.choices(
            ["Moderate", "Moderate Conservative", "Conservative"],
            weights=[0.30, 0.50, 0.20],
        )[0]
    return rng.choices(
        ["Moderate Conservative", "Conservative"], weights=[0.40, 0.60]
    )[0]
```

## LAST_REVIEW_DATE / NEXT_REVIEW_DATE

```python
def _review_dates(plan_status, plan_last_updated, run_ts, rng):
    """Conditional NULLs:
       - Draft: LAST_REVIEW_DATE NULL (advisor hasn't reviewed yet).
       - Stale: NEXT_REVIEW_DATE NULL (no review scheduled).
       - Active: both populated.
    """
    last_review = None
    next_review = None
    if plan_status != "Draft":
        # Last review usually happens 1-12 months after plan_last_updated
        review_offset = rng.randint(30, 365)
        last_review = plan_last_updated + timedelta(days=review_offset)
        # Don't let it land in the future
        if last_review > run_ts.date():
            last_review = run_ts.date() - timedelta(days=rng.randint(7, 90))
    if plan_status != "Stale":
        # Next review scheduled 1-18 months ahead of run
        next_review = run_ts.date() + timedelta(days=rng.randint(30, 540))
    return last_review, next_review
```

## ADVISOR_NOTES_FLAG

```python
def _advisor_notes_flag(plan_status, rng):
    """Active plans have notes ~75% of time; Drafts ~30%; Stale ~15%."""
    rate = {"Active": 0.75, "Draft": 0.30, "Stale": 0.15}[plan_status]
    return rng.random() < rate
```

## Bias logic for `_row_for` (skeleton)

```python
import random
from datetime import datetime, timedelta

# Anchor extraction.
account_id = anchor["ACCOUNT_ID"]
birthdate  = anchor.get("BIRTHDATE")
income     = float(anchor.get("ANNUAL_INCOME") or 0)

# Month-bucketed seed.
month_start = run_ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
seed = seed_for(account_id, "mgp", month_start)
rng = random.Random(seed)

age = _age_from_birthdate(birthdate, run_ts.date())

# 1. Plan status drives most NULL semantics.
plan_status = _plan_status(rng)
plan_updated = _plan_last_updated(plan_status, run_ts, rng)

# 2. Substantive plan fields.
retire_age = _retirement_target_age(age, rng)
monthly_target = _monthly_income_target(income, rng)
goal_count = _goal_count(age, rng)
total_goal = _total_goal_amount(income, age, rng)
mc_success = _monte_carlo_success(income, age, goal_count, rng)
allocation = _asset_allocation(age, rng)

# 3. Review-date NULLs and notes flag.
last_review, next_review = _review_dates(plan_status, plan_updated, run_ts, rng)
notes_flag = _advisor_notes_flag(plan_status, rng)

return {
    "ACCOUNT_ID":                    account_id,
    "PROFILE_MONTH":                 month_start.date(),
    "PLAN_STATUS":                   plan_status,
    "PLAN_LAST_UPDATED_DATE":        plan_updated,
    "RETIREMENT_TARGET_AGE":         retire_age,
    "MONTHLY_INCOME_TARGET_USD":     monthly_target,
    "TOTAL_GOAL_AMOUNT_USD":         total_goal,
    "GOAL_COUNT":                    goal_count,
    "MONTE_CARLO_SUCCESS_PCT":       mc_success,
    "RECOMMENDED_ASSET_ALLOCATION":  allocation,
    "LAST_REVIEW_DATE":              last_review,
    "NEXT_REVIEW_DATE":              next_review,
    "ADVISOR_NOTES_FLAG":            notes_flag,
    "GENERATED_AT":                  month_start,
}
```

## Boring case (must still emit)

A "boring" Wealth anchor — age 50, income $300K — produces:
- `PLAN_STATUS`: most likely Active (80%)
- `RETIREMENT_TARGET_AGE`: 62, 65, or 67
- `MONTHLY_INCOME_TARGET_USD`: $17K-$22K (70-90% of $25K monthly pre-retirement)
- `TOTAL_GOAL_AMOUNT_USD`: $4.5M-$7.5M (15-25× income for mid-career)
- `GOAL_COUNT`: 2-4 (mode 3)
- `MONTE_CARLO_SUCCESS_PCT`: ~75-90 (mid-income + 3 goals + age 50 → moderate success)
- `RECOMMENDED_ASSET_ALLOCATION`: Moderate Aggressive or Moderate
- `LAST_REVIEW_DATE` / `NEXT_REVIEW_DATE`: both populated

A "young Wealth" anchor — age 30, income $250K — produces:
- `RETIREMENT_TARGET_AGE`: 55-65 (FIRE-curious skew)
- `RECOMMENDED_ASSET_ALLOCATION`: Aggressive or Moderate Aggressive
- `TOTAL_GOAL_AMOUNT_USD`: smaller (8-15× income; still accumulating)
- `MONTE_CARLO_SUCCESS_PCT`: high (long horizon to recover)

**No anchor is dropped.** Every Wealth Management anchor produces exactly one row per month.

## Anchor-influence test target (template L1 property #4)

**Plan 8 deviation: per-anchor deterministic invariants, not distributional.**

Wealth Management is 3,920 of 36,813 total accounts — only ~10.6%. SAMPLE_ANCHORS (100 anchors, used in L1 conftest) typically has 3-5 Wealth anchors, far too few for distributional convergence tests à la Plan 7. Tests must instead verify **per-anchor invariants** that hold for every Wealth anchor:

1. **Age-glide invariants:**
   - Anchors age <35 → `RECOMMENDED_ASSET_ALLOCATION` in `{Aggressive, Moderate Aggressive}`.
   - Anchors age ≥70 → `RECOMMENDED_ASSET_ALLOCATION` in `{Moderate Conservative, Conservative}`.
   - These are deterministic given age band — no probability tail.

2. **Income-floor invariants:**
   - For every Wealth anchor, `MONTHLY_INCOME_TARGET_USD ≥ annual_income × 0.70 / 12` and `≤ annual_income × 0.90 / 12`. (Hard-coded replacement-rate band.)

3. **NULL-semantics invariants** (the most load-bearing):
   - `PLAN_STATUS == 'Draft'` → `LAST_REVIEW_DATE IS NULL`. Always.
   - `PLAN_STATUS == 'Stale'` → `NEXT_REVIEW_DATE IS NULL`. Always.
   - `PLAN_STATUS == 'Active'` → both review dates populated. Always.

4. **Date-coherence invariants:**
   - `PLAN_LAST_UPDATED_DATE ≤ run_ts.date()` — no future-dated updates.
   - When populated, `LAST_REVIEW_DATE ≤ run_ts.date()` — no future-dated reviews.
   - When populated, `NEXT_REVIEW_DATE > run_ts.date()` — next review must be in the future.

5. **Range invariants:**
   - `RETIREMENT_TARGET_AGE` in [55, 80].
   - `MONTHLY_INCOME_TARGET_USD` in [10000, 200000].
   - `TOTAL_GOAL_AMOUNT_USD` in [500000, 50000000].
   - `GOAL_COUNT` in [1, 6].
   - `MONTE_CARLO_SUCCESS_PCT` in [30.0, 99.0].

Plus standard determinism + boring-case + schema-contract tests.

The L1 conftest reuses Plan 6's pattern: `SAMPLE_ANCHORS` from Cumulus_Common, `in_audience_anchors = [a for a in all_anchors if a["CLIENT_CATEGORY"] == "Wealth Management"]`.

If the SAMPLE_ANCHORS fixture has fewer than 3 Wealth anchors, the L1 tests should `pytest.skip` cohort-specific tests gracefully (per Plan 5/6 pattern).

## Cadence

**Monthly.** CRON: `'USING CRON 0 7 1 * * UTC'` (matches Plans 1-3, 6). Idempotent re-runs same month replace.

## Volume

**~3,920 rows/month** (one per Wealth Management anchor). Smallest Cumulus dataset by 2.9× (next-smallest is MSCI ESG at 11,389). Storage and SP runtime both trivial — expect <2s SP execution.

## Out of scope

- Real MoneyGuidePro / eMoney / NaviPlan license / data fidelity.
- Goal hierarchy (parent/child goals, what-if scenario branches).
- Plan history / version trail.
- Free-text advisor notes (we only carry the boolean flag).
- Multi-currency goals.
- Joint plans (couples) — single-account plans only.
- Real Monte Carlo simulation engine — `MONTE_CARLO_SUCCESS_PCT` is biased by inputs, not actually simulated.
