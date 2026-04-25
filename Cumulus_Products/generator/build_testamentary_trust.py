"""Cumulus Testamentary Trust — wealth segment / trust services."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Testamentary_Trust.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Testamentary Trust",
        product_code="WM-TRU-TST-2026.04",
        category="Wealth Management  ·  Trust Services",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Testamentary Trust",
        lede=("A trust that comes into existence through a decedent's will at "
              "death, administered by Cumulus as trustee for the benefit of "
              "minor children, second-marriage spouses, or other beneficiaries "
              "requiring structured long-term support."),
        summary_rows=[
            ("Trust type", "Testamentary — created under decedent's will"),
            ("Funded", "At death, through the probate estate"),
            ("Role", "Trustee  ·  Co-trustee  ·  Successor trustee"),
            ("Typical uses", "Minor children, QTIP, credit-shelter, GST"),
            ("Minimum annual fee", "$5,000"),
            ("Standard fee tier", "0.95% on first $2M, tiered thereafter"),
            ("Authority", "State probate code + applicable Uniform Trust Code"),
            ("Standard of care", "Prudent-investor rule under UPIA"),
        ],
        category_label="PRODUCT BROCHURE  ·  TRUST SERVICES",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A testamentary trust is a trust created by the terms of a will and "
        "funded through probate at the decedent's death. Unlike a revocable "
        "living trust — which is created and funded during the grantor's "
        "lifetime — a testamentary trust has no existence until the will is "
        "admitted to probate and assets are distributed to it from the "
        "estate. Testamentary trusts are frequently used to provide "
        "structured support for minor children, surviving spouses in "
        "second-marriage situations, and beneficiaries for whom an outright "
        "distribution is not appropriate."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. Assets held in a testamentary trust are managed "
        "under the prudent-investor rule and remain subject to market risk."
    ))

    # --------------------------------------------------------------- COMMON USES
    story.append(B.section_header("Commonly drafted testamentary trusts",
                                  kicker="Where the instrument fits"))
    story.append(B.feature_grid([
        ("Trusts for minor children",
         "Hold assets for a child until a stated age or graduated staging "
         "(typically a third at age 25, a third at 30, and the balance at "
         "35). Common when both parents die while children are young."),
        ("QTIP marital trust",
         "Qualified terminable interest property trust that provides "
         "lifetime income to a surviving spouse, with the remainder to "
         "children from the decedent's first marriage. Qualifies for the "
         "unlimited marital deduction under IRC §2056(b)(7)."),
        ("Credit-shelter (bypass) trust",
         "Funded with the deceased spouse's applicable exclusion amount; "
         "bypasses the surviving spouse's estate for estate-tax purposes "
         "while providing ascertainable-standard distributions."),
        ("Generation-skipping testamentary trust",
         "Uses the decedent's GST exemption at death; preserves wealth "
         "across generations without intermediate transfer-tax cost. May "
         "remain perpetual in qualifying jurisdictions."),
        ("Sprinkle / spray trust for descendants",
         "Discretionary trust for a class of descendants with flexibility "
         "to respond to changing family circumstances, under a standard "
         "such as health, education, maintenance, and support (HEMS)."),
        ("Incentive or protective trust",
         "Includes provisions that encourage productive behavior or shield "
         "a beneficiary from their own decision-making — used thoughtfully "
         "and with trustee discretion."),
    ], cols=2))

    # --------------------------------------------------------------- TESTAMENTARY vs INTER VIVOS
    story.append(B.section_header("Testamentary vs. inter vivos trusts",
                                  kicker="A comparison"))
    story.append(B.data_table(
        header=["Consideration", "Testamentary trust",
                "Inter vivos revocable trust"],
        rows=[
            ["When created",
             "At death, through the decedent's will.",
             "During the grantor's life."],
            ["Funding",
             "Through probate; may require ancillary probate in each state "
             "where real estate is owned.",
             "By lifetime retitling of assets; avoids probate."],
            ["Court supervision",
             "Often subject to ongoing court supervision during "
             "administration (state-specific).",
             "Generally no court supervision absent a contested matter."],
            ["Privacy",
             "Will is a matter of public record when admitted to probate.",
             "Remains private unless contested."],
            ["Incapacity planning",
             "Does not apply; trust does not exist until death.",
             "Successor trustee may administer during grantor incapacity."],
            ["Administrative cost",
             "Probate costs + ongoing trustee fees.",
             "Trustee fees only after the grantor's death."],
            ["When it fits",
             "Modest estates; minor children; specific structured "
             "distributions; GST or credit-shelter trusts at death.",
             "Most estates with real estate, business interests, or a "
             "privacy priority."],
        ],
        col_widths=[1.7 * inch, 2.8 * inch, 2.8 * inch],
    ))

    # --------------------------------------------------------------- CHART
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.section_header("Illustrative trustee fee across common sizes",
                                  kicker="Annual cost"))
    story.append(B.body_para(
        "Testamentary trusts are administered under the same tiered fee "
        "schedule as other Cumulus trust administration services. The chart "
        "below shows the illustrative annual fee at common trust sizes; "
        "the minimum annual fee is $5,000, and a one-time setup fee of "
        "$2,500 applies at funding."
    ))
    story.append(B.bar_comparison_chart(
        labels=["$500K", "$1M", "$2M", "$5M", "$10M"],
        values=[5000, 9500, 19000, 41500, 69000],
        title="Illustrative annual trustee fee — testamentary trust",
        ylabel="Annual fee (USD)",
        value_fmt=lambda v: f"${v:,.0f}",
    ))
    story.append(B.callout_box(
        "A note on probate costs",
        "Because a testamentary trust is funded through probate, the "
        "decedent's estate bears probate filing fees, executor commissions, "
        "and estate attorney fees before the trust is established. These "
        "costs vary materially by state; a funded inter vivos trust avoids "
        "them at the cost of upfront funding effort during life.",
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("How the trust is established and funded",
                                  kicker="From probate to administration"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Will admitted to probate",
             "The executor (or administrator) files the will, inventories "
             "assets, and gives notice to beneficiaries and creditors.",
             "1–3 months"],
            ["2  ·  Estate administration",
             "Debts, taxes, and expenses of the estate are paid; any "
             "ancillary probate is initiated.",
             "6–18 months"],
            ["3  ·  Trust acceptance",
             "Cumulus reviews the trust provisions of the will, accepts the "
             "appointment in writing, and obtains an EIN for the new trust.",
             "7–15 days"],
            ["4  ·  Funding",
             "The executor distributes the trust's share of the estate to "
             "Cumulus as trustee; assets are retitled into the name of the "
             "trust.",
             "At closing of estate"],
            ["5  ·  Administration",
             "Cumulus invests and distributes under the trust's standard "
             "(HEMS, ascertainable, or discretionary); prepares annual "
             "accountings; and files fiduciary tax returns.",
             "Ongoing"],
        ],
        col_widths=[1.4 * inch, 4.5 * inch, 1.4 * inch],
    ))

    # --------------------------------------------------------------- DUTIES
    story.append(B.section_header("Fiduciary responsibilities",
                                  kicker="What Cumulus delivers"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Administration"),
            *B.bullet_list([
                "Receipt of assets from the estate; preparation of a "
                "funding receipt to the executor.",
                "Registration of assets in the name of the trust; EIN "
                "application and opening of custodial accounts.",
                "Distribution decisions made under the trust's standard, "
                "documented in writing.",
                "Annual accounting to beneficiaries under the applicable "
                "state Uniform Trust Code.",
                "Fiduciary tax returns (Form 1041, state equivalents) and "
                "Schedule K-1s prepared by the Cumulus fiduciary tax group.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Investment"),
            *B.bullet_list([
                "Written investment policy statement calibrated to the "
                "trust's purpose, distribution standard, and time horizon.",
                "Management under the Uniform Prudent Investor Act with "
                "portfolio-level risk and return.",
                "Impartiality between income and remainder beneficiaries; "
                "use of unitrust or power-to-adjust where permitted.",
                "Diversification unless the trust instrument directs "
                "retention of a specific asset.",
                "Periodic review of the investment program, documented no "
                "less frequently than annually.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Why would I use a testamentary trust instead of a revocable "
         "living trust?",
         "For many clients, a funded revocable living trust is preferable "
         "because it avoids probate. Testamentary trusts remain common in "
         "a few scenarios: when the estate is modest and the cost of trust "
         "administration during life is not justified; when the goal is "
         "solely to provide a vehicle for minor children's inheritance if "
         "both parents die young; or when the client values the public "
         "court supervision that probate provides."),
        ("Who is responsible for funding the trust?",
         "The executor (or administrator) of the estate. After estate "
         "debts, taxes, and expenses are paid, the executor distributes "
         "the trust's share to Cumulus as trustee, who acknowledges "
         "receipt. Coordination between the executor and the trustee is "
         "essential; Cumulus often serves as both when appropriate."),
        ("What is a HEMS standard?",
         "'Health, education, maintenance, and support' is an "
         "ascertainable standard recognized under IRC §2041 for "
         "distributions to a beneficiary without causing estate-tax "
         "inclusion at the beneficiary's death. Most testamentary trusts "
         "use the HEMS standard or a narrower subset; the trustee "
         "exercises discretion within that standard."),
        ("Can the trust terminate and distribute outright at some point?",
         "Yes. Many testamentary trusts include staged distributions (for "
         "example, one-third at age 25, one-third at 30, balance at 35) or "
         "a single outright distribution at a specified age. The trust "
         "terminates when all assets have been distributed and the final "
         "accounting is approved."),
        ("How are income and principal distributions taxed?",
         "Distributions that carry out distributable net income (DNI) are "
         "taxed to the beneficiary. Distributions of principal that do not "
         "carry out DNI are generally tax-free. The Cumulus fiduciary tax "
         "group issues Schedule K-1 to each beneficiary and retains any "
         "remaining income at the trust level (taxed at compressed "
         "fiduciary rates)."),
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
            "Trust services are offered through Cumulus Trust Company, N.A., "
            "a national trust bank and affiliate of Cumulus Bank, N.A. "
            "Acceptance of a fiduciary appointment is at the discretion of "
            "Cumulus Trust Company, N.A. based on review of the will, the "
            "nature of the assets, and applicable state probate law.",
            "Testamentary trusts are subject to the probate process of the "
            "state in which the decedent was domiciled. Probate procedures, "
            "fees, and ongoing court supervision vary by state.",
            "Cumulus does not provide legal or tax advice. Confirm the "
            "appropriateness of a testamentary trust for your specific "
            "circumstances with your attorney and tax professional.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
