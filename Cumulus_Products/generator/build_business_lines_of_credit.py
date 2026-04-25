"""Cumulus Business Lines of Credit — commercial segment."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "06_Business_Loans"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Business_Lines_of_Credit.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Business Lines of Credit",
        product_code="BL-LOC-2026.04",
        category="Commercial Lending",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Business Lines of Credit",
        lede=("Revolving working-capital facilities for seasonal, "
              "receivables-driven, and inventory-driven businesses — "
              "priced on Prime, structured to the cash-conversion cycle, "
              "and renewed on an annual review."),
        summary_rows=[
            ("Product type", "Revolving line of credit (committed)"),
            ("Limits", "$25,000 – $10,000,000"),
            ("Rate", "Prime + 0.50% to + 4.50% (currently 8.50% – 12.50%)"),
            ("Maturity / renewal", "364-day revolving, renewable at annual review"),
            ("Minimum payment", "Monthly interest on outstanding balance"),
            ("Covenant structure", "Covenant-lite under $1M; standard covenants above"),
            ("Collateral", "Blanket UCC-1 typical; AR/inventory monitored above $2M"),
            ("Unused line fee", "0.25% – 0.50% on undrawn commitment"),
        ],
        category_label="PRODUCT BROCHURE  ·  COMMERCIAL LENDING",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Cumulus Business Line of Credit is a committed revolving "
        "facility designed to bridge the timing gap between working-capital "
        "outflows and receivable collections. Borrowers draw, repay, and "
        "redraw at their discretion up to the commitment limit, paying "
        "interest only on outstanding balances. Lines of credit are "
        "appropriate for financing seasonal inventory builds, accounts "
        "receivable, and short-duration working-capital needs; they are "
        "not appropriate for financing long-lived assets, equity buyouts, "
        "or capital expenditure — term loans are better suited to those "
        "uses."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a revolver"))
    story.append(B.feature_grid([
        ("Working-capital flexibility",
         "Draw, repay, and redraw up to the commitment limit. Pay interest "
         "only on outstanding balances — no carrying cost on undrawn availability."),
        ("Prime-indexed transparency",
         "Rate moves with the Wall Street Journal Prime Rate; no complex "
         "rate adjustments or benchmark transitions."),
        ("Scalable commitment",
         "From $25,000 for small-business borrowers to $10,000,000 for "
         "middle-market clients with receivables-driven working capital."),
        ("Covenant-lite under $1 million",
         "Streamlined compliance for smaller facilities: annual financials "
         "and tax returns only, with no quarterly compliance certificate."),
        ("Integrated with treasury",
         "Draws and repayments execute directly from a Cumulus operating "
         "account; automatic sweep repayments optional."),
        ("Annual review renewal",
         "Renewal at annual review — no refinancing, no re-documentation "
         "where covenants and financial profile remain within tolerances."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # RATE/STRUCTURE
    story.append(B.section_header("Rate and structure matrix",
                                  kicker="Pricing"))
    story.append(B.body_para(
        "Lines of credit are priced at a spread over Prime based on risk "
        "grade, commitment size, collateral package, and depository "
        "relationship. All rates shown assume the current WSJ Prime Rate "
        "of 8.00%."
    ))
    story.append(B.data_table(
        header=["Facility profile", "Rate spread", "All-in rate",
                "Unused line fee", "Commitment range"],
        rows=[
            ["Investment-grade corporate  ·  full treasury",
             "Prime + 0.50%", "8.50%", "0.25%", "$5M – $10M"],
            ["Middle-market  ·  operating deposits",
             "Prime + 1.50%", "9.50%", "0.25%", "$1M – $10M"],
            ["Established small business",
             "Prime + 2.50%", "10.50%", "0.375%", "$250K – $2M"],
            ["Emerging small business",
             "Prime + 3.50%", "11.50%", "0.50%", "$50K – $500K"],
            ["Start-up / specialty",
             "Prime + 4.50%", "12.50%", "0.50%", "$25K – $250K"],
        ],
        col_widths=[2.3 * inch, 1.1 * inch, 1.0 * inch, 1.1 * inch, 1.5 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.data_table(
        header=["Fee", "Amount", "Notes"],
        rows=[
            ["Upfront commitment fee",
             "0.25% – 0.75% of commitment",
             "Paid at closing; waivable for existing relationships."],
            ["Unused line fee",
             "0.25% – 0.50% per annum",
             "Assessed monthly on the average undrawn commitment."],
            ["Annual renewal fee",
             "$250 – $2,500",
             "Waived at renewal for facilities in compliance."],
            ["Documentation fee",
             "$500 – $2,000",
             "Legal, lien search, UCC filing costs."],
            ["Collateral monitoring fee",
             "0.25% per annum (facilities > $2M)",
             "Offset against AR aging, inventory reporting."],
            ["Late-payment charge",
             "5.00% of past-due interest",
             "Assessed after 10-day cure."],
        ],
        col_widths=[2.2 * inch, 2.0 * inch, 3.1 * inch],
    ))

    # STRUCTURE COMPARISON CHART
    story.append(B.section_header("Structure comparison across the size curve",
                                  kicker="Commitment economics"))
    story.append(B.body_para(
        "The chart below compares illustrative all-in rates across five "
        "common facility profiles, assuming the WSJ Prime Rate of 8.00%. "
        "Rate differentiation reflects risk grade, collateral monitoring, "
        "and depository relationship strength."
    ))
    story.append(B.bar_comparison_chart(
        labels=["IG corp.", "Middle-market", "Est. small biz",
                "Emerging SB", "Start-up"],
        values=[8.50, 9.50, 10.50, 11.50, 12.50],
        title="Illustrative all-in revolving-facility rate by profile",
        ylabel="All-in APR (%)",
        value_fmt=lambda v: f"{v:.2f}%",
    ))

    # UNDERWRITING
    story.append(B.section_header("Underwriting and documentation",
                                  kicker="Credit and legal"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Underwriting parameters"),
            *B.bullet_list([
                "Minimum fixed-charge coverage ratio (FCCR) of <b>1.20x</b>, "
                "or DSCR of <b>1.25x</b>, trailing-twelve-month.",
                "Funded-debt-to-EBITDA leverage ≤ <b>3.50x</b>; "
                "working-capital ratio ≥ 1.25x.",
                "Two years of operating history and positive EBITDA in the "
                "trailing year.",
                "Personal guaranty of each 20%+ owner (waivable for "
                "investment-grade corporates).",
                "Primary operating depository at Cumulus during the facility term.",
                "Clean-up period required for seasonal / working-capital "
                "lines — 30 consecutive days at zero balance each year "
                "(facilities $1M and below)."
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Three years of business tax returns and financial statements "
                "(CPA-reviewed for facilities above $1M; audited above $5M).",
                "Three years of personal tax returns and personal financial "
                "statement for each guarantor.",
                "Current AR aging and inventory report.",
                "Year-to-date interim financials and cash flow forecast.",
                "Corporate formation documents, operating agreement, and "
                "authorizing resolution.",
                "UCC-1 filing, lien searches in states of operation and "
                "collateral location, and intercreditor agreement if "
                "subordinate lenders are present.",
            ]),
        ],
    ))

    # HOW IT WORKS
    story.append(B.section_header("How the revolver operates",
                                  kicker="Mechanics"))
    story.append(B.data_table(
        header=["Activity", "How it works", "Cut-off times (ET)"],
        rows=[
            ["Draw request",
             "Submit via Cumulus Business Online; funds deposit to linked "
             "operating account by SWIFT or internal book transfer.",
             "Same-day: 3:00 p.m."],
            ["Repayment",
             "Manual repayment via Business Online, scheduled recurring "
             "repayment, or optional nightly sweep from operating account.",
             "Continuous"],
            ["Interest accrual",
             "Daily accrual on outstanding balance at Prime + applicable "
             "spread, 365-day basis; interest billed monthly.",
             "Monthly"],
            ["Unused line fee",
             "Accrued daily on average undrawn commitment; billed monthly "
             "on the same statement cycle.",
             "Monthly"],
            ["Annual review",
             "Cumulus reviews financial compliance, facility utilization, "
             "and renewal terms 60 days before the anniversary.",
             "60 days before anniversary"],
            ["Maturity renewal",
             "Facility renews for another 364 days upon successful annual "
             "review; no re-documentation required.",
             "Annual"],
        ],
        col_widths=[1.4 * inch, 4.3 * inch, 1.6 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Covenant-lite under $1,000,000",
        "Facilities with commitments at or below $1,000,000 qualify for "
        "Cumulus covenant-lite structure: annual financial statements and "
        "tax returns only, with no quarterly compliance certificate and "
        "no borrowing-base reporting. Standard covenants apply for "
        "facilities above $1 million.",
    ))

    # COVENANTS
    story.append(B.section_header("Covenants and reporting",
                                  kicker="Ongoing obligations"))
    story.append(B.data_table(
        header=["Covenant / requirement", "Standard structure",
                "Covenant-lite (≤ $1M)"],
        rows=[
            ["Fixed-charge coverage ratio (FCCR)",
             "≥ 1.20x quarterly", "Not tested"],
            ["Leverage ratio",
             "Funded debt / EBITDA ≤ 3.50x",
             "Not tested"],
            ["Minimum tangible net worth",
             "Calibrated to starting TNW",
             "Not tested"],
            ["Annual financial statements",
             "CPA-reviewed within 120 days",
             "Company-prepared within 120 days"],
            ["Quarterly financials",
             "Management-prepared within 45 days",
             "Not required"],
            ["Quarterly compliance certificate",
             "Required", "Not required"],
            ["AR / inventory reporting",
             "Monthly AR aging; monthly inventory (facilities > $2M)",
             "Not required"],
            ["Clean-up requirement",
             "Not applicable above $1M",
             "30 consecutive days at $0 balance annually"],
        ],
        col_widths=[2.3 * inch, 2.5 * inch, 2.5 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("When should I use a line of credit vs. a term loan?",
         "Use a line of credit for short-duration, revolving needs: "
         "seasonal working capital, accounts receivable bridging, or "
         "inventory builds that self-liquidate in 90 days or less. Use a "
         "term loan for long-lived assets or strategic initiatives that "
         "cannot be repaid from near-term cash flow."),
        ("What does 'covenant-lite' mean?",
         "Covenant-lite means the facility has a streamlined covenant "
         "package: no financial maintenance covenants, reduced reporting, "
         "and no quarterly compliance certificate. This structure is "
         "available on revolving facilities $1,000,000 and below with "
         "qualifying borrowers."),
        ("What is the clean-up requirement?",
         "For facilities $1M and below structured as seasonal working-"
         "capital lines, Cumulus requires the outstanding balance to reach "
         "zero for 30 consecutive days each 12-month period. This "
         "demonstrates the facility is not financing permanent working "
         "capital (which would better be structured as a term loan)."),
        ("Can I convert my outstanding balance to a term loan?",
         "Yes. Cumulus offers a Term-Out feature that allows outstanding "
         "balances to be converted to a fixed-rate term loan at the "
         "revolver's prevailing rate, subject to credit review and "
         "execution of term-loan documentation. Term-out is commonly used "
         "to lock in a rate when a temporary need becomes permanent."),
        ("Is the unused line fee negotiable?",
         "Yes. The unused line fee is set as part of the overall facility "
         "pricing at term-sheet stage and reflects utilization assumptions, "
         "relationship depth, and collateral coverage. Higher-utilization "
         "commitments typically attract lower unused fees."),
        ("How is the rate set at each Prime move?",
         "The rate resets automatically on the business day following a "
         "change in the WSJ Prime Rate. The new rate applies to the entire "
         "outstanding balance from that day forward; no interest "
         "recalculation is performed on earlier accrual periods."),
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
        B.STANDARD_LENDING_DISCLOSURES + [
            "Prime Rate is the Wall Street Journal Prime Rate as published "
            "on the last business day of each month; the illustrative rate "
            "used in this brochure is 8.00%. Actual rates reset on each "
            "published change.",
            "Lines of credit are committed through the stated maturity "
            "date but are not open-ended. Termination, default, or "
            "material adverse change may result in a freeze of further "
            "advances and acceleration of the outstanding balance.",
            "Commercial lines of credit are not consumer credit and are "
            "not subject to the Truth in Lending Act or Regulation Z.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
