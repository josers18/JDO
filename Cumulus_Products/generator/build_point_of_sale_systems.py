"""Cumulus Point-of-Sale Systems — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Point_of_Sale_Systems.pdf")

MERCHANT_DISCLOSURES = [
    "Point-of-sale hardware, software, and related services are provided "
    "by Cumulus Merchant Services under the POS Services Agreement, "
    "which incorporates by reference the Cumulus Merchant Services "
    "Agreement and applicable payment-network rules.",
    "Hardware warranty is provided by the manufacturer through a "
    "24-month standard coverage period; Cumulus Care+ extends coverage "
    "to 36 months and adds advance-replacement logistics.",
    "SaaS software subscription fees are billed monthly in advance. "
    "Merchants may downgrade or cancel subject to the notice period set "
    "in the POS Services Agreement; refunds are not offered on prepaid "
    "subscription fees.",
    "PCI DSS 4.0 compliance is a shared responsibility; Cumulus provides "
    "PCI-validated hardware and P2PE, but merchants remain responsible "
    "for cardholder-data environment controls outside the certified "
    "POS boundary.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Point-of-Sale Systems",
        product_code="MS-POS-2026.04",
        category="Merchant Services",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Point-of-Sale Systems",
        lede=("Integrated POS hardware and software for single-location, "
              "multi-location, and mobile merchants — with EMV "
              "contactless, loyalty, BOPIS, and direct integration to "
              "Cumulus Payment Processing."),
        summary_rows=[
            ("Product lines", "Cumulus Counter  ·  Merchant Pro  ·  Cumulus Go"),
            ("Hardware", "$0 – $999 depending on configuration"),
            ("Software SaaS", "$59 – $299 / month per terminal"),
            ("Payment acceptance", "EMV chip + NFC contactless + mobile wallet"),
            ("Features", "BOPIS  ·  loyalty  ·  inventory  ·  appointments"),
            ("Connectivity", "Wi-Fi  ·  Ethernet  ·  LTE (Go) with offline mode"),
            ("Integrations", "Accounting  ·  e-commerce  ·  reservation  ·  KDS"),
            ("Support", "24/7 phone  ·  remote diagnostics  ·  on-site option"),
        ],
        category_label="PRODUCT BROCHURE  ·  MERCHANT SERVICES",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Point-of-Sale Systems are turnkey hardware-and-software "
        "platforms that unify payment acceptance, inventory management, "
        "customer engagement, and reporting. Three product lines are "
        "tailored to merchant size and use case: Cumulus Counter for "
        "single-location retail and quick-service; Cumulus Merchant Pro "
        "for multi-location enterprise with centralized management; and "
        "Cumulus Go for mobile and pop-up scenarios. All systems "
        "integrate natively with Cumulus Payment Processing for "
        "same-day funding, consolidated reporting, and unified PCI "
        "compliance posture."
    ))

    # PRODUCT LINES
    story.append(B.section_header("Product lines",
                                  kicker="Choose your configuration"))
    story.append(B.feature_grid([
        ("Cumulus Counter",
         "Single-location retail, quick-service restaurant, service, and "
         "salon. 15-inch touchscreen terminal with integrated printer, "
         "cash drawer, and EMV / contactless reader. 20+ peripheral "
         "SKUs (barcode scanner, scale, kitchen display, customer display)."),
        ("Cumulus Merchant Pro",
         "Multi-location and enterprise merchants. Central inventory, "
         "pricing, and promotion management; role-based permissions; "
         "cross-location transfer and BOPIS orchestration; consolidated "
         "reporting across 2–500+ terminals."),
        ("Cumulus Go",
         "Mobile and outdoor point of sale. Handheld device with LTE "
         "connectivity, offline queue, and integrated EMV / contactless. "
         "Ideal for food trucks, outdoor markets, in-home service, "
         "events, and pop-up retail."),
        ("Cumulus Gateway (e-commerce)",
         "Hosted payment page and server-to-server API for online and "
         "in-app commerce. 3-D Secure 2 authentication; tokenization; "
         "recurring and subscription billing."),
        ("Kitchen Display System (KDS)",
         "Network-connected kitchen display with course timing, "
         "expediting, and station routing. Integrates with Counter and "
         "Merchant Pro for restaurant workflow."),
        ("Customer-Facing Display",
         "Secondary screen at the checkout for order review, digital "
         "receipts, tip selection, and loyalty enrollment."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # HARDWARE PRICING
    story.append(B.section_header("Hardware configurations",
                                  kicker="What you need"))
    story.append(B.data_table(
        header=["Configuration", "Includes",
                "Hardware price", "Software (monthly)"],
        rows=[
            ["Cumulus Counter — Essential",
             "15\" touchscreen, thermal printer, EMV/NFC reader",
             "$499", "$59 / terminal"],
            ["Cumulus Counter — Retail",
             "Essential + cash drawer, barcode scanner, customer display",
             "$799", "$89 / terminal"],
            ["Cumulus Counter — Restaurant",
             "Essential + KDS display, kitchen printer, handheld order device",
             "$999", "$129 / terminal"],
            ["Cumulus Merchant Pro — base",
             "Multi-location hub + 1st terminal (any config)",
             "$999 + terminal", "$199 / terminal"],
            ["Cumulus Merchant Pro — enterprise",
             "Pro base + central dashboard, inventory API, SSO",
             "Contact sales", "$299 / terminal"],
            ["Cumulus Go — handheld",
             "Handheld device with LTE, integrated reader, charging dock",
             "$349", "$59 / device"],
            ["Cumulus Go — Lite",
             "Bluetooth mPOS reader (merchant supplies phone / tablet)",
             "$0 (first unit)", "$19 / device"],
            ["Gateway only (e-commerce)",
             "Hosted page, API, PCI-DSS P2PE",
             "$0", "$45 / MID"],
        ],
        col_widths=[2.1 * inch, 2.8 * inch, 1.1 * inch, 1.3 * inch],
    ))

    # TIER COMPARISON CHART
    story.append(B.section_header("Monthly software pricing by tier",
                                  kicker="Subscription economics"))
    story.append(B.body_para(
        "The chart below compares monthly software subscription fees per "
        "terminal across the Cumulus POS product line. All subscriptions "
        "include hardware firmware updates, PCI-DSS compliance support, "
        "24/7 phone support, and cloud-based reporting. Enterprise tiers "
        "add central management, SSO, and API access."
    ))
    story.append(B.bar_comparison_chart(
        labels=["Go Lite", "Go", "Counter Ess.", "Counter Retail",
                "Counter Rest.", "Pro Std", "Pro Ent."],
        values=[19, 59, 59, 89, 129, 199, 299],
        title="Monthly software subscription — per terminal",
        ylabel="Monthly fee (USD)",
        value_fmt=lambda v: f"${v}",
    ))

    # FEATURES
    story.append(B.section_header("Feature comparison by product line",
                                  kicker="Capabilities"))
    story.append(B.data_table(
        header=["Feature", "Cumulus Go", "Counter", "Merchant Pro"],
        rows=[
            ["EMV chip + NFC contactless", "Yes", "Yes", "Yes"],
            ["Apple Pay / Google Pay / Samsung Pay", "Yes", "Yes", "Yes"],
            ["Offline transaction queue", "Yes", "Yes", "Yes"],
            ["Inventory management", "Limited (100 SKUs)",
             "Yes (10,000 SKUs)", "Yes (unlimited)"],
            ["Multi-location inventory transfer", "No", "No", "Yes"],
            ["BOPIS (buy online, pick up in store)", "No", "Yes",
             "Yes + cross-location"],
            ["Loyalty program", "Basic", "Standard", "Advanced + segments"],
            ["Appointment booking", "Yes", "Yes", "Yes"],
            ["KDS / kitchen display integration", "—", "Yes", "Yes"],
            ["Employee roles and permissions",
             "Single login", "Up to 25", "Unlimited"],
            ["Gift cards", "Yes", "Yes", "Yes (cross-location)"],
            ["E-commerce sync", "—", "Shopify / WooCommerce",
             "All major + REST API"],
            ["Central management dashboard",
             "—", "—", "Yes"],
            ["SSO (SAML 2.0)", "—", "—", "Enterprise tier"],
            ["API access", "—", "Limited", "Full"],
        ],
        col_widths=[2.4 * inch, 1.6 * inch, 1.6 * inch, 1.7 * inch],
    ))

    # INTEGRATIONS
    story.append(B.section_header("Integrations",
                                  kicker="Connects to your stack"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Accounting and back-office"),
            *B.bullet_list([
                "QuickBooks Online and Desktop — daily sales, refunds, "
                "tax, and fees journaled.",
                "Xero, Sage Intacct, and NetSuite — GL-level integration "
                "with automated reconciliation.",
                "Microsoft Dynamics 365 Business Central and SAP Business "
                "One — enterprise mid-market integrations.",
                "ADP and Paychex payroll — hours and tip distribution "
                "from Counter and Merchant Pro.",
            ]),
        ],
        right_flowables=[
            B.sub_header("E-commerce and operations"),
            *B.bullet_list([
                "Shopify, WooCommerce, Magento, BigCommerce — unified "
                "inventory, BOPIS, and order consolidation.",
                "OpenTable, Resy, Toast Tables — restaurant reservations "
                "with integrated seating and guest profiles.",
                "Tock, SevenRooms — wholesale prepaid events.",
                "DoorDash, Uber Eats, Grubhub — menu and order "
                "routing with integrated tender type.",
                "Cumulus Invoicing, ACH, and Wire — for hybrid B2B / "
                "B2C accounts receivable.",
            ]),
        ],
    ))

    # SUPPORT AND SLA
    story.append(B.section_header("Support and SLAs",
                                  kicker="Keeping you running"))
    story.append(B.data_table(
        header=["Tier", "Coverage hours",
                "First response SLA", "Hardware replacement"],
        rows=[
            ["Standard (included)",
             "24 / 7 phone + web",
             "Phone: < 2 min  ·  Web: < 1 hour",
             "Next-business-day advance replacement"],
            ["Cumulus Care+ ($19 / terminal / mo)",
             "24 / 7 with dedicated queue",
             "Phone: < 30 sec  ·  Web: < 15 min",
             "Same-day for orders by 3 p.m. ET"],
            ["Enterprise",
             "24 / 7 with named technical account manager",
             "Phone: < 30 sec  ·  Web: < 5 min",
             "On-site technician within 4 business hours (select cities)"],
        ],
        col_widths=[1.9 * inch, 1.7 * inch, 2.0 * inch, 1.7 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Deployment and onboarding",
        "Cumulus onboards new merchants in four phases: (1) Pre-site "
        "survey and hardware quote; (2) staging and preconfiguration at "
        "Cumulus fulfillment center (menu, inventory, tax rules); (3) "
        "shipping and on-site installation (optional, $499 per site); "
        "(4) live-day support with floor-walker and 72-hour post-launch "
        "check-in. Typical deployment: 10–15 business days for Counter; "
        "4–8 weeks for Merchant Pro multi-location rollout.",
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Can I use Cumulus POS with a non-Cumulus processor?",
         "No. Cumulus POS terminals are certified to Cumulus Payment "
         "Processing exclusively, which enables same-day funding, "
         "consolidated reporting, and unified PCI posture. If you are "
         "currently with another processor, a transition can usually "
         "complete in 5–10 business days with no terminal downtime."),
        ("What happens if my internet goes down?",
         "All Cumulus POS terminals support offline mode for in-person "
         "payments. Transactions are queued locally and submitted "
         "automatically when connectivity is restored. Offline "
         "authorization is available for card-present transactions up to "
         "a configurable floor limit (default $100); transactions above "
         "the limit require online authorization."),
        ("Can I use my existing POS hardware?",
         "In most cases, yes. Cumulus supports a broad list of "
         "third-party hardware: Ingenico, Verifone, PAX, Clover Go, and "
         "Square Terminal. Verified Hardware Partner program lists all "
         "compatible devices with the required firmware and P2PE "
         "certification level."),
        ("Does Cumulus POS handle tips?",
         "Yes. Tip entry is configurable: suggested tip percentages, "
         "custom tip, no-tip opt-out, and post-authorization adjustment "
         "(for service industries). Tips can be pooled or distributed by "
         "employee; tip reports integrate with payroll."),
        ("How do BOPIS and curbside pickup work?",
         "Merchant Pro and Counter (with e-commerce integration) support "
         "BOPIS: orders placed online appear in a pickup queue at the "
         "selected location; staff pick, stage, and notify the customer "
         "for pickup. Curbside adds an arrival notification and vehicle-"
         "description intake."),
        ("What contract term is required?",
         "Cumulus POS is month-to-month for software. Hardware is "
         "purchased outright (no financing required) or financed separately "
         "through Cumulus Equipment Leasing on 36-month terms. "
         "Month-to-month software may be cancelled with 30 days' notice."),
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
            "Third-party integrations are provided by independent software "
            "vendors under their respective licenses and terms of service. "
            "Cumulus is not responsible for the functionality, availability, "
            "or security of third-party services; integrations may be "
            "discontinued if the partner ceases to support required APIs.",
            "Advertised hardware prices apply when purchased alongside a "
            "minimum 12-month software subscription. Hardware-only sales, "
            "without a Cumulus Payment Processing merchant agreement, "
            "are not supported.",
            "Installation, on-site service, staging, and advanced "
            "configuration services are priced separately and described "
            "in the POS Implementation Statement of Work signed at the "
            "time of order.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
