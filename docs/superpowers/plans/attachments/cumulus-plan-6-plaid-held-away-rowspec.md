# Plan 6 — Plaid Held-Away rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §13 (Plaid / Yodlee / MX) + the live `ANNUAL_INCOME` / `BIRTHDATE` distribution on Retail+Wealth PERSON anchors in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.
>
> **Plan 6 is structurally novel: first 1:N dataset in the Cumulus rollout.** Each anchor produces 1–5 held-away account rows (financial accounts the customer holds at *external* institutions — Vanguard, Fidelity, Chase, Wells Fargo, etc.). Coverage assertion is "every anchor has ≥1 row," not "rows = audience size."

## Mimics

**Plaid Account Aggregation + Yodlee Financial Data + MX Connect** — third-party financial-account aggregation that gives banks a 360° view of customer wealth held *outside* the bank. Real Plaid publishes 30+ fields per linked account (balance, institution metadata, transaction stream, holdings); we mirror 13 that hit the demo's "share-of-wallet" + "asset-aggregation upsell" use cases.

## Audience

`CLIENT_CATEGORY IN ('Retail', 'Wealth Management')` — Retail (21,461) + Wealth Management (3,920) = **25,381 anchors** (probed 2026-05-28).

Live coverage: BIRTHDATE 25,381/25,381, ANNUAL_INCOME 25,381/25,381 — 100% on both, so no NULL-fallback needed in bias logic.

Household / Small Business / Commercial Banking are excluded — Plaid's consumer-grade aggregation is a Retail/Wealth product, not a corporate-treasury one.

## Table: `FINS.PUBLIC.PLAID_HELD_AWAY`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID — the Cumulus customer that owns this held-away account |
| `HELD_AWAY_ACCOUNT_ID` | VARCHAR(64) | NOT NULL | `sha256(account_id + "_slot" + slot_index + "_plaid")[:16]` hex-encoded — deterministic per (anchor, slot, salt) |
| `PROFILE_MONTH` | DATE | NOT NULL | First-of-month for the run timestamp |
| `INSTITUTION_NAME` | VARCHAR(60) | NOT NULL | One of 20 mock external institutions (see pool below) |
| `INSTITUTION_TYPE` | VARCHAR(20) | NOT NULL | `Brokerage`, `Bank`, `Credit Union`, `Robo-Advisor`, `Crypto Exchange` |
| `ACCOUNT_TYPE` | VARCHAR(30) | NOT NULL | `Checking`, `Savings`, `Brokerage`, `IRA`, `401k`, `HSA`, `Credit Card`, `Mortgage`, `Auto Loan`, `Crypto Wallet` |
| `BALANCE_USD` | NUMBER(12,2) | NOT NULL | $0.00–$10M. Biased by income, age, account_type. Loans negative. |
| `LAST_LINKED_DATE` | DATE | NOT NULL | When the customer first connected this account via Plaid. Within 1–48 months ago. |
| `IS_ACTIVE` | BOOLEAN | NOT NULL | true if Plaid connection is currently healthy; false if reconnect needed (~8% of rows). |
| `LAST_TRANSACTION_DATE` | DATE | NULL | Most-recent transaction date. NULL when IS_ACTIVE=false (stale connection). |
| `MONTHLY_NET_FLOW_USD` | NUMBER(12,2) | NULL | Last-30d net inflow/outflow. NULL when IS_ACTIVE=false. Loans always negative (payments). |
| `INVESTMENT_RISK_TIER` | VARCHAR(15) | NULL | `Conservative`, `Moderate`, `Aggressive`, `Speculative`. Only populated for Brokerage/IRA/401k/HSA. |
| `INTEREST_RATE_PCT` | NUMBER(5,3) | NULL | APY for Savings/CDs (0.5–5.5%); APR for loans (3–24%). NULL for non-rate-bearing accounts. |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Month-bucketed for byte-identical mid-month re-runs. |

## Primary key

`(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)` — composite. One anchor has 1–5 rows per month; each row identified by deterministic `HELD_AWAY_ACCOUNT_ID`. Re-runs same month replace.

