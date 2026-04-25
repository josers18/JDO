"""Cumulus SBA Loans — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_SBA_Loans.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus SBA Loans",
        product_code="BL-SBA-2026.04",
        category="Commercial Lending",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="SBA Loans",
        lede=("Cumulus is an SBA Preferred Lender, delivering 7(a), 504, "
              "and Express credit with expedited decisioning, longer "
              "amortization, and broader eligibility than conventional "
              "commercial credit."),
        summary_rows=[
            ("Preferred Lender status", "SBA Preferred Lender Program (PLP)"),
            ("7(a)", "Up to $5,000,000  ·  Prime + 2.25% – 4.75%"),
            ("504", "Up to $5,500,000  ·  bank 1st + CDC 2nd at ~6.00%"),
            ("SBA Express", "Up to $500,000  ·  36-hour SBA approval"),
            ("Use of proceeds", "Real estate, equipment, working capital, acquisitions, refi"),
            ("Guaranty", "75% – 85% SBA guaranty depending on program and size"),
            ("Personal guaranty", "Required from each 20%+ owner"),
            ("Amortization", "Up to 25 yrs (real estate)  ·  10 yrs (other)"),
        ],
        category_label="PRODUCT BROCHURE  ·  COMMERCIAL LENDING"
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The U.S. Small Business Administration does not lend directly. "
        "Instead, the SBA guarantees a portion of loans made by "
        "participating banks to qualifying small businesses — expanding "
        "access to credit for borrowers whose size, structure, or "
        "collateral profile does not fit a conventional commercial "
        "underwriting. As an SBA Preferred Lender, Cumulus has delegated "
        "credit authority to approve SBA-guaranteed loans internally, "
        "substantially shortening the decision cycle. Cumulus offers the "
        "three principal SBA programs: 7(a) for general-purpose lending, "
        "504 for owner-occupied real estate and long-lived equipment, and "
        "SBA Express for smaller working-capital needs."
    ))

    # PROGRAM COMPARISON
    story.append(B.section_header("Program overview",
                                  kicker="7(a), 504, and Express"))
    story.append(B.feature_grid([
        ("SBA 7(a)",
         "General-purpose loan for working capital, equipment, real estate, "
         "business acquisitions, partner buyouts, and debt refinance. Amounts "
         "up to $5M; variable rate Prime + 2.25% – 4.75%; SBA guaranty 75% "
         "($150K+) / 85% (smaller)."),
        ("SBA 504",
         "Owner-occupied real estate and long-lived fixed assets. Bank "
         "provides a 50% first mortgage; a Certified Development Company "
         "(CDC) provides a 40% SBA-guaranteed second at a fixed CDC "
         "debenture rate (illustrative 6.00%); borrower equity 10% (15% "
         "for start-ups or special-purpose)."),
        ("SBA Express",
         "Fast-track 7(a) loan up to $500,000 with 36-hour SBA approval "
         "commitment (Cumulus delegated authority typically decisions in "
         "5–7 business days). Rate Prime + 4.5% – 6.5%; SBA guaranty 50%."),
        ("Export Working Capital",
         "Financing for export-related inventory and receivables. Up to $5M "
         "with SBA guaranty up to 90%. Available to businesses with "
         "established export revenue."),
        ("International Trade",
         "Permanent financing for fixed assets and working capital tied to "
         "export expansion. Up to $5M with 90% SBA guaranty on the "
         "export-related portion."),
        ("Veterans Advantage",
         "Reduced SBA guaranty fees for businesses 51%+ owned by veterans, "
         "service-disabled veterans, active-duty military, and qualifying "
         "spouses."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # RATES
    story.append(B.section_header("Rates and fees by program",
                                  kicker="Pricing"))
    story.append(B.data_table(
        header=["Program", "Amount ceiling", "Rate (illustrative)",
                "SBA guaranty fee", "Max maturity"],
        rows=[
            ["7(a) — Standard",
             "$5,000,000",
             "Prime + 2.25% – 4.75%  (10.25% – 12.75%)",
             "3.5% on guaranteed portion > $150K (waivable)",
             "25 yrs RE  ·  10 yrs other"],
            ["7(a) — Small Loan (≤ $350K)",
             "$350,000",
             "Prime + 4.25% – 4.75%  (12.25% – 12.75%)",
             "0% under $150K",
             "10 yrs"],
            ["504 — CDC portion",
             "$5,500,000",
             "6.00% fixed (CDC debenture; set monthly)",
             "0.50% CDC processing",
             "10, 20, or 25 yrs"],
            ["504 — bank portion",
             "50% of project",
             "6.75% – 7.75% fixed (5/10-yr reset)",
             "None",
             "10 yrs (5-yr balloon typical)"],
            ["SBA Express",
             "$500,000",
             "Prime + 4.5% – 6.5%  (12.50% – 14.50%)",
             "2.0% – 3.5%",
             "10 yrs (working capital)"],
            ["Export Working Capital",
             "$5,000,000",
             "Prime + 2.50% – 3.50%",
             "0.25% annual guaranty",
             "Up to 3 yrs"],
        ],
        col_widths=[1.5 * inch, 1.1 * inch, 1.9 * inch, 1.6 * inch, 1.3 * inch],
    ))

    # AMORTIZATION CHART
    story.append(B.section_header("Illustrative owner-occupied 504 structure",
                                  kicker="504 cash-flow illustration"))
    story.append(B.body_para(
        "A $2,500,000 owner-occupied real-estate project — 50% Cumulus "
        "first ($1.25M), 40% CDC second ($1.0M), 10% borrower equity "
        "($250K) — supports the illustration below. The bank piece is "
        "amortized over 25 years at 7.25% with a 10-year balloon; the "
        "CDC debenture is fully amortizing at 6.00% over 25 years."
    ))
    story.append(B.amortization_chart(
        principal=1_250_000, apr=7.25, years=25,
        title="Cumulus first mortgage — $1,250,000 at 7.25% APR, 25-yr amort",
    ))

    # STRUCTURE DETAIL
    story.append(B.section_header("SBA 504 structure in detail",
                                  kicker="How 504 is assembled"))
    story.append(B.data_table(
        header=["Project component", "Percent of project", "Source",
                "Typical rate / tenor"],
        rows=[
            ["Land and building (acquisition or construction)",
             "50%",
             "Cumulus Bank — first mortgage",
             "6.75%–7.75% fixed; 25-yr amort; 10-yr balloon"],
            ["CDC debenture (SBA-guaranteed)",
             "40%",
             "Certified Development Company",
             "6.00% fixed; 25-yr fully amortizing"],
            ["Borrower equity injection",
             "10% (15% start-up / 15% special-purpose)",
             "Borrower",
             "Cash or SBA-approved seller carryback"],
            ["Soft costs — eligible",
             "Included in project",
             "Financed within 504 structure",
             "Per SBA SOP 50 10"],
            ["Total project",
             "100%",
             "Bank (1st) + CDC (2nd) + equity",
             "—"],
        ],
        col_widths=[2.2 * inch, 1.3 * inch, 1.8 * inch, 2.1 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Why owners choose 504",
        "504 provides the lowest blended cost of capital for owner-"
        "occupied commercial real estate, fixed-rate for 25 years on the "
        "CDC piece with only 10% borrower equity. The bank first, CDC "
        "second, and borrower equity together fund up to 90% of project "
        "cost — well above conventional CRE LTV limits.",
    ))

    # ELIGIBILITY
    story.append(B.section_header("Eligibility and documentation",
                                  kicker="SBA requirements"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("SBA eligibility criteria"),
            *B.bullet_list([
                "Operate as a for-profit business in the United States (or "
                "its territories); meet SBA size standard for industry "
                "(varies by NAICS — typically ≤ $10M – $40M revenue).",
                "Demonstrate the ability to repay from projected cash flow.",
                "Invest equity and have reasonable owner capital.",
                "Use the loan proceeds for an eligible business purpose.",
                "Be unable to obtain credit on reasonable terms from "
                "non-federal sources (credit-elsewhere test).",
                "Not engaged in an ineligible activity: lending, speculative "
                "real estate, gambling, pyramid sales, religious activities.",
                "Principals must be of good character (SBA Form 912 background review).",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "SBA Forms 1919, 912 (each principal), 413 (personal "
                "financial statement).",
                "Three years of business tax returns with all schedules and K-1s.",
                "Three years of personal tax returns for each 20%+ owner.",
                "Current YTD interim financial statement (within 60 days).",
                "Business debt schedule itemizing all outstanding commercial debt.",
                "Detailed use-of-proceeds schedule with supporting quotes, "
                "appraisals, or purchase agreements.",
                "Two-year financial forecast with assumptions narrative.",
                "Corporate formation documents and authorizing resolution.",
                "For real-estate transactions: purchase agreement, "
                "environmental Phase I, appraisal, and occupancy schedule.",
            ]),
        ],
    ))

    # PROCESS
    story.append(B.section_header("SBA loan process",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "What happens", "Timing"],
        rows=[
            ["1  ·  Pre-qualification",
             "Relationship Manager and SBA Specialist review eligibility, "
             "program fit (7(a) vs 504 vs Express), and high-level structure.",
             "Days 1–3"],
            ["2  ·  Application package",
             "Client completes SBA forms; Cumulus submits complete package "
             "to internal SBA Credit Committee.",
             "Days 3–14"],
            ["3  ·  Credit decision",
             "Preferred Lender delegated approval issued by Cumulus; SBA "
             "loan number obtained from SBA E-Tran.",
             "Days 14–21 (7(a) / 504)"],
            ["4  ·  Closing preparation",
             "Title, appraisal, environmental, UCC search, and SBA-required "
             "authorizations prepared. For 504, CDC engages concurrently.",
             "Days 21–60"],
            ["5  ·  Funding",
             "Cumulus funds the bank portion at closing. For 504, CDC "
             "debenture funds 45–75 days later at next debenture sale; "
             "interim financing bridges.",
             "Day 60–120"],
            ["6  ·  Servicing",
             "Ongoing servicing by Cumulus including annual site visit for "
             "larger loans, 1502 reporting to SBA, and covenant review.",
             "Ongoing"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # COVENANTS
    story.append(B.section_header("Covenants and ongoing requirements",
                                  kicker="Post-closing"))
    story.append(B.data_table(
        header=["Requirement", "Details"],
        rows=[
            ["Life insurance",
             "SBA generally requires life insurance on key owners for amounts "
             "above $350,000, assigned to Cumulus as loss-payee."],
            ["Hazard and flood insurance",
             "Required on real-estate collateral; flood insurance mandatory "
             "in Special Flood Hazard Areas."],
            ["Occupancy",
             "Owner-occupied CRE must be at least 51% occupied by the borrower "
             "(existing building) or 60% (new construction with 80% planned "
             "occupancy within 10 years)."],
            ["Annual financial statements",
             "Company-prepared financials within 120 days of fiscal year end; "
             "CPA-reviewed or audited for larger facilities."],
            ["Personal guaranty",
             "Required from each owner of 20% or more."],
            ["Site visit",
             "Annual site visit by Cumulus for loans $1M and above."],
        ],
        col_widths=[1.9 * inch, 5.4 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("What is Cumulus's Preferred Lender status?",
         "Cumulus participates in the SBA Preferred Lender Program (PLP), "
         "which grants delegated credit and servicing authority for SBA "
         "7(a) loans. PLP allows Cumulus to make credit decisions without "
         "SBA pre-approval, substantially shortening the decision timeline "
         "from 30–45 days to 15–21 days on complete packages."),
        ("7(a) vs 504 — which program fits my project?",
         "Use 504 for owner-occupied commercial real estate, major "
         "construction, and long-lived fixed equipment where a fixed-rate, "
         "fully-amortizing 25-year CDC debenture on 40% of the project is "
         "the lowest-cost structure. Use 7(a) when you need working capital, "
         "business acquisition, goodwill, or multi-purpose financing that "
         "504 does not cover."),
        ("What fees does SBA charge?",
         "SBA charges a guaranty fee on 7(a) loans: 0% under $150K, "
         "2.77% on the guaranteed portion for $150K–$700K, 3.27% for "
         "$700K–$1M, and 3.5% above $1M. The fee may be financed into the "
         "loan. 504 CDC fees total approximately 2.65% of the debenture "
         "(financed)."),
        ("Is a personal guarantee always required?",
         "Yes, for every owner of 20% or more of the borrower. This is a "
         "non-negotiable SBA requirement and applies across all three "
         "programs. Guaranties are joint and several; each guarantor "
         "submits a personal financial statement (SBA Form 413)."),
        ("Can I refinance conventional debt with an SBA loan?",
         "Yes, subject to SBA refinance rules. For 7(a) refinancing, the "
         "new SBA loan must provide a substantial benefit (generally a "
         "minimum 10% payment reduction) and the existing debt must be in "
         "current standing. 504 refinancing is available for debt at least "
         "six months old, originally used for eligible 504 purposes."),
        ("Does Cumulus offer construction financing through SBA?",
         "Yes. Cumulus provides interim construction financing alongside "
         "SBA 504 take-out. Construction draws are managed on a percentage-"
         "complete basis with third-party inspector certification, and "
         "convert to permanent financing at certificate of occupancy."),
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
            "SBA-guaranteed loans are subject to SBA Standard Operating "
            "Procedure 50 10 and applicable SBA rules and notices. "
            "Eligibility, rate caps, guaranty fees, and program parameters "
            "are set by the U.S. Small Business Administration and may "
            "change without notice to Cumulus borrowers.",
            "Cumulus is an SBA Preferred Lender under 13 C.F.R. § 120.440 "
            "et seq. Delegated credit authority does not relieve SBA of "
            "oversight responsibility or reduce SBA guaranty enforcement.",
            "504 debenture rates are set monthly at the time of debenture "
            "sale. The illustrative CDC debenture rate of 6.00% is for "
            "reference only; the rate applicable to a specific 504 "
            "transaction is fixed at debenture funding.",
            "Participation by Cumulus in the SBA Veterans Advantage and "
            "Export Working Capital programs does not constitute an "
            "endorsement by SBA or the U.S. government.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
