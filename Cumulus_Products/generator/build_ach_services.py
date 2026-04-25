"""Cumulus ACH Services — commercial segment (debit block + services)."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_ACH_Services.pdf")

TREASURY_DISCLOSURES = [
    "ACH Services (including ACH Debit Block, ACH Debit Filter, and "
    "unauthorized-return handling) are provided by Cumulus Bank, N.A. "
    "under the Treasury Services Master Agreement and applicable "
    "service schedule, subject to the Nacha Operating Rules and UCC "
    "Article 4A as applicable.",
    "Regulation E provides consumer rights to return unauthorized ACH "
    "debits within 60 days of statement. Commercial accounts are "
    "governed by UCC Article 4A, which imposes tighter timeframes — "
    "typically 24 hours — to return unauthorized entries.",
    "Cumulus cannot guarantee that every unauthorized ACH debit will be "
    "blocked. Debits from previously authorized originators (whose "
    "authorization may have been fraudulently obtained) will pay unless "
    "explicitly revoked by the client. Review Cumulus Debit Filter "
    "settings regularly.",
    "The 'refer to maker' return reason code and related Nacha return "
    "codes (R05, R07, R10, R11, R29) carry specific timing and notice "
    "requirements. Follow Cumulus Risk Operations guidance for return "
    "selection.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus ACH Services",
        product_code="TM-ACH-SVC-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="ACH Services",
        lede=("ACH Debit Block and Debit Filter — preventing "
              "unauthorized electronic debits through originator allow-"
              "lists, SEC-code restrictions, and amount caps. Integrates "
              "with Positive Pay for unified exception review."),
        summary_rows=[
            ("Services", "ACH Debit Block  ·  ACH Debit Filter  ·  Unauthorized return handling"),
            ("Control modes", "Block-all default  ·  allow-list  ·  amount cap  ·  frequency"),
            ("SEC code filtering", "CCD  ·  PPD  ·  WEB  ·  TEL  ·  CTX  ·  IAT"),
            ("Exception deadline", "11:00 a.m. ET daily"),
            ("Pricing", "$20 / account / month + $0.05 / item"),
            ("Unauthorized return window", "24 hours (UCC Article 4A) commercial"),
            ("Integration", "Unified dashboard with Positive Pay"),
            ("Audit trail", "Full logging of additions, removals, decisions"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "ACH Services protects commercial accounts from unauthorized "
        "ACH debits. The service operates on two primary modes: ACH "
        "Debit Block — which defaults to blocking all ACH debits on the "
        "account with only specifically-authorized originators permitted "
        "to debit; and ACH Debit Filter — which permits ACH debits but "
        "flags items that do not match authorized originator criteria "
        "(Originator ID, SEC code, amount cap, frequency). Both modes "
        "integrate with the Cumulus Positive Pay dashboard for unified "
        "daily exception review, and both are consistent with the "
        "Nacha Rules and UCC Article 4A commercial protections."
    ))

    # COMPARISON WITH ACH ORIGINATION
    story.append(B.callout_box(
        "ACH Services vs. ACH Origination",
        "ACH Origination (product code TM-ACH-ORG) is the outbound "
        "service — sending payroll, supplier payments, and collections "
        "to other banks. ACH Services (this product, TM-ACH-SVC) is the "
        "inbound protection service — blocking and filtering ACH debits "
        "attempted against your account. Most commercial clients use "
        "both: origination for outbound activity and services for "
        "protection of the operating account.",
    ))

    story.append(B.section_header("Key benefits", kicker="Why ACH Services"))
    story.append(B.feature_grid([
        ("Blocks unauthorized debits",
         "Default posture is to block all ACH debits unless the "
         "originator is pre-authorized. Unauthorized debits never post; "
         "they are returned to the originating bank as 'R05 — not "
         "authorized.'"),
        ("Granular filter controls",
         "Per-originator authorization with SEC-code restriction, "
         "amount cap, and frequency limit. Tighten controls as your "
         "organization's risk profile evolves."),
        ("Tight return window discipline",
         "Commercial accounts have a 24-hour window under UCC Article 4A "
         "to return unauthorized ACH debits. ACH Services' same-day "
         "exception dashboard makes same-day review and return achievable."),
        ("Unified exception dashboard",
         "ACH Services shares the Cumulus Positive Pay exception "
         "dashboard. A single workflow handles both unauthorized checks "
         "and unauthorized ACH debits."),
        ("Cyber-insurance alignment",
         "Commercial cyber and crime insurance policies increasingly "
         "require ACH Services as a condition of coverage on ACH-fraud "
         "claims; Cumulus provides attestation documentation."),
        ("Low-cost protection",
         "$20 / account / month + $0.05 per filtered item — a small "
         "fraction of the average unauthorized-debit loss."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # FILTER MECHANICS
    story.append(B.section_header("Filter configuration",
                                  kicker="Authorization fields"))
    story.append(B.data_table(
        header=["Authorization field", "Configuration options"],
        rows=[
            ["Mode",
             "Block-all default (allow-list only)  ·  Filter-only "
             "(review exceptions)  ·  Hybrid (block-all on some accounts, "
             "filter on others)"],
            ["Originator ID",
             "10-digit ACH company ID from the ACH addenda — the "
             "primary match key for authorized-originator lists."],
            ["SEC code",
             "Limit authorizations by SEC code (e.g., allow CCD and PPD "
             "from a specific originator, but not WEB). Prevents "
             "authorized-for-payroll originators from also initiating "
             "one-time WEB debits."],
            ["Amount cap",
             "Per-transaction maximum. Combined with frequency to "
             "prevent outsize single debits."],
            ["Frequency",
             "Maximum debits per day / week / month. Prevents rapid-"
             "fire debits from a single originator."],
            ["Effective date range",
             "Authorization valid only between start and end dates. "
             "Auto-expires to reduce stale-authorization risk."],
            ["Notification",
             "Email / SMS / push to designated contacts on any new "
             "exception, on pay/return default action, and on list "
             "changes."],
        ],
        col_widths=[1.7 * inch, 5.6 * inch],
    ))

    # PRICING
    story.append(B.section_header("Pricing", kicker="Service fees"))
    story.append(B.data_table(
        header=["Service", "Amount"],
        rows=[
            ["ACH Debit Block / Filter — monthly account fee",
             "$20 / account / month"],
            ["ACH Debit Block / Filter — per-item fee",
             "$0.05 per filtered ACH debit"],
            ["Authorized-originator list maintenance",
             "No charge for Business Online / API changes"],
            ["Manual authorization by Treasury Services desk",
             "$25 per change"],
            ["Unauthorized-return submission",
             "No charge (included)"],
            ["Setup fee",
             "No charge"],
        ],
        col_widths=[4.5 * inch, 2.8 * inch],
    ))

    # RISK DASHBOARD CHART
    story.append(B.section_header("Fraud prevention impact — illustrative",
                                  kicker="Protection value"))
    story.append(B.body_para(
        "The chart below illustrates the annualized protection value of "
        "ACH Services across client size tiers. Protection value is "
        "calculated as industry-average unauthorized-ACH-debit attempts "
        "per account per year multiplied by average unauthorized-debit "
        "size — a rough estimate of avoided loss, assuming attempts are "
        "blocked by the service."
    ))
    story.append(B.bar_comparison_chart(
        labels=["Small business", "Professional services",
                "Mid-market", "Enterprise", "Large corporate"],
        values=[4500, 9500, 22000, 48000, 125000],
        title="Estimated annualized fraud-prevention value by client size",
        ylabel="Annualized avoided loss (USD)",
        value_fmt=lambda v: f"${v:,.0f}",
    ))

    # DAILY WORKFLOW
    story.append(B.section_header("Daily workflow",
                                  kicker="Exception review"))
    story.append(B.data_table(
        header=["Step", "Activity", "Timing (ET)"],
        rows=[
            ["1  ·  ACH debit presented",
             "An ACH debit arrives for payment through Cumulus ACH "
             "Operator connection.",
             "Continuous"],
            ["2  ·  Filter check",
             "Cumulus evaluates the debit against the authorized-"
             "originator list and filter rules.",
             "Real-time"],
            ["3  ·  Exception flagged",
             "Debits not matching an authorized originator (or exceeding "
             "an amount / frequency cap) flag as exceptions.",
             "Real-time"],
            ["4  ·  Exception posted",
             "Exceptions post to the Business Online dashboard alongside "
             "Positive Pay exceptions.",
             "7:00 a.m."],
            ["5  ·  Client review",
             "Treasury operator reviews each exception, views originator "
             "detail, and decides pay or return.",
             "Before 11:00 a.m."],
            ["6  ·  Default action",
             "Items without a decision at 11:00 a.m. default to client's "
             "pre-selected action.",
             "11:00 a.m."],
            ["7  ·  Return submission",
             "Items marked 'return' submitted to the ACH network as R05, "
             "R07, R10, R11, or R29 as appropriate.",
             "Same day"],
        ],
        col_widths=[1.2 * inch, 4.5 * inch, 1.6 * inch],
    ))

    # INTEGRATION
    story.append(B.section_header("Integration with other treasury services",
                                  kicker="Ecosystem"))
    story += B.bullet_list([
        "<b>Positive Pay</b> — ACH Services shares the exception "
        "dashboard and decision workflow with Check Positive Pay. A "
        "single daily review covers all unauthorized check and ACH items.",
        "<b>ACH Origination</b> — the Cumulus Debit Filter authorized-"
        "originator list may auto-include counterparties you originate "
        "credits to (inviting reciprocal debit authorization).",
        "<b>Lockbox</b> — remittance-advice matching from Cumulus "
        "Lockbox feeds authorized-originator records for accounts-"
        "receivable-direction debit control.",
        "<b>Business Analyzed Checking</b> — ACH Services is "
        "designed for the Analyzed Checking account structure; per-"
        "item and monthly fees are offset by earnings credit.",
        "<b>ISO 20022 reporting</b> — exceptions reported in camt.054 / "
        "pacs.002 format for ERP consumption.",
    ])

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("ACH Services vs. ACH Origination — which do I need?",
         "Most commercial clients need both. ACH Origination handles "
         "outbound payments — payroll, vendor pay, collections. ACH "
         "Services protects the operating account against inbound "
         "unauthorized debits. They are complementary, not alternatives."),
        ("What's the difference between Block and Filter modes?",
         "Block mode defaults to blocking all ACH debits and only "
         "permits specifically-authorized originators. Filter mode "
         "permits ACH debits but flags those that don't match your "
         "authorized-originator criteria as exceptions for review. Block "
         "is the stronger control; Filter offers operational flexibility."),
        ("What return codes are used for unauthorized debits?",
         "Common return codes: R05 'Unauthorized debit to consumer "
         "account using corporate SEC code'; R07 'Authorization revoked'; "
         "R10 'Originator not known to receiver'; R11 'Authorized, but "
         "terms not met'; R29 'Corporate customer advises not "
         "authorized.' Selection depends on exception circumstances and "
         "is guided by Cumulus Risk Operations."),
        ("How quickly must I return an unauthorized debit?",
         "Under UCC Article 4A (commercial accounts), unauthorized "
         "entries must be returned within 24 hours of posting. Consumer "
         "accounts under Regulation E have 60 days. Same-day exception "
         "review via ACH Services meets the commercial window "
         "comfortably."),
        ("Can I authorize a debit one-time without adding to my list?",
         "Yes. The exception review workflow supports a 'one-time "
         "approve' action that lets a specific debit pass without "
         "adding the originator to the permanent authorized list. "
         "Useful for known-good but non-recurring transactions."),
        ("What if I accidentally authorize a fraudulent originator?",
         "You may remove an originator from the authorized list at any "
         "time via Business Online. Future debits from that originator "
         "will be blocked or flagged. Debits that already posted are "
         "recoverable only through the Nacha return process within the "
         "applicable window; work with Cumulus Risk Operations to "
         "maximize recovery."),
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
