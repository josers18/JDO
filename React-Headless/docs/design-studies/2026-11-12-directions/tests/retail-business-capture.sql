-- intros | captured 2026-11-13 | owner 005am000003PbFAAA0
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
      AND g.src_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
      AND g.dst_account_id__c NOT IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ) x
  WHERE rn = 1
  ORDER BY conf DESC, discovered DESC
  LIMIT 6
) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.src_id;

-- rising | captured 2026-11-13 | owner 005am000003PbFAAA0
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
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ) h
  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)
    AND h.action_rank IS NOT NULL AND h.ev > 0
    AND (h.moved >= 2 OR h.ev_moved >= 250)
  ORDER BY h.ev_moved DESC
  LIMIT 50) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.acct LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c=x.acct AND c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm);

-- falling | captured 2026-11-13 | owner 005am000003PbFAAA0
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
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ) h
  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)
    AND h.action_rank IS NOT NULL AND h.ev > 0
    AND (h.moved <= -2 OR h.ev_moved <= -250)
  ORDER BY h.ev_moved ASC
  LIMIT 50) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.acct LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c=x.acct AND c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm);

-- whitespace | captured 2026-11-13 | owner 005am000003PbFAAA0
SELECT x.*, a.ssot__Name__c AS name, c.life_stage__c AS stage FROM (SELECT t.acct AS acct, t.tot AS tot, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,
         b.conversion_probability__c AS conv, b.expected_value_uplift__c AS ev,
         b.recommended_channels__c AS channels, b.em_probability__c AS em_p, b.cc_probability__c AS cc_p
  FROM (
    SELECT account_id__c AS acct, SUM(expected_value_uplift__c) AS tot
    FROM BT_Offer_Eligibility__dlm
    WHERE action_code__c IN ('CHK-ACQ', 'HYS-ACQ', 'CRC-ACQ', 'AUTO-ACQ', 'MTG-30', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
      AND recommended_action_rank__c IS NOT NULL AND expected_value_uplift__c > 0
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
    GROUP BY account_id__c
    ORDER BY tot DESC
    LIMIT 12
  ) t
  JOIN BT_Offer_Eligibility__dlm b ON b.account_id__c = t.acct
  WHERE b.action_code__c IN ('CHK-ACQ', 'HYS-ACQ', 'CRC-ACQ', 'AUTO-ACQ', 'MTG-30', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
  ORDER BY t.tot DESC) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.acct LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c=x.acct AND c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm);

-- equity | captured 2026-11-13 | owner 005am000003PbFAAA0
SELECT x.*, a.ssot__Name__c AS name, c.life_stage__c AS stage FROM (SELECT account_id, score, equity, ltv, rate, angle, property_type FROM (
    SELECT account_id__c AS account_id, heloc_opportunity_score__c AS score, equity_usd__c AS equity,
           loan_to_value_pct__c AS ltv, mortgage_rate_pct__c AS rate, primary_property_type__c AS property_type,
           CASE WHEN mortgage_rate_pct__c >= 6.5 AND outstanding_mortgage_balance__c > 0 THEN 'refi' ELSE 'heloc' END AS angle,
           ROW_NUMBER() OVER (PARTITION BY CASE WHEN mortgage_rate_pct__c >= 6.5 AND outstanding_mortgage_balance__c > 0 THEN 'refi' ELSE 'heloc' END ORDER BY heloc_opportunity_score__c DESC, equity_usd__c DESC) AS pn
    FROM BT_Corelogic_Property__dlm
    WHERE profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    AND heloc_opportunity_score__c >= 70 AND is_owner__c = true
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ) x
  WHERE pn <= 4
  ORDER BY pn, angle) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.account_id LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c=x.account_id AND c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm);

