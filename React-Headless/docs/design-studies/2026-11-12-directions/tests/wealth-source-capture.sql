-- wealthWhoToCall_rowsSql; captured 2026-11-13; returned 9; available
WITH ha AS (
    SELECT account_id__c AS acct, institution_name__c AS inst, balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,
           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true AND balance_usd__c > 0 AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ),
  h AS (
    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts, MAX(CASE WHEN rn = 1 THEN inst END) AS inst
    FROM ha GROUP BY acct
  ),
  p AS (
    SELECT account_id__c AS acct, MIN(monte_carlo_success_pct__c) AS success, MAX(total_goal_amount_usd__c) AS goal
    FROM BT_MoneyGuidePro_Financial_Plans__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)
      AND plan_status__c IN ('Active', 'Stale') AND monte_carlo_success_pct__c < 70
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY account_id__c
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY account_id__c
  ),
  pos AS (
    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c
  ),
  tot AS (SELECT acct, SUM(mv) AS tot FROM pos GROUP BY acct),
  big AS (
    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn
    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')
  ),
  k AS (
    SELECT big.acct AS acct, big.t AS ticker, big.mv / tot.tot AS w
    FROM big JOIN tot ON tot.acct = big.acct
    WHERE big.rn = 1 AND tot.tot > 0 AND big.mv / tot.tot >= 0.2
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM h UNION ALL SELECT acct FROM p UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM k
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, h.bal AS held, h.flow AS flow, h.accts AS held_accts, h.inst AS inst,
           p.success AS success, p.goal AS goal, g.sentiment AS sentiment, g.risk AS deal_risk,
           k.ticker AS ticker, k.w AS conc,
           0.2 * COALESCE(CASE WHEN h.bal >= 2000000 THEN 1 ELSE h.bal / 2000000.0 END, 0)
         + 0.15 * COALESCE(CASE WHEN h.flow >= 5000 THEN 1 WHEN h.flow > 0 THEN h.flow / 5000.0 ELSE 0 END, 0)
         + 0.25 * COALESCE(CASE WHEN p.success <= 40 THEN 1 ELSE (70 - p.success) / 30.0 END, 0)
         + 0.25 * COALESCE(g.risk / 100.0, 0)
         + 0.15 * COALESCE(CASE WHEN k.w >= 0.35 THEN 1 ELSE k.w / 0.35 END, 0) AS score
    FROM ids
    LEFT JOIN h ON h.acct = ids.acct
    LEFT JOIN p ON p.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN k ON k.acct = ids.acct
  ),
  r AS (
    SELECT b.*, ROW_NUMBER() OVER (ORDER BY score DESC) AS rk,
           ROW_NUMBER() OVER (PARTITION BY CASE WHEN conc IS NULL THEN 0 ELSE 1 END ORDER BY conc DESC) AS crk
    FROM b
  )
  SELECT * FROM r WHERE rk <= 8 OR (conc IS NOT NULL AND crk = 1) ORDER BY rk LIMIT 9;

-- wealthWhoToCall_summarySql; captured 2026-11-13; returned 1; available
WITH ha AS (
    SELECT account_id__c AS acct, institution_name__c AS inst, balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,
           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true AND balance_usd__c > 0 AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ),
  h AS (
    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts, MAX(CASE WHEN rn = 1 THEN inst END) AS inst
    FROM ha GROUP BY acct
  ),
  p AS (
    SELECT account_id__c AS acct, MIN(monte_carlo_success_pct__c) AS success, MAX(total_goal_amount_usd__c) AS goal
    FROM BT_MoneyGuidePro_Financial_Plans__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)
      AND plan_status__c IN ('Active', 'Stale') AND monte_carlo_success_pct__c < 70
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY account_id__c
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY account_id__c
  ),
  pos AS (
    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c
  ),
  tot AS (SELECT acct, SUM(mv) AS tot FROM pos GROUP BY acct),
  big AS (
    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn
    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')
  ),
  k AS (
    SELECT big.acct AS acct, big.t AS ticker, big.mv / tot.tot AS w
    FROM big JOIN tot ON tot.acct = big.acct
    WHERE big.rn = 1 AND tot.tot > 0 AND big.mv / tot.tot >= 0.2
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM h UNION ALL SELECT acct FROM p UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM k
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, h.bal AS held, h.flow AS flow, h.accts AS held_accts, h.inst AS inst,
           p.success AS success, p.goal AS goal, g.sentiment AS sentiment, g.risk AS deal_risk,
           k.ticker AS ticker, k.w AS conc,
           0.2 * COALESCE(CASE WHEN h.bal >= 2000000 THEN 1 ELSE h.bal / 2000000.0 END, 0)
         + 0.15 * COALESCE(CASE WHEN h.flow >= 5000 THEN 1 WHEN h.flow > 0 THEN h.flow / 5000.0 ELSE 0 END, 0)
         + 0.25 * COALESCE(CASE WHEN p.success <= 40 THEN 1 ELSE (70 - p.success) / 30.0 END, 0)
         + 0.25 * COALESCE(g.risk / 100.0, 0)
         + 0.15 * COALESCE(CASE WHEN k.w >= 0.35 THEN 1 ELSE k.w / 0.35 END, 0) AS score
    FROM ids
    LEFT JOIN h ON h.acct = ids.acct
    LEFT JOIN p ON p.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN k ON k.acct = ids.acct
  )
  SELECT COUNT(*) AS clients,
         SUM(CASE WHEN (CASE WHEN flow > 0 THEN 1 ELSE 0 END) + (CASE WHEN success IS NOT NULL THEN 1 ELSE 0 END)
                     + (CASE WHEN deal_risk IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN conc IS NOT NULL THEN 1 ELSE 0 END) >= 2
                  THEN 1 ELSE 0 END) AS multi
  FROM b;

