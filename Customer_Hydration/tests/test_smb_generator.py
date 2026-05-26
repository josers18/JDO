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
        # Phase 3a: 1 Business Checking always + up to 3 optional loans
        # (SBA p=0.5, Term p=0.3, LoC p=0.4) per customer ⇒ [50, 200] FAs.
        assert 50 <= len(bundle.financial_accounts) <= 200
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

    def test_term_loan_probability_around_30pct(self, gen_kwargs):
        # Phase 3a: Term Loan probability dropped to 0.30 to make room
        # for SBA (0.50) + Line of Credit (0.40). With n=200 + seed=42,
        # expect 40..90 term loans.
        gen_kwargs["n"] = 200
        bundle = generate_smb(**gen_kwargs)
        loans = [fa for fa in bundle.financial_accounts if "Term Loan" in fa["Name"]]
        assert 40 <= len(loans) <= 90, f"got {len(loans)} term loans"
        # Term Loan type still maps to "Loans".
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


class TestPhase3aSmbLoanSubtypes:
    """Phase 3a: SBA / Term / LoC loan products on SMB customers.

    SmbWithSba__seg is the primary Phase 3d consumer of the [SBA Loan]
    description token.
    """

    def test_sba_loan_emitted_at_around_50pct(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_smb(**gen_kwargs)
        sba = [fa for fa in bundle.financial_accounts if "SBA" in fa["Name"]]
        assert 80 <= len(sba) <= 130, f"got {len(sba)} SBA loans"
        for fa in sba:
            assert fa["FinServ__FinancialAccountType__c"] == "Loans"
            assert "[SBA Loan]" in fa.get("FinServ__Description__c", "")
            assert fa["FinServ__LoanType__c"] == "SBA Loan"

    def test_line_of_credit_emitted_at_around_40pct(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_smb(**gen_kwargs)
        locs = [fa for fa in bundle.financial_accounts if "Line of Credit" in fa["Name"]]
        assert 60 <= len(locs) <= 110, f"got {len(locs)} lines of credit"
        for fa in locs:
            assert fa["FinServ__FinancialAccountType__c"] == "Loans"
            assert "[Line of Credit]" in fa.get("FinServ__Description__c", "")
            assert "FinServ__TotalCreditLimit__c" in fa
            assert fa["FinServ__Balance__c"] <= fa["FinServ__TotalCreditLimit__c"]

    def test_loan_subtypes_are_independent_draws(self, gen_kwargs):
        # Independent draws ⇒ a customer can have all three; ⇒ at least
        # some customers in n=200 carry 4 FAs (1 checking + SBA + Term + LoC).
        gen_kwargs["n"] = 200
        bundle = generate_smb(**gen_kwargs)
        by_owner: dict[str, list[dict]] = {}
        for fa in bundle.financial_accounts:
            by_owner.setdefault(fa["FinServ__PrimaryOwner__c"], []).append(fa)
        max_fas = max(len(v) for v in by_owner.values())
        assert max_fas >= 3, (
            f"expected at least one customer with >=3 FAs but max was {max_fas}; "
            f"loans are not landing as independent draws"
        )

    def test_fa_external_ids_unique_and_monotonic(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_smb(**gen_kwargs)
        fa_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts]
        assert len(fa_ids) == len(set(fa_ids))
        seq_nums = [int(i.split("-")[-1]) for i in fa_ids]
        assert seq_nums == sorted(seq_nums)
