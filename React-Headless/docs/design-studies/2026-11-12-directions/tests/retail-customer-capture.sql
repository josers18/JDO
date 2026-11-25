-- transactions
SELECT ssot__TransactionDate__c dt, ssot__FinancialTransactionCategory__c cat, ssot__FinancialAccountTransactionType__c typ, ssot__TransactionAmount__c amt FROM ssot__FinancialAccountTransaction__dlm WHERE SFAccountID__c = '001am00000qvjt7AAA' ORDER BY ssot__TransactionDate__c DESC LIMIT 12;

-- interactions
SELECT CreatedDate__c dt, Name__c nm, InteractionPurpose__c purp, MeetingNotes__c notes, NextSteps__c nxt FROM InteractionSummary_Home__dlm WHERE AccountId__c = '001am00000qvjt7AAA' ORDER BY CreatedDate__c DESC LIMIT 8;

-- notes
SELECT Date_c__c dt, Title_c__c ttl, Notes_c__c notes FROM Meeting_Note_c_Home__dlm WHERE Account_c__c = '001am00000qvjt7AAA' ORDER BY Date_c__c DESC LIMIT 6;

-- campaigns
SELECT Campaign_Name__c nm, Category__c cat, Product_Name__c prod, Email_Action__c act, Send_Date__c dt FROM Marketing_Campaigns__dlm WHERE AccountID__c = '001am00000qvjt7AAA' ORDER BY Send_Date__c DESC LIMIT 8;

-- csat
SELECT csat_score__c csat, nps_score__c nps, csat_description__c csatd, nps_description__c npsd, score_date__c dt FROM CSAT_Snowflake__dlm WHERE accountid__c = '001am00000qvjt7AAA' ORDER BY score_date__c DESC LIMIT 8;

-- property
SELECT estimated_property_value__c val, equity_usd__c eq, outstanding_mortgage_balance__c mtg, heloc_opportunity_score__c heloc, primary_property_type__c ptype, is_owner__c owner, profile_quarter__c q FROM BT_Corelogic_Property__dlm WHERE account_id__c = '001am00000qvjt7AAA' ORDER BY profile_quarter__c DESC LIMIT 1;

-- bookNotes
SELECT n.Account_c__c account, a.ssot__Name__c name, n.Date_c__c dt, n.Title_c__c ttl, n.Notes_c__c notes FROM Meeting_Note_c_Home__dlm n JOIN ssot__Account__dlm a ON a.ssot__Id__c=n.Account_c__c WHERE a.ssot__OwnerId__c='005am000003PbFAAA0' ORDER BY n.Date_c__c DESC LIMIT 6;

-- bookCampaigns
SELECT c.AccountID__c account, a.ssot__Name__c name, c.Campaign_Name__c nm, c.Category__c cat, c.Product_Name__c prod, c.Email_Action__c act, c.Send_Date__c dt FROM Marketing_Campaigns__dlm c JOIN ssot__Account__dlm a ON a.ssot__Id__c=c.AccountID__c WHERE a.ssot__OwnerId__c='005am000003PbFAAA0' ORDER BY c.Send_Date__c DESC LIMIT 8;