-- equitySummary | captured 2026-11-13 | owner 005am000003PbFAAA0
SELECT COUNT(*) AS owners, SUM(equity_usd__c) AS equity,
         SUM(CASE WHEN mortgage_rate_pct__c >= 6.5 AND outstanding_mortgage_balance__c > 0 THEN 1 ELSE 0 END) AS refi,
         CAST(MAX(profile_quarter__c) AS VARCHAR) AS quarter
  FROM BT_Corelogic_Property__dlm
  WHERE profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    AND heloc_opportunity_score__c >= 70 AND is_owner__c = true
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0');

-- lifeMix | captured 2026-11-13 | owner 005am000003PbFAAA0
SELECT life_stage__c AS life_stage, COUNT(*) AS n,
         AVG(mortgage_propensity_score__c) AS mortgage,
         AVG(investment_propensity_score__c) AS invest,
         AVG(wealth_propensity_score__c) AS wealth,
         SUM(CASE WHEN mortgage_propensity_score__c >= 70 THEN 1 ELSE 0 END) AS mortgage_ready,
         SUM(CASE WHEN investment_propensity_score__c >= 70 THEN 1 ELSE 0 END) AS invest_ready
  FROM BT_Claritas_Demographics__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  GROUP BY life_stage__c
  ORDER BY n DESC;

-- mortgage | captured 2026-11-13 | owner 005am000003PbFAAA0
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
      AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0')
  ),
  r AS (
    SELECT l.*, ROW_NUMBER() OVER (PARTITION BY tenure ORDER BY score DESC) AS rn
    FROM l
  )
  SELECT account_id, score, tenure, balance, rate FROM r
  WHERE rn <= 11
  ORDER BY tenure, score DESC
) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.account_id LEFT JOIN BT_Corelogic_Property__dlm p ON p.account_id__c=x.account_id AND p.profile_quarter__c=(SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm);

-- investing | captured 2026-11-13 | owner 005am000003PbFAAA0
SELECT c.account_id__c AS account_id, a.ssot__Name__c AS name,c.investment_propensity_score__c AS score,c.life_stage__c AS stage,CAST(c.profile_month__c AS VARCHAR) AS period FROM BT_Claritas_Demographics__dlm c JOIN ssot__Account__dlm a ON a.ssot__Id__c=c.account_id__c WHERE c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm) AND c.investment_propensity_score__c>=70 AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFAAA0') ORDER BY score DESC LIMIT 12;

