"""Cumulus Premier Checking — gold-standard brochure (retail segment)."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import (
    Image, KeepTogether, PageBreak, Paragraph, Spacer, Table, TableStyle,
)

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "01_Personal_Deposits"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Premier_Checking.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Premier Checking",
        product_code="PD-CHK-PRM-2026.04",
        category="Personal Deposits",
        segment="retail",
    )

    story = []

    # ----------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Premier Checking",
        lede=("A relationship checking account that rewards qualifying clients "
              "with tiered interest, waived fees across the household, and "
              "priority service."),
        summary_rows=[
            ("Account type", "Personal tiered-rate interest checking"),
            ("Minimum opening deposit", "$100"),
            ("Monthly service charge", "$25 — waivable with qualifying activity"),
            ("Relationship APY", "Up to 1.85% APY on checking balances"),
            ("ATM access", "70,000+ surcharge-free ATMs (Allpoint & MoneyPass)"),
            ("Out-of-network ATM surcharges", "Unlimited rebates — domestic and international"),
            ("Overdraft protection", "$100 SafetyNet — no-fee grace on qualifying items"),
            ("Deposit insurance", "FDIC-insured up to $250,000 per ownership category"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL DEPOSITS",
    )
    story += B.switch_to_body()

    # ----------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Premier Checking is a demand-deposit account for clients who "
        "maintain a broader banking, borrowing, or investing relationship with "
        "Cumulus Bank. Qualifying clients receive tiered interest on their "
        "checking balance, fee waivers on eligible linked accounts, enhanced "
        "debit benefits, and priority access to Cumulus Client Services. "
        "Premier Checking is intended for personal, household, or family use "
        "and may not be used for business purposes."
    ))

    story.append(B.section_header("Key benefits", kicker="Why Premier Checking"))
    story.append(B.feature_grid([
        ("Tiered relationship APY",
         "Earn up to 1.85% APY on your checking balance when you link qualifying "
         "Cumulus deposit, investment, or mortgage relationships."),
        ("Household fee waivers",
         "Waive the monthly service charge on a linked Cumulus Everyday Checking "
         "account and on linked Statement Savings and Money Market accounts."),
        ("Unlimited ATM surcharge rebates",
         "No Cumulus ATM fees, and automatic rebates of third-party surcharges at "
         "any ATM in the United States or abroad."),
        ("Priority client service",
         "Dedicated Premier telephone line, in-branch fast-track service, and 24/7 "
         "secure messaging with a U.S.-based Cumulus banker."),
        ("Travel features",
         "No foreign transaction fee on Premier Debit purchases, complimentary "
         "CLEAR+ Family membership, and fuel rewards at 22,000 participating stations."),
        ("Identity and fraud protection",
         "CumulusShield identity monitoring with dark-web surveillance, real-time "
         "fraud alerts, and up to $1,000,000 in identity theft insurance."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # ----------------------------------------------------------------- APY TIERS
    story.append(B.section_header("Relationship APY tiers",
                                  kicker="Interest & yield"))
    story.append(B.body_para(
        "Your APY is set each statement cycle based on the combined month-end "
        "balance of your Premier Checking account and all linked Cumulus "
        "deposit, investment, and eligible trust accounts, plus the outstanding "
        "principal balance of any active Cumulus first-lien mortgage (credited "
        "up to $250,000). Interest is accrued daily using the Daily Balance "
        "method and credited on the last business day of each cycle."
    ))

    story.append(B.data_table(
        header=["Combined balance tier", "Checking APY",
                "Bonus on linked Statement Savings", "Bonus on linked High-Yield Savings"],
        rows=[
            ["Tier 1  ·  $0 – $24,999", "0.05%", "—", "—"],
            ["Tier 2  ·  $25,000 – $99,999", "0.40%", "+0.10%", "+0.05%"],
            ["Tier 3  ·  $100,000 – $249,999", "0.90%", "+0.15%", "+0.10%"],
            ["Tier 4  ·  $250,000 – $499,999", "1.35%", "+0.20%", "+0.15%"],
            ["Tier 5  ·  $500,000 – $999,999", "1.65%", "+0.25%", "+0.20%"],
            ["Tier 6  ·  $1,000,000 or more", "1.85%", "+0.30%", "+0.25%"],
        ],
        col_widths=[2.4 * inch, 1.2 * inch, 1.8 * inch, 1.9 * inch],
    ))
    story.append(Spacer(1, 0.10 * inch))

    story.append(B.sub_header("Illustrative balance growth"))
    story.append(B.growth_curve_chart(
        principal=50_000, apy=1.35, years=5,
        title="$50,000 at 1.35% APY (Tier 4), compounded monthly — five-year projection",
    ))

    story.append(B.callout_box(
        "How APY is calculated",
        "Cumulus uses the Daily Balance method. Interest is accrued each calendar "
        "day on the end-of-day collected balance using the rate tier in effect "
        "for that day, and is credited to your account on the last business day "
        "of each statement cycle. APY assumes interest remains on deposit for "
        "365 days; a withdrawal of interest will reduce earnings.",
    ))

    # ----------------------------------------------------------------- FEES
    story.append(B.section_header("Service charges",
                                  kicker="Fees & how to avoid them"))
    story.append(B.data_table(
        header=["Fee", "Amount", "How to avoid it"],
        rows=[
            ["Monthly service charge", "$25",
             "Maintain a $25,000 combined monthly average balance, OR receive "
             "$5,000+ in qualifying direct deposits each cycle, OR maintain an "
             "active Cumulus first-lien mortgage."],
            ["Paper statement", "$2 per cycle",
             "Enroll in electronic statements — default at account opening."],
            ["Domestic outgoing wire", "No charge", "Included as a Premier benefit."],
            ["Domestic incoming wire", "No charge", "Included."],
            ["International outgoing wire", "$25",
             "Waived at Tier 4 ($250,000 combined balance) and above."],
            ["International incoming wire", "No charge", "Included."],
            ["Stop-payment request", "No charge", "Included."],
            ["Overdraft-item charge", "No charge",
             "Premier uses SafetyNet in lieu of per-item overdraft fees (see below)."],
            ["Returned-item (NSF) charge", "No charge",
             "Cumulus does not assess NSF fees on personal deposit accounts."],
            ["Cashier's check", "No charge", "Included — in-branch or in the Cumulus app."],
            ["Replacement debit card", "No charge", "Includes expedited shipping."],
            ["Foreign transaction fee — Premier Debit", "0.00%",
             "No currency-conversion markup on Premier Debit purchases."],
        ],
        col_widths=[2.1 * inch, 1.2 * inch, 3.9 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "SafetyNet — no-fee overdraft grace",
        "If a transaction overdraws your Premier Checking account by $100 or "
        "less, Cumulus will pay the item at no charge, provided the account is "
        "returned to a positive balance by the end of the following business "
        "day. Items exceeding the $100 threshold are reviewed under Overdraft "
        "Courtesy (opt-in) or returned. Cumulus does not assess NSF fees on "
        "returned items.",
    ))

    story.append(B.sub_header("Ways to waive the monthly service charge"))
    story += B.bullet_list([
        "Maintain a <b>$25,000 combined monthly average balance</b> across eligible "
        "Cumulus deposit, investment, and trust relationships.",
        "Receive <b>$5,000 or more in qualifying direct deposits</b> per statement "
        "cycle (ACH payroll, pension, or government benefit).",
        "Maintain an <b>active Cumulus first-lien residential mortgage</b> in good standing.",
        "Link a <b>Cumulus Investment Services advisory account</b> with $100,000+ in "
        "managed assets to Premier Checking.",
        "Be <b>age 62 or older</b> and receive at least one monthly direct deposit of any amount.",
    ])

    # ----------------------------------------------------------------- ELIGIBILITY
    story.append(B.section_header("Eligibility and application",
                                  kicker="Account opening"))

    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who is eligible"),
            *B.bullet_list([
                "U.S. citizens, lawful permanent residents, and qualifying resident "
                "aliens age 18 or older with a valid Taxpayer Identification Number "
                "(SSN or ITIN).",
                "One Premier Checking account per primary owner; up to four joint "
                "owners may be added.",
                "Verification under the Customer Identification Program (USA "
                "PATRIOT Act, 31 C.F.R. § 1020.220) required at onboarding.",
                "OFAC and sanctions screening performed at onboarding and on an "
                "ongoing basis.",
                "Applicants with adverse ChexSystems history for fraud or abuse are "
                "ineligible; standard overdraft history is reviewed under Cumulus's "
                "Second Chance framework.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "A current, government-issued photo identification (driver's license, "
                "state ID, U.S. passport, or permanent resident card).",
                "Social Security Number or Individual Taxpayer Identification Number.",
                "A current residential address (post-office boxes are accepted only "
                "as a mailing address).",
                "An opening deposit of $100 (funded by ACH transfer, mobile check "
                "deposit, internal transfer, or in-branch deposit).",
                "For joint applicants, the above for each owner plus a signed Joint "
                "Account Agreement and IRS Form W-9.",
            ]),
        ],
    ))

    story.append(B.sub_header("The account-opening process"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Apply",
             "Complete an application online, in the Cumulus app, or at any branch. "
             "Identity is verified in real time through authoritative data sources.",
             "2–5 minutes"],
            ["2  ·  Fund",
             "Fund the account through same-day ACH, mobile check deposit, Zelle®, "
             "or an in-branch deposit. Minimum opening deposit is $100.",
             "Same business day"],
            ["3  ·  Activate",
             "Premier Debit is provisioned digitally to Apple Pay, Google Pay, "
             "Samsung Pay, or Garmin Pay immediately; a physical card is mailed by "
             "secure delivery.",
             "5–7 business days"],
            ["4  ·  Link relationships",
             "Link eligible Cumulus savings, money market, investment, or mortgage "
             "accounts to qualify for tiered APY and fee waivers.",
             "Real time"],
            ["5  ·  Direct deposit",
             "Redirect payroll from a prior institution using the Cumulus Direct "
             "Deposit Switch service, available in the Cumulus app.",
             "1–2 pay cycles"],
        ],
        col_widths=[1.1 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # ----------------------------------------------------------------- LIMITS
    story.append(B.section_header("Transaction capabilities",
                                  kicker="Limits & channels"))
    story.append(B.data_table(
        header=["Capability", "Daily limit", "Notes"],
        rows=[
            ["ATM withdrawal", "$1,500",
             "Limits up to $2,500 per day available on request for qualified clients."],
            ["Debit card purchases (signature and PIN)", "$10,000",
             "Limit reviews and increases available after 90 days of account tenure."],
            ["Mobile check deposit", "$25,000 per day  ·  $50,000 per month",
             "Funds are typically available the same business day up to $5,000; the "
             "balance on the next business day."],
            ["Zelle® outgoing transfer", "$5,000 per day  ·  $20,000 per month",
             "Send to any recipient with a U.S. bank account and a U.S. mobile "
             "number or email address."],
            ["ACH external transfer", "$25,000 per day  ·  $100,000 per month",
             "Standard next-business-day delivery; Same-Day ACH available ($3 fee "
             "waived on Premier)."],
            ["Domestic wire transfer", "$250,000 per day",
             "Submit in the Cumulus app before 5:00 p.m. ET for same-day processing."],
            ["International wire transfer", "$100,000 per day",
             "Supported in U.S. dollars and 130+ foreign currencies; retail FX "
             "margin 0.50%, Premier margin 0.25%."],
        ],
        col_widths=[2.3 * inch, 2.1 * inch, 2.8 * inch],
    ))

    # ----------------------------------------------------------------- DEBIT CARD
    story.append(B.section_header("The Premier Debit Mastercard®",
                                  kicker="Payments & travel"))
    story.append(B.body_para(
        "The Cumulus Premier Debit Mastercard® is provisioned digitally at "
        "account opening and delivered by secure mail in 5–7 business days. "
        "Premier Debit supports contactless (tap-to-pay) transactions, Apple "
        "Pay, Google Pay, Samsung Pay, and Garmin Pay, and carries no foreign "
        "transaction fee."
    ))

    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Included debit benefits"),
            *B.bullet_list([
                "Mastercard ID Theft Protection™ and zero liability for unauthorized "
                "transactions reported promptly.",
                "Cell-phone protection up to $800 per claim ($1,600 annually) when "
                "your wireless bill is paid with Premier Debit.",
                "Mastercard Travel Rewards — statement credits at participating "
                "international merchants.",
                "Roadside dispatch and MasterRental™ auto rental coverage (secondary).",
                "In-app card controls: freeze, merchant category blocks, travel "
                "notices, and channel-level spending limits.",
            ]),
        ],
        right_flowables=[
            B.bar_comparison_chart(
                labels=["Everyday", "Premier Tier 4", "Premier Tier 6"],
                values=[0.05, 1.35, 1.85],
                title="Checking APY — product & tier comparison",
            ),
            B.callout_box(
                "Fraud protection",
                "Zero-liability protection for unauthorized transactions reported "
                "promptly, real-time fraud alerts via push notification, SMS, and "
                "email, and in-app dispute filing with provisional credit for "
                "qualifying claims within two business days.",
            ),
        ],
        left_w=3.4 * inch, right_w=3.5 * inch,
    ))

    # ----------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="How we safeguard your account"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["FDIC deposit insurance",
             "Up to $250,000 per depositor, per insured institution, for each "
             "account ownership category."],
            ["Regulation E — unauthorized electronic transactions",
             "Zero liability for consumer accounts when the loss is reported within "
             "two business days of discovery; up to $50 if reported between days "
             "3 and 60; unreported losses beyond 60 days are subject to statutory limits."],
            ["Regulation CC — funds availability",
             "Next-business-day availability for most direct deposits and mobile "
             "check deposits up to $5,525; cash and wire deposits available same "
             "day. Availability holds are disclosed at the time of deposit."],
            ["Regulation DD — Truth in Savings",
             "APY, fees, and account terms are disclosed at account opening and on "
             "every periodic statement. Cumulus provides 30 days' advance written "
             "notice of adverse changes."],
            ["Regulation P — consumer privacy",
             "Cumulus does not sell personal information. Data use is governed by "
             "the Cumulus Consumer Privacy Notice, provided at account opening and "
             "annually thereafter."],
            ["Regulation GG — unlawful internet gambling",
             "Restricted transactions (12 C.F.R. Part 233) are prohibited."],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # ----------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions", kicker="Common questions"))
    faqs = [
        ("How is the combined balance that determines my rate tier calculated?",
         "On the last business day of each statement cycle, Cumulus adds the "
         "end-of-day collected balances of Premier Checking and all linked "
         "Cumulus personal deposit accounts; the most recent market value of "
         "linked Cumulus Investment Services brokerage and advisory accounts; "
         "and the outstanding principal balance of any active Cumulus first-lien "
         "mortgage, credited up to $250,000. Retirement accounts, 529 plans, "
         "and trust accounts held in a fiduciary capacity are included at full value."),
        ("If my balance falls below a tier threshold mid-cycle, does my APY change?",
         "Rate tiers are determined at the end of each statement cycle. "
         "Intra-cycle balance fluctuations do not affect the current cycle's APY. "
         "Cumulus provides 30 days' advance written notice of any adverse change "
         "to account terms, consistent with Regulation DD."),
        ("Are joint-account balances counted toward the combined balance?",
         "Yes. Balances in any joint account on which you are named as an owner "
         "are included in full toward your combined balance. The same balance is "
         "counted for each joint owner."),
        ("Can I link an overdraft source to Premier Checking?",
         "Yes. You may link a Cumulus Personal Line of Credit, a Cumulus "
         "savings account, or a Cumulus money-market account as an overdraft "
         "source. Transfers from a linked deposit account are processed at no "
         "charge; line-of-credit advances accrue interest at the product APR "
         "from the date of advance."),
        ("Does Premier Debit carry any foreign transaction fees?",
         "No. Premier Debit transactions abroad are converted at the Mastercard "
         "interbank rate with no currency-conversion markup. Travel notifications "
         "can be set in the Cumulus app to reduce the likelihood of fraud-prevention "
         "declines."),
        ("How many Premier Checking accounts may a household hold?",
         "One Premier Checking account per primary owner. A household may link "
         "one Everyday Checking account, unlimited savings and money-market "
         "accounts, and unlimited investment accounts to the Premier relationship."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    # ----------------------------------------------------------------- DISCLOSURES
    story += B.disclosure_block(
        "Important disclosures",
        B.STANDARD_DEPOSIT_DISCLOSURES + [
            "Mastercard® and the Mastercard brand mark are registered trademarks "
            "of Mastercard International Incorporated. Premier Debit cards are "
            "issued by Cumulus Bank, N.A. pursuant to license.",
            "CumulusShield identity monitoring is provided through an unaffiliated "
            "third-party service provider. The $1,000,000 identity theft insurance "
            "benefit is underwritten by an unaffiliated insurer and is subject to "
            "the terms and conditions of the master policy.",
            "CLEAR+ membership is a benefit of Premier Checking and is subject to "
            "availability at participating airports; membership is governed by "
            "CLEAR's applicable terms.",
            "Zelle® and the Zelle-related marks are the property of Early Warning "
            "Services, LLC.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
