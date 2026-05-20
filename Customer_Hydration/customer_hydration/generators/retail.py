"""Retail Person Account generator (Plan 1 scope).

Plan 1 emits one Account + one Checking FA + one FA Role per customer.
Plans 2+ extend this to all the retail child records in spec §2 (Savings,
Mortgage, HELOC, Cards, Goals, LifeEvents, Cases, Tasks, Events, Opps).
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Iterable

from faker import Faker

from customer_hydration.fieldmap import JDO_FIELDMAP


_LIFE_STAGE_BINS = [
    (32, "young_pro"),
    (45, "family_building"),
    (60, "established"),
    (999, "retiree"),
]

_STATE_WEIGHTS = {
    "CA": 12, "TX": 10, "FL": 10, "NY": 8, "IL": 5, "PA": 4,
    "OH": 4, "GA": 4, "NC": 4, "MI": 3, "VA": 3, "NJ": 3,
    "WA": 3, "AZ": 3, "MA": 3,
}


@dataclass
class RetailBundle:
    """All rows produced for one batch of retail customers."""

    accounts: list[dict] = field(default_factory=list)
    financial_accounts: list[dict] = field(default_factory=list)
    financial_account_roles: list[dict] = field(default_factory=list)


def generate_retail(
    *,
    n: int,
    seed: int,
    starting_seq: int,
    rm_user_ids: list[str],
    anchor_date: date,
    person_account_rt_id: str,
    checking_product_code: str,
) -> RetailBundle:
    """Generate `n` retail Person Accounts with one Checking FA + role each."""
    rng = random.Random(seed)
    faker = Faker("en_US")
    faker.seed_instance(seed)

    bundle = RetailBundle()

    states_pop = list(_STATE_WEIGHTS.keys())
    states_weights = list(_STATE_WEIGHTS.values())

    for i in range(n):
        seq = starting_seq + i
        ext_id = f"HYDRATE-RT-{seq:06d}"
        fa_ext_id = f"HYDRATE-FA-{seq:06d}"
        # FA Role External_ID__c. The original Plan 1 spec assumed FA Role had
        # NO External_ID__c, but jdo-fw51xz does have it (unique=True), so we
        # populate it for true upsert idempotency. HYDRATE-FAR- = retail FA
        # Role; one role per FA in Plan 1 so no per-FA suffix needed.
        far_ext_id = f"HYDRATE-FAR-{seq:06d}"

        age = int(rng.triangular(22, 80, 42))
        birthdate = anchor_date - timedelta(days=age * 365 + rng.randint(0, 364))
        life_stage = next(label for max_age, label in _LIFE_STAGE_BINS if age <= max_age)

        income_log = rng.gauss(11.0, 0.5)
        income = max(35000, min(180000, round(2.71828 ** income_log, -2)))
        # Older customers shifted toward higher end of band
        if age >= 45:
            income = min(180000, income * 1.15)
        income = round(income, -2)

        state = rng.choices(states_pop, weights=states_weights, k=1)[0]
        first = faker.first_name()
        last = faker.last_name()
        marital = _marital_for(age, life_stage, rng)

        # Build the logical row (using spec field names), then translate via fieldmap.
        logical_account = {
            "RecordTypeId": person_account_rt_id,
            "FirstName": first,
            "LastName": last,
            "Salutation": _salutation(rng, marital),
            "PersonBirthdate": birthdate.isoformat(),
            "PersonEmail": faker.email(),
            "PersonHomePhone": faker.phone_number(),
            "PersonMobilePhone": faker.phone_number(),
            "PersonMailingStreet": faker.street_address(),
            "PersonMailingCity": faker.city(),
            "PersonMailingState": state,
            "PersonMailingPostalCode": faker.zipcode_in_state(state_abbr=state),
            "PersonMailingCountry": "US",
            "Industry": "Personal",
            "FinServ__ClientCategory__c": "Retail",
            "FinServ__ClientStatus__c": "Active",  # dropped by fieldmap
            "FinServ__MaritalStatus__c": marital,  # → __pc
            "FinServ__Occupation__c": faker.job(),  # → __pc
            "FinServ__Employer__c": faker.company(),  # → CurrentEmployer__pc
            "FinServ__YearsWithEmployer__c": min(age - 22, rng.randint(1, 25)),  # dropped
            "FinServ__TotalAnnualIncome__c": income,  # → AnnualIncome__pc
            "FinServ__NumberOfDependents__c": _dependents_for(life_stage, rng),  # → __pc
            "FinServ__BankingPreference__c": rng.choice(["Mobile", "Online", "In-Branch"]),  # dropped
            "OwnerId": rng.choice(rm_user_ids),
            "LeadSource": "Hydration",  # dropped (not on Account in this org)
            "External_ID__c": ext_id,
            "FinServ__SourceSystemId__c": ext_id,
            "Description": _description_for(life_stage, age, marital),
        }
        account = JDO_FIELDMAP.apply("Account", logical_account)
        bundle.accounts.append(account)

        balance = round(rng.uniform(500, 8000), 2)
        opened = anchor_date - timedelta(days=rng.randint(30, 365 * 5))

        logical_fa = {
            "Name": f"Cumulus Everyday Checking - {rng.randint(1000, 9999)}",
            "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Checking"),
            "FinServ__FinancialAccountSource__c": f"Cumulus:{checking_product_code}",
            "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"),
            "FinServ__OpenedDate__c": opened.isoformat(),  # → OpenDate__c
            "FinServ__Balance__c": balance,
            "FinServ__InterestRate__c": 0.0001,
            "FinServ__APY__c": 0.0001,
            "FinServ__OwnershipType__c": "Individual",  # → Ownership__c
            "FinServ__PrimaryOwner__c": ext_id,
            "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
            "FinServ__ProductCode__c": checking_product_code,  # dropped
            "External_ID__c": fa_ext_id,
            "FinServ__SourceSystemId__c": fa_ext_id,
        }
        fa = JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_fa)
        bundle.financial_accounts.append(fa)

        role = {
            "FinServ__FinancialAccount__c": fa_ext_id,
            "FinServ__RelatedAccount__c": ext_id,
            "FinServ__Role__c": "Primary Owner",
            "FinServ__Active__c": True,
            "FinServ__StartDate__c": opened.isoformat(),
            "External_ID__c": far_ext_id,
        }
        bundle.financial_account_roles.append(role)

        # Savings child record at probability 0.6 (per personas.yaml; spec §2 retail)
        if rng.random() < 0.6:
            sav_ext_id = f"HYDRATE-FA-{starting_seq + n + i:06d}"  # offset by n past checking
            sav_balance = round(rng.uniform(500, 25000), 2)
            sav_apy = 0.0025  # Statement Savings APY
            logical_sav = {
                "Name": f"Cumulus Statement Savings - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Savings"),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-SAV-STM-2026.04",
                "FinServ__Status__c": "Open",
                "FinServ__OpenedDate__c": opened.isoformat(),
                "FinServ__Balance__c": sav_balance,
                "FinServ__APY__c": sav_apy,
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "External_ID__c": sav_ext_id,
                "FinServ__SourceSystemId__c": sav_ext_id,
            }
            bundle.financial_accounts.append(JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_sav))

            sav_far_ext_id = f"HYDRATE-FAR-{starting_seq + n + i:06d}"
            sav_role = {
                "FinServ__FinancialAccount__c": sav_ext_id,
                "FinServ__RelatedAccount__c": ext_id,
                "FinServ__Role__c": "Primary Owner",
                "FinServ__Active__c": True,
                "FinServ__StartDate__c": opened.isoformat(),
                "External_ID__c": sav_far_ext_id,
            }
            bundle.financial_account_roles.append(sav_role)

    return bundle


def _marital_for(age: int, life_stage: str, rng: random.Random) -> str:
    if life_stage == "young_pro":
        return rng.choices(["Single", "Married"], weights=[7, 3])[0]
    if life_stage == "family_building":
        return rng.choices(["Married", "Single", "Divorced"], weights=[7, 2, 1])[0]
    if life_stage == "established":
        return rng.choices(["Married", "Divorced", "Single", "Widowed"], weights=[6, 2, 1, 1])[0]
    return rng.choices(["Married", "Widowed", "Divorced", "Single"], weights=[5, 2, 2, 1])[0]


def _dependents_for(life_stage: str, rng: random.Random) -> int:
    if life_stage == "young_pro":
        return rng.choices([0, 1], weights=[8, 2])[0]
    if life_stage == "family_building":
        return rng.choices([0, 1, 2, 3], weights=[2, 4, 3, 1])[0]
    if life_stage == "established":
        return rng.choices([0, 1, 2, 3], weights=[3, 2, 3, 2])[0]
    return rng.choices([0, 1, 2], weights=[6, 3, 1])[0]


def _salutation(rng: random.Random, marital: str) -> str:
    return rng.choice(["Mr.", "Ms.", "Mrs.", "Dr."])


def _description_for(life_stage: str, age: int, marital: str) -> str:
    return (
        f"{life_stage.replace('_', ' ').title()} retail customer, age {age}, "
        f"{marital.lower()}. Cumulus Everyday Checking is the anchor relationship."
    )
