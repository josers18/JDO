"""Plaid-style synthetic held-away financial accounts generator.

Snowpark Python stored procedure registered as
DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY. **First 1:N dataset** in the Cumulus
rollout — `_rows_for(anchor, run_ts) -> list[dict]` returns 1-5 rows per
anchor (versus Plans 1-5's `_row_for(...) -> dict`).

Audience: CLIENT_CATEGORY IN ('Retail', 'Wealth Management') — personal held-away
          + CLIENT_CATEGORY IN ('Small Business', 'Commercial Banking') — business
            held-away (operating, treasury and credit accounts at other banks)
Cadence:  MONTHLY (1st of the month, 03:35 America/New_York)
Salt:     "plaid" (month-bucketed: balance, activity, flow) and
          "plaid_identity" (identity-stable: row count, institution, account
          type, link date, risk tier, rate)
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-6-plaid-held-away-rowspec.md
"""
from __future__ import annotations

import hashlib
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

TABLE        = "DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY"
TASK_NAME    = "TASK_MONTHLY_PLAID_HELD_AWAY"
DATASET_SALT = "plaid"
IDENTITY_SALT = "plaid_identity"
# Link dates count back from this fixed date, so they never move between runs and
# never land after the earliest generated month (2026-05).
_LINK_REFERENCE = date(2026, 5, 1)

# Audience predicate — repeated in 2 places (AUDIENCE_SQL + COVERAGE_SQL).
# Both strings must match exactly to keep the coverage assertion meaningful.
_PERSON_CATEGORIES = ("Retail", "Wealth Management")
_BUSINESS_CATEGORIES = ("Small Business", "Commercial Banking")
_AUDIENCE_PREDICATE = (
    "CLIENT_CATEGORY IN ('Retail', 'Wealth Management', 'Small Business', 'Commercial Banking')"
)
AUDIENCE_SQL = f"SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"
COVERAGE_SQL = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"

# 16-column output contract (kept in sync with table DDL by the L1 schema test).
# v1.x multi-org-additive: ORG_ID leads the contract list; stamped from anchor.
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID",
    "ACCOUNT_ID", "HELD_AWAY_ACCOUNT_ID", "PROFILE_MONTH",
    "INSTITUTION_NAME", "INSTITUTION_TYPE", "ACCOUNT_TYPE",
    "BALANCE_USD", "BALANCE_CATEGORY", "LAST_LINKED_DATE", "IS_ACTIVE",
    "LAST_TRANSACTION_DATE", "MONTHLY_NET_FLOW_USD",
    "INVESTMENT_RISK_TIER", "INTEREST_RATE_PCT", "GENERATED_AT",
})

# 20-institution pool — recognisable names mapped to types. NOT license-grade
# Plaid data. Two-stage pick: institution type first (weights keep the type mix
# the cockpits were built on), then a market-share-style weight within the type,
# so the big custodians (Fidelity, Schwab, Vanguard) and big banks dominate.
_INSTITUTION_TYPE_WEIGHTS = [
    ("Brokerage", 30), ("Bank", 38), ("Credit Union", 14),
    ("Robo-Advisor", 9), ("Crypto Exchange", 9),
]
_INSTITUTIONS: dict[str, list[tuple[str, int]]] = {
    "Brokerage": [("Fidelity", 32), ("Charles Schwab", 28), ("Vanguard", 26),
                  ("E*TRADE", 8), ("Robinhood", 6)],
    "Bank": [("Chase", 26), ("Bank of America", 22), ("Wells Fargo", 18),
             ("Citi", 10), ("Capital One", 9), ("US Bank", 7), ("PNC", 5),
             ("Ally", 3)],
    "Credit Union": [("Navy Federal", 60), ("PenFed", 25),
                     ("State Employees CU", 15)],
    "Robo-Advisor": [("Betterment", 60), ("Wealthfront", 40)],
    "Crypto Exchange": [("Coinbase", 75), ("Kraken", 25)],
}

