"""Cumulus 529 Education Savings — wealth segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_529_Education_Savings.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus 529 Education Savings",
        product_code="WM-529-2026.04",
        category="Wealth Management  ·  Education Savings",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus 529 Education Savings",
        lede=("A qualified tuition program under IRC §529 for families saving "
              "for a child or grandchild's higher education, K–12 tuition, "
              "apprenticeships, student-loan repayment, or Roth IRA rollover."),
        summary_rows=[
            ("Program type", "Qualified Tuition Program (IRC §529)"),
            ("Minimum contribution", "$25 per scheduled auto-contribution"),
            ("Investment options", "Age-based tracks plus static portfolios"),
            ("Annual gift exclusion", "$18,000 per donor ($36,000 MFJ)"),
            ("5-year superfunding election", "$90,000 per donor ($180,000 MFJ)"),
            ("Federal tax treatment", "Tax-free growth and qualified withdrawals"),
            ("State tax treatment", "Varies by state; deduction available in NY"),
            ("SECURE 2.0 Roth rollover", "$35,000 lifetime / 15-year seasoning"),
        ],
        category_label="PRODUCT BROCHURE  ·  EDUCATION SAVINGS",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A 529 plan is a state-sponsored, tax-advantaged investment account "
        "designed to help families save for qualified education expenses. "
        "Contributions grow federally tax-deferred, and qualified withdrawals "
        "are free from federal income tax. Many states also provide a state "
        "income-tax deduction or credit for contributions by their residents. "
        "Cumulus offers 529 investment advisory services in connection with "
        "plans administered by state trust programs."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. Your Cumulus advisor will discuss the suitability of "
        "a 529 plan relative to your family's time horizon and tax "
        "considerations; consult your tax professional regarding the state "
        "tax benefits that may be available to you."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Key benefits",
                                  kicker="Why a 529"))
    story.append(B.feature_grid([
        ("Federal tax-free growth",
         "Investment earnings accumulate free of federal income tax. "
         "Qualified withdrawals are not taxed at the federal level."),
        ("State tax benefits",
         "Many states provide a state income-tax deduction or credit for "
         "contributions by residents. New York, for example, allows up to "
         "$10,000 deducted per MFJ return (illustrative)."),
        ("High contribution ceiling",
         "Plan-level aggregate limits typically range from $500,000 to "
         "$575,000 per beneficiary, permitting substantial lifetime funding."),
        ("Gift-tax friendly",
         "Contributions qualify for the annual gift-tax exclusion, and a "
         "five-year election under IRC §529(c)(2)(B) permits front-loading "
         "up to five years of exclusions in a single year."),
        ("Owner retains control",
         "The account owner — not the beneficiary — retains control of the "
         "account, may change the beneficiary to another family member, and "
         "may elect to withdraw (subject to the non-qualified tax treatment)."),
        ("Flexible uses",
         "Pay for tuition, room and board, required fees, books, supplies, "
         "and equipment at eligible postsecondary institutions; up to $10,000 "
         "per year of K–12 tuition; apprenticeship costs; and up to $10,000 "
         "of student-loan repayment (SECURE Act)."),
    ], cols=2))

    # --------------------------------------------------------------- QUALIFIED EXPENSES
    story.append(B.section_header("Qualified education expenses",
                                  kicker="What 529 funds may pay for"))
    story.append(B.data_table(
        header=["Expense category", "Qualified?", "Notes"],
        rows=[
            ["Tuition and mandatory fees at an eligible institution",
             "Yes", "Postsecondary: college, university, graduate, trade school."],
            ["Books, supplies, and equipment required for enrollment",
             "Yes", "Must be required by the course or program."],
            ["Room and board",
             "Yes, if at least half-time student",
             "Capped at the institution's published cost of attendance."],
            ["Computers, software, internet access",
             "Yes, if used primarily by the beneficiary during enrollment",
             "Entertainment software excluded."],
            ["Special-needs services required for attendance",
             "Yes",
             "Including attendants, transportation, and adaptive equipment."],
            ["K–12 tuition (public, private, religious)",
             "Yes, up to $10,000 per beneficiary per year",
             "Federal; some states treat K–12 tuition as non-qualified for "
             "state-tax purposes."],
            ["Apprenticeship program costs (fees, books, supplies, equipment)",
             "Yes",
             "Program must be registered under the National Apprenticeship Act."],
            ["Student loan repayment",
             "Yes, up to $10,000 lifetime per beneficiary + $10,000 per sibling",
             "SECURE Act §302."],
            ["Transportation, personal travel, extracurriculars",
             "No", "Non-qualified; subject to tax on earnings + 10% penalty."],
        ],
        col_widths=[2.6 * inch, 2.1 * inch, 2.6 * inch],
    ))

    # --------------------------------------------------------------- NON-QUALIFIED
    story.append(Spacer(1, 0.06 * inch))
    story.append(B.callout_box(
        "Non-qualified withdrawals",
        "Withdrawals that are not used for qualified education expenses are "
        "subject to federal income tax on the earnings portion plus a 10% "
        "additional tax. The 10% tax does not apply when the beneficiary "
        "receives a tax-free scholarship (to the extent of the scholarship), "
        "attends a U.S. service academy, dies, or becomes disabled. State "
        "tax benefits previously received may be recaptured.",
    ))

    # --------------------------------------------------------------- CHART
    story.append(B.section_header("Starting early matters",
                                  kicker="Illustrative growth"))
    story.append(B.body_para(
        "The chart below illustrates the hypothetical growth of a $5,000 "
        "opening contribution compounded at a 6.0% annualized rate over "
        "eighteen years — approximately the time from birth to college "
        "enrollment. The figure is for illustration only and does not "
        "represent the performance of any specific investment option."
    ))
    story.append(B.growth_curve_chart(
        principal=5_000, apy=6.00, years=18,
        title="$5,000 at 6.0% — 18-year hypothetical growth (birth to college)",
    ))

    # --------------------------------------------------------------- DONUT - AGE-BASED
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.sub_header("Age-based portfolio glide path — illustrative"))
    story.append(B.donut_chart(
        labels=["US Equity", "Intl Equity", "Fixed Income", "Cash"],
        values=[45, 20, 30, 5],
        title="Illustrative allocation at age 10 (moderate track)",
        center_text="Age 10",
    ))

    # --------------------------------------------------------------- GIFTING
    story.append(B.section_header("Gifting and superfunding",
                                  kicker="Wealth-transfer considerations"))
    story.append(B.body_para(
        "Contributions to a 529 account are completed gifts to the "
        "beneficiary for federal gift-tax purposes. They qualify for the "
        "annual gift-tax exclusion ($18,000 per donor, per beneficiary in "
        "2026) and may also benefit from the five-year election under IRC "
        "§529(c)(2)(B) — often called 'superfunding' — which permits a donor "
        "to treat up to five years of annual exclusions as made in a single "
        "year. No additional annual-exclusion gifts may be made to the same "
        "beneficiary in the remaining four years without generating a "
        "taxable gift. The election is made on IRS Form 709."
    ))
    story.append(B.data_table(
        header=["Technique", "Per donor (2026)", "Per couple MFJ (2026)",
                "Notes"],
        rows=[
            ["Annual exclusion gift", "$18,000", "$36,000",
             "No Form 709 required if under the exclusion."],
            ["Five-year superfunding", "$90,000", "$180,000",
             "IRC §529(c)(2)(B) election; Form 709 required."],
            ["Lifetime gift-tax exemption", "$13.99 million (illustrative)",
             "$27.98 million (illustrative)",
             "Subject to scheduled 2026 sunset; consult your tax professional."],
        ],
        col_widths=[2.2 * inch, 1.6 * inch, 1.6 * inch, 1.9 * inch],
    ))

    # --------------------------------------------------------------- ROTH ROLLOVER
    story.append(B.section_header("SECURE Act 2.0 — 529 to Roth IRA rollover",
                                  kicker="New flexibility for leftover balances"))
    story.append(B.body_para(
        "Beginning in 2024, Section 126 of SECURE 2.0 permits the owner of a "
        "529 account to transfer unused balances to a Roth IRA for the "
        "beneficiary, subject to the following conditions: the 529 account "
        "must have been maintained for at least 15 years; amounts contributed "
        "(and earnings on those amounts) within the preceding five years may "
        "not be rolled; the rollover is subject to annual Roth IRA "
        "contribution limits for the beneficiary; and the aggregate lifetime "
        "rollover is limited to $35,000 per beneficiary."
    ))
    story.append(B.callout_box(
        "529-to-Roth rollover — plain English",
        "Up to $35,000 of leftover 529 balance can eventually land in the "
        "beneficiary's Roth IRA, tax-free, provided the 529 is at least 15 "
        "years old and the beneficiary has earned income. The rollover is "
        "subject to that year's Roth IRA contribution limit (not the MAGI "
        "phase-out), so it typically takes five or more years to move the "
        "full $35,000.",
    ))

    # --------------------------------------------------------------- ELIGIBILITY
    story.append(B.section_header("Account mechanics",
                                  kicker="Ownership, beneficiaries, changes"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Who owns, who benefits"),
            *B.bullet_list([
                "Any U.S. adult with a Social Security Number may open a 529 "
                "for any beneficiary; the beneficiary need not be related.",
                "Grandparents, other relatives, and non-relatives may all "
                "own accounts for the same child simultaneously.",
                "A successor owner may be named so that ownership passes "
                "automatically on death, bypassing probate.",
                "Federal financial-aid treatment of grandparent-owned 529s "
                "improved under the FAFSA Simplification Act — distributions "
                "are no longer treated as student income.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Beneficiary changes"),
            *B.bullet_list([
                "The account owner may change the beneficiary to a 'member "
                "of the family' of the current beneficiary (IRC §529(e)(2)) "
                "without federal income or gift-tax consequences.",
                "'Family' includes spouse, children, siblings, parents, "
                "in-laws, cousins, nieces, nephews, and aunts and uncles.",
                "Changing a beneficiary to a younger generation may trigger "
                "generation-skipping transfer-tax considerations.",
                "Investment option changes are permitted twice per calendar "
                "year and upon any beneficiary change.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Is a 529 better than a UGMA/UTMA or a Coverdell ESA?",
         "It depends. A 529 offers higher contribution ceilings, broader "
         "state tax benefits, and retention of owner control relative to "
         "a UGMA/UTMA (which becomes the beneficiary's property at majority). "
         "Coverdell ESAs have a $2,000 annual limit and income phase-outs. "
         "Your Cumulus advisor can compare the options for your family."),
        ("What happens if my child receives a scholarship?",
         "You may withdraw an amount equal to the scholarship without "
         "paying the 10% additional tax; the earnings portion is still "
         "subject to ordinary income tax. Alternatively, keep the funds in "
         "the account for graduate school, future siblings, or — subject to "
         "the SECURE 2.0 conditions — a Roth IRA rollover."),
        ("What if my child does not attend college?",
         "You have several options: change the beneficiary to a family "
         "member; hold the account for a future grandchild; use up to "
         "$10,000 lifetime for qualified student-loan repayment; use up to "
         "$35,000 lifetime for a SECURE 2.0 Roth IRA rollover; or take a "
         "non-qualified withdrawal (subject to ordinary income tax and the "
         "10% penalty on earnings)."),
        ("Does contributing to a 529 affect financial aid?",
         "Parent-owned 529 accounts are treated as parent assets on the "
         "FAFSA and are assessed at a maximum of 5.64%. Following the FAFSA "
         "Simplification Act, grandparent-owned distributions no longer "
         "count as student income. Institutional aid formulas may treat "
         "529s differently."),
        ("How are investment options organized?",
         "Two categories: age-based tracks that automatically glide toward "
         "more conservative allocations as the beneficiary approaches "
         "college enrollment; and static portfolios that maintain a fixed "
         "allocation (Conservative, Moderate, Aggressive). You may change "
         "investment options twice per calendar year."),
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
            "Before investing in a 529 plan, consider whether your home state "
            "offers state tax or other benefits that are only available for "
            "investments in that state's qualified tuition program. Consult "
            "your tax professional.",
            "Tax-advantaged treatment of 529 accounts is governed by Section "
            "529 of the Internal Revenue Code and applicable state law. The "
            "figures in this brochure are illustrative; confirm current "
            "limits, qualified expense rules, and state tax treatment with "
            "your tax professional.",
            "Non-qualified withdrawals are subject to federal income tax on "
            "the earnings portion plus a 10% additional federal tax, and may "
            "be subject to state tax recapture.",
            "The SECURE 2.0 529-to-Roth rollover provision is subject to "
            "eligibility conditions, including a 15-year account seasoning "
            "requirement and a $35,000 lifetime limit per beneficiary.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
