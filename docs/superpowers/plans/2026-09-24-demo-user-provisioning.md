# Demo User Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a repeatable, centrally-managed way to provision demo users in the `finsdc3.demo` org that each carry the same access as `sarah.smith@finsdc3.demo`, with a single lever to grant new access to all of them.

**Architecture:** A new Permission Set Group `Demo_Standard_Access` bundles Sarah's 27 standalone permission sets; combined with her 8 existing PSGs it defines "standard demo access" (9 PSGs). A version-controlled manifest plus an idempotent anonymous-Apex provisioning script (driven by shell wrappers) stamps profile, role, the 9 PSGs, 49 permission-set licenses, the `WebMessagingQueue`, and a `Demo_Users` public group onto each new user, and sets a shared password. Adding a permission set to `Demo_Standard_Access` later propagates to all demo users automatically; licenses re-sync via a script.

**Tech Stack:** Salesforce CLI (`sf`), Salesforce Metadata API (PermissionSetGroup, Group), anonymous Apex (`sf apex run`), Bash. Target org alias: `jdo-oe0sdd`.

**Spec:** `docs/superpowers/specs/2026-09-24-demo-user-provisioning-design.md`

## Global Constraints

- Target org alias (all `sf` commands): `jdo-oe0sdd` (`sarah.smith` is `005am000006ffBpAAI`).
- Username pattern: `<localpart-of-requester-SF-email>@finsdc3.demo`. `User.Email` = the requester's real Salesforce email.
- Shared password: env `DEMO_USER_PASSWORD`, default `salesforce1`.
- Profile: `Standard User`. Role: `Central Sales`. Queue: `WebMessagingQueue`. Public group: `Demo_Users`.
- User defaults: `TimeZoneSidKey=America/New_York`, `LocaleSidKey=en_US`, `LanguageLocaleKey=en_US`, `EmailEncodingKey=UTF-8`.
- All provisioning operations are **idempotent** (check-before-insert) and **create/assign only** — never delete access.
- No secrets other than the documented shared demo password; nothing sensitive committed.
- The 9 PSG developer names: `Demo_Standard_Access`, `Access_Ai_Search`, `Agentforce_Main`, `CopilotSalesforceUserPSG`, `Data_Cloud_Data_Access`, `FINS_Banking_Base_Lvl2`, `FINS_Financial_Service_Cloud_Base`, `FSC_Base_Permset_Group`, `QBrix_Demo_FINS_Retail_Banking_Starter_Group`.
- The 27 standalone permission set API names (members of `Demo_Standard_Access`): `Access`, `Access_Agentforce_Default_Agent_PS`, `Advisor`, `AgentCreator`, `CumulusOfferTilesAccess`, `Data_Cloud_Standard_User_Augmentation`, `DC_AgentForce_Output_User`, `DC_GA4_EC_PermissionSet`, `DC_Goals_Cockpit_User`, `DC_Multiclass_Prediction_User`, `DC_Prediction_Model_User`, `DC_Query_to_Table_User`, `FINS_Banking_Base`, `FINS_Base`, `FINS_Commercial_Banking_Sales`, `Offer_Objects_Access`, `PersonalBanker`, `SDO_Platform_Components`, `SDO_Platform_Email_Template_Builder`, `SDO_Platform_Files_Connect`, `SDO_Platform_Flow_User`, `SDO_Slack_Service_Swarming_User`, `Slack_Standard_User`, `Standard_User_Augment`, `Use_Flow_Automation_Agent`, `View_Flows`, `xDO_Service_Knowledge_Access`.
- The 49 permission-set-license developer names: `AgentPlatformBuilderPsl`, `AISearchUserPsl`, `BREDesigner`, `CdpSegmentsActivationsCardPsl`, `DecisionExplainerPSL`, `DocumentChecklistPsl`, `EinsteinAnalyticsPlusPsl`, `EinsteinAssistantPsl`, `EinsteinGPTCallExplorerPsl`, `EinsteinGPTCopilotPsl`, `EinsteinGPTPromptTemplatesPsl`, `EinsteinGPTSalesCallSummariesPsl`, `EinsteinGPTSalesEmailsPsl`, `EinsteinGPTSalesMiningPsl`, `EinsteinGPTSalesSummariesPsl`, `EinsteinGPTSendMeetingRequestPsl`, `EinsteinGPTServiceEmailAssistantPsl`, `EinsteinSearchAnswersPsl`, `EnablementPsl`, `FinancialServicesCloudExtensionPsl`, `FinServ_FinancialServicesCloudBasicPsl`, `FinServ_FinancialServicesCloudStandardPsl`, `FinServ_FSCComprehensivePackagePsl`, `FSCComprehensivePsl`, `FSCFoundationsPsl`, `FSCInsurancePsl`, `FSCInsuranceRecordSummaryPsl`, `FSCSalesEinsteinPsl`, `FSCSalesPsl`, `FSCServiceEinsteinPsl`, `FSCServicePsl`, `GenerativeAISummarizationPsl`, `GenieDataPlatformStarterPsl`, `GlobalPromotionsManagementPsl`, `IndustriesServiceExcellencePsl`, `InsightsBuilderPsl`, `InsightsFSCAnalyticsPsl`, `LoyaltyManagementPsl`, `MortgagePsl`, `OmniStudioDesigner`, `OmniStudioRuntime`, `PersonalizedFinancialEngagementPsl`, `ScoringFrameworkPsl`, `ServiceProcessPsl`, `ServiceUserPsl`, `SlackServiceUserPsl`, `TableauBusinessUserPsl`, `TableauEinsteinUserPsl`, `WalkthroughsPsl`.

