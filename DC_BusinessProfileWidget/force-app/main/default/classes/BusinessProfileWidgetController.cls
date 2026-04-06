public with sharing class BusinessProfileWidgetController {

    private static final String CLOSING_PHRASE = 'Thank you for your attention to this comprehensive review';

    /** Filled during {@link #mergeAgentforceSummaryFromPromptTemplate} when Einstein returns no text (cleared each merge). */
    private static String overviewAgentforceEinsteinDiagnostic;

    /**
     * When fieldFounded is not mapped (blank), try these Account API names in order so the widget still shows a year
     * if the org stores it under a common custom field (demo / FSC-style names).
     */
    private static final List<String> FOUNDED_FIELD_CANDIDATES = new List<String>{
        'Founded_Date__c',
        'Founded_Year__c',
        'Year_Founded__c',
        'YearFounded__c',
        'Founded__c',
        'Established_Year__c',
        'Date_Founded__c',
        'Establish_Date__c',
        'Incorporation_Date__c',
        'Incorporation_Year__c',
        'Company_Founded_Year__c',
        'Biz_Founded_Year__c',
        'FinServ__YearFounded__c',
        'FinServ__YearEstablished__c',
        'vlocity_cmt__YearFounded__c',
        'CreatedDate'
    };

    /** Resolved Account SELECT paths for auto-founded (static + label-based describe). */
    private static List<String> resolvedFoundedCandidatePaths() {
        List<String> paths = new List<String>();
        Set<String> seen = new Set<String>();
        for (String cand : FOUNDED_FIELD_CANDIDATES) {
            String canon = validateAccountFieldPath(cand);
            if (canon != null && !seen.contains(canon)) {
                seen.add(canon);
                paths.add(canon);
            }
        }
        Map<String, Schema.SObjectField> fm = Account.SObjectType.getDescribe().fields.getMap();
        for (Schema.SObjectField sf : fm.values()) {
            Schema.DescribeFieldResult d = sf.getDescribe();
            if (!d.isAccessible()) {
                continue;
            }
            Schema.DisplayType t = d.getType();
            if (t == Schema.DisplayType.REFERENCE || t == Schema.DisplayType.BOOLEAN || t == Schema.DisplayType.ID) {
                continue;
            }
            String lbl = d.getLabel();
            if (String.isBlank(lbl)) {
                continue;
            }
            String l = lbl.toLowerCase();
            Boolean labelMatch =
                l.contains('founded') ||
                l.contains('year established') ||
                (l.contains('incorporation') && (l.contains('date') || l.contains('year')));
            if (!labelMatch) {
                continue;
            }
            String canon = d.getName();
            if (!seen.contains(canon)) {
                seen.add(canon);
                paths.add(canon);
            }
        }
        return paths;
    }

    /**
     * When fieldWalletCapture is not mapped, try these Account API names, then label-based describe (same pattern as founded).
     */
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
            if (canon != null && !seen.contains(canon)) {
                seen.add(canon);
                paths.add(canon);
            }
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
            if (!seen.contains(canon)) {
                seen.add(canon);
                paths.add(canon);
            }
        }
        return paths;
    }

    private static Boolean hasValidExplicitLastUsedChannelPath(Map<String, String> fieldMappings) {
        if (fieldMappings == null) {
            return false;
        }
        String v = fieldMappings.get('fieldWalletCapture');
        if (String.isBlank(v) || isFlowToken(v)) {
            return false;
        }
        return validateAccountFieldPath(v.trim()) != null;
    }

    private static void mergeLastUsedChannelCandidatesIntoSelect(Set<String> selectParts) {
        if (selectParts == null) {
            return;
        }
        for (String canon : resolvedLastUsedChannelCandidatePaths()) {
            selectParts.add(canon);
        }
    }

    /**
     * Human-readable value for Overview "Last used channel" (picklist API value → label like the record detail UI).
     */
    private static String displayValueForAccountField(SObject row, String canonicalPath) {
        if (row == null || String.isBlank(canonicalPath)) {
            return null;
        }
        Object o = getFieldValueByPath(row, canonicalPath);
        if (o == null) {
            return null;
        }
        List<String> parts = canonicalPath.split('\\.', 0);
        Schema.SObjectType curType = Account.SObjectType;
        SObject curRow = row;
        Schema.DescribeFieldResult leaf = null;
        for (Integer i = 0; i < parts.size(); i++) {
            String p = parts[i];
            Map<String, Schema.SObjectField> fm = curType.getDescribe().fields.getMap();
            Schema.SObjectField f = findFieldByToken(fm, p);
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
            curType = d.getReferenceTo()[0];
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

    private static void applyLastUsedChannelFromAccount(
        BusinessProfileResult r,
        Map<String, String> fieldMappings,
        Account acc
    ) {
        if (r == null || acc == null) {
            return;
        }
        List<String> paths = new List<String>();
        if (hasValidExplicitLastUsedChannelPath(fieldMappings)) {
            paths.add(validateAccountFieldPath(fieldMappings.get('fieldWalletCapture').trim()));
        }
        for (String c : resolvedLastUsedChannelCandidatePaths()) {
            if (!paths.contains(c)) {
                paths.add(c);
            }
        }
        for (String path : paths) {
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

    @AuraEnabled(cacheable = false)
    public static String getProfileData(
        String recordId,
        String fieldMappingsJson,
        String flowApiName,
        String flowRecordIdVariable,
        String insightFlowApiName,
        String insightFlowRecordIdVariable,
        String flowPredictionVariable,
        String flowRecommendationsVariable,
        Boolean geocodeBillingAddress,
        Integer pipelineOpportunityLimit
    ) {
        if (String.isBlank(recordId)) {
            throw new AuraHandledException('Record Id is required.');
        }
        Map<String, String> fieldMappings = new Map<String, String>();
        if (!String.isBlank(fieldMappingsJson)) {
            fieldMappings = (Map<String, String>) JSON.deserialize(fieldMappingsJson, Map<String, String>.class);
        }
        Id accId = (Id) recordId;

        Boolean anyFlowMapping = false;
        for (String mapVal : fieldMappings.values()) {
            if (isFlowToken(mapVal)) {
                anyFlowMapping = true;
                break;
            }
        }

        BusinessProfileResult profile = buildFromSoql(recordId, fieldMappings);
        if (anyFlowMapping && String.isBlank(flowApiName)) {
            profile.assemblyFlowHint =
                'Set Profile assembly Flow API name on this component. Without it, flow: field mappings (including interest expense) are not applied.';
        }

        Flow.Interview fieldInterview = mergeFlowIntoProfile(profile, fieldMappings, flowApiName, accId, flowRecordIdVariable);

        if (anyFlowMapping && String.isNotBlank(flowApiName) && fieldInterview == null && profile.assemblyFlowHint == null) {
            profile.assemblyFlowHint =
                'Assembly flow did not complete successfully; flow: values may be missing. Check Flow fault emails and Apex debug logs.';
        }

        applyInterestExpenseFlowHintIfNeeded(profile, fieldMappings, fieldInterview);
        mergeInsightFromFlow(
            profile,
            accId,
            flowApiName,
            fieldInterview,
            insightFlowApiName,
            insightFlowRecordIdVariable,
            flowPredictionVariable,
            flowRecommendationsVariable
        );
        try {
            enrichStructureTabData(accId, profile);
        } catch (Exception e) {
            if (profile.keyContacts == null) {
                profile.keyContacts = new List<Map<String, String>>();
            }
            if (profile.orgChartChildren == null) {
                profile.orgChartChildren = new List<Map<String, String>>();
            }
            applySubsidiariesCountFromRelatedAccounts(accId, profile);
        }
        try {
            enrichActiveFinancialAccountsAndPipeline(accId, profile, pipelineOpportunityLimit);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'BusinessProfileWidget live rollups failed: ' + e.getMessage());
        }
        Boolean allowGeocode = geocodeBillingAddress == null || geocodeBillingAddress == true;
        if (allowGeocode && !Test.isRunningTest()) {
            applyGeocodeIfNeeded(profile);
        }
        resolvePrimaryRmIfUserId(profile);
        return JSON.serialize(profile);
    }

    /**
     * Overview Agentforce summary in a separate Apex request from {@link #getProfileData}. Matches Execute Anonymous
     * isolation: the heavy profile transaction (flows, rollups, geocoding) is not mixed with Einstein Connect in the
     * same execution, which can otherwise return empty generations for the same user and template.
     */
    @AuraEnabled(cacheable = false)
    public static String getAgentforceOverviewSummary(
        String recordId,
        String agentforceSummaryPromptTemplateId,
        String agentforceSummaryPromptInputApiName
    ) {
        if (String.isBlank(recordId)) {
            throw new AuraHandledException('Record Id is required.');
        }
        String tmpl = sanitizeEinsteinTemplateRef(agentforceSummaryPromptTemplateId);
        if (String.isBlank(tmpl)) {
            return JSON.serialize(
                new Map<String, Object>{ 'agentforceSummary' => null, 'agentforceSummaryPromptHint' => '' }
            );
        }
        Id accId;
        try {
            accId = (Id) recordId;
        } catch (Exception badId) {
            throw new AuraHandledException('Invalid record Id.');
        }
        if (accId.getSobjectType() != Account.SObjectType) {
            return JSON.serialize(
                new Map<String, Object>{
                    'agentforceSummary' => null,
                    'agentforceSummaryPromptHint' =>
                        'Overview Agentforce summary expects an Account record (Id prefix 001). This page record is '
                        + accId.getSobjectType().getDescribe().getName()
                        + '. Use an Account record page or a template wired to that object.'
                }
            );
        }
        BusinessProfileResult shell = new BusinessProfileResult();
        mergeAgentforceSummaryFromPromptTemplate(shell, accId, tmpl, agentforceSummaryPromptInputApiName);
        return JSON.serialize(
            new Map<String, Object>{
                'agentforceSummary' => shell.agentforceSummary,
                'agentforceSummaryPromptHint' => shell.agentforceSummaryPromptHint == null
                    ? ''
                    : shell.agentforceSummaryPromptHint
            }
        );
    }

    private static void resolvePrimaryRmIfUserId(BusinessProfileResult r) {
        if (r == null || String.isBlank(r.primaryRm)) {
            return;
        }
        String resolved = resolveUserIdToName(r.primaryRm.trim());
        if (String.isNotBlank(resolved) && resolved != r.primaryRm) {
            r.primaryRm = resolved;
        }
    }

    /**
     * When the mapped value is a User Id (005…), replace with User.Name for display.
     */
    private static String resolveUserIdToName(String raw) {
        if (String.isBlank(raw)) {
            return raw;
        }
        String t = raw.trim();
        if (t.length() != 15 && t.length() != 18) {
            return raw;
        }
        Id uid;
        try {
            uid = (Id) t;
        } catch (Exception e) {
            return raw;
        }
        if (uid.getSobjectType() != User.SObjectType) {
            return raw;
        }
        List<User> users = [SELECT Name FROM User WHERE Id = :uid WITH SECURITY_ENFORCED LIMIT 1];
        return users.isEmpty() ? raw : users[0].Name;
    }

    /** Year from Date/Datetime, integer year, or yyyy-mm-dd / ISO date strings (for “founded” mappings). */
    private static Integer foundedYearFromObject(Object o) {
        if (o == null) {
            return null;
        }
        try {
            if (o instanceof Date) {
                return ((Date) o).year();
            }
            if (o instanceof Datetime) {
                return ((Datetime) o).date().year();
            }
            if (o instanceof Integer) {
                return (Integer) o;
            }
            if (o instanceof Long) {
                return Integer.valueOf(String.valueOf((Long) o));
            }
            if (o instanceof Decimal) {
                return ((Decimal) o).intValue();
            }
        } catch (Exception e) {
            return null;
        }
        String s = String.valueOf(o).trim();
        if (String.isBlank(s)) {
            return null;
        }
        Matcher m = Pattern.compile('^(\\d{4})-\\d{2}-\\d{2}').matcher(s);
        if (m.find()) {
            try {
                return Integer.valueOf(m.group(1));
            } catch (Exception e) {
            }
        }
        Matcher mUs = Pattern.compile('^(\\d{1,2})/(\\d{1,2})/(\\d{4})\\b').matcher(s);
        if (mUs.find()) {
            try {
                return Integer.valueOf(mUs.group(3));
            } catch (Exception e) {
            }
        }
        Matcher mEu = Pattern.compile('^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})\\b').matcher(s);
        if (mEu.find()) {
            try {
                return Integer.valueOf(mEu.group(3));
            } catch (Exception e) {
            }
        }
        Matcher mYearWord = Pattern.compile('\\b(19|20)\\d{2}\\b').matcher(s);
        if (mYearWord.find()) {
            try {
                return Integer.valueOf(mYearWord.group(0));
            } catch (Exception e) {
            }
        }
        try {
            return Integer.valueOf(s);
        } catch (Exception e) {
        }
        return null;
    }

    /** Strip BOM / zero-width characters from a Prompt Template developer name or Id pasted from the UI. */
    private static String sanitizeEinsteinTemplateRef(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim().replaceFirst('^\\uFEFF', '');
        s = s.replaceAll('[\\u200B-\\u200D\\uFEFF]', '');
        return s.trim();
    }

    /**
     * Overview Agentforce summary: invokes the configured Einstein prompt template with the Account Id.
     * <p>Templates such as {@code DC_AccountSummary_widget} require <strong>one Connect call</strong> with
     * <strong>both</strong> {@code Input:Account.Id} (Id string) and {@code Input:Account} (record map/stub).
     * If App Builder lists only {@code Input:Account}, Apex pairs it with {@code Input:Account.Id}. It never sends
     * object-only {@code Input:Account} (that produces "null for item Input:Account").</p>
     * On failure or empty completion, sets {@link BusinessProfileResult#agentforceSummaryPromptHint} for the LWC.
     */
    private static void mergeAgentforceSummaryFromPromptTemplate(
        BusinessProfileResult profile,
        Id accountId,
        String promptTemplateId,
        String promptInputApiName
    ) {
        String cleanedTemplate = sanitizeEinsteinTemplateRef(promptTemplateId);
        if (profile == null || String.isBlank(cleanedTemplate) || accountId == null) {
            return;
        }
        String configured = String.isBlank(promptInputApiName) ? 'Input:Account.Id' : promptInputApiName.trim();
        String idKey;
        String objKey;
        if (einsteinPromptInputLooksLikeRecordIdField(configured)) {
            idKey = configured;
            objKey = einsteinRecordInputParamKeyForPrompt(configured);
        } else {
            objKey = configured;
            idKey = configured + '.Id';
        }
        overviewAgentforceEinsteinDiagnostic = null;
        try {
            // Same inputs as scripts/anon_test_prompt.apex — runs first so a wrong App Builder "input API name"
            // does not prevent Record Snapshot templates that expect Input:Account.Id + Input:Account.
            String text = tryEinsteinOverviewAnonParity(cleanedTemplate, accountId);
            if (String.isNotBlank(text)) {
                profile.agentforceSummary = text;
                return;
            }
            text = tryEinsteinAccountSummaryDualInputCombinations(
                cleanedTemplate,
                idKey,
                objKey,
                accountId
            );
            if (String.isNotBlank(text)) {
                profile.agentforceSummary = text;
                return;
            }
            // Do not call Connect with Id string only (Input:Account.Id without Input:Account) — templates with
            // Record Snapshot throw "null for item Input:Account" and overwrite useful dual-attempt diagnostics.
            profile.agentforceSummaryPromptHint =
                'Einstein returned no summary text. Confirm the template is active, a model is assigned, and the running user has Einstein / Prompt Template access. '
                + 'App Builder: Input:Account.Id or Input:Account both work.';
            if (!String.isBlank(overviewAgentforceEinsteinDiagnostic)) {
                profile.agentforceSummaryPromptHint +=
                    ' Detail: ' + overviewAgentforceEinsteinDiagnostic;
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Business profile Agentforce summary prompt failed: ' + e.getMessage());
            profile.agentforceSummaryPromptHint =
                'Prompt invocation failed: ' + truncateForUiHint(e.getMessage(), 220);
        }
    }

    /**
     * Mirrors {@code scripts/anon_test_prompt.apex}: fixed {@code Input:Account.Id} + {@code Input:Account} map and
     * {@code PromptTemplateGenerationsInvocable} only.
     */
    private static String tryEinsteinOverviewAnonParity(String promptTemplateId, Id accountId) {
        String idStr = String.valueOf(accountId);
        ConnectApi.WrappedValue wId = new ConnectApi.WrappedValue();
        wId.value = idStr;
        ConnectApi.WrappedValue wObj = new ConnectApi.WrappedValue();
        wObj.value = new Map<String, Object>{ 'Id' => accountId };
        Map<String, ConnectApi.WrappedValue> vm = new Map<String, ConnectApi.WrappedValue>();
        vm.put('Input:Account.Id', wId);
        vm.put('Input:Account', wObj);
        return invokeEinsteinPromptTemplateMultiParam(
            promptTemplateId,
            vm,
            'PromptTemplateGenerationsInvocable',
            true
        );
    }

    /**
     * Record Snapshot templates often need <strong>both</strong> the field Id ({@code Input:Account.Id} string) and the
     * object slot ({@code Input:Account} map/stub) in one {@code generateMessagesForPromptTemplate} call; supplying only
     * one can surface "Invalid input value: null for item Input:Account".
     */
    private static String tryEinsteinAccountSummaryDualInputCombinations(
        String promptTemplateId,
        String idInputApiName,
        String objectInputApiName,
        Id accountId
    ) {
        String idStr = String.valueOf(accountId);
        List<Object> objectPayloads = einsteinRecordWrappedPayloadCandidates(accountId);
        List<String> applicationNames = new List<String>{
            'PromptTemplateGenerationsInvocable',
            'PromptBuilderPreview'
        };
        for (String appName : applicationNames) {
            for (Object objPayload : objectPayloads) {
                try {
                    Map<String, ConnectApi.WrappedValue> vm = new Map<String, ConnectApi.WrappedValue>();
                    vm.put(idInputApiName, einsteinWrapValue(idStr));
                    vm.put(objectInputApiName, einsteinWrapValue(objPayload));
                    String t = invokeEinsteinPromptTemplateMultiParam(promptTemplateId, vm, appName, true);
                    if (String.isNotBlank(t)) {
                        return t;
                    }
                } catch (Exception e) {
                    overviewAgentforceEinsteinDiagnostic = truncateForUiHint(e.getMessage(), 220);
                    System.debug(LoggingLevel.FINE, 'Einstein dual prompt attempt skipped: ' + e.getMessage());
                }
            }
        }
        return null;
    }

    private static ConnectApi.WrappedValue einsteinWrapValue(Object value) {
        ConnectApi.WrappedValue w = new ConnectApi.WrappedValue();
        w.value = value;
        return w;
    }

    private static String invokeEinsteinPromptTemplateMultiParam(
        String promptTemplateId,
        Map<String, ConnectApi.WrappedValue> valueMap
    ) {
        return invokeEinsteinPromptTemplateMultiParam(
            promptTemplateId,
            valueMap,
            'PromptTemplateGenerationsInvocable',
            false
        );
    }

    private static String invokeEinsteinPromptTemplateMultiParam(
        String promptTemplateId,
        Map<String, ConnectApi.WrappedValue> valueMap,
        String applicationName
    ) {
        return invokeEinsteinPromptTemplateMultiParam(promptTemplateId, valueMap, applicationName, false);
    }

    private static String invokeEinsteinPromptTemplateMultiParam(
        String promptTemplateId,
        Map<String, ConnectApi.WrappedValue> valueMap,
        String applicationName,
        Boolean recordOverviewDiagnostic
    ) {
        ConnectApi.EinsteinPromptTemplateGenerationsInput promptInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
        promptInput.isPreview = false;

        ConnectApi.EinsteinLlmAdditionalConfigInput extra = new ConnectApi.EinsteinLlmAdditionalConfigInput();
        extra.numGenerations = 1;
        extra.applicationName = applicationName;
        // Do not set enablePiiMasking here: scripts/anon_test_prompt.apex does not, and turning it on has been
        // observed to yield empty generations while the same template + user succeeds anonymously.
        promptInput.additionalConfig = extra;
        promptInput.inputParams = valueMap;

        ConnectApi.EinsteinPromptTemplateGenerationsRepresentation output = new EinsteinOverviewConnectBridge()
            .generate(promptTemplateId, promptInput);

        if (output == null) {
            if (recordOverviewDiagnostic == true) {
                overviewAgentforceEinsteinDiagnostic = 'Einstein Connect returned no output object.';
            }
            return null;
        }
        if (output.generations == null || output.generations.isEmpty()) {
            if (recordOverviewDiagnostic == true) {
                String payloadSnippet = '';
                try {
                    payloadSnippet = truncateForUiHint(JSON.serialize(output), 420);
                } catch (Exception serEx) {
                    payloadSnippet = truncateForUiHint(String.valueOf(output), 220);
                }
                overviewAgentforceEinsteinDiagnostic =
                    'Zero generations. Compare template id/API name to Execute Anonymous; Connect response: '
                    + (String.isBlank(payloadSnippet) ? '(unserializable)' : payloadSnippet);
            }
            return null;
        }
        ConnectApi.EinsteinLLMGenerationItemOutput first = output.generations[0];
        String raw = first != null ? first.text : null;
        if (String.isBlank(raw)) {
            if (recordOverviewDiagnostic == true) {
                overviewAgentforceEinsteinDiagnostic = 'Generation text was blank (trust layer or model refusal).';
            }
            return null;
        }
        return stripClosingCourtesy(raw);
    }

    /** True when App Builder / template uses a merge field style name ending in {@code .Id} (scalar Id string to Connect). */
    private static Boolean einsteinPromptInputLooksLikeRecordIdField(String configuredInputApiName) {
        if (String.isBlank(configuredInputApiName)) {
            return false;
        }
        String t = configuredInputApiName.trim();
        return t.length() > 4 && t.substring(t.length() - 4).equalsIgnoreCase('.Id');
    }

    /**
     * Object-style input key (e.g. {@code Input:Account}). When the configured name is {@code Input:Account.Id},
     * Prompt Builder often still registers a separate object slot {@code Input:Account} for Record Snapshot — but
     * some templates only have the {@code .Id} field input; {@link #mergeAgentforceSummaryFromPromptTemplate} tries that first.
     */
    private static String einsteinRecordInputParamKeyForPrompt(String configuredInputApiName) {
        if (String.isBlank(configuredInputApiName)) {
            return 'Input:Account';
        }
        String t = configuredInputApiName.trim();
        if (t.length() > 4 && t.substring(t.length() - 4).equalsIgnoreCase('.Id')) {
            return t.substring(0, t.length() - 4);
        }
        return t;
    }

    private static String truncateForUiHint(String message, Integer maxLen) {
        if (String.isBlank(message)) {
            return '';
        }
        String m = message.trim().replaceAll('\\s+', ' ');
        if (m.length() <= maxLen) {
            return m;
        }
        return m.substring(0, maxLen - 1) + '\u2026';
    }

    private static List<Object> einsteinRecordWrappedPayloadCandidates(Id accountId) {
        List<Object> out = new List<Object>();
        out.add((Object) new Map<String, Object>{ 'Id' => accountId });
        out.add((Object) new Account(Id = accountId));
        out.add((Object) new Map<String, String>{ 'id' => String.valueOf(accountId) });
        return out;
    }

    /** Einstein text input (e.g. Insight JSON) — value is a string assigned to {@link ConnectApi.WrappedValue#value}. */
    private static String invokeEinsteinPromptTemplateForContext(
        String promptTemplateId,
        String promptInputApiName,
        String inputParamValue
    ) {
        return invokeEinsteinPromptTemplateMultiParam(
            promptTemplateId,
            new Map<String, ConnectApi.WrappedValue>{ promptInputApiName => einsteinWrapValue(inputParamValue) }
        );
    }

    private static void applyInterestExpenseFlowHintIfNeeded(
        BusinessProfileResult profile,
        Map<String, String> fieldMappings,
        Flow.Interview interview
    ) {
        if (profile == null || fieldMappings == null || profile.assemblyFlowHint != null) {
            return;
        }
        String m = fieldMappings.get('fieldInterestExpense');
        if (!isFlowToken(m) || interview == null) {
            return;
        }
        if (profile.interestExpense != null) {
            return;
        }
        profile.assemblyFlowHint =
            'Interest expense is flow:-mapped but Apex did not read a number. In Flow Builder, mark that variable Available for output. If the value is set in a subflow, assign it to a variable on the assembly flow this widget runs.';
    }

    /** Mapping value starts with flow: — filled from autolaunched Flow output variable (API name after prefix). */
    private static Boolean isFlowToken(String mappingValue) {
        if (String.isBlank(mappingValue)) {
            return false;
        }
        return mappingValue.trim().toLowerCase().startsWith('flow:');
    }

    private static String flowVariableApiName(String mappingValue) {
        String t = mappingValue.trim().replaceFirst('^\\uFEFF', '');
        Integer idx = t.toLowerCase().indexOf('flow:');
        if (idx >= 0) {
            return t.substring(idx + 'flow:'.length()).trim().replaceFirst('^\\uFEFF', '').trim();
        }
        return t.length() > 5 ? t.substring(5).trim() : t;
    }

    private static void mergeFoundedCandidatesIntoSelect(Set<String> selectParts) {
        if (selectParts == null) {
            return;
        }
        for (String canon : resolvedFoundedCandidatePaths()) {
            selectParts.add(canon);
        }
    }

    /** True when the admin mapped fieldFounded to SOQL or flow (non-blank). */
    private static Boolean hasExplicitFoundedMapping(Map<String, String> fieldMappings) {
        if (fieldMappings == null) {
            return false;
        }
        String v = fieldMappings.get('fieldFounded');
        return String.isNotBlank(v);
    }

    /**
     * If founded was not mapped or mapped field is empty, fill from the first populated candidate on Account.
     */
    private static void enrichFoundedFromAccountIfMissing(BusinessProfileResult r, Account acc) {
        if (r == null || acc == null) {
            return;
        }
        if (r.founded != null) {
            return;
        }
        if (String.isNotBlank(r.foundedDateRaw)) {
            return;
        }
        for (String canon : resolvedFoundedCandidatePaths()) {
            Object o = getFieldValueByPath(acc, canon);
            if (o == null) {
                continue;
            }
            Integer y = foundedYearFromObject(o);
            if (y != null) {
                r.founded = y;
                return;
            }
            String fs = stringVal(o);
            if (String.isNotBlank(fs)) {
                r.foundedDateRaw = fs;
                return;
            }
        }
    }

    private static BusinessProfileResult buildFromSoql(String recordId, Map<String, String> fieldMappings) {
        Id accId = (Id) recordId;
        Set<String> selectParts = new Set<String>{ 'Id' };
        Boolean anySoqlPath = false;
        for (String raw : fieldMappings.values()) {
            if (String.isBlank(raw) || isFlowToken(raw)) {
                continue;
            }
            String canon = validateAccountFieldPath(raw.trim());
            if (canon != null) {
                selectParts.add(canon);
                anySoqlPath = true;
            }
        }

        Account acc;
        if (!anySoqlPath) {
            Set<String> leg = new Set<String>{
                'Id',
                'Name',
                'BillingCity',
                'BillingState',
                'BillingStreet',
                'BillingPostalCode',
                'BillingLatitude',
                'BillingLongitude',
                'Industry',
                'NumberOfEmployees',
                'Website',
                'AnnualRevenue',
                'Type',
                'Phone',
                'Description',
                'OwnerId',
                'Owner.Name'
            };
            if (!hasExplicitFoundedMapping(fieldMappings)) {
                mergeFoundedCandidatesIntoSelect(leg);
            }
            mergeLastUsedChannelCandidatesIntoSelect(leg);
            List<String> legOrdered = new List<String>(leg);
            legOrdered.sort();
            String legSoql = 'SELECT ' + String.join(legOrdered, ', ') + ' FROM Account WHERE Id = :accId LIMIT 1';
            acc = (Account) Database.query(legSoql)[0];
            BusinessProfileResult legResult = legacyAccountToResult(acc);
            if (!hasExplicitFoundedMapping(fieldMappings)) {
                enrichFoundedFromAccountIfMissing(legResult, acc);
            }
            applyLastUsedChannelFromAccount(legResult, fieldMappings, acc);
            return legResult;
        }

        if (!hasExplicitFoundedMapping(fieldMappings)) {
            mergeFoundedCandidatesIntoSelect(selectParts);
        }
        mergeLastUsedChannelCandidatesIntoSelect(selectParts);

        List<String> ordered = new List<String>(selectParts);
        ordered.sort();
        String soql = 'SELECT ' + String.join(ordered, ', ') + ' FROM Account WHERE Id = :accId LIMIT 1';
        acc = (Account) Database.query(soql)[0];

        BusinessProfileResult result = new BusinessProfileResult();
        result.keyContacts = new List<Map<String, String>>();
        result.nearbyBranches = new List<Map<String, String>>();
        result.recommendedActions = new List<Map<String, String>>();

        for (String mapKey : fieldMappings.keySet()) {
            String v = fieldMappings.get(mapKey);
            if (String.isBlank(v) || isFlowToken(v)) {
                continue;
            }
            String canon = validateAccountFieldPath(v.trim());
            if (canon == null) {
                continue;
            }
            Object fieldVal = getFieldValueByPath(acc, canon);
            applyMappingObjectToResult(mapKey, fieldVal, result);
        }
        if (!hasExplicitFoundedMapping(fieldMappings)) {
            enrichFoundedFromAccountIfMissing(result, acc);
        }
        applyLastUsedChannelFromAccount(result, fieldMappings, acc);
        return result;
    }

    private static BusinessProfileResult legacyAccountToResult(Account acc) {
        BusinessProfileResult result = new BusinessProfileResult();
        result.companyName = acc.Name;
        result.legalName = acc.Name;
        result.city = acc.BillingCity;
        result.state = acc.BillingState;
        result.street = acc.BillingStreet;
        result.zip = acc.BillingPostalCode;
        result.industry = acc.Industry;
        result.employees = acc.NumberOfEmployees;
        result.website = acc.Website;
        result.revenue = acc.AnnualRevenue;
        result.primaryRm = acc.Owner != null ? acc.Owner.Name : null;
        result.accountType = acc.Type;
        if (acc.BillingLatitude != null && acc.BillingLongitude != null) {
            if (isReasonableLatLon(acc.BillingLatitude, acc.BillingLongitude)) {
                result.mapLatitude = acc.BillingLatitude;
                result.mapLongitude = acc.BillingLongitude;
            }
        }
        result.keyContacts = new List<Map<String, String>>();
        result.nearbyBranches = new List<Map<String, String>>();
        result.recommendedActions = new List<Map<String, String>>();
        return result;
    }

    /**
     * Canonical Account SELECT path (e.g. Name, BillingCity, Owner.Name). Null if invalid or flow: token.
     */
    private static String validateAccountFieldPath(String path) {
        if (String.isBlank(path) || isFlowToken(path)) {
            return null;
        }
        List<String> parts = path.trim().split('\\.', 0);
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
            Map<String, Schema.SObjectField> fm = curType.getDescribe().fields.getMap();
            Schema.SObjectField f = findFieldByToken(fm, seg);
            if (f == null) {
                return null;
            }
            Schema.DescribeFieldResult fr = f.getDescribe();
            Boolean isLast = (i == parts.size() - 1);
            if (isLast) {
                out.add(fr.getName());
                break;
            }
            if (fr.getType() != DisplayType.REFERENCE || fr.getReferenceTo().isEmpty()) {
                return null;
            }
            String rel = fr.getRelationshipName();
            if (String.isBlank(rel)) {
                return null;
            }
            out.add(rel);
            curType = fr.getReferenceTo()[0];
        }
        return String.join(out, '.');
    }

    private static Schema.SObjectField findFieldByToken(Map<String, Schema.SObjectField> fm, String seg) {
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

    /**
     * Runs field-mapping assembly flow (flow: tokens). Returns the interview when started, for reuse with insight when API names match.
     */
    private static Flow.Interview mergeFlowIntoProfile(
        BusinessProfileResult r,
        Map<String, String> fieldMappings,
        String flowApiName,
        Id recordId,
        String flowRecordIdVariable
    ) {
        if (String.isBlank(flowApiName) || recordId == null || fieldMappings == null || fieldMappings.isEmpty()) {
            return null;
        }
        Set<String> varNames = new Set<String>();
        for (String v : fieldMappings.values()) {
            if (isFlowToken(v)) {
                varNames.add(flowVariableApiName(v));
            }
        }
        if (varNames.isEmpty()) {
            return null;
        }
        try {
            String recVar = String.isBlank(flowRecordIdVariable) ? 'recordId' : flowRecordIdVariable.trim();
            Map<String, Object> inputs = new Map<String, Object>{ recVar => recordId };
            Flow.Interview interview = Flow.Interview.createInterview(flowApiName.trim(), inputs);
            interview.start();
            for (String mapKey : fieldMappings.keySet()) {
                String v = fieldMappings.get(mapKey);
                if (!isFlowToken(v)) {
                    continue;
                }
                Object ov = resolveFlowOutput(interview, flowVariableApiName(v));
                applyMappingObjectToResult(mapKey, ov, r);
            }
            return interview;
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Business profile assembly flow failed: ' + e.getMessage());
            return null;
        }
    }

    /**
     * Fills predictionLabel and recommendationsJson from an autolaunched flow (same pattern as CustomerProfileWidget).
     * Reuses field assembly interview when insightFlowApiName matches flowApiName.
     */
    private static void mergeInsightFromFlow(
        BusinessProfileResult r,
        Id recordId,
        String assemblyFlowApiName,
        Flow.Interview assemblyInterview,
        String insightFlowApiName,
        String insightFlowRecordIdVariable,
        String flowPredictionVariable,
        String flowRecommendationsVariable
    ) {
        if (recordId == null || String.isBlank(insightFlowApiName)) {
            return;
        }
        String ins = insightFlowApiName.trim();
        String asm = String.isBlank(assemblyFlowApiName) ? '' : assemblyFlowApiName.trim();
        try {
            Flow.Interview iv;
            if (assemblyInterview != null && asm.equalsIgnoreCase(ins)) {
                iv = assemblyInterview;
            } else {
                String recVar = String.isBlank(insightFlowRecordIdVariable) ? 'recordId' : insightFlowRecordIdVariable.trim();
                Map<String, Object> inputs = new Map<String, Object>{ recVar => recordId };
                iv = Flow.Interview.createInterview(ins, inputs);
                iv.start();
            }
            mergeFlowOutputsFromInterview(r, iv, flowPredictionVariable, flowRecommendationsVariable);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Business insight flow failed: ' + e.getMessage());
        }
    }

    private static void mergeFlowOutputsFromInterview(
        BusinessProfileResult r,
        Flow.Interview interview,
        String flowPredictionVariable,
        String flowRecommendationsVariable
    ) {
        String predVar = String.isBlank(flowPredictionVariable) ? 'prediction' : flowPredictionVariable.trim();
        String recVar = String.isBlank(flowRecommendationsVariable) ? 'recommendations' : flowRecommendationsVariable.trim();

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

    /** Insert underscores between lowercase-then-uppercase boundaries (InterestExpenseVar → Interest_Expense_Var). */
    private static String insertLowerUpperUnderscores(String s) {
        if (String.isBlank(s)) {
            return s;
        }
        return s.replaceAll('([a-z])([A-Z])', '$1_$2');
    }

    /**
     * If name ends with Var (any case), return the base without that suffix for alternate getVariableValue lookups.
     */
    private static String stripTrailingVarSuffix(String s) {
        if (String.isBlank(s) || s.length() < 5) {
            return null;
        }
        if (s.toLowerCase().endsWith('var')) {
            return s.substring(0, s.length() - 3);
        }
        return null;
    }

    private static void addFlowLookupCandidate(Set<String> seen, List<String> order, String candidate) {
        if (String.isBlank(candidate) || seen.contains(candidate)) {
            return;
        }
        seen.add(candidate);
        order.add(candidate);
    }

    /**
     * Ordered unique names to try with Flow.Interview.getVariableValue — Flow runtimes differ on PascalCase vs camelCase,
     * underscores, and trailing Var suffixes.
     */
    private static List<String> flowVariableLookupCandidates(String raw) {
        Set<String> seen = new Set<String>();
        List<String> order = new List<String>();
        if (String.isBlank(raw)) {
            return order;
        }
        String trimmed = raw.trim().replaceFirst('^\\uFEFF', '');
        addFlowLookupCandidate(seen, order, trimmed);
        addFlowLookupCandidate(seen, order, trimmed.replaceAll('\\s+', '_'));
        addFlowLookupCandidate(seen, order, trimmed.toLowerCase());
        if (trimmed.length() > 0) {
            addFlowLookupCandidate(seen, order, trimmed.substring(0, 1).toUpperCase() + trimmed.substring(1));
        }
        if (trimmed.length() > 1) {
            addFlowLookupCandidate(seen, order, trimmed.substring(0, 1).toLowerCase() + trimmed.substring(1));
        }
        addFlowLookupCandidate(seen, order, insertLowerUpperUnderscores(trimmed));
        String noVar = stripTrailingVarSuffix(trimmed);
        if (String.isNotBlank(noVar)) {
            addFlowLookupCandidate(seen, order, noVar);
            addFlowLookupCandidate(seen, order, noVar.toLowerCase());
            if (noVar.length() > 1) {
                addFlowLookupCandidate(seen, order, noVar.substring(0, 1).toLowerCase() + noVar.substring(1));
            }
            addFlowLookupCandidate(seen, order, insertLowerUpperUnderscores(noVar));
        }
        return order;
    }

    private static Object resolveFlowOutput(Flow.Interview interview, String apiName) {
        if (interview == null || String.isBlank(apiName)) {
            return null;
        }
        for (String cand : flowVariableLookupCandidates(apiName)) {
            Object value = interview.getVariableValue(cand);
            if (value != null) {
                return value;
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

    private static void applyMappingObjectToResult(String mappingKey, Object o, BusinessProfileResult r) {
        if (o == null) {
            return;
        }
        switch on mappingKey {
            when 'fieldCompanyName' {
                r.companyName = stringVal(o);
            }
            when 'fieldLegalName' {
                r.legalName = stringVal(o);
            }
            when 'fieldCity' {
                r.city = stringVal(o);
            }
            when 'fieldState' {
                r.state = stringVal(o);
            }
            when 'fieldStreet' {
                r.street = stringVal(o);
            }
            when 'fieldZip' {
                r.zip = stringVal(o);
            }
            when 'fieldIndustry' {
                r.industry = stringVal(o);
            }
            when 'fieldWebsite' {
                r.website = stringVal(o);
            }
            when 'fieldProfilePhotoUrl' {
                r.profilePhotoUrl = stringVal(o);
            }
            when 'fieldTaxId' {
                r.taxId = stringVal(o);
            }
            when 'fieldSicCode' {
                r.sicCode = stringVal(o);
            }
            when 'fieldSicDescription' {
                r.sicDescription = stringVal(o);
            }
            when 'fieldTierSegment' {
                r.tierSegment = stringVal(o);
            }
            when 'fieldCustomerSince' {
                r.customerSince = stringVal(o);
            }
            when 'fieldPrimaryRm' {
                r.primaryRm = resolveUserIdToName(stringVal(o));
            }
            when 'fieldLastInteraction' {
                r.lastInteractionDate = stringVal(o);
            }
            when 'fieldCreditRating' {
                r.creditRating = stringVal(o);
            }
            when 'fieldCreditRatingAgency' {
                r.creditRatingAgency = stringVal(o);
            }
            when 'fieldCreditOutlook' {
                r.creditOutlook = stringVal(o);
            }
            when 'fieldMoodysRating' {
                r.moodysRating = stringVal(o);
            }
            when 'fieldDnbPaydexScore' {
                r.dnbPaydexScore = decVal(o);
            }
            when 'fieldDnbDelinquencyScore' {
                r.dnbDelinquencyScore = decVal(o);
            }
            when 'fieldDnbFailureScore' {
                r.dnbFailureScore = decVal(o);
            }
            when 'fieldDnbRating' {
                r.dnbRating = stringVal(o);
            }
            when 'fieldExperianIntelliscore' {
                r.experianIntelliscore = decVal(o);
            }
            when 'fieldExperianRiskBand' {
                r.experianRiskBand = stringVal(o);
            }
            when 'fieldEquifaxCreditRiskScore' {
                r.equifaxCreditRiskScore = decVal(o);
            }
            when 'fieldEquifaxFailureScoreCr' {
                r.equifaxFailureScoreCr = decVal(o);
            }
            when 'fieldEquifaxPaymentIndex' {
                r.equifaxPaymentIndex = decVal(o);
            }
            when 'fieldSpRating' {
                r.spRating = stringVal(o);
            }
            when 'fieldSpCategory' {
                r.spCategory = stringVal(o);
            }
            when 'fieldMoodysAgencyRating' {
                r.moodysAgencyRating = stringVal(o);
            }
            when 'fieldMoodysAgencyCategory' {
                r.moodysAgencyCategory = stringVal(o);
            }
            when 'fieldFitchRating' {
                r.fitchRating = stringVal(o);
            }
            when 'fieldFitchCategory' {
                r.fitchCategory = stringVal(o);
            }
            when 'fieldKycStatus' {
                r.kycStatus = stringVal(o);
            }
            when 'fieldAmlStatus' {
                r.amlStatus = stringVal(o);
            }
            when 'fieldTwoFaStatus' {
                r.twoFaStatus = stringVal(o);
            }
            when 'fieldAssignedBranch' {
                r.assignedBranch = stringVal(o);
            }
            when 'fieldBranchAddress' {
                r.branchAddress = stringVal(o);
            }
            when 'fieldBranchDistance' {
                r.branchDistance = stringVal(o);
            }
            when 'fieldBranchHours' {
                r.branchHours = stringVal(o);
            }
            when 'fieldBranchStatus' {
                r.branchStatus = stringVal(o);
            }
            when 'fieldEmployees' {
                r.employees = toInteger(stringVal(o));
            }
            when 'fieldFounded' {
                Integer fy = foundedYearFromObject(o);
                if (fy != null) {
                    r.founded = fy;
                } else {
                    String fs = stringVal(o);
                    if (String.isNotBlank(fs)) {
                        r.foundedDateRaw = fs;
                    }
                }
            }
            when 'fieldActiveProducts' {
                r.activeProducts = toInteger(stringVal(o));
            }
            when 'fieldCreditScore' {
                r.creditScore = toInteger(stringVal(o));
            }
            when 'fieldRevenue' {
                r.revenue = decVal(o);
            }
            when 'fieldRevenueGrowth' {
                r.revenueGrowth = decVal(o);
            }
            when 'fieldLoanBalance' {
                r.loanBalance = decVal(o);
            }
            when 'fieldLoanLimit' {
                r.loanLimit = decVal(o);
            }
            when 'fieldLoanUtilization' {
                r.loanUtilization = decVal(o);
            }
            when 'fieldDepositYtd' {
                r.depositYtd = decVal(o);
            }
            when 'fieldInvestmentBalance' {
                r.investmentBalance = decVal(o);
            }
            when 'fieldInterestExpense' {
                r.interestExpense = decVal(o);
            }
            when 'fieldRelationshipScore' {
                r.relationshipScore = decVal(o);
            }
            when 'fieldPropensityToExpand' {
                r.propensityToExpand = decVal(o);
            }
            when 'fieldAttritionRisk' {
                r.attritionRisk = decVal(o);
            }
            when 'fieldWalletShare' {
                r.walletShare = decVal(o);
            }
            when 'fieldWalletCapture' {
                r.lastUsedChannel = stringVal(o);
            }
            when 'fieldNps' {
                r.npsScore = decVal(o);
            }
            when 'fieldPaperlessEnrolled' {
                r.paperlessEnrolled = objectToBoolean(o);
            }
            when 'fieldWireEnabled' {
                r.wireEnabled = objectToBoolean(o);
            }
            when 'fieldMapLatitude' {
                r.mapLatitude = decVal(o);
            }
            when 'fieldMapLongitude' {
                r.mapLongitude = decVal(o);
            }
            when 'fieldAgentforceSummary' {
                String raw = o instanceof String ? ((String) o).trim() : String.valueOf(o).trim();
                r.agentforceSummary = String.isBlank(raw) ? '' : stripClosingCourtesy(raw);
            }
            when else {
            }
        }
    }

    private static Boolean objectToBoolean(Object o) {
        if (o instanceof Boolean) {
            return (Boolean) o;
        }
        String s = stringVal(o);
        if (String.isBlank(s)) {
            return false;
        }
        return 'true'.equalsIgnoreCase(s) || '1'.equals(s);
    }

    private static String stringVal(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer toInteger(String s) {
        if (String.isBlank(s)) {
            return null;
        }
        try {
            return Integer.valueOf(s.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static Decimal decValFromNumericText(String raw) {
        if (String.isBlank(raw)) {
            return null;
        }
        String s0 = raw.trim();
        if (s0.startsWith('"') && s0.endsWith('"') && s0.length() > 1) {
            s0 = s0.substring(1, s0.length() - 1).trim();
        }
        String s = s0
            .replace('$', '')
            .replace('\u00a0', '')
            .replace('\u202f', '')
            .replace('\u2009', '')
            .replace('\u201c', '')
            .replace('\u201d', '')
            .replaceAll('\\s+', '')
            .replace(',', '')
            .replace('\uFF0C', '');
        try {
            return Decimal.valueOf(s);
        } catch (Exception e) {
            return null;
        }
    }

    /** Flow Currency / structured values sometimes deserialize as a map with amount-like keys. */
    private static Decimal decValFromStructuredNumber(Object o) {
        if (o == null) {
            return null;
        }
        try {
            Object untyped = JSON.deserializeUntyped(JSON.serialize(o));
            if (!(untyped instanceof Map<String, Object>)) {
                return null;
            }
            Map<String, Object> m = (Map<String, Object>) untyped;
            for (String k : new List<String>{ 'amount', 'value', 'amountValue', 'Amount', 'Value' }) {
                if (m.containsKey(k)) {
                    Decimal nested = decVal(m.get(k));
                    if (nested != null) {
                        return nested;
                    }
                }
            }
        } catch (Exception e) {
        }
        return null;
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
        Decimal structured = decValFromStructuredNumber(o);
        if (structured != null) {
            return structured;
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

    private class GeocodeHit {
        Decimal lat;
        Decimal lon;
    }

    private static Boolean hasUsableMapCoords(BusinessProfileResult r) {
        if (r == null || r.mapLatitude == null || r.mapLongitude == null) {
            return false;
        }
        return isReasonableLatLon(r.mapLatitude, r.mapLongitude);
    }

    /**
     * Nominatim then Photon (same as Customer Profile widget). Requires Remote Site Settings.
     */
    private static void applyGeocodeIfNeeded(BusinessProfileResult r) {
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

    private static List<String> buildGeocodeQueryCandidates(BusinessProfileResult r) {
        List<String> out = new List<String>();
        Set<String> seen = new Set<String>();
        addGeocodeCandidate(out, seen, buildGeocodeAddressLine(r));
        addGeocodeCandidate(out, seen, buildGeocodeCityStatePostalLine(r));
        addGeocodeCandidate(out, seen, buildGeocodeCityStateCountryLine(r));
        addGeocodeCandidate(out, seen, normalizeFreeformAddress(r.branchAddress));
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

    private static String buildGeocodeAddressLine(BusinessProfileResult r) {
        List<String> parts = new List<String>();
        if (!String.isBlank(r.street)) {
            parts.add(r.street.trim());
        }
        if (!String.isBlank(r.city)) {
            parts.add(r.city.trim());
        }
        if (!String.isBlank(r.state)) {
            parts.add(r.state.trim());
        }
        if (!String.isBlank(r.zip)) {
            parts.add(r.zip.trim());
        }
        return parts.isEmpty() ? null : String.join(parts, ', ');
    }

    private static String buildGeocodeCityStatePostalLine(BusinessProfileResult r) {
        List<String> parts = new List<String>();
        if (!String.isBlank(r.city)) {
            parts.add(r.city.trim());
        }
        if (!String.isBlank(r.state)) {
            parts.add(r.state.trim());
        }
        if (!String.isBlank(r.zip)) {
            parts.add(r.zip.trim());
        }
        return parts.isEmpty() ? null : String.join(parts, ', ');
    }

    private static String buildGeocodeCityStateCountryLine(BusinessProfileResult r) {
        if (String.isBlank(r.city) || String.isBlank(r.state)) {
            return null;
        }
        return r.city.trim() + ', ' + r.state.trim() + ', USA';
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
                'JDO-BusinessProfileWidget/1.0 (Salesforce Apex; financial services CRM profile widget)'
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

    private static GeocodeHit photonGeocodeOne(String q) {
        try {
            HttpRequest req = new HttpRequest();
            req.setMethod('GET');
            req.setTimeout(12000);
            req.setHeader('User-Agent', 'JDO-BusinessProfileWidget/1.0 (Salesforce Apex)');
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

    @AuraEnabled(cacheable = false)
    public static String generateSummary(
        String promptTemplateId,
        String promptInputApiName,
        String predictionLabel,
        String recommendationsJson
    ) {
        if (String.isBlank(promptTemplateId)) {
            return null;
        }

        String inputName = String.isBlank(promptInputApiName) ? 'Input:Prediction_Context' : promptInputApiName.trim();

        Map<String, Object> payload = new Map<String, Object>{
            'prediction' => predictionLabel,
            'predictionType' => 'business_profile',
            'recommendations' => recommendationsJson != null ? recommendationsJson : '[]'
        };
        String contextJson = JSON.serialize(payload);

        try {
            return invokeEinsteinPromptTemplateForContext(promptTemplateId, inputName, contextJson);
        } catch (Exception e) {
            throw new AuraHandledException(
                'Summary generation failed. Confirm Einstein Generative AI, prompt access, and template input API name. Details: ' +
                e.getMessage()
            );
        }
    }

    private static String stripClosingCourtesy(String input) {
        if (String.isBlank(input)) {
            return input;
        }
        String s = input.replaceAll('(?i)\\s*' + Pattern.quote(CLOSING_PHRASE) + '\\.?\\s*', '');
        s = s.replaceAll('(\\r?\\n){3,}', '\n\n');
        return s.trim();
    }

    /** When structure enrichment fails mid-flight, still populate subsidiary count from the same related-account graph. */
    private static void applySubsidiariesCountFromRelatedAccounts(Id accountId, BusinessProfileResult r) {
        if (r == null || accountId == null) {
            return;
        }
        try {
            List<Map<String, String>> nodes = loadOrgChartRelatedAccountNodes(accountId);
            r.subsidiaries = nodes != null ? nodes.size() : 0;
        } catch (Exception e) {
            r.subsidiaries = 0;
        }
    }

    /**
     * Structure tab: key contacts from AccountContactRelation (or Contact.AccountId), org chart nodes from
     * child Accounts (ParentId) plus FSC-style Account–Account junction when present (AccountAccountRelation / FinServ__).
     */
    private static void enrichStructureTabData(Id accountId, BusinessProfileResult r) {
        if (r == null || accountId == null) {
            return;
        }
        if (r.keyContacts == null) {
            r.keyContacts = new List<Map<String, String>>();
        }
        r.orgChartChildren = new List<Map<String, String>>();

        try {
            Account thin = [
                SELECT Type
                FROM Account
                WHERE Id = :accountId
                WITH USER_MODE
                LIMIT 1
            ];
            if (String.isNotBlank(thin.Type)) {
                r.accountType = thin.Type;
            }
        } catch (Exception e) {
            // Insufficient access; leave accountType null
        }

        List<Map<String, String>> contacts = loadKeyContactsForAccount(accountId);
        r.keyContacts = contacts;

        List<Map<String, String>> accountNodes = loadOrgChartRelatedAccountNodes(accountId);
        r.subsidiaries = accountNodes != null ? accountNodes.size() : 0;
        buildOrgChartChildren(r, accountNodes, contacts);

        r.structureLinkedAccountsText = buildLinkedAccountsSummaryFromNodes(accountNodes);
        r.structureLinkedContactsText = buildLinkedContactsSummaryText(contacts);
        r.structureReferralNetworkText = '';
    }

    private class JunctionPair {
        String anchorLookup;
        String otherLookup;
    }

    private static JunctionPair resolveAccountJunctionPair(Schema.DescribeSObjectResult od) {
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
        JunctionPair j = new JunctionPair();
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

    private static String resolveJunctionRoleField(Schema.DescribeSObjectResult od) {
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

    private static void appendNodesFromJunctionRows(
        List<SObject> rows,
        Id accountId,
        JunctionPair jp,
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

    private static void appendAccountAccountJunctionNodes(Id accountId, List<Map<String, String>> nodes) {
        List<String> cands = new List<String>{ 'AccountAccountRelation', 'FinServ__AccountAccountRelation__c' };
        for (String objApi : cands) {
            if (!Schema.getGlobalDescribe().containsKey(objApi)) {
                continue;
            }
            Schema.DescribeSObjectResult od = Schema.getGlobalDescribe().get(objApi).getDescribe();
            if (!od.isAccessible()) {
                continue;
            }
            JunctionPair jp = resolveAccountJunctionPair(od);
            if (jp == null) {
                continue;
            }
            String roleF = resolveJunctionRoleField(od);
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
                appendNodesFromJunctionRows(rows1, accountId, jp, true, roleF, nodes);
            } catch (Exception e) {
            }
            try {
                String q2 = selBase + ' FROM ' + objApi + ' WHERE ' + jp.otherLookup + ' = :accountId LIMIT 200';
                List<SObject> rows2 = Database.queryWithBinds(
                    q2,
                    new Map<String, Object>{ 'accountId' => accountId },
                    AccessLevel.USER_MODE
                );
                appendNodesFromJunctionRows(rows2, accountId, jp, false, roleF, nodes);
            } catch (Exception e) {
            }
        }
    }

    /**
     * One org-chart node per Account–Account junction row (same related account can appear multiple times with different roles),
     * then ParentId subsidiaries not already linked via junction.
     */
    private static List<Map<String, String>> loadOrgChartRelatedAccountNodes(Id accountId) {
        List<Map<String, String>> nodes = new List<Map<String, String>>();
        Set<Id> junctionAccountIds = new Set<Id>();
        appendAccountAccountJunctionNodes(accountId, nodes);
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

    private static String buildLinkedAccountsSummaryFromNodes(List<Map<String, String>> nodes) {
        if (nodes == null || nodes.isEmpty()) {
            return '';
        }
        Set<String> types = new Set<String>();
        for (Map<String, String> n : nodes) {
            if (!'account'.equalsIgnoreCase(n.get('kind'))) {
                continue;
            }
            String s = n.get('sublabel');
            if (String.isNotBlank(s)) {
                types.add(s);
            }
        }
        List<String> tlist = new List<String>(types);
        tlist.sort();
        if (!tlist.isEmpty()) {
            return String.join(tlist, ' + ');
        }
        return nodes.size() + ' related account' + (nodes.size() == 1 ? '' : 's');
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
                    String soql =
                        'SELECT ContactId, Roles, Contact.FirstName, Contact.LastName, Contact.Title' +
                        (hasIsPrimary ? ', IsPrimary' : '') +
                        ' FROM AccountContactRelation WHERE AccountId = :accountId AND IsActive = true ' +
                        'ORDER BY Contact.LastName, Contact.FirstName LIMIT 40';
                    for (SObject row : Database.queryWithBinds(
                        soql,
                        new Map<String, Object>{ 'accountId' => accountId },
                        AccessLevel.USER_MODE
                    )) {
                        Id cid = (Id) row.get('ContactId');
                        if (cid == null || seen.contains(cid)) {
                            continue;
                        }
                        seen.add(cid);
                        SObject con = row.getSObject('Contact');
                        if (con == null) {
                            continue;
                        }
                        Map<String, String> m = new Map<String, String>();
                        m.put('contactId', String.valueOf(cid));
                        m.put('firstName', (String) con.get('FirstName'));
                        m.put('lastName', (String) con.get('LastName'));
                        m.put('title', (String) con.get('Title'));
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
        BusinessProfileResult r,
        List<Map<String, String>> accountNodes,
        List<Map<String, String>> contacts
    ) {
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

        // Every related-account node (one per junction row + ParentId children); UI wraps.
        List<Map<String, String>> row = new List<Map<String, String>>();
        for (Map<String, String> an : accountNodes) {
            row.add(new Map<String, String>(an));
        }
        if (center != null) {
            Integer idx = row.isEmpty() ? 0 : row.size() / 2;
            row.add(idx, center);
        }
        r.orgChartChildren = row;
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

    /** Open pipeline rows for the Health tab (Account-scoped CRM). */
    public class PipelineOpportunityRow {
        @AuraEnabled
        public String id;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public String stageName;
        @AuraEnabled
        public Decimal amount;
    }

    /** Default rows when LWC passes null/0 (show “all” practical). */
    private static final Integer PIPELINE_OPPORTUNITY_DEFAULT_LIMIT = 2000;
    /** Governor-friendly ceiling for one query + JSON payload. */
    private static final Integer PIPELINE_OPPORTUNITY_HARD_CAP = 2000;

    private static Integer effectivePipelineOpportunityLimit(Integer requested) {
        if (requested == null || requested <= 0) {
            return PIPELINE_OPPORTUNITY_DEFAULT_LIMIT;
        }
        return Math.min(requested, PIPELINE_OPPORTUNITY_HARD_CAP);
    }

    /**
     * Live rollups: when Financial Services Cloud Financial Account exists, Active products shows count of active rows
     * for this Account; always loads open Opportunities for the Pipeline list.
     */
    private static void enrichActiveFinancialAccountsAndPipeline(Id accountId, BusinessProfileResult r, Integer pipelineLimit) {
        if (r == null || accountId == null) {
            return;
        }
        r.pipelineOpenOpportunities = new List<PipelineOpportunityRow>();
        r.activeProductsReflectsFinancialAccounts = false;
        Integer faCount = countActiveFinancialAccountsForAccount(accountId);
        if (faCount != null) {
            r.activeProducts = faCount;
            r.activeProductsReflectsFinancialAccounts = true;
        }
        if (!Opportunity.SObjectType.getDescribe().isAccessible()) {
            return;
        }
        if (!Opportunity.IsClosed.getDescribe().isAccessible() ||
            !Opportunity.AccountId.getDescribe().isAccessible() ||
            !Opportunity.Name.getDescribe().isAccessible() ||
            !Opportunity.StageName.getDescribe().isAccessible()) {
            return;
        }
        Boolean canAmount = Opportunity.Amount.getDescribe().isAccessible();
        Integer lim = effectivePipelineOpportunityLimit(pipelineLimit);
        try {
            String amtSel = canAmount ? ', Amount' : '';
            String orderBy = canAmount ? ' ORDER BY Amount DESC NULLS LAST, Name ASC ' : ' ORDER BY Name ASC ';
            String soql =
                'SELECT Id, Name, StageName' +
                amtSel +
                ' FROM Opportunity WHERE AccountId = :accountId AND IsClosed = false' +
                orderBy +
                ' LIMIT :lim';
            for (Opportunity o : (List<Opportunity>) Database.query(soql)) {
                PipelineOpportunityRow row = new PipelineOpportunityRow();
                row.id = o.Id;
                row.name = o.Name;
                row.stageName = o.StageName;
                row.amount = canAmount ? o.Amount : null;
                r.pipelineOpenOpportunities.add(row);
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'enrichActiveFinancialAccountsAndPipeline opportunities: ' + e.getMessage());
        }
    }

    private static Integer countActiveFinancialAccountsForAccount(Id accountId) {
        Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
        String apiName = 'FinServ__FinancialAccount__c';
        if (!gd.containsKey(apiName)) {
            return null;
        }
        Schema.DescribeSObjectResult od = gd.get(apiName).getDescribe();
        if (!od.isAccessible() || !od.isQueryable()) {
            return null;
        }
        Map<String, Schema.SObjectField> fm = od.fields.getMap();
        String accFld = resolveFinancialAccountAccountLookupField(fm);
        if (String.isBlank(accFld)) {
            return null;
        }
        Schema.DescribeFieldResult accFr = fm.get(accFld).getDescribe();
        if (!accFr.isAccessible() || !accFr.isFilterable()) {
            return null;
        }
        String activeClause = buildFinancialAccountActiveFilterClause(fm);
        String soql = 'SELECT COUNT() FROM ' + apiName + ' WHERE ' + accFld + ' = :accountId' + activeClause;
        try {
            return Database.countQuery(soql);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'countActiveFinancialAccountsForAccount: ' + e.getMessage());
            return null;
        }
    }

    private static String resolveFinancialAccountAccountLookupField(Map<String, Schema.SObjectField> fm) {
        if (fm == null || fm.isEmpty()) {
            return null;
        }
        List<String> prefer = new List<String>{ 'FinServ__PrimaryOwner__c', 'FinServ__Account__c', 'AccountId' };
        for (String name : prefer) {
            if (!fm.containsKey(name)) {
                continue;
            }
            Schema.DescribeFieldResult fr = fm.get(name).getDescribe();
            if (!fr.isAccessible() || fr.getType() != Schema.DisplayType.REFERENCE || fr.getReferenceTo().isEmpty()) {
                continue;
            }
            if (fr.getReferenceTo()[0] == Account.SObjectType) {
                return name;
            }
        }
        for (Schema.SObjectField sf : fm.values()) {
            Schema.DescribeFieldResult fr = sf.getDescribe();
            if (!fr.isAccessible() || fr.getType() != Schema.DisplayType.REFERENCE || fr.getReferenceTo().isEmpty()) {
                continue;
            }
            if (fr.getReferenceTo()[0] == Account.SObjectType) {
                return fr.getName();
            }
        }
        return null;
    }

    /** Prefer IsActive, else Status = Open (FSC defaults); orgs with different picklist API values may need adjustment. */
    private static String buildFinancialAccountActiveFilterClause(Map<String, Schema.SObjectField> fm) {
        if (fm.containsKey('FinServ__IsActive__c')) {
            Schema.DescribeFieldResult fr = fm.get('FinServ__IsActive__c').getDescribe();
            if (fr.isAccessible() && fr.getType() == Schema.DisplayType.BOOLEAN && fr.isFilterable()) {
                return ' AND FinServ__IsActive__c = true ';
            }
        }
        if (fm.containsKey('FinServ__Status__c')) {
            Schema.DescribeFieldResult fr = fm.get('FinServ__Status__c').getDescribe();
            if (fr.isAccessible() && fr.isFilterable()) {
                return ' AND FinServ__Status__c = \'Open\' ';
            }
        }
        return '';
    }

    /**
     * Isolated Connect invocation (without sharing) so sharing on the controller cannot interact oddly with the
     * Einstein gateway for record-grounded templates.
     */
    private without sharing class EinsteinOverviewConnectBridge {
        ConnectApi.EinsteinPromptTemplateGenerationsRepresentation generate(
            String promptTemplateId,
            ConnectApi.EinsteinPromptTemplateGenerationsInput promptInput
        ) {
            return ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(promptTemplateId, promptInput);
        }
    }

    public class BusinessProfileResult {
        @AuraEnabled
        public String companyName;
        @AuraEnabled
        public String legalName;
        @AuraEnabled
        public String industry;
        @AuraEnabled
        public String city;
        @AuraEnabled
        public String state;
        @AuraEnabled
        public String street;
        @AuraEnabled
        public String zip;
        @AuraEnabled
        public String website;
        @AuraEnabled
        public String profilePhotoUrl;
        @AuraEnabled
        public String taxId;
        @AuraEnabled
        public String sicCode;
        @AuraEnabled
        public String sicDescription;
        @AuraEnabled
        public String tierSegment;
        @AuraEnabled
        public String customerSince;
        @AuraEnabled
        public String primaryRm;
        @AuraEnabled
        public String lastInteractionDate;
        @AuraEnabled
        public String marketZone;
        @AuraEnabled
        public String interestRate;
        @AuraEnabled
        public String creditReviewDate;
        @AuraEnabled
        public String collateralType;
        @AuraEnabled
        public Integer employees;
        @AuraEnabled
        public Integer founded;
        /** Set when the mapped field is text or an unparseable value; LWC may still derive the display year. */
        @AuraEnabled
        public String foundedDateRaw;
        @AuraEnabled
        public Integer activeProducts;
        /** True when activeProducts was set from live FinServ Financial Account count (not field mapping only). */
        @AuraEnabled
        public Boolean activeProductsReflectsFinancialAccounts;
        /** Open opportunities on this Account for the Health tab Pipeline (CRM). */
        @AuraEnabled
        public List<PipelineOpportunityRow> pipelineOpenOpportunities;
        /** Count of related Account nodes (FSC junction + ParentId children); set in enrichStructureTabData, not from field mapping. */
        @AuraEnabled
        public Integer subsidiaries;
        @AuraEnabled
        public Integer creditScore;
        @AuraEnabled
        public Integer paymentHistoryScore;
        @AuraEnabled
        public Integer revenueGrowthScore;
        @AuraEnabled
        public Integer tenureScore;
        @AuraEnabled
        public Integer industryRiskScore;
        @AuraEnabled
        public Decimal revenue;
        @AuraEnabled
        public Decimal revenueGrowth;
        @AuraEnabled
        public Decimal loanBalance;
        @AuraEnabled
        public Decimal loanLimit;
        @AuraEnabled
        public Decimal loanUtilization;
        @AuraEnabled
        public Decimal depositYtd;
        @AuraEnabled
        public Decimal investmentBalance;
        @AuraEnabled
        public Decimal interestExpense;
        @AuraEnabled
        public Decimal relationshipScore;
        @AuraEnabled
        public Decimal propensityToExpand;
        @AuraEnabled
        public Decimal attritionRisk;
        @AuraEnabled
        public Decimal walletShare;
        /** Text from mapped Account field (e.g. mobile, branch, web). */
        @AuraEnabled
        public String lastUsedChannel;
        @AuraEnabled
        public Decimal npsScore;
        @AuraEnabled
        public String creditRating;
        @AuraEnabled
        public String creditRatingAgency;
        @AuraEnabled
        public String creditOutlook;
        @AuraEnabled
        public String moodysRating;
        @AuraEnabled
        public Decimal dnbPaydexScore;
        @AuraEnabled
        public Decimal dnbDelinquencyScore;
        @AuraEnabled
        public Decimal dnbFailureScore;
        @AuraEnabled
        public String dnbRating;
        @AuraEnabled
        public Decimal experianIntelliscore;
        @AuraEnabled
        public String experianRiskBand;
        @AuraEnabled
        public Decimal equifaxCreditRiskScore;
        @AuraEnabled
        public Decimal equifaxFailureScoreCr;
        @AuraEnabled
        public Decimal equifaxPaymentIndex;
        @AuraEnabled
        public String spRating;
        @AuraEnabled
        public String spCategory;
        @AuraEnabled
        public String moodysAgencyRating;
        @AuraEnabled
        public String moodysAgencyCategory;
        @AuraEnabled
        public String fitchRating;
        @AuraEnabled
        public String fitchCategory;
        @AuraEnabled
        public String kycStatus;
        @AuraEnabled
        public String amlStatus;
        @AuraEnabled
        public String twoFaStatus;
        @AuraEnabled
        public Boolean paperlessEnrolled;
        @AuraEnabled
        public Boolean wireEnabled;
        @AuraEnabled
        public String assignedBranch;
        @AuraEnabled
        public String branchAddress;
        @AuraEnabled
        public String branchDistance;
        @AuraEnabled
        public String branchHours;
        @AuraEnabled
        public String branchStatus;
        /** Map marker; from Billing geolocation, Flow/SOQL mapping, or geocoded address. */
        @AuraEnabled
        public Decimal mapLatitude;
        @AuraEnabled
        public Decimal mapLongitude;
        @AuraEnabled
        public String predictionLabel;
        /** JSON array text from Flow recommendations output (same shape as Customer Profile / classification model). */
        @AuraEnabled
        public String recommendationsJson;
        @AuraEnabled
        public String summaryText;
        /**
         * Overview Agentforce summary: long text from Account field (SOQL) or assembly Flow output (flow:Var).
         * Typical use: Flow runs a Prompt or Agent action and assigns the response to a Text variable Available for output.
         */
        @AuraEnabled
        public String agentforceSummary;
        /** When Overview Einstein summary fails or returns blank, short reason for admins (not end-user polished). */
        @AuraEnabled
        public String agentforceSummaryPromptHint;
        @AuraEnabled
        public List<Map<String, String>> nearbyBranches;
        /** Account.Type for org chart root sublabel when available. */
        @AuraEnabled
        public String accountType;
        /** Structure tab org chart row under the current account (account | contact nodes). */
        @AuraEnabled
        public List<Map<String, String>> orgChartChildren;
        @AuraEnabled
        public String structureLinkedAccountsText;
        @AuraEnabled
        public String structureLinkedContactsText;
        @AuraEnabled
        public String structureReferralNetworkText;
        @AuraEnabled
        public List<Map<String, String>> keyContacts;
        @AuraEnabled
        public List<Map<String, String>> recommendedActions;
        /**
         * Non-blocking configuration hint when flow: mappings cannot be applied (e.g. missing assembly Flow API name,
         * flow fault, or variable not exposed for output). Shown under the liquidity waterfall in the LWC.
         */
        @AuraEnabled
        public String assemblyFlowHint;
    }
}
