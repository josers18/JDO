"""Retail Person Account generator.

Plan 1 emitted one Account + one Checking FA + one FA Role per customer.
Plan 2 added the optional Statement Savings child. Phase 3a (this file)
adds the four loan sub-products that the placeholder retail segments
need to tighten in Phase 3d: Mortgage, HELOC, Auto Loan, Personal Loan.

Subtype encoding strategy
-------------------------
The org's ``FinServ__FinancialAccount__c`` object only has a coarse
``FinancialAccountType`` picklist (Loans / Deposits / Credit Cards / etc.)
— there's no native ``LoanType`` field, and the existing DLO->DMO
mapping for ``ssot__FinancialAccount__dlm`` does not project anything
finer-grained than that picklist. So we pin the subtype in TWO places
that DO flow through to Data Cloud:

  - The FA ``Name`` field (mapped to ``ssot__Name__c``) carries the
    product label, e.g. "Cumulus First Mortgage - 1234".
  - The FA ``FinServ__Description__c`` field (mapped to
    ``ssot__Description__c``) carries a normalized ``[Mortgage]``
    leading token so Phase 3d segments can filter on a stable string.

We also emit ``FinServ__LoanType__c`` defensively — the field doesn't
exist in jdo today, so the preflight CSV writer drops it harmlessly,
but the call site documents intent and is future-proof if/when the
field is added.
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

# Phase 3a probabilities — independent draws per customer. Mortgage is
# gated on life stage (only family_building + established carry mortgages
# in this synthetic model — no jumbo wealth bleed; wealth.py owns that).
# HELOC is conditional on Mortgage (no orphan HELOCs).
_MORTGAGE_PROB = 0.35
_HELOC_PROB_GIVEN_MORTGAGE = 0.20
_AUTO_LOAN_PROB = 0.40
_PERSONAL_LOAN_PROB = 0.15


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
    """Generate ``n`` retail Person Accounts + child FAs + roles.

    Each customer always gets a Checking FA. Optional children:

      - Savings (p=0.6)
      - Mortgage (p=0.35; family_building + established life stages only)
      - HELOC (p=0.20 conditional on Mortgage; no orphan HELOCs)
      - Auto Loan (p=0.40)
      - Personal Loan (p=0.15)

    The FA / FA-Role external-id sequences advance per emitted row, so
    customers consume a variable number of FA slots from the bundle's
    ``starting_seq`` window. Tens-of-millions safe via the 6-digit
    HYDRATE-FA-NNNNNN format and the per-persona ``starting_seq``
    namespacing the runner provides.
    """
    rng = random.Random(seed)
    faker = Faker("en_US")
    faker.seed_instance(seed)

    bundle = RetailBundle()

    states_pop = list(_STATE_WEIGHTS.keys())
    states_weights = list(_STATE_WEIGHTS.values())

    # Per-bundle FA / FA-Role counters so each emitted row gets a
    # globally-unique External_ID__c regardless of which optional
    # children fired for the customer.
    fa_idx = 0
    far_idx = 0

    for i in range(n):
        seq = starting_seq + i
        ext_id = f"HYDRATE-RT-{seq:06d}"

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

        # ---- Checking (always) ------------------------------------------
        balance = round(rng.uniform(500, 8000), 2)
        opened = anchor_date - timedelta(days=rng.randint(30, 365 * 5))
        chk_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
        chk_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
        fa_idx += 1
        far_idx += 1

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
            "External_ID__c": chk_fa_ext,
            "FinServ__SourceSystemId__c": chk_fa_ext,
        }
        fa = JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_fa)
        bundle.financial_accounts.append(fa)
        bundle.financial_account_roles.append(
            _primary_owner_role(chk_fa_ext, ext_id, opened, chk_far_ext)
        )

        # ---- Savings (p=0.6) --------------------------------------------
        if rng.random() < 0.6:
            sav_balance = round(rng.uniform(500, 25000), 2)
            sav_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            sav_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1
            logical_sav = {
                "Name": f"Cumulus Statement Savings - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c", "FinServ__FinancialAccountType__c", "Savings"),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-SAV-STM-2026.04",
                "FinServ__Status__c": "Open",
                "FinServ__OpenedDate__c": opened.isoformat(),
                "FinServ__Balance__c": sav_balance,
                "FinServ__APY__c": 0.0025,
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "External_ID__c": sav_fa_ext,
                "FinServ__SourceSystemId__c": sav_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_sav)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(sav_fa_ext, ext_id, opened, sav_far_ext)
            )

        # ---- Mortgage (p=0.35; family_building + established only) ------
        # Mortgage is also the gate for HELOC eligibility — the brief
        # explicitly forbids orphan HELOCs.
        has_mortgage = (
            life_stage in ("family_building", "established")
            and rng.random() < _MORTGAGE_PROB
        )
        if has_mortgage:
            principal = round(rng.uniform(180_000.0, 750_000.0), -2)
            balance = round(principal * rng.uniform(0.40, 0.95), 2)
            origination = anchor_date - timedelta(days=rng.randint(180, 365 * 25))
            maturity = origination + timedelta(days=365 * 30)

            mtg_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            mtg_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1

            logical_mortgage = {
                "Name": f"Cumulus First Mortgage - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Mortgage",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-MTG-2026.04",
                "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"
                ),
                "FinServ__OpenedDate__c": origination.isoformat(),
                "FinServ__MaturityDate__c": maturity.isoformat(),
                "FinServ__Balance__c": balance,
                "FinServ__LoanAmount__c": principal,
                "FinServ__InterestRate__c": round(rng.uniform(0.045, 0.075), 4),
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                # Phase 3a: subtype-bearing description anchors the Phase
                # 3d filter on ssot__Description__c.
                "FinServ__Description__c": (
                    "[Mortgage] 30-year fixed retail first mortgage; "
                    f"original principal ${int(principal):,}."
                ),
                # Defensive: dropped by preflight today (field doesn't
                # exist) but documents intent for a future schema add.
                "FinServ__LoanType__c": "Mortgage",
                "External_ID__c": mtg_fa_ext,
                "FinServ__SourceSystemId__c": mtg_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_mortgage)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(mtg_fa_ext, ext_id, origination, mtg_far_ext)
            )

            # ---- HELOC (p=0.20 GIVEN mortgage) --------------------------
            if rng.random() < _HELOC_PROB_GIVEN_MORTGAGE:
                limit = round(rng.uniform(25_000.0, 500_000.0), -2)
                drawn = round(limit * rng.uniform(0.0, 0.95), 2)
                opened_h = origination + timedelta(days=rng.randint(180, 365 * 5))
                if opened_h > anchor_date:
                    opened_h = anchor_date - timedelta(days=30)

                heloc_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
                heloc_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
                fa_idx += 1
                far_idx += 1

                logical_heloc = {
                    "Name": f"Cumulus HELOC - {rng.randint(1000, 9999)}",
                    "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                        "FinServ__FinancialAccount__c",
                        "FinServ__FinancialAccountType__c",
                        "HELOC",
                    ),
                    "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-HEL-2026.04",
                    "FinServ__Status__c": "Open",
                    "FinServ__OpenedDate__c": opened_h.isoformat(),
                    "FinServ__Balance__c": drawn,
                    # FinServ__TotalCreditLimit__c is the org's actual
                    # credit-limit field on FinancialAccount (verified via
                    # describe). Carries the HELOC line size; the
                    # RetailHelocDrawn__seg utilization filter will key off
                    # the (Balance / TotalCreditLimit) ratio.
                    "FinServ__TotalCreditLimit__c": limit,
                    "FinServ__InterestRate__c": round(rng.uniform(0.07, 0.105), 4),
                    "FinServ__OwnershipType__c": "Individual",
                    "FinServ__PrimaryOwner__c": ext_id,
                    "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                    "FinServ__Description__c": (
                        f"[HELOC] Retail line of credit; limit ${int(limit):,}, "
                        f"drawn ${int(drawn):,}."
                    ),
                    "FinServ__LoanType__c": "HELOC",
                    "External_ID__c": heloc_fa_ext,
                    "FinServ__SourceSystemId__c": heloc_fa_ext,
                }
                bundle.financial_accounts.append(
                    JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_heloc)
                )
                bundle.financial_account_roles.append(
                    _primary_owner_role(heloc_fa_ext, ext_id, opened_h, heloc_far_ext)
                )

        # ---- Auto Loan (p=0.40) -----------------------------------------
        if rng.random() < _AUTO_LOAN_PROB:
            principal = round(rng.uniform(8_000.0, 65_000.0), -2)
            balance = round(principal * rng.uniform(0.10, 0.95), 2)
            origination = anchor_date - timedelta(days=rng.randint(60, 365 * 6))
            term_years = rng.choice([3, 4, 5, 6])
            maturity = origination + timedelta(days=365 * term_years)

            auto_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            auto_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1

            logical_auto = {
                "Name": f"Cumulus Auto Loan - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Auto Loan",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-AUT-2026.04",
                "FinServ__Status__c": "Open",
                "FinServ__OpenedDate__c": origination.isoformat(),
                "FinServ__MaturityDate__c": maturity.isoformat(),
                "FinServ__Balance__c": balance,
                "FinServ__LoanAmount__c": principal,
                "FinServ__InterestRate__c": round(rng.uniform(0.055, 0.115), 4),
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "FinServ__Description__c": (
                    f"[Auto Loan] Retail vehicle loan; "
                    f"original principal ${int(principal):,}, "
                    f"{term_years}-year term."
                ),
                "FinServ__LoanType__c": "Auto Loan",
                "External_ID__c": auto_fa_ext,
                "FinServ__SourceSystemId__c": auto_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_auto)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(auto_fa_ext, ext_id, origination, auto_far_ext)
            )

        # ---- Personal Loan (p=0.15) -------------------------------------
        if rng.random() < _PERSONAL_LOAN_PROB:
            principal = round(rng.uniform(3_000.0, 40_000.0), -2)
            balance = round(principal * rng.uniform(0.15, 0.95), 2)
            origination = anchor_date - timedelta(days=rng.randint(30, 365 * 4))
            maturity = origination + timedelta(days=365 * rng.choice([2, 3, 4, 5]))

            pl_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            pl_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1

            logical_pl = {
                "Name": f"Cumulus Personal Loan - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Personal Loan",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-PRS-2026.04",
                "FinServ__Status__c": "Open",
                "FinServ__OpenedDate__c": origination.isoformat(),
                "FinServ__MaturityDate__c": maturity.isoformat(),
                "FinServ__Balance__c": balance,
                "FinServ__LoanAmount__c": principal,
                "FinServ__InterestRate__c": round(rng.uniform(0.085, 0.165), 4),
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "FinServ__Description__c": (
                    f"[Personal Loan] Retail unsecured installment loan; "
                    f"original principal ${int(principal):,}."
                ),
                "FinServ__LoanType__c": "Personal Loan",
                "External_ID__c": pl_fa_ext,
                "FinServ__SourceSystemId__c": pl_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_pl)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(pl_fa_ext, ext_id, origination, pl_far_ext)
            )

    return bundle


def _primary_owner_role(
    fa_ext: str, account_ext: str, start: date, role_ext: str,
) -> dict:
    """Build a Primary-Owner FinancialAccountRole row.

    Centralizes the role-row shape so every product branch above stays
    identical and we can't drift on (Role, Active, StartDate).
    """
    return {
        "FinServ__FinancialAccount__c": fa_ext,
        "FinServ__RelatedAccount__c": account_ext,
        "FinServ__Role__c": "Primary Owner",
        "FinServ__Active__c": True,
        "FinServ__StartDate__c": start.isoformat(),
        "External_ID__c": role_ext,
    }


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