---

## File Structure

```
DemoUserProvisioning/
  README.md
  sfdx-project.json
  template.json
  force-app/main/default/
    permissionsetgroups/Demo_Standard_Access.permissionsetgroup-meta.xml
    groups/Demo_Users.group-meta.xml
  apex/
    ProvisionDemoUser.apex        # template with {{EMAIL}} / {{PASSWORD}} tokens
    SyncDemoUsers.apex
    DeactivateDemoUser.apex       # template with {{USERNAME}} token
  scripts/
    provision_demo_user.sh
    sync_demo_users.sh
    deactivate_demo_user.sh
```

- `permissionsetgroups/` + `groups/` are the deployable backbone.
- `apex/` holds the logic; `scripts/` are thin wrappers that token-substitute and call `sf apex run`.
- `template.json` is the human-readable source of truth (documentation + used by `sync_demo_users.sh`).

---

### Task 1: Create the `Demo_Standard_Access` Permission Set Group (metadata)

**Files:**
- Create: `DemoUserProvisioning/sfdx-project.json`
- Create: `DemoUserProvisioning/force-app/main/default/permissionsetgroups/Demo_Standard_Access.permissionsetgroup-meta.xml`

**Interfaces:**
- Produces: a Permission Set Group with `DeveloperName = Demo_Standard_Access` containing the 27 standalone permission sets. Later tasks assign it by `PermissionSetGroupId`.

- [ ] **Step 1: Create the sfdx project descriptor**

Create `DemoUserProvisioning/sfdx-project.json`:

```json
{
  "packageDirectories": [{ "path": "force-app", "default": true }],
  "sourceApiVersion": "62.0"
}
```

- [ ] **Step 2: Create the PSG metadata file**

Create `DemoUserProvisioning/force-app/main/default/permissionsetgroups/Demo_Standard_Access.permissionsetgroup-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSetGroup xmlns="http://soap.sforce.com/2006/04/metadata">
    <description>Bundles the standalone permission sets that make up standard demo user access (cloned from sarah.smith). Add a permission set here to grant it to every demo user automatically.</description>
    <hasActivationRequired>false</hasActivationRequired>
    <label>Demo Standard Access</label>
    <permissionSets>Access</permissionSets>
    <permissionSets>Access_Agentforce_Default_Agent_PS</permissionSets>
    <permissionSets>FinServ__Advisor</permissionSets>
    <permissionSets>agentcreator__AgentCreator</permissionSets>
    <permissionSets>CumulusOfferTilesAccess</permissionSets>
    <permissionSets>Data_Cloud_Standard_User_Augmentation</permissionSets>
    <permissionSets>DC_AgentForce_Output_User</permissionSets>
    <permissionSets>DC_GA4_EC_PermissionSet</permissionSets>
    <permissionSets>DC_Goals_Cockpit_User</permissionSets>
    <permissionSets>DC_Multiclass_Prediction_User</permissionSets>
    <permissionSets>DC_Prediction_Model_User</permissionSets>
    <permissionSets>DC_Query_to_Table_User</permissionSets>
    <permissionSets>FINS_Banking_Base</permissionSets>
    <permissionSets>FINS_Base</permissionSets>
    <permissionSets>FINS_Commercial_Banking_Sales</permissionSets>
    <permissionSets>Offer_Objects_Access</permissionSets>
    <permissionSets>FinServ__PersonalBanker</permissionSets>
    <permissionSets>SDO_Platform_Components</permissionSets>
    <permissionSets>SDO_Platform_Email_Template_Builder</permissionSets>
    <permissionSets>SDO_Platform_Files_Connect</permissionSets>
    <permissionSets>SDO_Platform_Flow_User</permissionSets>
    <permissionSets>SDO_Slack_Service_Swarming_User</permissionSets>
    <permissionSets>slackv2__Slack_Standard_User</permissionSets>
    <permissionSets>Standard_User_Augment</permissionSets>
    <permissionSets>Use_Flow_Automation_Agent</permissionSets>
    <permissionSets>View_Flows</permissionSets>
    <permissionSets>xDO_Service_Knowledge_Access</permissionSets>
</PermissionSetGroup>
```

- [ ] **Step 3: Deploy the PSG**

