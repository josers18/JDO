"""Cumulus High-Yield Savings — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_High_Yield_Savings.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus High-Yield Savings",
        product_code="PD-SAV-HYS-2026.04",
        category="Personal Deposits",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus High-Yield Savings",
        lede=("An online-forward savings account that pays a competitive, "
              "tiered Annual Percentage Yield from the first dollar — with "
              "no monthly fee and FDIC insurance."),
        summary_rows=[
            ("Account type", "Personal tiered-rate high-yield savings"),
            ("Minimum opening deposit", "$100"),
            ("Monthly service charge", "None"),
            ("Top-tier APY", "4.50% APY on balances of $250,000+"),
            ("Starting APY", "3.75% APY on balances $0–$9,999"),
            ("Convenience withdrawals", "6 per cycle advisory limit"),
            ("ATM card", "Optional (no fee) — $1,000 daily withdrawal limit"),
            ("Deposit insurance", "FDIC-insured up to $250,000 per ownership category"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL DEPOSITS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus High-Yield Savings (HYS) is built for clients who want a "
        "highly competitive Annual Percentage Yield on liquid savings "
        "without giving up FDIC insurance or day-to-day access. There is no "
        "monthly service charge and no minimum balance to earn the base "
        "tier rate. As your balance grows, your APY automatically steps up "
        "through four tiers to a top rate of 4.50% APY on $250,000 or more."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why High-Yield Savings"))
    story.append(B.feature_grid([
        ("Top-tier APY up to 4.50%",
         "Earn 4.50% APY on balances of $250,000 and above — among the "
         "most competitive yields on a federally insured savings account."),
        ("No monthly fee",
         "Zero monthly service charge regardless of balance. No surprise fees."),
        ("Earn from dollar one",
         "3.75% APY on the first $9,999 — no minimum balance required "
         "to earn interest."),
        ("FDIC insurance",
         "Every dollar is FDIC-insured up to $250,000 per depositor, per "
         "ownership category — so your savings are protected."),
        ("Optional ATM card",
         "Request a no-fee ATM card with a $1,000 daily withdrawal limit for "
         "direct cash access at 30,000+ Allpoint ATMs."),
        ("Seamless transfers",
         "Link your Cumulus Checking or external bank account and move "
         "money instantly between accounts in the Cumulus app."),
    ], cols=2))
    story.append(Spacer(1, 0.06 * inch))

    # --------------------------------------------------------------- RATE TIERS
    story.append(B.section_header("Rate tiers", kicker="Interest & yield"))
    story.append(B.body_para(
        "The APY earned on High-Yield Savings is determined daily based on "
        "the end-of-day collected balance in your account. Interest accrues "
        "daily on the full balance at the tier rate applicable to that "
        "day's balance and is credited on the last business day of each "
        "statement cycle. Tier APYs are variable and may change at the "
        "Bank's discretion; Cumulus provides 30 days' advance written "
        "notice of adverse changes."
    ))

    story.append(B.data_table(
        header=["Balance tier", "APY", "Interest method"],
        rows=[
            ["$0 – $9,999", "3.75%", "Daily balance, monthly credit"],
            ["$10,000 – $49,999", "4.10%", "Daily balance, monthly credit"],
            ["$50,000 – $249,999", "4.35%", "Daily balance, monthly credit"],
            ["$250,000 and above", "4.50%", "Daily balance, monthly credit"],
        ],
        col_widths=[3.3 * inch, 1.4 * inch, 2.6 * inch],
    ))

    story.append(Spacer(1, 0.08 * inch))
    story.append(B.sub_header("Illustrative balance growth"))
    story.append(B.growth_curve_chart(
        principal=25_000, apy=4.10, years=5,
        title="$25,000 at 4.10% APY (Tier 2), compounded monthly — five-year projection",
    ))

    story.append(B.callout_box(
        "How the tier rate is applied",
        "Cumulus uses a straight-tier method: the entire balance earns the "
        "APY corresponding to its tier. For example, a $60,000 balance earns "
        "4.35% APY on the full $60,000, not a blended rate. If your balance "
        "crosses a tier during the cycle, each day's interest is calculated "
        "using the tier in effect for that day's balance.",
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Fees", kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Fee", "Amount", "Notes"],
        rows=[
            ["Monthly service charge", "None", "No monthly fee at any balance."],
            ["Excessive-withdrawal advisory fee", "$10 per item over 6 / cycle",
             "Voluntary 6-per-cycle advisory limit; see below."],
            ["Paper statement", "$3 / cycle", "Free e-statements (default)."],
            ["ATM card (optional)", "No charge", "$1,000/day ATM withdrawal limit."],
            ["Outgoing domestic wire", "$25", "Submit in the Cumulus app."],
            ["Outgoing international wire", "$45", "FX margin 0.50%."],
            ["Incoming wire", "No charge", "Domestic and international."],
            ["Returned item (NSF)", "No charge", "Cumulus does not assess NSF fees."],
        ],
        col_widths=[2.2 * inch, 1.8 * inch, 3.2 * inch],
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
                "One primary owner; up to four joint owners permitted.",
                "Customer Identification Program (USA PATRIOT Act) verification "
                "at onboarding.",
                "OFAC and sanctions screening at onboarding and ongoing.",
                "No adverse ChexSystems history for fraud or abuse.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Government-issued photo ID for each owner.",
                "Social Security Number or Individual Taxpayer Identification Number.",
                "Current residential address.",
                "$100 minimum opening deposit by ACH, mobile check deposit, "
                "internal transfer, or in-branch deposit.",
                "IRS Form W-9 certified at onboarding.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How it works", kicker="Step by step"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Apply online",
             "Open an account in the Cumulus app or at cumulusbank.com. "
             "Identity verified in real time.",
             "3–5 minutes"],
            ["2  ·  Fund the account",
             "Transfer at least $100 from another bank via ACH, deposit a "
             "check by mobile, or wire in the opening balance.",
             "Same or next business day"],
            ["3  ·  Start earning",
             "Your full balance begins earning the applicable tier APY "
             "from the day it posts. Interest is credited monthly.",
             "Immediate"],
            ["4  ·  Move money as needed",
             "Transfer in and out of your Cumulus Checking or any linked "
             "external bank account. Or add the optional ATM card.",
             "Real time / 1–3 bus. days"],
            ["5  ·  Review on every statement",
             "See APY earned, interest paid, and tier details on your "
             "monthly e-statement.",
             "Monthly"],
        ],
        col_widths=[1.2 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- LIMITS
    story.append(B.section_header("Transaction capabilities",
                                  kicker="Limits & channels"))
    story.append(B.data_table(
        header=["Capability", "Daily limit", "Notes / Monthly"],
        rows=[
            ["ACH external transfer", "$25,000", "$100,000/mo; Same-Day ACH available."],
            ["Mobile check deposit", "$10,000", "$25,000/mo."],
            ["Cumulus to Cumulus transfer", "No limit", "Real time."],
            ["ATM withdrawal (optional card)", "$1,000", "Allpoint network surcharge-free."],
            ["Outgoing domestic wire", "$100,000", "Submit by 5:00 p.m. ET."],
            ["Convenience transfers (advisory)", "—", "6 per cycle voluntary limit."],
        ],
        col_widths=[2.8 * inch, 1.5 * inch, 2.9 * inch],
    ))

    story.append(B.callout_box(
        "Regulation D — convenience withdrawal limits",
        "The Federal Reserve suspended the Regulation D six-per-month limit "
        "on savings-account convenience transfers in April 2020. Cumulus "
        "maintains a voluntary six-per-cycle advisory limit on preauthorized, "
        "telephone, and online transfers and payments to help clients stay "
        "focused on saving. ATM, in-branch, and mailed official check "
        "withdrawals do not count toward the limit.",
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="How we safeguard your account"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["FDIC deposit insurance",
             "Up to $250,000 per depositor, per insured institution, for "
             "each ownership category."],
            ["Regulation DD — Truth in Savings",
             "APY, fees, and terms disclosed at opening and on every "
             "statement; 30 days' advance notice of adverse changes."],
            ["Regulation E — electronic transactions",
             "Consumer zero-liability protections for unauthorized electronic "
             "transactions when reported within two business days."],
            ["Regulation CC — funds availability",
             "Next-business-day availability for most check deposits up to $5,525."],
            ["Regulation P — consumer privacy",
             "Governed by the Cumulus Consumer Privacy Notice."],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Is the 4.50% APY guaranteed?",
         "The rate is accurate as of the effective date shown and is "
         "variable. Cumulus may change the rate at its discretion and will "
         "provide 30 days' advance written notice of any adverse change, "
         "consistent with Regulation DD."),
        ("How is interest calculated when my balance crosses a tier?",
         "Cumulus uses a straight-tier method. The entire end-of-day balance "
         "earns the APY for its tier. If the balance crosses a tier during "
         "the cycle, each day's interest is calculated at the tier "
         "corresponding to that day's balance."),
        ("Can I get a debit card?",
         "High-Yield Savings is designed for savings, not day-to-day "
         "spending. You can request an optional no-fee ATM card (not a debit "
         "card) with a $1,000 daily withdrawal limit. For debit and checking "
         "features, pair HYS with a Cumulus Checking account."),
        ("How fast can I move money between HYS and my checking account?",
         "Transfers between two Cumulus accounts are instant. Transfers to "
         "or from an external bank complete in 1–3 business days on the "
         "standard ACH rail, or the same business day with Same-Day ACH."),
        ("Is there a limit on how much I can deposit?",
         "There is no cap on the amount you can deposit. Note that FDIC "
         "insurance applies up to $250,000 per depositor, per ownership "
         "category — a Cumulus banker can help structure titling for larger "
         "balances."),
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
            "APY tiers are variable and may change at the Bank's discretion. "
            "Rates listed are accurate as of the effective date shown on the cover.",
            "The voluntary six-per-cycle convenience withdrawal limit is an "
            "advisory guideline; a $10 per-item advisory fee may be assessed "
            "after three consecutive cycles in excess of the limit.",
            "Allpoint® is a registered trademark of ATM National, LLC.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
