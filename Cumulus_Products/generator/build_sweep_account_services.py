"""Cumulus Sweep Account Services — commercial segment."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, Spacer

import brand as B

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "08_Treasury_Management"
))
os.makedirs(OUT_DIR, exist_ok=True)
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Sweep_Account_Services.pdf")

TREASURY_DISCLOSURES = [
    "Sweep Account Services are provided by Cumulus Bank, N.A. under "
    "the Treasury Services Master Agreement and applicable Sweep Service "
    "Schedule. Investment options within sweep are offered through "
    "Cumulus Capital Markets LLC or third-party providers, and are "
    "governed by the disclosure documents accompanying each investment "
    "option.",
    "Investment products within sweep (money-market mutual funds, "
    "commercial paper) are NOT FDIC INSURED  ·  NOT BANK GUARANTEED  ·  "
    "MAY LOSE VALUE  ·  NOT A DEPOSIT  ·  NOT INSURED BY ANY FEDERAL "
    "GOVERNMENT AGENCY. Overnight-repurchase sweep is a secured "
    "obligation of Cumulus Bank (not FDIC-insured) collateralized by "
    "U.S. government securities held in segregated custody.",
    "Yields on sweep-investment options are illustrative and will vary "
    "with market conditions. Historical yields are not a guarantee of "
    "future returns. The current yield on each option is disclosed on "
    "the daily sweep statement and in the Cumulus Business Online portal.",
    "The money-market mutual fund prospectus (including investment "
    "objectives, risks, charges, and expenses) should be read carefully "
    "before investing. Prospectus and current shareholder reports are "
    "available through Cumulus Capital Markets.",
]


def build():
    B.set_theme("commercial")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Sweep Account Services",
        product_code="TM-SWP-2026.04",
        category="Treasury Management",
        segment="commercial",
    )

    story = []

    story += B.hero_block(
        product_name="Sweep Account Services",
        lede=("Automated target-balance sweep from operating accounts "
              "into overnight investment options — overnight repo, "
              "institutional money-market funds, and commercial paper "
              "ladders — delivering short-duration yield on idle cash."),
        summary_rows=[
            ("Minimum relationship", "$1,000,000 aggregate deposit relationship"),
            ("Sweep structures", "Target balance  ·  peg balance  ·  zero balance (see ZBA)"),
            ("Investment options", "Overnight repo (4.25%)  ·  MMF (4.35%)  ·  CP ladder (4.50%)"),
            ("Sweep frequency", "End-of-day + optional mid-day"),
            ("Reporting", "Daily sweep statement + camt.053 / BAI2 export"),
            ("Pricing", "$150 / month + basis points on invested amount"),
            ("FDIC treatment", "Repo secured by Treasuries (not FDIC-insured)"),
            ("Disclosure", "MMF: Not FDIC-insured, may lose value"),
        ],
        category_label="PRODUCT BROCHURE  ·  TREASURY MANAGEMENT",
    )
    story += B.switch_to_body()

    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Sweep Account Services automatically transfer excess operating "
        "cash — the amount above a client-specified target balance — "
        "into overnight investment vehicles at the close of each "
        "business day, and return those funds to the operating account "
        "before the start of the next business day. The goal is to "
        "eliminate 'idle' cash in non-interest-bearing demand deposits "
        "while preserving full liquidity and operational availability. "
        "Cumulus offers three sweep-investment options of progressively "
        "higher yield and duration: overnight repurchase agreements "
        "collateralized by U.S. Treasuries (Cumulus-internal, secured); "
        "Cumulus Institutional Money Market Fund shares (third-party "
        "registered fund); and commercial paper ladders (tenor 1–270 "
        "days, constructed by Cumulus Capital Markets)."
    ))

    story.append(B.section_header("Key benefits",
                                  kicker="Why sweep"))
    story.append(B.feature_grid([
        ("Yield on idle operating cash",
         "Convert non-interest-bearing DDA balances into overnight "
         "investments yielding 4.00% – 4.50% at current rates."),
        ("Full operational liquidity",
         "Swept funds return to operating accounts before the start "
         "of each business day — full availability for the "
         "day's payments."),
        ("Target-balance flexibility",
         "Client sets the target balance based on operating-cash needs; "
         "sweep operates above the target only."),
        ("Three investment options",
         "Overnight repo (most conservative), Institutional MMF (broader "
         "diversification), or CP ladder (slightly longer duration) — "
         "choose the option matching your risk posture."),
        ("Integrated reporting",
         "Daily sweep statement shows balance movement, yield earned, "
         "and reconciliation to operating account; available in "
         "camt.053 / BAI2 for ERP import."),
        ("No FDIC deposit-cap exposure",
         "Repo sweep is a secured obligation of Cumulus collateralized "
         "by Treasuries; balances above $250,000 are not subject to "
         "FDIC uninsured exposure while invested overnight."),
    ], cols=2))
    story.append(Spacer(1, 0.08 * inch))

    # INVESTMENT OPTIONS
    story.append(B.section_header("Investment options",
                                  kicker="Three structures"))
    story.append(B.data_table(
        header=["Option", "Structure", "Indicative yield",
                "Risk / protection"],
        rows=[
            ["Overnight Repurchase (Repo)",
             "Cumulus repo against U.S. Treasury / Agency collateral at "
             "102% margin; collateral held at BNY Mellon as custodian",
             "4.25%",
             "Secured by Treasuries; 102% collateralization; daily "
             "mark-to-market"],
            ["Cumulus Institutional Money-Market Fund",
             "Shares in a government or prime institutional MMF managed "
             "by an unaffiliated registered investment adviser; 2a-7 "
             "compliant",
             "4.35%",
             "Not FDIC-insured; 2a-7 daily / weekly liquidity minima; "
             "may be subject to liquidity fees or redemption gates"],
            ["Commercial Paper Ladder",
             "Short-tenor commercial paper constructed by Cumulus "
             "Capital Markets; typically 1-30 day weighted average, "
             "A-1 / P-1 rated issuers only",
             "4.50%",
             "Not FDIC-insured; issuer credit risk; Cumulus credit "
             "screening and diversification policy"],
        ],
        col_widths=[1.8 * inch, 2.5 * inch, 1.3 * inch, 1.7 * inch],
    ))

    # YIELD COMPARISON CHART
    story.append(B.section_header("Yield comparison",
                                  kicker="Option economics"))
    story.append(B.body_para(
        "The chart below compares indicative overnight yields across "
        "Cumulus sweep options. Higher yields come with increased "
        "credit exposure (repo is secured; MMF is diversified; CP is "
        "direct issuer exposure, mitigated by rating requirements "
        "and Cumulus's credit-surveillance program)."
    ))
    story.append(B.bar_comparison_chart(
        labels=["DDA balance", "Overnight repo",
                "Institutional MMF", "CP ladder"],
        values=[0.00, 4.25, 4.35, 4.50],
        title="Indicative yield — DDA vs. sweep options",
        ylabel="Annualized yield (%)",
        value_fmt=lambda v: f"{v:.2f}%",
    ))

    # MECHANICS
    story.append(B.section_header("Sweep mechanics",
                                  kicker="Daily cycle"))
    story.append(B.data_table(
        header=["Time (ET)", "Activity"],
        rows=[
            ["5:30 p.m.",
             "End-of-day balance determined on operating account(s) "
             "included in the sweep."],
            ["5:35 p.m.",
             "Amounts above target balance aggregated across linked "
             "operating accounts."],
            ["5:40 p.m.",
             "Aggregate investable amount transferred to selected "
             "investment option (repo, MMF, or CP ladder)."],
            ["5:45 p.m.",
             "Sweep statement generated and delivered to Business Online "
             "/ ERP. Interest accrual begins on invested balance."],
            ["Overnight",
             "Invested balance earns at the option's daily rate; "
             "repo priced at close, MMF NAV-stable, CP accruing interest."],
            ["8:00 a.m. next business day",
             "Invested balance plus accrued interest swept back to "
             "operating account(s) in proportion to previous evening's "
             "contribution."],
            ["8:15 a.m.",
             "Operating accounts available at full balance for the "
             "day's payments."],
            ["Month-end",
             "Monthly sweep-earnings statement with taxable-income "
             "reporting for year-end Form 1099-INT (repo) or 1099-DIV "
             "(MMF) preparation."],
        ],
        col_widths=[1.8 * inch, 5.5 * inch],
    ))

    # PRICING
    story.append(B.section_header("Pricing",
                                  kicker="Service fees"))
    story.append(B.data_table(
        header=["Component", "Amount", "Notes"],
        rows=[
            ["Monthly platform fee", "$150 / month",
             "Per linked sweep group"],
            ["Investment management fee — Repo",
             "10 bps (0.10%) per annum on invested balance",
             "Netted from yield"],
            ["Investment management fee — MMF",
             "Fund's management fee (~20 bps) + Cumulus shareholder "
             "servicing (15 bps)",
             "Disclosed in fund prospectus"],
            ["Investment management fee — CP ladder",
             "15 bps per annum",
             "Cumulus Capital Markets servicing"],
            ["Setup / implementation",
             "$1,500 one-time",
             "ISDA (for CP), custody agreements, documentation"],
            ["Minimum relationship",
             "$1,000,000 aggregate",
             "Deposit-plus-investment across Cumulus"],
            ["Reporting add-ons",
             "$50 / month per additional format",
             "Custom ERP connector or enhanced analytics"],
        ],
        col_widths=[2.6 * inch, 2.3 * inch, 2.4 * inch],
    ))

    # SETUP
    story.append(B.section_header("Setup and onboarding",
                                  kicker="How it works"))
    story.append(B.data_table(
        header=["Step", "Activity", "Timing"],
        rows=[
            ["1  ·  Cash-flow analysis",
             "Treasury Specialist reviews operating-account cash-flow "
             "patterns, volatility, minimum-balance needs.",
             "Days 1–7"],
            ["2  ·  Option selection",
             "Client selects target balance, sweep frequency, and "
             "primary investment option. Secondary option configurable "
             "(e.g., repo with MMF overflow).",
             "Days 7–10"],
            ["3  ·  Documentation",
             "Execute Sweep Service Schedule, Master Repurchase Agreement "
             "(for repo), ISDA (for CP), and any MMF subscription forms.",
             "Days 10–17"],
            ["4  ·  Custody setup",
             "Establish or confirm custody arrangements with BNY Mellon "
             "(repo) or the MMF transfer agent.",
             "Days 14–21"],
            ["5  ·  Configuration",
             "Cumulus configures sweep operating-account links, "
             "target balance, and cutoffs in Treasury system.",
             "Days 17–21"],
            ["6  ·  First sweep",
             "Test sweep cycle; full production after 3-day observation.",
             "Day 21+"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.5 * inch],
    ))

    # FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("What's the difference between sweep and money-market deposit?",
         "A Cumulus Business Money Market is a deposit account — FDIC-"
         "insured up to $250,000. Sweep invests above-target cash in "
         "overnight investment products (repo, MMF, CP). Sweep typically "
         "offers higher yield on larger balances but does not carry FDIC "
         "insurance on the invested portion (repo is secured by "
         "Treasuries; MMF is SEC-registered but not deposit-insured)."),
        ("What happens if there's a liquidity issue with MMF?",
         "SEC Rule 2a-7 imposes 10% daily-liquid-asset and 30% "
         "weekly-liquid-asset minima on money-market funds. If a fund "
         "falls below these thresholds, it may impose a liquidity fee "
         "(up to 2%) or a redemption gate (up to 10 business days). "
         "These events are rare but possible; they do not affect the "
         "repo or CP options."),
        ("Is the repo sweep safer than MMF?",
         "The repo sweep is secured by U.S. Treasury and Agency "
         "collateral marked daily at 102%, held in segregated custody "
         "at BNY Mellon. Credit exposure is against Cumulus Bank as "
         "counterparty — mitigated by the secured collateralization. "
         "MMF is diversified across many issuers but is subject to "
         "2a-7 market-risk exposure. Different risk structures; 'safer' "
         "depends on the risk being mitigated."),
        ("What yield differential justifies the platform fee?",
         "At a 4.25% yield on $5M invested overnight balance, the sweep "
         "earns approximately $18,000 per month — net of the $150 "
         "platform fee and 10bp management fee ($42/month), net "
         "earnings are approximately $17,800. Under this example, sweep "
         "pays for itself with less than $100,000 invested balance."),
        ("How does sweep interact with ZBA?",
         "ZBA (Zero Balance Accounts) and sweep are complementary. ZBA "
         "funnels cash to a master account daily; sweep then invests "
         "above-target balance in the master account. Clients with "
         "complex treasury structures commonly use both: ZBA at the "
         "operational layer; sweep at the master-account layer."),
        ("Is there a tax reporting difference by option?",
         "Yes. Repo earnings are reported as interest on IRS Form "
         "1099-INT. MMF distributions are reported on Form 1099-DIV. "
         "Commercial paper income is typically accrual-interest on "
         "1099-INT. Your tax advisor should be consulted on state tax "
         "treatment, particularly for repo against Agency collateral "
         "which may have favorable state-tax characteristics."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"<b>{q}</b>", B.STYLES["Callout"]),
            Paragraph(a, B.STYLES["Body"]),
            Spacer(1, 0.06 * inch),
        ]))

    story += B.disclosure_block("Important disclosures", TREASURY_DISCLOSURES)
    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
