"""Wealth Person Account generator (Plan 2 / Task 11).

Emits one Person Account + 2-3 child FAs (Premier Checking, Brokerage,
optional Roth IRA) + one FA Role per FA per wealth customer. Investment
FAs additionally carry holding *requests* — runner_p2 calls
``generate_holdings()`` separately to materialize FinancialHolding rows.

This generator follows the same structural template as ``retail.py``:
anchor draws → logical Account row → fieldmap.apply → 1-N FAs with
fieldmap-translated picklists → 1 FA Role per FA. The Wealth-specific
divergences are documented inline.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import date, timedelta

from faker import Faker

from customer_hydration.fieldmap import JDO_FIELDMAP
from customer_hydration.generators.holdings import HoldingRequest


# Wealth life stages: bins the 45-80 age band into four labels so derived
# fields (marital, dependents, description prose) can vary by life stage
# without having to inspect age everywhere.
_LIFE_STAGE_BINS = [
    (55, "accumulator"),
    (65, "pre_retiree"),
    (75, "retiree"),
    (999, "legacy"),
]

# Wealth book skews to high-net-worth coastal + Sunbelt states. Weights
# are deliberately steeper than retail's spread.
_STATE_WEIGHTS = {
    "CA": 18, "NY": 14, "FL": 12, "TX": 10, "IL": 5, "MA": 5,
    "CT": 4, "NJ": 4, "WA": 4, "VA": 3, "MD": 3, "CO": 3,
    "GA": 3, "NC": 3, "AZ": 3,
}


@dataclass
class WealthBundle:
    """All rows produced for one batch of wealth customers."""

    accounts: list[dict] = field(default_factory=list)
    financial_accounts: list[dict] = field(default_factory=list)
    financial_account_roles: list[dict] = field(default_factory=list)
    holding_requests: list[HoldingRequest] = field(default_factory=list)


def generate_wealth(
    *,
    n: int,
    seed: int,
    starting_seq: int,
    rm_user_ids: list[str],
    anchor_date: date,
    person_account_rt_id: str,
) -> WealthBundle:
    """Generate ``n`` wealth Person Accounts + child FAs + holding requests.

    Each customer gets:
      - 1 Premier Checking FA (always; balance = 2-6mo income)
      - 1 Brokerage FA (always; balance = 0.4-0.7 × investable_assets)
        + 8-15 holdings via HoldingRequest
      - 1 Roth IRA FA at probability 0.55; balance capped by age band
        + 4-8 holdings via HoldingRequest

    The FA and FA-Role external-id sequences advance per emitted row, NOT
    per customer — so a customer who got the optional Roth IRA consumes
    three FA slots while a customer without it consumes two. The
    monotonic counter scheme guarantees uniqueness across the bundle.
    """
    rng = random.Random(seed)
    faker = Faker("en_US")
    faker.seed_instance(seed)

    bundle = WealthBundle()

    states_pop = list(_STATE_WEIGHTS.keys())
    states_weights = list(_STATE_WEIGHTS.values())

    # Per-bundle counters so each FA / FA Role gets a globally unique
    # External_ID__c regardless of which child branches fired.
    fa_idx = 0
    far_idx = 0

    for i in range(n):
        seq = starting_seq + i
        ext_id = f"HYDRATE-WL-{seq:06d}"

        age = int(rng.triangular(45, 80, 62))
        birthdate = anchor_date - timedelta(days=age * 365 + rng.randint(0, 364))
        life_stage = next(label for max_age, label in _LIFE_STAGE_BINS if age <= max_age)

        # Lognormal investable assets, clamped to the [$250K, $25M] band.
        ia_log = rng.gauss(14.4, 1.0)
        investable_assets = max(250_000.0, min(25_000_000.0, math.exp(ia_log)))

        # Lognormal HHI, clamped to [$200K, $2.5M].
        inc_log = rng.gauss(12.7, 0.5)
        income = max(200_000.0, min(2_500_000.0, math.exp(inc_log)))
        income = round(income, -2)  # nearest $100

        complexity_tier = rng.choices(
            ["simple", "mid", "complex"], weights=[40, 40, 20]
        )[0]

        state = rng.choices(states_pop, weights=states_weights, k=1)[0]
        first = faker.first_name()
        last = faker.last_name()
        # Wealth book skews married (~80%).
        marital = rng.choices(
            ["Married", "Widowed", "Divorced", "Single"], weights=[8, 1, 0.5, 0.5]
        )[0]

        logical_account = {
            "RecordTypeId": person_account_rt_id,
            "FirstName": first,
            "LastName": last,
            "Salutation": rng.choice(["Mr.", "Mrs.", "Ms.", "Dr."]),
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
            "FinServ__ClientCategory__c": "Wealth Management",
            "FinServ__ClientStatus__c": "Active",  # dropped by fieldmap
            "FinServ__InvestmentExperience__c": rng.choice(
                ["Limited", "Good", "Extensive"]
            ),
            # Renamed by fieldmap → FinServ__RiskTolerance__c
            "FinServ__RiskToleranceLevel__c": rng.choice(
                ["Conservative", "Moderate", "Aggressive"]
            ),
            "FinServ__MaritalStatus__c": marital,
            "FinServ__Occupation__c": faker.job(),
            "FinServ__Employer__c": faker.company(),
            "FinServ__YearsWithEmployer__c": min(age - 22, rng.randint(5, 30)),
            "FinServ__TotalAnnualIncome__c": income,
            "FinServ__NumberOfDependents__c": rng.choices(
                [0, 1, 2, 3], weights=[3, 2, 4, 2]
            )[0],
            "FinServ__BankingPreference__c": rng.choice(["In-Branch", "Online"]),
            "OwnerId": rng.choice(rm_user_ids),
            "LeadSource": "Hydration",  # dropped by fieldmap
            "External_ID__c": ext_id,
            "FinServ__SourceSystemId__c": ext_id,
            "Description": (
                f"{life_stage.replace('_', ' ').title()} wealth client, age {age}, "
                f"investable assets ~${int(investable_assets):,}. "
                f"Complexity tier: {complexity_tier}."
            ),
        }
        bundle.accounts.append(JDO_FIELDMAP.apply("Account", logical_account))

        # Open dates anchor in the recent past so balances/holdings have
        # a plausible "since" date.
        opened = anchor_date - timedelta(days=rng.randint(180, 365 * 8))

        # ---- Premier Checking (always) ----------------------------------
        premier_balance = round(income / 12.0 * rng.uniform(2.0, 6.0), 2)
        premier_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
        premier_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
        fa_idx += 1
        far_idx += 1

        logical_premier = {
            "Name": f"Cumulus Premier Checking - {rng.randint(1000, 9999)}",
            "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c",
                "FinServ__FinancialAccountType__c",
                "Premier Checking",
            ),
            "FinServ__FinancialAccountSource__c": "Cumulus:PD-CHK-PREM-2026.04",
            "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"
            ),
            "FinServ__OpenedDate__c": opened.isoformat(),
            "FinServ__Balance__c": premier_balance,
            "FinServ__InterestRate__c": 0.0010,
            "FinServ__APY__c": 0.0010,
            "FinServ__OwnershipType__c": "Individual",
            "FinServ__PrimaryOwner__c": ext_id,
            "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
            "External_ID__c": premier_fa_ext,
            "FinServ__SourceSystemId__c": premier_fa_ext,
        }
        bundle.financial_accounts.append(
            JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_premier)
        )
        bundle.financial_account_roles.append(
            {
                "FinServ__FinancialAccount__c": premier_fa_ext,
                "FinServ__RelatedAccount__c": ext_id,
                "FinServ__Role__c": "Primary Owner",
                "FinServ__Active__c": True,
                "FinServ__StartDate__c": opened.isoformat(),
                "External_ID__c": premier_far_ext,
            }
        )

        # ---- Brokerage (always; emits HoldingRequest) -------------------
        brokerage_balance = round(investable_assets * rng.uniform(0.4, 0.7), 2)
        brokerage_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
        brokerage_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
        fa_idx += 1
        far_idx += 1

        logical_brokerage = {
            "Name": f"Cumulus Brokerage - {rng.randint(1000, 9999)}",
            "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c",
                "FinServ__FinancialAccountType__c",
                "Brokerage",
            ),
            "FinServ__FinancialAccountSource__c": "Cumulus:PD-INV-BRK-2026.04",
            "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"
            ),
            "FinServ__OpenedDate__c": opened.isoformat(),
            "FinServ__Balance__c": brokerage_balance,
            "FinServ__OwnershipType__c": "Individual",
            "FinServ__PrimaryOwner__c": ext_id,
            "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
            "External_ID__c": brokerage_fa_ext,
            "FinServ__SourceSystemId__c": brokerage_fa_ext,
        }
        bundle.financial_accounts.append(
            JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_brokerage)
        )
        bundle.financial_account_roles.append(
            {
                "FinServ__FinancialAccount__c": brokerage_fa_ext,
                "FinServ__RelatedAccount__c": ext_id,
                "FinServ__Role__c": "Primary Owner",
                "FinServ__Active__c": True,
                "FinServ__StartDate__c": opened.isoformat(),
                "External_ID__c": brokerage_far_ext,
            }
        )
        bundle.holding_requests.append(
            HoldingRequest(
                fa_external_id=brokerage_fa_ext,
                primary_owner_external_id=ext_id,
                fa_target_balance=brokerage_balance,
                num_holdings=rng.randint(8, 15),
            )
        )

        # ---- Roth IRA (probability 0.55; emits HoldingRequest) ----------
        if rng.random() < 0.55:
            # Cap shrinks for younger accumulators (still building) and
            # widens for retirees/legacy. Lower bound keeps the FA above
            # the IRS 2026 contribution-limit floor.
            if life_stage == "accumulator":
                ira_cap = 350_000.0
            elif life_stage == "pre_retiree":
                ira_cap = 900_000.0
            elif life_stage == "retiree":
                ira_cap = 1_500_000.0
            else:  # legacy
                ira_cap = 2_000_000.0
            roth_balance = round(rng.uniform(7_500.0, ira_cap), 2)

            roth_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            roth_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1

            logical_roth = {
                "Name": f"Cumulus Roth IRA - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Roth IRA",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-INV-RTH-2026.04",
                "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"
                ),
                "FinServ__OpenedDate__c": opened.isoformat(),
                "FinServ__Balance__c": roth_balance,
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "External_ID__c": roth_fa_ext,
                "FinServ__SourceSystemId__c": roth_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_roth)
            )
            bundle.financial_account_roles.append(
                {
                    "FinServ__FinancialAccount__c": roth_fa_ext,
                    "FinServ__RelatedAccount__c": ext_id,
                    "FinServ__Role__c": "Primary Owner",
                    "FinServ__Active__c": True,
                    "FinServ__StartDate__c": opened.isoformat(),
                    "External_ID__c": roth_far_ext,
                }
            )
            bundle.holding_requests.append(
                HoldingRequest(
                    fa_external_id=roth_fa_ext,
                    primary_owner_external_id=ext_id,
                    fa_target_balance=roth_balance,
                    num_holdings=rng.randint(4, 8),
                )
            )

    return bundle
