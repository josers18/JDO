# Diagrams (Mermaid)

Render these in GitHub, VS Code (Mermaid preview), or any Markdown tool that supports Mermaid.

## Monorepo → org

```mermaid
flowchart LR
    subgraph dx [DX projects in JDO]
        PM[Prediction Model]
        MC[Multiclass]
        AF[AgentForce Output]
        QT[Query to Table]
        PP[Person Profile Widget]
        BP[Business Profile Widget]
        WE[Web Engagements RT Timeline]
    end
    subgraph content [Generated content assets]
        CD[Customer Documents]
    end
    ORG[(Salesforce org)]
    PDF[(PDF artifacts)]
    PM -->|Flow| ORG
    MC -->|Flow| ORG
    AF -->|Flow| ORG
    QT -->|CdpQuery Apex| ORG
    PP -->|HTTP NC + SOQL + Flow| ORG
    BP -->|SOQL + Flow + optional Einstein| ORG
    WE -->|Data Graph callout + parallel CRM SOQL| ORG
    CD -->|ReportLab| PDF
```

## Flow-driven components (pattern)

```mermaid
sequenceDiagram
    participant User
    participant LWC as Lightning page LWC
    participant Apex as Apex controller
    participant Flow as Autolaunched Flow
    User->>LWC: Load / Refresh
    LWC->>Apex: runXxxFlow(recordId, ...)
    Apex->>Flow: Flow.Interview
    Flow-->>Apex: output variables
    Apex-->>LWC: DTO / JSON strings
    LWC-->>User: Render gauge, text, table, etc.
```

Optional **Einstein** path (Prediction / Multiclass):

```mermaid
sequenceDiagram
    participant LWC
    participant Apex
    participant Einstein as ConnectApi.EinsteinLLM
    LWC->>Apex: generateSummary(...)
    Apex->>Einstein: generateMessagesForPromptTemplate
    Einstein-->>Apex: summary text
    Apex-->>LWC: summary
```

## DC Query to Table (Data Cloud)

```mermaid
sequenceDiagram
    participant User
    participant LWC as dcQueryToTableLwc
    participant Apex as DcQueryToTableController
    participant API as ConnectApi.CdpQuery
    User->>LWC: Page load or Run query
    LWC->>Apex: runDataCloudSql(sql, maxRows, ...)
    Apex->>API: queryAnsiSqlV2
    API-->>Apex: columns + rows
    Apex-->>LWC: TableQueryResult
    LWC-->>User: lightning-datatable
```

## AgentForce Output (optional feedback)

```mermaid
flowchart TB
    LWC[dcAgentforceOutputLwc]
    LWC --> Run[runPromptFlow]
    Run --> Flow[Flow + Gen AI]
    LWC --> FB[submitGenerationFeedback]
    FB --> Models[aiplatform.ModelsAPI]
```

For more sequence detail, see [DC_AgentForce_Output_LWC/docs/ARCHITECTURE.md](../DC_AgentForce_Output_LWC/docs/ARCHITECTURE.md).

## Web Engagements RT Timeline (multi-source, parallel; hot cache + cold-store backfill)

```mermaid
sequenceDiagram
    participant LWC as webEngagementData
    participant DCC as DataCloudWebEngagementController
    participant CRM as CrmTimelineController
    participant DG as Data Cloud Data Graph
    participant DMO as CumulusWeb_Engagements__dlm
    participant Org as Salesforce SOQL
    LWC->>DCC: Promise A — getWebEngagementsWithBackfill(accountId, dataGraphName, lookbackDays)
    LWC->>CRM: Promise B — getCrmTimelineEvents(recordId, sources, lookbackDays)
    DCC->>DG: HOT — callout:Data_Cloud_API + Unified ID lookup
    DG-->>DCC: Data Graph envelope (may have empty events array after cache expiration)
    DCC->>DMO: COLD — ConnectApi.CdpQuery.querySql JOIN UnifiedLinkssotAccountAcc__dlm
    DMO-->>DCC: Historical events for this unified individual
    Note over DCC: Merge: dedupe by eventId__c, hot wins on collision.<br/>Cold-side failures are caught + logged; response degrades to hot-only.
    DCC-->>LWC: TimelineEvent[] (source: 'web') in the same envelope shape
    CRM->>Org: per-source SOQL fan-out (Case / Task / Event / VoiceCall)
    Org-->>CRM: rows
    CRM-->>LWC: TimelineEvent[] (sorted DESC, LIMIT 200 per source)
    Note over LWC: A renders immediately; B streams in below.<br/>Chip filters operate client-side, no re-fetch.
```

