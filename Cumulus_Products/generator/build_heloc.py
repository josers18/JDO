"""Cumulus HELOC — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_HELOC.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus HELOC",
        product_code="PL-HEL-HEL-2026.04",
        category="Personal Loans",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Home Equity Line of Credit",
        lede=("A flexible, variable-rate revolving line secured by the "
              "equity in your primary or secondary residence — with a "
              "12-month introductory APR."),
        summary_rows=[
            ("Product type", "Open-end home equity line (1st or 2nd lien)"),
            ("Introductory APR", "6.99% APR for 12 months"),
            ("Post-intro APR", "Prime + 0.50% to + 2.50% (currently 8.50% – 10.50%)"),
            ("Max CLTV", "85% primary residence  ·  75% second home"),
            ("Draw period / Repayment", "10-year draw  ·  20-year repayment"),
            ("Minimum draw", "$100"),
            ("Annual fee", "None"),
            ("Property types", "1–4 unit primary; 1-unit second home"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL LOANS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Cumulus Home Equity Line of Credit (HELOC) lets you convert a "
        "portion of your home's equity into a flexible revolving credit "
        "line. During a 10-year draw period you can advance funds as you "
        "need them, pay interest only on the outstanding balance, and "
        "re-draw as you pay down principal. After the draw period, the "
        "outstanding balance converts to a fully amortizing 20-year "
        "repayment loan. HELOCs are ideal for long-running home "
        "renovations, funding education over multiple semesters, or as a "
        "standing reserve against larger unexpected expenses."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a Cumulus HELOC"))
    story.append(B.feature_grid([
        ("Introductory 6.99% APR",
         "Lock in 6.99% APR for the first 12 months on qualifying balances "
         "— meaningfully below unsecured personal credit rates."),
        ("Prime-indexed post-intro rate",
         "After the intro period, your APR is Prime + 0.50% to + 2.50% "
         "based on your credit and CLTV profile."),
        ("Draw only when needed",
         "Interest accrues only on funds advanced. Paid-down principal "
         "becomes available again during the draw period."),
        ("Up to 85% CLTV on your primary",
         "Combined loan-to-value up to 85% on a primary residence — "
         "75% on a second home. Line size up to $500,000."),
        ("No annual fee",
         "No annual maintenance or inactivity fee. Cumulus pays most "
         "closing costs on lines up to $500,000."),
        ("Potential tax advantages",
         "Interest on funds used to buy, build, or substantially improve "
         "the home securing the HELOC may be deductible — consult your "
         "tax advisor."),
    ], cols=2))

    # --------------------------------------------------------------- RATES
    story.append(B.section_header("Rates and pricing",
                                  kicker="Introductory and variable APR"))
    story.append(B.body_para(
        "During the first 12 months after closing, the APR on your HELOC "
        "is a fixed introductory 6.99% on all outstanding balances. "
        "After the intro period, the APR is variable and equals the "
        "Prime Rate published in The Wall Street Journal on the last "
        "business day of each month plus a margin set at origination. "
        "The Prime Rate on the effective date is 8.00% APR."
    ))

    story.append(B.data_table(
        header=["Profile", "Margin over Prime", "Post-intro APR", "Max CLTV"],
        rows=[
            ["Primary residence  ·  FICO 760+  ·  CLTV ≤ 70%", "+0.50%", "8.50%", "85%"],
            ["Primary residence  ·  FICO 720–759  ·  CLTV ≤ 80%", "+1.00%", "9.00%", "85%"],
            ["Primary residence  ·  FICO 700–719  ·  CLTV ≤ 85%", "+1.50%", "9.50%", "85%"],
            ["Second home  ·  FICO 740+  ·  CLTV ≤ 70%", "+2.00%", "10.00%", "75%"],
            ["Second home  ·  FICO 700–739  ·  CLTV ≤ 75%", "+2.50%", "10.50%", "75%"],
        ],
        col_widths=[3.2 * inch, 1.2 * inch, 1.2 * inch, 1.0 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative post-intro APR comparison"))
    story.append(B.bar_comparison_chart(
        labels=["Prime", "Tier 1 (+0.50%)", "Tier 2 (+1.00%)", "Tier 3 (+1.50%)", "2nd home (+2.50%)"],
        values=[8.00, 8.50, 9.00, 9.50, 10.50],
        title="HELOC APR by tier (at 8.00% Prime)",
        ylabel="APR (%)",
    ))

    story.append(B.callout_box(
        "Payment during draw vs. repayment",
        "During the 10-year draw period, the minimum monthly payment is "
        "the greater of $100 or accrued interest. At the end of the draw "
        "period, the outstanding balance begins fully amortizing over 20 "
        "years of principal and interest at the then-current APR. Your "
        "payment may increase substantially at conversion; Cumulus "
        "discloses the estimated payment on your Regulation Z disclosures.",
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Fees and closing costs",
                                  kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Item", "Detail"],
        rows=[
            ["Application fee", "None"],
            ["Origination fee", "None"],
            ["Annual fee", "None"],
            ["Cumulus-paid closing costs", "Typical costs (appraisal, title, recording) paid by Cumulus on lines up to $500,000 if line remains open 36 months"],
            ["Early closure recoupment", "If line is closed within 36 months, Cumulus-paid closing costs are charged back to you"],
            ["Late payment fee", "5% of past-due amount, maximum $50"],
            ["Returned payment fee", "$15"],
            ["Flood determination fee", "Pass-through (typically $12 – $25)"],
            ["Recording / release fee", "Pass-through at county rate"],
            ["Rate-lock option fee", "$75 each time you convert a portion of your balance to a fixed rate (optional feature)"],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- UNDERWRITING
    story.append(B.section_header("Eligibility and underwriting",
                                  kicker="How we review your application"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who qualifies"),
            *B.bullet_list([
                "U.S. citizens, lawful permanent residents, and qualifying "
                "resident aliens age 18 or older.",
                "Property: owner-occupied 1–4 unit primary residence or "
                "1-unit second home. Investment properties, manufactured "
                "homes, and co-ops not eligible on this product.",
                "Minimum FICO 680.",
                "Maximum CLTV 85% primary / 75% second home.",
                "DTI ≤ 45% post-close, computed on fully indexed (not "
                "introductory) rate and maximum draw.",
                "Two years of continuous employment or self-employment income.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Government-issued photo ID and Social Security Number.",
                "Two most recent pay stubs; two years of W-2 or tax returns.",
                "Most recent mortgage statement (if applicable).",
                "Evidence of homeowners insurance meeting Cumulus minimums.",
                "Title report and property appraisal (ordered by Cumulus).",
                "Flood-zone determination; flood insurance if in a Special "
                "Flood Hazard Area (SFHA) identified by FEMA.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How it works", kicker="Step by step"))
    story.append(B.data_table(
        header=["Phase", "What happens"],
        rows=[
            ["1  ·  Apply and lock",
             "Apply online, in the app, or with a Cumulus Home Lending "
             "specialist. Receive rate-and-fee disclosures (Reg Z HELOC)."],
            ["2  ·  Appraisal and title",
             "Cumulus orders appraisal, title, and flood-zone determination. "
             "Underwriter issues conditional approval subject to documentation."],
            ["3  ·  Close",
             "Sign at home, at a branch, or at a title company. Three-day "
             "rescission period applies to primary residences (TILA § 1635)."],
            ["4  ·  Draw period — years 1–10",
             "Advance funds by transfer to your Cumulus deposit account, by "
             "wire, or by check. Pay interest only (minimum $100)."],
            ["5  ·  Repayment — years 11–30",
             "Any outstanding balance converts to a fully amortizing 20-year "
             "installment loan at the then-current APR. No further draws."],
        ],
        col_widths=[2.0 * inch, 5.2 * inch],
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="Your rights as a borrower"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["Truth in Lending Act (Regulation Z)",
             "HELOC disclosures (12 C.F.R. § 1026.40) provided at "
             "application; periodic statements each billing cycle; change-"
             "in-terms notices."],
            ["Right of rescission (TILA § 1635)",
             "3-business-day right to cancel on a HELOC secured by your "
             "principal dwelling, beginning after closing and receipt of "
             "disclosures."],
            ["Real Estate Settlement Procedures Act (Reg X)",
             "Governs real-estate settlement services; prohibits kickbacks; "
             "requires loan estimate and closing disclosure for applicable transactions."],
            ["Equal Credit Opportunity Act (Reg B)",
             "Prohibits discrimination; adverse-action notices within 30 days."],
            ["Flood Disaster Protection Act",
             "Flood insurance required for properties in a Special Flood "
             "Hazard Area identified by FEMA."],
            ["Servicemembers Civil Relief Act",
             "6% APR cap on pre-service home-secured debt and foreclosure "
             "protections during active duty."],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("HELOC or HELOAN — which should I choose?",
         "Choose a HELOC if you need flexible, revolving access over time "
         "and are comfortable with a variable rate. Choose a Cumulus "
         "HELOAN (home equity installment loan) if you have a one-time "
         "need, want a fixed rate and fixed term, and prefer a predictable "
         "monthly payment."),
        ("How is the 6.99% introductory APR applied?",
         "For the first 12 months after closing, all outstanding balances "
         "accrue interest at a fixed 6.99% APR. After the intro period "
         "ends, the APR reverts to the variable post-intro APR (Prime + "
         "margin) for the remainder of the draw and repayment periods."),
        ("Can I convert some of my balance to a fixed rate?",
         "Yes. Cumulus offers an optional rate-lock feature that allows "
         "you to convert up to 100% of your outstanding balance (or a "
         "portion) to a fixed-rate installment for 5, 10, 15, or 20 years. "
         "A $75 lock fee applies per conversion."),
        ("Do I need to pay closing costs?",
         "On lines up to $500,000, Cumulus pays typical closing costs "
         "(appraisal, title, recording, flood determination). If you "
         "close the line within 36 months, the costs Cumulus paid are "
         "recouped from you at closure."),
        ("Is HELOC interest tax-deductible?",
         "Interest on funds used to buy, build, or substantially improve "
         "the home securing the HELOC may be deductible under current IRS "
         "rules. Funds used for other purposes are generally not "
         "deductible. Please consult your tax advisor."),
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
            "APR after the introductory period is variable and indexed to "
            "the U.S. Prime Rate as published in The Wall Street Journal. "
            "The lifetime maximum APR is 18.00%; the minimum APR equals "
            "the Prime Rate at origination plus the assigned margin.",
            "Your home is the collateral for this loan. Failure to repay "
            "may result in the loss of your home through foreclosure.",
            "On a primary residence, you have a three-business-day right "
            "of rescission beginning after closing and delivery of the "
            "required Regulation Z disclosures.",
            "Cumulus Home Lending, a division of Cumulus Bank, N.A. NMLS "
            "#2026045. Equal Housing Lender.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
