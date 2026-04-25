"""Cumulus Business Term Loans — commercial segment."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "06_Business_Loans"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Business_Term_Loans.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Business Term Loans",
        product_code="BL-TRM-2026.04",
        category="Commercial Lending",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Business Term Loans",
        lede=("Fixed-rate, fully-amortizing commercial loans that finance "
              "expansion, acquisition, working-capital strengthening, and "
              "long-lived asset purchases — underwritten on cash-flow and "
              "structured with flexible collateral."),
        summary_rows=[
            ("Product type", "Fixed-rate, fully-amortizing commercial term loan"),
            ("Loan amounts", "$50,000 – $5,000,000"),
            ("Terms", "1 – 10 years"),
            ("Rate range (APR)", "7.50% – 11.50% fixed"),
            ("Amortization", "Fully amortizing; no balloon"),
            ("Use of proceeds", "Working capital, expansion, acquisition, refinance"),
            ("Collateral", "Blanket UCC-1 typical; real estate / equipment where applicable"),
            ("Covenants", "DSCR, TNW, leverage, reporting (see underwriting)"),
        ],
        category_label="PRODUCT BROCHURE  ·  COMMERCIAL LENDING",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Cumulus Business Term Loan is a closed-end, fixed-rate commercial "
        "installment loan structured with a defined amortization schedule "
        "and a fixed maturity. Term loans are underwritten on the "
        "borrower's cash flow and supported by a blanket UCC-1 on business "
        "assets; additional collateral may include commercial real estate, "
        "titled equipment, securities, or a pledge of ownership interests. "
        "Terms and structure are matched to the economic life of the "
        "financed asset or initiative, with maturities from one to ten years."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a term loan"))
    story.append(B.feature_grid([
        ("Rate certainty for the life of the loan",
         "Fixed APR for the entire term — 1 to 10 years — removes rate risk "
         "from planning and budgeting cycles."),
        ("Flexible amounts",
         "Commitments from $50,000 for established small businesses up to "
         "$5,000,000 for middle-market borrowers."),
        ("Use-agnostic proceeds",
         "Eligible uses include acquisitions, expansion capex, working "
         "capital strengthening, equity buyouts, and refinance of existing "
         "commercial debt."),
        ("Matched amortization",
         "Amortization schedule structured to the economic life of the "
         "asset or initiative financed — preserves operating cash flow."),
        ("Cumulus Relationship Manager",
         "A single Relationship Manager coordinates credit, treasury, "
         "deposits, and merchant services; expedited decisioning on "
         "straightforward requests."),
        ("Prepayment flexibility",
         "Prepayment permitted with a declining prepayment-protection "
         "schedule; fully open in the final year of the term."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # RATES
    story.append(B.section_header("Rate and structure matrix",
                                  kicker="Pricing"))
    story.append(B.body_para(
        "Rates are fixed at funding based on borrower risk grade, term, "
        "collateral coverage, and depository relationship. The matrix "
        "below is illustrative; the rate offered to an individual borrower "
        "is determined at underwriting."
    ))
    story.append(B.data_table(
        header=["Risk grade  ·  depository relationship",
                "3-year term", "5-year term", "7-year term", "10-year term"],
        rows=[
            ["Risk grade 1–2  ·  full treasury + operating deposits",
             "7.50%", "7.75%", "8.00%", "8.25%"],
            ["Risk grade 3  ·  operating deposit relationship",
             "8.00%", "8.25%", "8.50%", "8.75%"],
            ["Risk grade 4  ·  partial deposit relationship",
             "8.75%", "9.00%", "9.25%", "9.50%"],
            ["Risk grade 5  ·  new client",
             "9.50%", "9.75%", "10.00%", "10.25%"],
            ["Risk grade 6  ·  elevated leverage / sector risk",
             "10.25%", "10.50%", "10.75%", "11.00%"],
            ["Risk grade 7  ·  specialty / stretch structure",
             "10.75%", "11.00%", "11.25%", "11.50%"],
        ],
        col_widths=[2.4 * inch, 1.1 * inch, 1.1 * inch, 1.1 * inch, 1.1 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.data_table(
        header=["Fee", "Amount", "Notes"],
        rows=[
            ["Origination fee", "0.50% – 1.00% of commitment",
             "Netted at funding; capitalized to loan balance by election."],
            ["Documentation fee", "$750 – $2,500",
             "Legal, lien search, UCC filing, title, and recording costs."],
            ["Late-payment charge", "5.00% of the unpaid installment",
             "Assessed after a 10-day cure period."],
            ["Prepayment protection",
             "5-4-3-2-1 declining schedule",
             "Percent of amount prepaid in years 1 through 5; no charge "
             "in year 6 and thereafter."],
            ["Amendment / modification fee", "$1,000 – $5,000",
             "Covers legal review of amendments, reaffirmations, and waivers."],
        ],
        col_widths=[2.2 * inch, 1.8 * inch, 3.3 * inch],
    ))

    # AMORTIZATION CHART
    story.append(B.section_header("Illustrative principal and interest",
                                  kicker="Amortization"))
    story.append(B.body_para(
        "The illustration below shows cumulative principal repayment and "
        "interest expense for a $1,500,000 commercial term loan at 8.50% "
        "APR over a seven-year amortization. Interest expense is "
        "front-loaded; principal repayment accelerates over the term."
    ))
    story.append(B.amortization_chart(
        principal=1_500_000, apr=8.50, years=7,
        title="$1,500,000 term loan at 8.50% APR, 7-year fully-amortizing",
    ))

    # UNDERWRITING
    story.append(B.section_header("Underwriting and documentation",
                                  kicker="Credit and legal"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Underwriting parameters"),
            *B.bullet_list([
                "Minimum debt-service-coverage ratio (DSCR) of <b>1.25x</b> on "
                "a trailing-twelve-month basis and on a two-year forecast.",
                "Maximum funded-debt-to-EBITDA leverage of <b>3.50x</b> "
                "(adjusted for pro-forma acquisitions).",
                "Minimum tangible-net-worth covenant calibrated to starting "
                "TNW less permitted distributions.",
                "Minimum two years of operating history; exceptions for "
                "change-of-control financings supported by sponsor equity.",
                "Personal guarantee from 20%+ owners; collateral review for "
                "each guarantor of material balance.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Three years of CPA-reviewed or audited business financial "
                "statements; current interim (most recent month or quarter).",
                "Three years of business and personal federal tax returns "
                "(with all K-1s and schedules) for borrower and each "
                "guarantor.",
                "Current Accounts Receivable aging and Accounts Payable "
                "aging (if AR/AP is material).",
                "Rolling 13-week cash-flow forecast for the next 12 months.",
                "Corporate formation documents, operating agreement, and "
                "authorizing resolution.",
                "Property appraisal and environmental Phase I for CRE-secured "
                "facilities; equipment appraisal for specialized collateral.",
            ]),
        ],
    ))

    # HOW IT WORKS
    story.append(B.section_header("Process and timeline",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Initial discussion",
             "Relationship Manager scopes use of proceeds, structure "
             "preferences, and timing.",
             "Days 1–5"],
            ["2  ·  Term sheet",
             "Non-binding indicative term sheet issued with amount, rate, "
             "term, collateral, covenants, and fees.",
             "Days 5–10"],
            ["3  ·  Formal application",
             "Client submits financial package; Cumulus completes credit "
             "analysis, collateral review, and risk rating.",
             "Days 10–25"],
            ["4  ·  Credit approval",
             "Credit Committee approval; commitment letter issued.",
             "Days 25–30"],
            ["5  ·  Documentation",
             "Loan agreement, promissory note, security agreement, "
             "UCC-1, guaranties, and any real-estate / mortgage documents "
             "prepared and executed.",
             "Days 30–45"],
            ["6  ·  Funding",
             "Proceeds disbursed via wire or internal transfer to "
             "borrower's operating account; first-payment date scheduled.",
             "Day 45"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # COVENANTS
    story.append(B.section_header("Covenants and reporting",
                                  kicker="Ongoing obligations"))
    story.append(B.data_table(
        header=["Covenant type", "Representative covenants", "Tested"],
        rows=[
            ["Financial covenants",
             "DSCR ≥ 1.25x; Funded debt / EBITDA ≤ 3.50x; Minimum TNW "
             "calibrated to starting TNW.",
             "Annually (audit) + quarterly (compliance certificate)"],
            ["Affirmative covenants",
             "Maintain existence, qualifications, insurance, tax status; "
             "deliver financials, tax returns, and compliance certificates.",
             "Continuous"],
            ["Negative covenants",
             "Limitations on additional debt, liens, investments, "
             "acquisitions, dispositions, distributions, and transactions "
             "with affiliates.",
             "Continuous"],
            ["Reporting",
             "Annual CPA-reviewed or audited financials within 120 days of "
             "fiscal year end; quarterly management-prepared financials "
             "within 45 days of quarter end; annual budget at fiscal year start.",
             "Ongoing"],
            ["Depository",
             "Borrower maintains primary operating account(s) at Cumulus "
             "during the term of the loan.",
             "Continuous"],
        ],
        col_widths=[1.6 * inch, 4.2 * inch, 1.5 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Cumulus Credit Partnership",
        "Cumulus treats covenants as a partnership tool, not a trap. Your "
        "Relationship Manager reviews covenant compliance with you "
        "quarterly, flags potential trends early, and works with Credit "
        "Administration on waivers or amendments where circumstances "
        "warrant, including covenant reset at favorable trigger events.",
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How long will underwriting take?",
         "A complete file — current financials, tax returns, AR / AP aging, "
         "and corporate documents — is typically decisioned within 15 to 25 "
         "business days from receipt. Complex structures, acquisitions, and "
         "real-estate-secured transactions may run longer due to appraisal "
         "and environmental review timing."),
        ("What collateral will you take?",
         "A blanket UCC-1 on substantially all business assets is typical. "
         "Real estate, titled equipment, pledged securities, and "
         "ownership-interest pledges may be required depending on loan "
         "amount and risk grade. Cumulus will explicitly outline collateral "
         "requirements in the term sheet."),
        ("Is a personal guarantee required?",
         "Cumulus generally requires a personal guarantee from each owner "
         "holding 20% or more of the borrower. Exceptions are considered "
         "for investment-grade corporate borrowers and institutional sponsors."),
        ("Can we prepay without penalty?",
         "Prepayment is permitted at any time. A declining 5-4-3-2-1 "
         "prepayment-protection fee applies in years 1 through 5; no fee "
         "in year 6 and thereafter. Partial prepayments are generally "
         "permitted without fee up to 20% of original principal per year."),
        ("How is the rate locked?",
         "The rate may be floated to funding, or locked at term-sheet "
         "acceptance for up to 45 days subject to a rate-lock fee. For "
         "longer lock periods, Cumulus offers a forward-rate lock through "
         "its Capital Markets desk."),
        ("Can the loan be converted to floating?",
         "Yes. Cumulus offers interest-rate swaps through its Capital "
         "Markets desk that convert a fixed-rate term loan to floating "
         "(and vice-versa), subject to ISDA documentation and credit limits."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    # DISCLOSURES
    story += B.disclosure_block(
        "Important disclosures",
        B.STANDARD_LENDING_DISCLOSURES + [
            "Rates shown are illustrative and do not constitute an offer to "
            "extend credit. All extensions of credit are subject to Cumulus "
            "Bank's credit underwriting standards, collateral review, and "
            "execution of definitive documentation satisfactory to the Bank.",
            "Commercial loans are not consumer credit and are not subject "
            "to the Truth in Lending Act, the Real Estate Settlement "
            "Procedures Act, or Regulation Z except to the limited extent "
            "those regulations apply to any commercial lending.",
            "Interest-rate swaps and derivative products are offered "
            "through Cumulus Capital Markets LLC, an affiliated registered "
            "swap dealer. Derivatives carry material risks and are not "
            "suitable for all clients.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