Promise A is never blocked on Promise B. The hot+cold merge happens server-side inside Promise A, so the LWC consumes hot-only and hot+cold responses identically — `parseDataGraphResponse` is unchanged. Filter chips re-render visible events without firing Apex. Partial-failure UX surfaces inline retry banners for whichever side failed; the working side keeps showing.

## Theme system — `--wp-*` token flow across the LWC family

```mermaid
flowchart LR
    subgraph base [Base palette source]
        PT[c/predictionThemes<br/>THEMES map]
    end
    subgraph adapters [Per-component adapters / consumers]
        CPW[customerProfileWidget<br/>inline THEMES]
        BPW[businessProfileWidget<br/>inline THEMES]
        CML[classificationModelLwc<br/>predictionThemes.js]
        MPL[multiclassPredictionLwc<br/>predictionThemes.js]
        CT[cockpitThemes.js<br/>adapter — adds 3 cockpit tokens]
        FJC[fscJourneyCockpit]
    end
    subgraph runtime [Runtime apply path]
        AT[applyTheme — caches via _lastAppliedThemeKey,<br/>writes :host + .lwc-shell style.setProperty]
        CSS[CSS rules consume --wp-* with hex fallbacks]
    end
    PT -. duplicated .-> CML
    PT -. duplicated .-> MPL
    PT -- import --> CT
    CT --> FJC
    CPW --> AT
    BPW --> AT
    CML --> AT
    MPL --> AT
    FJC --> AT
    AT --> CSS
```

The **adapter pattern** (`cockpitThemes.js` → `c/predictionThemes`) is the recommended path for new components — it eliminates the "keep these files identical" duplication that bridges `classificationModelLwc` ↔ `multiclassPredictionLwc`. Full contract, lifecycle canon, and copy-paste skeleton in [THEME_CATALOG.md](THEME_CATALOG.md).

```mermaid
sequenceDiagram
    participant AB as App Builder admin
    participant LWC as Themed LWC
    participant TM as Theme module<br/>(adapter or inline)
    participant DOM as :host + .lwc-shell

    AB->>LWC: themeMode / accentColor / showThemeSwitcher
    LWC->>LWC: connectedCallback → _isConnected = true
    LWC->>LWC: scheduleApplyTheme (microtask coalesce)
    LWC->>LWC: renderedCallback → RAF (one frame deferral)
    LWC->>TM: read THEMES[mode] (default if unknown)
    LWC->>LWC: cache key = mode|accent|warning|negative|targets
    alt key === _lastAppliedThemeKey
        LWC-->>LWC: skip (idempotent)
    else key changed
        LWC->>DOM: setProperty(--wp-shell-bg, ...)
        LWC->>DOM: setProperty(--wp-text-primary, ...)
        LWC->>DOM: setProperty(--wp-accent, accentResolved)
        LWC->>DOM: setProperty(--wp-accent-bg, accent + 14)
        LWC->>DOM: setProperty(--wp-accent-border, accent + 40)
        LWC->>DOM: setProperty(--wp-accent-dim, accent + 99)
        LWC->>LWC: _lastAppliedThemeKey = key
    end
```

Key invariants (drift here causes the FOUC and "first load shows wrong theme" bugs that bit earlier components): `_isConnected` re-entry guard, `_animationPending` + `requestAnimationFrame` (NOT `setTimeout`), `_lastAppliedThemeKey` cache, two-target apply (`:host` + `.lwc-shell`), 8-char hex alpha-strip on the accent. See the **Why each piece exists** table in [THEME_CATALOG.md §3](THEME_CATALOG.md#3-lifecycle-canon).
