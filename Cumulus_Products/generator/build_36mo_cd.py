"""Cumulus 36-Month CD — retail brochure (includes ladder chart)."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_36Mo_CD.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus 36-Month CD",
        product_code="PD-CD-36M-2026.04",
        category="Personal Deposits",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus 36-Month CD",
        lede=("A three-year, federally insured Certificate of Deposit that "
              "locks in a fixed APY for the medium term — a natural rung in "
              "a CD ladder."),
        summary_rows=[
            ("Product type", "Fixed-rate time deposit"),
            ("Term", "36 months"),
            ("Standard APY", "4.15% APY"),
            ("Jumbo APY", "4.25% APY on balances of $25,000+"),
            ("Minimum opening deposit", "$1,000 standard  ·  $25,000 jumbo"),
            ("Interest payment options", "Monthly, quarterly, or at maturity"),
            ("Early-withdrawal penalty", "365 days of interest"),
            ("Grace period at maturity", "10 calendar days"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL DEPOSITS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus 36-Month CD is a medium-term Certificate of Deposit "
        "that locks in a fixed Annual Percentage Yield for three years. "
        "It is commonly used as the middle rung of a CD ladder and as a "
        "standalone savings vehicle for three-year goals — a future down "
        "payment, a tuition bill, or a planned vehicle replacement. Open "
        "with $1,000 standard or $25,000 Jumbo; every dollar is FDIC-insured."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a 36-Month CD"))
    story.append(B.feature_grid([
        ("Fixed rate for three years",
         "Lock in 4.15% APY (4.25% APY Jumbo) for 36 months — no "
         "rate risk during the term."),
        ("Medium-term goals",
         "Well-suited to three-year savings horizons: a planned down "
         "payment, college tuition, or a vehicle replacement."),
        ("Classic ladder rung",
         "A 36-month CD is the natural middle rung of a CD ladder paired "
         "with 6, 12, and 60-month maturities."),
        ("Interest flexibility",
         "Receive interest monthly, quarterly, or at maturity. Monthly "
         "payments can supplement income in retirement."),
        ("Jumbo bonus at $25,000",
         "Deposits of $25,000 or more earn an additional 10 basis points "
         "at the Jumbo tier."),
        ("FDIC insurance",
         "Insured up to $250,000 per depositor, per insured institution, "
         "per ownership category."),
    ], cols=2))

    # --------------------------------------------------------------- RATE TABLE / CHART
    story.append(B.section_header("Rates and minimums",
                                  kicker="Fixed yield for 36 months"))
    story.append(B.data_table(
        header=["Tier", "Minimum deposit", "APY", "Interest rate (approx.)"],
        rows=[
            ["Standard", "$1,000", "4.15%", "4.07%"],
            ["Jumbo", "$25,000", "4.25%", "4.17%"],
        ],
        col_widths=[1.6 * inch, 1.8 * inch, 1.5 * inch, 2.4 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative balance growth"))
    story.append(B.growth_curve_chart(
        principal=25_000, apy=4.25, years=3,
        title="$25,000 Jumbo at 4.25% APY, compounded monthly — three-year projection",
    ))

    # --------------------------------------------------------------- LADDER
    story.append(B.section_header("The CD ladder concept",
                                  kicker="Diversify across terms"))
    story.append(B.body_para(
        "A CD ladder divides a pool of savings across multiple CD terms so "
        "that a portion matures each period. You capture the yield of "
        "longer-term CDs on most of your deposits while retaining regular "
        "access to a maturing rung. A classic Cumulus four-rung ladder "
        "pairs 6-month, 12-month, 36-month, and 60-month CDs."
    ))

    story.append(B.bar_comparison_chart(
        labels=["6-Month", "12-Month", "36-Month", "60-Month"],
        values=[4.25, 4.60, 4.15, 4.00],
        title="Cumulus CD rate curve — current Standard APY by term",
    ))

    story.append(B.data_table(
        header=["Rung", "Term", "APY", "Role in the ladder"],
        rows=[
            ["1  ·  Short", "6 months", "4.25%",
             "Liquidity within six months; first to mature."],
            ["2  ·  Medium-short", "12 months", "4.60%",
             "Highest current yield; reinvest at prevailing rates."],
            ["3  ·  Medium", "36 months", "4.15%",
             "Locks in a multi-year rate; this brochure."],
            ["4  ·  Long", "60 months", "4.00%",
             "Locks in a five-year rate on the longest rung."],
        ],
        col_widths=[1.3 * inch, 1.2 * inch, 0.9 * inch, 3.8 * inch],
    ))

    story.append(B.callout_box(
        "Ladder example — $40,000 across four rungs",
        "Divide $40,000 equally across four CDs of $10,000 each in the "
        "6-, 12-, 36-, and 60-month terms. Every six to twelve months a "
        "rung matures, giving you the opportunity to reinvest at "
        "then-prevailing rates or redirect the funds. The average yield on "
        "day one of this ladder is 4.25% APY across all four CDs.",
    ))

    # --------------------------------------------------------------- EWP
    story.append(B.section_header("Early-withdrawal penalty",
                                  kicker="Access before maturity"))
    story.append(B.body_para(
        "If you withdraw principal before the maturity date, an "
        "early-withdrawal penalty equal to 365 days of simple interest on "
        "the amount withdrawn is assessed. If interest accrued is "
        "insufficient to cover the penalty, the difference is deducted "
        "from principal. Withdrawals following the death or adjudicated "
        "incompetence of an owner are exempt from the penalty."
    ))

    story.append(B.data_table(
        header=["Scenario", "Penalty", "Effect on principal"],
        rows=[
            ["Standard early withdrawal", "365 days of simple interest",
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
            ["10-day grace period",
             "Withdraw, change the term, add or withdraw principal, or "
             "close the CD with no early-withdrawal penalty."],
            ["Automatic renewal",
             "Absent instructions, the CD renews for another 36-month term "
             "at the then-current posted APY."],
            ["Transfer or close",
             "Move the matured balance into any Cumulus deposit account, "
             "or ACH or wire the balance to another institution."],
        ],
        col_widths=[1.6 * inch, 5.6 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Is the 36-month rate lower than the 12-month rate?",
         "Yes, at current pricing the 36-month APY (4.15%) is below the "
         "12-month APY (4.60%). The yield curve is modestly inverted at "
         "medium-term maturities. Choosing a 36-month CD trades a little "
         "current yield for rate certainty over three years."),
        ("How should I think about laddering 6-, 12-, 36-, and 60-month CDs?",
         "A four-rung ladder smooths reinvestment risk — when any one rung "
         "matures, you reinvest at prevailing rates while the remaining "
         "rungs continue earning their locked-in APYs. A Cumulus banker can "
         "model a ladder sized to your goals."),
        ("Can I add funds to a 36-Month CD mid-term?",
         "No. The opening deposit is fixed for the term. You may open "
         "additional CDs at any time or add funds during the 10-day grace "
         "period at maturity."),
        ("Is this CD IRA-eligible?",
         "Yes. Both Traditional and Roth IRA CD titling are available. "
         "Contribution limits and distribution rules are set by the "
         "Internal Revenue Code."),
        ("Can I pledge my CD as collateral?",
         "Yes. Cumulus accepts its own CDs as collateral for secured "
         "personal lending, subject to underwriting. Pledged CDs cannot be "
         "withdrawn until the loan is repaid."),
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
            "The early-withdrawal penalty is 365 days of simple interest "
            "on the amount withdrawn. If interest accrued is insufficient "
            "to cover the penalty, the penalty is deducted from principal.",
            "Comparison APYs shown in the ladder chart (6-, 12-, 60-month) "
            "are illustrative only and are subject to change. See the "
            "current rate sheet at cumulusbank.com for the latest APYs.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
