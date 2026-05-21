"""Tests for the retail persona generator."""
from __future__ import annotations

from datetime import date

import pytest

from customer_hydration.generators.retail import generate_retail


JUSTIN_CHEN_USER_ID = "005am000003PbFBAA0"
STANDARD_USER_ID = "005am000006ffBpAAI"
RM_POOL = [JUSTIN_CHEN_USER_ID, STANDARD_USER_ID]


@pytest.fixture
def gen_kwargs(anchor_date, fixed_seed):
    return {
        "n": 50,
        "seed": fixed_seed,
        "starting_seq": 1,
        "rm_user_ids": RM_POOL,
        "anchor_date": anchor_date,
        "person_account_rt_id": "012am000004x9TBAAY",  # FSC_Person_Accounts in jdo-fw51xz
        "checking_product_code": "PD-CHK-EVD-2026.04",
    }


class TestGenerateRetail:
    def test_returns_one_account_with_checking_and_optional_savings_per_customer(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        # 50 accounts, 50 checking + a probabilistic Savings (~60%) per account.
        assert len(bundle.accounts) == 50
        # Every account has at least the checking FA + role; Savings is optional.
        assert len(bundle.financial_accounts) >= 50
        assert len(bundle.financial_account_roles) == len(bundle.financial_accounts)

    def test_external_ids_are_sequential_and_zero_padded(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        ids = [a["External_ID__c"] for a in bundle.accounts]
        assert ids[0] == "HYDRATE-RT-000001"
        assert ids[-1] == "HYDRATE-RT-000050"
        assert all(len(i.split("-")[-1]) == 6 for i in ids)

    def test_external_ids_respect_starting_seq(self, gen_kwargs):
        gen_kwargs["starting_seq"] = 7421
        bundle = generate_retail(**gen_kwargs)
        assert bundle.accounts[0]["External_ID__c"] == "HYDRATE-RT-007421"

    def test_owner_ids_are_drawn_from_rm_pool_only(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        owners = {a["OwnerId"] for a in bundle.accounts}
        assert owners.issubset(set(RM_POOL))

    def test_record_type_is_person_account(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        assert all(a["RecordTypeId"] == "012am000004x9TBAAY" for a in bundle.accounts)

    def test_lead_source_dropped_by_fieldmap(self, gen_kwargs):
        # LeadSource is not exposed on Account in this org's FSC version, so
        # the fieldmap drops it. Generator must NOT emit it.
        bundle = generate_retail(**gen_kwargs)
        assert all("LeadSource" not in a for a in bundle.accounts)

    def test_client_category_retail(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        assert all(a["FinServ__ClientCategory__c"] == "Retail" for a in bundle.accounts)

    def test_age_distribution_in_22_80(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        anchor = gen_kwargs["anchor_date"]
        for acct in bundle.accounts:
            birthdate = date.fromisoformat(acct["PersonBirthdate"])
            age = (anchor - birthdate).days // 365
            assert 22 <= age <= 80

    def test_household_income_in_range_pc_field(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for acct in bundle.accounts:
            income = acct["FinServ__AnnualIncome__pc"]
            assert 35000 <= income <= 180000

    def test_fa_external_ids_are_sequential(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        fa_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts]
        assert fa_ids[0] == "HYDRATE-FA-000001"
        assert fa_ids[-1] == "HYDRATE-FA-000050"

    def test_fa_links_to_account_via_external_id_reference(self, gen_kwargs):
        """The FA CSV column must use the Bulk API 2.0 external-id reference
        syntax FinServ__PrimaryOwner__r.External_ID__c — but the generator
        emits the raw HYDRATE-RT-* external id; the loader rewrites the
        column header to the reference syntax. Here we just confirm every FA
        (checking AND savings) points back to one of the emitted accounts."""
        bundle = generate_retail(**gen_kwargs)
        account_ext_ids = {a["External_ID__c"] for a in bundle.accounts}
        for fa in bundle.financial_accounts:
            assert fa["FinServ__PrimaryOwner__c"] in account_ext_ids

    def test_checking_fa_uses_deposits_picklist_and_drops_product_code(self, gen_kwargs):
        # FinServ__FinancialAccountType__c "Checking" is mapped to the org's
        # actual picklist value "Deposits" via fieldmap. ProductCode__c does
        # not exist on this org's FA object — it's encoded in
        # FinancialAccountSource__c instead and dropped by fieldmap.
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            if "Checking" in fa["Name"]:
                assert fa["FinServ__FinancialAccountType__c"] == "Deposits"
                assert "FinServ__ProductCode__c" not in fa
                assert fa["FinServ__FinancialAccountSource__c"] == "Cumulus:PD-CHK-EVD-2026.04"

    def test_fa_balance_in_expected_ranges_per_product(self, gen_kwargs):
        # Checking: 500-8000. Savings: 500-25000.
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            if "Checking" in fa["Name"]:
                assert 500 <= fa["FinServ__Balance__c"] <= 8000
            elif "Savings" in fa["Name"]:
                assert 500 <= fa["FinServ__Balance__c"] <= 25000

    def test_role_links_account_to_fa_with_primary_owner(self, gen_kwargs):
        # Plan 2 added optional Savings FAs interleaved per customer, so we
        # can no longer zip by index. Instead, assert every role still
        # carries External_ID__c, FinServ__RelatedAccount__c, the
        # "Primary Owner" role, and Active=True (the Plan 1 retroactive-fix
        # contract), and that each role binds an emitted FA to an emitted
        # Account.
        bundle = generate_retail(**gen_kwargs)
        fa_ext_ids = {fa["External_ID__c"] for fa in bundle.financial_accounts}
        account_ext_ids = {a["External_ID__c"] for a in bundle.accounts}
        for role in bundle.financial_account_roles:
            assert "External_ID__c" in role
            assert role["FinServ__FinancialAccount__c"] in fa_ext_ids
            assert role["FinServ__RelatedAccount__c"] in account_ext_ids
            assert role["FinServ__Role__c"] == "Primary Owner"
            assert role["FinServ__Active__c"] is True

    def test_account_emits_pc_shadow_demographic_fields(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for acct in bundle.accounts:
            assert "FinServ__Occupation__pc" in acct
            assert "FinServ__MaritalStatus__pc" in acct
            assert "FinServ__NumberOfDependents__pc" in acct
            assert "FinServ__CurrentEmployer__pc" in acct

    def test_account_does_not_emit_dropped_fields(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for acct in bundle.accounts:
            assert "FinServ__BankingPreference__c" not in acct
            assert "FinServ__ClientStatus__c" not in acct
            assert "LeadSource" not in acct

    def test_fa_uses_deposits_category_for_checking(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            if "Checking" in fa["Name"]:
                assert fa["FinServ__FinancialAccountType__c"] == "Deposits"

    def test_fa_status_is_open_not_active(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert fa["FinServ__Status__c"] == "Open"

    def test_fa_uses_open_date_not_opened_date(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert "FinServ__OpenDate__c" in fa
            assert "FinServ__OpenedDate__c" not in fa

    def test_fa_uses_ownership_not_ownership_type(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert fa["FinServ__Ownership__c"] == "Individual"
            assert "FinServ__OwnershipType__c" not in fa

    def test_savings_added_at_probability_0_6(self, gen_kwargs):
        # With seed=42 and n=200, probability 0.6 → ~100-140 savings accounts
        gen_kwargs["n"] = 200
        bundle = generate_retail(**gen_kwargs)
        savings_count = sum(1 for fa in bundle.financial_accounts if "Savings" in fa["Name"])
        assert 100 <= savings_count <= 140

    def test_savings_fa_uses_apy_field(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_retail(**gen_kwargs)
        savings_fas = [fa for fa in bundle.financial_accounts if "Savings" in fa["Name"]]
        assert len(savings_fas) > 0
        for sav in savings_fas:
            assert "FinServ__APY__c" in sav

    def test_savings_fa_external_id_uses_separate_sequence(self, gen_kwargs):
        gen_kwargs["n"] = 50
        bundle = generate_retail(**gen_kwargs)
        checking_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts if "Checking" in fa["Name"]]
        savings_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts if "Savings" in fa["Name"]]
        assert set(checking_ids).isdisjoint(set(savings_ids))

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_retail(**gen_kwargs)
        bundle2 = generate_retail(**gen_kwargs)
        assert bundle1.accounts == bundle2.accounts
        assert bundle1.financial_accounts == bundle2.financial_accounts

    def test_different_seeds_produce_different_output(self, gen_kwargs):
        bundle1 = generate_retail(**gen_kwargs)
        gen_kwargs["seed"] = 99
        bundle2 = generate_retail(**gen_kwargs)
        assert bundle1.accounts[0]["LastName"] != bundle2.accounts[0]["LastName"]
