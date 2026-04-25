"""Cumulus Travel Points Card — retail credit card brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Travel_Points_Card.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Travel Points Card",
        product_code="CC-TRV-2026.04",
        category="Credit Cards",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Travel Points Card",
        lede=("A Mastercard® World Elite travel card with 3x points on "
              "travel, a 60,000-point welcome bonus, a $300 annual travel "
              "credit, and Priority Pass lounge access."),
        summary_rows=[
            ("Card network", "Mastercard® World Elite"),
            ("Annual fee", "$95 — waived the first year"),
            ("Welcome bonus", "60,000 points after $4,000 spend in 90 days"),
            ("Points earn", "3x travel · 2x dining + streaming · 1x everything else"),
            ("Annual travel credit", "$300"),
            ("Priority Pass visits", "4 per membership year"),
            ("Regular APR", "19.99% – 27.99% variable"),
            ("Minimum FICO", "720"),
        ],
        category_label="PRODUCT BROCHURE  ·  CREDIT CARDS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus Travel Points Card is a Mastercard World Elite "
        "credit card for frequent travelers who want earning power on "
        "travel and dining, a full suite of travel protections, and "
        "airport lounge access. The card earns 3x points per dollar on "
        "travel (including air, hotel, car, rail, and cruise), 2x on "
        "dining and streaming services, and 1x on everything else. "
        "Points can be redeemed at 1 cent each for statement credit, "
        "used for travel bookings at enhanced value, or transferred to "
        "Cumulus's 14 airline and hotel transfer partners."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why Travel Points"))
    story.append(B.feature_grid([
        ("60,000-point welcome bonus",
         "Earn 60,000 points after you spend $4,000 on purchases in the "
         "first 90 days — worth up to $900 toward travel at elevated redemption."),
        ("3x points on travel",
         "3 points per dollar on a broad travel category: airlines, "
         "hotels, rental cars, rail, cruises, and online travel agencies."),
        ("2x dining and streaming",
         "Earn 2x points at restaurants worldwide and on streaming "
         "subscription services."),
        ("$300 annual travel credit",
         "Up to $300 in statement credits per membership year toward "
         "airline tickets, hotels, rental cars, rail, and cruises."),
        ("Priority Pass Select",
         "4 complimentary visits per membership year to 1,700+ airport "
         "lounges worldwide via Priority Pass Select."),
        ("Comprehensive travel protection",
         "Trip cancellation and interruption, lost-luggage, and primary "
         "auto rental collision damage waiver when you pay with the card."),
    ], cols=2))

    # --------------------------------------------------------------- POINTS EARN
    story.append(B.section_header("How you earn",
                                  kicker="Points structure"))
    story.append(B.data_table(
        header=["Category", "Earn rate", "Eligible merchants"],
        rows=[
            ["Travel", "3x points",
             "Airlines, hotels, rental cars, rail, cruises, online travel agencies, tolls"],
            ["Dining", "2x points",
             "Restaurants, bars, cafes, fast food, delivery services"],
            ["Streaming", "2x points",
             "Video, music, and audiobook subscription services"],
            ["Everything else", "1x point", "All other purchases"],
        ],
        col_widths=[1.5 * inch, 1.2 * inch, 4.6 * inch],
    ))

    story.append(Spacer(1, 0.08 * inch))
    story.append(B.sub_header("Points rate by category"))
    story.append(B.bar_comparison_chart(
        labels=["Travel", "Dining", "Streaming", "All other"],
        values=[3.0, 2.0, 2.0, 1.0],
        title="Cumulus Travel Points — points earned per $1 spent",
        ylabel="Points per $1",
        value_fmt=lambda v: f"{v:.1f}x",
    ))

    story.append(B.callout_box(
        "Redemption options",
        "Points are worth 1.0 cent each as a statement credit or as cash "
        "back, and 1.5 cents each when redeemed for travel through the "
        "Cumulus Travel Portal. Points can also be transferred 1:1 to 14 "
        "airline and hotel partners (list available in the Cumulus app) "
        "where redemption values frequently exceed 2 cents per point on "
        "premium-cabin flights and aspirational hotel stays.",
    ))

    # --------------------------------------------------------------- TRAVEL BENEFITS
    story.append(B.section_header("Travel and protection benefits",
                                  kicker="Beyond the points"))
    story.append(B.data_table(
        header=["Benefit", "Detail"],
        rows=[
            ["Annual travel credit", "$300 in statement credits per membership year, applied automatically to qualifying travel purchases"],
            ["Priority Pass Select membership", "4 complimentary lounge visits per membership year; additional visits at member rate"],
            ["Trip cancellation / interruption", "Up to $10,000 per trip for covered reasons; claims filed through card benefits administrator"],
            ["Trip delay", "Up to $500 per traveler for delays of 6+ hours"],
            ["Lost / delayed luggage", "Up to $3,000 per passenger (lost) / $100 per day up to $500 (delayed)"],
            ["Primary auto rental CDW", "Primary coverage (pays before your personal auto insurance) for rentals paid in full with the card"],
            ["No foreign transaction fee", "0.00% foreign transaction fee on purchases abroad"],
            ["World Elite Mastercard Concierge", "24/7 assistance with travel planning, dining, and entertainment"],
        ],
        col_widths=[2.2 * inch, 5.1 * inch],
    ))

    # --------------------------------------------------------------- RATES & FEES
    story.append(B.section_header("Rates and fees",
                                  kicker="Pricing summary"))
    story.append(B.data_table(
        header=["Item", "Detail"],
        rows=[
            ["Annual fee", "$95 — waived the first year"],
            ["Purchase APR", "19.99% – 27.99% variable (Prime + 11.99% to + 19.99%)"],
            ["Balance transfer APR", "Same as Purchase APR"],
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
                "Minimum FICO score of 720.",
                "Verifiable income consistent with a premium travel card.",
                "No active bankruptcy; discharged Chapter 7 bankruptcies "
                "48+ months old may be eligible.",
                "Existing Cumulus deposit or investment relationship helpful but not required.",
            ]),
        ],
        right_flowables=[
            B.sub_header("How to apply"),
            *B.bullet_list([
                "Apply online, in the Cumulus app, or at any branch.",
                "Pre-qualify with a soft credit inquiry — no impact on score.",
                "Most applications receive a decision in 60 seconds.",
                "Card provisioned digitally to Apple Pay, Google Pay, and "
                "Samsung Pay at account opening.",
                "Physical card delivered in 5–7 business days via secure mail.",
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
             "increases on existing balances absent 60-day delinquency."],
            ["Fair Credit Billing Act",
             "60-day window to dispute billing errors and unauthorized "
             "charges. $0 cardholder liability for unauthorized transactions."],
            ["Mastercard Zero Liability",
             "$0 liability for unauthorized transactions reported promptly."],
            ["Equal Credit Opportunity Act (Regulation B)",
             "Prohibits discrimination; adverse action within 30 days."],
            ["Servicemembers Civil Relief Act",
             "Military Annual Percentage Rate capped at 36% for eligible "
             "servicemembers; all $95 annual fees waived on active duty."],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Is the $95 annual fee worth it?",
         "For travelers who take at least two flights or two hotel stays "
         "per year, the card typically pays for itself through the $300 "
         "annual travel credit alone, before counting points and lounge "
         "access. The first year's fee is waived, giving you a full year "
         "to evaluate the benefits."),
        ("How do points transfer partners work?",
         "You can transfer Cumulus points 1:1 to 14 airline and hotel "
         "partners — see the current list in the Cumulus app. Partner "
         "redemptions (especially premium-cabin international flights "
         "and top-tier hotel nights) often deliver value above 2 cents "
         "per point, well above the statement-credit baseline of 1 cent."),
        ("When does the 60,000-point welcome bonus post?",
         "After you make $4,000 or more in purchases during the first 90 "
         "days, the bonus will post to your Cumulus Travel Points account "
         "on the next statement following the qualifying spend."),
        ("Does the $300 travel credit reset?",
         "Yes. The travel credit resets at the start of each cardmember "
         "anniversary year. Unused credits do not roll over. Qualifying "
         "travel purchases are credited automatically."),
        ("How many Priority Pass visits do I get?",
         "4 complimentary visits to Priority Pass lounges per membership "
         "year. Additional visits are billed at the member rate directly "
         "to your card. Priority Pass enrollment is initiated in the "
         "Cumulus app and takes 5–7 business days to activate."),
        ("Is there foreign transaction fee?",
         "No. The Cumulus Travel Points Card charges 0.00% foreign "
         "transaction fees. Purchases abroad are converted at the "
         "Mastercard interbank rate."),
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
            "Points never expire while your account is open and in good "
            "standing. Closed accounts forfeit unredeemed points; points "
            "transferred to a partner before closing are retained by the partner.",
            "Category eligibility is determined by the merchant category "
            "code (MCC) assigned by the merchant's payment processor. "
            "Cumulus cannot recategorize a transaction assigned an "
            "incorrect MCC by the merchant.",
            "Travel and purchase protection benefits are underwritten by "
            "an unaffiliated insurer and are subject to the terms, "
            "conditions, and exclusions of the Guide to Benefits "
            "delivered with your card. Claims must be filed with the "
            "benefits administrator within the applicable filing window.",
            "Mastercard®, World Elite Mastercard®, and Priority Pass™ "
            "are trademarks of their respective owners and used under license.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
