# Cumulus Products - Offer Document Guide

This guide describes the generated campaign offer documents in `Offers/`.
It is specific to the `Cumulus_Products` subfolder and does not apply to
Salesforce DX projects elsewhere in the JDO monorepo.

## Purpose

Each offer PDF is a banker-facing and FSC-ready marketing campaign document for
one Cumulus Bank product. The documents are realistic demo collateral: they
include current-style pricing, rate, incentive, qualification, fulfillment, and
control content, but all values remain illustrative.

- **Brochures** explain the product.
- **Offers** explain a time-bound campaign for that product.
- **Product terms** still come from `docs/PRODUCT_SPECS.md`.
- **Campaign incentives** live in `generator/generate_offers.py`.

## Output

`generator/generate_offers.py` builds 55 PDFs, one for each product:

```text
Offers/
├── 01_Personal_Deposits/      9 offer PDFs
├── 02_Personal_Loans/         7 offer PDFs
├── 03_Credit_Cards/           3 offer PDFs
├── 04_Investments/           12 offer PDFs
├── 05_Business_Deposits/      2 offer PDFs
├── 06_Business_Loans/         8 offer PDFs
├── 07_Merchant_Services/      2 offer PDFs
├── 08_Treasury_Management/   12 offer PDFs
└── README.md                  generated index and guardrails
```

Offer file names mirror brochure names and add `_Offer`:

```text
brochures/01_Personal_Deposits/Cumulus_Premier_Checking.pdf
Offers/01_Personal_Deposits/Cumulus_Premier_Checking_Offer.pdf
```

## Regeneration

From the `Cumulus_Products` folder:

```bash
python3 generator/generate_offers.py
```

The command rebuilds every offer PDF and refreshes `Offers/README.md`.
It intentionally sits outside the `build_*.py` naming pattern so this brochure
loop remains brochure-only:

```bash
cd generator
for f in build_*.py; do python3 "$f"; done
```

## Data model

Offers are defined as `OfferSpec` records in `generator/generate_offers.py`.
Each record includes:

- product identity: product name, product code, folder, category, segment
- campaign identity: campaign name, headline, campaign window
- offer economics: base terms, campaign terms, client value, secondary offers
- qualification: qualifying action, minimum requirement, verification, fulfillment
- FSC playbook: target audiences, trigger events, cross-sell next best actions
- controls: family-specific disclosures and product-specific campaign disclosures

`OfferSpec.family` selects the standard disclosure set:

| Family | Used for |
|---|---|
| `deposit` | Personal checking, savings, money market, CDs |
| `business_deposit` | Commercial deposit accounts |
| `lending` | Consumer loans, home equity, mortgages |
| `commercial_lending` | Business, SBA, CRE, ABL, syndicated, equipment credit |
| `card` | Consumer credit cards |
| `commercial_card` | Corporate and purchasing card programs |
| `investment` | Brokerage, advisory, IRAs, rollovers, 529, estate, trust services |
| `merchant` | Payment processing and point-of-sale systems |
| `treasury` | ACH, wire, positive pay, RDC, lockbox, sweep, ZBA, integration |

## Document structure

Each generated offer follows the same structure:

1. Cover with campaign, offer code, campaign window, base terms, incentive, and fulfillment rule
2. Campaign overview and primary client promise
3. Offer economics table comparing standard product terms, campaign offer, and client value
4. Qualification and fulfillment table
5. FSC campaign playbook with audiences and trigger events
6. Recommended next best actions
7. Client journey from identify through deepen
8. Controls and disclosure guardrails
9. Offer disclosures and segment-themed back cover

## Authoring rules

- Keep base rates, fees, limits, and eligibility aligned to `docs/PRODUCT_SPECS.md`.
- Write incentives as plausible campaign concessions, not as permanent product terms.
- Do not imply guaranteed approval, guaranteed yield, permanent fee waivers, or actual bank commitments.
- Include qualification evidence and fulfillment timing for every incentive.
- Keep FSC language concrete: campaign member, product interest, opportunity, application, service enrollment, fulfillment task.
- Preserve the "fictitious institution" and "illustrative only" language in every offer.

## QA checklist

Run this after editing `generator/generate_offers.py`:

```bash
python3 -m py_compile generator/generate_offers.py
python3 generator/generate_offers.py
python3 - <<'PY'
from pathlib import Path
import fitz

pdfs = sorted(Path("Offers").glob("*/*.pdf"))
missing = []
pages = []
for path in pdfs:
    doc = fitz.open(path)
    text = "\n".join(page.get_text() for page in doc)
    pages.append(doc.page_count)
    doc.close()
    lower = text.lower()
    if "fictitious institution" not in lower or "illustrative only" not in lower:
        missing.append(str(path))

print(f"pdfs={len(pdfs)} pages_total={sum(pages)} min_pages={min(pages)} max_pages={max(pages)}")
print(f"missing_disclaimer={len(missing)}")
if missing:
    print("\n".join(missing))
PY
```

Expected current output:

```text
pdfs=55 pages_total=439 min_pages=7 max_pages=9
missing_disclaimer=0
```

## Relationship to brochures

Do not move brochure content into the offer generator. The brochure scripts
remain the source for long-form product explanation, charts, FAQs, and standard
product disclosure flow. Offer documents are campaign companions that reference
the same products and product economics but focus on acquisition, conversion,
fulfillment, and relationship expansion.
