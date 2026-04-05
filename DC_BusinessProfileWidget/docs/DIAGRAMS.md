# Diagrams — Business Profile Widget

## Tabs (default visibility)

```mermaid
flowchart LR
    subgraph Tabs
        O[Overview]
        H[Pipeline]
        C[Credit]
        S[Structure]
        L[Location]
        I[Insight]
    end
```

Each tab can be hidden with the matching **Show … tab** property.

---

## Field source decision (conceptual)

```mermaid
flowchart TD
    M[Mapping string] --> F{Starts with flow:?}
    F -->|yes| FL[Read from assembly Flow output]
    F -->|no| V{Valid Account path?}
    V -->|yes| Q[SELECT in SOQL]
    V -->|no| L2[Legacy: treat as Flow variable name]
```

Exact behavior is implemented in **`BusinessProfileWidgetController`** (`buildFromSoql`, `mergeFlowIntoProfile`, `isFlowToken`).

---

[ARCHITECTURE.md](ARCHITECTURE.md)
