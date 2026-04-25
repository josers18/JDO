"""Cumulus 30-Year Fixed Mortgage — retail brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_30_Year_Fixed_Mortgage.pdf")


def build():
    B.set_theme("retail")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus 30-Year Fixed Mortgage",
        product_code="PL-MTG-30F-2026.04",
        category="Personal Loans",
        segment="retail",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus 30-Year Fixed Mortgage",
        lede=("The most chosen mortgage in America — a 30-year, fixed-"
              "rate home loan with predictable monthly principal and "
              "interest payments from year one to year thirty."),
        summary_rows=[
            ("Product type", "30-year fixed-rate residential mortgage"),
            ("Conforming APR", "6.75% APR (740+ FICO, 20% down, 0 points)"),
            ("Jumbo APR", "6.95% APR (loans above $806,500)"),
            ("Conforming limit", "$806,500 (2026 FHFA national baseline)"),
            ("Max DTI", "43% (conforming)"),
            ("Reserves required", "2 months (conforming)  ·  6 months (jumbo)"),
            ("Property types", "1–4 unit primary, second home, or investor"),
            ("Down payment", "As little as 3% conforming (PMI applies)"),
        ],
        category_label="PRODUCT BROCHURE  ·  PERSONAL LOANS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "The Cumulus 30-Year Fixed Mortgage is a fully amortizing home "
        "loan with an interest rate that is fixed at closing and does "
        "not change for the life of the loan. Your principal and "
        "interest payment is the same in year one as it is in year "
        "thirty — predictable protection against rising rates. Cumulus "
        "offers conforming loans up to the 2026 FHFA national baseline "
        "of $806,500 and Jumbo loans above that amount, on primary "
        "residences, second homes, and investment properties."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits",
                                  kicker="Why a 30-Year Fixed"))
    story.append(B.feature_grid([
        ("Fixed rate for 30 years",
         "Your interest rate is set at closing and never changes. Your "
         "monthly principal and interest payment is fully predictable."),
        ("Lowest monthly payment",
         "Amortizing over 30 years produces a lower monthly payment than "
         "shorter-term mortgages, creating cash-flow flexibility for "
         "other financial goals."),
        ("No prepayment penalty",
         "Pay extra each month or pay off the loan early. Every extra "
         "dollar goes directly to principal."),
        ("Conforming and Jumbo",
         "Cumulus offers conforming loans up to $806,500 and Jumbo loans "
         "above that amount — from starter homes to luxury properties."),
        ("Rate-lock protection",
         "Lock your rate at application for up to 60 days with a "
         "float-down option (one time, if rates drop before closing)."),
        ("Dedicated loan team",
         "Work with a single Cumulus Mortgage Advisor from application "
         "through closing. Status visible in the Cumulus app."),
    ], cols=2))

    # --------------------------------------------------------------- RATES
    story.append(B.section_header("Representative rates",
                                  kicker="APR by profile"))
    story.append(B.body_para(
        "Rates shown are representative for a 30-year fixed purchase "
        "loan, owner-occupied 1-unit primary residence, with the 2026 "
        "FHFA conforming limit of $806,500, autopay enrolled, and "
        "pricing tied to the 10-Year Treasury at 4.10%. Your actual APR "
        "depends on FICO, loan-to-value, debt-to-income, property type, "
        "occupancy, and whether you elect discount points. Rates are "
        "subject to market movement and are not locked until you "
        "request a rate lock in writing."
    ))

    story.append(B.data_table(
        header=["Scenario", "Rate / APR", "Monthly P&I ($400,000 loan)", "Points"],
        rows=[
            ["Conforming  ·  FICO 740+  ·  80% LTV  ·  0 pts", "6.75% APR", "$2,594.39", "0"],
            ["Conforming  ·  FICO 740+  ·  80% LTV  ·  1 pt", "6.50% APR", "$2,528.27", "1"],
            ["Conforming  ·  FICO 700–739  ·  90% LTV", "6.95% APR", "$2,647.57", "0"],
            ["Conforming  ·  FICO 680–699  ·  95% LTV", "7.15% APR", "$2,701.18", "0"],
            ["Jumbo  ·  FICO 740+  ·  80% LTV  ·  loan $900K", "6.95% APR", "$5,957.04", "0"],
            ["Jumbo  ·  FICO 760+  ·  70% LTV  ·  loan $1.5M", "6.75% APR", "$9,728.96", "0"],
        ],
        col_widths=[3.0 * inch, 1.2 * inch, 2.1 * inch, 0.7 * inch],
    ))

    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative principal vs. interest"))
    story.append(B.amortization_chart(
        principal=400_000, apr=6.75, years=30,
        title="$400,000 at 6.75% APR over 30 years — cumulative principal and interest",
    ))

    story.append(B.callout_box(
        "The power of one extra payment per year",
        "Making one extra monthly principal and interest payment per "
        "year on a $400,000, 30-year fixed mortgage at 6.75% APR can "
        "shorten the loan by approximately 5 years and save "
        "approximately $118,000 in total interest. Cumulus allows "
        "setup of bi-weekly or accelerated payments in the app — free of charge.",
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Closing costs and fees",
                                  kicker="Transparent pricing"))
    story.append(B.data_table(
        header=["Item", "Typical amount"],
        rows=[
            ["Origination fee", "0.50% – 1.00% of loan amount (negotiable; may be reduced with relationship)"],
            ["Discount points (optional)", "1 point = 1% of loan amount; typical rate reduction ~0.25%"],
            ["Appraisal", "$500 – $900 (single-family; more for 2–4 unit and jumbo)"],
            ["Credit report", "$50 – $100 (tri-merge)"],
            ["Title insurance (lender + owner)", "0.30% – 0.70% of loan amount; varies by state"],
            ["Settlement / closing fee", "$400 – $900"],
            ["Recording fees", "Pass-through at county rate"],
            ["Flood determination", "$12 – $25"],
            ["Prepaid interest (per-diem)", "From closing to end of month"],
            ["Escrows", "2 months of property tax and homeowners insurance"],
        ],
        col_widths=[2.8 * inch, 4.5 * inch],
    ))

    # --------------------------------------------------------------- UNDERWRITING
    story.append(B.section_header("Eligibility and underwriting",
                                  kicker="How we review your application"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who qualifies"),
            *B.bullet_list([
                "Minimum FICO 620 conforming (740+ for best pricing); "
                "minimum 700 jumbo.",
                "Maximum DTI of 43% (conforming), computed on fully "
                "escrowed PITI; 40% on jumbo.",
                "Down payment as low as 3% on conforming loans (PMI "
                "required under 20% equity).",
                "Reserves: 2 months PITI (conforming) / 6 months (jumbo).",
                "Stable 2-year employment or self-employment history.",
                "Property meets Fannie Mae / Freddie Mac standards; "
                "non-warrantable condos and log homes referred to portfolio.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation required"),
            *B.bullet_list([
                "Government-issued photo ID and Social Security Number.",
                "Two most recent pay stubs; two years of W-2 or tax "
                "returns; year-to-date P&L for self-employed.",
                "Two months of bank statements for each account used for "
                "down payment, closing costs, and reserves.",
                "Purchase contract (purchase) or most-recent mortgage "
                "statement (refinance).",
                "Homeowners insurance binder effective at closing.",
                "Appraisal, title, and flood determination ordered by Cumulus.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- PROCESS
    story.append(B.section_header("How it works", kicker="Step by step"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Pre-qualification",
             "Soft credit inquiry and basic income review to estimate "
             "buying power. No impact to credit score.",
             "Same day"],
            ["2  ·  Pre-approval",
             "Full application with verified income and assets. Conditional "
             "commitment letter for sellers / agents.",
             "2–4 business days"],
            ["3  ·  Loan Estimate",
             "Cumulus issues Loan Estimate (TRID Regulation Z / X) within "
             "3 business days of a complete application.",
             "3 business days"],
            ["4  ·  Processing and underwriting",
             "Appraisal ordered; title commitment pulled; underwriter "
             "reviews file and issues conditional approval.",
             "2–3 weeks"],
            ["5  ·  Clear to close",
             "All conditions satisfied; Closing Disclosure issued at "
             "least 3 business days before closing.",
             "Day ~25"],
            ["6  ·  Close and fund",
             "Sign at title company or attorney's office; loan funds and "
             "records at county recorder.",
             "30–40 days from application"],
        ],
        col_widths=[1.6 * inch, 4.0 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- PROTECTIONS
    story.append(B.section_header("Security and regulatory protections",
                                  kicker="Your rights as a borrower"))
    story.append(B.data_table(
        header=["Protection", "Coverage"],
        rows=[
            ["Truth in Lending / RESPA Integrated Disclosures (TRID)",
             "Loan Estimate within 3 business days of application; "
             "Closing Disclosure at least 3 business days before closing."],
            ["Equal Credit Opportunity Act (Reg B)",
             "Prohibits discrimination; adverse-action notices within 30 days."],
            ["Ability-to-Repay / Qualified Mortgage (Reg Z § 1026.43)",
             "Cumulus verifies and documents your ability to repay the "
             "loan in full based on income, assets, employment, debts, and DTI."],
            ["Home Mortgage Disclosure Act (HMDA)",
             "Application and originations reported to CFPB annually in "
             "compliance with Regulation C."],
            ["Flood Disaster Protection Act",
             "Flood insurance required for properties in a Special Flood "
             "Hazard Area identified by FEMA."],
            ["Servicemembers Civil Relief Act",
             "6% APR cap on pre-service mortgage debt and foreclosure "
             "protections during active duty."],
        ],
        col_widths=[3.0 * inch, 4.3 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Should I pay discount points?",
         "Points make sense when you plan to hold the mortgage long "
         "enough that monthly-payment savings exceed the up-front cost. "
         "The breakeven on 1 point (~0.25% rate reduction) is typically "
         "5–7 years. Shorter horizons generally favor zero-point pricing."),
        ("What's the difference between conforming and jumbo?",
         "Conforming loans are eligible for sale to Fannie Mae or Freddie "
         "Mac and are subject to the 2026 FHFA national baseline limit "
         "of $806,500 in most counties. Jumbo loans exceed that limit "
         "and are held in Cumulus's portfolio."),
        ("Can I avoid PMI with less than 20% down?",
         "Cumulus offers Lender-Paid Mortgage Insurance (LPMI), Split-"
         "Premium MI, and an 80/10/10 piggyback option via a simultaneous "
         "HELOC on eligible transactions. A Mortgage Advisor can model "
         "the trade-offs for your situation."),
        ("How long is my rate lock good for?",
         "Standard rate locks are 30, 45, or 60 days. You may extend an "
         "expiring lock for a fee. One-time float-down is available if "
         "market rates drop more than 0.25% before closing."),
        ("When should I think about refinancing later?",
         "A common rule of thumb is to refinance when you can lower your "
         "rate by 0.75–1.00% and will hold the loan long enough to recoup "
         "the closing costs. Cumulus mortgage clients receive ongoing "
         "refinance monitoring alerts in the app."),
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
            "Rates shown are representative and assume excellent credit "
            "(FICO 740+), a 1-unit owner-occupied primary residence, 80% "
            "LTV or better, escrowed taxes and insurance, and the 0.25% "
            "automatic-payment discount. Actual rate offered may vary.",
            "Monthly payment figures shown are principal and interest only "
            "and do not include property taxes, homeowners insurance, "
            "mortgage insurance, or HOA dues, which may substantially "
            "increase the total housing payment.",
            "Your home is the collateral for this loan. Failure to repay "
            "may result in the loss of your home through foreclosure.",
            "Cumulus Home Lending, a division of Cumulus Bank, N.A. NMLS "
            "#2026045. Equal Housing Lender.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
