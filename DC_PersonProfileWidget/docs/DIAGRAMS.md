# Diagrams — Customer Profile Widget

Mermaid diagrams for reviews, Confluence, or GitHub rendering.

## 1. Data sourcing layers

```mermaid
flowchart LR
    subgraph Base["Baseline CRM"]
        S[SOQL Account / Contact]
    end
    subgraph Optional["Optional"]
        A[Assembly Flow outputs]
        P[Prediction Flow]
        E[Einstein summary]
    end
    S --> M[ProfileResult]
    A --> M
    P --> M
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
      lightning-map
      Address grid
      Branch list
    Insight
      Prediction headline
      AI summary
      Parsed recommendations
```

## 3. Assembly output map

```mermaid
flowchart TB
    F[Autolaunched Flow output variables]
    Map[profileFlowOutputMapJson logical key to var name]
    F --> Map
    Map --> PR[ProfileResult fields]
```

## 4. Theming (CSS variables)

```mermaid
flowchart LR
    AB[App Builder themeMode + hex props]
    JS[Microtask applyTheme]
    H[Host + .wp-shell setProperty]
    CSS[var--wp-* in LWC CSS]
    AB --> JS --> H --> CSS
```

## 5. Profile merge decision (Apex)

```mermaid
flowchart TD
    R[recordId valid?]
    A[assembly API + output map?]
    S[SOQL baseline ProfileResult]
    R -->|no| E[Empty / minimal result]
    R -->|yes| S
    S --> A
    A -->|yes| F[Run assembly Flow + apply outputs]
    F --> M[mergeEnrichFull with SOQL]
    A -->|no| M2[Use SOQL only]
    M --> P{Prediction flow set?}
    M2 --> P
    P -->|yes| I[Merge prediction + recommendations]
    P -->|no| G[Geocode if enabled]
    I --> G
    G --> Out[Return ProfileResult]
```

## 6. Geocoding (Location tab)

```mermaid
flowchart LR
    PR[ProfileResult lat/lng]
    G{Geocode on?}
    N[Nominatim API]
    Ph[Photon fallback]
    PR -->|missing| G
    G -->|yes| N
    N -->|no hit| Ph
    N -->|hit| PR
    Ph --> PR
```

## 7. AI Signals gauge Flow (client)

```mermaid
sequenceDiagram
    participant LWC as customerProfileWidget
    participant Apex as runSignalGaugeFlow
    participant Fl as Autolaunched Flow

    LWC->>Apex: flowApiName, recordId, vars
    Apex->>Fl: Flow.Interview
    Fl-->>Apex: prediction output
    Apex-->>LWC: Decimal prediction
    LWC->>LWC: Ring % + label format
```

---

Also see the **sequence diagram** in [ARCHITECTURE.md](ARCHITECTURE.md).
