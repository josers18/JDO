-- gong
SELECT g.account_id__c AS account_id, g.overall_sentiment__c AS sentiment,
         g.deal_risk_score__c AS deal_risk, g.next_scheduled_call_date__c AS next_call,
         g.rm_last_logged_note_date__c AS last_note, g.key_topics_flags__c AS topics, g.profile_week__c AS period, g.sentiment_trend__c AS trend, g.last_call_date__c AS last_call
  FROM BT_Gong_Call_Sentiment__dlm g
  WHERE g.profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
    AND g.overall_sentiment__c IN ('Negative', 'Very Negative')
    AND g.sentiment_trend__c = 'Declining'
    AND g.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ORDER BY g.deal_risk_score__c DESC
  LIMIT 8;

-- gongWeekly
SELECT profile_week__c AS week, COUNT(DISTINCT account_id__c) AS n
  FROM BT_Gong_Call_Sentiment__dlm
  WHERE overall_sentiment__c IN ('Negative', 'Very Negative')
    AND sentiment_trend__c = 'Declining'
    AND profile_week__c >= (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm) - INTERVAL '49' DAY
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  GROUP BY profile_week__c
  ORDER BY profile_week__c;

-- aml
SELECT c.account_id__c AS account_id, c.overall_risk_rating__c AS risk_rating,
         p.overall_risk_rating__c AS prev_rating, c.pep_hit__c AS pep, c.sanctions_hit__c AS sanctions,
         c.adverse_media_hit__c AS adverse_media, c.adverse_media_categories__c AS am_cats,
         c.case_reference__c AS case_ref, c.risk_jurisdiction_code__c AS jur, c.profile_date__c AS screened, c.change_since_last_run__c AS change_type
  FROM BT_WorldCheck_AML__dlm c
  LEFT JOIN BT_WorldCheck_AML__dlm p ON p.account_id__c = c.account_id__c
    AND p.profile_date__c = (SELECT MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm
                             WHERE profile_date__c < (SELECT MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm))
  WHERE c.profile_date__c = (SELECT MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm)
    AND (   (c.change_since_last_run__c = 'New' AND c.overall_risk_rating__c IN ('High', 'Severe'))
         OR (c.change_since_last_run__c = 'Changed'
             AND (   (c.overall_risk_rating__c = 'Severe' AND COALESCE(p.overall_risk_rating__c, '') <> 'Severe')
                  OR (c.overall_risk_rating__c = 'High' AND COALESCE(p.overall_risk_rating__c, '') NOT IN ('High', 'Severe'))
                  OR (c.overall_risk_rating__c = 'Medium' AND COALESCE(p.overall_risk_rating__c, 'Low') = 'Low'))))
    AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ORDER BY CASE WHEN c.overall_risk_rating__c = 'Severe' THEN 4 WHEN c.overall_risk_rating__c = 'High' THEN 3 ELSE 2 END DESC
  LIMIT 8;

