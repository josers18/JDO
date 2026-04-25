"""Cumulus ACH Origination — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_ACH_Origination.pdf")

TREASURY_DISCLOSURES = [
    "ACH origination services are provided by Cumulus Bank, N.A. (the "
    "Originating Depository Financial Institution, or ODFI) under the "
    "Cumulus Treasury Services Master Agreement and applicable service "
    "schedule, subject to the National Automated Clearing House "
    "Association (Nacha) Operating Rules, 31 C.F.R. Part 210 (federal "
    "government payments), and Regulation E (for consumer entries).",
    "Originators are responsible for obtaining and retaining proper "
    "authorizations for each entry transmitted, adhering to return-rate "
    "thresholds (unauthorized, administrative, and overall), and "
    "complying with Nacha Rules including the Commercially Reasonable "
    "Fraudulent Transaction Detection Rule and WEB Account Validation.",
    "ACH entries are governed by the receiving institution's funds-"
    "availability practices; funds may not be available to the receiver "
    "on the settlement date. Same-Day ACH is subject to Nacha cut-off "
    "times and receiving-bank processing. All entries are subject to "
    "reversal under Nacha Rule provisions.",
    "UCC Article 4A governs commercial credit entries. Cumulus Bank is "
    "not responsible for delays, errors, or non-settlement caused by "
    "receiving depository financial institutions (RDFIs), the ACH "
    "Operator, or circumstances beyond the Bank's control.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus ACH Origination",
        product_code="TM-ACH-ORG-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="ACH Origination",
        lede=("Next-day and Same-Day ACH origination for payroll, vendor "
              "payments, tax, and collections — with industry-standard "
              "SEC codes, file-level controls, and direct integration "
              "to Cumulus Business Online and corporate ERPs."),
        summary_rows=[
            ("Service type", "Credit and debit ACH origination (ODFI services)"),
            ("Settlement options", "Standard next-day  ·  Same-Day ACH"),
            ("SEC codes supported", "CCD  ·  PPD  ·  WEB  ·  TEL  ·  CTX"),
            ("Default file limit", "$25,000,000 per day"),
            ("Per-item pricing", "$0.08 – $0.15 depending on volume"),
            ("Per-file pricing", "$5 per file"),
            ("Same-Day surcharge", "$1 per Same-Day ACH item"),
            ("Cut-off times (ET)", "Same-Day 2:45 p.m.  ·  Standard 9:00 p.m."),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus ACH Origination enables commercial clients to initiate "
        "electronic credits and debits through the Automated Clearing "
        "House (ACH) network — governed by the Nacha Operating Rules — "
        "for payroll, vendor payments, tax, child-support disbursements, "
        "distributions, and receivables collection. Cumulus serves as "
        "the Originating Depository Financial Institution (ODFI), "
        "submitting files to the ACH Operator (Federal Reserve FedACH or "
        "The Clearing House EPN) for clearing and settlement to the "
        "receiving banks. Originators may transmit files through "
        "Cumulus Business Online (manual upload or drag-and-drop), a "
        "direct-transmission SFTP channel, or a REST API. Each entry is "
        "assigned the appropriate Standard Entry Class (SEC) code based "
        "on authorization type and origination channel."
    ))

    story.append(B.section_header("Key benefits", kicker="Why ACH"))
    story.append(B.feature_grid([
        ("Cost-effective payments",
         "ACH delivers payroll and vendor payments at a small fraction "
         "of wire cost — $0.08 – $0.15 per item, plus a nominal per-file "
         "fee, with no FX or same-day funding pressure."),
        ("Same-Day ACH for urgent payments",
         "Three Same-Day settlement windows per business day enable "
         "intraday payroll corrections, urgent vendor disbursement, and "
         "last-minute tax payments up to $1,000,000 per entry."),
        ("Full SEC code coverage",
         "CCD (corporate credit/debit), PPD (consumer periodic), WEB "
         "(internet-authorized consumer debit), TEL (telephone-"
         "authorized), and CTX (corporate with addenda) — one channel "
         "covers every commercial use case."),
        ("File-level controls",
         "Dual-approval, file limits, effective-date restrictions, and "
         "IP-whitelisting on file submission. Full audit trail via "
         "Business Online and API webhooks."),
        ("ERP integration",
         "Direct connectors for SAP, Oracle, Workday, NetSuite, and "
         "Microsoft Dynamics; SFTP and REST for custom systems. "
         "ISO 20022 pain.001 support in addition to Nacha file format."),
        ("Origination-to-settlement reporting",
         "Real-time file status, return/NOC monitoring, and settlement "
         "reporting with BAI2 / camt.053 output to your ERP."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # SEC CODES
    story.append(B.section_header("Standard Entry Class (SEC) codes",
                                  kicker="Coverage"))
    story.append(B.data_table(
        header=["SEC code", "Use case", "Authorization",
                "Typical use"],
        rows=[
            ["CCD  ·  Corporate Credit or Debit",
             "Corporate-to-corporate transactions",
             "Trading-partner agreement",
             "Vendor payments, cash concentration, intercompany"],
            ["PPD  ·  Prearranged Payment and Deposit",
             "Recurring credits / debits to consumer accounts",
             "Written authorization from consumer",
             "Payroll direct deposit, recurring consumer billing"],
            ["WEB  ·  Internet-initiated Entry",
             "Consumer debits authorized via the internet",
             "Online agreement (signature or 'I Agree' click)",
             "Online billers, recurring web subscriptions"],
            ["TEL  ·  Telephone-initiated Entry",
             "Consumer debits authorized by telephone",
             "Recorded phone authorization",
             "Call-center billers, one-time phone payments"],
            ["CTX  ·  Corporate Trade Exchange",
             "Corporate-to-corporate with detailed remittance",
             "Trading-partner agreement",
             "B2B invoicing with EDI 820 remittance detail"],
            ["IAT  ·  International ACH Transaction",
             "Entries across U.S. border",
             "Bi-national authorization + OFAC screening",
             "Cross-border payroll, supplier payments"],
        ],
        col_widths=[1.8 * inch, 1.6 * inch, 1.7 * inch, 2.2 * inch],
    ))

    # PRICING
    story.append(B.section_header("Pricing and limits",
                                  kicker="Schedule of charges"))
    story.append(B.data_table(
        header=["Item", "Amount", "Notes"],
        rows=[
            ["Origination — standard volume (< 5K / month)",
             "$0.15 / item", ""],
            ["Origination — medium volume (5K–25K / month)",
             "$0.12 / item", ""],
            ["Origination — high volume (> 25K / month)",
             "$0.08 – $0.10 / item", "Negotiated at term sheet"],
            ["File transmission fee", "$5 / file", ""],
            ["Same-Day ACH surcharge", "$1 / item",
             "Applied above standard origination price"],
            ["Return / NOC receipt", "$2 / item",
             "ACH returns and Notification of Change items"],
            ["Reversal request", "$25 / item",
             "Submitted per Nacha Rule reversal criteria"],
            ["Stop-payment on originated entry",
             "$30 / item", ""],
            ["File upload limit — default", "$25,000,000 / day",
             "Higher by relationship review; credit approval required"],
            ["Per-entry limit — Same-Day", "$1,000,000 per entry",
             "Nacha rule maximum"],
            ["Originator setup fee", "$250 / application",
             "One-time, waivable for Cumulus Business Analyzed Checking clients"],
        ],
        col_widths=[2.6 * inch, 2.0 * inch, 2.7 * inch],
    ))

    # PRICING CHART
    story.append(B.section_header("Service tier pricing",
                                  kicker="Volume economics"))
    story.append(B.bar_comparison_chart(
        labels=["< 1K / mo", "1K – 5K", "5K – 25K",
                "25K – 100K", "> 100K"],
        values=[0.15, 0.15, 0.12, 0.10, 0.08],
        title="Per-item origination pricing by monthly volume",
        ylabel="Price per item (USD)",
        value_fmt=lambda v: f"${v:.2f}",
    ))

    # CUT-OFFS
    story.append(B.section_header("Cut-off times and settlement",
                                  kicker="Operational calendar"))
    story.append(B.data_table(
        header=["Window", "Cut-off (ET)", "Settlement"],
        rows=[
            ["Standard ACH — submission",
             "9:00 p.m. business day", "Next business day"],
            ["Same-Day ACH — first settlement",
             "10:30 a.m. business day", "1:00 p.m. same day"],
            ["Same-Day ACH — second settlement",
             "2:45 p.m. business day", "5:00 p.m. same day"],
            ["Same-Day ACH — third settlement",
             "4:45 p.m. business day", "6:00 p.m. same day"],
            ["Return / NOC processing",
             "Per RDFI schedule", "Typically next business day"],
            ["International ACH (IAT)",
             "3:00 p.m. business day", "2 business days"],
        ],
        col_widths=[2.8 * inch, 2.0 * inch, 2.5 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Same-Day ACH windows",
        "Nacha operates three Same-Day ACH settlement windows each "
        "business day. Files submitted before the 10:30 a.m. cut-off "
        "settle at 1:00 p.m.; files by 2:45 p.m. settle at 5:00 p.m.; "
        "files by 4:45 p.m. settle at 6:00 p.m. Per-entry maximum is "
        "$1,000,000; no aggregate daily cap under Nacha Rules beyond "
        "your Cumulus file limit.",
    ))

    # SECURITY
    story.append(B.section_header("Security and controls",
                                  kicker="Risk management"))
    story += B.bullet_list([
        "<b>Dual-control / maker-checker</b> — one user creates and "
        "releases; a separate user with segregated credentials approves "
        "before transmission.",
        "<b>File limits</b> — hard-enforced file-level and per-item "
        "limits configured at onboarding; changes require written amendment.",
        "<b>IP-whitelisting</b> — file submission restricted to "
        "pre-registered IP ranges for SFTP and API channels.",
        "<b>Callback verification</b> — Cumulus Risk Operations calls "
        "back on anomalous files (first transmission, new SEC code, "
        "files materially above recent volume patterns).",
        "<b>Prenotification (prenote)</b> — zero-dollar verification "
        "entries for new receiver accounts, required before first live "
        "credit on consumer accounts.",
        "<b>WEB Account Validation</b> — for WEB debits, Cumulus "
        "validates receiver account status prior to origination, "
        "satisfying Nacha's commercially reasonable fraudulent-transaction-"
        "detection requirement.",
        "<b>Return-rate monitoring</b> — unauthorized, administrative, "
        "and overall return-rate monitoring with threshold alerts at "
        "Nacha warning and violation levels.",
    ])

    # IMPLEMENTATION
    story.append(B.section_header("Onboarding and implementation",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "Activity", "Timing"],
        rows=[
            ["1  ·  Credit review",
             "Cumulus Credit reviews originator against ACH exposure "
             "limits and establishes file / daily limits.",
             "Days 1–5"],
            ["2  ·  Agreement",
             "Execute ACH Origination Agreement (Service Schedule under "
             "Treasury Master Agreement); confirm SEC code authorization "
             "and originator policies.",
             "Days 5–10"],
            ["3  ·  Configuration",
             "Entitlements, approvers, limits, IP-whitelisting, and "
             "transmission channel (Business Online, SFTP, or API) "
             "configured.",
             "Days 10–15"],
            ["4  ·  Prenote and test",
             "Test-file validation against Cumulus test environment; "
             "prenote entries to verify receiver account validity.",
             "Days 15–20"],
            ["5  ·  Live origination",
             "First live file; Cumulus monitors closely for first 30 "
             "days with Risk Operations review.",
             "Day 20+"],
        ],
        col_widths=[1.4 * inch, 4.4 * inch, 1.5 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("When should I use Same-Day ACH vs. standard next-day?",
         "Use Same-Day for time-critical payments where wire-transfer "
         "cost is prohibitive and next-day ACH is too slow: last-minute "
         "payroll corrections, emergency vendor pay-downs, urgent tax "
         "obligations. Use standard next-day for regular payroll and "
         "planned disbursements where the cost-savings of standard ACH "
         "are material."),
        ("What are the return-rate thresholds?",
         "Nacha Rules set three return-rate thresholds: unauthorized "
         "returns ≤ 0.5% (inquiry at 0.5%, violation at 1.0%); "
         "administrative returns ≤ 3.0%; and overall return rate ≤ 15%. "
         "Exceeding thresholds triggers remediation requirements and may "
         "result in fines or origination suspension."),
        ("What happens when an ACH entry is returned?",
         "Return entries arrive back at Cumulus within 1–2 business days "
         "(consumer unauthorized returns may arrive within 60 days). "
         "Cumulus posts the return to your account and notifies you via "
         "Business Online / API. Returns reverse the underlying credit or "
         "debit; you remain responsible for follow-up collection."),
        ("How does prenotification work?",
         "A prenotification (prenote) is a zero-dollar entry sent to "
         "verify receiver account existence and type. Nacha Rules require "
         "prenotes for consumer PPD credits (optional but recommended); "
         "they are mandatory for many government benefit payments. Prenote "
         "return windows are 3 business days before live entry is permitted."),
        ("Is reversal possible after a file transmits?",
         "Yes, under specific Nacha Rule criteria: duplicate file, wrong "
         "dollar amount, wrong receiver, or wrong effective date. "
         "Reversals must be submitted within 5 business days of original "
         "effective date and clearly labeled. Submit reversal requests "
         "through Cumulus Business Online or Risk Operations."),
        ("Can we originate IAT (international) ACH?",
         "Yes. IAT supports international credits and debits with "
         "enhanced data requirements (OFAC screening, travel-rule data). "
         "IAT is subject to additional compliance review; setup typically "
         "requires 30 days including OFAC policy review and BSA / AML "
         "documentation."),
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
