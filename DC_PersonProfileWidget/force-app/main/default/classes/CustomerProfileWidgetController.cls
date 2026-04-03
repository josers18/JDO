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
        'profilePhotoUrl'
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

        Boolean assemblyFlow =
            recordIdVal != null && String.isNotBlank(profileAssemblyFlowApiName) && !profileFlowOutMap.isEmpty();

        Boolean predFromFlow = recordIdVal != null && String.isNotBlank(flowApiName);

        Boolean sameAssemblyAndPredFlow =
            assemblyFlow &&
            predFromFlow &&
            profileAssemblyFlowApiName != null &&
            flowApiName != null &&
            profileAssemblyFlowApiName.equalsIgnoreCase(flowApiName);

        if (!assemblyFlow && predFromFlow) {
            try {
                Map<String, Object> predIn = flowInputsWithRecordIds(recordIdVal, flowRecordIdVariable, null);
                interviewForPredictions = Flow.Interview.createInterview(flowApiName, predIn);
                interviewForPredictions.start();
            } catch (Exception ignorePred) {
            }
        }

        ProfileResult core = String.isNotBlank(recordId)
            ? buildFallbackFromSoql(recordId, coreCustomFieldsJson)
            : newEmptyProfileResult();

        ProfileResult result;
        if (assemblyFlow) {
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
                applyProfileOutputsFromFlow(result, assemblyInterview, profileFlowOutMap);
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

        return result;
    }

    private static ProfileResult newEmptyProfileResult() {
        ProfileResult r = new ProfileResult();
        r.nearbyBranches = new List<BranchInfo>();
        r.financialAccounts = new List<FinancialAccountInfo>();
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

    @TestVisible
    static ProfileResult buildFallbackFromSoql(String recordId, String coreCustomFieldsJson) {
        ProfileResult r = newEmptyProfileResult();
        Id rid;
        try {
            rid = (Id) recordId;
        } catch (Exception e) {
            return r;
        }

        Map<String, String> coreCustom = parseCoreCustomMap(coreCustomFieldsJson);
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
            Map<String, Schema.SObjectField> accMap = Account.SObjectType.getDescribe().fields.getMap();
            for (String lk : coreCustom.keySet()) {
                if (!CORE_CUSTOM_LOGICAL_KEYS.contains(lk)) {
                    continue;
                }
                String api = coreCustom.get(lk);
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
            String soql = 'SELECT ' + String.join(new List<String>(selectNames), ',') + ' FROM Account WHERE Id = :rid LIMIT 1';
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
                'PhotoUrl'
            };
            Map<String, Schema.SObjectField> conMap = Contact.SObjectType.getDescribe().fields.getMap();
            for (String lk : coreCustom.keySet()) {
                if (!CORE_CUSTOM_LOGICAL_KEYS.contains(lk)) {
                    continue;
                }
                String api = coreCustom.get(lk);
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
            String soql = 'SELECT ' + String.join(new List<String>(selectNames), ',') + ' FROM Contact WHERE Id = :rid LIMIT 1';
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
            }
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

    private static String stripClosingCourtesy(String input) {
        if (String.isBlank(input)) {
            return input;
        }
        String s = input.replaceAll('(?i)\\s*' + Pattern.quote(CLOSING_PHRASE) + '\\.?\\s*', '');
        s = s.replaceAll('(\\r?\\n){3,}', '\n\n');
        return s.trim();
    }
}
