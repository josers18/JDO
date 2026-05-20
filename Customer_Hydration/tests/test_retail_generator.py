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
    def test_returns_one_account_one_fa_one_role_per_customer(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        assert len(bundle.accounts) == 50
        assert len(bundle.financial_accounts) == 50
        assert len(bundle.financial_account_roles) == 50

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

    def test_lead_source_constant(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        assert all(a["LeadSource"] == "Hydration" for a in bundle.accounts)

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

    def test_household_income_in_range(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for acct in bundle.accounts:
            income = acct["FinServ__TotalAnnualIncome__c"]
            assert 35000 <= income <= 180000

    def test_fa_external_ids_are_sequential(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        fa_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts]
        assert fa_ids[0] == "HYDRATE-FA-000001"
        assert fa_ids[-1] == "HYDRATE-FA-000050"

    def test_fa_links_to_account_via_external_id_reference(self, gen_kwargs):
        """The FA CSV column must use the sf-CLI external-id reference syntax
        FinServ__PrimaryOwner__c:Account:External_ID__c — but the generator
        emits the raw HYDRATE-RT-* external id; the loader rewrites the
        column header to the reference syntax. Here we just confirm the
        pairing is consistent."""
        bundle = generate_retail(**gen_kwargs)
        for acct, fa in zip(bundle.accounts, bundle.financial_accounts):
            assert fa["FinServ__PrimaryOwner__c"] == acct["External_ID__c"]

    def test_fa_uses_checking_product_code(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert fa["FinServ__FinancialAccountType__c"] == "Checking"
            assert fa["FinServ__ProductCode__c"] == "PD-CHK-EVD-2026.04"

    def test_fa_balance_in_500_to_8000(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            assert 500 <= fa["FinServ__Balance__c"] <= 8000

    def test_role_links_account_to_fa_with_primary_owner(self, gen_kwargs):
        bundle = generate_retail(**gen_kwargs)
        for acct, fa, role in zip(
            bundle.accounts, bundle.financial_accounts, bundle.financial_account_roles
        ):
            assert role["FinServ__FinancialAccount__c"] == fa["External_ID__c"]
            assert role["FinServ__Account__c"] == acct["External_ID__c"]
            assert role["FinServ__Role__c"] == "Primary Owner"
            assert role["FinServ__Active__c"] is True

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
