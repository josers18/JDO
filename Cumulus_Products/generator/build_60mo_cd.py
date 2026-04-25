"""Cumulus 60-Month CD — retail brochure (includes ladder chart)."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_60Mo_CD.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus 60-Month CD",
        product_code="PD-CD-60M-2026.04",
        category="Personal Deposits",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus 60-Month CD",
        lede=("A five-year, federally insured Certificate of Deposit for "
              "long-horizon savings — the longest rung on a Cumulus CD "
              "ladder."),
        summary_rows=[
            ("Product type", "Fixed-rate time deposit"),
            ("Term", "60 months"),
            ("Standard APY", "4.00% APY"),
            ("Jumbo APY", "4.10% APY on balances of $25,000+"),
            ("Minimum opening deposit", "$1,000 standard  ·  $25,000 jumbo"),
            ("Interest payment options", "Monthly, quarterly, or at maturity"),
            ("Early-withdrawal penalty", "540 days of interest"),
            ("Grace period at maturity", "10 calendar days"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL DEPOSITS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus 60-Month CD is the longest standard CD term in the "
        "Cumulus portfolio. It locks in a fixed 4.00% APY (4.10% APY "
        "Jumbo) for five years, providing rate certainty across a "
        "multi-year horizon and serving as the longest rung of a classic "
        "CD ladder. Suitable for funds that won't be needed in the near "
        "term but where FDIC-insured stability is preferred to market exposure."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a 60-Month CD"))
    story.append(B.feature_grid([
        ("Five-year rate certainty",
         "Lock in 4.00% APY (4.10% APY Jumbo) for 60 months — your rate "
         "is unaffected by any drops in market rates during the term."),
        ("Long-horizon goals",
         "Well-suited to five-year savings goals or a portion of a "
         "retirement bucket reserved for fixed-income exposure."),
        ("Top ladder rung",
         "The natural top rung of a four-rung CD ladder, paired with 6, "
         "12, and 36-month CDs."),
        ("Interest flexibility",
         "Receive interest monthly, quarterly, or at maturity. Monthly "
         "payments create a steady 5-year income stream."),
        ("Jumbo bonus",
         "Deposits of $25,000 or more earn an additional 10 basis points "
         "at the Jumbo tier (4.10% APY)."),
        ("FDIC insurance",
         "Insured up to $250,000 per depositor, per insured institution, "
         "per ownership category."),
    ], cols=2))

    # --------------------------------------------------------------- RATE
    story.append(B.section_header("Rates and minimums",
                                  kicker="Fixed yield for 60 months"))
    story.append(B.data_table(
        header=["Tier", "Minimum deposit", "APY", "Interest rate (approx.)"],
        rows=[
            ["Standard", "$1,000", "4.00%", "3.93%"],
            ["Jumbo", "$25,000", "4.10%", "4.02%"],
        ],
        col_widths=[1.6 * inch, 1.8 * inch, 1.5 * inch, 2.4 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative balance growth"))
    story.append(B.growth_curve_chart(
        principal=25_000, apy=4.10, years=5,
        title="$25,000 Jumbo at 4.10% APY, compounded monthly — five-year projection",
    ))

    # --------------------------------------------------------------- LADDER
    story.append(B.section_header("The CD ladder concept",
                                  kicker="Diversify across terms"))
    story.append(B.body_para(
        "A CD ladder divides a pool of savings across several CD terms so "
        "that a portion matures each period. You capture the yield "
        "advantage of longer-term CDs on the majority of your funds while "
        "retaining regular access to a maturing rung. The 60-Month CD is "
        "the anchor on the long end of a classic Cumulus ladder."
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
             "Highest current yield; reinvest annually."],
            ["3  ·  Medium", "36 months", "4.15%",
             "Locks in a multi-year rate for the middle rung."],
            ["4  ·  Long", "60 months", "4.00%",
             "Locks in the longest available Cumulus rate; this brochure."],
        ],
        col_widths=[1.3 * inch, 1.2 * inch, 0.9 * inch, 3.8 * inch],
    ))

    story.append(B.callout_box(
        "Ladder example — $50,000 across four rungs",
        "Place $12,500 into each of a 6-, 12-, 36-, and 60-month CD at "
        "current Cumulus rates. Day-one weighted average APY is "
        "approximately 4.25%. As each rung matures, reinvest into a new "
        "60-month CD to maintain the ladder structure and the long-end "
        "rate exposure. After five years, all rungs are 60-month CDs "
        "rolling at the prevailing 60-month rate.",
    ))

    # --------------------------------------------------------------- EWP
    story.append(B.section_header("Early-withdrawal penalty",
                                  kicker="Access before maturity"))
    story.append(B.body_para(
        "If you withdraw principal before the maturity date, an "
        "early-withdrawal penalty equal to 540 days of simple interest "
        "on the amount withdrawn is assessed. If interest accrued is "
        "insufficient to cover the penalty, the difference is deducted "
        "from principal. Because the 60-Month CD has the longest penalty "
        "in the portfolio, the amount you lock up should be money you "
        "are confident you will not need during the term. Withdrawals "
        "following the death or adjudicated incompetence of an owner are "
        "exempt from the penalty."
    ))

    story.append(B.data_table(
        header=["Scenario", "Penalty", "Effect on principal"],
        rows=[
            ["Standard early withdrawal", "540 days of simple interest",
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
             "Absent instructions, the CD renews for another 60-month term "
             "at the then-current posted APY."],
            ["Transfer or close",
             "Move the matured balance to any Cumulus deposit account, "
             "or send by ACH or wire to another institution."],
        ],
        col_widths=[1.6 * inch, 5.6 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Why commit to 60 months when shorter CDs pay more today?",
         "Rate certainty. Today's 12-month rate is higher, but it may not "
         "be available in 12 or 24 months. A 60-Month CD locks in 4.00% "
         "APY across five years regardless of future rate movements."),
        ("Should I consider this CD for retirement income?",
         "A 60-Month CD with monthly interest credit can function as a "
         "fixed, FDIC-insured income stream. Many retirees pair a "
         "60-Month CD with Money Market for both reliable income and "
         "liquidity. Consult your Cumulus advisor."),
        ("What happens if rates rise during my 60-month term?",
         "You continue earning 4.00% APY. You may always elect to pay "
         "the 540-day early-withdrawal penalty and reinvest at higher "
         "rates — but in most cases the penalty exceeds the benefit "
         "unless rates rise substantially."),
        ("Can this be an IRA CD?",
         "Yes. Both Traditional and Roth IRA 60-Month CDs are available. "
         "The five-year term aligns well with Roth's five-year "
         "qualification period for earnings withdrawals."),
        ("Is the Jumbo tier worth it?",
         "At $25,000 or more, the Jumbo APY (4.10%) adds approximately "
         "$130 of additional interest over five years on a $25,000 "
         "deposit versus the Standard APY (4.00%). A Cumulus banker can "
         "model your specific scenario."),
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
            "will be the Bank's then-posted rate for the same term, which "
            "may be higher or lower.",
            "The early-withdrawal penalty is 540 days of simple interest "
            "on the amount withdrawn. If interest accrued is insufficient "
            "to cover the penalty, the penalty is deducted from principal.",
            "Comparison APYs shown in the ladder chart (6-, 12-, 36-month) "
            "are illustrative only and subject to change. See the current "
            "rate sheet at cumulusbank.com for the latest APYs.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
