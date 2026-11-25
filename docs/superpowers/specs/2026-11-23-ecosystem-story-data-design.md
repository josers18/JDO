# Ecosystem story data: every customer has a story

*Design, 2026-11-23. Status: approved by the user, 2026-11-23. Org `jdo-oe0sdd`.*

## Intent and why

The Supercharge Bankers demos (After the call for Rodriguez Industries, and the three planned next: retail campaign conversion and scoring UC-12, commercial prospect list UC-35, and "one conversation, every system" UC-15/16) each lean on data that exists for one hero customer. That makes the demos brittle and the org dull outside them.

Goal: every customer in the org can tell a story (a recent call, an inbound service request, a compliance event, a campaign they were touched by), built from **real CRM objects that stream to Data 360**, kept fresh automatically. The hero for a video is chosen by query, and Rodriguez becomes one instance of a pattern rather than the pattern.

## Goals

- Every account (about 36k) has a coherent recent story, so any banker's book works for any video.
- Data lives in native CRM objects, flows to Data 360 through the existing CRM streams, and is searchable where text matters.
- It stays fresh without anyone running a script.
- Rodriguez's story is reproduced by the same mechanism that serves everyone else.

## Non-goals

- No per-account hand authoring. No model call per record.
- No new Data Cloud ingestion pipeline outside CRM streams (no Heroku worker for this).
- No deployed Agentforce agent; "Agentforce" in the demos stays the Models API.
- Not building the three videos here. This is the data layer they sit on.

## Anti-goals (failure even if it technically works)

- A second, parallel notes store that the native Notes tab doesn't show.
- Stories that contradict an account's own signals (a positive-sentiment account with a hostile call).
- Reruns that duplicate records.
- Seed data that nobody can tell from real data to refresh or delete (no marker).

## Constraints and facts established

- Native Notes tab is **ContentNote**. Today: 535 notes on 133 accounts, about 270 bytes each, none for Rodriguez. `Meeting_Note__c` has 9 records; Note and AuthorNote are empty.
- Already streamed to Data 360: `ssot__ContentDocumentVersion__dlm` (the 535 are `FileType='SNOTE'`), `ssot__ContentDocumentRelationship__dlm` (ContentDocumentLink, 857 rows, has `RelatedItemId` = Account), `InteractionSummary_Home__dlm`, `Meeting_Note_c_Home__dlm`, Case, Campaign, CampaignMember, EmailMessage. Note **text** is not in Data 360: `VersionDataText` is a storage path to the `.snote` blob.
- `Interaction` (974 records, 134 accounts; `InteractionType`, `StartTime`, `EndTime`, `Description` 32,000 chars, `External_ID__c`) and `InteractionSummary` (1,565 records, 146 accounts; `MeetingNotes` 32,000, `NextSteps`, `InteractionPurpose`, `Status`, `External_ID__c`, `InteractionId`). Both fit a full transcript.
- `VoiceCall` (360; `Description` 32,000, `CallType`, duration, disposition, `External_ID__c`); `RelatedRecordId` is mostly null today, so they aren't tied to accounts.
- Case: 11,714 rich records, `External_ID__c`, `SDO_Service_*` fields. Campaign 53, CampaignMember 57,927, Lead 730, all with `External_ID__c`; Campaign has `Primary_Offer__c`.
- ContentNote is created by inserting a ContentVersion (creates the ContentDocument); the Account link is a separate ContentDocumentLink (`ShareType`, `Visibility`). Source: Salesforce Help article 005314319.
- No scheduled Apex exists in the org today. Existing Apex bridges: `DcBridgeRest`, `DcPromptRest`, `AiGenerateRest`, `CrmWriteRest`, `CommandCenterConfigRest`, `ModelCatalogProbe`.
- Snowflake MCP was unreachable this session; Snowflake-side pins (call sentiment, screening) are not touched here.

## Decisions made with the user

