"""Per-dataset pytest config — Plan 4 is non-account-scoped, so it does NOT
import SAMPLE_ANCHORS from Snowflake_Cumulus_Common. Instead, this file
provides a synthetic 30-ZIP fixture covering 8 states and all 4 urbanicity
tiers, with realistic customer counts."""
import pytest


# 30 ZIPs across 8 states, urbanicity-balanced.
# Tuple shape: (zip, state, country, customer_count)
SAMPLE_ZIPS = [
    # Urban Core — high-customer-count, NE/CA/IL/DC
    ("10001", "NY", "US", 850),
    ("10025", "NY", "US", 720),
    ("94110", "CA", "US", 940),
    ("94105", "CA", "US", 880),
    ("02134", "MA", "US", 510),
    ("60614", "IL", "US", 690),
    ("20001", "DC", "US", 420),
    # Suburban — moderate counts, varied states
    ("07030", "NJ", "US", 320),
    ("11030", "NY", "US", 280),
    ("94027", "CA", "US", 410),
    ("60201", "IL", "US", 240),
    ("02446", "MA", "US", 350),
    ("75024", "TX", "US", 290),
    ("30339", "GA", "US", 220),
    # Small Town — lower counts
    ("80211", "CO", "US", 95),
    ("85003", "AZ", "US", 130),
    ("78704", "TX", "US", 145),
    ("30309", "GA", "US", 110),
    ("48226", "MI", "US", 75),
    ("32801", "FL", "US", 88),
    ("37203", "TN", "US", 105),
    # Rural — very low counts
    ("59001", "MT", "US", 12),
    ("83001", "WY", "US", 8),
    ("57001", "SD", "US", 15),
    ("58001", "ND", "US", 10),
    ("99701", "AK", "US", 6),
    ("97601", "OR", "US", 22),
    # Edge cases
    ("99999", "MT", "US", 1),  # Single-customer rural ZIP
    ("90210", "CA", "US", 1100),  # Iconic high-customer Urban Core
    ("12345", "NY", "US", 0),  # Zero-customer ZIP — edge case (rare in practice)
]


@pytest.fixture
def all_zips():
    """30 synthetic ZIPs across 8 states and 4 urbanicity tiers."""
    return SAMPLE_ZIPS


@pytest.fixture
def urban_zips(all_zips):
    """ZIPs whose first digit is 0/1/9 AND state is in NY/CA/MA/IL/DC."""
    urban_states = {"NY", "CA", "MA", "IL", "DC"}
    return [z for z in all_zips if z[0][0] in ("0", "1", "9") and z[1] in urban_states]


@pytest.fixture
def rural_zips(all_zips):
    """ZIPs in MT/WY/AK/ND/SD."""
    rural_states = {"MT", "WY", "AK", "ND", "SD"}
    return [z for z in all_zips if z[1] in rural_states]


@pytest.fixture
def high_income_state_zips(all_zips):
    """MA + NJ ZIPs (highest base income tier)."""
    return [z for z in all_zips if z[1] in ("MA", "NJ")]


@pytest.fixture
def low_income_state_zips(all_zips):
    """TN + MO + IN ZIPs."""  # Note: MO/IN may not be in fixture; TN is
    return [z for z in all_zips if z[1] in ("TN", "MO", "IN")]