Run (from `DemoUserProvisioning/`):
```bash
sf project deploy start -d force-app/main/default/permissionsetgroups -o jdo-oe0sdd
```
Expected: `Status: Succeeded`. (If any `<permissionSets>` name is rejected as not found, that permission set was renamed in-org — reconcile the name against the Global Constraints list before re-deploying.)

- [ ] **Step 4: Verify the PSG exists and recalculated**

Run:
```bash
sf data query -o jdo-oe0sdd -q "SELECT Id, DeveloperName, Status FROM PermissionSetGroup WHERE DeveloperName = 'Demo_Standard_Access'"
```
Expected: one row; `Status` is `Updated` or `Updating` (wait until `Updated` before assigning in Task 4). Confirm member count:
```bash
sf data query -o jdo-oe0sdd -q "SELECT COUNT(Id) c FROM PermissionSetGroupComponent WHERE PermissionSetGroup.DeveloperName = 'Demo_Standard_Access'"
```
Expected: 27.

- [ ] **Step 5: Commit**

```bash
git add DemoUserProvisioning/sfdx-project.json DemoUserProvisioning/force-app/main/default/permissionsetgroups/Demo_Standard_Access.permissionsetgroup-meta.xml
git commit -m "feat(demo-provisioning): add Demo_Standard_Access permission set group"
```

---

### Task 2: Create the `Demo_Users` public group (metadata)

**Files:**
- Create: `DemoUserProvisioning/force-app/main/default/groups/Demo_Users.group-meta.xml`

**Interfaces:**
- Produces: a public group `DeveloperName = Demo_Users` used to enumerate demo users and to target license re-syncs.

- [ ] **Step 1: Create the group metadata file**

Create `DemoUserProvisioning/force-app/main/default/groups/Demo_Users.group-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Group xmlns="http://soap.sforce.com/2006/04/metadata">
    <doesIncludeBosses>false</doesIncludeBosses>
    <name>Demo Users</name>
</Group>
```

- [ ] **Step 2: Deploy the group**

Run (from `DemoUserProvisioning/`):
```bash
sf project deploy start -d force-app/main/default/groups -o jdo-oe0sdd
```
Expected: `Status: Succeeded`.

- [ ] **Step 3: Verify**

Run:
```bash
sf data query -o jdo-oe0sdd -q "SELECT Id, DeveloperName, Type FROM Group WHERE DeveloperName = 'Demo_Users'"
```
Expected: one row, `Type = Regular`.

- [ ] **Step 4: Commit**

```bash
git add DemoUserProvisioning/force-app/main/default/groups/Demo_Users.group-meta.xml
git commit -m "feat(demo-provisioning): add Demo_Users public group"
```

---

### Task 3: Write the provisioning manifest

**Files:**
- Create: `DemoUserProvisioning/template.json`

**Interfaces:**
- Produces: `template.json` — the documented source of truth; `sync_demo_users.sh` (Task 6) reads `permissionSetLicenses` from it.

- [ ] **Step 1: Create the manifest**

Create `DemoUserProvisioning/template.json` (the two long arrays are copied verbatim from Global Constraints):

```json
{
  "org": "jdo-oe0sdd",
  "usernameDomain": "finsdc3.demo",
  "profile": "Standard User",
  "role": "Central Sales",
  "queues": ["WebMessagingQueue"],
  "publicGroups": ["Demo_Users"],
  "userDefaults": {
    "TimeZoneSidKey": "America/New_York",
    "LocaleSidKey": "en_US",
    "LanguageLocaleKey": "en_US",
    "EmailEncodingKey": "UTF-8"
  },
  "permissionSetGroups": [
    "Demo_Standard_Access", "Access_Ai_Search", "Agentforce_Main",
    "CopilotSalesforceUserPSG", "Data_Cloud_Data_Access",
    "FINS_Banking_Base_Lvl2", "FINS_Financial_Service_Cloud_Base",
    "FSC_Base_Permset_Group", "QBrix_Demo_FINS_Retail_Banking_Starter_Group"
  ],
  "permissionSetLicenses": [
    "AgentPlatformBuilderPsl", "AISearchUserPsl", "BREDesigner",
    "CdpSegmentsActivationsCardPsl", "DecisionExplainerPSL", "DocumentChecklistPsl",
    "EinsteinAnalyticsPlusPsl", "EinsteinAssistantPsl", "EinsteinGPTCallExplorerPsl",
    "EinsteinGPTCopilotPsl", "EinsteinGPTPromptTemplatesPsl",
    "EinsteinGPTSalesCallSummariesPsl", "EinsteinGPTSalesEmailsPsl",
    "EinsteinGPTSalesMiningPsl", "EinsteinGPTSalesSummariesPsl",
    "EinsteinGPTSendMeetingRequestPsl", "EinsteinGPTServiceEmailAssistantPsl",
    "EinsteinSearchAnswersPsl", "EnablementPsl", "FinancialServicesCloudExtensionPsl",
    "FinServ_FinancialServicesCloudBasicPsl", "FinServ_FinancialServicesCloudStandardPsl",
    "FinServ_FSCComprehensivePackagePsl", "FSCComprehensivePsl", "FSCFoundationsPsl",
    "FSCInsurancePsl", "FSCInsuranceRecordSummaryPsl", "FSCSalesEinsteinPsl",
    "FSCSalesPsl", "FSCServiceEinsteinPsl", "FSCServicePsl",
    "GenerativeAISummarizationPsl", "GenieDataPlatformStarterPsl",
    "GlobalPromotionsManagementPsl", "IndustriesServiceExcellencePsl",
    "InsightsBuilderPsl", "InsightsFSCAnalyticsPsl", "LoyaltyManagementPsl",
    "MortgagePsl", "OmniStudioDesigner", "OmniStudioRuntime",
    "PersonalizedFinancialEngagementPsl", "ScoringFrameworkPsl", "ServiceProcessPsl",
    "ServiceUserPsl", "SlackServiceUserPsl", "TableauBusinessUserPsl",
    "TableauEinsteinUserPsl", "WalkthroughsPsl"
  ]
}
```