-- holderOffers | captured 2026-11-13 | owner 005am000003PbFAAA0
SELECT x.*, a.ssot__Name__c AS name, c.life_stage__c AS stage FROM (SELECT t.acct AS acct, t.tot AS tot, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,
         b.conversion_probability__c AS conv, b.expected_value_uplift__c AS ev,
         b.recommended_channels__c AS channels, b.em_probability__c AS em_p, b.cc_probability__c AS cc_p
  FROM (
    SELECT account_id__c AS acct, SUM(expected_value_uplift__c) AS tot
    FROM BT_Offer_Eligibility__dlm
    WHERE action_code__c IN ('CHK-ACQ', 'HYS-ACQ', 'CRC-ACQ', 'AUTO-ACQ', 'MTG-30', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
      AND recommended_action_rank__c IS NOT NULL AND expected_value_uplift__c > 0
      AND account_id__c IN ('001am00002A9j6EAAR','001am00002A9j5UAAR','001am00002A9FQQAA3','001am00002AYR3yAAH','001am00002A9ipyAAB','001am00002A9j5BAAR','001am00002A9j6VAAR','001am00002A9c2gAAB','001am00002A9c3fAAB','001am00002AAAVxAAP','001am00002A9j9hAAB','001am00002A9inaAAB','001am00002A9j8tAAB','001am00002A9j4WAAR','001am00002A9j7nAAB','001am00002AYR7WAAX','001am00002A8YIjAAN','001am00002AAAMmAAP','001am00002A9j9FAAR','001am00002A9j6NAAR','001am00002AAAV6AAP','001am00002A9j8mAAB','001am00002AAAW3AAP','001am00002A9j2MAAR','001am00002A9FPYAA3','001am00002A9jAYAAZ','001am00002A8YIyAAN','001am00002A9j8zAAB','001am00002A9c3FAAR','001am00002A9j5cAAB','001am00002A9iqZAAR','001am00002AAAKlAAP','001am00002A9j58AAB','001am00002A9jArAAJ','001am00002A8XjHAAV','001am00002A9ipjAAB','001am00002AAAY7AAP','001am00002AYR6gAAH','001am00002AYR6NAAX','001am00002A8YImAAN','001am00002A9jCjAAJ','001am00002AAAPHAA5','001am00002A9in2AAB','001am00002AAAJMAA5','001am00002AAAVwAAP','001am00002A9j4gAAB','001am00002A9inQAAR','001am00002AAAU6AAP','001am00002AAAMHAA5','001am00002AAAUHAA5','001am00002AAAVcAAP','001am00002A9j4IAAR','001am00002AAAUDAA5','001am00002AAAJ1AAP','001am00002A9j6XAAR','001am00002AAAYfAAP','001am00002A9j70AAB','001am00002A9iprAAB','001am00002A9imxAAB','001am00002A9j9RAAR','001am00002A9jDRAAZ','001am00002AAAUrAAP','001am00002AAAWwAAP','001am00002A8YJ1AAN','001am00002A9impAAB','001am00002AAAa1AAH','001am00002AAAXwAAP','001am00002AAATXAA5','001am00002A9j8jAAB','001am00002A9in9AAB','001am00002AAAPNAA5','001am00002AAAL1AAP','001am00002AAARMAA5','001am00002A9imhAAB','001am00002A9jDKAAZ','001am00002AYR89AAH','001am00002A9FQEAA3','001am00002A9ikvAAB','001am00002AAAIyAAP','001am00002A9j6yAAB','001am00002AAASyAAP','001am00002AYR3jAAH','001am00002A9jCSAAZ','001am00002A9jDzAAJ','001am00002A9iq5AAB','001am00002AAAXTAA5','001am00002AYR8BAAX','001am00002A9iphAAB','001am00002A9jCvAAJ','001am00002AAAMUAA5','001am00002AAAOaAAP','001am00002AAAMiAAP','001am00002AYR7qAAH','001am00002A8YIsAAN','001am00002A9j7UAAR','001am00002A8XjVAAV','001am00002AAAYBAA5','001am00002AAAQ2AAP','001am00002AYR4xAAH','001am00002AAAUEAA5','001am00002A9j7rAAB','001am00002AYR6MAAX','001am00002A8YJIAA3','001am00002A9ikgAAB','001am00002AAARCAA5','001am00002AAAXeAAP','001am00002A9jBfAAJ','001am00002A9j6YAAR','001am00002AAAIMAA5','001am00002AAALaAAP','001am00002AYR5cAAH','001am00002A9c2tAAB','001am00002AAAWuAAP','001am00002AAAOqAAP','001am00002A8YJnAAN','001am00002A9imuAAB','001am00002A9j3qAAB','001am00002A9j6ZAAR','001am00002A9jADAAZ','001am00002A9ilcAAB','001am00002A9j4hAAB','001am00002A9j76AAB','001am00002A9jBwAAJ','001am00002AAALDAA5','001am00002A9jELAAZ','001am00002A9ipmAAB','001am00002A8YJBAA3','001am00002AAANJAA5','001am00002A9jEPAAZ','001am00002A9jEkAAJ','001am00002AAALlAAP','001am00002A9j9EAAR','001am00002AAAaEAAX','001am00002A9j8sAAB','001am00002A9j4pAAB','001am00002A9j61AAB','001am00002A8YJjAAN','001am00002AAATeAAP','001am00002A9il7AAB','001am00002AAAP1AAP','001am00002AAAQ1AAP','001am00002AAANcAAP','001am00002AAAVYAA5','001am00002A9ikuAAB','001am00002AAARrAAP','001am00002AAAZMAA5','001am00002A9c2lAAB','001am00002A9ipcAAB','001am00002A9jCbAAJ','001am00002AAALFAA5','001am00002A9FQ1AAN','001am00002AAAKWAA5','001am00002AYR4gAAH','001am00002AAAR4AAP','001am00002AAARpAAP','001am00002A9imXAAR','001am00002AAARuAAP','001am00002AAAMtAAP','001am00002A9j6UAAR','001am00002A9jB5AAJ','001am00002A9jCJAAZ','001am00002AAAIXAA5','001am00002A9j7dAAB','001am00002AAAXjAAP','001am00002AAALfAAP','001am00002A9j39AAB','001am00002A9inzAAB','001am00002A9j5VAAR','001am00002AAAXvAAP','001am00002AAAViAAP','001am00002A8YJgAAN','001am00002AAAaVAAX','001am00002A9FPSAA3','001am00002A9ipeAAB','001am00002AAAQtAAP','001am00002A9jBrAAJ','001am00002A9j7RAAR','001am00002AAAKSAA5','001am00002AAAL6AAP','001am00002A9jE6AAJ','001am00002AAAaKAAX','001am00002A9c35AAB','001am00002A8XkUAAV','001am00002A8XjqAAF','001am00002AAAQNAA5','001am00002A9iluAAB','001am00002A8XkLAAV','001am00002AAAUKAA5','001am00002A8YJFAA3','001am00002A9jEgAAJ','001am00002A9inrAAB','001am00002A9FPIAA3','001am00002A9FPbAAN','001am00002A9invAAB','001am00002AAALhAAP','001am00002A9inHAAR','001am00002AYR8EAAX','001am00002A9iorAAB','001am00002A9j73AAB','001am00002AYR7SAAX')
    GROUP BY account_id__c
    ORDER BY tot DESC
    LIMIT 15
  ) t
  JOIN BT_Offer_Eligibility__dlm b ON b.account_id__c = t.acct
  WHERE b.action_code__c IN ('CHK-ACQ', 'HYS-ACQ', 'CRC-ACQ', 'AUTO-ACQ', 'MTG-30', 'HEL-ACQ', 'PL-ACQ', 'INV-ACQ')
  ORDER BY t.tot DESC) x JOIN ssot__Account__dlm a ON a.ssot__Id__c=x.acct LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c=x.acct AND c.profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm);

