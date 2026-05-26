"""Tests for the wealth persona generator (Plan 2 / Task 11)."""
from __future__ import annotations

from datetime import date

import pytest

from customer_hydration.generators.holdings import HoldingRequest
from customer_hydration.generators.wealth import generate_wealth


WEALTH_RM_1 = "005am000003QwAA1AAQ"
WEALTH_RM_2 = "005am000003QwAA2AAQ"
WEALTH_RM_POOL = [WEALTH_RM_1, WEALTH_RM_2]

# Other-pool RM ids — used by an isolation test to make sure the wealth
# generator never reaches into a non-wealth RM bucket.
NON_WEALTH_RM = "005am000003ZzZZ9AAA"


@pytest.fixture
def gen_kwargs(anchor_date, fixed_seed):
    return {
        "n": 50,
        "seed": fixed_seed,
        "starting_seq": 1,
        "rm_user_ids": WEALTH_RM_POOL,
        "anchor_date": anchor_date,
        "person_account_rt_id": "012am000004x9TBAAY",  # FSC_Person_Accounts
    }


class TestGenerateWealth:
    def test_returns_one_account_per_customer(self, gen_kwargs):
        bundle = generate_wealth(**gen_kwargs)
        assert len(bundle.accounts) == 50
        # Phase 3a: at min 2 (Premier Checking + Brokerage), at max 5
        # (+ Roth p=0.55 + Jumbo Mortgage p=0.50 + HELOC p=0.30 cond.).
        assert 100 <= len(bundle.financial_accounts) <= 250
        assert len(bundle.financial_account_roles) == len(bundle.financial_accounts)

    def test_external_ids_use_wealth_prefix(self, gen_kwargs):
        bundle = generate_wealth(**gen_kwargs)
        ids = [a["External_ID__c"] for a in bundle.accounts]
        assert ids[0] == "HYDRATE-WL-000001"
        assert ids[-1] == "HYDRATE-WL-000050"
        assert all(i.startswith("HYDRATE-WL-") for i in ids)

    def test_owner_ids_are_drawn_from_wealth_rm_pool_only(self, gen_kwargs):
        bundle = generate_wealth(**gen_kwargs)
        owners = {a["OwnerId"] for a in bundle.accounts}
        assert owners.issubset(set(WEALTH_RM_POOL))
        assert NON_WEALTH_RM not in owners

    def test_record_type_is_person_account(self, gen_kwargs):
        bundle = generate_wealth(**gen_kwargs)
        assert all(
            a["RecordTypeId"] == gen_kwargs["person_account_rt_id"]
            for a in bundle.accounts
        )

    def test_client_category_wealth_management(self, gen_kwargs):
        bundle = generate_wealth(**gen_kwargs)
        assert all(
            a["FinServ__ClientCategory__c"] == "Wealth Management"
            for a in bundle.accounts
        )

    def test_age_distribution_in_45_80(self, gen_kwargs):
        bundle = generate_wealth(**gen_kwargs)
        anchor = gen_kwargs["anchor_date"]
        for acct in bundle.accounts:
            birthdate = date.fromisoformat(acct["PersonBirthdate"])
            age = (anchor - birthdate).days // 365
            assert 45 <= age <= 80, f"age {age} out of band for {acct['External_ID__c']}"

    def test_emits_brokerage_fa_for_every_customer(self, gen_kwargs):
        bundle = generate_wealth(**gen_kwargs)
        # Every account must back at least one Brokerage FA, and Brokerage
        # type maps through fieldmap to the "Investments" picklist value.
        brokerage_fas = [
            fa for fa in bundle.financial_accounts if "Brokerage" in fa["Name"]
        ]
        assert len(brokerage_fas) == 50
        for fa in brokerage_fas:
            assert fa["FinServ__FinancialAccountType__c"] == "Investments"

    def test_emits_premier_checking_fa_for_every_customer(self, gen_kwargs):
        bundle = generate_wealth(**gen_kwargs)
        premier_fas = [
            fa for fa in bundle.financial_accounts if "Premier Checking" in fa["Name"]
        ]
        assert len(premier_fas) == 50
        for fa in premier_fas:
            assert fa["FinServ__FinancialAccountType__c"] == "Deposits"

    def test_holding_requests_emitted_for_every_investment_fa(self, gen_kwargs):
        bundle = generate_wealth(**gen_kwargs)
        # One HoldingRequest per Brokerage + one per Roth IRA.
        investment_fas = [
            fa
            for fa in bundle.financial_accounts
            if fa["FinServ__FinancialAccountType__c"] == "Investments"
        ]
        assert len(bundle.holding_requests) == len(investment_fas)

        # Holding-request invariants:
        #   - every request is a real HoldingRequest dataclass
        #   - target balance matches its FA's balance
        #   - num_holdings is in the documented per-product range
        fa_balance_by_ext = {
            fa["External_ID__c"]: fa["FinServ__Balance__c"]
            for fa in bundle.financial_accounts
        }
        fa_name_by_ext = {
            fa["External_ID__c"]: fa["Name"] for fa in bundle.financial_accounts
        }
        account_ext_ids = {a["External_ID__c"] for a in bundle.accounts}
        for req in bundle.holding_requests:
            assert isinstance(req, HoldingRequest)
            assert req.fa_external_id in fa_balance_by_ext
            assert req.fa_target_balance == fa_balance_by_ext[req.fa_external_id]
            assert req.primary_owner_external_id in account_ext_ids
            name = fa_name_by_ext[req.fa_external_id]
            if "Brokerage" in name:
                assert 8 <= req.num_holdings <= 15
            elif "Roth IRA" in name:
                assert 4 <= req.num_holdings <= 8

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_wealth(**gen_kwargs)
        bundle2 = generate_wealth(**gen_kwargs)
        assert bundle1.accounts == bundle2.accounts
        assert bundle1.financial_accounts == bundle2.financial_accounts
        assert bundle1.financial_account_roles == bundle2.financial_account_roles
        assert bundle1.holding_requests == bundle2.holding_requests