-- planSignals_atRiskRowsSql; captured 2026-11-13; returned 14; available
WITH ha AS (
    SELECT account_id__c AS acct, institution_name__c AS inst, balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,
           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true AND balance_usd__c > 0 AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ),
  h AS (
    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts, MAX(CASE WHEN rn = 1 THEN inst END) AS inst
    FROM ha GROUP BY acct
  ),
  p AS (
    SELECT account_id__c AS acct, MIN(monte_carlo_success_pct__c) AS success, MAX(total_goal_amount_usd__c) AS goal
    FROM BT_MoneyGuidePro_Financial_Plans__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)
      AND plan_status__c IN ('Active', 'Stale') AND monte_carlo_success_pct__c < 70
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY account_id__c
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY account_id__c
  ),
  pos AS (
    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c
  ),
  tot AS (SELECT acct, SUM(mv) AS tot FROM pos GROUP BY acct),
  big AS (
    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn
    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')
  ),
  k AS (
    SELECT big.acct AS acct, big.t AS ticker, big.mv / tot.tot AS w
    FROM big JOIN tot ON tot.acct = big.acct
    WHERE big.rn = 1 AND tot.tot > 0 AND big.mv / tot.tot >= 0.2
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM h UNION ALL SELECT acct FROM p UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM k
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, h.bal AS held, h.flow AS flow, h.accts AS held_accts, h.inst AS inst,
           p.success AS success, p.goal AS goal, g.sentiment AS sentiment, g.risk AS deal_risk,
           k.ticker AS ticker, k.w AS conc,
           0.2 * COALESCE(CASE WHEN h.bal >= 2000000 THEN 1 ELSE h.bal / 2000000.0 END, 0)
         + 0.15 * COALESCE(CASE WHEN h.flow >= 5000 THEN 1 WHEN h.flow > 0 THEN h.flow / 5000.0 ELSE 0 END, 0)
         + 0.25 * COALESCE(CASE WHEN p.success <= 40 THEN 1 ELSE (70 - p.success) / 30.0 END, 0)
         + 0.25 * COALESCE(g.risk / 100.0, 0)
         + 0.15 * COALESCE(CASE WHEN k.w >= 0.35 THEN 1 ELSE k.w / 0.35 END, 0) AS score
    FROM ids
    LEFT JOIN h ON h.acct = ids.acct
    LEFT JOIN p ON p.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN k ON k.acct = ids.acct
  )
  SELECT account_id__c AS account_id, monte_carlo_success_pct__c AS success, total_goal_amount_usd__c AS goal_usd,
         goal_count__c AS goals, CAST(next_review_date__c AS VARCHAR) AS next_review,
         CAST(plan_last_updated_date__c AS VARCHAR) AS updated, CASE WHEN (plan_status__c = 'Stale' OR plan_last_updated_date__c < CURRENT_DATE - INTERVAL '12' MONTH) THEN 1 ELSE 0 END AS stale
  FROM BT_MoneyGuidePro_Financial_Plans__dlm LEFT JOIN b ON b.account_id = account_id__c
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)
    AND plan_status__c IN ('Active', 'Stale') AND monte_carlo_success_pct__c < 70
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ORDER BY COALESCE(b.score, 0) DESC, CASE WHEN monte_carlo_success_pct__c < 50 THEN 1 ELSE 0 END DESC, total_goal_amount_usd__c DESC
  LIMIT 14;

-- planSignals_reviewRowsSql; captured 2026-11-13; returned 6; available
SELECT account_id__c AS account_id, monte_carlo_success_pct__c AS success, total_goal_amount_usd__c AS goal_usd,
         goal_count__c AS goals, CAST(next_review_date__c AS VARCHAR) AS next_review,
         CAST(plan_last_updated_date__c AS VARCHAR) AS updated, CASE WHEN (plan_status__c = 'Stale' OR plan_last_updated_date__c < CURRENT_DATE - INTERVAL '12' MONTH) THEN 1 ELSE 0 END AS stale
  FROM BT_MoneyGuidePro_Financial_Plans__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)
    AND plan_status__c IN ('Active', 'Stale') AND next_review_date__c BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30' DAY
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ORDER BY next_review_date__c ASC, total_goal_amount_usd__c DESC
  LIMIT 6;

-- planSignals_summarySql; captured 2026-11-13; returned 1; available
SELECT COUNT(*) AS plans,
         SUM(CASE WHEN monte_carlo_success_pct__c < 70 THEN 1 ELSE 0 END) AS at_risk,
         SUM(CASE WHEN monte_carlo_success_pct__c < 50 THEN 1 ELSE 0 END) AS critical,
         SUM(CASE WHEN monte_carlo_success_pct__c < 70 THEN total_goal_amount_usd__c ELSE 0 END) AS at_risk_goal_usd,
         SUM(CASE WHEN next_review_date__c BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30' DAY THEN 1 ELSE 0 END) AS due30,
         SUM(CASE WHEN (plan_status__c = 'Stale' OR plan_last_updated_date__c < CURRENT_DATE - INTERVAL '12' MONTH) THEN 1 ELSE 0 END) AS stale
  FROM BT_MoneyGuidePro_Financial_Plans__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)
    AND plan_status__c IN ('Active', 'Stale')
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0');

-- holdingsConcentration_rowsSql; captured 2026-11-13; returned 5; available
WITH pos AS (
    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c
  ),
  tot AS (SELECT acct, SUM(mv) AS tot, COUNT(*) AS npos FROM pos GROUP BY acct),
  big AS (
    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn
    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')
  ),
  nm AS (
    SELECT ssot__FinancialSecurityId__c AS t, MAX(ssot__Name__c) AS name
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__Name__c NOT LIKE 'a7m%'
    GROUP BY ssot__FinancialSecurityId__c
  )
  SELECT big.acct AS account_id, big.t AS ticker, nm.name AS name, big.mv AS mv, tot.tot AS tot,
         big.mv / tot.tot AS w, tot.npos AS npos
  FROM big JOIN tot ON tot.acct = big.acct LEFT JOIN nm ON nm.t = big.t
  WHERE big.rn = 1
  ORDER BY w DESC
  LIMIT 5;