-- plaid | captured 2026-11-13 | owner 005am000003PbFAAA0
SELECT account_id__c AS acct, account_type__c AS type, institution_name__c AS institution, balance_usd__c AS balance FROM BT_Plaid_Held_Away__dlm WHERE profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm) AND is_active__c=true AND balance_usd__c>0 AND account_id__c IN ('001am00002A9c3jAAB','001am00002A9j7dAAB','001am00002AAAVmAAP','001am00002A9j2YAAR','001am00002A9jArAAJ','001am00002AAAUkAAP','001am00002A9iq8AAB','001am00002A9ikfAAB','001am00002A9c39AAB','001am00002A9j8zAAB','001am00002AAAKlAAP','001am00002AAAV6AAP','001am00002A9c2pAAB','001am00002A9ioaAAB','001am00002A9FPXAA3','001am00002AAAKcAAP','001am00002AAAUDAA5','001am00002A9j5zAAB','001am00002A9jCvAAJ','001am00002AAANDAA5','001am00002AYQxtAAH','001am00002A9j8MAAR','001am00002A9jAbAAJ','001am00002A9incAAB','001am00002AAAMlAAP','001am00002AYR3dAAH','001am00002A9j8nAAB','001am00002AAANdAAP','001am00002AYR8LAAX','001am00002AAAUFAA5','001am00002A9ioYAAR','001am00002A9iqYAAR','001am00002A9jCzAAJ','001am00002AAAIrAAP','001am00002AYR4EAAX','001am00002A8XkUAAV','001am00002A9j2mAAB','001am00002A9j6fAAB','001am00002A9j8ZAAR','001am00002AAAR7AAP','001am00002A9j7xAAB','001am00002AAAXjAAP','001am00002A9c2gAAB','001am00002AYQp3AAH','001am00002A9inZAAR','001am00002AYQr6AAH','001am00002AYQwXAAX','001am00002AYR57AAH','001am00002A8YJnAAN','001am00002A9jBAAAZ','001am00002A9jBlAAJ','001am00002AAAXiAAP','001am00002AYR0cAAH','001am00002A9ilHAAR','001am00002A9jE1AAJ','001am00002A9jExAAJ','001am00002AAAVEAA5','001am00002AYQukAAH','001am00002AYQy5AAH','001am00002A9ipjAAB','001am00002AAAKhAAP','001am00002AAAJZAA5');

