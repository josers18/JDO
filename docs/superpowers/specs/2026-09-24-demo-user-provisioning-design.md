# Demo User Provisioning — Design Spec

- **Org:** `jdo-oe0sdd` / `finsdc3.demo` (production demo org)
- **Date:** 2026-09-24
- **Status:** Approved direction (Approach ①), pending spec review
- **Owner:** Jose Sifontes

## 1. Problem

Everyone shares one demo user (`sarah.smith@finsdc3.demo`), causing session
collisions and general contention. We need a **scalable, centrally-managed way
to provision additional demo users** that each carry the *same* access as
Sarah, created **on demand** (requests will come through a Slack workflow), and
— critically — a way to **add a new grant once and have it apply to every demo
user across the board**.

## 2. Gold-master footprint (what "same as Sarah" means)

Captured live from the org on 2026-09-24 (`sarah.smith@finsdc3.demo`,
Id `005am000006ffBpAAI`):

| Dimension | Value |
|---|---|
| Profile | **Standard User** (`00eam000004MKPXAA4`) |
| Role | **Central Sales** (`00Eam000002BnSfEAK`) |
| User type | Standard |
| Permission Set Groups | **8** — `Access_Ai_Search`, `Agentforce_Main`, `CopilotSalesforceUserPSG`, `Data_Cloud_Data_Access`, `FINS_Banking_Base_Lvl2`, `FINS_Financial_Service_Cloud_Base`, `FSC_Base_Permset_Group`, `QBrix_Demo_FINS_Retail_Banking_Starter_Group` |
| Standalone Permission Sets | **27** — `Access`, `Access_Agentforce_Default_Agent_PS`, `Advisor`, `AgentCreator`, `CumulusOfferTilesAccess`, `Data_Cloud_Standard_User_Augmentation`, `DC_AgentForce_Output_User`, `DC_GA4_EC_PermissionSet`, `DC_Goals_Cockpit_User`, `DC_Multiclass_Prediction_User`, `DC_Prediction_Model_User`, `DC_Query_to_Table_User`, `FINS_Banking_Base`, `FINS_Base`, `FINS_Commercial_Banking_Sales`, `Offer_Objects_Access`, `PersonalBanker`, `SDO_Platform_Components`, `SDO_Platform_Email_Template_Builder`, `SDO_Platform_Files_Connect`, `SDO_Platform_Flow_User`, `SDO_Slack_Service_Swarming_User`, `Slack_Standard_User`, `Standard_User_Augment`, `Use_Flow_Automation_Agent`, `View_Flows`, `xDO_Service_Knowledge_Access` |
| Permission Set Licenses | **49** (FSC suite, Data Cloud, all Einstein/Agentforce, Tableau Next, OmniStudio, CRM Analytics, etc. — full list maintained in the manifest) |
| Managed-package licenses | 0 |
| Group / Queue membership | 1 — `WebMessagingQueue` (Queue) |
| Login | SSO via FederationIdentifier (slack-corp) — **not** reused for demo users |
| User defaults | TZ `America/New_York`, Locale `en_US`, Lang `en_US`, Emailenc `UTF-8` |

~85 discrete grants per user — infeasible to reproduce by hand reliably.

**Feasibility (confirmed):** base **Salesforce** user license has **458 free
seats** (550 total / 92 used). No base-license constraint on the demo-user pool.

## 3. Decisions (locked)

- **Approach ①** — Master PSG + repeatable provisioning tool.
- **Login:** username + password (not SSO).
- **Cadence:** on-demand, ongoing; intake via a Slack workflow.
- **Fidelity:** exact clone now; single-point central additions going forward.
- **Input:** the requester's **Salesforce email** (from the Slack request),
  e.g. `jdoe@salesforce.com`.
- **`User.Email`:** the requester's real Salesforce email (as supplied).
- **Username:** local part of that email + `@finsdc3.demo`
  (e.g. `jdoe@salesforce.com` → `jdoe@finsdc3.demo`).
- **Password:** shared demo password `salesforce1`, read from env
  `DEMO_USER_PASSWORD` (default `salesforce1`). Low-sensitivity shared demo
  credential for a throwaway demo org; env-overridable.

## 4. Architecture

Four parts. PSGs carry the bulk of access and auto-propagate; a thin tool stamps
the parts a PSG cannot carry (profile, role, licenses, queue) and can re-sync
licenses.

### 4.1 Central access backbone — the "add once" lever

