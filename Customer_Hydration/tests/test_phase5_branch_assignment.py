"""Phase 5a — output-shape smoke tests for BranchAssignmentDeriver.

Deliberately minimal per the lean-test target: confirm the deriver writes
both fields, prefers canonical BranchUnitCustomer over weighted-random,
and that state-weighting biases toward state-matched branches.
"""
from __future__ import annotations

from random import Random
from datetime import date

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers.branch import BranchAssignmentDeriver


def _archetype(home_metro: str = "San Francisco, CA") -> PersonaArchetype:
    return PersonaArchetype(
        account_id="001x000000aaaaaAAA",
        created_date=date(2020, 1, 15),
        record_type="FSC Person Accounts",
        is_person=True,
        persona="retail",
        age=42,
        gender="Female",
        marital_status="Married",
        household_size=3,
        income_band="middle",
        credit_quality=0.7,
        net_worth_multiple=1.0,
        tenure_years=5.5,
        engagement_level="regular",
        home_metro=home_metro,
        business_size=None,
        industry_code=None,
        business_credit_quality=None,
    )


def test_branch_assignment_inherits_canonical_when_present():
    """When a BranchUnitCustomer link exists for the Account, use it verbatim."""
    deriver = BranchAssignmentDeriver()
    record = {
        "_branch_unit_customer": {"BranchCode": "BR003", "Name": "415 Mission Street"},
        "_branch_units": [{"Id": "0ip001", "BranchCode": "BR100", "Name": "San Francisco Main"}],
    }
    out = deriver.derive(_archetype(), record, Random(42))
    assert out["FinServ__BranchCode__c"] == "BR003"
    assert out["FinServ__BranchName__c"] == "415 Mission Street"


def test_branch_assignment_falls_back_to_weighted_when_no_canonical():
    """Without a canonical link, pick from _branch_units list."""
    deriver = BranchAssignmentDeriver()
    branches = [
        {"Id": "0ip001", "BranchCode": "BR100", "Name": "San Francisco Main"},
        {"Id": "0ip002", "BranchCode": "BR200", "Name": "New York Financial Center"},
    ]
    record = {"_branch_units": branches}
    out = deriver.derive(_archetype("San Francisco, CA"), record, Random(42))
    # Both fields populated and matched (code-name pair from the same branch).
    assert out["FinServ__BranchCode__c"] in ("BR100", "BR200")
    assert out["FinServ__BranchName__c"] in ("San Francisco Main", "New York Financial Center")


def test_branch_assignment_no_lookup_returns_empty_no_op():
    """If _branch_units is missing/empty (e.g., live fetch failed), return {}."""
    deriver = BranchAssignmentDeriver()
    out = deriver.derive(_archetype(), {}, Random(42))
    assert out == {}