-- holdingsConcentration_summarySql; captured 2026-11-13; returned 1; available
WITH pos AS (
    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c
  ),
  tot AS (SELECT acct, SUM(mv) AS tot, COUNT(*) AS npos FROM pos GROUP BY acct),
  big AS (
    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn
    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')
  ),
  nm AS (
    SELECT ssot__FinancialSecurityId__c AS t, MAX(ssot__Name__c) AS name
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__Name__c NOT LIKE 'a7m%'
    GROUP BY ssot__FinancialSecurityId__c
  )
  SELECT COUNT(*) AS clients, SUM(tot.tot) AS aum,
         SUM(CASE WHEN big.mv >= 0.2 * tot.tot THEN 1 ELSE 0 END) AS concentrated,
         (SELECT SUM(mv) FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')) AS single
  FROM tot LEFT JOIN big ON big.acct = tot.acct AND big.rn = 1;

-- holdingsConcentration_exposureSql; captured 2026-11-13; returned 4; available
WITH pos AS (
    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c
  ),
  tot AS (SELECT acct, SUM(mv) AS tot, COUNT(*) AS npos FROM pos GROUP BY acct),
  big AS (
    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn
    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')
  ),
  nm AS (
    SELECT ssot__FinancialSecurityId__c AS t, MAX(ssot__Name__c) AS name
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__Name__c NOT LIKE 'a7m%'
    GROUP BY ssot__FinancialSecurityId__c
  )
  SELECT pos.t AS ticker, MAX(nm.name) AS name, SUM(pos.mv) AS mv, COUNT(*) AS holders
  FROM pos LEFT JOIN nm ON nm.t = pos.t
  WHERE pos.t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')
  GROUP BY pos.t
  ORDER BY mv DESC
  LIMIT 4;

-- digitalLeakage_rowsSql; captured 2026-11-13; returned 2; available
SELECT account_id, kind, balance, net_flow, institution, accounts FROM (
    SELECT account_id__c AS account_id, institution_type__c AS kind, SUM(balance_usd__c) AS balance,
           SUM(monthly_net_flow_usd__c) AS net_flow, MAX(institution_name__c) AS institution, COUNT(*) AS accounts,
           ROW_NUMBER() OVER (PARTITION BY institution_type__c ORDER BY SUM(balance_usd__c) DESC) AS pn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
    AND is_active__c = true AND balance_usd__c > 0
    AND institution_type__c IN ('Crypto Exchange', 'Robo-Advisor')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY account_id__c, institution_type__c
  ) x
  WHERE pn <= 3
  ORDER BY pn, kind;

-- digitalLeakage_summarySql; captured 2026-11-13; returned 2; available
SELECT institution_type__c AS kind, COUNT(DISTINCT account_id__c) AS clients, SUM(balance_usd__c) AS balance,
         SUM(CASE WHEN monthly_net_flow_usd__c > 0 THEN monthly_net_flow_usd__c ELSE 0 END) AS inflow
  FROM BT_Plaid_Held_Away__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
    AND is_active__c = true AND balance_usd__c > 0
    AND institution_type__c IN ('Crypto Exchange', 'Robo-Advisor')
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  GROUP BY institution_type__c;

-- tradingPulse_weeklySql; captured 2026-11-13; returned 9; available
SELECT CAST(CAST(DATE_TRUNC('week', trade_date__c) AS DATE) AS VARCHAR) AS d,
         CAST(MAX(CAST(trade_date__c AS DATE)) AS VARCHAR) AS last_d,
         SUM(CASE WHEN trade_side__c = 'Buy' THEN total_trade__c ELSE 0 END) AS buys,
         SUM(CASE WHEN trade_side__c = 'Sell' THEN total_trade__c ELSE 0 END) AS sells,
         COUNT(*) AS n
  FROM BT_Financial_Trades__dlm
  WHERE trade_date__c >= DATE_TRUNC('week', (SELECT MAX(trade_date__c) FROM BT_Financial_Trades__dlm WHERE account_id__c LIKE '001am%')) - INTERVAL '56' DAY
    AND trade_status__c = 'Confirmed' AND currency__c = 'USD'
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  GROUP BY DATE_TRUNC('week', trade_date__c)
  ORDER BY 1;

-- tradingPulse_sellersSql; captured 2026-11-13; returned 4; available
SELECT account_id__c AS account_id,
         SUM(CASE WHEN trade_side__c = 'Sell' THEN total_trade__c ELSE -total_trade__c END) AS net_sold,
         COUNT(*) AS trades, MAX(instrument_name__c) AS instrument
  FROM BT_Financial_Trades__dlm
  WHERE trade_date__c >= DATE_TRUNC('week', (SELECT MAX(trade_date__c) FROM BT_Financial_Trades__dlm WHERE account_id__c LIKE '001am%'))
    AND trade_status__c = 'Confirmed' AND currency__c = 'USD'
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  GROUP BY account_id__c
  HAVING SUM(CASE WHEN trade_side__c = 'Sell' THEN total_trade__c ELSE -total_trade__c END) > 0
  ORDER BY 2 DESC
  LIMIT 4;

-- businessOwners_ownerRowsSql; captured 2026-11-13; returned 0; available
SELECT owner_id, biz_id, biz_name, conf, revenue_band, employee_band FROM (
    SELECT g.src_account_id__c AS owner_id, g.dst_account_id__c AS biz_id, d.ssot__Name__c AS biz_name,
           g.confidence_pct__c AS conf, z.revenue_band__c AS revenue_band, z.employee_band__c AS employee_band,
           CASE WHEN z.revenue_band__c IN ('$50M-$200M', '$200M-$1B', '$1B+') THEN 1 ELSE 0 END AS up,
           ROW_NUMBER() OVER (PARTITION BY g.src_account_id__c
                              ORDER BY CASE WHEN z.revenue_band__c IN ('$50M-$200M', '$200M-$1B', '$1B+') THEN 1 ELSE 0 END DESC, g.confidence_pct__c DESC) AS rn
    FROM BT_Synth_Relationship_Graph__dlm g
    JOIN ssot__Account__dlm d ON d.ssot__Id__c = g.dst_account_id__c
    LEFT JOIN BT_Zoominfo_Firmographics__dlm z ON z.account_id__c = g.dst_account_id__c AND z.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm)
    WHERE g.edge_type__c = 'BUSINESS_OWNER'
      AND g.src_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ) x
  WHERE rn = 1
  ORDER BY up DESC, conf DESC
  LIMIT 5;

