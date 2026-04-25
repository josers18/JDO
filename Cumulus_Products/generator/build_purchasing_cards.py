"""Cumulus Purchasing Cards — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Purchasing_Cards.pdf")

TREASURY_DISCLOSURES = [
    "Cumulus Purchasing Cards are Visa® Purchasing cards issued by "
    "Cumulus Bank, N.A. pursuant to license from Visa U.S.A. Inc. under "
    "the Commercial Card Program Agreement. Cards are commercial credit "
    "and are not subject to consumer lending laws or Regulation Z.",
    "Level-3 data capture depends on supplier capability. Cumulus "
    "provides the Supplier Enablement program to coach suppliers on "
    "Level-3 submission; however, supplier submission of line-item, tax, "
    "shipping, and customer-code data cannot be guaranteed by Cumulus.",
    "Rebate tiers depend on annual billed spend, Days Sales Outstanding "
    "(DSO) from statement close, Level-3 data capture rate, and virtual-"
    "card penetration. Rebates are paid quarterly in arrears and are "
    "reconciled on the program's anniversary.",
    "Payment terms are set in the Commercial Card Program Agreement. "
    "Default program is 25-day statement with net-5 payment, resulting "
    "in approximately 30-day float. Extended-pay programs up to 45 days "
    "are available with credit approval.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Purchasing Cards",
        product_code="TM-CRD-PUR-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="Purchasing Cards",
        lede=("Visa® Purchasing cards with Level-3 data capture, "
              "ghost cards, and single-use accounts for AP automation — "
              "delivering rebate economics up to 1.35% on qualifying "
              "spend with strong DSO."),
        summary_rows=[
            ("Card product", "Visa® Purchasing with Level-3 data"),
            ("Rebate ceiling", "Up to 1.35% for $10M+ annual spend + short DSO"),
            ("Level-3 data fields", "Line-item, tax, shipping, PO, customer code"),
            ("Account types", "Physical cards  ·  single-use  ·  ghost cards"),
            ("Controls", "MCC  ·  velocity  ·  single-transaction"),
            ("Payment terms", "25-day statement  ·  net-5 payment (default)"),
            ("AP integration", "Coupa  ·  Ariba  ·  Oracle  ·  SAP  ·  Workday"),
            ("Supplier enablement", "Included program with ~60–180 day onboarding"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Purchasing Cards are a B2B payment product designed "
        "specifically for AP transformation. Unlike T&E corporate "
        "cards, Purchasing Cards are optimized for vendor and supplier "
        "spend: they capture Level-3 data (line-item detail, tax, "
        "shipping, customer code, product code), which qualifies "
        "transactions for lower interchange — reducing the cost side for "
        "suppliers accepting cards and enabling Cumulus to rebate more "
        "of the interchange back to the corporate client. Purchasing-card "
        "programs pair physical cards (where needed) with ghost cards "
        "(departmental) and single-use accounts (AP-platform-issued) to "
        "cover the full spectrum of procurement workflow."
    ))

    story.append(B.section_header("Key benefits",
                                  kicker="Why Cumulus Purchasing"))
    story.append(B.feature_grid([
        ("Rebate economics",
         "Rebates up to 1.35% on qualifying spend with strong DSO. "
         "Meaningful economic contribution to the AP function — often "
         "offsetting program operating cost 3x or more."),
        ("Level-3 data for compliance",
         "Line-item, tax, shipping, PO, and customer code captured at "
         "the point of sale. Substantially improves reconciliation, "
         "sales / use-tax computation, and audit trail."),
        ("AP-platform integration",
         "Direct integration with Coupa, Ariba, Oracle Procurement, SAP "
         "Ariba, Workday Procurement, and JAGGAER. VCAs issued by the "
         "AP platform from the Purchasing card BIN."),
        ("Supplier enablement service",
         "Cumulus Supplier Enablement outreach — phone, email, and "
         "campaign workflow — to onboard your top suppliers into card "
         "acceptance, with Level-3 compliance coaching."),
        ("Ghost cards for departments",
         "Single card number shared among a department's authorized "
         "purchasers with cost-center tagging and merchant controls. "
         "Ideal for marketing, facilities, and IT procurement."),
        ("Reporting for AP",
         "Transaction-level export to ERP with Level-3 data; audit-"
         "ready invoices; and Procurement-Intelligence reporting that "
         "surfaces maverick spend and supplier consolidation opportunities."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # LEVEL 3
    story.append(B.section_header("Level-3 data capture",
                                  kicker="What's included"))
    story.append(B.data_table(
        header=["Data level", "Fields captured", "Implication"],
        rows=[
            ["Level 1 (standard consumer)",
             "Merchant name, amount, date, authorization code",
             "Highest interchange; typical consumer card"],
            ["Level 2 (commercial)",
             "Level 1 + tax amount, customer code (user-supplied)",
             "Reduced interchange on qualifying commercial transactions"],
            ["Level 3 (enterprise)",
             "Level 2 + line-item detail (SKU, description, quantity, "
             "unit of measure, unit price, line total, tax per line), "
             "shipping / freight, destination country / postal code, "
             "duty amount",
             "Lowest commercial interchange; full audit trail"],
        ],
        col_widths=[1.9 * inch, 3.6 * inch, 1.8 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Why Level-3 matters",
        "Level-3 data capture qualifies transactions for the lowest "
        "commercial interchange — reducing supplier cost of card "
        "acceptance and increasing supplier willingness to accept "
        "cards for invoice payment. For the corporate buyer, Level-3 "
        "delivers clean data for AP reconciliation, sales / use-tax "
        "compliance, and procurement analytics.",
    ))

    # REBATES
    story.append(B.section_header("Rebate schedule",
                                  kicker="Program economics"))
    story.append(B.body_para(
        "Rebates are tiered against annual billed spend, Days Sales "
        "Outstanding (DSO) from statement close to payment receipt, and "
        "the percentage of spend captured at Level 3. Strong DSO and "
        "Level-3 capture lift base rebate into the premium tier."
    ))
    story.append(B.data_table(
        header=["Annual spend tier", "Base rebate (30-day DSO)",
                "Premium (15-day DSO)", "Top tier (5-day DSO + Level-3 80%+)"],
        rows=[
            ["$1M – $3M", "0.85%", "0.95%", "1.05%"],
            ["$3M – $10M", "1.00%", "1.15%", "1.25%"],
            ["$10M – $25M", "1.10%", "1.22%", "1.32%"],
            ["$25M+", "1.15%", "1.25%", "1.35%"],
        ],
        col_widths=[1.9 * inch, 1.7 * inch, 1.7 * inch, 2.0 * inch],
    ))

    # REBATE CHART
    story.append(B.section_header("Rebate impact — $10M program",
                                  kicker="Annual savings"))
    story.append(B.body_para(
        "The chart below illustrates annualized rebate at different DSO "
        "and Level-3 capture combinations for a $10 million annual "
        "Purchasing Card program."
    ))
    story.append(B.bar_comparison_chart(
        labels=["30-day DSO", "15-day DSO",
                "5-day + 60% L3", "5-day + 80% L3", "5-day + 95% L3"],
        values=[110000, 122000, 128000, 132000, 135000],
        title="Annual rebate — $10M program at various DSO / Level-3 levels",
        ylabel="Rebate (USD)",
        value_fmt=lambda v: f"${v:,.0f}",
    ))

    # ACCOUNT TYPES
    story.append(B.section_header("Account types",
                                  kicker="Coverage"))
    story.append(B.data_table(
        header=["Account type", "Use case", "Issuance"],
        rows=[
            ["Physical card",
             "Field purchases, cardholders who need physical tender",
             "Embossed card, NFC contactless, EMV chip"],
            ["Ghost card",
             "Departmental procurement (marketing, IT, facilities)",
             "Single card number shared among authorized purchasers"],
            ["Single-Use Account (SUA / VCA)",
             "AP invoice payments",
             "Issued on demand via AP platform or Cumulus Gateway API"],
            ["Lodged account (travel)",
             "Corporate travel via booking tool",
             "Stored with Concur, Amex GBT, CWT, BCD"],
            ["Fleet account",
             "Fuel and maintenance",
             "EMV chip with fleet controls"],
        ],
        col_widths=[1.9 * inch, 3.0 * inch, 2.4 * inch],
    ))

    # SUPPLIER ENABLEMENT
    story.append(B.section_header("Supplier enablement",
                                  kicker="Unlocking card acceptance"))
    story += B.bullet_list([
        "<b>Supplier segmentation</b> — Cumulus analyzes your supplier "
        "base and identifies candidates by annual spend, invoice count, "
        "and industry card-acceptance propensity.",
        "<b>Campaign design</b> — phone, email, and web-portal campaigns "
        "tailored to the supplier segment (mid-market vs. enterprise vs. "
        "strategic).",
        "<b>Technical enablement</b> — Level-3 interchange coaching, "
        "gateway configuration, and test-transaction validation with each "
        "enrolled supplier.",
        "<b>Terms alignment</b> — negotiation support where suppliers "
        "seek to pass card-acceptance costs via a surcharge; Cumulus can "
        "help reframe card payment as a discount-based AP-optimization "
        "play.",
        "<b>Ongoing penetration</b> — quarterly penetration reports "
        "tracking new enrollments, active payment cards, and unlocked "
        "spend; on-going campaigns for new suppliers added to your AP "
        "master.",
    ])

    # IMPLEMENTATION
    story.append(B.section_header("Implementation timeline",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Phase", "Activity", "Timing"],
        rows=[
            ["1  ·  Discovery and design",
             "Program objectives, target spend categories, policy "
             "alignment, supplier-base analysis.",
             "Weeks 1–3"],
            ["2  ·  Agreement and credit",
             "Commercial Card Program Agreement, credit review, liability "
             "framework, rebate schedule.",
             "Weeks 3–6"],
            ["3  ·  Configuration",
             "BINs, controls, ERP / AP-platform integration, user "
             "provisioning, reporting setup.",
             "Weeks 6–10"],
            ["4  ·  Pilot",
             "Physical cards and VCAs issued to a pilot cohort (10–50 "
             "cardholders). Initial supplier enablement wave.",
             "Weeks 10–14"],
            ["5  ·  Roll-out",
             "Program-wide card issuance, supplier enablement campaigns, "
             "and transition from check / ACH to card for target suppliers.",
             "Weeks 14–26"],
            ["6  ·  Optimization",
             "Quarterly business reviews: rebate realization, DSO, "
             "Level-3 capture, supplier penetration, and program "
             "enhancements.",
             "Ongoing"],
        ],
        col_widths=[1.3 * inch, 4.4 * inch, 1.5 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Purchasing card vs. corporate T&E card — which do I need?",
         "A Corporate T&E program covers employee travel and "
         "entertainment spend; a Purchasing program covers supplier "
         "and vendor payments. Most enterprises run both in parallel. "
         "The key differentiator of Purchasing is Level-3 data capture "
         "and AP-platform integration, which T&E programs do not require."),
        ("How do I achieve the top rebate tier?",
         "The top rebate tier combines $25M+ annual spend, 5-day DSO "
         "(pay within 5 days of statement close), and 80%+ of "
         "transactions captured at Level 3. Programs focused on "
         "supplier enablement and AP-platform integration typically "
         "achieve Level-3 capture rates above 60% within 18 months of "
         "launch."),
        ("Can suppliers refuse card acceptance?",
         "Yes. Supplier acceptance is voluntary and may carry merchant "
         "discount costs that suppliers weigh against payment speed and "
         "working-capital benefits. The Cumulus Supplier Enablement "
         "program converts roughly 30–50% of targeted suppliers to card "
         "acceptance within the first 12 months — a figure that depends "
         "on industry, supplier size, and your willingness to negotiate "
         "AP terms."),
        ("Does Purchasing work with my AP system?",
         "Yes — Cumulus is certified with Coupa, Ariba, Oracle iProcurement "
         "and Fusion, SAP Ariba, Workday Procurement, JAGGAER, and "
         "Basware. Integrations deliver VCA issuance from the AP platform "
         "when invoices are approved, then auto-reconcile when payment "
         "settles."),
        ("How are rebates calculated and paid?",
         "Rebates calculate on net billed spend (excluding refunds, "
         "adjustments, cash advances) by tier on the program anniversary. "
         "Quarterly progress rebates are paid at the base tier; the "
         "true-up to actual tier is settled at year-end. Rebates are "
         "paid by ACH credit or applied to the company master account."),
        ("What's the implementation effort on my side?",
         "A mid-market Purchasing program (up to $10M annual spend) "
         "typically requires 20–30% of a Treasury Analyst's time for 3 "
         "months. Key client-side work: AP-data extraction for supplier "
         "analysis, policy alignment, IT engagement for AP-platform "
         "integration, and endorsing the Cumulus Supplier Enablement "
         "outreach."),
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
