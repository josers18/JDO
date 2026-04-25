"""Cumulus Cash Rewards Card — retail credit card brochure."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "03_Credit_Cards"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Cash_Rewards_Card.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Cash Rewards Card",
        product_code="CC-CSH-2026.04",
        category="Credit Cards",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Cash Rewards Card",
        lede=("A Visa® Signature card that earns an unlimited 2% back "
              "everywhere and 3% back on groceries, streaming, and "
              "transit — with no annual fee and no foreign transaction fee."),
        summary_rows=[
            ("Card network", "Visa® Signature"),
            ("Annual fee", "$0"),
            ("Base cash back", "2% on every purchase, unlimited"),
            ("Category cash back", "3% groceries, streaming, transit (first $1,500/mo; then 1%)"),
            ("Intro APR", "0% APR on balance transfers for 15 months"),
            ("Regular APR", "18.99% – 28.99% variable"),
            ("Foreign transaction fee", "0.00%"),
            ("Minimum FICO", "690"),
        ],
        category_label="PRODUCT BROCHURE  ·  CREDIT CARDS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus Cash Rewards Card is a Visa Signature credit card "
        "that combines a flat 2% cash back on every purchase with a "
        "boosted 3% rate on three everyday categories: groceries, "
        "streaming subscriptions, and transit (including rideshare, "
        "parking, tolls, and transit passes). There is no annual fee, no "
        "foreign transaction fee, and no penalty APR. New cardholders "
        "can transfer existing balances at 0% APR for 15 billing cycles."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why Cash Rewards"))
    story.append(B.feature_grid([
        ("2% cash back on everything",
         "Earn an unlimited flat 2% cash back on every purchase, every day."),
        ("3% on groceries, streaming, transit",
         "Earn 3% cash back on the first $1,500 in combined spending "
         "across the three categories each month, then 1%."),
        ("No annual fee",
         "$0 annual fee — keep the card at no cost even in low-spend months."),
        ("0% intro APR on balance transfers",
         "Transfer higher-rate balances from other cards at 0% APR for "
         "15 billing cycles (3% balance transfer fee, $5 minimum)."),
        ("No foreign transaction fee",
         "Travel internationally without a 3% currency-conversion markup "
         "on your purchases."),
        ("Visa Signature benefits",
         "Extended warranty, Visa Signature Concierge, Luxury Hotel "
         "Collection, and travel and emergency assistance services."),
    ], cols=2))

    # --------------------------------------------------------------- REWARDS
    story.append(B.section_header("How you earn",
                                  kicker="Rewards structure"))
    story.append(B.data_table(
        header=["Category", "Earn rate", "Cap", "Examples"],
        rows=[
            ["Groceries", "3% cash back",
             "Combined $1,500/mo cap with streaming + transit; then 1%",
             "Supermarkets, specialty food stores, small-format grocery"],
            ["Streaming", "3% cash back",
             "Combined $1,500/mo cap",
             "Video, music, and audiobook subscription services"],
            ["Transit", "3% cash back",
             "Combined $1,500/mo cap",
             "Rideshare, taxis, subway, bus, tolls, parking"],
            ["All other purchases", "2% cash back",
             "Unlimited",
             "Everything else — no category activation required"],
        ],
        col_widths=[1.3 * inch, 1.3 * inch, 2.2 * inch, 2.5 * inch],
    ))

    story.append(Spacer(1, 0.08 * inch))
    story.append(B.sub_header("Rewards illustration"))
    story.append(B.bar_comparison_chart(
        labels=["Groceries (3%)", "Streaming (3%)", "Transit (3%)", "All other (2%)"],
        values=[3.0, 3.0, 3.0, 2.0],
        title="Cumulus Cash Rewards — earn rate by category",
        ylabel="Cash back rate (%)",
        value_fmt=lambda v: f"{v:.1f}%",
    ))

    story.append(B.callout_box(
        "Example — $2,000 monthly spend, average cardholder",
        "A household spending $600 on groceries, $50 on streaming, $150 "
        "on transit, and $1,200 on general purchases earns approximately "
        "$24.00 at 3% plus $24.00 at 2% — $48.00 of cash back per month "
        "or $576 per year. Cash back is redeemable at any amount as a "
        "statement credit, direct deposit to a Cumulus account, or "
        "Cumulus eGift card.",
    ))

    # --------------------------------------------------------------- RATES & FEES
    story.append(B.section_header("Rates and fees",
                                  kicker="Pricing summary"))
    story.append(B.data_table(
        header=["Item", "Detail"],
        rows=[
            ["Annual fee", "$0"],
            ["Purchase APR", "18.99% – 28.99% variable (Prime + 10.99% to + 20.99%)"],
            ["Balance transfer intro APR", "0% APR for 15 billing cycles from account opening"],
            ["Balance transfer APR after intro", "Same as Purchase APR"],
            ["Balance transfer fee", "3% of the transfer amount, $5 minimum"],
            ["Cash advance APR", "29.99% variable (no grace period)"],
            ["Cash advance fee", "5% of the advance amount, $10 minimum"],
            ["Penalty APR", "None — Cumulus does not charge a penalty APR"],
            ["Foreign transaction fee", "0.00%"],
            ["Late payment fee", "Up to $40 (first late payment $30)"],
            ["Returned payment fee", "Up to $40"],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # --------------------------------------------------------------- ELIGIBILITY
    story.append(B.section_header("Eligibility and application",
                                  kicker="Apply today"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who qualifies"),
            *B.bullet_list([
                "U.S. citizens, lawful permanent residents, and qualifying "
                "resident aliens age 18 or older (19 in AL and NE).",
                "Minimum FICO score of 690.",
                "Verifiable income sufficient to meet payment obligations.",
                "No active bankruptcy; discharged Chapter 7 bankruptcies "
                "48+ months old may be eligible.",
                "Existing Cumulus Bank deposit or investment relationship "
                "is helpful but not required.",
            ]),
        ],
        right_flowables=[
            B.sub_header("How to apply"),
            *B.bullet_list([
                "Apply online at cumulusbank.com, in the Cumulus app, or "
                "at any branch.",
                "Pre-qualify with a soft credit inquiry — no impact on "
                "your credit score.",
                "Most applications receive a decision in 60 seconds.",
                "Your card is provisioned digitally to Apple Pay, Google "
                "Pay, and Samsung Pay the moment the account opens.",
                "Physical card delivered in 5–7 business days.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="Your rights as a cardholder"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["Truth in Lending Act (Regulation Z)",
             "APR, fees, and terms disclosed in the Schumer Box on your "
             "application and in your Cardmember Agreement."],
            ["Credit CARD Act of 2009",
             "45-day advance notice of significant changes; no APR "
             "increases on existing balances absent 60-day delinquency; "
             "payment-allocation rules above minimum."],
            ["Fair Credit Billing Act",
             "60-day window to dispute billing errors and unauthorized "
             "charges. $0 liability for unauthorized transactions."],
            ["Visa Zero Liability",
             "No cardholder liability for unauthorized transactions "
             "reported promptly."],
            ["Equal Credit Opportunity Act (Regulation B)",
             "Prohibits discrimination; adverse action notices within 30 days."],
            ["Fair Credit Reporting Act",
             "Disputes investigated within 30 days. Adverse-action "
             "notices include the bureau used."],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Does the 3% bonus apply to online grocery orders?",
         "Yes. Merchants classified by Visa under grocery-store merchant "
         "categories earn 3% — including most major online grocery services "
         "that bill as grocery. Warehouse clubs and superstores (e.g., "
         "mass retailers) generally do not qualify under this category."),
        ("How do I redeem cash back?",
         "Cash back is available for redemption as soon as it posts. "
         "Redeem at any amount as a statement credit, a direct deposit to "
         "any Cumulus deposit account, or a Cumulus eGift card. There is "
         "no minimum and no expiration while your account is open."),
        ("What does \"no penalty APR\" mean?",
         "Unlike some issuers, Cumulus does not raise your APR if you "
         "make a late payment. Late fees still apply, but your rate on "
         "existing and new purchases remains at your standard APR."),
        ("Can I transfer a balance from my other credit card?",
         "Yes. You can request balance transfers at application or any "
         "time thereafter in the Cumulus app. New-account balance "
         "transfers made within 60 days of account opening qualify for "
         "the 0% APR intro rate for 15 billing cycles."),
        ("Does this card build credit?",
         "Yes. Cumulus reports your account and on-time payments to all "
         "three major credit bureaus each month. Responsible use — "
         "keeping your balance below 30% of your credit line and paying "
         "in full each cycle — helps build and maintain a strong score."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    # --------------------------------------------------------------- DISCLOSURES
    story += B.disclosure_block(
        "Important disclosures",
        B.STANDARD_CARD_DISCLOSURES + [
            "The 3% cash back rate applies to the first $1,500 in combined "
            "eligible purchases across the grocery, streaming, and transit "
            "categories each billing cycle. Purchases above the cap earn "
            "1%. The cap resets at the start of each cycle.",
            "Category eligibility is determined by the merchant category "
            "code (MCC) assigned by the merchant's payment processor. "
            "Cumulus cannot recategorize a transaction if the merchant has "
            "selected an incorrect MCC.",
            "Visa® and the Visa Signature brand are registered trademarks "
            "of Visa International Service Association and used under license.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
