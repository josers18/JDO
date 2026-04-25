"""Cumulus Asset-Based Lending — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Asset_Based_Lending.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Asset-Based Lending",
        product_code="BL-ABL-2026.04",
        category="Commercial Lending",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Asset-Based Lending",
        lede=("Revolving credit facilities structured against a dynamic "
              "borrowing base of accounts receivable, inventory, and "
              "machinery & equipment — with field-exam discipline and "
              "dominion-of-funds control."),
        summary_rows=[
            ("Facility size", "$5,000,000 – $100,000,000+"),
            ("Structure", "Revolving credit (364-day or multi-year)"),
            ("Pricing", "Term SOFR + 3.00% to + 5.50%  ·  unused 0.375%  ·  monitoring 0.25%"),
            ("Advance rates", "85% AR  ·  50–65% inventory  ·  appraised ML&E"),
            ("Reporting", "Weekly or monthly borrowing-base certificate"),
            ("Field exams", "1–4 times per year (risk-graded cadence)"),
            ("Cash management", "Dominion-of-funds via collection lockbox"),
            ("Covenants", "Springing FCCR at availability trigger; light maintenance"),
        ],
        category_label="PRODUCT BROCHURE  ·  COMMERCIAL LENDING",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Asset-Based Lending (ABL) provides revolving credit "
        "structured as a percentage of qualifying collateral — accounts "
        "receivable, eligible inventory, and appraised machinery and "
        "equipment. Availability rises and falls each reporting period "
        "with the borrowing base, making ABL uniquely well-suited to "
        "cyclical, seasonal, or working-capital-intensive businesses and "
        "to borrowers whose leverage or operating profile does not support "
        "a cash-flow-underwritten revolver. ABL facilities feature "
        "dominion-of-funds control, borrowing-base certificates, regular "
        "field exams, and appraisals — in return for higher advance rates, "
        "greater flexibility on covenants, and meaningful availability "
        "through cycle troughs."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why ABL"))
    story.append(B.feature_grid([
        ("Higher availability",
         "Advance rates of 85% on eligible AR, 50–65% on inventory, and "
         "appraised orderly-liquidation value on ML&E frequently produce "
         "larger facilities than cash-flow underwriting."),
        ("Light financial covenants",
         "Typically a single springing fixed-charge coverage ratio, tested "
         "only when availability falls below a dollar or percentage trigger."),
        ("Cyclical and seasonal fit",
         "Availability expands with receivables and inventory through "
         "production or selling seasons; contracts in collection periods."),
        ("Transformation and turnaround",
         "Well-suited to borrowers undergoing cost restructuring, carve-outs, "
         "or acquisitions where conventional leverage-based credit is limited."),
        ("Dominion-of-funds discipline",
         "Collection account with lockbox sweep provides daily payment "
         "visibility and credit-line revolving discipline."),
        ("Integrated reporting",
         "Borrowing-base certificates, AR aging, and inventory analytics "
         "through Cumulus Business Online — submitted by file or API."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # BORROWING BASE MECHANICS
    story.append(B.section_header("Borrowing-base mechanics",
                                  kicker="How availability is sized"))
    story.append(B.body_para(
        "Availability is recalculated at each reporting cadence (weekly "
        "at most facilities; monthly in lighter-touch structures). The "
        "borrower submits a Borrowing-Base Certificate listing eligible "
        "collateral; Cumulus applies advance rates and ineligibles "
        "(dilutions, concentrations, cross-age) to arrive at Net "
        "Availability. The facility commitment is the upper bound; "
        "availability is typically the binding constraint."
    ))
    story.append(B.data_table(
        header=["Collateral class", "Advance rate",
                "Key ineligibles / reserves", "Reporting cadence"],
        rows=[
            ["Accounts receivable",
             "85% of eligible",
             "> 90 days past due; cross-age (if 25% of an obligor is past "
             "due, all AR from that obligor ineligible); foreign without "
             "CEBA-insured or letter-of-credit support; affiliates; "
             "contra / offset; 20% single-obligor concentration.",
             "Weekly (monthly for lighter facilities)"],
            ["Inventory — raw materials & finished goods",
             "50% – 65% of NOLV appraised",
             "Work-in-process excluded (except certain contract work); "
             "slow-moving > 180 days ineligible; obsolete / damaged "
             "ineligible; consigned ineligible unless PMSI waived.",
             "Monthly (quarterly count)"],
            ["Machinery and equipment (ML&E)",
             "80% – 85% of appraised NOLV",
             "Appraised by Cumulus-engaged appraiser (Hilco, Gordon Bros., "
             "Great American); annual re-appraisal on large facilities.",
             "Annual re-appraisal"],
            ["Real estate (select cases)",
             "65% – 75% of appraised value",
             "Environmental Phase I required; amortization against real-"
             "estate portion typical.",
             "Annual"],
        ],
        col_widths=[1.8 * inch, 1.4 * inch, 2.9 * inch, 1.2 * inch],
    ))

    # PRICING
    story.append(B.section_header("Pricing and structure",
                                  kicker="Fee schedule"))
    story.append(B.data_table(
        header=["Component", "Amount", "Notes"],
        rows=[
            ["Interest rate",
             "Term SOFR + 3.00% – 5.50%",
             "Pricing grid steps down with availability (e.g., 25-bp "
             "reduction at > 65% availability)."],
            ["Upfront closing fee",
             "0.75% – 1.50% of commitment",
             "Paid at closing; larger on new-relationship transactions."],
            ["Unused line fee",
             "0.375% – 0.50% per annum",
             "On average undrawn commitment."],
            ["Collateral monitoring fee",
             "0.25% per annum",
             "On outstanding balance; billed monthly."],
            ["Field-exam fee",
             "Actual cost (typically $900 – $1,500 / day)",
             "Passed through at Cumulus's standard day-rate schedule."],
            ["Appraisal fee",
             "Actual cost",
             "ML&E appraisals annually; inventory appraisals at "
             "underwriting and on material shifts."],
            ["Letter-of-credit fee",
             "2.00% per annum on face",
             "Standby and commercial LCs available within the facility."],
            ["Early termination fee",
             "1.00% – 2.00% of commitment",
             "Declining schedule; generally waived at maturity renewal."],
        ],
        col_widths=[2.1 * inch, 2.2 * inch, 2.8 * inch],
    ))

    # ADVANCE RATE COMPARISON CHART
    story.append(B.section_header("Advance rates by collateral class",
                                  kicker="Availability profile"))
    story.append(B.body_para(
        "The chart below compares Cumulus's standard advance rates across "
        "collateral classes. Actual advance rates are set at underwriting "
        "and reflect collateral quality, dilution history, appraisal "
        "results, and concentration."
    ))
    story.append(B.bar_comparison_chart(
        labels=["Eligible AR", "Raw materials", "Finished goods",
                "Appraised ML&E", "Real estate"],
        values=[85, 50, 65, 82, 70],
        title="Typical Cumulus advance rates by collateral class",
        ylabel="Advance rate (%)",
        value_fmt=lambda v: f"{v}%",
    ))

    # DOMINION OF FUNDS
    story.append(B.section_header("Dominion-of-funds and cash management",
                                  kicker="Payment control"))
    story.append(B.body_para(
        "Cumulus ABL facilities operate under a full dominion-of-funds "
        "structure. All receivables are directed to a Cumulus collection "
        "lockbox; incoming funds are swept daily to reduce the revolver "
        "balance. New draws fund operating needs as the borrower requires "
        "them. Springing dominion (triggered only on specified events) is "
        "available in limited circumstances for investment-grade borrowers."
    ))
    story.append(B.data_table(
        header=["Component", "Mechanics"],
        rows=[
            ["Collection lockbox",
             "All obligor remittances directed to a Cumulus Wholesale "
             "Lockbox PO box or electronic collection address. Imaging, "
             "data capture, and ERP integration included."],
            ["Daily sweep",
             "End-of-day balance in the collection account sweeps to the "
             "revolver; operating account funded on request from the revolver."],
            ["Notification of assignment",
             "Customers notified on new-relationship onboarding or event-"
             "of-default; non-notification structure available for "
             "investment-grade borrowers."],
            ["ACH / card collections",
             "Card and ACH settlement routed to the collection account; "
             "auto-reconciled to invoice via lockbox."],
            ["Receivables reporting",
             "Daily collection activity available in Business Online; "
             "cash-application file returned to ERP the same business day."],
            ["Springing vs full dominion",
             "Full dominion default structure. Springing dominion available "
             "for investment-grade borrowers with strong covenant profile."],
        ],
        col_widths=[1.9 * inch, 5.4 * inch],
    ))

    # FIELD EXAM
    story.append(B.section_header("Field exams and appraisals",
                                  kicker="Collateral diligence"))
    story += B.bullet_list([
        "<b>Initial field exam</b> — Cumulus Field Exam team performs an "
        "on-site diligence (typically 5–15 exam days) prior to closing, "
        "testing AR dilution, billing/collections process, inventory "
        "controls, and financial reporting accuracy.",
        "<b>Semi-annual or annual field exams</b> — cadence set at "
        "underwriting based on facility size, risk grade, and collateral "
        "complexity. Riskier credits examined quarterly.",
        "<b>Inventory appraisal</b> — Net Orderly Liquidation Value "
        "(NOLV) appraisal by third-party appraiser at underwriting and "
        "annually thereafter (semi-annually for seasonal profiles).",
        "<b>ML&E appraisal</b> — NOLV appraisal at underwriting and "
        "every 12–24 months depending on asset mix and utilization.",
        "<b>AR exam focus</b> — document sampling, aging roll-forward, "
        "dilution calc (credits + cash discounts + returns), concentration "
        "testing, and cross-age analysis.",
    ])

    # UNDERWRITING
    story.append(B.section_header("Underwriting and documentation",
                                  kicker="Credit and legal"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Borrower profile"),
            *B.bullet_list([
                "Manufacturers, distributors, wholesalers, oilfield "
                "services, staffing, and service businesses with "
                "meaningful AR or inventory.",
                "Minimum annual revenue $25M for standalone ABL; smaller "
                "AR-only facilities available.",
                "Receivables-based businesses with diversified obligor "
                "base, controlled dilution (< 5% trailing), and measurable "
                "AR quality.",
                "Sponsors with prior ABL experience or operating track "
                "record in collateral-intensive industries.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation"),
            *B.bullet_list([
                "Three years audited financials; trailing-twelve-month "
                "EBITDA reconciliation.",
                "Two years monthly AR aging and dilution analysis.",
                "Perpetual inventory with physical-count reconciliations.",
                "Dilution, credit-memo, and chargeback detail for "
                "field-exam sampling.",
                "Intercreditor or subordination agreement with other "
                "secured creditors, where applicable.",
                "13-week cash-flow forecast.",
            ]),
        ],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("When is ABL better than a traditional cash-flow revolver?",
         "ABL is typically better when the borrower is asset-rich and "
         "leverage- or earnings-constrained: cyclical manufacturers, "
         "distributors, staffing firms, and businesses emerging from a "
         "turnaround. ABL also provides more reliable availability through "
         "earnings troughs because the borrowing base does not contract "
         "with EBITDA."),
        ("What is the 'springing' covenant structure?",
         "ABL facilities typically impose a single financial covenant — "
         "fixed-charge coverage ratio (FCCR) of 1.10x – 1.20x — that is "
         "tested only when excess availability falls below a trigger "
         "(commonly $15M or 15% of the commitment). Above the trigger, no "
         "financial maintenance covenants apply."),
        ("Are ineligibles negotiable?",
         "Each facility is negotiated at term-sheet stage. Cumulus sizes "
         "concentration limits, cross-age, and foreign-AR ineligibles "
         "based on the borrower's obligor base and credit-insurance "
         "profile. More permissive ineligibles often trade against "
         "advance-rate step-downs."),
        ("Can letters of credit be issued under the facility?",
         "Yes. Standby and commercial letters of credit may be issued "
         "within the ABL commitment, with availability reduced by the "
         "face amount of outstanding LCs. LC pricing of approximately "
         "2.00% per annum applies on the face."),
        ("How frequently is the borrowing base reported?",
         "Weekly for standard facilities; monthly for lighter-touch "
         "structures; and daily for facilities in heightened monitoring. "
         "Borrowing-base certificates are submitted through the Cumulus "
         "Business Online ABL module or by secure file transfer."),
        ("Can equipment or real estate be included in the borrowing base?",
         "Yes. Appraised ML&E is commonly included at 80–85% of Net "
         "Orderly Liquidation Value, typically amortized against the "
         "borrowing base over time. Real estate may be included on a "
         "term-loan basis alongside the revolver."),
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
            "Borrowing-base availability is recalculated at each reporting "
            "period and may decrease — materially and without notice — due "
            "to changes in eligible collateral, advance rates, or "
            "ineligibles and reserves imposed by the Bank in its discretion "
            "pursuant to the loan agreement.",
            "ABL facilities operate under a dominion-of-funds arrangement. "
            "All proceeds of collateral are directed to accounts subject "
            "to a blocked-account or deposit-account-control agreement "
            "(DACA) in favor of the Bank.",
            "Field-exam and appraisal costs are passed through to the "
            "borrower at Cumulus's standard rates. The Bank's collateral "
            "reviews are for internal credit and collateral management; "
            "borrowers should not rely on the Bank's diligence as a "
            "substitute for their own internal controls.",
            "Intercreditor and subordination arrangements with other "
            "secured creditors are required and are not negotiable absent "
            "exceptional circumstances.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
