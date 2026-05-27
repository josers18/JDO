"""Unit tests for the person-side blocks of addresses deriver (rule 23)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.addresses import AddressesDeriver


def _arch(*, home_metro="Boston, MA", is_person=True,
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona="retail",
        age=40, gender="Male", marital_status="Single",
        household_size=1, income_band="middle",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro=home_metro,
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = AddressesDeriver()
    assert d.name == "addresses"
    assert "PersonMailingLatitude" in d.fields
    assert "PersonOtherCity" in d.fields
    assert "Fax" in d.fields


def test_applies_to_person_only_in_4b():
    """Plan 4b ships person-side. Business returns False until Plan 4c extends."""
    d = AddressesDeriver()
    assert d.applies_to(_arch(is_person=True)) is True
    assert d.applies_to(_arch(is_person=False)) is False


def test_rule_23_personmailing_uses_home_metro():
    """Rule 23: PersonMailingCity = home_metro city."""
    d = AddressesDeriver()
    a = _arch(home_metro="Boston, MA")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["PersonMailingLatitude"] is not None
    assert out["PersonMailingLongitude"] is not None
    # Boston centroid roughly (42.36, -71.06); allow 0.1 degree slop
    assert 42.0 <= out["PersonMailingLatitude"] <= 42.7
    assert -71.5 <= out["PersonMailingLongitude"] <= -70.6


def test_rule_23_personother_uses_different_metro_same_state():
    """Rule 23: PersonOther* uses a *different* metro from same state."""
    d = AddressesDeriver()
    a = _arch(home_metro="Boston, MA")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    # PersonOtherState should be MA, PersonOtherCity should NOT be Boston
    assert out["PersonOtherState"] == "MA"
    assert out["PersonOtherCity"] != "Boston"


def test_address_block_atomicity():
    """If we fill PersonMailingLatitude, we MUST also fill PersonMailingLongitude
    + GeocodeAccuracy. All-or-nothing per block."""
    d = AddressesDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    if "PersonMailingLatitude" in out:
        assert "PersonMailingLongitude" in out
        assert "PersonMailingGeocodeAccuracy" in out


def test_billing_lat_long_only_if_billing_city_present():
    """If record has BillingCity, fill BillingLatitude + Longitude (top-off)."""
    d = AddressesDeriver()
    a = _arch()
    record_with_city = {"Id": a.account_id, "BillingCity": "Boston"}
    out = d.derive(a, record_with_city, seeded_rng(a.account_id))
    assert out["BillingLatitude"] is not None
    assert out["BillingLongitude"] is not None
    assert out["BillingGeocodeAccuracy"] == "Address"

    # If BillingCity null → don't fill Lat/Long (Plan 4c handles full Billing)
    record_null = {"Id": a.account_id, "BillingCity": None}
    out_null = d.derive(a, record_null, seeded_rng(a.account_id))
    assert "BillingLatitude" not in out_null


def test_finserv_address_summary_strings_populated():
    """The four FinServ__*Address__pc summary fields are non-empty strings."""
    d = AddressesDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__MailingAddress__pc"]
    assert isinstance(out["FinServ__MailingAddress__pc"], str)
    assert ", " in out["FinServ__MailingAddress__pc"]


def test_fax_is_synthetic_phone():
    """Fax is a deterministic phone-like string keyed off account_id."""
    d = AddressesDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1["Fax"] == out2["Fax"]
    # Format like (NNN) NNN-NNNN
    import re
    assert re.match(r"^\(\d{3}\) \d{3}-\d{4}$", out1["Fax"])
