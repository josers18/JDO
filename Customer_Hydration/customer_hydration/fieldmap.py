"""Spec→actual field-name and picklist-value translator.

The Customer_Hydration spec was written against an idealized FSC schema.
This org (jdo-fw51xz) has subtly different field names and a stricter
picklist surface. Generators emit "logical" names matching the spec; this
module translates them to "physical" names the org actually accepts. The
CSV writer's preflight-driven field-drop is the second layer of defense.

When the org schema changes, this is the ONLY file that should need
updates — generators and tests stay schema-agnostic.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


_FIELD_RENAMES: dict[str, dict[str, Optional[str]]] = {
    "Account": {
        "FinServ__TotalAnnualIncome__c": "FinServ__AnnualIncome__pc",
        "FinServ__Occupation__c": "FinServ__Occupation__pc",
        "FinServ__MaritalStatus__c": "FinServ__MaritalStatus__pc",
        "FinServ__NumberOfDependents__c": "FinServ__NumberOfDependents__pc",
        "FinServ__Employer__c": "FinServ__CurrentEmployer__pc",
        "FinServ__YearsWithEmployer__c": None,
        "FinServ__RiskToleranceLevel__c": "FinServ__RiskTolerance__c",
        "FinServ__BankingPreference__c": None,
        "FinServ__ClientStatus__c": None,
        "LeadSource": None,
    },
    "FinServ__FinancialAccount__c": {
        "FinServ__OpenedDate__c": "FinServ__OpenDate__c",
        "FinServ__OwnershipType__c": "FinServ__Ownership__c",
        "FinServ__APR__c": "FinServ__InterestRate__c",
        "FinServ__MaturityDate__c": "FinServ__LoanEndDate__c",
        "FinServ__Branch__c": "FinServ__BranchName__c",
        "FinServ__ProductCode__c": None,
    },
    "FinServ__FinancialAccountRole__c": {
        "FinServ__Account__c": "FinServ__RelatedAccount__c",
        "FinServ__Contact__c": "FinServ__RelatedContact__c",
    },
    "FinServ__Card__c": {
        "FinServ__CardType__c": "Card_Type__c",
        "FinServ__CardSubType__c": "Card_Product__c",
        "FinServ__CardStatus__c": "Card_Status__c",
        "FinServ__CardNumber__c": "Card_Number__c",
        "FinServ__ExpirationDate__c": "FinServ__ValidUntil__c",
        "FinServ__CreditLimit__c": None,
        "FinServ__Balance__c": None,
        "FinServ__Account__c": "FinServ__AccountHolder__c",
    },
    "FinServ__FinancialHolding__c": {
        "FinServ__SecuritySymbol__c": "FinServ__Symbol__c",
        "FinServ__SecurityName__c": "FinServ__Securities__c",
        "FinServ__Quantity__c": "FinServ__Shares__c",
        "FinServ__CurrentPrice__c": "FinServ__Price__c",
        "FinServ__CostBasis__c": None,
        "FinServ__AcquiredDate__c": None,
    },
    "FinServ__FinancialGoal__c": {
        "FinServ__GoalType__c": "FinServ__Type__c",
        "FinServ__TargetAmount__c": "FinServ__TargetValue__c",
        "FinServ__CurrentAmount__c": "FinServ__ActualValue__c",
        "FinServ__Priority__c": None,
    },
    "FinServ__LifeEvent__c": {
        "FinServ__Account__c": "FinServ__Client__c",
        "FinServ__Contact__c": None,
        "FinServ__Status__c": None,
    },
}


_PICKLIST_VALUES: dict[tuple[str, str], dict[str, str]] = {
    ("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c"): {
        "Checking": "Deposits",
        "Savings": "Deposits",
        "HYSA": "Deposits",
        "Money Market": "Deposits",
        "CD": "Deposits",
        "Mortgage": "Loans",
        "HELOC": "Loans",
        "Auto Loan": "Loans",
        "Personal Loan": "Loans",
        "Term Loan": "Loans",
        "SBA Loan": "Loans",
        "Credit Card": "Credit Cards",
        "Brokerage": "Investments",
        "Managed Advisory": "Investments",
        "IRA": "Investments",
        "Roth IRA": "Investments",
        "529": "Investments",
        "Trust Account": "Investments",
        "Premier Checking": "Deposits",
        "Business Checking": "Deposits",
        "Lockbox": "Treasury Management",
        "Sweep": "Treasury Management",
        "ZBA": "Treasury Management",
        "Positive Pay": "Treasury Management",
        "Wire Transfer": "Treasury Management",
        "ACH": "Treasury Management",
        "Merchant Services": "Merchant Services",
    },
    ("FinServ__FinancialAccount__c", "FinServ__Status__c"): {
        "Active": "Open",
    },
}


@dataclass
class FieldMap:
    """Translate logical (spec) names to physical (org-actual) names."""

    renames: dict[str, dict[str, Optional[str]]] = field(default_factory=dict)
    picklist_values: dict[tuple[str, str], dict[str, str]] = field(default_factory=dict)

    def physical(self, sobject: str, logical_field: str) -> Optional[str]:
        """Return the physical field name, or None if the field is dropped."""
        sobject_renames = self.renames.get(sobject, {})
        if logical_field in sobject_renames:
            return sobject_renames[logical_field]
        return logical_field

    def picklist_value(self, sobject: str, fieldname: str, logical_value: str) -> str:
        """Translate a logical picklist value to the org-accepted value."""
        mapping = self.picklist_values.get((sobject, fieldname), {})
        return mapping.get(logical_value, logical_value)

    def apply(self, sobject: str, row: dict) -> dict:
        """Translate every key in `row` from logical to physical names."""
        result: dict = {}
        for logical_key, value in row.items():
            physical_key = self.physical(sobject, logical_key)
            if physical_key is None:
                continue
            result[physical_key] = value
        return result


JDO_FIELDMAP = FieldMap(
    renames=_FIELD_RENAMES,
    picklist_values=_PICKLIST_VALUES,
)