- [ ] **Step 2: Validate JSON**

Run: `python3 -m json.tool DemoUserProvisioning/template.json > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add DemoUserProvisioning/template.json
git commit -m "feat(demo-provisioning): add provisioning manifest"
```

---

### Task 4: Write the provisioning Apex + wrapper and provision a test user

**Files:**
- Create: `DemoUserProvisioning/apex/ProvisionDemoUser.apex`
- Create: `DemoUserProvisioning/scripts/provision_demo_user.sh`

**Interfaces:**
- Consumes: `Demo_Standard_Access` PSG (Task 1), `Demo_Users` group (Task 2), the 9 PSG names + 49 PSL names (Global Constraints).
- Produces: `provision_demo_user.sh <requester-salesforce-email>` → a User `<localpart>@finsdc3.demo` with the full grant set. Prints a per-item summary.

- [ ] **Step 1: Write the Apex template**

Create `DemoUserProvisioning/apex/ProvisionDemoUser.apex`. `{{EMAIL}}` and `{{PASSWORD}}` are substituted by the wrapper. All inserts are idempotent and partial-success (`Database.insert(list, false)`).

```apex
String sfEmail = '{{EMAIL}}';
String pwd = '{{PASSWORD}}';
String localPart = sfEmail.substringBefore('@');
String username = localPart + '@finsdc3.demo';

Set<String> PSG_NAMES = new Set<String>{
  'Demo_Standard_Access','Access_Ai_Search','Agentforce_Main','CopilotSalesforceUserPSG',
  'Data_Cloud_Data_Access','FINS_Banking_Base_Lvl2','FINS_Financial_Service_Cloud_Base',
  'FSC_Base_Permset_Group','QBrix_Demo_FINS_Retail_Banking_Starter_Group'
};
Set<String> PSL_NAMES = new Set<String>{
  'AgentPlatformBuilderPsl','AISearchUserPsl','BREDesigner','CdpSegmentsActivationsCardPsl',
  'DecisionExplainerPSL','DocumentChecklistPsl','EinsteinAnalyticsPlusPsl','EinsteinAssistantPsl',
  'EinsteinGPTCallExplorerPsl','EinsteinGPTCopilotPsl','EinsteinGPTPromptTemplatesPsl',
  'EinsteinGPTSalesCallSummariesPsl','EinsteinGPTSalesEmailsPsl','EinsteinGPTSalesMiningPsl',
  'EinsteinGPTSalesSummariesPsl','EinsteinGPTSendMeetingRequestPsl','EinsteinGPTServiceEmailAssistantPsl',
  'EinsteinSearchAnswersPsl','EnablementPsl','FinancialServicesCloudExtensionPsl',
  'FinServ_FinancialServicesCloudBasicPsl','FinServ_FinancialServicesCloudStandardPsl',
  'FinServ_FSCComprehensivePackagePsl','FSCComprehensivePsl','FSCFoundationsPsl','FSCInsurancePsl',
  'FSCInsuranceRecordSummaryPsl','FSCSalesEinsteinPsl','FSCSalesPsl','FSCServiceEinsteinPsl',
  'FSCServicePsl','GenerativeAISummarizationPsl','GenieDataPlatformStarterPsl',
  'GlobalPromotionsManagementPsl','IndustriesServiceExcellencePsl','InsightsBuilderPsl',
  'InsightsFSCAnalyticsPsl','LoyaltyManagementPsl','MortgagePsl','OmniStudioDesigner',
  'OmniStudioRuntime','PersonalizedFinancialEngagementPsl','ScoringFrameworkPsl','ServiceProcessPsl',
  'ServiceUserPsl','SlackServiceUserPsl','TableauBusinessUserPsl','TableauEinsteinUserPsl','WalkthroughsPsl'
};

// 1) Ensure user
Id userId;
List<User> existing = [SELECT Id FROM User WHERE Username = :username LIMIT 1];
if (!existing.isEmpty()) {
  userId = existing[0].Id;
  System.debug('USER EXISTS: ' + username);
} else {
  Id profileId = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1].Id;
  Id roleId = [SELECT Id FROM UserRole WHERE Name = 'Central Sales' LIMIT 1].Id;
  String alias = localPart.replaceAll('[^a-zA-Z0-9]', '');
  if (alias.length() > 8) alias = alias.substring(0, 8);
  String firstName = localPart.contains('.') ? localPart.substringBefore('.') : localPart;
  String lastName  = localPart.contains('.') ? localPart.substringAfter('.')  : localPart;
  User u = new User(
    Username = username, Email = sfEmail, FirstName = firstName, LastName = lastName,
    Alias = alias, ProfileId = profileId, UserRoleId = roleId,
    TimeZoneSidKey = 'America/New_York', LocaleSidKey = 'en_US',
    LanguageLocaleKey = 'en_US', EmailEncodingKey = 'UTF-8'
  );
  insert u;
  userId = u.Id;
  System.setPassword(userId, pwd);
  System.debug('USER CREATED: ' + username + ' / ' + userId);
}

// 2) Permission Set Groups (skip already-assigned)
Set<Id> assignedPsgIds = new Set<Id>();
for (PermissionSetAssignment pa : [SELECT PermissionSetGroupId FROM PermissionSetAssignment
     WHERE AssigneeId = :userId AND PermissionSetGroupId != null]) {
  assignedPsgIds.add(pa.PermissionSetGroupId);
}
List<PermissionSetAssignment> psaIns = new List<PermissionSetAssignment>();
for (PermissionSetGroup g : [SELECT Id, DeveloperName FROM PermissionSetGroup WHERE DeveloperName IN :PSG_NAMES]) {
  if (!assignedPsgIds.contains(g.Id)) psaIns.add(new PermissionSetAssignment(AssigneeId = userId, PermissionSetGroupId = g.Id));
}
for (Database.SaveResult r : Database.insert(psaIns, false)) {
  if (!r.isSuccess()) System.debug('PSG FAIL: ' + r.getErrors()[0].getMessage());
}
System.debug('PSG assigned this run: ' + psaIns.size());

// 3) Permission Set Licenses (skip already-assigned; report seat failures)
Set<Id> assignedPslIds = new Set<Id>();
for (PermissionSetLicenseAssign a : [SELECT PermissionSetLicenseId FROM PermissionSetLicenseAssign WHERE AssigneeId = :userId]) {
  assignedPslIds.add(a.PermissionSetLicenseId);
}
List<PermissionSetLicenseAssign> pslaIns = new List<PermissionSetLicenseAssign>();
for (PermissionSetLicense l : [SELECT Id, DeveloperName FROM PermissionSetLicense WHERE DeveloperName IN :PSL_NAMES]) {
  if (!assignedPslIds.contains(l.Id)) pslaIns.add(new PermissionSetLicenseAssign(AssigneeId = userId, PermissionSetLicenseId = l.Id));
}
Integer pslOk = 0;
for (Database.SaveResult r : Database.insert(pslaIns, false)) {
  if (r.isSuccess()) pslOk++; else System.debug('PSL FAIL: ' + r.getErrors()[0].getMessage());
}
System.debug('PSL assigned this run: ' + pslOk + '/' + pslaIns.size());

// 4) Queue + public group membership
Map<String, Id> grpByDev = new Map<String, Id>();
for (Group g : [SELECT Id, DeveloperName FROM Group WHERE DeveloperName IN ('WebMessagingQueue','Demo_Users')]) {
  grpByDev.put(g.DeveloperName, g.Id);
}
Set<Id> memberOf = new Set<Id>();
for (GroupMember m : [SELECT GroupId FROM GroupMember WHERE UserOrGroupId = :userId]) memberOf.add(m.GroupId);
List<GroupMember> gmIns = new List<GroupMember>();
for (String dev : grpByDev.keySet()) {
  if (!memberOf.contains(grpByDev.get(dev))) gmIns.add(new GroupMember(GroupId = grpByDev.get(dev), UserOrGroupId = userId));
}
for (Database.SaveResult r : Database.insert(gmIns, false)) {
  if (!r.isSuccess()) System.debug('GROUP FAIL: ' + r.getErrors()[0].getMessage());
}
System.debug('DONE: ' + username);
```

