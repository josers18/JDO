"""Cumulus Business Fundamentals Checking — commercial segment."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "05_Business_Deposits"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Business_Fundamentals_Checking.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Business Fundamentals Checking",
        product_code="BD-CHK-FND-2026.04",
        category="Business Deposits",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Business Fundamentals Checking",
        lede=("A straightforward operating account for small and emerging "
              "businesses, with a generous free-transaction allowance, "
              "low-cost cash handling, and full access to Cumulus digital "
              "treasury tools."),
        summary_rows=[
            ("Account type", "Small-business demand deposit checking"),
            ("Minimum opening deposit", "$100"),
            ("Monthly service charge", "$15 — waivable with qualifying activity"),
            ("Free transaction items", "250 per statement cycle"),
            ("Free cash deposits", "$5,000 per cycle, then $0.25 / $100"),
            ("Overdraft coverage", "Linked-account protection and Business Credit Line sweep"),
            ("Digital treasury", "ACH, wires, Positive Pay, mobile deposit, RDC"),
            ("Deposit insurance", "FDIC-insured up to $250,000 per ownership category"),
        ],
        category_label="PRODUCT BROCHURE  ·  BUSINESS DEPOSITS",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Business Fundamentals Checking is an operating demand-deposit "
        "account for sole proprietors, professional practices, small "
        "businesses, and nonprofits with straightforward transaction volumes. "
        "The account is priced on a flat monthly basis with a generous free "
        "transaction allowance, and is eligible for the full suite of "
        "Cumulus digital treasury services. Relationship Managers are "
        "available for businesses evaluating Analyzed Checking or a broader "
        "treasury platform as transaction volumes scale."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why Fundamentals"))
    story.append(B.feature_grid([
        ("Predictable flat-fee pricing",
         "A single $15 monthly service charge, waivable with a $2,000 average "
         "daily balance or $1,000 in monthly debit-card activity."),
        ("Generous activity allowance",
         "250 combined debits and deposited items per cycle at no charge; "
         "$0.40 per item thereafter, billed on the monthly statement."),
        ("Low-cost cash handling",
         "Up to $5,000 in free cash deposits per cycle; $0.25 per $100 above "
         "that, with same-day credit on cash deposited at a Cumulus branch."),
        ("Integrated digital treasury",
         "Same-day ACH, Fedwire, Positive Pay, remote deposit capture, and "
         "mobile deposit included in the Cumulus Business Online platform."),
        ("Visa Business Debit",
         "Tap-to-pay, digital-wallet, and virtual-card support with "
         "merchant-category controls, spend alerts, and instant card lock."),
        ("Dedicated small-business support",
         "U.S.-based business banker line, in-branch appointments, and secure "
         "messaging in Cumulus Business Online, staffed Mon–Fri 7 a.m.–9 p.m. ET."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # PRICING
    story.append(B.section_header("Service charges and fees",
                                  kicker="Pricing"))
    story.append(B.data_table(
        header=["Fee", "Amount", "How it is assessed or waived"],
        rows=[
            ["Monthly service charge", "$15",
             "Waived with a $2,000 average daily collected balance OR "
             "$1,000+ in monthly Business Debit purchases."],
            ["Free transaction items", "250 / cycle",
             "Combined count of debits, credits, and deposited items posted "
             "during the statement cycle."],
            ["Excess items", "$0.40 / item",
             "Applied to items above 250 per cycle; itemized on the monthly "
             "statement."],
            ["Free cash deposits", "$5,000 / cycle",
             "Aggregate of currency and coin deposited at the teller line, "
             "ATM, or via armored courier."],
            ["Excess cash deposits", "$0.25 / $100",
             "Applied to currency above the $5,000 monthly allowance."],
            ["Domestic wire — outgoing", "$20",
             "Submitted via Cumulus Business Online before 5:45 p.m. ET for "
             "same-day settlement."],
            ["Domestic wire — incoming", "No charge", "Included."],
            ["Same-Day ACH origination", "$1 surcharge",
             "Surcharge applied above standard origination price."],
            ["Stop-payment", "$30 / item",
             "Submitted via Business Online or in-branch."],
            ["Returned deposited item", "$12 / item",
             "Charged when a deposited check is returned unpaid."],
            ["Paper statement", "$3 / cycle",
             "Waived with e-statement enrollment."],
        ],
        col_widths=[2.2 * inch, 1.2 * inch, 3.8 * inch],
    ))

    story.append(Spacer(1, 0.08 * inch))
    story.append(B.sub_header("Ways to waive the monthly service charge"))
    story += B.bullet_list([
        "Maintain a <b>$2,000 average daily collected balance</b> across the "
        "statement cycle.",
        "Post <b>$1,000 or more in Business Debit Card purchases</b> during the "
        "cycle (signature and PIN, domestic and international).",
        "Operate as a qualifying <b>501(c)(3) nonprofit</b>; fee automatically "
        "waived upon documentation.",
    ])

    # TRANSACTION COMPARISON CHART
    story.append(B.section_header("Transaction allowance in context",
                                  kicker="Activity profile"))
    story.append(B.body_para(
        "The 250 free-item allowance accommodates most small-business "
        "activity profiles. Businesses that routinely exceed 400 items per "
        "cycle or carry sustained balances above $25,000 should consider "
        "Business Analyzed Checking, where the Earnings Credit Rate offsets "
        "per-item service fees."
    ))
    story.append(B.bar_comparison_chart(
        labels=["Sole prop.", "Professional", "Retail (1 loc.)",
                "Wholesale", "Consider Analyzed"],
        values=[85, 180, 310, 520, 700],
        title="Typical monthly transaction items by business profile",
        ylabel="Items per cycle",
        value_fmt=lambda v: f"{v:,.0f}",
    ))
    story.append(B.callout_box(
        "When to graduate to Analyzed Checking",
        "When monthly volumes consistently exceed 400 items or the business "
        "begins using ACH origination, Positive Pay, lockbox, or wholesale "
        "remote deposit capture, the Earnings Credit Rate under Analyzed "
        "Checking will typically deliver a lower all-in cost. Your "
        "Relationship Manager will run a side-by-side comparison on request.",
    ))

    # ELIGIBILITY
    story.append(B.section_header("Eligibility and documentation",
                                  kicker="Account opening"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Eligible entities"),
            *B.bullet_list([
                "Sole proprietorships and single-member LLCs (with a valid EIN "
                "or SSN of the owner).",
                "General and limited partnerships, professional corporations, "
                "and limited liability companies.",
                "C-corporations and S-corporations domiciled in the United States.",
                "Non-profit organizations organized under Section 501(c).",
                "Homeowners' associations, trade associations, and other "
                "unincorporated associations with governing documents.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "IRS EIN letter (CP-575 or 147C) or, for sole proprietors, "
                "SSN of the principal.",
                "Formation documents: Articles of Organization / Incorporation, "
                "partnership agreement, operating agreement, or fictitious-name "
                "registration.",
                "Government-issued photo ID for all beneficial owners and "
                "authorized signers (31 C.F.R. § 1010.230).",
                "Corporate resolution or LLC consent designating authorized "
                "signers, where entity type requires.",
                "Certificate of Good Standing from the state of formation "
                "(for accounts over $250,000 opening deposit).",
            ]),
        ],
    ))

    # HOW IT WORKS
    story.append(B.section_header("Account opening process",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Apply",
             "Initiate an application in Cumulus Business Online, or schedule "
             "an appointment with a Business Banker. OFAC, CIP, and CDD "
             "screening performed in real time.",
             "10–15 minutes"],
            ["2  ·  Document",
             "Upload formation documents, beneficial-ownership certification "
             "(FinCEN), and government-issued identification for each signer.",
             "Same day"],
            ["3  ·  Fund",
             "Open the account with a $100 minimum. Funding via ACH, internal "
             "transfer, wire, or in-branch deposit.",
             "Same business day"],
            ["4  ·  Provision",
             "Business Debit Cards provisioned digitally to each signer; "
             "checks ordered through the Cumulus check-ordering service.",
             "5–7 business days"],
            ["5  ·  Integrate",
             "Connect accounting software (QuickBooks, Xero, NetSuite, Sage "
             "Intacct) via Open Banking APIs. Add Positive Pay and ACH "
             "origination if required.",
             "Real time"],
        ],
        col_widths=[1.1 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # CAPABILITIES
    story.append(B.section_header("Capabilities and limits",
                                  kicker="Payments & channels"))
    story.append(B.data_table(
        header=["Capability", "Default limit", "Notes"],
        rows=[
            ["Business Debit — purchases",
             "$15,000 / day  ·  $100,000 / mo",
             "Higher limits available by relationship review."],
            ["ATM withdrawal", "$2,000 / day",
             "30,000+ surcharge-free ATMs (Allpoint); $3 out-of-network."],
            ["Mobile check deposit",
             "$50,000 / day  ·  $250,000 / mo",
             "Funds generally available next business day; same-day up to $5,000."],
            ["Remote Deposit Capture (desktop scanner)",
             "$100,000 / day  ·  $500,000 / mo",
             "Panini Vision X or Digital Check TS240; scanner rental optional."],
            ["Domestic wire — outgoing",
             "$250,000 / day",
             "Submit by 5:45 p.m. ET for same-day settlement."],
            ["International wire — outgoing",
             "$100,000 / day",
             "USD and 130+ currencies; FX margin 0.35%."],
            ["ACH origination — standard",
             "$250,000 / day (default)",
             "Requires ACH Origination service enrollment; higher by agreement."],
            ["Zelle for Business®", "$5,000 / day  ·  $20,000 / mo",
             "Outgoing only; incoming unlimited."],
        ],
        col_widths=[2.3 * inch, 2.1 * inch, 2.8 * inch],
    ))

    # SECURITY / REGULATORY
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="How we safeguard your account"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["FDIC deposit insurance",
             "Up to $250,000 per depositor, per insured institution, for each "
             "account ownership category (12 U.S.C. § 1821)."],
            ["Regulation E — commercial carve-out",
             "Business accounts are not governed by Regulation E; unauthorized "
             "transaction liability is addressed under UCC Articles 3 and 4 "
             "and the Business Deposit Agreement."],
            ["Regulation CC — funds availability",
             "Next-business-day availability for most check deposits; holds "
             "disclosed at deposit. Cash deposited in-branch is available same day."],
            ["Regulation DD — Truth in Savings",
             "Applies to commercial deposits at Cumulus's election; APY, fees, "
             "and terms are disclosed at account opening and on periodic "
             "statements."],
            ["Regulation P / GLBA — information safeguards",
             "Administrative, physical, and technical safeguards consistent "
             "with the Interagency Guidelines Establishing Information Security "
             "Standards."],
            ["Cumulus SecureOperate",
             "Dual-control for wires and ACH origination, device binding, "
             "IP-whitelisting, callback verification, and multi-factor "
             "authentication on all treasury services."],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How are free transaction items counted?",
         "We count each posted debit, credit, and deposited item (including "
         "ACH entries, check deposits, and checks paid) against the 250-item "
         "allowance. Internal transfers between linked Cumulus accounts are "
         "not counted. Excess items are billed at $0.40 on the monthly "
         "statement."),
        ("Can I upgrade to Business Analyzed Checking later?",
         "Yes. Your Relationship Manager can convert the account to Analyzed "
         "Checking at the start of the next statement cycle without "
         "disrupting account numbers, direct deposits, or ACH authorizations. "
         "We will run a three-month side-by-side analysis to confirm the "
         "economics."),
        ("Is Positive Pay included?",
         "Positive Pay is an optional treasury service priced separately "
         "($35 / month + $0.05 per item). Cumulus recommends Positive Pay for "
         "any business that issues more than 25 checks per month."),
        ("Do I need a separate account for payroll?",
         "Not required. You may segregate payroll using a Zero Balance "
         "Account (ZBA) sub-account linked to this master. ZBA sub-accounts "
         "are $25 per month each; funds sweep daily to a zero end-of-day "
         "balance."),
        ("Can I earn interest on Fundamentals Checking?",
         "Business Fundamentals is a non-interest-bearing DDA. Operating "
         "balances above your working-capital needs should be held in a "
         "Cumulus Business Money Market, a Business CD, or a Sweep Account."),
        ("What happens if I exceed the free cash-deposit allowance?",
         "Cash deposited in excess of $5,000 per cycle is billed at $0.25 per "
         "$100. For businesses that routinely deposit more than $25,000 in "
         "cash per month, Cumulus recommends armored courier pickup and a "
         "cash-vault service arrangement."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    # DISCLOSURES
    story += B.disclosure_block(
        "Important disclosures",
        B.STANDARD_DEPOSIT_DISCLOSURES + [
            "Business Fundamentals Checking is a non-interest-bearing demand "
            "deposit account. Account terms, fees, and transaction limits are "
            "set forth in the Cumulus Business Deposit Agreement and the "
            "Cumulus Business Schedule of Fees, which control in the event of "
            "a conflict with marketing materials.",
            "Beneficial-ownership information is collected pursuant to 31 "
            "C.F.R. § 1010.230 and the Corporate Transparency Act.",
            "Visa® and the Visa brand mark are registered trademarks of Visa "
            "International Service Association. Business Debit Cards are "
            "issued by Cumulus Bank, N.A. pursuant to license from Visa U.S.A. Inc.",
            "Zelle for Business® is offered in participation with Early "
            "Warning Services, LLC. Transaction limits and eligibility are "
            "governed by the Zelle for Business Service Agreement.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
