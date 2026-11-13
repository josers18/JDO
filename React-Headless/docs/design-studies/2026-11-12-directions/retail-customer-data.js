/* Read-only Retail customer capture. Query bounds in tests/retail-customer-capture.* */
const retailCustomerData={
  "capturedAt": "2026-11-13",
  "ownerId": "005am000003PbFAAA0",
  "orgId": "00Dam00000Uo32qEAB",
  "accountId": "001am00000qvjt7AAA",
  "crm": {
    "account": [
      {
        "Id": "001am00000qvjt7AAA",
        "Name": "Mark S Smith",
        "OwnerId": "005am000003PbFAAA0",
        "PersonContactId": "003am000008yOo0AAE",
        "PersonEmail": "msmith@example.com",
        "Phone": "(650) 555-6652",
        "Type": "Person",
        "BillingCity": "Mountain View",
        "BillingState": "CA"
      }
    ],
    "finances": [
      {
        "Id": "a7kam00000UGbghAAD",
        "Name": "Mark Smith - Cumulus Cash Rewards Card",
        "FinServ__PrimaryOwner__c": "001am00000qvjt7AAA",
        "FinServ__FinancialAccountType__c": "Credit Cards",
        "FinServ__Balance__c": 4549,
        "FinServ__Status__c": "Open",
        "FinServ__OpenDate__c": "2025-01-10"
      },
      {
        "Id": "a7kam00000UGbwpAAD",
        "Name": "Mark Smith - Cumulus 12Mo CD",
        "FinServ__PrimaryOwner__c": "001am00000qvjt7AAA",
        "FinServ__FinancialAccountType__c": "Deposits",
        "FinServ__Balance__c": 50000,
        "FinServ__Status__c": "Open",
        "FinServ__OpenDate__c": "2026-02-12"
      },
      {
        "Id": "a7kam00000UGhR8AAL",
        "Name": "Mark Smith - Cumulus Managed Advisory",
        "FinServ__PrimaryOwner__c": "001am00000qvjt7AAA",
        "FinServ__FinancialAccountType__c": "Investments",
        "FinServ__Balance__c": 566797,
        "FinServ__Status__c": "Open",
        "FinServ__OpenDate__c": "2017-01-26"
      },
      {
        "Id": "a7kam00000UGiobAAD",
        "Name": "Mark Smith - Cumulus Premier Checking",
        "FinServ__PrimaryOwner__c": "001am00000qvjt7AAA",
        "FinServ__FinancialAccountType__c": "Deposits",
        "FinServ__Balance__c": 114065,
        "FinServ__Status__c": "Open",
        "FinServ__OpenDate__c": "2019-03-25"
      },
      {
        "Id": "a7kam00000UGiqDAAT",
        "Name": "Mark Smith - Cumulus 30 Year Fixed Mortgage",
        "FinServ__PrimaryOwner__c": "001am00000qvjt7AAA",
        "FinServ__FinancialAccountType__c": "Loans",
        "FinServ__Balance__c": 1564800,
        "FinServ__Status__c": "Open",
        "FinServ__OpenDate__c": "2015-07-27"
      }
    ],
    "tasks": [
      {
        "Id": "00Tam00000REXfVEAX",
        "Subject": "Load the Template With Your Client Information",
        "Status": "Not Started",
        "Priority": "Normal",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-08-07",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000REXfSEAX",
        "Subject": "Submit to Manager for Review",
        "Status": "Not Started",
        "Priority": "Normal",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-08-07",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000QM3ACEA1",
        "Subject": "Prepare: Business succession plan draft",
        "Status": "In Progress",
        "Priority": "Normal",
        "Type": "Other",
        "Description": "Discussed upcoming financial goals and reviewed current product suite.",
        "ActivityDate": "2026-08-06",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000REXfWEAX",
        "Subject": "Create Strategic Plan with Product Bankers",
        "Status": "Not Started",
        "Priority": "Normal",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-08-06",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000RDjwEEAT",
        "Subject": "Send beneficiary update form",
        "Status": "In Progress",
        "Priority": "High",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-08-05",
        "WhatId": null,
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PYstAAG",
        "Owner": {
          "Name": "Vanessa Central"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000REXfUEAX",
        "Subject": "Present to Operating Committee",
        "Status": "Not Started",
        "Priority": "High",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-08-05",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000RDjvMEAT",
        "Subject": "Send tax document checklist",
        "Status": "In Progress",
        "Priority": "Normal",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-08-04",
        "WhatId": null,
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PYtmAAG",
        "Owner": {
          "Name": "Brenda Service"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000QM3ADEA1",
        "Subject": "Email: Forward rate change notification",
        "Status": "Completed",
        "Priority": "Normal",
        "Type": "Email",
        "Description": "Reviewed documentation requirements for pending application.",
        "ActivityDate": "2026-08-02",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000RDjuUEAT",
        "Subject": "Send investment performance report",
        "Status": "In Progress",
        "Priority": "Normal",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-08-02",
        "WhatId": null,
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PYuLAAW",
        "Owner": {
          "Name": "Ely East"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000RDjxyEAD",
        "Subject": "Schedule branch visit",
        "Status": "In Progress",
        "Priority": "Normal",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-08-01",
        "WhatId": null,
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PYtnAAG",
        "Owner": {
          "Name": "Cindy Central"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000QM3ABEA1",
        "Subject": "Email: Forward rate change notification",
        "Status": "Completed",
        "Priority": "Normal",
        "Type": "Email",
        "Description": "Reviewed documentation requirements for pending application.",
        "ActivityDate": "2026-07-30",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000RDjx6EAD",
        "Subject": "Review credit card cross-sell list",
        "Status": "In Progress",
        "Priority": "Normal",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-07-30",
        "WhatId": null,
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PYthAAG",
        "Owner": {
          "Name": "Steven Service"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000REXfTEAX",
        "Subject": "Ensure KYC / AML Compliance is Complete",
        "Status": "Not Started",
        "Priority": "High",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-07-30",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Tam00000RDjyqEAD",
        "Subject": "Prepare wealth management deck",
        "Status": "In Progress",
        "Priority": "Normal",
        "Type": "Call",
        "Description": null,
        "ActivityDate": "2026-07-30",
        "WhatId": null,
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PYuMAAW",
        "Owner": {
          "Name": "Bill South"
        },
        "AccountId": "001am00000qvjt7AAA"
      }
    ],
    "events": [
      {
        "Id": "00Uam00000G7pONEAZ",
        "Subject": "Investment Review - Mark Smith",
        "Description": "Reviewed investment portfolio performance against benchmarks. Discussed rebalancing needs and market outlook. Client comfortable with current risk level.",
        "StartDateTime": "2026-08-07T19:00:00.000+0000",
        "EndDateTime": "2026-08-07T20:00:00.000+0000",
        "DurationInMinutes": 60,
        "Location": "Phone Call",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000GDmF5EAL",
        "Subject": "Tax Planning Session",
        "Description": "Scheduled tax planning session with Mark Smith at Mark Smith.",
        "StartDateTime": "2026-08-07T10:45:00.000+0000",
        "EndDateTime": "2026-08-07T11:45:00.000+0000",
        "DurationInMinutes": 60,
        "Location": "West Branch - Private Office",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000GDmF7EAL",
        "Subject": "Client Appreciation Lunch",
        "Description": "Scheduled client appreciation lunch with Mark Smith at Mark Smith.",
        "StartDateTime": "2026-08-07T09:15:00.000+0000",
        "EndDateTime": "2026-08-07T10:45:00.000+0000",
        "DurationInMinutes": 90,
        "Location": "Client Home",
        "ShowAs": "Busy",
        "Type": "Other",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000G7pOLEAZ",
        "Subject": "Loan Application Review - Mark Smith",
        "Description": "Discussed personal or auto loan options. Reviewed terms, rates, and repayment schedules. Application documents collected and reviewed.",
        "StartDateTime": "2026-08-06T16:15:00.000+0000",
        "EndDateTime": "2026-08-06T17:15:00.000+0000",
        "DurationInMinutes": 60,
        "Location": "Virtual - Zoom",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000G7pOQEAZ",
        "Subject": "Digital Banking Setup - Mark Smith",
        "Description": "Walked client through mobile app and online banking features. Set up mobile deposit, Zelle, and bill pay. Enabled security features.",
        "StartDateTime": "2026-08-05T14:00:00.000+0000",
        "EndDateTime": "2026-08-05T14:45:00.000+0000",
        "DurationInMinutes": 45,
        "Location": "Cumulus Bank - Main Branch",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000JEjoWEAT",
        "Subject": "Life Insurance Needs Analysis",
        "Description": null,
        "StartDateTime": "2026-08-05T13:00:00.000+0000",
        "EndDateTime": "2026-08-05T14:15:00.000+0000",
        "DurationInMinutes": 75,
        "Location": null,
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PYuMAAW",
        "Owner": {
          "Name": "Bill South"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000GDmF6EAL",
        "Subject": "Estate Planning Discussion",
        "Description": "Scheduled estate planning discussion with Mark Smith at Mark Smith.",
        "StartDateTime": "2026-08-04T09:45:00.000+0000",
        "EndDateTime": "2026-08-04T10:30:00.000+0000",
        "DurationInMinutes": 45,
        "Location": "Restaurant - Business Lunch",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000JEjbUEAT",
        "Subject": "Estate Planning Discussion",
        "Description": null,
        "StartDateTime": "2026-08-03T13:00:00.000+0000",
        "EndDateTime": "2026-08-03T14:15:00.000+0000",
        "DurationInMinutes": 75,
        "Location": null,
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PYthAAG",
        "Owner": {
          "Name": "Steven Service"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000GDmF9EAL",
        "Subject": "Annual Financial Review",
        "Description": "Scheduled annual financial review with Mark Smith at Mark Smith.",
        "StartDateTime": "2026-08-03T10:45:00.000+0000",
        "EndDateTime": "2026-08-03T11:45:00.000+0000",
        "DurationInMinutes": 60,
        "Location": "Downtown Branch - Meeting Room 2",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000GDmF8EAL",
        "Subject": "Wealth Management Strategy",
        "Description": "Scheduled wealth management strategy with Mark Smith at Mark Smith.",
        "StartDateTime": "2026-08-02T14:30:00.000+0000",
        "EndDateTime": "2026-08-02T15:15:00.000+0000",
        "DurationInMinutes": 45,
        "Location": "Virtual - Teams",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000GDmFAEA1",
        "Subject": "Mortgage Pre-Approval Meeting",
        "Description": "Scheduled mortgage pre-approval meeting with Mark Smith at Mark Smith.",
        "StartDateTime": "2026-08-02T10:00:00.000+0000",
        "EndDateTime": "2026-08-02T10:30:00.000+0000",
        "DurationInMinutes": 30,
        "Location": "West Branch - Private Office",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": "003am000008yOo0AAE",
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000G7pOOEAZ",
        "Subject": "Financial Planning Session - Mark Smith",
        "Description": "Reviewed retirement projections, emergency fund status, and insurance coverage. On track for major financial goals with minor adjustments needed.",
        "StartDateTime": "2026-08-01T18:30:00.000+0000",
        "EndDateTime": "2026-08-01T19:30:00.000+0000",
        "DurationInMinutes": 60,
        "Location": "Client Office",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000G7pOMEAZ",
        "Subject": "Credit Card Review - Mark Smith",
        "Description": "Reviewed spending patterns and rewards optimization. Discussed card upgrade options that better match spending habits and travel needs.",
        "StartDateTime": "2026-08-01T16:00:00.000+0000",
        "EndDateTime": "2026-08-01T16:45:00.000+0000",
        "DurationInMinutes": 45,
        "Location": "Client Office",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000JEjqGEAT",
        "Subject": "Wire Transfer Authorization",
        "Description": null,
        "StartDateTime": "2026-08-01T13:00:00.000+0000",
        "EndDateTime": "2026-08-01T14:15:00.000+0000",
        "DurationInMinutes": 75,
        "Location": null,
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PYuLAAW",
        "Owner": {
          "Name": "Ely East"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000G7pOPEAZ",
        "Subject": "Welcome Meeting - Mark Smith",
        "Description": "Initial meeting with new client. Discussed full range of banking services and identified primary needs. Set up core accounts.",
        "StartDateTime": "2026-08-01T13:00:00.000+0000",
        "EndDateTime": "2026-08-01T14:00:00.000+0000",
        "DurationInMinutes": 60,
        "Location": "Virtual - Zoom",
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PbCLAA0",
        "Owner": {
          "Name": "Jose Sifontes"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000JEjneEAD",
        "Subject": "Investment Strategy Session",
        "Description": null,
        "StartDateTime": "2026-07-30T13:00:00.000+0000",
        "EndDateTime": "2026-07-30T13:45:00.000+0000",
        "DurationInMinutes": 45,
        "Location": null,
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PYtnAAG",
        "Owner": {
          "Name": "Cindy Central"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000JEjacEAD",
        "Subject": "Portfolio Review",
        "Description": null,
        "StartDateTime": "2026-07-30T13:00:00.000+0000",
        "EndDateTime": "2026-07-30T13:45:00.000+0000",
        "DurationInMinutes": 45,
        "Location": null,
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PYstAAG",
        "Owner": {
          "Name": "Vanessa Central"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000JEjZkEAL",
        "Subject": "IRA Rollover Discussion",
        "Description": null,
        "StartDateTime": "2026-07-30T13:00:00.000+0000",
        "EndDateTime": "2026-07-30T14:15:00.000+0000",
        "DurationInMinutes": 75,
        "Location": null,
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PYtmAAG",
        "Owner": {
          "Name": "Brenda Service"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000JEjvyEAD",
        "Subject": "Commercial Banking Review",
        "Description": null,
        "StartDateTime": "2026-07-30T13:00:00.000+0000",
        "EndDateTime": "2026-07-30T13:45:00.000+0000",
        "DurationInMinutes": 45,
        "Location": null,
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PYtmAAG",
        "Owner": {
          "Name": "Brenda Service"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000JEjYsEAL",
        "Subject": "Risk Tolerance Assessment",
        "Description": null,
        "StartDateTime": "2026-07-29T13:00:00.000+0000",
        "EndDateTime": "2026-07-29T13:45:00.000+0000",
        "DurationInMinutes": 45,
        "Location": null,
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PYuLAAW",
        "Owner": {
          "Name": "Ely East"
        },
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "00Uam00000JEjpOEAT",
        "Subject": "Asset Allocation Review",
        "Description": null,
        "StartDateTime": "2026-07-29T13:00:00.000+0000",
        "EndDateTime": "2026-07-29T13:45:00.000+0000",
        "DurationInMinutes": 45,
        "Location": null,
        "ShowAs": "Busy",
        "Type": "Meeting",
        "WhatId": "001am00000qvjt7AAA",
        "WhoId": null,
        "OwnerId": "005am000003PYsqAAG",
        "Owner": {
          "Name": "Valerie East"
        },
        "AccountId": "001am00000qvjt7AAA"
      }
    ],
    "plans": [
      {
        "Id": "13Qam000000dctREAQ",
        "OwnerId": "005am000003PbCLAA0",
        "IsDeleted": false,
        "Name": "Mark Smith - Retirement Plan",
        "CurrencyIsoCode": "USD",
        "CreatedDate": "2026-03-29T16:52:45.000+0000",
        "CreatedById": "005am000003PbCLAA0",
        "LastModifiedDate": "2026-03-29T16:52:45.000+0000",
        "LastModifiedById": "005am000003PbCLAA0",
        "SystemModstamp": "2026-03-29T16:52:45.000+0000",
        "MayEdit": true,
        "IsLocked": false,
        "Type": "Retirement",
        "Description": "Comprehensive retirement planning to achieve financial independence and secure comfortable retirement",
        "EstimatedSuccessPercent": 44,
        "AccountId": "001am00000qvjt7AAA",
        "StartDate": "2023-06-11",
        "SourceSystemIdentifier": null,
        "Status": "InProgress"
      }
    ],
    "goals": [
      {
        "Id": "13Ram000000dRgHEAU",
        "Name": "Retirement Savings Target",
        "Type": "Retirement",
        "Priority": "LOW",
        "Status": "IN_PROGRESS",
        "Description": null,
        "FinancialPlanId": "13Qam000000dctREAQ",
        "FinancialPlan": {
          "AccountId": "001am00000qvjt7AAA"
        },
        "TargetDate": "2044-08-02",
        "TargetAmount": 2095000,
        "ActualAmount": 1149348
      },
      {
        "Id": "13Ram000000dRhtEAE",
        "Name": "Eliminate Consumer Debt",
        "Type": "Pay off Debt",
        "Priority": "HIGH",
        "Status": "IN_PROGRESS",
        "Description": null,
        "FinancialPlanId": "13Qam000000dctREAQ",
        "FinancialPlan": {
          "AccountId": "001am00000qvjt7AAA"
        },
        "TargetDate": "2030-01-30",
        "TargetAmount": 41000,
        "ActualAmount": 28332
      },
      {
        "Id": "13Ram000000dRjVEAU",
        "Name": "Retirement Emergency Fund",
        "Type": "Emergency",
        "Priority": "MEDIUM",
        "Status": "IN_PROGRESS",
        "Description": null,
        "FinancialPlanId": "13Qam000000dctREAQ",
        "FinancialPlan": {
          "AccountId": "001am00000qvjt7AAA"
        },
        "TargetDate": "2027-11-02",
        "TargetAmount": 304000,
        "ActualAmount": 200162
      }
    ],
    "cases": [
      {
        "Id": "500am00000poFw9AAE",
        "CaseNumber": "00001919",
        "Subject": "Distribution Request from IRA",
        "Status": "Closed",
        "Priority": "High",
        "Description": "Customer requesting a distribution of 15000 from their Traditional IRA. Needs tax withholding guidance.",
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "500am00000po4ZKAAY",
        "CaseNumber": "00001918",
        "Subject": "Fraudulent Charge on Credit Card",
        "Status": "Closed",
        "Priority": "Critical",
        "Description": "Customer reports fraudulent charges totaling 15000 on their Cumulus credit card. Multiple unauthorized transactions at Home Depot.",
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "500am00000po8wJAAQ",
        "CaseNumber": "00001917",
        "Subject": "Account Statement Request",
        "Status": "Reply Received",
        "Priority": "Low",
        "Description": "Customer requesting copies of account statements for the last 9 months for tax preparation.",
        "AccountId": "001am00000qvjt7AAA"
      },
      {
        "Id": "500am00000pny5nAAA",
        "CaseNumber": "00001916",
        "Subject": "Zelle Payment Not Received",
        "Status": "New",
        "Priority": "Medium",
        "Description": "Customer sent a Zelle payment of 750 but recipient reports it was not received. Transaction shows as completed on sender side.",
        "AccountId": "001am00000qvjt7AAA"
      }
    ]
  },
  "datasets": {
    "transactions": [
      {
        "dt": "2026-11-13T06:33:49+00:00",
        "cat": "Food & Dining",
        "typ": "Debit",
        "amt": 7.23
      },
      {
        "dt": "2026-11-12T06:32:45+00:00",
        "cat": "Financial",
        "typ": "Credit",
        "amt": 250
      },
      {
        "dt": "2026-11-11T06:48:41+00:00",
        "cat": "Food & Dining",
        "typ": "Debit",
        "amt": 18.01
      },
      {
        "dt": "2026-11-11T06:14:54+00:00",
        "cat": "Entertainment",
        "typ": "Debit",
        "amt": 9.99
      },
      {
        "dt": "2026-11-10T06:57:43+00:00",
        "cat": "Shopping",
        "typ": "Debit",
        "amt": 43.9
      },
      {
        "dt": "2026-11-10T06:53:24+00:00",
        "cat": "Bills & Utilities",
        "typ": "Debit",
        "amt": 127.57
      },
      {
        "dt": "2026-11-10T06:53:18+00:00",
        "cat": "Shopping",
        "typ": "Debit",
        "amt": 49.84
      },
      {
        "dt": "2026-11-09T06:03:35+00:00",
        "cat": "Shopping",
        "typ": "Debit",
        "amt": 47.15
      },
      {
        "dt": "2026-11-09T06:00:53+00:00",
        "cat": "Shopping",
        "typ": "Debit",
        "amt": 65.88
      },
      {
        "dt": "2026-11-08T06:49:22+00:00",
        "cat": "Shopping",
        "typ": "Debit",
        "amt": 32.33
      },
      {
        "dt": "2026-11-06T06:28:53+00:00",
        "cat": "Auto & Transport",
        "typ": "Debit",
        "amt": 26.5
      },
      {
        "dt": "2026-11-05T06:58:07+00:00",
        "cat": "Food & Dining",
        "typ": "Debit",
        "amt": 35.54
      }
    ],
    "interactions": [
      {
        "dt": "2026-05-12T02:40:57+00:00",
        "nm": "Summary: Web Chat - Smith",
        "purp": "Annual Review",
        "notes": "Annual planning session. Adjusted retirement date and updated savings target.",
        "nxt": "Loop in legal team for trust structure review."
      },
      {
        "dt": "2026-05-12T02:40:57+00:00",
        "nm": "Summary: Web Chat - Smith",
        "purp": "Loan Application",
        "notes": "Took preliminary mortgage application. Pending appraisal and underwriting review.",
        "nxt": "Send thank-you note and follow up in 2 weeks."
      },
      {
        "dt": "2026-05-12T02:40:57+00:00",
        "nm": "Summary: Web Chat - Smith",
        "purp": "Loan Application",
        "notes": "Took preliminary mortgage application. Pending appraisal and underwriting review.",
        "nxt": "Send thank-you note and follow up in 2 weeks."
      },
      {
        "dt": "2026-05-12T02:40:57+00:00",
        "nm": "Summary: Web Chat - Smith",
        "purp": "Deal Execution",
        "notes": "Closed line of credit application. Funds available within 3 business days.",
        "nxt": "Schedule next quarterly review for early next quarter."
      },
      {
        "dt": "2026-05-12T02:40:57+00:00",
        "nm": "Summary: Web Chat - Smith",
        "purp": "Insurance Discussion",
        "notes": "Annual policy review. Client opted to increase term life coverage by $500K.",
        "nxt": "Prepare quarterly review deck and email to client."
      },
      {
        "dt": "2026-05-12T02:40:57+00:00",
        "nm": "Summary: Web Chat - Smith",
        "purp": "Product Inquiry",
        "notes": "Compared CD vs Treasury bill yields. Client to decide after consulting with spouse.",
        "nxt": "Prepare annual review summary and mail to client."
      },
      {
        "dt": "2026-05-12T01:34:49+00:00",
        "nm": "Summary: Web Chat - Smith",
        "purp": "Insurance Discussion",
        "notes": "Annual policy review. Client opted to increase term life coverage by $500K.",
        "nxt": "Prepare quarterly review deck and email to client."
      },
      {
        "dt": "2026-05-12T01:34:49+00:00",
        "nm": "Summary: Web Chat - Smith",
        "purp": "Product Inquiry",
        "notes": "Compared CD vs Treasury bill yields. Client to decide after consulting with spouse.",
        "nxt": "Prepare annual review summary and mail to client."
      }
    ],
    "notes": [],
    "campaigns": [],
    "csat": [
      {
        "csat": 56,
        "nps": 5,
        "csatd": "Fair",
        "npsd": "Detractor",
        "dt": "2026-10-01"
      },
      {
        "csat": 70,
        "nps": 7,
        "csatd": "Good",
        "npsd": "Passives",
        "dt": "2026-09-01"
      },
      {
        "csat": 74,
        "nps": 7,
        "csatd": "Good",
        "npsd": "Passives",
        "dt": "2026-08-01"
      },
      {
        "csat": 72,
        "nps": 7,
        "csatd": "Good",
        "npsd": "Passives",
        "dt": "2026-07-01"
      },
      {
        "csat": 74,
        "nps": 7,
        "csatd": "Good",
        "npsd": "Passives",
        "dt": "2026-06-01"
      },
      {
        "csat": 72,
        "nps": 7,
        "csatd": "Good",
        "npsd": "Passives",
        "dt": "2026-05-01"
      },
      {
        "csat": 79,
        "nps": 8,
        "csatd": "Good",
        "npsd": "Passives",
        "dt": "2026-04-01"
      },
      {
        "csat": 76,
        "nps": 7,
        "csatd": "Good",
        "npsd": "Passives",
        "dt": "2026-03-01"
      }
    ],
    "property": [
      {
        "val": null,
        "eq": null,
        "mtg": null,
        "heloc": null,
        "ptype": null,
        "owner": false,
        "q": "2026-10-01"
      }
    ],
    "bookNotes": [],
    "bookCampaigns": []
  },
  "sources": {
    "account": {
      "state": "captured",
      "rows": 1,
      "limit": 1,
      "scope": "001am00000qvjt7AAA"
    },
    "finances": {
      "state": "captured",
      "rows": 5,
      "limit": 50,
      "scope": "001am00000qvjt7AAA"
    },
    "tasks": {
      "state": "captured",
      "rows": 14,
      "limit": 50,
      "scope": "001am00000qvjt7AAA"
    },
    "events": {
      "state": "captured",
      "rows": 21,
      "limit": 50,
      "scope": "001am00000qvjt7AAA"
    },
    "plans": {
      "state": "captured",
      "rows": 1,
      "limit": 50,
      "scope": "001am00000qvjt7AAA"
    },
    "goals": {
      "state": "captured",
      "rows": 3,
      "limit": 50,
      "scope": "001am00000qvjt7AAA"
    },
    "cases": {
      "state": "captured",
      "rows": 4,
      "limit": 20,
      "scope": "001am00000qvjt7AAA"
    },
    "transactions": {
      "state": "captured",
      "rows": 12,
      "scope": "001am00000qvjt7AAA",
      "bounded": true
    },
    "interactions": {
      "state": "captured",
      "rows": 8,
      "scope": "001am00000qvjt7AAA",
      "bounded": true
    },
    "notes": {
      "state": "captured",
      "rows": 0,
      "scope": "001am00000qvjt7AAA",
      "bounded": true
    },
    "campaigns": {
      "state": "captured",
      "rows": 0,
      "scope": "001am00000qvjt7AAA",
      "bounded": true
    },
    "csat": {
      "state": "captured",
      "rows": 8,
      "scope": "001am00000qvjt7AAA",
      "bounded": true
    },
    "property": {
      "state": "captured",
      "rows": 1,
      "scope": "001am00000qvjt7AAA",
      "bounded": true
    },
    "bookNotes": {
      "state": "captured",
      "rows": 0,
      "scope": "005am000003PbFAAA0",
      "bounded": true
    },
    "bookCampaigns": {
      "state": "captured",
      "rows": 0,
      "scope": "005am000003PbFAAA0",
      "bounded": true
    }
  }
};
