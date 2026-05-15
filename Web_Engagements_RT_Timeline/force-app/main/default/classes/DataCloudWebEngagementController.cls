public with sharing class DataCloudWebEngagementController {

    // CONFIGURATION
    // 1. The Data Graph Name (API Name)
    private static final String DATA_GRAPH_NAME = 'RT_Web_Engagementsv2';
    
    // 2. The Link Object Name
    // We use the Link Object because it bridges Source IDs (Account) to Unified IDs.
    private static final String LINK_OBJECT_NAME = 'UnifiedLinkssotAccountAcc__dlm'; 

    @AuraEnabled
    public static String getWebEngagementData(String accountId) { // Using accountId because this will be deployed on Person Account record page.
        if (String.isBlank(accountId)) return '[]';

        try {
            // 1. Get the Unified ID (The Bridge)
            String unifiedId = getUnifiedId(accountId);
            
            if (String.isBlank(unifiedId)) {
                System.debug('No Unified ID found for Account: ' + accountId);
                return '[]';
            }

            // 2. TRUE Real-Time Lookup via Named Credential
            // We use "callout:Data_Cloud_API" to match your Named Credential's API Name.
            HttpRequest req = new HttpRequest();
            String endpoint = 'callout:Data_Cloud_API/services/data/v65.0/ssot/data-graphs/data/' + DATA_GRAPH_NAME + '/' + unifiedId;
            
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            // No Authorization header needed - The Named Credential handles the OAuth handshake.
            req.setHeader('Content-Type', 'application/json');

            Http http = new Http();
            HttpResponse res = http.send(req);

            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else {
                System.debug('Data Graph Error: ' + res.getStatus() + ' ' + res.getBody());
                return '[]';
            }

        } catch (Exception e) {
            System.debug('Error fetching Data Graph: ' + e.getMessage());
            AuraHandledException ahe = new AuraHandledException(e.getMessage());
            ahe.setMessage(e.getMessage());
            throw ahe;
        }
    }

    /**
     * Resolves Salesforce Account ID -> Data Cloud Unified ID
     */

     private static String getUnifiedId(String accountId) {
        String query = 'SELECT UnifiedRecordId__c FROM ' + LINK_OBJECT_NAME + 
                       ' WHERE SourceRecordId__c = \'' + String.escapeSingleQuotes(accountId) + '\' LIMIT 1';

        ConnectApi.QuerySqlInput input = new ConnectApi.QuerySqlInput();
        input.sql = query;

        ConnectApi.QuerySqlOutput output = ConnectApi.CdpQuery.querySql(input);
        
        // WORKAROUND: Serialize/Deserialize to inspect the raw JSON structure
        String safeJson = JSON.serialize(output);
        Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(safeJson);

        List<Object> rows = null;
        if (result.containsKey('dataRows')) {
            rows = (List<Object>) result.get('dataRows');
        } else if (result.containsKey('data')) {
            rows = (List<Object>) result.get('data');
        }

        if (rows != null && !rows.isEmpty()) {
            Map<String, Object> firstRow = (Map<String, Object>) JSON.deserializeUntyped(JSON.serialize(rows[0]));
            
            // FIX: Check for 'rowData' OR 'row'
            List<Object> values = null;
            if (firstRow.containsKey('rowData')) {
                values = (List<Object>) firstRow.get('rowData');
            } else if (firstRow.containsKey('row')) {
                values = (List<Object>) firstRow.get('row');
            }
            
            if (values != null && !values.isEmpty()) {
                return (String) values[0];
            }
        }
        return null;
    }
}