"""addresses deriver — Person Mailing/Other blocks + Billing lat/long top-off + summaries.

Plan 4b ships the person-side blocks. Plan 4c extends with Shipping* and the
full Billing block. See spec §4.4 row 'addresses.py' and §4.2 rule 23.
"""
from __future__ import annotations

import hashlib
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype


# Approximate metro centroids (lat, lon) for the 50-city pool used by archetype.
# We only enumerate cities the archetype's _pick_metro can pick. Lookup defaults
# to a generic centroid if a city is unknown.
_METRO_CENTROIDS: dict[str, tuple[float, float]] = {
    "Boston, MA":          (42.36, -71.06),
    "New York, NY":         (40.71, -74.01),
    "Los Angeles, CA":      (34.05, -118.24),
    "Chicago, IL":          (41.88, -87.63),
    "Houston, TX":          (29.76, -95.37),
    "Phoenix, AZ":          (33.45, -112.07),
    "Philadelphia, PA":     (39.95, -75.17),
    "San Antonio, TX":      (29.42, -98.49),
    "San Diego, CA":        (32.72, -117.16),
    "Dallas, TX":           (32.78, -96.80),
    "San Jose, CA":         (37.34, -121.89),
    "Austin, TX":           (30.27, -97.74),
    "Jacksonville, FL":     (30.33, -81.66),
    "Fort Worth, TX":       (32.76, -97.33),
    "Columbus, OH":         (39.96, -83.00),
    "Charlotte, NC":        (35.23, -80.84),
    "San Francisco, CA":    (37.77, -122.42),
    "Indianapolis, IN":     (39.77, -86.16),
    "Seattle, WA":          (47.61, -122.33),
    "Denver, CO":           (39.74, -104.99),
    "Washington, DC":       (38.91, -77.04),
    "El Paso, TX":          (31.76, -106.49),
    "Nashville, TN":        (36.16, -86.78),
    "Detroit, MI":          (42.33, -83.05),
    "Oklahoma City, OK":    (35.47, -97.52),
    "Portland, OR":         (45.51, -122.68),
    "Las Vegas, NV":        (36.17, -115.14),
    "Memphis, TN":          (35.15, -90.05),
    "Louisville, KY":       (38.25, -85.76),
    "Baltimore, MD":        (39.29, -76.61),
    "Milwaukee, WI":        (43.04, -87.91),
    "Albuquerque, NM":      (35.08, -106.65),
    "Tucson, AZ":           (32.22, -110.93),
    "Fresno, CA":           (36.74, -119.79),
    "Sacramento, CA":       (38.58, -121.49),
    "Mesa, AZ":             (33.42, -111.83),
    "Kansas City, MO":      (39.10, -94.58),
    "Atlanta, GA":          (33.75, -84.39),
    "Long Beach, CA":       (33.77, -118.19),
    "Colorado Springs, CO": (38.83, -104.82),
    "Raleigh, NC":          (35.78, -78.64),
    "Miami, FL":            (25.76, -80.19),
    "Virginia Beach, VA":   (36.85, -75.98),
    "Omaha, NE":            (41.26, -95.93),
    "Oakland, CA":          (37.80, -122.27),
    "Minneapolis, MN":      (44.98, -93.27),
    "Tulsa, OK":            (36.15, -95.99),
    "Arlington, TX":        (32.74, -97.11),
    "New Orleans, LA":      (29.95, -90.07),
    "Wichita, KS":          (37.69, -97.34),
}


# Same-state alternates for the work-address (PersonOther*) — rule 23.
# Each entry: home metro → another metro in the same state.
_SAME_STATE_ALT: dict[str, str] = {
    "Boston, MA":     "Cambridge, MA",
    "New York, NY":   "Albany, NY",
    "Los Angeles, CA": "San Francisco, CA",
    "Chicago, IL":    "Springfield, IL",
    "Houston, TX":    "Austin, TX",
    "Phoenix, AZ":    "Tucson, AZ",
    "San Diego, CA":  "Los Angeles, CA",
    "Dallas, TX":     "Fort Worth, TX",
    "Austin, TX":     "San Antonio, TX",
    "Charlotte, NC":  "Raleigh, NC",
    "San Francisco, CA": "Oakland, CA",
    "Seattle, WA":    "Spokane, WA",
    "Denver, CO":     "Colorado Springs, CO",
    "Atlanta, GA":    "Savannah, GA",
    "Miami, FL":      "Jacksonville, FL",
}


