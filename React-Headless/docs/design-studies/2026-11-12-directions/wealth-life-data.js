/* Read-only owner-scoped CRM life, financial goal and financial-plan audit. Full query counts verified. */
globalThis.wealthLifeData={
  "orgId": "00Dam00000Uo32qEAB",
  "ownerId": "005am000003PbCLAA0",
  "capturedAt": "2026-11-13",
  "sources": {
    "lifeEvents": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "capturedAt": "2026-11-13",
      "complete": true,
      "returnedRows": 31,
      "totalCount": 31,
      "pageInfo": {
        "hasNextPage": false,
        "endCursor": "djE6MzA="
      },
      "query": "query WealthLifeAudit {uiapi{query{PersonLifeEvent(first:200,where:{PrimaryPerson:{Account:{OwnerId:{eq:\"005am000003PbCLAA0\"}}}},orderBy:{EventDate:{order:DESC}}){totalCount edges{node{Id Name @optional{value} EventType @optional{value} EventDate @optional{value} PrimaryPersonId @optional{value} PrimaryPerson @optional{Id Name @optional{value} AccountId @optional{value} Account @optional{Id Name @optional{value} OwnerId @optional{value}}}}} pageInfo{hasNextPage endCursor}}}}}",
      "rows": [
        {
          "Id": "0Yram000000L9ZoCAK",
          "Name": "Anika Patel — Daughter Starts College",
          "EventType": "Graduation",
          "EventDate": "2026-09-01T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fUJAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fUJAAY",
            "Name": "Anika A Patel",
            "AccountId": "001am000026ZtgKAAS",
            "Account": {
              "Id": "001am000026ZtgKAAS",
              "Name": "Anika A Patel",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000LC7pCAG",
          "Name": "Appointed CEO Morris Roasters",
          "EventType": "Job",
          "EventDate": "2026-05-04T16:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9YCCA0",
          "Name": "Patel Daughter — Engagement Announced",
          "EventType": "Marriage",
          "EventDate": "2026-04-12T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9c09AAA",
          "PrimaryPerson": {
            "Id": "003am00000c9c09AAA",
            "Name": "Anika Patel",
            "AccountId": "001am000026ZtwPAAS",
            "Account": {
              "Id": "001am000026ZtwPAAS",
              "Name": "Patel Family Holdings",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZrCAK",
          "Name": "Julia Nakamura — Considering Relocation",
          "EventType": "Relocation",
          "EventDate": "2026-03-01T05:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fUKAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fUKAAY",
            "Name": "Julia D Nakamura",
            "AccountId": "001am000026ZtgLAAS",
            "Account": {
              "Id": "001am000026ZtgLAAS",
              "Name": "Julia D Nakamura",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZmCAK",
          "Name": "David Chen — Relocation to East Bay",
          "EventType": "Relocation",
          "EventDate": "2026-02-28T05:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fUHAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fUHAAY",
            "Name": "David H Chen",
            "AccountId": "001am000026ZtgIAAS",
            "Account": {
              "Id": "001am000026ZtgIAAS",
              "Name": "David H Chen",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9YACA0",
          "Name": "David Chen — Relocation to East Bay",
          "EventType": "Relocation",
          "EventDate": "2026-02-28T05:00:00.000Z",
          "PrimaryPersonId": "003am00000c84ogAAA",
          "PrimaryPerson": {
            "Id": "003am00000c84ogAAA",
            "Name": "David Chen",
            "AccountId": "001am000026ZkI2AAK",
            "Account": {
              "Id": "001am000026ZkI2AAK",
              "Name": "Chen Family Trust",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZtCAK",
          "Name": "Ethan Brooks — Yacht Purchase",
          "EventType": "Home",
          "EventDate": "2026-02-10T05:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fULAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fULAAY",
            "Name": "Ethan D Brooks",
            "AccountId": "001am000026ZtgMAAS",
            "Account": {
              "Id": "001am000026ZtgMAAS",
              "Name": "Ethan D Brooks",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZnCAK",
          "Name": "Marcus Rodriguez — Left Executive Role",
          "EventType": "Job",
          "EventDate": "2025-12-31T05:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fUIAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fUIAAY",
            "Name": "Marcus G Rodriguez",
            "AccountId": "001am000026ZtgJAAS",
            "Account": {
              "Id": "001am000026ZtgJAAS",
              "Name": "Marcus G Rodriguez",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9YFCA0",
          "Name": "Marcus Okafor — Board Appointment",
          "EventType": "Job",
          "EventDate": "2025-11-01T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9WfaAAE",
          "PrimaryPerson": {
            "Id": "003am00000c9WfaAAE",
            "Name": "Marcus Okafor",
            "AccountId": "001am000026ZgO7AAK",
            "Account": {
              "Id": "001am000026ZgO7AAK",
              "Name": "Okafor Capital Holdings",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9YHCA0",
          "Name": "Helena Brandt — Second Child Born",
          "EventType": "Baby",
          "EventDate": "2025-09-22T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9c4zAAA",
          "PrimaryPerson": {
            "Id": "003am00000c9c4zAAA",
            "Name": "Helena Brandt",
            "AccountId": "001am000026ZtmjAAC",
            "Account": {
              "Id": "001am000026ZtmjAAC",
              "Name": "Brandt Holdings LLC",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9YECA0",
          "Name": "Katherine Vogel — Lake Home Purchase",
          "EventType": "Home",
          "EventDate": "2025-08-15T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9c1lAAA",
          "PrimaryPerson": {
            "Id": "003am00000c9c1lAAA",
            "Name": "Katherine Vogel",
            "AccountId": "001am000026ZldvAAC",
            "Account": {
              "Id": "001am000026ZldvAAC",
              "Name": "Vogel Family Trust",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZuCAK",
          "Name": "Priya Venkatesh — CTO Promotion",
          "EventType": "Job",
          "EventDate": "2025-07-01T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fUMAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fUMAAY",
            "Name": "Priya S Venkatesh",
            "AccountId": "001am000026ZtgNAAS",
            "Account": {
              "Id": "001am000026ZtgNAAS",
              "Name": "Priya S Venkatesh",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZpCAK",
          "Name": "Anika Patel — Investment Property Purchase",
          "EventType": "Home",
          "EventDate": "2025-06-15T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fUJAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fUJAAY",
            "Name": "Anika A Patel",
            "AccountId": "001am000026ZtgKAAS",
            "Account": {
              "Id": "001am000026ZtgKAAS",
              "Name": "Anika A Patel",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZvCAK",
          "Name": "Priya Venkatesh — Marriage",
          "EventType": "Marriage",
          "EventDate": "2024-10-12T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fUMAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fUMAAY",
            "Name": "Priya S Venkatesh",
            "AccountId": "001am000026ZtgNAAS",
            "Account": {
              "Id": "001am000026ZtgNAAS",
              "Name": "Priya S Venkatesh",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9YDCA0",
          "Name": "Patel Daughter — College Graduation",
          "EventType": "Graduation",
          "EventDate": "2024-05-18T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9c09AAA",
          "PrimaryPerson": {
            "Id": "003am00000c9c09AAA",
            "Name": "Anika Patel",
            "AccountId": "001am000026ZtwPAAS",
            "Account": {
              "Id": "001am000026ZtwPAAS",
              "Name": "Patel Family Holdings",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZqCAK",
          "Name": "Julia Nakamura — Company Acquisition",
          "EventType": "Job",
          "EventDate": "2024-03-15T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fUKAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fUKAAY",
            "Name": "Julia D Nakamura",
            "AccountId": "001am000026ZtgLAAS",
            "Account": {
              "Id": "001am000026ZtgLAAS",
              "Name": "Julia D Nakamura",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000LNlpCAG",
          "Name": "New Job on 2024-03-10",
          "EventType": "New Job",
          "EventDate": "2024-03-10T00:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9YBCA0",
          "Name": "Luis Rodriguez — Executive Retirement",
          "EventType": "Retirement",
          "EventDate": "2023-06-30T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9U4hAAE",
          "PrimaryPerson": {
            "Id": "003am00000c9U4hAAE",
            "Name": "Luis Rodriguez",
            "AccountId": "001am000026ZhLmAAK",
            "Account": {
              "Id": "001am000026ZhLmAAK",
              "Name": "Rodriguez Retirement Holdings",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9YGCA0",
          "Name": "Helena Brandt — Relocation to Seattle",
          "EventType": "Relocation",
          "EventDate": "2021-07-01T04:00:00.000Z",
          "PrimaryPersonId": "003am00000c9c4zAAA",
          "PrimaryPerson": {
            "Id": "003am00000c9c4zAAA",
            "Name": "Helena Brandt",
            "AccountId": "001am000026ZtmjAAC",
            "Account": {
              "Id": "001am000026ZtmjAAC",
              "Name": "Brandt Holdings LLC",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000Az0eCAC",
          "Name": "Audi Q7",
          "EventType": "Car",
          "EventDate": "2021-01-04T20:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZsCAK",
          "Name": "Ethan Brooks — Retirement from Surgery",
          "EventType": "Retirement",
          "EventDate": "2020-12-31T05:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fULAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fULAAY",
            "Name": "Ethan D Brooks",
            "AccountId": "001am000026ZtgMAAS",
            "Account": {
              "Id": "001am000026ZtgMAAS",
              "Name": "Ethan D Brooks",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000LNlnCAG",
          "Name": "New Home on 2019-10-03",
          "EventType": "New Home",
          "EventDate": "2019-10-03T00:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9ZlCAK",
          "Name": "David Chen — Early Retirement",
          "EventType": "Retirement",
          "EventDate": "2019-01-15T05:00:00.000Z",
          "PrimaryPersonId": "003am00000c9fUHAAY",
          "PrimaryPerson": {
            "Id": "003am00000c9fUHAAY",
            "Name": "David H Chen",
            "AccountId": "001am000026ZtgIAAS",
            "Account": {
              "Id": "001am000026ZtgIAAS",
              "Name": "David H Chen",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000L9Y9CAK",
          "Name": "David Chen — Early Retirement",
          "EventType": "Retirement",
          "EventDate": "2019-01-15T05:00:00.000Z",
          "PrimaryPersonId": "003am00000c84ogAAA",
          "PrimaryPerson": {
            "Id": "003am00000c84ogAAA",
            "Name": "David Chen",
            "AccountId": "001am000026ZkI2AAK",
            "Account": {
              "Id": "001am000026ZkI2AAK",
              "Name": "Chen Family Trust",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000LNloCAG",
          "Name": "College on 2018-05-11",
          "EventType": "College",
          "EventDate": "2018-05-11T00:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000Az0fCAC",
          "Name": "Purchased Home",
          "EventType": "Home",
          "EventDate": "2018-05-02T19:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000Az0gCAC",
          "Name": "Moved to San Francisco",
          "EventType": "Relocation",
          "EventDate": "2018-04-09T19:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000Az0mCAC",
          "Name": "Founded Roastery",
          "EventType": "Job",
          "EventDate": "2010-07-28T19:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000Az0nCAC",
          "Name": "Marriage",
          "EventType": "Marriage",
          "EventDate": "2000-10-11T19:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000Az0pCAC",
          "Name": "Baby",
          "EventType": "Baby",
          "EventDate": "1993-08-28T19:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "0Yram000000Az0lCAC",
          "Name": "Graduation",
          "EventType": "Graduation",
          "EventDate": "1993-05-31T19:00:00.000Z",
          "PrimaryPersonId": "003am000008yOmCAAU",
          "PrimaryPerson": {
            "Id": "003am000008yOmCAAU",
            "Name": "Julie E Morris",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        }
      ]
    },
    "financialGoals": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "capturedAt": "2026-11-13",
      "complete": true,
      "returnedRows": 4,
      "totalCount": 4,
      "pageInfo": {
        "hasNextPage": false,
        "endCursor": "djE6Mw=="
      },
      "query": "query WealthGoalsAudit {uiapi{query{FinancialGoal(first:200,where:{FinancialPlan:{Account:{OwnerId:{eq:\"005am000003PbCLAA0\"}}}},orderBy:{TargetDate:{order:ASC}}){totalCount edges{node{Id Name @optional{value} Type @optional{value} Status @optional{value} Priority @optional{value} Description @optional{value} TargetDate @optional{value} TargetAmount @optional{value} ActualAmount @optional{value} FinancialPlanId @optional{value} FinancialPlan @optional{Id Name @optional{value} AccountId @optional{value} Account @optional{Id Name @optional{value} OwnerId @optional{value}}}}} pageInfo{hasNextPage endCursor}}}}}",
      "rows": [
        {
          "Id": "13Ram000000AQCbEAO",
          "Name": "Estate Planning",
          "Type": "Home",
          "Status": "COMPLETED",
          "Priority": "MEDIUM",
          "Description": null,
          "TargetDate": "2017-11-09",
          "TargetAmount": 1500000,
          "ActualAmount": 1500000,
          "FinancialPlanId": "13Qam000000KnixEAC",
          "FinancialPlan": {
            "Id": "13Qam000000KnixEAC",
            "Name": "Retire with Financial Freedom",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "13Ram000000AQCfEAO",
          "Name": "Charitable Giving",
          "Type": "Other",
          "Status": "IN_PROGRESS",
          "Priority": "MEDIUM",
          "Description": null,
          "TargetDate": "2030-12-31",
          "TargetAmount": 100000,
          "ActualAmount": 15000,
          "FinancialPlanId": "13Qam000000KniwEAC",
          "FinancialPlan": {
            "Id": "13Qam000000KniwEAC",
            "Name": "Philanthropic Impact",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "13Ram000000AQCaEAO",
          "Name": "Vacation Home",
          "Type": "Home",
          "Status": "IN_PROGRESS",
          "Priority": "MEDIUM",
          "Description": null,
          "TargetDate": "2045-06-13",
          "TargetAmount": 650000,
          "ActualAmount": 208000,
          "FinancialPlanId": "13Qam000000KnixEAC",
          "FinancialPlan": {
            "Id": "13Qam000000KnixEAC",
            "Name": "Retire with Financial Freedom",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        },
        {
          "Id": "13Ram000000AQCZEA4",
          "Name": "Retirement",
          "Type": "Retirement",
          "Status": "IN_PROGRESS",
          "Priority": "LOW",
          "Description": null,
          "TargetDate": "2047-05-13",
          "TargetAmount": 7000000,
          "ActualAmount": 6750000,
          "FinancialPlanId": "13Qam000000KnixEAC",
          "FinancialPlan": {
            "Id": "13Qam000000KnixEAC",
            "Name": "Retire with Financial Freedom",
            "AccountId": "001am00000qvjsAAAQ",
            "Account": {
              "Id": "001am00000qvjsAAAQ",
              "Name": "Julie E Morris",
              "OwnerId": "005am000003PbCLAA0"
            }
          }
        }
      ]
    },
    "financialPlans": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "capturedAt": "2026-11-13",
      "complete": true,
      "returnedRows": 2,
      "totalCount": 2,
      "pageInfo": {
        "hasNextPage": false,
        "endCursor": "djE6MQ=="
      },
      "query": "query WealthPlansAudit {uiapi{query{FinancialPlan(first:200,where:{Account:{OwnerId:{eq:\"005am000003PbCLAA0\"}}}){totalCount edges{node{Id Name @optional{value} AccountId @optional{value} Account @optional{Id Name @optional{value} OwnerId @optional{value}}}} pageInfo{hasNextPage endCursor}}}}}",
      "rows": [
        {
          "Id": "13Qam000000KniwEAC",
          "Name": "Philanthropic Impact",
          "AccountId": "001am00000qvjsAAAQ",
          "Account": {
            "Id": "001am00000qvjsAAAQ",
            "Name": "Julie E Morris",
            "OwnerId": "005am000003PbCLAA0"
          }
        },
        {
          "Id": "13Qam000000KnixEAC",
          "Name": "Retire with Financial Freedom",
          "AccountId": "001am00000qvjsAAAQ",
          "Account": {
            "Id": "001am00000qvjsAAAQ",
            "Name": "Julie E Morris",
            "OwnerId": "005am000003PbCLAA0"
          }
        }
      ]
    }
  }
};

/* Verified source refresh for existing exact-Contact/FinancialPlan native forms. */
if(globalThis.wealthCaptureData&&wealthLifeData.orgId===wealthCaptureData.orgId&&wealthLifeData.ownerId===wealthCaptureData.ownerId){const s=wealthLifeData.sources;if(s.financialGoals.complete)wealthCaptureData.goals=s.financialGoals.rows;if(s.financialPlans.complete)wealthCaptureData.financialPlans=s.financialPlans.rows;if(typeof workspaceCapture!=='undefined'&&s.lifeEvents.complete)workspaceCapture.personas.wealth.lifeEvents=s.lifeEvents.rows;}
