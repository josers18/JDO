"""Cumulus Estate Settlement Services — wealth segment / estate services."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Estate_Settlement_Services.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Estate Settlement Services",
        product_code="WM-EST-STL-2026.04",
        category="Wealth Management  ·  Estate Services",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Estate Settlement Services",
        lede=("Executor and administrator services during probate — a "
              "professional, objective fiduciary to marshal assets, pay "
              "debts and taxes, and distribute the estate in accordance "
              "with the will and applicable state law."),
        summary_rows=[
            ("Service type", "Executor / Administrator / Personal Representative"),
            ("Authority", "State probate code (e.g., NY SCPA, FL F.S. ch. 733)"),
            ("Illustrative fee range", "2.5% – 3.0% of gross estate (statute-based)"),
            ("Example statutes", "NY SCPA §2307; FL F.S. §733.617"),
            ("Typical timeline", "9 – 18 months"),
            ("Standard of care", "Fiduciary; duty of loyalty and care"),
            ("Coordination with", "Estate attorney, tax professional, beneficiaries"),
            ("Tax return preparation", "Form 706, 1041, and state equivalents"),
        ],
        category_label="PRODUCT BROCHURE  ·  ESTATE SETTLEMENT",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "Estate settlement — also called probate administration — is the "
        "court-supervised process by which a decedent's debts are paid and "
        "their assets are transferred to the beneficiaries named in the "
        "will (or to heirs at law in an intestate estate). Cumulus, through "
        "its trust affiliate, accepts appointment as executor, administrator, "
        "or personal representative. The role carries fiduciary duties to "
        "the estate's beneficiaries and creditors and is governed by the "
        "probate code of the state in which the decedent was domiciled."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. Estate assets that are held in investment accounts "
        "during the administration period remain subject to market risk."
    ))

    # --------------------------------------------------------------- WHY
    story.append(B.section_header("Why engage a corporate executor",
                                  kicker="An objective, professional fiduciary"))
    story.append(B.feature_grid([
        ("Objective decision-making",
         "A corporate executor is neutral among family members and is "
         "unaffected by grief, distance, or family dynamics. The executor "
         "applies the will and the law without the personal conflicts that "
         "sometimes complicate a family member's service."),
        ("Institutional depth",
         "Experienced administrators, fiduciary tax specialists, real-"
         "estate and special-asset capabilities, and established "
         "relationships with appraisers, probate counsel, and the courts."),
        ("Continuous service",
         "Administrators do not age, relocate, or become unavailable. "
         "Settlements that span 12–18 months or longer — the norm in "
         "larger estates — benefit from institutional continuity."),
        ("Proper recordkeeping",
         "Complete books of the estate, periodic accountings, receipts and "
         "releases, and well-documented distribution files that withstand "
         "beneficiary inquiry and court scrutiny."),
        ("Specialized tax expertise",
         "Preparation of Form 706 (federal estate-tax return), state "
         "estate or inheritance returns, final Form 1040 for the decedent, "
         "and Form 1041 for the estate's income tax period."),
        ("Professional risk management",
         "Corporate fiduciaries carry errors-and-omissions and fidelity "
         "coverage; an individual executor carries personal liability."),
    ], cols=2))

    # --------------------------------------------------------------- PROCESS
    story.append(B.section_header("The estate settlement process",
                                  kicker="A structured timeline"))
    story.append(B.data_table(
        header=["Phase", "Principal activities", "Typical timing"],
        rows=[
            ["1  ·  Initial review",
             "Confirm appointment; locate the original will; identify heirs "
             "and beneficiaries; review assets, debts, and key documents.",
             "Days 1–14"],
            ["2  ·  Probate petition",
             "File petition for probate; obtain Letters Testamentary (or "
             "Letters of Administration); provide statutory notices; post "
             "bond if required.",
             "Weeks 2–6"],
            ["3  ·  Inventory and appraisal",
             "Marshal assets; obtain date-of-death valuations for "
             "securities, real estate, closely-held businesses, personal "
             "property, and digital assets.",
             "Months 2–4"],
            ["4  ·  Claims and debts",
             "Publish notice to creditors; review and approve or reject "
             "claims; pay valid debts, funeral costs, and administrative "
             "expenses.",
             "Months 2–8"],
            ["5  ·  Tax compliance",
             "File and pay federal estate tax (Form 706, generally due 9 "
             "months after date of death), state estate or inheritance "
             "tax, final 1040, and Form 1041 for the estate.",
             "Months 4–12"],
            ["6  ·  Distribution and closing",
             "Distribute specific bequests; fund testamentary trusts; "
             "issue residuary distributions; obtain receipts and releases; "
             "file final accounting; close the estate.",
             "Months 9–18"],
        ],
        col_widths=[1.8 * inch, 4.0 * inch, 1.5 * inch],
    ))

    # --------------------------------------------------------------- FEES
    story.append(B.section_header("Executor commissions and fees",
                                  kicker="Statute-based in most states"))
    story.append(B.body_para(
        "Executor compensation in most states is established by statute "
        "and is calculated as a percentage of the estate's value. The "
        "specific schedule varies. The tables below illustrate two common "
        "frameworks — the New York Surrogate's Court Procedure Act §2307 "
        "schedule and the Florida Probate Code §733.617 schedule. The "
        "Cumulus practice is to follow the applicable statute; where a "
        "state does not prescribe a specific rate, a reasonable "
        "compensation standard is applied."
    ))

    story.append(B.sub_header("New York — SCPA §2307 (illustrative tiers)"))
    story.append(B.data_table(
        header=["Estate size tier", "Commission rate", "Notes"],
        rows=[
            ["First $100,000", "5.0%", "Applied to gross estate within tier."],
            ["Next $200,000", "4.0%", "Applied to gross estate within tier."],
            ["Next $700,000", "3.0%", "Applied to gross estate within tier."],
            ["Next $4,000,000", "2.5%", "Applied to gross estate within tier."],
            ["Over $5,000,000", "2.0%", "Applied to gross estate within tier."],
        ],
        col_widths=[2.6 * inch, 1.7 * inch, 3.0 * inch],
    ))

    story.append(Spacer(1, 0.05 * inch))
    story.append(B.sub_header("Florida — F.S. §733.617 (illustrative tiers)"))
    story.append(B.data_table(
        header=["Estate size tier", "Commission rate", "Notes"],
        rows=[
            ["First $1,000,000", "3.0%", "Applied to gross estate within tier."],
            ["Next $4,000,000 ($1M–$5M)", "2.5%", "Applied to gross estate within tier."],
            ["Next $5,000,000 ($5M–$10M)", "2.0%", "Applied to gross estate within tier."],
            ["Over $10,000,000", "1.5%", "Applied to gross estate within tier."],
        ],
        col_widths=[2.6 * inch, 1.7 * inch, 3.0 * inch],
    ))

    # --------------------------------------------------------------- CHART
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.section_header("Illustrative executor fee at common estate sizes",
                                  kicker="Comparison across jurisdictions"))
    story.append(B.body_para(
        "The chart below illustrates the approximate total executor "
        "commission at several estate-size points, applying the NY SCPA "
        "§2307 and FL F.S. §733.617 schedules summarized above. Actual "
        "compensation depends on the specific estate's assets, the "
        "applicable state statute, any extraordinary services performed, "
        "and any court adjustment."
    ))
    story.append(B.bar_comparison_chart(
        labels=["$1M — NY", "$1M — FL", "$5M — NY", "$5M — FL",
                "$10M — NY", "$10M — FL"],
        values=[34000, 30000, 134000, 130000, 234000, 230000],
        title="Illustrative total executor commission — NY vs FL statutes",
        ylabel="Total commission (USD)",
        value_fmt=lambda v: f"${v:,.0f}",
    ))
    story.append(B.callout_box(
        "Interpreting the chart",
        "At $1M: NY $34,000 (5% of $100K + 4% of $200K + 3% of $700K) and "
        "FL $30,000 (3% of $1M). At $5M: NY $134,000 and FL $130,000. At "
        "$10M: NY $234,000 and FL $230,000. The two statutes produce "
        "similar results at common estate sizes, with NY slightly higher "
        "under $10M and the two converging above.",
    ))

    # --------------------------------------------------------------- DUTIES
    story.append(B.section_header("Fiduciary responsibilities of the executor",
                                  kicker="What the role entails"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Asset and beneficiary duties"),
            *B.bullet_list([
                "Marshal assets; obtain date-of-death valuations; secure "
                "property, including real estate and tangible personal "
                "items.",
                "Provide required notices to beneficiaries under the "
                "applicable state probate code.",
                "Preserve asset value; invest liquid estate assets "
                "prudently pending distribution.",
                "Distribute specific bequests; fund testamentary trusts; "
                "make interim and residuary distributions on a timeline "
                "permitted by statute.",
                "Obtain signed receipts and releases from beneficiaries "
                "upon final distribution.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Creditor and tax duties"),
            *B.bullet_list([
                "Publish notice to creditors; review claims; pay valid "
                "debts within statutory priority order.",
                "File the decedent's final Form 1040 covering the period "
                "through date of death.",
                "File Form 706 (federal estate tax) where required, "
                "generally within nine months of the date of death (with "
                "a six-month extension available).",
                "File state estate or inheritance tax returns; coordinate "
                "with the affiliate fiduciary tax group and external tax "
                "counsel.",
                "File Form 1041 for the estate's income-tax year(s) "
                "during administration; issue Schedule K-1s to "
                "beneficiaries.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("Why is a probate estate needed if the decedent had a revocable "
         "trust?",
         "Probate is required to transfer any asset titled solely in the "
         "decedent's name that was not retitled to the trust during life "
         "and that did not pass by operation of law or beneficiary "
         "designation. A well-funded revocable trust with a pour-over will "
         "minimizes probate but rarely eliminates it entirely; there is "
         "almost always a residual probate estate."),
        ("How long does estate settlement take?",
         "Most estates close within 9 to 18 months. Factors that lengthen "
         "the timeline include closely-held business interests, real "
         "estate in multiple states (ancillary probate), federal and "
         "state estate-tax returns, contested wills, and unresolved "
         "creditor claims. Large or complex estates can take multiple "
         "years."),
        ("What is the executor's personal liability?",
         "An executor has fiduciary duties of loyalty and care and may be "
         "personally liable for loss caused by breach of duty. Executors "
         "are also personally responsible for unpaid federal and state "
         "taxes if estate assets are distributed before those taxes are "
         "paid (IRC §6901; 31 U.S.C. §3713). A corporate executor carries "
         "professional coverage; a family member does not."),
        ("Can the executor serve alongside a family member?",
         "Yes. Many families appoint Cumulus as executor with a family "
         "member as co-executor. Cumulus handles the administrative, "
         "investment, and tax burden; the family co-executor provides "
         "personal knowledge of the decedent's wishes and of specific "
         "personal-property items."),
        ("How are executor commissions paid?",
         "Commissions are typically paid from estate assets at the close "
         "of the administration, often in two installments (partial "
         "'receiving' commission after inventory, balance at final "
         "accounting). In most states, commissions are reported as "
         "ordinary income to the executor; the estate is entitled to a "
         "corresponding deduction."),
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
            "Estate settlement services are offered through Cumulus Trust "
            "Company, N.A., a national trust bank and affiliate of Cumulus "
            "Bank, N.A. Acceptance of an executor, administrator, or "
            "personal-representative appointment is at the discretion of "
            "Cumulus Trust Company, N.A. following review of the will, the "
            "nature of the estate, and applicable state probate law.",
            "Executor commissions are governed by the probate statute of "
            "the state in which the decedent was domiciled. The New York "
            "(SCPA §2307) and Florida (F.S. §733.617) schedules in this "
            "brochure are illustrative; fees in other jurisdictions may "
            "differ materially.",
            "Cumulus does not provide legal or tax advice. Specific "
            "probate, tax, and fiduciary questions should be directed to "
            "the estate attorney and tax professional engaged by the "
            "estate.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
