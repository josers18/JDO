"""Cumulus ACH Collections — commercial segment."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "08_Treasury_Management"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_ACH_Collections.pdf")

TREASURY_DISCLOSURES = [
    "ACH Collections services are provided by Cumulus Bank, N.A. as the "
    "Originating Depository Financial Institution (ODFI) under the "
    "Treasury Services Master Agreement, applicable service schedule, "
    "the Nacha Operating Rules, and Regulation E where consumer "
    "receivers are involved.",
    "Originators are responsible for obtaining and retaining proper "
    "authorizations for every debit entry. Nacha Rules require written, "
    "similarly-authenticated, or — for WEB — online agreement "
    "authorization; TEL requires recorded phone authorization. "
    "Unauthorized-return rate thresholds apply; exceeding them triggers "
    "Nacha inquiry and remediation obligations.",
    "Same-Day ACH debits are subject to Nacha Rule windows and "
    "receiving-bank settlement timing. Funds are collected from the "
    "receiver's account on the settlement date; returns may arrive "
    "within 2 business days (or up to 60 days for consumer unauthorized "
    "returns under Regulation E).",
    "WEB Account Validation is mandatory under Nacha Rules as of the "
    "effective date of the WEB Debit Account Validation Rule. Cumulus "
    "provides Account Validation within the ACH Collections service.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus ACH Collections",
        product_code="TM-ACH-COL-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="ACH Collections",
        lede=("Outbound debit origination for recurring and one-time "
              "consumer and commercial collections — with WEB "
              "authentication, prenote verification, and NACHA-compliant "
              "return-rate monitoring."),
        summary_rows=[
            ("Service type", "ACH debit origination (collections ODFI service)"),
            ("SEC codes", "PPD (consumer recurring)  ·  WEB (online auth)  ·  TEL (phone auth)  ·  CCD / CTX (commercial)"),
            ("Settlement", "Standard next-day  ·  Same-Day"),
            ("Pricing", "$0.08 – $0.15 per item  ·  $5 per file"),
            ("WEB Account Validation", "Included (Nacha-mandated since 2022)"),
            ("Prenote support", "$0 per prenote"),
            ("Return threshold monitoring", "Unauthorized ≤ 0.5%  ·  Admin ≤ 3%"),
            ("Authorization storage", "Guidance provided; third-party vaulting available"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus ACH Collections is the purpose-built ACH origination "
        "service for accounts-receivable use cases: recurring consumer "
        "billing (monthly subscriptions, membership fees, rent, utility "
        "auto-pay), one-time online-authorized debits (WEB-code "
        "e-commerce), phone-authorized debits (TEL), and commercial "
        "invoice collection (CCD / CTX). Cumulus applies Nacha Rule "
        "compliance controls — mandatory WEB Account Validation, "
        "unauthorized-return-rate monitoring, authorization-storage "
        "guidance, prenote validation — to reduce return risk and "
        "protect origination privileges. Compared to card collection, "
        "ACH Collections delivers substantially lower per-transaction "
        "cost at the trade-off of settlement timing and return windows."
    ))

    story.append(B.section_header("Key benefits",
                                  kicker="Why ACH Collections"))
    story.append(B.feature_grid([
        ("Cost-effective recurring collection",
         "Typical per-item cost of $0.10 compared to card interchange "
         "of 1.5%–2.5%. For a $100 recurring billing, card cost ~$2.50 "
         "vs. ACH ~$0.10."),
        ("Wide authorization channels",
         "PPD for signed recurring authorizations; WEB for online sign-"
         "up; TEL for phone-obtained authorization; CCD / CTX for "
         "commercial trading-partner debits."),
        ("Built-in Nacha compliance",
         "WEB Account Validation, prenote support, return-rate "
         "monitoring, and unauthorized-return-rate threshold alerts — "
         "compliance tooling integrated into the origination workflow."),
        ("Settlement windows that match cash-flow",
         "Standard next-business-day settlement for scheduled billing; "
         "Same-Day ACH for urgent or retry collections."),
        ("Retry automation",
         "Automated retry on returned transactions with Nacha-compliant "
         "retry limits (maximum 2 retries within 30 days for same "
         "authorization, without prior notification)."),
        ("Reporting and reconciliation",
         "Daily settlement file with authorization-level reconciliation; "
         "BAI2 / camt.053 integration to AR / billing systems."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # SEC CODES USE CASES
    story.append(B.section_header("SEC codes for collections",
                                  kicker="Choose your authorization"))
    story.append(B.data_table(
        header=["SEC code", "Authorization method",
                "Use case", "Storage requirement"],
        rows=[
            ["PPD  ·  Prearranged Payment and Deposit",
             "Written authorization (wet signature or similarly "
             "authenticated)",
             "Recurring consumer billing — rent, utilities, insurance, "
             "memberships",
             "Retain authorization for 2 years after last debit"],
            ["WEB  ·  Internet-initiated",
             "Online 'I authorize' checkbox + session logging + Account "
             "Validation",
             "E-commerce, online subscription sign-up, web-portal "
             "recurring billing",
             "Retain online authorization record + session log for 2 years"],
            ["TEL  ·  Telephone-initiated",
             "Recorded phone call with specific Nacha-required "
             "script elements",
             "Call-center sales, one-time phone payments",
             "Retain recording or written notice + call log for 2 years"],
            ["CCD  ·  Corporate Credit/Debit",
             "Trading-partner agreement",
             "B2B invoice debits under master agreement",
             "Retain trading-partner agreement"],
            ["CTX  ·  Corporate Trade Exchange",
             "Trading-partner agreement with EDI",
             "B2B invoice debits with full 820/ 835 remittance",
             "Retain trading-partner agreement + EDI 820 records"],
        ],
        col_widths=[1.7 * inch, 1.8 * inch, 2.2 * inch, 1.6 * inch],
    ))

    # PRICING
    story.append(B.section_header("Pricing",
                                  kicker="Service fees"))
    story.append(B.data_table(
        header=["Item", "Amount", "Notes"],
        rows=[
            ["Origination — < 5K / month",
             "$0.15 / item", ""],
            ["Origination — 5K – 25K / month",
             "$0.12 / item", ""],
            ["Origination — > 25K / month",
             "$0.08 – $0.10 / item", "Negotiated"],
            ["File fee", "$5 / file", ""],
            ["Same-Day surcharge", "$1 / item",
             "Applied above standard origination"],
            ["Return — unauthorized (R05, R07, R10, R29)",
             "$5 / return",
             "Applied to unauthorized returns only"],
            ["Return — administrative (R01, R02, R03, R04)",
             "$2 / return",
             "NSF, account closed, invalid account"],
            ["Prenote", "$0", "Zero-dollar verification"],
            ["WEB Account Validation",
             "$0.15 per lookup",
             "Mandatory under Nacha WEB Rule"],
            ["Reversal request", "$25 / item", "Per Nacha criteria"],
        ],
        col_widths=[2.6 * inch, 1.7 * inch, 3.0 * inch],
    ))

    # RETURN RATE MONITORING
    story.append(B.section_header("Return-rate monitoring",
                                  kicker="Nacha thresholds"))
    story.append(B.body_para(
        "Nacha Rules establish three return-rate thresholds that "
        "originators must remain below. Exceeding a threshold triggers "
        "Nacha inquiry and — if unresolved — remediation obligations or "
        "origination suspension."
    ))
    story.append(B.data_table(
        header=["Threshold", "Nacha inquiry", "Nacha violation",
                "Cumulus monitoring"],
        rows=[
            ["Unauthorized returns (R05, R07, R10, R11, R29)",
             "≥ 0.5%", "> 1.0%",
             "Daily monitoring with client alert at 0.3%"],
            ["Administrative returns (R02, R03, R04)",
             "≥ 3.0%", "—",
             "Weekly monitoring with client alert at 2.0%"],
            ["Overall return rate (all reasons)",
             "≥ 15.0%", "—",
             "Monthly monitoring with client alert at 10.0%"],
        ],
        col_widths=[2.4 * inch, 1.2 * inch, 1.2 * inch, 2.5 * inch],
    ))

    # RETURN CODES CHART
    story.append(B.section_header("Return-reason distribution",
                                  kicker="Understanding returns"))
    story.append(B.body_para(
        "The chart below shows a typical industry distribution of ACH "
        "return codes for consumer-recurring billing. Administrative "
        "returns (R01 insufficient funds, R02 account closed, R03 "
        "invalid account) dominate; unauthorized returns (R05, R07, R10, "
        "R29) are small but strictly regulated."
    ))
    story.append(B.donut_chart(
        labels=["R01 NSF", "R02 closed", "R03 invalid acct",
                "R05/R10/R29 unauth.", "Other admin"],
        values=[54, 18, 15, 5, 8],
        title="Typical return-reason distribution (consumer recurring)",
        center_text="Returns",
    ))

    # SAME DAY
    story.append(B.section_header("Same-Day ACH for collections",
                                  kicker="When timing matters"))
    story += B.bullet_list([
        "<b>Retry of returned items</b> — a failed debit can be retried "
        "same-day via Same-Day ACH, reducing days-in-collection.",
        "<b>Urgent commercial debits</b> — B2B invoice settlement at "
        "month-end or fiscal year-end.",
        "<b>One-time consumer payments</b> — customer service "
        "remediation where the customer wishes to pay immediately.",
        "<b>Same-Day per-entry maximum</b> is $1,000,000 under Nacha "
        "Rules; standard per-entry maximum is unlimited subject to your "
        "Cumulus file limit.",
        "<b>Same-Day surcharge</b> of $1 per item applies; evaluate "
        "whether expedited collection vs. next-day timing warrants the "
        "premium.",
    ])

    # IMPLEMENTATION
    story.append(B.section_header("Implementation and onboarding",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "Activity", "Timing"],
        rows=[
            ["1  ·  Credit and compliance review",
             "Cumulus reviews originator, business model, expected "
             "return rate, and sets origination limits.",
             "Days 1–7"],
            ["2  ·  Authorization review",
             "Cumulus reviews client's authorization templates and "
             "storage approach for each SEC code in scope.",
             "Days 5–10"],
            ["3  ·  Agreement",
             "Execute Origination Service Schedule; confirm SEC codes, "
             "limits, and acknowledgment of Nacha obligations.",
             "Days 10–14"],
            ["4  ·  Configuration",
             "Entitlements, approvers, IP-whitelist, channel (Business "
             "Online / SFTP / API), WEB Account Validation.",
             "Days 14–21"],
            ["5  ·  Prenote and test",
             "Test-file validation and prenote entries to confirm "
             "receiver accounts.",
             "Days 21–28"],
            ["6  ·  Live origination",
             "First live file; Cumulus Risk Operations reviews closely "
             "for first 30 days with return-rate monitoring.",
             "Day 28+"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How long can a consumer return an unauthorized debit?",
         "Under Regulation E (12 C.F.R. § 1005.11), consumers have 60 "
         "days from the date the statement shows the unauthorized entry "
         "to return it as R05 or R10. This is far longer than commercial "
         "accounts (24 hours under UCC Article 4A). Build this return "
         "window into your accounts-receivable management and revenue-"
         "recognition processes."),
        ("What is WEB Account Validation?",
         "Since March 19, 2022, Nacha Rules require originators to "
         "apply a 'commercially reasonable' fraudulent-transaction-"
         "detection system for WEB debit entries. The most common "
         "implementation is account validation — verifying the account "
         "exists and is in good standing before debit. Cumulus provides "
         "Account Validation as part of ACH Collections."),
        ("Can I retry a failed debit?",
         "Yes. Nacha Rules permit up to 2 retries of a returned debit "
         "within 30 days of the original authorization without new "
         "written notice — but only for NSF (R01) and Uncollected "
         "Funds (R09) returns. Retries of unauthorized returns (R05, "
         "R07, R10) are not permitted without new authorization."),
        ("What return rate triggers Nacha intervention?",
         "The key threshold is the unauthorized-return rate: 0.5% "
         "triggers inquiry, 1.0% is a violation. Cumulus alerts you at "
         "0.3% to provide lead time. If you approach the threshold, "
         "expect Cumulus Risk Operations to request remediation plans "
         "and may require process changes."),
        ("How do I manage authorizations for a large subscriber base?",
         "Cumulus recommends a third-party authorization vault (e.g., "
         "PaymentCloud, Authorize.net) for WEB and TEL authorizations. "
         "For PPD paper authorizations, digital imaging with indexed "
         "retrieval meets Nacha recordkeeping rules. Authorizations must "
         "be retrievable for 2 years after the last debit."),
        ("Can I collect internationally through ACH?",
         "International debits require IAT (International ACH "
         "Transaction) SEC code with enhanced data requirements — OFAC "
         "screening, FinCEN travel-rule data, country-of-ultimate-"
         "beneficiary fields. IAT setup is available through Cumulus "
         "but requires additional compliance review and typically 30-day "
         "implementation."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    story += B.disclosure_block("Important disclosures", TREASURY_DISCLOSURES)
    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
