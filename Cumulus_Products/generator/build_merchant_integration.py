"""Cumulus Merchant Integration — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Merchant_Integration.pdf")

TREASURY_DISCLOSURES = [
    "Merchant Integration combines data, reporting, and deposit "
    "services across Cumulus Merchant Services (payment processing) "
    "and Cumulus Treasury (deposits, reporting). Both services remain "
    "governed by their respective agreements; the Merchant Integration "
    "add-on is governed by its own service schedule under the Treasury "
    "Services Master Agreement.",
    "Auto-post of card settlements to DDA relies on timely card-"
    "network funding. Delays or holds imposed by card networks, sponsor "
    "banks, or Cumulus Risk (for chargeback or reserve holdbacks) will "
    "delay auto-post. Cumulus provides status visibility through the "
    "Merchant Integration portal.",
    "Consolidated reporting is provided as a convenience; the primary "
    "source of record remains the Merchant Processing Statement for "
    "card activity and the periodic deposit-account statement for DDA "
    "activity. In case of reconciliation discrepancy, primary "
    "documents control.",
    "SOC 1 Type II / SOC 2 Type II coverage applies to both underlying "
    "Cumulus services; Merchant Integration inherits those audit "
    "programs. Annual reports are available to authenticated clients.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Merchant Integration",
        product_code="TM-MI-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="Merchant Integration",
        lede=("Unified treasury + merchant-services integration: "
              "consolidated reporting, automated reconciliation, and "
              "auto-post of card settlements to your Cumulus operating "
              "account — eliminating AR matching effort for card "
              "deposits."),
        summary_rows=[
            ("Purpose", "Unify Cumulus Merchant Services with Treasury reporting"),
            ("Core features", "Consolidated reports  ·  auto-reconciliation  ·  auto-post"),
            ("Reporting cadence", "Real-time transaction view  ·  daily summary"),
            ("Data export", "BAI2  ·  camt.053  ·  ISO 20022 pain.002  ·  CSV  ·  API"),
            ("Reconciliation", "Card-transaction-to-DDA-credit matching"),
            ("Pricing", "$75 / month per MID-to-DDA integration"),
            ("ERP integration", "Oracle  ·  SAP  ·  NetSuite  ·  Sage Intacct"),
            ("Required services", "Cumulus Merchant Services + Cumulus Business Checking"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Merchant Integration joins two common but historically-"
        "separate commercial banking workflows: card-acceptance through "
        "Cumulus Merchant Services and operating-deposit management "
        "through Cumulus Business Checking. Without integration, card "
        "settlement creates a daily reconciliation burden: batches from "
        "the processor post as aggregate credits to DDA — the AR team "
        "then back-solves transaction-level composition from the "
        "Merchant Processing Statement. Merchant Integration automates "
        "the match: each DDA settlement credit is tagged with its source "
        "batch and originating transactions, delivered in a unified "
        "daily report, and optionally pre-applied against open "
        "receivables. The result is the same-day, transaction-level "
        "cash visibility that card-accepting businesses expect."
    ))

    story.append(B.section_header("Key benefits",
                                  kicker="Why integrate"))
    story.append(B.feature_grid([
        ("Consolidated reporting",
         "Single daily report reconciling card batches (debit / credit / "
         "fee / chargeback) to DDA credits — no manual tie-out required."),
        ("Auto-post to ERP",
         "Card settlements posted to the General Ledger with revenue "
         "detail, fees, chargeback offsets, and reserve movement — "
         "daily or real-time depending on ERP connector."),
        ("Transaction-level drill-down",
         "From DDA credit through batch to individual card transactions, "
         "including interchange composition and assessment detail."),
        ("Fee transparency",
         "All Cumulus Merchant Services fees reconciled to monthly "
         "statement; variance-to-quoted-pricing reporting to catch "
         "downgrades and misclassifications."),
        ("Chargeback visibility",
         "Chargebacks, retrievals, and representment outcomes visible "
         "alongside settlement detail; aging reports and win-rate "
         "analytics."),
        ("Same-day funding alignment",
         "For Cumulus Business Checking clients on same-day funding, "
         "card settlements appear in DDA the same day with full "
         "transaction metadata."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # CAPABILITIES
    story.append(B.section_header("Integration capabilities",
                                  kicker="What you get"))
    story.append(B.data_table(
        header=["Capability", "Details"],
        rows=[
            ["Batch-to-DDA reconciliation",
             "Each card batch (MID-level) matched to the corresponding "
             "DDA credit; reconciliation deltas (batch size ≠ deposit "
             "size due to fees / chargebacks) clearly displayed."],
            ["Transaction-level lineage",
             "From any DDA credit, drill through to the contributing "
             "batch, and then to individual card transactions — "
             "including card brand, MCC, amount, and timestamp."],
            ["Chargeback cash-flow tracking",
             "Chargeback debits and representment-win credits posted to "
             "DDA with reference to the original transaction for "
             "complete audit trail."],
            ["Fee reconciliation",
             "Monthly fees (interchange pass-through, assessments, "
             "network access, Cumulus margin) reconciled against the "
             "Merchant Processing Statement. Variance-to-grid flags "
             "potential misclassification."],
            ["Multi-MID support",
             "Consolidated view across multiple MIDs (multi-location, "
             "multi-channel, multi-currency). Roll-up and drill-down "
             "navigation."],
            ["Reserve and holdback tracking",
             "Reserve movements (triggered by chargebacks or risk review) "
             "visible with reason, amount, and release timing."],
            ["Currency handling",
             "Multi-currency settlement (DCC / international MIDs) "
             "converted and reconciled to reporting currency."],
            ["Custom reporting",
             "Drag-and-drop custom report builder with scheduled "
             "delivery and email subscription."],
        ],
        col_widths=[1.9 * inch, 5.4 * inch],
    ))

    # PRICING
    story.append(B.section_header("Pricing",
                                  kicker="Service fees"))
    story.append(B.data_table(
        header=["Component", "Amount", "Notes"],
        rows=[
            ["Merchant Integration — monthly platform",
             "$75 / month per MID-to-DDA pairing",
             "Discount on 3+ pairings; enterprise tier negotiated"],
            ["Additional DDA destinations",
             "$25 / month each",
             "Multi-DDA splitting of single MID"],
            ["Additional MID sources",
             "$25 / month each",
             "Multi-MID consolidation to single DDA"],
            ["Custom ERP connector",
             "One-time setup $2,500 – $10,000",
             "SAP, Oracle, NetSuite, Sage Intacct pre-built at $2,500; "
             "custom ERP at time-and-materials"],
            ["Real-time API feed",
             "$25 / month", "Webhook on DDA credit + batch metadata"],
            ["Historical data export (5-year archive)",
             "Included", "Via Business Online / API"],
        ],
        col_widths=[2.5 * inch, 2.0 * inch, 2.8 * inch],
    ))

    # VALUE CHART
    story.append(B.section_header("Operational cost — with vs. without",
                                  kicker="Value analysis"))
    story.append(B.body_para(
        "The chart below illustrates the typical monthly operational "
        "cost of card-settlement reconciliation across merchant sizes, "
        "comparing manual reconciliation (FTE effort) to Merchant "
        "Integration. Cost savings scale with transaction volume and "
        "multi-location complexity."
    ))
    story.append(B.bar_comparison_chart(
        labels=["Single loc.", "3 locations",
                "10 locations", "25 locations", "Enterprise"],
        values=[350, 1100, 3200, 7500, 18000],
        title="Typical monthly reconciliation-labor savings from Merchant Integration",
        ylabel="Labor savings (USD / month)",
        value_fmt=lambda v: f"${v:,.0f}",
    ))

    # WORKFLOW
    story.append(B.section_header("Daily workflow",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "Activity", "Timing"],
        rows=[
            ["1  ·  Card transaction",
             "Transaction authorized and captured at POS, e-commerce "
             "gateway, or mobile.",
             "Real-time"],
            ["2  ·  Batch close",
             "Daily batch closes at 8:00 p.m. ET (or per merchant "
             "configuration); batch total, interchange, and fee composition "
             "calculated.",
             "End of business day"],
            ["3  ·  DDA funding",
             "Net batch (gross — fees — chargebacks) funded to DDA. "
             "Same-day for Cumulus Business Checking; next-day otherwise.",
             "Same or next business day"],
            ["4  ·  Data capture",
             "Merchant Integration receives batch metadata via internal "
             "feed; DDA credit enriched with batch reference, card-level "
             "detail, and fee composition.",
             "Real-time"],
            ["5  ·  Reconciliation",
             "Batch-to-DDA-credit match confirmed; variance (rare) "
             "flagged for investigation.",
             "Real-time"],
            ["6  ·  Delivery",
             "Daily reconciliation report delivered to Business Online + "
             "ERP connector + designated email recipients.",
             "Morning after settlement"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # INTEGRATIONS
    story.append(B.section_header("ERP and accounting integrations",
                                  kicker="Downstream posting"))
    story += B.bullet_list([
        "<b>Oracle ERP Cloud / Fusion</b> — direct posting to GL with "
        "configurable journal-entry templates per card brand, MCC, and "
        "location.",
        "<b>SAP S/4HANA / ECC</b> — automatic lockbox and bank-"
        "transaction-type posting via BAI2 and camt.053.",
        "<b>Oracle NetSuite</b> — SuiteApp integration with auto-"
        "reconciliation to Customer Payments and Deposits.",
        "<b>Sage Intacct</b> — bank-rules integration with "
        "card-settlement auto-post.",
        "<b>Microsoft Dynamics 365 F&O / Business Central</b> — "
        "general-ledger automatic posting.",
        "<b>QuickBooks Enterprise / Online</b> — Intuit Developer "
        "Network integration with transaction-level sync.",
        "<b>Custom / other ERPs</b> — REST API (JSON) with full "
        "transaction payload; BAI2, camt.053, or CSV delivered via SFTP.",
    ])

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Do I need Merchant Integration if I only have one location?",
         "Single-location merchants benefit less from the multi-MID "
         "consolidation view but still save significant time on "
         "card-to-DDA reconciliation and fee-variance tracking. The "
         "standard $75 / month is typically recouped by avoided labor "
         "in the first month for any merchant processing $50,000+ in "
         "cards per month."),
        ("Can I use Merchant Integration without Cumulus Business Checking?",
         "No. Merchant Integration requires the DDA to be a Cumulus "
         "Business Checking account (either Fundamentals or Analyzed). "
         "This is necessary for Cumulus to provide the internal data feed "
         "connecting Merchant Services to the DDA and to guarantee "
         "same-day-funding alignment."),
        ("Does Merchant Integration change my merchant pricing?",
         "No. Merchant Integration is a separate treasury service fee; "
         "your underlying card-processing rates remain governed by your "
         "Merchant Services Agreement. Integration reveals what you are "
         "paying — without changing the rates themselves."),
        ("How are chargebacks reflected in DDA?",
         "Chargebacks debit the DDA on the day they post from the "
         "network, tagged with reference to the original transaction. "
         "Representment-win credits post to DDA with the same reference. "
         "Merchant Integration delivers a daily chargeback cash-flow "
         "report so AR teams can maintain accurate customer-balance records."),
        ("Can I export all this data for custom analysis?",
         "Yes. The Merchant Integration REST API provides transaction-"
         "level, batch-level, and DDA-credit-level data for custom "
         "analytics. Export formats include JSON, CSV, BAI2, and ISO "
         "20022 camt.053. Data is retained for 5 years."),
        ("What happens if Cumulus Merchant Services and DDA post differently?",
         "Reconciliation variances are flagged to Cumulus Operations. "
         "Common causes: timing differences (batch settlement crossing "
         "day boundaries), reserve holdbacks, and currency conversion "
         "for multi-currency merchants. Cumulus typically resolves "
         "within one business day; unresolved cases are escalated to "
         "the Relationship Manager."),
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
