"""Small Business Account generator.

Emits one Business Account + 1-N child FAs (Business Checking always,
plus optional SBA Loan / Term Loan / Line of Credit) + one FA Role per
FA per SMB customer.

Plan 2 added the Term-Loan subtype only. Phase 3a expanded that to the
three loan products the SmbWithSba__seg / business-loan placeholder
segments need to tighten in Phase 3d:

  - SBA Loan (p=0.50) — feeds SmbWithSba__seg
  - Term Loan (p=0.30) — generic SMB working-capital loan
  - Line of Credit (p=0.40) — revolving SMB credit

All three roll up to the FSC ``FinServ__FinancialAccountType__c`` =
"Loans" picklist value; the subtype distinction is encoded in the FA
``Name`` and ``FinServ__Description__c`` fields, both of which flow
through to ``ssot__FinancialAccount__dlm`` so Phase 3d segment criteria
can filter on a stable substring.

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


_SBA_LOAN_PROB = 0.50
_TERM_LOAN_PROB = 0.30
_LINE_OF_CREDIT_PROB = 0.40


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

    Each customer always gets one Business Checking FA. Optional loans
    (independent draws):

      - SBA Loan        (p=0.50; $25K-$5M, SBA 7(a) flavor)
      - Term Loan       (p=0.30; $50K-$500K)
      - Line of Credit  (p=0.40; revolving, $25K-$300K)

    The FA / FA-Role external-id sequences advance per emitted row, NOT
    per customer — each emitted product consumes a slot from the
    persona's starting_seq window.
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

        # ---- SBA Loan (p=0.50) -------------------------------------------
        # SBA 7(a) shape: longer term, government-guaranteed, larger
        # amounts than a generic term loan. SmbWithSba__seg is the
        # primary downstream consumer — it filters on the [SBA Loan]
        # description token via ssot__Description__c.
        if rng.random() < _SBA_LOAN_PROB:
            principal = round(rng.uniform(25_000.0, 5_000_000.0), -2)
            balance = round(principal * rng.uniform(0.20, 0.95), 2)
            loan_opened = anchor_date - timedelta(days=rng.randint(60, 365 * 8))
            loan_maturity = loan_opened + timedelta(days=365 * rng.randint(7, 25))
            sba_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            sba_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1
            logical_sba = {
                "Name": f"Cumulus SBA 7(a) Loan - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "SBA Loan",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-SBA-2026.04",
                "FinServ__Status__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c", "FinServ__Status__c", "Active"
                ),
                "FinServ__OpenedDate__c": loan_opened.isoformat(),
                "FinServ__MaturityDate__c": loan_maturity.isoformat(),
                "FinServ__Balance__c": balance,
                "FinServ__LoanAmount__c": principal,
                "FinServ__InterestRate__c": round(rng.uniform(0.055, 0.105), 4),
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "FinServ__Description__c": (
                    f"[SBA Loan] SBA 7(a)-style small-business term loan; "
                    f"original principal ${int(principal):,}."
                ),
                "FinServ__LoanType__c": "SBA Loan",
                "External_ID__c": sba_fa_ext,
                "FinServ__SourceSystemId__c": sba_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_sba)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(sba_fa_ext, ext_id, loan_opened, sba_far_ext)
            )

        # ---- Business Term Loan (p=0.30) --------------------------------
        if rng.random() < _TERM_LOAN_PROB:
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
                "FinServ__Description__c": (
                    f"[Term Loan] Generic SMB working-capital term loan; "
                    f"original principal ${int(loan_amount):,}."
                ),
                "FinServ__LoanType__c": "Term Loan",
                "External_ID__c": loan_fa_ext,
                "FinServ__SourceSystemId__c": loan_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_loan)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(loan_fa_ext, ext_id, loan_opened, loan_far_ext)
            )

        # ---- Business Line of Credit (p=0.40) ---------------------------
        if rng.random() < _LINE_OF_CREDIT_PROB:
            limit = round(rng.uniform(25_000.0, 300_000.0), -2)
            drawn = round(limit * rng.uniform(0.0, 0.85), 2)
            loc_opened = anchor_date - timedelta(days=rng.randint(60, 365 * 6))
            loc_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            loc_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1
            logical_loc = {
                "Name": f"Cumulus Business Line of Credit - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Line of Credit",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-LOC-2026.04",
                "FinServ__Status__c": "Open",
                "FinServ__OpenedDate__c": loc_opened.isoformat(),
                "FinServ__Balance__c": drawn,
                "FinServ__TotalCreditLimit__c": limit,
                "FinServ__InterestRate__c": round(rng.uniform(0.075, 0.13), 4),
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "FinServ__Description__c": (
                    f"[Line of Credit] SMB revolving line; limit ${int(limit):,}, "
                    f"drawn ${int(drawn):,}."
                ),
                "FinServ__LoanType__c": "Line of Credit",
                "External_ID__c": loc_fa_ext,
                "FinServ__SourceSystemId__c": loc_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_loc)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(loc_fa_ext, ext_id, loc_opened, loc_far_ext)
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
