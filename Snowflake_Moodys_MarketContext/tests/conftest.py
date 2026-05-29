"""Per-dataset pytest config — Plan 13 deviates from Plans 1-8.

**Instrument-scoped, NOT account-scoped.** No V_ACCOUNT_ANCHORS read; no
SAMPLE_ANCHORS import from Snowflake_Cumulus_Common. Plan 13 reads
`FINS.PUBLIC.INSTRUMENT_UNIVERSE` (TICKER + INSTRUMENT_NAME + SECTOR +
BASE_PRICE; 2,004 live rows; no IS_ACTIVE column → every row is in audience).

The L1 fixture below is a synthetic 10-instrument set covering the major
SECTOR values used by `_SECTOR_RATING_BIAS` plus two edge cases:
  - `UNKN`: SECTOR=None — exercises the `_DEFAULT_RATING_BIAS` fallback.
  - `TINY`: BASE_PRICE=$2.50 — exercises the FIFTY_TWO_WEEK sanity floor.

Every instrument is in audience by definition (Plan 13 has no
`_anchor_in_audience` predicate); `in_audience_instruments` returns all 10.
"""
import pytest


# 10-instrument synthetic fixture mirroring the live INSTRUMENT_UNIVERSE
# schema (TICKER, INSTRUMENT_NAME, SECTOR, BASE_PRICE). 8 sectors + 2 edges.
INSTRUMENT_FIXTURES = [
    {"TICKER": "AAPL", "INSTRUMENT_NAME": "Apple Inc",         "SECTOR": "Technology",  "BASE_PRICE": 175.50},
    {"TICKER": "JPM",  "INSTRUMENT_NAME": "JPMorgan Chase",    "SECTOR": "Financials",  "BASE_PRICE": 195.20},
    {"TICKER": "JNJ",  "INSTRUMENT_NAME": "Johnson & Johnson", "SECTOR": "Healthcare",  "BASE_PRICE": 152.10},
    {"TICKER": "XOM",  "INSTRUMENT_NAME": "ExxonMobil",        "SECTOR": "Energy",      "BASE_PRICE": 110.40},
    {"TICKER": "DUK",  "INSTRUMENT_NAME": "Duke Energy",       "SECTOR": "Utilities",   "BASE_PRICE":  95.30},
    {"TICKER": "PG",   "INSTRUMENT_NAME": "Procter & Gamble",  "SECTOR": "Consumer",    "BASE_PRICE": 168.70},
    {"TICKER": "GE",   "INSTRUMENT_NAME": "General Electric",  "SECTOR": "Industrials", "BASE_PRICE": 165.20},
    {"TICKER": "HUGE", "INSTRUMENT_NAME": "HugeCorp",          "SECTOR": "Financials",  "BASE_PRICE": 980.00},
    # Edge cases:
    {"TICKER": "TINY", "INSTRUMENT_NAME": "TinyCorp",          "SECTOR": "Technology",  "BASE_PRICE":   2.50},
    {"TICKER": "UNKN", "INSTRUMENT_NAME": "UnknownCo",         "SECTOR": None,          "BASE_PRICE":  50.00},
]


@pytest.fixture
def all_instruments():
    """The full 10-instrument synthetic fixture."""
    return list(INSTRUMENT_FIXTURES)


@pytest.fixture
def in_audience_instruments(all_instruments):
    """Plan 13 audience: ALL instruments (no predicate). Returns the full
    10-instrument fixture unchanged — every instrument in INSTRUMENT_UNIVERSE
    is in audience by definition (no IS_ACTIVE column, no other filter)."""
    return list(all_instruments)
