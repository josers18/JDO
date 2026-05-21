"""Tests for the spec→actual field-name translator."""
from __future__ import annotations

import pytest

from customer_hydration.fieldmap import FieldMap, JDO_FIELDMAP


class TestPhysicalNameTranslation:
    def test_account_personal_demographics_use_pc_shadow(self):
        fm = JDO_FIELDMAP
        assert fm.physical("Account", "FinServ__TotalAnnualIncome__c") == "FinServ__AnnualIncome__pc"
        assert fm.physical("Account", "FinServ__Occupation__c") == "FinServ__Occupation__pc"
        assert fm.physical("Account", "FinServ__MaritalStatus__c") == "FinServ__MaritalStatus__pc"
        assert fm.physical("Account", "FinServ__NumberOfDependents__c") == "FinServ__NumberOfDependents__pc"
        assert fm.physical("Account", "FinServ__Employer__c") == "FinServ__CurrentEmployer__pc"
        assert fm.physical("Account", "FinServ__RiskToleranceLevel__c") == "FinServ__RiskTolerance__c"

    def test_account_unmapped_fields_pass_through(self):
        fm = JDO_FIELDMAP
        assert fm.physical("Account", "FirstName") == "FirstName"
        assert fm.physical("Account", "OwnerId") == "OwnerId"

    def test_account_dropped_fields_return_none(self):
        fm = JDO_FIELDMAP
        assert fm.physical("Account", "FinServ__BankingPreference__c") is None
        assert fm.physical("Account", "FinServ__ClientStatus__c") is None
        assert fm.physical("Account", "LeadSource") is None

    def test_financial_account_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__OpenedDate__c") == "FinServ__OpenDate__c"
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__OwnershipType__c") == "FinServ__Ownership__c"
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__APR__c") == "FinServ__InterestRate__c"
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__MaturityDate__c") == "FinServ__LoanEndDate__c"
        assert fm.physical("FinServ__FinancialAccount__c", "FinServ__ProductCode__c") is None

    def test_card_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__Card__c", "FinServ__CardType__c") == "Card_Type__c"
        assert fm.physical("FinServ__Card__c", "FinServ__CardSubType__c") == "Card_Product__c"
        assert fm.physical("FinServ__Card__c", "FinServ__CardStatus__c") == "Card_Status__c"
        assert fm.physical("FinServ__Card__c", "FinServ__CardNumber__c") == "Card_Number__c"
        assert fm.physical("FinServ__Card__c", "FinServ__ExpirationDate__c") == "FinServ__ValidUntil__c"
        assert fm.physical("FinServ__Card__c", "FinServ__Account__c") == "FinServ__AccountHolder__c"

    def test_holding_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__SecuritySymbol__c") == "FinServ__Symbol__c"
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__SecurityName__c") == "FinServ__Securities__c"
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__Quantity__c") == "FinServ__Shares__c"
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__CurrentPrice__c") == "FinServ__Price__c"
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__CostBasis__c") is None
        assert fm.physical("FinServ__FinancialHolding__c", "FinServ__AcquiredDate__c") is None

    def test_goal_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__FinancialGoal__c", "FinServ__GoalType__c") == "FinServ__Type__c"
        assert fm.physical("FinServ__FinancialGoal__c", "FinServ__TargetAmount__c") == "FinServ__TargetValue__c"
        assert fm.physical("FinServ__FinancialGoal__c", "FinServ__CurrentAmount__c") == "FinServ__ActualValue__c"
        assert fm.physical("FinServ__FinancialGoal__c", "FinServ__Priority__c") is None

    def test_life_event_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__LifeEvent__c", "FinServ__Account__c") == "FinServ__Client__c"
        assert fm.physical("FinServ__LifeEvent__c", "FinServ__Contact__c") is None
        assert fm.physical("FinServ__LifeEvent__c", "FinServ__Status__c") is None

    def test_role_field_renames(self):
        fm = JDO_FIELDMAP
        assert fm.physical("FinServ__FinancialAccountRole__c", "FinServ__Account__c") == "FinServ__RelatedAccount__c"
        assert fm.physical("FinServ__FinancialAccountRole__c", "FinServ__Contact__c") == "FinServ__RelatedContact__c"


class TestPicklistValueTranslation:
    def test_financial_account_type_logical_to_physical(self):
        fm = JDO_FIELDMAP
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Checking") == "Deposits"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Savings") == "Deposits"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Mortgage") == "Loans"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "HELOC") == "Loans"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Credit Card") == "Credit Cards"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Brokerage") == "Investments"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "IRA") == "Investments"

    def test_financial_account_status_default(self):
        fm = JDO_FIELDMAP
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__Status__c", "Active") == "Open"
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__Status__c", "Closed") == "Closed"

    def test_unknown_logical_value_passes_through(self):
        fm = JDO_FIELDMAP
        assert fm.picklist_value("FinServ__FinancialAccount__c", "FinServ__Ownership__c", "Joint") == "Joint"


class TestApplyToRow:
    def test_apply_renames_keys_and_drops_none(self):
        fm = JDO_FIELDMAP
        row = {
            "FirstName": "Alice",
            "FinServ__TotalAnnualIncome__c": 100000,
            "FinServ__BankingPreference__c": "Mobile",
            "FinServ__Occupation__c": "Engineer",
        }
        physical = fm.apply("Account", row)
        assert physical == {
            "FirstName": "Alice",
            "FinServ__AnnualIncome__pc": 100000,
            "FinServ__Occupation__pc": "Engineer",
        }
        assert "FinServ__BankingPreference__c" not in physical