-- history | captured 2026-11-13 | owner 005am000003PbFAAA0
SELECT account_id__c AS acct, action_code__c AS code, CAST(start_date__c AS VARCHAR) AS mo, conversion_probability__c AS conv, conversion_probability__c-FIRST_VALUE(conversion_probability__c) OVER(PARTITION BY account_id__c,action_code__c ORDER BY start_date__c) AS moved, expected_value_uplift__c-FIRST_VALUE(expected_value_uplift__c) OVER(PARTITION BY account_id__c,action_code__c ORDER BY start_date__c) AS ev_moved FROM BT_Offer_Eligibility_History__dlm WHERE start_date__c >= (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)-INTERVAL '6' MONTH AND action_code__c IN ('CHK-ACQ','HYS-ACQ','CRC-ACQ','AUTO-ACQ','MTG-30','HEL-ACQ','PL-ACQ','INV-ACQ') AND (account_id__c IN ('001am00002A9c3jAAB','001am00002A9j7dAAB','001am00002AAAVmAAP','001am00002A9j2YAAR','001am00002A9jArAAJ','001am00002AAAUkAAP','001am00002A9iq8AAB','001am00002A9ikfAAB','001am00002A9c39AAB','001am00002A9j8zAAB','001am00002AAAKlAAP','001am00002AAAV6AAP') OR (account_id__c='001am00002A9c2pAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9ioaAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9FPXAA3' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAKcAAP' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAUDAA5' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9j5zAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9jCvAAJ' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAANDAA5' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYQxtAAH' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9j8MAAR' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9jAbAAJ' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9incAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAMlAAP' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYR3dAAH' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9j8nAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAANdAAP' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYR8LAAX' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAUFAA5' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9ioYAAR' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9iqYAAR' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9jCzAAJ' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAIrAAP' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYR4EAAX' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A8XkUAAV' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9j2mAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9j6fAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9j8ZAAR' AND action_code__c='INV-ACQ') OR (account_id__c='001am00002AAAR7AAP' AND action_code__c='INV-ACQ') OR (account_id__c='001am00002A9j7xAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAXjAAP' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9c2gAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYQp3AAH' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9inZAAR' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYQr6AAH' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYQwXAAX' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYR57AAH' AND action_code__c='INV-ACQ') OR (account_id__c='001am00002A8YJnAAN' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9jBAAAZ' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9jBlAAJ' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAXiAAP' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYR0cAAH' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9ilHAAR' AND action_code__c='INV-ACQ') OR (account_id__c='001am00002A9jE1AAJ' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9jExAAJ' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAVEAA5' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYQukAAH' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AYQy5AAH' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002A9ipjAAB' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAKhAAP' AND action_code__c='HEL-ACQ') OR (account_id__c='001am00002AAAJZAA5' AND action_code__c='INV-ACQ')) ORDER BY acct,code,mo;