- [ ] **Step 2: Write the wrapper script**

Create `DemoUserProvisioning/scripts/provision_demo_user.sh` (mark executable):

```bash
#!/usr/bin/env bash
set -euo pipefail
# Usage: provision_demo_user.sh <requester-salesforce-email>
EMAIL="${1:?Usage: provision_demo_user.sh <requester-salesforce-email>}"
PASSWORD="${DEMO_USER_PASSWORD:-salesforce1}"
ORG="jdo-oe0sdd"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -t provision.XXXXXX.apex)"
trap 'rm -f "$TMP"' EXIT
sed -e "s|{{EMAIL}}|${EMAIL}|g" -e "s|{{PASSWORD}}|${PASSWORD}|g" \
    "$DIR/apex/ProvisionDemoUser.apex" > "$TMP"
sf apex run -o "$ORG" -f "$TMP"
```

- [ ] **Step 3: Make it executable**

Run: `chmod +x DemoUserProvisioning/scripts/provision_demo_user.sh`

- [ ] **Step 4: Provision a throwaway test user**

Run: `DemoUserProvisioning/scripts/provision_demo_user.sh qa.demotest@salesforce.com`
Expected: `Compiled successfully` / `Executed successfully`; debug log shows `USER CREATED: qa.demotest@finsdc3.demo`, `PSG assigned this run: 9`, `PSL assigned this run: N/49` (N up to 49; any shortfall printed as `PSL FAIL: ...` for seat exhaustion), `DONE`.