-- businessOwners_ownerSummarySql; captured 2026-11-13; returned 1; available
SELECT COUNT(DISTINCT g.src_account_id__c) AS owners, COUNT(DISTINCT g.dst_account_id__c) AS businesses,
         COUNT(DISTINCT CASE WHEN z.revenue_band__c IN ('$50M-$200M', '$200M-$1B', '$1B+') THEN g.dst_account_id__c END) AS upmarket
  FROM BT_Synth_Relationship_Graph__dlm g
  LEFT JOIN BT_Zoominfo_Firmographics__dlm z ON z.account_id__c = g.dst_account_id__c AND z.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm)
  WHERE g.edge_type__c = 'BUSINESS_OWNER'
    AND g.src_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0');

-- businessOwners_handoffRowsSql; captured 2026-11-13; returned 4; available
SELECT owner_id, owner_name, biz_id, conf, wealth, net_worth, life_stage FROM (
    SELECT g.src_account_id__c AS owner_id, p.ssot__Name__c AS owner_name, g.dst_account_id__c AS biz_id,
           g.confidence_pct__c AS conf, c.wealth_propensity_score__c AS wealth,
           c.estimated_net_worth_band__c AS net_worth, c.life_stage__c AS life_stage, CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 3 WHEN c.estimated_net_worth_band__c = '$1M-$5M' THEN 2 WHEN c.estimated_net_worth_band__c = '$250K-$1M' THEN 1 ELSE 0 END AS nw,
           ROW_NUMBER() OVER (PARTITION BY g.src_account_id__c ORDER BY g.confidence_pct__c DESC) AS rn
    FROM BT_Synth_Relationship_Graph__dlm g
    JOIN ssot__Account__dlm p ON p.ssot__Id__c = g.src_account_id__c
    JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c = g.src_account_id__c AND c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
    WHERE g.edge_type__c = 'BUSINESS_OWNER'
      AND g.dst_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ) x
  WHERE rn = 1
  ORDER BY nw DESC, wealth DESC NULLS LAST, conf DESC
  LIMIT 4;

