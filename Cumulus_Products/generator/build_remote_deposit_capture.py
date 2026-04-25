"""Cumulus Remote Deposit Capture — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Remote_Deposit_Capture.pdf")

TREASURY_DISCLOSURES = [
    "Remote Deposit Capture services are provided by Cumulus Bank, N.A. "
    "under the Treasury Services Master Agreement, applicable service "
    "schedule, the Check Clearing for the 21st Century Act (Check 21, "
    "12 U.S.C. § 5001 et seq.), and Regulation CC (12 C.F.R. Part 229).",
    "Client retains original paper items in a secure location for a "
    "period set in the service schedule (typically 14–30 days) before "
    "destruction. Cumulus is not responsible for losses arising from "
    "improper destruction, secondary-presentment fraud on non-destroyed "
    "items, or failure to maintain secure custody of images.",
    "Duplicate-presentment detection uses image hashing and "
    "cross-channel matching but cannot guarantee every duplicate is "
    "detected. Clients remain liable for duplicate items presented "
    "through RDC and an alternate channel.",
    "Mobile deposit limits apply at the deposit level and in aggregate "
    "per day and per month. Limits are subject to Cumulus risk review; "
    "increases available on request with qualifying history.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Remote Deposit Capture",
        product_code="TM-RDC-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="Remote Deposit Capture",
        lede=("Desktop scanner and mobile-app deposit channels for "
              "checks — same-day credit to operating accounts with "
              "duplicate-detection, image-based fraud review, and "
              "ERP integration."),
        summary_rows=[
            ("Deposit channels", "Desktop (Panini Vision X / Digital Check TS240)  ·  Mobile"),
            ("Daily limit (default)", "$250,000  ·  higher by review"),
            ("Monthly limit (default)", "$1,000,000"),
            ("Pricing", "$45 / month + $0.12 / item"),
            ("Cut-off (ET)", "10:00 p.m. for same-day ledger credit"),
            ("Original-item retention", "14–30 days before destruction"),
            ("Integrations", "Auto-posting to Cumulus Business Checking + ERP export"),
            ("Security", "Image encryption  ·  dup detection  ·  signer controls"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Remote Deposit Capture (RDC) enables a commercial client to "
        "deposit paper checks by scanning or photographing the items "
        "rather than presenting them in a branch. Scanned or "
        "photographed images are transmitted to Cumulus, where they are "
        "validated against MICR data, checked for duplicates, and "
        "presented for clearing through the Check 21 image-exchange "
        "network. The paper item remains in client custody (typically "
        "destroyed after a holding period) — credit is based on the "
        "image. Cumulus offers two RDC channels: Desktop RDC with a "
        "certified scanner for high-volume, multi-user office "
        "environments; and Mobile RDC through the Cumulus Business App "
        "for ad-hoc and field deposits."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why RDC"))
    story.append(B.feature_grid([
        ("Same-day credit",
         "Deposits completed by 10:00 p.m. ET receive same-business-day "
         "ledger credit, with next-business-day availability on most "
         "items (Regulation CC)."),
        ("Eliminates branch trips",
         "Deposit from office or field. Especially valuable for "
         "multi-location operators, service businesses, and "
         "professional practices."),
        ("Centralized multi-location deposits",
         "A single RDC installation at HQ can process checks collected "
         "at multiple locations (shipped overnight via secure courier), "
         "consolidating deposit control."),
        ("Duplicate detection",
         "Cumulus compares every incoming image hash against 180 days "
         "of prior RDC, mobile, branch, and ATM deposits — preventing "
         "double-posting at the source."),
        ("Deposit-workflow integration",
         "Auto-posting of deposits to Cumulus Business Checking with "
         "daily file export (BAI2 / camt.053) to your ERP, accounting "
         "system, or AR cash-application module."),
        ("Scanner rental or purchase",
         "Panini Vision X (5 / 30 / 60-items-per-minute models) and "
         "Digital Check TS240 available for purchase or monthly rental; "
         "includes PCI-DSS-compliant encryption."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # PRICING
    story.append(B.section_header("Pricing",
                                  kicker="Service fees"))
    story.append(B.data_table(
        header=["Item", "Amount", "Notes"],
        rows=[
            ["Monthly platform fee", "$45 / month",
             "Per MID; includes 1 primary user + 5 secondary users"],
            ["Additional users", "$5 / user / month", ""],
            ["Per-item fee",
             "$0.12 / item",
             "Applied to each item scanned and released"],
            ["Scanner — Panini Vision X I (5 ipm)",
             "$400 purchase  ·  $19 / month rental", ""],
            ["Scanner — Panini Vision X II (30 ipm)",
             "$695 purchase  ·  $29 / month rental", ""],
            ["Scanner — Digital Check TS240",
             "$495 purchase  ·  $24 / month rental", ""],
            ["Mobile RDC", "Included in platform fee",
             "Cumulus Business Mobile app"],
            ["Returned-item fee",
             "$12 / item",
             "Applied to items returned by drawee bank"],
            ["Image-recall / copy request",
             "$2 / image", "From Cumulus archive"],
        ],
        col_widths=[2.8 * inch, 2.0 * inch, 2.5 * inch],
    ))

    # LIMITS
    story.append(B.section_header("Limits and availability",
                                  kicker="Daily / monthly caps"))
    story.append(B.data_table(
        header=["Profile", "Daily limit", "Monthly limit",
                "Availability"],
        rows=[
            ["Default small business",
             "$250,000", "$1,000,000",
             "Next-business-day; up to $5,525 same-day"],
            ["Mid-market (established)",
             "$500,000", "$2,500,000",
             "Same-day up to $25,000"],
            ["Enterprise",
             "Negotiated (often $1M+/day)",
             "Negotiated",
             "Per relationship; may qualify for immediate availability"],
            ["Mobile RDC — default",
             "$100,000", "$400,000",
             "Same per-deposit availability rules"],
            ["Mobile RDC — enhanced",
             "$250,000", "$1,000,000",
             "With 6+ months RDC history in good standing"],
            ["Per-check maximum",
             "$500,000 per item",
             "—",
             "Items above $500,000 recommended for teller deposit"],
        ],
        col_widths=[1.9 * inch, 1.5 * inch, 1.3 * inch, 2.6 * inch],
    ))

    # ILLUSTRATIVE VOLUME CHART
    story.append(B.section_header("Service tier comparison",
                                  kicker="By volume profile"))
    story.append(B.body_para(
        "The chart below illustrates typical monthly RDC cost across "
        "four volume profiles, assuming a single RDC installation, "
        "one scanner rental, and $0.12 per-item pricing. Volumes above "
        "500 items / month typically warrant Analyzed Checking ECR-"
        "offset pricing to reduce effective cost."
    ))
    story.append(B.bar_comparison_chart(
        labels=["100 items/mo", "250 items/mo",
                "500 items/mo", "1,000 items/mo", "2,500 items/mo"],
        values=[86, 104, 134, 194, 374],
        title="Typical monthly RDC cost (platform + scanner + per-item)",
        ylabel="Monthly cost (USD)",
        value_fmt=lambda v: f"${v}",
    ))

    # WORKFLOW
    story.append(B.section_header("Deposit workflow",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "Activity", "Timing"],
        rows=[
            ["1  ·  Prepare",
             "Endorse items 'For deposit only to Cumulus account "
             "#####.' Stack in feeder or capture individually on mobile.",
             "Any time"],
            ["2  ·  Scan / capture",
             "Scanner (or mobile app) captures front and back images "
             "and MICR line. Image quality assessment (IQA) confirms "
             "read quality.",
             "Real-time"],
            ["3  ·  Review",
             "Review itemized deposit total; correct any items with "
             "amount-read errors; remove any rejected items.",
             "Real-time"],
            ["4  ·  Release",
             "Submit deposit file to Cumulus. Cumulus performs duplicate "
             "detection across all channels (RDC, mobile, ATM, teller "
             "for 180 days).",
             "Seconds"],
            ["5  ·  Ledger credit",
             "Funds ledgered to the operating account same-day if "
             "submitted by 10:00 p.m. ET; otherwise next business day.",
             "Same business day"],
            ["6  ·  Clearing",
             "Cumulus transmits image through Check 21 image-exchange "
             "network to drawee bank for settlement.",
             "1–2 business days"],
            ["7  ·  Retention and destruction",
             "Client retains original paper items in secure custody for "
             "14–30 days (per service schedule) and then destroys.",
             "14–30 days"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # SECURITY
    story.append(B.section_header("Security and controls",
                                  kicker="Image and fraud protection"))
    story += B.bullet_list([
        "<b>Image encryption</b> — all images encrypted in transit (TLS "
        "1.3) and at rest (AES-256) with key management per FIPS 140-3 "
        "validated modules.",
        "<b>Duplicate detection</b> — 180-day lookback against RDC, "
        "mobile, ATM, branch, and night-drop deposits across all "
        "Cumulus channels.",
        "<b>User entitlements</b> — role-based: scanner operator, "
        "reviewer, releaser, administrator. Segregation of scan and "
        "release for larger organizations.",
        "<b>Image-quality analysis (IQA)</b> — automatic IQA flags "
        "low-contrast, skewed, or uncovered items at scan; released "
        "images that fail downstream IQA return in standard fashion.",
        "<b>MICR validation</b> — MICR line parsed and validated "
        "against ABA routing-number directory and amount/serial-number "
        "format rules.",
        "<b>Audit trail</b> — every scan, review, release, and "
        "rejection logged with user ID, timestamp, and IP; exportable "
        "for internal audit.",
    ])

    # RETENTION
    story.append(B.section_header("Original-item retention and destruction",
                                  kicker="Check 21 compliance"))
    story.append(B.callout_box(
        "Required holding period",
        "Cumulus service schedule specifies a 14–30 day holding period "
        "during which the client retains the original paper item in "
        "secure custody. After the holding period, the item must be "
        "destroyed by cross-cut shredder or other commercially "
        "reasonable means; Cumulus recommends documented destruction "
        "logs. Destruction prevents secondary presentment — the most "
        "common RDC-related fraud risk.",
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How quickly are deposited funds available?",
         "Regulation CC typically provides next-business-day availability "
         "for most check deposits with an on-us same-day carve-out up "
         "to $5,525 ($2,225 for longer-term customers). Mid-market and "
         "enterprise clients may qualify for immediate availability on "
         "in-relationship items through their Relationship Manager."),
        ("What if a deposited item is returned?",
         "Returned items (insufficient funds, stop payment, altered) "
         "debit the originating account with a $12 returned-item fee. "
         "Client is responsible for re-presenting through Cumulus or "
         "pursuing independent collection from the maker. A returned "
         "item may be redeposited by RDC; Cumulus recommends a "
         "single redeposit attempt only."),
        ("Can I mobile-deposit a check after RDC-depositing the same item?",
         "No. Duplicate detection flags any check image already "
         "deposited within 180 days across any Cumulus channel — RDC, "
         "mobile, ATM, or teller. The second deposit will be rejected "
         "and both images surfaced for review."),
        ("What scanner should I buy?",
         "For offices depositing 5–20 items per day, the Panini Vision "
         "X I (5 items/minute) or Digital Check TS240 is cost-effective. "
         "For higher volumes (50+ items per day or multi-location "
         "aggregation), the Panini Vision X II (30 ipm) provides "
         "throughput. Your Relationship Manager will recommend based on "
         "volume."),
        ("How long do I keep the original checks?",
         "Per Cumulus service schedule: 14 days for small-business "
         "RDC; 30 days for mid-market and enterprise RDC. During the "
         "holding period, items must be in secure custody (locked "
         "cabinet minimum). After the holding period, commercially "
         "reasonable destruction (cross-cut shredding) is required."),
        ("Can I use RDC for cashier's checks and money orders?",
         "Yes. RDC accepts all legally-deposit-eligible items: "
         "personal checks, business checks, cashier's checks, and "
         "money orders. Traveler's checks, foreign-currency checks, and "
         "foreign-drawn items must be deposited in-branch for proper "
         "handling."),
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
