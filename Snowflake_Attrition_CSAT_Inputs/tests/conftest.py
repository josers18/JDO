"""Synthetic feature rows (the Task 2 feature-row contract), not loaded from Cumulus fixtures."""
from datetime import date

import pytest

_BASE = {
    "ACCOUNT_ID": "001am00000TEST0001",
    "ACCOUNT_TYPE_FLAG": "PERSON",
    "CLIENT_CATEGORY": "Retail",
    "BIRTHDATE": date(1985, 3, 14),
    "ANNUAL_INCOME": 92000.0,
    "CREDIT_SCORE": 715.0,
    "ANNUAL_REVENUE": None,
    "NPS_SCORE": 8,
    "NPS_DESCRIPTION": "Passives",
    "DETRACTOR_12M": False,
    "N_PRODUCTS": 3,
    "N_DEPOSIT": 2,
    "N_LOAN": 1,
    "N_INVESTMENT": 0,
    "N_LINE": 0,
    "DD_AMOUNT": 3200.0,
    "BONUS_AMOUNT": 150.0,
    "FIRST_OPEN_DATE": date(2018, 6, 20),
    "TOTAL_BALANCE": 48000.0,
    "AVG_BALANCE": 46500.0,
    "EARLY_AVG_BALANCE": 47200.0,
    "LATE_AVG_BALANCE": 45100.0,
    "CREDITS": 5200.0,
    "DEBITS": 4800.0,
    "ADB_TXN": 310,
    "ADB_DAYS": 180,
    "FT_TXN": 140,
    "CALLS": 4,
    "GONG_WEEKS": 3,
    "LAST_CALL_DATE": date(2026, 9, 12),
    "NEG_WEEKS": 1,
    "VNEG_WEEKS": 0,
    "RISK_RATING": "Low",
    "SANCTIONS_HIT": False,
    "PEP_HIT": False,
    "ADVERSE_MEDIA_HIT": False,
}

FEED_KEYS = (
    "N_PRODUCTS", "N_DEPOSIT", "N_LOAN", "N_INVESTMENT", "N_LINE", "DD_AMOUNT", "BONUS_AMOUNT",
    "FIRST_OPEN_DATE", "TOTAL_BALANCE", "AVG_BALANCE", "EARLY_AVG_BALANCE", "LATE_AVG_BALANCE",
    "CREDITS", "DEBITS", "ADB_TXN", "ADB_DAYS", "FT_TXN",
)


def make_feature(**overrides) -> dict:
    """A full grounded PERSON feature row; override any key."""
    row = dict(_BASE)
    row.update(overrides)
    return row


def _feedless(row: dict) -> dict:
    row.update({k: None for k in FEED_KEYS})
    return row


