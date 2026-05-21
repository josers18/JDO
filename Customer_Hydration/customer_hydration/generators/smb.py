"""Small Business Account generator (Plan 2 / Task 11).

Emits one Business Account + 1-2 child FAs (Business Checking always,
Term Loan ~60%) + one FA Role per FA per SMB customer.

Plan 2 does NOT emit Contact records here — Plan 3 owns multi-wave
Contact loading. The bundle structure leaves room for a future
``contacts: list[dict]`` field but it stays empty in Plan 2.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import date, timedelta

from faker import Faker

from customer_hydration.fieldmap import JDO_FIELDMAP


# Industry → "suffix" used to make generated company names look more
# domain-aware ("Acme Construction LLC" vs. just "Acme"). Same weights
# drive both the picklist value and the suffix selection.
_INDUSTRY_WEIGHTS = {
    "Restaurant": 18,
    "Construction": 15,
    "Professional Services": 14,
    "Retail Trade": 13,
    "Healthcare": 12,
    "Wholesale": 10,
    "Real Estate": 8,
}

_INDUSTRY_SUFFIXES = {
    "Restaurant": ["Restaurant", "Bistro", "Eatery", "Grill"],
    "Construction": ["Construction", "Builders", "Contractors"],
    "Professional Services": ["Group", "Partners", "Associates", "Consulting"],
    "Retail Trade": ["Retail", "Store", "Shop", "Outlet"],
    "Healthcare": ["Medical", "Health", "Clinic", "Practice"],
    "Wholesale": ["Wholesale", "Distribution", "Supply"],
    "Real Estate": ["Realty", "Properties", "Real Estate"],
}

_STATE_WEIGHTS = {
    "CA": 12, "TX": 12, "FL": 11, "NY": 8, "IL": 5, "PA": 4,
    "OH": 4, "GA": 4, "NC": 4, "MI": 3, "VA": 3, "NJ": 3,
    "WA": 3, "AZ": 3, "MA": 3,
}


@dataclass
class SmbBundle:
    """All rows produced for one batch of SMB customers."""

    accounts: list[dict] = field(default_factory=list)
    financial_accounts: list[dict] = field(default_factory=list)
    financial_account_roles: list[dict] = field(default_factory=list)


def generate_smb(
    *,
    n: int,
    seed: int,
    starting_seq: int,
    rm_user_ids: list[str],
    anchor_date: date,
    business_rt_id: str,
) -> SmbBundle:
    """Generate ``n`` SMB Business Accounts + child FAs + roles.

    Each customer gets:
      - 1 Business Checking FA (always; balance = 2-4mo revenue)
      - 1 Business Term Loan FA at probability 0.6 ($50K-$500K)

    The FA / FA-Role external-id sequences advance per emitted row.
    """
    rng = random.Random(seed)
    faker = Faker("en_US")
    faker.seed_instance(seed)

    bundle = SmbBundle()

    industry_pop = list(_INDUSTRY_WEIGHTS.keys())
    industry_weights = list(_INDUSTRY_WEIGHTS.values())
    states_pop = list(_STATE_WEIGHTS.keys())
    states_weights = list(_STATE_WEIGHTS.values())

    fa_idx = 0
    far_idx = 0

    for i in range(n):
        seq = starting_seq + i
        ext_id = f"HYDRATE-SMB-{seq:06d}"

        industry = rng.choices(industry_pop, weights=industry_weights, k=1)[0]
        suffix = rng.choice(_INDUSTRY_SUFFIXES[industry])

        # Lognormal revenue clamped to [$250K, $10M].
        rev_log = rng.gauss(13.5, 0.8)
        annual_revenue = max(250_000.0, min(10_000_000.0, math.exp(rev_log)))
        annual_revenue = round(annual_revenue, -2)

        # Employees scale with revenue (rule of thumb: $200K/employee),
        # then clamped to a realistic SMB band.
        employee_count = max(5, min(100, int(annual_revenue / 200_000)))

        years_in_business = rng.randint(1, 25)
        owner_age = rng.randint(30, 65)  # anchor only — no Person row in Plan 2

        state = rng.choices(states_pop, weights=states_weights, k=1)[0]

        # Use just the company "name root" and append a domain-aware
        # suffix so the result reads as a real SMB name.
        base_name = faker.company().split(",")[0].split(" Inc")[0].strip()
        company_name = f"{base_name} {suffix}"

        logical_account = {
            "RecordTypeId": business_rt_id,
            "Name": company_name,
            "AccountSource": "Hydration",
            "Industry": industry,
            "AnnualRevenue": annual_revenue,
            "NumberOfEmployees": employee_count,
            "YearStarted": str(anchor_date.year - years_in_business),
            "Phone": faker.phone_number(),
            "Website": faker.domain_name(),
            "BillingStreet": faker.street_address(),
            "BillingCity": faker.city(),
            "BillingState": state,
            "BillingPostalCode": faker.zipcode_in_state(state_abbr=state),
            "BillingCountry": "US",
            "Description": (
                f"Small business in {industry}, {employee_count} employees, "
                f"${int(annual_revenue):,} annual revenue, "
                f"{years_in_business} years in business "
                f"(owner age ~{owner_age})."
            ),
            "OwnerId": rng.choice(rm_user_ids),
            "FinServ__ClientCategory__c": "Small Business",
            "External_ID__c": ext_id,
            "FinServ__SourceSystemId__c": ext_id,
        }
        bundle.accounts.append(JDO_FIELDMAP.apply("Account", logical_account))

        opened = anchor_date - timedelta(days=rng.randint(180, 365 * 8))

        # ---- Business Checking (always) ---------------------------------
        checking_balance = round(annual_revenue / 12.0 * rng.uniform(2.0, 4.0), 2)
        chk_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
        chk_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
        fa_idx += 1
        far_idx += 1

        logical_checking = {
            "Name": f"Cumulus Business Checking - {rng.randint(1000, 9999)}",
            "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c",
                "FinServ__FinancialAccountType__c",
                "Business Checking",
            ),
            "FinServ__FinancialAccountSource__c": "Cumulus:PD-CHK-BIZ-2026.04",
            "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"
            ),
            "FinServ__OpenedDate__c": opened.isoformat(),
            "FinServ__Balance__c": checking_balance,
            "FinServ__InterestRate__c": 0.0005,
            "FinServ__APY__c": 0.0005,
            "FinServ__OwnershipType__c": "Individual",
            "FinServ__PrimaryOwner__c": ext_id,
            "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
            "External_ID__c": chk_fa_ext,
            "FinServ__SourceSystemId__c": chk_fa_ext,
        }
        bundle.financial_accounts.append(
            JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_checking)
        )
        bundle.financial_account_roles.append(
            {
                "FinServ__FinancialAccount__c": chk_fa_ext,
                "FinServ__RelatedAccount__c": ext_id,
                "FinServ__Role__c": "Primary Owner",
                "FinServ__Active__c": True,
                "FinServ__StartDate__c": opened.isoformat(),
                "External_ID__c": chk_far_ext,
            }
        )

        # ---- Business Term Loan (probability 0.6) -----------------------
        if rng.random() < 0.6:
            loan_amount = round(rng.uniform(50_000.0, 500_000.0), 2)
            loan_opened = anchor_date - timedelta(days=rng.randint(60, 365 * 5))
            loan_maturity = loan_opened + timedelta(days=365 * rng.randint(3, 10))

            loan_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            loan_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1

            logical_loan = {
                "Name": f"Cumulus Business Term Loan - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Term Loan",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-TRM-2026.04",
                "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"
                ),
                "FinServ__OpenedDate__c": loan_opened.isoformat(),
                # Renamed by fieldmap → FinServ__LoanEndDate__c
                "FinServ__MaturityDate__c": loan_maturity.isoformat(),
                "FinServ__Balance__c": loan_amount,
                "FinServ__InterestRate__c": round(rng.uniform(0.06, 0.11), 4),
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "External_ID__c": loan_fa_ext,
                "FinServ__SourceSystemId__c": loan_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_loan)
            )
            bundle.financial_account_roles.append(
                {
                    "FinServ__FinancialAccount__c": loan_fa_ext,
                    "FinServ__RelatedAccount__c": ext_id,
                    "FinServ__Role__c": "Primary Owner",
                    "FinServ__Active__c": True,
                    "FinServ__StartDate__c": loan_opened.isoformat(),
                    "External_ID__c": loan_far_ext,
                }
            )

    return bundle
