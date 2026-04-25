"""Cumulus Payment Processing Solutions — commercial segment."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "07_Merchant_Services"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Payment_Processing_Solutions.pdf")

# Custom commercial disclosures for merchant services
MERCHANT_DISCLOSURES = [
    "Payment processing services are provided by Cumulus Merchant Services, "
    "a division of Cumulus Bank, N.A., and are governed by the Merchant "
    "Services Agreement and applicable network rules of Visa U.S.A., Inc., "
    "Mastercard Incorporated, American Express Travel Related Services "
    "Company, Inc., and Discover Financial Services, which are incorporated "
    "by reference and may be amended from time to time without notice.",
    "Interchange rates, assessments, and network fees are set by the card "
    "networks, not by Cumulus. Illustrative rates in this brochure reflect "
    "schedules in effect on the effective date; actual rates applicable to "
    "a merchant are reconciled each month on the Merchant Processing Statement.",
    "Cumulus Merchant Services is a Level 1 service provider under the "
    "Payment Card Industry Data Security Standard (PCI DSS) version 4.0. "
    "Merchants remain responsible for their own PCI DSS compliance at the "
    "applicable merchant level; Cumulus provides assessment tooling and "
    "self-assessment questionnaire (SAQ) guidance.",
    "Chargeback, retrieval, and reversal rights are established by card-"
    "network rules and Regulation Z / Regulation E as applicable. Merchants "
    "may be subject to chargeback liability for disputed transactions; "
    "dispute-management services are available from Cumulus Merchant Services.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Payment Processing Solutions",
        product_code="MS-PAY-2026.04",
        category="Merchant Services",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Payment Processing Solutions",
        lede=("Interchange-plus card-acceptance with PCI DSS 4.0 "
              "compliance, tokenization, point-to-point encryption, and "
              "same-day funding for Cumulus Business Checking clients."),
        summary_rows=[
            ("Pricing model", "Interchange+ (pass-through + transparent margin)"),
            ("Qualified rate", "Interchange + 0.10% + $0.10 per transaction"),
            ("Card acceptance", "Visa  ·  Mastercard  ·  Amex  ·  Discover  ·  digital wallets"),
            ("PCI compliance", "PCI DSS 4.0 Level 1 service provider"),
            ("Encryption", "P2PE (PCI-validated) + EMV tokenization"),
            ("Funding", "Same-day for Cumulus Business Checking; next-day otherwise"),
            ("Chargeback management", "Self-service dashboard + managed service"),
            ("Integrations", "e-commerce, POS, mobile, invoicing, hosted-page"),
        ],
        category_label="PRODUCT BROCHURE  ·  MERCHANT SERVICES",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Merchant Services provides card-acceptance and payment-"
        "processing infrastructure for businesses across retail, "
        "e-commerce, services, and B2B channels. Pricing is structured on "
        "an Interchange+ basis: the underlying interchange rate, "
        "assessments, and network fees are passed through at cost, with "
        "Cumulus's margin transparently itemized each month. This "
        "approach eliminates the downgrade-and-surcharge dynamics of "
        "tiered pricing plans and typically produces a lower effective "
        "rate for merchants with strong card-present or qualifying "
        "transaction mix. All merchants receive PCI DSS 4.0 compliant "
        "processing with tokenization, point-to-point encryption (P2PE), "
        "and EMV / contactless acceptance."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits",
                                  kicker="Why Cumulus Merchant"))
    story.append(B.feature_grid([
        ("Interchange-plus transparency",
         "True pass-through of interchange + assessments + network fees; "
         "Cumulus margin shown as a single transparent line on each "
         "monthly statement."),
        ("Same-day funding",
         "Cumulus Business Checking clients receive same-day funding on "
         "batches settled by 8:00 p.m. ET; automatic reconciliation to the "
         "DDA with batch-level detail."),
        ("Universal acceptance",
         "Visa, Mastercard, American Express (OptBlue), Discover, "
         "PIN-debit networks, Apple Pay, Google Pay, Samsung Pay, and "
         "all major digital wallets."),
        ("Security by default",
         "PCI-validated P2PE on every terminal; EMV chip with contactless; "
         "tokenization for card-on-file storage; Level 1 service-provider "
         "posture reduces merchant scope for SAQ."),
        ("Chargeback management",
         "Self-service dispute dashboard with representment workflow, "
         "compelling-evidence templates, and chargeback-ratio monitoring; "
         "managed service available."),
        ("Omnichannel reporting",
         "Cumulus Merchant Portal consolidates retail, e-commerce, and "
         "mobile activity with transaction-level drill-down and BAI2 / "
         "camt.053 export."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # PRICING
    story.append(B.section_header("Interchange-plus pricing",
                                  kicker="How you are billed"))
    story.append(B.body_para(
        "Each card transaction is billed at three layers: (1) "
        "interchange — paid to the card-issuing bank, set by the network; "
        "(2) assessments and network fees — paid to Visa, Mastercard, "
        "Amex, or Discover; and (3) the Cumulus margin — transparent and "
        "fixed in your Merchant Services Agreement. Interchange rates "
        "vary by card type, merchant category, and processing method; a "
        "premium rewards card swiped in person carries different "
        "interchange than a non-rewards debit card entered online."
    ))

    story.append(B.data_table(
        header=["Merchant profile", "Cumulus margin",
                "Per-transaction fee", "Monthly platform fee"],
        rows=[
            ["Retail / restaurant  ·  card-present dominant",
             "Interchange + 0.10%", "$0.10", "$25 per terminal"],
            ["Services / professional  ·  mixed channel",
             "Interchange + 0.18%", "$0.12", "$35 per MID"],
            ["E-commerce / card-not-present",
             "Interchange + 0.22%", "$0.15", "$45 per MID"],
            ["B2B / Level-2 and Level-3 data enabled",
             "Interchange + 0.15%", "$0.12", "$45 per MID"],
            ["High-volume enterprise ($10M+)",
             "Interchange + 0.06% – 0.09%", "$0.08", "Negotiated"],
            ["Non-profit / charitable",
             "Interchange + 0.05%", "$0.08", "$20 per MID"],
        ],
        col_widths=[2.6 * inch, 1.5 * inch, 1.3 * inch, 1.5 * inch],
    ))

    story.append(Spacer(1, 0.08 * inch))
    story.append(B.data_table(
        header=["Service / event", "Fee"],
        rows=[
            ["PCI DSS annual compliance fee", "$99 per MID (waived with SAQ-A)"],
            ["Chargeback fee", "$15 per chargeback (waived if won)"],
            ["Retrieval request", "$10 per request"],
            ["Batch/settlement fee", "$0.10 per batch"],
            ["ACH return / NSF on funding", "$25"],
            ["Statement fee (paper)", "$5 / month (e-statement free)"],
            ["Card-brand assessments (pass-through)",
             "Visa 0.14%  ·  MC 0.1375%  ·  Discover 0.13%  ·  Amex 0.17%"],
            ["Network access fees (illustrative, pass-through)",
             "Visa FANF, Mastercard NABU, etc. — shown at cost on monthly statement"],
        ],
        col_widths=[3.9 * inch, 3.4 * inch],
    ))

    # FEE BREAKDOWN CHART
    story.append(B.section_header("Monthly fee breakdown — illustrative",
                                  kicker="Where your payment goes"))
    story.append(B.body_para(
        "The chart below illustrates a typical small retailer's monthly "
        "fee composition across a $100,000 processing volume. Interchange "
        "represents the majority of all-in cost — this portion is set by "
        "the networks and passed through unchanged by Cumulus; the "
        "remainder is Cumulus margin and platform fees."
    ))
    story.append(B.donut_chart(
        labels=["Interchange (pass-through)", "Assessments (pass-through)",
                "Network fees (pass-through)", "Cumulus margin",
                "Per-tx + platform"],
        values=[72, 12, 6, 7, 3],
        title="Typical fee composition — $100,000 monthly retail processing",
        center_text="Interchange+",
    ))

    # SECURITY
    story.append(B.section_header("Security and PCI compliance",
                                  kicker="Risk and protection"))
    story.append(B.data_table(
        header=["Control", "Details"],
        rows=[
            ["PCI DSS 4.0 (Level 1 service provider)",
             "Cumulus undergoes annual Report on Compliance (ROC) by a "
             "Qualified Security Assessor. Attestation of Compliance (AOC) "
             "made available to merchants."],
            ["Point-to-Point Encryption (P2PE)",
             "PCI-validated P2PE reduces merchant PCI scope and enables "
             "SAQ-P2PE-HW eligibility. All certified Cumulus terminals "
             "ship P2PE-ready."],
            ["EMV chip + contactless",
             "Chip-and-PIN / chip-and-signature with NFC contactless "
             "(tap-to-pay). Shifts counterfeit liability from merchant to "
             "card issuer for chip-capable transactions."],
            ["Tokenization",
             "Network-token (Visa / Mastercard) and Cumulus-vault tokens "
             "for card-on-file and recurring-payment use cases."],
            ["3-D Secure 2 (EMV 3DS)",
             "Frictionless authentication for e-commerce; liability shift "
             "on authenticated CNP transactions. Supported on hosted "
             "payment page and Gateway API."],
            ["Fraud detection",
             "Device fingerprinting, velocity rules, blacklist/whitelist, "
             "and ML-based risk scoring available via Gateway."],
            ["SOC 1 Type II / SOC 2 Type II",
             "Annual independent examinations. Reports available via the "
             "Cumulus Governance portal."],
        ],
        col_widths=[2.2 * inch, 5.1 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "SAQ scope reduction",
        "Merchants using Cumulus P2PE-validated terminals typically "
        "qualify for the SAQ-P2PE-HW self-assessment — the smallest PCI "
        "SAQ — with approximately 30 questions versus 250+ for SAQ-D. "
        "Cumulus provides the SAQ and an AOC from our QSA to help you "
        "demonstrate compliance to your acquirer, auditor, or brand.",
    ))

    # FUNDING
    story.append(B.section_header("Funding and reporting",
                                  kicker="Cash-flow timing"))
    story.append(B.data_table(
        header=["Funding type", "Eligibility", "Timing", "Notes"],
        rows=[
            ["Same-day funding",
             "Cumulus Business Checking client; batch settled by 8:00 p.m. ET",
             "Same business day",
             "Included at no additional cost"],
            ["Next-day funding",
             "Default for batches settled between 8:00 p.m. and 11:00 p.m. ET",
             "Next business day",
             "Included"],
            ["Next-day funding (non-Cumulus DDA)",
             "Merchants using external bank",
             "Next business day + ACH settlement",
             "Standard"],
            ["Weekend settlement",
             "Optional",
             "Saturday and Sunday settlement",
             "$50 / month add-on"],
            ["Funding delays",
             "Triggered by high-risk transactions, elevated chargeback "
             "ratio, or reserve holdbacks",
             "Per agreement",
             "Details in dispute notification"],
        ],
        col_widths=[1.6 * inch, 2.4 * inch, 1.8 * inch, 1.5 * inch],
    ))

    # CHARGEBACK
    story.append(B.section_header("Chargeback management",
                                  kicker="Dispute handling"))
    story += B.bullet_list([
        "<b>Self-service dispute dashboard</b> — real-time notification of "
        "incoming chargebacks with reason codes, transaction detail, "
        "and representment deadline.",
        "<b>Evidence templates</b> — pre-configured compelling-evidence "
        "packages aligned to the most common reason codes (Goods or "
        "Services Not Received, Fraudulent Transaction, Product Not as "
        "Described).",
        "<b>Representment workflow</b> — upload evidence, submit through "
        "the network, track outcome, and auto-retry reversed chargebacks.",
        "<b>Chargeback-ratio monitoring</b> — alerts at 0.65% (network "
        "warning) and 0.90% (excessive chargeback thresholds); "
        "remediation guidance from Cumulus Risk team.",
        "<b>Managed service (optional)</b> — Cumulus Dispute Services "
        "handles representment on your behalf, billed on a "
        "win-contingent or fixed-fee basis.",
    ])

    # INTEGRATIONS
    story.append(B.section_header("Integrations and channels",
                                  kicker="Acceptance everywhere"))
    story.append(B.data_table(
        header=["Channel", "Integrations"],
        rows=[
            ["Point of Sale",
             "Cumulus Counter, Merchant Pro, and Go (see POS Systems "
             "brochure); Clover, Square for Business, Toast, Aloha, "
             "Lightspeed, Shopify POS certified."],
            ["E-commerce",
             "Cumulus Gateway (REST / GraphQL APIs), hosted payment page, "
             "drop-in JavaScript library; Shopify, WooCommerce, Magento, "
             "BigCommerce, Salesforce Commerce Cloud."],
            ["Mobile",
             "iOS / Android SDKs; Apple Pay, Google Pay, Samsung Pay; "
             "in-app billing; Bluetooth-paired PIN pad for mPOS."],
            ["Invoicing",
             "Cumulus Invoicing (included), QuickBooks, Xero, NetSuite, "
             "Sage Intacct, Salesforce — invoice-to-payment flows."],
            ["Recurring / subscription",
             "Tokenized card-on-file; flexible billing cycles; dunning "
             "automation; Visa / Mastercard account-updater service."],
            ["B2B / Level-2 + Level-3",
             "Extended data capture for purchasing cards (line items, "
             "tax, shipping, PO number) to qualify for lower B2B "
             "interchange rates."],
        ],
        col_widths=[1.6 * inch, 5.7 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("What is interchange-plus pricing, exactly?",
         "Interchange-plus means each transaction is billed at three "
         "discrete layers: (1) the interchange rate set by the card "
         "network, passed through at cost; (2) assessments and network "
         "access fees, also passed through; and (3) the Cumulus margin, "
         "shown as a transparent fixed basis-point + per-transaction "
         "amount. This replaces opaque tiered plans where qualified, "
         "mid-qualified, and non-qualified pricing can mask the underlying "
         "cost drivers."),
        ("How is PCI compliance handled?",
         "Cumulus is certified at Level 1 as a PCI DSS 4.0 service "
         "provider. Merchants must complete an annual Self-Assessment "
         "Questionnaire (SAQ) appropriate to their environment; Cumulus "
         "provides guidance and tooling. Merchants using Cumulus-"
         "validated P2PE terminals can typically use SAQ-P2PE-HW — the "
         "shortest SAQ at ~30 questions."),
        ("When do I receive funds?",
         "Cumulus Business Checking clients receive same-day funding on "
         "batches settled by 8:00 p.m. ET. Batches settled later fund "
         "next business day. Merchants using external banks receive "
         "ACH-settled funds next business day. Weekend settlement is "
         "available as an optional add-on."),
        ("What happens with chargebacks?",
         "Cumulus notifies you in the Merchant Portal within one business "
         "day of receiving a chargeback. You have the option to accept "
         "(loss posted) or represent with supporting evidence. Cumulus "
         "provides evidence templates for each reason code; our managed "
         "dispute service is available for higher-volume merchants."),
        ("Can I accept American Express?",
         "Yes — through OptBlue, which provides a single merchant "
         "agreement, consolidated statement, and same-day funding for "
         "Amex transactions alongside Visa, Mastercard, and Discover. "
         "Direct Amex merchant agreements are also supported for "
         "merchants requiring higher-volume programs."),
        ("What if my processing volume grows substantially?",
         "Cumulus re-prices merchant accounts annually and whenever volume "
         "exceeds a defined review threshold (typically 50% growth or "
         "$1M incremental annualized volume). Enterprise merchants "
         "processing $10M+ annually qualify for negotiated margins."),
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
        MERCHANT_DISCLOSURES + [
            "Visa® and Visa brand mark, Mastercard® and Mastercard brand "
            "mark, American Express® and American Express logo, and "
            "Discover® and Discover logo are registered trademarks of "
            "their respective owners. Apple Pay® is a trademark of Apple "
            "Inc.; Google Pay™ is a trademark of Google LLC; Samsung Pay® "
            "is a trademark of Samsung Electronics Co., Ltd.",
            "Illustrative interchange-plus margins, monthly fees, and "
            "event-based fees are subject to change with notice under "
            "the Merchant Services Agreement. Network-set fees "
            "(interchange, assessments, network access) may change at any "
            "time upon notice from the network; Cumulus passes such "
            "changes through at cost.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
