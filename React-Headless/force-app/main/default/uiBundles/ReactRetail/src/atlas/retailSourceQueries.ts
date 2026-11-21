// Data 360 query shapes verified in the Retail Atlas capture runbooks. Each request uses the current book filter.

export const sourceQueries = {
  stressTotal: { limit: 1, sql: (filter: string) => `
  WITH st AS (
    SELECT account_id__c AS acct,
           SUM(CASE WHEN financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS months_high,
           MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) AND financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS now_high,
           MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) THEN life_stage__c END) AS life_stage,
           MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) THEN prizm_segment_name__c END) AS prizm
    FROM BT_Claritas_Demographics__dlm
    WHERE account_id__c ${filter}
    GROUP BY account_id__c
  ),
  od AS (
    SELECT SFAccountID__c AS acct, COUNT(*) AS fees, SUM(ssot__TransactionAmount__c) AS fee_total
    FROM ssot__FinancialAccountTransaction__dlm
    WHERE ssot__Description__c = 'Overdraft Fee'
      AND ssot__TransactionDate__c >= current_date - INTERVAL '30' DAY
      AND SFAccountID__c ${filter}
    GROUP BY SFAccountID__c
  )
  SELECT COUNT(*) AS high_now,
         SUM(CASE WHEN st.months_high >= 4 THEN 1 ELSE 0 END) AS persistent,
         SUM(CASE WHEN od.acct IS NOT NULL THEN 1 ELSE 0 END) AS with_fees,
         SUM(CASE WHEN od.acct IS NOT NULL AND st.months_high >= 4 THEN 1 ELSE 0 END) AS both_
  FROM st LEFT JOIN od ON od.acct = st.acct
  WHERE st.now_high = 1

  ` },
  stressRows: { limit: 6, sql: (filter: string) => `
  WITH st AS (
    SELECT account_id__c AS acct,
           COUNT(DISTINCT CASE WHEN financial_stress_indicator__c = 'High' THEN profile_month__c END) AS months_high,
           MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) AND financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS now_high,
           MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) THEN life_stage__c END) AS life_stage,
           MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) THEN prizm_segment_name__c END) AS prizm
    FROM BT_Claritas_Demographics__dlm
    WHERE account_id__c ${filter}
      AND profile_month__c >= (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) - INTERVAL '5' MONTH
    GROUP BY account_id__c
  ),
  od AS (
    SELECT SFAccountID__c AS acct, COUNT(*) AS fees, SUM(ssot__TransactionAmount__c) AS fee_total
    FROM ssot__FinancialAccountTransaction__dlm
    WHERE ssot__Description__c = 'Overdraft Fee'
      AND ssot__TransactionDate__c >= current_date - INTERVAL '30' DAY
      AND SFAccountID__c ${filter}
    GROUP BY SFAccountID__c
  )
  SELECT st.acct AS account_id, st.months_high AS months_high, st.life_stage AS life_stage, st.prizm AS prizm,
         COALESCE(od.fees, 0) AS fees, COALESCE(od.fee_total, 0) AS fee_total
  FROM st LEFT JOIN od ON od.acct = st.acct
  WHERE st.now_high = 1
  ORDER BY st.months_high DESC, COALESCE(od.fees, 0) DESC, st.acct
  LIMIT 6

  ` },
  stressHistory: { limit: 8, sql: (filter: string) => `
  SELECT profile_month__c AS period, COUNT(DISTINCT account_id__c) AS high
  FROM BT_Claritas_Demographics__dlm
  WHERE financial_stress_indicator__c = 'High' AND account_id__c ${filter}
    AND profile_month__c >= (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) - INTERVAL '5' MONTH
  GROUP BY profile_month__c
  ORDER BY profile_month__c

  ` },
  depositTotal: { limit: 1, sql: (filter: string) => `
  WITH a AS (
    SELECT account_id__c AS acct, institution_name__c AS inst, institution_type__c AS itype,
           balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,
           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY monthly_net_flow_usd__c DESC) AS rn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true
      AND institution_type__c IN ('Bank', 'Credit Union') AND account_type__c IN ('Checking', 'Savings')
      AND account_id__c ${filter}
  ),
  d AS (
    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts,
           MAX(CASE WHEN rn = 1 THEN inst END) AS inst, MAX(CASE WHEN rn = 1 THEN itype END) AS itype
    FROM a GROUP BY acct
  )
  SELECT COUNT(*) AS clients, SUM(bal) AS bal,
         SUM(CASE WHEN flow > 0 THEN 1 ELSE 0 END) AS leaving,
         SUM(CASE WHEN flow > 0 THEN flow ELSE 0 END) AS outflow,
         SUM(CASE WHEN flow >= 5000 THEN 1 ELSE 0 END) AS retention
  FROM d

  ` },
  depositRows: { limit: 6, sql: (filter: string) => `
  WITH a AS (
    SELECT account_id__c AS acct, institution_name__c AS inst, institution_type__c AS itype,
           balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,
           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY monthly_net_flow_usd__c DESC) AS rn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true
      AND institution_type__c IN ('Bank', 'Credit Union') AND account_type__c IN ('Checking', 'Savings')
      AND account_id__c ${filter}
  ),
  d AS (
    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts,
           MAX(CASE WHEN rn = 1 THEN inst END) AS inst, MAX(CASE WHEN rn = 1 THEN itype END) AS itype
    FROM a GROUP BY acct
  )
  SELECT acct AS account_id, bal, flow, accts, inst, itype FROM d
  ORDER BY flow DESC, acct
  LIMIT 6

  ` },
  browsing: { limit: 25, sql: (filter: string) => `
  WITH raw AS (
    SELECT ssot__Id__c AS eid, ssot__IndividualId__c AS dev, ssot__EngagementDateTm__c AS ts, ssot__LinkURL__c AS url
    FROM ssot__WebsiteEngagement__dlm
    WHERE ssot__DataSourceObjectId__c = 'CumulusRTOM_Behavioral_Events_5DD30D2C'
      AND ssot__EngagementChannelActionId__c = 'Viewed Product Detail' AND ssot__LinkURL__c LIKE '%/products/%/%'
    UNION ALL
    SELECT eventId__c AS eid, deviceId__c AS dev, dateTime__c AS ts, webInteractions_sourceUrl__c AS url
    FROM CumulusWeb_Engagements__dlm
    WHERE webInteractions_sourceUrl__c LIKE '%/products/%/%'
  ),
  seq AS (SELECT eid, dev, ts, url, LAG(ts) OVER (PARTITION BY dev, url ORDER BY ts) AS prev FROM raw),
  ev AS (SELECT eid, dev, ts, url FROM seq WHERE prev IS NULL OR ts > prev + INTERVAL '2' SECOND),
  ac AS (
    SELECT DISTINCT l.SourceRecordId__c AS dev, l.UnifiedRecordId__c AS hh, a2.SourceRecordId__c AS acct
    FROM UnifiedLinkssotAccountAcc__dlm l
    JOIN UnifiedLinkssotAccountAcc__dlm a2 ON a2.UnifiedRecordId__c = l.UnifiedRecordId__c
    WHERE a2.SourceRecordId__c LIKE '001%' AND a2.SourceRecordId__c ${filter}
  ),
  rec AS (SELECT DISTINCT ev.eid AS eid, ac.hh AS hh, ac.acct AS acct, ev.ts AS ts, ev.url AS url FROM ev JOIN ac ON ac.dev = ev.dev),
  win AS (SELECT MAX(ts) AS hi FROM rec)
  SELECT rec.hh AS hh, MIN(rec.acct) AS account_id, COUNT(DISTINCT rec.acct) AS accounts, rec.url AS url,
         COUNT(DISTINCT rec.eid) AS views, MAX(rec.ts) AS last_ts, MAX(win.hi) AS hi
  FROM rec, win
  WHERE rec.ts >= win.hi - INTERVAL '7' DAY
  GROUP BY rec.hh, rec.url
  ORDER BY views DESC
  LIMIT 25
` },
  who: { limit: 8, sql: (filter: string) => `
WITH c AS (
    SELECT acct, csat, nps, reason FROM (
      SELECT accountid__c AS acct, csat_score__c AS csat, nps_score__c AS nps, csat_description__c AS reason,
             ROW_NUMBER() OVER (PARTITION BY accountid__c ORDER BY score_date__c DESC) AS rn
      FROM CSAT_Snowflake__dlm
      WHERE csat_score__c IS NOT NULL AND accountid__c ${filter}
    ) t WHERE rn = 1 AND csat < 70
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c ${filter}
    GROUP BY account_id__c
  ),
  s AS (
    SELECT acct, months_high FROM (
      SELECT account_id__c AS acct,
             SUM(CASE WHEN financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS months_high,
             MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
                       AND financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS now_high
      FROM BT_Claritas_Demographics__dlm
      WHERE account_id__c ${filter}
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
        AND o.account_id__c ${filter}
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
  ) SELECT b.*, a.ssot__Name__c AS name FROM b JOIN ssot__Account__dlm a ON b.account_id=a.ssot__Id__c ORDER BY b.score DESC LIMIT 8
  ` },
  summary: { limit: 1, sql: (filter: string) => `
WITH c AS (
    SELECT acct, csat, nps, reason FROM (
      SELECT accountid__c AS acct, csat_score__c AS csat, nps_score__c AS nps, csat_description__c AS reason,
             ROW_NUMBER() OVER (PARTITION BY accountid__c ORDER BY score_date__c DESC) AS rn
      FROM CSAT_Snowflake__dlm
      WHERE csat_score__c IS NOT NULL AND accountid__c ${filter}
    ) t WHERE rn = 1 AND csat < 70
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c ${filter}
    GROUP BY account_id__c
  ),
  s AS (
    SELECT acct, months_high FROM (
      SELECT account_id__c AS acct,
             SUM(CASE WHEN financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS months_high,
             MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
                       AND financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS now_high
      FROM BT_Claritas_Demographics__dlm
      WHERE account_id__c ${filter}
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
        AND o.account_id__c ${filter}
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
  ) SELECT COUNT(*) AS clients, SUM(CASE WHEN (CASE WHEN csat IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN deal_risk IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN months_high IS NOT NULL THEN 1 ELSE 0 END)>=2 THEN 1 ELSE 0 END) AS multi FROM b
  ` },
  gong: { limit: 8, sql: (filter: string) => `
SELECT g.account_id__c AS account_id, g.overall_sentiment__c AS sentiment,
         g.deal_risk_score__c AS deal_risk, g.next_scheduled_call_date__c AS next_call,
         g.rm_last_logged_note_date__c AS last_note, g.key_topics_flags__c AS topics, g.profile_week__c AS period, g.sentiment_trend__c AS trend, g.last_call_date__c AS last_call
  FROM BT_Gong_Call_Sentiment__dlm g
  WHERE g.profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
    AND g.overall_sentiment__c IN ('Negative', 'Very Negative')
    AND g.sentiment_trend__c = 'Declining'
    AND g.account_id__c ${filter}
  ORDER BY g.deal_risk_score__c DESC
  LIMIT 8
  ` },
  gongWeekly: { limit: 12, sql: (filter: string) => `
SELECT profile_week__c AS week, COUNT(DISTINCT account_id__c) AS n
  FROM BT_Gong_Call_Sentiment__dlm
  WHERE overall_sentiment__c IN ('Negative', 'Very Negative')
    AND sentiment_trend__c = 'Declining'
    AND profile_week__c >= (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm) - INTERVAL '49' DAY
    AND account_id__c ${filter}
  GROUP BY profile_week__c
  ORDER BY profile_week__c
  ` },
  aml: { limit: 8, sql: (filter: string) => `
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
    AND c.account_id__c ${filter}
  ORDER BY CASE WHEN c.overall_risk_rating__c = 'Severe' THEN 4 WHEN c.overall_risk_rating__c = 'High' THEN 3 ELSE 2 END DESC
  LIMIT 8
  ` },
  inflows: { limit: 8, sql: (filter: string) => `
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
      AND t.SFAccountID__c ${filter}
  ) x
  WHERE rn = 1
  ORDER BY amount DESC
  LIMIT 8
  ` },
  campaigns: { limit: 8, sql: (filter: string) => `
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
                                   WHERE engagement_type__c = 'Clicked' AND account_id__c ${filter}) - INTERVAL '30' DAY
        AND m.account_id__c ${filter}
        AND m.account_id__c NOT IN (SELECT account_id__c FROM Marketing_Engagements__dlm
                                    WHERE engagement_type__c = 'Unsubscribed' AND account_id__c ${filter})
      GROUP BY m.account_id__c, m.campaign_name__c, m.product_name__c
    ) x
    WHERE rn = 1 AND clicks > 0
  ) z
  ORDER BY pn, clicks DESC, last_at DESC
  LIMIT 8
  ` },
  liquidity: { limit: 8, sql: (filter: string) => `
SELECT account_id__c, person_account_id__c, new_account_id__c, new_employer_name__c,
         contact_name__c, old_title__c, contact_persona__c, was_champion__c,
         relationship_risk_score__c, opportunity_score__c, detected_date__c
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND liquidity_event_flag__c = true
    AND person_account_id__c IS NOT NULL
    AND detected_date__c >= current_date - INTERVAL '180' DAY
    AND person_account_id__c ${filter}
  ORDER BY opportunity_score__c DESC NULLS LAST, detected_date__c DESC
  LIMIT 8
  ` },
  propertySummary: { limit: 1, sql: (filter: string) => `
SELECT COUNT(*) AS homes,
         SUM(CASE WHEN flood_zone_code__c IN ('A', 'AE', 'V', 'VE') THEN 1 ELSE 0 END) AS flood,
         SUM(CASE WHEN wildfire_risk_score__c >= 70 THEN 1 ELSE 0 END) AS wildfire,
         SUM(CASE WHEN flood_zone_code__c IN ('A', 'AE', 'V', 'VE') AND wildfire_risk_score__c >= 70 THEN 1 ELSE 0 END) AS both_hazards,
         SUM(estimated_property_value__c) AS home_value,
         SUM(outstanding_mortgage_balance__c) AS mortgage
  FROM BT_Corelogic_Property__dlm
  WHERE profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    AND is_owner__c = true AND (flood_zone_code__c IN ('A', 'AE', 'V', 'VE') OR wildfire_risk_score__c >= 70)
    AND account_id__c ${filter}
  ` },
  propertyCohorts: { limit: 25, sql: (filter: string) => `
SELECT account_id,flood_zone,wildfire,value,mortgage,property_type,period,cohort FROM (SELECT account_id__c account_id,flood_zone_code__c flood_zone,wildfire_risk_score__c wildfire,estimated_property_value__c value,outstanding_mortgage_balance__c mortgage,primary_property_type__c property_type,profile_quarter__c period,CASE WHEN flood_zone_code__c IN ('A','AE','V','VE') AND wildfire_risk_score__c>=70 THEN 'both' WHEN flood_zone_code__c IN ('A','AE','V','VE') THEN 'flood' ELSE 'fire' END cohort,ROW_NUMBER() OVER(PARTITION BY CASE WHEN flood_zone_code__c IN ('A','AE','V','VE') AND wildfire_risk_score__c>=70 THEN 'both' WHEN flood_zone_code__c IN ('A','AE','V','VE') THEN 'flood' ELSE 'fire' END ORDER BY estimated_property_value__c DESC) rn FROM BT_Corelogic_Property__dlm WHERE profile_quarter__c=(SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm) AND is_owner__c=true AND (flood_zone_code__c IN ('A','AE','V','VE') OR wildfire_risk_score__c>=70) AND account_id__c ${filter}) x WHERE rn<=4 ORDER BY cohort,value DESC
  ` },
  serviceSummary: { limit: 1, sql: (filter: string) => `
SELECT COUNT(*) AS open_n,
         SUM(CASE WHEN ssot__CreatedDate__c < current_date - INTERVAL '30' DAY THEN 1 ELSE 0 END) AS aged_n
  FROM ssot__Case__dlm
  WHERE ssot__DataSourceObjectId__c = 'service_now_cases'
    AND ssot__CaseStatusId__c IN ('open', 'in_progress')
    AND ssot__AccountId__c ${filter}
  ` },
  service: { limit: 25, sql: (filter: string) => `
SELECT ssot__Id__c case_id,ssot__CaseNumber__c case_number,ssot__AccountId__c account,ssot__Subject__c subject,ssot__CaseStatusId__c status,ssot__CasePriorityId__c priority,ssot__CreatedDate__c created,ssot__LastModifiedDate__c modified,ssot__Description__c description,ssot__AssignedUserId__c assignee FROM ssot__Case__dlm WHERE ssot__DataSourceObjectId__c='service_now_cases' AND ssot__CaseStatusId__c IN ('open','in_progress') AND ssot__AccountId__c ${filter} ORDER BY ssot__CreatedDate__c LIMIT 12
  ` },
  engagementSummary: { limit: 1, sql: (filter: string) => `
WITH latest AS (SELECT accountid__c acct,csat_score__c csat,nps_score__c nps,score_date__c period,ROW_NUMBER() OVER(PARTITION BY accountid__c ORDER BY score_date__c DESC) rn FROM CSAT_Snowflake__dlm WHERE accountid__c ${filter}) SELECT COUNT(*) profiles,SUM(CASE WHEN csat<70 THEN 1 ELSE 0 END) low_csat,AVG(csat) average_csat,MAX(period) period FROM latest WHERE rn=1
  ` },
  intros: { limit: 6, sql: (filter: string) => `
SELECT x.*, a.ssot__Name__c AS referrer FROM (
  SELECT dst_id, dst_name, dst_owned, src_id, conf, discovered FROM (
    SELECT g.dst_account_id__c AS dst_id, d.ssot__Name__c AS dst_name,
           CASE WHEN d.ssot__OwnerId__c IS NULL THEN 0 ELSE 1 END AS dst_owned,
           g.src_account_id__c AS src_id, g.confidence_pct__c AS conf, g.edge_discovered_date__c AS discovered,
           ROW_NUMBER() OVER (PARTITION BY g.dst_account_id__c ORDER BY g.confidence_pct__c DESC) AS rn
    FROM BT_Synth_Relationship_Graph__dlm g
    JOIN ssot__Account__dlm d ON d.ssot__Id__c = g.dst_account_id__c
    WHERE g.edge_type__c = 'REFERRAL'
      AND g.edge_discovered_date__c >= (SELECT MAX(edge_discovered_date__c) FROM BT_Synth_Relationship_Graph__dlm
                                        WHERE edge_type__c = 'REFERRAL') - INTERVAL '60' DAY
      AND g.src_account_id__c ${filter}
      AND g.dst_account_id__c NOT ${filter}
  ) x
  WHERE rn = 1
  ORDER BY conf DESC, discovered DESC
  LIMIT 6
) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.src_id
  ` },
  rising: { limit: 50, sql: (filter: string) => `
SELECT x.*, a.ssot__Name__c AS name, c.life_stage__c AS stage FROM (SELECT h.acct AS acct, h.code AS code, h.conv AS conv, h.ev AS ev, h.action_rank AS action_rank,
         h.channels AS channels, h.em_p AS em_p, h.cc_p AS cc_p, h.moved AS moved, h.ev_moved AS ev_moved,
         h.first_mo AS first_mo, CAST(h.mo AS VARCHAR) AS mo
  FROM (
    SELECT account_id__c AS acct, action_code__c AS code, start_date__c AS mo,
           conversion_probability__c AS conv, expected_value_uplift__c AS ev,
           recommended_action_rank__c AS action_rank, recommended_channels__c AS channels,
           em_probability__c AS em_p, cc_probability__c AS cc_p,
           conversion_probability__c - FIRST_VALUE(conversion_probability__c)
             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS moved,
           expected_value_uplift__c - FIRST_VALUE(expected_value_uplift__c)
             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS ev_moved,
           CAST(FIRST_VALUE(start_date__c)
             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS VARCHAR) AS first_mo
    FROM BT_Offer_Eligibility_History__dlm
    WHERE start_date__c >= (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm) - INTERVAL '6' MONTH
      AND action_code__c IN ('CHK-ACQ', 'HYS-ACQ', 'CRC-ACQ', 'AUTO-ACQ', 'MTG-30', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
      AND account_id__c ${filter}
  ) h
  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)
    AND h.action_rank IS NOT NULL AND h.ev > 0
    AND (h.moved >= 2 OR h.ev_moved >= 250)
  ORDER BY h.ev_moved DESC
  LIMIT 50) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.acct LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c=x.acct AND c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
  ` },
  falling: { limit: 50, sql: (filter: string) => `
SELECT x.*, a.ssot__Name__c AS name, c.life_stage__c AS stage FROM (SELECT h.acct AS acct, h.code AS code, h.conv AS conv, h.ev AS ev, h.action_rank AS action_rank,
         h.channels AS channels, h.em_p AS em_p, h.cc_p AS cc_p, h.moved AS moved, h.ev_moved AS ev_moved,
         h.first_mo AS first_mo, CAST(h.mo AS VARCHAR) AS mo
  FROM (
    SELECT account_id__c AS acct, action_code__c AS code, start_date__c AS mo,
           conversion_probability__c AS conv, expected_value_uplift__c AS ev,
           recommended_action_rank__c AS action_rank, recommended_channels__c AS channels,
           em_probability__c AS em_p, cc_probability__c AS cc_p,
           conversion_probability__c - FIRST_VALUE(conversion_probability__c)
             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS moved,
           expected_value_uplift__c - FIRST_VALUE(expected_value_uplift__c)
             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS ev_moved,
           CAST(FIRST_VALUE(start_date__c)
             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS VARCHAR) AS first_mo
    FROM BT_Offer_Eligibility_History__dlm
    WHERE start_date__c >= (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm) - INTERVAL '6' MONTH
      AND action_code__c IN ('CHK-ACQ', 'HYS-ACQ', 'CRC-ACQ', 'AUTO-ACQ', 'MTG-30', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
      AND account_id__c ${filter}
  ) h
  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)
    AND h.action_rank IS NOT NULL AND h.ev > 0
    AND (h.moved <= -2 OR h.ev_moved <= -250)
  ORDER BY h.ev_moved ASC
  LIMIT 50) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.acct LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c=x.acct AND c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
  ` },
  whitespace: { limit: 100, sql: (filter: string) => `
SELECT x.*, a.ssot__Name__c AS name, c.life_stage__c AS stage FROM (SELECT t.acct AS acct, t.tot AS tot, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,
         b.conversion_probability__c AS conv, b.expected_value_uplift__c AS ev,
         b.recommended_channels__c AS channels, b.em_probability__c AS em_p, b.cc_probability__c AS cc_p
  FROM (
    SELECT account_id__c AS acct, SUM(expected_value_uplift__c) AS tot
    FROM BT_Offer_Eligibility__dlm
    WHERE action_code__c IN ('CHK-ACQ', 'HYS-ACQ', 'CRC-ACQ', 'AUTO-ACQ', 'MTG-30', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
      AND recommended_action_rank__c IS NOT NULL AND expected_value_uplift__c > 0
      AND account_id__c ${filter}
    GROUP BY account_id__c
    ORDER BY tot DESC
    LIMIT 12
  ) t
  JOIN BT_Offer_Eligibility__dlm b ON b.account_id__c = t.acct
  WHERE b.action_code__c IN ('CHK-ACQ', 'HYS-ACQ', 'CRC-ACQ', 'AUTO-ACQ', 'MTG-30', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
  ORDER BY t.tot DESC) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.acct LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c=x.acct AND c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
  ` },
  equity: { limit: 35, sql: (filter: string) => `
SELECT x.*, a.ssot__Name__c AS name, c.life_stage__c AS stage FROM (SELECT account_id, score, equity, ltv, rate, angle, property_type FROM (
    SELECT account_id__c AS account_id, heloc_opportunity_score__c AS score, equity_usd__c AS equity,
           loan_to_value_pct__c AS ltv, mortgage_rate_pct__c AS rate, primary_property_type__c AS property_type,
           CASE WHEN mortgage_rate_pct__c >= 6.5 AND outstanding_mortgage_balance__c > 0 THEN 'refi' ELSE 'heloc' END AS angle,
           ROW_NUMBER() OVER (PARTITION BY CASE WHEN mortgage_rate_pct__c >= 6.5 AND outstanding_mortgage_balance__c > 0 THEN 'refi' ELSE 'heloc' END ORDER BY heloc_opportunity_score__c DESC, equity_usd__c DESC) AS pn
    FROM BT_Corelogic_Property__dlm
    WHERE profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    AND heloc_opportunity_score__c >= 70 AND is_owner__c = true
      AND account_id__c ${filter}
  ) x
  WHERE pn <= 4
  ORDER BY pn, angle) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.account_id LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c=x.account_id AND c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
  ` },
  equitySummary: { limit: 1, sql: (filter: string) => `
SELECT COUNT(*) AS owners, SUM(equity_usd__c) AS equity,
         SUM(CASE WHEN mortgage_rate_pct__c >= 6.5 AND outstanding_mortgage_balance__c > 0 THEN 1 ELSE 0 END) AS refi,
         CAST(MAX(profile_quarter__c) AS VARCHAR) AS quarter
  FROM BT_Corelogic_Property__dlm
  WHERE profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    AND heloc_opportunity_score__c >= 70 AND is_owner__c = true
    AND account_id__c ${filter}
  ` },
  lifeMix: { limit: 25, sql: (filter: string) => `
SELECT life_stage__c AS life_stage, COUNT(*) AS n,
         AVG(mortgage_propensity_score__c) AS mortgage,
         AVG(investment_propensity_score__c) AS invest,
         AVG(wealth_propensity_score__c) AS wealth,
         SUM(CASE WHEN mortgage_propensity_score__c >= 70 THEN 1 ELSE 0 END) AS mortgage_ready,
         SUM(CASE WHEN investment_propensity_score__c >= 70 THEN 1 ELSE 0 END) AS invest_ready
  FROM BT_Claritas_Demographics__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
    AND account_id__c ${filter}
  GROUP BY life_stage__c
  ORDER BY n DESC
  ` },
  mortgage: { limit: 35, sql: (filter: string) => `
SELECT x.*, a.ssot__Name__c AS name, p.is_owner__c AS is_owner, CAST(p.profile_quarter__c AS VARCHAR) AS property_period FROM (
  WITH l AS (
    SELECT c.account_id__c AS account_id, c.mortgage_propensity_score__c AS score,
           CASE WHEN p.is_owner__c = true AND p.outstanding_mortgage_balance__c > 0 THEN 2
                     WHEN p.is_owner__c = true THEN 1 ELSE 0 END AS tenure, p.outstanding_mortgage_balance__c AS balance, p.mortgage_rate_pct__c AS rate
    FROM BT_Claritas_Demographics__dlm c
    LEFT JOIN BT_Corelogic_Property__dlm p ON p.account_id__c = c.account_id__c
      AND p.profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    WHERE c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
      AND c.life_stage__c = 'Young Families' AND c.mortgage_propensity_score__c >= 70
      AND c.account_id__c ${filter}
  ),
  r AS (
    SELECT l.*, ROW_NUMBER() OVER (PARTITION BY tenure ORDER BY score DESC) AS rn
    FROM l
  )
  SELECT account_id, score, tenure, balance, rate FROM r
  WHERE rn <= 11
  ORDER BY tenure, score DESC
) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.account_id LEFT JOIN BT_Corelogic_Property__dlm p ON p.account_id__c=x.account_id AND p.profile_quarter__c=(SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
  ` },
  investing: { limit: 35, sql: (filter: string) => `
SELECT c.account_id__c AS account_id, a.ssot__Name__c AS name,c.investment_propensity_score__c AS score,c.life_stage__c AS stage,CAST(c.profile_month__c AS VARCHAR) AS period FROM BT_Claritas_Demographics__dlm c JOIN ssot__Account__dlm a ON a.ssot__Id__c=c.account_id__c WHERE c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) AND c.investment_propensity_score__c>=70 AND c.account_id__c ${filter} ORDER BY score DESC LIMIT 12
  ` },
};

export type RetailSource = keyof typeof sourceQueries;