def _split_metro(metro: str) -> tuple[str, str]:
    """'Boston, MA' → ('Boston', 'MA')."""
    parts = metro.rsplit(", ", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return metro, ""


def _alt_in_same_state(home_metro: str, account_id: str) -> str:
    """Pick a same-state work address, falling back to home_city + ' Office'."""
    if home_metro in _SAME_STATE_ALT:
        return _SAME_STATE_ALT[home_metro]
    city, state = _split_metro(home_metro)
    # Fallback: synthetic "<City> Heights, <State>" based on hash
    digest = hashlib.sha256(("alt:" + account_id).encode()).digest()
    suffixes = ["Heights", "Park", "Hills", "Plaza", "Center"]
    suffix = suffixes[int.from_bytes(digest[:2], "big") % len(suffixes)]
    return f"{city} {suffix}, {state}"


def _jitter_lat_long(centroid: tuple[float, float], rng: Random) -> tuple[float, float]:
    """Produce a lat/long within 0.05 degrees of centroid."""
    lat, lon = centroid
    return (
        round(lat + rng.uniform(-0.05, 0.05), 4),
        round(lon + rng.uniform(-0.05, 0.05), 4),
    )


def _synth_phone(account_id: str, prefix: str) -> str:
    """Generate a deterministic phone-like string keyed off account_id."""
    digest = hashlib.sha256((prefix + account_id).encode()).digest()
    n = int.from_bytes(digest[:6], "big")
    area = 200 + (n % 800)
    middle = (n >> 16) % 1000
    last = (n >> 8) % 10_000
    return f"({area:03d}) {middle:03d}-{last:04d}"


_STREET_NUMBER_POOL = [12, 47, 102, 245, 488, 731, 1100, 1505, 2014, 3287]
_STREET_NAME_POOL = [
    "Maple", "Oak", "Pine", "Cedar", "Elm", "Walnut", "Chestnut", "Birch",
    "Sycamore", "Willow",
]
_STREET_TYPE_POOL = ["St", "Ave", "Blvd", "Rd", "Ln", "Way"]


def _synth_street(account_id: str, prefix: str) -> str:
    """Synthesize a deterministic street address from account_id."""
    digest = hashlib.sha256((prefix + account_id).encode()).digest()
    num = _STREET_NUMBER_POOL[digest[0] % len(_STREET_NUMBER_POOL)]
    name = _STREET_NAME_POOL[digest[1] % len(_STREET_NAME_POOL)]
    typ = _STREET_TYPE_POOL[digest[2] % len(_STREET_TYPE_POOL)]
    return f"{num} {name} {typ}"


_POSTAL_BASES = {
    "MA": "021", "NY": "100", "CA": "900", "IL": "606", "TX": "770",
    "AZ": "850", "PA": "191", "OH": "432", "NC": "282", "WA": "981",
    "CO": "802", "DC": "200", "TN": "372", "MI": "482", "OK": "731",
    "OR": "972", "NV": "891", "KY": "402", "MD": "212", "WI": "532",
    "NM": "871", "MO": "641", "GA": "303", "FL": "331", "VA": "234",
    "NE": "681", "MN": "554", "LA": "701", "KS": "672", "IN": "462",
}


def _synth_postal(state: str, account_id: str) -> str:
    """Postal code starting with state's typical prefix."""
    base = _POSTAL_BASES.get(state, "100")
    digest = hashlib.sha256(("zip:" + account_id).encode()).digest()
    suffix = int.from_bytes(digest[:2], "big") % 100
    return f"{base}{suffix:02d}"


class AddressesDeriver:
    """Plan 4b: person-side address blocks. Plan 4c extends with Shipping + full Billing."""

    name = "addresses"
    fields = [
        "PersonMailingLatitude",
        "PersonMailingLongitude",
        "PersonMailingGeocodeAccuracy",
        "PersonOtherCity",
        "PersonOtherState",
        "PersonOtherCountry",
        "PersonOtherPostalCode",
        "PersonOtherStreet",
        "PersonOtherPhone",
        "PersonOtherLatitude",
        "PersonOtherLongitude",
        "PersonOtherGeocodeAccuracy",
        "BillingLatitude",
        "BillingLongitude",
        "BillingGeocodeAccuracy",
        "Fax",
        "FinServ__BillingAddress__pc",
        "FinServ__MailingAddress__pc",
        "FinServ__OtherAddress__pc",
        "FinServ__ShippingAddress__pc",
        # Plan 4c B2B fields
        "BillingCity",
        "BillingState",
        "BillingCountry",
        "BillingPostalCode",
        "BillingStreet",
        "ShippingCity",
        "ShippingState",
        "ShippingCountry",
        "ShippingPostalCode",
        "ShippingStreet",
        "ShippingLatitude",
        "ShippingLongitude",
        "ShippingGeocodeAccuracy",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return True

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        home_centroid = _METRO_CENTROIDS.get(archetype.home_metro, (40.0, -100.0))
        home_city, home_state = _split_metro(archetype.home_metro)

        # Fax is common to both branches
        out["Fax"] = _synth_phone(archetype.account_id, "fax:")

        if archetype.is_person:
            # PersonMailing block — atomic
            m_lat, m_lon = _jitter_lat_long(home_centroid, rng)
            out["PersonMailingLatitude"] = m_lat
            out["PersonMailingLongitude"] = m_lon
            out["PersonMailingGeocodeAccuracy"] = "Address"

            # PersonOther block — different metro, same state — atomic
            alt_metro = _alt_in_same_state(archetype.home_metro, archetype.account_id)
            alt_city, alt_state = _split_metro(alt_metro)
            alt_centroid = _METRO_CENTROIDS.get(alt_metro, home_centroid)
            o_lat, o_lon = _jitter_lat_long(alt_centroid, rng)
            out["PersonOtherCity"] = alt_city
            out["PersonOtherState"] = alt_state
            out["PersonOtherCountry"] = "United States"
            out["PersonOtherPostalCode"] = _synth_postal(alt_state, archetype.account_id)
            out["PersonOtherStreet"] = _synth_street(archetype.account_id, "other:")
            out["PersonOtherPhone"] = _synth_phone(archetype.account_id, "phone:")
            out["PersonOtherLatitude"] = o_lat
            out["PersonOtherLongitude"] = o_lon
            out["PersonOtherGeocodeAccuracy"] = "Address"

            # Billing lat/long top-off (only when BillingCity already populated)
            if record.get("BillingCity") is not None:
                b_lat, b_lon = _jitter_lat_long(home_centroid, rng)
                out["BillingLatitude"] = b_lat
                out["BillingLongitude"] = b_lon
                out["BillingGeocodeAccuracy"] = "Address"

            # FinServ__*Address__pc summary strings
            mailing_street = _synth_street(archetype.account_id, "mail:")
            mailing_postal = _synth_postal(home_state, archetype.account_id)
            mailing_summary = f"{mailing_street}, {home_city}, {home_state} {mailing_postal}"
            other_summary = (
                f"{out['PersonOtherStreet']}, {alt_city}, {alt_state} "
                f"{out['PersonOtherPostalCode']}"
            )
            out["FinServ__MailingAddress__pc"] = mailing_summary
            out["FinServ__BillingAddress__pc"] = mailing_summary
            out["FinServ__OtherAddress__pc"] = other_summary
            out["FinServ__ShippingAddress__pc"] = mailing_summary

            return out

        # B2B branch — full Billing + Shipping blocks rooted in home_metro.
        billing_postal = _synth_postal(home_state, archetype.account_id)
        billing_street = _synth_street(archetype.account_id, "biz_bill:")

        if record.get("BillingCity") is None:
            # Full Billing block (rule 23)
            out["BillingCity"] = home_city
            out["BillingState"] = home_state
            out["BillingCountry"] = "United States"
            out["BillingPostalCode"] = billing_postal
            out["BillingStreet"] = billing_street
            b_lat, b_lon = _jitter_lat_long(home_centroid, rng)
            out["BillingLatitude"] = b_lat
            out["BillingLongitude"] = b_lon
            out["BillingGeocodeAccuracy"] = "Address"
        else:
            # Existing BillingCity → only top off lat/long
            b_lat, b_lon = _jitter_lat_long(home_centroid, rng)
            out["BillingLatitude"] = b_lat
            out["BillingLongitude"] = b_lon
            out["BillingGeocodeAccuracy"] = "Address"

        # Shipping — same as Billing (most B2B accounts share addresses)
        if record.get("ShippingCity") is None:
            out["ShippingCity"] = home_city
            out["ShippingState"] = home_state
            out["ShippingCountry"] = "United States"
            out["ShippingPostalCode"] = billing_postal
            out["ShippingStreet"] = billing_street
            s_lat, s_lon = _jitter_lat_long(home_centroid, rng)
            out["ShippingLatitude"] = s_lat
            out["ShippingLongitude"] = s_lon
            out["ShippingGeocodeAccuracy"] = "Address"

        # Summary strings — formula-style "Street, City, State Postal"
        billing_summary = f"{billing_street}, {home_city}, {home_state} {billing_postal}"
        out["FinServ__BillingAddress__pc"] = billing_summary
        out["FinServ__ShippingAddress__pc"] = billing_summary
        # Mailing/Other not applicable to B2B; leave null

        return out