0. **KYC hydration (approved 2026-11-23):** identification documents and review dates only, native CRM objects, no Party objects, no KYC data in Snowflake.

1. **Native objects are the system of record**, streamed to Data 360 through CRM streams, with search indexes where text retrieval helps, and **Apex to keep data fresh**.
2. **ContentNote is the single home for notes** (call transcripts, call summaries, banker notes). The UI reads and writes ContentNote only, in all three cockpits. This is a standing rule.
3. **Migrate `Meeting_Note__c` into ContentNote**, then retire it as a read source.
4. **Use the whole interaction model**: `Interaction`, `InteractionSummary`, `VoiceCall`, `Case`, `Campaign`/`CampaignMember`/`Lead`, not just notes.
5. Net-new data must serve every customer, and where it is campaign-shaped it should derive from segments or campaign objects.

## Approaches considered

| | What | Trades off |
|---|---|---|
| A. Apex scheduled batch writing native records (chosen direction) | A `Schedulable` + `Batchable` job writes Interaction/Summary/ContentNote/Case/etc. from each account's own signals, in rotating chunks | Native, streamed, fresh; needs Apex tests and governor-aware batching; storage for ~36k accounts |
| B. One-off bulk seed script | Python/Bulk API once | Simple, but goes stale and is exactly the hero-seed pattern the user wants to leave |
| C. Heroku worker to Postgres, zero-copy | Like Marketing_Engagement | Great for external-system data, wrong for data that has a CRM object; fights the "native object" rule |
| D. Compute at click | Generate the story in the UI | No data to stream, nothing for Data 360 or other surfaces to use |

Recommended and agreed in spirit: **A**, with a one-time backfill using the same code path.

## Design

### Where each story element lives

| Story element | Native object | Reaches Data 360 as |
|---|---|---|
| The call itself (when, type, who) | `Interaction` (+ `InteractionAttendee`) | existing Interaction stream |
| Call recap, next steps, status | `InteractionSummary` (`MeetingNotes`, `NextSteps`) | `InteractionSummary_Home__dlm` |
| Full transcript / banker note | **ContentNote** + ContentDocumentLink to the Account | `ssot__ContentDocumentVersion__dlm` (title, date) joined to `ssot__ContentDocumentRelationship__dlm` (account). Text via the recap copy above. |
| Phone channel record | `VoiceCall` (set `RelatedRecordId` to the Account, `Description` = a short call log) | `ssot__VoiceCall__dlm` |
| Inbound service request | `Case` (native fields) | Case stream |
| Campaign touch / conversion | `Campaign`, `CampaignMember` (status = responded/converted), `Lead` | existing streams; scores as a Data 360 calculated insight |
| Compliance events (ownership change, screening change, address change, document expiry) | **No new object.** A query over existing sources, see "Compliance events" below | existing Snowflake-fed tables and CRM streams |

Search indexes: one on the ContentNote text if the platform allows a text index over notes, otherwise on `InteractionSummary.MeetingNotes`, which is the streamed copy. Confirm during build.

### Compliance events (no new object)

Compliance events are **derived by query, not stored**. A "compliance events for account X" view is a query over four sources, each one the system of record for its kind of event:

| Event | Source | Detected as |
|---|---|---|
| Ownership change | `BT_Synth_Relationship_Graph` (Snowflake enrichment) | a `BUSINESS_OWNER` edge with a recent `edge_discovered_date` (653 edges today; `metadata__c` carries `ownership_pct`). `BT_DNB_Business_Credit` (`ultimate_parent_duns`, `corporate_family_size`) can corroborate a new parent entity. |
| Screening change | `BT_WorldCheck_AML` | `change_since_last_run__c` = Changed or New, or a sanctions, PEP or adverse-media flag, with `last_screened_at` and `case_reference__c` |
| Address change | `BT_Zoominfo_Firmographics` | `hq_state_code__c` / `hq_postal_code__c` differing between monthly `profile_month__c` snapshots |
| Document expiry and KYC review due | CRM: Account KYC fields, `FinServ__IdentificationDocument__c` | `FinServ__KYCStatus__c`, `FinServ__NextReview__c`, and document `FinServ__ExpirationDate__c` in the past or soon |