-- businessOwners_handoffSummarySql; captured 2026-11-13; returned 1; available
SELECT COUNT(DISTINCT g.src_account_id__c) AS owners,
         COUNT(DISTINCT CASE WHEN c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+') THEN g.src_account_id__c END) AS millionaires
  FROM BT_Synth_Relationship_Graph__dlm g
  LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c = g.src_account_id__c AND c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
  WHERE g.edge_type__c = 'BUSINESS_OWNER'
    AND g.dst_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0');

-- wealthUpgrades_rowsSql; captured 2026-11-13; returned 5; available
SELECT c.account_id__c AS account_id, c.estimated_net_worth_band__c AS net_worth,
         c.wealth_propensity_score__c AS wealth, c.investment_propensity_score__c AS invest,
         c.life_stage__c AS life_stage, c.prizm_segment_name__c AS prizm,
         a.FinServ_ClientCategory_c__c AS category, a.FinServ_AnnualIncome_pc__c AS income
  FROM BT_Claritas_Demographics__dlm c
  JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.account_id__c
  WHERE c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
    AND (c.wealth_propensity_score__c >= 80 OR c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+'))
    AND (a.FinServ_ClientCategory_c__c IS NULL OR a.FinServ_ClientCategory_c__c <> 'Wealth Management')
    AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ORDER BY CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 1 ELSE 0 END DESC,
           c.wealth_propensity_score__c DESC, c.investment_propensity_score__c DESC
  LIMIT 5;

-- wealthUpgrades_summarySql; captured 2026-11-13; returned 1; available
SELECT COUNT(*) AS candidates,
         SUM(CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 1 ELSE 0 END) AS five_m,
         SUM(CASE WHEN c.wealth_propensity_score__c >= 80 THEN 1 ELSE 0 END) AS high_propensity
  FROM BT_Claritas_Demographics__dlm c
  JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.account_id__c
  WHERE c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
    AND (c.wealth_propensity_score__c >= 80 OR c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+'))
    AND (a.FinServ_ClientCategory_c__c IS NULL OR a.FinServ_ClientCategory_c__c <> 'Wealth Management')
    AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0');

-- jobChangeSignals_liquidityRowsSql; captured 2026-11-13; returned 0; available
SELECT account_id__c, person_account_id__c, new_account_id__c, new_employer_name__c,
         contact_name__c, old_title__c, contact_persona__c, was_champion__c,
         relationship_risk_score__c, opportunity_score__c, detected_date__c
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND liquidity_event_flag__c = true
    AND person_account_id__c IS NOT NULL
    AND detected_date__c >= current_date - INTERVAL '180' DAY
    AND person_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ORDER BY opportunity_score__c DESC NULLS LAST, detected_date__c DESC
  LIMIT 8;

-- jobChangeSignals_liquiditySummarySql; captured 2026-11-13; returned 1; available
SELECT COUNT(DISTINCT person_account_id__c) AS total
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND liquidity_event_flag__c = true
    AND person_account_id__c IS NOT NULL
    AND detected_date__c >= current_date - INTERVAL '180' DAY
    AND person_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0');

-- transactionSignals_largeInflowSql; captured 2026-11-13; returned 1; available
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
      AND t.SFAccountID__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ) x
  WHERE rn = 1
  ORDER BY amount DESC
  LIMIT 8;

-- transactionSignals_callSentimentSql; captured 2026-11-13; returned 8; available
SELECT g.account_id__c AS account_id, g.overall_sentiment__c AS sentiment,
         g.deal_risk_score__c AS deal_risk, g.next_scheduled_call_date__c AS next_call,
         g.rm_last_logged_note_date__c AS last_note, g.key_topics_flags__c AS topics
  FROM BT_Gong_Call_Sentiment__dlm g
  WHERE g.profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
    AND g.overall_sentiment__c IN ('Negative', 'Very Negative')
    AND g.sentiment_trend__c = 'Declining'
    AND g.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ORDER BY g.deal_risk_score__c DESC
  LIMIT 8;

-- transactionSignals_callSentimentWeeklySql; captured 2026-11-13; returned 8; available
SELECT profile_week__c AS week, COUNT(DISTINCT account_id__c) AS n
  FROM BT_Gong_Call_Sentiment__dlm
  WHERE overall_sentiment__c IN ('Negative', 'Very Negative')
    AND sentiment_trend__c = 'Declining'
    AND profile_week__c >= (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm) - INTERVAL '49' DAY
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  GROUP BY profile_week__c
  ORDER BY profile_week__c;

-- transactionSignals_amlChangeSql; captured 2026-11-13; returned 8; available
SELECT c.account_id__c AS account_id, c.overall_risk_rating__c AS risk_rating,
         p.overall_risk_rating__c AS prev_rating, c.pep_hit__c AS pep, c.sanctions_hit__c AS sanctions,
         c.adverse_media_hit__c AS adverse_media, c.adverse_media_categories__c AS am_cats,
         c.case_reference__c AS case_ref, c.risk_jurisdiction_code__c AS jur, c.profile_date__c AS screened
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
    AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ORDER BY CASE WHEN c.overall_risk_rating__c = 'Severe' THEN 4 WHEN c.overall_risk_rating__c = 'High' THEN 3 ELSE 2 END DESC
  LIMIT 8;

-- relationshipGraph_warmIntroSql; captured 2026-11-13; returned 6; available
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
      AND g.src_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
      AND g.dst_account_id__c NOT IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ) x
  WHERE rn = 1
  ORDER BY conf DESC, discovered DESC
  LIMIT 6;

-- campaignTouches_campaignTouchSql; captured 2026-11-13; returned 0; available
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
                                   WHERE engagement_type__c = 'Clicked' AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')) - INTERVAL '30' DAY
        AND m.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
        AND m.account_id__c NOT IN (SELECT account_id__c FROM Marketing_Engagements__dlm
                                    WHERE engagement_type__c = 'Unsubscribed' AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0'))
      GROUP BY m.account_id__c, m.campaign_name__c, m.product_name__c
    ) x
    WHERE rn = 1 AND clicks > 0
  ) z
  ORDER BY pn, clicks DESC, last_at DESC
  LIMIT 8;

-- kpiTrend_netFlowSql; captured 2026-11-13; returned 10; available
SELECT CAST(CAST(DATE_TRUNC('week', transactiondate__c) AS DATE) AS VARCHAR) AS week,
         SUM(CASE WHEN transaction_type__c = 'Credit' THEN amount__c ELSE 0 END) AS credits,
         SUM(CASE WHEN transaction_type__c = 'Debit' THEN amount__c ELSE 0 END) AS debits,
         COUNT(*) AS txns, COUNT(DISTINCT accountid__c) AS accts
  FROM Financial_Transactions_BT_Snow__dll
  WHERE transactiondate__c >= CURRENT_DATE - INTERVAL '70' DAY
    AND transactiondate__c < DATE_TRUNC('week', CURRENT_DATE)
    AND account_type__c = 'Personal'
    AND sfaccountid__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  GROUP BY 1
  ORDER BY 1;

-- whitespace_offersSql; captured 2026-11-13; returned 28; available
SELECT t.acct AS acct, t.tot AS tot, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,
         b.conversion_probability__c AS conv, b.expected_value_uplift__c AS ev,
         b.recommended_channels__c AS channels, b.em_probability__c AS em_p, b.cc_probability__c AS cc_p
  FROM (
    SELECT account_id__c AS acct, SUM(expected_value_uplift__c) AS tot
    FROM BT_Offer_Eligibility__dlm
    WHERE action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')
      AND recommended_action_rank__c IS NOT NULL AND expected_value_uplift__c > 0
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
    GROUP BY account_id__c
    ORDER BY tot DESC
    LIMIT 12
  ) t
  JOIN BT_Offer_Eligibility__dlm b ON b.account_id__c = t.acct
  WHERE b.action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')
  ORDER BY t.tot DESC;

-- whitespace_rising; captured 2026-11-13; returned 1; available
SELECT h.acct AS acct, h.code AS code, h.conv AS conv, h.ev AS ev, h.action_rank AS action_rank,
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
      AND action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ) h
  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)
    AND h.action_rank IS NOT NULL AND h.ev > 0
    AND (h.moved >= 2 OR h.ev_moved >= 250)
  ORDER BY h.ev_moved DESC
  LIMIT 50;