Create one new Permission Set Group **`Demo_Standard_Access`** whose members are
Sarah's 27 standalone permission sets (deduplicating any already contained in her
8 existing PSGs). "Standard demo access" = **9 PSGs**: `Demo_Standard_Access` +
the 8 existing PSGs.

- **Grant new access to every demo user later:** add the permission set to
  `Demo_Standard_Access` once → propagates automatically to all assigned users
  (native PSG behavior; recalculates immediately). This is the primary
  central-management lever.
- PSGs cannot be nested, so the 8 existing PSGs remain assigned alongside the new
  one rather than absorbed into it. This keeps them intact and independently
  maintainable.

### 4.2 Provisioning manifest — version-controlled source of truth

`DemoUserProvisioning/template.json` captures exactly what a demo user gets:

```json
{
  "profile": "Standard User",
  "role": "Central Sales",
  "permissionSetGroups": [
    "Demo_Standard_Access", "Access_Ai_Search", "Agentforce_Main",
    "CopilotSalesforceUserPSG", "Data_Cloud_Data_Access",
    "FINS_Banking_Base_Lvl2", "FINS_Financial_Service_Cloud_Base",
    "FSC_Base_Permset_Group", "QBrix_Demo_FINS_Retail_Banking_Starter_Group"
  ],
  "permissionSetLicenses": ["<49 PSL developer names — see Appendix A>"],
  "queues": ["WebMessagingQueue"],
  "publicGroups": ["Demo_Users"],
  "userDefaults": {
    "TimeZoneSidKey": "America/New_York",
    "LocaleSidKey": "en_US",
    "LanguageLocaleKey": "en_US",
    "EmailEncodingKey": "UTF-8"
  },
  "usernameDomain": "finsdc3.demo"
}
```

Editing this file is how provisioning is changed centrally. For grants a PSG can
carry (permission sets) prefer editing the PSG (auto-propagates). For grants it
cannot (licenses, queue), edit the manifest and run the sync command (§4.4).

### 4.3 Provisioning tool — on-demand, repeatable, idempotent

Apex script executed via `sf apex run`, wrapped by
`provision_demo_user.sh <first> <last> [email]`. Steps, all idempotent
(re-running skips what already exists) and continue-on-error with a per-item
report:

1. Input = requester's Salesforce email. Derive `Username = <localpart>@finsdc3.demo`,
   `Email = <requester's Salesforce email>`, `Alias` (from local part, ≤8 chars),
   display name (from local part, or first/last if supplied).
2. Create the `User` — Standard User profile, Central Sales role, manifest
   defaults. Skip if the username already exists.
3. Assign the 9 PSGs (`PermissionSetAssignment` via `PermissionSetGroupId`).
4. Assign the 49 PSLs (`PermissionSetLicenseAssign`). Any seat-exhausted PSL is
   reported, not fatal.
5. Add to `WebMessagingQueue` and to the `Demo_Users` public group
   (`GroupMember`).
6. Set the shared demo password (`System.setPassword`) to `DEMO_USER_PASSWORD`
   (default `salesforce1`).
7. Print a summary (created/skipped/failed per grant) + the login username.

**Automation-friendly interface** so the Slack workflow can drive it later
(first/last/email in → user provisioned).

### 4.4 Central management workflows (day-to-day)

- **New permission access for everyone:** add the PS to `Demo_Standard_Access`
  (one action) → automatic for all demo users.
- **New license for everyone:** add its developer name to the manifest, run
  `sync_demo_users.sh` → assigns any missing PSL to every member of `Demo_Users`.
- **Retire a user:** `deactivate_demo_user.sh <username>` sets `IsActive = false`,
  freeing the base seat and PSL seats.
- **Enumerate demo users:** all are members of the `Demo_Users` public group.

## 5. Components & repo layout

New `DemoUserProvisioning/` folder in the JDO repo:

```
DemoUserProvisioning/
  README.md                     # usage, conventions, how central mgmt works
  template.json                 # the manifest (§4.2)
  scripts/
    provision_demo_user.sh      # wrapper → sf apex run
    sync_demo_users.sh          # license re-sync across Demo_Users
    deactivate_demo_user.sh
  apex/
    ProvisionDemoUser.apex       # anonymous-Apex provisioning logic
    SyncDemoUsers.apex
  metadata/                      # deployable Demo_Standard_Access PSG + Demo_Users group
```

