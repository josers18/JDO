-- Native crmKpis.historySql reconstruction. 56 returned rows, ResultsProduced, 2026-11-13.
WITH w AS (SELECT 0 AS k, TIMESTAMP '2026-11-13 00:00:00' AS d UNION ALL SELECT 1 AS k, TIMESTAMP '2026-11-06 00:00:00' AS d UNION ALL SELECT 2 AS k, TIMESTAMP '2026-10-30 00:00:00' AS d UNION ALL SELECT 3 AS k, TIMESTAMP '2026-10-23 00:00:00' AS d UNION ALL SELECT 4 AS k, TIMESTAMP '2026-10-16 00:00:00' AS d UNION ALL SELECT 5 AS k, TIMESTAMP '2026-10-09 00:00:00' AS d UNION ALL SELECT 6 AS k, TIMESTAMP '2026-10-02 00:00:00' AS d UNION ALL SELECT 7 AS k, TIMESTAMP '2026-09-25 00:00:00' AS d),
o AS (SELECT ssot__TotalAmount__c amt, ssot__OpportunityStageId__c stage, ssot__IsClosed__c x, ssot__CreatedDate__c cr,
             LEAST(ssot__CloseDate__c, ssot__LastModifiedDate__c) cl
      FROM ssot__Opportunity__dlm WHERE ssot__OwnerUserId__c = '005am000003PbFDAA0'),
cs AS (SELECT c.ssot__IsClosed__c x, c.ssot__CreatedDate__c cr, c.ssot__ClosedDateTime__c cl
       FROM ssot__Case__dlm c JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.ssot__AccountId__c
       WHERE a.ssot__OwnerId__c = '005am000003PbFDAA0'),
l AS (SELECT ssot__IsConverted__c x, ssot__CreatedDate__c cr, ssot__ConvertedDate__c cl
      FROM ssot__Lead__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
SELECT w.k AS k, 'pipeline' AS m, SUM(o.amt) AS v FROM w JOIN o ON o.cr < w.d AND (o.x = 'false' OR o.cl >= w.d) GROUP BY w.k
UNION ALL SELECT w.k, 'openOpps', COUNT(*) FROM w JOIN o ON o.cr < w.d AND (o.x = 'false' OR o.cl >= w.d) GROUP BY w.k
UNION ALL SELECT w.k, CONCAT('stage:', o.stage), SUM(o.amt) FROM w JOIN o ON o.cr < w.d AND o.x = 'false' GROUP BY w.k, o.stage
UNION ALL SELECT w.k, 'openCases', COUNT(*) FROM w JOIN cs ON cs.cr < w.d AND (cs.x = 'false' OR cs.cl >= w.d) GROUP BY w.k
UNION ALL SELECT w.k, 'leads', COUNT(*) FROM w JOIN l ON l.cr < w.d AND (l.x = 'false' OR l.cl >= w.d) GROUP BY w.k;