# Business held-away: banks plus business fintechs. Fintech share is larger for
# small businesses. Type weights are per CLIENT_CATEGORY.
_BUSINESS_TYPE_WEIGHTS = {
    "Small Business": [("Bank", 80), ("Fintech", 20)],
    "Commercial Banking": [("Bank", 94), ("Fintech", 6)],
}
_BUSINESS_INSTITUTIONS: dict[str, list[tuple[str, int]]] = {
    "Bank": [("Chase", 24), ("Bank of America", 20), ("Wells Fargo", 17),
             ("Citi", 10), ("PNC", 9), ("US Bank", 8), ("Truist", 7),
             ("Capital One", 5)],
    "Fintech": [("Mercury", 55), ("Brex", 45)],
}
_BUSINESS_DEPOSIT_TYPES = {"Business Checking", "Business Savings",
                           "Money Market", "Sweep Account"}

# INVESTMENT_RISK_TIER is populated only for these account types.
_INVESTMENT_TYPES = {"Brokerage", "IRA", "401k", "HSA", "Managed Portfolio"}
# BALANCE_CATEGORY = 'liability' for these; BALANCE_USD is always the positive
# amount (owed, for liabilities).
_LIABILITY_TYPES = {"Mortgage", "Auto Loan", "Credit Card",
                    "Line of Credit", "Commercial Loan", "Commercial Card"}


# -------------------------------------------------------------------
# Entry point — invoked by DATA_JEDAIS.FINS__PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_PLAID_HELD_AWAY
# -------------------------------------------------------------------

def main(session: Any, run_month: date | None = None) -> str:
    """The 5-step canonical pattern, adapted for 1:N output:
    read -> build (extend) -> MERGE -> two-part assert -> log.

    run_month (optional): regenerate that month instead of the current one,
    e.g. CALL SP_GENERATE_PLAID_HELD_AWAY('2026-05-01'::DATE). The month's rows
    are replaced exactly (orphan slots from an earlier run are deleted)."""
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    run_ts = datetime(run_month.year, run_month.month, 1) if run_month else started
    profile_month = run_ts.date().replace(day=1)
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience from the shared view (zero-copy fresh anchors).
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)  # NOT len(records); customer count.

        # 2. Build deterministic rows; tolerate up to 1% per-anchor failures.
        records, errors = [], []
        for row in audience:
            anchor_dict = _anchor_to_dict(row)
            try:
                # Flatten 1:N — each anchor produces 1-5 rows.
                records.extend(_rows_for(anchor_dict, run_ts))
            except Exception as exc:
                errors.append((row.ACCOUNT_ID, str(exc)[:200]))
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

        # 3. Idempotent MERGE on composite PK
        # (ORG_ID, ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH).
        rows_inserted = _merge(session, records)

        # 4. Two-part coverage assertion, scoped to the generated month:
        # (a) every anchor has >=1 row AND (b) the month's rows are in band.
        actual_distinct_sql = (
            f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE} "
            f"WHERE PROFILE_MONTH = '{profile_month.isoformat()}'"
        )
        assert_coverage(session, COVERAGE_SQL, actual_distinct_sql)

        audience_size = accounts_processed
        month_rows = len(records)
        if not (audience_size <= month_rows <= 5 * audience_size):
            raise RuntimeError(
                f"month rows {month_rows} outside band "
                f"[{audience_size}, {5 * audience_size}]"
            )

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


def _anchor_to_dict(row: Any) -> dict:
    """Snowpark Row -> plain dict so _rows_for can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _anchor_in_audience — defense-in-depth for the audience predicate
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Translate the AUDIENCE_PREDICATE into a Python predicate.

    Retail / Wealth Management (personal) and Small Business / Commercial
    Banking (business) anchors are in-audience. Household / null are out.
    """
    return anchor.get("CLIENT_CATEGORY") in _PERSON_CATEGORIES + _BUSINESS_CATEGORIES


# -------------------------------------------------------------------
# _rows_for — the substantive 1:N synthesis logic (per rowspec)
# -------------------------------------------------------------------

