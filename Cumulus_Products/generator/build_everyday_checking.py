"""Cumulus Everyday Checking — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Everyday_Checking.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Everyday Checking",
        product_code="PD-CHK-EVD-2026.04",
        category="Personal Deposits",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Everyday Checking",
        lede=("A straightforward personal checking account with no per-item "
              "overdraft fees, nationwide surcharge-free ATMs, and modern "
              "digital banking tools."),
        summary_rows=[
            ("Account type", "Personal interest-bearing demand deposit"),
            ("Minimum opening deposit", "$25"),
            ("Monthly service charge", "$12 — waivable three ways"),
            ("Interest-bearing APY", "0.01% APY on all balances"),
            ("ATM access", "30,000+ surcharge-free ATMs (Allpoint network)"),
            ("Out-of-network ATM fee", "$3 per withdrawal"),
            ("Overdraft protection", "SafetyNet $50 grace — no per-item NSF"),
            ("Deposit insurance", "FDIC-insured up to $250,000 per ownership category"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL DEPOSITS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Everyday Checking is designed for personal, household, or "
        "family use by clients who want a dependable checking account without "
        "per-item overdraft fees or complex balance requirements. The account "
        "includes contactless debit, digital wallet provisioning at account "
        "opening, mobile check deposit, Zelle®, and Same-Day ACH transfers. "
        "Younger clients age 17 through 24 and households with qualifying "
        "direct deposits receive an automatic waiver of the monthly service charge."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why Everyday Checking"))
    story.append(B.feature_grid([
        ("No per-item NSF fees",
         "Cumulus does not assess non-sufficient-funds charges on returned "
         "items. SafetyNet covers overdrafts of $50 or less with no fee."),
        ("Three easy ways to waive the fee",
         "Waive the $12 monthly service charge with $500 in monthly direct "
         "deposits, a $1,500 average daily balance, or simply by being age 17–24."),
        ("Broad ATM access",
         "Use 30,000+ Allpoint-network ATMs nationwide with no surcharge. "
         "Out-of-network withdrawals are $3 each."),
        ("Contactless debit and wallets",
         "Your Cumulus Debit Mastercard® is provisioned to Apple Pay, Google "
         "Pay, and Samsung Pay the moment your account opens."),
        ("Mobile-first deposits",
         "Deposit checks from your phone up to $5,000 per day and $10,000 "
         "per month; funds are typically available the next business day."),
        ("Zelle® and Same-Day ACH",
         "Send money to friends and family in minutes with Zelle, or move "
         "funds between banks the same business day with Same-Day ACH."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Fees", kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Fee", "Amount", "How to avoid or use"],
        rows=[
            ["Monthly service charge", "$12",
             "Waived with $500+ direct deposits per cycle, OR $1,500 average "
             "daily balance, OR primary owner age 17–24."],
            ["Out-of-network ATM", "$3",
             "Use an Allpoint ATM to avoid — locate one in the Cumulus app."],
            ["Paper statement", "$2 / cycle",
             "Enroll in electronic statements at account opening."],
            ["Returned-item (NSF)", "No charge", "Cumulus does not charge NSF fees."],
            ["Overdraft-item charge", "No charge",
             "SafetyNet covers overdrafts up to $50 with no fee."],
            ["Stop-payment request", "$30",
             "Submit online or through Cumulus Client Services."],
            ["Domestic outgoing wire", "$25",
             "Submit by 5:00 p.m. ET in the Cumulus app for same-day processing."],
            ["International outgoing wire", "$45",
             "Initiated in the Cumulus app; FX margin 0.50%."],
            ["Cashier's check", "$8", "Free to customers age 62 and older."],
            ["Replacement debit card (standard)", "No charge",
             "Expedited shipping $25."],
        ],
        col_widths=[2.1 * inch, 1.1 * inch, 4.0 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "SafetyNet — no-fee overdraft grace",
        "When a transaction overdraws your Everyday Checking account by $50 "
        "or less, Cumulus will pay the item at no charge, provided the "
        "account is returned to a positive balance by the end of the next "
        "business day. Items above the SafetyNet threshold are reviewed "
        "under Overdraft Courtesy (opt-in) or returned at no NSF fee.",
    ))

    # --------------------------------------------------------------- INTEREST / CHART
    story.append(B.section_header("Interest and balance projection",
                                  kicker="Earn while you spend"))
    story.append(B.body_para(
        "Everyday Checking earns 0.01% APY on all balances. Interest is "
        "accrued daily on the collected balance using the Daily Balance "
        "method and credited on the last business day of each statement "
        "cycle. Clients seeking higher yields on savings may wish to pair "
        "Everyday Checking with a Cumulus Statement Savings, High-Yield "
        "Savings, or Money Market account."
    ))
    story.append(B.growth_curve_chart(
        principal=5_000, apy=0.01, years=5,
        title="$5,000 at 0.01% APY, compounded monthly — five-year projection",
    ))

    # --------------------------------------------------------------- ELIGIBILITY
    story.append(B.section_header("Eligibility and application",
                                  kicker="Account opening"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who is eligible"),
            *B.bullet_list([
                "U.S. citizens, lawful permanent residents, and qualifying "
                "resident aliens age 17 or older (age 13+ with a co-owner) "
                "with a valid SSN or ITIN.",
                "One Everyday Checking account per primary owner; up to four "
                "joint owners permitted.",
                "Identity verified through the Customer Identification Program "
                "(USA PATRIOT Act, 31 C.F.R. § 1020.220).",
                "OFAC and sanctions screening at onboarding and on an ongoing basis.",
                "Applicants with adverse ChexSystems history for fraud or abuse "
                "are ineligible; standard overdraft history is reviewed under "
                "the Cumulus Second Chance framework.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Current, government-issued photo ID (driver's license, state "
                "ID, U.S. passport, or permanent resident card).",
                "Social Security Number or Individual Taxpayer Identification Number.",
                "Current residential address (P.O. boxes accepted only as mailing address).",
                "$25 minimum opening deposit by ACH, mobile check deposit, "
                "Zelle, internal transfer, or in-branch deposit.",
                "For joint applicants, the above for each owner plus a signed "
                "Joint Account Agreement and IRS Form W-9.",
            ]),
        ],
    ))

    story.append(B.sub_header("How to open your account"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Apply",
             "Complete the application online, in the Cumulus app, or at any "
             "branch. Identity verified in real time through authoritative sources.",
             "2–5 minutes"],
            ["2  ·  Fund",
             "Fund with Same-Day ACH, mobile check deposit, Zelle, or an "
             "in-branch deposit. Minimum $25.",
             "Same business day"],
            ["3  ·  Activate",
             "Your Cumulus Debit Mastercard® is provisioned digitally to Apple "
             "Pay, Google Pay, and Samsung Pay immediately.",
             "Real time"],
            ["4  ·  Card delivered",
             "Physical debit card arrives by secure mail.",
             "5–7 business days"],
            ["5  ·  Set up direct deposit",
             "Redirect payroll using the Cumulus Direct Deposit Switch in the app.",
             "1–2 pay cycles"],
        ],
        col_widths=[1.1 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- LIMITS
    story.append(B.section_header("Daily transaction limits",
                                  kicker="Capabilities & channels"))
    story.append(B.data_table(
        header=["Capability", "Daily limit", "Monthly limit / notes"],
        rows=[
            ["ATM withdrawal", "$500", "Limit reviews available after 90 days."],
            ["Debit card purchases", "$3,000", "Signature and PIN combined."],
            ["Mobile check deposit", "$5,000", "$10,000 per month."],
            ["Zelle® outgoing", "$1,000", "$5,000 per month."],
            ["ACH external transfer", "$5,000", "$25,000 per month; Same-Day ACH $3 fee."],
            ["Cumulus to Cumulus transfer", "No limit", "Real-time transfer between your Cumulus accounts."],
            ["Bill Pay", "$10,000", "$25,000 per month."],
        ],
        col_widths=[2.4 * inch, 1.5 * inch, 3.3 * inch],
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
            ["Regulation E — electronic transactions",
             "Zero liability for unauthorized electronic transactions reported "
             "within two business days of discovery; up to $50 if reported "
             "between days 3 and 60."],
            ["Regulation CC — funds availability",
             "Next-business-day availability for most direct deposits and "
             "mobile check deposits up to $5,525."],
            ["Regulation DD — Truth in Savings",
             "APY, fees, and account terms disclosed at opening and on every "
             "periodic statement. 30 days' advance notice of adverse changes."],
            ["Regulation P — consumer privacy",
             "Cumulus does not sell personal information. Privacy Notice "
             "provided annually."],
            ["Regulation GG — unlawful internet gambling",
             "Restricted transactions under 12 C.F.R. Part 233 are prohibited."],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How do I avoid the $12 monthly service charge?",
         "Meet any one of three conditions: receive $500 or more in direct "
         "deposits per statement cycle; maintain a $1,500 average daily "
         "balance; or be the primary owner and age 17–24. The fee is "
         "automatically waived any cycle you meet a qualifier."),
        ("What happens if I overdraw my account?",
         "If the overdraft is $50 or less and your account is returned to a "
         "positive balance by the end of the next business day, no fee is "
         "charged — this is SafetyNet. Larger overdrafts may be returned or, "
         "if you opt into Overdraft Courtesy, paid at Cumulus's discretion. "
         "Cumulus does not charge NSF fees on returned items."),
        ("Can I use ATMs outside the Allpoint network?",
         "Yes. Out-of-network ATM withdrawals incur a $3 Cumulus fee plus any "
         "surcharge assessed by the ATM owner. Use the locator in the Cumulus "
         "app to find fee-free Allpoint ATMs."),
        ("Is mobile check deposit free?",
         "Yes. Deposit checks from your phone at no charge up to $5,000 per "
         "day and $10,000 per month. Funds are typically available the next "
         "business day, subject to Regulation CC."),
        ("Does the debit card work abroad?",
         "Yes. The Cumulus Debit Mastercard® is accepted at millions of "
         "merchants and ATMs worldwide. Foreign-currency transactions incur a "
         "3% international service assessment."),
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
            "Mastercard® and the Mastercard brand mark are registered "
            "trademarks of Mastercard International Incorporated.",
            "Zelle® and the Zelle-related marks are the property of Early "
            "Warning Services, LLC. Availability may be limited based on your "
            "enrollment and the recipient's bank.",
            "Allpoint® is a registered trademark of ATM National, LLC.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
