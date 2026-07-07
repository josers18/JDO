/**
 * Core/FSC data path. Reads records that ORIGINATE in Salesforce
 * (Connector Type = SalesforceDotCom in the DC inventory): Account, Contact,
 * Opportunity, Case, Task, Event, FinancialGoal, PersonLifeEvent,
 * FinServ__FinancialAccount__c, etc. Synchronous-feeling, typed, cacheable,
 * write-back capable — always prefer this over the Data Cloud mirror.
 *
 * HTTP 200 ≠ success on the Salesforce GraphQL API: the errors array must be
 * parsed. sdk.graphql may be undefined on some surfaces → optional-chained.
 */
import { createDataSDK } from '@salesforce/platform-sdk';

export async function executeGraphQL<TData, TVariables = Record<string, unknown>>(
  query: string,
  variables?: TVariables
): Promise<TData> {
  const sdk = await createDataSDK();
  const result = await sdk.graphql?.query<TData, TVariables>({ query, variables });

  if (!result) {
    throw new Error('GraphQL is not available on this surface');
  }
  if (result.errors?.length) {
    throw new Error(`GraphQL Error: ${result.errors.map((e: { message: string }) => e.message).join('; ')}`);
  }
  if (result.data == null) {
    throw new Error('GraphQL response data is null');
  }
  return result.data;
}
