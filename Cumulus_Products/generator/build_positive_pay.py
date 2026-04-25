"""Cumulus Positive Pay — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Positive_Pay.pdf")

TREASURY_DISCLOSURES = [
    "Positive Pay services are provided by Cumulus Bank, N.A. under the "
    "Treasury Services Master Agreement and applicable service schedule. "
    "Positive Pay mitigates but does not eliminate check and ACH fraud "
    "risk. Liability for unauthorized or altered items is governed by "
    "UCC Articles 3 and 4, the Cumulus Business Deposit Agreement, and "
    "applicable service terms.",
    "Issuance-file submission and exception review deadlines are "
    "mandatory. Items unresolved by the 11:00 a.m. ET exception deadline "
    "default to the client's pre-selected default action (pay or return) "
    "under the service schedule.",
    "Payee Match depends on OCR accuracy; fuzzy-match thresholds are "
    "configurable at setup and reviewed regularly. OCR limitations are "
    "inherent — high-contrast, typewritten payee names produce the best "
    "match rates; handwritten or cursive payees are not reliably matched.",
    "ACH Positive Pay requires a complete authorized-originator list "
    "with SEC codes, amount caps, and frequency limits. Changes to the "
    "list must be submitted through Business Online or the Cumulus "
    "Treasury Administration team.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Positive Pay",
        product_code="TM-POS-PAY-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="Positive Pay",
        lede=("Check and ACH fraud-prevention service with payee-match, "
              "daily exception review, and pay-or-return defaults — "
              "integrated with Business Online for straightforward "
              "exception resolution."),
        summary_rows=[
            ("Services", "Check Positive Pay  ·  Payee Match  ·  ACH Positive Pay"),
            ("Exception deadline", "11:00 a.m. ET daily"),
            ("Default action", "Pay or return — client-configurable"),
            ("Pricing", "$35 / month + $0.05 / item"),
            ("Issuance file formats", "CSV  ·  XML  ·  ISO 20022 pain.002  ·  manual entry"),
            ("Decision channel", "Business Online dashboard + mobile"),
            ("Reverse Positive Pay", "Available as alternative structure"),
            ("ACH filter options", "Block  ·  allow-list  ·  amount caps  ·  SEC codes"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Positive Pay compares each check and ACH debit "
        "presented for payment against an authorized issuance file (for "
        "checks) or an authorized-originator list (for ACH). Items that "
        "match — by check number, amount, and optionally payee name — "
        "pay without intervention. Items that do not match are "
        "'exceptions' and are presented to the client each business day "
        "for a pay or return decision. Positive Pay is the most effective "
        "single control against counterfeit check fraud, check alteration, "
        "and unauthorized ACH debits; Cumulus recommends it for every "
        "business that issues checks or receives ACH debits."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why Positive Pay"))
    story.append(B.feature_grid([
        ("Counterfeit and alteration protection",
         "Check Positive Pay identifies items that do not match issued "
         "check number or amount — stopping counterfeits and alterations "
         "before they post."),
        ("Payee Match for enhanced control",
         "OCR-based payee comparison flags items where the payee name on "
         "the check does not match the issued payee — catching forged or "
         "altered-payee fraud."),
        ("ACH filter and block",
         "ACH Positive Pay blocks all ACH debits by default; pre-"
         "authorized originators with SEC-code, amount, and frequency "
         "controls are permitted."),
        ("Exception review in Business Online",
         "Daily exception dashboard with check images, prior-issued "
         "comparison, and one-click pay / return decisions."),
        ("Insurance policy alignment",
         "Many commercial crime / cyber insurance policies require "
         "Positive Pay as a condition of coverage for check and ACH "
         "fraud; Cumulus provides AOC-equivalent documentation."),
        ("Mobile exception review",
         "Exception decisions available via the Cumulus Business Mobile "
         "app; push notifications at exception-file post so no exception "
         "is missed."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # HOW IT WORKS
    story.append(B.section_header("How Check Positive Pay works",
                                  kicker="Daily cycle"))
    story.append(B.data_table(
        header=["Step", "Activity", "Timing / Cut-off (ET)"],
        rows=[
            ["1  ·  Issuance file",
             "Client submits issuance file to Cumulus whenever checks "
             "are issued — via CSV, XML, ISO 20022 pain.002, Business "
             "Online upload, or direct ERP integration.",
             "Any time prior to check presentment"],
            ["2  ·  Presentment",
             "Checks present for payment through paper clearing, Day-1 "
             "ACH image exchange, or check-image deposit.",
             "Continuous"],
            ["3  ·  Match",
             "Cumulus matches each presented check against the issuance "
             "file on check number, amount, and (if enabled) payee name.",
             "Real-time"],
            ["4  ·  Exception file",
             "Non-matching items post to the Business Online exception "
             "dashboard by 7:00 a.m. ET each business day.",
             "7:00 a.m."],
            ["5  ·  Decision",
             "Client reviews exceptions with check images; decides pay "
             "or return on each.",
             "Before 11:00 a.m."],
            ["6  ·  Default",
             "Items without a decision at 11:00 a.m. default to the "
             "client's pre-selected action (pay or return).",
             "11:00 a.m."],
            ["7  ·  Post",
             "Paid items post to the account; returned items dispute-"
             "coded as 'Refer to Maker' and return to the depositing bank.",
             "Same day"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # PRICING
    story.append(B.section_header("Pricing",
                                  kicker="Service fees"))
    story.append(B.data_table(
        header=["Service", "Amount"],
        rows=[
            ["Check Positive Pay — monthly account fee", "$35 / account / month"],
            ["Check Positive Pay — per-item fee",
             "$0.05 per presented check"],
            ["Payee Match — monthly account fee",
             "$15 / account / month (add-on to Check Positive Pay)"],
            ["ACH Positive Pay — monthly account fee",
             "$25 / account / month"],
            ["ACH Positive Pay — per-item fee",
             "$0.05 per presented ACH debit"],
            ["Reverse Positive Pay (alternative)",
             "$25 / account / month + $0.05 / item"],
            ["Issuance-file fee",
             "No charge for standard channels"],
            ["Exception return",
             "$0.00 (included)"],
            ["Manual issuance (per-check data entry in Business Online)",
             "$0.25 per entry"],
        ],
        col_widths=[4.4 * inch, 2.9 * inch],
    ))

    # SERVICE COMPARISON CHART
    story.append(B.section_header("Service fee breakdown",
                                  kicker="Where your fee goes"))
    story.append(B.body_para(
        "The chart below illustrates a representative monthly Positive "
        "Pay cost allocation for a client with two operating accounts, "
        "Payee Match, ACH Positive Pay, and 1,000 total items presented "
        "per month. Platform fees dominate fixed cost; per-item fees "
        "scale with activity."
    ))
    story.append(B.donut_chart(
        labels=["Check PP monthly", "Payee Match monthly",
                "ACH PP monthly", "Check per-item", "ACH per-item"],
        values=[30, 13, 22, 25, 10],
        title="Typical monthly Positive Pay cost composition (2 accounts)",
        center_text="Protection",
    ))

    # ACH PP
    story.append(B.section_header("ACH Positive Pay",
                                  kicker="Block + authorize"))
    story.append(B.body_para(
        "ACH Positive Pay defaults to blocking all ACH debits on the "
        "account unless the originator is explicitly authorized. "
        "Authorization can be by Originator ID (full trust), Originator + "
        "SEC Code, Originator + Amount Cap, Originator + Frequency (e.g., "
        "monthly only). Blocked or non-matching items post to the "
        "exception dashboard for same-day pay-or-return decision — "
        "subject to the same 11:00 a.m. deadline as Check Positive Pay."
    ))
    story.append(B.data_table(
        header=["Authorized originator field", "Configuration"],
        rows=[
            ["Originator ID",
             "The 10-digit company identification number from the ACH "
             "addenda (immediately identifies the originator)."],
            ["Originator name (descriptive)",
             "The originator's descriptive name from the ACH file "
             "header — useful for human review but not used for matching."],
            ["SEC code restriction",
             "Permit only specific SEC codes (e.g., CCD only, not WEB)."],
            ["Amount cap",
             "Maximum per-transaction amount for this originator."],
            ["Frequency limit",
             "Maximum number of debits per day / week / month."],
            ["Effective date range",
             "Authorization valid for a specified date range (e.g., "
             "expiring at contract end)."],
        ],
        col_widths=[2.2 * inch, 5.1 * inch],
    ))

    # INTEGRATIONS
    story.append(B.section_header("Integration options",
                                  kicker="ERP and AP systems"))
    story += B.bullet_list([
        "<b>Direct ERP integration</b> — issuance file produced "
        "automatically from SAP, Oracle, NetSuite, Sage Intacct, Workday, "
        "and Microsoft Dynamics — delivered via SFTP, REST API, or "
        "direct-transmission channel.",
        "<b>AP-system integration</b> — Coupa, Ariba, Bill.com, and "
        "other AP platforms produce Positive Pay issuance files as part "
        "of the payment-run workflow.",
        "<b>Business Online upload</b> — CSV, XML, or ISO 20022 pain.002 "
        "file uploaded by Treasury operator with automated schema "
        "validation.",
        "<b>Manual entry</b> — for low-volume clients issuing fewer than "
        "10 checks per day; includes in-Business-Online check-issuance "
        "workflow.",
        "<b>ISO 20022 native</b> — pain.002 issuance file with structured "
        "payee, amount, and remittance-reference data.",
    ])

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("What's the difference between Positive Pay and Reverse Positive Pay?",
         "Positive Pay compares every presented check to an issuance "
         "file and flags non-matching items. Reverse Positive Pay "
         "presents all paid checks back to the client for next-day "
         "review (without the client supplying an issuance file). "
         "Positive Pay is the stronger control; Reverse is a fallback "
         "for clients that cannot reliably produce issuance files."),
        ("How does Payee Match work?",
         "OCR software reads the payee name from the check image and "
         "compares it to the payee on the issuance file. Fuzzy-match "
         "logic tolerates minor OCR errors (whitespace, punctuation, "
         "stylized printing). Matches above the configured threshold pay "
         "automatically; below-threshold items appear as exceptions."),
        ("What if I miss the 11:00 a.m. deadline?",
         "Items without a decision by 11:00 a.m. ET default to your "
         "pre-selected action (pay or return) recorded on the service "
         "schedule. Most clients select 'return' as the default — "
         "consistent with a security-first policy — and override to 'pay' "
         "on known-good items. Emergency extension requests may be "
         "accommodated by contacting the Cumulus Treasury Services desk."),
        ("Can I use Positive Pay on accounts at other banks?",
         "No. Positive Pay is a Cumulus service on Cumulus-issued checks "
         "and Cumulus-held accounts. Moving your primary operating "
         "accounts to Cumulus is the first step to enabling Positive Pay "
         "protection."),
        ("Do I need Positive Pay if I use electronic payments?",
         "ACH Positive Pay is still essential if you receive ACH debits "
         "(e.g., for recurring supplier drafts, utility auto-pay, or "
         "insurance premiums). Business-email-compromise attacks "
         "increasingly create unauthorized ACH debit attempts, not just "
         "check fraud. Most insurers now require both Check and ACH "
         "Positive Pay for full fraud coverage."),
        ("What's the UCC implication of using Positive Pay?",
         "Under UCC § 4-406, a bank's exercise of ordinary care combined "
         "with the customer's use of Positive Pay generally shifts "
         "responsibility for unauthorized items: if you use Positive "
         "Pay, properly review exceptions, and items posts that you did "
         "not authorize, the bank typically bears the loss. If you "
         "decline Positive Pay, courts have held the customer bears "
         "greater responsibility."),
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