**DC PK collapse:** DC enforces single-column PK on DMOs (Plan 4 finding). T7 will use `HELD_AWAY_ACCOUNT_ID` as the single PK and add KQ qualifiers `accountId__c` + `profileMonth__c` for join semantics.

## Held-away count distribution

Number of held-away accounts per anchor:

```python
def _row_count(income, age, client_cat, rng):
    """1-5 held-away accounts, biased by wealth indicators."""
    base_weights = [40, 30, 18, 8, 4]  # 1, 2, 3, 4, 5
    if client_cat == "Wealth Management":
        # Wealth clients have more linked accounts (multiple brokerages, IRAs)
        base_weights = [10, 25, 30, 22, 13]
    elif income >= 200_000:
        base_weights = [20, 30, 25, 15, 10]
    elif income < 40_000:
        # Lower-income tend to have fewer linked accounts
        base_weights = [55, 30, 10, 4, 1]
    return rng.choices([1, 2, 3, 4, 5], weights=base_weights)[0]
```

Expected mean ~2.06 rows/anchor → **~52,300 rows/month** (largest Cumulus table to date).

## 20-institution pool

Real Plaid covers 12,000+ institutions; we mirror 20 recognisable names mapped to types:

| Name | Type |
|---|---|
| Vanguard | Brokerage |
| Fidelity | Brokerage |
| Charles Schwab | Brokerage |
| E*TRADE | Brokerage |
| Robinhood | Brokerage |
| Chase | Bank |
| Wells Fargo | Bank |
| Bank of America | Bank |
| Citi | Bank |
| US Bank | Bank |
| Capital One | Bank |
| PNC | Bank |
| Ally | Bank |
| Navy Federal | Credit Union |
| PenFed | Credit Union |
| State Employees CU | Credit Union |
| Betterment | Robo-Advisor |
| Wealthfront | Robo-Advisor |
| Coinbase | Crypto Exchange |
| Kraken | Crypto Exchange |

```python
_INSTITUTIONS = [
    ("Vanguard", "Brokerage"), ("Fidelity", "Brokerage"), ("Charles Schwab", "Brokerage"),
    ("E*TRADE", "Brokerage"), ("Robinhood", "Brokerage"),
    ("Chase", "Bank"), ("Wells Fargo", "Bank"), ("Bank of America", "Bank"),
    ("Citi", "Bank"), ("US Bank", "Bank"), ("Capital One", "Bank"),
    ("PNC", "Bank"), ("Ally", "Bank"),
    ("Navy Federal", "Credit Union"), ("PenFed", "Credit Union"),
    ("State Employees CU", "Credit Union"),
    ("Betterment", "Robo-Advisor"), ("Wealthfront", "Robo-Advisor"),
    ("Coinbase", "Crypto Exchange"), ("Kraken", "Crypto Exchange"),
]
```

## Account type bias by institution type + age

```python
def _account_type(institution_type, age, rng):
    """ACCOUNT_TYPE conditional on INSTITUTION_TYPE."""
    if institution_type == "Brokerage":
        if age >= 50:
            pool = ["Brokerage", "IRA", "401k"]
            weights = [0.45, 0.35, 0.20]
        else:
            pool = ["Brokerage", "IRA", "401k", "HSA"]
            weights = [0.55, 0.20, 0.20, 0.05]
    elif institution_type == "Bank":
        pool = ["Checking", "Savings", "Credit Card", "Mortgage", "Auto Loan"]
        weights = [0.30, 0.25, 0.20, 0.15, 0.10]
    elif institution_type == "Credit Union":
        pool = ["Checking", "Savings", "Credit Card", "Auto Loan"]
        weights = [0.35, 0.30, 0.20, 0.15]
    elif institution_type == "Robo-Advisor":
        pool = ["Brokerage", "IRA"]
        weights = [0.65, 0.35]
    else:  # Crypto Exchange
        return "Crypto Wallet"
    return rng.choices(pool, weights=weights)[0]
```

## Balance bias

