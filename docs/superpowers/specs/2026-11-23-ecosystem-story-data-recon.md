# Ecosystem story data: recon results (org `jdo-oe0sdd`)

Run 2026-11-22, read-only. No org or Data 360 records or metadata were created, changed or deleted.

## Go / no-go summary

| Gate | Verdict |
|---|---|
| 1. Storage | PASS. Use all ~36k accounts, no fraction cut needed. |
| 2. Automation | PASS WITH CONDITIONS. Nothing fires an email or callout on Interaction, InteractionSummary, VoiceCall or ContentVersion. Case creation is safe only if constrained (see Gate 2). |
| 3. Read path | PASS. GraphQL reads ContentNote, and ContentDocumentLink when filtered by `LinkedEntityId`. |
| 4. Campaign write and search | (a) `CrmWriteRest` cannot write Campaign or CampaignMember: Task 10 must add it. (b) Search indexes exist for `InteractionSummary.MeetingNotes`, none for ContentNote. (c) Segment tools and 4 activation targets are present, but segment create and publish were not probed, by design. |

Overall: GO for Tasks 3 and 5 at full scale (36,251 accounts). The recommended account fraction is 100%, because the storage check passes with a wide margin.

## Gate 1: Storage (PASS)

Source: `sf limits api display -o jdo-oe0sdd --json`.

| Limit | Max MB | Remaining MB |
|---|---|---|
| DataStorageMB | 70,812 | 69,759 (about 1,053 MB used) |
| FileStorageMB | 229,012 | 228,641 |

Account count is 36,251.

Estimate basis is 2 KB of data storage per record, the assumed default (not measured). The two measured inputs are below.
- Existing ContentNote: 535 notes, SUM(ContentSize) is 142,804 bytes, about 267 bytes per note. ContentNote bodies live in ContentVersion and count against file storage, but they are counted conservatively as 2 KB of data storage below.
- Existing volumes: Interaction 974, InteractionSummary 1,565, VoiceCall 360, Case 11,714, ContentNote 535, CampaignMember 57,927.

Worst case is 1 record of each of the 4 types per account.
- Records: 36,251 x 4 = 145,004.
- Storage: 145,004 x 2 KB is about 290 MB (about 283 MiB).
- Pass threshold: 1.5 x 290 MB = about 435 MB.
- Remaining data storage is 69,759 MB, about 160 times the threshold.

Headroom: even 10 records of each type per account would be about 2.9 GB, still well under remaining storage. Storage does not constrain the per-account counts, so Tasks 3 and 5 can pick counts from the story needs. No Global Constraints cut is needed.

## Gate 2: Automation (PASS WITH CONDITIONS)

Queries ran through the Tooling API (ApexTrigger, ValidationRule, WorkflowRule, WorkflowAlert, AssignmentRule) and `FlowDefinitionView` (active flows). Flow metadata was read with `SELECT Metadata FROM Flow`.

**Apex triggers**
- Case: `caseTrigger` (Active), `CaseTrigger` (Active), `SDO_Tool_SalesforceRewind_Case` (Active), `SDO_Service_AI_CaseSentimentTrigger` (Inactive). The two Case trigger bodies are hidden (managed or protected), so their behavior is not inspected. This is a residual unknown.
- ContentVersion: `SDO_Tool_SalesforceRewind_ContentVersion` (Active). It is a rewind and tracking tool, not outbound.
- Interaction, InteractionSummary, VoiceCall: no triggers.

**Validation rules:** 0 on Case, Interaction, InteractionSummary, VoiceCall, ContentVersion and ContentNote.

**Active record-triggered flows on target objects**

| Object | Flow | Trigger and criteria | Outbound? |
|---|---|---|---|
| Case | SDO_Service_Case_Status_Updated | After save, create or update, when Status is changed. Branches by status (Waiting on Customer, Closed, Escalated). Subflows `SDO_Case_SendSurvey` (`dynamicSendSurveyInvitation`, sends a survey invite), `SDO_Case_EntitlementCloseProcess` (none), `SDO_Service_Send_Message` (`liveMessageNotification`, messaging). | YES, on Closed or other branch statuses |
| Case | SDO_Service_Case_Wrap_Up_Classification | After save, update only, Status not equal to a value. Calls `Run_Case_Wrap_Up_Classification`. | Not on create |
| Case | Service_Innovation_EI_Plumbing | After save, create or update. Fires on `Ready_for_EI_Flow__c` or on specific Subject values. Creates and updates Engagement Interaction records and can close the Case. | Internal only, but heavy DML |
| Case | FINS_Retail_Banking_Starter_CreateEIAccountOpening | After save, on specific Subject. Creates EI and updates Lead. | Internal |
| Case | FINS_Service_Enablement_Case_Milestone_Progress | After save, update only, Status equal to a value. | Internal |
| Case | FINS_CommercialBanking_Treasury_Implementation_Bundle_Services | Before save, update only. | Internal |
| Case | Update_Last_Interaction_Case | After save, create or update, when AccountId is not null. Updates Account last-interaction fields. | Internal. Note: this writes to Account for every Case. |
| Case | Run_My_Day_Create_Aging_Case_Alert | Scheduled, daily, over Cases whose Status is not a value. Calls `createRunMyDayAlert` and `emailSimple`. | YES (email), but on a schedule over open Cases, not on create |
| VoiceCall | SDO_Service_Voice_Call_On_Create | After save, create. Phone number search subflow, creates a Case, updates the VoiceCall. | Creates Cases as a side effect. Avoid inserting VoiceCall in bulk, or accept the extra Cases. |
| VoiceCall | SDO_Service_Log_A_Call_from_Voice | After save, update. Runs the `LogACall` quick action. | Internal |
| Interaction, InteractionSummary, ContentVersion | none | none | none |

