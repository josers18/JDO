# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Salesforce Solution Engineers (primarily the owner, Jose Sifontes, and fellow SEs) who demo Agentforce and
Data 360 to customers — often FSI accounts such as JPMC — live on calls and screen-shares. The same people use it
day to day to test their demo orgs' agents and APIs before and between demos.

## Product Purpose

AFD360 Utilities is the entry point for exercising the Agentforce and Data 360 APIs against a real org and
*showing* what happens: hold a real multi-turn conversation with any agent, watch its tool steps and reasoning,
approve the actions it proposes, call Salesforce-hosted MCP tools and render their HXL widgets, and inspect every
HTTP exchange with Salesforce. Success: a customer watching the screen understands what the API did and trusts it;
the SE can reproduce and debug agent behavior quickly.

## Positioning

It shows the real wire: every Salesforce call (requests, responses, stream events) next to the conversation it
produced, against the customer's or demo org's live agents — not a mock, not the packaged Lightning UI.

## Operating Context

- Shown live on screen-shares and projectors to customer audiences; also used solo for testing.
- Local dev tool today (`npm run dev`, loopback only); planned move to Heroku (needs an app login first).
- Desktop browsers; window widths roughly 900–2560 px. No horizontal scrolling; the layout must follow the window.
- Orgs are switched in Admin → Orgs; finsdc3 (JDO demo org) is the default.

## Capabilities and Constraints

- Chat (Agent API): agent gallery, live persisted sessions, streamed markdown, tool cards with step trails
  (agent delegation reasoning), approval cards for agent-proposed actions (Confirm → Reply/Cancel), session state
  (live / expired / ended), Stop, End/New session.
- Wire panel: every Salesforce exchange — timestamped, sortable newest/oldest, sent vs received clearly separated,
  tokens and secrets masked, copy-as-curl, JSON export.
- MCP: Salesforce-hosted MCP servers, tools, JSON arguments, results, and HXL widgets rendered in a sandboxed frame.
- Admin → Orgs: org credentials (encrypted at rest; secrets never shown), test connection, active org.
- Terminology to keep: Agent, Session, Turn, Tool step, Approval, Wire, MCP server, Tool, Widget, Org.
- Some agent outputs reference data the Agent API doesn't return (e.g. D360 `<data>` tables) — say so honestly.
- More API modules (Data 360 query etc.) will be added; the structure must accommodate new modules in the rail.

## Brand Commitments

None. Not bound to SLDS or Salesforce branding; its own identity as an SE demo/test tool.

## Evidence on Hand

Real org data from finsdc3 (Leads, Opportunities, D360/Moody's DMOs) appears in demos. No customer logos,
testimonials or metrics exist — never fabricate them.

## Product Principles

1. Show the truth of the API: what was sent, what came back, and how long it took — never hide or prettify away
   what the platform actually returned.
2. Legible to an audience: a customer watching a screen-share should follow the conversation and the wire without
   narration.
3. Nothing changes in the org without an explicit, visible approval.
4. Fast for the operator: one click from an agent to a live session; state (live, running, failed) always visible.
5. Room to grow: new API modules slot in without redesigning the shell.
