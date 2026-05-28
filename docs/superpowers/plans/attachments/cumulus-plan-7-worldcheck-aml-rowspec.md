# Plan 7 — World-Check AML rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §6 (LSEG World-Check / Dow Jones Risk & Compliance / ComplyAdvantage) + the live anchor distribution in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.
>
> **Plan 7 introduces the daily cadence.** First daily-cadence Cumulus dataset (Plans 1-3, 6 monthly; Plan 5 quarterly). Daily refresh is canonical for AML: sanctions lists update daily, and customers expect "screened today" posture for any compliance review.

## Mimics

**LSEG World-Check One + Dow Jones Risk & Compliance + ComplyAdvantage** — vendor-grade AML / sanctions / PEP (politically-exposed persons) screening. Real World-Check publishes 50+ fields per profile with deep prose narratives (UBO trees, adverse-media excerpts); we mirror 12 that hit the demo's "is this customer flagged?" + "has the flag changed since yesterday?" use cases.

## Audience

**All-accounts** — every PERSON and BUSINESS anchor must be screened daily, regardless of CLIENT_CATEGORY. This is the legal posture of AML: no opt-out cohort. The audience SQL is therefore the simplest of any Cumulus dataset:

```sql
SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
```

**Live cardinality (probed 2026-05-28):** 37,445 total rows, **36,813 distinct ACCOUNT_IDs** (1.7% duplicates from MASTER_ACCOUNTS — Plan 0 finding). The SP iterates over the deduplicated audience: ~25,424 PERSON + ~11,389 BUSINESS = 36,813 rows/day.

**No country filter.** The COUNTRY_CODE field is 96% `US` plus 30% empty/dirty — it has no signal for jurisdiction-risk modeling. Plan 7 **synthesizes** `RISK_JURISDICTION_CODE` deterministically from `account_id` (see bias logic below) rather than reading anchor.COUNTRY_CODE.

