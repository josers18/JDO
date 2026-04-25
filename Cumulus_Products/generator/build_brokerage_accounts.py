"""Cumulus Brokerage Accounts — wealth segment brochure."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Brokerage_Accounts.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Brokerage Accounts",
        product_code="WM-BRK-2026.04",
        category="Wealth Management  ·  Investment Services",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Brokerage Accounts",
        lede=("A self-directed investment account for individual and joint "
              "investors who wish to trade US equities, exchange-traded funds, "
              "options, mutual funds, and fixed income under their own direction."),
        summary_rows=[
            ("Account type", "Self-directed taxable brokerage account"),
            ("Minimum to open", "No minimum; funding required before trading"),
            ("Online commissions", "$0 US equities and ETFs; $0.65 per options contract"),
            ("Mutual funds", "3,500+ no-transaction-fee; $19.95 on others"),
            ("Margin APR", "9.50% ($0–$25K) tiered down to 6.50% ($1M+)"),
            ("Fixed income & CDs", "Traded through the Cumulus fixed-income desk"),
            ("Account protection", "SIPC up to $500,000 (including $250,000 cash)"),
            ("Advisor access", "Cumulus wealth advisor available by appointment"),
        ],
        category_label="PRODUCT BROCHURE  ·  INVESTMENT SERVICES",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Cumulus Brokerage Account is a self-directed investment account held "
        "through Cumulus Investment Services, LLC, a registered broker-dealer and "
        "SEC-registered investment adviser. Clients direct their own trading in "
        "equities, exchange-traded funds, mutual funds, options, and fixed-income "
        "securities, supported by research, fundamental data, and a licensed "
        "trading desk. A brokerage account is best suited to investors who are "
        "comfortable making their own suitability determinations and who do not "
        "require the ongoing fiduciary oversight of a managed advisory program."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and may "
        "lose value. Your Cumulus advisor will discuss your objectives, risk "
        "tolerance, and time horizon before recommending an account structure."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key features", kicker="Account capabilities"))
    story.append(B.feature_grid([
        ("Commission-free US equities",
         "Trade listed US stocks and exchange-traded funds online with no base "
         "commission. Options are $0.65 per contract with no per-leg fee."),
        ("Open-architecture mutual funds",
         "Access 3,500+ no-transaction-fee mutual funds and a broader universe "
         "of more than 15,000 funds at $19.95 per transaction."),
        ("Fixed income and CDs",
         "Trade investment-grade corporate, municipal, agency, and Treasury "
         "securities, plus new-issue and secondary-market brokered CDs, through "
         "the Cumulus fixed-income desk."),
        ("Margin and lending",
         "Eligible accounts may borrow against marginable securities at tiered "
         "rates from 9.50% to 6.50% APR, subject to Regulation T initial and "
         "FINRA maintenance requirements."),
        ("International markets",
         "Trade American Depositary Receipts and select foreign ordinary shares "
         "through the trading desk in 20+ markets, with competitive FX conversion."),
        ("Research and analytics",
         "Third-party research from Argus, Morningstar, and CFRA is included at "
         "no additional cost, alongside Cumulus market commentary."),
    ], cols=2))

    # --------------------------------------------------------------- PRICING TABLE
    story.append(B.section_header("Commissions & fees",
                                  kicker="Transaction pricing"))
    story.append(B.data_table(
        header=["Security type", "Online", "Broker-assisted", "Notes"],
        rows=[
            ["US-listed stocks and ETFs", "$0.00", "$25.00",
             "Regulatory fees (SEC Section 31 and FINRA TAF) are passed through."],
            ["Listed options", "$0.65 per contract", "$25.00 + $0.65 per contract",
             "No base ticket charge. Exercise and assignment $0."],
            ["Mutual funds — no-load, NTF", "$0.00", "$0.00",
             "Short-term redemption fee $49.95 if held less than 90 days."],
            ["Mutual funds — transaction fee", "$19.95", "$29.95",
             "Fund-level loads and expenses remain applicable."],
            ["Fixed income — new issue", "$0.00", "$0.00",
             "Concession is paid by the issuer and disclosed in the prospectus."],
            ["Fixed income — secondary", "$1 per bond ($10 min / $250 max)",
             "$1 per bond + $25", "US Treasuries are $0 at auction and in secondary."],
            ["Brokered CDs", "$0.00 new issue; $1/bond secondary", "$25 ticket",
             "Early sale subject to market conditions — principal at risk."],
            ["Foreign ordinary shares", "$75 per trade",
             "$75 per trade", "FX conversion 0.75% (Cumulus Private 0.25%)."],
        ],
        col_widths=[1.75 * inch, 1.45 * inch, 1.65 * inch, 2.45 * inch],
    ))

    # --------------------------------------------------------------- CHART
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.section_header("The long-term case for investing",
                                  kicker="Illustrative growth"))
    story.append(B.body_para(
        "The chart below illustrates the hypothetical growth of a $100,000 "
        "initial investment compounded at a 7.0% annualized rate of return "
        "over thirty years. The figure is for illustration only and does not "
        "represent the performance of any specific security or portfolio; "
        "actual returns will vary and may be negative."
    ))
    story.append(B.growth_curve_chart(
        principal=100_000, apy=7.00, years=30,
        title="$100,000 at 7.0% annualized — 30-year hypothetical growth",
    ))
    story.append(B.callout_box(
        "Not FDIC insured",
        "Investment products, including those held in a Cumulus Brokerage "
        "Account, are NOT FDIC insured, NOT bank guaranteed, and MAY lose "
        "value. Securities held in your account are protected by the "
        "Securities Investor Protection Corporation (SIPC) up to $500,000, "
        "including a $250,000 limit for cash.",
    ))

    # --------------------------------------------------------------- MARGIN TABLE
    story.append(B.section_header("Margin interest rates",
                                  kicker="If you borrow against your account"))
    story.append(B.body_para(
        "Margin borrowing is available to eligible accounts that have executed "
        "a Cumulus Margin Agreement. Margin involves significant risk, including "
        "the potential loss of more than the amount invested. Your advisor will "
        "review suitability, Regulation T initial margin (50%), and FINRA "
        "maintenance requirements before approving margin privileges."
    ))
    story.append(B.data_table(
        header=["Debit balance", "Margin APR", "Effective spread to base rate"],
        rows=[
            ["$0 – $24,999", "9.50%", "Base + 1.50%"],
            ["$25,000 – $99,999", "8.75%", "Base + 0.75%"],
            ["$100,000 – $249,999", "8.00%", "Base"],
            ["$250,000 – $999,999", "7.25%", "Base − 0.75%"],
            ["$1,000,000 or more", "6.50%", "Base − 1.50%"],
        ],
        col_widths=[2.5 * inch, 2.0 * inch, 2.8 * inch],
    ))

    # --------------------------------------------------------------- ELIGIBILITY
    story.append(B.section_header("Eligibility and account opening",
                                  kicker="Getting started"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who may open"),
            *B.bullet_list([
                "U.S. citizens, lawful permanent residents, and qualifying "
                "resident aliens age 18 or older with a valid Taxpayer "
                "Identification Number.",
                "Individual, joint tenant, tenants-in-common, community property, "
                "transfer-on-death, custodial (UTMA/UGMA), trust, and estate "
                "ownership forms.",
                "Verification under the Customer Identification Program (USA "
                "PATRIOT Act, 31 C.F.R. § 1020.220) at onboarding.",
                "FINRA-required suitability profile (time horizon, liquidity "
                "needs, risk tolerance, investment experience) completed at "
                "account opening and updated periodically.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Documentation"),
            *B.bullet_list([
                "Government-issued photo identification and Social Security "
                "Number or ITIN.",
                "Employment and source-of-funds disclosure; industry-affiliation "
                "disclosure if employed by a broker-dealer or publicly traded company.",
                "Trusted contact designation (FINRA Rule 4512) is strongly "
                "encouraged and can be updated at any time.",
                "For joint, trust, or custodial accounts: governing agreement, "
                "trustee certification, or court order as applicable.",
                "Executed Margin Agreement and Options Agreement, as applicable.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How a brokerage relationship works",
                                  kicker="The client journey"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Discovery",
             "Your Cumulus advisor reviews your objectives, risk tolerance, time "
             "horizon, liquidity needs, and tax considerations to confirm that a "
             "self-directed brokerage relationship is appropriate.",
             "30–45 minutes"],
            ["2  ·  Open and fund",
             "Complete the application, designate beneficiaries, and fund the "
             "account by ACH, wire, in-kind transfer (ACATS), or check.",
             "Same business day"],
            ["3  ·  Trade",
             "Place orders online, in the Cumulus app, or with a licensed broker. "
             "Equity and option orders are routed consistent with SEC Rule 606 "
             "best-execution obligations.",
             "Real time"],
            ["4  ·  Review",
             "Quarterly portfolio reviews are offered at your request; account "
             "statements are delivered monthly (or quarterly if inactive) and "
             "Form 1099 tax reporting is provided annually.",
             "Ongoing"],
        ],
        col_widths=[1.1 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- RISK
    story.append(B.section_header("Understanding the risks",
                                  kicker="Suitability & risk"))
    story.append(B.body_para(
        "Investing involves risk, including the possible loss of principal. "
        "Equity and equity-like securities are subject to market risk; "
        "fixed-income securities are subject to interest-rate, credit, and "
        "reinvestment risk; options and margin strategies carry additional risks, "
        "including the potential for losses that exceed the amount invested. "
        "Suitability depends on your individual circumstances. Review the "
        "Cumulus Investment Services, LLC Customer Relationship Summary (Form "
        "CRS) and Regulation Best Interest disclosure before opening an account."
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("What is the difference between a brokerage account and a managed "
         "advisory account?",
         "A brokerage account is self-directed: you make your own investment "
         "decisions and pay transaction-based commissions. A managed advisory "
         "account is discretionary: a Cumulus investment adviser makes and "
         "implements decisions on your behalf under a written investment "
         "policy, for an asset-based fee. Your Cumulus advisor can explain "
         "the suitability of each structure."),
        ("How is my account protected?",
         "Securities held at Cumulus Investment Services, LLC are protected "
         "by the Securities Investor Protection Corporation (SIPC) up to "
         "$500,000 per customer, including $250,000 for cash, in the event "
         "of broker-dealer insolvency. SIPC does not protect against market "
         "losses. Additional excess-of-SIPC coverage is provided through a "
         "commercial carrier up to policy limits."),
        ("How are my trades routed?",
         "Consistent with SEC Rule 606 and our duty of best execution, "
         "Cumulus routes orders to market centers selected for execution "
         "quality, including price improvement, speed, and likelihood of "
         "fill. A quarterly order-routing report is available on request."),
        ("Will I receive tax reporting?",
         "Yes. Cumulus furnishes IRS Form 1099 Composite (1099-DIV, 1099-INT, "
         "1099-B, 1099-OID) by mid-February each year. Cost-basis information "
         "is reported in accordance with the Emergency Economic Stabilization "
         "Act of 2008. Consult your tax professional regarding your specific "
         "situation."),
        ("May I transfer an outside account to Cumulus?",
         "Yes. In-kind transfers are processed through the Automated Customer "
         "Account Transfer Service (ACATS) and typically settle in 6–10 "
         "business days. Your advisor will review whether securities are "
         "transferable and whether any re-registration is required."),
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
            "Margin borrowing increases investment risk and magnifies losses. "
            "A decline in the value of pledged securities may require you to "
            "deposit additional funds or securities, and Cumulus may liquidate "
            "positions without prior notice to satisfy a maintenance call.",
            "Options involve risk and are not suitable for all investors. Prior "
            "to buying or selling an option, clients must read the Options "
            "Clearing Corporation booklet 'Characteristics and Risks of "
            "Standardized Options.'",
            "Research provided by Argus, Morningstar, and CFRA is obtained from "
            "sources believed to be reliable but is not guaranteed as to "
            "accuracy or completeness and does not constitute a recommendation.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
