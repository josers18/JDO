# Ecosystem Story Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every account in `jdo-oe0sdd` a native, streamed, self-refreshing story (call, notes, KYC documents and review dates), with ContentNote as the single notes home and compliance events derived by query.

**Architecture:** A scheduled, batched Apex job (`StoryFeed`) writes `Interaction`, `InteractionSummary`, `VoiceCall`, ContentNote (+ ContentDocumentLink) and KYC hydration from deterministic templates seeded by account id. `CrmWriteRest` gains a `note` action and a notes read endpoint, the After the call panel switches to ContentNote, `Meeting_Note__c` is migrated, and compliance events become a query module over existing Snowflake-fed tables.

**Tech Stack:** Apex (API 67.0) with `sf` CLI deploys, Vitest + React/TypeScript in `React-Headless/.../ReactCommercial` and `_shared`, Data 360 SQL (`queryDataCloud`), Snowflake SQL for the one Rodriguez pin.

**Spec:** `docs/superpowers/specs/2026-11-23-ecosystem-story-data-design.md`

## Global Constraints

- Org alias `jdo-oe0sdd`; API version 67.0. Apex lives in `React-Headless/force-app/main/default/classes/`; each class has a `-meta.xml` and a `*Test.cls`.
- ContentNote is the only notes home. The UI never reads `Meeting_Note__c` after Task 6; it is kept (marked migrated), not deleted.
- Generated records are idempotent: every Interaction, InteractionSummary and ContentVersion carries `External_ID__c` = `story:<accountId>:<yyyymmdd>:<n>`. Reruns upsert; zero duplicates.
- Story text comes from deterministic template pools seeded by account id. No model call per record, no callout from Apex to Data 360 or Snowflake.
- Retention: backfill 1 story per account; afterwards at most 1 new story per account per 30 days; keep the latest 3 generated stories per account, expire older generated ones.
- Existing 535 ContentNotes are never modified or deleted. Notes without an Account are skipped and listed.
- KYC data stays native: identification documents (`FinServ__IdentificationDocument__c`) and review dates (`FinServ__LastReview__c`, `FinServ__NextReview__c`, `FinServ__ReviewFrequency__c`) only. The empty Party objects are not touched. No KYC data in Snowflake.
- Compliance events are a query, not an object: `BT_Synth_Relationship_Graph` (BUSINESS_OWNER edges), `BT_WorldCheck_AML`, `BT_Zoominfo_Firmographics`, plus Account KYC and identification-document expiry.
- No pushing. Vendor-neutral copy in narration and UI (no vendor names in story text).
- Never run `StoryFeed` against the org before Task 1's gates pass (they passed 2026-11-23; see the recon doc).
- Recon rulings: the generator creates no VoiceCall (its on-create flow creates a Case) and no Case rows; any Case a later task seeds is created Status=New, no ContactId, no assignment-rule header. The ContentVersion trigger body is uninspected, so the Task 9 pilot must watch for side effects.

## Review Focus

- Account with no signals at all: still gets a routine check-in story (not empty, not an exception).
- Account with a null `OwnerId` or a deactivated owner: the batch skips the owner-dependent field and still creates the story.
- Rerun after a partial failure (batch chunk threw): no duplicates, and the missing records are created.
- ContentNote body containing `<`, `&` or newlines: stored and read back unchanged (ContentNote bodies are HTML-escaped on write).
- Account with more than 3 generated stories: oldest generated expire; the 535 original notes and any non-generated notes are untouched.

---

### Task 1: Recon gates (storage, automation, read path)

**Files:**
- Create: `docs/superpowers/specs/2026-11-23-ecosystem-story-data-recon.md` (results, one section per gate)

**Interfaces:**
- Produces: a go/no-go for storage and automation, the chosen per-account record counts, and whether GraphQL can read ContentNote (consumed by Tasks 3 and 5).

