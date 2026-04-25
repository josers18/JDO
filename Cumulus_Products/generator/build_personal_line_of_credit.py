"""Cumulus Personal Line of Credit — retail brochure."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "02_Personal_Loans"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Personal_Line_Of_Credit.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Personal Line of Credit",
        product_code="PL-LOC-PRS-2026.04",
        category="Personal Loans",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Personal Line of Credit",
        lede=("A flexible, unsecured revolving line for clients who want "
              "funds available when they need them — at rates well below "
              "typical credit card APRs."),
        summary_rows=[
            ("Product type", "Unsecured revolving line of credit"),
            ("Credit limits", "$5,000 – $100,000"),
            ("Current APR range", "13.00% – 22.99% APR (variable)"),
            ("Rate index", "Prime + 4.99% to + 14.99%"),
            ("Draw period", "10 years"),
            ("Repayment period", "10 years following draw period"),
            ("Minimum advance", "$100 per draw"),
            ("Annual fee", "None"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL LOANS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus Personal Line of Credit is an unsecured revolving "
        "line that sits alongside your Cumulus Checking account. During "
        "a 10-year draw period you can advance funds, repay, and advance "
        "again — paying interest only on the outstanding balance. It is "
        "designed for clients who want a reliable source of lower-cost "
        "financing for short-to-medium-term needs: covering an uneven "
        "cash flow month, bridging the sale of an asset, or "
        "supplementing an emergency fund."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits",
                                  kicker="Why a Personal Line of Credit"))
    story.append(B.feature_grid([
        ("Rates below typical credit cards",
         "Current APRs of 13.00% – 22.99% are typically well below the "
         "20%–29% range of many credit cards — meaningful savings on a "
         "carried balance."),
        ("Draw only when you need it",
         "No interest until you draw. Paid-down principal becomes "
         "available again — a true revolving line."),
        ("Advance in the Cumulus app",
         "Transfer funds from your line to any Cumulus deposit account "
         "in seconds. Minimum advance is just $100."),
        ("Overdraft protection for checking",
         "Optionally link the line as an overdraft source for your "
         "Cumulus Checking account — no transfer fee, only loan interest."),
        ("10-year draw, 10-year repay",
         "Up to 20 years of total flexibility — ten years to draw, then "
         "ten years of fully amortizing repayment."),
        ("No annual fee",
         "No annual maintenance fee for keeping the line open and available."),
    ], cols=2))

    # --------------------------------------------------------------- RATES
    story.append(B.section_header("Rates and pricing",
                                  kicker="Variable APR indexed to Prime"))
    story.append(B.body_para(
        "Your APR is variable and equals the Prime Rate published in The "
        "Wall Street Journal on the last business day of each month, "
        "plus a margin assigned at origination based on your credit "
        "profile, line size, and relationship with Cumulus. The Prime "
        "Rate on the effective date of this brochure is 8.00% APR. Your "
        "rate may rise or fall in any month Prime changes; the APR is "
        "capped at 18% above the margin (lifetime cap) and floored at "
        "the origination margin."
    ))

    story.append(B.data_table(
        header=["Credit tier", "Margin over Prime", "Current APR", "Suggested line size"],
        rows=[
            ["Excellent  ·  FICO 780+", "+4.99%", "13.00%", "$25,000 – $100,000"],
            ["Very good  ·  FICO 740–779", "+7.99%", "16.00%", "$15,000 – $75,000"],
            ["Good  ·  FICO 700–739", "+10.99%", "19.00%", "$10,000 – $50,000"],
            ["Fair  ·  FICO 680–699", "+13.99%", "21.99%", "$5,000 – $25,000"],
            ["Near floor", "+14.99%", "22.99%", "$5,000 – $15,000"],
        ],
        col_widths=[1.9 * inch, 1.4 * inch, 1.1 * inch, 2.7 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Rate illustration — APR above Prime"))
    story.append(B.bar_comparison_chart(
        labels=["Prime", "Tier A (+4.99%)", "Tier B (+7.99%)", "Tier C (+10.99%)", "Tier D (+13.99%)"],
        values=[8.00, 13.00, 16.00, 19.00, 21.99],
        title="Cumulus Personal Line — APR by tier at 8.00% Prime",
        ylabel="APR (%)",
    ))

    story.append(B.callout_box(
        "Interest-only minimum during the draw period",
        "During the 10-year draw period, the minimum monthly payment is "
        "the greater of $25 or the accrued interest on the outstanding "
        "balance. You may pay more (and frequently should) to pay down "
        "principal. At the end of the draw period, the outstanding "
        "balance converts to a fully amortizing 10-year installment loan.",
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Fees", kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Fee", "Amount", "Notes"],
        rows=[
            ["Origination fee", "None", "No up-front origination or application fee."],
            ["Annual fee", "None", "No annual maintenance fee."],
            ["Inactivity fee", "None", "No fee for not drawing."],
            ["Cash advance / draw fee", "None", "Draws are free; you pay only accrued interest."],
            ["Late payment fee", "5% of past-due amount or $25, whichever is less",
             "Assessed after 15-day grace period."],
            ["Returned payment fee", "$15", "For NSF / returned ACH or check payments."],
            ["Statement copy (by mail)", "$5 per copy", "Free in the Cumulus app."],
        ],
        col_widths=[2.4 * inch, 2.5 * inch, 2.4 * inch],
    ))

    # --------------------------------------------------------------- UNDERWRITING
    story.append(B.section_header("Eligibility and underwriting",
                                  kicker="How we review your application"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who qualifies"),
            *B.bullet_list([
                "U.S. citizens, lawful permanent residents, and qualifying "
                "resident aliens age 18 or older (19 in AL and NE).",
                "Minimum FICO score of 680.",
                "Post-limit debt-to-income ratio of 45% or less, calculated "
                "using the assumed draw of 100% of the line.",
                "Two years of stable income; self-employed borrowers "
                "require two years of tax returns.",
                "No active Chapter 7 or Chapter 13 bankruptcy; prior "
                "bankruptcies must be discharged 48+ months.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Government-issued photo ID.",
                "Social Security Number or ITIN.",
                "Two most recent pay stubs or comparable income "
                "documentation (W-2, 1099, Schedule C, K-1).",
                "Most recent W-2 or two years of personal tax returns.",
                "Cumulus deposit account for funding draws and receiving payments.",
                "Signed Credit Line Agreement and Regulation Z disclosures."
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How it works", kicker="Step by step"))
    story.append(B.data_table(
        header=["Phase", "What happens"],
        rows=[
            ["1  ·  Apply",
             "Apply online, in the Cumulus app, or at a branch. Pre-"
             "qualify with a soft credit inquiry at no impact to your score."],
            ["2  ·  Review and sign",
             "Receive your credit decision, APR, and approved limit. "
             "Review the Regulation Z disclosures and Credit Line Agreement "
             "and e-sign to open the line."],
            ["3  ·  Draw period — years 1–10",
             "Advance funds from your line to your Cumulus Checking account "
             "anytime. Pay interest only on the balance outstanding. Paid-"
             "down principal becomes available again."],
            ["4  ·  Conversion at year 10",
             "At the end of the draw period, the outstanding balance "
             "converts to a fully amortizing 10-year installment loan at "
             "the then-current APR. No further draws are permitted."],
            ["5  ·  Repayment — years 11–20",
             "Repay the converted balance over 10 years in equal monthly "
             "payments of principal and interest."],
        ],
        col_widths=[2.1 * inch, 5.1 * inch],
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="Your rights as a borrower"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["Truth in Lending Act (Regulation Z)",
             "Initial disclosure, periodic statement, and annual change-in-"
             "terms notice requirements for open-end credit plans."],
            ["Equal Credit Opportunity Act (Regulation B)",
             "Prohibits discrimination; adverse-action notices within 30 days."],
            ["Fair Credit Reporting Act",
             "Credit report disputes are investigated within 30 days."],
            ["Servicemembers Civil Relief Act",
             "6% APR cap on pre-service personal line debt and other "
             "protections during active duty."],
            ["Regulation P — consumer privacy",
             "Governed by the Cumulus Consumer Privacy Notice."],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How is this different from a credit card?",
         "Both are revolving credit. A Personal Line of Credit typically "
         "carries a substantially lower APR (13%–23% vs. 20%–29% on many "
         "cards), is intended for larger one-time or periodic draws, and "
         "does not provide rewards, purchase protection, or merchant-"
         "accepted point-of-sale payment. Cards remain ideal for everyday "
         "purchases."),
        ("When does my APR change?",
         "Your APR adjusts on the first day of each billing cycle that "
         "follows a change in the Prime Rate. Cumulus discloses any rate "
         "change on that cycle's periodic statement under Regulation Z."),
        ("Is there a minimum draw?",
         "Yes, $100 per draw. There is no minimum for aggregate monthly "
         "activity and no requirement to draw at all."),
        ("Can I use this for overdraft protection?",
         "Yes. You can designate the line as an overdraft source for your "
         "Cumulus Checking account. No transfer fee; advances accrue "
         "interest from the date of advance."),
        ("What happens at the end of year 10?",
         "Any outstanding balance at the end of the draw period converts "
         "to a 10-year, fully amortizing installment loan. You cannot "
         "draw further. The monthly payment becomes principal + interest "
         "rather than interest-only."),
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
        B.STANDARD_LENDING_DISCLOSURES + [
            "APR is variable and will change with the Prime Rate. The "
            "margin added to Prime is set at origination and does not "
            "change for the life of the line. The APR will not exceed "
            "the Prime Rate on the effective date plus 18.00% (lifetime cap).",
            "During the draw period, the minimum monthly payment is the "
            "greater of $25 or accrued interest. At the end of the draw "
            "period, any outstanding balance converts to a fully "
            "amortizing 10-year installment loan at the then-current APR.",
            "Cumulus reserves the right to reduce, freeze, or terminate "
            "the line in accordance with Regulation Z (12 C.F.R. "
            "§ 1026.40(f)), for example upon significant decline in "
            "creditworthiness or material change in financial circumstances.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
