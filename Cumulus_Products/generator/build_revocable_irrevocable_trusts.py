"""Cumulus Revocable and Irrevocable Trusts — wealth segment / trust services."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Revocable_and_Irrevocable_Trusts.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Revocable and Irrevocable Trusts",
        product_code="WM-TRU-REV-IRR-2026.04",
        category="Wealth Management  ·  Trust Services",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Revocable and Irrevocable Trusts",
        lede=("Corporate trustee, co-trustee, and successor trustee services "
              "for revocable living trusts used during the grantor's lifetime "
              "and irrevocable trusts used for transfer-tax, asset-protection, "
              "and multigenerational planning."),
        summary_rows=[
            ("Role available", "Trustee  ·  Co-trustee  ·  Successor trustee"),
            ("Trust types", "Revocable living, irrevocable, ILIT, GRAT, SLAT, GST"),
            ("Minimum annual fee", "$5,000"),
            ("Setup fee", "$2,500"),
            ("First $2M in trust assets", "0.95% annually"),
            ("Fee breakpoints", "Tiered to 0.35% above $10M"),
            ("Standard of care", "Prudent-investor rule under UPIA / state UTC"),
            ("Annual accounting", "Prepared by Cumulus fiduciary tax group"),
        ],
        category_label="PRODUCT BROCHURE  ·  TRUST SERVICES",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A trust is a legal arrangement in which a grantor transfers assets "
        "to a trustee to hold and administer for the benefit of one or more "
        "beneficiaries. Cumulus, through its trust affiliate, serves as "
        "corporate trustee, co-trustee, or successor trustee for both "
        "revocable and irrevocable trusts. The trustee acts in a fiduciary "
        "capacity and owes duties of loyalty, impartiality, prudence, and "
        "good faith under the applicable Uniform Trust Code and the prudent-"
        "investor rule codified in the Uniform Prudent Investor Act."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. Assets held in trust remain subject to market risk; "
        "Cumulus's fiduciary duty does not convert an investment into a "
        "guaranteed outcome."
    ))

    # --------------------------------------------------------------- ROLES
    story.append(B.section_header("The roles in a trust",
                                  kicker="Vocabulary of trust law"))
    story.append(B.feature_grid([
        ("Grantor (Settlor, Trustor)",
         "The person who creates the trust and transfers assets to it. For "
         "a revocable trust, the grantor typically retains the power to "
         "amend or revoke during life. For an irrevocable trust, this power "
         "is relinquished."),
        ("Trustee",
         "The fiduciary who holds legal title to trust assets, administers "
         "them in accordance with the trust instrument, and owes duties of "
         "loyalty, prudence, and impartiality to the beneficiaries."),
        ("Beneficiary",
         "The person or class of persons for whom the trust is held. "
         "Beneficiaries may be current (income) or remainder, discretionary "
         "or mandatory, vested or contingent."),
        ("Co-trustee",
         "A second trustee who acts jointly with the corporate trustee, "
         "bringing family knowledge and continuity while Cumulus provides "
         "administrative, investment, and regulatory depth."),
        ("Successor trustee",
         "The trustee designated to act if an initial trustee is unable or "
         "unwilling to serve. Naming Cumulus as successor provides "
         "institutional continuity."),
        ("Trust protector",
         "An optional non-fiduciary office empowered to remove trustees, "
         "modify administrative provisions, or address changes in law "
         "consistent with the grantor's intent."),
    ], cols=2))

    # --------------------------------------------------------------- REVOCABLE VS IRREVOCABLE
    story.append(B.section_header("Revocable vs. irrevocable",
                                  kicker="Two families of trusts"))
    story.append(B.data_table(
        header=["Characteristic", "Revocable Trust",
                "Irrevocable Trust"],
        rows=[
            ["Grantor's power to amend",
             "Yes, at any time during life.",
             "No (or very limited)."],
            ["Primary purpose",
             "Probate avoidance, incapacity planning, privacy.",
             "Transfer-tax planning, asset protection, charitable "
             "planning, Medicaid planning."],
            ["Estate-tax inclusion",
             "Included in the grantor's gross estate (IRC §2036).",
             "Generally not included if properly structured and funded."],
            ["Income-tax treatment",
             "Grantor trust — income reported on grantor's 1040.",
             "Varies: grantor, complex, or simple trust; may file 1041."],
            ["Creditor protection",
             "None for the grantor (revocable = reachable).",
             "Can provide meaningful asset protection when structured "
             "under state asset-protection trust statutes."],
            ["Typical funding",
             "Continuous — retitle throughout life.",
             "Discrete — gifts or sales at inception and thereafter."],
        ],
        col_widths=[1.8 * inch, 2.7 * inch, 2.8 * inch],
    ))

    # --------------------------------------------------------------- COMMON TYPES
    story.append(B.section_header("Commonly-used irrevocable structures",
                                  kicker="A brief vocabulary"))
    story.append(B.data_table(
        header=["Structure", "Primary purpose", "Key characteristics"],
        rows=[
            ["Irrevocable Life Insurance Trust (ILIT)",
             "Exclude life-insurance proceeds from the taxable estate.",
             "Owns the policy; premiums contributed through Crummey powers; "
             "beneficiaries receive proceeds estate-tax-free."],
            ["Grantor Retained Annuity Trust (GRAT)",
             "Transfer appreciation above the §7520 rate with minimal gift-"
             "tax cost.",
             "Grantor retains an annuity; remainder passes to "
             "beneficiaries; 'zeroed-out' GRATs common."],
            ["Spousal Lifetime Access Trust (SLAT)",
             "Use today's high exemption while preserving indirect access "
             "through a spouse.",
             "Each spouse creates a SLAT for the other; reciprocal-trust "
             "doctrine is a key drafting concern."],
            ["Charitable Remainder Trust (CRT)",
             "Income stream + charitable remainder; deferral of gain on "
             "appreciated property.",
             "See separate Cumulus Charitable Trusts brochure."],
            ["Generation-Skipping Trust",
             "Preserve wealth across generations without intermediate "
             "transfer tax.",
             "GST exemption allocated at funding; may remain perpetual in "
             "qualifying jurisdictions."],
        ],
        col_widths=[1.9 * inch, 2.4 * inch, 3.0 * inch],
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Trust administration fee schedule",
                                  kicker="Transparent, tiered"))
    story.append(B.body_para(
        "Fees are calculated on the market value of the assets held in the "
        "trust as of the last business day of each calendar quarter and "
        "debited quarterly in arrears. The minimum annual fee is $5,000; a "
        "one-time setup fee of $2,500 applies. Investment management fees "
        "are included; attorney fees for trust modifications and the fees "
        "of any special assets (closely-held business interests, real "
        "estate, oil and gas) are billed separately by agreement."
    ))
    story.append(B.data_table(
        header=["Asset tier", "Annual fee", "Cumulative"],
        rows=[
            ["First $2,000,000", "0.95%", "Up to $19,000"],
            ["Next $3,000,000 ($2M–$5M)", "0.75%", "Up to $41,500"],
            ["Next $5,000,000 ($5M–$10M)", "0.55%", "Up to $69,000"],
            ["Assets above $10,000,000", "0.35%", "Incremental"],
            ["Minimum annual fee", "$5,000 (applies below $525K tier blend)", ""],
            ["Setup fee", "$2,500 (one-time, at funding)", ""],
        ],
        col_widths=[2.6 * inch, 2.0 * inch, 2.7 * inch],
    ))

    # --------------------------------------------------------------- CHART
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.section_header("Illustrative annual fee across relationship sizes",
                                  kicker="How fees scale with assets"))
    story.append(B.bar_comparison_chart(
        labels=["$1M", "$3M", "$5M", "$10M", "$25M"],
        values=[9500, 24000, 41500, 69000, 121500],
        title="Illustrative annual trustee fee — effective tiered rate",
        ylabel="Annual fee (USD)",
        value_fmt=lambda v: f"${v:,.0f}",
    ))
    story.append(B.callout_box(
        "Effective fee rates",
        "At $1M the effective rate is 0.95%. At $3M it is 0.80%. At $5M it "
        "is 0.83%. At $10M it is 0.69%. At $25M it is 0.49%. Tier "
        "breakpoints produce a declining effective rate as assets grow — "
        "consistent with the economics of professional trust administration.",
    ))

    # --------------------------------------------------------------- DUTIES
    story.append(B.section_header("Fiduciary responsibilities of the trustee",
                                  kicker="What Cumulus delivers"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Administrative duties"),
            *B.bullet_list([
                "Hold, register, and safeguard trust assets in the name of "
                "the trust.",
                "Maintain complete and accurate books of account; prepare "
                "annual accountings consistent with the applicable UTC.",
                "File all federal and state fiduciary income-tax returns "
                "(Form 1041, state equivalents) through the Cumulus "
                "fiduciary tax group.",
                "Provide regular statements, distribution schedules, and "
                "beneficiary communications.",
                "Comply with notice and reporting requirements under the "
                "applicable state Uniform Trust Code.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Investment duties"),
            *B.bullet_list([
                "Invest and manage trust assets consistent with the prudent-"
                "investor rule (Uniform Prudent Investor Act).",
                "Consider the trust's purposes, terms, distribution "
                "requirements, and circumstances of beneficiaries.",
                "Diversify assets unless the trust instrument provides "
                "otherwise or special circumstances apply.",
                "Balance the interests of current and remainder "
                "beneficiaries (the duty of impartiality).",
                "Review the investment program no less frequently than "
                "annually and document the review.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- HOW IT WORKS
    story.append(B.section_header("Engaging Cumulus as trustee",
                                  kicker="The acceptance process"))
    story.append(B.data_table(
        header=["Step", "What happens", "Typical timing"],
        rows=[
            ["1  ·  Review of the instrument",
             "Cumulus reviews the trust agreement for administrability, "
             "fiduciary powers, distribution standards, and any "
             "co-fiduciary provisions.",
             "5–10 days"],
            ["2  ·  Acceptance",
             "A written acceptance memorandum is issued, identifying any "
             "required amendments or side letters and confirming the fee "
             "schedule.",
             "1–5 days"],
            ["3  ·  Funding",
             "Assets are transferred into Cumulus custody: securities "
             "through ACATS, real estate by deed, private interests by "
             "assignment, insurance by change of owner and beneficiary.",
             "30–60 days"],
            ["4  ·  Administration",
             "Distribution requests are evaluated against the trust "
             "standard (HEMS, ascertainable standard, or discretionary); "
             "investments are implemented under the written investment "
             "policy.",
             "Ongoing"],
            ["5  ·  Reporting",
             "Annual accounting, tax-return delivery, and beneficiary "
             "communication calendar. Reviews with family are available "
             "quarterly or on request.",
             "Annual / on request"],
        ],
        col_widths=[1.3 * inch, 4.5 * inch, 1.4 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("What is the difference between a revocable and an irrevocable "
         "trust in practical terms?",
         "A revocable trust is a lifetime-management and probate-avoidance "
         "vehicle — the grantor typically retains full control and the "
         "assets remain in the estate. An irrevocable trust is a transfer-"
         "tax and asset-protection vehicle — the grantor gives up control "
         "in exchange for estate-tax and creditor-protection benefits."),
        ("Why engage a corporate trustee rather than a family member?",
         "Corporate trustees bring impartiality, institutional depth, "
         "continuous succession, and regulatory expertise. Family trustees "
         "bring intimate knowledge of beneficiary circumstances. Many "
         "clients pair the two with Cumulus as corporate trustee or co-"
         "trustee and a family member as co-trustee or trust protector."),
        ("How does the prudent-investor rule affect my portfolio?",
         "The Uniform Prudent Investor Act requires the trustee to develop "
         "an investment program suited to the purposes of the trust, the "
         "circumstances of the beneficiaries, and the duty of "
         "impartiality. It emphasizes portfolio-level risk and return "
         "(modern portfolio theory) rather than security-by-security "
         "prudence."),
        ("Can a trust be changed after the grantor's death?",
         "An irrevocable trust may be modified in limited circumstances: "
         "by consent of all beneficiaries with court approval, by judicial "
         "modification (changed circumstances, administrative deviation), "
         "by decanting into a new trust where state law permits, or by "
         "action of a trust protector."),
        ("What happens if Cumulus is removed or resigns as trustee?",
         "Most trust agreements include succession provisions. Absent "
         "such provisions, state law typically permits the beneficiaries "
         "to appoint a successor by consent. Cumulus will cooperate fully "
         "with any orderly transition and will deliver a final accounting."),
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
            "Cumulus Trust Company, N.A. based on review of the trust "
            "instrument, the nature of the assets, and applicable law.",
            "Investment management of trust assets is conducted under the "
            "prudent-investor rule as codified in the Uniform Prudent "
            "Investor Act and the applicable state Uniform Trust Code. "
            "Investment products are not FDIC insured, not bank guaranteed, "
            "and may lose value.",
            "Cumulus does not provide legal or tax advice. Transfer-tax "
            "planning involves complex federal and state rules that are "
            "periodically revised. Consult your tax professional and legal "
            "counsel regarding your specific situation before establishing, "
            "funding, or modifying a trust.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