```python
def _balance(account_type, income, age, client_cat, rng):
    """Balance ranges differ wildly by account_type."""
    is_wealth = client_cat == "Wealth Management"
    income_mult = 1.0
    if income >= 250_000: income_mult = 3.0
    elif income >= 100_000: income_mult = 1.5
    elif income < 40_000: income_mult = 0.5

    if account_type == "Checking":
        base = rng.uniform(500, 25_000)
    elif account_type == "Savings":
        base = rng.uniform(1_000, 80_000)
    elif account_type == "Brokerage":
        base = rng.uniform(5_000, 800_000) * (2.0 if is_wealth else 1.0)
    elif account_type == "IRA":
        # IRA accumulates with age
        age_mult = max(0.3, min(3.0, (age - 25) / 15))
        base = rng.uniform(8_000, 350_000) * age_mult
    elif account_type == "401k":
        age_mult = max(0.2, min(4.0, (age - 22) / 12))
        base = rng.uniform(5_000, 600_000) * age_mult
    elif account_type == "HSA":
        base = rng.uniform(500, 12_000)
    elif account_type == "Credit Card":
        # Credit-card balance is debt — negative
        return -round(rng.uniform(0, 18_000), 2)
    elif account_type == "Mortgage":
        return -round(rng.uniform(50_000, 1_200_000) * income_mult, 2)
    elif account_type == "Auto Loan":
        return -round(rng.uniform(3_000, 65_000), 2)
    else:  # Crypto Wallet
        # Crypto: long tail, mostly small balances
        base = rng.choices(
            [rng.uniform(50, 2_500), rng.uniform(2_500, 30_000), rng.uniform(30_000, 500_000)],
            weights=[0.65, 0.27, 0.08],
        )[0]
    return round(min(10_000_000, base * income_mult), 2)
```

## LAST_LINKED_DATE

```python
def _last_linked_date(run_ts, rng):
    """Connection age 1–48 months ago, mode ~12 months."""
    months_ago = rng.choices(
        range(1, 49),
        weights=[max(1, 50 - abs(m - 12)) for m in range(1, 49)],
    )[0]
    return (run_ts.date().replace(day=1) - timedelta(days=months_ago * 30))
```

## IS_ACTIVE / LAST_TRANSACTION_DATE / MONTHLY_NET_FLOW_USD

```python
def _is_active(rng):
    return rng.random() >= 0.08  # ~92% healthy

def _last_txn_date(is_active, run_ts, rng):
    if not is_active:
        return None
    days_ago = rng.choices([0, 1, 2, 3, 7, 14, 30], weights=[40, 25, 15, 8, 6, 4, 2])[0]
    return run_ts.date() - timedelta(days=days_ago)

def _monthly_net_flow(is_active, account_type, balance, rng):
    if not is_active:
        return None
    if account_type in ("Mortgage", "Auto Loan"):
        # Loans: monthly principal+interest payment outflow (3-7% of balance/12)
        return -round(abs(balance) * rng.uniform(0.04, 0.07) / 12, 2)
    if account_type == "Credit Card":
        return round(rng.uniform(-1500, 800), 2)  # mix of charges + payoffs
    if account_type in ("Checking", "Savings"):
        return round(rng.uniform(-3000, 5000), 2)
    if account_type in ("Brokerage", "IRA", "401k"):
        return round(rng.uniform(-500, 2500), 2)  # contributions skew positive
    return round(rng.uniform(-200, 600), 2)  # HSA, Crypto
```

## INVESTMENT_RISK_TIER

```python
_INVESTMENT_TYPES = {"Brokerage", "IRA", "401k", "HSA"}

def _investment_risk_tier(account_type, age, rng):
    if account_type not in _INVESTMENT_TYPES:
        return None
    # Older = more conservative (textbook glide path)
    if age >= 60:
        pool, weights = ["Conservative", "Moderate", "Aggressive"], [0.55, 0.35, 0.10]
    elif age >= 40:
        pool, weights = ["Conservative", "Moderate", "Aggressive", "Speculative"], [0.20, 0.50, 0.25, 0.05]
    else:
        pool, weights = ["Moderate", "Aggressive", "Speculative"], [0.30, 0.50, 0.20]
    return rng.choices(pool, weights=weights)[0]
```

## INTEREST_RATE_PCT