**Assignment rules on Case:** "Primary Assignment Rules" and "Einstein Case Routing Only". Rules only run if the REST caller sets the assign-rules header (the default is off). Their email notifications were not inspected.

**Email alerts on Case:** `SDO_Service_CSAT_Survey`, `SDO_Service_Milestone_1st_Response_VIOLATION`, `..._SUCCESSFUL`, `..._Warning`, `SDO_Service_Send_customer_satisfaction_survey`, `SDO_Service_Trigger_Laptop_Email`. These are fired by workflow actions or flows, mainly milestone and survey paths. There are no active Case WorkflowRules (the 17 active rules belong to the Marketing Cloud package `et4ae5__` objects). There are no outbound messages. Escalation rules are not queryable (`EscalationRule` is unsupported in Tooling API).

**Blockers and conditions**
- Case creation is the only risky path. Any Case that is created as Closed (or moved to Closed, Escalated, or Waiting on Customer) fires `SDO_Service_Case_Status_Updated`, which can send a survey invite or a message. Create seeded Cases with an open status (for example New) and without a ContactId. Do not set Subject to the EI-trigger values. Do not send the assign-rules header. If closed history is needed, deactivate the survey and message paths for the run, or skip those Cases.
- The 2 hidden Case triggers remain unverified.
- Case inserts also cause `Update_Last_Interaction_Case` to update the parent Account, which adds load and Account `LastModifiedDate` churn for ~36k accounts.
- Do not bulk-insert VoiceCall without accepting the extra Cases created by `SDO_Service_Voice_Call_On_Create`.
- Interaction, InteractionSummary, VoiceCall (aside from the flow above) and ContentNote creation has no emailing automation.

## Gate 3: Read path (PASS)

UI API GraphQL, `POST /services/data/v67.0/graphql`, via `sf api request rest`.

| Query | Result |
|---|---|
| `ContentNote(first:2)` returning `Id` and `Title { value }` | YES. Returned notes, for example "Quick Question re: Business Accounts - March 10, 2025". `errors: []`. |
| `ContentDocumentLink(first:2)` with no filter | FAILS. `DataFetchingException`: "We couldn't find the record you're trying to access". The platform requires a `LinkedEntityId` (or `ContentDocumentId`) filter. |
| `ContentDocumentLink(first:3, where:{LinkedEntityId:{eq:"<accountId>"}})` returning `Id`, `ContentDocumentId { value }` | YES. Returned 3 links, matching the SOQL count of 15 on that account. |

Answer for Tasks 3 and 5: GraphQL can read ContentNote directly, and can read ContentDocumentLink only when filtered by `LinkedEntityId`. Resolve the notes for an account by links first, then ContentNote by id (or use REST).

## Gate 4: Campaign write and search

### (a) CrmWriteRest (Campaign and CampaignMember not writable today)
`React-Headless/force-app/main/default/classes/CrmWriteRest.cls` (644 lines) dispatches on `action`: task, event, case, email, goal, lifeEvent, lead, opportunity, meetingNote, kyc, update, delete. Update and delete accept `sobjectType` of Task, Event, FinancialGoal, PersonLifeEvent or Lead only. There is no `campaign` or `campaignMember` action, and any other action returns 400 "Unknown action". A new `campaignMember` action is Task 10's work.

### (b) Data 360 search indexes
24 indexes exist (`list_search_indexes`). Relevant ones:
- `InteractionSummary_Home`: VECTOR, READY, NEAR_REALTIME, source DMO `InteractionSummary_Home__dlm`. It chunks `MeetingNotes__c` and `Name__c` (Title) at 512 max tokens, with embedding `e5_large_v2`, 1024 dimensions, HNSW, cosine. Last refreshed 2026-05-12. This is the option for `InteractionSummary.MeetingNotes`.
- `Meeting_Note_c_Home`: VECTOR, READY, source `Meeting_Note_c_Home__dlm`, chunks `Notes_c__c` and `Title_c__c`. Last refreshed 2025-10-08.
- `FileUDMO_SI` (source `RagFileUDMO__dlm`) and `EAC_Documents` (source `EAC_Documents__dlm`) are READY hybrid indexes over file data.
- No index targets ContentNote or ContentVersion directly. Making ContentNote searchable would need a new index (not created here).
- The remaining indexes are unrelated (KYC, CSAT, 10-Q, products, agent interactions, setup, and so on).

### (c) Segments and activation (read-only probes)
- `list_segments`: 21 segments, mostly Account-targeted (`ssot__Account__dlm`). Examples: "Accounts with recent trade activity" 36,814 members; "High Value Enterprise Accounts" 33,871 (refresh every 24h); "Equipment Financing Special Promo" 32; "High-Value Buying Committee Members" 4,797 (AccountContact). Several `Dynamic` campaign-audience segments show recordCount 0.
- `list_activation_targets`: 4 ACTIVE targets: Marketing Cloud Engagement (SalesforceMarketingCloud), AWS S3 (Legacy), Data Cloud Loyalty (CuratedEntity), Data Cloud DMO.
- `create_segment` and `publish_segment` exist as tools but were not called, so whether segment creation and publishing succeed is not verified. The Account DMO is populated, so an Account-targeted segment is feasible.