-- whitespace_falling; captured 2026-11-13; returned 0; available
SELECT h.acct AS acct, h.code AS code, h.conv AS conv, h.ev AS ev, h.action_rank AS action_rank,
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
      AND action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ) h
  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)
    AND h.action_rank IS NOT NULL AND h.ev > 0
    AND (h.moved <= -2 OR h.ev_moved <= -250)
  ORDER BY h.ev_moved ASC
  LIMIT 50;

-- home_heldAwaySql; captured 2026-11-13; returned 5; available
SELECT account_id, balance, institution, acct_type, net_flow, holdings FROM (
    SELECT account_id__c AS account_id,
           SUM(balance_usd__c) OVER (PARTITION BY account_id__c) AS balance,
           SUM(monthly_net_flow_usd__c) OVER (PARTITION BY account_id__c) AS net_flow,
           COUNT(*) OVER (PARTITION BY account_id__c) AS holdings,
           institution_name__c AS institution, account_type__c AS acct_type,
           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true AND balance_usd__c > 0
      AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  ) t
  WHERE rn = 1
  ORDER BY balance DESC
  LIMIT 8;

-- home_heldAwayTotalSql; captured 2026-11-13; returned 1; available
SELECT COUNT(DISTINCT account_id__c) AS clients, SUM(balance_usd__c) AS balance
  FROM BT_Plaid_Held_Away__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
    AND is_active__c = true AND balance_usd__c > 0
    AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0');

-- anika_transactions; captured 2026-11-13; returned 12; available
SELECT ssot__TransactionDate__c dt, ssot__FinancialTransactionCategory__c cat, ssot__FinancialAccountTransactionType__c typ, ssot__TransactionAmount__c amt FROM ssot__FinancialAccountTransaction__dlm WHERE SFAccountID__c = '001am000026ZtgKAAS' ORDER BY ssot__TransactionDate__c DESC LIMIT 12;

-- anika_trades; captured 2026-11-13; returned 10; available
SELECT trade_date__c dt, trade_side__c side, instrument_name__c inst, instrument_identifier__c sym, quantity__c qty, price__c px, total_trade__c tot FROM BT_Financial_Trades__dlm WHERE account_id__c = '001am000026ZtgKAAS' ORDER BY trade_date__c DESC LIMIT 10;

-- anika_interactions; captured 2026-11-13; returned 8; available
SELECT CreatedDate__c dt, Name__c nm, InteractionPurpose__c purp, MeetingNotes__c notes, NextSteps__c nxt FROM InteractionSummary_Home__dlm WHERE AccountId__c = '001am000026ZtgKAAS' ORDER BY CreatedDate__c DESC LIMIT 8;

-- anika_notes; captured 2026-11-13; returned 0; available
SELECT Date_c__c dt, Title_c__c ttl, Notes_c__c notes FROM Meeting_Note_c_Home__dlm WHERE Account_c__c = '001am000026ZtgKAAS' ORDER BY Date_c__c DESC LIMIT 6;

-- anika_campaigns; captured 2026-11-13; returned 0; available
SELECT Campaign_Name__c nm, Category__c cat, Product_Name__c prod, Email_Action__c act, Send_Date__c dt FROM Marketing_Campaigns__dlm WHERE AccountID__c = '001am000026ZtgKAAS' ORDER BY Send_Date__c DESC LIMIT 8;

-- anika_screening; captured 2026-11-13; returned 1; available
SELECT overall_risk_rating__c rating, sanctions_hit__c sanc, pep_hit__c pep, adverse_media_hit__c media, last_screened_at__c dt FROM BT_WorldCheck_AML__dlm WHERE account_id__c = '001am000026ZtgKAAS' ORDER BY profile_date__c DESC LIMIT 1;

-- anika_property; captured 2026-11-13; returned 1; available
SELECT estimated_property_value__c val, equity_usd__c eq, outstanding_mortgage_balance__c mtg, heloc_opportunity_score__c heloc, primary_property_type__c ptype, flood_zone_code__c flood, wildfire_risk_score__c fire, is_owner__c owner, profile_quarter__c q FROM BT_Corelogic_Property__dlm WHERE account_id__c = '001am000026ZtgKAAS' ORDER BY profile_quarter__c DESC LIMIT 1;

-- anika_plan; captured 2026-11-13; returned 1; available
SELECT plan_status__c st, retirement_target_age__c age, monthly_income_target_usd__c inc, total_goal_amount_usd__c goal, goal_count__c gc, recommended_asset_allocation__c alloc, next_review_date__c review, profile_month__c m FROM BT_MoneyGuidePro_Financial_Plans__dlm WHERE account_id__c = '001am000026ZtgKAAS' ORDER BY profile_month__c DESC LIMIT 1;

-- julie_plan; captured 2026-11-13; returned 1; available
SELECT plan_status__c st, retirement_target_age__c age, monthly_income_target_usd__c inc, total_goal_amount_usd__c goal, goal_count__c gc, recommended_asset_allocation__c alloc, next_review_date__c review, profile_month__c m FROM BT_MoneyGuidePro_Financial_Plans__dlm WHERE account_id__c = '001am00000qvjsAAAQ' ORDER BY profile_month__c DESC LIMIT 1;

-- sourcePeriods; captured 2026-11-13; returned 3; available
SELECT 'heldAway' AS source, CAST(MAX(profile_month__c) AS VARCHAR) AS period FROM BT_Plaid_Held_Away__dlm UNION ALL SELECT 'plans', CAST(MAX(profile_month__c) AS VARCHAR) FROM BT_MoneyGuidePro_Financial_Plans__dlm UNION ALL SELECT 'offers', CAST(MAX(start_date__c) AS VARCHAR) FROM BT_Offer_Eligibility_History__dlm;