- [ ] **Step 1: Storage.** Run `sf limits api display -o jdo-oe0sdd --json`; record `DataStorageMB` and `FileStorageMB` remaining. Estimate need as 36k accounts × (Interaction + InteractionSummary + VoiceCall + ContentNote) at their average sizes. Pass if remaining data storage is at least 1.5× the estimate; otherwise reduce to a fraction of accounts and write the cut into Global Constraints.
- [ ] **Step 2: Automation.** Query Tooling API for active Flows, Apex triggers and validation rules on `Case`, `Interaction`, `InteractionSummary`, `VoiceCall`, `ContentVersion`, and for Case assignment and escalation rules and email alerts. Record each; any that sends email or callouts is a blocker to resolve (deactivate for the run or skip Case creation).
- [ ] **Step 3: Read path.** Run a UI API GraphQL query for `ContentNote` and `ContentDocumentLink` through `executeGraphQL` in a scratch Vitest or via the Playwright session. Record yes or no.
- [ ] **Step 4: Campaign write and search.** Record (a) whether `CrmWriteRest` can write `Campaign` and `CampaignMember` today (read the class; a new `campaignMember` action is Task 10's work, not this task's); (b) which Data 360 search index options exist for ContentNote or `InteractionSummary.MeetingNotes` (`list_search_indexes`, `describe_search_index`); (c) whether segments can be created and published through the Data 360 tools (`create_segment`, `publish_segment`, `list_activation_targets`), read-only probes only, no creates.
- [ ] **Step 5: Verify.** The recon doc has all four sections with numbers. Commit: `docs: recon for ecosystem story data`.

### Task 2: Template pools

**Files:**
- Create: `React-Headless/force-app/main/default/classes/StoryTemplates.cls` (+ meta, `StoryTemplatesTest.cls`)

**Interfaces:**
- Produces: `StoryTemplates.build(Id accountId, StoryTemplates.Signals s, Date on) -> StoryTemplates.Story`, where `Signals` = `{String kycStatus, Integer openCases, Boolean campaignResponder, String tier}` and `Story` = `{String interactionType, String title, String transcript, String recap, String nextSteps, String purpose}`. Deterministic: same inputs give identical output.

- [ ] **Step 1: Tests.** `sameInputsSameStory`: two calls with equal args return equal `transcript`. `noSignalsGetsRoutineCheckIn`: all-null signals give a non-empty `transcript` and `purpose = 'Relationship Review'`. `kycExpiredMentionsReview`: `kycStatus='Expired'` makes `recap` contain 'KYC'. `htmlSafe`: no pool string contains `<` or `&`.
- [ ] **Step 2: Run, expect FAIL** (`sf apex run test -n StoryTemplatesTest -o jdo-oe0sdd -r human -w 10`).
- [ ] **Step 3: Implement** `build` with fixed pools per purpose; select with `Math.mod(Math.abs(accountId.hashCode()), pool.size())`. Rodriguez is not special-cased here.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.**

### Task 3: StoryFeed batch and schedule

**Files:**
- Create: `StoryFeed.cls` (Database.Batchable<SObject>, Schedulable; + meta, `StoryFeedTest.cls`); custom field `ContentVersion.External_ID__c` (`force-app/main/default/objects/ContentVersion/fields/External_ID__c.field-meta.xml`, Text(80), External ID, Unique).
- Depends on Task 1 gates.

**Interfaces:**
- Consumes: `StoryTemplates.build`.
- Produces: `StoryFeed.run(Integer chunkSize)` (starts the batch, returns the job Id), `StoryFeed.stem(Id accountId, Date on, Integer n) -> String` (`story:<id>:<yyyymmdd>:<n>`), `StoryFeed` schedulable on daily cron `0 0 2 * * ?`. Per account it upserts Interaction (`AccountId`, `InteractionType`, `StartTime`, `EndTime`, `Description` = transcript), InteractionSummary (`InteractionId`, `AccountId`, `MeetingNotes` = recap, `NextSteps`, `InteractionPurpose`, `Status`='Complete'), and ContentNote via ContentVersion (`Title`, `PathOnClient` = '<title>.snote', `VersionData` = escaped HTML of transcript, `External_ID__c`) + ContentDocumentLink (`LinkedEntityId` = account, `ShareType`='I', `Visibility`='AllUsers').

- [ ] **Step 1: Tests** with `@TestSetup` of 3 accounts: `createsAllRecordsPerAccount` (1 Interaction, 1 Summary, 1 ContentNote linked to the account each); `rerunCreatesNoDuplicates` (run twice with same date, counts unchanged); `retentionExpiresOldGenerated` (4th story deletes the oldest generated, a non-generated note on the same account survives); `skipsAccountWithinThirtyDays`; `accountWithoutOwnerStillGetsStory`; `noteBodyEscaping` (`<` and `&` in a transcript round-trip).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the batch: `start` queries Accounts in rotating slice (`Id` ordered, offset by day-of-year × chunk size), `execute` builds stories with bulkified DML (one `upsert` per object per scope, scope size 50), `finish` logs counts. Selecting generated records uses the `story:` External ID prefix.
- [ ] **Step 4: Run, expect PASS** (all tests).
- [ ] **Step 5: Deploy** the class, field and tests with `sf project deploy start -d ... -o jdo-oe0sdd --json` and read `status`. Commit.

### Task 4: KYC hydration

