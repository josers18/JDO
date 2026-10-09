# Agent Spec change: Cumulus_Assistant: HXL record cards in GeneralCRM

## Baseline (as of 2026-10-07)

- **Agent:** `Cumulus_Assistant` (`0Xxam000000tfCDCAY`), employee agent, **active v25**.
- **Source:** retrieved from finsdc3, 3,545 lines. The repo copy at `JDO/Cumulus_Assistant/` is stale (it lacks the
  v25 memory, transaction variables and guardrail changes), so the change starts from the org's v25.
- **Router:** `agent_router` uses a hyper-classifier and 21 transitions. CRM read questions ("account info",
  "show me opportunity X") go to **GeneralCRM**.
- **GeneralCRM:** IdentifyRecordByName, QueryRecords, QueryRecordsWithAggregate, GetRecordDetails, activity
  actions, DraftOrReviseEmail, UpdateRecordFields and ExtractFieldsAndValuesFromUserInput. All of them answer in
  text.

## Change

Add four actions to **GeneralCRM** only. The router, the other subagents and the variables stay unchanged.

| Action | Target | Status | Output (shown to user) |
|---|---|---|---|
| get_lead_snapshot | `apex://AFD360LeadSnapshot` | EXISTS | lead: `c__afd360LeadSnapshotCard` (HXL Lead card + "Create follow-up task" button) |
| get_account_snapshot | `apex://AFD360AccountSnapshot` | EXISTS | account: `c__afd360AccountSnapshotCard` (HXL Account card + "Show top opportunity") |
| get_opportunity_snapshot | `apex://AFD360OpportunitySnapshot` | EXISTS | opportunity: `c__afd360OpportunitySnapshotCard` (HXL Opportunity card + "Create follow-up task") |
| create_task | `apex://AFD360CreateTask` | EXISTS | task: `c__afd360CreateTaskCard` (HXL Task card + "Mark complete") |

Every output uses `is_displayable: True` and `filter_from_agent: False`. Inputs match the Apex
`@InvocableVariable` names exactly, as in the deployed `AFD360_HXL_Agent`.

**New GeneralCRM instruction** (appended):
> When the user asks to see, show or look up a specific Lead, Account or Opportunity, or asks for its info,
> details or snapshot, call get_lead_snapshot, get_account_snapshot or get_opportunity_snapshot. The record is shown
> to the user as a card, so add at most one short sentence and do not repeat its fields. For an account's top or
> largest open opportunity, call get_opportunity_snapshot with the account's Id. To create a Task, call create_task
> (resolve related-record and contact or lead Ids first). Keep using the existing actions for lists,
> aggregates, activities, summaries across many records, emails and field updates.

## Behavior expected after the change

- "Show me Omega, Inc." / "account info for Omega" → GeneralCRM → `get_account_snapshot`. The Lightning ask panel
  and AFD360 chat show the Account card.
- "What's Omega's top opportunity?" → account, then `get_opportunity_snapshot(accountId)` → Opportunity card.
- "Create a task for Al Miller on the ACH opportunity" → `create_task` → Task card. This works over the Agent API,
  where the built-in create fails (see `../docs/bug-coworker-create-record-agent-api.md`).
- Lists ("top 10 opportunities"), aggregates and summaries are unchanged; they still answer in text.

## Rollout and rollback

1. Edit a copy of the v25 source and run `sf agent validate authoring-bundle`.
2. Live preview (`--use-live-actions`) with the three utterances above, plus a list query, to check for
   regressions.
3. Publish as v26 and activate.
4. Verify in AFD360 chat that the cards render.
5. **Rollback:** reactivate v25 (`sf agent activate --version 25`). Nothing is deleted.

The updated source is saved back to `JDO/Cumulus_Assistant/`, so the repo copy matches the org again.
