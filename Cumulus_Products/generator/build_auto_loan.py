"""Cumulus Auto Loan — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Auto_Loan.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Auto Loan",
        product_code="PL-LOAN-AUT-2026.04",
        category="Personal Loans",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Auto Loan",
        lede=("Competitive, fixed-rate financing on new, used, and "
              "refinanced vehicles — with dealer-direct disbursement and "
              "flexible terms."),
        summary_rows=[
            ("Loan type", "Secured fixed-rate vehicle installment"),
            ("New-vehicle APR (from)", "5.24% APR"),
            ("Used-vehicle APR (from)", "5.74% APR"),
            ("Refinance APR (from)", "5.49% APR"),
            ("Terms available", "24 – 84 months"),
            ("LTV limits", "Up to 125% new / 120% used"),
            ("Insurance requirement", "Collision + comprehensive; deductible ≤ $1,000"),
            ("Prepayment penalty", "None"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL LOANS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus Auto Loan is a fixed-rate installment loan secured by "
        "the vehicle you purchase or refinance. Cumulus finances new "
        "vehicles from franchised dealers, pre-owned vehicles from dealers "
        "or private parties, and refinances of existing auto loans held at "
        "other lenders. Approved loans can be funded directly to the "
        "dealer (dealer pay) or deposited to your Cumulus account for "
        "private-party purchases."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits", kicker="Why a Cumulus Auto Loan"))
    story.append(B.feature_grid([
        ("Rates as low as 5.24% APR",
         "On new vehicles with excellent credit, a 60-month term, and "
         "autopay. Used and refinance rates from 5.74% and 5.49% APR."),
        ("Terms up to 84 months",
         "Flexible terms from 24 to 84 months let you balance total "
         "interest paid against monthly cash flow."),
        ("High LTV limits",
         "Finance up to 125% LTV on new and 120% LTV on used — helpful "
         "for tax, title, tags, and negative equity on a trade-in."),
        ("Pre-approval before you shop",
         "Shop with confidence knowing exactly how much you can borrow "
         "and at what rate. Cumulus pre-approvals are valid for 60 days."),
        ("No prepayment penalty",
         "Pay ahead or pay off early at any time with no fee. Extra "
         "payments go directly to principal."),
        ("Dealer-direct funding",
         "For dealer purchases, Cumulus wires funds directly to the "
         "dealership so you can drive off the lot the same day."),
    ], cols=2))

    # --------------------------------------------------------------- RATES
    story.append(B.section_header("Representative rates",
                                  kicker="APR by vehicle type and term"))
    story.append(B.body_para(
        "Rates shown are representative for well-qualified borrowers "
        "with excellent credit (FICO 740+), 20% down payment or "
        "equivalent equity, collateral meeting Cumulus's LTV and vehicle "
        "age guidelines, and enrollment in automatic payment from a "
        "Cumulus deposit account. Your actual APR will be disclosed on "
        "your pre-approval and on your Regulation Z Truth in Lending "
        "disclosure at signing."
    ))

    story.append(B.data_table(
        header=["Product", "Term", "APR (from)", "Monthly payment ($35,000)", "Max LTV"],
        rows=[
            ["New vehicle (current or prior model year)", "60 months", "5.24%", "$664.23", "125%"],
            ["New vehicle", "72 months", "5.49%", "$570.88", "125%"],
            ["Used vehicle", "60 months", "5.74%", "$672.25", "120%"],
            ["Used vehicle", "72 months", "5.99%", "$579.36", "120%"],
            ["Refinance from another lender", "60 months", "5.49%", "$668.23", "110%"],
            ["Lease-end buyout", "60 months", "5.74%", "$672.25", "115%"],
        ],
        col_widths=[2.4 * inch, 1.2 * inch, 0.9 * inch, 1.7 * inch, 0.9 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative principal vs. interest"))
    story.append(B.amortization_chart(
        principal=35_000, apr=5.74, years=5,
        title="$35,000 used-vehicle loan at 5.74% APR over 60 months — cumulative principal and interest",
    ))

    story.append(B.callout_box(
        "Refinancing may lower your payment",
        "If you financed your current vehicle at a higher rate — through "
        "a dealer, captive finance company, or another bank — a Cumulus "
        "refinance can often reduce your rate and your monthly payment. "
        "Cumulus refinances vehicles up to 10 model years old and with up "
        "to 125,000 miles, subject to LTV and condition.",
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Loan terms and fees",
                                  kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Item", "Detail"],
        rows=[
            ["Loan amounts", "$5,000 – $150,000 (higher by exception)"],
            ["Terms available", "24, 36, 48, 60, 72, 84 months"],
            ["Autopay discount", "0.25% APR reduction for automatic payment from a Cumulus deposit account"],
            ["Origination fee", "None"],
            ["Application fee", "None"],
            ["Prepayment penalty", "None"],
            ["Title / lien perfection fee", "Pass-through at state DMV rate"],
            ["Late payment fee", "5% of the past-due amount or $25, whichever is less"],
            ["Returned payment fee", "$15"],
            ["Insurance requirement", "Collision + comprehensive with deductible ≤ $1,000; Cumulus named lienholder"],
        ],
        col_widths=[2.4 * inch, 4.9 * inch],
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
                "Minimum FICO 660 (best pricing at 740+).",
                "Post-loan debt-to-income ratio of 45% or less.",
                "Vehicle: model year current or up to 10 years old; "
                "mileage ≤ 125,000.",
                "Motorcycles, RVs, and commercial vehicles not eligible on "
                "this product (see Cumulus Specialty Lending).",
                "Salvage-titled, rebuilt, and branded-title vehicles not eligible.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Government-issued photo ID.",
                "Social Security Number or ITIN.",
                "Two most recent pay stubs or comparable income documentation.",
                "Vehicle purchase contract, title application, or lease "
                "buyout documents.",
                "Evidence of collision + comprehensive insurance naming "
                "Cumulus Bank, N.A. as lienholder.",
                "For refinance: current payoff letter from existing lender, "
                "registration, and current odometer reading."
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How it works", kicker="Step by step"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Check your rate",
             "Submit a soft-pull pre-qualification to see your rate — no "
             "impact on your credit score.",
             "2 minutes"],
            ["2  ·  Pre-approval",
             "Receive a pre-approval letter valid for 60 days specifying "
             "your max loan amount, term, and APR.",
             "Same day"],
            ["3  ·  Shop",
             "Use the pre-approval letter at any franchised dealer, "
             "independent dealer, or with a private-party seller.",
             "At your pace"],
            ["4  ·  Sign",
             "E-sign your loan documents in the Cumulus app or in person "
             "at the dealership.",
             "10–15 minutes"],
            ["5  ·  Funding and title",
             "Cumulus wires funds to the dealer (or to you, for private "
             "party) and perfects its lien through the state DMV.",
             "Same or next business day"],
        ],
        col_widths=[1.5 * inch, 4.2 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="Your rights as a borrower"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["Truth in Lending Act (Regulation Z)",
             "APR, finance charge, amount financed, total of payments, "
             "and payment schedule disclosed on the TIL form at signing."],
            ["Equal Credit Opportunity Act (Regulation B)",
             "Prohibits discrimination; adverse action notices provided "
             "within 30 days."],
            ["Uniform Commercial Code Article 9",
             "Governs Cumulus's security interest in the vehicle; lien is "
             "perfected through the state DMV title."],
            ["Servicemembers Civil Relief Act",
             "6% APR cap on pre-service auto debt and other protections "
             "during active duty."],
            ["Fair Credit Reporting Act",
             "Credit report disputes investigated within 30 days. Adverse "
             "action notices include the bureau used."],
        ],
        col_widths=[2.5 * inch, 4.8 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How much can I finance?",
         "Up to 125% LTV on a new vehicle and 120% LTV on a used "
         "vehicle, subject to credit approval and a $150,000 per-loan "
         "maximum. Higher amounts available by exception."),
        ("Does Cumulus require a down payment?",
         "Cumulus does not require a specific down payment, though higher "
         "down payments reduce your LTV and may qualify you for a better "
         "rate. The best published rates assume roughly 20% down."),
        ("Can I finance taxes, tags, warranty, and GAP?",
         "Yes, subject to the LTV limit. Sales tax, title, license, "
         "dealer documentation fees, extended service contracts, and GAP "
         "insurance may all be rolled into the loan."),
        ("Do I need to buy GAP insurance?",
         "GAP is optional, not required. However, if your LTV exceeds "
         "100% (typical when financing tax and fees into the loan), GAP "
         "protects you if the vehicle is totaled before the loan balance "
         "falls below its value."),
        ("How long does funding take?",
         "For franchised-dealer purchases, Cumulus typically wires funds "
         "the same business day you sign. For private-party purchases, "
         "funds are deposited to your Cumulus account within 1–2 business "
         "days after we receive the signed title application."),
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
            "Rates shown are \"as low as\" and assume excellent credit "
            "(FICO 740+), a 60-month term, a qualifying LTV and vehicle "
            "age, and the 0.25% automatic-payment APR discount. Your "
            "actual rate may be materially higher.",
            "Collision and comprehensive physical-damage insurance are "
            "required for the life of the loan with Cumulus Bank, N.A. "
            "named as lienholder / loss payee. Lapse in coverage may "
            "result in lender-placed (force-placed) insurance at your expense.",
            "Cumulus perfects its security interest through the applicable "
            "state Department of Motor Vehicles. Title-release procedures "
            "vary by state upon payoff.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