```python
def _interest_rate(account_type, rng):
    """APY for savings, APR for loans, NULL otherwise."""
    if account_type == "Savings":
        return round(rng.uniform(0.50, 5.50), 3)
    if account_type == "Mortgage":
        return round(rng.uniform(2.75, 7.50), 3)  # bimodal pre/post-2022 but flatten here
    if account_type == "Auto Loan":
        return round(rng.uniform(4.00, 12.00), 3)
    if account_type == "Credit Card":
        return round(rng.uniform(14.00, 28.00), 3)
    return None  # Checking, Brokerage, IRA, 401k, HSA, Crypto
```

## SP shape — multi-row per anchor

Plans 1-5's `_row_for(anchor, run_ts) -> dict` returns a **single dict**. Plan 6's `_rows_for(anchor, run_ts) -> list[dict]` returns **a sorted list of 1-5 dicts**.

```python
def _rows_for(anchor, run_ts):
    """Return a deterministically-ordered list of held-away rows for one anchor."""
    account_id = anchor["ACCOUNT_ID"]
    income = float(anchor.get("ANNUAL_INCOME") or 0)
    birthdate = anchor.get("BIRTHDATE")
    client_cat = anchor.get("CLIENT_CATEGORY") or ""

    # Parent-level seed (drives row_count, doesn't change per slot)
    parent_seed = seed_for(account_id, "plaid", run_ts)
    parent_rng = random.Random(parent_seed)

    age = _age_from_birthdate(birthdate, run_ts.date())
    n = _row_count(income, age, client_cat, parent_rng)

    month_start = run_ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    rows = []
    for slot in range(n):
        # Per-slot seed — independent stream per slot
        slot_seed = seed_for(f"{account_id}_slot{slot}", "plaid", run_ts)
        slot_rng = random.Random(slot_seed)
        held_away_id = hashlib.sha256(
            f"{account_id}_slot{slot}_plaid".encode()
        ).hexdigest()[:16]

        institution_name, institution_type = slot_rng.choice(_INSTITUTIONS)
        account_type = _account_type(institution_type, age, slot_rng)
        balance = _balance(account_type, income, age, client_cat, slot_rng)
        last_linked = _last_linked_date(run_ts, slot_rng)
        is_active = _is_active(slot_rng)
        last_txn = _last_txn_date(is_active, run_ts, slot_rng)
        monthly_flow = _monthly_net_flow(is_active, account_type, balance, slot_rng)
        risk_tier = _investment_risk_tier(account_type, age, slot_rng)
        rate = _interest_rate(account_type, slot_rng)

        rows.append({
            "ACCOUNT_ID":            account_id,
            "HELD_AWAY_ACCOUNT_ID":  held_away_id,
            "PROFILE_MONTH":         month_start.date(),
            "INSTITUTION_NAME":      institution_name,
            "INSTITUTION_TYPE":      institution_type,
            "ACCOUNT_TYPE":          account_type,
            "BALANCE_USD":           balance,
            "LAST_LINKED_DATE":      last_linked,
            "IS_ACTIVE":             is_active,
            "LAST_TRANSACTION_DATE": last_txn,
            "MONTHLY_NET_FLOW_USD":  monthly_flow,
            "INVESTMENT_RISK_TIER":  risk_tier,
            "INTEREST_RATE_PCT":     rate,
            "GENERATED_AT":          month_start,
        })

    # Deterministic ordering: sort by HELD_AWAY_ACCOUNT_ID before MERGE
    rows.sort(key=lambda r: r["HELD_AWAY_ACCOUNT_ID"])
    return rows
```

The SP's main loop flattens the list-of-lists:

```python
records = []
for anchor in audience:
    records.extend(_rows_for(anchor, run_ts))
accounts_processed = len(audience)  # NOT len(records)
row_count = len(records)             # ~52,300
```

## Coverage assertion — different shape

Plans 1-5's coverage was `rows = audience size`. Plan 6 needs **two-part coverage**:

```python
# 1. Every anchor has ≥1 row (the "must include" rule)
COVERAGE_SQL = """
    SELECT COUNT(DISTINCT ACCOUNT_ID)
    FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
    WHERE CLIENT_CATEGORY IN ('Retail', 'Wealth Management')
"""
ACTUAL_DISTINCT_SQL = "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.PLAID_HELD_AWAY"

# 2. Row count is in the expected band
ROW_COUNT_SQL = "SELECT COUNT(*) FROM FINS.PUBLIC.PLAID_HELD_AWAY"
# Expected: audience_size <= count <= 5 * audience_size
```

