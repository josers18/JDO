"""Cumulus 12-Month CD — retail brochure."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "01_Personal_Deposits"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_12Mo_CD.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus 12-Month CD",
        product_code="PD-CD-12M-2026.04",
        category="Personal Deposits",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus 12-Month CD",
        lede=("A one-year, federally insured Certificate of Deposit paying "
              "a market-leading fixed APY — the most-chosen CD term in the "
              "Cumulus portfolio."),
        summary_rows=[
            ("Product type", "Fixed-rate time deposit"),
            ("Term", "12 months"),
            ("Standard APY", "4.60% APY"),
            ("Jumbo APY", "4.70% APY on balances of $25,000+"),
            ("Minimum opening deposit", "$1,000 standard  ·  $25,000 jumbo"),
            ("Interest payment options", "Monthly, quarterly, or at maturity"),
            ("Early-withdrawal penalty", "180 days of interest"),
            ("Grace period at maturity", "10 calendar days"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL DEPOSITS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus 12-Month CD is the highest-yielding term in the "
        "current CD curve and the most popular choice among Cumulus CD "
        "clients. Lock in 4.60% APY (4.70% APY Jumbo) for a full year on "
        "a minimum deposit of $1,000 — with FDIC insurance, a 10-day "
        "grace period at maturity, and the flexibility to receive "
        "interest monthly, quarterly, or at maturity."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a 12-Month CD"))
    story.append(B.feature_grid([
        ("Top of the Cumulus CD curve",
         "At 4.60% APY, the 12-Month CD pays the highest yield of any "
         "standard CD term currently offered by Cumulus."),
        ("Jumbo tier at 4.70% APY",
         "Open with $25,000 or more and earn an extra 10 basis points for "
         "the same 12-month term and FDIC insurance."),
        ("One-year commitment",
         "A one-year horizon balances yield and liquidity — long enough to "
         "capture meaningfully higher rates, short enough to rebalance in a "
         "changing environment."),
        ("Interest payment flexibility",
         "Receive interest monthly, quarterly, or at maturity. Monthly "
         "interest can fund a Cumulus Checking account as regular income."),
        ("Laddering centerpiece",
         "The 12-Month CD is the core rung of a classic CD ladder paired "
         "with 6, 36, and 60-month maturities."),
        ("FDIC-insured",
         "Insured up to $250,000 per depositor, per insured institution, "
         "per ownership category."),
    ], cols=2))

    # --------------------------------------------------------------- RATE TABLE / CHART
    story.append(B.section_header("Rates and minimums",
                                  kicker="Fixed yield for 12 months"))
    story.append(B.data_table(
        header=["Tier", "Minimum deposit", "APY", "Interest rate (approx.)"],
        rows=[
            ["Standard", "$1,000", "4.60%", "4.50%"],
            ["Jumbo", "$25,000", "4.70%", "4.60%"],
        ],
        col_widths=[1.6 * inch, 1.8 * inch, 1.5 * inch, 2.4 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative balance growth"))
    story.append(B.growth_curve_chart(
        principal=10_000, apy=4.60, years=1,
        title="$10,000 at 4.60% APY, compounded monthly — 12-month projection",
    ))

    story.append(B.callout_box(
        "Example — $25,000 Jumbo at 4.70% APY for 12 months",
        "On a $25,000 opening deposit held to maturity at 4.70% APY with "
        "interest compounded daily and credited monthly, the maturity "
        "value is approximately $26,175 — $1,175 of interest earned on a "
        "one-year deposit, with every dollar FDIC-insured.",
    ))

    # --------------------------------------------------------------- EWP
    story.append(B.section_header("Early-withdrawal penalty",
                                  kicker="Access before maturity"))
    story.append(B.body_para(
        "Funds deposited into a Cumulus 12-Month CD are intended to remain "
        "on deposit until the maturity date. If you withdraw principal "
        "before maturity, an early-withdrawal penalty equal to 180 days of "
        "simple interest on the amount withdrawn is assessed. If the "
        "interest accrued is insufficient to cover the penalty, the "
        "difference is deducted from principal. Withdrawals following the "
        "death or adjudicated incompetence of an owner are exempt from the penalty."
    ))

    story.append(B.data_table(
        header=["Scenario", "Penalty", "Effect on principal"],
        rows=[
            ["Standard early withdrawal", "180 days of simple interest",
             "Deducted from interest accrued; may reduce principal."],
            ["Death or adjudicated incompetence of owner", "Waived",
             "No penalty — full principal and accrued interest paid."],
            ["Within 7 days of account opening", "Waived",
             "No penalty (Regulation D/DD rescission period)."],
            ["At maturity — within 10-day grace period", "No penalty",
             "Principal and interest available; no penalty assessed."],
        ],
        col_widths=[2.1 * inch, 2.2 * inch, 3.0 * inch],
    ))

    # --------------------------------------------------------------- MATURITY
    story.append(B.section_header("At maturity", kicker="What happens next"))
    story.append(B.data_table(
        header=["Step", "What happens"],
        rows=[
            ["Maturity notice",
             "Cumulus mails a maturity notice 30 days before maturity "
             "describing the automatic-renewal APY and your options."],
            ["Maturity date",
             "Interest accrues through the maturity date. You may instruct "
             "Cumulus up to that date (and through the grace period) on "
             "what to do next."],
            ["10-day grace period",
             "Withdraw funds, change the term, add or withdraw principal, "
             "or close the CD with no early-withdrawal penalty."],
            ["Automatic renewal",
             "Absent instructions, the CD renews for another 12-month term "
             "at the then-current posted APY."],
            ["Closure",
             "Transfer the matured balance to any Cumulus deposit account, "
             "or send by ACH or wire to another institution."],
        ],
        col_widths=[1.6 * inch, 5.6 * inch],
    ))

    # --------------------------------------------------------------- ELIGIBILITY
    story.append(B.section_header("Eligibility and application",
                                  kicker="Account opening"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who is eligible"),
            *B.bullet_list([
                "U.S. citizens, lawful permanent residents, and qualifying "
                "resident aliens age 18 or older with a valid SSN or ITIN.",
                "Joint owners, trust, and UTMA custodial titling permitted.",
                "IRA CD titling available (Traditional or Roth).",
                "Customer Identification Program (USA PATRIOT Act) verification.",
                "OFAC and sanctions screening at onboarding and ongoing.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Government-issued photo ID for each owner.",
                "Social Security Number or ITIN.",
                "Current residential address.",
                "$1,000 minimum opening deposit ($25,000 for Jumbo).",
                "For IRA CDs: signed IRA custodial agreement and Form 5305.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Why is the 12-month rate higher than the 36 or 60-month rate?",
         "The 12-month APY (4.60%) reflects the shape of today's yield "
         "curve, which is modestly inverted at the one-year point. Longer "
         "terms (36, 60 months) offer rate certainty over a multi-year "
         "period at a slightly lower current APY."),
        ("Can I add funds to an existing 12-Month CD?",
         "No. The opening deposit is fixed for the term. You may add funds "
         "during the 10-day grace period at maturity or open additional CDs."),
        ("How is interest compounded?",
         "Interest on the 12-Month CD is compounded daily. You elect at "
         "opening whether to credit it to the CD or pay it out monthly or "
         "quarterly to another Cumulus account."),
        ("What is the early-withdrawal penalty on a partial withdrawal?",
         "The penalty is 180 days of simple interest on the amount "
         "withdrawn, not the full CD balance. If the penalty exceeds the "
         "interest accrued on the withdrawn amount, the difference is "
         "deducted from principal."),
        ("Can I open multiple 12-Month CDs?",
         "Yes. There is no limit on the number of CDs you can hold. FDIC "
         "insurance of $250,000 is per ownership category — structuring can "
         "support higher coverage. Your Cumulus banker can help model."),
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
        B.STANDARD_DEPOSIT_DISCLOSURES + [
            "APY is fixed for the stated term. Upon renewal, the new APY "
            "will be the Bank's then-posted rate for the same term on the "
            "renewal date, which may be higher or lower.",
            "The early-withdrawal penalty is 180 days of simple interest "
            "on the amount withdrawn. If interest accrued is insufficient "
            "to cover the penalty, the penalty is deducted from principal.",
            "IRA CDs are subject to applicable IRS rules regarding "
            "contributions, distributions, and required minimum "
            "distributions. Consult your tax advisor.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
