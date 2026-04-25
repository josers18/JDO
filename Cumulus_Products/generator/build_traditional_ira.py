"""Cumulus Traditional IRA — wealth segment / retirement."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Traditional_IRA.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Traditional IRA",
        product_code="WM-IRA-TRD-2026.04",
        category="Wealth Management  ·  Retirement",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Traditional IRA",
        lede=("A pre-tax individual retirement account for investors seeking "
              "tax-deferred growth and, where eligible, a current-year "
              "deduction for contributions under IRC §219."),
        summary_rows=[
            ("Account type", "Traditional Individual Retirement Account (IRC §408)"),
            ("2026 contribution limit", "$7,000 regular  ·  $8,000 if age 50+"),
            ("Deductibility — single, covered", "Phase-out $79,000 – $89,000 MAGI"),
            ("Deductibility — MFJ, covered", "Phase-out $126,000 – $146,000 MAGI"),
            ("Account fee", "$0 for balances ≥ $10,000; $25 annual otherwise"),
            ("Investment menu", "Equities, ETFs, mutual funds, fixed income, CDs"),
            ("Required minimum distributions", "Begin at age 73 (SECURE 2.0)"),
            ("Withdrawal taxation", "Ordinary income on pre-tax amounts"),
        ],
        category_label="PRODUCT BROCHURE  ·  RETIREMENT",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Traditional IRA is a tax-advantaged individual retirement account "
        "established under Section 408 of the Internal Revenue Code. "
        "Eligible contributions reduce current-year taxable income, and "
        "investment earnings grow tax-deferred until withdrawn. "
        "Distributions are taxed as ordinary income; distributions before "
        "age 59½ are subject to a 10% additional tax under IRC §72(t) unless "
        "a statutory exception applies."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. Your Cumulus advisor will discuss suitability, risk "
        "tolerance, time horizon, and tax considerations before you "
        "contribute; consult your tax professional regarding your "
        "individual situation."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits",
                                  kicker="Why a Traditional IRA"))
    story.append(B.feature_grid([
        ("Immediate tax deduction",
         "If you or your spouse are not covered by a workplace retirement "
         "plan, all Traditional IRA contributions are deductible. If covered, "
         "deductibility is subject to the MAGI phase-outs under IRC §219(g)."),
        ("Tax-deferred compounding",
         "Interest, dividends, and capital gains accumulate without current "
         "taxation, allowing the full pre-tax amount to remain invested and "
         "compound over your working and retirement years."),
        ("Consolidation vehicle",
         "A Traditional IRA is the most common destination for rollovers from "
         "401(k), 403(b), and 457(b) plans, permitting consolidation and "
         "disciplined allocation under a single investment policy."),
        ("Open investment menu",
         "Choose from equities, ETFs, mutual funds, fixed income, and "
         "brokered CDs, or elect discretionary management under Cumulus "
         "Managed Advisory Services."),
        ("Conversion flexibility",
         "Pre-tax Traditional IRA balances may be converted to a Roth IRA at "
         "any time; conversions are taxable, but may be advantageous in "
         "low-income years or for estate-planning purposes."),
        ("Estate efficiency",
         "Beneficiary designations on your IRA pass outside of probate. "
         "Non-spouse beneficiaries are subject to the SECURE Act 10-year rule "
         "but retain income-tax deferral during the distribution window."),
    ], cols=2))

    # --------------------------------------------------------------- LIMITS
    story.append(B.section_header("Contribution and deduction limits",
                                  kicker="2026 tax year"))
    story.append(B.data_table(
        header=["Status", "Under 50", "Age 50+ (catch-up)", "MAGI phase-out"],
        rows=[
            ["Single — not covered by workplace plan",
             "$7,000", "$8,000", "No phase-out; fully deductible"],
            ["Single — covered by workplace plan",
             "$7,000", "$8,000", "$79,000 – $89,000"],
            ["Married filing jointly — both not covered",
             "$7,000 each", "$8,000 each", "No phase-out"],
            ["MFJ — filer covered, spouse not",
             "$7,000", "$8,000", "$126,000 – $146,000"],
            ["MFJ — filer not covered, spouse covered",
             "$7,000", "$8,000", "$236,000 – $246,000"],
            ["MFJ — both covered",
             "$7,000 each", "$8,000 each", "$126,000 – $146,000"],
            ["Married filing separately — covered",
             "$7,000", "$8,000", "$0 – $10,000"],
        ],
        col_widths=[2.9 * inch, 0.95 * inch, 1.25 * inch, 2.2 * inch],
    ))
    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Non-deductible contributions",
        "If you are above the deductibility phase-out, you may still "
        "contribute to a Traditional IRA on a non-deductible basis. "
        "Non-deductible contributions create tax basis that must be tracked "
        "on IRS Form 8606 and will not be taxed again on withdrawal. Many "
        "clients use non-deductible contributions in combination with a "
        "subsequent Roth conversion (the 'backdoor Roth').",
    ))

    # --------------------------------------------------------------- CHART
    story.append(B.section_header("Tax-deferred compounding",
                                  kicker="Illustrative growth"))
    story.append(B.body_para(
        "The chart below illustrates the hypothetical growth of annual $7,000 "
        "Traditional IRA contributions (represented as a single $7,000 initial "
        "contribution for simplicity) compounded at a 7.0% annualized rate "
        "over thirty years. The ending balance is pre-tax; withdrawals will "
        "be taxed as ordinary income in the year of distribution."
    ))
    story.append(B.growth_curve_chart(
        principal=7_000, apy=7.00, years=30,
        title="$7,000 pre-tax contribution at 7.0% — 30-year hypothetical growth",
    ))

    # --------------------------------------------------------------- RMDs
    story.append(B.section_header("Required minimum distributions",
                                  kicker="RMD rules"))
    story.append(B.body_para(
        "Traditional IRA owners must begin taking required minimum "
        "distributions no later than April 1 of the year following the year "
        "in which they reach age 73. Thereafter, an RMD must be taken by "
        "December 31 each year. RMDs are calculated using the IRS Uniform "
        "Lifetime Table and the prior-year December 31 account balance. "
        "Missed RMDs are subject to a 25% excise tax under IRC §4974 — "
        "reduced to 10% if the missed distribution is corrected within the "
        "applicable two-year correction window established by SECURE 2.0."
    ))
    story.append(B.data_table(
        header=["Age milestone", "What must happen", "Authority"],
        rows=[
            ["59½",
             "Distributions are no longer subject to the 10% early-withdrawal "
             "penalty; ordinary income tax still applies.", "IRC §72(t)"],
            ["73",
             "Required beginning date (RBD). First RMD must be taken by April 1 "
             "of the year following the year you reach age 73.",
             "IRC §401(a)(9); SECURE 2.0 §107"],
            ["75 (for individuals who reach age 74 after 2032)",
             "RBD shifts to age 75 under SECURE 2.0.",
             "SECURE 2.0 §107"],
            ["Each year thereafter",
             "Annual RMD based on the IRS Uniform Lifetime Table, by December 31. "
             "Missed RMDs incur a 25% excise tax (10% if corrected timely).",
             "IRC §4974"],
        ],
        col_widths=[2.2 * inch, 3.6 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- ELIGIBILITY
    story.append(B.section_header("Eligibility and opening",
                                  kicker="Getting started"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who may contribute"),
            *B.bullet_list([
                "Any individual with taxable compensation. (The former age 70½ "
                "limit on contributions was repealed by the SECURE Act of 2019.)",
                "A non-working spouse may contribute on the earned income of a "
                "working spouse when filing jointly.",
                "Deductibility is subject to the MAGI phase-outs shown above "
                "when you or your spouse are covered by a workplace plan.",
                "Contributions for a tax year may be made up to the April 15 "
                "federal income tax filing deadline of the following year.",
            ]),
        ],
        right_flowables=[
            B.sub_header("What you will need"),
            *B.bullet_list([
                "Government-issued photo identification and Social Security "
                "Number.",
                "Beneficiary designations — primary and contingent. IRA "
                "beneficiary designations override a will or trust.",
                "Prior-year income information if you intend to make a "
                "contribution attributed to the previous tax year.",
                "Rollover documentation — a recent account statement and the "
                "originating plan's distribution form — if consolidating.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Should I contribute to a Traditional or a Roth IRA?",
         "If you expect to be in a lower marginal tax bracket in retirement, "
         "a Traditional IRA is often more tax-efficient: deduct now, pay "
         "later. If you expect to be in a higher bracket, a Roth is generally "
         "preferable. Many clients contribute to both to build tax "
         "diversification. Your Cumulus advisor can model your situation with "
         "your tax professional."),
        ("What is a rollover, and how do I execute one?",
         "A rollover moves retirement plan assets (for example, from a 401(k)) "
         "into an IRA. Direct rollovers (trustee-to-trustee) are preferred: "
         "no 20% mandatory withholding and no 60-day window risk. Indirect "
         "rollovers, which involve a check payable to the participant, are "
         "subject to withholding and the 60-day rollover rule, with only one "
         "such rollover permitted per 12-month period (IRC §408(d)(3)(B))."),
        ("How are withdrawals taxed?",
         "Distributions of pre-tax contributions and of earnings are taxed as "
         "ordinary income in the year received. Distributions of basis from "
         "non-deductible contributions are tax-free. The pro-rata rule of IRC "
         "§408(d)(2) applies: each distribution is a proportional blend of "
         "pre-tax and after-tax amounts across all of your Traditional, SEP, "
         "and SIMPLE IRAs."),
        ("What happens to my IRA at death?",
         "Your IRA passes by beneficiary designation, outside of probate. A "
         "spouse beneficiary may treat the IRA as their own or as an "
         "inherited IRA. Non-spouse designated beneficiaries who inherit after "
         "2019 are generally subject to the SECURE Act 10-year rule. 'Eligible "
         "designated beneficiaries' (minor children of the owner, disabled or "
         "chronically ill individuals, and beneficiaries within 10 years of "
         "the owner's age) have additional options."),
        ("Can I take distributions before age 59½ without penalty?",
         "Yes, in limited circumstances. Exceptions to the 10% early-withdrawal "
         "penalty include substantially equal periodic payments under IRC "
         "§72(t)(2)(A)(iv), qualified higher-education expenses, up to $10,000 "
         "for a first-time home purchase, medical expenses exceeding 7.5% of "
         "AGI, health-insurance premiums while unemployed, total and permanent "
         "disability, and distributions to a beneficiary after the owner's "
         "death. Ordinary income tax still applies."),
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
            "Traditional IRA eligibility, contribution limits, and "
            "deductibility phase-outs are established by the Internal "
            "Revenue Service and are subject to annual adjustment. The "
            "figures in this brochure reflect illustrative 2026 amounts.",
            "Distributions before age 59½ are generally subject to a 10% "
            "additional tax under IRC §72(t) in addition to ordinary income "
            "tax, unless a statutory exception applies.",
            "Missed required minimum distributions are subject to a 25% "
            "excise tax under IRC §4974, reduced to 10% if corrected within "
            "the applicable two-year correction window under SECURE 2.0.",
            "Cumulus does not provide legal or tax advice. Consult your tax "
            "professional before establishing, converting, or withdrawing from "
            "an individual retirement account.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