- `Demo_Standard_Access` PSG and `Demo_Users` public group are captured as
  deployable metadata so the backbone is reproducible / reviewable.
- Password value lives in a git-ignored local config or is passed as an env var
  at run time.

## 6. Security & correctness considerations

- **No secret in git:** shared demo password supplied at runtime; `.gitignore`
  the local config.
- **Idempotency:** every assignment checks for existing before insert; safe to
  re-run.
- **Blast radius:** the tool only creates and assigns; it never deletes access.
  Deactivation is a separate, explicit script.
- **License seats:** base license has ample headroom; PSL failures are surfaced
  per-user rather than aborting the run.
- **Role hierarchy:** many users sharing the `Central Sales` role is supported and
  expected.
- **PSG dedup:** when building `Demo_Standard_Access`, exclude permission sets
  already delivered by the 8 existing PSGs to avoid redundant membership.

## 7. Non-goals (YAGNI)

- No SSO/federation wiring for demo users.
- No self-service in-org Flow yet (possible future add-on on top of this backbone).
- No automated Slack-workflow → provisioning integration in this iteration (the
  tool is built to be callable by it later).
- No curation/trimming of Sarah's access in this iteration (exact clone).

## 8. Testing / validation

- Provision one throwaway user end-to-end; verify it has the same 9 PSGs, 49
  PSLs, queue, role, profile as Sarah (diff query against Sarah).
- Log in as the new user with the shared password; confirm no session collision
  with Sarah and that key demo surfaces load (cockpits, Agentforce, Data Cloud).
- Add a test permission set to `Demo_Standard_Access`; confirm it appears on an
  existing demo user with no re-run.
- Run `sync_demo_users.sh` after adding a PSL to the manifest; confirm it lands
  on existing users.
- Deactivate the throwaway user; confirm seat freed.

## 9. Open questions

_All resolved:_
- Shared password = `salesforce1` (env `DEMO_USER_PASSWORD`, default `salesforce1`).
- Username derived from the requester's Salesforce-email local part +
  `@finsdc3.demo`; `User.Email` = the requester's real Salesforce email.

## Appendix A — The 49 Permission Set Licenses (developer names)

Captured from Sarah on 2026-09-24; these are the exact `PermissionSetLicense`
developer names the manifest must carry:

`AgentPlatformBuilderPsl`, `AISearchUserPsl`, `BREDesigner`,
`CdpSegmentsActivationsCardPsl`, `DecisionExplainerPSL`, `DocumentChecklistPsl`,
`EinsteinAnalyticsPlusPsl`, `EinsteinAssistantPsl`, `EinsteinGPTCallExplorerPsl`,
`EinsteinGPTCopilotPsl`, `EinsteinGPTPromptTemplatesPsl`,
`EinsteinGPTSalesCallSummariesPsl`, `EinsteinGPTSalesEmailsPsl`,
`EinsteinGPTSalesMiningPsl`, `EinsteinGPTSalesSummariesPsl`,
`EinsteinGPTSendMeetingRequestPsl`, `EinsteinGPTServiceEmailAssistantPsl`,
`EinsteinSearchAnswersPsl`, `EnablementPsl`, `FinancialServicesCloudExtensionPsl`,
`FinServ_FinancialServicesCloudBasicPsl`,
`FinServ_FinancialServicesCloudStandardPsl`, `FinServ_FSCComprehensivePackagePsl`,
`FSCComprehensivePsl`, `FSCFoundationsPsl`, `FSCInsurancePsl`,
`FSCInsuranceRecordSummaryPsl`, `FSCSalesEinsteinPsl`, `FSCSalesPsl`,
`FSCServiceEinsteinPsl`, `FSCServicePsl`, `GenerativeAISummarizationPsl`,
`GenieDataPlatformStarterPsl`, `GlobalPromotionsManagementPsl`,
`IndustriesServiceExcellencePsl`, `InsightsBuilderPsl`, `InsightsFSCAnalyticsPsl`,
`LoyaltyManagementPsl`, `MortgagePsl`, `OmniStudioDesigner`, `OmniStudioRuntime`,
`PersonalizedFinancialEngagementPsl`, `ScoringFrameworkPsl`, `ServiceProcessPsl`,
`ServiceUserPsl`, `SlackServiceUserPsl`, `TableauBusinessUserPsl`,
`TableauEinsteinUserPsl`, `WalkthroughsPsl`.

