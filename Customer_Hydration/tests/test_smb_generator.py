"""Tests for the SMB persona generator (Plan 2 / Task 11)."""
from __future__ import annotations

import pytest

from customer_hydration.generators.smb import generate_smb


SMB_RM_1 = "005am000003QwSM1AAQ"
SMB_RM_2 = "005am000003QwSM2AAQ"
SMB_RM_POOL = [SMB_RM_1, SMB_RM_2]

NON_SMB_RM = "005am000003ZzZZ9AAA"

BUSINESS_RT_ID = "012am000004x9AABBA1"  # placeholder Id-shaped string


@pytest.fixture
def gen_kwargs(anchor_date, fixed_seed):
    return {
        "n": 50,
        "seed": fixed_seed,
        "starting_seq": 1,
        "rm_user_ids": SMB_RM_POOL,
        "anchor_date": anchor_date,
        "business_rt_id": BUSINESS_RT_ID,
    }


class TestGenerateSmb:
    def test_returns_one_account_per_customer(self, gen_kwargs):
        bundle = generate_smb(**gen_kwargs)
        assert len(bundle.accounts) == 50
        # Always 1 Business Checking + sometimes 1 Term Loan (~60%).
        assert 50 <= len(bundle.financial_accounts) <= 100
        assert len(bundle.financial_account_roles) == len(bundle.financial_accounts)

    def test_external_ids_use_smb_prefix(self, gen_kwargs):
        bundle = generate_smb(**gen_kwargs)
        ids = [a["External_ID__c"] for a in bundle.accounts]
        assert ids[0] == "HYDRATE-SMB-000001"
        assert ids[-1] == "HYDRATE-SMB-000050"
        assert all(i.startswith("HYDRATE-SMB-") for i in ids)

    def test_record_type_is_business(self, gen_kwargs):
        bundle = generate_smb(**gen_kwargs)
        assert all(a["RecordTypeId"] == BUSINESS_RT_ID for a in bundle.accounts)
        # And no PersonBirthdate / PersonEmail leakage from the wealth template.
        for acct in bundle.accounts:
            assert "PersonBirthdate" not in acct
            assert "PersonEmail" not in acct
            # Business rows must have Name, not FirstName/LastName.
            assert "Name" in acct
            assert "FirstName" not in acct

    def test_client_category_small_business(self, gen_kwargs):
        bundle = generate_smb(**gen_kwargs)
        assert all(
            a["FinServ__ClientCategory__c"] == "Small Business"
            for a in bundle.accounts
        )

    def test_emits_business_checking_for_every_customer(self, gen_kwargs):
        bundle = generate_smb(**gen_kwargs)
        checkings = [
            fa
            for fa in bundle.financial_accounts
            if "Business Checking" in fa["Name"]
        ]
        assert len(checkings) == 50
        # Type "Business Checking" maps to "Deposits" via fieldmap.
        for fa in checkings:
            assert fa["FinServ__FinancialAccountType__c"] == "Deposits"
            assert fa["FinServ__Status__c"] == "Open"

    def test_term_loan_probability_around_60pct(self, gen_kwargs):
        # n=200 + p=0.6 → expect 100..150 term loans for fixed seed 42.
        gen_kwargs["n"] = 200
        bundle = generate_smb(**gen_kwargs)
        loans = [fa for fa in bundle.financial_accounts if "Term Loan" in fa["Name"]]
        assert 100 <= len(loans) <= 150, f"got {len(loans)} term loans"
        # And Term Loan type maps to "Loans".
        for fa in loans:
            assert fa["FinServ__FinancialAccountType__c"] == "Loans"

    def test_owner_ids_drawn_from_smb_rm_pool_only(self, gen_kwargs):
        bundle = generate_smb(**gen_kwargs)
        owners = {a["OwnerId"] for a in bundle.accounts}
        assert owners.issubset(set(SMB_RM_POOL))
        assert NON_SMB_RM not in owners

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_smb(**gen_kwargs)
        bundle2 = generate_smb(**gen_kwargs)
        assert bundle1.accounts == bundle2.accounts
        assert bundle1.financial_accounts == bundle2.financial_accounts
        assert bundle1.financial_account_roles == bundle2.financial_account_roles
