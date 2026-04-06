// Minimal: DC_AccountSummary_widget + Account 001am00000qvjs6AAA (few calls to avoid CPU limit)
Id accId = '001am00000qvjs6AAA';
String templateId = 'DC_AccountSummary_widget';
String idStr = String.valueOf(accId);

ConnectApi.WrappedValue wId = new ConnectApi.WrappedValue();
wId.value = idStr;
ConnectApi.WrappedValue wObj = new ConnectApi.WrappedValue();
wObj.value = new Map<String, Object>{ 'Id' => accId };
Map<String, ConnectApi.WrappedValue> vm = new Map<String, ConnectApi.WrappedValue>();
vm.put('Input:Account.Id', wId);
vm.put('Input:Account', wObj);

ConnectApi.EinsteinPromptTemplateGenerationsInput inp = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
inp.isPreview = false;
ConnectApi.EinsteinLlmAdditionalConfigInput extra = new ConnectApi.EinsteinLlmAdditionalConfigInput();
extra.numGenerations = 1;
extra.applicationName = 'PromptTemplateGenerationsInvocable';
inp.additionalConfig = extra;
inp.inputParams = vm;

ConnectApi.EinsteinPromptTemplateGenerationsRepresentation outRep = ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
    templateId,
    inp
);
Integer sz = outRep != null && outRep.generations != null ? outRep.generations.size() : 0;
System.debug('RESULT genSize=' + sz);
if (sz > 0) {
    System.debug('RESULT text=' + outRep.generations[0].text);
}
