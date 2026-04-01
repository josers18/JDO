# Diagrams — Customer Profile Widget

Mermaid diagrams for reviews, Confluence, or GitHub rendering.

## 1. Data sourcing layers

```mermaid
flowchart LR
    subgraph Primary["Primary (optional)"]
        G[Data Graph HTTP GET]
    end
    subgraph Enrich["Always merge when Id present"]
        S[SOQL Account / Contact]
    end
    subgraph Optional["Optional"]
        F[Autolaunched Flow]
        E[Einstein summary]
    end
    G --> M[ProfileResult]
    S --> M
    F --> M
    M --> LWC[LWC render]
    E -.-> LWC
```

## 2. Tab content map

```mermaid
mindmap
  root((Customer Profile Widget))
    Overview
      Contact fields
      Relationship fields
      Sparkline SVG
    AI Signals
      3 ring gauges
      Bar rows
    Portfolio
      Donut SVG
      Allocation list
      Account cards
    Services
      6 service cards
      Suggested enrollments
    Location
      Decorative map SVG
      Address grid
      Branch list
    Insight
      Prediction headline
      AI summary
      Parsed recommendations
```

## 3. Field mapping concept

```mermaid
flowchart TB
    JSON[Graph JSON root]
    P[fieldFirstName = party.a.fn]
    JSON --> Dot[Dot path resolver]
    Dot --> PR[ProfileResult.fullName etc.]
    P -.-> Dot
```

## 4. Theming (CSS variables)

```mermaid
flowchart LR
    AB[App Builder hex strings]
    JS[connectedCallback setProperty on host]
    CSS[var--wp-accent in CSS rules]
    AB --> JS --> CSS
```

---

Also see the **sequence diagram** in [ARCHITECTURE.md](ARCHITECTURE.md).
