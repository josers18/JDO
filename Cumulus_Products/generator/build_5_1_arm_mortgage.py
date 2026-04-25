"""Cumulus 5/1 ARM Mortgage — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_5_1_ARM_Mortgage.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus 5/1 ARM Mortgage",
        product_code="PL-MTG-ARM-2026.04",
        category="Personal Loans",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus 5/1 ARM Mortgage",
        lede=("An adjustable-rate mortgage that offers a lower fixed "
              "introductory APR for the first five years — ideal for "
              "buyers who expect to move, refinance, or pay down the "
              "balance within that window."),
        summary_rows=[
            ("Product type", "5/1 adjustable-rate residential mortgage"),
            ("Intro APR (first 5 years)", "5.99% APR"),
            ("Index (after year 5)", "1-Year Constant Maturity Treasury"),
            ("Margin", "+2.75%"),
            ("Adjustment caps", "2% initial  ·  2% periodic  ·  5% lifetime"),
            ("Lifetime max APR", "10.99% APR"),
            ("Conforming limit", "$806,500"),
            ("Prepayment penalty", "None"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL LOANS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A 5/1 Adjustable-Rate Mortgage (ARM) offers a fixed introductory "
        "interest rate for the first 60 months, after which the rate "
        "adjusts annually for the remaining 25 years of the loan term. "
        "Because the intro rate is typically lower than comparable 30-"
        "year fixed mortgages, the 5/1 ARM can reduce your monthly "
        "payment during the period you are most likely to hold the loan. "
        "ARMs are best-suited to buyers who expect to move, refinance, or "
        "pay off the loan within the fixed-rate window."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a 5/1 ARM"))
    story.append(B.feature_grid([
        ("Lower intro rate",
         "5.99% APR for the first five years — below the current 30-"
         "year fixed APR of 6.75%."),
        ("Strong rate-cap protection",
         "Caps of 2/2/5 limit how much your rate can move up at the "
         "first adjustment, at each annual adjustment, and over the "
         "life of the loan."),
        ("Lifetime ceiling of 10.99%",
         "The APR can never exceed 10.99% — giving you certainty about "
         "the worst-case payment."),
        ("No prepayment penalty",
         "Pay off or refinance at any time with no penalty."),
        ("Conforming and Jumbo",
         "Conforming loans up to the 2026 FHFA baseline of $806,500; "
         "higher-balance and Jumbo loans available."),
        ("Ability-to-repay underwritten",
         "Cumulus underwrites your 5/1 ARM on the fully-indexed rate, "
         "not the teaser — so you're not surprised at adjustment."),
    ], cols=2))

    # --------------------------------------------------------------- RATES
    story.append(B.section_header("Rate structure",
                                  kicker="Fixed intro  ·  Annual adjustment"))
    story.append(B.body_para(
        "During the first five years, your rate is fixed at 5.99% APR "
        "(for well-qualified borrowers at the current 10-Year Treasury "
        "index of 4.10%). Beginning with the 61st month, your rate "
        "adjusts once per year based on the 1-Year Constant Maturity "
        "Treasury (CMT) index plus a 2.75% margin, subject to rate caps "
        "of 2% at the first adjustment, 2% per subsequent annual "
        "adjustment, and 5% over the life of the loan. The rate will "
        "never exceed 10.99% APR or fall below the margin of 2.75%."
    ))

    story.append(B.data_table(
        header=["Period", "Rate determined by", "Example assuming CMT stays flat at 4.10%"],
        rows=[
            ["Years 1 – 5 (fixed intro)", "5.99% APR fixed", "5.99% APR"],
            ["Year 6 (first adjustment)", "CMT + 2.75% margin, capped +2% from intro", "6.85% APR (from 4.10% CMT + 2.75%)"],
            ["Year 7 (periodic adjustment)", "CMT + 2.75%, capped ±2% from prior year", "6.85% APR (flat CMT scenario)"],
            ["Year 8 onward", "CMT + 2.75%, capped ±2% annually", "6.85% APR (flat CMT scenario)"],
            ["Lifetime ceiling", "Intro + 5.00% lifetime cap", "10.99% APR"],
            ["Lifetime floor", "Margin only", "2.75% APR"],
        ],
        col_widths=[2.1 * inch, 2.6 * inch, 2.6 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative intro-rate principal vs. interest"))
    story.append(B.amortization_chart(
        principal=400_000, apr=5.99, years=30,
        title="$400,000 5/1 ARM at 5.99% intro APR — 30-year amortization (flat-rate scenario)",
    ))

    story.append(B.callout_box(
        "Comparing 5/1 ARM to 30-Year Fixed",
        "On a $400,000 loan, the 5/1 ARM intro APR of 5.99% produces a "
        "principal-and-interest payment of approximately $2,395/mo — "
        "roughly $200/mo less than the 30-Year Fixed at 6.75% APR. "
        "Multiplied by 60 months, that is approximately $12,000 of cash-"
        "flow savings over the fixed-rate period. If you plan to move or "
        "refinance within five years, the ARM can be meaningfully more "
        "economical. If you expect to hold the loan much longer, the "
        "certainty of the fixed rate may be worth the premium.",
    ))

    # --------------------------------------------------------------- SCENARIOS
    story.append(B.section_header("Adjustment scenarios",
                                  kicker="What could happen at year 6"))
    story.append(B.data_table(
        header=["CMT at year 6", "Fully indexed rate", "Rate after 2% initial cap", "Estimated P&I on $400,000"],
        rows=[
            ["2.50% (falling)", "5.25%", "5.25% (below intro)", "$2,208 / mo"],
            ["4.10% (flat)", "6.85%", "6.85%", "$2,623 / mo"],
            ["5.50% (moderate rise)", "8.25%", "7.99% (2% cap)", "$2,933 / mo"],
            ["7.00% (sharp rise)", "9.75%", "7.99% (2% cap)", "$2,933 / mo"],
            ["10.00% (extreme)", "12.75%", "7.99% (2% cap)", "$2,933 / mo"],
        ],
        col_widths=[1.7 * inch, 1.4 * inch, 1.9 * inch, 2.3 * inch],
    ))

    # --------------------------------------------------------------- UNDERWRITING
    story.append(B.section_header("Eligibility and underwriting",
                                  kicker="How we review your application"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who qualifies"),
            *B.bullet_list([
                "Minimum FICO 680 for conforming; 720+ for best pricing; "
                "720+ minimum for Jumbo.",
                "Maximum DTI 43%, computed on the fully indexed (not "
                "intro) rate per Regulation Z § 1026.43(c)(5).",
                "Down payment as little as 5% on conforming; 10% on "
                "Jumbo subject to AUS findings.",
                "Reserves: 2 months PITI conforming / 6 months Jumbo.",
                "Two years of continuous employment or self-employment.",
                "Eligible properties: 1–4 unit primary, 1-unit second "
                "home, or investor 1–4 unit."
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Government-issued photo ID and Social Security Number.",
                "Two most recent pay stubs and two years of W-2s or tax returns.",
                "Two months of bank statements for all accounts used at close.",
                "Purchase contract or most-recent mortgage statement.",
                "Homeowners insurance binder effective at closing.",
                "Appraisal, title, and flood determination ordered by Cumulus."
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How it works", kicker="Step by step"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Pre-qualification",
             "Soft-pull review; estimate of maximum loan size and "
             "payment at both intro and fully indexed rates.",
             "Same day"],
            ["2  ·  Application and lock",
             "Full TRID application; Loan Estimate within 3 business "
             "days; lock rate at any time.",
             "30 minutes"],
            ["3  ·  Underwriting",
             "Cumulus underwrites at the greater of the fully indexed "
             "rate or the maximum rate during the first five years "
             "(Ability-to-Repay rule).",
             "2–3 weeks"],
            ["4  ·  Closing Disclosure",
             "CD issued at least 3 business days before closing.",
             "Day ~27"],
            ["5  ·  Close",
             "Sign at title company or attorney. Loan funds and records.",
             "30–40 days from application"],
            ["6  ·  Year 5 — adjustment notice",
             "Cumulus mails a change-in-rate notice 60–120 days before "
             "the first adjustment and 25–120 days before each annual "
             "adjustment (Regulation Z).",
             "Prior to each adjustment"],
        ],
        col_widths=[1.6 * inch, 4.1 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="Your rights as a borrower"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["Truth in Lending / RESPA (TRID)",
             "Loan Estimate within 3 business days of application; "
             "Closing Disclosure 3 business days before closing."],
            ["Ability-to-Repay (Reg Z § 1026.43)",
             "Cumulus underwrites the loan at the higher of the fully "
             "indexed rate or the maximum rate within the first 5 years."],
            ["Rate-adjustment notices (Reg Z § 1026.20)",
             "First-adjustment notice mailed 60–120 days before change; "
             "subsequent annual notices mailed 25–120 days before change."],
            ["HELP for ARM borrowers (CFPB Consumer Handbook on "
             "Adjustable Rate Mortgages)",
             "Provided to you at application."],
            ["Home Mortgage Disclosure Act (HMDA)",
             "Application and origination data reported to CFPB."],
            ["Flood Disaster Protection Act",
             "Flood insurance required in FEMA Special Flood Hazard Areas."],
        ],
        col_widths=[2.8 * inch, 4.5 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Is an ARM right for me?",
         "ARMs work best if (a) you expect to sell or refinance within "
         "5–7 years, (b) you expect significant income growth that would "
         "absorb a higher future payment, or (c) you intend to aggressively "
         "pay down the principal. If you expect to hold the loan for 10+ "
         "years with a stable income, a 30-Year Fixed is typically safer."),
        ("How do the rate caps protect me?",
         "The 2/2/5 caps mean your rate cannot increase more than 2% at "
         "the first adjustment (year 6), more than 2% at any subsequent "
         "annual adjustment, or more than 5% above your intro rate over "
         "the life of the loan. Your maximum possible APR is 10.99%."),
        ("What is the 1-Year CMT?",
         "The 1-Year Constant Maturity Treasury is an index published "
         "by the Federal Reserve based on the yield on 1-year U.S. "
         "Treasury securities. It reflects short-term interest rates and "
         "is broadly tracked."),
        ("Can I refinance an ARM into a fixed-rate loan?",
         "Yes, at any time. Because there is no prepayment penalty, you "
         "can refinance from a 5/1 ARM into a 30-Year Fixed (or other "
         "product) whenever market conditions or your personal situation "
         "favor it."),
        ("What if my rate drops at the first adjustment?",
         "The rate caps work both ways. If the fully indexed rate is "
         "below the intro rate at year 6, your rate goes down. The "
         "2% initial cap limits the downward movement from the intro "
         "rate as well — but in a falling-rate environment that generally "
         "works in your favor."),
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
            "The introductory APR is fixed for 60 months. Beginning with "
            "month 61, the APR adjusts annually based on the 1-Year CMT "
            "index plus a 2.75% margin, subject to 2% initial, 2% "
            "periodic, and 5% lifetime caps. The APR will not exceed "
            "10.99% or fall below the 2.75% margin.",
            "Your monthly payment may increase substantially after the "
            "intro period. Sample payment figures assume a flat CMT index "
            "and a $400,000 loan balance; actual future payments depend "
            "on the CMT at each adjustment and remaining principal.",
            "The CFPB Consumer Handbook on Adjustable Rate Mortgages is "
            "delivered at application.",
            "Cumulus Home Lending, a division of Cumulus Bank, N.A. NMLS "
            "#2026045. Equal Housing Lender.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
