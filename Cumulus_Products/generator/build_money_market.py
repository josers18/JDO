"""Cumulus Money Market — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Money_Market.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Money Market",
        product_code="PD-SAV-MMA-2026.04",
        category="Personal Deposits",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Money Market",
        lede=("A tiered money-market account for clients who want higher "
              "yields on larger balances — with check-writing, debit card "
              "access, and full digital banking."),
        summary_rows=[
            ("Account type", "Personal tiered-rate money-market"),
            ("Minimum opening deposit", "$2,500"),
            ("Monthly service charge", "$15 — waived with $10,000 avg balance"),
            ("Top-tier APY", "4.10% APY on balances $250,000+"),
            ("Starting APY", "0.50% APY on balances under $10,000"),
            ("Check writing", "5 checks per cycle included"),
            ("Debit access", "Cumulus Money Market Debit Mastercard® optional"),
            ("Deposit insurance", "FDIC-insured up to $250,000 per ownership category"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL DEPOSITS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Money Market is an interest-bearing deposit account that "
        "combines the yield of a savings product with the everyday "
        "convenience of checks, debit card, ACH, and wire transfers. Clients "
        "who maintain higher balances are rewarded with meaningfully higher "
        "Annual Percentage Yields, stepping up through five tiers to a top "
        "rate of 4.10% APY on balances of $250,000 or more. Balances below "
        "$10,000 earn a modest base rate — for the strongest yield on smaller "
        "balances, consider Cumulus High-Yield Savings."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why Money Market"))
    story.append(B.feature_grid([
        ("Five tiers up to 4.10% APY",
         "Balances of $250,000+ earn 4.10% APY. Lower tiers earn 3.85%, "
         "3.40%, 2.00%, and a 0.50% base for balances below $10,000."),
        ("Check writing and debit access",
         "Write up to 5 checks per cycle at no charge and use a Money Market "
         "Debit Mastercard® for purchases and ATM withdrawals."),
        ("Waive the monthly fee",
         "The $15 monthly service charge is waived with a $10,000 average "
         "daily balance — an easy bar for most Money Market households."),
        ("Full digital banking",
         "Mobile check deposit, Zelle®, Bill Pay, ACH transfers, and "
         "external-account links in the Cumulus app."),
        ("FDIC insurance",
         "Every dollar is FDIC-insured up to $250,000 per depositor, per "
         "ownership category."),
        ("Relationship-friendly",
         "Pairs with Cumulus Premier Checking — Money Market balances count "
         "toward the Premier combined-balance tiers."),
    ], cols=2))
    story.append(Spacer(1, 0.06 * inch))

    # --------------------------------------------------------------- RATE TIERS
    story.append(B.section_header("Rate tiers", kicker="Interest & yield"))
    story.append(B.body_para(
        "Money Market APY is determined daily based on your end-of-day "
        "collected balance. The entire balance earns the APY for its tier — "
        "a straight-tier, not blended-rate, method. Interest accrues daily "
        "using the Daily Balance method and is credited on the last business "
        "day of each statement cycle."
    ))

    story.append(B.data_table(
        header=["Balance tier", "APY"],
        rows=[
            ["Under $10,000", "0.50%"],
            ["$10,000 – $24,999", "2.00%"],
            ["$25,000 – $99,999", "3.40%"],
            ["$100,000 – $249,999", "3.85%"],
            ["$250,000 and above", "4.10%"],
        ],
        col_widths=[4.8 * inch, 2.5 * inch],
    ))

    story.append(Spacer(1, 0.08 * inch))
    story.append(B.sub_header("Illustrative balance growth"))
    story.append(B.growth_curve_chart(
        principal=100_000, apy=3.85, years=5,
        title="$100,000 at 3.85% APY (Tier 4), compounded monthly — five-year projection",
    ))

    story.append(B.callout_box(
        "Tip — crossing into the top tier",
        "Clients with $225,000–$249,999 may wish to consolidate linked "
        "external accounts or laddered CDs that have matured into Money "
        "Market to cross the $250,000 threshold and capture the top tier APY "
        "of 4.10%. Your Cumulus banker can help model the yield differential.",
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Fees", kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Fee", "Amount", "How to avoid or use"],
        rows=[
            ["Monthly service charge", "$15",
             "Waived with $10,000 average daily balance."],
            ["Excessive check / debit item over 5 per cycle", "$5 per item",
             "Included 5 items per cycle cover most clients."],
            ["Excessive convenience withdrawal over 6 per cycle", "$10 per item",
             "Voluntary advisory limit (see below)."],
            ["Paper statement", "$3 / cycle", "Free e-statements (default)."],
            ["Outgoing domestic wire", "$25", "Submit in the Cumulus app."],
            ["Outgoing international wire", "$45", "FX margin 0.50%."],
            ["Incoming wire", "No charge", "Domestic and international."],
            ["Returned item (NSF)", "No charge", "Cumulus does not assess NSF fees."],
        ],
        col_widths=[2.4 * inch, 1.5 * inch, 3.4 * inch],
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
                "Trust and custodial titling supported (revocable, UTMA).",
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
                "$2,500 minimum opening deposit.",
                "For trust titling: a copy of the trust certification or trust agreement.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- LIMITS
    story.append(B.section_header("Transaction capabilities",
                                  kicker="Limits & channels"))
    story.append(B.data_table(
        header=["Capability", "Limit", "Notes"],
        rows=[
            ["Checks written", "5 per cycle", "Included; $5 each over 5."],
            ["Debit card purchases (optional)", "$5,000 / day",
             "Signature + PIN combined."],
            ["ATM withdrawals (optional debit)", "$1,000 / day",
             "Allpoint surcharge-free network."],
            ["Mobile check deposit", "$10,000 / day",
             "$25,000 / month."],
            ["ACH external transfer", "$25,000 / day",
             "$100,000 / month. Same-Day ACH available."],
            ["Outgoing domestic wire", "$250,000 / day",
             "Submit by 5:00 p.m. ET."],
            ["Outgoing international wire", "$100,000 / day",
             "Supported in 130+ currencies; FX margin 0.50%."],
            ["Convenience transfers (advisory)", "6 per cycle",
             "Voluntary limit; see callout below."],
        ],
        col_widths=[2.6 * inch, 1.8 * inch, 2.9 * inch],
    ))

    story.append(B.callout_box(
        "Regulation D — convenience withdrawal limits",
        "The Federal Reserve suspended the Regulation D six-per-month limit "
        "on money-market convenience transfers in April 2020. Cumulus "
        "maintains a voluntary six-per-cycle advisory limit on preauthorized "
        "transfers, telephone transfers, and online transfers. Checks drawn "
        "on your Money Market account, debit-card purchases, ATM withdrawals, "
        "and in-branch withdrawals do not count toward the advisory limit.",
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
             "Consumer protections for unauthorized electronic transactions "
             "when reported within two business days."],
            ["Regulation CC — funds availability",
             "Next-business-day availability for most check deposits up to $5,525."],
            ["Regulation GG — unlawful internet gambling",
             "Restricted transactions are prohibited under 12 C.F.R. Part 233."],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Money market or high-yield savings — which is right for me?",
         "High-Yield Savings is optimal for savers with balances under "
         "$50,000 who want the strongest yield without check-writing. Money "
         "Market is optimal for clients with larger balances who want "
         "check-writing, debit, and wire capabilities. Many clients hold both."),
        ("How are tier rates applied if my balance changes?",
         "Cumulus uses a straight-tier method. Each day's interest is "
         "calculated at the APY corresponding to that day's end-of-day "
         "balance. The entire balance earns a single tier rate, not a blended rate."),
        ("Does this account pair with Premier Checking?",
         "Yes. Money Market balances count in full toward the Cumulus "
         "Premier Checking combined-balance tier calculation, which can "
         "raise your Premier relationship APY and waive additional service charges."),
        ("Can I write more than 5 checks in a cycle?",
         "Yes. Checks above 5 per cycle are honored at a $5 per-item excess "
         "fee. Most Money Market clients do not exceed the included limit."),
        ("Is there a penalty for closing the account?",
         "No. You may close your Money Market account at any time. The "
         "balance and any accrued, uncredited interest will be paid to you "
         "at closing."),
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
            "Tier APYs are variable and may change at the Bank's discretion. "
            "Rates listed are accurate as of the effective date shown on the cover.",
            "The voluntary six-per-cycle convenience withdrawal limit is an "
            "advisory guideline. A $10 per-item advisory fee may be assessed "
            "after three consecutive cycles in excess of the limit.",
            "Mastercard® and the Mastercard brand mark are registered "
            "trademarks of Mastercard International Incorporated.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
