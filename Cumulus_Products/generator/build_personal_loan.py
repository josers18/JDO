"""Cumulus Personal Loan — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Personal_Loan.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Personal Loan",
        product_code="PL-LOAN-PRS-2026.04",
        category="Personal Loans",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Personal Loan",
        lede=("A fixed-rate, unsecured installment loan for debt "
              "consolidation, home improvement, medical expenses, and "
              "other personal needs — with no origination fee."),
        summary_rows=[
            ("Loan type", "Unsecured fixed-rate installment"),
            ("Loan amounts", "$3,000 – $75,000"),
            ("Terms available", "24, 36, 48, 60, or 72 months"),
            ("APR range", "7.99% – 23.99% APR"),
            ("Origination fee", "None"),
            ("Prepayment penalty", "None"),
            ("Minimum FICO", "670"),
            ("Max DTI", "45% (post-loan)"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL LOANS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus Personal Loan is a fixed-rate installment loan "
        "designed for a wide range of personal financing needs — "
        "consolidating higher-rate credit card balances, funding a home "
        "improvement project, paying for a medical procedure, covering a "
        "major life event, or any other lawful personal purpose. The loan "
        "is unsecured (no collateral required), carries no origination fee "
        "or prepayment penalty, and funds are typically deposited within "
        "one to three business days of approval and signing."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a Personal Loan"))
    story.append(B.feature_grid([
        ("Fixed rate, fixed payment",
         "Your interest rate and monthly payment are set at closing and do "
         "not change. Plan your budget with confidence."),
        ("No origination fee",
         "The full loan amount is disbursed to you — no 1%–5% origination "
         "fee deducted up front, as is common at other lenders."),
        ("No prepayment penalty",
         "Pay extra or pay off the loan in full at any time with no "
         "prepayment fee. Every extra dollar goes to principal."),
        ("Amounts up to $75,000",
         "Borrow $3,000 to $75,000. Ideal for consolidating multiple "
         "credit card or BNPL balances into one fixed payment."),
        ("Fast decisions",
         "Most complete applications receive a decision the same day; "
         "funding typically occurs within 1–3 business days."),
        ("Rate discount for autopay",
         "Enroll in automatic payments from a Cumulus deposit account "
         "and receive a 0.25% APR discount for the life of the loan."),
    ], cols=2))

    # --------------------------------------------------------------- RATES
    story.append(B.section_header("Representative rates",
                                  kicker="APR by term and credit"))
    story.append(B.body_para(
        "The Annual Percentage Rate offered to you is set based on your "
        "FICO score, debt-to-income ratio, requested loan amount, and the "
        "term you select. The table below shows representative APRs for "
        "borrowers at different credit tiers for a 60-month, $25,000 "
        "loan, including the 0.25% autopay discount. Your actual rate "
        "will be disclosed on your pre-approval offer and on your Truth "
        "in Lending (Regulation Z) disclosure at signing."
    ))

    story.append(B.data_table(
        header=["Credit tier", "Representative APR", "Monthly payment ($25,000 · 60 mo)", "Total interest paid"],
        rows=[
            ["Excellent  ·  FICO 780+", "7.99%", "$506.91", "$5,414.60"],
            ["Very good  ·  FICO 740–779", "10.49%", "$537.35", "$7,241.00"],
            ["Good  ·  FICO 700–739", "13.99%", "$581.68", "$9,900.80"],
            ["Fair  ·  FICO 670–699", "18.99%", "$648.19", "$13,891.40"],
            ["Near floor  ·  FICO 670 / high DTI", "23.99%", "$719.19", "$18,151.40"],
        ],
        col_widths=[2.1 * inch, 1.3 * inch, 2.0 * inch, 1.7 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative principal vs. interest"))
    story.append(B.amortization_chart(
        principal=25_000, apr=10.49, years=5,
        title="$25,000 at 10.49% APR over 60 months — cumulative principal and interest",
    ))

    story.append(B.callout_box(
        "Why debt consolidation often makes sense",
        "If you are carrying balances on multiple credit cards at a "
        "blended APR above 18–22%, consolidating into a Cumulus Personal "
        "Loan at a fixed lower APR can meaningfully reduce total interest "
        "paid and convert revolving, variable-rate debt into a predictable "
        "installment payment with a defined payoff date.",
    ))

    # --------------------------------------------------------------- TERMS / FEES
    story.append(B.section_header("Loan terms and fees",
                                  kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Item", "Detail"],
        rows=[
            ["Loan amounts", "$3,000 – $75,000"],
            ["Terms available", "24, 36, 48, 60, or 72 months"],
            ["APR range (standard)", "7.99% – 23.99% APR"],
            ["Autopay discount", "0.25% APR reduction for automatic payment from a Cumulus deposit account"],
            ["Origination fee", "None"],
            ["Application fee", "None"],
            ["Prepayment penalty", "None"],
            ["Late payment fee", "5% of the past-due amount or $25, whichever is less"],
            ["Returned payment fee", "$15"],
            ["Security", "Unsecured — no collateral required"],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # --------------------------------------------------------------- UNDERWRITING
    story.append(B.section_header("Eligibility and underwriting",
                                  kicker="How we review your application"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who qualifies"),
            *B.bullet_list([
                "U.S. citizens, lawful permanent residents, and qualifying "
                "resident aliens age 18 or older (19 in AL and NE) with a "
                "valid SSN or ITIN.",
                "Minimum FICO score of 670.",
                "Post-loan debt-to-income ratio of 45% or less.",
                "At least two years of continuous employment history, or "
                "verifiable self-employment income.",
                "No bankruptcy filing within the past 48 months.",
                "No more than two 30-day delinquencies in the past 12 months.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Government-issued photo ID.",
                "Social Security Number or ITIN.",
                "Two most recent pay stubs or equivalent income documentation "
                "(e.g., 1099, Schedule C, K-1).",
                "Most recent W-2 (or two years of tax returns for "
                "self-employed applicants).",
                "Bank account information for disbursement and autopay.",
                "For debt consolidation: statements or payoff letters for "
                "accounts you wish to pay off.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How it works", kicker="Step by step"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Check your rate",
             "See your pre-qualification offer with a soft credit inquiry — "
             "no impact on your credit score.",
             "2 minutes"],
            ["2  ·  Apply",
             "Complete the full application online, in the Cumulus app, or at "
             "a branch. A hard credit inquiry is submitted.",
             "5–10 minutes"],
            ["3  ·  Verify income and ID",
             "Upload documents or link your payroll provider. Most "
             "documentation is verified in real time.",
             "Same day"],
            ["4  ·  Receive decision",
             "Most complete applications receive a credit decision the same "
             "day. Approved loans include a Truth in Lending disclosure.",
             "Same day – 24 hours"],
            ["5  ·  Sign and fund",
             "Review and electronically sign the promissory note and loan "
             "agreement. Funds are disbursed to your Cumulus deposit account "
             "or to payoff creditors for consolidation loans.",
             "1–3 business days"],
        ],
        col_widths=[1.5 * inch, 4.2 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="Your rights as a borrower"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["Truth in Lending Act (Regulation Z)",
             "APR, finance charge, total of payments, and payment schedule "
             "disclosed on a standard TIL disclosure at signing."],
            ["Equal Credit Opportunity Act (Regulation B)",
             "Prohibits discrimination on the basis of race, color, religion, "
             "national origin, sex, marital status, age, or receipt of public "
             "assistance. Adverse action notices provided within 30 days."],
            ["Fair Credit Reporting Act",
             "You are entitled to a copy of any consumer report used in the "
             "decision. Disputes are investigated within 30 days."],
            ["Servicemembers Civil Relief Act (SCRA)",
             "Eligible servicemembers may receive a 6% APR cap on "
             "pre-service debt and other protections during active duty."],
            ["Regulation P — consumer privacy",
             "Cumulus does not sell personal information. Privacy Notice "
             "provided annually."],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Will checking my rate hurt my credit?",
         "No. Pre-qualification uses a soft credit inquiry and does not "
         "affect your credit score. A hard inquiry is submitted only when "
         "you choose to proceed with the full application."),
        ("How fast will I receive funds?",
         "Most approved loans fund within one to three business days after "
         "signing. Debt-consolidation loans paid directly to creditors may "
         "take up to five business days for the creditor to post."),
        ("Can I pay off my loan early?",
         "Yes. There is no prepayment penalty on any Cumulus Personal Loan. "
         "Extra payments and full prepayment go 100% to principal and "
         "reduce total interest paid."),
        ("What is the 0.25% autopay discount?",
         "Enroll in automatic monthly payments from a Cumulus deposit "
         "account and your APR is reduced by 0.25 percentage points for "
         "the life of the loan. If autopay is later cancelled, the discount "
         "is removed and the rate returns to the non-autopay APR."),
        ("Can I use a Personal Loan to pay off credit cards?",
         "Yes — debt consolidation is one of the most common uses. Cumulus "
         "can disburse loan proceeds directly to your existing creditors "
         "to simplify the process. You'll replace multiple variable-rate "
         "balances with one fixed monthly installment."),
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
            "Representative APRs shown assume the 0.25% autopay discount "
            "is in effect. Without autopay, each APR is 0.25 percentage "
            "points higher.",
            "Monthly payment and total interest amounts in the rate table "
            "are illustrative for a 60-month, $25,000 loan at the APR "
            "shown. Actual payment depends on your approved APR, term, "
            "and loan amount.",
            "Debt consolidation does not eliminate debt; it combines "
            "balances into a single loan. Consumers should carefully "
            "consider whether a Personal Loan is the right option for "
            "their financial situation.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
