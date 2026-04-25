"""Cumulus Corporate Cards — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Corporate_Cards.pdf")

TREASURY_DISCLOSURES = [
    "Corporate Cards are Visa® Corporate credit products issued by "
    "Cumulus Bank, N.A. pursuant to license from Visa U.S.A. Inc. "
    "Cards are issued to employees of corporate customers under a "
    "Commercial Card Program Agreement and are not consumer credit.",
    "Commercial credit is not subject to the Truth in Lending Act, the "
    "CARD Act, or Regulation Z, except to the extent specifically made "
    "applicable. Liability for employee-card transactions is "
    "negotiated in the Commercial Card Program Agreement (individual, "
    "joint, or corporate liability).",
    "Rewards and rebates are governed by the Commercial Rewards Program "
    "Terms and are subject to change with notice. Rewards accrue on "
    "eligible purchases; cash advances, balance transfers, fees, and "
    "quasi-cash transactions are not eligible.",
    "Virtual Card Account (VCA) functionality is enabled through the "
    "Cumulus Commercial Card Gateway; supplier enablement is a joint "
    "responsibility between the client and Cumulus and does not "
    "guarantee acceptance by every supplier.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Corporate Cards",
        product_code="TM-CRD-COR-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="Corporate Cards",
        lede=("Visa® Corporate cards for travel, entertainment, and "
              "general business spend — with individual or company "
              "billing, virtual card accounts, merchant-category controls, "
              "and points earning on every purchase."),
        summary_rows=[
            ("Card product", "Visa® Corporate  ·  Visa® Corporate T&E"),
            ("Billing models", "Individual bill / individual pay  ·  Company bill / company pay"),
            ("Liability", "Corporate  ·  joint and several  ·  individual"),
            ("Rewards", "1.5 pts/$ standard  ·  2 pts/$ on travel + dining (premium)"),
            ("Annual fee", "$95 per card  ·  waived at 25+ cards"),
            ("Virtual cards", "Single-use and recurring VCAs"),
            ("Controls", "MCC restrictions  ·  velocity limits  ·  spend alerts"),
            ("Integrations", "SAP Concur  ·  Expensify  ·  Ariba  ·  Coupa"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Corporate Cards deliver a flexible commercial-payment "
        "platform for mid-market and enterprise clients. Program design "
        "is driven by three choices: card type (standard T&E, "
        "premium-travel, or virtual card accounts for AP automation); "
        "billing model (individual-bill / individual-pay, individual-bill "
        "/ company-pay, or company-bill / company-pay); and liability "
        "assignment (corporate-only, joint-and-several, or individual). "
        "Cumulus pairs the program with merchant-category controls, "
        "velocity limits, spend alerts, and expense-management "
        "integrations to deliver expense visibility, policy enforcement, "
        "and rebate economics at scale."
    ))

    story.append(B.section_header("Program architecture",
                                  kicker="Configure to your policy"))
    story.append(B.feature_grid([
        ("Individual bill / individual pay",
         "Cardholders receive and pay their own statements; company "
         "reimburses via an expense report. Preferred for decentralized "
         "programs and when rewards accrue to cardholders."),
        ("Individual bill / company pay",
         "Cardholders submit expenses; Cumulus debits the company master "
         "account for approved spend. Balances rolling-forward at "
         "cardholder level for visibility."),
        ("Company bill / company pay",
         "Full corporate liability; all charges post to the company "
         "master account. Preferred for T&E and when centralized AP "
         "controls and rebate consolidation are priorities."),
        ("Virtual Card Accounts (VCAs)",
         "Tokenized card numbers issued on demand via API or Gateway. "
         "Single-use VCAs for one-off supplier payments; recurring VCAs "
         "for subscription and recurring vendor spend; ghost cards for "
         "departmental procurement."),
        ("Merchant-category controls",
         "Whitelist / blacklist MCCs at the program or cardholder level; "
         "typical restrictions include cash-advance, gambling, and "
         "non-policy categories."),
        ("Velocity and amount limits",
         "Per-transaction, daily, weekly, and monthly limits per "
         "cardholder; auto-freeze on velocity breach or policy exception."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # REWARDS
    story.append(B.section_header("Rewards and rebates",
                                  kicker="Program economics"))
    story.append(B.body_para(
        "Cumulus Corporate Cards earn rewards or rebates at the program "
        "level (default) or at the cardholder level (on individual-bill "
        "programs). Rebates are tiered against annual billed spend and "
        "DSO; programs with strong DSO discipline (below 25 days from "
        "statement date) qualify for top-tier rebates."
    ))
    story.append(B.data_table(
        header=["Tier (annual card spend)", "Base rebate",
                "Premium-card category bonus", "Virtual-card bonus"],
        rows=[
            ["< $500K", "0.00%", "—", "—"],
            ["$500K – $1M", "0.50%", "+0.25% travel+dining", "—"],
            ["$1M – $3M", "0.85%", "+0.50% travel+dining", "+0.15%"],
            ["$3M – $10M", "1.05%", "+0.50% travel+dining", "+0.20%"],
            ["$10M – $25M", "1.20%", "+0.50% travel+dining", "+0.25%"],
            ["$25M+", "1.35%", "+0.50% travel+dining",
             "+0.30% (10 Day DSO)"],
        ],
        col_widths=[1.9 * inch, 1.3 * inch, 2.2 * inch, 1.9 * inch],
    ))

    # REBATE CHART
    story.append(B.section_header("Rebate tiers — base visualization",
                                  kicker="Annual reward economics"))
    story.append(B.bar_comparison_chart(
        labels=["< $500K", "$500K–$1M", "$1M–$3M",
                "$3M–$10M", "$10M–$25M", "$25M+"],
        values=[0.00, 0.50, 0.85, 1.05, 1.20, 1.35],
        title="Corporate-card base rebate by annual card spend",
        ylabel="Base rebate (%)",
        value_fmt=lambda v: f"{v:.2f}%",
    ))

    # FEES
    story.append(B.section_header("Fees and terms",
                                  kicker="Pricing"))
    story.append(B.data_table(
        header=["Fee / term", "Amount", "Notes"],
        rows=[
            ["Annual card fee — standard",
             "$95 / card", "Waived at 25+ cards"],
            ["Annual card fee — premium",
             "$250 / card", "Premium travel card with elevated rewards"],
            ["Foreign transaction fee",
             "0% on standard  ·  0% on premium", "No FX markup"],
            ["Cash advance fee",
             "5% of advance  ·  $10 minimum",
             "Program typically restricts cash advances"],
            ["Late payment fee",
             "$39",
             "Waived for first violation per year"],
            ["Replacement card",
             "$0 domestic  ·  $50 international express", ""],
            ["Program setup",
             "$2,500 – $15,000 depending on complexity",
             "Implementation, configuration, training"],
            ["Virtual card issuance",
             "$0.10 / VCA issued", "Via Gateway or API"],
            ["APR (for revolving balances, where applicable)",
             "Prime + 10.99% (WSJ)",
             "Corporate programs typically operate no-revolving"],
        ],
        col_widths=[2.4 * inch, 2.0 * inch, 2.9 * inch],
    ))

    # CONTROLS
    story.append(B.section_header("Controls and reporting",
                                  kicker="Program management"))
    story.append(B.data_table(
        header=["Capability", "Details"],
        rows=[
            ["Merchant-Category Code (MCC) controls",
             "Whitelist / blacklist by cardholder, department, or "
             "program. Typical restrictions: cash advance, gambling, "
             "quasi-cash, entertainment (non-policy)."],
            ["Limit controls",
             "Per-transaction, daily, weekly, monthly, and cycle limits "
             "per cardholder. Program-level cascading limits."],
            ["Spend alerts",
             "Real-time alerts by email and SMS on any configurable "
             "event: single transaction > $X, daily total > $X, declined "
             "transaction, card-not-present."],
            ["Dispute management",
             "Cardholder self-service dispute via Cumulus Card Portal; "
             "status tracking and compelling-evidence upload."],
            ["Reporting",
             "Transaction file (BAI2, camt.053, CSV, PDF), MCC analytics, "
             "merchant analytics, and policy-compliance reporting via "
             "Cumulus Card Management Portal."],
            ["Expense-system integration",
             "Direct connectors for SAP Concur, Expensify, Emburse, "
             "Ramp, Certify; flat-file export for any platform."],
            ["Liability assignment",
             "Corporate, joint-and-several, or individual. Set at program "
             "level; may be amended with notice."],
            ["Chip + contactless + digital wallets",
             "EMV chip with NFC tap-to-pay; Apple Pay, Google Pay, "
             "Samsung Pay supported at enrollment."],
        ],
        col_widths=[2.1 * inch, 5.2 * inch],
    ))

    # VCA
    story.append(B.section_header("Virtual Card Accounts (VCAs)",
                                  kicker="AP automation"))
    story.append(B.body_para(
        "Virtual Card Accounts are tokenized 16-digit card numbers "
        "issued on demand for discrete supplier payments, subscriptions, "
        "or department procurement. VCAs carry configurable controls — "
        "amount limit, expiration date, MCC restriction, and "
        "single-use flag — reducing fraud exposure and streamlining AP "
        "workflow. Cumulus pairs VCAs with a Supplier Enablement program "
        "to onboard strategic suppliers into card acceptance, typically "
        "capturing 0.50%–1.00% rebate on the converted spend."
    ))
    story.append(B.data_table(
        header=["VCA type", "Use case", "Controls"],
        rows=[
            ["Single-use",
             "One invoice payment, one authorization",
             "Auto-expire after authorization; amount-matched"],
            ["Recurring",
             "Subscription, monthly supplier, fixed-cadence",
             "Amount cap, velocity, expiration"],
            ["Ghost card (departmental)",
             "Centralized procurement (travel desk, marketing)",
             "Multi-user; cost-center-tagged"],
            ["Lodged card (travel)",
             "Stored with travel agency or hotel for corporate T&E "
             "booking",
             "Booking-type restricted"],
            ["API-issued (strategic)",
             "Via AP-platform integration (e.g., Coupa, Ariba)",
             "Policy-embedded, auto-reconciled"],
        ],
        col_widths=[1.6 * inch, 3.1 * inch, 2.6 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Which liability model should I choose?",
         "Choose corporate liability when the company wishes to retain "
         "all transaction risk and does not require employees to pay "
         "personal cards. Choose individual liability when employees "
         "cover their own charges and submit for reimbursement. "
         "Joint-and-several is a middle ground used when the company "
         "wants protection but places some pay-discipline responsibility "
         "on the cardholder."),
        ("How do virtual cards improve AP?",
         "VCAs eliminate check and ACH issuance for supplier payments, "
         "earn rebate on the spend, reduce fraud exposure through "
         "single-use tokenization, and provide clean transaction data "
         "for reconciliation. Typical AP transformation reduces "
         "check-issuance volume by 50%+ within 12 months."),
        ("Can we integrate with our expense-management platform?",
         "Yes. Cumulus is certified with SAP Concur, Expensify, Emburse, "
         "Ramp, and Certify, with a standard file-export format for "
         "any other platform. Integrations deliver transaction "
         "auto-categorization, receipt matching, and expense-report "
         "seeding."),
        ("What happens when a cardholder leaves the company?",
         "Program administrators disable the card immediately via the "
         "Cumulus Card Management Portal (or by API). Transactions "
         "posted after disablement are declined. Cumulus recommends a "
         "card-recovery workflow as part of standard offboarding; "
         "unpaid charges on individual-liability programs remain the "
         "cardholder's obligation."),
        ("Are rewards taxable?",
         "Under current IRS guidance, rewards earned on business "
         "purchases are generally treated as rebates (a reduction of the "
         "purchase price) and not taxable income. Rewards earned on "
         "individual-liability programs where the individual retains the "
         "rebate may have different treatment. Consult your tax advisor."),
        ("How quickly can a program be implemented?",
         "Standard corporate-card programs deploy in 30–45 days from "
         "signed agreement. Complex programs with custom controls, "
         "multi-currency, or ERP / AP-platform integrations run 60–90 "
         "days. Pilot cards can be issued within 10 business days to "
         "test workflow."),
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
