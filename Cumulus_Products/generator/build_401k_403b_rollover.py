"""Cumulus 401(k) / 403(b) Rollover Services — wealth segment."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_401k_403b_Rollover.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus 401(k) / 403(b) Rollover Services",
        product_code="WM-RET-RLV-2026.04",
        category="Wealth Management  ·  Retirement",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus 401(k) / 403(b) Rollover Services",
        lede=("Advisory support for consolidating an employer-plan balance "
              "following separation from service, retirement, or plan "
              "termination — including direct rollover, in-plan Roth "
              "conversion, and net unrealized appreciation analysis."),
        summary_rows=[
            ("Service type", "Rollover advisory and execution"),
            ("Eligible source plans", "401(k), 403(b), 457(b), pension, SEP, SIMPLE"),
            ("Destination", "Traditional IRA or Roth IRA at Cumulus"),
            ("2026 employee deferral limit", "$23,500 (under 50)"),
            ("Age 50+ catch-up", "$7,500"),
            ("Age 60–63 super-catch-up", "$11,250 (SECURE 2.0 §109)"),
            ("In-plan Roth conversions", "Supported where plan permits"),
            ("NUA analysis", "Available for appreciated employer stock"),
        ],
        category_label="PRODUCT BROCHURE  ·  RETIREMENT",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Cumulus 401(k) / 403(b) Rollover Services is a coordinated advisory "
        "program for clients who are leaving an employer, retiring, or "
        "rationalizing an accumulated set of workplace plan accounts. Your "
        "Cumulus advisor will evaluate whether a rollover is appropriate "
        "relative to the alternatives — leaving the balance in the current "
        "plan, transferring to a new employer's plan, or taking a taxable "
        "distribution — and will document the analysis in accordance with "
        "applicable fiduciary standards."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. Any recommendation to roll a workplace plan balance "
        "to an IRA will be made in your best interest consistent with the "
        "Department of Labor's fiduciary framework (PTE 2020-02) and "
        "Regulation Best Interest."
    ))

    # --------------------------------------------------------------- OPTIONS
    story.append(B.section_header("Your four options at separation",
                                  kicker="Compare before you decide"))
    story.append(B.feature_grid([
        ("Leave the balance in your former employer's plan",
         "Continue tax-deferred growth under your prior plan's investment "
         "menu and fee structure. Administrative changes require working "
         "through the prior employer's plan sponsor."),
        ("Roll over to your new employer's plan",
         "Consolidate with your new plan if the plan accepts rollovers. "
         "Access to the new plan's investment menu, any employer loan "
         "provisions, and ERISA creditor protection are retained."),
        ("Roll over to an IRA at Cumulus",
         "Access a broader investment menu, consolidate with other IRA "
         "balances, and establish a single investment policy. Your Cumulus "
         "advisor will document the rationale under PTE 2020-02."),
        ("Take a cash distribution",
         "Receive the balance in cash. 20% mandatory federal withholding "
         "applies; the full distribution is taxed as ordinary income and, "
         "if under age 59½, may be subject to a 10% additional tax."),
    ], cols=2))

    # --------------------------------------------------------------- 2026 LIMITS
    story.append(B.section_header("2026 employer-plan limits",
                                  kicker="For context"))
    story.append(B.data_table(
        header=["Limit", "Amount", "Authority / notes"],
        rows=[
            ["Employee elective deferral — 401(k), 403(b), 457(b)",
             "$23,500", "IRC §402(g); updated annually for inflation."],
            ["Age 50+ catch-up contribution",
             "$7,500",
             "Roth catch-up mandatory for high earners under SECURE 2.0 §603."],
            ["Age 60–63 super-catch-up",
             "$11,250",
             "SECURE 2.0 §109; applies in the calendar year you are 60–63."],
            ["Total defined-contribution limit (employee + employer)",
             "$70,000",
             "IRC §415(c); $77,500 with age 50+ catch-up."],
            ["Compensation limit",
             "$350,000",
             "IRC §401(a)(17)."],
            ["Highly compensated employee threshold",
             "$160,000",
             "IRC §414(q); look-back to prior year."],
        ],
        col_widths=[3.25 * inch, 1.25 * inch, 2.8 * inch],
    ))

    # --------------------------------------------------------------- DIRECT vs INDIRECT
    story.append(B.section_header("Direct vs indirect rollovers",
                                  kicker="Choose the safer path"))
    story.append(B.body_para(
        "Whenever possible, execute a direct (trustee-to-trustee) rollover. "
        "Direct rollovers are not subject to the 20% mandatory federal "
        "withholding under IRC §3405(c), and they avoid the 60-day rollover "
        "rule entirely. Indirect rollovers — in which the plan issues a check "
        "to you — are more restrictive and more easily mishandled."
    ))
    story.append(B.data_table(
        header=["Characteristic", "Direct rollover (preferred)",
                "Indirect rollover"],
        rows=[
            ["Check payable to",
             "Cumulus Investment Services, LLC FBO client",
             "The client individually"],
            ["Federal withholding", "None",
             "20% mandatory under IRC §3405(c)"],
            ["60-day deadline", "Does not apply",
             "Funds must be deposited in an eligible retirement account "
             "within 60 calendar days; failure is a taxable distribution"],
            ["Frequency limit", "Unlimited direct rollovers",
             "One indirect IRA-to-IRA rollover per 12-month period "
             "(IRC §408(d)(3)(B))"],
            ["Reporting", "Form 1099-R code G (direct)",
             "Form 1099-R code 1 or 7 plus Form 5498 rollover contribution"],
        ],
        col_widths=[1.8 * inch, 2.8 * inch, 2.7 * inch],
    ))

    # --------------------------------------------------------------- CHART
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.section_header("The impact of consolidation",
                                  kicker="Illustrative growth"))
    story.append(B.body_para(
        "The chart below illustrates the hypothetical growth of a $250,000 "
        "rollover balance compounded at a 7.0% annualized return over a "
        "twenty-year horizon. Because tax-deferral continues to apply in a "
        "Traditional IRA (and tax-free treatment applies in a Roth IRA for "
        "qualified distributions), rolling rather than cashing out preserves "
        "decades of potential compounding."
    ))
    story.append(B.growth_curve_chart(
        principal=250_000, apy=7.00, years=20,
        title="$250,000 rollover at 7.0% — 20-year hypothetical growth",
    ))

    # --------------------------------------------------------------- NUA
    story.append(B.section_header("Net unrealized appreciation",
                                  kicker="Appreciated employer stock"))
    story.append(B.body_para(
        "If your employer plan includes shares of your employer's stock with "
        "substantial embedded appreciation, an alternative to a full rollover "
        "may be favorable. Under the net unrealized appreciation (NUA) "
        "provisions of IRC §402(e)(4), the participant may receive the "
        "employer stock in kind in a lump-sum distribution: the original cost "
        "basis is taxable as ordinary income at the time of distribution, and "
        "the appreciation is deferred until sale, at which point it is taxed "
        "at long-term capital-gains rates. NUA is a one-time, irrevocable "
        "election with specific triggering-event and timing requirements. "
        "Your Cumulus advisor will coordinate the analysis with your tax "
        "professional before the distribution is initiated."
    ))

    # --------------------------------------------------------------- PROCESS
    story.append(B.section_header("How a rollover is executed",
                                  kicker="Step-by-step"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Review",
             "Your Cumulus advisor compares the current plan's investment "
             "menu, fees, and features with an IRA; documents the "
             "recommendation under PTE 2020-02 and Regulation Best Interest.",
             "1–2 meetings"],
            ["2  ·  Open destination",
             "Open the Cumulus Traditional IRA (pre-tax) and/or Roth IRA "
             "(Roth 401(k) source), naming beneficiaries.",
             "Same day"],
            ["3  ·  Initiate rollover",
             "Contact the prior plan's recordkeeper; request a direct "
             "rollover payable to 'Cumulus Investment Services, LLC FBO "
             "client name', with the account number included.",
             "Same day"],
            ["4  ·  Settlement",
             "Funds arrive by check or wire and are posted to the receiving "
             "IRA. In-kind transfers of eligible securities are posted to "
             "your account with the proceeds re-registered in your name.",
             "5–15 business days"],
            ["5  ·  Implementation",
             "Your advisor invests the balance consistent with your written "
             "investment policy statement, balancing transaction costs and "
             "tax considerations.",
             "10–30 days"],
        ],
        col_widths=[1.2 * inch, 4.6 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Will I owe tax on a rollover?",
         "A direct rollover of pre-tax 401(k)/403(b) assets to a Traditional "
         "IRA is not a taxable event. A rollover of Roth 401(k) assets to a "
         "Roth IRA is not taxable. Rolling pre-tax assets to a Roth IRA is a "
         "conversion and is taxed as ordinary income in the year of "
         "conversion."),
        ("Should I consider an in-plan Roth conversion before rolling over?",
         "Some plans permit in-plan Roth conversions, which allow pre-tax "
         "balances to be converted to a Roth subaccount while remaining in "
         "the plan. Your Cumulus advisor will review whether an in-plan "
         "conversion, a post-rollover conversion, or no conversion produces "
         "the best projected after-tax outcome given your tax bracket and "
         "time horizon."),
        ("Will I lose creditor protection by rolling over?",
         "401(k) and 403(b) balances generally enjoy broad creditor "
         "protection under ERISA. Rollover IRAs typically retain federal "
         "bankruptcy protection; non-bankruptcy creditor protection varies "
         "by state. Discuss your specific jurisdiction with qualified legal "
         "counsel."),
        ("What is the Rule of 55 and can I still use it?",
         "Under IRC §72(t)(2)(A)(v), a participant who separates from "
         "service in the year they turn 55 or later may take distributions "
         "from that employer's plan without the 10% early-withdrawal penalty. "
         "This exception is lost once the balance is rolled to an IRA. If "
         "you plan to rely on the Rule of 55, discuss with your advisor "
         "whether a partial rollover is appropriate."),
        ("Can I roll after-tax employer-plan contributions separately?",
         "Yes. Under IRS Notice 2014-54, pre-tax and after-tax subaccounts "
         "may generally be rolled to a Traditional IRA and Roth IRA "
         "respectively in a single, simultaneous rollover, preserving the "
         "tax character of each. This is often called a 'split rollover.'"),
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
            "Rollover recommendations are made in accordance with Department "
            "of Labor Prohibited Transaction Exemption 2020-02 ('Improving "
            "Investment Advice for Workers and Retirees') and Regulation "
            "Best Interest. The rationale for any rollover recommendation "
            "will be documented in writing and furnished to the client.",
            "Leaving your balance in an employer's plan, transferring to a "
            "new employer's plan, or rolling to an IRA each has benefits "
            "and drawbacks, including investment options, fees, services, "
            "creditor protection under ERISA, and required-minimum-"
            "distribution treatment. Discuss with your Cumulus advisor.",
            "NUA, Rule of 55, and other statutory provisions have specific "
            "eligibility and timing requirements. Consult your tax "
            "professional before electing these treatments.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
