"""Cumulus Special Needs Trust — wealth segment / trust services."""
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
OUT_PATH = os.path.join(OUT_DIR, "Cumulus_Special_Needs_Trust.pdf")


def build():
    B.set_theme("wealth")

    doc = B.BrochureDoc(
        OUT_PATH,
        product_name="Cumulus Special Needs Trust",
        product_code="WM-TRU-SNT-2026.04",
        category="Wealth Management  ·  Trust Services",
        segment="wealth",
    )

    story = []

    # --------------------------------------------------------------- COVER
    story += B.hero_block(
        product_name="Cumulus Special Needs Trust",
        lede=("Corporate trustee services for trusts that supplement — "
              "but do not replace — needs-based public benefits for a "
              "beneficiary with a disability, preserving eligibility for "
              "Supplemental Security Income and Medicaid."),
        summary_rows=[
            ("Trust types", "First-party (d)(4)(A), Third-party, Pooled (d)(4)(C)"),
            ("Role available", "Trustee  ·  Co-trustee  ·  Successor trustee"),
            ("Authority", "42 U.S.C. §1396p(d)(4); POMS SI 01120.200–.203"),
            ("Purpose", "Supplement, not supplant, public benefits"),
            ("Minimum annual fee", "$5,000"),
            ("Standard fee tier", "0.95% on first $2M, tiered thereafter"),
            ("Payback provision", "Required for (d)(4)(A) at beneficiary's death"),
            ("ABLE account coordination", "Available for qualifying individuals"),
        ],
        category_label="PRODUCT BROCHURE  ·  SPECIAL NEEDS PLANNING",
    )
    story += B.switch_to_body()

    # --------------------------------------------------------------- OVERVIEW
    story.append(B.section_header("Overview", kicker="At a glance"))
    story.append(B.lead_para(
        "A Special Needs Trust (SNT) is a trust specifically designed to "
        "hold assets for a person with a disability in a manner that does "
        "not disqualify the beneficiary from needs-based public benefits "
        "such as Supplemental Security Income (SSI) and Medicaid. The trust "
        "is administered by a trustee who makes discretionary distributions "
        "to providers of goods and services that supplement — but do not "
        "supplant — the public benefits to which the beneficiary is "
        "entitled. Cumulus, through its trust affiliate, serves as "
        "corporate trustee, co-trustee, or successor trustee."
    ))
    story.append(B.body_para(
        "Investment products are not FDIC insured, not bank guaranteed, and "
        "may lose value. The public-benefits analysis and the specific SNT "
        "structure appropriate for a given family depend on state law and "
        "the beneficiary's circumstances; discuss your situation with your "
        "Cumulus advisor and elder-law attorney."
    ))

    # --------------------------------------------------------------- WHY
    story.append(B.section_header("Why families use a Special Needs Trust",
                                  kicker="The core problem it solves"))
    story.append(B.feature_grid([
        ("Protect benefit eligibility",
         "SSI imposes a $2,000 resource limit (single), and Medicaid "
         "eligibility is similarly means-tested. An outright inheritance "
         "can disqualify the beneficiary. Assets in a properly drafted SNT "
         "are not countable resources."),
        ("Preserve family wealth for care",
         "Funds remain available to pay for services, therapies, "
         "equipment, travel, and companionship costs that public "
         "benefits do not cover."),
        ("Avoid unintended disinheritance",
         "Parents and grandparents can include the disabled beneficiary "
         "in the family's overall estate plan without triggering a loss "
         "of benefits."),
        ("Professional administration",
         "A corporate trustee brings continuity across the beneficiary's "
         "lifetime, objective distribution decisions, and experience with "
         "POMS (the SSA's Program Operations Manual System) guidance."),
        ("Lifetime planning horizon",
         "An SNT is often the centerpiece of a multi-decade plan that "
         "coordinates housing, healthcare, guardianship, and employment "
         "considerations."),
        ("Coordination with ABLE accounts",
         "A tax-advantaged ABLE account (IRC §529A) may be used alongside "
         "an SNT for qualifying individuals who became disabled before age 46."),
    ], cols=2))

    # --------------------------------------------------------------- TYPES
    story.append(B.section_header("The three principal SNT structures",
                                  kicker="Choose based on the source of funds"))
    story.append(B.data_table(
        header=["Structure", "Source of funds", "Distinguishing features"],
        rows=[
            ["First-party — 42 U.S.C. §1396p(d)(4)(A)",
             "Assets owned by (or payable to) the beneficiary — typically a "
             "personal-injury settlement or an inheritance that arrived "
             "without planning.",
             "Beneficiary must be under age 65 at funding; trust must "
             "require payback to state Medicaid agencies at the "
             "beneficiary's death; funded with the beneficiary's own money."],
            ["Third-party",
             "Assets contributed by someone other than the beneficiary — "
             "typically parents, grandparents, or a family trust.",
             "No age limit; no Medicaid payback required; remainder can "
             "pass to other family members at the beneficiary's death."],
            ["Pooled — 42 U.S.C. §1396p(d)(4)(C)",
             "Assets pooled with those of other beneficiaries, "
             "administered by a non-profit organization with separate "
             "accounting.",
             "Generally no age restriction; Medicaid payback required "
             "(to the extent not retained by the nonprofit); useful for "
             "smaller account sizes."],
        ],
        col_widths=[2.0 * inch, 2.4 * inch, 2.9 * inch],
    ))

    # --------------------------------------------------------------- DISTRIBUTIONS
    story.append(B.section_header("What an SNT can and cannot pay for",
                                  kicker="Supplement, not supplant"))
    story.append(B.body_para(
        "The trustee of a properly structured Special Needs Trust should "
        "avoid direct cash distributions to the beneficiary and avoid "
        "paying for food or shelter in a manner that triggers the SSA's "
        "'in-kind support and maintenance' (ISM) reduction in SSI benefits. "
        "Instead, the trustee pays third-party providers directly for "
        "goods and services that improve the beneficiary's quality of life. "
        "POMS SI 01120.200 through SI 01120.203 are the primary SSA "
        "guidance."
    ))
    story.append(B.data_table(
        header=["Category", "Typically allowable",
                "Not recommended / watch-outs"],
        rows=[
            ["Shelter",
             "Home modifications for accessibility, assistive technology.",
             "Direct rent or mortgage payments reduce SSI under ISM; review "
             "with counsel before paying shelter expenses."],
            ["Food",
             "Specialized dietary needs prescribed by a medical professional.",
             "General groceries reduce SSI under ISM."],
            ["Medical and therapy",
             "Uncovered therapy, dental, vision, hearing aids, service "
             "animals, experimental treatment.",
             "Treatments reimbursable by Medicaid; the trust should not "
             "duplicate available benefits."],
            ["Transportation",
             "Accessible vehicle, vehicle modifications, travel expenses.",
             "Gifting a vehicle directly to the beneficiary may be a "
             "countable resource."],
            ["Recreation, education, companionship",
             "Travel, camps, education, entertainment, companion care.",
             "Direct cash is a countable resource; pay providers directly."],
            ["Personal care",
             "Clothing, grooming, personal-care attendants.",
             "Most personal-care items are now allowable after 2005 SSA "
             "guidance."],
        ],
        col_widths=[1.8 * inch, 2.8 * inch, 2.7 * inch],
    ))

    # --------------------------------------------------------------- CHART
    story.append(Spacer(1, 0.10 * inch))
    story.append(B.section_header("How the trust's dollars typically flow",
                                  kicker="Illustrative distribution mix"))
    story.append(B.body_para(
        "The allocation below is an illustrative long-run distribution mix "
        "for a mid-sized third-party SNT supporting an adult beneficiary "
        "with a developmental disability living in a supported living "
        "arrangement. Every family is different; the actual distribution "
        "pattern depends on the beneficiary's needs, housing arrangements, "
        "and public-benefits status."
    ))
    story.append(B.donut_chart(
        labels=["Therapy & uncovered medical",
                "Recreation & companionship",
                "Transportation",
                "Equipment & assistive technology",
                "Trust administration & tax"],
        values=[32, 24, 15, 18, 11],
        title="Illustrative annual SNT distribution composition",
    ))

    # --------------------------------------------------------------- DUTIES
    story.append(B.section_header("Fiduciary duties of the SNT trustee",
                                  kicker="What Cumulus delivers"))
    story.append(B.two_col(
        left_flowables=[
            B.sub_header("Public-benefits coordination"),
            *B.bullet_list([
                "Familiarity with Social Security POMS, state Medicaid "
                "waiver programs, and SSI income-and-resource rules.",
                "Coordination with benefits counselors, case managers, "
                "and state agencies.",
                "Careful structuring of distributions to avoid ISM "
                "reductions and to preserve Medicaid eligibility.",
                "Notice to state Medicaid agencies and other reporting "
                "required under applicable trust terms.",
                "Evaluation of ABLE-account coordination for "
                "beneficiaries with a qualifying disability onset before "
                "age 46 under SECURE 2.0 §124.",
            ]),
        ],
        right_flowables=[
            B.sub_header("Investment and administration"),
            *B.bullet_list([
                "Investment consistent with the Uniform Prudent Investor "
                "Act and the trust's written investment policy.",
                "Consideration of the beneficiary's life expectancy, "
                "anticipated care costs, and inflation.",
                "Annual accounting and fiduciary tax returns (Form 1041, "
                "state equivalents) prepared by the Cumulus fiduciary tax "
                "group.",
                "Coordination with family, care coordinators, guardians, "
                "and conservators.",
                "At the beneficiary's death: final accounting, Medicaid "
                "payback (first-party SNTs), and remainder distribution.",
            ]),
        ],
    ))

    # --------------------------------------------------------------- ABLE
    story.append(B.section_header("ABLE accounts — a useful companion tool",
                                  kicker="IRC §529A"))
    story.append(B.body_para(
        "An ABLE account is a tax-advantaged savings account for "
        "individuals whose disability began before age 46 (age 26 for "
        "plans that have not yet adopted the SECURE 2.0 §124 expansion). "
        "Account earnings grow tax-deferred, and qualified distributions "
        "for 'qualified disability expenses' are tax-free. Balances up to "
        "$100,000 are excluded as a resource for SSI purposes, and "
        "Medicaid treats ABLE accounts favorably. Many families pair an "
        "SNT with an ABLE account to enable the beneficiary to hold "
        "modest day-to-day spending funds with greater autonomy."
    ))

    # --------------------------------------------------------------- FAQ
    story.append(B.section_header("Frequently asked questions",
                                  kicker="Common questions"))
    faqs = [
        ("How do we know whether we need a first-party or third-party SNT?",
         "The distinction depends on the source of the funding. A first-"
         "party SNT is used when the assets belong to — or are payable to "
         "— the beneficiary (for example, a personal-injury settlement or "
         "an outright inheritance). A third-party SNT is used when the "
         "assets come from family members and have never belonged to the "
         "beneficiary. Only first-party SNTs require Medicaid payback."),
        ("Why not just leave my child's share outright?",
         "An outright bequest of even a modest amount can disqualify a "
         "beneficiary from SSI and Medicaid, forcing the family to spend "
         "the inheritance down on care that would otherwise be covered. "
         "Equally important, an outright bequest deprives the beneficiary "
         "of the professional administrative support that an SNT provides "
         "across a lifetime."),
        ("Who can serve as trustee?",
         "A family member, a professional fiduciary, a corporate trustee, "
         "or a combination. Many families appoint Cumulus as corporate "
         "trustee with a family member as co-trustee or trust protector. "
         "This combination provides institutional continuity with family "
         "oversight and personal knowledge of the beneficiary."),
        ("What happens at the beneficiary's death?",
         "In a first-party (d)(4)(A) SNT, the trust must first reimburse "
         "the state Medicaid agency for benefits received; any remainder "
         "passes to the beneficiaries named in the trust. In a third-"
         "party SNT, no Medicaid payback is required, and the remainder "
         "passes in accordance with the trust terms — often to siblings, "
         "charity, or other family members."),
        ("How does the SNT coordinate with a will and guardianship?",
         "An SNT is typically established during the lifetime of the "
         "parents (inter vivos) or at the second parent's death "
         "(testamentary). The will or revocable trust of each parent "
         "directs the child's share into the SNT. A guardianship or "
         "conservatorship may coexist; the trustee administers the "
         "trust, the guardian/conservator handles the beneficiary's "
         "person and day-to-day needs."),
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
            "Cumulus Trust Company, N.A. following review of the trust "
            "instrument, the nature of the assets, and applicable state and "
            "federal benefits law.",
            "Eligibility rules for SSI, Medicaid, and other needs-based "
            "public benefits vary by state and are subject to change. The "
            "description of these programs in this brochure is general and "
            "illustrative only. A qualified elder-law or special-needs "
            "attorney should be engaged before establishing or funding an SNT.",
            "Cumulus does not provide legal or tax advice. Trust "
            "administration is conducted under the Uniform Prudent Investor "
            "Act and the applicable state Uniform Trust Code; investment "
            "products are not FDIC insured, not bank guaranteed, and may "
            "lose value.",
        ],
    )

    story += B.back_cover_block()

    doc.build(story)
    print(f"Built: {OUT_PATH}")


if __name__ == "__main__":
    build()
