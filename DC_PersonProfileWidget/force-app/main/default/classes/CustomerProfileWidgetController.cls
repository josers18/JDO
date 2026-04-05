/**
 * Profile assembly Flow (optional) + CRM SOQL fallback + optional prediction Flow + Einstein summary for customerProfileWidget LWC.
 * Assembly outputs are read from Flow output variables (assignments, formulas, Get Records, etc.).
 */
public with sharing class CustomerProfileWidgetController {
    private static final String CLOSING_PHRASE = 'Thank you for your attention to this comprehensive review';

    /** Logical keys allowed in coreCustomFieldsJson (maps widget slot → Account/Contact field API name). */
    private static final Set<String> CORE_CUSTOM_LOGICAL_KEYS = new Set<String>{
        'tierSegment',
        'investmentBalance',
        'loanBalance',
        'loanLimit',
        'depositYtd',
        'propensityScore',
        'engagementScore',
        'churnScore',
        'ltvScore',
        'crossSellScore',
        'savingsRate',
        'riskProfile',
        'customerSince',
        'lastInteractionDate',
        'mobileEnrolled',
        'onlineEnrolled',
        'kycStatus',
        'twoFaStatus',
        'paperlessEnrolled',
        'alertsEnrolled',
        'wireEnabled',
        'profilePhotoUrl',
        'lastUsedChannel'
    };

    /** Logical keys allowed in profileFlowOutputMapJson (widget slot → Flow output variable API name). */
    private static final Set<String> PROFILE_ASSEMBLY_OUTPUT_KEYS = new Set<String>{
        'fullName',
        'firstName',
        'lastName',
        'city',
        'state',
        'industry',
        'employees',
        'phone',
        'email',
        'website',
        'lastUsedChannel',
        'revenue',
        'tierSegment',
        'propensityScore',
        'engagementScore',
        'churnScore',
        'ltvScore',
        'crossSellScore',
        'savingsRate',
        'investmentBalance',
        'loanBalance',
        'depositYtd',
        'loanLimit',
        'riskProfile',
        'customerSince',
        'lastInteraction',
        'mobileEnrolled',
        'onlineEnrolled',
        'kycStatus',
        'twoFaStatus',
        'paperlessEnrolled',
        'alertsEnrolled',
        'wireEnabled',
        'street',
        'zip',
        'assignedBranch',
        'branchDistance',
        'assignedBranchAddress',
        'assignedBranchHours',
        'assignedBranchStatus',
        'nearbyBranches',
        'financialAccounts',
        'mapLatitude',
        'mapLongitude',
        'profilePhotoUrl'
    };

    public class FinancialAccountInfo {
        @AuraEnabled
        public String type;
        /** Masked or last-four display (e.g. •••• 4821). */
        @AuraEnabled
        public String accountNumber;
        @AuraEnabled
        public Decimal balance;
        @AuraEnabled
        public String delta;
        @AuraEnabled
        public Boolean deltaPositive;
    }

    public class BranchInfo {
        @AuraEnabled
        public String name;
        @AuraEnabled
        public String distance;
        @AuraEnabled
        public String address;
        @AuraEnabled
        public String hours;
        @AuraEnabled
        public String status;
        @AuraEnabled
        public Boolean assigned;
    }

    public class ProfileResult {
        @AuraEnabled
        public String fullName;
        @AuraEnabled
        public String city;
        @AuraEnabled
        public String state;
        @AuraEnabled
        public String industry;
        @AuraEnabled
        public Integer employees;
        @AuraEnabled
        public String phone;
        @AuraEnabled
        public String email;
        @AuraEnabled
        public String website;
        /** Account discovery + optional assembly / core custom; picklist values as labels. */
        @AuraEnabled
        public String lastUsedChannel;
        @AuraEnabled
        public String tierSegment;
        @AuraEnabled
        public Decimal revenue;
        @AuraEnabled
        public Decimal investmentBalance;
        @AuraEnabled
        public Decimal loanBalance;
        @AuraEnabled
        public Decimal loanLimit;
        @AuraEnabled
        public Decimal depositYtd;
        @AuraEnabled
        public Decimal propensityScore;
        @AuraEnabled
        public Decimal engagementScore;
        @AuraEnabled
        public Decimal churnScore;
        @AuraEnabled
        public Decimal ltvScore;
        @AuraEnabled
        public Decimal crossSellScore;
        @AuraEnabled
        public Decimal savingsRate;
        @AuraEnabled
        public String riskProfile;
        @AuraEnabled
        public String customerSince;
        @AuraEnabled
        public String lastInteractionDate;
        @AuraEnabled
        public Boolean mobileEnrolled;
        @AuraEnabled
        public Boolean onlineEnrolled;
        @AuraEnabled
        public Boolean paperlessEnrolled;
        @AuraEnabled
        public Boolean alertsEnrolled;
        @AuraEnabled
        public Boolean wireEnabled;
        @AuraEnabled
        public String kycStatus;
        @AuraEnabled
        public String twoFaStatus;
        @AuraEnabled
        public String billingStreet;
        @AuraEnabled
        public String billingCity;
        @AuraEnabled
        public String billingState;
        @AuraEnabled
        public String billingPostalCode;
        @AuraEnabled
        public String assignedBranch;
        @AuraEnabled
        public String assignedBranchDistance;
        @AuraEnabled
        public String assignedBranchAddress;
        @AuraEnabled
        public String assignedBranchHours;
        @AuraEnabled
        public String assignedBranchStatus;
        @AuraEnabled
        public List<BranchInfo> nearbyBranches;
        /** Flow Text JSON array of account rows (type, number, balance, delta, deltaPositive). */
        @AuraEnabled
        public List<FinancialAccountInfo> financialAccounts;
        /** Optional; else geocoded from billing address when enabled. Drives lightning-map. */
        @AuraEnabled
        public Decimal mapLatitude;
        @AuraEnabled
        public Decimal mapLongitude;
        /** HTTPS image URL for header avatar; Contact PhotoUrl when from SOQL. */
        @AuraEnabled
        public String profilePhotoUrl;
        @AuraEnabled
        public String predictionLabel;
        @AuraEnabled
        public String recommendationsJson;

        /** Structure tab: org chart sibling row (related accounts ± center contact on Account pages). */
        @AuraEnabled
        public List<Map<String, String>> orgChartChildren;
        @AuraEnabled
        public List<Map<String, String>> keyContacts;
        @AuraEnabled
        public String structureLinkedAccountsText;
        /** Count of related accounts (Structure tab Relationships row). */
        @AuraEnabled
        public Integer structureLinkedAccountCount;
        @AuraEnabled
        public String structureLinkedContactsText;
        /** Set for Account root (Type); Contact root uses structureRootSublabel. */
        @AuraEnabled
        public String accountType;
        @AuraEnabled
        public String structureRootSublabel;

        /** Sum of Amount for open opportunities (Contact: household account + OCR; Account: on account). */
        @AuraEnabled
        public Decimal openOpportunitiesAmount;
        /** Count of open cases (Contact: ContactId; Account: AccountId). */
        @AuraEnabled
        public Integer openCasesCount;
    }

    @AuraEnabled
    public static ProfileResult getProfileData(
        String recordId,
        String flowApiName,
        String flowRecordIdVariable,
        String flowPredictionVariable,
        String flowRecommendationsVariable,
        String coreCustomFieldsJson,
        String profileAssemblyFlowApiName,
        String profileAssemblyFlowRecordIdVariable,
        String profileFlowOutputMapJson,
        Boolean geocodeBillingAddress
    ) {
        Map<String, String> profileFlowOutMap = parseProfileFlowOutputMap(profileFlowOutputMapJson);
        Flow.Interview interviewForPredictions = null;
        Flow.Interview assemblyInterview = null;

        Id recordIdVal = null;
        if (String.isNotBlank(recordId)) {
            try {
                recordIdVal = (Id) recordId;
            } catch (Exception e) {
                recordIdVal = null;
            }
        }

        Boolean predFromFlow = recordIdVal != null && String.isNotBlank(flowApiName);
        Boolean runProfileAsmNamed = recordIdVal != null && String.isNotBlank(profileAssemblyFlowApiName);

        Map<String, String> assemblyFlowVars = new Map<String, String>();
        Map<String, String> assemblySoqlPaths = new Map<String, String>();
        if (recordIdVal != null && !profileFlowOutMap.isEmpty()) {
            partitionAssemblyMapping(profileFlowOutMap, recordIdVal, assemblyFlowVars, assemblySoqlPaths);
        }

        Map<String, String> rawCore = parseCoreCustomMap(coreCustomFieldsJson);
        Map<String, String> coreFlowVars = new Map<String, String>();
        Map<String, String> coreSoqlMap = new Map<String, String>();
        for (String lk : rawCore.keySet()) {
            if (!CORE_CUSTOM_LOGICAL_KEYS.contains(lk)) {
                continue;
            }
            String cv = rawCore.get(lk);
            if (String.isBlank(cv)) {
                continue;
            }
            if (isFlowSourceToken(cv)) {
                coreFlowVars.put(lk, flowVariableApiNameFromToken(cv));
            } else {
                coreSoqlMap.put(lk, cv);
            }
        }

        Boolean sameAssemblyAndPredFlow =
            runProfileAsmNamed &&
            predFromFlow &&
            profileAssemblyFlowApiName != null &&
            flowApiName != null &&
            profileAssemblyFlowApiName.equalsIgnoreCase(flowApiName);

        Boolean startAssemblyInterview =
            runProfileAsmNamed &&
            (!assemblyFlowVars.isEmpty() || !coreFlowVars.isEmpty() || (predFromFlow && sameAssemblyAndPredFlow));

        if (!startAssemblyInterview && predFromFlow) {
            try {
                Map<String, Object> predIn = flowInputsWithRecordIds(recordIdVal, flowRecordIdVariable, null);
                interviewForPredictions = Flow.Interview.createInterview(flowApiName, predIn);
                interviewForPredictions.start();
            } catch (Exception ignorePred) {
            }
        }

        ProfileResult core = String.isNotBlank(recordId)
            ? buildFallbackFromSoql(recordId, coreSoqlMap, assemblySoqlPaths)
            : newEmptyProfileResult();

        ProfileResult result;
        if (startAssemblyInterview) {
            result = newEmptyProfileResult();
            try {
                String asmRecVar = String.isBlank(profileAssemblyFlowRecordIdVariable)
                    ? 'recordId'
                    : profileAssemblyFlowRecordIdVariable.trim();
                Map<String, Object> asmInputs = flowInputsWithRecordIds(
                    recordIdVal,
                    asmRecVar,
                    sameAssemblyAndPredFlow ? flowRecordIdVariable : null
                );
                assemblyInterview = Flow.Interview.createInterview(profileAssemblyFlowApiName, asmInputs);
                assemblyInterview.start();
                applyCoreCustomFlowTokenMappings(result, assemblyInterview, coreFlowVars);
                applyProfileOutputsFromFlow(result, assemblyInterview, assemblyFlowVars);
            } catch (AuraHandledException e) {
                throw e;
            } catch (Exception e) {
                throw new AuraHandledException(
                    'Profile assembly flow failed. Confirm autolaunched flow API name, inputs, and output map. ' + e.getMessage()
                );
            }
            result = mergeEnrichFull(result, core);
        } else {
            result = core;
        }

        if (predFromFlow) {
            try {
                Flow.Interview predIv = null;
                if (sameAssemblyAndPredFlow && assemblyInterview != null) {
                    predIv = assemblyInterview;
                } else if (interviewForPredictions != null) {
                    predIv = interviewForPredictions;
                } else {
                    Map<String, Object> predIn = flowInputsWithRecordIds(recordIdVal, flowRecordIdVariable, null);
                    predIv = Flow.Interview.createInterview(flowApiName, predIn);
                    predIv.start();
                }
                mergeFlowOutputsFromInterview(
                    result,
                    predIv,
                    flowPredictionVariable,
                    flowRecommendationsVariable
                );
            } catch (Exception ignorePred) {
            }
        }

        Boolean allowGeocode = geocodeBillingAddress == null || geocodeBillingAddress == true;
        if (allowGeocode && !Test.isRunningTest()) {
            applyGeocodeIfNeeded(result);
        }

        if (recordIdVal != null) {
            try {
                enrichStructureTabForCustomer(result, recordIdVal);
            } catch (Exception e) {
                System.debug(LoggingLevel.WARN, 'CustomerProfileWidget structure enrich failed: ' + e.getMessage());
            }
            try {
                enrichOpenOppAndCaseRollups(result, recordIdVal);
            } catch (Exception e) {
                System.debug(LoggingLevel.WARN, 'CustomerProfileWidget opp/case rollups failed: ' + e.getMessage());
            }
        }

        return result;
    }

    private static ProfileResult newEmptyProfileResult() {
        ProfileResult r = new ProfileResult();
        r.nearbyBranches = new List<BranchInfo>();
        r.financialAccounts = new List<FinancialAccountInfo>();
        r.orgChartChildren = new List<Map<String, String>>();
        r.keyContacts = new List<Map<String, String>>();
        return r;
    }

    private static Map<String, String> parseProfileFlowOutputMap(String jsonText) {
        Map<String, String> out = new Map<String, String>();
        if (String.isBlank(jsonText)) {
            return out;
        }
        try {
            Map<String, Object> m = (Map<String, Object>) JSON.deserializeUntyped(jsonText.trim());
            for (String k : m.keySet()) {
                if (!PROFILE_ASSEMBLY_OUTPUT_KEYS.contains(k)) {
                    continue;
                }
                Object v = m.get(k);
                if (v == null) {
                    continue;
                }
                String s = String.valueOf(v).trim();
                if (String.isNotBlank(s)) {
                    out.put(k, s);
                }
            }
        } catch (Exception e) {
        }
        return out;
    }

    private static void putStringIfMapped(
        ProfileResult r,
        Flow.Interview iv,
        Map<String, String> logicalToFlowVar,
        String logicalKey,
        String profileField
    ) {
        if (!logicalToFlowVar.containsKey(logicalKey)) {
            return;
        }
        String v = stringVal(resolveFlowOutput(iv, logicalToFlowVar.get(logicalKey)));
        if (profileField == 'city') {
            r.city = v;
        } else if (profileField == 'state') {
            r.state = v;
        } else if (profileField == 'industry') {
            r.industry = v;
        } else if (profileField == 'phone') {
            r.phone = v;
        } else if (profileField == 'email') {
            r.email = v;
        } else if (profileField == 'website') {
            r.website = v;
        } else if (profileField == 'lastUsedChannel') {
            r.lastUsedChannel = v;
        } else if (profileField == 'tierSegment') {
            r.tierSegment = v;
        } else if (profileField == 'riskProfile') {
            r.riskProfile = v;
        } else if (profileField == 'customerSince') {
            r.customerSince = v;
        } else if (profileField == 'kycStatus') {
            r.kycStatus = v;
        } else if (profileField == 'twoFaStatus') {
            r.twoFaStatus = v;
        } else if (profileField == 'billingStreet') {
            r.billingStreet = v;
        } else if (profileField == 'billingPostalCode') {
            r.billingPostalCode = v;
        } else if (profileField == 'assignedBranch') {
            r.assignedBranch = v;
        } else if (profileField == 'assignedBranchDistance') {
            r.assignedBranchDistance = v;
        } else if (profileField == 'assignedBranchAddress') {
            r.assignedBranchAddress = v;
        } else if (profileField == 'assignedBranchHours') {
            r.assignedBranchHours = v;
        } else if (profileField == 'assignedBranchStatus') {
            r.assignedBranchStatus = v;
        } else if (profileField == 'profilePhotoUrl') {
            r.profilePhotoUrl = v;
        }
    }

    private static void putIntIfMapped(
        ProfileResult r,
        Flow.Interview iv,
        Map<String, String> logicalToFlowVar,
        String logicalKey,
        String profileField
    ) {
        if (!logicalToFlowVar.containsKey(logicalKey)) {
            return;
        }
        r.employees = intVal(resolveFlowOutput(iv, logicalToFlowVar.get(logicalKey)));
    }

    private static void putDecIfMapped(
        ProfileResult r,
        Flow.Interview iv,
        Map<String, String> logicalToFlowVar,
        String logicalKey,
        String profileField
    ) {
        if (!logicalToFlowVar.containsKey(logicalKey)) {
            return;
        }
        Decimal d = decVal(resolveFlowOutput(iv, logicalToFlowVar.get(logicalKey)));
        if (profileField == 'revenue') {
            r.revenue = d;
        } else if (profileField == 'propensityScore') {
            r.propensityScore = d;
        } else if (profileField == 'engagementScore') {
            r.engagementScore = d;
        } else if (profileField == 'churnScore') {
            r.churnScore = d;
        } else if (profileField == 'ltvScore') {
            r.ltvScore = d;
        } else if (profileField == 'crossSellScore') {
            r.crossSellScore = d;
        } else if (profileField == 'savingsRate') {
            r.savingsRate = d;
        } else if (profileField == 'investmentBalance') {
            r.investmentBalance = d;
        } else if (profileField == 'loanBalance') {
            r.loanBalance = d;
        } else if (profileField == 'depositYtd') {
            r.depositYtd = d;
        } else if (profileField == 'loanLimit') {
            r.loanLimit = d;
        } else if (profileField == 'mapLatitude') {
            r.mapLatitude = d;
        } else if (profileField == 'mapLongitude') {
            r.mapLongitude = d;
        }
    }

    private static void putBoolIfMapped(
        ProfileResult r,
        Flow.Interview iv,
        Map<String, String> logicalToFlowVar,
        String logicalKey,
        String profileField
    ) {
        if (!logicalToFlowVar.containsKey(logicalKey)) {
            return;
        }
        Boolean b = boolVal(resolveFlowOutput(iv, logicalToFlowVar.get(logicalKey)));
        if (profileField == 'mobileEnrolled') {
            r.mobileEnrolled = b;
        } else if (profileField == 'onlineEnrolled') {
            r.onlineEnrolled = b;
        } else if (profileField == 'paperlessEnrolled') {
            r.paperlessEnrolled = b;
        } else if (profileField == 'alertsEnrolled') {
            r.alertsEnrolled = b;
        } else if (profileField == 'wireEnabled') {
            r.wireEnabled = b;
        }
    }

    private static void applyProfileOutputsFromFlow(
        ProfileResult r,
        Flow.Interview interview,
        Map<String, String> logicalToFlowVar
    ) {
        if (interview == null || logicalToFlowVar.isEmpty()) {
            return;
        }
        if (logicalToFlowVar.containsKey('firstName') || logicalToFlowVar.containsKey('lastName')) {
            String fn = logicalToFlowVar.containsKey('firstName')
                ? stringVal(resolveFlowOutput(interview, logicalToFlowVar.get('firstName')))
                : null;
            String ln = logicalToFlowVar.containsKey('lastName')
                ? stringVal(resolveFlowOutput(interview, logicalToFlowVar.get('lastName')))
                : null;
            if (String.isNotBlank(fn) || String.isNotBlank(ln)) {
                r.fullName = trimJoin(new List<String>{ fn, ln });
            }
        }
        if (logicalToFlowVar.containsKey('fullName')) {
            String v = stringVal(resolveFlowOutput(interview, logicalToFlowVar.get('fullName')));
            if (String.isNotBlank(v)) {
                r.fullName = v;
            }
        }
        putStringIfMapped(r, interview, logicalToFlowVar, 'city', 'city');
        putStringIfMapped(r, interview, logicalToFlowVar, 'state', 'state');
        r.billingCity = coalesce(r.billingCity, r.city);
        r.billingState = coalesce(r.billingState, r.state);
        putStringIfMapped(r, interview, logicalToFlowVar, 'industry', 'industry');
        putIntIfMapped(r, interview, logicalToFlowVar, 'employees', 'employees');
        putStringIfMapped(r, interview, logicalToFlowVar, 'phone', 'phone');
        putStringIfMapped(r, interview, logicalToFlowVar, 'email', 'email');
        putStringIfMapped(r, interview, logicalToFlowVar, 'website', 'website');
        putStringIfMapped(r, interview, logicalToFlowVar, 'lastUsedChannel', 'lastUsedChannel');
        putDecIfMapped(r, interview, logicalToFlowVar, 'revenue', 'revenue');
        putStringIfMapped(r, interview, logicalToFlowVar, 'tierSegment', 'tierSegment');
        putDecIfMapped(r, interview, logicalToFlowVar, 'propensityScore', 'propensityScore');
        putDecIfMapped(r, interview, logicalToFlowVar, 'engagementScore', 'engagementScore');
        putDecIfMapped(r, interview, logicalToFlowVar, 'churnScore', 'churnScore');
        putDecIfMapped(r, interview, logicalToFlowVar, 'ltvScore', 'ltvScore');
        putDecIfMapped(r, interview, logicalToFlowVar, 'crossSellScore', 'crossSellScore');
        putDecIfMapped(r, interview, logicalToFlowVar, 'savingsRate', 'savingsRate');
        putDecIfMapped(r, interview, logicalToFlowVar, 'investmentBalance', 'investmentBalance');
        putDecIfMapped(r, interview, logicalToFlowVar, 'loanBalance', 'loanBalance');
        putDecIfMapped(r, interview, logicalToFlowVar, 'depositYtd', 'depositYtd');
        putDecIfMapped(r, interview, logicalToFlowVar, 'loanLimit', 'loanLimit');
        putStringIfMapped(r, interview, logicalToFlowVar, 'riskProfile', 'riskProfile');
        putStringIfMapped(r, interview, logicalToFlowVar, 'customerSince', 'customerSince');
        if (logicalToFlowVar.containsKey('lastInteraction')) {
            r.lastInteractionDate = stringVal(resolveFlowOutput(interview, logicalToFlowVar.get('lastInteraction')));
        }
        putBoolIfMapped(r, interview, logicalToFlowVar, 'mobileEnrolled', 'mobileEnrolled');
        putBoolIfMapped(r, interview, logicalToFlowVar, 'onlineEnrolled', 'onlineEnrolled');
        putStringIfMapped(r, interview, logicalToFlowVar, 'kycStatus', 'kycStatus');
        putStringIfMapped(r, interview, logicalToFlowVar, 'twoFaStatus', 'twoFaStatus');
        putBoolIfMapped(r, interview, logicalToFlowVar, 'paperlessEnrolled', 'paperlessEnrolled');
        putBoolIfMapped(r, interview, logicalToFlowVar, 'alertsEnrolled', 'alertsEnrolled');
        putBoolIfMapped(r, interview, logicalToFlowVar, 'wireEnabled', 'wireEnabled');
        putStringIfMapped(r, interview, logicalToFlowVar, 'street', 'billingStreet');
        putStringIfMapped(r, interview, logicalToFlowVar, 'zip', 'billingPostalCode');
        putStringIfMapped(r, interview, logicalToFlowVar, 'assignedBranch', 'assignedBranch');
        putStringIfMapped(r, interview, logicalToFlowVar, 'branchDistance', 'assignedBranchDistance');
        putStringIfMapped(r, interview, logicalToFlowVar, 'assignedBranchAddress', 'assignedBranchAddress');
        putStringIfMapped(r, interview, logicalToFlowVar, 'assignedBranchHours', 'assignedBranchHours');
        putStringIfMapped(r, interview, logicalToFlowVar, 'assignedBranchStatus', 'assignedBranchStatus');
        putStringIfMapped(r, interview, logicalToFlowVar, 'profilePhotoUrl', 'profilePhotoUrl');

        if (logicalToFlowVar.containsKey('nearbyBranches')) {
            Object raw = resolveFlowOutput(interview, logicalToFlowVar.get('nearbyBranches'));
            String jsonList = raw instanceof String ? (String) raw : JSON.serialize(raw);
            if (String.isNotBlank(jsonList)) {
                try {
                    Object parsed = JSON.deserializeUntyped(jsonList.trim());
                    if (parsed instanceof List<Object>) {
                        r.nearbyBranches = new List<BranchInfo>();
                        for (Object o : (List<Object>) parsed) {
                            if (o instanceof Map<String, Object>) {
                                Map<String, Object> b = (Map<String, Object>) o;
                                BranchInfo bi = new BranchInfo();
                                bi.name = stringVal(b.get('name'));
                                bi.distance = stringVal(b.get('distance'));
                                bi.address = stringVal(b.get('address'));
                                bi.hours = stringVal(b.get('hours'));
                                bi.status = stringVal(b.get('status'));
                                bi.assigned = boolVal(b.get('assigned'));
                                r.nearbyBranches.add(bi);
                            }
                        }
                    }
                } catch (Exception e) {
                }
            }
        }

        putDecIfMapped(r, interview, logicalToFlowVar, 'mapLatitude', 'mapLatitude');
        putDecIfMapped(r, interview, logicalToFlowVar, 'mapLongitude', 'mapLongitude');

        if (logicalToFlowVar.containsKey('financialAccounts')) {
            Object raw = resolveFlowOutput(interview, logicalToFlowVar.get('financialAccounts'));
            List<FinancialAccountInfo> facc = parseFinancialAccountsList(raw);
            if (facc != null && !facc.isEmpty()) {
                r.financialAccounts = facc;
            }
        }
    }

    private static List<FinancialAccountInfo> parseFinancialAccountsList(Object raw) {
        List<FinancialAccountInfo> out = new List<FinancialAccountInfo>();
        if (raw == null) {
            return out;
        }
        try {
            String jsonList = raw instanceof String ? ((String) raw).trim() : JSON.serialize(raw);
            if (String.isBlank(jsonList)) {
                return out;
            }
            Object parsed = JSON.deserializeUntyped(jsonList);
            if (!(parsed instanceof List<Object>)) {
                return out;
            }
            for (Object o : (List<Object>) parsed) {
                if (!(o instanceof Map<String, Object>)) {
                    continue;
                }
                Map<String, Object> m = (Map<String, Object>) o;
                FinancialAccountInfo f = new FinancialAccountInfo();
                f.type = firstNonBlankString(
                    m,
                    new List<String>{
                        'type',
                        'accountType',
                        'category',
                        'name',
                        'label'
                    }
                );
                f.accountNumber = firstNonBlankString(
                    m,
                    new List<String>{ 'accountNumber', 'account_number', 'number', 'mask', 'lastFour' }
                );
                f.balance = decVal(m.get('balance'));
                if (f.balance == null) {
                    f.balance = decVal(m.get('amount'));
                }
                f.delta = firstNonBlankString(
                    m,
                    new List<String>{ 'delta', 'subtitle', 'status', 'change', 'trend' }
                );
                if (m.containsKey('deltaPositive')) {
                    f.deltaPositive = boolVal(m.get('deltaPositive'));
                }
                if (String.isNotBlank(f.type) || f.balance != null || String.isNotBlank(f.accountNumber)) {
                    out.add(f);
                }
            }
        } catch (Exception e) {
        }
        return out;
    }

    private static String firstNonBlankString(Map<String, Object> m, List<String> keys) {
        for (String k : keys) {
            if (!m.containsKey(k)) {
                continue;
            }
            String s = stringVal(m.get(k));
            if (String.isNotBlank(s)) {
                return s;
            }
        }
        return null;
    }

    /** True when lat/lng from Flow or prior steps are safe to use on the map (not null, not 0,0 placeholder, in range). */
    private static Boolean hasUsableMapCoords(ProfileResult r) {
        if (r == null || r.mapLatitude == null || r.mapLongitude == null) {
            return false;
        }
        return isReasonableLatLon(r.mapLatitude, r.mapLongitude);
    }

    /**
     * Nominatim (Remote Site nominatim.openstreetmap.org), then Photon (photon.komoot.io) if all Nominatim tries fail.
     * Clears unusable Flow placeholders (e.g. 0,0) so geocoding can run.
     */
    private static void applyGeocodeIfNeeded(ProfileResult r) {
        if (r == null) {
            return;
        }
        if (hasUsableMapCoords(r)) {
            return;
        }
        r.mapLatitude = null;
        r.mapLongitude = null;

        List<String> queries = buildGeocodeQueryCandidates(r);
        if (queries.isEmpty()) {
            return;
        }
        for (String q : queries) {
            GeocodeHit hit = nominatimGeocodeOne(q);
            if (hit != null && hit.lat != null && hit.lon != null && isReasonableLatLon(hit.lat, hit.lon)) {
                r.mapLatitude = hit.lat;
                r.mapLongitude = hit.lon;
                return;
            }
        }
        for (String q : queries) {
            GeocodeHit hit = photonGeocodeOne(q);
            if (hit != null && hit.lat != null && hit.lon != null && isReasonableLatLon(hit.lat, hit.lon)) {
                r.mapLatitude = hit.lat;
                r.mapLongitude = hit.lon;
                return;
            }
        }
    }

    private class GeocodeHit {
        Decimal lat;
        Decimal lon;
    }

    /** Tries several address strings (full billing, city/state/ZIP, branch address) for better hit rate. */
    private static List<String> buildGeocodeQueryCandidates(ProfileResult r) {
        List<String> out = new List<String>();
        Set<String> seen = new Set<String>();
        addGeocodeCandidate(out, seen, buildGeocodeAddressLine(r));
        addGeocodeCandidate(out, seen, buildGeocodeCityStatePostalLine(r));
        addGeocodeCandidate(out, seen, buildGeocodeCityStateCountryLine(r));
        addGeocodeCandidate(out, seen, normalizeFreeformAddress(r.assignedBranchAddress));
        return out;
    }

    private static void addGeocodeCandidate(List<String> acc, Set<String> seen, String q) {
        if (String.isBlank(q)) {
            return;
        }
        String t = q.trim();
        if (t.length() < 3) {
            return;
        }
        String key = t.toLowerCase();
        if (seen.contains(key)) {
            return;
        }
        seen.add(key);
        acc.add(t);
    }

    private static String buildGeocodeCityStatePostalLine(ProfileResult r) {
        List<String> parts = new List<String>();
        if (!String.isBlank(r.billingCity)) {
            parts.add(r.billingCity.trim());
        }
        if (!String.isBlank(r.billingState)) {
            parts.add(r.billingState.trim());
        }
        if (!String.isBlank(r.billingPostalCode)) {
            parts.add(r.billingPostalCode.trim());
        }
        return parts.isEmpty() ? null : String.join(parts, ', ');
    }

    private static String buildGeocodeCityStateCountryLine(ProfileResult r) {
        if (String.isBlank(r.billingCity) || String.isBlank(r.billingState)) {
            return null;
        }
        return r.billingCity.trim() + ', ' + r.billingState.trim() + ', USA';
    }

    private static String normalizeFreeformAddress(String raw) {
        if (String.isBlank(raw)) {
            return null;
        }
        String t = raw.replaceAll('[\\r\\n]+', ', ').replaceAll('\\s+', ' ').trim();
        return t.length() < 3 ? null : t;
    }

    private static Boolean isReasonableLatLon(Decimal lat, Decimal lon) {
        if (lat == null || lon == null) {
            return false;
        }
        if (lat.abs() > 90 || lon.abs() > 180) {
            return false;
        }
        // Reject (0,0); Nominatim occasionally returns a bad default for empty parses.
        if (lat == 0 && lon == 0) {
            return false;
        }
        return true;
    }

    private static GeocodeHit nominatimGeocodeOne(String q) {
        try {
            HttpRequest req = new HttpRequest();
            req.setMethod('GET');
            req.setTimeout(12000);
            req.setHeader(
                'User-Agent',
                'JDO-CustomerProfileWidget/1.0 (Salesforce Apex; financial services CRM profile widget)'
            );
            req.setHeader('Accept', 'application/json');
            req.setEndpoint(
                'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
                EncodingUtil.urlEncode(q, 'UTF-8')
            );
            HttpResponse resp = new Http().send(req);
            if (resp.getStatusCode() != 200 || String.isBlank(resp.getBody())) {
                return null;
            }
            List<Object> arr = (List<Object>) JSON.deserializeUntyped(resp.getBody());
            if (arr == null || arr.isEmpty()) {
                return null;
            }
            Object first = arr[0];
            if (!(first instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> loc = (Map<String, Object>) first;
            Decimal lat = decVal(loc.get('lat'));
            Decimal lng = decVal(loc.get('lon'));
            if (lat == null || lng == null) {
                return null;
            }
            GeocodeHit h = new GeocodeHit();
            h.lat = lat;
            h.lon = lng;
            return h;
        } catch (Exception e) {
            return null;
        }
    }

    /** Photon geocoder (Remote Site photon.komoot.io). Fallback when Nominatim is blocked or returns no hit. */
    private static GeocodeHit photonGeocodeOne(String q) {
        try {
            HttpRequest req = new HttpRequest();
            req.setMethod('GET');
            req.setTimeout(12000);
            req.setHeader('User-Agent', 'JDO-CustomerProfileWidget/1.0 (Salesforce Apex)');
            req.setHeader('Accept', 'application/json');
            req.setEndpoint(
                'https://photon.komoot.io/api/?limit=1&q=' + EncodingUtil.urlEncode(q, 'UTF-8')
            );
            HttpResponse resp = new Http().send(req);
            if (resp.getStatusCode() != 200 || String.isBlank(resp.getBody())) {
                return null;
            }
            Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(resp.getBody());
            if (root == null) {
                return null;
            }
            List<Object> features = (List<Object>) root.get('features');
            if (features == null || features.isEmpty()) {
                return null;
            }
            Object f0 = features[0];
            if (!(f0 instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> feat = (Map<String, Object>) f0;
            Object geomObj = feat.get('geometry');
            if (!(geomObj instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> geom = (Map<String, Object>) geomObj;
            List<Object> coords = (List<Object>) geom.get('coordinates');
            if (coords == null || coords.size() < 2) {
                return null;
            }
            Decimal lng = decVal(coords[0]);
            Decimal lat = decVal(coords[1]);
            if (lat == null || lng == null) {
                return null;
            }
            GeocodeHit h = new GeocodeHit();
            h.lat = lat;
            h.lon = lng;
            return h;
        } catch (Exception e) {
            return null;
        }
    }

    private static String buildGeocodeAddressLine(ProfileResult r) {
        List<String> parts = new List<String>();
        if (!String.isBlank(r.billingStreet)) {
            parts.add(r.billingStreet.trim());
        }
        if (!String.isBlank(r.billingCity)) {
            parts.add(r.billingCity.trim());
        }
        if (!String.isBlank(r.billingState)) {
            parts.add(r.billingState.trim());
        }
        if (!String.isBlank(r.billingPostalCode)) {
            parts.add(r.billingPostalCode.trim());
        }
        return parts.isEmpty() ? null : String.join(parts, ', ');
    }

    @AuraEnabled
    public static String generateSummary(
        String promptTemplateId,
        String promptInputApiName,
        String predictionLabel,
        String recommendationsJson
    ) {
        if (String.isBlank(promptTemplateId)) {
            return null;
        }

        String inputName = String.isBlank(promptInputApiName) ? 'Input:Prediction_Context' : promptInputApiName;

        Map<String, Object> payload = new Map<String, Object>{
            'prediction' => predictionLabel,
            'predictionType' => 'person_profile',
            'recommendations' => recommendationsJson != null ? recommendationsJson : '[]'
        };
        String contextJson = JSON.serialize(payload);

        try {
            ConnectApi.EinsteinPromptTemplateGenerationsInput promptInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
            promptInput.isPreview = false;

            ConnectApi.EinsteinLlmAdditionalConfigInput extra = new ConnectApi.EinsteinLlmAdditionalConfigInput();
            extra.numGenerations = 1;
            extra.applicationName = 'PromptTemplateGenerationsInvocable';
            promptInput.additionalConfig = extra;

            Map<String, ConnectApi.WrappedValue> valueMap = new Map<String, ConnectApi.WrappedValue>();
            ConnectApi.WrappedValue wrapped = new ConnectApi.WrappedValue();
            wrapped.value = contextJson;
            valueMap.put(inputName, wrapped);
            promptInput.inputParams = valueMap;

            ConnectApi.EinsteinPromptTemplateGenerationsRepresentation output = ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
                promptTemplateId,
                promptInput
            );

            if (output != null && output.generations != null && !output.generations.isEmpty()) {
                ConnectApi.EinsteinLLMGenerationItemOutput first = output.generations[0];
                return stripClosingCourtesy(first.text);
            }
            return null;
        } catch (Exception e) {
            throw new AuraHandledException(
                'AI summary could not be generated. Confirm Einstein Generative AI, prompt access, and that the template input API name matches. Details: ' +
                e.getMessage()
            );
        }
    }

    /** Single-value inference result for AI Signals gauge flows (classification %, regression, etc.). */
    public class SignalGaugeFlowResult {
        @AuraEnabled
        public Decimal prediction;
    }

    /**
     * Runs an autolaunched flow that returns one numeric prediction. Independent of profile assembly and Insight flows.
     */
    @AuraEnabled
    public static SignalGaugeFlowResult runSignalGaugeFlow(
        String flowApiName,
        String recordId,
        String recordIdVariableName,
        String predictionVariableName
    ) {
        if (String.isBlank(flowApiName) || String.isBlank(recordId)) {
            throw new AuraHandledException('Signal gauge flow API name and record Id are required.');
        }
        Id rid;
        try {
            rid = (Id) recordId;
        } catch (Exception e) {
            throw new AuraHandledException('Invalid record Id for signal gauge flow.');
        }
        String recVar = String.isBlank(recordIdVariableName) ? 'recordId' : recordIdVariableName.trim();
        String predVar = String.isBlank(predictionVariableName) ? 'prediction' : predictionVariableName.trim();
        SignalGaugeFlowResult out = new SignalGaugeFlowResult();
        try {
            Map<String, Object> inputs = flowInputsWithRecordIds(rid, recVar, null);
            Flow.Interview iv = Flow.Interview.createInterview(flowApiName.trim(), inputs);
            iv.start();
            Object raw = resolveFlowOutput(iv, predVar);
            out.prediction = decVal(raw);
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Signal gauge flow failed: ' + e.getMessage());
        }
        return out;
    }

    private static final List<String> LAST_USED_CHANNEL_FIELD_CANDIDATES = new List<String>{
        'Last_Used_Channel__c',
        'lastUsedChannel__c',
        'LastUsedChannel__c',
        'FinServ__LastUsedChannel__c',
        'Preferred_Channel__c',
        'Last_Channel__c'
    };

    private static List<String> resolvedLastUsedChannelCandidatePaths() {
        List<String> paths = new List<String>();
        Set<String> seen = new Set<String>();
        for (String cand : LAST_USED_CHANNEL_FIELD_CANDIDATES) {
            String canon = validateAccountFieldPath(cand);
            if (String.isBlank(canon) || seen.contains(canon)) {
                continue;
            }
            seen.add(canon);
            paths.add(canon);
        }
        Map<String, Schema.SObjectField> fm = Account.SObjectType.getDescribe().fields.getMap();
        for (Schema.SObjectField sf : fm.values()) {
            Schema.DescribeFieldResult d = sf.getDescribe();
            if (!d.isAccessible()) {
                continue;
            }
            Schema.DisplayType t = d.getType();
            if (
                t != Schema.DisplayType.STRING &&
                t != Schema.DisplayType.PICKLIST &&
                t != Schema.DisplayType.TEXTAREA &&
                t != Schema.DisplayType.URL &&
                t != Schema.DisplayType.PHONE &&
                t != Schema.DisplayType.EMAIL
            ) {
                continue;
            }
            String lbl = d.getLabel();
            if (String.isBlank(lbl)) {
                continue;
            }
            String l = lbl.toLowerCase();
            Boolean match =
                l.replaceAll('\\s+', '').equals('lastusedchannel') ||
                (l.contains('last') && l.contains('used') && l.contains('channel'));
            if (!match) {
                continue;
            }
            String canon = d.getName();
            if (String.isBlank(canon) || seen.contains(canon)) {
                continue;
            }
            seen.add(canon);
            paths.add(canon);
        }
        return paths;
    }

    private static void mergeLastUsedChannelAccountFieldsIntoSelect(Set<String> selectNames) {
        if (selectNames == null) {
            return;
        }
        for (String canon : resolvedLastUsedChannelCandidatePaths()) {
            if (String.isNotBlank(canon)) {
                selectNames.add(canon);
            }
        }
    }

    private static void mergeLastUsedChannelContactAccountFieldsIntoSelect(Set<String> selectNames) {
        if (selectNames == null) {
            return;
        }
        for (String canon : resolvedLastUsedChannelCandidatePaths()) {
            if (String.isNotBlank(canon)) {
                selectNames.add('Account.' + canon);
            }
        }
    }

    /** Same pattern as Business Profile Widget: value is a Flow variable (prefix optional in assembly map legacy mode). */
    private static Boolean isFlowSourceToken(String mappingValue) {
        if (String.isBlank(mappingValue)) {
            return false;
        }
        String t = mappingValue.trim().toLowerCase();
        return t.startsWith('flow:') || t.startsWith('flows:');
    }

    private static String flowVariableApiNameFromToken(String mappingValue) {
        String t = mappingValue.trim();
        if (t.toLowerCase().startsWith('flows:')) {
            return t.substring(6).trim();
        }
        return t.substring(5).trim();
    }

    private static String canonicalProfileSoqlPath(String path, String objName) {
        if (String.isBlank(path) || isFlowSourceToken(path)) {
            return null;
        }
        if ('Account'.equals(objName)) {
            return validateAccountFieldPath(path.trim());
        }
        if ('Contact'.equals(objName)) {
            return validateContactFieldPath(path.trim());
        }
        return null;
    }

    /**
     * Splits assembly output map: SOQL field paths (Contact/Account, dotted) vs Flow variable names.
     * Legacy: value with no prefix that fails SOQL validation is treated as a Flow variable API name.
     */
    private static void partitionAssemblyMapping(
        Map<String, String> src,
        Id recordId,
        Map<String, String> outFlowVarByLogical,
        Map<String, String> outSoqlPathByLogical
    ) {
        if (src == null || recordId == null || outFlowVarByLogical == null || outSoqlPathByLogical == null) {
            return;
        }
        String objName = recordId.getSObjectType().getDescribe().getName();
        for (String lk : src.keySet()) {
            if (!PROFILE_ASSEMBLY_OUTPUT_KEYS.contains(lk)) {
                continue;
            }
            String v = src.get(lk);
            if (String.isBlank(v)) {
                continue;
            }
            if (isFlowSourceToken(v)) {
                outFlowVarByLogical.put(lk, flowVariableApiNameFromToken(v));
                continue;
            }
            String canon = canonicalProfileSoqlPath(v, objName);
            if (String.isNotBlank(canon)) {
                outSoqlPathByLogical.put(lk, canon);
            } else {
                outFlowVarByLogical.put(lk, v.trim());
            }
        }
    }

    /**
     * Canonical Contact SELECT path (e.g. MailingCity, Account.Industry). Null if invalid.
     */
    private static String validateContactFieldPath(String path) {
        if (String.isBlank(path) || isFlowSourceToken(path)) {
            return null;
        }
        List<String> parts = path.trim().split('\\.', 0);
        if (parts.size() == 1 && parts[0].trim().equalsIgnoreCase('CreatedDate')) {
            return 'CreatedDate';
        }
        Schema.SObjectType curType = Contact.SObjectType;
        List<String> out = new List<String>();
        for (Integer i = 0; i < parts.size(); i++) {
            String seg = parts[i].trim();
            if (String.isBlank(seg)) {
                return null;
            }
            Map<String, Schema.SObjectField> fmap = curType.getDescribe().fields.getMap();
            Schema.SObjectField f = findAccountFieldByToken(fmap, seg);
            if (f == null) {
                return null;
            }
            Schema.DescribeFieldResult fr = f.getDescribe();
            Boolean isLast = (i == parts.size() - 1);
            if (isLast) {
                out.add(fr.getName());
                break;
            }
            if (fr.getType() != Schema.DisplayType.REFERENCE || fr.getReferenceTo().isEmpty()) {
                return null;
            }
            String rel = fr.getRelationshipName();
            if (String.isBlank(rel)) {
                return null;
            }
            out.add(rel);
            List<Schema.SObjectType> refs = fr.getReferenceTo();
            if (refs == null || refs.isEmpty()) {
                return null;
            }
            curType = refs[0];
        }
        if (out.isEmpty()) {
            return null;
        }
        return String.join(out, '.');
    }

    /**
     * Canonical Account SELECT path (e.g. Name, Owner.Name). Null if invalid.
     */
    private static String validateAccountFieldPath(String path) {
        if (String.isBlank(path)) {
            return null;
        }
        String t = path.trim();
        if (isFlowSourceToken(t)) {
            return null;
        }
        List<String> parts = t.split('\\.', 0);
        if (parts.size() == 1 && parts[0].trim().equalsIgnoreCase('CreatedDate')) {
            return 'CreatedDate';
        }
        Schema.SObjectType curType = Account.SObjectType;
        List<String> out = new List<String>();
        for (Integer i = 0; i < parts.size(); i++) {
            String seg = parts[i].trim();
            if (String.isBlank(seg)) {
                return null;
            }
            Map<String, Schema.SObjectField> fmap = curType.getDescribe().fields.getMap();
            Schema.SObjectField f = findAccountFieldByToken(fmap, seg);
            if (f == null) {
                return null;
            }
            Schema.DescribeFieldResult fr = f.getDescribe();
            Boolean isLast = (i == parts.size() - 1);
            if (isLast) {
                out.add(fr.getName());
                break;
            }
            if (fr.getType() != Schema.DisplayType.REFERENCE || fr.getReferenceTo().isEmpty()) {
                return null;
            }
            String rel = fr.getRelationshipName();
            if (String.isBlank(rel)) {
                return null;
            }
            out.add(rel);
            List<Schema.SObjectType> refs = fr.getReferenceTo();
            if (refs == null || refs.isEmpty()) {
                return null;
            }
            curType = refs[0];
        }
        if (out.isEmpty()) {
            return null;
        }
        return String.join(out, '.');
    }

    private static Schema.SObjectField findAccountFieldByToken(Map<String, Schema.SObjectField> fm, String seg) {
        for (String k : fm.keySet()) {
            if (k.equalsIgnoreCase(seg)) {
                return fm.get(k);
            }
        }
        for (Schema.SObjectField f : fm.values()) {
            String rn = f.getDescribe().getRelationshipName();
            if (rn != null && rn.equalsIgnoreCase(seg)) {
                return f;
            }
        }
        return null;
    }

    private static Object getFieldValueByPath(SObject row, String canonicalPath) {
        List<String> parts = canonicalPath.split('\\.', 0);
        if (parts.isEmpty()) {
            return null;
        }
        SObject cur = row;
        for (Integer i = 0; i < parts.size(); i++) {
            if (i == parts.size() - 1) {
                return cur.get(parts[i]);
            }
            cur = cur.getSObject(parts[i]);
            if (cur == null) {
                return null;
            }
        }
        return null;
    }

    private static String displayValueForAccountField(SObject row, String canonicalPath) {
        if (row == null || String.isBlank(canonicalPath)) {
            return null;
        }
        Object o = getFieldValueByPath(row, canonicalPath);
        if (o == null) {
            return null;
        }
        List<String> parts = canonicalPath.split('\\.', 0);
        if (parts.isEmpty()) {
            return stringVal(o);
        }
        Schema.SObjectType curType = Account.SObjectType;
        SObject curRow = row;
        Schema.DescribeFieldResult leaf = null;
        for (Integer i = 0; i < parts.size(); i++) {
            String p = parts[i];
            Map<String, Schema.SObjectField> fmap = curType.getDescribe().fields.getMap();
            Schema.SObjectField f = findAccountFieldByToken(fmap, p);
            if (f == null) {
                return stringVal(o);
            }
            Schema.DescribeFieldResult d = f.getDescribe();
            if (i == parts.size() - 1) {
                leaf = d;
                break;
            }
            if (d.getType() != Schema.DisplayType.REFERENCE || d.getReferenceTo().isEmpty()) {
                return stringVal(o);
            }
            String rel = d.getRelationshipName();
            if (String.isBlank(rel)) {
                return stringVal(o);
            }
            curRow = curRow.getSObject(rel);
            if (curRow == null) {
                return null;
            }
            List<Schema.SObjectType> rts = d.getReferenceTo();
            if (rts == null || rts.isEmpty()) {
                return stringVal(o);
            }
            curType = rts[0];
        }
        if (leaf == null) {
            return stringVal(o);
        }
        Schema.DisplayType t = leaf.getType();
        if (t == Schema.DisplayType.PICKLIST) {
            String raw = stringVal(o);
            if (String.isBlank(raw)) {
                return null;
            }
            for (Schema.PicklistEntry pe : leaf.getPicklistValues()) {
                if (pe.getValue() != null && pe.getValue().equals(raw)) {
                    String lbl = pe.getLabel();
                    return String.isNotBlank(lbl) ? lbl : raw;
                }
            }
            return raw;
        }
        if (t == Schema.DisplayType.MULTIPICKLIST) {
            String raw = stringVal(o);
            if (String.isBlank(raw)) {
                return null;
            }
            Map<String, String> valToLabel = new Map<String, String>();
            for (Schema.PicklistEntry pe : leaf.getPicklistValues()) {
                if (pe.getValue() != null) {
                    valToLabel.put(pe.getValue(), String.isNotBlank(pe.getLabel()) ? pe.getLabel() : pe.getValue());
                }
            }
            List<String> bits = new List<String>();
            for (String tok : raw.split(';')) {
                String k = tok.trim();
                if (String.isBlank(k)) {
                    continue;
                }
                bits.add(valToLabel.containsKey(k) ? valToLabel.get(k) : k);
            }
            return bits.isEmpty() ? null : String.join(bits, '; ');
        }
        return stringVal(o);
    }

    private static void applyLastUsedChannelFromAccount(ProfileResult r, Account acc) {
        if (r == null || acc == null || String.isNotBlank(r.lastUsedChannel)) {
            return;
        }
        for (String path : resolvedLastUsedChannelCandidatePaths()) {
            if (String.isBlank(path)) {
                continue;
            }
            String disp = displayValueForAccountField(acc, path);
            if (String.isNotBlank(disp)) {
                r.lastUsedChannel = disp.trim();
                return;
            }
        }
    }

    /** Picklist label (or string) for a single field on Account or Contact — core custom lastUsedChannel. */
    private static String displayValueForLeafField(SObject row, String fieldApiName) {
        if (row == null || String.isBlank(fieldApiName)) {
            return null;
        }
        Map<String, Schema.SObjectField> fm = row.getSObjectType().getDescribe().fields.getMap();
        Schema.SObjectField f = fm.get(fieldApiName.trim().toLowerCase());
        if (f == null) {
            return null;
        }
        Schema.DescribeFieldResult leaf = f.getDescribe();
        if (!leaf.isAccessible()) {
            return null;
        }
        Object o = row.get(leaf.getName());
        if (o == null) {
            return null;
        }
        Schema.DisplayType t = leaf.getType();
        if (t == Schema.DisplayType.PICKLIST) {
            String raw = stringVal(o);
            if (String.isBlank(raw)) {
                return null;
            }
            for (Schema.PicklistEntry pe : leaf.getPicklistValues()) {
                if (pe.getValue() != null && pe.getValue().equals(raw)) {
                    String lbl = pe.getLabel();
                    return String.isNotBlank(lbl) ? lbl : raw;
                }
            }
            return raw;
        }
        if (t == Schema.DisplayType.MULTIPICKLIST) {
            String raw = stringVal(o);
            if (String.isBlank(raw)) {
                return null;
            }
            Map<String, String> valToLabel = new Map<String, String>();
            for (Schema.PicklistEntry pe : leaf.getPicklistValues()) {
                if (pe.getValue() != null) {
                    valToLabel.put(pe.getValue(), String.isNotBlank(pe.getLabel()) ? pe.getLabel() : pe.getValue());
                }
            }
            List<String> bits = new List<String>();
            for (String tok : raw.split(';')) {
                String k = tok.trim();
                if (String.isBlank(k)) {
                    continue;
                }
                bits.add(valToLabel.containsKey(k) ? valToLabel.get(k) : k);
            }
            return bits.isEmpty() ? null : String.join(bits, '; ');
        }
        return stringVal(o);
    }

    @TestVisible
    static ProfileResult buildFallbackFromSoql(String recordId, String coreCustomFieldsJson) {
        Map<String, String> raw = parseCoreCustomMap(coreCustomFieldsJson);
        Map<String, String> coreSoql = new Map<String, String>();
        for (String lk : raw.keySet()) {
            if (!CORE_CUSTOM_LOGICAL_KEYS.contains(lk)) {
                continue;
            }
            String v = raw.get(lk);
            if (String.isBlank(v) || isFlowSourceToken(v)) {
                continue;
            }
            coreSoql.put(lk, v);
        }
        return buildFallbackFromSoql(recordId, coreSoql, new Map<String, String>());
    }

    private static ProfileResult buildFallbackFromSoql(
        String recordId,
        Map<String, String> coreCustomMap,
        Map<String, String> assemblySoqlPaths
    ) {
        ProfileResult r = newEmptyProfileResult();
        Id rid;
        try {
            rid = (Id) recordId;
        } catch (Exception e) {
            return r;
        }
        Map<String, String> asmPaths = assemblySoqlPaths == null ? new Map<String, String>() : assemblySoqlPaths;
        String obj = rid.getSObjectType().getDescribe().getName();

        if (obj == 'Account') {
            Map<String, String> logicalToField = new Map<String, String>();
            Set<String> selectNames = new Set<String>{
                'Name',
                'BillingStreet',
                'BillingCity',
                'BillingState',
                'BillingPostalCode',
                'Phone',
                'Industry',
                'NumberOfEmployees',
                'AnnualRevenue',
                'Website'
            };
            mergeLastUsedChannelAccountFieldsIntoSelect(selectNames);
            mergeAssemblySoqlPathsIntoSelect(selectNames, asmPaths);
            Map<String, Schema.SObjectField> accMap = Account.SObjectType.getDescribe().fields.getMap();
            for (String lk : coreCustomMap.keySet()) {
                if (!CORE_CUSTOM_LOGICAL_KEYS.contains(lk)) {
                    continue;
                }
                String api = coreCustomMap.get(lk);
                if (String.isBlank(api)) {
                    continue;
                }
                Schema.SObjectField fld = accMap.get(api.trim().toLowerCase());
                if (fld == null) {
                    continue;
                }
                Schema.DescribeFieldResult df = fld.getDescribe();
                if (!df.isAccessible()) {
                    continue;
                }
                selectNames.add(df.getName());
                logicalToField.put(lk, df.getName());
            }
            List<String> orderedSel = new List<String>(selectNames);
            orderedSel.sort();
            String soql = 'SELECT ' + String.join(orderedSel, ',') + ' FROM Account WHERE Id = :rid LIMIT 1';
            List<SObject> rows = Database.query(soql);
            if (!rows.isEmpty()) {
                Account a = (Account) rows[0];
                r.fullName = a.Name;
                r.billingStreet = a.BillingStreet;
                r.billingCity = a.BillingCity;
                r.billingState = a.BillingState;
                r.city = a.BillingCity;
                r.state = a.BillingState;
                r.billingPostalCode = a.BillingPostalCode;
                r.phone = a.Phone;
                r.industry = a.Industry;
                r.employees = a.NumberOfEmployees;
                r.revenue = a.AnnualRevenue;
                r.website = a.Website == null ? null : String.valueOf(a.Website);
                applyCoreCustomFromRow(a, r, logicalToField);
                applyProfileAssemblyFromSoql(r, a, asmPaths);
                applyLastUsedChannelFromAccount(r, a);
            }
        } else if (obj == 'Contact') {
            Map<String, String> logicalToField = new Map<String, String>();
            Set<String> selectNames = new Set<String>{
                'FirstName',
                'LastName',
                'MailingCity',
                'MailingState',
                'MailingStreet',
                'MailingPostalCode',
                'Phone',
                'Email',
                'PhotoUrl',
                'AccountId'
            };
            mergeLastUsedChannelContactAccountFieldsIntoSelect(selectNames);
            mergeAssemblySoqlPathsIntoSelect(selectNames, asmPaths);
            Map<String, Schema.SObjectField> conMap = Contact.SObjectType.getDescribe().fields.getMap();
            for (String lk : coreCustomMap.keySet()) {
                if (!CORE_CUSTOM_LOGICAL_KEYS.contains(lk)) {
                    continue;
                }
                String api = coreCustomMap.get(lk);
                if (String.isBlank(api)) {
                    continue;
                }
                Schema.SObjectField fld = conMap.get(api.trim().toLowerCase());
                if (fld == null) {
                    continue;
                }
                Schema.DescribeFieldResult df = fld.getDescribe();
                if (!df.isAccessible()) {
                    continue;
                }
                selectNames.add(df.getName());
                logicalToField.put(lk, df.getName());
            }
            List<String> orderedSelC = new List<String>(selectNames);
            orderedSelC.sort();
            String soql = 'SELECT ' + String.join(orderedSelC, ',') + ' FROM Contact WHERE Id = :rid LIMIT 1';
            List<SObject> rows = Database.query(soql);
            if (!rows.isEmpty()) {
                Contact c = (Contact) rows[0];
                r.fullName = trimJoin(new List<String>{ c.FirstName, c.LastName });
                r.city = c.MailingCity;
                r.state = c.MailingState;
                r.billingCity = c.MailingCity;
                r.billingState = c.MailingState;
                r.billingStreet = c.MailingStreet;
                r.billingPostalCode = c.MailingPostalCode;
                r.phone = c.Phone;
                r.email = c.Email;
                r.profilePhotoUrl = c.PhotoUrl;
                applyCoreCustomFromRow(c, r, logicalToField);
                applyProfileAssemblyFromSoql(r, c, asmPaths);
                Account acc = (Account) c.getSObject('Account');
                applyLastUsedChannelFromAccount(r, acc);
            }
        }
        return r;
    }

    private static Map<String, String> parseCoreCustomMap(String jsonText) {
        if (String.isBlank(jsonText)) {
            return new Map<String, String>();
        }
        try {
            Map<String, Object> m = (Map<String, Object>) JSON.deserializeUntyped(jsonText.trim());
            Map<String, String> out = new Map<String, String>();
            for (String k : m.keySet()) {
                if (m.get(k) != null) {
                    out.put(k, String.valueOf(m.get(k)));
                }
            }
            return out;
        } catch (Exception e) {
            return new Map<String, String>();
        }
    }

    private static void applyCoreCustomFromRow(SObject row, ProfileResult r, Map<String, String> logicalToField) {
        if (row == null || logicalToField.isEmpty()) {
            return;
        }
        for (String lk : logicalToField.keySet()) {
            String fn = logicalToField.get(lk);
            Object v = row.get(fn);
            if (lk == 'tierSegment') {
                r.tierSegment = stringVal(v);
            } else if (lk == 'investmentBalance') {
                r.investmentBalance = decVal(v);
            } else if (lk == 'loanBalance') {
                r.loanBalance = decVal(v);
            } else if (lk == 'loanLimit') {
                r.loanLimit = decVal(v);
            } else if (lk == 'depositYtd') {
                r.depositYtd = decVal(v);
            } else if (lk == 'propensityScore') {
                r.propensityScore = decVal(v);
            } else if (lk == 'engagementScore') {
                r.engagementScore = decVal(v);
            } else if (lk == 'churnScore') {
                r.churnScore = decVal(v);
            } else if (lk == 'ltvScore') {
                r.ltvScore = decVal(v);
            } else if (lk == 'crossSellScore') {
                r.crossSellScore = decVal(v);
            } else if (lk == 'savingsRate') {
                r.savingsRate = decVal(v);
            } else if (lk == 'riskProfile') {
                r.riskProfile = stringVal(v);
            } else if (lk == 'customerSince') {
                r.customerSince = stringVal(v);
            } else if (lk == 'lastInteractionDate') {
                r.lastInteractionDate = stringVal(v);
            } else if (lk == 'mobileEnrolled') {
                r.mobileEnrolled = boolVal(v);
            } else if (lk == 'onlineEnrolled') {
                r.onlineEnrolled = boolVal(v);
            } else if (lk == 'kycStatus') {
                r.kycStatus = stringVal(v);
            } else if (lk == 'twoFaStatus') {
                r.twoFaStatus = stringVal(v);
            } else if (lk == 'paperlessEnrolled') {
                r.paperlessEnrolled = boolVal(v);
            } else if (lk == 'alertsEnrolled') {
                r.alertsEnrolled = boolVal(v);
            } else if (lk == 'wireEnabled') {
                r.wireEnabled = boolVal(v);
            } else if (lk == 'profilePhotoUrl') {
                r.profilePhotoUrl = stringVal(v);
            } else if (lk == 'lastUsedChannel') {
                r.lastUsedChannel = displayValueForLeafField(row, fn);
            }
        }
    }

    private static void applyCoreCustomFlowTokenMappings(
        ProfileResult r,
        Flow.Interview iv,
        Map<String, String> logicalToVar
    ) {
        if (r == null || iv == null || logicalToVar == null || logicalToVar.isEmpty()) {
            return;
        }
        for (String lk : logicalToVar.keySet()) {
            Object v = resolveFlowOutput(iv, logicalToVar.get(lk));
            if (lk == 'tierSegment') {
                r.tierSegment = stringVal(v);
            } else if (lk == 'investmentBalance') {
                r.investmentBalance = decVal(v);
            } else if (lk == 'loanBalance') {
                r.loanBalance = decVal(v);
            } else if (lk == 'loanLimit') {
                r.loanLimit = decVal(v);
            } else if (lk == 'depositYtd') {
                r.depositYtd = decVal(v);
            } else if (lk == 'propensityScore') {
                r.propensityScore = decVal(v);
            } else if (lk == 'engagementScore') {
                r.engagementScore = decVal(v);
            } else if (lk == 'churnScore') {
                r.churnScore = decVal(v);
            } else if (lk == 'ltvScore') {
                r.ltvScore = decVal(v);
            } else if (lk == 'crossSellScore') {
                r.crossSellScore = decVal(v);
            } else if (lk == 'savingsRate') {
                r.savingsRate = decVal(v);
            } else if (lk == 'riskProfile') {
                r.riskProfile = stringVal(v);
            } else if (lk == 'customerSince') {
                r.customerSince = stringVal(v);
            } else if (lk == 'lastInteractionDate') {
                r.lastInteractionDate = stringVal(v);
            } else if (lk == 'mobileEnrolled') {
                r.mobileEnrolled = boolVal(v);
            } else if (lk == 'onlineEnrolled') {
                r.onlineEnrolled = boolVal(v);
            } else if (lk == 'kycStatus') {
                r.kycStatus = stringVal(v);
            } else if (lk == 'twoFaStatus') {
                r.twoFaStatus = stringVal(v);
            } else if (lk == 'paperlessEnrolled') {
                r.paperlessEnrolled = boolVal(v);
            } else if (lk == 'alertsEnrolled') {
                r.alertsEnrolled = boolVal(v);
            } else if (lk == 'wireEnabled') {
                r.wireEnabled = boolVal(v);
            } else if (lk == 'profilePhotoUrl') {
                r.profilePhotoUrl = stringVal(v);
            } else if (lk == 'lastUsedChannel') {
                r.lastUsedChannel = stringVal(v);
            }
        }
    }

    private static void mergeAssemblySoqlPathsIntoSelect(Set<String> selectNames, Map<String, String> assemblySoqlPaths) {
        if (selectNames == null || assemblySoqlPaths == null || assemblySoqlPaths.isEmpty()) {
            return;
        }
        for (String canon : assemblySoqlPaths.values()) {
            if (String.isNotBlank(canon)) {
                selectNames.add(canon);
            }
        }
    }

    /** Applies [Asm flow output] / JSON slots that were resolved to SOQL paths (same shapes as Flow). */
    private static void applyProfileAssemblyFromSoql(ProfileResult r, SObject row, Map<String, String> paths) {
        if (r == null || row == null || paths == null || paths.isEmpty()) {
            return;
        }
        if (paths.containsKey('firstName') || paths.containsKey('lastName')) {
            String fn = paths.containsKey('firstName')
                ? stringVal(getFieldValueByPath(row, paths.get('firstName')))
                : null;
            String ln = paths.containsKey('lastName')
                ? stringVal(getFieldValueByPath(row, paths.get('lastName')))
                : null;
            if (String.isNotBlank(fn) || String.isNotBlank(ln)) {
                r.fullName = trimJoin(new List<String>{ fn, ln });
            }
        }
        if (paths.containsKey('fullName')) {
            String v = stringVal(getFieldValueByPath(row, paths.get('fullName')));
            if (String.isNotBlank(v)) {
                r.fullName = v;
            }
        }
        if (paths.containsKey('city')) {
            r.city = stringVal(getFieldValueByPath(row, paths.get('city')));
        }
        if (paths.containsKey('state')) {
            r.state = stringVal(getFieldValueByPath(row, paths.get('state')));
        }
        r.billingCity = coalesce(r.billingCity, r.city);
        r.billingState = coalesce(r.billingState, r.state);
        if (paths.containsKey('industry')) {
            r.industry = stringVal(getFieldValueByPath(row, paths.get('industry')));
        }
        if (paths.containsKey('employees')) {
            r.employees = intVal(getFieldValueByPath(row, paths.get('employees')));
        }
        if (paths.containsKey('phone')) {
            r.phone = stringVal(getFieldValueByPath(row, paths.get('phone')));
        }
        if (paths.containsKey('email')) {
            r.email = stringVal(getFieldValueByPath(row, paths.get('email')));
        }
        if (paths.containsKey('website')) {
            r.website = stringVal(getFieldValueByPath(row, paths.get('website')));
        }
        if (paths.containsKey('lastUsedChannel')) {
            r.lastUsedChannel = stringVal(getFieldValueByPath(row, paths.get('lastUsedChannel')));
        }
        if (paths.containsKey('revenue')) {
            r.revenue = decVal(getFieldValueByPath(row, paths.get('revenue')));
        }
        if (paths.containsKey('tierSegment')) {
            r.tierSegment = stringVal(getFieldValueByPath(row, paths.get('tierSegment')));
        }
        if (paths.containsKey('propensityScore')) {
            r.propensityScore = decVal(getFieldValueByPath(row, paths.get('propensityScore')));
        }
        if (paths.containsKey('engagementScore')) {
            r.engagementScore = decVal(getFieldValueByPath(row, paths.get('engagementScore')));
        }
        if (paths.containsKey('churnScore')) {
            r.churnScore = decVal(getFieldValueByPath(row, paths.get('churnScore')));
        }
        if (paths.containsKey('ltvScore')) {
            r.ltvScore = decVal(getFieldValueByPath(row, paths.get('ltvScore')));
        }
        if (paths.containsKey('crossSellScore')) {
            r.crossSellScore = decVal(getFieldValueByPath(row, paths.get('crossSellScore')));
        }
        if (paths.containsKey('savingsRate')) {
            r.savingsRate = decVal(getFieldValueByPath(row, paths.get('savingsRate')));
        }
        if (paths.containsKey('investmentBalance')) {
            r.investmentBalance = decVal(getFieldValueByPath(row, paths.get('investmentBalance')));
        }
        if (paths.containsKey('loanBalance')) {
            r.loanBalance = decVal(getFieldValueByPath(row, paths.get('loanBalance')));
        }
        if (paths.containsKey('depositYtd')) {
            r.depositYtd = decVal(getFieldValueByPath(row, paths.get('depositYtd')));
        }
        if (paths.containsKey('loanLimit')) {
            r.loanLimit = decVal(getFieldValueByPath(row, paths.get('loanLimit')));
        }
        if (paths.containsKey('riskProfile')) {
            r.riskProfile = stringVal(getFieldValueByPath(row, paths.get('riskProfile')));
        }
        if (paths.containsKey('customerSince')) {
            r.customerSince = stringVal(getFieldValueByPath(row, paths.get('customerSince')));
        }
        if (paths.containsKey('lastInteraction')) {
            r.lastInteractionDate = stringVal(getFieldValueByPath(row, paths.get('lastInteraction')));
        }
        if (paths.containsKey('mobileEnrolled')) {
            r.mobileEnrolled = boolVal(getFieldValueByPath(row, paths.get('mobileEnrolled')));
        }
        if (paths.containsKey('onlineEnrolled')) {
            r.onlineEnrolled = boolVal(getFieldValueByPath(row, paths.get('onlineEnrolled')));
        }
        if (paths.containsKey('kycStatus')) {
            r.kycStatus = stringVal(getFieldValueByPath(row, paths.get('kycStatus')));
        }
        if (paths.containsKey('twoFaStatus')) {
            r.twoFaStatus = stringVal(getFieldValueByPath(row, paths.get('twoFaStatus')));
        }
        if (paths.containsKey('paperlessEnrolled')) {
            r.paperlessEnrolled = boolVal(getFieldValueByPath(row, paths.get('paperlessEnrolled')));
        }
        if (paths.containsKey('alertsEnrolled')) {
            r.alertsEnrolled = boolVal(getFieldValueByPath(row, paths.get('alertsEnrolled')));
        }
        if (paths.containsKey('wireEnabled')) {
            r.wireEnabled = boolVal(getFieldValueByPath(row, paths.get('wireEnabled')));
        }
        if (paths.containsKey('street')) {
            r.billingStreet = stringVal(getFieldValueByPath(row, paths.get('street')));
        }
        if (paths.containsKey('zip')) {
            r.billingPostalCode = stringVal(getFieldValueByPath(row, paths.get('zip')));
        }
        if (paths.containsKey('assignedBranch')) {
            r.assignedBranch = stringVal(getFieldValueByPath(row, paths.get('assignedBranch')));
        }
        if (paths.containsKey('branchDistance')) {
            r.assignedBranchDistance = stringVal(getFieldValueByPath(row, paths.get('branchDistance')));
        }
        if (paths.containsKey('assignedBranchAddress')) {
            r.assignedBranchAddress = stringVal(getFieldValueByPath(row, paths.get('assignedBranchAddress')));
        }
        if (paths.containsKey('assignedBranchHours')) {
            r.assignedBranchHours = stringVal(getFieldValueByPath(row, paths.get('assignedBranchHours')));
        }
        if (paths.containsKey('assignedBranchStatus')) {
            r.assignedBranchStatus = stringVal(getFieldValueByPath(row, paths.get('assignedBranchStatus')));
        }
        if (paths.containsKey('profilePhotoUrl')) {
            r.profilePhotoUrl = stringVal(getFieldValueByPath(row, paths.get('profilePhotoUrl')));
        }
        if (paths.containsKey('nearbyBranches')) {
            Object raw = getFieldValueByPath(row, paths.get('nearbyBranches'));
            String jsonList = raw instanceof String ? (String) raw : JSON.serialize(raw);
            if (String.isNotBlank(jsonList)) {
                try {
                    Object parsed = JSON.deserializeUntyped(jsonList.trim());
                    if (parsed instanceof List<Object>) {
                        r.nearbyBranches = new List<BranchInfo>();
                        for (Object o : (List<Object>) parsed) {
                            if (o instanceof Map<String, Object>) {
                                Map<String, Object> b = (Map<String, Object>) o;
                                BranchInfo bi = new BranchInfo();
                                bi.name = stringVal(b.get('name'));
                                bi.distance = stringVal(b.get('distance'));
                                bi.address = stringVal(b.get('address'));
                                bi.hours = stringVal(b.get('hours'));
                                bi.status = stringVal(b.get('status'));
                                bi.assigned = boolVal(b.get('assigned'));
                                r.nearbyBranches.add(bi);
                            }
                        }
                    }
                } catch (Exception e) {
                }
            }
        }
        if (paths.containsKey('financialAccounts')) {
            Object raw = getFieldValueByPath(row, paths.get('financialAccounts'));
            List<FinancialAccountInfo> facc = parseFinancialAccountsList(raw);
            if (facc != null && !facc.isEmpty()) {
                r.financialAccounts = facc;
            }
        }
        if (paths.containsKey('mapLatitude')) {
            r.mapLatitude = decVal(getFieldValueByPath(row, paths.get('mapLatitude')));
        }
        if (paths.containsKey('mapLongitude')) {
            r.mapLongitude = decVal(getFieldValueByPath(row, paths.get('mapLongitude')));
        }
    }

    private static Object getByPath(Object node, String path) {
        if (node == null || String.isBlank(path)) {
            return null;
        }
        List<String> segs = path.split('\\.');
        Object cur = node;
        for (String seg : segs) {
            if (cur instanceof Map<String, Object>) {
                cur = ((Map<String, Object>) cur).get(seg);
            } else if (cur instanceof List<Object>) {
                Integer idx = integerSegment(seg);
                List<Object> lst = (List<Object>) cur;
                if (idx == null || idx < 0 || idx >= lst.size()) {
                    return null;
                }
                cur = lst.get(idx);
            } else {
                return null;
            }
        }
        return cur;
    }

    private static Integer integerSegment(String seg) {
        if (String.isBlank(seg)) {
            return null;
        }
        try {
            return Integer.valueOf(seg.trim());
        } catch (Exception e) {
            return null;
        }
    }

    @TestVisible
    private static Object debugGetByPathFromJson(String jsonBody, String path) {
        if (String.isBlank(jsonBody)) {
            return null;
        }
        return getByPath(JSON.deserializeUntyped(jsonBody), path);
    }

    /** Fills blanks on primary `p` from secondary `s` (CRM SOQL layer). */
    private static ProfileResult mergeEnrichFull(ProfileResult p, ProfileResult s) {
        if (s == null) {
            return p;
        }
        if (String.isBlank(p.fullName)) {
            p.fullName = s.fullName;
        }
        if (String.isBlank(p.city)) {
            p.city = s.city;
        }
        if (String.isBlank(p.state)) {
            p.state = s.state;
        }
        if (String.isBlank(p.industry)) {
            p.industry = s.industry;
        }
        if (p.employees == null) {
            p.employees = s.employees;
        }
        if (String.isBlank(p.phone)) {
            p.phone = s.phone;
        }
        if (String.isBlank(p.email)) {
            p.email = s.email;
        }
        if (String.isBlank(p.website)) {
            p.website = s.website;
        }
        if (String.isBlank(p.lastUsedChannel)) {
            p.lastUsedChannel = s.lastUsedChannel;
        }
        if (p.revenue == null) {
            p.revenue = s.revenue;
        }
        if (String.isBlank(p.tierSegment)) {
            p.tierSegment = s.tierSegment;
        }
        if (p.investmentBalance == null) {
            p.investmentBalance = s.investmentBalance;
        }
        if (p.loanBalance == null) {
            p.loanBalance = s.loanBalance;
        }
        if (p.loanLimit == null) {
            p.loanLimit = s.loanLimit;
        }
        if (p.depositYtd == null) {
            p.depositYtd = s.depositYtd;
        }
        if (p.propensityScore == null) {
            p.propensityScore = s.propensityScore;
        }
        if (p.engagementScore == null) {
            p.engagementScore = s.engagementScore;
        }
        if (p.churnScore == null) {
            p.churnScore = s.churnScore;
        }
        if (p.ltvScore == null) {
            p.ltvScore = s.ltvScore;
        }
        if (p.crossSellScore == null) {
            p.crossSellScore = s.crossSellScore;
        }
        if (p.savingsRate == null) {
            p.savingsRate = s.savingsRate;
        }
        if (String.isBlank(p.riskProfile)) {
            p.riskProfile = s.riskProfile;
        }
        if (String.isBlank(p.customerSince)) {
            p.customerSince = s.customerSince;
        }
        if (String.isBlank(p.lastInteractionDate)) {
            p.lastInteractionDate = s.lastInteractionDate;
        }
        if (p.mobileEnrolled == null) {
            p.mobileEnrolled = s.mobileEnrolled;
        }
        if (p.onlineEnrolled == null) {
            p.onlineEnrolled = s.onlineEnrolled;
        }
        if (String.isBlank(p.kycStatus)) {
            p.kycStatus = s.kycStatus;
        }
        if (String.isBlank(p.twoFaStatus)) {
            p.twoFaStatus = s.twoFaStatus;
        }
        if (p.paperlessEnrolled == null) {
            p.paperlessEnrolled = s.paperlessEnrolled;
        }
        if (p.alertsEnrolled == null) {
            p.alertsEnrolled = s.alertsEnrolled;
        }
        if (p.wireEnabled == null) {
            p.wireEnabled = s.wireEnabled;
        }
        if (String.isBlank(p.billingStreet)) {
            p.billingStreet = s.billingStreet;
        }
        if (String.isBlank(p.billingCity)) {
            p.billingCity = s.billingCity;
        }
        if (String.isBlank(p.billingState)) {
            p.billingState = s.billingState;
        }
        if (String.isBlank(p.billingPostalCode)) {
            p.billingPostalCode = s.billingPostalCode;
        }
        if (String.isBlank(p.assignedBranch)) {
            p.assignedBranch = s.assignedBranch;
        }
        if (String.isBlank(p.assignedBranchDistance)) {
            p.assignedBranchDistance = s.assignedBranchDistance;
        }
        if (String.isBlank(p.assignedBranchAddress)) {
            p.assignedBranchAddress = s.assignedBranchAddress;
        }
        if (String.isBlank(p.assignedBranchHours)) {
            p.assignedBranchHours = s.assignedBranchHours;
        }
        if (String.isBlank(p.assignedBranchStatus)) {
            p.assignedBranchStatus = s.assignedBranchStatus;
        }
        if (p.nearbyBranches == null) {
            p.nearbyBranches = new List<BranchInfo>();
        }
        if (p.nearbyBranches.isEmpty() && s.nearbyBranches != null && !s.nearbyBranches.isEmpty()) {
            p.nearbyBranches.addAll(s.nearbyBranches);
        }
        if (p.financialAccounts != null &&
            p.financialAccounts.isEmpty() &&
            s.financialAccounts != null &&
            !s.financialAccounts.isEmpty()) {
            p.financialAccounts = s.financialAccounts;
        }
        if (p.mapLatitude == null && s.mapLatitude != null) {
            p.mapLatitude = s.mapLatitude;
        }
        if (p.mapLongitude == null && s.mapLongitude != null) {
            p.mapLongitude = s.mapLongitude;
        }
        if (String.isBlank(p.profilePhotoUrl)) {
            p.profilePhotoUrl = s.profilePhotoUrl;
        }
        return p;
    }

    private static Map<String, Object> flowInputsWithRecordIds(Id recordIdVal, String firstVar, String secondVar) {
        Map<String, Object> m = new Map<String, Object>();
        String a = String.isBlank(firstVar) ? 'recordId' : firstVar.trim();
        m.put(a, recordIdVal);
        if (String.isNotBlank(secondVar)) {
            String b = secondVar.trim();
            if (!b.equalsIgnoreCase(a)) {
                m.put(b, recordIdVal);
            }
        }
        return m;
    }

    private static void mergeFlowOutputsFromInterview(
        ProfileResult r,
        Flow.Interview interview,
        String flowPredictionVariable,
        String flowRecommendationsVariable
    ) {
        String predVar = String.isBlank(flowPredictionVariable) ? 'prediction' : flowPredictionVariable;
        String recVar = String.isBlank(flowRecommendationsVariable) ? 'recommendations' : flowRecommendationsVariable;

        Object pred = resolveFlowOutput(interview, predVar);
        if (pred != null) {
            if (pred instanceof String) {
                r.predictionLabel = stripClosingCourtesy(((String) pred).trim());
            } else {
                r.predictionLabel = stripClosingCourtesy(String.valueOf(pred).trim());
            }
        }

        r.recommendationsJson = flowOutputToJsonString(resolveFlowOutput(interview, recVar));
    }

    /** Reads a Flow variable after interview.start(). Variables must be Available for output or getVariableValue often returns null. */
    private static Object resolveFlowOutput(Flow.Interview interview, String apiName) {
        if (String.isBlank(apiName)) {
            return null;
        }
        String trimmed = apiName.trim();
        Object value = interview.getVariableValue(trimmed);
        if (value != null) {
            return value;
        }
        // App Builder sometimes pastes the Flow label with spaces instead of the API name.
        String spacedToUnderscore = trimmed.replaceAll('\\s+', '_');
        if (!spacedToUnderscore.equals(trimmed)) {
            value = interview.getVariableValue(spacedToUnderscore);
            if (value != null) {
                return value;
            }
        }
        if (trimmed.length() > 0) {
            String firstUpper = trimmed.substring(0, 1).toUpperCase() + trimmed.substring(1);
            if (!firstUpper.equals(trimmed)) {
                value = interview.getVariableValue(firstUpper);
                if (value != null) {
                    return value;
                }
            }
            String lower = trimmed.toLowerCase();
            if (!lower.equals(trimmed)) {
                value = interview.getVariableValue(lower);
                if (value != null) {
                    return value;
                }
            }
        }
        return null;
    }

    private static String flowOutputToJsonString(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String) {
            return (String) value;
        }
        try {
            return JSON.serialize(value);
        } catch (Exception e) {
            return String.valueOf(value);
        }
    }

    private static String stringVal(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof String) {
            return (String) o;
        }
        return String.valueOf(o);
    }

    private static Integer intVal(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Integer) {
            return (Integer) o;
        }
        if (o instanceof Decimal) {
            return ((Decimal) o).intValue();
        }
        if (o instanceof Long) {
            return Integer.valueOf(String.valueOf(o));
        }
        try {
            return Integer.valueOf(String.valueOf(o));
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Flow Transform / Text-to-collection paths often yield strings like "13,905.02"; Decimal.valueOf rejects commas.
     */
    private static Decimal decValFromNumericText(String raw) {
        if (String.isBlank(raw)) {
            return null;
        }
        String s = raw.trim().replace('$', '').replace('\u00a0', '').replaceAll('\\s+', '').replace(',', '');
        try {
            return Decimal.valueOf(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static Decimal decVal(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Decimal) {
            return (Decimal) o;
        }
        if (o instanceof Integer) {
            return Decimal.valueOf((Integer) o);
        }
        if (o instanceof Long) {
            return Decimal.valueOf((Long) o);
        }
        if (o instanceof Double) {
            return Decimal.valueOf((Double) o);
        }
        if (o instanceof String) {
            return decValFromNumericText((String) o);
        }
        try {
            return Decimal.valueOf(String.valueOf(o));
        } catch (Exception e) {
            return null;
        }
    }

    private static Boolean boolVal(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Boolean) {
            return (Boolean) o;
        }
        String s = String.valueOf(o).toLowerCase();
        if (s == 'true' || s == '1' || s == 'yes') {
            return true;
        }
        if (s == 'false' || s == '0' || s == 'no') {
            return false;
        }
        return null;
    }

    private static String coalesce(String a, String b) {
        return String.isNotBlank(a) ? a : b;
    }

    private static String trimJoin(List<String> parts) {
        List<String> out = new List<String>();
        for (String p : parts) {
            if (String.isNotBlank(p)) {
                out.add(p.trim());
            }
        }
        return String.join(out, ' ');
    }

    /**
     * Live CRM rollups for the Overview Relationship section: open Opportunity amounts and open Case counts.
     * Contact: cases on ContactId; opps on primary Account or OpportunityContactRole. Account: account-scoped.
     */
    private static void enrichOpenOppAndCaseRollups(ProfileResult r, Id recordIdVal) {
        if (r == null || recordIdVal == null) {
            return;
        }
        String obj = recordIdVal.getSObjectType().getDescribe().getName();
        if (obj != 'Contact' && obj != 'Account') {
            return;
        }
        if (!Opportunity.SObjectType.getDescribe().isAccessible() || !Case.SObjectType.getDescribe().isAccessible()) {
            return;
        }
        if (!Opportunity.Amount.getDescribe().isAccessible()) {
            return;
        }
        try {
            if (obj == 'Contact') {
                Id cid = recordIdVal;
                Id accId = null;
                for (Contact ct : [SELECT AccountId FROM Contact WHERE Id = :cid LIMIT 1]) {
                    accId = ct.AccountId;
                }
                r.openCasesCount = Database.countQuery(
                    'SELECT COUNT() FROM Case WHERE IsClosed = false AND ContactId = :cid'
                );
                Set<Id> openOppIds = new Set<Id>();
                if (accId != null) {
                    for (Opportunity oo : [
                        SELECT Id
                        FROM Opportunity
                        WHERE IsClosed = FALSE AND AccountId = :accId
                    ]) {
                        openOppIds.add(oo.Id);
                    }
                }
                for (Opportunity oc : [
                    SELECT Id
                    FROM Opportunity
                    WHERE
                        IsClosed = FALSE
                        AND Id IN (SELECT OpportunityId FROM OpportunityContactRole WHERE ContactId = :cid)
                ]) {
                    openOppIds.add(oc.Id);
                }
                if (openOppIds.isEmpty()) {
                    r.openOpportunitiesAmount = 0;
                } else {
                    List<AggregateResult> oar = [
                        SELECT SUM(Amount) amt
                        FROM Opportunity
                        WHERE Id IN :openOppIds
                    ];
                    r.openOpportunitiesAmount = (oar.isEmpty() || oar[0].get('amt') == null)
                        ? 0
                        : (Decimal) oar[0].get('amt');
                }
            } else {
                Id aid = recordIdVal;
                r.openCasesCount = Database.countQuery(
                    'SELECT COUNT() FROM Case WHERE IsClosed = false AND AccountId = :aid'
                );
                List<AggregateResult> oar = [
                    SELECT SUM(Amount) amt
                    FROM Opportunity
                    WHERE IsClosed = FALSE AND AccountId = :aid
                ];
                r.openOpportunitiesAmount = (oar.isEmpty() || oar[0].get('amt') == null)
                    ? 0
                    : (Decimal) oar[0].get('amt');
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'enrichOpenOppAndCaseRollups: ' + e.getMessage());
        }
    }

    // --- Structure tab (aligned with Business Profile widget: related accounts + key contacts) ---

    private static void enrichStructureTabForCustomer(ProfileResult r, Id recordIdVal) {
        if (r == null || recordIdVal == null) {
            return;
        }
        r.keyContacts = new List<Map<String, String>>();
        r.orgChartChildren = new List<Map<String, String>>();
        r.structureLinkedAccountsText = '';
        r.structureLinkedAccountCount = 0;
        r.structureLinkedContactsText = '';
        String prefix = String.valueOf(recordIdVal).substring(0, 3);
        if ('003'.equals(prefix)) {
            enrichStructureTabDataContact(r, recordIdVal);
        } else if ('001'.equals(prefix)) {
            // Person Account record pages pass Account Id (001). FSC households / entities are on the
            // person's Contact via ACR — same pivot as the Contact record page.
            Id personContactId = resolvePersonContactIdForStructureTab(recordIdVal);
            if (personContactId != null) {
                enrichStructureTabDataContact(r, personContactId);
            } else {
                enrichStructureTabDataAccount(r, recordIdVal);
            }
        }
    }

    /** Person Account → primary Contact Id for structure (ACR + related accounts). Null for business accounts. */
    private static Id resolvePersonContactIdForStructureTab(Id accountId) {
        if (accountId == null) {
            return null;
        }
        try {
            Schema.DescribeFieldResult pcDesc = Account.PersonContactId.getDescribe();
            if (!pcDesc.isAccessible()) {
                return null;
            }
            List<Account> rows = [
                SELECT PersonContactId
                FROM Account
                WHERE Id = :accountId
                WITH USER_MODE
                LIMIT 1
            ];
            if (rows.isEmpty() || rows[0].PersonContactId == null) {
                return null;
            }
            return rows[0].PersonContactId;
        } catch (Exception e) {
            return null;
        }
    }

    /** True when two Id strings refer to the same record (handles 15- vs 18-char forms). */
    private static Boolean sameSalesforceContactId(String a, String b) {
        if (String.isBlank(a) || String.isBlank(b)) {
            return false;
        }
        try {
            return Id.valueOf(a.trim()) == Id.valueOf(b.trim());
        } catch (Exception e) {
            return a.trim().equals(b.trim());
        }
    }

    private static void enrichStructureTabDataAccount(ProfileResult r, Id accountId) {
        if (r == null || accountId == null) {
            return;
        }
        try {
            List<Account> thinRows = [
                SELECT Type
                FROM Account
                WHERE Id = :accountId
                WITH USER_MODE
                LIMIT 1
            ];
            if (!thinRows.isEmpty() && String.isNotBlank(thinRows[0].Type)) {
                r.accountType = thinRows[0].Type;
            }
        } catch (Exception e) {
        }

        List<Map<String, String>> contacts = loadKeyContactsForAccount(accountId);
        r.keyContacts = contacts;

        List<Map<String, String>> accountNodes = loadOrgChartRelatedAccountNodes(accountId);
        r.structureLinkedAccountCount = accountNodes.size();
        r.structureLinkedAccountsText = '';
        try {
            buildOrgChartChildren(r, accountNodes, contacts);
        } catch (Exception e) {
            r.orgChartChildren = new List<Map<String, String>>();
            for (Map<String, String> an : accountNodes) {
                r.orgChartChildren.add(new Map<String, String>(an));
            }
        }

        r.structureLinkedContactsText = buildLinkedContactsSummaryText(contacts);
    }

    private static void enrichStructureTabDataContact(ProfileResult r, Id contactId) {
        if (r == null || contactId == null) {
            return;
        }
        try {
            List<Contact> cRows = [
                SELECT Id, AccountId, Title, FirstName, LastName
                FROM Contact
                WHERE Id = :contactId
                WITH USER_MODE
                LIMIT 1
            ];
            if (cRows.isEmpty()) {
                return;
            }
            Contact c = cRows[0];
            r.structureRootSublabel = String.isNotBlank(c.Title) ? c.Title : 'Contact';

            List<Map<String, String>> accountNodesRaw = loadOrgChartAccountsFromContactAcr(contactId);
            ensureContactDirectAccountOnOrgChart(c.AccountId, accountNodesRaw);
            appendAccountAccountJunctionsForContactAnchors(accountNodesRaw);
            List<Map<String, String>> accountNodes = mergeOrgChartAccountNodesForContact(accountNodesRaw);
            r.keyContacts = loadKeyContactsAcrossRelatedAccounts(accountNodes, contactId, 200);

            r.structureLinkedAccountCount = accountNodes.size();
            r.structureLinkedAccountsText = '';

            r.orgChartChildren = new List<Map<String, String>>();
            for (Map<String, String> an : accountNodes) {
                r.orgChartChildren.add(new Map<String, String>(an));
            }
            r.structureLinkedContactsText = buildLinkedContactsSummaryText(r.keyContacts);
        } catch (Exception e) {
        }
    }

    /**
     * Key contacts from every related account on the org chart (ACR + primary), deduped by Contact Id.
     * Excludes the current contact. Roles from multiple accounts are merged.
     */
    private static List<Map<String, String>> loadKeyContactsAcrossRelatedAccounts(
        List<Map<String, String>> accountNodesInOrder,
        Id excludeContactId,
        Integer maxUniqueContacts
    ) {
        List<Map<String, String>> out = new List<Map<String, String>>();
        if (accountNodesInOrder == null || accountNodesInOrder.isEmpty()) {
            return out;
        }
        Integer cap = maxUniqueContacts != null && maxUniqueContacts > 0 ? maxUniqueContacts : 200;
        Map<String, Map<String, String>> byCid = new Map<String, Map<String, String>>();
        String ex = excludeContactId != null ? String.valueOf(excludeContactId) : '';

        for (Map<String, String> an : accountNodesInOrder) {
            if (byCid.size() >= cap) {
                break;
            }
            String sid = an.get('accountId');
            if (String.isBlank(sid)) {
                continue;
            }
            Id aid;
            try {
                aid = Id.valueOf(sid.trim());
            } catch (Exception badId) {
                continue;
            }
            List<Map<String, String>> batch = loadKeyContactsForAccount(aid);
            for (Map<String, String> row : batch) {
                if (byCid.size() >= cap) {
                    break;
                }
                String cid = row.get('contactId');
                if (String.isBlank(cid)) {
                    continue;
                }
                if (String.isNotBlank(ex) && sameSalesforceContactId(cid, ex)) {
                    continue;
                }
                if (!byCid.containsKey(cid)) {
                    byCid.put(cid, new Map<String, String>(row));
                } else {
                    mergeKeyContactRowAcrossAccounts(byCid.get(cid), row);
                }
            }
        }
        out.addAll(byCid.values());
        return out;
    }

    private static void mergeKeyContactRowAcrossAccounts(Map<String, String> targetRow, Map<String, String> fromRow) {
        if (targetRow == null || fromRow == null) {
            return;
        }
        Set<String> tok = new Set<String>();
        mergeSublabelTokensIntoSet(tok, targetRow.get('acrRole'));
        mergeSublabelTokensIntoSet(tok, fromRow.get('acrRole'));
        List<String> tl = new List<String>(tok);
        tl.sort();
        if (!tl.isEmpty()) {
            targetRow.put('acrRole', String.join(tl, '; '));
        }
        if ('true'.equalsIgnoreCase(fromRow.get('isPrimary'))) {
            targetRow.put('isPrimary', 'true');
        }
        if (String.isBlank(targetRow.get('title')) && String.isNotBlank(fromRow.get('title'))) {
            targetRow.put('title', fromRow.get('title'));
        }
    }

    private class JunctionPairStruct {
        String anchorLookup;
        String otherLookup;
    }

    private static JunctionPairStruct resolveAccountJunctionPairStruct(Schema.DescribeSObjectResult od) {
        List<String> refs = new List<String>();
        for (Schema.SObjectField sf : od.fields.getMap().values()) {
            Schema.DescribeFieldResult fr = sf.getDescribe();
            if (!fr.isAccessible()) {
                continue;
            }
            if (fr.getType() != Schema.DisplayType.REFERENCE || fr.getReferenceTo().isEmpty()) {
                continue;
            }
            if (fr.getReferenceTo()[0] != Account.SObjectType) {
                continue;
            }
            refs.add(fr.getName());
        }
        if (refs.size() < 2) {
            return null;
        }
        JunctionPairStruct j = new JunctionPairStruct();
        String anchor = null;
        for (String name : refs) {
            if (name.equalsIgnoreCase('AccountId')) {
                anchor = name;
            }
        }
        j.anchorLookup = anchor != null ? anchor : refs[0];
        j.otherLookup = null;
        for (String name : refs) {
            if (name != j.anchorLookup) {
                j.otherLookup = name;
                break;
            }
        }
        return j.otherLookup == null ? null : j;
    }

    private static String resolveJunctionRoleFieldStruct(Schema.DescribeSObjectResult od) {
        List<String> tryNames = new List<String>{
            'FinServ__RelationshipType__c',
            'RelationshipType__c',
            'RelationshipType',
            'FinServ__Role__c',
            'Role__c',
            'Role'
        };
        Map<String, Schema.SObjectField> fm = od.fields.getMap();
        for (String name : tryNames) {
            if (!fm.containsKey(name)) {
                continue;
            }
            Schema.DescribeFieldResult fr = fm.get(name).getDescribe();
            if (!fr.isAccessible()) {
                continue;
            }
            Schema.DisplayType t = fr.getType();
            if (t == Schema.DisplayType.STRING ||
                t == Schema.DisplayType.PICKLIST ||
                t == Schema.DisplayType.TEXTAREA) {
                return name;
            }
        }
        return null;
    }

    private static void appendNodesFromJunctionRowsStruct(
        List<SObject> rows,
        Id accountId,
        JunctionPairStruct jp,
        Boolean anchorMatchesCurrent,
        String roleField,
        List<Map<String, String>> nodes
    ) {
        Set<Id> relIds = new Set<Id>();
        for (SObject row : rows) {
            Id rel = anchorMatchesCurrent ? (Id) row.get(jp.otherLookup) : (Id) row.get(jp.anchorLookup);
            if (rel != null && rel != accountId) {
                relIds.add(rel);
            }
        }
        Map<Id, Account> amap = new Map<Id, Account>();
        if (!relIds.isEmpty()) {
            try {
                amap.putAll([SELECT Id, Name, Type FROM Account WHERE Id IN :relIds WITH USER_MODE]);
            } catch (Exception e) {
            }
        }
        for (SObject row : rows) {
            Id rel = anchorMatchesCurrent ? (Id) row.get(jp.otherLookup) : (Id) row.get(jp.anchorLookup);
            if (rel == null || rel == accountId) {
                continue;
            }
            Account a = amap.get(rel);
            if (a == null) {
                continue;
            }
            String roleVal = null;
            if (String.isNotBlank(roleField)) {
                Object rv = row.get(roleField);
                roleVal = rv == null ? null : String.valueOf(rv);
            }
            String sub = String.isNotBlank(roleVal) ? roleVal : (String.isNotBlank(a.Type) ? a.Type : 'Related account');
            Map<String, String> m = new Map<String, String>();
            m.put('kind', 'account');
            m.put('name', a.Name != null ? a.Name : 'Account');
            m.put('sublabel', sub);
            m.put('accountId', String.valueOf(rel));
            nodes.add(m);
        }
    }

    /**
     * Contact org chart: ACR lists accounts the contact is on, but FSC "related accounts" (trusts,
     * entities, etc.) are Account–Account junction rows from those anchors. Expand each anchor
     * the same way as loadOrgChartRelatedAccountNodes does for a single account view.
     */
    private static void appendAccountAccountJunctionsForContactAnchors(List<Map<String, String>> nodes) {
        if (nodes == null || nodes.isEmpty()) {
            return;
        }
        Set<Id> anchors = new Set<Id>();
        for (Map<String, String> n : nodes) {
            if (n == null || !'account'.equalsIgnoreCase(n.get('kind'))) {
                continue;
            }
            String sid = n.get('accountId');
            if (String.isBlank(sid)) {
                continue;
            }
            try {
                anchors.add(Id.valueOf(sid.trim()));
            } catch (Exception e) {
            }
        }
        if (anchors.isEmpty()) {
            return;
        }
        List<String> ordered = new List<String>();
        for (Id aid : anchors) {
            ordered.add(String.valueOf(aid));
        }
        ordered.sort();
        Integer maxAnchors = 40;
        Integer processed = 0;
        for (String sk : ordered) {
            if (processed >= maxAnchors) {
                break;
            }
            processed++;
            try {
                appendAccountAccountJunctionNodesStruct(Id.valueOf(sk), nodes);
            } catch (Exception e) {
            }
        }
    }

    private static void appendAccountAccountJunctionNodesStruct(Id accountId, List<Map<String, String>> nodes) {
        List<String> cands = new List<String>{ 'AccountAccountRelation', 'FinServ__AccountAccountRelation__c' };
        for (String objApi : cands) {
            if (!Schema.getGlobalDescribe().containsKey(objApi)) {
                continue;
            }
            Schema.DescribeSObjectResult od = Schema.getGlobalDescribe().get(objApi).getDescribe();
            if (!od.isAccessible()) {
                continue;
            }
            JunctionPairStruct jp = resolveAccountJunctionPairStruct(od);
            if (jp == null) {
                continue;
            }
            String roleF = resolveJunctionRoleFieldStruct(od);
            String selBase = 'SELECT ' + jp.anchorLookup + ', ' + jp.otherLookup;
            if (String.isNotBlank(roleF)) {
                selBase += ', ' + roleF;
            }
            try {
                String q1 = selBase + ' FROM ' + objApi + ' WHERE ' + jp.anchorLookup + ' = :accountId LIMIT 200';
                List<SObject> rows1 = Database.queryWithBinds(
                    q1,
                    new Map<String, Object>{ 'accountId' => accountId },
                    AccessLevel.USER_MODE
                );
                appendNodesFromJunctionRowsStruct(rows1, accountId, jp, true, roleF, nodes);
            } catch (Exception e) {
            }
            try {
                String q2 = selBase + ' FROM ' + objApi + ' WHERE ' + jp.otherLookup + ' = :accountId LIMIT 200';
                List<SObject> rows2 = Database.queryWithBinds(
                    q2,
                    new Map<String, Object>{ 'accountId' => accountId },
                    AccessLevel.USER_MODE
                );
                appendNodesFromJunctionRowsStruct(rows2, accountId, jp, false, roleF, nodes);
            } catch (Exception e) {
            }
        }
    }

    private static List<Map<String, String>> loadOrgChartRelatedAccountNodes(Id accountId) {
        List<Map<String, String>> nodes = new List<Map<String, String>>();
        Set<Id> junctionAccountIds = new Set<Id>();
        appendAccountAccountJunctionNodesStruct(accountId, nodes);
        for (Map<String, String> n : nodes) {
            String aid = n.get('accountId');
            if (String.isNotBlank(aid)) {
                try {
                    junctionAccountIds.add(Id.valueOf(aid.trim()));
                } catch (Exception e) {
                }
            }
        }
        try {
            for (Account c : [
                SELECT Id, Name, Type
                FROM Account
                WHERE ParentId = :accountId
                WITH USER_MODE
                ORDER BY Name
                LIMIT 100
            ]) {
                if (junctionAccountIds.contains(c.Id)) {
                    continue;
                }
                Map<String, String> m = new Map<String, String>();
                m.put('kind', 'account');
                m.put('name', c.Name != null ? c.Name : 'Account');
                m.put('sublabel', String.isNotBlank(c.Type) ? c.Type : 'Subsidiary');
                m.put('accountId', String.valueOf(c.Id));
                nodes.add(m);
            }
        } catch (Exception e) {
        }
        return nodes;
    }

    /**
     * When ACR is empty or omits Contact.AccountId, still show the direct account on the org chart.
     */
    private static void ensureContactDirectAccountOnOrgChart(Id accountId, List<Map<String, String>> nodes) {
        if (accountId == null || nodes == null) {
            return;
        }
        String sid = String.valueOf(accountId);
        for (Map<String, String> n : nodes) {
            if (n != null && sid.equals(n.get('accountId'))) {
                return;
            }
        }
        try {
            List<Account> accs = [
                SELECT Id, Name, Type
                FROM Account
                WHERE Id = :accountId
                WITH USER_MODE
                LIMIT 1
            ];
            if (accs.isEmpty()) {
                return;
            }
            Map<String, String> m = new Map<String, String>();
            m.put('kind', 'account');
            m.put('name', accs[0].Name != null ? accs[0].Name : 'Account');
            m.put('sublabel', String.isNotBlank(accs[0].Type) ? accs[0].Type : 'Primary account');
            m.put('accountId', sid);
            m.put('isPrimary', 'true');
            nodes.add(m);
        } catch (Exception ex) {
        }
    }

    private static void mergeSublabelTokensIntoSet(Set<String> tokens, String raw) {
        if (tokens == null || String.isBlank(raw)) {
            return;
        }
        for (String part : raw.split(';')) {
            String p = part.trim();
            if (String.isBlank(p)) {
                continue;
            }
            for (String part2 : p.split(',')) {
                String t = part2.trim();
                if (String.isNotBlank(t)) {
                    tokens.add(t);
                }
            }
        }
    }

    private class OrgChartAcctMerge implements Comparable {
        public String accountId;
        public String name;
        public Set<String> roles;
        public Boolean isPrimary;

        OrgChartAcctMerge() {
            this.roles = new Set<String>();
            this.isPrimary = false;
        }

        public Integer compareTo(Object o) {
            OrgChartAcctMerge other = (OrgChartAcctMerge) o;
            Boolean p1 = this.isPrimary == true;
            Boolean p2 = other.isPrimary == true;
            if (p1 && !p2) {
                return -1;
            }
            if (!p1 && p2) {
                return 1;
            }
            String n1 = this.name != null ? this.name.toLowerCase() : '';
            String n2 = other.name != null ? other.name.toLowerCase() : '';
            return n1.compareTo(n2);
        }
    }

    /**
     * One org-chart row per Account: merges duplicate ACR rows (multi-role / multi-select) into a single sublabel.
     */
    private static List<Map<String, String>> mergeOrgChartAccountNodesForContact(List<Map<String, String>> raw) {
        List<Map<String, String>> out = new List<Map<String, String>>();
        if (raw == null || raw.isEmpty()) {
            return out;
        }
        Map<String, OrgChartAcctMerge> byId = new Map<String, OrgChartAcctMerge>();
        for (Map<String, String> n : raw) {
            if (n == null || !'account'.equalsIgnoreCase(n.get('kind'))) {
                continue;
            }
            String aid = n.get('accountId');
            if (String.isBlank(aid)) {
                continue;
            }
            String key = aid.trim();
            OrgChartAcctMerge b = byId.get(key);
            if (b == null) {
                b = new OrgChartAcctMerge();
                b.accountId = key;
                byId.put(key, b);
            }
            String nm = n.get('name');
            if (String.isNotBlank(nm)) {
                b.name = nm;
            }
            mergeSublabelTokensIntoSet(b.roles, n.get('sublabel'));
            if ('true'.equalsIgnoreCase(n.get('isPrimary'))) {
                b.isPrimary = true;
            }
        }
        List<OrgChartAcctMerge> sortList = byId.values();
        sortList.sort();
        for (OrgChartAcctMerge b : sortList) {
            Map<String, String> m = new Map<String, String>();
            m.put('kind', 'account');
            m.put('accountId', b.accountId);
            m.put('name', String.isNotBlank(b.name) ? b.name : 'Account');
            List<String> rl = new List<String>(b.roles);
            rl.sort();
            m.put('sublabel', rl.isEmpty() ? 'Related account' : String.join(rl, ', '));
            out.add(m);
        }
        return out;
    }

    private static List<Map<String, String>> loadOrgChartAccountsFromContactAcr(Id contactId) {
        List<Map<String, String>> nodes = new List<Map<String, String>>();
        if (!Schema.getGlobalDescribe().containsKey('AccountContactRelation')) {
            return nodes;
        }
        Schema.SObjectType acrT = Schema.getGlobalDescribe().get('AccountContactRelation');
        if (!acrT.getDescribe().isAccessible()) {
            return nodes;
        }
        try {
            Map<String, Schema.SObjectField> acrFm = acrT.getDescribe().fields.getMap();
            Boolean hasIsPrimary = acrFm.containsKey('IsPrimary') && acrFm.get('IsPrimary').getDescribe().isAccessible();
            Boolean hasIsActive = acrFm.containsKey('IsActive') && acrFm.get('IsActive').getDescribe().isAccessible();
            String soql =
                'SELECT AccountId, Roles' +
                (hasIsPrimary ? ', IsPrimary' : '') +
                ' FROM AccountContactRelation WHERE ContactId = :contactId ';
            if (hasIsActive) {
                soql += 'AND IsActive = true ';
            }
            soql += 'ORDER BY AccountId LIMIT 500';
            List<SObject> acrRows = Database.queryWithBinds(
                soql,
                new Map<String, Object>{ 'contactId' => contactId },
                AccessLevel.USER_MODE
            );
            Set<Id> accIds = new Set<Id>();
            for (SObject row : acrRows) {
                Id aid = (Id) row.get('AccountId');
                if (aid != null) {
                    accIds.add(aid);
                }
            }
            if (accIds.isEmpty()) {
                return nodes;
            }
            Map<Id, Account> accMap = new Map<Id, Account>(
                [
                    SELECT Id, Name, Type
                    FROM Account
                    WHERE Id IN :accIds
                    WITH USER_MODE
                ]
            );
            for (SObject row : acrRows) {
                Id aid = (Id) row.get('AccountId');
                if (aid == null || !accMap.containsKey(aid)) {
                    continue;
                }
                Account acc = accMap.get(aid);
                String aname = acc.Name != null ? acc.Name : 'Account';
                String atype = acc.Type;
                String roles = (String) row.get('Roles');
                String sub = String.isNotBlank(roles) ? roles : (String.isNotBlank(atype) ? atype : 'Related account');
                Map<String, String> m = new Map<String, String>();
                m.put('kind', 'account');
                m.put('name', aname);
                m.put('sublabel', sub);
                m.put('accountId', String.valueOf(aid));
                if (hasIsPrimary) {
                    Object ip = row.get('IsPrimary');
                    m.put('isPrimary', ip == true ? 'true' : 'false');
                }
                nodes.add(m);
            }
        } catch (Exception e) {
        }
        return nodes;
    }

    private static List<Map<String, String>> loadKeyContactsForAccount(Id accountId) {
        List<Map<String, String>> rows = new List<Map<String, String>>();
        Set<Id> seen = new Set<Id>();

        if (Schema.getGlobalDescribe().containsKey('AccountContactRelation')) {
            Schema.SObjectType acrT = Schema.getGlobalDescribe().get('AccountContactRelation');
            if (acrT.getDescribe().isAccessible()) {
                try {
                    Map<String, Schema.SObjectField> acrFm = acrT.getDescribe().fields.getMap();
                    Boolean hasIsPrimary = acrFm.containsKey('IsPrimary') && acrFm.get('IsPrimary').getDescribe().isAccessible();
                    Boolean hasIsActive = acrFm.containsKey('IsActive') && acrFm.get('IsActive').getDescribe().isAccessible();
                    String soql =
                        'SELECT ContactId, Roles' +
                        (hasIsPrimary ? ', IsPrimary' : '') +
                        ' FROM AccountContactRelation WHERE AccountId = :accountId ';
                    if (hasIsActive) {
                        soql += 'AND IsActive = true ';
                    }
                    soql += 'ORDER BY ContactId LIMIT 80';
                    List<SObject> acrRows = Database.queryWithBinds(
                        soql,
                        new Map<String, Object>{ 'accountId' => accountId },
                        AccessLevel.USER_MODE
                    );
                    Set<Id> cIds = new Set<Id>();
                    for (SObject row : acrRows) {
                        Id cid = (Id) row.get('ContactId');
                        if (cid != null) {
                            cIds.add(cid);
                        }
                    }
                    Map<Id, Contact> cmap = cIds.isEmpty()
                        ? new Map<Id, Contact>()
                        : new Map<Id, Contact>(
                              [
                                  SELECT Id, FirstName, LastName, Title
                                  FROM Contact
                                  WHERE Id IN :cIds
                                  WITH USER_MODE
                              ]
                          );
                    Integer cap = 40;
                    for (SObject row : acrRows) {
                        if (rows.size() >= cap) {
                            break;
                        }
                        Id cid = (Id) row.get('ContactId');
                        if (cid == null || seen.contains(cid)) {
                            continue;
                        }
                        Contact con = cmap.get(cid);
                        if (con == null) {
                            continue;
                        }
                        seen.add(cid);
                        Map<String, String> m = new Map<String, String>();
                        m.put('contactId', String.valueOf(cid));
                        m.put('firstName', con.FirstName);
                        m.put('lastName', con.LastName);
                        m.put('title', con.Title);
                        m.put('acrRole', (String) row.get('Roles'));
                        if (hasIsPrimary) {
                            Object ip = row.get('IsPrimary');
                            m.put('isPrimary', ip == true ? 'true' : 'false');
                        } else {
                            m.put('isPrimary', 'false');
                        }
                        rows.add(m);
                    }
                } catch (Exception e) {
                    rows.clear();
                    seen.clear();
                }
            }
        }

        if (rows.isEmpty()) {
            try {
                for (Contact c : [
                    SELECT Id, FirstName, LastName, Title
                    FROM Contact
                    WHERE AccountId = :accountId
                    WITH USER_MODE
                    ORDER BY LastName, FirstName
                    LIMIT 40
                ]) {
                    Map<String, String> m = new Map<String, String>();
                    m.put('contactId', String.valueOf(c.Id));
                    m.put('firstName', c.FirstName);
                    m.put('lastName', c.LastName);
                    m.put('title', c.Title);
                    m.put('acrRole', '');
                    m.put('isPrimary', 'false');
                    rows.add(m);
                }
            } catch (Exception e) {
            }
        }
        return rows;
    }

    private static Map<String, String> contactOrgNodeFromRow(Map<String, String> c) {
        Map<String, String> n = new Map<String, String>();
        n.put('kind', 'contact');
        String fn = c.get('firstName');
        String ln = c.get('lastName');
        String name = ((fn != null ? fn : '') + ' ' + (ln != null ? ln : '')).trim();
        n.put('name', String.isNotBlank(name) ? name : 'Contact');
        String t = c.get('title');
        String ar = c.get('acrRole');
        String sub = String.isNotBlank(t) ? t : (String.isNotBlank(ar) ? ar : 'Key contact');
        n.put('sublabel', sub);
        String cid = c.get('contactId');
        if (String.isNotBlank(cid)) {
            n.put('contactId', cid);
        }
        return n;
    }

    private static void buildOrgChartChildren(
        ProfileResult r,
        List<Map<String, String>> accountNodes,
        List<Map<String, String>> contacts
    ) {
        if (contacts == null) {
            contacts = new List<Map<String, String>>();
        }
        if (accountNodes == null) {
            accountNodes = new List<Map<String, String>>();
        }
        Map<String, String> center = null;
        for (Map<String, String> c : contacts) {
            if ('true'.equalsIgnoreCase(c.get('isPrimary'))) {
                center = contactOrgNodeFromRow(c);
                break;
            }
        }
        if (center == null) {
            for (Map<String, String> c : contacts) {
                String title = c.get('title');
                String ar = c.get('acrRole');
                String hay = ((title != null ? title : '') + ' ' + (ar != null ? ar : '')).toLowerCase();
                if (hay.contains('ceo') || hay.contains('president') || hay.contains('chief executive')) {
                    center = contactOrgNodeFromRow(c);
                    break;
                }
            }
        }
        if (center == null && !contacts.isEmpty()) {
            center = contactOrgNodeFromRow(contacts[0]);
        }

        List<Map<String, String>> row = new List<Map<String, String>>();
        for (Map<String, String> an : accountNodes) {
            row.add(new Map<String, String>(an));
        }
        if (center != null) {
            Integer n = row.size();
            Integer ins = n == 0 ? 0 : n / 2;
            List<Map<String, String>> merged = new List<Map<String, String>>();
            for (Integer j = 0; j < n; j++) {
                if (j == ins) {
                    merged.add(center);
                }
                merged.add(row[j]);
            }
            if (ins >= n) {
                merged.add(center);
            }
            r.orgChartChildren = merged;
        } else {
            r.orgChartChildren = row;
        }
    }

    private static String buildLinkedContactsSummaryText(List<Map<String, String>> contacts) {
        if (contacts == null || contacts.isEmpty()) {
            return '';
        }
        Set<String> roles = new Set<String>();
        for (Map<String, String> m : contacts) {
            String ar = m.get('acrRole');
            if (String.isNotBlank(ar)) {
                roles.add(ar.trim());
            }
        }
        Integer n = contacts.size();
        String base = n + ' contact' + (n == 1 ? '' : 's');
        if (!roles.isEmpty()) {
            List<String> rl = new List<String>(roles);
            rl.sort();
            List<String> top = new List<String>();
            Integer max = Math.min(3, rl.size());
            for (Integer i = 0; i < max; i++) {
                top.add(rl[i]);
            }
            return base + ' · ' + String.join(top, ', ');
        }
        return base + ' · RM coverage + executives';
    }

    private static String stripClosingCourtesy(String input) {
        if (String.isBlank(input)) {
            return input;
        }
        String s = input.replaceAll('(?i)\\s*' + Pattern.quote(CLOSING_PHRASE) + '\\.?\\s*', '');
        s = s.replaceAll('(\\r?\\n){3,}', '\n\n');
        return s.trim();
    }
}
