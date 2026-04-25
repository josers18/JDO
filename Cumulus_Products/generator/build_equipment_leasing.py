"""Cumulus Equipment Leasing — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Equipment_Leasing.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Equipment Leasing",
        product_code="BL-EQP-LS-2026.04",
        category="Commercial Lending",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Equipment Leasing",
        lede=("Fair-Market-Value, $1-buyout, and TRAC lease structures "
              "for transportation, manufacturing, medical, technology, "
              "and construction equipment — with tax-advantaged "
              "ownership and flexible end-of-term options."),
        summary_rows=[
            ("Lease types", "FMV (operating)  ·  $1-buyout (capital)  ·  TRAC (vehicles)"),
            ("Implicit rate", "5.95% – 9.25%"),
            ("Terms", "24 – 84 months"),
            ("Asset classes", "Transportation  ·  manufacturing  ·  medical  ·  IT  ·  construction"),
            ("End-of-term options", "Purchase  ·  return  ·  renew  ·  upgrade"),
            ("Tax treatment", "Section 179 and bonus depreciation on capital leases"),
            ("Documentation", "Master Lease Agreement + schedules"),
            ("Sale-leaseback", "Available on existing owned equipment"),
        ],
        category_label="PRODUCT BROCHURE  ·  COMMERCIAL LENDING",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Equipment Leasing provides an alternative to equipment "
        "loans — with differentiated cash-flow, tax, and accounting "
        "outcomes. In a lease structure, Cumulus (the Lessor) owns the "
        "equipment and leases it to the business (the Lessee) for a fixed "
        "term at a fixed payment. The lessee operates the equipment as if "
        "it were owned, often with lower monthly payments than an "
        "equivalent loan, and elects an end-of-term option: purchase for "
        "fair-market value, renew, upgrade, or return. Lease structures "
        "are commonly preferred when the borrower values cash-flow "
        "preservation, end-of-term flexibility, or specific tax / "
        "accounting treatment."
    ))

    # LEASE TYPES
    story.append(B.section_header("Lease structures",
                                  kicker="Three primary types"))
    story.append(B.feature_grid([
        ("Fair-Market-Value (FMV) lease",
         "True (operating) lease. Cumulus retains depreciation; lessee "
         "treats payments as operating expense. End-of-term: purchase at "
         "FMV, renew, or return. Appropriate when flexibility is valued "
         "or when the equipment will be upgraded at term-end."),
        ("$1-buyout (capital) lease",
         "Conditional-sale / finance lease. Lessee takes depreciation "
         "(Section 179 / bonus depreciation) and records the asset on its "
         "balance sheet. End-of-term: buyout for $1 and retain the "
         "equipment. Appropriate when ownership is desired."),
        ("TRAC lease (vehicles)",
         "Terminal-Rental-Adjustment-Clause lease for over-the-road "
         "titled vehicles (Class 6–8, trailers, specialty vehicles). "
         "Lessee stipulates residual; final adjustment based on "
         "disposition proceeds. Treated as a capital lease for tax; "
         "operating for book."),
        ("Sale-leaseback",
         "Lessee sells existing owned equipment to Cumulus and leases it "
         "back. Unlocks capital from the balance sheet while preserving "
         "operational use. Useful for working-capital generation and "
         "acquisition financing."),
        ("Master Lease Agreement",
         "Umbrella agreement enabling multiple equipment schedules over "
         "time under pre-negotiated terms. Each schedule is a distinct "
         "lease; the MLA governs overall obligations and default terms."),
        ("Tax-exempt / municipal lease",
         "Structured for qualifying public-sector lessees (municipalities, "
         "school districts, authorities). Non-appropriation language "
         "preserves tax-exempt status."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # PRICING
    story.append(B.section_header("Implicit rates and residual structure",
                                  kicker="Pricing"))
    story.append(B.body_para(
        "Lease payments are calculated from three inputs: equipment cost, "
        "assumed residual value at term end, and the implicit rate. "
        "Larger assumed residuals reduce monthly payments but raise "
        "end-of-term purchase cost; smaller residuals produce higher "
        "monthly payments with a lower or $1 buyout."
    ))
    story.append(B.data_table(
        header=["Lease type", "Implicit rate",
                "Typical residual", "Typical term", "Buyout"],
        rows=[
            ["FMV — medical imaging",
             "5.95% – 7.25%", "10 – 20%", "60 months",
             "Fair market value at term-end"],
            ["FMV — manufacturing / CNC",
             "6.50% – 7.95%", "10 – 15%", "60 months",
             "FMV at term-end"],
            ["FMV — IT / technology",
             "7.50% – 9.25%", "0 – 10%", "36 months",
             "FMV or upgrade"],
            ["$1-buyout — general",
             "6.75% – 8.50%", "$1 (nominal)", "60 – 84 months",
             "$1 at term-end"],
            ["TRAC — over-the-road",
             "6.50% – 7.75%", "20 – 35%", "60 months",
             "Residual adjusted via TRAC"],
            ["Sale-leaseback — existing assets",
             "7.00% – 8.25%", "15 – 25%",
             "Balance of useful life", "FMV or pre-agreed schedule"],
            ["Tax-exempt / municipal",
             "Tax-exempt rate (varies)", "$1 or minimal", "3 – 10 years",
             "Non-appropriation structure"],
        ],
        col_widths=[2.0 * inch, 1.3 * inch, 1.3 * inch, 1.2 * inch, 1.5 * inch],
    ))

    # LOAN VS LEASE COMPARISON CHART
    story.append(B.section_header("Loan vs. lease monthly cash-flow",
                                  kicker="Side-by-side"))
    story.append(B.body_para(
        "The chart below compares monthly cash outflows on a $500,000 "
        "equipment acquisition under four structures: a 60-month 7.00% "
        "loan, a 60-month FMV lease assuming 15% residual at 6.75%, a "
        "60-month $1-buyout lease at 7.25%, and a 60-month TRAC lease "
        "assuming 25% residual at 6.95%. FMV and TRAC structures produce "
        "the lowest monthly cash but imply end-of-term decisions."
    ))
    story.append(B.bar_comparison_chart(
        labels=["Loan 7.00%", "FMV lease (15% res.)",
                "$1-buyout (no res.)", "TRAC (25% res.)"],
        values=[9900, 8800, 9990, 8300],
        title="$500,000 equipment — illustrative 60-month monthly payment",
        ylabel="Monthly payment (USD)",
        value_fmt=lambda v: f"${v:,.0f}",
    ))

    # TAX / ACCOUNTING
    story.append(B.section_header("Tax and accounting treatment",
                                  kicker="Decision framework"))
    story.append(B.data_table(
        header=["Dimension", "$1-buyout (capital) lease",
                "FMV (operating) lease", "TRAC lease"],
        rows=[
            ["Title / ownership (legal)",
             "Cumulus until $1 buyout",
             "Cumulus (lessee may purchase at FMV)",
             "Cumulus (lessee stipulates residual)"],
            ["Depreciation (tax)",
             "Lessee takes (Section 179, bonus, MACRS)",
             "Cumulus takes",
             "Lessee takes (treated as financing for tax)"],
            ["Book treatment (ASC 842)",
             "Finance lease — asset + liability on BS",
             "Operating lease — ROU asset + lease liability",
             "Operating — ROU asset + lease liability"],
            ["Payment — income statement",
             "Interest + depreciation",
             "Rental expense",
             "Rental expense (book)"],
            ["End-of-term decision",
             "None — purchase for $1",
             "Purchase at FMV, renew, or return",
             "TRAC adjustment based on disposition"],
            ["Residual risk",
             "Lessee (owns equipment)",
             "Cumulus (owns residual)",
             "Lessee (TRAC clause)"],
        ],
        col_widths=[1.6 * inch, 1.9 * inch, 1.9 * inch, 1.9 * inch],
    ))

    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Section 179 and bonus depreciation",
        "Under the current IRC, Section 179 expensing and bonus "
        "depreciation are generally available on capital leases "
        "($1-buyout) and TRAC leases where the lessee is treated as the "
        "tax owner. Operating leases (FMV) do not qualify — Cumulus, as "
        "tax owner of the equipment, retains depreciation. Consult your "
        "tax advisor to confirm the classification and deductibility for "
        "your specific situation.",
    ))

    # UNDERWRITING
    story.append(B.section_header("Underwriting and documentation",
                                  kicker="Credit and legal"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Credit parameters"),
            *B.bullet_list([
                "Minimum DSCR of <b>1.20x</b> on a trailing-twelve-month basis.",
                "Minimum two years of operating history; start-ups "
                "considered with strong sponsor experience.",
                "Personal guaranty of each 20%+ owner (waivable above "
                "$2M with qualifying corporate credit).",
                "Residual-sensitive structures require asset-type "
                "familiarity and secondary-market expertise (handled by "
                "Cumulus Equipment Finance underwriting).",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation"),
            *B.bullet_list([
                "Master Lease Agreement + applicable lease schedule for "
                "each equipment tranche.",
                "Vendor invoice, purchase order, or sale agreement "
                "(sale-leaseback).",
                "UCC-1 precautionary filing; Certificate of Title lien "
                "for titled equipment.",
                "Insurance certificate naming Cumulus Bank, N.A. as "
                "loss-payee and additional insured.",
                "Business and personal tax returns, current interim "
                "financial statements (application-only for small tickets).",
                "Non-appropriation language for municipal / tax-exempt "
                "lessees.",
            ]),
        ],
    ))

    # PROCESS
    story.append(B.section_header("Process and timing",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "What happens", "Timing"],
        rows=[
            ["1  ·  Structure",
             "Relationship Manager and Equipment Finance Specialist scope "
             "asset class, useful life, tax objectives, and lease type.",
             "Days 1–3"],
            ["2  ·  Application",
             "Credit application submitted with financials and equipment "
             "detail (vendor quote or purchase order).",
             "Days 3–7"],
            ["3  ·  Approval",
             "Credit decision; lease term, implicit rate, residual, and "
             "end-of-term options confirmed.",
             "Days 7–12"],
            ["4  ·  Documentation",
             "Master Lease Agreement executed (first-time); equipment "
             "schedule executed; vendor acceptance obtained.",
             "Days 12–20"],
            ["5  ·  Funding",
             "Cumulus pays the vendor; equipment delivered and accepted; "
             "commencement date set. First payment due at delivery or 30 "
             "days thereafter.",
             "Day of acceptance"],
            ["6  ·  End of term",
             "Cumulus provides written notice 90–120 days prior. Lessee "
             "elects among purchase / renew / return / upgrade options.",
             "End-of-term month"],
        ],
        col_widths=[1.2 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # END OF TERM
    story.append(B.section_header("End-of-term options",
                                  kicker="FMV / TRAC lease"))
    story += B.bullet_list([
        "<b>Purchase at fair-market value</b> — appraisal by Cumulus-"
        "engaged appraiser; lessee may purchase outright or trade in.",
        "<b>Renew</b> — extend the lease at a pre-agreed renewal rate "
        "(typically 60–75% of the original monthly payment) for a "
        "negotiated renewal term.",
        "<b>Return</b> — deliver the equipment to a Cumulus-designated "
        "location in 'normal wear and tear' condition. Rebilling for "
        "excessive wear or missing items may apply.",
        "<b>Upgrade</b> — trade in the equipment for a new acquisition "
        "under a new lease schedule; Cumulus credits the FMV against the "
        "new purchase (subject to appraisal).",
        "<b>Month-to-month extension</b> — extend at the final monthly "
        "payment rate while end-of-term decision is finalized; typically "
        "available for up to 12 months.",
    ])

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Lease vs. loan — is a lease really cheaper?",
         "Monthly lease payments are typically lower than loan payments "
         "on comparable financing because the residual value is preserved "
         "at term-end — the lessee pays only for use during the lease "
         "term, not for the entire asset value. However, if the lessee "
         "exercises the FMV purchase option, total cost may exceed the "
         "loan alternative depending on residual realization."),
        ("Can I take Section 179 on a lease?",
         "On capital ($1-buyout) leases and TRAC leases, the lessee is "
         "generally treated as the tax owner and may take Section 179 "
         "expensing and bonus depreciation. On FMV (true) leases, "
         "Cumulus is the tax owner and the lessee may not take "
         "depreciation. Tax treatment should be confirmed with your CPA."),
        ("What is a TRAC clause?",
         "A Terminal-Rental-Adjustment-Clause is specific to titled "
         "vehicle leases. Lessee and Cumulus stipulate a residual value "
         "at lease inception; at term-end, the vehicle is sold, and the "
         "difference between the stipulated residual and actual sale "
         "proceeds is settled between the parties. This preserves lease "
         "treatment for book while allowing lessee-friendly economics."),
        ("Can a sale-leaseback help my cash position?",
         "Yes. A sale-leaseback unlocks capital from fully-owned "
         "equipment: Cumulus buys the equipment at appraised market value "
         "and leases it back to you for continued operational use. The "
         "purchase price becomes immediate liquidity; monthly lease "
         "payments are predictable cash-flow."),
        ("What is a Master Lease Agreement?",
         "A Master Lease Agreement (MLA) is an umbrella contract that "
         "allows you to add new equipment schedules under pre-negotiated "
         "terms. Each schedule is a standalone lease, but the MLA "
         "addresses shared provisions (default, insurance, assignment). "
         "This reduces documentation time on subsequent deals."),
        ("What counts as 'normal wear and tear' at return?",
         "Cumulus uses industry-standard return condition guidelines "
         "specific to the equipment class — published with the lease "
         "schedule. Return inspections are conducted by an independent "
         "inspector for larger transactions; findings are documented "
         "with photographic support and reconciled against the guideline."),
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
            "Equipment leases are commercial leases governed by Article 2A "
            "of the Uniform Commercial Code. Lease classification for tax "
            "and accounting purposes depends on facts and circumstances, "
            "including IRS true-lease criteria (Revenue Procedures 2001-28 "
            "and 2001-29) and ASC 842 classification tests.",
            "Residual values shown are illustrative. Actual residuals are "
            "negotiated at lease inception based on equipment class, "
            "expected market conditions, use case, and Cumulus's "
            "end-of-term realization expectations. FMV at end-of-term "
            "is determined by independent appraisal.",
            "Cumulus does not provide tax, legal, or accounting advice. "
            "Lessees should consult their own advisors regarding the "
            "appropriate lease structure, depreciation treatment, and "
            "financial-statement classification.",
            "Tax-exempt leases to qualifying public-sector lessees are "
            "subject to applicable IRS rules (IRC § 103) and non-"
            "appropriation provisions required under state constitutional "
            "debt limits.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
