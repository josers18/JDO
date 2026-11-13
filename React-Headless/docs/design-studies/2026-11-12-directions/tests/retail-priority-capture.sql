-- who | owner 005am000003PbFAAA0 | captured 2026-11-13
WITH c AS (
    SELECT acct, csat, nps, reason FROM (
      SELECT accountid__c AS acct, csat_score__c AS csat, nps_score__c AS nps, csat_description__c AS reason,
             ROW_NUMBER() OVER (PARTITION BY accountid__c ORDER BY score_date__c DESC) AS rn
      FROM CSAT_Snowflake__dlm
      WHERE csat_score__c IS NOT NULL AND accountid__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
    ) t WHERE rn = 1 AND csat < 70
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
    GROUP BY account_id__c
  ),
  s AS (
    SELECT acct, months_high FROM (
      SELECT account_id__c AS acct,
             SUM(CASE WHEN financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS months_high,
             MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
                       AND financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS now_high
      FROM BT_Claritas_Demographics__dlm
      WHERE account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
      GROUP BY account_id__c
    ) t WHERE now_high = 1 AND months_high >= 3
  ),
  o AS (
    SELECT acct, code, conv FROM (
      SELECT o.account_id__c AS acct, o.action_code__c AS code, o.conversion_probability__c AS conv,
             ROW_NUMBER() OVER (PARTITION BY o.account_id__c ORDER BY o.recommended_action_rank__c) AS rn
      FROM BT_Offer_Eligibility__dlm o
      WHERE o.action_code__c IN ('MTG-30', 'AUTO-ACQ', 'CRC-ACQ', 'CHK-ACQ', 'HYS-ACQ', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
        AND o.recommended_action_rank__c IS NOT NULL AND o.expected_value_uplift__c > 0
        AND o.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
    ) t WHERE rn = 1
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM c UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM s UNION ALL SELECT acct FROM o
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, c.csat AS csat, c.nps AS nps, c.reason AS csat_reason,
           g.sentiment AS sentiment, g.risk AS deal_risk, s.months_high AS months_high, o.code AS offer_code, o.conv AS conv,
           0.3 * COALESCE((70 - c.csat) / 50, 0)
         + 0.3 * COALESCE(g.risk / 100, 0)
         + 0.25 * COALESCE(s.months_high / 6.0, 0)
         + 0.15 * COALESCE(CASE WHEN o.conv >= 50 THEN 1 ELSE o.conv / 50 END, 0) AS score
    FROM ids
    LEFT JOIN c ON c.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN s ON s.acct = ids.acct
    LEFT JOIN o ON o.acct = ids.acct
  ) SELECT b.*, a.ssot__Name__c AS name FROM b JOIN ssot__Account__dlm a ON b.account_id=a.ssot__Id__c ORDER BY b.score DESC LIMIT 8;

-- summary | owner 005am000003PbFAAA0 | captured 2026-11-13
WITH c AS (
    SELECT acct, csat, nps, reason FROM (
      SELECT accountid__c AS acct, csat_score__c AS csat, nps_score__c AS nps, csat_description__c AS reason,
             ROW_NUMBER() OVER (PARTITION BY accountid__c ORDER BY score_date__c DESC) AS rn
      FROM CSAT_Snowflake__dlm
      WHERE csat_score__c IS NOT NULL AND accountid__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
    ) t WHERE rn = 1 AND csat < 70
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
    GROUP BY account_id__c
  ),
  s AS (
    SELECT acct, months_high FROM (
      SELECT account_id__c AS acct,
             SUM(CASE WHEN financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS months_high,
             MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
                       AND financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS now_high
      FROM BT_Claritas_Demographics__dlm
      WHERE account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
      GROUP BY account_id__c
    ) t WHERE now_high = 1 AND months_high >= 3
  ),
  o AS (
    SELECT acct, code, conv FROM (
      SELECT o.account_id__c AS acct, o.action_code__c AS code, o.conversion_probability__c AS conv,
             ROW_NUMBER() OVER (PARTITION BY o.account_id__c ORDER BY o.recommended_action_rank__c) AS rn
      FROM BT_Offer_Eligibility__dlm o
      WHERE o.action_code__c IN ('MTG-30', 'AUTO-ACQ', 'CRC-ACQ', 'CHK-ACQ', 'HYS-ACQ', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
        AND o.recommended_action_rank__c IS NOT NULL AND o.expected_value_uplift__c > 0
        AND o.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
    ) t WHERE rn = 1
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM c UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM s UNION ALL SELECT acct FROM o
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, c.csat AS csat, c.nps AS nps, c.reason AS csat_reason,
           g.sentiment AS sentiment, g.risk AS deal_risk, s.months_high AS months_high, o.code AS offer_code, o.conv AS conv,
           0.3 * COALESCE((70 - c.csat) / 50, 0)
         + 0.3 * COALESCE(g.risk / 100, 0)
         + 0.25 * COALESCE(s.months_high / 6.0, 0)
         + 0.15 * COALESCE(CASE WHEN o.conv >= 50 THEN 1 ELSE o.conv / 50 END, 0) AS score
    FROM ids
    LEFT JOIN c ON c.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN s ON s.acct = ids.acct
    LEFT JOIN o ON o.acct = ids.acct
  ) SELECT COUNT(*) AS clients, SUM(CASE WHEN (CASE WHEN csat IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN deal_risk IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN months_high IS NOT NULL THEN 1 ELSE 0 END)>=2 THEN 1 ELSE 0 END) AS multi FROM b;

-- netFlow | owner 005am000003PbFAAA0 | captured 2026-11-13
SELECT CAST(CAST(DATE_TRUNC('week', transactiondate__c) AS DATE) AS VARCHAR) AS week,
         SUM(CASE WHEN transaction_type__c = 'Credit' THEN amount__c ELSE 0 END) AS credits,
         SUM(CASE WHEN transaction_type__c = 'Debit' THEN amount__c ELSE 0 END) AS debits,
         COUNT(*) AS txns, COUNT(DISTINCT accountid__c) AS accts
  FROM Financial_Transactions_BT_Snow__dll
  WHERE transactiondate__c >= CURRENT_DATE - INTERVAL '70' DAY
    AND transactiondate__c < DATE_TRUNC('week', CURRENT_DATE)
    AND account_type__c = 'Personal'
    AND sfaccountid__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  GROUP BY 1
  ORDER BY 1;

-- liquidity | owner 005am000003PbFAAA0 | captured 2026-11-13
SELECT x.*, a.ssot__Name__c AS name FROM (SELECT account_id__c, person_account_id__c, new_account_id__c, new_employer_name__c,
         contact_name__c, old_title__c, contact_persona__c, was_champion__c,
         relationship_risk_score__c, opportunity_score__c, detected_date__c
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND liquidity_event_flag__c = true
    AND person_account_id__c IS NOT NULL
    AND detected_date__c >= current_date - INTERVAL '180' DAY
    AND person_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ORDER BY opportunity_score__c DESC NULLS LAST, detected_date__c DESC
  LIMIT 8) x JOIN ssot__Account__dlm a ON a.ssot__Id__c = x.person_account_id__c;

-- liquiditySummary | owner 005am000003PbFAAA0 | captured 2026-11-13
SELECT COUNT(DISTINCT person_account_id__c) AS total
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND liquidity_event_flag__c = true
    AND person_account_id__c IS NOT NULL
    AND detected_date__c >= current_date - INTERVAL '180' DAY
    AND person_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0');

-- inflows | owner 005am000003PbFAAA0 | captured 2026-11-13
SELECT x.*, a.ssot__Name__c AS name FROM (SELECT account_id, amount, description, tx_date FROM (
    SELECT t.SFAccountID__c AS account_id, t.ssot__TransactionAmount__c AS amount,
           t.ssot__Description__c AS description, t.ssot__TransactionDate__c AS tx_date,
           ROW_NUMBER() OVER (PARTITION BY t.SFAccountID__c ORDER BY t.ssot__TransactionAmount__c DESC) AS rn
    FROM ssot__FinancialAccountTransaction__dlm t
    WHERE t.ssot__FinancialAccountTransactionType__c = 'Credit'
      AND t.ssot__TransactionAmount__c >= 2000
      AND t.ssot__TransactionDate__c >= current_date - INTERVAL '7' DAY
      AND (t.ssot__Description__c LIKE '%Bonus%' OR t.ssot__Description__c LIKE '%BONUS%'
           OR t.ssot__Description__c LIKE '%TAX REF%')
      AND t.SFAccountID__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ) x
  WHERE rn = 1
  ORDER BY amount DESC
  LIMIT 8) x JOIN ssot__Account__dlm a ON a.ssot__Id__c = x.account_id;

-- crmHistory | owner 005am000003PbFAAA0 | captured 2026-11-13
WITH w AS (SELECT 0 AS k, TIMESTAMP '2026-11-14 00:00:00' AS d UNION ALL SELECT 1 AS k, TIMESTAMP '2026-11-07 00:00:00' AS d UNION ALL SELECT 2 AS k, TIMESTAMP '2026-10-31 00:00:00' AS d UNION ALL SELECT 3 AS k, TIMESTAMP '2026-10-24 00:00:00' AS d UNION ALL SELECT 4 AS k, TIMESTAMP '2026-10-17 00:00:00' AS d UNION ALL SELECT 5 AS k, TIMESTAMP '2026-10-10 00:00:00' AS d UNION ALL SELECT 6 AS k, TIMESTAMP '2026-10-03 00:00:00' AS d UNION ALL SELECT 7 AS k, TIMESTAMP '2026-09-26 00:00:00' AS d),
o AS (SELECT ssot__TotalAmount__c amt, ssot__OpportunityStageId__c stage, ssot__IsClosed__c x, ssot__CreatedDate__c cr,
             LEAST(ssot__CloseDate__c, ssot__LastModifiedDate__c) cl
      FROM ssot__Opportunity__dlm WHERE ssot__OwnerUserId__c = '005am000003PbFAAA0'),
cs AS (SELECT c.ssot__IsClosed__c x, c.ssot__CreatedDate__c cr, c.ssot__ClosedDateTime__c cl
       FROM ssot__Case__dlm c JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.ssot__AccountId__c
       WHERE a.ssot__OwnerId__c = '005am000003PbFAAA0'),
l AS (SELECT ssot__IsConverted__c x, ssot__CreatedDate__c cr, ssot__ConvertedDate__c cl
      FROM ssot__Lead__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
SELECT w.k AS k, 'pipeline' AS m, SUM(o.amt) AS v FROM w JOIN o ON o.cr < w.d AND (o.x = 'false' OR o.cl >= w.d) GROUP BY w.k
UNION ALL SELECT w.k, 'openOpps', COUNT(*) FROM w JOIN o ON o.cr < w.d AND (o.x = 'false' OR o.cl >= w.d) GROUP BY w.k
UNION ALL SELECT w.k, CONCAT('stage:', o.stage), SUM(o.amt) FROM w JOIN o ON o.cr < w.d AND o.x = 'false' GROUP BY w.k, o.stage
UNION ALL SELECT w.k, 'openCases', COUNT(*) FROM w JOIN cs ON cs.cr < w.d AND (cs.x = 'false' OR cs.cl >= w.d) GROUP BY w.k
UNION ALL SELECT w.k, 'leads', COUNT(*) FROM w JOIN l ON l.cr < w.d AND (l.x = 'false' OR l.cl >= w.d) GROUP BY w.k;
