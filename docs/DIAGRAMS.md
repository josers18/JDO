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
    ORG[(Salesforce org)]
    PM -->|Flow| ORG
    MC -->|Flow| ORG
    AF -->|Flow| ORG
    QT -->|CdpQuery Apex| ORG
    PP -->|HTTP NC + SOQL + Flow| ORG
    BP -->|SOQL + Flow + optional Einstein| ORG
    WE -->|Data Graph callout + parallel CRM SOQL| ORG
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

## Web Engagements RT Timeline (multi-source, parallel)

```mermaid
sequenceDiagram
    participant LWC as webEngagementData
    participant DCC as DataCloudWebEngagementController
    participant CRM as CrmTimelineController
    participant DG as Data Cloud Data Graph
    participant Org as Salesforce SOQL
    LWC->>DCC: Promise A — getWebEngagementData(accountId, dataGraphName)
    LWC->>CRM: Promise B — getCrmTimelineEvents(recordId, sources, lookbackDays)
    DCC->>DG: callout:Data_Cloud_API + Unified ID lookup
    DG-->>DCC: Data Graph JSON
    DCC-->>LWC: TimelineEvent[] (source: 'web')
    CRM->>Org: per-source SOQL fan-out (Case / Task / Event / VoiceCall)
    Org-->>CRM: rows
    CRM-->>LWC: TimelineEvent[] (sorted DESC, LIMIT 200 per source)
    Note over LWC: A renders immediately; B streams in below.<br/>Chip filters operate client-side, no re-fetch.
```

Promise A is never blocked on Promise B. Filter chips re-render visible events without firing Apex. Partial-failure UX surfaces inline retry banners for whichever side failed; the working side keeps showing.