def _build_rows() -> list[dict]:
    rows: list[dict] = []
    n = 0

    def nid() -> str:
        nonlocal n
        n += 1
        return f"001am00000TEST{n:04d}"

    nps_cycle = [(9, "Promoter"), (8, "Passives"), (7, "Passives"), (3, "Detractor"), (10, "Promoter")]
    # 35 PERSON, ages 20-78, Retail / WealthManagement
    for i in range(35):
        age = 20 + round(i * 58 / 34)
        nps, desc = nps_cycle[i % 5]
        r = make_feature(
            ACCOUNT_ID=nid(),
            CLIENT_CATEGORY="Retail" if i % 2 == 0 else "WealthManagement",
            BIRTHDATE=date(2026 - age, 5, 15),
            ANNUAL_INCOME=40000.0 + i * 9500,
            CREDIT_SCORE=630.0 + i * 7,
            NPS_SCORE=nps, NPS_DESCRIPTION=desc, DETRACTOR_12M=desc == "Detractor",
            N_PRODUCTS=1 + i % 6, N_DEPOSIT=1 + i % 3, N_LOAN=i % 2, N_INVESTMENT=i % 3, N_LINE=i % 2,
            DD_AMOUNT=float(1500 + i * 120), BONUS_AMOUNT=float((i % 4) * 50),
            FIRST_OPEN_DATE=date(2010 + i % 15, 1 + i % 12, 10),
            TOTAL_BALANCE=5000.0 + i * 12000, AVG_BALANCE=4800.0 + i * 11500,
            EARLY_AVG_BALANCE=5100.0 + i * 11800, LATE_AVG_BALANCE=4500.0 + i * 11000,
            CREDITS=3000.0 + i * 400, DEBITS=2800.0 + i * 380,
            ADB_TXN=20 + i * 9, ADB_DAYS=30 + i * 11, FT_TXN=10 + i * 5,
            CALLS=i % 9, GONG_WEEKS=i % 6, LAST_CALL_DATE=date(2026, 9, 1 + i % 28),
            NEG_WEEKS=i % 4, VNEG_WEEKS=i % 3,
            RISK_RATING=["Low", "Low", "Medium", "High"][i % 4],
        )
        if i % 3 == 0:
            _feedless(r)
        rows.append(r)

    # 15 BUSINESS
    for i in range(15):
        nps, desc = nps_cycle[i % 5]
        r = make_feature(
            ACCOUNT_ID=nid(), ACCOUNT_TYPE_FLAG="BUSINESS",
            CLIENT_CATEGORY="SmallBusiness" if i % 2 == 0 else "CommercialBanking",
            BIRTHDATE=None, CREDIT_SCORE=None, ANNUAL_INCOME=None,
            ANNUAL_REVENUE=250000.0 + i * 900000,
            NPS_SCORE=nps, NPS_DESCRIPTION=desc, DETRACTOR_12M=desc == "Detractor",
            N_PRODUCTS=2 + i % 5, N_DEPOSIT=1 + i % 3, N_LOAN=1 + i % 2, N_INVESTMENT=i % 2, N_LINE=i % 3,
            DD_AMOUNT=float(8000 + i * 1500), BONUS_AMOUNT=float((i % 3) * 200),
            FIRST_OPEN_DATE=date(2008 + i % 16, 1 + i % 12, 5),
            TOTAL_BALANCE=80000.0 + i * 150000, AVG_BALANCE=75000.0 + i * 140000,
            EARLY_AVG_BALANCE=82000.0 + i * 145000, LATE_AVG_BALANCE=70000.0 + i * 135000,
            CREDITS=40000.0 + i * 9000, DEBITS=38000.0 + i * 8500,
            ADB_TXN=60 + i * 20, ADB_DAYS=90 + i * 15, FT_TXN=40 + i * 8,
            CALLS=i % 7, GONG_WEEKS=i % 5, LAST_CALL_DATE=date(2026, 8, 1 + i % 28),
            NEG_WEEKS=i % 3, VNEG_WEEKS=i % 2,
            RISK_RATING=["Low", "Medium", "High", "Severe"][i % 4],
        )
        if i % 3 == 0:
            _feedless(r)
        rows.append(r)

    # 10 Household (always feed-less; BUSINESS flag with Household category)
    for i in range(10):
        nps, desc = nps_cycle[i % 5]
        r = make_feature(
            ACCOUNT_ID=nid(), ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY="Household",
            BIRTHDATE=None, CREDIT_SCORE=None, ANNUAL_INCOME=150000.0 + i * 40000, ANNUAL_REVENUE=None,
            NPS_SCORE=nps, NPS_DESCRIPTION=desc, DETRACTOR_12M=desc == "Detractor",
            CALLS=i % 5, GONG_WEEKS=i % 4, LAST_CALL_DATE=date(2026, 7, 1 + i * 2),
            NEG_WEEKS=i % 2, VNEG_WEEKS=0, RISK_RATING=["Low", "Medium"][i % 2],
        )
        rows.append(_feedless(r))

    # World-Check hits (>=5) and Severe ratings (>=3)
    for idx, hit in ((1, "SANCTIONS_HIT"), (4, "PEP_HIT"), (7, "ADVERSE_MEDIA_HIT"),
                     (12, "SANCTIONS_HIT"), (20, "PEP_HIT"), (33, "ADVERSE_MEDIA_HIT"), (40, "PEP_HIT")):
        rows[idx][hit] = True
    for idx in (4, 12, 33, 38):
        rows[idx]["RISK_RATING"] = "Severe"
    return rows


@pytest.fixture
def make_feature_factory():
    return make_feature


@pytest.fixture
def feature_rows() -> list[dict]:
    return _build_rows()
