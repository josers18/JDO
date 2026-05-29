# Customer Documents - Diagrams

Mermaid diagrams for the customer-document generation system.

## 1. Generation pipeline

```mermaid
flowchart LR
    SPECS["generator/generate_documents.py<br/>CustomerDocumentSpec catalog"]:::spec
    BRAND["generator/brand.py<br/>neutral page shell, tables, flowables"]:::brand
    PDF["documents/01..03<br/>generated PDFs"]:::out
    INDEX["documents/README.md<br/>generated index"]:::out
    ART["docs/ARTIFACTS.md<br/>generated inventory"]:::out
    DOCS["docs/DOCUMENT_SPECS.md<br/>human spec"]:::doc

    DOCS --> SPECS
    BRAND --> SPECS
    SPECS --> PDF
    SPECS --> INDEX
    SPECS --> ART

    classDef spec fill:#F5EFE2,stroke:#B08D3C,color:#0A1F3D
    classDef brand fill:#E8F3F4,stroke:#0E7C86,color:#0A1F3D
    classDef out fill:#0A1F3D,stroke:#0A1F3D,color:#FFFFFF
    classDef doc fill:#F4F6FA,stroke:#5B6879,color:#0A1F3D
```

## 1b. Salesforce-backed KYC generation

```mermaid
flowchart LR
    SF["Salesforce org<br/>Account object"]:::sf
    DESC["sf sobject describe<br/>Account field discovery"]:::code
    QUERY["sf data query<br/>Account records + related counts"]:::code
    ENRICH["Deterministic KYC enrichment<br/>source of funds, risk, expected activity"]:::spec
    PDF["documents/04_KYC/&lt;date&gt;<br/>&lt;AccountId&gt;_KYC_&lt;date&gt;.pdf"]:::out
    INDEX["Run README.md"]:::out

    SF --> DESC
    DESC --> QUERY
    QUERY --> ENRICH
    ENRICH --> PDF
    ENRICH --> INDEX

    classDef sf fill:#E8F3F4,stroke:#0E7C86,color:#0A1F3D
    classDef code fill:#F4F6FA,stroke:#5B6879,color:#0A1F3D
    classDef spec fill:#F5EFE2,stroke:#B08D3C,color:#0A1F3D
    classDef out fill:#0A1F3D,stroke:#0A1F3D,color:#FFFFFF
```

## 1c. Salesforce-backed Articles of Incorporation generation

```mermaid
flowchart LR
    SF["Salesforce org<br/>Account object"]:::sf
    FILTER["Account filter<br/>IsPersonAccount = false"]:::code
    QUERY["sf data query<br/>business Account records"]:::code
    ENRICH["Deterministic incorporation profile<br/>jurisdiction, shares, agent, directors"]:::spec
    PDF["documents/05_Articles_of_Incorporation/&lt;date&gt;<br/>&lt;AccountId&gt;_Articles_of_Incorporation_&lt;date&gt;.pdf"]:::out
    INDEX["Run README.md"]:::out

    SF --> FILTER
    FILTER --> QUERY
    QUERY --> ENRICH
    ENRICH --> PDF
    ENRICH --> INDEX

    classDef sf fill:#E8F3F4,stroke:#0E7C86,color:#0A1F3D
    classDef code fill:#F4F6FA,stroke:#5B6879,color:#0A1F3D
    classDef spec fill:#F5EFE2,stroke:#B08D3C,color:#0A1F3D
    classDef out fill:#0A1F3D,stroke:#0A1F3D,color:#FFFFFF
```

## 2. Segment theme matrix

```mermaid
flowchart TB
    BRAND["Content-heavy document skeleton<br/>neutral shell, narrative sections,<br/>tables, controls, appendices"]:::brand
    RET["Retail<br/>teal accent<br/>branch and service workflows"]:::retail
    WEA["Wealth<br/>gold accent<br/>advisor and planning workflows"]:::wealth
    COM["Commercial<br/>copper accent<br/>RM and treasury workflows"]:::commercial

    BRAND --> RET
    BRAND --> WEA
    BRAND --> COM
    RET --> R1["Welcome Packet"]
    RET --> R2["Financial Snapshot"]
    RET --> R3["Service Follow-Up"]
    WEA --> W1["Discovery Summary"]
    WEA --> W2["Annual Review"]
    WEA --> W3["Planning Next Steps"]
    COM --> C1["Onboarding Checklist"]
    COM --> C2["Relationship Review"]
    COM --> C3["Treasury Readiness Brief"]

    classDef brand fill:#0A1F3D,color:#FFFFFF,stroke:#0A1F3D
    classDef retail fill:#E8F3F4,color:#0A1F3D,stroke:#0E7C86
    classDef wealth fill:#F5EFE2,color:#0A1F3D,stroke:#B08D3C
    classDef commercial fill:#F6EDE3,color:#0A1F3D,stroke:#B45F1D
```

## 3. Document layout

```mermaid
flowchart TB
    COVER["Cover<br/>segment, document code, metadata"]:::cover
    CONTEXT["Customer context<br/>lead, narrative, summary table"]:::body
    HIGHLIGHTS["Highlights grid"]:::body
    DISCUSS["Discussion guide"]:::body
    SCORE["Readiness scorecard<br/>plus interpretation"]:::body
    SOURCES["Source signal<br/>and validation tables"]:::body
    ACTIONS["Action plan<br/>and operating notes"]:::body
    CONTROLS["Controls, review checklist,<br/>disclosures"]:::body
    APPENDIX["Metadata appendix"]:::body
    BACK["Back cover"]:::cover

    COVER --> CONTEXT --> HIGHLIGHTS --> DISCUSS --> SCORE --> SOURCES --> ACTIONS --> CONTROLS --> APPENDIX --> BACK

    classDef cover fill:#0A1F3D,color:#FFFFFF,stroke:#B08D3C
    classDef body fill:#F4F6FA,color:#0A1F3D,stroke:#C7CCD6
```
