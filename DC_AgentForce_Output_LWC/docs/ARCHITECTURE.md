# Architecture

Behavior of **DC AgentForce Output** (`dcAgentforceOutputLwc`) and **DcAgentforceOutputController**. Paths: [GIT.md](GIT.md).

---

## Layers

| Layer | Responsibility |
|-------|----------------|
| **LWC (main)** | Designer properties, Run/auto-run, output rendering (plain vs `lightning-formatted-rich-text`), Markdown via **marked**, clipboard + modals, print, thumbs UI. |
| **LWC (modals)** | Expand view; copy fallback when nested clipboard policies block programmatic copy. |
| **Apex** | Start autolaunched Flow with correct **SObject** shape for Record inputs; read text outputs; optional `LlmOutputSanitizer`; Models API feedback. |
| **Static resource** | **marked** UMD bundle for Markdown parsing. |
| **Flow (org)** | Gen AI / assignments; must expose **promptResponse** (Text) and optionally **generation Id** (Text). |

---

## Sequence: user clicks Run

```mermaid
sequenceDiagram
    participant U as User
    participant L as dcAgentforceOutputLwc
    participant A as DcAgentforceOutputController
    participant F as Autolaunched Flow

    U->>L: Run
    L->>L: loading = true
    L->>A: runPromptFlow(flowApiName, recordId, var names, passRecordId, generationIdVar)
    A->>A: Optional queryRecordShellForFlow(recordId) → SObject
    A->>F: Flow.Interview.createInterview + start
    F-->>A: promptResponse (+ optional generation Id output)
    A->>A: LlmOutputSanitizer.stripClosingCourtesy(text)
    A-->>L: { text, generationId }
    L->>L: refreshRenderedOutput (HTML/MD if needed)
    L->>U: Render output + enable toolbar
```

---

## Sequence: thumbs feedback

```mermaid
sequenceDiagram
    participant U as User
    participant L as dcAgentforceOutputLwc
    participant A as DcAgentforceOutputController
    participant M as Models API

    Note over L: feedbackDisabled false only if lastGenerationId set
    U->>L: Thumbs up / down
    L->>A: submitGenerationFeedback(generationId, thumbsUp, text)
    A->>M: submitFeedback (GOOD/BAD)
    M-->>A: success / error
    A-->>L: void or AuraHandledException
    L->>U: Toast success / error
```

---

## Data flow (high level)

```mermaid
flowchart TB
    subgraph Org
        FL[Autolaunched Flow]
    end
    subgraph Package
        AP[DcAgentforceOutputController.runPromptFlow]
        LW[dcAgentforceOutputLwc]
        MD[marked static resource]
    end
    FL -->|promptResponse, optional gen Id| AP
    AP -->|text, generationId| LW
    LW -->|loadScript when markdown| MD
    MD -->|parse| LW
    LW -->|formatted-rich-text or plain| UI[Lightning page]
```

---

## Output format decision (client)

```mermaid
flowchart TD
    A[outputText from Apex] --> B{effectiveOutputFormat}
    B -->|text| P[Plain text binding]
    B -->|html| H[lightning-formatted-rich-text value=raw]
    B -->|markdown| M[marked.parse → lightning-formatted-rich-text]
    D[outputFormat=auto] --> E{detect}
    E -->|HTML-like| H
    E -->|Markdown-like| M
    E -->|else| P
```

---

## Title color (LEX-safe)

The title uses a **CSS custom property** on the root `<article class="lwc-shell">`:

- Inline: `--dc-output-title-color: #RRGGBB;`
- Rule: `.lwc-shell__title { color: var(--dc-output-title-color, #032d60); }`

This avoids theme overrides that ignore `style={object}` on nested headings.

---

## Related reading

- [FLOW_GUIDE.md](FLOW_GUIDE.md) — variable names and Record input typing
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — all properties
- [artifacts.md](../artifacts.md) — file list
