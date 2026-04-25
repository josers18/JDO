"""Cumulus 6-Month CD — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_6Mo_CD.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus 6-Month CD",
        product_code="PD-CD-6M-2026.04",
        category="Personal Deposits",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus 6-Month CD",
        lede=("A short-term, federally insured Certificate of Deposit that "
              "locks in a competitive fixed rate for 180 days — ideal for "
              "near-term savings goals."),
        summary_rows=[
            ("Product type", "Fixed-rate time deposit"),
            ("Term", "180 days (approximately 6 months)"),
            ("Standard APY", "4.25% APY"),
            ("Jumbo APY", "4.35% APY on balances of $25,000+"),
            ("Minimum opening deposit", "$1,000 standard  ·  $25,000 jumbo"),
            ("Interest payment options", "Monthly, quarterly, or at maturity"),
            ("Early-withdrawal penalty", "90 days of interest"),
            ("Grace period at maturity", "10 calendar days"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL DEPOSITS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Cumulus 6-Month CD is a short-term Certificate of Deposit that "
        "locks in a fixed Annual Percentage Yield for 180 days. It is ideal "
        "for funds you won't need immediately but want to keep liquid within "
        "the next half-year — a tax payment, a planned purchase, or the "
        "shortest rung of a CD ladder. The rate is guaranteed for the term, "
        "and every dollar is FDIC-insured up to applicable limits."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a 6-Month CD"))
    story.append(B.feature_grid([
        ("Competitive fixed rate",
         "Lock in 4.25% APY (4.35% APY jumbo) for the full 180-day term — "
         "no rate risk during the term."),
        ("Short commitment",
         "Half-year maturity keeps your savings within reach while earning "
         "meaningfully more than a liquid savings account."),
        ("Interest flexibility",
         "Receive interest monthly, quarterly, or at maturity — credited to "
         "the CD or to any Cumulus deposit account you designate."),
        ("Laddering-friendly",
         "The shortest rung of a CD ladder. Pair with 12, 36, and 60-month "
         "CDs to diversify across terms."),
        ("FDIC insurance",
         "Insured up to $250,000 per depositor, per insured institution, per "
         "ownership category."),
        ("Simple opening",
         "Open online, in the Cumulus app, or at a branch in minutes. Fund "
         "from a Cumulus account or by external ACH."),
    ], cols=2))

    # --------------------------------------------------------------- RATE TABLE / CHART
    story.append(B.section_header("Rates and minimums",
                                  kicker="Fixed yield for 180 days"))
    story.append(B.data_table(
        header=["Tier", "Minimum deposit", "APY", "Interest rate (approx.)"],
        rows=[
            ["Standard", "$1,000", "4.25%", "4.17%"],
            ["Jumbo", "$25,000", "4.35%", "4.27%"],
        ],
        col_widths=[1.6 * inch, 1.8 * inch, 1.5 * inch, 2.4 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative balance growth"))
    story.append(B.growth_curve_chart(
        principal=10_000, apy=4.25, years=1,
        title="$10,000 at 4.25% APY, compounded monthly — six-month projection",
    ))

    story.append(B.callout_box(
        "Interest payment options",
        "Clients may elect to receive interest monthly, quarterly, or at "
        "maturity. Interest paid out before maturity is deposited into the "
        "Cumulus account you designate and does not remain in the CD; a "
        "withdrawal of interest reduces the effective yield. APY assumes "
        "interest remains on deposit until maturity.",
    ))

    # --------------------------------------------------------------- EWP
    story.append(B.section_header("Early-withdrawal penalty",
                                  kicker="Access before maturity"))
    story.append(B.body_para(
        "Because the rate is fixed, funds deposited into a Cumulus 6-Month "
        "CD are intended to remain on deposit until the maturity date. If "
        "you withdraw principal before maturity, an early-withdrawal "
        "penalty equal to 90 days of simple interest on the amount "
        "withdrawn is assessed. The penalty may be deducted from the amount "
        "withdrawn and, if it exceeds the interest accrued, from principal. "
        "Withdrawals following the death or adjudicated incompetence of an "
        "owner are exempt from the penalty."
    ))

    story.append(B.data_table(
        header=["Scenario", "Penalty", "Effect on principal"],
        rows=[
            ["Standard early withdrawal", "90 days of simple interest",
             "Deducted from interest accrued; may reduce principal if interest is insufficient."],
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
            ["Maturity date",
             "Your CD reaches maturity on the date stated at account opening "
             "(180 days from the funding date). Interest accrues through the "
             "maturity date."],
            ["Grace period (10 days)",
             "Cumulus provides a 10-calendar-day grace period after maturity "
             "during which you may withdraw funds, change the term, add or "
             "withdraw principal, or close the CD — without an early-withdrawal penalty."],
            ["Automatic renewal",
             "Absent instructions, the CD automatically renews for another "
             "6-month term at the then-current posted APY. Cumulus will send "
             "a maturity notice 30 days in advance."],
            ["Closure or transfer",
             "Instruct Cumulus during the grace period to deposit the matured "
             "balance into a Cumulus Checking, Savings, or Money Market "
             "account, or to wire or ACH the balance to another institution."],
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
        ("What's the difference between the Standard and Jumbo APY?",
         "The Jumbo rate (4.35% APY) is available on opening deposits of "
         "$25,000 or more. The Standard rate (4.25% APY) applies to deposits "
         "of $1,000 – $24,999. Both tiers are FDIC-insured."),
        ("Can I add to my CD after it's opened?",
         "Cumulus CDs are not add-on products. Once funded, the principal "
         "is set for the term. You may, however, add funds during the "
         "10-day grace period at maturity or open a second CD at any time."),
        ("What happens if I don't take action at maturity?",
         "The CD renews automatically for another 6-month term at the "
         "then-current posted APY. Cumulus sends a maturity notice 30 days "
         "before maturity so you have time to plan."),
        ("Can I open this as an IRA CD?",
         "Yes. Both Traditional and Roth IRA CD titling are available. "
         "Contribution limits and tax treatment are governed by the Internal "
         "Revenue Code; consult your tax professional."),
        ("Is interest compounded or paid out?",
         "Interest on a 6-Month CD is compounded daily. You elect at opening "
         "whether to receive it monthly, quarterly, or at maturity. Interest "
         "paid out of the CD does not continue to earn interest."),
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
            "will be the Bank's posted rate for the same term on the "
            "renewal date, which may be higher or lower.",
            "The early-withdrawal penalty is 90 days of simple interest on "
            "the amount withdrawn, calculated at the interest rate in "
            "effect on the CD at the time of withdrawal. If interest "
            "accrued is insufficient to cover the penalty, the penalty is "
            "deducted from principal.",
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
