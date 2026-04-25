"""Cumulus Business Analyzed Checking — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Business_Analyzed_Checking.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Business Analyzed Checking",
        product_code="BD-CHK-ANL-2026.04",
        category="Business Deposits",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Business Analyzed Checking",
        lede=("A commercial operating account that prices transactions at "
              "unbundled rates and applies an Earnings Credit Rate on "
              "collected balances to offset service fees — the foundation "
              "for any Cumulus treasury relationship."),
        summary_rows=[
            ("Account type", "Commercial demand deposit checking (analyzed)"),
            ("Minimum opening deposit", "$2,500"),
            ("Earnings Credit Rate (ECR)", "3.50% on net collected balances"),
            ("Per-item debit / credit pricing", "$0.18 debit  ·  $0.22 credit"),
            ("Deposited-item pricing", "$0.14 per item  ·  $0.65 / $100 cash vault"),
            ("Treasury services", "Required account type for ACH origination, Positive Pay, lockbox"),
            ("Monthly statement", "Detailed account analysis statement (AA)"),
            ("Deposit insurance", "FDIC-insured up to $250,000 per ownership category"),
        ],
        category_label="PRODUCT BROCHURE  ·  BUSINESS DEPOSITS",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Business Analyzed Checking is a commercial demand-deposit "
        "account designed for mid-market and large corporate clients. "
        "Instead of charging a flat monthly fee, the account is priced at "
        "the individual service-charge level and each statement cycle is "
        "reconciled on a detailed account analysis statement. Collected "
        "balances earn an Earnings Credit (at the Earnings Credit Rate, or "
        "ECR) which offsets eligible service fees on a dollar-for-dollar "
        "basis. Analyzed Checking is the required operating account for "
        "clients engaging Cumulus treasury services — ACH origination, "
        "Positive Pay, lockbox, wholesale remote deposit capture, and "
        "controlled-disbursement."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why Analyzed Checking"))
    story.append(B.feature_grid([
        ("Earnings Credit Rate — 3.50%",
         "Net collected balances (after a 10% reserve deduction) earn credit "
         "at 3.50% annualized. Credit offsets eligible service fees on the "
         "same monthly analysis."),
        ("Unbundled transaction pricing",
         "Every service is priced individually: debits, credits, deposited "
         "items, cash vault, ACH, wires, and treasury services are itemized "
         "on the analysis statement."),
        ("Foundation for treasury",
         "Required account type for ACH origination, Positive Pay, ACH "
         "Services, wholesale lockbox, RDC, Sweep, and Zero-Balance Account "
         "structures."),
        ("Detailed account analysis statement",
         "Monthly AA statement itemizing average collected balance, float, "
         "ECR, earnings credit, service charges, and net analysis position. "
         "Customizable reporting via BAI2 or ISO 20022 camt.053."),
        ("Balance compensation flexibility",
         "Clients may elect to compensate for services via balances (ECR), "
         "fees, or a hybrid arrangement reviewed annually with the "
         "Relationship Manager."),
        ("Intercompany aggregation",
         "Related-party balances may be aggregated under a master analysis "
         "group for ECR purposes, subject to appropriate documentation and "
         "Regulation D / Regulation W considerations."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # ECR MECHANICS
    story.append(B.section_header("How the Earnings Credit works",
                                  kicker="Mechanics"))
    story.append(B.body_para(
        "Each statement cycle, Cumulus calculates the average collected "
        "balance held in the account (average ledger balance less float). "
        "A 10% reserve requirement is deducted; the remaining net "
        "investable balance is credited at the ECR on a 365-day basis. The "
        "resulting earnings credit is applied against eligible service "
        "charges billed on the same cycle. If earnings credit exceeds "
        "service charges, the surplus does not carry forward to the next "
        "cycle (Cumulus offers a Hard-Charge option to bill excess services "
        "in cash rather than consume additional balances)."
    ))

    story.append(B.data_table(
        header=["Analysis component", "Calculation"],
        rows=[
            ["Average ledger balance",
             "Sum of daily ledger balances ÷ days in cycle."],
            ["Less: float",
             "Items in collection not yet in available funds (typically "
             "0–2 days for most check items)."],
            ["= Average collected balance",
             "Basis for ECR calculation."],
            ["Less: reserve requirement",
             "10% deduction; remainder is the net investable balance."],
            ["× ECR × (days in cycle / 365)",
             "Earnings credit calculated pro rata for the cycle."],
            ["Less: total service charges",
             "All eligible itemized charges incurred during the cycle."],
            ["= Net analysis position",
             "Positive = covered by balances. Negative = billed in cash."],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    story.append(Spacer(1, 0.08 * inch))
    story.append(B.callout_box(
        "ECR calculation — worked illustration",
        "A client holds a $1,000,000 average collected balance; the 10% "
        "reserve leaves $900,000 net investable. At a 3.50% ECR over a "
        "30-day cycle, the earnings credit is approximately $2,589.04. "
        "Against $2,200 of itemized service charges that cycle, the net "
        "analysis is positive $389.04 (covered by balances — no cash fee).",
    ))

    # PRICING
    story.append(B.section_header("Unbundled transaction pricing",
                                  kicker="Fee schedule"))
    story.append(B.data_table(
        header=["Service", "Unit price", "Notes"],
        rows=[
            ["Account maintenance",
             "$22 / month",
             "Flat monthly charge; offset by earnings credit."],
            ["Posted debit (check paid, ACH debit, wire debit, ATM)",
             "$0.18 / item",
             ""],
            ["Posted credit (deposit posted, ACH credit received, wire credit)",
             "$0.22 / item",
             ""],
            ["Deposited item (checks deposited)",
             "$0.14 / item",
             "Includes electronic items from Remote Deposit Capture."],
            ["Cash vault deposit",
             "$0.65 / $100",
             "Armored courier / vault credit; same-day credit by cut-off."],
            ["Cash order (currency ordered)",
             "$0.85 / $100",
             "Includes standard strap breakdown."],
            ["Domestic wire — outgoing",
             "$18 / item",
             "Submit by 5:45 p.m. ET for same-day settlement."],
            ["Domestic wire — incoming",
             "No charge",
             "Included."],
            ["ACH origination — standard",
             "$0.10 / item  ·  $5 / file",
             "Per ACH Origination service; Same-Day surcharge $1."],
            ["Positive Pay",
             "$35 / month  ·  $0.05 / item",
             "Check + ACH Positive Pay combined."],
            ["Lockbox — wholesale",
             "$1.10 / item  ·  $250 / month setup",
             "B2B lockbox with invoice-matching."],
            ["Account analysis statement",
             "No charge",
             "Detailed AA statement included."],
        ],
        col_widths=[2.6 * inch, 1.5 * inch, 3.2 * inch],
    ))

    # ECR IMPACT CHART
    story.append(B.section_header("Illustrative balance-to-fee offset",
                                  kicker="Earnings credit impact"))
    story.append(B.body_para(
        "The chart below illustrates how collected balances translate into "
        "monthly earnings credit at the current 3.50% ECR, after the 10% "
        "reserve deduction. Treasury services, wires, ACH, and lockbox are "
        "frequently covered in full by the earnings credit above the "
        "$500,000 balance level."
    ))
    story.append(B.bar_comparison_chart(
        labels=["$250K", "$500K", "$1M", "$2.5M", "$5M"],
        values=[656, 1312, 2625, 6562, 13124],
        title="Monthly earnings credit at 3.50% ECR (by average collected balance)",
        ylabel="Earnings credit (USD)",
        value_fmt=lambda v: f"${v:,.0f}",
    ))

    # ELIGIBILITY
    story.append(B.section_header("Eligibility and onboarding",
                                  kicker="Account opening"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who qualifies"),
            *B.bullet_list([
                "U.S.-organized for-profit and not-for-profit entities with "
                "material commercial activity (typically $1M+ annual revenue).",
                "Clients engaging one or more treasury services: ACH "
                "origination, Positive Pay, lockbox, RDC (wholesale), "
                "controlled disbursement, ZBA, or sweep.",
                "Middle-market and large corporate relationships with a "
                "dedicated Relationship Manager.",
                "Public-sector entities (municipalities, authorities, school "
                "districts) under appropriate collateralization (e.g., FHLB "
                "letter of credit, pledged securities)."
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Formation documents (Articles, Operating Agreement, Bylaws) "
                "certified by the Secretary or other duly authorized officer.",
                "IRS EIN letter (CP-575 or 147C).",
                "Corporate resolution or written consent designating "
                "authorized signers and treasury administrators.",
                "Beneficial-ownership certification under 31 C.F.R. § 1010.230 "
                "for each owner holding 25% or more.",
                "Most recent two years of financial statements (CPA-reviewed "
                "or audited, where applicable) for underwriting and service "
                "limit calibration.",
                "Cumulus Treasury Services Master Agreement and applicable "
                "service schedules.",
            ]),
        ],
    ))

    # HOW IT WORKS
    story.append(B.section_header("Onboarding process",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Discovery",
             "Relationship Manager and Treasury Specialist meet to scope "
             "transaction profile, cash-flow cycle, and treasury service needs.",
             "Days 1–3"],
            ["2  ·  Pro-forma analysis",
             "Cumulus prepares a 12-month pro-forma analysis statement using "
             "historical volumes to model fees vs. earnings credit.",
             "Days 3–7"],
            ["3  ·  Documentation",
             "Client executes the Treasury Services Master Agreement, service "
             "schedules, and applicable security addenda.",
             "Days 7–10"],
            ["4  ·  Implementation",
             "Cumulus configures the account, treasury services, reporting "
             "formats (BAI2 / camt.053), and entitlements. Test ACH / wire / "
             "Positive Pay cycles completed.",
             "Days 10–21"],
            ["5  ·  Go live",
             "Production cut-over with Treasury Implementation Specialist "
             "on-call. First analysis statement delivered after cycle close.",
             "Days 21–30"],
        ],
        col_widths=[1.2 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # FEATURES
    story.append(B.section_header("Reporting, integrations, and channels",
                                  kicker="Platform capabilities"))
    story.append(B.data_table(
        header=["Capability", "Details"],
        rows=[
            ["Reporting formats",
             "BAI2 (prior-day & intraday), ISO 20022 camt.053 / camt.052, "
             "SWIFT MT940 / MT942, CSV, and PDF."],
            ["ERP / accounting integrations",
             "Direct connectors for Oracle, SAP, Workday, NetSuite, Sage "
             "Intacct, Microsoft Dynamics 365, and QuickBooks Enterprise; "
             "REST APIs via Cumulus Developer Portal."],
            ["Cut-off times (ET)",
             "Domestic wires 5:45 p.m.  ·  International wires 5:00 p.m.  ·  "
             "Same-Day ACH 2:45 p.m.  ·  Standard ACH 9:00 p.m.  ·  RDC "
             "10:00 p.m."],
            ["Entitlements and dual control",
             "Role-based entitlements, maker-checker / dual-approval, "
             "transaction limits by user, channel, and beneficiary; "
             "device binding and IP-whitelisting."],
            ["Authentication",
             "Multi-factor authentication (hardware token, FIDO2 security "
             "key, or mobile authenticator); SSO via SAML 2.0 for enterprise "
             "clients."],
            ["Contingency",
             "Cumulus Business Online is operated from two geographically "
             "dispersed data centers with tier-IV resilience; 99.95% uptime SLA."],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # REGULATORY
    story.append(B.section_header("Regulatory and security protections",
                                  kicker="Safeguards"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["FDIC deposit insurance",
             "Up to $250,000 per depositor, per insured institution, per "
             "ownership category. Amounts above the insurance limit are "
             "uninsured unless pledged or swept under a collateral "
             "arrangement (e.g., ICS, CDARS, repo sweep)."],
            ["Regulation D / Reg W — affiliate transactions",
             "Transfers between related parties reviewed for 23A / 23B "
             "compliance; reserve deduction on ECR calculation applies."],
            ["UCC Articles 3, 4, 4A",
             "Commercial payment items and funds transfers governed by UCC; "
             "Regulation E does not apply to commercial accounts."],
            ["GLBA — information safeguards",
             "Administrative, physical, and technical safeguards consistent "
             "with the Interagency Guidelines."],
            ["SOC 1 Type II / SOC 2 Type II",
             "Annual independent examinations. Reports available to "
             "authenticated clients via the Cumulus Governance portal."],
            ["Sanctions & AML",
             "OFAC, FinCEN, and BSA screening on all payments; Suspicious "
             "Activity Reports filed as required."],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Is Analyzed Checking required to use Cumulus treasury services?",
         "Yes. ACH origination, Positive Pay, wholesale lockbox, wholesale "
         "RDC, ZBA structures, and sweep all require a Business Analyzed "
         "Checking account. Treasury services may be linked to related-party "
         "operating accounts via a master analysis relationship."),
        ("Can the Earnings Credit Rate change?",
         "Yes. The ECR is set by Cumulus and is variable; it generally "
         "moves in line with short-term market rates. Cumulus provides "
         "30 days' advance notice of rate changes on analyzed relationships. "
         "The current rate is published on each monthly analysis statement."),
        ("How is float measured?",
         "Float is the time between when an item is deposited and when "
         "credited as collected funds. Cumulus uses a published float schedule "
         "based on drawee-bank location and item type (on-us, local, "
         "non-local). Clients may request a detailed float report at any time."),
        ("Can earnings credit be used to pay for non-Cumulus services?",
         "No. Earnings credit may only offset eligible Cumulus service fees "
         "itemized on the analysis statement. Surplus credit does not carry "
         "forward to subsequent cycles and is not paid as cash."),
        ("Are deposits above $250,000 protected?",
         "Deposits in excess of the FDIC limit may be protected through "
         "Cumulus ICS (Insured Cash Sweep) or CDARS programs — which "
         "distribute balances across a network of FDIC-insured institutions "
         "— or by collateralization for qualifying public-sector clients."),
        ("Can we aggregate multiple entities under one analysis group?",
         "Yes. Related legal entities may be linked into a Master Analysis "
         "Group. Each entity retains its own account and statements, but "
         "collected balances across the group are aggregated for ECR and "
         "service-charge netting purposes."),
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
            "The Earnings Credit Rate (ECR) is a non-interest, non-cash "
            "credit applied against eligible service charges on the account "
            "analysis statement. ECR is not interest income and is not "
            "reportable on IRS Form 1099-INT.",
            "Service charges, account-analysis calculations, and cut-off "
            "times are set forth in the Cumulus Treasury Services Master "
            "Agreement and applicable service schedules, which control in "
            "the event of a conflict with marketing materials.",
            "Account-analysis reserve deduction is set pursuant to 12 C.F.R. "
            "Part 204 (Regulation D) as modified by current Federal Reserve "
            "Board policy.",
            "Cumulus Insured Cash Sweep® (ICS) and CDARS® are deposit "
            "placement services operated by IntraFi Network, LLC. Use of ICS "
            "or CDARS is subject to the applicable Deposit Placement Agreement.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
