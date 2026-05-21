"""Commercial Account generator (Plan 2 / Task 11).

Emits one Business Account + 1-2 child FAs (Business Analyzed Checking
always, Commercial Real Estate Loan ~60%) + one FA Role per FA per
commercial customer. Same structural template as ``smb.py``, but with a
larger revenue band, capital-intensive industry weights, and treasury
complexity tiering.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import date, timedelta

from faker import Faker

from customer_hydration.fieldmap import JDO_FIELDMAP


# Commercial industry mix skews to capital-intensive verticals — the
# ones whose treasury / RE-loan needs justify a relationship manager.
_INDUSTRY_WEIGHTS = {
    "Manufacturing": 22,
    "Logistics": 18,
    "Healthcare Systems": 15,
    "Real Estate Holdings": 15,
    "Professional Services Mid-Market": 12,
    "Wholesale Distribution": 10,
    "Hospitality": 8,
}

_STATE_WEIGHTS = {
    "TX": 14, "CA": 12, "FL": 10, "NY": 9, "IL": 8, "PA": 6,
    "OH": 5, "GA": 5, "NC": 5, "MI": 4, "VA": 4, "NJ": 4,
    "WA": 4, "AZ": 4, "MA": 4, "TN": 3,
}


@dataclass
class CommercialBundle:
    """All rows produced for one batch of commercial customers."""

    accounts: list[dict] = field(default_factory=list)
    financial_accounts: list[dict] = field(default_factory=list)
    financial_account_roles: list[dict] = field(default_factory=list)


def generate_commercial(
    *,
    n: int,
    seed: int,
    starting_seq: int,
    rm_user_ids: list[str],
    anchor_date: date,
    business_rt_id: str,
) -> CommercialBundle:
    """Generate ``n`` Commercial Business Accounts + child FAs + roles.

    Each customer gets:
      - 1 Business Analyzed Checking FA (always; balance = 1-2mo revenue)
        — picklist type "Business Checking" (→ Deposits)
      - 1 Commercial Real Estate Loan FA at probability 0.6
        ($5M-$80M; type "Mortgage" → Loans)
    """
    rng = random.Random(seed)
    faker = Faker("en_US")
    faker.seed_instance(seed)

    bundle = CommercialBundle()

    industry_pop = list(_INDUSTRY_WEIGHTS.keys())
    industry_weights = list(_INDUSTRY_WEIGHTS.values())
    states_pop = list(_STATE_WEIGHTS.keys())
    states_weights = list(_STATE_WEIGHTS.values())

    fa_idx = 0
    far_idx = 0

    for i in range(n):
        seq = starting_seq + i
        ext_id = f"HYDRATE-COM-{seq:06d}"

        industry = rng.choices(industry_pop, weights=industry_weights, k=1)[0]

        # Lognormal revenue clamped to [$10M, $500M]. mu=17.0 ≈ $24M.
        rev_log = rng.gauss(17.0, 1.0)
        annual_revenue = max(10_000_000.0, min(500_000_000.0, math.exp(rev_log)))
        annual_revenue = round(annual_revenue, -3)

        # Employee count derived from revenue (rule of thumb: $100K/employee
        # for commercial), clamped to a realistic mid-market band.
        employee_count = max(200, min(5000, int(annual_revenue / 100_000)))

        years_in_business = rng.randint(8, 60)
        treasury_complexity = rng.choices(
            ["standard", "multi-bank", "global"], weights=[60, 30, 10]
        )[0]

        state = rng.choices(states_pop, weights=states_weights, k=1)[0]

        # Strip Faker's stock suffixes so we can attach a domain-aware one.
        base_name = faker.company().split(",")[0].split(" Inc")[0].strip()
        suffix = rng.choice(["Holdings", "Industries", "Group", "Corp", "Enterprises"])
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
                f"Commercial banking client in {industry}, "
                f"{employee_count} employees, ${int(annual_revenue):,} annual "
                f"revenue, {years_in_business} years in business. "
                f"Treasury complexity: {treasury_complexity}."
            ),
            "OwnerId": rng.choice(rm_user_ids),
            "FinServ__ClientCategory__c": "Commercial Banking",
            "External_ID__c": ext_id,
            "FinServ__SourceSystemId__c": ext_id,
        }
        bundle.accounts.append(JDO_FIELDMAP.apply("Account", logical_account))

        opened = anchor_date - timedelta(days=rng.randint(365, 365 * 12))

        # ---- Business Analyzed Checking (always) ------------------------
        checking_balance = round(annual_revenue / 12.0 * rng.uniform(1.0, 2.0), 2)
        chk_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
        chk_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
        fa_idx += 1
        far_idx += 1

        logical_checking = {
            "Name": f"Cumulus Business Analyzed Checking - {rng.randint(1000, 9999)}",
            "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                "FinServ__FinancialAccount__c",
                "FinServ__FinancialAccountType__c",
                "Business Checking",
            ),
            "FinServ__FinancialAccountSource__c": "Cumulus:PD-CHK-ANL-2026.04",
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

        # ---- Commercial Real Estate Loan (probability 0.6) --------------
        if rng.random() < 0.6:
            loan_amount = round(rng.uniform(5_000_000.0, 80_000_000.0), 2)
            loan_opened = anchor_date - timedelta(days=rng.randint(180, 365 * 8))
            loan_maturity = loan_opened + timedelta(days=365 * rng.randint(7, 25))

            loan_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            loan_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1

            logical_loan = {
                "Name": f"Cumulus CRE Loan - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Mortgage",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-CRE-2026.04",
                "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"
                ),
                "FinServ__OpenedDate__c": loan_opened.isoformat(),
                "FinServ__MaturityDate__c": loan_maturity.isoformat(),
                "FinServ__Balance__c": loan_amount,
                "FinServ__InterestRate__c": round(rng.uniform(0.05, 0.09), 4),
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
