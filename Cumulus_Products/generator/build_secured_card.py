"""Cumulus Secured Card — retail credit card brochure (3–4 pages per spec)."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Secured_Card.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Secured Card",
        product_code="CC-SEC-2026.04",
        category="Credit Cards",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Secured Card",
        lede=("A Visa® secured credit card designed to help clients "
              "build or rebuild credit — with a refundable deposit, no "
              "annual fee, and an automatic review for graduation to "
              "an unsecured card."),
        summary_rows=[
            ("Card network", "Visa®"),
            ("Annual fee", "$0"),
            ("Credit line", "Equal to your refundable security deposit ($200 – $2,500)"),
            ("Refundable deposit", "$200 minimum, $2,500 maximum"),
            ("Purchase APR", "24.99% APR fixed"),
            ("Graduation review", "Automatic after 8 months of on-time payments"),
            ("Reports to bureaus", "Equifax, Experian, TransUnion (monthly)"),
            ("Foreign transaction fee", "3%"),
        ],
        category_label="PRODUCT BROCHURE  ·  CREDIT CARDS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus Secured Card is a credit-building tool for clients "
        "who are establishing credit for the first time or rebuilding "
        "after a setback. It works like a standard credit card — you "
        "make purchases and pay the balance — but is secured by a "
        "refundable cash deposit that equals your credit line. On-time "
        "payments are reported monthly to all three major credit "
        "bureaus, building your credit history over time. After 8 "
        "months of on-time payments, Cumulus automatically reviews your "
        "account for potential graduation to an unsecured Cumulus credit "
        "card — at which point your deposit is returned."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why the Secured Card"))
    story.append(B.feature_grid([
        ("No annual fee",
         "The Cumulus Secured Card has no annual fee — many secured cards "
         "charge $25 – $35 per year."),
        ("Deposit is refundable",
         "Your security deposit is fully refundable. Close your account "
         "in good standing and your deposit is returned in full; graduate "
         "to unsecured and your deposit is returned automatically."),
        ("Reports to all three bureaus",
         "Account activity is reported monthly to Equifax, Experian, and "
         "TransUnion — so responsible use helps build your credit history."),
        ("Path to unsecured",
         "Cumulus automatically reviews your account for graduation to an "
         "unsecured credit card after 8 months of on-time payments."),
        ("Visa-accepted everywhere",
         "Use your card at millions of merchants worldwide. Set up Apple "
         "Pay, Google Pay, and Samsung Pay at account opening."),
        ("Support from Cumulus",
         "Access free credit-education tools and your FICO® Score "
         "monthly in the Cumulus app."),
    ], cols=2))

    # --------------------------------------------------------------- DEPOSIT / APR
    story.append(B.section_header("Deposit and credit line",
                                  kicker="How your line is set"))
    story.append(B.body_para(
        "Your credit line is equal to your refundable security deposit. "
        "Choose any amount between $200 and $2,500 at account opening. "
        "A higher deposit gives you a higher credit line and lower "
        "credit-utilization ratio, which can support faster credit score "
        "improvement. Your deposit is held in an FDIC-insured Cumulus "
        "deposit account and earns no interest while pledged."
    ))

    story.append(B.data_table(
        header=["Deposit", "Credit line", "Typical first-month payment at 30% utilization"],
        rows=[
            ["$200", "$200", "$60"],
            ["$500", "$500", "$150"],
            ["$1,000", "$1,000", "$300"],
            ["$2,000", "$2,000", "$600"],
            ["$2,500", "$2,500", "$750"],
        ],
        col_widths=[1.7 * inch, 1.7 * inch, 3.9 * inch],
    ))

    story.append(Spacer(1, 0.08 * inch))
    story.append(B.sub_header("APR illustration — Cumulus Secured vs. Prime Rate"))
    story.append(B.bar_comparison_chart(
        labels=["Prime Rate", "Cash Rewards (best)", "Travel Points (best)", "Secured Card"],
        values=[8.00, 18.99, 19.99, 24.99],
        title="Cumulus card APRs at effective date — the Secured Card's fixed rate",
        ylabel="APR (%)",
    ))

    story.append(B.callout_box(
        "How to use the card to build credit fastest",
        "Keep your credit utilization low — ideally under 30% of your "
        "credit line each cycle. Pay your statement balance in full and "
        "on time every month. Use the card for small recurring charges "
        "(like a subscription) with autopay set to the full balance, so "
        "you build a consistent on-time payment history without ever "
        "risking a late payment.",
    ))

    # --------------------------------------------------------------- RATES & FEES
    story.append(B.section_header("Rates and fees",
                                  kicker="Pricing summary"))
    story.append(B.data_table(
        header=["Item", "Detail"],
        rows=[
            ["Annual fee", "$0"],
            ["Purchase APR", "24.99% APR fixed"],
            ["Balance transfer APR", "24.99% APR fixed"],
            ["Balance transfer fee", "3% of the transfer amount, $5 minimum"],
            ["Cash advance APR", "29.99% fixed (no grace period)"],
            ["Cash advance fee", "5% of the advance amount, $10 minimum"],
            ["Penalty APR", "None"],
            ["Foreign transaction fee", "3%"],
            ["Late payment fee", "Up to $40 (first late payment $30)"],
            ["Returned payment fee", "Up to $40"],
            ["Refundable security deposit", "$200 – $2,500"],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
    ))

    # --------------------------------------------------------------- GRADUATION
    story.append(B.section_header("The path to unsecured",
                                  kicker="Graduation review"))
    story.append(B.data_table(
        header=["Month", "What happens"],
        rows=[
            ["1 – 7",
             "Make purchases, pay on time and in full. Cumulus reports "
             "account activity to all three major credit bureaus each month."],
            ["8",
             "Cumulus automatically reviews your account. If you have made "
             "your last 8 payments on time, have kept your credit "
             "utilization under 80%, and meet standard underwriting, "
             "you'll be offered graduation to an unsecured Cumulus credit card."],
            ["Graduation",
             "Your security deposit is released (typically within 10 "
             "business days) to the deposit account on file. Your credit "
             "line may be increased based on income verified at graduation."],
            ["Not yet eligible",
             "If graduation is not yet available, Cumulus will reattempt "
             "the review every 3 months. You may also request additional "
             "deposit at any time to increase your line."],
        ],
        col_widths=[1.5 * inch, 5.8 * inch],
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
                "No minimum FICO score required; applicants with thin or "
                "damaged credit are welcome.",
                "Verifiable income sufficient to make at least the minimum payment.",
                "Not currently in active Chapter 7 or Chapter 13 bankruptcy.",
                "Able to fund a refundable security deposit of at least $200.",
            ]),
        ],
        right_flowables=[
            B.sub_header("How to apply"),
            *B.bullet_list([
                "Apply online, in the Cumulus app, or at any branch.",
                "Fund your security deposit by ACH from any bank account "
                "or by transfer from a Cumulus deposit account.",
                "Most applications receive a decision within 60 seconds.",
                "Physical card delivered in 5–7 business days.",
                "Digital wallet provisioning at account opening.",
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
             "APR, fees, and terms disclosed in the Schumer Box and your "
             "Cardmember Agreement at account opening."],
            ["Credit CARD Act of 2009",
             "45-day advance notice of significant changes; limits on fees "
             "during the first year of account opening; payment-allocation rules."],
            ["Fair Credit Billing Act",
             "60-day window to dispute billing errors and unauthorized charges. "
             "$0 cardholder liability for unauthorized transactions."],
            ["Fair Credit Reporting Act",
             "Disputes with credit bureaus investigated within 30 days. "
             "Cumulus reports accurate, up-to-date account information."],
            ["Equal Credit Opportunity Act (Regulation B)",
             "Prohibits discrimination on prohibited bases; adverse-action "
             "notices provided within 30 days."],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Is my deposit safe?",
         "Yes. Your refundable security deposit is held in an FDIC-insured "
         "Cumulus deposit account in your name and pledged as security for "
         "your credit line. It is returned to you when you graduate to an "
         "unsecured card or close your account in good standing."),
        ("Does the deposit earn interest?",
         "No. The security deposit is pledged and does not earn interest "
         "while securing the card."),
        ("How long until my credit improves?",
         "Most cardholders see meaningful credit-score improvement within "
         "6–12 months of consistent on-time payments and low utilization. "
         "Every credit profile is different; Cumulus provides your FICO® "
         "Score monthly in the app so you can track your progress."),
        ("Can I increase my credit line?",
         "Yes. You may add to your deposit at any time (up to the $2,500 "
         "maximum) and your credit line will be increased correspondingly. "
         "After graduation to an unsecured card, credit line increases "
         "are evaluated through standard underwriting."),
        ("What happens to my deposit if I close the account?",
         "If you close your account in good standing (no past-due balance), "
         "your refundable deposit is returned within 10 business days of "
         "the final statement. If there is a past-due balance, Cumulus "
         "applies the deposit to the outstanding balance first and refunds "
         "any remainder."),
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
            "The security deposit is pledged as collateral for your "
            "credit line. Cumulus may apply the deposit against any "
            "past-due balance, finance charges, or fees at any time, "
            "including at account closure.",
            "Automatic graduation review is a feature of the account, "
            "not a guarantee. Graduation is subject to payment history, "
            "credit utilization, income verification, and Cumulus "
            "underwriting criteria at the time of review.",
            "Visa® and the Visa brand mark are registered trademarks of "
            "Visa International Service Association and used under license.",
            "FICO® is a registered trademark of Fair Isaac Corporation.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