**Files:**
- Create: `KycHydrator.cls` (+ meta, `KycHydratorTest.cls`); called from `StoryFeed.execute`.

**Interfaces:**
- Produces: `KycHydrator.hydrate(List<Account> scope)`: for accounts lacking an identification document, inserts one `FinServ__IdentificationDocument__c` (`FinServ__Account__c`, `FinServ__DocumentType__c`, `FinServ__IssueDate__c`, `FinServ__ExpirationDate__c`, `FinServ__SourceSystemId__c` = `kyc:<accountId>`) whose expiry matches the account's KYC status (Expired → past date; Completed–Valid → ≥ 1 year ahead); and sets `FinServ__LastReview__c`, `FinServ__NextReview__c`, `FinServ__ReviewFrequency__c` only where null, consistent with status.

- [ ] **Step 1: Tests:** `expiredStatusGetsExpiredDocument`, `validStatusGetsFutureDocument`, `existingDocumentUntouched`, `existingReviewDatesUntouched`, `rerunNoDuplicateDocument` (by `FinServ__SourceSystemId__c`).
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.**

### Task 5: Notes in the app (write, read, After the call)

**Files:**
- Modify: `CrmWriteRest.cls` (new `handleNote`), `CrmWriteRestTest.cls`; `_shared/src/data/crmWriteClient.ts` (add `'note'` to `CrmAction`; add `fetchNotes(accountId: string): Promise<AccountNote[]>`); `ReactCommercial/src/personas/customer/afterCall.ts` (+ `afterCall.test.ts`), `ReactCommercial/src/atlas/AfterCall.tsx` (`CallRecord`).
- Recon (Task 1) found GraphQL reads ContentNote and reads ContentDocumentLink when filtered by `LinkedEntityId`, so reads use GraphQL: drop the Apex GET endpoint and implement `fetchNotes` with `executeGraphQL` (link query by `LinkedEntityId`, then ContentNote by `Id`).

**Interfaces:**
- Produces: `{"action":"note","accountId","subject","description","eventDate"}` writes ContentVersion + link and returns `{success, id}`; `fetchNotes(accountId) -> AccountNote[]` where `AccountNote = {id: string; title: string; date: string; body: string}`, newest first. `fetchAfterCallContext` and `fetchCallRecord` use `fetchNotes`; `approveAfterCall` calls `crmWrite({action:'note', ...})` instead of `meetingNote`.

- [ ] **Step 1: Apex tests** in `CrmWriteRestTest`: `noteRequiresAccountAndTitle` (400s like `meetingNote`), `noteCreatesLinkedContentNote`, `noteBodyEscaping`. TS: `fetchNotes` returns newest first.
- [ ] **Step 2: TS tests** in `afterCall.test.ts`: update the existing `fetchAfterCallContext` and `approveAfterCall` cases to mock `fetchNotes` and expect the `note` action (the existing "skips newer 'Call summary —' notes" and "6 writes" assertions stay).
- [ ] **Step 3: Run both, expect FAIL.** (`sf apex run test -n CrmWriteRestTest ...`; `npm run test -- run src/personas/customer/afterCall.test.ts` from the ReactCommercial bundle.)
- [ ] **Step 4: Implement** `handleNote` mirroring `handleMeetingNote` (line 465) and the TS changes above. `meetingNote` action stays for now.
- [ ] **Step 5: Run both, expect PASS;** run `npx tsc -b` and `npm run build:atlas` (V2). Deploy Apex, then `ReactCommercialV2`. Commit.

### Task 6: Migrate Meeting_Note__c

**Files:**
- Create: `MeetingNoteMigration.cls` (+ meta, test); one-off run via `sf apex run`.

**Interfaces:**
- Produces: `MeetingNoteMigration.run() -> Integer` (notes migrated). Each `Meeting_Note__c` becomes a ContentNote linked to `Account__c` with `Title__c`, `Notes__c`, dated from `Date__c`; its `External_ID__c`-style marker `migrated:<recordId>` goes on the ContentVersion. Originals are kept; skip rows with null `Account__c` and return their Ids in a debug log.

- [ ] **Step 1: Tests:** `migratesNoteWithTitleBodyAndLink`, `skipsNoteWithoutAccount`, `rerunDoesNotDuplicate`.
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** deploy, run once against the org, verify the After the call panel still shows Rodriguez's transcript from ContentNote. Commit.

### Task 7: Compliance events query module

**Files:**
- Create: `_shared/src/data/complianceEvents.ts` (+ `complianceEvents.test.ts`); export from `_shared/src/data/index.ts`.

