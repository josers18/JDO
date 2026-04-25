"""Cumulus HELOAN — retail brochure (fixed-rate home equity installment)."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "02_Personal_Loans"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_HELOAN.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus HELOAN",
        product_code="PL-HEL-LOA-2026.04",
        category="Personal Loans",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Home Equity Loan",
        lede=("A fixed-rate, second-lien home equity installment loan "
              "that delivers the proceeds up front and a predictable "
              "payment for the life of the loan."),
        summary_rows=[
            ("Product type", "Fixed-rate closed-end 2nd-lien home equity loan"),
            ("Loan amounts", "$25,000 – $500,000"),
            ("Terms available", "5, 10, 15, or 20 years"),
            ("APR range", "7.49% – 10.99% APR"),
            ("Max CLTV", "85%"),
            ("Property types", "1–4 unit primary and 1-unit second home"),
            ("Origination fee", "None"),
            ("Prepayment penalty", "None"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL LOANS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus Home Equity Loan (HELOAN) is a fixed-rate, closed-"
        "end second-lien loan. The full loan amount is disbursed at "
        "closing and repaid over a 5-, 10-, 15-, or 20-year term in "
        "equal monthly payments of principal and interest. It's ideal "
        "for a one-time, known-amount need: a single major home "
        "renovation, consolidation of higher-rate debt, or funding a "
        "specific life event. Because the rate and term are fixed, the "
        "monthly payment does not change."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a Cumulus HELOAN"))
    story.append(B.feature_grid([
        ("Fixed rate for life of loan",
         "Your APR and monthly payment are set at closing and do not "
         "change — no exposure to rising interest rates."),
        ("Lump sum at closing",
         "Receive the full loan amount at closing. Ideal for a single "
         "large expense with a known cost."),
        ("Terms up to 20 years",
         "Spread repayment across 5, 10, 15, or 20 years to match your "
         "cash flow. Longer terms lower the monthly payment."),
        ("Amounts up to $500,000",
         "Borrow $25,000 – $500,000 against the equity in your home."),
        ("No origination fee",
         "Zero origination fee. Cumulus pays most closing costs on "
         "HELOANs up to $500,000 if the loan remains open 36 months."),
        ("Potential tax advantages",
         "Interest on funds used to buy, build, or substantially improve "
         "the home securing the loan may be deductible — consult your "
         "tax advisor."),
    ], cols=2))

    # --------------------------------------------------------------- RATES
    story.append(B.section_header("Representative rates",
                                  kicker="APR by term and CLTV"))
    story.append(B.body_para(
        "Rates shown are representative for well-qualified borrowers on "
        "an owner-occupied primary residence with excellent credit, a "
        "combined loan-to-value at or below the tier cap, and the 0.25% "
        "automatic-payment APR discount. Your actual rate will be "
        "disclosed on your pre-approval and on your Regulation Z / X "
        "Loan Estimate and Closing Disclosure."
    ))

    story.append(B.data_table(
        header=["Term", "APR (excellent credit)", "Max CLTV", "Monthly payment ($100,000 loan)"],
        rows=[
            ["5 years", "7.49% APR", "85%", "$2,003.41"],
            ["10 years", "8.24% APR", "85%", "$1,227.99"],
            ["15 years", "8.74% APR", "85%", "$997.29"],
            ["20 years", "9.24% APR", "85%", "$912.21"],
            ["15 years  ·  near floor / higher CLTV", "10.99% APR", "85%", "$1,136.71"],
        ],
        col_widths=[2.6 * inch, 1.7 * inch, 0.9 * inch, 2.1 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative principal vs. interest"))
    story.append(B.amortization_chart(
        principal=100_000, apr=8.74, years=15,
        title="$100,000 HELOAN at 8.74% APR over 15 years — cumulative principal and interest",
    ))

    story.append(B.callout_box(
        "HELOAN or HELOC?",
        "A HELOAN makes sense when you have a one-time, known-dollar-"
        "amount need and want the certainty of a fixed rate and fixed "
        "payment. A HELOC makes sense when you need flexible, ongoing "
        "access to funds over time at a variable rate. Both are secured "
        "by your home, and many homeowners hold both — a HELOAN for a "
        "completed project and a HELOC for future flexibility.",
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Fees and closing costs",
                                  kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Item", "Detail"],
        rows=[
            ["Application fee", "None"],
            ["Origination fee", "None"],
            ["Autopay discount", "0.25% APR reduction for automatic payment from a Cumulus deposit account"],
            ["Cumulus-paid closing costs", "Appraisal, title, recording, and flood determination paid by Cumulus on loans up to $500,000 if the loan remains open 36 months"],
            ["Early closure recoupment", "If the loan is paid off within 36 months, Cumulus-paid closing costs are recovered at payoff"],
            ["Prepayment penalty", "None beyond the 36-month closing-cost recoupment"],
            ["Late payment fee", "5% of past-due amount, maximum $50"],
            ["Returned payment fee", "$15"],
            ["Flood determination fee", "Pass-through (typically $12 – $25)"],
            ["Recording / release fee", "Pass-through at county rate"],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- UNDERWRITING
    story.append(B.section_header("Eligibility and underwriting",
                                  kicker="How we review your application"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who qualifies"),
            *B.bullet_list([
                "U.S. citizens, lawful permanent residents, and qualifying "
                "resident aliens age 18 or older.",
                "Property: owner-occupied 1–4 unit primary or 1-unit second "
                "home. Investment properties not eligible on this product.",
                "Minimum FICO score of 680.",
                "Maximum CLTV of 85%.",
                "DTI ≤ 45% post-close.",
                "Two years of continuous employment or self-employment.",
                "Clean title; no open IRS or state tax liens.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Government-issued photo ID and Social Security Number.",
                "Two most recent pay stubs; two years of W-2 or tax returns.",
                "Most recent mortgage statement.",
                "Evidence of homeowners insurance.",
                "Title report, property appraisal, and flood-zone "
                "determination (ordered by Cumulus).",
                "If married in community-property state, non-borrowing "
                "spouse may need to join on the mortgage.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How it works", kicker="Step by step"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Apply and lock",
             "Apply online, in the app, or with a Cumulus Home Lending "
             "specialist. Lock your rate at application or up to closing.",
             "30 minutes"],
            ["2  ·  Disclosures",
             "Receive Loan Estimate (TRID) within 3 business days of "
             "application. Includes APR, estimated payment, and fees.",
             "3 business days"],
            ["3  ·  Appraisal and title",
             "Cumulus orders appraisal, title, and flood determination. "
             "Underwriter issues conditional approval.",
             "2–3 weeks"],
            ["4  ·  Close",
             "Sign at home, branch, or title company. Receive Closing "
             "Disclosure at least 3 business days before closing.",
             "30 days from application (typical)"],
            ["5  ·  Disbursement",
             "Funds disbursed to your Cumulus deposit account or to "
             "designated payoff creditors after 3-day rescission.",
             "Day 4 after close"],
        ],
        col_widths=[1.4 * inch, 4.3 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="Your rights as a borrower"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["Truth in Lending Act (Regulation Z)",
             "APR, finance charge, total of payments, and payment "
             "schedule disclosed on Loan Estimate and Closing Disclosure."],
            ["Real Estate Settlement Procedures Act (Reg X)",
             "Loan Estimate and Closing Disclosure provided on "
             "required timelines; prohibits kickbacks."],
            ["Right of rescission (TILA § 1635)",
             "3-business-day right to cancel on a non-purchase loan "
             "secured by your principal dwelling."],
            ["Equal Credit Opportunity Act (Reg B)",
             "Prohibits discrimination; adverse-action notices within 30 days."],
            ["Flood Disaster Protection Act",
             "Flood insurance required for properties in a Special Flood "
             "Hazard Area identified by FEMA."],
            ["Servicemembers Civil Relief Act",
             "6% APR cap on pre-service home-secured debt and foreclosure "
             "protections during active duty."],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("What's the difference between a HELOAN and a cash-out refinance?",
         "A HELOAN is a second lien that leaves your first mortgage "
         "untouched. A cash-out refinance replaces your first mortgage "
         "with a new, larger one. If your current first-mortgage rate is "
         "below today's market rate, a HELOAN typically preserves that "
         "low rate while still letting you access equity."),
        ("Can I use HELOAN proceeds for anything?",
         "Yes, proceeds can be used for any lawful purpose — home "
         "improvements, debt consolidation, tuition, medical expenses, "
         "or other. Note that tax deductibility of the interest generally "
         "applies only to funds used to buy, build, or substantially "
         "improve the home securing the loan."),
        ("How long does the process take?",
         "Most HELOANs close within 30 calendar days of application, "
         "depending on appraisal turn time and complexity. Cumulus "
         "provides status updates in the app throughout the process."),
        ("Is there a prepayment penalty?",
         "No prepayment penalty in the usual sense. However, Cumulus "
         "recoups the closing costs it paid on your behalf if you close "
         "the loan within 36 months of origination."),
        ("Can I roll the cost of home improvements into the loan?",
         "Yes. Many HELOAN borrowers fund a planned renovation by "
         "borrowing the estimated project cost. The full loan amount is "
         "disbursed at closing; it is not draw-based like a HELOC."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    # --------------------------------------------------------------- DISCLOSURES
    story += B.disclosure_block(
        "Important disclosures",
        B.STANDARD_LENDING_DISCLOSURES + [
            "APR is fixed for the life of the loan and assumes the "
            "0.25% automatic-payment discount. Without autopay, each APR "
            "is 0.25 percentage points higher.",
            "Your home is the collateral for this loan. Failure to repay "
            "may result in the loss of your home through foreclosure.",
            "On a primary residence, you have a three-business-day right "
            "of rescission beginning after closing and delivery of the "
            "required Regulation Z disclosures.",
            "Cumulus Home Lending, a division of Cumulus Bank, N.A. NMLS "
            "#2026045. Equal Housing Lender.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
