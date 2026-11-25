# Complete workspace mock: design intent

The user approved further exploration of the three visual directions and requested most existing features: relationships, pipeline, life events, and the current apps' wider capabilities. This remains a standalone mock. Preserve the initial studies as `index.html`; add the fuller experience at `workspace.html`.

## Coverage

Eight primary sections in all three directions and personas: Today, Relationships, Pipeline, Life & goals, Growth, Intelligence, Workbench, and Configuration. Relationships opens an actual multi-tab dossier: overview, finances, journey, engagement/service, opportunities, and notes/tools. Commercial includes Company Intel. Task, meeting, email, case, goal, life-event, lead, and opportunity actions open usable review forms with session-only draft persistence. Agentforce opens a contextual assistant preview with the four existing agents, without fabricated model responses.

## Distinct compositions

- Panorama retains its cobalt architectural field. A large, contextual lead-in opens into broad white work surfaces. Relationships use a readable directory and a full-width dossier; Pipeline uses stage lanes; life events use horizontal milestone bands.
- Atlas retains a light lavender spatial canvas. Relationships and intelligence connect evidence to a selected person/company. Pipeline is a stage landscape with a selected-deal inspector; life events group people around event families. Use a list/grid on small screens so spatial exploration does not become tiny text.
- Focus retains its plum frame. Persistent left selectors change one generous advisory document: a client, a deal, a milestone, a signal, or a work item. The main issue and reviewable next action remain prominent.

Same existing system font and color tokens as the initial directions. Body 17–20px, metadata generally 15–16px. Keep readable type, fewer simultaneous columns, useful scrolling, keyboard focus, reduced-motion behavior, and responsive layout.

## Source contract

Inspect current routes, HomeDashboard fetchers, grouped Full360Tabs, WorkspacePanel, LifeEventModal, cross-sell, AgentforceChat, and ConfigPage. Reuse the prior static CRM snapshot and dated real Data Cloud fixtures. Supplement missing life-event, financial-goal, Account and financial-account examples with read-only Headless360 queries, verifying org identity first. Scope per-owner data to the same captured Kim Johnson, Jose Sifontes, and Allen Carter IDs. Distinguish exact record IDs from duplicate names. A bounded capture is a selected sample, never a full count.

No new source calls at runtime, no CRM writes, no model calls, and no generated claims of success. Show missing source data as unavailable in the capture. Drafts and layout preferences remain local to the tab. Existing production capability preservation requirements remain binding for an eventual implementation.

## Review

Exercise all eight sections in the three styles and three personas; inspect representative desktop/mobile screenshots. Verify filters, selection, dossier tabs, deep links and browser navigation, record forms, local draft persistence, assistant switching, preferences, and no horizontal overflow. Document modeled coverage and any unimplemented deep integrations separately from screenshots.
