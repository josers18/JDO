-- warmIntros: bounded, explicit Allen owner scope, captured 2026-11-13

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
      AND g.src_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
      AND g.dst_account_id__c NOT IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
  ) x
  WHERE rn = 1
  ORDER BY conf DESC, discovered DESC
  LIMIT 6
;

-- creditCohorts: bounded, explicit Allen owner scope, captured 2026-11-13
SELECT account_id,paydex,days_beyond,tier,failure,delinquency,period,band FROM (SELECT account_id__c AS account_id,paydex_score__c AS paydex,average_days_beyond_terms__c AS days_beyond,supplier_risk_level__c AS tier,failure_risk_score__c AS failure,delinquency_predictor_score__c AS delinquency,profile_month__c AS period,CASE WHEN average_days_beyond_terms__c>=30 THEN '30+ days beyond terms' WHEN average_days_beyond_terms__c>=15 THEN '15–29 days beyond terms' WHEN average_days_beyond_terms__c>0 THEN '1–14 days beyond terms' ELSE 'Paying on terms' END AS band,ROW_NUMBER() OVER(PARTITION BY CASE WHEN average_days_beyond_terms__c>=30 THEN '30+ days beyond terms' WHEN average_days_beyond_terms__c>=15 THEN '15–29 days beyond terms' WHEN average_days_beyond_terms__c>0 THEN '1–14 days beyond terms' ELSE 'Paying on terms' END ORDER BY paydex_score__c ASC) AS rn FROM BT_DNB_Business_Credit__dlm WHERE profile_month__c=(SELECT MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')) x WHERE rn<=4 ORDER BY band,paydex LIMIT 17;

-- companyCohorts: bounded, explicit Allen owner scope, captured 2026-11-13
SELECT account_id,band,employees,tech,period FROM (SELECT account_id__c AS account_id,revenue_band__c AS band,employee_band__c AS employees,tech_stack_flags__c AS tech,profile_month__c AS period,ROW_NUMBER() OVER(PARTITION BY revenue_band__c ORDER BY account_id__c) AS rn FROM BT_Zoominfo_Firmographics__dlm WHERE profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')) x WHERE rn<=4 ORDER BY band LIMIT 25;
