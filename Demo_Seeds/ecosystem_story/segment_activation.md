# Segment: Retail Campaign Responders (UC-12)

STATUS: BUILT, UNPUBLISHED. Id `1sgam000000ndBVAAY`, API name `Retail_Campaign_Responders_UC_12`.
Segment type UI, Standard Publish, Do Not Schedule, data space default, no activation target.
Last recount (2026-11-24): **8,140** accounts at a 360-day lookback (6,820 at 90 days). SQL says 7,281. See "The 461-account gap".

Derived from existing CampaignMember data. No generated rows, no Apex changes.

## Definition
- Target DMO: `ssot__Account__dlm`, filtered to `IsPersonAccount__c = true` (UC-12 is retail).
- Include an Account when a Contact on it has a `ssot__CampaignMember__dlm` row where
  - `ssot__CampaignMemberStatus__c = 'Responded'`
  - `ssot__CampaignId__c` in (Premier Checking Onboarding `701am00002A9aDcAAJ`, Mobile Banking Adoption `701am00002A9aDjAAJ`, HELOC Refi Outreach Q2 `701am00002A9aDaAAJ`)
- Container: Campaign Member, Count At Least 1.
- No intended date window. The three campaigns' responses are all dated 2026-05-26.

## How it was built
Standard segment builder in the browser, then saved via Recount. `create_segment` cannot make it:
1. `segmentType: Ui` -> 403 "UI based segment creation is forbidden for external users."
2. `segmentType: Dynamic` -> 400 ENTITY_SAVE_ERROR, `DbtSqlValidationErrorBlock INVALID_EXPRESSION` (Dynamic rejects path/join criteria).

Builder steps and quirks:
- Container Path: "Campaign Member.Individual Source Id > Account Contact.Account > Account.Account Id". The default path (via Individual > Primary Account) is the wrong one; `Account.ssot__IndividualId__c` is empty.
- `Is Person Account` Value: type `true`, then click the suggestion popup under the field or it will not commit.
- `Campaign Is In`: type the ids comma-separated (`id1,id2,id3`) and then click the popup. Selecting ids one at a time keeps only the last one.

## Join path (as saved in the segment definition)
`Account.ssot__Id__c` = `AccountContact.ssot__AccountId__c`, then
`AccountContact.ssot__Id__c` = `CampaignMember.ssot__IndividualSourceId__c`.
An earlier note said the join used `CampaignMember.ssot__IndividualId__c` = `AccountContact.ssot__IndividualId__c`. Both give 7,281 in SQL. The segment uses the IndividualSourceId form.
- `Account.ssot__IndividualId__c` is empty for all person accounts, so the AccountContact hop is required.
- 14,494 of 14,824 responders are Contacts; 330 are Leads and have no Account.

## Size
- Plain SQL against the DLOs: 7,281 person accounts (10,954 before the person-account filter).
- Segment recount: 6,820 at 90 days; 8,140 at 360 days (a copy at 360 days gave 7,281).

## Excluded
Auto Loan Rate Drop Promo (completed, inactive; 2,659 responders).

## The 461-account gap (7,281 vs 6,820): partly explained, not closed (2026-11-24)
Cause: the segment's **Lookback Window**. The segment was created with the default 90 days (`lookbackPeriod: P90D`). A copy with identical rules and a 360-day lookback recounted at **7,281**, exactly the SQL number. So the 90-day window drops 461 accounts even though every response is dated 2026-05-26 (about 182 days back). The window evidently keys on a different timestamp than FirstResponseDateTime, so the earlier "a real 90-day window would give 0" reasoning does not hold for this segment type.
- The builder caps the lookback at 360 days (730 is rejected: "Select a lookback range between 1 and 360 days").
- Test method: Copy the segment (Standard publish, Do Not Schedule), set lookback 360, Save (the copy recounts on creation), compare, delete the copy. The original was not edited. The temp copy `ZZ_TEMP_UC_12_gap_test_delete_me` was deleted.
- Applied to the saved segment (Edit Properties, lookback 360, then Edit Rules > Start Recount; never published). The saved segment is now **P360D / 8,140**, not 7,281. So the lookback does change the count, but the saved segment and the copy disagree at the same 360 days (copy 7,281, saved segment 8,140), and neither matches the SQL set at both ends. Not yet explained. Candidates: the copy's count is computed differently than a builder recount (exact vs approximate), or the recount includes accounts the SQL join excludes.
- Treat the segment count as unreliable for on-screen use. The cockpit uses direct SQL counts (7,281 over the book).
- Earlier ruled out: duplicate Account rows.

## Open
- Activation target: none chosen.
- UC-12 scene: not yet defined (what the video shows with this segment).
