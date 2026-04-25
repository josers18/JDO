"""Cumulus Charitable Trusts — wealth segment / trust services."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Charitable_Trusts.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Charitable Trusts",
        product_code="WM-TRU-CHR-2026.04",
        category="Wealth Management  ·  Trust Services",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Charitable Trusts",
        lede=("Trustee and administrative services for charitable remainder "
              "trusts (CRT), charitable lead trusts (CLT), and pooled income "
              "funds — planning techniques for donors seeking income-tax, "
              "capital-gain, and transfer-tax efficiencies alongside "
              "philanthropic impact."),
        summary_rows=[
            ("Structures supported", "CRAT, CRUT, NICRUT, NIMCRUT, CLAT, CLUT"),
            ("Role available", "Trustee  ·  Co-trustee  ·  Successor trustee"),
            ("Annual fee schedule", "Same tiered rate as Trust Administration"),
            ("Minimum annual fee", "$5,000"),
            ("Authority", "IRC §664 (CRT)  ·  IRC §170(f)(2)(B) (CLT)"),
            ("Payout range — CRT", "5% to 50% annually (IRC §664(d))"),
            ("10% remainder test", "Minimum 10% actuarial value to charity"),
            ("Probability-of-exhaustion test", "5% threshold under Rev. Rul. 77-374"),
        ],
        category_label="PRODUCT BROCHURE  ·  CHARITABLE PLANNING",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A charitable trust is an irrevocable vehicle in which a donor "
        "divides the economic interest in contributed property between "
        "non-charitable beneficiaries (typically the donor or family "
        "members) and one or more qualified charitable organizations. "
        "Charitable remainder trusts pay an annuity or unitrust amount to "
        "non-charitable beneficiaries first, with the remainder passing to "
        "charity. Charitable lead trusts do the opposite: charity receives "
        "the current payments, and the remainder returns to family."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. The tax benefits of charitable trusts depend on "
        "proper drafting, qualified charitable beneficiaries, and ongoing "
        "compliance; discuss your circumstances with your Cumulus advisor, "
        "attorney, and tax professional."
    ))

    # --------------------------------------------------------------- BENEFITS
    story.append(B.section_header("Why consider a charitable trust",
                                  kicker="Integrated planning"))
    story.append(B.feature_grid([
        ("Current income-tax deduction",
         "A charitable deduction equal to the present value of the charity's "
         "interest is available in the year of funding, subject to adjusted-"
         "gross-income percentage limits (generally 30% for gifts to public "
         "charities of appreciated long-term capital-gain property)."),
        ("Capital-gain deferral or avoidance",
         "A CRT does not recognize gain when it sells appreciated property "
         "contributed by the donor, enabling diversification of a "
         "concentrated position without immediate tax recognition."),
        ("Estate-tax exclusion",
         "Assets transferred to a properly-structured charitable trust are "
         "removed from the donor's taxable estate; remainder interests to "
         "charity qualify for the unlimited charitable estate-tax "
         "deduction under IRC §2055."),
        ("Income stream to non-charitable beneficiaries",
         "A CRT provides a lifetime or term-certain income stream to the "
         "donor, spouse, or designated family members — often a useful "
         "component of retirement-income planning."),
        ("Leveraged gift to family (CLT)",
         "A charitable lead annuity trust in a low-§7520-rate environment "
         "can transfer the trust's ending principal to family with minimal "
         "gift-tax consequence."),
        ("Philanthropic impact",
         "Enables the donor to support qualified public charities or a "
         "family private foundation with sizable commitments while "
         "integrating the gifting with income and estate planning."),
    ], cols=2))

    # --------------------------------------------------------------- CRT TYPES
    story.append(B.section_header("Charitable remainder trusts",
                                  kicker="IRC §664"))
    story.append(B.body_para(
        "A charitable remainder trust is a split-interest trust that pays "
        "a fixed or variable amount to one or more non-charitable "
        "beneficiaries for a term of years (up to 20) or for the lives of "
        "the beneficiaries, with the remainder passing to one or more "
        "qualified charities. The trust is tax-exempt, and gains on the "
        "sale of contributed property are not recognized at the trust "
        "level. Payments to non-charitable beneficiaries carry out the "
        "trust's income under the four-tier system of IRC §664."
    ))
    story.append(B.data_table(
        header=["Structure", "Payout", "When it fits"],
        rows=[
            ["CRAT — Charitable Remainder Annuity Trust",
             "Fixed dollar annuity (5%–50% of initial value), paid for "
             "life or term.",
             "Donors who prefer a fixed income stream and are confident in "
             "the probability-of-exhaustion test."],
            ["CRUT — Standard Charitable Remainder Unitrust",
             "Fixed percentage (5%–50%) of the trust's annual revalued "
             "market value.",
             "Donors seeking an inflation-adjusted income and who expect "
             "ongoing portfolio growth."],
            ["NICRUT — Net Income CRUT",
             "Lesser of the unitrust amount or actual net income for the "
             "year.",
             "Situations where the contributed property is illiquid at "
             "funding (e.g., undeveloped real estate)."],
            ["NIMCRUT — Net Income with Makeup CRUT",
             "NICRUT with a make-up provision when income later exceeds "
             "the unitrust amount.",
             "Pre-retirement 'income-in-waiting' strategies with closely-"
             "held business interests."],
            ["Flip CRUT",
             "Starts as NICRUT/NIMCRUT; converts to standard CRUT upon a "
             "defined triggering event.",
             "Contributions of hard-to-value or illiquid assets that will "
             "become marketable upon a defined event."],
        ],
        col_widths=[2.3 * inch, 2.2 * inch, 2.8 * inch],
    ))

    # --------------------------------------------------------------- CLT TYPES
    story.append(B.section_header("Charitable lead trusts",
                                  kicker="IRC §170(f)(2)(B)"))
    story.append(B.body_para(
        "A charitable lead trust is the mirror image of a CRT: the trust "
        "pays a fixed annuity (CLAT) or unitrust amount (CLUT) to charity "
        "for a term of years, and the remainder passes to non-charitable "
        "beneficiaries — typically family members. CLTs are often "
        "structured as 'grantor' trusts (producing an up-front income-tax "
        "deduction to the donor while the donor is taxed on trust income) "
        "or 'non-grantor' trusts (no up-front deduction, but the trust "
        "itself pays tax on income). In a low §7520-rate environment, a "
        "'zeroed-out' CLAT can transfer the trust's appreciation to "
        "family with minimal gift-tax consequence."
    ))

    # --------------------------------------------------------------- DONUT
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.section_header("Illustrative economics — a funded CRUT",
                                  kicker="Where the dollars flow"))
    story.append(B.body_para(
        "The allocation below illustrates the approximate economics of a "
        "standard 5% CRUT funded with $1 million of appreciated securities, "
        "assuming a 20-year term and a 6% annualized portfolio return. "
        "Actual outcomes vary with market conditions, payout rate, and "
        "term; use the figures only to visualize the structure."
    ))
    story.append(B.donut_chart(
        labels=["Income to donor (20 years)",
                "Charitable remainder",
                "Embedded gain deferred at funding"],
        values=[50, 35, 15],
        title="CRUT — illustrative economic composition",
    ))
    story.append(B.callout_box(
        "Asset allocation and the prudent-investor rule",
        "The investment program for a CRT or CLT must be calibrated to the "
        "payout obligation, the anticipated term, and the duty of "
        "impartiality between income and remainder beneficiaries. Cumulus "
        "manages CRT and CLT assets under the Uniform Prudent Investor Act "
        "and a written investment policy statement.",
    ))

    # --------------------------------------------------------------- TRUSTEE DUTIES
    story.append(B.section_header("Fiduciary responsibilities",
                                  kicker="What Cumulus delivers"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Administration"),
            *B.bullet_list([
                "Registration of contributed property in the trust's name "
                "and obtainment of a federal Employer Identification "
                "Number (EIN).",
                "Calculation and timely payment of the annuity or unitrust "
                "amount to non-charitable beneficiaries.",
                "Distribution to the named charitable beneficiaries in "
                "accordance with the trust terms.",
                "Annual preparation of Form 5227 (Split-Interest Trust "
                "Information Return) and any required Form 1041-A or "
                "state equivalents.",
                "Beneficiary Schedule K-1s, four-tier accounting under IRC "
                "§664(b), and state fiduciary reporting.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Investment and compliance"),
            *B.bullet_list([
                "Investment under the prudent-investor rule and the trust's "
                "written investment policy.",
                "Avoidance of self-dealing under IRC §4941 and other "
                "private-foundation excise taxes under IRC §§4942–4945.",
                "Monitoring of the 10% remainder test at funding and the "
                "5% probability-of-exhaustion test for CRATs (Rev. Rul. "
                "77-374).",
                "Coordination with the donor's tax professional on the "
                "charitable deduction, the §7520 rate used, and the "
                "present-value computation.",
                "Coordination with qualified charitable beneficiaries on "
                "remainder distribution logistics.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Fees",
                                  kicker="Transparent, tiered"))
    story.append(B.body_para(
        "Charitable trusts are administered under the same tiered fee "
        "schedule as the Cumulus Trust Administration program. Fees are "
        "calculated on the quarterly market value of trust assets and "
        "debited quarterly in arrears. A one-time setup fee of $2,500 "
        "applies; the minimum annual fee is $5,000."
    ))
    story.append(B.data_table(
        header=["Asset tier", "Annual fee"],
        rows=[
            ["First $2,000,000", "0.95%"],
            ["Next $3,000,000 ($2M–$5M)", "0.75%"],
            ["Next $5,000,000 ($5M–$10M)", "0.55%"],
            ["Assets above $10,000,000", "0.35%"],
            ["Minimum annual fee", "$5,000"],
            ["Setup fee (one-time)", "$2,500"],
        ],
        col_widths=[3.6 * inch, 3.7 * inch],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How is my charitable deduction calculated at funding?",
         "For a CRT, the deduction is the present value of the remainder "
         "interest that will pass to charity, computed using the §7520 rate "
         "published monthly by the IRS and the payout rate, term, and "
         "beneficiary ages stated in the trust. For a grantor CLT, the "
         "deduction is the present value of the charity's lead interest. "
         "The trust must meet the 10% minimum remainder test at funding "
         "(CRT) or the actuarial tests applicable to CLTs."),
        ("What assets are suitable for a CRT?",
         "Low-basis, appreciated marketable securities, real estate held "
         "more than a year, and — with careful planning and often a flip "
         "provision — interests in closely-held businesses. Certain assets "
         "(S-corp stock, debt-encumbered property, tangible personal "
         "property) raise special issues and should be reviewed before "
         "contribution."),
        ("May I change the charitable beneficiary after funding?",
         "Most CRTs and CLTs reserve the power for the donor (or a trust "
         "protector) to substitute one or more qualified charities for the "
         "originally-named charity. The power to name a new charity is "
         "generally preserved; the power to direct property to a "
         "non-charity is not."),
        ("What is the private-foundation parallel to a charitable trust?",
         "A private family foundation is a separately-incorporated tax-"
         "exempt entity, typically funded with a lump-sum gift, that "
         "supports charities over multiple years. Compared with a CRT or "
         "CLT, a private foundation is more flexible in grant-making but "
         "is subject to an annual distribution requirement and the §4940 "
         "excise tax. Cumulus can provide private-foundation "
         "administrative services as well."),
        ("Are charitable trusts subject to the private-foundation excise "
         "tax rules?",
         "Yes. CRTs and CLTs are subject to the self-dealing rules of IRC "
         "§4941 and certain other private-foundation rules. Cumulus's "
         "administration program is designed to prevent inadvertent "
         "prohibited transactions and excise tax exposure."),
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
            "Charitable trusts are subject to specific drafting and "
            "operational requirements under IRC §§664 and 170(f)(2). The "
            "income-tax, capital-gain, and transfer-tax benefits described "
            "depend on strict compliance with those requirements.",
            "Cumulus does not provide legal or tax advice. The actuarial "
            "calculations referenced in this brochure use the §7520 rate "
            "published monthly by the IRS and vary over time. Consult your "
            "tax professional and legal counsel before establishing or "
            "funding a charitable trust.",
            "A charitable remainder trust is irrevocable. Property "
            "contributed cannot be returned to the donor; payments to the "
            "non-charitable beneficiary are the exclusive mechanism for "
            "realizing value other than through distribution to charity.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
