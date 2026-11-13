/* Read-only shell evidence. Captured examples, not a live browser session. */
globalThis.atlasShellData={
  "capturedAt": "2026-11-13T16:54:12Z",
  "orgId": "00Dam00000Uo32qEAB",
  "orgName": "Cumulus Financial Services",
  "orgCoreOrigin": "https://storm-16a17dc388fbe6.demo.my.salesforce.com",
  "sessionUser": null,
  "sessionUserSource": {
    "status": "unavailable",
    "label": "Authenticated actor not resolved by the available read-only profile recipe",
    "scope": "Connector context is not proof of the local browser's authenticated identity",
    "detail": "Discovered Chatter user-profile /me read returned INVALID_ARGUMENT. No user identity inferred from selected banker."
  },
  "bankers": [
    {
      "userId": "005am000003PbFBAA0",
      "name": "Justin Chen",
      "accounts": 10913
    },
    {
      "userId": "005am000006ffBpAAI",
      "name": "Sarah Smith",
      "accounts": 10541
    },
    {
      "userId": "005am000003PbFDAA0",
      "name": "Allen Carter",
      "accounts": 5630
    },
    {
      "userId": "005am000003PbCLAA0",
      "name": "Jose Sifontes",
      "accounts": 5094
    },
    {
      "userId": "005am000003PbFGAA0",
      "name": "Adam Watson",
      "accounts": 1325
    },
    {
      "userId": "005am000003PYssAAG",
      "name": "Vince West",
      "accounts": 1318
    },
    {
      "userId": "005am000003PbFAAA0",
      "name": "Kim Johnson",
      "accounts": 1312
    }
  ],
  "bankersSource": {
    "status": "available",
    "scope": "Data Cloud top 12 local Account owners with at least 100 accounts, followed by CRM User names",
    "limit": 12,
    "returnedRows": 7,
    "totalReturnedRows": 7,
    "query": "SELECT ssot__OwnerId__c AS owner_id, COUNT(*) AS n FROM ssot__Account__dlm WHERE ssot__Id__c LIKE '001am%' AND ssot__OwnerId__c IS NOT NULL GROUP BY ssot__OwnerId__c HAVING COUNT(*) >= 100 ORDER BY n DESC LIMIT 12",
    "completionStatus": "ResultsProduced",
    "rowsProcessed": 36239,
    "aggregatePeriod": "Current ingested Data Cloud Account state; ingestion lag may differ from live CRM"
  },
  "alerts": [
    {
      "Id": "500am00000yVuwnAAC",
      "CaseNumber": "00013101",
      "Subject": "529 distribution timing question",
      "Status": "New",
      "Priority": "High",
      "IsClosed": false,
      "CreatedDate": "2026-11-05T22:11:27.000+0000",
      "AccountId": "001am00002AYR5IAAX",
      "Account": {
        "Name": "Rita X Robertson"
      },
      "object": "Case"
    },
    {
      "Id": "500am00000yVuvoAAC",
      "CaseNumber": "00013040",
      "Subject": "Need to reorder checks",
      "Status": "Waiting on Customer",
      "Priority": "High",
      "IsClosed": false,
      "CreatedDate": "2026-11-05T19:21:22.000+0000",
      "AccountId": "001am00002AYPKCAA5",
      "Account": {
        "Name": "Patrick L Johnson"
      },
      "object": "Case"
    },
    {
      "Id": "500am00000yVv0eAAC",
      "CaseNumber": "00013240",
      "Subject": "Treasury workstation outage",
      "Status": "Waiting on Customer",
      "Priority": "High",
      "IsClosed": false,
      "CreatedDate": "2026-11-04T18:58:28.000+0000",
      "AccountId": "001am00002AYRjEAAX",
      "Account": {
        "Name": "Smith Group"
      },
      "object": "Case"
    },
    {
      "Id": "500am00000yVuvbAAC",
      "CaseNumber": "00013027",
      "Subject": "Card declined at point of sale",
      "Status": "New",
      "Priority": "High",
      "IsClosed": false,
      "CreatedDate": "2026-11-04T15:33:35.000+0000",
      "AccountId": "001am00002AYPX1AAP",
      "Account": {
        "Name": "Kyle Y Hines"
      },
      "object": "Case"
    },
    {
      "Id": "500am00000yVuvVAAS",
      "CaseNumber": "00013021",
      "Subject": "Card declined at point of sale",
      "Status": "Working",
      "Priority": "High",
      "IsClosed": false,
      "CreatedDate": "2026-11-03T17:20:21.000+0000",
      "AccountId": "001am00002AYOUHAA5",
      "Account": {
        "Name": "Darryl Y Macdonald"
      },
      "object": "Case"
    },
    {
      "Id": "500am00000yVv0YAAS",
      "CaseNumber": "00013234",
      "Subject": "ACH origination reject investigation",
      "Status": "Waiting on Customer",
      "Priority": "High",
      "IsClosed": false,
      "CreatedDate": "2026-11-03T14:32:27.000+0000",
      "AccountId": "001am00002AYRXhAAP",
      "Account": {
        "Name": "Martinez-Welch Consulting"
      },
      "object": "Case"
    },
    {
      "Id": "006am00000LrZEZAA3",
      "Name": "Retail - Personal Loan",
      "StageName": "Proposal Issued",
      "Amount": 46375.72,
      "IsClosed": false,
      "CloseDate": "2026-01-01",
      "AccountId": "001am00002A9gVbAAJ",
      "Account": {
        "Name": "Veronica M Smith"
      },
      "object": "Opportunity"
    },
    {
      "Id": "006am00000LrZEeAAN",
      "Name": "Retail - Personal Loan",
      "StageName": "Qualification",
      "Amount": 40417.61,
      "IsClosed": false,
      "CloseDate": "2026-01-01",
      "AccountId": "001am00002A9gVgAAJ",
      "Account": {
        "Name": "Joanna N Yates"
      },
      "object": "Opportunity"
    },
    {
      "Id": "006am00000LrZfyAAF",
      "Name": "Retail - Personal Loan",
      "StageName": "Proposal Issued",
      "Amount": 15552.4,
      "IsClosed": false,
      "CloseDate": "2026-01-01",
      "AccountId": "001am00002A9h9uAAB",
      "Account": {
        "Name": "Laura L Crawford"
      },
      "object": "Opportunity"
    },
    {
      "Id": "006am00000LrZwhAAF",
      "Name": "Retail - Personal Loan",
      "StageName": "Qualification",
      "Amount": 31950.24,
      "IsClosed": false,
      "CloseDate": "2026-01-01",
      "AccountId": "001am00002A9haJAAR",
      "Account": {
        "Name": "Cheryl Q Wilson"
      },
      "object": "Opportunity"
    },
    {
      "Id": "006am00000LraBYAAZ",
      "Name": "Retail - Personal Loan",
      "StageName": "Prospecting",
      "Amount": 49651.13,
      "IsClosed": false,
      "CloseDate": "2026-01-01",
      "AccountId": "001am00002A9hpAAAR",
      "Account": {
        "Name": "Corey F Snyder"
      },
      "object": "Opportunity"
    },
    {
      "Id": "006am00000LraGmAAJ",
      "Name": "Retail - Personal Loan",
      "StageName": "Proposal Issued",
      "Amount": 13027.53,
      "IsClosed": false,
      "CloseDate": "2026-01-01",
      "AccountId": "001am00002A9huOAAR",
      "Account": {
        "Name": "Kimberly J Hammond"
      },
      "object": "Opportunity"
    }
  ],
  "alertsSource": {
    "status": "available",
    "label": "Captured native shell criteria: High open Cases and open Opportunities due by November 20, 2026",
    "scope": "Authenticated connector sharing-visible CRM records, no owner or View As filter; six records per source, not complete totals",
    "limitPerObject": 6,
    "closeBefore": "2026-11-20",
    "includesOverdue": true,
    "transport": "Read-only SOQL equivalent of current shell GraphQL filters; not live browser-session results",
    "casesReturned": 6,
    "opportunitiesReturned": 6,
    "cappedSamples": true
  },
  "nativeApps": [
    {
      "label": "Retail Banking Console",
      "durableId": "06mam000002JhGVAA0",
      "category": "banking"
    },
    {
      "label": "Retail Banking",
      "durableId": "06mam000002JhGZAA0",
      "category": "banking"
    },
    {
      "label": "Banking - Console",
      "durableId": "06mam000002JhElAAK",
      "category": "banking"
    },
    {
      "label": "Commercial Banking",
      "durableId": "06mam000002Jjl4AAC",
      "category": "banking"
    },
    {
      "label": "Commercial Banking Console",
      "durableId": "06mam000002JhGWAA0",
      "category": "banking"
    },
    {
      "label": "Commercial Banking - Sales",
      "durableId": "06mam000002JhEmAAK",
      "category": "banking"
    },
    {
      "label": "Commercial Banking - Treasury",
      "durableId": "06mam000002JhEnAAK",
      "category": "banking"
    },
    {
      "label": "Wealth Management - Console",
      "durableId": "06mam000004LE8vAAG",
      "category": "banking"
    },
    {
      "label": "Insurance Console",
      "durableId": "06mam000002JhGaAAK",
      "category": "banking"
    },
    {
      "label": "Agentforce Studio",
      "durableId": "06mam000005cVazAAE",
      "category": "ai"
    },
    {
      "label": "Agentforce Grid",
      "durableId": "06mam000005cVb0AAE",
      "category": "ai"
    },
    {
      "label": "Agent Creator",
      "durableId": "06mam000003sBuPAAU",
      "category": "ai"
    },
    {
      "label": "Einstein GPT",
      "durableId": "06mam000002JhGhAAK",
      "category": "ai"
    },
    {
      "label": "Einstein Playground",
      "durableId": "06mam000002JhG0AAK",
      "category": "ai"
    },
    {
      "label": "Prediction Builder",
      "durableId": "06mam000002JhG9AAK",
      "category": "ai"
    },
    {
      "label": "Data Cloud",
      "durableId": "06mam000002JhF6AAK",
      "category": "data"
    },
    {
      "label": "Customer Data Cloud",
      "durableId": "06mam000003XF6bAAG",
      "category": "data"
    },
    {
      "label": "Data Manager",
      "durableId": "06mam000002JhFsAAK",
      "category": "data"
    },
    {
      "label": "Tableau Next",
      "durableId": "06mam000003m5q5AAA",
      "category": "data"
    },
    {
      "label": "Analytics Studio",
      "durableId": "06mam000002JhFrAAK",
      "category": "data"
    },
    {
      "label": "Sales",
      "durableId": "06mam000002JhFuAAK",
      "category": "core"
    },
    {
      "label": "Sales - Console",
      "durableId": "06mam000002JhFvAAK",
      "category": "core"
    },
    {
      "label": "Sales Engagement",
      "durableId": "06mam000002JhFyAAK",
      "category": "core"
    },
    {
      "label": "Service Console",
      "durableId": "06mam000002JhFcAAK",
      "category": "core"
    },
    {
      "label": "Service - Console",
      "durableId": "06mam000002JhEpAAK",
      "category": "core"
    },
    {
      "label": "Field Service",
      "durableId": "06mam000002JhFoAAK",
      "category": "core"
    },
    {
      "label": "Marketing",
      "durableId": "06mam000002JhG6AAK",
      "category": "core"
    },
    {
      "label": "Salesforce Scheduler",
      "durableId": "06mam000002JhG5AAK",
      "category": "core"
    },
    {
      "label": "Salesforce Maps",
      "durableId": "06mam000002JhFxAAK",
      "category": "core"
    },
    {
      "label": "Loyalty Management",
      "durableId": "06mam000002JhFSAA0",
      "category": "core"
    },
    {
      "label": "Salesforce CPQ",
      "durableId": "06mam000002JhGBAA0",
      "category": "core"
    },
    {
      "label": "Digital Experiences",
      "durableId": "06mam000002JhFDAA0",
      "category": "core"
    },
    {
      "label": "Chatter",
      "durableId": "06mam000002JhFAAA0",
      "category": "core"
    }
  ],
  "nativeAppsSource": {
    "status": "available",
    "scope": "Static current source catalog, AppLauncher.tsx; native IDs originally verified July 2026, not freshly permission-tested",
    "nativeCount": 33,
    "personaCount": 3
  },
  "searchRecords": {
    "Account": [
      {
        "Id": "001am00000qvjsAAAQ",
        "Name": "Julie E Morris",
        "Type": "Client",
        "OwnerId": "005am000003PbCLAA0"
      },
      {
        "Id": "001am00002FFqePAAT",
        "Name": "Julie Morris",
        "Type": "Client",
        "OwnerId": "005am00001SEJzvAAH"
      }
    ],
    "Contact": [
      {
        "Id": "003am000008yOmCAAU",
        "Name": "Julie E Morris",
        "Title": "Commercial Banking Client, Wealth Client, Board Member",
        "AccountId": "001am00000qvjsAAAQ",
        "Account": {
          "Name": "Julie E Morris"
        }
      },
      {
        "Id": "003am00000htooSAAQ",
        "Name": "Julie Morris",
        "Title": null,
        "AccountId": "001am00002FFqePAAT",
        "Account": {
          "Name": "Julie Morris"
        }
      }
    ],
    "Opportunity": [
      {
        "Id": "006am000005W0NtAAK",
        "Name": "Gusto Manufacturing - Cumulus Business Term Loan - Add-On Business - $30K",
        "StageName": "Closed Won",
        "AccountId": "001am00000qvjssAAA",
        "Account": {
          "Name": "Gusto Manufacturing"
        }
      },
      {
        "Id": "006am000005W0NxAAK",
        "Name": "AJC Corporation - Cumulus Business Term Loan - Add-On Business - $111K",
        "StageName": "Closed Won",
        "AccountId": "001am00000qvjsuAAA",
        "Account": {
          "Name": "AJC Corporation"
        }
      },
      {
        "Id": "006am000005W0O3AAK",
        "Name": "Vand Enterprises, Inc. - Cumulus SBA Loan - Services - $48K",
        "StageName": "Closed Won",
        "AccountId": "001am00000qvjsyAAA",
        "Account": {
          "Name": "Vand Enterprises, Inc."
        }
      },
      {
        "Id": "006am000005W0O5AAK",
        "Name": "Plasmosis, Inc. - Cumulus Business Term Loan - New Business - $42K",
        "StageName": "Closed Won",
        "AccountId": "001am00000qvjuCAAQ",
        "Account": {
          "Name": "Plasmosis, Inc."
        }
      },
      {
        "Id": "006am000005W0OAAA0",
        "Name": "General Utilities - Cumulus Business Term Loan - New Business - $45K",
        "StageName": "Closed Won",
        "AccountId": "001am00000qvjsXAAQ",
        "Account": {
          "Name": "General Utilities"
        }
      },
      {
        "Id": "006am000005W0OCAA0",
        "Name": "Silodyne Company - Cumulus Business Term Loan - Add-On Business - $57K",
        "StageName": "Closed Won",
        "AccountId": "001am00000qvju9AAA",
        "Account": {
          "Name": "Silodyne Company"
        }
      }
    ],
    "Lead": [
      {
        "Id": "00Qam000009wuk7EAA",
        "Name": "David Adelson",
        "Company": null,
        "IsConverted": false
      },
      {
        "Id": "00Qam000009wujJEAQ",
        "Name": "David Duckett",
        "Company": "Plum Creek LLP",
        "IsConverted": false
      },
      {
        "Id": "00Qam000009wuk3EAA",
        "Name": "David Homme",
        "Company": "Langworth, Kilback and Botsford",
        "IsConverted": false
      },
      {
        "Id": "00Qam00000VcrcXEAR",
        "Name": "David Mendoza",
        "Company": "David Mendoza",
        "IsConverted": false
      },
      {
        "Id": "00Qam000009wukLEAQ",
        "Name": "David Tallman",
        "Company": "Parks Auto",
        "IsConverted": false
      },
      {
        "Id": "00Qam00000VcrFxEAJ",
        "Name": "David Wright",
        "Company": "David Wright",
        "IsConverted": false
      }
    ]
  },
  "searchSource": {
    "status": "available",
    "scope": "Selected name-query examples using authenticated connector visibility; not a complete index or the local browser's permission scope",
    "limitPerObject": 6,
    "terms": {
      "Account": "Julie Morris",
      "Contact": "Julie Morris",
      "Opportunity": "Loan",
      "Lead": "David"
    },
    "matchFields": {
      "Account": [
        "Name"
      ],
      "Contact": [
        "Name"
      ],
      "Opportunity": [
        "Name"
      ],
      "Lead": [
        "Name"
      ]
    },
    "leadIsConverted": false,
    "transport": "Read-only SOQL equivalent of current GraphQL search predicates"
  }
};
