"""Cumulus Roth IRA — wealth segment / retirement."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Roth_IRA.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Roth IRA",
        product_code="WM-IRA-RTH-2026.04",
        category="Wealth Management  ·  Retirement",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Roth IRA",
        lede=("An after-tax individual retirement account for investors who "
              "expect qualified distributions to be tax-free in retirement, "
              "subject to the five-year rule and age 59½ requirements."),
        summary_rows=[
            ("Account type", "Roth Individual Retirement Account (IRC §408A)"),
            ("2026 contribution limit", "$7,000 regular  ·  $8,000 if age 50+"),
            ("Roth income phase-out — single", "$153,000 – $168,000 MAGI"),
            ("Roth income phase-out — MFJ", "$240,000 – $250,000 MAGI"),
            ("Account fee", "$0 for balances ≥ $10,000; $25 annual otherwise"),
            ("Investment menu", "Equities, ETFs, mutual funds, fixed income, CDs"),
            ("Required minimum distributions", "None during the original owner's lifetime"),
            ("Qualified distributions", "Tax-free after age 59½ and five-year rule"),
        ],
        category_label="PRODUCT BROCHURE  ·  RETIREMENT",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Roth IRA is a tax-advantaged individual retirement account "
        "established under Section 408A of the Internal Revenue Code. "
        "Contributions are made with after-tax dollars — there is no "
        "tax deduction in the year of contribution — and qualified "
        "distributions of both contributions and earnings are received "
        "entirely free of federal income tax. Because Roth IRAs do not "
        "require distributions during the original owner's lifetime, "
        "they are commonly used for long-horizon retirement accumulation, "
        "tax-diversification, and multigenerational wealth transfer."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. Suitability, risk tolerance, time horizon, and tax "
        "considerations should be discussed with your Cumulus advisor and "
        "confirmed with your tax professional before you contribute."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Why consider a Roth IRA",
                                  kicker="Key benefits"))
    story.append(B.feature_grid([
        ("Tax-free qualified withdrawals",
         "Qualified distributions of earnings are federal income tax-free when "
         "the account has been open five tax years and the owner is age 59½ or "
         "older (or meets a statutory exception)."),
        ("Tax-free growth",
         "Interest, dividends, and capital gains earned inside a Roth IRA are "
         "not taxed while they remain in the account, allowing decades of "
         "compounding without annual tax drag."),
        ("Contribution flexibility",
         "Roth contributions (not earnings) may be withdrawn at any time, for "
         "any reason, without tax or penalty. This provides access in a hardship "
         "while preserving the account's tax treatment."),
        ("No lifetime RMDs",
         "Unlike Traditional IRAs and employer plans, a Roth IRA imposes no "
         "required minimum distributions during the original owner's lifetime, "
         "preserving tax-free compounding for as long as you choose."),
        ("Estate-planning efficiency",
         "A Roth IRA may be inherited by a designated beneficiary and, for "
         "most non-spouse beneficiaries, distributed over the 10-year period "
         "required by the SECURE Act — often at favorable after-tax rates."),
        ("Open investment menu",
         "Choose from equities, ETFs, mutual funds, fixed income, and "
         "brokered CDs inside your Cumulus Roth IRA, or elect discretionary "
         "management under Cumulus Managed Advisory Services."),
    ], cols=2))

    # --------------------------------------------------------------- LIMITS
    story.append(B.section_header("Contribution limits and phase-outs",
                                  kicker="2026 tax year"))
    story.append(B.body_para(
        "Annual contribution limits are set by the Internal Revenue Service "
        "under IRC §219 and §408A. Eligibility to contribute directly to a "
        "Roth IRA is phased out above specified modified adjusted gross "
        "income (MAGI) thresholds, which are updated each year for inflation. "
        "The figures below reflect the illustrative 2026 limits used for "
        "this brochure."
    ))
    story.append(B.data_table(
        header=["Limit", "Under age 50", "Age 50 or older (catch-up)", "Notes"],
        rows=[
            ["Regular contribution", "$7,000", "$8,000",
             "Contributions may be made for a tax year up to the April 15 "
             "federal income tax filing deadline of the following year."],
            ["Roth income phase-out — single", "$153,000 – $168,000", "Same",
             "No direct Roth contribution above $168,000 MAGI; backdoor Roth "
             "conversion may be available."],
            ["Roth income phase-out — married filing jointly",
             "$240,000 – $250,000", "Same",
             "No direct Roth contribution above $250,000 MAGI."],
            ["Roth income phase-out — married filing separately",
             "$0 – $10,000", "Same",
             "Unusually restrictive threshold; consult your tax professional."],
            ["Spousal contribution", "Up to the limit above", "Same",
             "A non-working spouse may contribute on joint earned income."],
        ],
        col_widths=[2.4 * inch, 1.3 * inch, 1.6 * inch, 2.0 * inch],
    ))
    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "The five-year rule",
        "Earnings in a Roth IRA are tax-free only if withdrawn as part of a "
        "qualified distribution — meaning the account has been open for at "
        "least five tax years and the owner is age 59½ or older, disabled, "
        "has died, or is withdrawing up to $10,000 for a first-time home "
        "purchase. The five-year period begins January 1 of the tax year of "
        "the first Roth contribution and is counted separately for conversions.",
    ))

    # --------------------------------------------------------------- CHART
    story.append(B.section_header("The power of tax-free compounding",
                                  kicker="Illustrative growth"))
    story.append(B.body_para(
        "The chart below illustrates the hypothetical growth of a one-time "
        "$7,000 Roth contribution compounded at a 7.0% annualized rate over "
        "a 30-year horizon. Because qualified Roth distributions are not "
        "taxed, the ending balance generally represents after-tax wealth. "
        "The figure is for illustration only; actual investment results "
        "will vary and may be negative."
    ))
    story.append(B.growth_curve_chart(
        principal=7_000, apy=7.00, years=30,
        title="$7,000 Roth contribution at 7.0% — 30-year hypothetical growth",
    ))

    # --------------------------------------------------------------- WITHDRAWALS
    story.append(B.section_header("Withdrawals and taxation",
                                  kicker="Distribution rules"))
    story.append(B.body_para(
        "Roth distributions are applied under the IRS ordering rules: first "
        "from regular contributions (always tax- and penalty-free), then "
        "from conversions (potentially subject to the 10% early-withdrawal "
        "penalty if within five years of conversion and before age 59½), "
        "and finally from earnings (tax-free only if the distribution is "
        "qualified)."
    ))
    story.append(B.data_table(
        header=["Source withdrawn", "Federal tax", "10% early-withdrawal penalty"],
        rows=[
            ["Regular contributions (at any time, any age)",
             "None", "None"],
            ["Conversion amounts, within 5 years & before 59½",
             "None (already taxed)", "10% unless exception applies"],
            ["Conversion amounts, after 5 years or age 59½",
             "None", "None"],
            ["Earnings — qualified distribution",
             "Tax-free", "None"],
            ["Earnings — nonqualified distribution",
             "Ordinary income on earnings portion",
             "10% on earnings unless exception applies"],
        ],
        col_widths=[3.2 * inch, 2.0 * inch, 2.1 * inch],
    ))
    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Required minimum distributions",
        "Original owners of a Roth IRA are not required to take minimum "
        "distributions during their lifetime. Non-spouse beneficiaries are "
        "generally subject to the 10-year distribution rule enacted by the "
        "SECURE Act (2019) and refined by SECURE 2.0 (2022). Missed RMDs on "
        "inherited Roth IRAs are subject to a 25% excise tax, reduced to 10% "
        "if corrected within the applicable correction window.",
    ))

    # --------------------------------------------------------------- ELIGIBILITY
    story.append(B.section_header("Eligibility and opening",
                                  kicker="Getting started"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who may contribute"),
            *B.bullet_list([
                "Any individual with taxable compensation, subject to the "
                "MAGI phase-outs above.",
                "A non-working spouse may contribute on the earned income of "
                "a working spouse when filing jointly.",
                "There is no upper age limit on Roth contributions (the prior "
                "70½ rule was repealed by the SECURE Act).",
                "Backdoor Roth conversions are available to taxpayers over "
                "the income limits. Discuss the pro-rata rule of IRC §408(d)(2) "
                "with your tax professional before converting.",
            ]),
        ],
        right_flowables=[
            B.sub_header("What you will need"),
            *B.bullet_list([
                "Government-issued photo identification and Social Security "
                "Number.",
                "Beneficiary designations — primary and contingent. Roth IRAs "
                "pass by beneficiary designation and override wills.",
                "A current, accurate suitability profile (time horizon, risk "
                "tolerance, liquidity needs, investment experience).",
                "Source of contribution (current-year, prior-year, transfer, "
                "or rollover) and, if a conversion, the originating plan.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How do I know whether a Roth or Traditional IRA is right for me?",
         "The right answer depends on your current marginal tax bracket, your "
         "expected marginal bracket in retirement, your time horizon, and your "
         "estate-planning objectives. A Roth is generally advantageous when "
         "you expect to be in a higher bracket in retirement; a Traditional "
         "IRA is generally advantageous in the opposite case. Your Cumulus "
         "advisor and tax professional can help you model your specific "
         "situation."),
        ("What happens if I contribute above the limit?",
         "Excess contributions are subject to a 6% excise tax per year until "
         "corrected. You can withdraw the excess (and any earnings on it) by "
         "the October 15 extended filing deadline of the following year to "
         "avoid the excise tax; the earnings portion is taxable in the year "
         "contributed."),
        ("Can I roll an employer plan into a Roth IRA?",
         "A Roth 401(k) or 403(b) balance may be rolled directly into a Roth "
         "IRA without tax. A pre-tax 401(k) balance may be converted to a "
         "Roth IRA but is generally a taxable event; a tax projection and an "
         "analysis of the pro-rata rule should be completed before converting."),
        ("Does a Roth IRA affect my ability to contribute to an employer plan?",
         "No. Roth IRA contributions are independent of 401(k), 403(b), 457(b), "
         "or SIMPLE contributions. You may contribute the full IRA limit in "
         "addition to the full employee deferral limit in your employer plan, "
         "subject to the MAGI phase-outs."),
        ("What is the 'backdoor Roth' strategy?",
         "A backdoor Roth conversion is a two-step transaction in which a "
         "non-deductible contribution is made to a Traditional IRA and then "
         "converted to a Roth IRA. It may be appropriate for taxpayers above "
         "the Roth income phase-outs, but the pro-rata rule applies to all "
         "Traditional, SEP, and SIMPLE IRAs you own — not only the converted "
         "one. Consult your tax professional before executing a backdoor Roth."),
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
            "Roth IRA eligibility, contribution limits, and income phase-outs "
            "are established by the Internal Revenue Service and are subject "
            "to annual adjustment. The figures in this brochure reflect "
            "illustrative 2026 amounts.",
            "The 10% early-withdrawal penalty (IRC §72(t)) applies to "
            "non-qualified distributions of earnings and to conversion amounts "
            "within the applicable five-year period, unless a statutory "
            "exception applies (e.g., death, disability, substantially equal "
            "periodic payments, qualified higher-education expenses, "
            "first-time home purchase up to $10,000).",
            "Cumulus does not provide legal or tax advice. The information in "
            "this brochure is general in nature and should not be relied upon "
            "in place of personalized advice from a qualified tax or legal "
            "professional.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