## Table: `FINS.PUBLIC.WORLD_CHECK_AML`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID |
| `PROFILE_DATE` | DATE | NOT NULL | The screening run date (UTC). Daily-bucketed determinism. |
| `OVERALL_RISK_RATING` | VARCHAR(10) | NOT NULL | `Low`, `Medium`, `High`, `Severe` — the rolled-up flag. ~92% Low, 6% Medium, 1.7% High, 0.3% Severe. |
| `SANCTIONS_HIT` | BOOLEAN | NOT NULL | true if matched against OFAC/EU/UK/UN sanctions list. ~0.5% of accounts. |
| `PEP_HIT` | BOOLEAN | NOT NULL | true if PEP / Reportable-Person match. ~1.2% of accounts (PEP rate is higher than sanctions rate). |
| `ADVERSE_MEDIA_HIT` | BOOLEAN | NOT NULL | true if adverse-media match. ~3% of accounts. |
| `ADVERSE_MEDIA_CATEGORIES` | VARCHAR(200) | NULL | Pipe-delimited list e.g. `Financial Crime|Bribery`. NULL when ADVERSE_MEDIA_HIT=false. |
| `RISK_JURISDICTION_CODE` | VARCHAR(2) | NOT NULL | ISO-3166-1 alpha-2 of the highest-risk jurisdiction tied to this account. Synthesized — see below. |
| `RISK_JURISDICTION_TIER` | VARCHAR(10) | NOT NULL | `Standard`, `Enhanced`, `Prohibited`. Derived from RISK_JURISDICTION_CODE. |
| `LAST_SCREENED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Profile-bucketed (= PROFILE_DATE 00:00:00) so mid-day re-runs are byte-identical. |
| `CHANGE_SINCE_LAST_RUN` | VARCHAR(20) | NOT NULL | `New`, `Unchanged`, `Risk Increased`, `Risk Decreased`, `Cleared`. ~1% of accounts have non-Unchanged. |
| `CASE_REFERENCE` | VARCHAR(32) | NULL | Vendor case-management ID. Populated when OVERALL_RISK_RATING in (`High`, `Severe`). |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Profile-bucketed for byte-identical mid-day re-runs. |

13 columns total: 11 NOT NULL + 2 NULLable (ADVERSE_MEDIA_CATEGORIES, CASE_REFERENCE).

## Primary key

`(ACCOUNT_ID, PROFILE_DATE)` — one row per account per screening day. Re-runs same day replace.

**Why `PROFILE_DATE` not `PROFILE_MONTH`/`PROFILE_QUARTER`:** daily cadence requires daily granularity at the PK level. `PROFILE_DATE` is a DATE column equal to the run timestamp's `.date()`.

**Storage trade-off:** Plans 1-6 carry one row per anchor per period (month/quarter), so re-runs replace. Plan 7 has the same shape — re-runs same day replace, so live storage stays at ~36,813 rows. **No daily history retained**. A real World-Check feed would carry full daily history (~13M rows/year); the Cumulus demo doesn't have a use case for that, so we don't pay for it.

## OVERALL_RISK_RATING distribution

Real World-Check finds Severe matches on <0.1% of populations even in high-risk industries. Banking is moderate. Targets:

| Rating | Rate | Notes |
|---|---|---|
| Low | ~92.0% | The vast majority — clean, low-jurisdiction risk |
| Medium | ~6.0% | One soft signal (e.g. adverse media in low-severity category) |
| High | ~1.7% | Two soft signals OR one moderate signal (PEP not currently in office) |
| Severe | ~0.3% | Sanctions hit OR sitting PEP OR Prohibited jurisdiction |

```python
def _overall_risk_rating(sanctions_hit, pep_hit, adverse_media_hit,
                         jurisdiction_tier, rng):
    """Roll up component flags into a single rating.

    Severe: sanctions match OR Prohibited jurisdiction
    High:   PEP match OR (Enhanced jurisdiction AND any other flag)
    Medium: adverse-media match OR Enhanced jurisdiction alone
    Low:    none of the above (random tail under noise model)
    """
    if sanctions_hit or jurisdiction_tier == "Prohibited":
        return "Severe"
    if pep_hit:
        return "High"
    if jurisdiction_tier == "Enhanced" and adverse_media_hit:
        return "High"
    if adverse_media_hit or jurisdiction_tier == "Enhanced":
        return "Medium"
    # Long tail: ~0.3% of clean accounts get a noise-driven rating bump
    return rng.choices(["Low", "Medium"], weights=[0.997, 0.003])[0]
```

## Component flag rates (sanctions / PEP / adverse-media)

```python
def _sanctions_hit(rng):
    return rng.random() < 0.005  # 0.5%

def _pep_hit(rng):
    return rng.random() < 0.012  # 1.2%

def _adverse_media_hit(rng):
    return rng.random() < 0.030  # 3.0%
```

**Independence assumption:** the three flags are drawn independently. Real World-Check has correlation (most sanctions-hit accounts also have adverse-media in financial-crime categories), but for the demo's screening UX, independence is fine. Total non-Low rate ≈ 1 − (1−0.005)(1−0.012)(1−0.030) ≈ 4.7% which lines up with the rating distribution targets.

## RISK_JURISDICTION_CODE

This is the cleverest synthesized field. We assign each account a deterministic risk jurisdiction independent of the dirty anchor.COUNTRY_CODE data:

```python
# 30-jurisdiction pool with explicit tier:
_PROHIBITED_JURISDICTIONS = {
    "IR": "Iran", "KP": "North Korea", "SY": "Syria", "CU": "Cuba",
}
_ENHANCED_JURISDICTIONS = {
    "RU": "Russia", "VE": "Venezuela", "BY": "Belarus", "MM": "Myanmar",
    "AF": "Afghanistan", "ZW": "Zimbabwe", "SD": "Sudan",
    "PK": "Pakistan", "NG": "Nigeria",
}
_STANDARD_JURISDICTIONS = {
    "US": "United States", "GB": "United Kingdom", "CA": "Canada",
    "DE": "Germany", "FR": "France", "JP": "Japan", "AU": "Australia",
    "CH": "Switzerland", "SG": "Singapore", "AE": "United Arab Emirates",
    "MX": "Mexico", "BR": "Brazil", "IN": "India", "CN": "China",
    "KR": "South Korea", "IT": "Italy", "ES": "Spain",
}

