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
