"""Unit tests for the B2B branch of addresses deriver (rule 23)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.addresses import AddressesDeriver


def _arch_business(*, home_metro="Boston, MA",
                   account_id="001xx000000BIZ01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2017, 1, 15),
        record_type="Business", is_person=False, persona="commercial",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro=home_metro,
        business_size="mid", industry_code="522110",
        business_credit_quality=0.7,
    )


def test_applies_to_business_returns_true():
    d = AddressesDeriver()
    assert d.applies_to(_arch_business()) is True


def test_business_branch_skips_person_address_blocks():
    """Person-only blocks (PersonMailing*, PersonOther*) MUST NOT appear for B2B."""
    d = AddressesDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    for f in (
        "PersonMailingLatitude", "PersonMailingLongitude", "PersonMailingGeocodeAccuracy",
        "PersonOtherCity", "PersonOtherState", "PersonOtherCountry",
        "PersonOtherPostalCode", "PersonOtherStreet", "PersonOtherPhone",
        "PersonOtherLatitude", "PersonOtherLongitude", "PersonOtherGeocodeAccuracy",
    ):
        assert f not in out, f"B2B output should not contain person-only field {f}"


def test_business_billing_block_atomic():
    """Full Billing block: City + State + Country + PostalCode + Street populated together."""
    d = AddressesDeriver()
    a = _arch_business(home_metro="Boston, MA")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "BillingCity" in out
    assert "BillingState" in out
    assert "BillingCountry" in out
    assert "BillingPostalCode" in out
    assert "BillingStreet" in out
    # All-or-nothing: BillingLat/Long/GeocodeAccuracy also present
    assert "BillingLatitude" in out
    assert "BillingLongitude" in out
    assert out["BillingGeocodeAccuracy"] == "Address"
    # Boston, MA convention
    assert out["BillingCity"] == "Boston"
    assert out["BillingState"] == "MA"
    assert out["BillingCountry"] == "United States"


def test_business_shipping_block_atomic():
    """Full Shipping block populated together."""
    d = AddressesDeriver()
    a = _arch_business(home_metro="Boston, MA")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    for f in (
        "ShippingCity", "ShippingState", "ShippingCountry", "ShippingPostalCode",
        "ShippingStreet", "ShippingLatitude", "ShippingLongitude",
        "ShippingGeocodeAccuracy",
    ):
        assert f in out, f"Shipping field {f} missing from B2B output"


def test_rule_23_business_billing_uses_home_metro():
    """Billing City/State match archetype.home_metro for B2B."""
    d = AddressesDeriver()
    a = _arch_business(home_metro="Chicago, IL")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["BillingCity"] == "Chicago"
    assert out["BillingState"] == "IL"


def test_existing_billing_city_not_overwritten():
    """If record has BillingCity, deriver doesn't propose a new one."""
    d = AddressesDeriver()
    a = _arch_business()
    record = {"Id": a.account_id, "BillingCity": "Existing City"}
    out = d.derive(a, record, seeded_rng(a.account_id))
    assert "BillingCity" not in out


def test_business_fax_still_populated():
    """Fax is account-wide (both branches)."""
    d = AddressesDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    import re
    assert re.match(r"^\(\d{3}\) \d{3}-\d{4}$", out["Fax"])


def test_business_finserv_address_summary_strings():
    """Summary strings (Billing/Mailing/Other/Shipping Address__pc) populated."""
    d = AddressesDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__BillingAddress__pc"]
    assert out["FinServ__ShippingAddress__pc"]
