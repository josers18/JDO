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
        # Phase 3a: Always 1 Analyzed Checking + up to 4 optional FAs
        # (Treasury p=0.7, Term p=0.4, LoC p=0.4, CRE p=0.4) ⇒ [50, 250].
        assert 50 <= len(bundle.financial_accounts) <= 250
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

    def test_real_estate_loan_probability_around_40pct(self, gen_kwargs):
        # Phase 3a: CRE probability lowered to 0.40 to make room for new
        # Treasury / Term / LoC products. n=200 ⇒ expect 60..110 CRE loans.
        gen_kwargs["n"] = 200
        bundle = generate_commercial(**gen_kwargs)
        loans = [fa for fa in bundle.financial_accounts if "CRE Loan" in fa["Name"]]
        assert 60 <= len(loans) <= 110, f"got {len(loans)} CRE loans"
        # "Mortgage" picklist still maps to "Loans".
        for fa in loans:
            assert fa["FinServ__FinancialAccountType__c"] == "Loans"
            assert 5_000_000 <= fa["FinServ__Balance__c"] <= 80_000_000

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_commercial(**gen_kwargs)
        bundle2 = generate_commercial(**gen_kwargs)
        assert bundle1.accounts == bundle2.accounts
        assert bundle1.financial_accounts == bundle2.financial_accounts
        assert bundle1.financial_account_roles == bundle2.financial_account_roles


class TestPhase3aCommercialProducts:
    """Phase 3a: Treasury / Term / Commercial-LOC products on Commercial.

    CommercialWithTreasury__seg is the primary Phase 3d consumer of the
    Treasury Services product. The segment will filter on
    ``ssot__FinancialAccountType__c == 'Treasury Management'`` (the org
    picklist value), so we verify the parent picklist value here too.
    """

    def test_treasury_services_emitted_at_around_70pct(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_commercial(**gen_kwargs)
        treasury = [
            fa for fa in bundle.financial_accounts
            if "Treasury Services" in fa["Name"]
        ]
        assert 120 <= len(treasury) <= 170, f"got {len(treasury)} treasury FAs"
        for fa in treasury:
            # Treasury Management is the parent picklist value, NOT "Loans".
            assert fa["FinServ__FinancialAccountType__c"] == "Treasury Management"
            assert "[Treasury Services]" in fa.get("FinServ__Description__c", "")
            # Treasury is a service wrapper, not a loan — no LoanType.
            assert "FinServ__LoanType__c" not in fa

    def test_term_loan_emitted_at_around_40pct(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_commercial(**gen_kwargs)
        term = [
            fa for fa in bundle.financial_accounts
            if "Commercial Term Loan" in fa["Name"]
        ]
        assert 60 <= len(term) <= 110, f"got {len(term)} term loans"
        for fa in term:
            assert fa["FinServ__FinancialAccountType__c"] == "Loans"
            assert "[Term Loan]" in fa.get("FinServ__Description__c", "")
            assert fa["FinServ__LoanType__c"] == "Term Loan"

    def test_commercial_loc_emitted_at_around_40pct(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_commercial(**gen_kwargs)
        loc = [
            fa for fa in bundle.financial_accounts
            if "Commercial Line of Credit" in fa["Name"]
        ]
        assert 60 <= len(loc) <= 110, f"got {len(loc)} commercial LOCs"
        for fa in loc:
            assert fa["FinServ__FinancialAccountType__c"] == "Loans"
            assert "[Commercial LOC]" in fa.get("FinServ__Description__c", "")
            assert fa["FinServ__LoanType__c"] == "Commercial LOC"
            assert "FinServ__TotalCreditLimit__c" in fa
            assert fa["FinServ__Balance__c"] <= fa["FinServ__TotalCreditLimit__c"]

    def test_fa_external_ids_unique_and_monotonic(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_commercial(**gen_kwargs)
        fa_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts]
        assert len(fa_ids) == len(set(fa_ids))
        seq_nums = [int(i.split("-")[-1]) for i in fa_ids]
        assert seq_nums == sorted(seq_nums)
