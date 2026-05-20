"""Tests for the commercial persona generator (Plan 2 / Task 11)."""
from __future__ import annotations

import pytest

from customer_hydration.generators.commercial import generate_commercial


COMM_RM_1 = "005am000003QwCM1AAQ"
COMM_RM_2 = "005am000003QwCM2AAQ"
COMM_RM_POOL = [COMM_RM_1, COMM_RM_2]

BUSINESS_RT_ID = "012am000004x9AABBA1"  # placeholder Id-shaped string


@pytest.fixture
def gen_kwargs(anchor_date, fixed_seed):
    return {
        "n": 50,
        "seed": fixed_seed,
        "starting_seq": 1,
        "rm_user_ids": COMM_RM_POOL,
        "anchor_date": anchor_date,
        "business_rt_id": BUSINESS_RT_ID,
    }


class TestGenerateCommercial:
    def test_returns_one_account_per_customer(self, gen_kwargs):
        bundle = generate_commercial(**gen_kwargs)
        assert len(bundle.accounts) == 50
        # Always 1 Analyzed Checking + sometimes 1 CRE Loan (~60%).
        assert 50 <= len(bundle.financial_accounts) <= 100
        assert len(bundle.financial_account_roles) == len(bundle.financial_accounts)

    def test_external_ids_use_com_prefix(self, gen_kwargs):
        bundle = generate_commercial(**gen_kwargs)
        ids = [a["External_ID__c"] for a in bundle.accounts]
        assert ids[0] == "HYDRATE-COM-000001"
        assert ids[-1] == "HYDRATE-COM-000050"
        assert all(i.startswith("HYDRATE-COM-") for i in ids)

    def test_record_type_is_business(self, gen_kwargs):
        bundle = generate_commercial(**gen_kwargs)
        assert all(a["RecordTypeId"] == BUSINESS_RT_ID for a in bundle.accounts)
        for acct in bundle.accounts:
            assert "PersonBirthdate" not in acct
            assert "Name" in acct
            assert "FirstName" not in acct

    def test_client_category_commercial_banking(self, gen_kwargs):
        bundle = generate_commercial(**gen_kwargs)
        assert all(
            a["FinServ__ClientCategory__c"] == "Commercial Banking"
            for a in bundle.accounts
        )

    def test_annual_revenue_in_10m_to_500m(self, gen_kwargs):
        bundle = generate_commercial(**gen_kwargs)
        for acct in bundle.accounts:
            rev = acct["AnnualRevenue"]
            assert 10_000_000 <= rev <= 500_000_000, (
                f"revenue {rev} out of band for {acct['External_ID__c']}"
            )

    def test_emits_business_analyzed_checking_for_every_customer(self, gen_kwargs):
        bundle = generate_commercial(**gen_kwargs)
        checkings = [
            fa
            for fa in bundle.financial_accounts
            if "Analyzed Checking" in fa["Name"]
        ]
        assert len(checkings) == 50
        # "Business Checking" picklist value maps to "Deposits".
        for fa in checkings:
            assert fa["FinServ__FinancialAccountType__c"] == "Deposits"
            assert fa["FinServ__Status__c"] == "Open"

    def test_real_estate_loan_probability_around_60pct(self, gen_kwargs):
        # n=200 + p=0.6 → expect 100..150 CRE loans for fixed seed 42.
        gen_kwargs["n"] = 200
        bundle = generate_commercial(**gen_kwargs)
        loans = [fa for fa in bundle.financial_accounts if "CRE Loan" in fa["Name"]]
        assert 100 <= len(loans) <= 150, f"got {len(loans)} CRE loans"
        # "Mortgage" picklist maps to "Loans".
        for fa in loans:
            assert fa["FinServ__FinancialAccountType__c"] == "Loans"
            assert 5_000_000 <= fa["FinServ__Balance__c"] <= 80_000_000

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_commercial(**gen_kwargs)
        bundle2 = generate_commercial(**gen_kwargs)
        assert bundle1.accounts == bundle2.accounts
        assert bundle1.financial_accounts == bundle2.financial_accounts
        assert bundle1.financial_account_roles == bundle2.financial_account_roles
