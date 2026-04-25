"""Cumulus Lockbox Services — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Lockbox_Services.pdf")

TREASURY_DISCLOSURES = [
    "Lockbox services are provided by Cumulus Bank, N.A. under the "
    "Treasury Services Master Agreement and applicable service schedule. "
    "Processing is performed at Cumulus Remittance Processing Centers "
    "operated to SOC 1 Type II and SOC 2 Type II standards with annual "
    "independent audits.",
    "Same-day ledger credit is available on items received at the "
    "lockbox post-office box prior to the service cut-off. Float, image "
    "availability, and data-file delivery are governed by the service "
    "schedule.",
    "Invoice-match and auto-cash-application rely on OCR and exception "
    "handling; match rates depend on remittance-document quality. "
    "Clients should provide invoice-coupon specifications to maximize "
    "automated match performance.",
    "Retention of imaged remittance documents is per the service "
    "schedule — typically 7 years for retail lockbox, 10 years for "
    "wholesale. Original paper items are retained for a shorter period "
    "and securely destroyed per Cumulus policy.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Lockbox Services",
        product_code="TM-LBX-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="Lockbox Services",
        lede=("Retail (scannable-coupon) and wholesale (B2B invoice-"
              "match) lockbox processing with same-day imaging, data "
              "capture, and ERP integration to Oracle, SAP, NetSuite, "
              "and Sage Intacct."),
        summary_rows=[
            ("Lockbox types", "Retail (scan coupon)  ·  Wholesale (invoice-match)"),
            ("Setup", "$250 / month setup"),
            ("Per-item pricing", "$0.45 retail  ·  $1.10 wholesale"),
            ("Processing", "Same-day imaging and data capture"),
            ("ERP integration", "Oracle  ·  SAP  ·  NetSuite  ·  Sage Intacct"),
            ("Cut-off (ET)", "Multiple daily pickups; 4:00 p.m. same-day credit"),
            ("Remittance images", "Check + invoice coupon, retained 7–10 years"),
            ("Reporting", "BAI2  ·  camt.053  ·  XML  ·  CSV  ·  webhooks"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Lockbox Services consolidate accounts-receivable "
        "check collection at a dedicated Cumulus remittance-processing "
        "post-office box. Incoming mail is retrieved multiple times per "
        "day, opened and imaged, items are deposited to the client's "
        "Cumulus operating account, and structured remittance data is "
        "transmitted to the client's ERP for cash application. Two "
        "service tiers match use case: Retail Lockbox for high-volume, "
        "consumer-billing use cases (coupons scanned directly); "
        "Wholesale Lockbox for B2B with varied remittance documents, "
        "invoice matching, and OCR-driven cash application. Both tiers "
        "deliver same-day deposit credit, accelerate cash-flow, and "
        "eliminate the operational cost of centralized mail handling."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits",
                                  kicker="Why lockbox"))
    story.append(B.feature_grid([
        ("Acceleration of collections",
         "Multiple daily pickups and same-day deposit credit accelerate "
         "cash-flow by 1–3 days compared to internal mail processing."),
        ("Auto-cash-application",
         "Wholesale Lockbox OCR reads invoice number, customer number, "
         "and remit amount; matches against open-invoice file; delivers "
         "pre-applied remittance to ERP for one-step cash application."),
        ("Reduced AP / AR operating cost",
         "Eliminate internal mail-opening, data-entry, and deposit-"
         "preparation functions. Staff redeployed to higher-value "
         "receivables work (collections, dispute resolution)."),
        ("Image-based exception management",
         "Every item imaged; exceptions (misapplied payments, short "
         "payments, unidentified remittance) delivered with images to "
         "the AR team for resolution."),
        ("ERP integration",
         "Direct integration with Oracle ERP Cloud, SAP S/4HANA, Oracle "
         "NetSuite, Sage Intacct, Microsoft Dynamics 365, and QuickBooks "
         "Enterprise."),
        ("Retention and audit",
         "7–10 year retention of imaged remittance documents; image "
         "retrieval via Business Online or API; SOC 1 / SOC 2 audited "
         "operations center."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # RETAIL VS WHOLESALE
    story.append(B.section_header("Retail vs. Wholesale lockbox",
                                  kicker="Choose your structure"))
    story.append(B.data_table(
        header=["Characteristic", "Retail Lockbox", "Wholesale Lockbox"],
        rows=[
            ["Use case",
             "High-volume consumer billing (utilities, insurance, "
             "healthcare, subscription)",
             "B2B A/R — varied invoices, cut checks, written / "
             "emailed remittance"],
            ["Typical volume",
             "500 – 50,000 items per month",
             "50 – 5,000 items per month"],
            ["Remittance format",
             "Pre-printed scannable coupon with MICR-readable billing "
             "data",
             "Varied: invoice stubs, statements, email notices, check "
             "memos"],
            ["Matching method",
             "MICR + OCR of scan line; 98%+ auto-match with quality "
             "coupons",
             "OCR of invoice numbers + fuzzy match against open-invoice "
             "file; 70–90% auto-match"],
            ["Exception handling",
             "Unmatched items routed to a small-volume exception queue",
             "Unmatched or short-paid items sent to client AR team "
             "with images"],
            ["Per-item price",
             "$0.45 per item", "$1.10 per item"],
            ["Setup fee", "$250 / month", "$250 / month"],
            ["Cut-off for same-day credit",
             "4:00 p.m. ET", "3:00 p.m. ET"],
        ],
        col_widths=[1.8 * inch, 2.7 * inch, 2.8 * inch],
    ))

    # PRICING
    story.append(B.section_header("Pricing details",
                                  kicker="Fee schedule"))
    story.append(B.data_table(
        header=["Item", "Retail", "Wholesale"],
        rows=[
            ["Monthly setup / platform",
             "$250 / month",
             "$250 / month"],
            ["Per item processed", "$0.45", "$1.10"],
            ["Exception handling",
             "$1.50 / exception",
             "$3.50 / exception"],
            ["Data file delivery (BAI2 / camt.053)",
             "Included", "Included"],
            ["Image file delivery",
             "Included (with 7-year retention)",
             "Included (with 10-year retention)"],
            ["PO Box rental (Cumulus-arranged)",
             "Included", "Included"],
            ["Invoice-file upload (Wholesale)",
             "—", "Included"],
            ["OCR tuning / field configuration",
             "—", "$500 one-time per field"],
            ["On-demand image retrieval",
             "$2 / image", "$2 / image"],
            ["Armored-courier pickup",
             "At client arrangement", "At client arrangement"],
        ],
        col_widths=[3.1 * inch, 2.1 * inch, 2.1 * inch],
    ))

    # VOLUME ECONOMICS
    story.append(B.section_header("Volume economics — Wholesale",
                                  kicker="Cost vs. match-rate"))
    story.append(B.body_para(
        "The chart below illustrates per-item cost across monthly "
        "Wholesale Lockbox volumes, inclusive of platform + per-item "
        "fees. Volume pricing kicks in above 1,000 items per month."
    ))
    story.append(B.bar_comparison_chart(
        labels=["100 items", "500 items", "1,000 items",
                "2,500 items", "5,000 items"],
        values=[3.60, 1.60, 1.35, 1.20, 1.15],
        title="Wholesale Lockbox — all-in monthly cost per item",
        ylabel="Effective cost per item (USD)",
        value_fmt=lambda v: f"${v:.2f}",
    ))

    # WORKFLOW
    story.append(B.section_header("Daily processing workflow",
                                  kicker="How items flow"))
    story.append(B.data_table(
        header=["Step", "Activity", "Timing"],
        rows=[
            ["1  ·  Mail arrival",
             "Incoming mail addressed to the Cumulus lockbox PO box "
             "collected multiple times per day by USPS and processed "
             "at Cumulus Remittance Processing.",
             "Continuous"],
            ["2  ·  Opening",
             "Automated mail-opening with scan of envelope; items "
             "extracted and sequenced.",
             "Real-time"],
            ["3  ·  Imaging",
             "Check, coupon / remittance stub, and envelope imaged at "
             "200+ DPI; MICR line captured; OCR performed on "
             "coupon / invoice reference.",
             "Real-time"],
            ["4  ·  Matching",
             "Retail: auto-apply to customer account by MICR scan "
             "line. Wholesale: OCR invoice-number match against "
             "open-invoice file; fuzzy match fallback.",
             "Real-time"],
            ["5  ·  Deposit",
             "Matched items posted to client operating account. "
             "Exceptions queued with images for client resolution.",
             "Same-day ledger credit"],
            ["6  ·  Data delivery",
             "BAI2 or camt.053 remittance file transmitted to client "
             "via SFTP, API, or ERP integration. Webhooks for real-"
             "time posting.",
             "Multiple daily deliveries"],
            ["7  ·  Image retention",
             "Images retained in searchable archive for 7 (retail) or "
             "10 (wholesale) years.",
             "Ongoing"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # INTEGRATIONS
    story.append(B.section_header("ERP integrations",
                                  kicker="Cash application"))
    story += B.bullet_list([
        "<b>Oracle ERP Cloud / E-Business Suite</b> — BAI2 + Remittance "
        "Advice import, matched to Receivables open invoices.",
        "<b>SAP S/4HANA / ECC</b> — camt.053 bank statement + BAI2 "
        "options; automatic lockbox processing (transaction code FLB1N).",
        "<b>Oracle NetSuite</b> — SuiteApp integration for "
        "auto-application and exception handling.",
        "<b>Sage Intacct</b> — Intacct bank-rules integration for "
        "auto-match and auto-post.",
        "<b>Microsoft Dynamics 365 F&O / Business Central</b> — "
        "electronic payments import.",
        "<b>QuickBooks Enterprise</b> — CSV or direct integration via "
        "Intuit Developer Network.",
        "<b>Custom ERP</b> — BAI2, ISO 20022 camt.053, XML, or CSV "
        "delivered via SFTP, REST API, or webhook.",
    ])

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Retail vs. Wholesale — which fits my business?",
         "If your receivables come as high-volume consumer billing with "
         "pre-printed scannable coupons (utility, insurance, healthcare, "
         "subscription), Retail Lockbox is the right fit at 3–5× lower "
         "per-item cost. If your receivables are B2B with varied "
         "remittance documents, short payments, and invoice matching, "
         "Wholesale Lockbox is appropriate despite the higher per-item "
         "cost — auto-cash-application savings quickly offset the "
         "premium."),
        ("How does auto-cash-application work?",
         "Client uploads an open-invoice file (customer ID, invoice "
         "number, amount, due date) to Cumulus daily. When a remittance "
         "arrives, OCR extracts the invoice reference from the coupon "
         "or stub; Cumulus matches against the open-invoice file using "
         "exact and fuzzy-match logic; matched payments are pre-applied "
         "in the data file delivered to ERP. Typical match rates: "
         "95%+ retail, 70–90% wholesale."),
        ("What happens with short payments?",
         "Short-paid items (remittance less than invoice) are flagged "
         "as exceptions with both coupon and check images. The exception "
         "file is delivered to your AR team for decisioning — apply as "
         "partial, apply with dispute code, or return for investigation. "
         "Cumulus does not auto-resolve short payments."),
        ("How long are images retained?",
         "Retail Lockbox: 7 years. Wholesale Lockbox: 10 years. Images "
         "are stored in a SOC-audited archive with full-text searchable "
         "OCR content. Retrieval is available via Business Online or "
         "API at $2 per image for on-demand historic retrieval."),
        ("Can I change the PO box location for tax / nexus reasons?",
         "Yes. Cumulus operates multiple remittance-processing centers "
         "across the U.S. Selecting a lockbox in a strategic jurisdiction "
         "— typically one where your customers are concentrated — "
         "reduces mail-float days and improves collection acceleration. "
         "Nexus considerations should be reviewed with tax counsel."),
        ("Can checks be endorsed by Cumulus?",
         "Yes. Cumulus applies the client's deposit-endorsement stamp "
         "on every processed item. For restricted endorsements ('For "
         "deposit only to Account #####'), Cumulus uses an indorsement "
         "specified by the client in the service schedule."),
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
