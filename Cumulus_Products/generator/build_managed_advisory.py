"""Cumulus Managed Advisory Services — wealth segment brochure."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "04_Investments"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Managed_Advisory_Services.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Managed Advisory Services",
        product_code="WM-MAS-2026.04",
        category="Wealth Management  ·  Advisory",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Managed Advisory Services",
        lede=("A fee-based discretionary portfolio management program in which "
              "Cumulus Investment Services, LLC acts as investment adviser under "
              "a written investment policy and a fiduciary duty to the client."),
        summary_rows=[
            ("Program type", "Discretionary managed account (wrap-fee)"),
            ("Minimum relationship", "$250,000"),
            ("Advisory fee", "1.25% first $1M, tiered to 0.45% above $10M"),
            ("Portfolio options", "7 model portfolios, ESG sleeve, custom mandates"),
            ("Included services", "Tax-loss harvesting, rebalancing, manager due diligence"),
            ("Custody", "Cumulus Investment Services, LLC (Member FINRA / SIPC)"),
            ("Regulatory framework", "Investment Advisers Act of 1940; Form ADV Part 2A"),
            ("Standard of care", "Fiduciary duty of loyalty and care"),
        ],
        category_label="PRODUCT BROCHURE  ·  ADVISORY SERVICES",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus Managed Advisory Services is a discretionary wrap-fee program "
        "offered through Cumulus Investment Services, LLC, an SEC-registered "
        "investment adviser. Under the program, a Cumulus investment adviser "
        "exercises discretion over the purchase and sale of securities in your "
        "account in accordance with a written investment policy statement and "
        "the investment objectives, risk tolerance, time horizon, liquidity "
        "needs, and tax considerations that you and your advisor establish "
        "together. Cumulus acts as a fiduciary in this capacity."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and may "
        "lose value. A copy of Cumulus Investment Services, LLC Form ADV Part "
        "2A (disclosure brochure) and Form CRS will be provided before you "
        "enter into an advisory agreement, and annually thereafter."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Why engage an investment adviser",
                                  kicker="Program benefits"))
    story.append(B.feature_grid([
        ("Fiduciary duty",
         "As a registered investment adviser, Cumulus owes a duty of loyalty "
         "and care and must act in your best interest at all times under the "
         "Investment Advisers Act of 1940."),
        ("Written investment policy",
         "A personalized investment policy statement documents your objectives, "
         "risk tolerance, liquidity needs, time horizon, tax considerations, "
         "and any reasonable restrictions."),
        ("Discretionary management",
         "Your adviser implements the investment policy without prior approval "
         "of each transaction, enabling disciplined rebalancing and timely "
         "tax-management trades."),
        ("Tax-loss harvesting",
         "In taxable accounts, systematic harvesting of realized losses may be "
         "used to offset realized gains, subject to the wash-sale rule "
         "(IRC §1091)."),
        ("Rebalancing and drift controls",
         "Portfolios are monitored against target allocations and rebalanced "
         "when drift tolerances are exceeded or at scheduled intervals."),
        ("Access to institutional vehicles",
         "Mutual-fund institutional share classes, separately managed accounts, "
         "and alternative investments (qualified clients) with due-diligence "
         "oversight by Cumulus."),
    ], cols=2))

    # --------------------------------------------------------------- FEE SCHEDULE
    story.append(B.section_header("Advisory fee schedule",
                                  kicker="Compensation & pricing"))
    story.append(B.body_para(
        "The annual advisory fee is calculated on a tiered basis against the "
        "average daily market value of the assets held in the account during "
        "the billing period. Fees are debited from the account in arrears on a "
        "calendar-quarter basis. The fee covers investment advice, discretionary "
        "management, custody, standard trading, performance reporting, and "
        "quarterly reviews; it does not cover internal fund expenses, "
        "regulatory pass-throughs, or transfer taxes."
    ))
    story.append(B.data_table(
        header=["Tier", "Asset range", "Annual advisory fee"],
        rows=[
            ["Tier 1", "First $1,000,000", "1.25%"],
            ["Tier 2", "Next $4,000,000 ($1M–$5M)", "0.95%"],
            ["Tier 3", "Next $5,000,000 ($5M–$10M)", "0.65%"],
            ["Tier 4", "Assets above $10,000,000", "0.45%"],
        ],
        col_widths=[1.2 * inch, 3.4 * inch, 2.7 * inch],
    ))
    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Household aggregation",
        "Fees are calculated at the household level. Accounts held by spouses, "
        "domestic partners, minor children, and family trusts may be aggregated "
        "for purposes of applying the breakpoint tiers, provided an election "
        "form is on file. Discuss aggregation with your Cumulus advisor.",
    ))

    # --------------------------------------------------------------- MODELS
    story.append(B.section_header("Model portfolios",
                                  kicker="Seven risk-based strategies"))
    story.append(B.body_para(
        "Seven model portfolios — from Conservative through Aggressive — are "
        "available as starting points. Models may be customized for concentrated "
        "positions, tax considerations, ESG preferences, or other reasonable "
        "restrictions. The model selected for your account is determined by "
        "your investment policy statement."
    ))
    story.append(B.data_table(
        header=["Model", "Equity", "Fixed income", "Alternatives", "Cash",
                "Time horizon"],
        rows=[
            ["Conservative", "20%", "70%", "5%", "5%", "3–5 yrs"],
            ["Moderately Conservative", "35%", "55%", "5%", "5%", "4–6 yrs"],
            ["Balanced (60/40)", "55%", "35%", "7%", "3%", "7+ yrs"],
            ["Moderate Growth", "65%", "25%", "8%", "2%", "8+ yrs"],
            ["Growth", "75%", "15%", "8%", "2%", "10+ yrs"],
            ["Aggressive Growth", "85%", "5%", "8%", "2%", "10+ yrs"],
            ["All Equity", "95%", "0%", "3%", "2%", "15+ yrs"],
        ],
        col_widths=[1.85 * inch, 0.85 * inch, 1.1 * inch, 1.05 * inch,
                    0.8 * inch, 1.6 * inch],
    ))

    # --------------------------------------------------------------- DONUT
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Illustrative allocation — Balanced (60/40)"))
    story.append(B.donut_chart(
        labels=["US Equity", "Intl Equity", "Fixed Income",
                "Alternatives", "Cash"],
        values=[40, 15, 35, 7, 3],
        title="Balanced portfolio — strategic target weights",
        center_text="60 / 40",
    ))
    story.append(B.callout_box(
        "Asset allocation is not a guarantee",
        "Asset allocation and diversification do not ensure a profit or protect "
        "against loss in a declining market. Past performance is not a guarantee "
        "of future results. Investment products are not FDIC insured, not bank "
        "guaranteed, and may lose value.",
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How the program works",
                                  kicker="The advisory engagement"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Discovery",
             "Your advisor reviews your objectives, time horizon, liquidity "
             "needs, risk tolerance, and tax considerations; confirms "
             "suitability of the program; and delivers Form ADV Part 2A and "
             "Form CRS.",
             "1–2 meetings"],
            ["2  ·  Investment policy",
             "A written investment policy statement documents your target "
             "allocation, rebalancing tolerances, tax-management instructions, "
             "and any reasonable restrictions on specific securities or sectors.",
             "1–5 days"],
            ["3  ·  Funding and implementation",
             "Assets are transferred in-kind through ACATS or funded in cash. "
             "Your adviser transitions the portfolio to the target allocation, "
             "balancing transaction costs against tax impact.",
             "10–30 days"],
            ["4  ·  Ongoing management",
             "Your adviser monitors the portfolio, rebalances within tolerance "
             "bands, conducts tax-loss harvesting where appropriate, and "
             "executes manager due diligence.",
             "Continuous"],
            ["5  ·  Reviews and reporting",
             "Quarterly performance reports are delivered with portfolio-level "
             "and aggregate returns, benchmark comparisons, and fee disclosures. "
             "Annual investment-policy reviews are standard.",
             "Quarterly / annual"],
        ],
        col_widths=[1.2 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- ELIGIBILITY
    story.append(B.section_header("Eligibility and required disclosures",
                                  kicker="Opening an advisory relationship"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who may enroll"),
            *B.bullet_list([
                "Individuals, joint investors, revocable trusts, irrevocable "
                "trusts, estates, and qualifying retirement accounts.",
                "Minimum program relationship of $250,000. Household aggregation "
                "across related accounts is permitted.",
                "Qualified-client and qualified-purchaser thresholds apply for "
                "certain alternative investments (Rule 205-3; §3(c)(7)).",
                "Ongoing suitability updates at least annually, or sooner upon "
                "material change in your financial circumstances.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Disclosures you will receive"),
            *B.bullet_list([
                "Form ADV Part 2A — the firm disclosure brochure describing "
                "services, fees, conflicts of interest, and disciplinary history.",
                "Form ADV Part 2B — advisor-specific brochure supplement(s).",
                "Form CRS — the client relationship summary required by "
                "Regulation Best Interest.",
                "Privacy notice and cybersecurity disclosures at onboarding and "
                "annually thereafter.",
                "A written advisory agreement describing the scope of "
                "discretion, fees, and termination rights.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("What does 'discretion' mean in this program?",
         "Discretion means your adviser is authorized to purchase and sell "
         "securities in your account without prior approval of each "
         "transaction, in accordance with the written investment policy "
         "statement. You retain the right to place reasonable restrictions and "
         "to terminate the agreement at any time."),
        ("How is tax-loss harvesting implemented?",
         "In taxable accounts, your adviser monitors positions for "
         "unrealized losses and may sell and replace them with a similar — but "
         "not substantially identical — security to harvest realized losses, "
         "subject to the wash-sale rule (IRC §1091). Tax-loss harvesting does "
         "not convert ordinary income into capital gains and is not a guarantee "
         "of tax savings. Consult your tax professional."),
        ("How often is my portfolio rebalanced?",
         "Rebalancing is performed when portfolio drift exceeds the tolerance "
         "bands documented in your investment policy statement, or on a "
         "scheduled calendar basis — typically semiannual at minimum. "
         "Rebalancing transactions are reviewed for tax impact before execution."),
        ("May I impose restrictions on securities or sectors?",
         "Yes. Reasonable restrictions — for example, exclusion of a specific "
         "issuer because of an employment relationship, or exclusion of a "
         "sector for values-based reasons — may be documented in your "
         "investment policy statement. An ESG sleeve is available on request."),
        ("How are fees calculated and charged?",
         "Fees are calculated on the average daily market value of the account "
         "during the billing period and are debited quarterly in arrears. The "
         "fee schedule is tiered, so only assets within a given tier bear the "
         "applicable rate. Your first invoice will be prorated from the "
         "funding date."),
        ("How do I terminate the relationship?",
         "Either party may terminate the advisory agreement on written notice. "
         "Fees are prorated through the termination date; any unearned "
         "pre-paid fees (if applicable) are refunded. Your account may be "
         "converted to a self-directed brokerage account or transferred to "
         "another custodian through ACATS."),
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
        B.STANDARD_INVESTMENT_DISCLOSURES + [
            "Cumulus Investment Services, LLC is an SEC-registered investment "
            "adviser; registration does not imply a certain level of skill or "
            "training. A copy of Form ADV Part 2A, Form ADV Part 2B, and Form "
            "CRS is available on request and at cumulusbank-demo-"
            "bb054209d76d.herokuapp.com.",
            "The advisory fee is exclusive of internal expenses of mutual "
            "funds, exchange-traded funds, and other pooled investment "
            "vehicles held in the account. These expenses are disclosed in "
            "each fund's prospectus and reduce fund returns.",
            "Tax-loss harvesting is not suitable for every investor and is "
            "subject to the wash-sale rule under IRC §1091. Consult your tax "
            "professional regarding your specific situation.",
            "Alternative investments involve a high degree of risk, may "
            "involve lock-up periods, and are available only to qualified "
            "clients or qualified purchasers as those terms are defined by "
            "Rule 205-3 and Section 3(c)(7) of the Investment Company Act of 1940.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
