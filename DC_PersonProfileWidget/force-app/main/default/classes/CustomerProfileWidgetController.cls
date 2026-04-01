/**
 * Data Cloud Data Graph + optional Flow + SOQL fallback for customerProfileWidget LWC.
 */
public with sharing class CustomerProfileWidgetController {
    private static final String CLOSING_PHRASE = 'Thank you for your attention to this comprehensive review';

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
        @AuraEnabled
        public String predictionLabel;
        @AuraEnabled
        public String recommendationsJson;
    }

    @AuraEnabled
    public static ProfileResult getProfileData(
        String graphApiName,
        String recordId,
        String fieldMappingsJson,
        String flowApiName,
        String flowRecordIdVariable,
        String flowPredictionVariable,
        String flowRecommendationsVariable,
        String recordIdFieldName
    ) {
        Map<String, String> fieldMap = parseFieldMappings(fieldMappingsJson);
        ProfileResult result = new ProfileResult();
        result.nearbyBranches = new List<BranchInfo>();

        if (String.isNotBlank(graphApiName) && String.isNotBlank(recordId)) {
            try {
                Map<String, Object> graphRoot = fetchDataGraphRecord(graphApiName, recordId, recordIdFieldName);
                if (graphRoot != null && !graphRoot.isEmpty()) {
                    applyFieldMappings(result, graphRoot, fieldMap);
                }
            } catch (Exception e) {
                throw new AuraHandledException(
                    'Data Graph request failed. Confirm Named Credential DataCloud and graph API name. ' + e.getMessage()
                );
            }
        }

        if (String.isNotBlank(recordId)) {
            result = mergeEnrich(result, buildFallbackFromSoql(recordId, fieldMap));
        }

        if (String.isNotBlank(flowApiName) && String.isNotBlank(recordId)) {
            try {
                mergeFlowOutputs(
                    result,
                    flowApiName,
                    (Id) recordId,
                    flowRecordIdVariable,
                    flowPredictionVariable,
                    flowRecommendationsVariable
                );
            } catch (Exception e) {
                /* Flow optional enrichment */
            }
        }

        return result;
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

    @TestVisible
    static ProfileResult buildFallbackFromSoql(String recordId, Map<String, String> fieldMap) {
        ProfileResult r = new ProfileResult();
        r.nearbyBranches = new List<BranchInfo>();
        Id rid;
        try {
            rid = (Id) recordId;
        } catch (Exception e) {
            return r;
        }

        String obj = rid.getSObjectType().getDescribe().getName();
        if (obj == 'Account') {
            List<Account> rows = [
                SELECT
                    Name,
                    BillingStreet,
                    BillingCity,
                    BillingState,
                    BillingPostalCode,
                    Phone,
                    Industry,
                    NumberOfEmployees,
                    AnnualRevenue,
                    Website
                FROM Account
                WHERE Id = :rid
                LIMIT 1
            ];
            if (!rows.isEmpty()) {
                Account a = rows[0];
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
            }
        } else if (obj == 'Contact') {
            List<Contact> rows = [
                SELECT FirstName, LastName, MailingCity, MailingState, Phone, Email
                FROM Contact
                WHERE Id = :rid
                LIMIT 1
            ];
            if (!rows.isEmpty()) {
                Contact c = rows[0];
                r.fullName = trimJoin(new List<String>{ c.FirstName, c.LastName });
                r.city = c.MailingCity;
                r.state = c.MailingState;
                r.billingCity = c.MailingCity;
                r.billingState = c.MailingState;
                r.phone = c.Phone;
                r.email = c.Email;
            }
        }
        return r;
    }

    private static Map<String, String> parseFieldMappings(String jsonStr) {
        if (String.isBlank(jsonStr)) {
            return new Map<String, String>();
        }
        try {
            return (Map<String, String>) JSON.deserialize(jsonStr, Map<String, String>.class);
        } catch (Exception e) {
            return new Map<String, String>();
        }
    }

    private static Map<String, Object> fetchDataGraphRecord(
        String graphApiName,
        String recordId,
        String recordIdFieldName
    ) {
        String encGraph = EncodingUtil.urlEncode(graphApiName, 'UTF-8');
        String encRec = EncodingUtil.urlEncode(recordId, 'UTF-8');
        String path =
            '/services/data/v62.0/ssot/data-graph/' +
            encGraph +
            '/records/' +
            encRec;

        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:DataCloud' + path);
        req.setMethod('GET');
        req.setTimeout(120000);

        Http http = new Http();
        HttpResponse res = http.send(req);
        if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
            throw new CalloutException('HTTP ' + res.getStatusCode() + ': ' + res.getBody());
        }
        Object bodyObj = JSON.deserializeUntyped(res.getBody());
        return unwrapGraphRoot(bodyObj);
    }

    private static Map<String, Object> unwrapGraphRoot(Object bodyObj) {
        if (bodyObj == null) {
            return new Map<String, Object>();
        }
        if (bodyObj instanceof Map<String, Object>) {
            Map<String, Object> m = (Map<String, Object>) bodyObj;
            if (m.containsKey('record') && m.get('record') instanceof Map<String, Object>) {
                return (Map<String, Object>) m.get('record');
            }
            if (m.containsKey('data') && m.get('data') instanceof Map<String, Object>) {
                return (Map<String, Object>) m.get('data');
            }
            return m;
        }
        return new Map<String, Object>();
    }

    private static void applyFieldMappings(ProfileResult r, Map<String, Object> root, Map<String, String> fieldMap) {
        String fn = stringVal(getMapped(root, fieldMap, 'firstName'));
        String ln = stringVal(getMapped(root, fieldMap, 'lastName'));
        if (String.isNotBlank(fn) || String.isNotBlank(ln)) {
            r.fullName = trimJoin(new List<String>{ fn, ln });
        }
        if (String.isBlank(r.fullName)) {
            r.fullName = stringVal(getMapped(root, fieldMap, 'fullName'));
        }

        r.city = coalesce(r.city, stringVal(getMapped(root, fieldMap, 'city')));
        r.state = coalesce(r.state, stringVal(getMapped(root, fieldMap, 'state')));
        r.billingCity = coalesce(r.billingCity, r.city);
        r.billingState = coalesce(r.billingState, r.state);
        r.industry = stringVal(getMapped(root, fieldMap, 'industry'));
        r.employees = intVal(getMapped(root, fieldMap, 'employees'));
        r.phone = stringVal(getMapped(root, fieldMap, 'phone'));
        r.email = stringVal(getMapped(root, fieldMap, 'email'));
        r.website = stringVal(getMapped(root, fieldMap, 'website'));
        r.revenue = decVal(getMapped(root, fieldMap, 'revenue'));
        r.tierSegment = stringVal(getMapped(root, fieldMap, 'tierSegment'));
        r.propensityScore = decVal(getMapped(root, fieldMap, 'propensityScore'));
        r.engagementScore = decVal(getMapped(root, fieldMap, 'engagementScore'));
        r.churnScore = decVal(getMapped(root, fieldMap, 'churnScore'));
        r.ltvScore = decVal(getMapped(root, fieldMap, 'ltvScore'));
        r.investmentBalance = decVal(getMapped(root, fieldMap, 'investmentBalance'));
        r.loanBalance = decVal(getMapped(root, fieldMap, 'loanBalance'));
        r.depositYtd = decVal(getMapped(root, fieldMap, 'depositYtd'));
        r.loanLimit = decVal(getMapped(root, fieldMap, 'loanLimit'));
        r.riskProfile = stringVal(getMapped(root, fieldMap, 'riskProfile'));
        r.customerSince = stringVal(getMapped(root, fieldMap, 'customerSince'));
        r.lastInteractionDate = stringVal(getMapped(root, fieldMap, 'lastInteraction'));
        r.mobileEnrolled = boolVal(getMapped(root, fieldMap, 'mobileEnrolled'));
        r.onlineEnrolled = boolVal(getMapped(root, fieldMap, 'onlineEnrolled'));
        r.kycStatus = stringVal(getMapped(root, fieldMap, 'kycStatus'));
        r.twoFaStatus = stringVal(getMapped(root, fieldMap, 'twoFaStatus'));
        r.paperlessEnrolled = boolVal(getMapped(root, fieldMap, 'paperlessEnrolled'));
        r.alertsEnrolled = boolVal(getMapped(root, fieldMap, 'alertsEnrolled'));
        r.wireEnabled = boolVal(getMapped(root, fieldMap, 'wireEnabled'));
        r.billingStreet = stringVal(getMapped(root, fieldMap, 'street'));
        r.billingPostalCode = stringVal(getMapped(root, fieldMap, 'zip'));
        r.assignedBranch = stringVal(getMapped(root, fieldMap, 'assignedBranch'));
        r.assignedBranchDistance = stringVal(getMapped(root, fieldMap, 'branchDistance'));

        Object branchesObj = getMapped(root, fieldMap, 'nearbyBranches');
        if (branchesObj instanceof List<Object>) {
            for (Object o : (List<Object>) branchesObj) {
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
    }

    private static Object getMapped(Map<String, Object> root, Map<String, String> fieldMap, String logicalKey) {
        if (fieldMap == null || !fieldMap.containsKey(logicalKey)) {
            return null;
        }
        String path = fieldMap.get(logicalKey);
        if (String.isBlank(path)) {
            return null;
        }
        return getByPath(root, path.trim());
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
            } else {
                return null;
            }
        }
        return cur;
    }

    private static ProfileResult mergeEnrich(ProfileResult p, ProfileResult s) {
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
        if (p.nearbyBranches == null) {
            p.nearbyBranches = new List<BranchInfo>();
        }
        if (p.nearbyBranches.isEmpty() && s.nearbyBranches != null && !s.nearbyBranches.isEmpty()) {
            p.nearbyBranches.addAll(s.nearbyBranches);
        }
        return p;
    }

    private static void mergeFlowOutputs(
        ProfileResult r,
        String flowApiName,
        Id recordId,
        String flowRecordIdVariable,
        String flowPredictionVariable,
        String flowRecommendationsVariable
    ) {
        String recordVar = String.isBlank(flowRecordIdVariable) ? 'recordId' : flowRecordIdVariable;
        String predVar = String.isBlank(flowPredictionVariable) ? 'prediction' : flowPredictionVariable;
        String recVar = String.isBlank(flowRecommendationsVariable) ? 'recommendations' : flowRecommendationsVariable;

        Map<String, Object> inputs = new Map<String, Object>();
        inputs.put(recordVar, recordId);

        Flow.Interview interview = Flow.Interview.createInterview(flowApiName, inputs);
        interview.start();

        Object pred = interview.getVariableValue(predVar);
        if (pred != null) {
            if (pred instanceof String) {
                r.predictionLabel = stripClosingCourtesy(((String) pred).trim());
            } else {
                r.predictionLabel = stripClosingCourtesy(String.valueOf(pred).trim());
            }
        }

        r.recommendationsJson = flowOutputToJsonString(resolveFlowOutput(interview, recVar));
    }

    private static Object resolveFlowOutput(Flow.Interview interview, String apiName) {
        if (String.isBlank(apiName)) {
            return null;
        }
        String trimmed = apiName.trim();
        Object value = interview.getVariableValue(trimmed);
        if (value != null) {
            return value;
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
