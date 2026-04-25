"""Cumulus Commercial Real Estate Financing — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Commercial_Real_Estate_Financing.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Commercial Real Estate Financing",
        product_code="BL-CRE-2026.04",
        category="Commercial Lending",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Commercial Real Estate Financing",
        lede=("Purchase, construction, and permanent financing for "
              "owner-occupied and investor commercial real estate — "
              "underwritten to DSCR and LTV, with fixed and floating "
              "options indexed to the swap curve."),
        summary_rows=[
            ("Property types", "Owner-occupied  ·  investor  ·  mixed-use  ·  special-purpose"),
            ("Loan amounts", "$500,000 – $50,000,000 (syndicated above $25M)"),
            ("Rates (fixed 3/5/7/10-yr)", "6.50% – 8.25% (swap-indexed)"),
            ("Amortization", "25-year typical; 30-year on multifamily"),
            ("Maximum LTV", "75% investor  ·  85% owner-occupied (with SBA 504)"),
            ("Minimum DSCR", "1.25x (investor); 1.20x (owner-occupied)"),
            ("Prepayment", "Yield maintenance or declining step-down"),
            ("Recourse", "Full recourse  ·  partial recourse  ·  non-recourse available"),
        ],
        category_label="PRODUCT BROCHURE  ·  COMMERCIAL LENDING",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus provides acquisition, refinance, and construction "
        "financing for a broad range of commercial real estate — "
        "owner-occupied properties for operating businesses, income-"
        "producing investor properties, and mixed-use and special-purpose "
        "assets. Loans are underwritten to the property's debt-service-"
        "coverage ratio (DSCR) and loan-to-value (LTV), with additional "
        "guarantor and global-cash-flow underwriting at Cumulus's "
        "discretion. Fixed-rate options are priced off the swap curve; "
        "floating-rate options reference SOFR. Construction financing is "
        "offered alongside permanent take-out commitments to provide "
        "single-source execution."
    ))

    # PROPERTY TYPES
    story.append(B.section_header("Property types and underwriting",
                                  kicker="What we finance"))
    story.append(B.feature_grid([
        ("Office",
         "Suburban and Class-B urban office, medical office, and single-"
         "tenant triple-net. Lease-up and tenant-improvement reserves "
         "underwritten; vacancy stresses applied."),
        ("Industrial / warehouse",
         "Bulk distribution, last-mile logistics, flex, and light "
         "manufacturing. Clear-height, column spacing, and dock/truck-court "
         "configuration reviewed."),
        ("Retail",
         "Grocery-anchored, neighborhood, and strip retail. Credit-tenant "
         "concentration, rollover schedule, and in-place rents vs. market "
         "tested."),
        ("Multifamily",
         "Market-rate and affordable multifamily (5+ units). 30-year "
         "amortization available; stabilized and lease-up underwriting. "
         "HUD and Fannie/Freddie permanent take-out partners."),
        ("Owner-occupied",
         "51%+ owner occupancy. Up to 85% LTV with SBA 504 structure; "
         "conventional up to 80% LTV for strongest profiles."),
        ("Special-purpose",
         "Hotel, self-storage, senior living, healthcare, religious, and "
         "specialty retail. Sponsor experience and third-party operator "
         "reviewed."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # RATES
    story.append(B.section_header("Rates and structure",
                                  kicker="Pricing"))
    story.append(B.body_para(
        "Fixed-rate facilities are priced at a spread over the interpolated "
        "swap curve. The range below is illustrative and reflects "
        "differentiation by property type, risk grade, LTV, DSCR, and "
        "recourse. Rates are quoted at term-sheet stage and locked for up "
        "to 60 days subject to execution."
    ))
    story.append(B.data_table(
        header=["Fixed term", "Index", "Spread (bps)",
                "All-in rate (illustrative)", "Typical amort."],
        rows=[
            ["3-year fixed", "3-yr swap", "+225 to +350",
             "6.50% – 7.75%", "25 yrs"],
            ["5-year fixed", "5-yr swap", "+235 to +360",
             "6.60% – 7.85%", "25 yrs"],
            ["7-year fixed", "7-yr swap", "+245 to +375",
             "6.70% – 8.00%", "25 yrs"],
            ["10-year fixed", "10-yr swap", "+260 to +400",
             "6.85% – 8.25%", "25–30 yrs"],
            ["Floating — SOFR-based", "Term SOFR (1-mo)",
             "+225 to +400", "Indexed, resets monthly", "25 yrs"],
            ["Construction + permanent",
             "Prime or SOFR (construction); swap (perm.)",
             "+275 to +425 (construction)",
             "10.25% – 12.25% interim  ·  perm. at take-out",
             "36-mo construction; 25-yr perm."],
        ],
        col_widths=[1.4 * inch, 1.3 * inch, 1.2 * inch, 1.9 * inch, 1.5 * inch],
    ))

    # AMORTIZATION CHART
    story.append(B.section_header("Illustrative investor CRE amortization",
                                  kicker="Payment profile"))
    story.append(B.body_para(
        "The illustration below models a $3,500,000 investor-owned retail "
        "center financed at 7.25% fixed for 10 years on a 25-year "
        "amortization, with a balloon at maturity equal to the remaining "
        "principal."
    ))
    story.append(B.amortization_chart(
        principal=3_500_000, apr=7.25, years=25,
        title="$3,500,000 investor CRE loan — 7.25% APR, 25-yr amort",
    ))

    # UNDERWRITING
    story.append(B.section_header("Underwriting parameters",
                                  kicker="Credit standards"))
    story.append(B.data_table(
        header=["Parameter", "Investor CRE",
                "Owner-occupied", "Special-purpose"],
        rows=[
            ["Maximum LTV (stabilized)",
             "75%",
             "80% conv.  ·  85% w/ SBA 504",
             "65% – 70%"],
            ["Minimum DSCR",
             "1.25x",
             "1.20x (global 1.25x)",
             "1.30x – 1.40x"],
            ["Minimum debt yield",
             "9.00%",
             "Not tested (coverage-driven)",
             "10.00% +"],
            ["Maximum LTC (construction)",
             "75% (strong sponsor)",
             "80%",
             "65%"],
            ["Recourse",
             "Full or partial",
             "Full (with SBA where applicable)",
             "Full"],
            ["Sponsor net worth",
             "≥ loan amount",
             "Reasonable",
             "1.5x loan amount"],
            ["Sponsor liquidity",
             "≥ 10% of loan",
             "Reasonable",
             "≥ 15%"],
            ["Occupancy test (investor)",
             "85% stabilized",
             "Not applicable",
             "Varies by type"],
        ],
        col_widths=[1.7 * inch, 1.6 * inch, 1.9 * inch, 1.7 * inch],
    ))

    # DOCUMENTATION
    story.append(B.section_header("Documentation required",
                                  kicker="Diligence package"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Property-level"),
            *B.bullet_list([
                "Commercial real-estate appraisal (MAI-designated for "
                "complex assets).",
                "Phase I Environmental Site Assessment (ASTM E1527-21); "
                "Phase II if Phase I recommends further investigation.",
                "Property Condition Report (ASTM E2018-15) for assets 10+ "
                "years old or construction over $5M.",
                "Title commitment with ALTA extended coverage and zoning "
                "endorsement; survey (ALTA/NSPS).",
                "Rent roll, tenant leases (abstracts for credit tenants), "
                "trailing 24-month operating statements.",
                "Purchase and sale agreement (acquisition); payoff letter "
                "(refinance); budgeted sources-and-uses (construction).",
            ]),
        ],
        right_flowables=[
            B.sub_header("Sponsor-level"),
            *B.bullet_list([
                "Three years business and personal federal tax returns.",
                "Current personal financial statement signed within 90 days.",
                "Schedule of real-estate investments (SREO) with property "
                "performance data.",
                "Resume of principal(s) and property-management affiliate.",
                "Formation documents of borrowing entity (typically a "
                "single-purpose LLC), operating agreement, and authorizing "
                "resolution.",
                "Non-recourse carve-out guarantor and environmental "
                "indemnity (non-recourse transactions).",
            ]),
        ],
    ))

    # PROCESS
    story.append(B.section_header("Process and timeline",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "What happens", "Timing"],
        rows=[
            ["1  ·  Initial screen",
             "Relationship Manager and CRE Underwriter screen property, "
             "sponsor, and structure; preliminary sizing issued.",
             "Days 1–5"],
            ["2  ·  Term sheet",
             "Non-binding indicative term sheet: amount, rate, term, "
             "amort., LTV, DSCR test, recourse, reserves, and fees.",
             "Days 5–10"],
            ["3  ·  Third-party reports",
             "Appraisal, Phase I, PCR, and title ordered concurrently with "
             "formal credit underwriting.",
             "Days 10–45"],
            ["4  ·  Credit approval",
             "Credit Committee approval upon receipt of third-party reports; "
             "commitment letter issued.",
             "Days 35–50"],
            ["5  ·  Closing",
             "Loan agreement, mortgage / deed of trust, assignment of "
             "rents, environmental indemnity, and guaranties executed. "
             "Title recording; funds disbursed.",
             "Days 50–75"],
            ["6  ·  Construction (if applicable)",
             "Monthly draws on percent-complete basis with third-party "
             "inspector certification; conversion to permanent at CO.",
             "Ongoing"],
        ],
        col_widths=[1.4 * inch, 4.4 * inch, 1.5 * inch],
    ))

    # COVENANTS
    story.append(B.section_header("Reserves and ongoing obligations",
                                  kicker="Post-closing"))
    story += B.bullet_list([
        "<b>Tax and insurance escrows</b> — monthly reserves of 1/12 of "
        "annual taxes and insurance; waivable for strong sponsors.",
        "<b>Replacement reserves</b> — $0.15–$0.30 per square foot per "
        "annum (property-type dependent) for capital replacements.",
        "<b>Tenant improvement / leasing commission reserves</b> — 60–90 "
        "day rollover assumption on investor retail and office.",
        "<b>Debt-service-coverage testing</b> — annual DSCR test; "
        "cash-flow sweep to principal upon DSCR below 1.10x (investor) "
        "or 1.05x (owner-occupied).",
        "<b>Rent-roll reporting</b> — quarterly rent roll for investor "
        "properties; annual operating statements.",
        "<b>Site visit</b> — annual site inspection for loans $2M and above.",
    ])
    story.append(Spacer(1, 0.06 * inch))

    story.append(B.callout_box(
        "Prepayment protection",
        "Cumulus offers two prepayment structures. Yield maintenance "
        "preserves Cumulus's economic yield to maturity and is typical on "
        "longer-fixed-term facilities. A declining step-down (e.g., "
        "5-4-3-2-1) is an alternative on shorter-term structures. Both "
        "open to full prepayment in the final 90 days before maturity.",
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("What LTV and DSCR do you require?",
         "Maximum LTV is 75% on stabilized investor properties, 80% on "
         "conventional owner-occupied, and 85% when combined with SBA 504. "
         "Minimum DSCR is 1.25x on investor (1.20x on owner-occupied) at "
         "the in-place rate; 1.15x stressed at a 2% rate shock. "
         "Special-purpose assets carry higher coverage requirements."),
        ("Do you offer non-recourse financing?",
         "Yes. Non-recourse is available on strongly positioned stabilized "
         "investor properties with experienced sponsors, typically at 65% "
         "LTV and above 1.35x DSCR. Customary bad-boy (non-recourse "
         "carve-out) guarantees and an environmental indemnity apply."),
        ("Can the rate be locked before closing?",
         "Yes. Rate locks are available at term-sheet acceptance for 60 "
         "days subject to a rate-lock deposit. For longer periods, a "
         "forward-rate lock through Cumulus Capital Markets is available "
         "up to 180 days."),
        ("Do you finance construction?",
         "Yes. Cumulus provides construction loans with a permanent "
         "take-out at certificate of occupancy. Construction financing is "
         "priced at Prime or SOFR + 225–425 bps; monthly draws are funded "
         "on a percent-complete basis with third-party inspector certification."),
        ("How are appraisals and environmentals handled?",
         "Cumulus engages appraisers, environmental consultants, and "
         "engineers from its approved vendor list; fees are billed "
         "directly to the borrower. Reports are commissioned upon term-"
         "sheet acceptance and typically return within 30–45 days for "
         "straightforward property types."),
        ("Will Cumulus finance a 1031-exchange property?",
         "Yes, and Cumulus's Real Estate Finance team is experienced in "
         "coordinating financing within 1031-exchange timelines. Early "
         "engagement is essential; a 45-day identification and 180-day "
         "exchange deadline imposes strict timing discipline."),
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
            "Commercial real-estate loans are commercial credit and are "
            "not subject to the Real Estate Settlement Procedures Act "
            "(RESPA), the Truth in Lending Act (TILA), or Regulation Z. "
            "Consumer protections applicable to residential mortgages do "
            "not apply.",
            "Flood insurance is required where the property is located "
            "in a FEMA-designated Special Flood Hazard Area. Borrowers "
            "must maintain hazard, liability, and business-interruption "
            "insurance in amounts and with carriers acceptable to the "
            "Bank throughout the term.",
            "Interest-rate swaps, caps, and floors are offered through "
            "Cumulus Capital Markets LLC, an affiliated swap dealer. "
            "Derivatives carry material risks and require ISDA "
            "documentation and applicable ECP representations.",
            "Appraisal and environmental reports are commissioned by "
            "Cumulus Bank for internal underwriting purposes; borrower "
            "copies provided per 12 C.F.R. Part 226 / Regulation B where "
            "applicable.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