-- whitespace_holder0; captured 2026-11-13; returned 15; available
SELECT t.acct AS acct, t.tot AS tot, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,
         b.conversion_probability__c AS conv, b.expected_value_uplift__c AS ev,
         b.recommended_channels__c AS channels, b.em_probability__c AS em_p, b.cc_probability__c AS cc_p
  FROM (
    SELECT account_id__c AS acct, SUM(expected_value_uplift__c) AS tot
    FROM BT_Offer_Eligibility__dlm
    WHERE action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')
      AND recommended_action_rank__c IS NOT NULL AND expected_value_uplift__c > 0
      AND account_id__c IN ('001am000026ZgO7AAK','001am000026ZtmjAAC','001am000026ZldvAAC','001am000026ZtgJAAS','001am000026ZtgLAAS','001am000026ZtgNAAS','001am000026ZtwPAAS','001am000026ZtgKAAS','001am000026ZtgMAAS')
    GROUP BY account_id__c
    ORDER BY tot DESC
    LIMIT 15
  ) t
  JOIN BT_Offer_Eligibility__dlm b ON b.account_id__c = t.acct
  WHERE b.action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')
  ORDER BY t.tot DESC;

-- whitespace_holder1; captured 2026-11-13; returned 10; available
SELECT t.acct AS acct, t.tot AS tot, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,
         b.conversion_probability__c AS conv, b.expected_value_uplift__c AS ev,
         b.recommended_channels__c AS channels, b.em_probability__c AS em_p, b.cc_probability__c AS cc_p
  FROM (
    SELECT account_id__c AS acct, SUM(expected_value_uplift__c) AS tot
    FROM BT_Offer_Eligibility__dlm
    WHERE action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')
      AND recommended_action_rank__c IS NOT NULL AND expected_value_uplift__c > 0
      AND account_id__c IN ('001am00000qvjsAAAQ','001am000026ZgO7AAK','001am000026ZtgLAAS','001am000026ZtgNAAS')
    GROUP BY account_id__c
    ORDER BY tot DESC
    LIMIT 15
  ) t
  JOIN BT_Offer_Eligibility__dlm b ON b.account_id__c = t.acct
  WHERE b.action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')
  ORDER BY t.tot DESC;

-- whitespace_history; captured 2026-11-13; returned 224; available
SELECT account_id__c AS acct, action_code__c AS code, CAST(start_date__c AS VARCHAR) AS mo,
         conversion_probability__c AS conv,
         conversion_probability__c - FIRST_VALUE(conversion_probability__c)
           OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS moved,
         expected_value_uplift__c - FIRST_VALUE(expected_value_uplift__c)
           OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS ev_moved
  FROM BT_Offer_Eligibility_History__dlm
  WHERE start_date__c >= (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm) - INTERVAL '6' MONTH
    AND account_id__c IN ('001am000026ZtgIAAS', '001am00000qvjsAAAQ', '001am000026ZtgNAAS', '001am000026ZtgJAAS', '001am000026ZtgKAAS', '001am000026ZtgMAAS', '001am000026ZgO7AAK', '001am000026ZtmjAAC', '001am000026ZldvAAC', '001am000026ZtgLAAS', '001am000026ZtwPAAS')
    AND action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')
  ORDER BY acct, code, mo;

-- julie_transactions; captured 2026-11-13; returned 12; available
SELECT ssot__TransactionDate__c dt, ssot__FinancialTransactionCategory__c cat, ssot__FinancialAccountTransactionType__c typ, ssot__TransactionAmount__c amt FROM ssot__FinancialAccountTransaction__dlm WHERE SFAccountID__c = '001am00000qvjsAAAQ' ORDER BY ssot__TransactionDate__c DESC LIMIT 12;

-- julie_trades; captured 2026-11-13; returned 10; available
SELECT trade_date__c dt, trade_side__c side, instrument_name__c inst, instrument_identifier__c sym, quantity__c qty, price__c px, total_trade__c tot FROM BT_Financial_Trades__dlm WHERE account_id__c = '001am00000qvjsAAAQ' ORDER BY trade_date__c DESC LIMIT 10;

-- julie_interactions; captured 2026-11-13; returned 8; available
SELECT CreatedDate__c dt, Name__c nm, InteractionPurpose__c purp, MeetingNotes__c notes, NextSteps__c nxt FROM InteractionSummary_Home__dlm WHERE AccountId__c = '001am00000qvjsAAAQ' ORDER BY CreatedDate__c DESC LIMIT 8;

-- julie_notes; captured 2026-11-13; returned 6; available
SELECT Date_c__c dt, Title_c__c ttl, Notes_c__c notes FROM Meeting_Note_c_Home__dlm WHERE Account_c__c = '001am00000qvjsAAAQ' ORDER BY Date_c__c DESC LIMIT 6;

-- julie_campaigns; captured 2026-11-13; returned 8; available
SELECT Campaign_Name__c nm, Category__c cat, Product_Name__c prod, Email_Action__c act, Send_Date__c dt FROM Marketing_Campaigns__dlm WHERE AccountID__c = '001am00000qvjsAAAQ' ORDER BY Send_Date__c DESC LIMIT 8;

-- julie_screening; captured 2026-11-13; returned 1; available
SELECT overall_risk_rating__c rating, sanctions_hit__c sanc, pep_hit__c pep, adverse_media_hit__c media, last_screened_at__c dt FROM BT_WorldCheck_AML__dlm WHERE account_id__c = '001am00000qvjsAAAQ' ORDER BY profile_date__c DESC LIMIT 1;

-- julie_property; captured 2026-11-13; returned 1; available
SELECT estimated_property_value__c val, equity_usd__c eq, outstanding_mortgage_balance__c mtg, heloc_opportunity_score__c heloc, primary_property_type__c ptype, flood_zone_code__c flood, wildfire_risk_score__c fire, is_owner__c owner, profile_quarter__c q FROM BT_Corelogic_Property__dlm WHERE account_id__c = '001am00000qvjsAAAQ' ORDER BY profile_quarter__c DESC LIMIT 1;

