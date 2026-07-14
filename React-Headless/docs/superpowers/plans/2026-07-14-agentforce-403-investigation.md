# Task 8 — Agentforce 403 Investigation (RESOLVED, no fix required)

**Date:** 2026-07-14
**Org:** jdo-1lrnov (core `storm-16a17dc388fbe6`, EE, API v67.0), app `c__ReactRetail`

## Verdict

The 403 described in the spec (`runtime_copilot/accSdkWrapper` LWR endpoint
returning 403 → `LO2:LightningOutError: unable to load the iframe`) **no longer
reproduces.** The Agentforce chat panel loads and runs a live session. No repo
change was made — the chips (Tasks 1–7) never depended on Agentforce loading,
and the panel is now healthy on its own.

## What was observed live (Playwright, frontdoor, 2026-07-14)

Clicked the ACC floating FAB on the deployed ReactRetail app and captured the
network + console:

- The wrapper request fired to core:
  `https://storm-16a17dc388fbe6.demo.my.salesforce.com/lwr/application/amd/0/l/en/ai/lightningout/container?componentName=runtime_copilot%2FaccSdkWrapper&loAppOrigin=https%3A%2F%2Fstorm-16a17dc388fbe6--c.demo.my.salesforce.app&loVersion=2.1.2`
- Console logged **`Agentforce Conversation Client: Lightning Out ready`**.
- All `accSdkWrapper` bundle scripts reported **Script loaded** (200), not 403.
- `LO2:LightningOutComponent` mounted; **0 console errors** (8 benign warnings:
  sandbox-escape notice, "class will not be mirrored", aura-from-LWC perf note).
- The panel opened with a **real agent greeting** — e.g. Data Cloud Agent:
  *"Welcome to Data Cloud Agent! What can I help with today? For Data Q&A,
  please use D360 Agent"* — with an active input box. A greeting only renders
  after ACC establishes a conversation session over that endpoint, so this is
  positive proof of a live session, not a cached shell.

## Why it was 403 before and is healthy now

The spec's "403 on load" was an empirical snapshot from an earlier point. Two
things changed the org/app state since:
1. The persistent agent-switcher work (PR #21) reworked the embed to the
   RE-EMBED-on-switch path with a `requestAnimationFrame` between teardown and
   mount, and reuses the app's authenticated session via `salesforceOrigin`
   (`orgCoreOrigin()`), so no Connected App / OAuth dance.
2. The four employee agents used by the switcher (`Cumulus Assistant`,
   `Financial Advisor`, `Data Cloud Agent`, `Analytics & Visualization`) are
   activated and reachable by the running user — verified by each opening with
   its own greeting.

## Follow-up if it ever 403s again

The three candidate causes from the plan remain the checklist:
1. Agent not activated / running user's permission set lacks access.
2. Agent not exposed to the channel the bundle's Lightning Out uses.
3. App Domain origin not a trusted origin for the LWR endpoint (CORS).

Reproduce first (network request URL + status + body), classify, then fix the
confirmed cause — do not guess-and-deploy.
