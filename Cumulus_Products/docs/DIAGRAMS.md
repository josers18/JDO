# Cumulus Products — Diagrams

Mermaid diagrams describing the brochure generation system and the brand segmentation model. Rendered natively on GitHub.

---

## 1. Generation pipeline

From a product-spec document to a 55-PDF catalog via a shared brand system.

```mermaid
flowchart LR
    SPEC["docs/PRODUCT_SPECS.md<br/>canonical rates, fees, terms"]:::spec
    BRAND["generator/brand.py<br/>palette · themes · flowables · charts"]:::brand

    BUILD["generator/build_&lt;product&gt;.py<br/>55 scripts"]:::code

    DOC["BrochureDoc<br/>(ReportLab BaseDocTemplate)"]:::rl
    FLOW["Story flowables<br/>hero · sections · tables<br/>grids · callouts · charts"]:::rl
    CHART["matplotlib charts<br/>growth · amortization · bar · donut"]:::chart

    PDF[("55 PDFs<br/>brochures/01..08")]:::out

    SPEC --> BUILD
    BRAND --> BUILD
    BUILD --> DOC
    BUILD --> FLOW
    FLOW --> CHART
    CHART --> FLOW
    FLOW --> DOC
    DOC --> PDF

    classDef spec fill:#F5EFE2,stroke:#B08D3C,color:#0A1F3D
    classDef brand fill:#E8F3F4,stroke:#0E7C86,color:#0A1F3D
    classDef code fill:#F4F6FA,stroke:#5B6879,color:#0A1F3D
    classDef rl fill:#F6EDE3,stroke:#B45F1D,color:#0A1F3D
    classDef chart fill:#FBFAF6,stroke:#C7CCD6,color:#0A1F3D
    classDef out fill:#0A1F3D,stroke:#0A1F3D,color:#FFFFFF
```

---

## 2. Segment theme matrix

One brand skeleton, three accent themes. Each product is assigned a segment at generator time via `B.set_theme("retail" | "wealth" | "commercial")`.

```mermaid
flowchart TB
    BRAND["brand.py skeleton<br/>Navy · Times display · Helvetica body<br/>Monogram · Gold/accent rules<br/>Editorial kickers"]:::brand

    R["Retail theme<br/>accent · #0E7C86 (teal)<br/>CTA · Open an account /<br/>speak with a banker<br/>Voice · warm, confident"]:::retail
    W["Wealth theme<br/>accent · #B08D3C (gold)<br/>CTA · Speak with a<br/>wealth advisor<br/>Voice · editorial, advisory"]:::wealth
    C["Commercial theme<br/>accent · #B45F1D (copper)<br/>CTA · Connect with a<br/>commercial banker<br/>Voice · institutional, B2B"]:::commercial

    R --> R1["Personal Deposits · 9"]:::retail
    R --> R2["Personal Loans · 7"]:::retail
    R --> R3["Credit Cards · 3"]:::retail

    W --> W1["Investments · 12<br/>(brokerage, advisory,<br/>retirement, 529, estate, trusts)"]:::wealth

    C --> C1["Business Deposits · 2"]:::commercial
    C --> C2["Business Loans · 8"]:::commercial
    C --> C3["Merchant Services · 2"]:::commercial
    C --> C4["Treasury Management · 12"]:::commercial

    BRAND --> R
    BRAND --> W
    BRAND --> C

    classDef brand fill:#0A1F3D,color:#FFFFFF,stroke:#0A1F3D
    classDef retail fill:#E8F3F4,color:#0A1F3D,stroke:#0E7C86
    classDef wealth fill:#F5EFE2,color:#0A1F3D,stroke:#B08D3C
    classDef commercial fill:#F6EDE3,color:#0A1F3D,stroke:#B45F1D
```

---

## 3. Brochure layout (per product)

Standard structure composed from brand-module flowables; length adapts to product complexity (typically 3–9 pages).

```mermaid
flowchart TB
    subgraph COVER["Cover (onPage=_cover_header)"]
        HERO["Navy gradient hero<br/>+ monogram + wordmark<br/>+ category label"]
        TITLE["Product title (Times)<br/>+ italic lede<br/>+ at-a-glance table"]
    end

    subgraph INTERIOR["Interior pages (onPage=_header)"]
        S1["Overview (lead)"]
        S2["Key benefits<br/>(feature_grid 4–6 cells)"]
        S3["Rates / pricing<br/>(data_table)"]
        S4["Chart<br/>(growth · amort · bar · donut)"]
        S5["Eligibility<br/>(two_col + bullets)"]
        S6["How it works<br/>(numbered steps)"]
        S7["Limits / capabilities"]
        S8["Security & regulatory"]
        S9["FAQ (4–6 Q&A)"]
        S10["Disclosures<br/>(disclosure_block)"]
        S11["Back cover<br/>(segment-themed CTA)"]
    end

    COVER --> INTERIOR
    HERO --> TITLE
    S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7 --> S8 --> S9 --> S10 --> S11

    classDef cover fill:#0A1F3D,color:#FFFFFF,stroke:#B08D3C
    classDef body fill:#F4F6FA,color:#0A1F3D,stroke:#C7CCD6
    class COVER,HERO,TITLE cover
    class INTERIOR,S1,S2,S3,S4,S5,S6,S7,S8,S9,S10,S11 body
```

---

## 4. Chart selection by product family

Each brochure embeds at least one matplotlib chart. Type is chosen to match the financial question the product raises.

```mermaid
flowchart LR
    subgraph DEP["Deposits"]
        D1[Checking] --> GC[growth_curve_chart]
        D2[Savings / HYSA / MMA] --> GC
        D3[CDs] --> BC1[bar_comparison_chart<br/>CD ladder APY]
    end

    subgraph LEN["Lending"]
        L1[Personal Loan] --> AM[amortization_chart]
        L2[Auto Loan] --> AM
        L3[HELOAN / Mortgage] --> AM
        L4[HELOC / LOC / ABL] --> BC2[bar_comparison_chart<br/>rate-tier comparison]
    end

    subgraph WEA["Wealth"]
        W1[IRAs / 401k / 529 / Brokerage] --> GC2[growth_curve_chart<br/>20–30yr compounding]
        W2[Managed Advisory] --> DN[donut_chart<br/>model allocation]
        W3[Trusts / Estate] --> BC3[bar_comparison_chart<br/>fee tiers or composition]
    end

    subgraph COM["Commercial"]
        C1[Term / SBA / CRE / Equipment] --> AM2[amortization_chart<br/>$500K–$5M principal]
        C2[Treasury / Merchant] --> DN2[donut_chart<br/>fee breakdown]
        C3[LOC / ABL / Syndicated] --> BC4[bar_comparison_chart<br/>advance rates / margins]
    end

    classDef node fill:#FBFAF6,stroke:#C7CCD6,color:#0A1F3D
    classDef chart fill:#0A1F3D,color:#FFFFFF,stroke:#B08D3C
    class D1,D2,D3,L1,L2,L3,L4,W1,W2,W3,C1,C2,C3 node
    class GC,GC2,AM,AM2,BC1,BC2,BC3,BC4,DN,DN2 chart
```
