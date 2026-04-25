"""Cumulus Equipment Loans — commercial segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Equipment_Loans.pdf")


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Equipment Loans",
        product_code="BL-EQP-LN-2026.04",
        category="Commercial Lending",
        segment="commercial",
    )

    story = []

    # COVER
    story += B.hero_block(
        product_name="Equipment Loans",
        lede=("Fixed-rate equipment financing for transportation, medical, "
              "manufacturing, technology, and construction assets — up to "
              "100% advance, structured to the useful life of the asset."),
        summary_rows=[
            ("Product type", "Fixed-rate equipment term loan"),
            ("Amount ceiling", "Up to 100% of equipment cost (Cumulus clients)"),
            ("Non-client maximum", "90% of equipment cost"),
            ("Rates", "6.25% – 9.75% fixed APR"),
            ("Terms", "24 – 84 months (hard collateral)  ·  24 – 60 months (soft)"),
            ("Collateral", "Specific-lien UCC-1 on financed equipment"),
            ("Sectors", "Transportation  ·  medical  ·  manufacturing  ·  tech  ·  construction"),
            ("Documentation", "Note, security agreement, UCC-1, vendor invoice"),
        ],
        category_label="PRODUCT BROCHURE  ·  COMMERCIAL LENDING",
    )
    story += B.switch_to_body()

    # OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Cumulus Equipment Loan finances the purchase of commercial "
        "equipment with a fixed-rate term loan collateralized by the "
        "financed asset. Because the collateral is discrete and "
        "title-controllable, Cumulus can typically advance up to 100% of "
        "invoice cost for established relationship clients, offer "
        "specialized terms matched to the asset's useful life, and "
        "decision straightforward transactions in days rather than weeks. "
        "Equipment loans are appropriate when the borrower wishes to own "
        "the equipment at loan payoff and to depreciate it on the "
        "balance sheet; for off-balance-sheet or shorter-use transactions, "
        "consider Cumulus Equipment Leasing."
    ))

    # BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why finance with Cumulus"))
    story.append(B.feature_grid([
        ("Up to 100% advance",
         "Cumulus relationship clients qualify for financing up to 100% of "
         "the equipment invoice, inclusive of delivery, installation, "
         "sales tax, and soft costs within limits."),
        ("Asset-matched term",
         "Terms calibrated to useful life: up to 84 months for "
         "long-lived hard collateral (heavy trucks, CNC, medical imaging); "
         "24–60 months for soft collateral (IT, software)."),
        ("Simple, fast decisioning",
         "Application-only programs up to $500,000; streamlined credit "
         "review up to $2,000,000. Decisioned within 3–5 business days on "
         "complete packages."),
        ("Section 179 and bonus depreciation",
         "Ownership structure preserves the borrower's right to take "
         "Section 179 expensing and bonus depreciation on the financed "
         "equipment (consult tax advisor)."),
        ("Sector specialists",
         "Dedicated underwriters for transportation, medical, construction, "
         "and industrial equipment — including familiarity with equipment "
         "titling (MVR), DOT compliance, and regulated-equipment processes."),
        ("Progress-payment structures",
         "Long-lead-time equipment financed with progress-payment funding "
         "through delivery and acceptance, then converted to term at first "
         "installment."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # SECTORS
    story.append(B.section_header("Sectors and asset classes",
                                  kicker="What we finance"))
    story.append(B.data_table(
        header=["Sector", "Typical assets",
                "Max advance", "Typical term"],
        rows=[
            ["Transportation",
             "Class 8 tractors, trailers, vocational trucks, buses, "
             "chassis fleets",
             "100% hard / 85% used",
             "60–84 months"],
            ["Medical",
             "Imaging (CT/MRI/PET), surgical robotics, dental CBCT, "
             "clinical lab analyzers",
             "100% (major OEM)",
             "60–84 months"],
            ["Manufacturing",
             "CNC machine tools, injection molding, packaging lines, "
             "machine-shop equipment",
             "100% hard",
             "72–84 months"],
            ["Technology",
             "Servers, storage, network, endpoint devices (soft collateral)",
             "80–90%",
             "24–48 months"],
            ["Software / capitalized SaaS",
             "Capitalized internal-use software, ERP implementations",
             "70% of capitalized cost",
             "24–36 months"],
            ["Construction",
             "Excavators, loaders, cranes, aerials, dozers, compactors",
             "90–100%",
             "60–84 months"],
            ["Restaurant / hospitality",
             "Kitchen equipment, POS systems, refrigeration, ovens",
             "85–90%",
             "60–72 months"],
        ],
        col_widths=[1.6 * inch, 3.2 * inch, 1.2 * inch, 1.3 * inch],
    ))

    # RATES
    story.append(B.section_header("Rates and fees",
                                  kicker="Pricing"))
    story.append(B.data_table(
        header=["Risk grade  ·  profile", "36-month", "60-month",
                "84-month", "Origination fee"],
        rows=[
            ["Grade 1–2  ·  relationship client, new equipment",
             "6.25%", "6.50%", "6.75%", "$500 flat"],
            ["Grade 3  ·  relationship client, used equipment (≤ 3 yr)",
             "6.75%", "7.00%", "7.25%", "$750"],
            ["Grade 4  ·  non-relationship, new equipment",
             "7.50%", "7.75%", "8.00%", "1.00% of amount"],
            ["Grade 5  ·  non-relationship, used equipment",
             "8.25%", "8.50%", "8.75%", "1.00%"],
            ["Grade 6  ·  specialty / stretch structure",
             "9.00%", "9.25%", "9.50%", "1.25%"],
            ["Grade 7  ·  higher risk / niche collateral",
             "9.50%", "9.75%", "9.75% (max 72 mo)", "1.50%"],
        ],
        col_widths=[2.4 * inch, 1.0 * inch, 1.0 * inch, 1.0 * inch, 1.3 * inch],
    ))

    # AMORTIZATION CHART
    story.append(B.section_header("Illustrative fleet financing",
                                  kicker="Amortization"))
    story.append(B.body_para(
        "The chart below models a $750,000 equipment loan financing a "
        "five-tractor Class 8 refresh at 7.00% APR over a 60-month fully-"
        "amortizing schedule. Depreciation under MACRS 5-year class life "
        "(consult tax advisor) runs in parallel to the loan amortization, "
        "with equipment typically fully depreciated 12 months before "
        "final loan payoff."
    ))
    story.append(B.amortization_chart(
        principal=750_000, apr=7.00, years=5,
        title="$750,000 equipment loan — 7.00% APR, 60-month fully-amortizing",
    ))

    # UNDERWRITING
    story.append(B.section_header("Underwriting and documentation",
                                  kicker="Credit standards"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Credit parameters"),
            *B.bullet_list([
                "Minimum DSCR of <b>1.20x</b> on a trailing-twelve-month basis; "
                "global DSCR including personal guarantors for smaller "
                "facilities.",
                "Minimum two years of operating history; start-ups "
                "considered with strong sponsor experience or franchise "
                "support.",
                "Personal guaranty from each 20%+ owner; waivable for "
                "large corporate borrowers or established relationship "
                "clients above $2M.",
                "Advance capped to vendor-invoice amount, net of trade-in "
                "or progress payments received from borrower.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Application package"),
            *B.bullet_list([
                "Vendor invoice or purchase order identifying make, model, "
                "serial number, and delivery location.",
                "Two years of business tax returns and a current interim "
                "financial statement (application-only up to $500K).",
                "Personal financial statement and two years of personal "
                "tax returns for 20%+ owners.",
                "Insurance certificate naming Cumulus Bank, N.A. as "
                "loss-payee and additional insured, in amount at least "
                "equal to financed value.",
                "Titling documentation (Certificate of Title, MCO) and "
                "proof of registration for titled assets.",
            ]),
        ],
    ))

    # PROCESS
    story.append(B.section_header("Process and timing",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "What happens", "Timing"],
        rows=[
            ["1  ·  Application",
             "Client completes application with equipment details and "
             "financial statements (waived on application-only programs).",
             "Same day"],
            ["2  ·  Approval",
             "Credit review and approval. Application-only programs run "
             "automated; larger transactions through Equipment Finance "
             "Credit.",
             "1–5 business days"],
            ["3  ·  Documentation",
             "Loan agreement, promissory note, security agreement, and "
             "UCC-1 executed. Vendor invoice and delivery receipt confirmed.",
             "2–5 business days"],
            ["4  ·  Funding",
             "Proceeds wired or ACH'd directly to equipment vendor upon "
             "delivery and acceptance. Title perfection completed within "
             "30 days.",
             "Day of acceptance"],
            ["5  ·  Servicing",
             "Monthly amortizing payments; annual insurance review; UCC "
             "continuations filed prior to lapse.",
             "Life of loan"],
        ],
        col_widths=[1.2 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # STRUCTURE OPTIONS
    story.append(B.section_header("Structure options",
                                  kicker="Flexibility"))
    story.append(B.data_table(
        header=["Option", "Purpose", "Typical use"],
        rows=[
            ["Equal amortizing",
             "Fixed monthly P&I for the life of the loan",
             "General-purpose equipment financing"],
            ["Seasonal (skip-payment)",
             "Reduced or deferred payments in low-revenue months",
             "Agriculture, landscaping, seasonal retail"],
            ["Step-up / step-down",
             "Payments rise or fall on schedule (e.g., ramp during "
             "asset-productive phase-in)",
             "New-store equipment, production ramp"],
            ["90-day deferral",
             "First payment deferred for 90 days to align with revenue "
             "contribution from equipment",
             "New-asset revenue ramp"],
            ["Balloon",
             "Reduced amortization with balloon payment at maturity",
             "Heavy trucks with residual value; may require refinance at "
             "balloon"],
            ["Progress payments",
             "Interim funding to vendor during build / delivery; converts "
             "to term at acceptance",
             "Long-lead-time manufacturing equipment"],
        ],
        col_widths=[1.5 * inch, 3.0 * inch, 2.8 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Equipment loan vs. equipment lease — which should I choose?",
         "Choose an equipment loan when you want to own the asset at the "
         "end of its useful life and capture depreciation (Section 179, "
         "bonus depreciation, MACRS). Choose a lease when you want lower "
         "monthly outflows, flexibility to return or upgrade at end-of-"
         "term, or off-balance-sheet treatment under an operating lease. "
         "Your Cumulus Relationship Manager will run a side-by-side "
         "analysis on request."),
        ("How fast can a deal close?",
         "Application-only programs (up to $500,000) typically close "
         "within 3–5 business days. Larger transactions with full credit "
         "underwriting close in 10–15 business days on complete packages. "
         "Vendor-financed programs (pre-approved vendor inventory) can "
         "fund same-day."),
        ("Can I finance used equipment?",
         "Yes. Cumulus finances used equipment up to 85% of market value "
         "(or invoice amount, whichever is lower). Asset age and remaining "
         "useful life affect term and advance; major-OEM used equipment "
         "with service history commands stronger terms than private-"
         "party acquisitions."),
        ("Does Section 179 apply to equipment loans?",
         "Generally, yes. Under current tax law, equipment financed on a "
         "conditional sale / secured loan basis is treated as owned by "
         "the borrower for tax purposes, preserving Section 179 expensing "
         "and bonus depreciation. Consult your tax advisor for specifics "
         "in your situation."),
        ("Are progress payments available?",
         "Yes. For long-lead-time equipment (e.g., heavy manufacturing, "
         "medical imaging built-to-order), Cumulus can fund vendor "
         "progress payments during build and delivery, converting to "
         "term amortization upon acceptance. Interim interest accrues at "
         "the note rate."),
        ("What happens if the equipment is sold or totaled?",
         "On sale: loan must be paid off at closing unless Cumulus "
         "consents to a substitution of collateral. On total loss: "
         "insurance proceeds are applied to the loan; any deficiency is "
         "the borrower's obligation. Guaranteed Asset Protection (GAP) "
         "insurance is available to cover deficiency."),
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
            "Cumulus Bank's security interest in financed equipment is "
            "perfected by UCC-1 filing on non-titled equipment and by "
            "lien recording on titled equipment (Certificate of Title, "
            "MCO). Borrower is responsible for ensuring titling fees, "
            "lien-recording fees, and UCC filing fees are paid at funding.",
            "Insurance coverage in an amount not less than financed value "
            "is required throughout the term, naming Cumulus Bank, N.A. "
            "as loss-payee. Lapse of insurance is an event of default "
            "and may trigger force-placed insurance at borrower expense.",
            "Tax treatment — including eligibility for Section 179 "
            "expensing, bonus depreciation, and MACRS recovery — depends "
            "on the borrower's individual facts and applicable tax law. "
            "Cumulus does not provide tax, legal, or accounting advice; "
            "consult your own advisors.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