Sustainable because Snowflake keeps refreshing the first three and CRM owns the fourth; nothing here needs a feed job. The story feed reads none of this (see Signals below); the cockpit and After the call read the query. A durable action (a KYC review for a banker to work) is a native Case or the Account KYC fields, which After the call already writes on Approve.

### KYC use case: what native data supports

Checked in the org. Enough for a KYC story on **status, review cadence and documents**, thin for formal onboarding and identity verification:

- **Account KYC fields:** `FinServ__KYCStatus__c` is set on essentially every account (Expired on ~35.7k; a handful Overdue, In progress, Completed–Valid, Required). `FinServ__NextReview__c`, `FinServ__LastReview__c` and `FinServ__KYCDate__c` exist but are sparse (last review is a single date, 2025-03-21); `FinServ__ReviewFrequency__c` is set on only ~135 accounts. `KYC_Summary__c` and `KYC_Path__c` hold free text.
- **Documents:** `FinServ__IdentificationDocument__c` has 112 records on 48 accounts (type, issue and expiry date, issuing country, verified by and on). `DocumentChecklistItem` has 91 (status New or Accepted, validated by and on, tied to Cases).
- **Empty, so unusable without hydrating:** `PartyProfile`, `PartyProfileRisk`, `PartyProfileAddress`, `PartyIdentityVerification` (and its steps), `PartyScreeningSummary` and Step, `IdentityDocument`, `InformationVerification`, `ComplianceIssue`, `ReceivedDocument`.
- **Gap to close for every account:** identification documents and review dates exist for only ~48 accounts and ~135 accounts. The story feed (or a one-time backfill) should hydrate, per account, an identification document with a realistic expiry and a next-review date consistent with its KYC status. That reuses native objects and needs no new one. **Decision (user): hydrate only identification documents and review dates, natively. The empty Party objects are skipped.** KYC data stays in native CRM objects, not Snowflake: bankers write it (After the call sets the status), and Snowflake keeps only vendor-style signals (screening, ownership edges).

### Freshness

A scheduled Apex job (`StoryFeed`, Schedulable + Batchable) runs daily. Each run processes a rotating slice of accounts. Per account it makes at most one new call story, drawn from that account's own signals (call sentiment, topics, next scheduled call, KYC status, open cases, campaign touches). Text comes from deterministic template pools seeded by the account id: no model call, same input same output.

Idempotency: every created record carries `External_ID__c` (Interaction, InteractionSummary, VoiceCall and Case already have one; ContentNote uses a deterministic title/key convention plus a marker on the link). Reruns upsert.

Marker: all generated records are identifiable (External ID prefix) so they can be refreshed or cleared as a set.

### The notes rule in the UI

- All three cockpits read notes from ContentNote through the account's ContentDocumentLinks, and write new notes as ContentNote + link.
- After the call: reads the latest call note; "Call summary" written on Approve becomes a ContentNote.
- `CrmWriteRest` gains a `note` action that creates the ContentVersion and the link. The `meetingNote` action is retired once the UI is switched.

### Rodriguez

His transcript is produced as a ContentNote with an Interaction and InteractionSummary through the same code, with his specifics pinned as the one hand-authored template. His ownership change and KYC state come from the same compliance query as every other account (see below); his new 30% owner needs one `BUSINESS_OWNER` edge pinned in Snowflake, next to the existing Rodriguez override procedures. Other accounts get equivalents from the pools.

### Migration

The 9 `Meeting_Note__c` records become ContentNotes linked to their accounts, dated from `Date__c`. Existing "Call summary" notes migrate with them. Then the UI stops reading the object.

### Hero choice for the videos