def _risk_jurisdiction(rng):
    """Account's primary RISK_JURISDICTION_CODE.

    Distribution targets:
      Standard:   ~98.5% (US-heavy: US ~85% of standard tier)
      Enhanced:   ~1.0%
      Prohibited: ~0.5%
    """
    bucket = rng.choices(
        ["standard", "enhanced", "prohibited"],
        weights=[0.985, 0.010, 0.005],
    )[0]
    if bucket == "prohibited":
        return rng.choice(list(_PROHIBITED_JURISDICTIONS.keys())), "Prohibited"
    if bucket == "enhanced":
        return rng.choice(list(_ENHANCED_JURISDICTIONS.keys())), "Enhanced"
    # Standard: US-heavy
    if rng.random() < 0.85:
        return "US", "Standard"
    return rng.choice(list(_STANDARD_JURISDICTIONS.keys())), "Standard"
```

**Stability:** `RISK_JURISDICTION_CODE` should be **stable across daily runs for the same account** — a customer's primary jurisdiction doesn't change day-to-day. Use a year-stable seed for this one field:

```python
def _risk_jurisdiction_stable(account_id, run_ts):
    """Year-stable: jurisdiction doesn't shift day-to-day.

    Salt: 'worldcheck_jurisdiction', bucket: datetime(run_ts.year, 1, 1).
    """
    seed = seed_for(
        account_id + "_jurisdiction", "worldcheck_jurisdiction",
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return _risk_jurisdiction(rng)
```

(Same pattern as Plan 5's year-stable LAST_TRANSFER_YEAR + MORTGAGE_RATE_PCT.)

## ADVERSE_MEDIA_CATEGORIES

Comma — actually pipe — delimited list of 1-3 categories from a 10-category pool:

```python
_ADVERSE_MEDIA_CATEGORY_POOL = [
    "Financial Crime", "Bribery", "Tax Evasion", "Fraud",
    "Money Laundering", "Terrorism Financing", "Cybercrime",
    "Drug Trafficking", "Human Trafficking", "Corruption",
]

def _adverse_media_categories(adverse_media_hit, rng):
    if not adverse_media_hit:
        return None
    n = rng.choices([1, 2, 3], weights=[0.65, 0.28, 0.07])[0]
    cats = rng.sample(_ADVERSE_MEDIA_CATEGORY_POOL, n)
    return "|".join(sorted(cats))  # sorted for determinism + readability
```

## CHANGE_SINCE_LAST_RUN

This is **the** load-bearing demo field — World-Check's value prop is "tell me what changed since yesterday." For the demo we synthesize it deterministically from the account's `(today_seed, yesterday_seed)` pair:

```python
def _change_since_last_run(account_id, run_ts, today_rating, rng):
    """Compare today's rating to yesterday's by recomputing yesterday's seed.

    Uses the daily seed for run_ts - 1 day to get yesterday's overall
    rating, then diffs.

    Distribution target:
      Unchanged: ~99.0%
      Risk Increased: ~0.5%
      Risk Decreased: ~0.4%
      New: 0% (no new accounts mid-pipeline; all anchors persist)
      Cleared: ~0.1% (yesterday-flagged, today-clean)
    """
    yesterday = run_ts - timedelta(days=1)
    y_seed = seed_for(account_id, "worldcheck", yesterday.replace(hour=0,minute=0,second=0,microsecond=0))
    y_rng = random.Random(y_seed)
    # Re-derive yesterday's rating components in shorthand
    y_sanctions = _sanctions_hit(y_rng)
    y_pep = _pep_hit(y_rng)
    y_media = _adverse_media_hit(y_rng)
    # Reuse same jurisdiction (year-stable)
    _, y_tier = _risk_jurisdiction_stable(account_id, yesterday)
    y_rating = _overall_risk_rating(y_sanctions, y_pep, y_media, y_tier, y_rng)

    return _diff_rating(y_rating, today_rating)


_RATING_RANK = {"Low": 0, "Medium": 1, "High": 2, "Severe": 3}

def _diff_rating(yesterday, today):
    if yesterday == today:
        return "Unchanged"
    if today != "Low" and yesterday == "Low":
        return "New"  # First-day-flagged
    if today == "Low" and yesterday != "Low":
        return "Cleared"
    if _RATING_RANK[today] > _RATING_RANK[yesterday]:
        return "Risk Increased"
    return "Risk Decreased"
```

**Note on "New":** in this demo, every account exists in the audience every day, so "first appeared today" never fires — the New label here means "first day flagged" (yesterday Low, today not-Low). Real World-Check's "New" semantically means "appeared on a sanctions list today"; for our demo, this is the closest synth.

## CASE_REFERENCE

Populated only when OVERALL_RISK_RATING in (High, Severe). Format: `WCH-YYYY-NNNNNN`:

```python
def _case_reference(account_id, run_ts, overall_rating):
    if overall_rating not in ("High", "Severe"):
        return None
    # Year-stable case ID — once a case is opened, it stays the same
    seed = seed_for(
        account_id + "_case", "worldcheck_case",
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return f"WCH-{run_ts.year}-{rng.randint(100000, 999999)}"
```

## Bias logic for `_row_for` (skeleton)

```python
import random
from datetime import datetime, timedelta

# Anchor extraction — note we don't read COUNTRY_CODE (dirty) or anything
# else state-dependent.  All bias is from account_id + run_ts.
account_id = anchor["ACCOUNT_ID"]

# Daily-bucketed seed (most fields).
day_start = run_ts.replace(hour=0, minute=0, second=0, microsecond=0)
seed = seed_for(account_id, "worldcheck", day_start)
rng = random.Random(seed)

# 1. Year-stable jurisdiction (synthesized; doesn't read anchor.COUNTRY_CODE).
jurisdiction_code, jurisdiction_tier = _risk_jurisdiction_stable(account_id, run_ts)

# 2. Today's component flags.
sanctions = _sanctions_hit(rng)
pep = _pep_hit(rng)
media = _adverse_media_hit(rng)
media_categories = _adverse_media_categories(media, rng)

# 3. Roll up overall rating.
overall = _overall_risk_rating(sanctions, pep, media, jurisdiction_tier, rng)

# 4. Compare to yesterday.
change = _change_since_last_run(account_id, run_ts, overall, rng)

# 5. Case reference (year-stable; populated only when High/Severe).
case_ref = _case_reference(account_id, run_ts, overall)

return {
    "ACCOUNT_ID":                 account_id,
    "PROFILE_DATE":               day_start.date(),
    "OVERALL_RISK_RATING":        overall,
    "SANCTIONS_HIT":              sanctions,
    "PEP_HIT":                    pep,
    "ADVERSE_MEDIA_HIT":          media,
    "ADVERSE_MEDIA_CATEGORIES":   media_categories,
    "RISK_JURISDICTION_CODE":     jurisdiction_code,
    "RISK_JURISDICTION_TIER":     jurisdiction_tier,
    "LAST_SCREENED_AT":           day_start,
    "CHANGE_SINCE_LAST_RUN":      change,
    "CASE_REFERENCE":             case_ref,
    "GENERATED_AT":               day_start,
}
```

## Boring case (must still emit)

A "boring" anchor — Retail PERSON, no sanctions, no PEP, no media — produces:
- `OVERALL_RISK_RATING`: `Low` (~92% probability)
- `SANCTIONS_HIT` / `PEP_HIT` / `ADVERSE_MEDIA_HIT`: all `false`
- `ADVERSE_MEDIA_CATEGORIES`: NULL
- `RISK_JURISDICTION_CODE`: most likely `US` (85% × 98.5% = 83.7% of accounts)
- `RISK_JURISDICTION_TIER`: `Standard`
- `CHANGE_SINCE_LAST_RUN`: `Unchanged` (99%)
- `CASE_REFERENCE`: NULL

A "high-risk" synthetic anchor — happens to roll a Russian (Enhanced) jurisdiction + adverse-media match:
- `OVERALL_RISK_RATING`: `High` (Enhanced + adverse-media → High per the rollup)
- `RISK_JURISDICTION_CODE`: `RU`, `RISK_JURISDICTION_TIER`: `Enhanced`
- `ADVERSE_MEDIA_HIT`: true; `ADVERSE_MEDIA_CATEGORIES`: e.g. `Money Laundering`
- `CASE_REFERENCE`: `WCH-2026-NNNNNN` (year-stable)

**No anchor is dropped.** The audience is all 36,813 distinct accounts — every PERSON and BUSINESS gets screened daily. Even out-of-data-quality anchors (null BIRTHDATE, missing CLIENT_CATEGORY) get a row because the row factory doesn't read those fields.

## Anchor-influence test target (template L1 property #4)

Plan 7 has a different shape from Plans 1-6. The row factory **doesn't read income, age, ZIP, state, or category** — only `account_id`. So traditional anchor-influence tests don't apply.

Instead, four assertions:

1. **Determinism on the same day** — `_row_for(anchor, datetime(2026,5,28,3,0,0))` and `_row_for(anchor, datetime(2026,5,28,23,30,0))` produce identical dicts (mid-day bucketing).
2. **Day-to-day delta** — `_row_for(anchor, datetime(2026,5,28))` and `_row_for(anchor, datetime(2026,5,29))` *can* differ on rating/flags but **must have same `RISK_JURISDICTION_CODE`** (year-stable).
3. **Rate distributions converge** — Across the full audience (36,813 anchors), the population rates of `SANCTIONS_HIT` (~0.5%), `PEP_HIT` (~1.2%), `ADVERSE_MEDIA_HIT` (~3.0%) match targets within ±0.3 pp. (Test against the 100-anchor SAMPLE_ANCHORS fixture rolled over 365 days for stability.)
4. **CHANGE_SINCE_LAST_RUN coherence** — On the day-2 run, ~99% of anchors show `Unchanged` (computed from the day-1 seed). The `Unchanged` rate is the load-bearing one because it's the one a demo scenario actually queries against.

Plus a fifth: **CASE_REFERENCE year-stable** — a given account that's `High` on day-1 and `High` on day-2 has the same `CASE_REFERENCE` on both days.

The L1 conftest reuses Plan 6's pattern: `SAMPLE_ANCHORS` from Cumulus_Common, `in_audience_anchors = all_anchors` (everyone is in audience).

## Cadence

**Daily.** CRON: `'USING CRON 0 6 * * * UTC'` (6 AM UTC daily). The seed bucket is `(run_ts.year, run_ts.month, run_ts.day)`, so re-runs on the same calendar day produce identical rows.

**Why 06:00 UTC:** matches the operational cadence of LSEG's overnight refresh (their data is published at ~02:00 GMT). 06:00 UTC gives 4 hours of buffer for upstream feeds + lets the BATCH refresh finish before US market open at 09:30 ET.

## Volume

**~36,813 rows/day** (one per distinct account per screening day). Re-runs same day replace, so live storage stays at ~36,813 rows. No daily history retained beyond `LAST_SCREENED_AT` + `CHANGE_SINCE_LAST_RUN`.

## Out of scope

- **Real World-Check / Dow Jones / ComplyAdvantage license / data fidelity.** Our 12-column subset is recognisable but not license-grade; no actual sanctions list match.
- **Daily history retention.** A real AML feed retains every day's screening for audit; we MERGE-replace to keep storage bounded.
- **UBO (Ultimate Beneficial Owner) trees.** Real World-Check resolves complex ownership chains; we model only the leaf account.
- **Adverse-media excerpt/source.** Real feeds carry article URLs + excerpts; we only carry the category.
- **Workflow integration (case management, escalation routing).** `CASE_REFERENCE` is a synth ID; no actual case-mgmt system gets created.
- **Country-of-residence vs country-of-citizenship.** Real World-Check distinguishes these; our `RISK_JURISDICTION_CODE` is a single rolled-up field.
- **Multi-language name matching.** Real World-Check matches names across scripts (Cyrillic, Arabic, etc.); our synth doesn't model name matching at all.
