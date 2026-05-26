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

    def test_fa_external_ids_are_sequential_and_unique(self, gen_kwargs):
        # Phase 3a: optional Mortgage / HELOC / Auto / Personal loans now
        # interleave with Checking + Savings, so the FA external-id stream
        # is "monotonic per row", NOT "one per customer". The first id
        # still anchors at starting_seq, but the last id is determined by
        # the total number of FAs emitted across all branches.
        bundle = generate_retail(**gen_kwargs)
        fa_ids = [fa["External_ID__c"] for fa in bundle.financial_accounts]
        assert fa_ids[0] == "HYDRATE-FA-000001"
        assert len(fa_ids) == len(set(fa_ids)), "FA External_ID__c values must be unique"
        seq_nums = [int(i.split("-")[-1]) for i in fa_ids]
        # Counter is monotonic with no gaps within the persona window.
        assert seq_nums == list(range(seq_nums[0], seq_nums[0] + len(seq_nums)))

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

    def test_savings_and_checking_fa_external_ids_are_disjoint(self, gen_kwargs):
        # Phase 3a: counters are now per-bundle (interleaved), but
        # uniqueness still guarantees Checking and Savings ids never
        # overlap.
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


def _date_age_at(birthdate_iso: str, anchor: date) -> int:
    return (anchor - date.fromisoformat(birthdate_iso)).days // 365


def _life_stage_for_age(age: int) -> str:
    for max_age, label in [(32, "young_pro"), (45, "family_building"), (60, "established"), (999, "retiree")]:
        if age <= max_age:
            return label
    return "retiree"


class TestPhase3aLoanSubtypes:
    """Phase 3a: Mortgage / HELOC / Auto / Personal loan products.

    Probabilities are tuned for the Phase 3d placeholder-segment tightening
    work. With the fixed seed and n=400 these ranges are stable; if the
    bands grow flaky the right move is to widen the bound, not pin a
    specific count, since the rng draw schedule changes when new optional
    branches are added upstream.
    """

    def test_mortgage_only_for_family_building_or_established(self, gen_kwargs, anchor_date):
        gen_kwargs["n"] = 400
        bundle = generate_retail(**gen_kwargs)
        accounts_by_ext = {a["External_ID__c"]: a for a in bundle.accounts}
        # Map FA primary-owner ext id back to the customer's birthdate.
        for fa in bundle.financial_accounts:
            if "Mortgage" not in fa["Name"]:
                continue
            owner_ext = fa["FinServ__PrimaryOwner__c"]
            owner = accounts_by_ext[owner_ext]
            age = _date_age_at(owner["PersonBirthdate"], anchor_date)
            stage = _life_stage_for_age(age)
            assert stage in ("family_building", "established"), (
                f"Mortgage emitted for {stage} customer (age {age}); "
                f"life-stage gate violated."
            )

    def test_mortgage_probability_in_expected_band(self, gen_kwargs):
        # Among eligible (family_building + established) customers the
        # mortgage rate is ~0.35. With n=400, ~half eligible per the age
        # triangular, so expect ~50-100 mortgages overall. Wide band keeps
        # the test robust against upstream rng-schedule changes.
        gen_kwargs["n"] = 400
        bundle = generate_retail(**gen_kwargs)
        mortgages = [fa for fa in bundle.financial_accounts if "Mortgage" in fa["Name"]]
        assert 30 <= len(mortgages) <= 130, f"got {len(mortgages)} mortgages"

    def test_no_orphan_helocs_every_heloc_has_a_mortgage(self, gen_kwargs):
        gen_kwargs["n"] = 400
        bundle = generate_retail(**gen_kwargs)
        # Group FAs by primary owner.
        by_owner: dict[str, list[dict]] = {}
        for fa in bundle.financial_accounts:
            by_owner.setdefault(fa["FinServ__PrimaryOwner__c"], []).append(fa)
        for owner_ext, fas in by_owner.items():
            has_heloc = any("HELOC" in fa["Name"] for fa in fas)
            has_mortgage = any("Mortgage" in fa["Name"] for fa in fas)
            if has_heloc:
                assert has_mortgage, (
                    f"Customer {owner_ext} has a HELOC but no Mortgage — "
                    f"orphan HELOCs are forbidden."
                )

    def test_heloc_carries_credit_limit_and_balance(self, gen_kwargs):
        gen_kwargs["n"] = 400
        bundle = generate_retail(**gen_kwargs)
        helocs = [fa for fa in bundle.financial_accounts if "HELOC" in fa["Name"]]
        assert len(helocs) > 0, "expected at least one HELOC for n=400 + seed=42"
        for h in helocs:
            assert h["FinServ__FinancialAccountType__c"] == "Loans"
            assert "FinServ__TotalCreditLimit__c" in h
            limit = h["FinServ__TotalCreditLimit__c"]
            balance = h["FinServ__Balance__c"]
            assert 25_000 <= limit <= 500_000
            # Drawn must not exceed the line.
            assert 0 <= balance <= limit

    def test_loan_subtypes_carry_token_in_description(self, gen_kwargs):
        # Phase 3d will filter on ssot__Description__c — the FA's
        # FinServ__Description__c is what flows there. Each loan type gets
        # a normalized leading token like "[Mortgage]".
        gen_kwargs["n"] = 200
        bundle = generate_retail(**gen_kwargs)
        for fa in bundle.financial_accounts:
            name = fa["Name"]
            desc = fa.get("FinServ__Description__c", "")
            for token in ("Mortgage", "HELOC", "Auto Loan", "Personal Loan"):
                if token in name:
                    assert f"[{token}]" in desc, (
                        f"FA {fa['External_ID__c']} named {name!r} is missing "
                        f"the [{token}] description token."
                    )

    def test_loan_type_field_dropped_by_preflight_in_practice(self, gen_kwargs):
        # FinServ__LoanType__c does NOT exist on FinServ__FinancialAccount__c
        # in jdo today; the generator emits it as a logical field for
        # forward compatibility, and the preflight CSV writer drops it.
        # We can't run the preflight here without an org, but the fieldmap
        # is a no-op rename — physical name == logical name — so the field
        # name shows up in the dict. That's the contract.
        gen_kwargs["n"] = 200
        bundle = generate_retail(**gen_kwargs)
        loan_fas = [
            fa for fa in bundle.financial_accounts
            if fa["FinServ__FinancialAccountType__c"] == "Loans"
        ]
        assert len(loan_fas) > 0
        for fa in loan_fas:
            assert "FinServ__LoanType__c" in fa
            assert fa["FinServ__LoanType__c"] in {
                "Mortgage", "HELOC", "Auto Loan", "Personal Loan",
            }

    def test_every_loan_fa_has_a_role_back_to_owning_account(self, gen_kwargs):
        gen_kwargs["n"] = 400
        bundle = generate_retail(**gen_kwargs)
        role_fa_ids = {r["FinServ__FinancialAccount__c"] for r in bundle.financial_account_roles}
        for fa in bundle.financial_accounts:
            assert fa["External_ID__c"] in role_fa_ids, (
                f"FA {fa['External_ID__c']} ({fa['Name']}) has no role row"
            )