-- inflows
SELECT account_id, amount, description, tx_date FROM (
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
  LIMIT 8;

-- campaigns
SELECT account_id, campaign, product, clicks, opens, last_at FROM (
    SELECT x.*, ROW_NUMBER() OVER (PARTITION BY campaign ORDER BY clicks DESC, last_at DESC) AS pn FROM (
      SELECT m.account_id__c AS account_id, m.campaign_name__c AS campaign, m.product_name__c AS product,
             SUM(CASE WHEN m.engagement_type__c = 'Clicked' THEN 1 ELSE 0 END) AS clicks,
             SUM(CASE WHEN m.engagement_type__c = 'Opened' THEN 1 ELSE 0 END) AS opens,
             MAX(m.engagement_at__c) AS last_at,
             ROW_NUMBER() OVER (PARTITION BY m.account_id__c ORDER BY SUM(CASE WHEN m.engagement_type__c = 'Clicked' THEN 1 ELSE 0 END) DESC, MAX(m.engagement_at__c) DESC) AS rn
      FROM Marketing_Engagements__dlm m
      WHERE m.engagement_type__c IN ('Opened', 'Clicked')
        AND m.personal_business__c = 'Personal'
        AND m.engagement_at__c >= (SELECT MAX(engagement_at__c) FROM Marketing_Engagements__dlm
                                   WHERE engagement_type__c = 'Clicked' AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')) - INTERVAL '30' DAY
        AND m.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
        AND m.account_id__c NOT IN (SELECT account_id__c FROM Marketing_Engagements__dlm
                                    WHERE engagement_type__c = 'Unsubscribed' AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0'))
      GROUP BY m.account_id__c, m.campaign_name__c, m.product_name__c
    ) x
    WHERE rn = 1 AND clicks > 0
  ) z
  ORDER BY pn, clicks DESC, last_at DESC
  LIMIT 8;

-- liquidity
SELECT account_id__c, person_account_id__c, new_account_id__c, new_employer_name__c,
         contact_name__c, old_title__c, contact_persona__c, was_champion__c,
         relationship_risk_score__c, opportunity_score__c, detected_date__c
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND liquidity_event_flag__c = true
    AND person_account_id__c IS NOT NULL
    AND detected_date__c >= current_date - INTERVAL '180' DAY
    AND person_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ORDER BY opportunity_score__c DESC NULLS LAST, detected_date__c DESC
  LIMIT 8;

-- liquiditySummary
SELECT COUNT(DISTINCT person_account_id__c) AS total
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND liquidity_event_flag__c = true
    AND person_account_id__c IS NOT NULL
    AND detected_date__c >= current_date - INTERVAL '180' DAY
    AND person_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0');

-- property
SELECT account_id__c AS account_id, flood_zone_code__c AS flood_zone, wildfire_risk_score__c AS wildfire,
         estimated_property_value__c AS value, outstanding_mortgage_balance__c AS mortgage,
         primary_property_type__c AS property_type
  FROM BT_Corelogic_Property__dlm
  WHERE profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    AND is_owner__c = true AND (flood_zone_code__c IN ('A', 'AE', 'V', 'VE') OR wildfire_risk_score__c >= 70)
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ORDER BY CASE WHEN flood_zone_code__c IN ('A', 'AE', 'V', 'VE') AND wildfire_risk_score__c >= 70 THEN 1 ELSE 0 END DESC, estimated_property_value__c DESC
  LIMIT 6;

-- propertySummary
SELECT COUNT(*) AS homes,
         SUM(CASE WHEN flood_zone_code__c IN ('A', 'AE', 'V', 'VE') THEN 1 ELSE 0 END) AS flood,
         SUM(CASE WHEN wildfire_risk_score__c >= 70 THEN 1 ELSE 0 END) AS wildfire,
         SUM(CASE WHEN flood_zone_code__c IN ('A', 'AE', 'V', 'VE') AND wildfire_risk_score__c >= 70 THEN 1 ELSE 0 END) AS both_hazards,
         SUM(estimated_property_value__c) AS home_value,
         SUM(outstanding_mortgage_balance__c) AS mortgage
  FROM BT_Corelogic_Property__dlm
  WHERE profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    AND is_owner__c = true AND (flood_zone_code__c IN ('A', 'AE', 'V', 'VE') OR wildfire_risk_score__c >= 70)
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0');

-- serviceSummary
SELECT COUNT(*) AS open_n,
         SUM(CASE WHEN ssot__CreatedDate__c < current_date - INTERVAL '30' DAY THEN 1 ELSE 0 END) AS aged_n
  FROM ssot__Case__dlm
  WHERE ssot__DataSourceObjectId__c = 'service_now_cases'
    AND ssot__CaseStatusId__c IN ('open', 'in_progress')
    AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0');

-- serviceProbe
SELECT * FROM ssot__Case__dlm WHERE ssot__DataSourceObjectId__c = 'service_now_cases' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0') LIMIT 1;

-- engagementSummary
WITH latest AS (SELECT accountid__c acct,csat_score__c csat,nps_score__c nps,score_date__c period,ROW_NUMBER() OVER(PARTITION BY accountid__c ORDER BY score_date__c DESC) rn FROM CSAT_Snowflake__dlm WHERE accountid__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')) SELECT COUNT(*) profiles,SUM(CASE WHEN csat<70 THEN 1 ELSE 0 END) low_csat,AVG(csat) average_csat,MAX(period) period FROM latest WHERE rn=1;

-- periods
SELECT 'marketing' source,CAST(MAX(engagement_at__c) AS VARCHAR) period FROM Marketing_Engagements__dlm WHERE account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0') UNION ALL SELECT 'property',CAST(MAX(profile_quarter__c) AS VARCHAR) FROM BT_Corelogic_Property__dlm WHERE account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0') UNION ALL SELECT 'gong',CAST(MAX(profile_week__c) AS VARCHAR) FROM BT_Gong_Call_Sentiment__dlm WHERE account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0') UNION ALL SELECT 'aml',CAST(MAX(profile_date__c) AS VARCHAR) FROM BT_WorldCheck_AML__dlm WHERE account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0') UNION ALL SELECT 'service',CAST(MAX(ssot__LastModifiedDate__c) AS VARCHAR) FROM ssot__Case__dlm WHERE ssot__DataSourceObjectId__c = 'service_now_cases' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0');

-- service
SELECT ssot__Id__c case_id,ssot__CaseNumber__c case_number,ssot__AccountId__c account,ssot__Subject__c subject,ssot__CaseStatusId__c status,ssot__CasePriorityId__c priority,ssot__CreatedDate__c created,ssot__LastModifiedDate__c modified,ssot__Description__c description,ssot__AssignedUserId__c assignee FROM ssot__Case__dlm WHERE ssot__DataSourceObjectId__c='service_now_cases' AND ssot__CaseStatusId__c IN ('open','in_progress') AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0') ORDER BY ssot__CreatedDate__c LIMIT 12;

-- propertyCohorts
SELECT account_id,flood_zone,wildfire,value,mortgage,property_type,period,cohort FROM (SELECT account_id__c account_id,flood_zone_code__c flood_zone,wildfire_risk_score__c wildfire,estimated_property_value__c value,outstanding_mortgage_balance__c mortgage,primary_property_type__c property_type,profile_quarter__c period,CASE WHEN flood_zone_code__c IN ('A','AE','V','VE') AND wildfire_risk_score__c>=70 THEN 'both' WHEN flood_zone_code__c IN ('A','AE','V','VE') THEN 'flood' ELSE 'fire' END cohort,ROW_NUMBER() OVER(PARTITION BY CASE WHEN flood_zone_code__c IN ('A','AE','V','VE') AND wildfire_risk_score__c>=70 THEN 'both' WHEN flood_zone_code__c IN ('A','AE','V','VE') THEN 'flood' ELSE 'fire' END ORDER BY estimated_property_value__c DESC) rn FROM BT_Corelogic_Property__dlm WHERE profile_quarter__c=(SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm) AND is_owner__c=true AND (flood_zone_code__c IN ('A','AE','V','VE') OR wildfire_risk_score__c>=70) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')) x WHERE rn<=4 ORDER BY cohort,value DESC;