class TestPhase3aWealthLoanSubtypes:
    """Phase 3a: Jumbo Mortgage + HELOC products on Wealth customers."""

    def test_jumbo_mortgage_emitted_at_around_50pct(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_wealth(**gen_kwargs)
        mortgages = [
            fa for fa in bundle.financial_accounts if "Jumbo Mortgage" in fa["Name"]
        ]
        assert 80 <= len(mortgages) <= 130, f"got {len(mortgages)} mortgages"
        for fa in mortgages:
            assert fa["FinServ__FinancialAccountType__c"] == "Loans"
            assert "[Mortgage]" in fa.get("FinServ__Description__c", "")
            assert fa["FinServ__LoanType__c"] == "Mortgage"
            principal = fa["FinServ__LoanAmount__c"]
            assert 500_000 <= principal <= 2_000_000

    def test_no_orphan_helocs_every_heloc_has_a_mortgage(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_wealth(**gen_kwargs)
        by_owner: dict[str, list[dict]] = {}
        for fa in bundle.financial_accounts:
            by_owner.setdefault(fa["FinServ__PrimaryOwner__c"], []).append(fa)
        for owner_ext, fas in by_owner.items():
            has_heloc = any("HELOC" in fa["Name"] for fa in fas)
            has_mortgage = any("Mortgage" in fa["Name"] for fa in fas)
            if has_heloc:
                assert has_mortgage, (
                    f"Wealth customer {owner_ext} has a HELOC without a Mortgage."
                )

    def test_heloc_carries_credit_limit(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_wealth(**gen_kwargs)
        helocs = [fa for fa in bundle.financial_accounts if "HELOC" in fa["Name"]]
        assert len(helocs) > 0
        for h in helocs:
            assert h["FinServ__FinancialAccountType__c"] == "Loans"
            assert "FinServ__TotalCreditLimit__c" in h
            assert 50_000 <= h["FinServ__TotalCreditLimit__c"] <= 1_000_000
            assert h["FinServ__Balance__c"] <= h["FinServ__TotalCreditLimit__c"]
            assert "[HELOC]" in h.get("FinServ__Description__c", "")

    def test_fa_external_ids_unique_and_monotonic(self, gen_kwargs):
        gen_kwargs["n"] = 200
        bundle = generate_wealth(**gen_kwargs)
        fa_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts]
        assert len(fa_ids) == len(set(fa_ids))
        seq_nums = [int(i.split("-")[-1]) for i in fa_ids]
        assert seq_nums == sorted(seq_nums)
