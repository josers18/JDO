# Bug: Agentforce Coworker "Create record" fails for every object over the Agent API

## Summary

When the Agentforce Coworker (Search Agent) runs through the Agent API, its built-in
create-record tool fails on every attempt, for every object tried (Task, Lead). The same request
from the same user succeeds in the Lightning Ask panel inside the **Banking - Console** app, and fails
in the **Agentforce Studio** app.

Search and metadata tools work normally over the Agent API; only create fails.

The stream reports the failure only as `status: "error"`, with no error detail. The model then invents
a cause ("page layout metadata isn't loading", "the page layout requires Middle Name"), and those
causes are not true of the org.

## Environment

| | |
|---|---|
| Org | `00Dam00000Uo32qEAB` (storm-16a17dc388fbe6.demo.my.salesforce.com), API v67.0 |
| Agent | Agentforce Coworker / Search Agent `0Xxam000000thvZCAQ` (template `AiSearch__SearchAgent`) |
| Agent API | `POST https://api.salesforce.com/einstein/ai-agent/v1/agents/{id}/sessions`, then `…/sessions/{id}/messages/stream` |
| Auth | External Client App, client credentials flow (scopes api, refresh_token, chatbot_api, sfap_api) |
| Run As user | admin@finsdc3.demo (System Administrator), sessions started with `bypassUser: false` |
| Session start | `streamingCapabilities.chunkTypes: ["Text", "LightningChunk"]` |

## Steps to reproduce

1. Start an Agent API session with the Coworker using a client-credentials token. Use the endpoint above.
2. Send: *"Create a task on the opportunity 'Advanced Communications - Cumulus Merchant Integration -
   Add-On Business - $27K': subject 'Speak with Al Miller about pricing', name Al Miller, status Not
   Started. Don't ask me to confirm, just create it."*
3. Watch the `search__toolBatch` chunks. The tool reports "Creating Task record" (running), then
   "Creating Task record - Adjusting approach" (`status: "error"`). The agent retries 2–3 times and
   gives up.
4. In a new session, send *"Create a new Lead: first name AFD360, last name TestLead, company AFD360
   Test Co, status New"*. The same failure follows ("Creating Lead record - Rethinking the approach",
   `error`).

**Expected:** the record is created, as it is in the Lightning Ask panel in Banking - Console.
**Actual:** the create tool fails every time, and no error detail is returned to the client.

## Repro matrix

| # | Surface / context | Request | Result |
|---|---|---|---|
| 1 | Agent API, client credentials | Task with Subject, Name, Related To, Status, Priority, Description | Create fails (×2 turns) |
| 2 | Agent API, client credentials | Task with only Subject, Name, Related To, Status (fields on every Task layout) | Create fails 3× in one turn |
| 3 | Agent API, client credentials | Lead with First/Last Name, Company, valid Status | Create fails 2×; agent claims the layout requires Middle Name and Salutation (false) |
| 4 | Agent API, client credentials | Search records / describe metadata in the same sessions | Succeed |
| 5 | Lightning Ask panel, **Banking - Console** app (`FINS_Retail_Banking_Console`) | Same Task request | **Succeeds** |
| 6 | Lightning Ask panel, **Agentforce Studio** app | Same Task request | Fails with the same "page layout" message |
| 7 | UI API as the same user: `GET /ui-api/record-defaults/create/Task` (all 3 record types) + `POST /ui-api/records` with the same fields | Direct call | Succeeds (test record deleted) |
| 8 | `EmployeeCopilot__CreateAToDo`, same user, Aug–Sep 2026 session traces | Task create | Succeeds |

## What we ruled out

- **Permissions:** the Run As user is a System Administrator, and a direct UI API create succeeds (#7).
- **Fields and layout:** a minimal Task fails too (#2). The Task create layout and record defaults load
  for all record types. Task has a single org-wide record page (`FINS_Task_Record_Page_Default`) and no
  app-level Task overrides.
- **Last-used app:** the user's `UserAppInfo` already pointed at Banking - Console when runs #1–#3
  failed.
- **Client payload:** the Lightning Ask panel's own `messages/stream` request carries no app or page
  context (`{"message":{"type":"Text","text":"…","sequenceId":"1"},"variables":[]}`), the same as ours.
  So the difference is not in the message body.

## Likely cause

The create tool appears to resolve layout data through a Lightning UI or app context. Banking - Console
provides that context. Agentforce Studio does not, and neither does an Agent API session authenticated
with client credentials, which has no Lightning UI session. Without it the tool fails, and the error is
swallowed.

## Secondary issue: the error detail is not surfaced

The Agent API stream carries only `{"description":"Creating Task record - Adjusting approach","status":"error"}`.
The underlying error never reaches the client, which leaves the model to guess (rows #3 and #6).
Returning the actual error in the tool chunk or the Inform result would make this diagnosable.

## Identifiers (2026-10-07, UTC)

| Run | Session id | Trace id(s) | Time |
|---|---|---|---|
| Task, minimal fields (#2) | `01a117ca-fb54-783b-8bcd-d6e5b6d11089` | `275f7b2f5658ed23862dfb50382e15b8` | 19:15:41 |
| Lead (#3) | `01a117cb-fe49-700c-a915-96d80ab352fc` | `cd1c091e5cfe7741783047a062c8be6b`, `70d63e56b1d549dec38b47898a617bc1` | 19:16:47, 19:17:26 |
| Task, full fields (#1) | `01a11734-c1c8-71fd-9d3b-467d2be674e5` | `1c51711d156de67e50a5f93847c265a8` | 18:36:47 |

Full request/response captures, with tokens masked, are available from the AFD360_Utilities Wire panel.