def _rows_for(anchor: dict, run_ts: datetime) -> list[dict]:
    """Pure function: anchor -> sorted list of 1-5 held-away rows. Deterministic.

    Two seed streams per slot:
      - Identity seed `_identity_rng(key)` (no run_ts): row count, institution,
        account type, link date, risk tier and rate. A customer keeps the same
        held-away accounts at the same institutions month after month.
      - Monthly seed `seed_for(f"{account_id}_slot{i}", "plaid", run_ts)`:
        the balance drift around the slot's base, connection health, last
        transaction date and net flow.

    HELD_AWAY_ACCOUNT_ID = sha256(f"{account_id}_slot{i}_plaid")[:16] hex —
    NO run_ts in the hash, so the value is constant across all months for the
    same (anchor, slot) pair (identity-stable, not month-bucketed).

    Rows are sorted by HELD_AWAY_ACCOUNT_ID ascending before return so the
    list ordering is deterministic across re-runs with identical inputs.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor {anchor.get('ACCOUNT_ID')} fails audience predicate "
            f"({_AUDIENCE_PREDICATE}); CLIENT_CATEGORY="
            f"{anchor.get('CLIENT_CATEGORY')!r}"
        )

    account_id = anchor["ACCOUNT_ID"]
    income     = float(anchor.get("ANNUAL_INCOME") or 0)
    birthdate  = anchor.get("BIRTHDATE")
    client_cat = anchor.get("CLIENT_CATEGORY") or ""
    is_business = client_cat in _BUSINESS_CATEGORIES
    revenue    = float(anchor.get("ANNUAL_REVENUE") or 0) or 1_000_000.0

    # Identity-level stream (drives row_count; no run_ts, so it holds across months).
    parent_rng = _identity_rng(account_id)

    # Age bands are read at the fixed link reference so identity attributes
    # don't flip when a birthday crosses a band edge between months.
    age = _age_from_birthdate(birthdate, _LINK_REFERENCE)
    if is_business:
        n = _business_row_count(client_cat, parent_rng)
    else:
        n = _row_count(income, age, client_cat, parent_rng)

    month_start = run_ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    rows: list[dict] = []
    for slot in range(n):
        # Per-slot streams: identity (stable) and monthly (month-bucketed).
        id_rng = _identity_rng(f"{account_id}_slot{slot}")
        slot_rng = random.Random(seed_for(f"{account_id}_slot{slot}", DATASET_SALT, run_ts))

        # Identity-stable hash — NO run_ts in the key.
        held_away_id = hashlib.sha256(
            f"{account_id}_slot{slot}_plaid".encode()
        ).hexdigest()[:16]

        # Identity attributes — drawn in a fixed order from id_rng.
        if is_business:
            institution_name, institution_type = _institution(
                id_rng, _BUSINESS_TYPE_WEIGHTS[client_cat], _BUSINESS_INSTITUTIONS)
            account_type = _business_account_type(institution_type, client_cat, id_rng)
            base_balance = _business_balance(account_type, revenue, id_rng)
        else:
            institution_name, institution_type = _institution(id_rng)
            account_type = _account_type(institution_type, age, id_rng)
            base_balance = _balance(account_type, income, age, client_cat, id_rng)
        last_linked  = _last_linked_date(id_rng)
        risk_tier    = _investment_risk_tier(account_type, age, id_rng)
        rate         = _interest_rate(account_type, id_rng)
        # Monthly attributes. Pass month_start (not raw run_ts) to date
        # arithmetic so mid-month re-runs produce byte-identical rows.
        balance      = _drift_balance(base_balance, account_type, slot_rng)
        is_active    = _is_active(slot_rng)
        last_txn     = _last_txn_date(is_active, month_start, slot_rng)
        monthly_flow = _monthly_net_flow(is_active, account_type, balance, slot_rng, revenue)

        rows.append({
            # v1.x multi-org-additive: ORG_ID leads EVERY emitted record (1:N
            # — stamped on every slot, not just the first). Default 'JDO'
            # backstop if anchor lacks the column — backward-compat with
            # pre-migration fixtures.
            "ORG_ID":                anchor.get("ORG_ID") or "JDO",
            "ACCOUNT_ID":            account_id,
            "HELD_AWAY_ACCOUNT_ID":  held_away_id,
            "PROFILE_MONTH":         month_start.date(),
            "INSTITUTION_NAME":      institution_name,
            "INSTITUTION_TYPE":      institution_type,
            "ACCOUNT_TYPE":          account_type,
            "BALANCE_USD":           balance,
            "BALANCE_CATEGORY":      "liability" if account_type in _LIABILITY_TYPES else "asset",
            "LAST_LINKED_DATE":      last_linked,
            "IS_ACTIVE":             is_active,
            "LAST_TRANSACTION_DATE": last_txn,
            "MONTHLY_NET_FLOW_USD":  monthly_flow,
            "INVESTMENT_RISK_TIER":  risk_tier,
            "INTEREST_RATE_PCT":     rate,
            "GENERATED_AT":          month_start,
        })

    # Deterministic ordering: sort by HELD_AWAY_ACCOUNT_ID before MERGE.
    rows.sort(key=lambda r: r["HELD_AWAY_ACCOUNT_ID"])
    return rows


# -------------------------------------------------------------------
# Bias-logic helpers — translate the rowspec faithfully
# -------------------------------------------------------------------

def _identity_rng(key: str) -> random.Random:
    """Month-independent stream: sha256(key|plaid_identity), no run_ts."""
    return random.Random(hashlib.sha256(f"{key}|{IDENTITY_SALT}".encode()).digest())


def _institution(rng: random.Random,
                 type_weights: list[tuple[str, int]] = _INSTITUTION_TYPE_WEIGHTS,
                 institutions: dict[str, list[tuple[str, int]]] = _INSTITUTIONS,
                 ) -> tuple[str, str]:
    """(INSTITUTION_NAME, INSTITUTION_TYPE): type first, then name within type."""
    types, weights = zip(*type_weights)
    institution_type = rng.choices(types, weights=weights)[0]
    names, name_weights = zip(*institutions[institution_type])
    return rng.choices(names, weights=name_weights)[0], institution_type


def _age_from_birthdate(birthdate: Any, today: date) -> int:
    """Tolerate ISO string, datetime, date, or None inputs."""
    if birthdate is None:
        return 40  # safe default; should not happen for Retail/Wealth audience
    if isinstance(birthdate, str):
        bd = datetime.fromisoformat(birthdate.split("T")[0]).date()
    elif isinstance(birthdate, datetime):
        bd = birthdate.date()
    elif isinstance(birthdate, date):
        bd = birthdate
    else:
        return 40
    return (today - bd).days // 365


def _row_count(income: float, age: int, client_cat: str,
               rng: random.Random) -> int:
    """1-5 held-away accounts, biased by wealth indicators."""
    base_weights = [40, 30, 18, 8, 4]  # 1, 2, 3, 4, 5 -> mean ~2.06
    if client_cat == "Wealth Management":
        # Wealth clients have more linked accounts (multiple brokerages, IRAs).
        base_weights = [10, 25, 30, 22, 13]
    elif income >= 200_000:
        base_weights = [20, 30, 25, 15, 10]
    elif income < 40_000:
        # Lower-income tend to have fewer linked accounts.
        base_weights = [55, 30, 10, 4, 1]
    return rng.choices([1, 2, 3, 4, 5], weights=base_weights)[0]


def _account_type(institution_type: str, age: int,
                  rng: random.Random) -> str:
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
        # Robo accounts are managed portfolios, never self-directed "Brokerage".
        pool = ["Managed Portfolio", "IRA"]
        weights = [0.65, 0.35]
    else:  # Crypto Exchange
        return "Crypto Wallet"
    return rng.choices(pool, weights=weights)[0]


def _balance(account_type: str, income: float, age: int,
             client_cat: str, rng: random.Random) -> float:
    """Base balance for the slot (positive). Ranges differ wildly by account_type;
    for liabilities it is the amount owed."""
    is_wealth = client_cat == "Wealth Management"
    if income >= 250_000:
        income_mult = 3.0
    elif income >= 100_000:
        income_mult = 1.5
    elif income < 40_000:
        income_mult = 0.5
    else:
        income_mult = 1.0

    if account_type == "Checking":
        base = rng.uniform(500, 25_000)
    elif account_type == "Savings":
        base = rng.uniform(1_000, 80_000)
    elif account_type in ("Brokerage", "Managed Portfolio"):
        base = rng.uniform(5_000, 800_000) * (2.0 if is_wealth else 1.0)
    elif account_type == "IRA":
        # IRA accumulates with age.
        age_mult = max(0.3, min(3.0, (age - 25) / 15))
        base = rng.uniform(8_000, 350_000) * age_mult
    elif account_type == "401k":
        age_mult = max(0.2, min(4.0, (age - 22) / 12))
        base = rng.uniform(5_000, 600_000) * age_mult
    elif account_type == "HSA":
        base = rng.uniform(500, 12_000)
    elif account_type == "Credit Card":
        return round(rng.uniform(0, 18_000), 2)
    elif account_type == "Mortgage":
        return round(rng.uniform(50_000, 1_200_000) * income_mult, 2)
    elif account_type == "Auto Loan":
        return round(rng.uniform(3_000, 65_000), 2)
    else:  # Crypto Wallet — long tail, mostly small balances.
        base = rng.choices(
            [rng.uniform(50, 2_500), rng.uniform(2_500, 30_000),
             rng.uniform(30_000, 500_000)],
            weights=[0.65, 0.27, 0.08],
        )[0]
    return round(min(10_000_000, base * income_mult), 2)


def _business_row_count(client_cat: str, rng: random.Random) -> int:
    """1-5 business held-away accounts; commercial clients bank more widely."""
    if client_cat == "Commercial Banking":
        weights = [10, 25, 30, 22, 13]
    else:
        weights = [45, 35, 15, 5, 0]
    return rng.choices([1, 2, 3, 4, 5], weights=weights)[0]


def _business_account_type(institution_type: str, client_cat: str,
                           rng: random.Random) -> str:
    """Business ACCOUNT_TYPE conditional on INSTITUTION_TYPE and segment.
    Sweep accounts are commercial-only."""
    if institution_type == "Fintech":
        pool = ["Business Checking", "Commercial Card"]
        weights = [0.60, 0.40]
    elif client_cat == "Commercial Banking":
        pool = ["Business Checking", "Money Market", "Sweep Account",
                "Business Savings", "Line of Credit", "Commercial Loan",
                "Commercial Card"]
        weights = [0.28, 0.14, 0.14, 0.06, 0.16, 0.14, 0.08]
    else:
        pool = ["Business Checking", "Business Savings", "Money Market",
                "Line of Credit", "Commercial Loan", "Commercial Card"]
        weights = [0.38, 0.14, 0.10, 0.14, 0.12, 0.12]
    return rng.choices(pool, weights=weights)[0]


def _business_balance(account_type: str, revenue: float,
                      rng: random.Random) -> float:
    """Base balance scaled to ANNUAL_REVENUE (positive; owed for liabilities)."""
    share = {
        "Business Checking": (0.03, 0.12),
        "Business Savings":  (0.01, 0.06),
        "Money Market":      (0.02, 0.10),
        "Sweep Account":     (0.05, 0.15),
        "Line of Credit":    (0.00, 0.08),   # drawn amount
        "Commercial Loan":   (0.05, 0.30),
        "Commercial Card":   (0.002, 0.02),
    }[account_type]
    return round(min(10_000_000, revenue * rng.uniform(*share)), 2)


def _drift_balance(base: float, account_type: str, rng: random.Random) -> float:
    """This month's balance: the slot's base with a small monthly move.
    Assets move -3%..+4%; liabilities -2%..+1% (paydown bias); cards swing more."""
    if account_type in ("Credit Card", "Commercial Card", "Line of Credit"):
        factor = rng.uniform(0.6, 1.4)
    elif account_type in _LIABILITY_TYPES:
        factor = rng.uniform(0.98, 1.01)
    else:
        factor = rng.uniform(0.97, 1.04)
    return round(min(10_000_000, base * factor), 2)


def _last_linked_date(rng: random.Random) -> date:
    """Connection date 1-48 months before _LINK_REFERENCE, mode ~12 months.
    Identity-stable: the same slot keeps the same link date every month."""
    months_ago = rng.choices(
        range(1, 49),
        weights=[max(1, 50 - abs(m - 12)) for m in range(1, 49)],
    )[0]
    return _LINK_REFERENCE - timedelta(days=months_ago * 30)


def _is_active(rng: random.Random) -> bool:
    """~92% healthy connections."""
    return rng.random() >= 0.08


def _last_txn_date(is_active: bool, run_ts: datetime,
                   rng: random.Random) -> date | None:
    if not is_active:
        return None
    days_ago = rng.choices(
        [0, 1, 2, 3, 7, 14, 30],
        weights=[40, 25, 15, 8, 6, 4, 2],
    )[0]
    return run_ts.date() - timedelta(days=days_ago)


def _monthly_net_flow(is_active: bool, account_type: str, balance: float,
                      rng: random.Random, revenue: float = 0.0) -> float | None:
    if not is_active:
        return None
    if account_type in _BUSINESS_DEPOSIT_TYPES:
        # Operating cash moves with monthly revenue; slight inflow skew.
        return round(revenue / 12 * rng.uniform(-0.15, 0.20), 2)
    if account_type == "Commercial Loan":
        return -round(balance * rng.uniform(0.06, 0.10) / 12, 2)
    if account_type == "Line of Credit":
        return round(balance * rng.uniform(-0.10, 0.10), 2)  # draws vs paydowns
    if account_type == "Commercial Card":
        return round(balance * rng.uniform(-0.30, 0.10), 2)
    if account_type in ("Mortgage", "Auto Loan"):
        # Loans: monthly principal+interest payment outflow (4-7% of balance/12).
        return -round(balance * rng.uniform(0.04, 0.07) / 12, 2)
    if account_type == "Credit Card":
        return round(rng.uniform(-1500, 800), 2)  # mix of charges + payoffs
    if account_type in ("Checking", "Savings"):
        return round(rng.uniform(-3000, 5000), 2)
    if account_type in ("Brokerage", "Managed Portfolio", "IRA", "401k"):
        return round(rng.uniform(-500, 2500), 2)  # contributions skew positive
    return round(rng.uniform(-200, 600), 2)  # HSA, Crypto


def _investment_risk_tier(account_type: str, age: int,
                          rng: random.Random) -> str | None:
    if account_type not in _INVESTMENT_TYPES:
        return None
    # Older = more conservative (textbook glide path).
    if age >= 60:
        pool = ["Conservative", "Moderate", "Aggressive"]
        weights = [0.55, 0.35, 0.10]
    elif age >= 40:
        pool = ["Conservative", "Moderate", "Aggressive", "Speculative"]
        weights = [0.20, 0.50, 0.25, 0.05]
    else:
        pool = ["Moderate", "Aggressive", "Speculative"]
        weights = [0.30, 0.50, 0.20]
    return rng.choices(pool, weights=weights)[0]


def _interest_rate(account_type: str, rng: random.Random) -> float | None:
    """APY for savings, APR for loans, NULL otherwise."""
    if account_type == "Savings":
        return round(rng.uniform(0.50, 5.50), 3)
    if account_type == "Mortgage":
        return round(rng.uniform(2.75, 7.50), 3)  # bimodal pre/post-2022
    if account_type == "Auto Loan":
        return round(rng.uniform(4.00, 12.00), 3)
    if account_type == "Credit Card":
        return round(rng.uniform(14.00, 28.00), 3)
    if account_type == "Business Savings":
        return round(rng.uniform(0.25, 4.50), 3)
    if account_type == "Money Market":
        return round(rng.uniform(1.50, 5.00), 3)
    if account_type == "Sweep Account":
        return round(rng.uniform(2.00, 5.00), 3)
    if account_type == "Line of Credit":
        return round(rng.uniform(6.50, 11.50), 3)
    if account_type == "Commercial Loan":
        return round(rng.uniform(5.50, 10.00), 3)
    if account_type == "Commercial Card":
        return round(rng.uniform(15.00, 26.00), 3)
    return None  # Checking, Brokerage, Managed Portfolio, IRA, 401k, HSA, Crypto, Business Checking


# -------------------------------------------------------------------
# _merge — idempotent MERGE on composite PK
# (ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE, then delete the month's stale slots.
    Returns rows written (inserted + updated).

    Implementation: write_pandas -> staging table -> MERGE statement.
    The staging table is overwrite-truncated each call so re-runs produce
    consistent state.

    Casts in the source SELECT:
      - GENERATED_AT (write_pandas datetime64[ns] -> NUMBER mis-typing
        from v1.4 — cast back via TO_TIMESTAMP_NTZ).
      - HELD_AWAY_ACCOUNT_ID::VARCHAR (write_pandas may infer the wrong
        type for an empty staging table).
      - IS_ACTIVE::BOOLEAN (defensive, same reason).

    The 4 NULLable columns (LAST_TRANSACTION_DATE, MONTHLY_NET_FLOW_USD,
    INVESTMENT_RISK_TIER, INTEREST_RATE_PCT) pass through; pandas +
    write_pandas serializes Python None -> SQL NULL transparently.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "PLAID_HELD_AWAY_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="DATA_JEDAIS", schema="FINS__PUBLIC",
    )

    # v1.x multi-org-additive: ORG_ID is part of the join eligibility; we
    # never UPDATE it in WHEN MATCHED (a row can't change orgs).
    merge_sql = f"""
        MERGE INTO DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY tgt
        USING (
            SELECT
                ORG_ID,
                ACCOUNT_ID,
                HELD_AWAY_ACCOUNT_ID::VARCHAR AS HELD_AWAY_ACCOUNT_ID,
                PROFILE_MONTH,
                INSTITUTION_NAME,
                INSTITUTION_TYPE,
                ACCOUNT_TYPE,
                BALANCE_USD,
                BALANCE_CATEGORY,
                LAST_LINKED_DATE,
                IS_ACTIVE::BOOLEAN AS IS_ACTIVE,
                LAST_TRANSACTION_DATE,
                MONTHLY_NET_FLOW_USD,
                INVESTMENT_RISK_TIER,
                INTEREST_RATE_PCT,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM DATA_JEDAIS.FINS__PUBLIC.{staging}
        ) src
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.HELD_AWAY_ACCOUNT_ID = src.HELD_AWAY_ACCOUNT_ID
           AND tgt.PROFILE_MONTH = src.PROFILE_MONTH
        WHEN MATCHED THEN UPDATE SET
            INSTITUTION_NAME      = src.INSTITUTION_NAME,
            INSTITUTION_TYPE      = src.INSTITUTION_TYPE,
            ACCOUNT_TYPE          = src.ACCOUNT_TYPE,
            BALANCE_USD           = src.BALANCE_USD,
            BALANCE_CATEGORY      = src.BALANCE_CATEGORY,
            LAST_LINKED_DATE      = src.LAST_LINKED_DATE,
            IS_ACTIVE             = src.IS_ACTIVE,
            LAST_TRANSACTION_DATE = src.LAST_TRANSACTION_DATE,
            MONTHLY_NET_FLOW_USD  = src.MONTHLY_NET_FLOW_USD,
            INVESTMENT_RISK_TIER  = src.INVESTMENT_RISK_TIER,
            INTEREST_RATE_PCT     = src.INTEREST_RATE_PCT,
            GENERATED_AT          = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ORG_ID, ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH,
            INSTITUTION_NAME, INSTITUTION_TYPE, ACCOUNT_TYPE,
            BALANCE_USD, BALANCE_CATEGORY, LAST_LINKED_DATE, IS_ACTIVE,
            LAST_TRANSACTION_DATE, MONTHLY_NET_FLOW_USD,
            INVESTMENT_RISK_TIER, INTEREST_RATE_PCT, GENERATED_AT
        ) VALUES (
            src.ORG_ID, src.ACCOUNT_ID, src.HELD_AWAY_ACCOUNT_ID, src.PROFILE_MONTH,
            src.INSTITUTION_NAME, src.INSTITUTION_TYPE, src.ACCOUNT_TYPE,
            src.BALANCE_USD, src.BALANCE_CATEGORY, src.LAST_LINKED_DATE, src.IS_ACTIVE,
            src.LAST_TRANSACTION_DATE, src.MONTHLY_NET_FLOW_USD,
            src.INVESTMENT_RISK_TIER, src.INTEREST_RATE_PCT, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()

    # Replace the month exactly: drop slots an earlier run of the same month
    # wrote that this run no longer emits (row counts can differ between
    # generator versions).
    session.sql(f"""
        DELETE FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY tgt
        WHERE tgt.PROFILE_MONTH IN (SELECT DISTINCT PROFILE_MONTH FROM DATA_JEDAIS.FINS__PUBLIC.{staging})
          AND NOT EXISTS (
              SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.{staging} s
              WHERE s.ORG_ID = tgt.ORG_ID AND s.ACCOUNT_ID = tgt.ACCOUNT_ID
                AND s.HELD_AWAY_ACCOUNT_ID = tgt.HELD_AWAY_ACCOUNT_ID
                AND s.PROFILE_MONTH = tgt.PROFILE_MONTH)
    """).collect()
    # MERGE returns (rows inserted, rows updated); report both as rows written.
    return int(rows[0][0]) + int(rows[0][1]) if rows else len(records)