**Interfaces:**
- Produces: `fetchComplianceEvents(accountId: string): Promise<ComplianceEvent[]>`, `ComplianceEvent = { kind: 'ownership' | 'screening' | 'address' | 'document'; detected: string; detail: string }`, newest first, using `queryDataCloud` over `BT_Synth_Relationship_Graph__dlm` (`edge_type__c='BUSINESS_OWNER'`, `edge_discovered_date__c` in the last 180 days, `src_account_id__c`), `BT_WorldCheck_AML__dlm` (`change_since_last_run__c IN ('Changed','New')` or a hit flag), `BT_Zoominfo_Firmographics__dlm` (latest two `profile_month__c` rows with different `hq_postal_code__c`), and `executeGraphQL` for identification documents expiring in under 90 days or past.

- [ ] **Step 1: Tests** (mock `queryDataCloud` and `executeGraphQL`): one per kind; `emptyWhenNothing`; `oneSourceFailingDoesNotHideOthers` (a rejected query returns events from the rest).
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** `npx tsc -b`; commit.

### Task 8: Rodriguez pin

**Files:**
- Create: `Demo_Seeds/supercharge_bankers/rodriguez_owner_edge.sql`; Modify: `Demo_Seeds/supercharge_bankers/transcript_2026-11-20.md` only if needed (no change expected).

**Interfaces:**
- Produces: one `BUSINESS_OWNER` edge for Rodriguez Industries (`dst_account_id__c` = Tomas Vega's account or a placeholder, `edge_discovered_date__c` = 2026-10-30, `metadata__c` ownership 30 percent), idempotent.

- [ ] **Step 1:** With the Snowflake MCP, `SHOW TABLES LIKE '%RELATIONSHIP_GRAPH%'` across databases and read how `snowflake_overrides.sql` writes the existing Rodriguez pins; write the SQL as a `MERGE` keyed on `record_id`.
- [ ] **Step 2: Show the statement to the user and wait for approval before running.** Run it; wait for the Data 360 refresh; verify `fetchComplianceEvents('001am00002A9jm4AAB')` returns an `ownership` event (query `BT_Synth_Relationship_Graph__dlm` for the edge).
- [ ] **Step 3:** Commit.

### Task 9: Backfill, schedule and acceptance

**Files:** none new; run scripts in `Demo_Seeds/ecosystem_story/run_backfill.sh`.

- [ ] **Step 1: Pilot.** Run `StoryFeed.run(200)` once and check counts, storage and no email or flow side effects.
- [ ] **Step 2: Backfill.** Run in slices until every account has a story, checking storage after each slice.
- [ ] **Step 3: Schedule.** `System.schedule('StoryFeed daily','0 0 2 * * ?', new StoryFeed())` via `sf apex run`.
- [ ] **Step 4: Acceptance** (from the spec): (1) every Account has ≥ 1 linked ContentNote, Interaction and InteractionSummary; (2) a Data 360 join of `ssot__ContentDocumentVersion__dlm`, `ssot__ContentDocumentRelationship__dlm` and `InteractionSummary_Home__dlm` returns a story for 10 sampled accounts; (3) rerun creates zero duplicates; (4) After the call works for Rodriguez and for 3 accounts from different books. Record results in the recon doc. Commit.

### Task 10: Campaign touches and segment activation showcase

**Added 2026-11-23 at the user's request; scope depends on Task 1 Step 4.** Detailed steps are written after the recon doc exists.

**Goal:** Campaign and CampaignMember records are part of every account's story (touches and responses derived by `StoryFeed` signals), and the demo can create a segment in Data 360 from them and activate it.

**Files (expected):** `CrmWriteRest.cls` (+ test): `campaignMember` action; `StoryFeed.cls`: CampaignMember upsert by `External_ID__c`; a search index over notes if Task 1 says it is possible; `Demo_Seeds/ecosystem_story/segment_activation.md`: the segment definition and the activation steps the demo narrates.

**Trimmed 2026-11-24 (user ruling, enough to finish the demos):** Task 10 is the segment plus its doc only. The `CrmWriteRest` `campaignmember` action and the `StoryFeed` CampaignMember upserts are **deferred**: UC-12's write-back scene (a reviewed follow-up Task through `AtlasActionReview`) does not need them. The segment "Retail Campaign Responders (UC-12)" is built in the browser, unpublished, with no activation target (see `Demo_Seeds/ecosystem_story/segment_activation.md`). The Retail Growth "Campaign responders" view reads Data 360 directly. Revisit the deferred items in the final step.

- [x] **Step 1:** Segment definition agreed with the user and built unpublished (lookback P360D, 8,140 on last recount).
