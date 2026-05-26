"""Commercial Account generator.

Emits one Business Account + 1-N child FAs (Business Analyzed Checking
always, plus optional Treasury Services / Term Loan / Commercial Line
of Credit, plus the original CRE Loan branch) + one FA Role per FA per
commercial customer. Same structural template as ``smb.py``, but with a
larger revenue band, capital-intensive industry weights, and treasury
complexity tiering.

Phase 3a additions
------------------
The original Plan 2 generator only emitted Checking + an optional CRE
Loan. The CommercialWithTreasury__seg / Commercial-loan placeholder
segments need a richer product set so Phase 3d can tighten on subtype
tokens. New optional products:

  - Treasury Services (p=0.70) — wrapper FA whose
    FinServ__FinancialAccountType__c = "Treasury Management" (the org
    picklist value). The CommercialWithTreasury__seg filter will key
    off ssot__FinancialAccountType__c == "Treasury Management".
  - Term Loan (p=0.40) — generic mid-market term loan
  - Commercial Line of Credit (p=0.40) — revolving, larger limits than
    the SMB LoC

The legacy CRE Loan branch is kept (probability lowered slightly) for
continuity with the original commercial book shape.
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


_TREASURY_PROB = 0.70
_TERM_LOAN_PROB = 0.40
_COMMERCIAL_LOC_PROB = 0.40
_CRE_LOAN_PROB = 0.40  # was 0.60 in Plan 2; lowered to spread book


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

    Each customer always gets one Business Analyzed Checking FA. Optional
    products (independent draws):

      - Treasury Services (p=0.70; FinancialAccountType="Treasury Management")
      - Term Loan         (p=0.40)
      - Commercial LOC    (p=0.40)
      - CRE Loan          (p=0.40; legacy Plan 2 product, retained)
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

        # ---- Treasury Services (p=0.70) ---------------------------------
        # FinancialAccountType="Treasury Management" — this is the field
        # CommercialWithTreasury__seg will filter on after Phase 3d.
        if rng.random() < _TREASURY_PROB:
            treasury_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            treasury_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1
            services = rng.sample(
                ["Lockbox", "ZBA", "Sweep", "Positive Pay", "Wire Transfer", "ACH"],
                k=rng.randint(2, 4),
            )
            logical_treasury = {
                "Name": f"Cumulus Treasury Services - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Treasury Services",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-TM-SVC-2026.04",
                "FinServ__Status__c": "Open",
                "FinServ__OpenedDate__c": opened.isoformat(),
                # Treasury Services is a service wrapper, not a balance
                # product — set Balance__c to 0 to keep DC ingest happy.
                "FinServ__Balance__c": 0.0,
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "FinServ__Description__c": (
                    "[Treasury Services] Commercial treasury-management bundle; "
                    f"complexity={treasury_complexity}; services="
                    f"{', '.join(services)}."
                ),
                # Not a loan — leave LoanType unset.
                "External_ID__c": treasury_fa_ext,
                "FinServ__SourceSystemId__c": treasury_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_treasury)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(treasury_fa_ext, ext_id, opened, treasury_far_ext)
            )

        # ---- Commercial Term Loan (p=0.40) ------------------------------
        if rng.random() < _TERM_LOAN_PROB:
            principal = round(rng.uniform(500_000.0, 25_000_000.0), -3)
            balance = round(principal * rng.uniform(0.20, 0.95), 2)
            loan_opened = anchor_date - timedelta(days=rng.randint(180, 365 * 8))
            loan_maturity = loan_opened + timedelta(days=365 * rng.randint(5, 15))
            tl_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            tl_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1
            logical_tl = {
                "Name": f"Cumulus Commercial Term Loan - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Term Loan",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-CTL-2026.04",
                "FinServ__Status__c": "Open",
                "FinServ__OpenedDate__c": loan_opened.isoformat(),
                "FinServ__MaturityDate__c": loan_maturity.isoformat(),
                "FinServ__Balance__c": balance,
                "FinServ__LoanAmount__c": principal,
                "FinServ__InterestRate__c": round(rng.uniform(0.045, 0.085), 4),
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "FinServ__Description__c": (
                    f"[Term Loan] Commercial mid-market term loan; "
                    f"original principal ${int(principal):,}."
                ),
                "FinServ__LoanType__c": "Term Loan",
                "External_ID__c": tl_fa_ext,
                "FinServ__SourceSystemId__c": tl_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_tl)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(tl_fa_ext, ext_id, loan_opened, tl_far_ext)
            )

        # ---- Commercial Line of Credit (p=0.40) -------------------------
        if rng.random() < _COMMERCIAL_LOC_PROB:
            limit = round(rng.uniform(1_000_000.0, 50_000_000.0), -4)
            drawn = round(limit * rng.uniform(0.0, 0.85), 2)
            loc_opened = anchor_date - timedelta(days=rng.randint(180, 365 * 6))
            loc_fa_ext = f"HYDRATE-FA-{starting_seq + fa_idx:06d}"
            loc_far_ext = f"HYDRATE-FAR-{starting_seq + far_idx:06d}"
            fa_idx += 1
            far_idx += 1
            logical_loc = {
                "Name": f"Cumulus Commercial Line of Credit - {rng.randint(1000, 9999)}",
                "FinServ__FinancialAccountType__c": JDO_FIELDMAP.picklist_value(
                    "FinServ__FinancialAccount__c",
                    "FinServ__FinancialAccountType__c",
                    "Commercial LOC",
                ),
                "FinServ__FinancialAccountSource__c": "Cumulus:PD-LN-CLC-2026.04",
                "FinServ__Status__c": "Open",
                "FinServ__OpenedDate__c": loc_opened.isoformat(),
                "FinServ__Balance__c": drawn,
                "FinServ__TotalCreditLimit__c": limit,
                "FinServ__InterestRate__c": round(rng.uniform(0.055, 0.115), 4),
                "FinServ__OwnershipType__c": "Individual",
                "FinServ__PrimaryOwner__c": ext_id,
                "FinServ__FinancialAccountNumber__c": f"****{rng.randint(1000, 9999)}",
                "FinServ__Description__c": (
                    f"[Commercial LOC] Commercial revolving line; "
                    f"limit ${int(limit):,}, drawn ${int(drawn):,}."
                ),
                "FinServ__LoanType__c": "Commercial LOC",
                "External_ID__c": loc_fa_ext,
                "FinServ__SourceSystemId__c": loc_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_loc)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(loc_fa_ext, ext_id, loc_opened, loc_far_ext)
            )

        # ---- Commercial Real Estate Loan (p=0.40, legacy) ---------------
        if rng.random() < _CRE_LOAN_PROB:
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
                "FinServ__Description__c": (
                    f"[Mortgage] Commercial Real Estate loan; "
                    f"original principal ${int(loan_amount):,}."
                ),
                "FinServ__LoanType__c": "Mortgage",
                "External_ID__c": loan_fa_ext,
                "FinServ__SourceSystemId__c": loan_fa_ext,
            }
            bundle.financial_accounts.append(
                JDO_FIELDMAP.apply("FinServ__FinancialAccount__c", logical_loan)
            )
            bundle.financial_account_roles.append(
                _primary_owner_role(loan_fa_ext, ext_id, loan_opened, loan_far_ext)
            )

    return bundle


def _primary_owner_role(
    fa_ext: str, account_ext: str, start: date, role_ext: str,
) -> dict:
    """Build a Primary-Owner FinancialAccountRole row."""
    return {
        "FinServ__FinancialAccount__c": fa_ext,
        "FinServ__RelatedAccount__c": account_ext,
        "FinServ__Role__c": "Primary Owner",
        "FinServ__Active__c": True,
        "FinServ__StartDate__c": start.isoformat(),
        "External_ID__c": role_ext,
    }