- [ ] **Step 5: Commit**

```bash
git add DemoUserProvisioning/apex/ProvisionDemoUser.apex DemoUserProvisioning/scripts/provision_demo_user.sh
git commit -m "feat(demo-provisioning): add provisioning apex + wrapper"
```

---

### Task 5: Verify the test user matches Sarah (diff) and can log in

**Files:** none (verification only).

**Interfaces:**
- Consumes: the `qa.demotest@finsdc3.demo` user from Task 4.

- [ ] **Step 1: Diff PSG assignments vs Sarah**

Run:
```bash
sf data query -o jdo-oe0sdd -q "SELECT Assignee.Username, PermissionSetGroup.DeveloperName FROM PermissionSetAssignment WHERE PermissionSetGroupId != null AND Assignee.Username IN ('sarah.smith@finsdc3.demo','qa.demotest@finsdc3.demo') ORDER BY PermissionSetGroup.DeveloperName"
```
Expected: Sarah has her 8 PSGs; the test user has the same 8 **plus** `Demo_Standard_Access` (9). The `Demo_Standard_Access` PSG's 27 member permission sets cover Sarah's 27 standalone assignments, so effective access matches.

- [ ] **Step 2: Compare PSL counts**

Run:
```bash
sf data query -o jdo-oe0sdd -q "SELECT Assignee.Username usr, COUNT(Id) c FROM PermissionSetLicenseAssign WHERE Assignee.Username IN ('sarah.smith@finsdc3.demo','qa.demotest@finsdc3.demo') GROUP BY Assignee.Username"
```
Expected: both ~49 (test user may be lower only if a PSL hit a seat cap — reconcile any gap against the `PSL FAIL` lines from Task 4).

- [ ] **Step 3: Confirm queue + group membership**

Run:
```bash
sf data query -o jdo-oe0sdd -q "SELECT Group.DeveloperName FROM GroupMember WHERE UserOrGroup.Username = 'qa.demotest@finsdc3.demo'"
```
Expected: `WebMessagingQueue` and `Demo_Users`.

- [ ] **Step 4: Manual login check**

In a private browser window, log in at `https://storm-16a17dc388fbe6.demo.my.salesforce.com/` as `qa.demotest@finsdc3.demo` / `salesforce1` (or `$DEMO_USER_PASSWORD`). Confirm login succeeds, no session collision with Sarah, and a key demo surface loads (e.g., a cockpit / Agentforce panel). Record result in the task notes.

- [ ] **Step 5: No commit (verification task).** If diffs reveal a gap, fix the offending task (PSG membership or manifest) and re-run before proceeding.

---

### Task 6: Write the license re-sync script (central "add a license to everyone")

**Files:**
- Create: `DemoUserProvisioning/apex/SyncDemoUsers.apex`
- Create: `DemoUserProvisioning/scripts/sync_demo_users.sh`

**Interfaces:**
- Consumes: `Demo_Users` group; the PSL names (Global Constraints / manifest).
- Produces: `sync_demo_users.sh` → assigns any missing PSL (from the hardcoded set, kept in sync with `template.json`) to every active member of `Demo_Users`.

- [ ] **Step 1: Write the sync Apex**

Create `DemoUserProvisioning/apex/SyncDemoUsers.apex`. (The `PSL_NAMES` set is identical to Task 4 — repeated here in full so the file stands alone.)

