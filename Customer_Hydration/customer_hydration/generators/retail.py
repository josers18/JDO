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

        account = {
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
            "FinServ__ClientStatus__c": "Active",
            "FinServ__MaritalStatus__c": marital,
            "FinServ__Occupation__c": faker.job(),
            "FinServ__Employer__c": faker.company(),
            "FinServ__YearsWithEmployer__c": min(age - 22, rng.randint(1, 25)),
            "FinServ__TotalAnnualIncome__c": income,
            "FinServ__NumberOfDependents__c": _dependents_for(life_stage, rng),
            "FinServ__BankingPreference__c": rng.choice(["Mobile", "Online", "In-Branch"]),
            "OwnerId": rng.choice(rm_user_ids),
            "LeadSource": "Hydration",
            "External_ID__c": ext_id,
            "FinServ__SourceSystemId__c": ext_id,
            "Description": _description_for(life_stage, age, marital),
        }
        bundle.accounts.append(account)

        balance = round(rng.uniform(500, 8000), 2)
        opened = anchor_date - timedelta(days=rng.randint(30, 365 * 5))

        fa = {
            "Name": f"Cumulus Everyday Checking - {rng.randint(1000, 9999)}",
            "FinServ__FinancialAccountType__c": "Checking",
            "FinServ__FinancialAccountSource__c": "Hydration",
            "FinServ__Status__c": "Active",
            "FinServ__OpenedDate__c": opened.isoformat(),
            "FinServ__Balance__c": balance,
            "FinServ__InterestRate__c": 0.0001,
            "FinServ__OwnershipType__c": "Individual",
            "FinServ__PrimaryOwner__c": ext_id,  # external-id reference; loader rewrites the column header
            "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
            "FinServ__ProductCode__c": checking_product_code,
            "External_ID__c": fa_ext_id,
            "FinServ__SourceSystemId__c": fa_ext_id,
        }
        bundle.financial_accounts.append(fa)

        role = {
            "FinServ__FinancialAccount__c": fa_ext_id,
            "FinServ__Account__c": ext_id,
            "FinServ__Role__c": "Primary Owner",
            "FinServ__Active__c": True,
            "FinServ__StartDate__c": opened.isoformat(),
        }
        bundle.financial_account_roles.append(role)

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
