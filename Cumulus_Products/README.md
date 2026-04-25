# Cumulus Products

Fictitious product-brochure catalog for **Cumulus Bank**, a demonstration financial-services brand used across the JDO demo environment. Fifty-five multi-page PDFs spanning Retail, Wealth, and Commercial banking, generated from a shared ReportLab brand system with segment-aware theming.

![Brochures](https://img.shields.io/badge/Brochures-55_PDFs-0A1F3D)
![Segments](https://img.shields.io/badge/Segments-3-0E7C86)
![Categories](https://img.shields.io/badge/Categories-8-B08D3C)
![Engine](https://img.shields.io/badge/Engine-ReportLab_+_matplotlib-B45F1D)
![Effective](https://img.shields.io/badge/Effective-Apr_25_2026-5B6879)
![Status](https://img.shields.io/badge/Status-Demo_asset-2E7D5B)

> **Cumulus Bank is a fictitious institution.** All rates, fees, disclosures, and product terms are illustrative only and do not represent an actual financial product or offer of credit.

---

## At a glance

| | |
|---|---|
| **Products** | 55 across 8 categories |
| **Segments** | Retail · Wealth · Commercial |
| **Engine** | ReportLab (PDF) + matplotlib (charts) + PyMuPDF (QA) |
| **Format** | US Letter, multi-page, embedded vector + PNG charts |
| **Source** | Each PDF has a matching `generator/build_<name>.py` script |
| **Spec** | `docs/PRODUCT_SPECS.md` — canonical rates, fees, terms |
| **Contact** | 954.417.2880 · cumulusbank-demo-bb054209d76d.herokuapp.com |

---

## Catalog

Each folder contains the finished PDFs. File names are `Cumulus_<ProductName>.pdf`.

| # | Folder | Segment | Products |
|---|---|---|---|
| 01 | [`brochures/01_Personal_Deposits`](brochures/01_Personal_Deposits) | Retail | Everyday Checking · Premier Checking · Statement Savings · High-Yield Savings · Money Market · 6Mo CD · 12Mo CD · 36Mo CD · 60Mo CD |
| 02 | [`brochures/02_Personal_Loans`](brochures/02_Personal_Loans) | Retail | Personal Loan · Auto Loan · Personal Line of Credit · HELOC · HELOAN · 30-Year Fixed Mortgage · 5/1 ARM Mortgage |
| 03 | [`brochures/03_Credit_Cards`](brochures/03_Credit_Cards) | Retail | Cash Rewards · Travel Points · Secured |
| 04 | [`brochures/04_Investments`](brochures/04_Investments) | Wealth | Brokerage · Managed Advisory · Roth IRA · Traditional IRA · 401(k)/403(b) Rollover · 529 Education Savings · Estate Planning · Revocable & Irrevocable Trusts · Charitable Trusts · Special Needs Trust · Testamentary Trust · Estate Settlement |
| 05 | [`brochures/05_Business_Deposits`](brochures/05_Business_Deposits) | Commercial | Business Fundamentals Checking · Business Analyzed Checking |
| 06 | [`brochures/06_Business_Loans`](brochures/06_Business_Loans) | Commercial | Business Term Loans · Business Lines of Credit · SBA Loans · Commercial Real Estate · Asset-Based Lending · Syndicated Loans · Equipment Loans · Equipment Leasing |
| 07 | [`brochures/07_Merchant_Services`](brochures/07_Merchant_Services) | Commercial | Payment Processing · Point-of-Sale Systems |
| 08 | [`brochures/08_Treasury_Management`](brochures/08_Treasury_Management) | Commercial | ACH Origination · Wire Transfers · Corporate Cards · Purchasing Cards · Positive Pay · ACH Services · ACH Collections · Remote Deposit Capture · Lockbox Services · Merchant Integration · Sweep Accounts · Zero Balance Accounts |

**Total: 55 PDFs · approx. 300 pages of content**

---

## Brand system

A single `generator/brand.py` module provides the full design system used by every brochure. Three segment themes share one structural skeleton and differ only in accent color and editorial voice.

| Segment | Accent | Tone | CTA |
|---|---|---|---|
| **Retail** | `#0E7C86` (teal) | Approachable, professional | Open an account or speak with a banker |
| **Wealth** | `#B08D3C` (champagne gold) | Editorial, advisory | Speak with a Cumulus wealth advisor |
| **Commercial** | `#B45F1D` (copper) | Institutional, B2B | Connect with a Cumulus commercial banker |

Common elements:

- Cover with navy gradient hero, subtle engraved diagonal texture, serif "Cumulus Bank" wordmark and monogram
- Editorial section kickers (small uppercase + accent color) paired with Times-Roman section titles
- Data tables with navy header band, accent hairline under header, RULE-gray row separators, optional zebra striping
- Feature grids with editorial labels, callout boxes with accent side rule and cream/tint backgrounds
- Two-column eligibility / "what you'll need" layouts, numbered how-it-works tables, capabilities tables with daily limits
- Regulatory-protections table (Reg DD/E/CC for deposits, Reg Z/B/X for lending, CARD Act for cards, FINRA/SEC for wealth)
- Disclosures block and segment-themed back cover with phone, online, and branch/private-office/treasury channels
- Footer on every page with legal name, NMLS, Member FDIC, Equal Housing Lender, product code, page number, phone, web, and "For illustrative purposes" disclaimer

---

## Brochure structure (per product)

Each brochure follows the same section order, scaled to product complexity (typically 3–9 pages):

1. **Cover** — hero band, product title, italic lede, 6–8 at-a-glance rows
2. **Overview** — lead paragraph describing the product
3. **Key benefits** — 4–6 tile feature grid
4. **Rates / Pricing / Fees** — structured data tables with realistic values
5. **At least one chart** — growth curve (deposits), amortization (loans), bar comparison (rate tiers), donut (portfolios)
6. **Eligibility / Underwriting** — two-column: who qualifies · what you'll need
7. **How it works** — numbered step table with timing
8. **Limits / Capabilities** — product-specific transaction tables
9. **Security & regulatory protections** — Reg DD/E/CC/Z/B/X/P/GG/CARD Act/SIPC/FDIC
10. **Frequently asked questions** — 4–6 Q&A pairs
11. **Disclosures** — standard + product-specific
12. **Back cover** — segment-themed CTA with phone / online / branch channels

---

## Rebuilding a brochure

The generator scripts are checked in. Regenerating any single brochure:

```bash
cd Cumulus_Products
python3 -m venv .venv && source .venv/bin/activate
pip install reportlab matplotlib pymupdf
cd generator
python3 build_premier_checking.py
# → rebuilds brochures/01_Personal_Deposits/Cumulus_Premier_Checking.pdf
```

All 55 scripts follow the same pattern:

```python
import brand as B
B.set_theme("retail" | "wealth" | "commercial")
doc = B.BrochureDoc(out_path, product_name=..., product_code=...,
                    category=..., segment=...)
story = []
story += B.hero_block(product_name=..., lede=..., summary_rows=[...])
story += B.switch_to_body()
story.append(B.section_header("Overview", kicker="At a glance"))
story.append(B.lead_para("..."))
# ... more sections, tables, charts ...
story += B.disclosure_block("Important disclosures", B.STANDARD_DEPOSIT_DISCLOSURES + [...])
story += B.back_cover_block()
doc.build(story)
```

---

## Contents

```
Cumulus_Products/
├── README.md                  — this file
├── brochures/                 — 55 finished PDFs in 8 category folders
│   ├── 01_Personal_Deposits/  (9 PDFs — retail)
│   ├── 02_Personal_Loans/     (7 PDFs — retail)
│   ├── 03_Credit_Cards/       (3 PDFs — retail)
│   ├── 04_Investments/        (12 PDFs — wealth)
│   ├── 05_Business_Deposits/  (2 PDFs — commercial)
│   ├── 06_Business_Loans/     (8 PDFs — commercial)
│   ├── 07_Merchant_Services/  (2 PDFs — commercial)
│   └── 08_Treasury_Management/ (12 PDFs — commercial)
├── generator/
│   ├── brand.py               — shared brand system (styles, themes, flowables, charts)
│   └── build_*.py             — one script per product (55 total)
└── docs/
    ├── PRODUCT_SPECS.md       — canonical rates, fees, terms, and voice guide
    ├── ARTIFACTS.md           — per-folder artifact inventory
    └── DIAGRAMS.md            — Mermaid diagrams (system overview + segment themes)
```

---

## Disclaimer

Cumulus Bank is a fictitious institution created for demonstration purposes. All rates, disclosures, and product terms appearing in these brochures are illustrative only and do not represent an actual financial product, account agreement, or offer of credit. Do not use these materials for consumer marketing, regulatory filings, or as the basis for any financial decision.