`assert_coverage` will need a slight extension to accept the row-count band check, OR the SP can do the band check inline. Inline is simpler:

```python
audience_size = len(audience)
distinct_accts = session.sql(ACTUAL_DISTINCT_SQL).collect()[0][0]
if distinct_accts != audience_size:
    raise RuntimeError(f"missing anchors: expected {audience_size}, got {distinct_accts}")
total_rows = session.sql(ROW_COUNT_SQL).collect()[0][0]
if not (audience_size <= total_rows <= 5 * audience_size):
    raise RuntimeError(f"row count {total_rows} outside band [{audience_size}, {5*audience_size}]")
```

## `_anchor_in_audience`

```python
def _anchor_in_audience(anchor: dict) -> bool:
    return anchor.get("CLIENT_CATEGORY") in ("Retail", "Wealth Management")
```

## Boring case (must still emit)

A "boring" Retail anchor — age 35, income $65K, urban — produces:
- 1-2 held-away accounts (mode 1 for Retail mid-income)
- Most likely 1× Bank Checking + maybe 1× Brokerage IRA
- Balance ranges: Checking $500-$25K; IRA $8K-$350K with age glide
- Investment risk: Moderate (most likely)

A Wealth-Management anchor — age 60, income $400K — produces:
- 3-5 held-away accounts (mode 3 for Wealth)
- Likely mix: Vanguard Brokerage, Fidelity IRA, Schwab 401k, BoA Mortgage, maybe Coinbase
- Brokerage balance $5K-$1.6M (income mult applies)
- Risk tier: Conservative-Moderate skew

**No anchor is dropped.** Every Retail and Wealth anchor produces at least one row.

## Anchor-influence test target (template L1 property #4)

Plan 6 has the same 5-property structure but #4 has THREE assertions plus a **multi-row determinism** check:

1. **Determinism on multi-row output** — `_rows_for(anchor, run_ts)` returns the same list (same length, same dict-by-dict, same ordering) on re-run.
2. **Income → balance shift:** mean total balance across held-away rows is ≥3× higher for income ≥$250K vs income <$40K. Restrict to non-loan account types.
3. **Age → investment risk shift:** mean Speculative-tier rate is ≥2× higher for age <30 vs age 65+ (within Brokerage/IRA/401k rows).
4. **Wealth → row count shift:** Wealth Management anchors have mean row count ≥1.35× Retail anchors with comparable income. (The rowspec weights `[10,25,30,22,13]` for Wealth and `[40,30,18,8,4]` for Retail mathematically cap the ratio at 3.03/2.06 = 1.47×; 1.35× is the test threshold leaving ~7 pp headroom. The directional invariant — Wealth > Retail — is the load-bearing claim, not the magnitude.)

Plus a fifth: **Stable HELD_AWAY_ACCOUNT_ID across months** — same anchor's slot-0 has same `HELD_AWAY_ACCOUNT_ID` in May and June. (The hash is salt+slot-deterministic, not run-bucketed.)

## Cadence

**Monthly.** CRON: `'USING CRON 0 7 1 * * UTC'` (matches Plans 1-3). Idempotent re-runs same month replace.

## Volume

**~52,300 rows/month** (25,381 anchors × ~2.06 mean rows/anchor). Largest Cumulus table to date — ~2× the previous max (Plan 1 / 5 at 25,424). write_pandas should chunk to 16K-row batches for safety; current default is fine but worth flagging in the SP.

## Out of scope

- **Real Plaid license / OAuth flow.** Our institution names are recognisable, but no actual third-party connection happens.
- **Transaction-level data.** Plaid publishes per-transaction streams; we model only month-end balance + last-30d net flow.
- **Holdings (positions/tickers).** Real Plaid Investments product publishes per-security holdings. Out of scope — we collapse to balance + risk tier only.
- **Token rotation / reconnect lifecycle.** `IS_ACTIVE=false` is a static flag, not a state machine.
- **Multi-currency.** All balances USD. Real Plaid supports ~30 currencies.
