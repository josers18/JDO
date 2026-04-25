"""Cumulus Wire Transfers — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Wire_Transfers.pdf")

TREASURY_DISCLOSURES = [
    "Wire transfer services are provided by Cumulus Bank, N.A. under the "
    "Treasury Services Master Agreement, applicable service schedule, and "
    "Uniform Commercial Code Article 4A (funds transfers). International "
    "wires are additionally governed by applicable FX terms and "
    "regulatory requirements including OFAC sanctions screening.",
    "Wire transfers are final and generally irrevocable once executed. "
    "Recall requests may be submitted but recovery depends on the "
    "cooperation of the receiving institution; Cumulus cannot guarantee "
    "recovery of a wire sent in error, to an incorrect beneficiary, or "
    "as a result of business-email-compromise fraud.",
    "Fedwire operates Monday through Friday (excluding Federal Reserve "
    "Bank holidays) from approximately 9:00 p.m. ET on the prior "
    "business day through 7:00 p.m. ET. CHIPS, SWIFT, and ISO 20022 "
    "messaging channels have their own operating windows.",
    "Cumulus applies 'Know-Your-Customer' (KYC), beneficial-ownership, "
    "and OFAC screening to every wire. Wires to sanctioned parties, "
    "countries, or sectors may be blocked or rejected by Cumulus or by "
    "a correspondent bank in the payment chain.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Wire Transfers",
        product_code="TM-WIR-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="Wire Transfers",
        lede=("Same-day settlement of domestic and international funds "
              "transfers over Fedwire, CHIPS, and SWIFT — with "
              "dual-approval, IP-whitelisting, and callback verification "
              "to counter wire-fraud attempts."),
        summary_rows=[
            ("Network coverage", "Fedwire  ·  CHIPS  ·  SWIFT MT103 / MT202  ·  ISO 20022"),
            ("Domestic out", "$20 per wire"),
            ("International out", "$45 per wire  ·  FX margin 0.35%"),
            ("Domestic in", "No charge"),
            ("International in", "$15 per wire"),
            ("Fedwire cut-off", "5:45 p.m. ET for same-day settlement"),
            ("Security", "Dual approval  ·  IP-whitelist  ·  callback on threshold"),
            ("Channel", "Business Online  ·  API  ·  SWIFT direct"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Wire Transfers move funds between institutions with "
        "same-day finality over the Federal Reserve's Fedwire Funds "
        "Service (for domestic wires), the Clearing House Interbank "
        "Payments System (CHIPS) for large-value domestic and "
        "international wires, and the SWIFT network for cross-border "
        "payments to 11,000+ financial institutions worldwide. Cumulus "
        "supports legacy SWIFT MT103 (single customer credit transfer) "
        "and MT202 (financial institution transfer) messaging as well as "
        "ISO 20022 pacs.008 — the global standard that replaces MT103 "
        "in the scheduled MT-to-ISO migration. Wires are initiated "
        "through Cumulus Business Online, the Cumulus Wire API, or a "
        "direct SWIFT connection for large corporate clients."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why Cumulus"))
    story.append(B.feature_grid([
        ("Same-day settlement",
         "Fedwire and CHIPS deliver same-day finality when submitted "
         "before cut-off (5:45 p.m. ET domestic; 5:00 p.m. international). "
         "No float; funds are available to the beneficiary immediately."),
        ("Broad network reach",
         "Direct participants in Fedwire and CHIPS; SWIFT BIC CMBKUS33 "
         "with correspondent relationships across 130+ countries. ISO "
         "20022 migration ready."),
        ("FX margin transparency",
         "0.35% standard FX margin on international wires (vs. 1.0%+ at "
         "many regional banks); custom margin for high-volume FX clients "
         "through Cumulus Global Markets."),
        ("Fraud controls by default",
         "Dual-approval workflow, IP-whitelisting on wire initiation, "
         "and callback verification on threshold-driven wires (default "
         "$100,000; customizable)."),
        ("Straight-through processing",
         "Wires initiated via Cumulus Wire API or SWIFT MT can be "
         "straight-through processed without manual intervention where "
         "validation, OFAC, and limit checks pass."),
        ("Recall and investigation",
         "Dedicated Wire Investigation team manages recalls, tracers, "
         "and beneficiary misdirection issues; proactive outreach to "
         "correspondents for time-critical matters."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # PRICING
    story.append(B.section_header("Wire pricing",
                                  kicker="Schedule of fees"))
    story.append(B.data_table(
        header=["Wire type", "Fee", "Notes"],
        rows=[
            ["Domestic outgoing", "$20", "USD, same-day settlement via Fedwire / CHIPS"],
            ["Domestic incoming", "No charge", "Fedwire / CHIPS credits"],
            ["International outgoing (USD)", "$35",
             "SWIFT USD correspondent-network delivery"],
            ["International outgoing (FX)", "$45 + 0.35% FX margin",
             "Cumulus converts USD to 130+ currencies through Global Markets"],
            ["International incoming", "$15", "USD or FX credits"],
            ["Book / internal transfer", "No charge",
             "Between Cumulus accounts (same-day, real-time)"],
            ["Drawdown request", "$20",
             "Request a wire from another institution by MT204 / letter"],
            ["Wire recall / tracer", "$25 per investigation", ""],
            ["Amendment after initiation", "$15", ""],
            ["Same-day rush (after cut-off, Cumulus best effort)",
             "$75 premium", "Subject to Fedwire close and correspondent cooperation"],
            ["Repetitive-wire maintenance", "No charge",
             "Pre-registered beneficiary templates"],
        ],
        col_widths=[2.8 * inch, 1.7 * inch, 2.8 * inch],
    ))

    # CUT-OFFS
    story.append(B.section_header("Operating hours and cut-offs",
                                  kicker="Timing discipline"))
    story.append(B.data_table(
        header=["Channel", "Operating window (ET)",
                "Cut-off for same-day / next-day"],
        rows=[
            ["Fedwire Funds",
             "Monday–Friday 9:00 p.m. prior business day – 7:00 p.m.",
             "5:45 p.m. Cumulus cut-off for same-day settlement"],
            ["CHIPS",
             "Monday–Friday 9:00 p.m. prior business day – 6:00 p.m.",
             "5:00 p.m. Cumulus cut-off for same-day settlement"],
            ["SWIFT (MT103 / MT202 / pacs.008)",
             "24 / 7 messaging (settlement per correspondent windows)",
             "5:00 p.m. Cumulus cut-off for same-day correspondent action"],
            ["ISO 20022 pacs.008 (native)",
             "Available on Fedwire ISO 20022 window and CHIPS ISO 20022",
             "Per-network cut-off"],
            ["Cumulus internal / book",
             "24 / 7", "Real-time"],
            ["International FX wire",
             "FX trade cut-off 4:30 p.m. ET for same-day settlement",
             "Settlement per currency (spot T+2 typical)"],
        ],
        col_widths=[2.0 * inch, 2.6 * inch, 2.7 * inch],
    ))

    # VOLUME / CHART
    story.append(B.section_header("Wire volume and channel economics",
                                  kicker="Pricing tiers"))
    story.append(B.body_para(
        "Cumulus offers volume-based pricing on domestic outgoing wires "
        "for clients originating 500+ wires per month. The chart below "
        "shows indicative pricing across monthly volume tiers; custom "
        "pricing is available for enterprise clients through "
        "Cumulus Global Markets."
    ))
    story.append(B.bar_comparison_chart(
        labels=["< 100 / mo", "100–499", "500–1,999",
                "2,000–9,999", "10,000+"],
        values=[20, 18, 15, 12, 8],
        title="Domestic outgoing wire — volume-tiered pricing",
        ylabel="Price per wire (USD)",
        value_fmt=lambda v: f"${v}",
    ))

    # SECURITY
    story.append(B.section_header("Security and fraud controls",
                                  kicker="Risk management"))
    story.append(B.data_table(
        header=["Control", "How it works"],
        rows=[
            ["Dual approval",
             "Separate users for creation and approval; no single-user "
             "wire initiation above a configurable threshold."],
            ["IP-whitelisting",
             "Wire initiation restricted to pre-registered IP ranges at "
             "both the user and API levels."],
            ["Callback verification",
             "Cumulus Wire Operations calls the authorized contact to "
             "verify wires at or above the callback threshold (default "
             "$100,000; client-configurable). Callback is to the phone "
             "number on record, never to a number supplied in the wire "
             "instruction."],
            ["Out-of-band MFA",
             "Hardware token, FIDO2 security key, or mobile authenticator "
             "required at login and at wire approval."],
            ["Beneficiary template management",
             "Pre-registered beneficiaries reduce per-wire data entry and "
             "eliminate BEC attack vectors on repetitive payments."],
            ["OFAC / sanctions screening",
             "Every wire screened against OFAC SDN, Consolidated Sanctions, "
             "and Cumulus internal watchlists before release."],
            ["Behavioral anomaly detection",
             "ML-based detection of patterns outside client norm (unusual "
             "beneficiary country, unusual amount, unusual originator)."],
            ["Recall and tracer",
             "24/7 Cumulus Wire Investigation team pursues recalls, "
             "tracers, and correspondent investigations."],
        ],
        col_widths=[1.9 * inch, 5.4 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Beware business-email-compromise (BEC)",
        "Wire fraud via BEC — where an attacker impersonates an executive "
        "or vendor and redirects wire instructions — is a top payment-"
        "fraud vector. Cumulus recommends: (1) callback verification on "
        "all first-time beneficiaries; (2) beneficiary-template locking "
        "with change callback; (3) dual approval with distinct devices; "
        "(4) 'Unexpected wire' policy requiring voice confirmation on "
        "changes to known beneficiary instructions.",
    ))

    # MESSAGING DETAILS
    story.append(B.section_header("Messaging formats",
                                  kicker="SWIFT and ISO 20022"))
    story.append(B.data_table(
        header=["Message type", "Purpose", "Status"],
        rows=[
            ["SWIFT MT103",
             "Single customer credit transfer (legacy)",
             "Active through MT-to-ISO migration (current Nov 2025 target)"],
            ["SWIFT MT202 / MT202COV",
             "Financial institution credit transfer; MT202COV carries "
             "underlying customer data for cover payments",
             "Active through MT-to-ISO migration"],
            ["ISO 20022 pacs.008",
             "Customer credit transfer (replaces MT103)",
             "Native on Fedwire and CHIPS; parallel operation with MT103"],
            ["ISO 20022 pacs.009",
             "Financial institution credit transfer (replaces MT202)",
             "Parallel with MT202"],
            ["ISO 20022 camt.054",
             "Bank-to-customer debit / credit notification",
             "Replaces MT900 / MT910 debit / credit advice"],
            ["Fedwire ISO 20022",
             "Fedwire native ISO 20022 message format",
             "Live since 2025; MT format retired per Fed schedule"],
        ],
        col_widths=[2.0 * inch, 2.8 * inch, 2.5 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Can a wire be recalled?",
         "Submission of a recall request is always possible, but the "
         "ability to recover funds depends on the receiving bank's "
         "cooperation and whether funds have been credited or withdrawn. "
         "Same-day domestic recall requests have a reasonable success rate "
         "if initiated within hours. International recalls typically "
         "involve 5–14 days and multiple correspondent banks."),
        ("What's the difference between MT103 and ISO 20022 pacs.008?",
         "Both are customer-credit-transfer messages, but pacs.008 "
         "supports richer structured remittance data (purpose codes, "
         "ultimate debtor/creditor identification, and structured "
         "addresses) and is the global standard replacing MT103 under the "
         "SWIFT and Fedwire migration. Cumulus supports both; ISO 20022 "
         "is preferred for new integrations."),
        ("How does callback work?",
         "When a wire meets or exceeds the callback threshold, Cumulus "
         "Wire Operations pauses release and calls the designated "
         "authorized contact at the phone number on record. The contact "
         "confirms the wire details verbally; only after verbal "
         "confirmation is the wire released. The call never uses a phone "
         "number supplied in the wire instruction itself."),
        ("What's your FX margin and how is it set?",
         "Standard FX margin is 0.35% above the Cumulus Global Markets "
         "mid-market rate; a real-time rate is shown in Business Online "
         "before wire confirmation. Volume-based margins (as low as "
         "0.10%) apply to enterprise clients through a Treasury FX "
         "agreement with Cumulus Global Markets."),
        ("Can we send wires via API?",
         "Yes. The Cumulus Wire API supports wire initiation, status "
         "polling, recall submission, and beneficiary management via "
         "REST (OAuth 2.0) or SWIFT MT (for clients with a SWIFT BIC). "
         "API wires apply the same OFAC, dual-approval, and limit "
         "controls as UI-initiated wires."),
        ("What happens if my wire is rejected?",
         "A wire can be rejected at several points: Cumulus pre-release "
         "(OFAC hit, limit exceeded, invalid beneficiary), correspondent "
         "bank (insufficient routing data, sanctions block), or receiving "
         "bank (invalid account). Cumulus returns the funds to your "
         "originating account and provides the rejection reason within "
         "one business day."),
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