-- deep_plans; captured 2026-11-13; returned 2; available
SELECT account_id__c AS account_id, plan_status__c AS status, monte_carlo_success_pct__c AS success, total_goal_amount_usd__c AS goal_usd, goal_count__c AS goals, next_review_date__c AS next_review, plan_last_updated_date__c AS updated, retirement_target_age__c AS retirement_age, monthly_income_target_usd__c AS monthly_income, recommended_asset_allocation__c AS allocation, CAST(profile_month__c AS VARCHAR) AS period FROM BT_MoneyGuidePro_Financial_Plans__dlm WHERE account_id__c IN ('001am00000qvjsAAAQ','001am000026ZtgKAAS') AND profile_month__c=(SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm);

-- customer_allAssets_001am00000qvjsAAAQ; captured 2026-11-13; returned 1; available
SELECT '001am00000qvjsAAAQ' AS account_id, SUM(balance_usd__c) AS total, COUNT(institution_name__c) AS institutions, COUNT(DISTINCT institution_name__c) AS distinct_institutions, MAX(profile_month__c) AS period FROM BT_Plaid_Held_Away__dlm WHERE account_id__c = '001am00000qvjsAAAQ' AND is_active__c = true AND Balance_Category__c = 'asset' AND profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm WHERE account_id__c = '001am00000qvjsAAAQ');

-- customer_allAssets_001am000026ZtgKAAS; captured 2026-11-13; returned 1; available
SELECT '001am000026ZtgKAAS' AS account_id, SUM(balance_usd__c) AS total, COUNT(institution_name__c) AS institutions, COUNT(DISTINCT institution_name__c) AS distinct_institutions, MAX(profile_month__c) AS period FROM BT_Plaid_Held_Away__dlm WHERE account_id__c = '001am000026ZtgKAAS' AND is_active__c = true AND Balance_Category__c = 'asset' AND profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm WHERE account_id__c = '001am000026ZtgKAAS');

-- native_plan_history; captured 2026-11-13; returned 8; available
SELECT CAST(profile_month__c AS VARCHAR) AS period, COUNT(*) AS plans,
         SUM(CASE WHEN monte_carlo_success_pct__c < 70 THEN 1 ELSE 0 END) AS at_risk,
         SUM(CASE WHEN monte_carlo_success_pct__c < 50 THEN 1 ELSE 0 END) AS critical,
         SUM(CASE WHEN monte_carlo_success_pct__c < 70 THEN total_goal_amount_usd__c ELSE 0 END) AS at_risk_goal_usd,
         SUM(CASE WHEN next_review_date__c BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30' DAY THEN 1 ELSE 0 END) AS due30,
         SUM(CASE WHEN (plan_status__c = 'Stale' OR plan_last_updated_date__c < CURRENT_DATE - INTERVAL '12' MONTH) THEN 1 ELSE 0 END) AS stale
  FROM BT_MoneyGuidePro_Financial_Plans__dlm
  WHERE 1 = 1
    AND plan_status__c IN ('Active', 'Stale')
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  GROUP BY profile_month__c
  ORDER BY profile_month__c DESC
  LIMIT 8;

-- native_upgrade_history; captured 2026-11-13; returned 7; available
SELECT CAST(c.profile_month__c AS VARCHAR) AS period, COUNT(*) AS candidates,
         SUM(CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 1 ELSE 0 END) AS five_m,
         SUM(CASE WHEN c.wealth_propensity_score__c >= 80 THEN 1 ELSE 0 END) AS high_propensity
  FROM BT_Claritas_Demographics__dlm c
  JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.account_id__c
  WHERE 1 = 1
    AND (c.wealth_propensity_score__c >= 80 OR c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+'))
    AND (a.FinServ_ClientCategory_c__c IS NULL OR a.FinServ_ClientCategory_c__c <> 'Wealth Management')
    AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')
  GROUP BY c.profile_month__c
  ORDER BY c.profile_month__c DESC
  LIMIT 8;

-- plan_details; captured 2026-11-13; returned 20; available
SELECT account_id__c AS account_id, plan_status__c AS status, monte_carlo_success_pct__c AS success, total_goal_amount_usd__c AS goal_usd, goal_count__c AS goals, next_review_date__c AS next_review, plan_last_updated_date__c AS updated, retirement_target_age__c AS retirement_age, monthly_income_target_usd__c AS monthly_income, recommended_asset_allocation__c AS allocation, CAST(profile_month__c AS VARCHAR) AS period FROM BT_MoneyGuidePro_Financial_Plans__dlm WHERE account_id__c IN ('001am00002AA8OFAA1','001am00002A9fC4AAJ','001am00002A9g0RAAR','001am00002AYALEAA5','001am00002AA81dAAD','001am00002AYAMIAA5','001am00002AYOZGAA5','001am00002AYOMnAAP','001am00002A9fKSAAZ','001am00002AA86sAAD','001am00002A9ft0AAB','001am00002A9fLxAAJ','001am00002AA8bKAAT','001am00002AYOztAAH','001am00002AYALLAA5','001am00002AA8DMAA1','001am00002AYONXAA5','001am00002AA8DnAAL','001am00002A9fnRAAR','001am00002AYOGzAAP') AND profile_month__c=(SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm);

-- aml_change_types; captured 2026-11-13; returned 8; available
SELECT account_id__c AS account_id, change_since_last_run__c AS change_type FROM BT_WorldCheck_AML__dlm WHERE profile_date__c=(SELECT MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm) AND account_id__c IN ('001am00002AA8IlAAL','001am00002AYONHAA5','001am00002AA8CJAA1','001am00002AYOF0AAP','001am00002A9fhGAAR','001am00002AYAL8AAP','001am00002AA8MqAAL','001am00002A9fBdAAJ');
