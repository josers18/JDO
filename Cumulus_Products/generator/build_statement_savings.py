"""Cumulus Statement Savings — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Statement_Savings.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Statement Savings",
        product_code="PD-SAV-STM-2026.04",
        category="Personal Deposits",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Statement Savings",
        lede=("A simple, no-surprises savings account that earns interest "
              "from dollar one and rewards clients who pair it with a "
              "Cumulus Premier Checking relationship."),
        summary_rows=[
            ("Account type", "Personal tiered-rate savings"),
            ("Minimum opening deposit", "$25"),
            ("Monthly service charge", "$5 — waivable two ways"),
            ("Standard APY", "0.25% APY on all balances"),
            ("Relationship bonus", "Up to +0.30% when linked to Premier Checking"),
            ("Convenience withdrawals", "6 per cycle advisory limit"),
            ("Access", "Online, mobile, ATM card optional, in-branch"),
            ("Deposit insurance", "FDIC-insured up to $250,000 per ownership category"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL DEPOSITS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Statement Savings is a straightforward personal savings "
        "account for clients building an emergency fund, saving toward a "
        "goal, or simply separating spending money from savings. It earns "
        "0.25% APY on every dollar, includes paperless statements at no "
        "cost, and rewards clients who link it to a Cumulus Premier "
        "Checking relationship with a bonus APY of up to 0.30 percentage "
        "points on top of the standard rate."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why Statement Savings"))
    story.append(B.feature_grid([
        ("Earn from dollar one",
         "0.25% APY on all balances — no minimum balance to earn the standard rate."),
        ("Relationship rewards",
         "Link Statement Savings to Cumulus Premier Checking and earn a "
         "bonus of up to +0.30% APY based on your combined relationship balance."),
        ("Waivable monthly fee",
         "The $5 monthly service charge is waived with a $300 average daily "
         "balance or a linked Cumulus Checking account."),
        ("Automatic savings",
         "Schedule recurring transfers from your Cumulus checking or external "
         "accounts — weekly, biweekly, or monthly."),
        ("Mobile-first",
         "Deposit checks, move money, and track goals in the Cumulus app. "
         "Paperless e-statements are free."),
        ("Full FDIC coverage",
         "Your deposits are insured up to $250,000 per depositor, per "
         "ownership category, by the FDIC."),
    ], cols=2))
    story.append(Spacer(1, 0.06 * inch))

    # --------------------------------------------------------------- RATE TIERS
    story.append(B.section_header("Rate and relationship bonus",
                                  kicker="Interest & yield"))
    story.append(B.body_para(
        "Statement Savings earns 0.25% APY on all balances. When linked to a "
        "Cumulus Premier Checking account, your Statement Savings balance "
        "earns a relationship bonus based on the Premier combined-balance "
        "tier in effect at the end of each statement cycle. Interest is "
        "accrued daily using the Daily Balance method and credited on the "
        "last business day of each cycle."
    ))

    story.append(B.data_table(
        header=["Premier tier", "Combined balance", "Bonus APY", "Effective APY on Statement Savings"],
        rows=[
            ["Standalone", "—", "—", "0.25%"],
            ["Tier 2", "$25,000 – $99,999", "+0.10%", "0.35%"],
            ["Tier 3", "$100,000 – $249,999", "+0.15%", "0.40%"],
            ["Tier 4", "$250,000 – $499,999", "+0.20%", "0.45%"],
            ["Tier 5", "$500,000 – $999,999", "+0.25%", "0.50%"],
            ["Tier 6", "$1,000,000+", "+0.30%", "0.55%"],
        ],
        col_widths=[1.2 * inch, 1.9 * inch, 1.1 * inch, 3.1 * inch],
    ))

    story.append(Spacer(1, 0.08 * inch))
    story.append(B.sub_header("Illustrative balance growth"))
    story.append(B.growth_curve_chart(
        principal=10_000, apy=0.55, years=5,
        title="$10,000 at 0.55% effective APY (Premier Tier 6), compounded monthly — five-year projection",
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Fees", kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Fee", "Amount", "How to avoid or use"],
        rows=[
            ["Monthly service charge", "$5",
             "Waived with $300 average daily balance OR a linked Cumulus Checking account."],
            ["Paper statement", "$2 / cycle",
             "Enroll in free electronic statements in the Cumulus app."],
            ["Excessive-withdrawal advisory fee", "$10 per item over 6 / cycle",
             "Cumulus maintains a voluntary 6-per-cycle limit to encourage savings."],
            ["ATM card replacement", "No charge", "Optional ATM card; $1,000/day withdrawal limit."],
            ["Returned-item (NSF)", "No charge", "Cumulus does not assess NSF fees."],
            ["Outgoing domestic wire", "$25", "Submit in the Cumulus app."],
            ["Incoming wire", "No charge", "Domestic and international."],
        ],
        col_widths=[2.1 * inch, 1.8 * inch, 3.3 * inch],
    ))

    story.append(B.callout_box(
        "Regulation D — convenience withdrawal limits",
        "The Federal Reserve suspended the Regulation D six-per-month limit "
        "on convenience transfers from savings accounts in April 2020. "
        "Cumulus maintains a voluntary six-per-cycle advisory limit on "
        "preauthorized transfers, telephone transfers, and online transfers "
        "to help clients stay focused on saving. ATM withdrawals, in-branch "
        "withdrawals, and official checks mailed to you do not count toward the limit.",
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
                "Minor accounts available age 0–17 with a custodian under the "
                "Uniform Transfers to Minors Act (UTMA).",
                "Up to four joint owners per account.",
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
                "$25 minimum opening deposit.",
                "For UTMA minor accounts: minor's SSN and the custodian's "
                "government-issued ID.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How it works", kicker="Step by step"))
    story.append(B.data_table(
        header=["Step", "What happens"],
        rows=[
            ["1  ·  Open and fund",
             "Open in the Cumulus app, online, or at a branch with a $25 deposit."],
            ["2  ·  Set a savings goal",
             "Name your account (e.g., \"Emergency fund,\" \"Hawaii 2027\") and "
             "optionally set a target amount and date in the Cumulus app."],
            ["3  ·  Automate contributions",
             "Schedule recurring transfers from your checking on a weekly, "
             "biweekly, or monthly cadence."],
            ["4  ·  Link to Premier Checking",
             "If you hold Cumulus Premier Checking, link Statement Savings to "
             "earn the relationship bonus APY and waive the monthly fee."],
            ["5  ·  Watch interest accrue",
             "Interest is calculated daily and credited on the last business "
             "day of each cycle; view the Annual Percentage Yield Earned on "
             "every periodic statement."],
        ],
        col_widths=[1.6 * inch, 5.6 * inch],
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="How we safeguard your account"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["FDIC deposit insurance",
             "Up to $250,000 per depositor, per insured institution, for each "
             "ownership category."],
            ["Regulation DD — Truth in Savings",
             "APY, fees, and terms disclosed at opening and on every statement; "
             "30 days' advance notice of adverse changes."],
            ["Regulation E — electronic transactions",
             "Consumer protections for unauthorized electronic transactions."],
            ["Regulation CC — funds availability",
             "Next-business-day availability for most check deposits up to $5,525."],
            ["Regulation P — consumer privacy",
             "Data use governed by the Cumulus Consumer Privacy Notice."],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Do I really earn interest from the first dollar?",
         "Yes. Statement Savings pays 0.25% APY on all balances with no "
         "minimum-balance threshold to begin earning. Interest is accrued "
         "daily and credited monthly."),
        ("How does the Premier relationship bonus work?",
         "Link Statement Savings to a Cumulus Premier Checking account. At "
         "the end of each cycle, Cumulus identifies your Premier combined-"
         "balance tier and applies the corresponding bonus APY on top of the "
         "0.25% standard rate — up to 0.30 percentage points at Tier 6."),
        ("Is there a limit on how often I can withdraw?",
         "Cumulus maintains a voluntary six-per-cycle advisory limit on "
         "convenience transfers to help clients save. ATM withdrawals, "
         "in-branch withdrawals, and mailed official checks do not count."),
        ("Can I open a savings account for my child?",
         "Yes. Minor accounts are available for children age 0 through 17 "
         "under the Uniform Transfers to Minors Act (UTMA) with a custodian. "
         "There is no monthly service charge for accounts opened for minors."),
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
            "The Premier relationship bonus APY is available only when "
            "Statement Savings is linked to an active Cumulus Premier "
            "Checking account. The bonus is determined at the end of each "
            "statement cycle based on the Premier combined balance.",
            "The voluntary six-per-cycle withdrawal limit is an advisory "
            "guideline. Cumulus will not return transactions in excess of "
            "the limit; a $10 per-item advisory fee may be assessed after "
            "three consecutive cycles in excess of the limit.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