By live query over the data (an account in the target banker's book that has the needed story elements), with a pinned fallback: Allen Carter's book for Commercial and Sarah Smith's for Retail.

## Calls made after the builder check (author's calls; marked for review)

- **Text in Data 360.** ContentNote holds the full transcript. `InteractionSummary.MeetingNotes` holds a short **recap** of it (not a copy), which is what Data 360 and search read. One transcript, one recap, no second notes store.
- **Account linkage.** `Interaction.AccountId` and `InteractionSummary.AccountId` are the canonical account link (both fields exist). One story's records share an External ID stem (`story:<accountId>:<yyyymmdd>:<n>`): Interaction, InteractionSummary, VoiceCall and the ContentNote's ContentVersion `External_ID__c` all carry it. `VoiceCall.RelatedRecordId` is set to the Account.
- **ContentNote idempotency.** Add a custom `External_ID__c` field on ContentVersion (custom fields are supported there) holding the story stem. The link object cannot carry custom fields, so the ContentVersion is the marker. Regenerate or clear "as a set" by that prefix.
- **Signals.** The generator reads CRM-native signals only (KYC status, open and recent Cases, campaign membership and responses, account tier and owner). It does not call Data 360 or Snowflake from Apex. Call sentiment and screening pins stay Snowflake-side; Rodriguez's pinned story keeps matching them. The compliance query is separate from the call-story generator, which never reads it from Apex. Where an account has no signals, it gets a neutral routine-check-in story, so no account is empty.
- **Volume.** Backfill gives every account one story; after that the job adds at most one story per account per 30 days and keeps the latest 3 generated stories per account, expiring older generated ones. Volume is sized after the storage check below.
- **Migration.** The 9 `Meeting_Note__c` records are copied to ContentNote and kept (marked migrated) until the UI switch is verified. The 535 existing ContentNotes are left alone and treated as non-generated. Notes without an Account are skipped and listed.
- **Done means.** (1) Every Account has at least one linked ContentNote, Interaction and InteractionSummary. (2) A Data 360 query joining `ssot__ContentDocumentVersion__dlm`, `ssot__ContentDocumentRelationship__dlm` and `InteractionSummary_Home__dlm` returns a story for any sampled account. (3) Rerunning the job creates zero duplicates. (4) After the call works for Rodriguez and for 3 randomly chosen accounts in different books.
- **Scope of this plan.** Data layer, the `note` action in `CrmWriteRest`, and switching After the call and the call record view to ContentNote. Notes surfaces in ReactRetail and ReactWealth follow as their own change.
- **Run user.** The batch runs as the org's admin user so it sees all accounts. Checking for triggers, flows, assignment rules and email alerts on Case and Interaction before bulk inserts is part of the build.

## Open questions for the builder to settle

- Org data storage for about 36k accounts of notes, interactions and cases; whether to cap at one fresh story per account per period and expire older generated ones.
- Apex governor limits for the batch (DML per transaction, ContentVersion insert cost); chunk size and schedule.
- Whether the headless GraphQL API can read ContentNote and ContentDocumentLink, or reads must go through an Apex endpoint.
- Whether calculated insights can be created through the API in this org (for UC-12 scores); otherwise scores come from a Data 360 SQL query.
- Whether a text index can be built over note content or must use the `InteractionSummary` copy.
- Whether the Snowflake override procedures can add Rodriguez's new-owner edge (the Snowflake MCP failed to connect this session; run it manually or fix the connection).
- Hydration volumes for identification documents and review dates per account (storage).
- `CrmWriteRest` support for CampaignMember writes. **Deferred (2026-11-24):** UC-12's write-back scene creates a Task through `AtlasActionReview` instead, so neither the `campaignmember` action nor the `StoryFeed` CampaignMember upserts are built. Revisit in the final step.
- Whether ReactRetail and ReactWealth already have surfaces for prospect scoring and triage (a survey found none).

## Out of scope for this doc

The recorder config, talk tracks and new panels for the three videos. Each gets its own short design once this data layer exists.
