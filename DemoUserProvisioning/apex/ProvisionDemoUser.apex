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

// 2) Permission Set Licenses FIRST (a license-gated PSG assignment fails if the license isn't present yet)
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

// 3) Permission Set Groups (skip already-assigned; requires the licenses above)
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