```apex
Set<String> PSL_NAMES = new Set<String>{
  'AgentPlatformBuilderPsl','AISearchUserPsl','BREDesigner','CdpSegmentsActivationsCardPsl',
  'DecisionExplainerPSL','DocumentChecklistPsl','EinsteinAnalyticsPlusPsl','EinsteinAssistantPsl',
  'EinsteinGPTCallExplorerPsl','EinsteinGPTCopilotPsl','EinsteinGPTPromptTemplatesPsl',
  'EinsteinGPTSalesCallSummariesPsl','EinsteinGPTSalesEmailsPsl','EinsteinGPTSalesMiningPsl',
  'EinsteinGPTSalesSummariesPsl','EinsteinGPTSendMeetingRequestPsl','EinsteinGPTServiceEmailAssistantPsl',
  'EinsteinSearchAnswersPsl','EnablementPsl','FinancialServicesCloudExtensionPsl',
  'FinServ_FinancialServicesCloudBasicPsl','FinServ_FinancialServicesCloudStandardPsl',
  'FinServ_FSCComprehensivePackagePsl','FSCComprehensivePsl','FSCFoundationsPsl','FSCInsurancePsl',
  'FSCInsuranceRecordSummaryPsl','FSCSalesEinsteinPsl','FSCSalesPsl','FSCServiceEinsteinPsl',
  'FSCServicePsl','GenerativeAISummarizationPsl','GenieDataPlatformStarterPsl',
  'GlobalPromotionsManagementPsl','IndustriesServiceExcellencePsl','InsightsBuilderPsl',
  'InsightsFSCAnalyticsPsl','LoyaltyManagementPsl','MortgagePsl','OmniStudioDesigner',
  'OmniStudioRuntime','PersonalizedFinancialEngagementPsl','ScoringFrameworkPsl','ServiceProcessPsl',
  'ServiceUserPsl','SlackServiceUserPsl','TableauBusinessUserPsl','TableauEinsteinUserPsl','WalkthroughsPsl'
};

// members of Demo_Users
Set<Id> memberIds = new Set<Id>();
for (GroupMember m : [SELECT UserOrGroupId FROM GroupMember
     WHERE Group.DeveloperName = 'Demo_Users' AND UserOrGroupId IN (SELECT Id FROM User WHERE IsActive = true)]) {
  memberIds.add(m.UserOrGroupId);
}
Map<String, Id> pslByDev = new Map<String, Id>();
for (PermissionSetLicense l : [SELECT Id, DeveloperName FROM PermissionSetLicense WHERE DeveloperName IN :PSL_NAMES]) {
  pslByDev.put(l.DeveloperName, l.Id);
}
// existing assignments per member
Map<Id, Set<Id>> have = new Map<Id, Set<Id>>();
for (Id uid : memberIds) have.put(uid, new Set<Id>());
for (PermissionSetLicenseAssign a : [SELECT AssigneeId, PermissionSetLicenseId FROM PermissionSetLicenseAssign WHERE AssigneeId IN :memberIds]) {
  have.get(a.AssigneeId).add(a.PermissionSetLicenseId);
}
List<PermissionSetLicenseAssign> ins = new List<PermissionSetLicenseAssign>();
for (Id uid : memberIds) {
  for (Id pslId : pslByDev.values()) {
    if (!have.get(uid).contains(pslId)) ins.add(new PermissionSetLicenseAssign(AssigneeId = uid, PermissionSetLicenseId = pslId));
  }
}
Integer ok = 0;
for (Database.SaveResult r : Database.insert(ins, false)) {
  if (r.isSuccess()) ok++; else System.debug('SYNC FAIL: ' + r.getErrors()[0].getMessage());
}
System.debug('SYNC members=' + memberIds.size() + ' assigned=' + ok + '/' + ins.size());
```

- [ ] **Step 2: Write the wrapper**

Create `DemoUserProvisioning/scripts/sync_demo_users.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ORG="jdo-oe0sdd"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
sf apex run -o "$ORG" -f "$DIR/apex/SyncDemoUsers.apex"
```

- [ ] **Step 3: Make executable and dry-run**

Run:
```bash
chmod +x DemoUserProvisioning/scripts/sync_demo_users.sh
DemoUserProvisioning/scripts/sync_demo_users.sh
```
Expected: `Executed successfully`; debug shows `SYNC members=1 assigned=0/0` (the test user already has all PSLs, so nothing to add — proving idempotency).

- [ ] **Step 4: Commit**

```bash
git add DemoUserProvisioning/apex/SyncDemoUsers.apex DemoUserProvisioning/scripts/sync_demo_users.sh
git commit -m "feat(demo-provisioning): add license re-sync script"
```

---

### Task 7: Write the deactivate script

**Files:**
- Create: `DemoUserProvisioning/apex/DeactivateDemoUser.apex`
- Create: `DemoUserProvisioning/scripts/deactivate_demo_user.sh`

**Interfaces:**
- Produces: `deactivate_demo_user.sh <username>` → sets `IsActive = false`, freeing seats.

- [ ] **Step 1: Write the Apex template**

Create `DemoUserProvisioning/apex/DeactivateDemoUser.apex` (`{{USERNAME}}` substituted by wrapper):

```apex
String username = '{{USERNAME}}';
List<User> us = [SELECT Id, IsActive FROM User WHERE Username = :username LIMIT 1];
if (us.isEmpty()) { System.debug('NOT FOUND: ' + username); }
else if (!us[0].IsActive) { System.debug('ALREADY INACTIVE: ' + username); }
else { us[0].IsActive = false; update us[0]; System.debug('DEACTIVATED: ' + username); }
```

- [ ] **Step 2: Write the wrapper**

Create `DemoUserProvisioning/scripts/deactivate_demo_user.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
USERNAME="${1:?Usage: deactivate_demo_user.sh <username@finsdc3.demo>}"
ORG="jdo-oe0sdd"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -t deactivate.XXXXXX.apex)"
trap 'rm -f "$TMP"' EXIT
sed -e "s|{{USERNAME}}|${USERNAME}|g" "$DIR/apex/DeactivateDemoUser.apex" > "$TMP"
sf apex run -o "$ORG" -f "$TMP"
```

- [ ] **Step 3: Make executable and test on the throwaway user**

Run:
```bash
chmod +x DemoUserProvisioning/scripts/deactivate_demo_user.sh
DemoUserProvisioning/scripts/deactivate_demo_user.sh qa.demotest@finsdc3.demo
sf data query -o jdo-oe0sdd -q "SELECT IsActive FROM User WHERE Username = 'qa.demotest@finsdc3.demo'"
```
Expected: debug `DEACTIVATED: qa.demotest@finsdc3.demo`; query shows `IsActive = false`. (This removes the throwaway test user cleanly.)

- [ ] **Step 4: Commit**

```bash
git add DemoUserProvisioning/apex/DeactivateDemoUser.apex DemoUserProvisioning/scripts/deactivate_demo_user.sh
git commit -m "feat(demo-provisioning): add deactivate script"
```

---

### Task 8: README and finalize

**Files:**
- Create: `DemoUserProvisioning/README.md`

**Interfaces:**
- Produces: operator documentation.

- [ ] **Step 1: Write the README**

Create `DemoUserProvisioning/README.md`:

```markdown
# Demo User Provisioning (finsdc3.demo)

Central, repeatable provisioning of demo users cloned from `sarah.smith@finsdc3.demo`.
Org alias: `jdo-oe0sdd`. Spec: `../docs/superpowers/specs/2026-09-24-demo-user-provisioning-design.md`.

## Provision a user
    DEMO_USER_PASSWORD=salesforce1 scripts/provision_demo_user.sh jdoe@salesforce.com
Creates `jdoe@finsdc3.demo` (Standard User / Central Sales), assigns the 9 PSGs, 49
permission-set licenses, the WebMessagingQueue, and the Demo_Users group, and sets the
shared password. Idempotent — safe to re-run. Password defaults to `salesforce1`.

## Grant new access to ALL demo users
- **A permission set:** add it to the `Demo_Standard_Access` permission set group
  (edit `force-app/main/default/permissionsetgroups/Demo_Standard_Access.permissionsetgroup-meta.xml`,
  `sf project deploy start -d force-app/main/default/permissionsetgroups -o jdo-oe0sdd`).
  Propagates to every demo user automatically — no per-user step.
- **A permission-set license:** add its developer name to `template.json` **and** to the
  `PSL_NAMES` set in `apex/SyncDemoUsers.apex` and `apex/ProvisionDemoUser.apex`, then run
  `scripts/sync_demo_users.sh` to backfill existing users.

## Retire a user
    scripts/deactivate_demo_user.sh jdoe@finsdc3.demo

## List demo users
    sf data query -o jdo-oe0sdd -q "SELECT Name, Username, IsActive FROM User WHERE Id IN (SELECT UserOrGroupId FROM GroupMember WHERE Group.DeveloperName = 'Demo_Users')"

## Notes
- Login is username + password (not SSO). New users do not reuse Sarah's FederationIdentifier.
- The shared password is a low-sensitivity demo credential; override per run with `DEMO_USER_PASSWORD`.
- Base Salesforce license had 458 free seats as of 2026-09-24.
```

- [ ] **Step 2: Commit**

```bash
git add DemoUserProvisioning/README.md
git commit -m "docs(demo-provisioning): add README"
```

---

## Notes on known Salesforce gotchas (read before executing)

- **PSG recalculation:** a freshly deployed PSG shows `Status = Updating`; wait for `Updated` (Task 1 Step 4) before assigning it, or assignment may not reflect all member permissions immediately.
- **MIXED_DML:** `User`, `PermissionSetAssignment`, `PermissionSetLicenseAssign`, and `GroupMember` are all setup objects, so inserting them in one anonymous-Apex transaction is allowed. If a `MIXED_DML_OPERATION` error ever appears, split the Apex: run the user-creation block first, then re-run the script (idempotent) to do the assignments.
- **`System.setPassword` permission:** the running (admin) user needs "Manage Users"/"Reset User Passwords". If it errors, set the password manually in Setup or via `sf`.
- **PSL seat limits:** individual `PSL FAIL` lines mean that license is out of seats; that's expected to be rare in this org and is surfaced, not fatal.
- **PSG assignment field:** assigning by `PermissionSetGroupId` alone is used here. If the org rejects it demanding `PermissionSetId`, query the group's owning permission set (`SELECT Id FROM PermissionSet WHERE PermissionSetGroupId = :g.Id`) and set both.
