/* Read-only strict Wealth-owner capture. Independent aggregates are not sample totals. */
globalThis.wealthCaptureData={
  "capturedAt": "2026-11-13",
  "asOfDate": "2026-11-13",
  "ownerId": "005am000003PbCLAA0",
  "orgId": "00Dam00000Uo32qEAB",
  "ownerName": "Jose Sifontes",
  "sources": {
    "wealthWhoToCall_rowsSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "wealthWhoToCall_rowsSql",
      "query": "\n  WITH ha AS (\n    SELECT account_id__c AS acct, institution_name__c AS inst, balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,\n           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn\n    FROM BT_Plaid_Held_Away__dlm\n    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)\n      AND is_active__c = true AND balance_usd__c > 0 AND institution_type__c IN ('Brokerage', 'Robo-Advisor')\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ),\n  h AS (\n    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts, MAX(CASE WHEN rn = 1 THEN inst END) AS inst\n    FROM ha GROUP BY acct\n  ),\n  p AS (\n    SELECT account_id__c AS acct, MIN(monte_carlo_success_pct__c) AS success, MAX(total_goal_amount_usd__c) AS goal\n    FROM BT_MoneyGuidePro_Financial_Plans__dlm\n    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)\n      AND plan_status__c IN ('Active', 'Stale') AND monte_carlo_success_pct__c < 70\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY account_id__c\n  ),\n  g AS (\n    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk\n    FROM BT_Gong_Call_Sentiment__dlm\n    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)\n      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY account_id__c\n  ),\n  pos AS (\n    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv\n    FROM ssot__FinancialHolding__dlm\n    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c\n  ),\n  tot AS (SELECT acct, SUM(mv) AS tot FROM pos GROUP BY acct),\n  big AS (\n    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn\n    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')\n  ),\n  k AS (\n    SELECT big.acct AS acct, big.t AS ticker, big.mv / tot.tot AS w\n    FROM big JOIN tot ON tot.acct = big.acct\n    WHERE big.rn = 1 AND tot.tot > 0 AND big.mv / tot.tot >= 0.2\n  ),\n  ids AS (\n    SELECT DISTINCT acct FROM (\n      SELECT acct FROM h UNION ALL SELECT acct FROM p UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM k\n    ) u\n  ),\n  b AS (\n    SELECT ids.acct AS account_id, h.bal AS held, h.flow AS flow, h.accts AS held_accts, h.inst AS inst,\n           p.success AS success, p.goal AS goal, g.sentiment AS sentiment, g.risk AS deal_risk,\n           k.ticker AS ticker, k.w AS conc,\n           0.2 * COALESCE(CASE WHEN h.bal >= 2000000 THEN 1 ELSE h.bal / 2000000.0 END, 0)\n         + 0.15 * COALESCE(CASE WHEN h.flow >= 5000 THEN 1 WHEN h.flow > 0 THEN h.flow / 5000.0 ELSE 0 END, 0)\n         + 0.25 * COALESCE(CASE WHEN p.success <= 40 THEN 1 ELSE (70 - p.success) / 30.0 END, 0)\n         + 0.25 * COALESCE(g.risk / 100.0, 0)\n         + 0.15 * COALESCE(CASE WHEN k.w >= 0.35 THEN 1 ELSE k.w / 0.35 END, 0) AS score\n    FROM ids\n    LEFT JOIN h ON h.acct = ids.acct\n    LEFT JOIN p ON p.acct = ids.acct\n    LEFT JOIN g ON g.acct = ids.acct\n    LEFT JOIN k ON k.acct = ids.acct\n  ),\n  r AS (\n    SELECT b.*, ROW_NUMBER() OVER (ORDER BY score DESC) AS rk,\n           ROW_NUMBER() OVER (PARTITION BY CASE WHEN conc IS NULL THEN 0 ELSE 1 END ORDER BY conc DESC) AS crk\n    FROM b\n  )\n  SELECT * FROM r WHERE rk <= 8 OR (conc IS NOT NULL AND crk = 1) ORDER BY rk LIMIT 9\n",
      "limit": 9,
      "returnedRows": 9,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_46d87f18-568a-47ff-8c2c-dc9c91e81b32",
      "rows": [
        {
          "account_id": "001am00002AA8OFAA1",
          "held": null,
          "flow": null,
          "held_accts": null,
          "inst": null,
          "success": 59.34,
          "goal": 4649744,
          "sentiment": "Very Negative",
          "deal_risk": 73.39,
          "ticker": null,
          "conc": null,
          "score": 0.2723083333333333,
          "rk": 1,
          "crk": 2268
        },
        {
          "account_id": "001am00002A9fC4AAJ",
          "held": null,
          "flow": null,
          "held_accts": null,
          "inst": null,
          "success": 60.09,
          "goal": 3502514,
          "sentiment": "Very Negative",
          "deal_risk": 74.85,
          "ticker": null,
          "conc": null,
          "score": 0.2697083333333333,
          "rk": 2,
          "crk": 2267
        },
        {
          "account_id": "001am00002A9g0RAAR",
          "held": null,
          "flow": null,
          "held_accts": null,
          "inst": null,
          "success": 58.53,
          "goal": 3344494,
          "sentiment": "Very Negative",
          "deal_risk": 59.6,
          "ticker": null,
          "conc": null,
          "score": 0.2445833333333333,
          "rk": 3,
          "crk": 2266
        },
        {
          "account_id": "001am00002AYALEAA5",
          "held": null,
          "flow": null,
          "held_accts": null,
          "inst": null,
          "success": 42.03,
          "goal": 4062701,
          "sentiment": null,
          "deal_risk": null,
          "ticker": null,
          "conc": null,
          "score": 0.2330833333333333,
          "rk": 4,
          "crk": 3018
        },
        {
          "account_id": "001am00002AA81dAAD",
          "held": null,
          "flow": null,
          "held_accts": null,
          "inst": null,
          "success": 42.11,
          "goal": 4647487,
          "sentiment": null,
          "deal_risk": null,
          "ticker": null,
          "conc": null,
          "score": 0.2324166666666666,
          "rk": 5,
          "crk": 3019
        },
        {
          "account_id": "001am00002AYAMIAA5",
          "held": null,
          "flow": null,
          "held_accts": null,
          "inst": null,
          "success": 42.18,
          "goal": 2835126,
          "sentiment": null,
          "deal_risk": null,
          "ticker": null,
          "conc": null,
          "score": 0.2318333333333333,
          "rk": 6,
          "crk": 3016
        },
        {
          "account_id": "001am00002AYOZGAA5",
          "held": null,
          "flow": null,
          "held_accts": null,
          "inst": null,
          "success": 42.33,
          "goal": 4133261,
          "sentiment": null,
          "deal_risk": null,
          "ticker": null,
          "conc": null,
          "score": 0.2305833333333333,
          "rk": 7,
          "crk": 3017
        },
        {
          "account_id": "001am00002AYOMnAAP",
          "held": null,
          "flow": null,
          "held_accts": null,
          "inst": null,
          "success": 42.45,
          "goal": 2898746,
          "sentiment": null,
          "deal_risk": null,
          "ticker": null,
          "conc": null,
          "score": 0.2295833333333333,
          "rk": 8,
          "crk": 3013
        },
        {
          "account_id": "001am00000qvjsAAAQ",
          "held": null,
          "flow": null,
          "held_accts": null,
          "inst": null,
          "success": 61.02,
          "goal": 4822758,
          "sentiment": null,
          "deal_risk": null,
          "ticker": "MSFT",
          "conc": 0.314305,
          "score": 0.2095353333333333,
          "rk": 20,
          "crk": 1
        }
      ]
    },
    "wealthWhoToCall_summarySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "wealthWhoToCall_summarySql",
      "query": "\n  WITH ha AS (\n    SELECT account_id__c AS acct, institution_name__c AS inst, balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,\n           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn\n    FROM BT_Plaid_Held_Away__dlm\n    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)\n      AND is_active__c = true AND balance_usd__c > 0 AND institution_type__c IN ('Brokerage', 'Robo-Advisor')\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ),\n  h AS (\n    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts, MAX(CASE WHEN rn = 1 THEN inst END) AS inst\n    FROM ha GROUP BY acct\n  ),\n  p AS (\n    SELECT account_id__c AS acct, MIN(monte_carlo_success_pct__c) AS success, MAX(total_goal_amount_usd__c) AS goal\n    FROM BT_MoneyGuidePro_Financial_Plans__dlm\n    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)\n      AND plan_status__c IN ('Active', 'Stale') AND monte_carlo_success_pct__c < 70\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY account_id__c\n  ),\n  g AS (\n    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk\n    FROM BT_Gong_Call_Sentiment__dlm\n    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)\n      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY account_id__c\n  ),\n  pos AS (\n    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv\n    FROM ssot__FinancialHolding__dlm\n    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c\n  ),\n  tot AS (SELECT acct, SUM(mv) AS tot FROM pos GROUP BY acct),\n  big AS (\n    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn\n    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')\n  ),\n  k AS (\n    SELECT big.acct AS acct, big.t AS ticker, big.mv / tot.tot AS w\n    FROM big JOIN tot ON tot.acct = big.acct\n    WHERE big.rn = 1 AND tot.tot > 0 AND big.mv / tot.tot >= 0.2\n  ),\n  ids AS (\n    SELECT DISTINCT acct FROM (\n      SELECT acct FROM h UNION ALL SELECT acct FROM p UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM k\n    ) u\n  ),\n  b AS (\n    SELECT ids.acct AS account_id, h.bal AS held, h.flow AS flow, h.accts AS held_accts, h.inst AS inst,\n           p.success AS success, p.goal AS goal, g.sentiment AS sentiment, g.risk AS deal_risk,\n           k.ticker AS ticker, k.w AS conc,\n           0.2 * COALESCE(CASE WHEN h.bal >= 2000000 THEN 1 ELSE h.bal / 2000000.0 END, 0)\n         + 0.15 * COALESCE(CASE WHEN h.flow >= 5000 THEN 1 WHEN h.flow > 0 THEN h.flow / 5000.0 ELSE 0 END, 0)\n         + 0.25 * COALESCE(CASE WHEN p.success <= 40 THEN 1 ELSE (70 - p.success) / 30.0 END, 0)\n         + 0.25 * COALESCE(g.risk / 100.0, 0)\n         + 0.15 * COALESCE(CASE WHEN k.w >= 0.35 THEN 1 ELSE k.w / 0.35 END, 0) AS score\n    FROM ids\n    LEFT JOIN h ON h.acct = ids.acct\n    LEFT JOIN p ON p.acct = ids.acct\n    LEFT JOIN g ON g.acct = ids.acct\n    LEFT JOIN k ON k.acct = ids.acct\n  )\n  SELECT COUNT(*) AS clients,\n         SUM(CASE WHEN (CASE WHEN flow > 0 THEN 1 ELSE 0 END) + (CASE WHEN success IS NOT NULL THEN 1 ELSE 0 END)\n                     + (CASE WHEN deal_risk IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN conc IS NOT NULL THEN 1 ELSE 0 END) >= 2\n                  THEN 1 ELSE 0 END) AS multi\n  FROM b\n",
      "limit": 100,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_168da6cc-1f70-4d04-a607-19061953ef13",
      "rows": [
        {
          "clients": 3023,
          "multi": 6
        }
      ]
    },
    "planSignals_atRiskRowsSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "planSignals_atRiskRowsSql",
      "query": "\n  WITH ha AS (\n    SELECT account_id__c AS acct, institution_name__c AS inst, balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,\n           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn\n    FROM BT_Plaid_Held_Away__dlm\n    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)\n      AND is_active__c = true AND balance_usd__c > 0 AND institution_type__c IN ('Brokerage', 'Robo-Advisor')\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ),\n  h AS (\n    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts, MAX(CASE WHEN rn = 1 THEN inst END) AS inst\n    FROM ha GROUP BY acct\n  ),\n  p AS (\n    SELECT account_id__c AS acct, MIN(monte_carlo_success_pct__c) AS success, MAX(total_goal_amount_usd__c) AS goal\n    FROM BT_MoneyGuidePro_Financial_Plans__dlm\n    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)\n      AND plan_status__c IN ('Active', 'Stale') AND monte_carlo_success_pct__c < 70\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY account_id__c\n  ),\n  g AS (\n    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk\n    FROM BT_Gong_Call_Sentiment__dlm\n    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)\n      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY account_id__c\n  ),\n  pos AS (\n    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv\n    FROM ssot__FinancialHolding__dlm\n    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c\n  ),\n  tot AS (SELECT acct, SUM(mv) AS tot FROM pos GROUP BY acct),\n  big AS (\n    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn\n    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')\n  ),\n  k AS (\n    SELECT big.acct AS acct, big.t AS ticker, big.mv / tot.tot AS w\n    FROM big JOIN tot ON tot.acct = big.acct\n    WHERE big.rn = 1 AND tot.tot > 0 AND big.mv / tot.tot >= 0.2\n  ),\n  ids AS (\n    SELECT DISTINCT acct FROM (\n      SELECT acct FROM h UNION ALL SELECT acct FROM p UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM k\n    ) u\n  ),\n  b AS (\n    SELECT ids.acct AS account_id, h.bal AS held, h.flow AS flow, h.accts AS held_accts, h.inst AS inst,\n           p.success AS success, p.goal AS goal, g.sentiment AS sentiment, g.risk AS deal_risk,\n           k.ticker AS ticker, k.w AS conc,\n           0.2 * COALESCE(CASE WHEN h.bal >= 2000000 THEN 1 ELSE h.bal / 2000000.0 END, 0)\n         + 0.15 * COALESCE(CASE WHEN h.flow >= 5000 THEN 1 WHEN h.flow > 0 THEN h.flow / 5000.0 ELSE 0 END, 0)\n         + 0.25 * COALESCE(CASE WHEN p.success <= 40 THEN 1 ELSE (70 - p.success) / 30.0 END, 0)\n         + 0.25 * COALESCE(g.risk / 100.0, 0)\n         + 0.15 * COALESCE(CASE WHEN k.w >= 0.35 THEN 1 ELSE k.w / 0.35 END, 0) AS score\n    FROM ids\n    LEFT JOIN h ON h.acct = ids.acct\n    LEFT JOIN p ON p.acct = ids.acct\n    LEFT JOIN g ON g.acct = ids.acct\n    LEFT JOIN k ON k.acct = ids.acct\n  )\n  SELECT account_id__c AS account_id, monte_carlo_success_pct__c AS success, total_goal_amount_usd__c AS goal_usd,\n         goal_count__c AS goals, CAST(next_review_date__c AS VARCHAR) AS next_review,\n         CAST(plan_last_updated_date__c AS VARCHAR) AS updated, CASE WHEN (plan_status__c = 'Stale' OR plan_last_updated_date__c < CURRENT_DATE - INTERVAL '12' MONTH) THEN 1 ELSE 0 END AS stale\n  FROM BT_MoneyGuidePro_Financial_Plans__dlm LEFT JOIN b ON b.account_id = account_id__c\n  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)\n    AND plan_status__c IN ('Active', 'Stale') AND monte_carlo_success_pct__c < 70\n    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ORDER BY COALESCE(b.score, 0) DESC, CASE WHEN monte_carlo_success_pct__c < 50 THEN 1 ELSE 0 END DESC, total_goal_amount_usd__c DESC\n  LIMIT 14\n",
      "limit": 14,
      "returnedRows": 14,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_e4996316-443a-4347-9523-4313d8080738",
      "rows": [
        {
          "account_id": "001am00002AA8OFAA1",
          "success": 59.34,
          "goal_usd": 4649744,
          "goals": 5,
          "next_review": "2026-12-06",
          "updated": "2026-07-18",
          "stale": 0
        },
        {
          "account_id": "001am00002A9fC4AAJ",
          "success": 60.09,
          "goal_usd": 3502514,
          "goals": 3,
          "next_review": "2027-04-03",
          "updated": "2026-02-15",
          "stale": 0
        },
        {
          "account_id": "001am00002A9g0RAAR",
          "success": 58.53,
          "goal_usd": 3344494,
          "goals": 4,
          "next_review": "2027-06-23",
          "updated": "2025-11-11",
          "stale": 1
        },
        {
          "account_id": "001am00002AYALEAA5",
          "success": 42.03,
          "goal_usd": 4062701,
          "goals": 6,
          "next_review": "2027-12-21",
          "updated": "2026-01-04",
          "stale": 0
        },
        {
          "account_id": "001am00002AA81dAAD",
          "success": 42.11,
          "goal_usd": 4647487,
          "goals": 6,
          "next_review": null,
          "updated": "2025-02-22",
          "stale": 1
        },
        {
          "account_id": "001am00002AYAMIAA5",
          "success": 42.18,
          "goal_usd": 2835126,
          "goals": 6,
          "next_review": "2027-07-05",
          "updated": "2026-05-06",
          "stale": 0
        },
        {
          "account_id": "001am00002AYOZGAA5",
          "success": 42.33,
          "goal_usd": 4133261,
          "goals": 6,
          "next_review": "2027-12-18",
          "updated": "2025-11-28",
          "stale": 0
        },
        {
          "account_id": "001am00002AYOMnAAP",
          "success": 42.45,
          "goal_usd": 2898746,
          "goals": 6,
          "next_review": "2027-07-01",
          "updated": "2026-02-04",
          "stale": 0
        },
        {
          "account_id": "001am00002A9fKSAAZ",
          "success": 42.55,
          "goal_usd": 4314023,
          "goals": 6,
          "next_review": "2027-11-11",
          "updated": "2025-12-03",
          "stale": 0
        },
        {
          "account_id": "001am00002AA86sAAD",
          "success": 42.72,
          "goal_usd": 5118134,
          "goals": 6,
          "next_review": "2027-03-02",
          "updated": "2026-03-16",
          "stale": 0
        },
        {
          "account_id": "001am00002A9ft0AAB",
          "success": 43.16,
          "goal_usd": 3359920,
          "goals": 6,
          "next_review": "2026-12-02",
          "updated": "2025-12-28",
          "stale": 0
        },
        {
          "account_id": "001am00002A9fLxAAJ",
          "success": 43.19,
          "goal_usd": 3078498,
          "goals": 6,
          "next_review": "2027-01-16",
          "updated": "2026-06-29",
          "stale": 0
        },
        {
          "account_id": "001am00002AA8bKAAT",
          "success": 43.33,
          "goal_usd": 2779025,
          "goals": 6,
          "next_review": "2027-07-24",
          "updated": "2025-11-14",
          "stale": 0
        },
        {
          "account_id": "001am00002AYOztAAH",
          "success": 43.35,
          "goal_usd": 3580199,
          "goals": 6,
          "next_review": "2027-06-30",
          "updated": "2025-11-14",
          "stale": 0
        }
      ]
    },
    "planSignals_reviewRowsSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "planSignals_reviewRowsSql",
      "query": "\n  SELECT account_id__c AS account_id, monte_carlo_success_pct__c AS success, total_goal_amount_usd__c AS goal_usd,\n         goal_count__c AS goals, CAST(next_review_date__c AS VARCHAR) AS next_review,\n         CAST(plan_last_updated_date__c AS VARCHAR) AS updated, CASE WHEN (plan_status__c = 'Stale' OR plan_last_updated_date__c < CURRENT_DATE - INTERVAL '12' MONTH) THEN 1 ELSE 0 END AS stale\n  FROM BT_MoneyGuidePro_Financial_Plans__dlm\n  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)\n    AND plan_status__c IN ('Active', 'Stale') AND next_review_date__c BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30' DAY\n    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ORDER BY next_review_date__c ASC, total_goal_amount_usd__c DESC\n  LIMIT 6\n",
      "limit": 6,
      "returnedRows": 6,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_341e9c55-3801-41e9-b1d4-1fd4bb42d2d1",
      "rows": [
        {
          "account_id": "001am00002AYALLAA5",
          "success": 60.8,
          "goal_usd": 5112095,
          "goals": 4,
          "next_review": "2026-12-01",
          "updated": "2025-12-12",
          "stale": 0
        },
        {
          "account_id": "001am00002AA8DMAA1",
          "success": 50.69,
          "goal_usd": 4771548,
          "goals": 5,
          "next_review": "2026-12-01",
          "updated": "2026-01-19",
          "stale": 0
        },
        {
          "account_id": "001am00002AYONXAA5",
          "success": 67.02,
          "goal_usd": 4567461,
          "goals": 3,
          "next_review": "2026-12-01",
          "updated": "2026-04-24",
          "stale": 0
        },
        {
          "account_id": "001am00002AA8DnAAL",
          "success": 70.93,
          "goal_usd": 3894189,
          "goals": 2,
          "next_review": "2026-12-01",
          "updated": "2026-06-19",
          "stale": 0
        },
        {
          "account_id": "001am00002A9fnRAAR",
          "success": 65.69,
          "goal_usd": 3684320,
          "goals": 6,
          "next_review": "2026-12-01",
          "updated": "2026-04-21",
          "stale": 0
        },
        {
          "account_id": "001am00002AYOGzAAP",
          "success": 70.09,
          "goal_usd": 3640426,
          "goals": 3,
          "next_review": "2026-12-01",
          "updated": "2026-09-09",
          "stale": 0
        }
      ]
    },
    "planSignals_summarySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "planSignals_summarySql",
      "query": "\n  SELECT COUNT(*) AS plans,\n         SUM(CASE WHEN monte_carlo_success_pct__c < 70 THEN 1 ELSE 0 END) AS at_risk,\n         SUM(CASE WHEN monte_carlo_success_pct__c < 50 THEN 1 ELSE 0 END) AS critical,\n         SUM(CASE WHEN monte_carlo_success_pct__c < 70 THEN total_goal_amount_usd__c ELSE 0 END) AS at_risk_goal_usd,\n         SUM(CASE WHEN next_review_date__c BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30' DAY THEN 1 ELSE 0 END) AS due30,\n         SUM(CASE WHEN (plan_status__c = 'Stale' OR plan_last_updated_date__c < CURRENT_DATE - INTERVAL '12' MONTH) THEN 1 ELSE 0 END) AS stale\n  FROM BT_MoneyGuidePro_Financial_Plans__dlm\n  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)\n    AND plan_status__c IN ('Active', 'Stale')\n    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n",
      "limit": 100,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_545b44f3-1463-4890-9520-81640c25c677",
      "rows": [
        {
          "plans": 4488,
          "at_risk": 3014,
          "critical": 141,
          "at_risk_goal_usd": 11307085387,
          "due30": 112,
          "stale": 545
        }
      ]
    },
    "holdingsConcentration_rowsSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "holdingsConcentration_rowsSql",
      "query": "\n  WITH pos AS (\n    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv\n    FROM ssot__FinancialHolding__dlm\n    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c\n  ),\n  tot AS (SELECT acct, SUM(mv) AS tot, COUNT(*) AS npos FROM pos GROUP BY acct),\n  big AS (\n    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn\n    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')\n  ),\n  nm AS (\n    SELECT ssot__FinancialSecurityId__c AS t, MAX(ssot__Name__c) AS name\n    FROM ssot__FinancialHolding__dlm\n    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__Name__c NOT LIKE 'a7m%'\n    GROUP BY ssot__FinancialSecurityId__c\n  )\n  SELECT big.acct AS account_id, big.t AS ticker, nm.name AS name, big.mv AS mv, tot.tot AS tot,\n         big.mv / tot.tot AS w, tot.npos AS npos\n  FROM big JOIN tot ON tot.acct = big.acct LEFT JOIN nm ON nm.t = big.t\n  WHERE big.rn = 1\n  ORDER BY w DESC\n  LIMIT 5\n",
      "limit": 5,
      "returnedRows": 5,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_fcd47be4-6961-4899-ba1c-c18a2059cc1b",
      "rows": [
        {
          "account_id": "001am00000qvjsAAAQ",
          "ticker": "MSFT",
          "name": "MSFT - Microsoft Corporation",
          "mv": 586818.02,
          "tot": 1867033.63,
          "w": 0.314305,
          "npos": 20
        },
        {
          "account_id": "001am000026ZhLmAAK",
          "ticker": "AMZN",
          "name": "AMZN - Amazon.com Inc.",
          "mv": 15657.6,
          "tot": 84195.85,
          "w": 0.185966,
          "npos": 12
        },
        {
          "account_id": "001am000026ZtgLAAS",
          "ticker": "JPM",
          "name": "JPM - JPMorgan Chase & Co.",
          "mv": 52668.75,
          "tot": 356081.9,
          "w": 0.147912,
          "npos": 17
        },
        {
          "account_id": "001am000026ZtgNAAS",
          "ticker": "AMZN",
          "name": "AMZN - Amazon.com Inc.",
          "mv": 30196.8,
          "tot": 278456.4,
          "w": 0.108444,
          "npos": 23
        },
        {
          "account_id": "001am000026ZkI2AAK",
          "ticker": "PG",
          "name": "PG - Procter & Gamble Co.",
          "mv": 28266.3,
          "tot": 281532.85,
          "w": 0.100401,
          "npos": 25
        }
      ]
    },
    "holdingsConcentration_summarySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "holdingsConcentration_summarySql",
      "query": "\n  WITH pos AS (\n    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv\n    FROM ssot__FinancialHolding__dlm\n    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c\n  ),\n  tot AS (SELECT acct, SUM(mv) AS tot, COUNT(*) AS npos FROM pos GROUP BY acct),\n  big AS (\n    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn\n    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')\n  ),\n  nm AS (\n    SELECT ssot__FinancialSecurityId__c AS t, MAX(ssot__Name__c) AS name\n    FROM ssot__FinancialHolding__dlm\n    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__Name__c NOT LIKE 'a7m%'\n    GROUP BY ssot__FinancialSecurityId__c\n  )\n  SELECT COUNT(*) AS clients, SUM(tot.tot) AS aum,\n         SUM(CASE WHEN big.mv >= 0.2 * tot.tot THEN 1 ELSE 0 END) AS concentrated,\n         (SELECT SUM(mv) FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')) AS single\n  FROM tot LEFT JOIN big ON big.acct = tot.acct AND big.rn = 1\n",
      "limit": 100,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_fd995a84-86c9-493c-9ae5-6f744f6eb836",
      "rows": [
        {
          "clients": 13,
          "aum": 4885000.68,
          "concentrated": 1,
          "single": 3707072.03
        }
      ]
    },
    "holdingsConcentration_exposureSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "holdingsConcentration_exposureSql",
      "query": "\n  WITH pos AS (\n    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv\n    FROM ssot__FinancialHolding__dlm\n    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c\n  ),\n  tot AS (SELECT acct, SUM(mv) AS tot, COUNT(*) AS npos FROM pos GROUP BY acct),\n  big AS (\n    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn\n    FROM pos WHERE t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')\n  ),\n  nm AS (\n    SELECT ssot__FinancialSecurityId__c AS t, MAX(ssot__Name__c) AS name\n    FROM ssot__FinancialHolding__dlm\n    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__Name__c NOT LIKE 'a7m%'\n    GROUP BY ssot__FinancialSecurityId__c\n  )\n  SELECT pos.t AS ticker, MAX(nm.name) AS name, SUM(pos.mv) AS mv, COUNT(*) AS holders\n  FROM pos LEFT JOIN nm ON nm.t = pos.t\n  WHERE pos.t NOT IN ('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')\n  GROUP BY pos.t\n  ORDER BY mv DESC\n  LIMIT 4\n",
      "limit": 4,
      "returnedRows": 4,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_bdbac261-d2c1-4db4-98b1-071f7d8e9870",
      "rows": [
        {
          "ticker": "MSFT",
          "name": "MSFT - Microsoft Corporation",
          "mv": 700285.52,
          "holders": 11
        },
        {
          "ticker": "GOOGL",
          "name": "GOOGL - Alphabet Inc.",
          "mv": 591041.76,
          "holders": 12
        },
        {
          "ticker": "HD",
          "name": "HD - Home Depot Inc.",
          "mv": 520623.84,
          "holders": 11
        },
        {
          "ticker": "AMZN",
          "name": "AMZN - Amazon.com Inc.",
          "mv": 452618.23,
          "holders": 12
        }
      ]
    },
    "digitalLeakage_rowsSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "digitalLeakage_rowsSql",
      "query": "\n  SELECT account_id, kind, balance, net_flow, institution, accounts FROM (\n    SELECT account_id__c AS account_id, institution_type__c AS kind, SUM(balance_usd__c) AS balance,\n           SUM(monthly_net_flow_usd__c) AS net_flow, MAX(institution_name__c) AS institution, COUNT(*) AS accounts,\n           ROW_NUMBER() OVER (PARTITION BY institution_type__c ORDER BY SUM(balance_usd__c) DESC) AS pn\n    FROM BT_Plaid_Held_Away__dlm\n    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)\n    AND is_active__c = true AND balance_usd__c > 0\n    AND institution_type__c IN ('Crypto Exchange', 'Robo-Advisor')\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY account_id__c, institution_type__c\n  ) x\n  WHERE pn <= 3\n  ORDER BY pn, kind\n",
      "limit": 100,
      "returnedRows": 2,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_b90e0291-873e-4424-be86-6ff624bb6122",
      "rows": [
        {
          "account_id": "001am000026ZtgJAAS",
          "kind": "Crypto Exchange",
          "balance": 1891.93,
          "net_flow": -198.96,
          "institution": "Coinbase",
          "accounts": 1
        },
        {
          "account_id": "001am000026ZtgKAAS",
          "kind": "Robo-Advisor",
          "balance": 34795.48,
          "net_flow": 2384.02,
          "institution": "Wealthfront",
          "accounts": 1
        }
      ]
    },
    "digitalLeakage_summarySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "digitalLeakage_summarySql",
      "query": "\n  SELECT institution_type__c AS kind, COUNT(DISTINCT account_id__c) AS clients, SUM(balance_usd__c) AS balance,\n         SUM(CASE WHEN monthly_net_flow_usd__c > 0 THEN monthly_net_flow_usd__c ELSE 0 END) AS inflow\n  FROM BT_Plaid_Held_Away__dlm\n  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)\n    AND is_active__c = true AND balance_usd__c > 0\n    AND institution_type__c IN ('Crypto Exchange', 'Robo-Advisor')\n    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  GROUP BY institution_type__c\n",
      "limit": 100,
      "returnedRows": 2,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_15ba8201-e07d-49ec-901c-6f6737b3cb6b",
      "rows": [
        {
          "kind": "Crypto Exchange",
          "clients": 1,
          "balance": 1891.93,
          "inflow": 0
        },
        {
          "kind": "Robo-Advisor",
          "clients": 1,
          "balance": 34795.48,
          "inflow": 2384.02
        }
      ]
    },
    "tradingPulse_weeklySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "tradingPulse_weeklySql",
      "query": "\n  SELECT CAST(CAST(DATE_TRUNC('week', trade_date__c) AS DATE) AS VARCHAR) AS d,\n         CAST(MAX(CAST(trade_date__c AS DATE)) AS VARCHAR) AS last_d,\n         SUM(CASE WHEN trade_side__c = 'Buy' THEN total_trade__c ELSE 0 END) AS buys,\n         SUM(CASE WHEN trade_side__c = 'Sell' THEN total_trade__c ELSE 0 END) AS sells,\n         COUNT(*) AS n\n  FROM BT_Financial_Trades__dlm\n  WHERE trade_date__c >= DATE_TRUNC('week', (SELECT MAX(trade_date__c) FROM BT_Financial_Trades__dlm WHERE account_id__c LIKE '001am%')) - INTERVAL '56' DAY\n    AND trade_status__c = 'Confirmed' AND currency__c = 'USD'\n    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  GROUP BY DATE_TRUNC('week', trade_date__c)\n  ORDER BY 1\n",
      "limit": 100,
      "returnedRows": 9,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_3e754905-b6d7-413c-a8a3-27743167b6cc",
      "rows": [
        {
          "d": "2026-09-14",
          "last_d": "2026-09-20",
          "buys": 332579304.01,
          "sells": 331161812.64,
          "n": 10716
        },
        {
          "d": "2026-09-21",
          "last_d": "2026-09-27",
          "buys": 336835761.49,
          "sells": 328330782.83,
          "n": 10694
        },
        {
          "d": "2026-09-28",
          "last_d": "2026-10-04",
          "buys": 328452497.24,
          "sells": 324711884.37,
          "n": 10605
        },
        {
          "d": "2026-10-05",
          "last_d": "2026-10-10",
          "buys": 342421918.76,
          "sells": 329035323.74,
          "n": 10811
        },
        {
          "d": "2026-10-12",
          "last_d": "2026-10-18",
          "buys": 327510802,
          "sells": 335785440.08,
          "n": 10756
        },
        {
          "d": "2026-10-19",
          "last_d": "2026-10-25",
          "buys": 326971640.42,
          "sells": 332354902.92,
          "n": 10822
        },
        {
          "d": "2026-10-26",
          "last_d": "2026-11-01",
          "buys": 330056564.05,
          "sells": 329129154.77,
          "n": 10720
        },
        {
          "d": "2026-11-02",
          "last_d": "2026-11-08",
          "buys": 326078181.36,
          "sells": 327165822.77,
          "n": 10672
        },
        {
          "d": "2026-11-09",
          "last_d": "2026-11-13",
          "buys": 329685348.83,
          "sells": 328143413.36,
          "n": 10707
        }
      ]
    },
    "tradingPulse_sellersSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "tradingPulse_sellersSql",
      "query": "\n  SELECT account_id__c AS account_id,\n         SUM(CASE WHEN trade_side__c = 'Sell' THEN total_trade__c ELSE -total_trade__c END) AS net_sold,\n         COUNT(*) AS trades, MAX(instrument_name__c) AS instrument\n  FROM BT_Financial_Trades__dlm\n  WHERE trade_date__c >= DATE_TRUNC('week', (SELECT MAX(trade_date__c) FROM BT_Financial_Trades__dlm WHERE account_id__c LIKE '001am%'))\n    AND trade_status__c = 'Confirmed' AND currency__c = 'USD'\n    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  GROUP BY account_id__c\n  HAVING SUM(CASE WHEN trade_side__c = 'Sell' THEN total_trade__c ELSE -total_trade__c END) > 0\n  ORDER BY 2 DESC\n  LIMIT 4\n",
      "limit": 4,
      "returnedRows": 4,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_3f48b4d9-dc7e-4caf-a8bc-183ade8151bc",
      "rows": [
        {
          "account_id": "001am00002A9sJLAAZ",
          "net_sold": 478727.24,
          "trades": 4,
          "instrument": "The J.M. Smucker Company"
        },
        {
          "account_id": "001am00002AYOGGAA5",
          "net_sold": 434143.77999999997,
          "trades": 4,
          "instrument": "Ryerson Holding Corporation"
        },
        {
          "account_id": "001am00002A9flwAAB",
          "net_sold": 424400.21,
          "trades": 4,
          "instrument": "SES AI Corporation Class A"
        },
        {
          "account_id": "001am00002AA8DVAA1",
          "net_sold": 380887.06,
          "trades": 3,
          "instrument": "Service Corporation International"
        }
      ]
    },
    "businessOwners_ownerRowsSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "businessOwners_ownerRowsSql",
      "query": "\n  SELECT owner_id, biz_id, biz_name, conf, revenue_band, employee_band FROM (\n    SELECT g.src_account_id__c AS owner_id, g.dst_account_id__c AS biz_id, d.ssot__Name__c AS biz_name,\n           g.confidence_pct__c AS conf, z.revenue_band__c AS revenue_band, z.employee_band__c AS employee_band,\n           CASE WHEN z.revenue_band__c IN ('$50M-$200M', '$200M-$1B', '$1B+') THEN 1 ELSE 0 END AS up,\n           ROW_NUMBER() OVER (PARTITION BY g.src_account_id__c\n                              ORDER BY CASE WHEN z.revenue_band__c IN ('$50M-$200M', '$200M-$1B', '$1B+') THEN 1 ELSE 0 END DESC, g.confidence_pct__c DESC) AS rn\n    FROM BT_Synth_Relationship_Graph__dlm g\n    JOIN ssot__Account__dlm d ON d.ssot__Id__c = g.dst_account_id__c\n    LEFT JOIN BT_Zoominfo_Firmographics__dlm z ON z.account_id__c = g.dst_account_id__c AND z.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm)\n    WHERE g.edge_type__c = 'BUSINESS_OWNER'\n      AND g.src_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ) x\n  WHERE rn = 1\n  ORDER BY up DESC, conf DESC\n  LIMIT 5\n",
      "limit": 5,
      "returnedRows": 0,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_e49a35de-7115-4097-862c-1c3892a66201",
      "rows": []
    },
    "businessOwners_ownerSummarySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "businessOwners_ownerSummarySql",
      "query": "\n  SELECT COUNT(DISTINCT g.src_account_id__c) AS owners, COUNT(DISTINCT g.dst_account_id__c) AS businesses,\n         COUNT(DISTINCT CASE WHEN z.revenue_band__c IN ('$50M-$200M', '$200M-$1B', '$1B+') THEN g.dst_account_id__c END) AS upmarket\n  FROM BT_Synth_Relationship_Graph__dlm g\n  LEFT JOIN BT_Zoominfo_Firmographics__dlm z ON z.account_id__c = g.dst_account_id__c AND z.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm)\n  WHERE g.edge_type__c = 'BUSINESS_OWNER'\n    AND g.src_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n",
      "limit": 100,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_9d469a16-b581-4053-9d7c-d504967bb40d",
      "rows": [
        {
          "owners": 0,
          "businesses": 0,
          "upmarket": 0
        }
      ]
    },
    "businessOwners_handoffRowsSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "businessOwners_handoffRowsSql",
      "query": "\n  SELECT owner_id, owner_name, biz_id, conf, wealth, net_worth, life_stage FROM (\n    SELECT g.src_account_id__c AS owner_id, p.ssot__Name__c AS owner_name, g.dst_account_id__c AS biz_id,\n           g.confidence_pct__c AS conf, c.wealth_propensity_score__c AS wealth,\n           c.estimated_net_worth_band__c AS net_worth, c.life_stage__c AS life_stage, CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 3 WHEN c.estimated_net_worth_band__c = '$1M-$5M' THEN 2 WHEN c.estimated_net_worth_band__c = '$250K-$1M' THEN 1 ELSE 0 END AS nw,\n           ROW_NUMBER() OVER (PARTITION BY g.src_account_id__c ORDER BY g.confidence_pct__c DESC) AS rn\n    FROM BT_Synth_Relationship_Graph__dlm g\n    JOIN ssot__Account__dlm p ON p.ssot__Id__c = g.src_account_id__c\n    JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c = g.src_account_id__c AND c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)\n    WHERE g.edge_type__c = 'BUSINESS_OWNER'\n      AND g.dst_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ) x\n  WHERE rn = 1\n  ORDER BY nw DESC, wealth DESC NULLS LAST, conf DESC\n  LIMIT 4\n",
      "limit": 4,
      "returnedRows": 4,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_ea61a5eb-d40d-4b05-9765-abd5b83096ff",
      "rows": [
        {
          "owner_id": "001am00002A9j8rAAB",
          "owner_name": "Brandon D Ward",
          "biz_id": "001am00002AYOusAAH",
          "conf": 89.71,
          "wealth": 100,
          "net_worth": "$5M+",
          "life_stage": "Established Families"
        },
        {
          "owner_id": "001am00002AAALRAA5",
          "owner_name": "Justin W Turner",
          "biz_id": "001am00002A9fE0AAJ",
          "conf": 86.04,
          "wealth": 100,
          "net_worth": "$5M+",
          "life_stage": "Established Families"
        },
        {
          "owner_id": "001am00002AYR1IAAX",
          "owner_name": "Lisa C Smith",
          "biz_id": "001am00002A9sJBAAZ",
          "conf": 85.51,
          "wealth": 100,
          "net_worth": "$5M+",
          "life_stage": "Empty Nesters"
        },
        {
          "owner_id": "001am00002AAAK9AAP",
          "owner_name": "Ryan B Stewart",
          "biz_id": "001am00002A9fLoAAJ",
          "conf": 80.3,
          "wealth": 100,
          "net_worth": "$5M+",
          "life_stage": "Empty Nesters"
        }
      ]
    },
    "businessOwners_handoffSummarySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "businessOwners_handoffSummarySql",
      "query": "\n  SELECT COUNT(DISTINCT g.src_account_id__c) AS owners,\n         COUNT(DISTINCT CASE WHEN c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+') THEN g.src_account_id__c END) AS millionaires\n  FROM BT_Synth_Relationship_Graph__dlm g\n  LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c = g.src_account_id__c AND c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)\n  WHERE g.edge_type__c = 'BUSINESS_OWNER'\n    AND g.dst_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n",
      "limit": 100,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_81dec704-927a-42fa-9223-85f743cc38f9",
      "rows": [
        {
          "owners": 287,
          "millionaires": 169
        }
      ]
    },
    "wealthUpgrades_rowsSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "wealthUpgrades_rowsSql",
      "query": "\n  SELECT c.account_id__c AS account_id, c.estimated_net_worth_band__c AS net_worth,\n         c.wealth_propensity_score__c AS wealth, c.investment_propensity_score__c AS invest,\n         c.life_stage__c AS life_stage, c.prizm_segment_name__c AS prizm,\n         a.FinServ_ClientCategory_c__c AS category, a.FinServ_AnnualIncome_pc__c AS income\n  FROM BT_Claritas_Demographics__dlm c\n  JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.account_id__c\n  WHERE c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)\n    AND (c.wealth_propensity_score__c >= 80 OR c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+'))\n    AND (a.FinServ_ClientCategory_c__c IS NULL OR a.FinServ_ClientCategory_c__c <> 'Wealth Management')\n    AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ORDER BY CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 1 ELSE 0 END DESC,\n           c.wealth_propensity_score__c DESC, c.investment_propensity_score__c DESC\n  LIMIT 5\n",
      "limit": 5,
      "returnedRows": 5,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_d917483d-6031-4dc9-8c50-8bec6c2d7790",
      "rows": [
        {
          "account_id": "001am00002A9fDPAAZ",
          "net_worth": "$5M+",
          "wealth": 99.68,
          "invest": 100,
          "life_stage": "Empty Nesters",
          "prizm": "Pools & Patios",
          "category": "Household",
          "income": null
        },
        {
          "account_id": "001am00002AYObHAAX",
          "net_worth": "$5M+",
          "wealth": 91.46,
          "invest": 100,
          "life_stage": "Empty Nesters",
          "prizm": "Pools & Patios",
          "category": "Household",
          "income": null
        },
        {
          "account_id": "001am00002AA87mAAD",
          "net_worth": "$5M+",
          "wealth": 81.39,
          "invest": 100,
          "life_stage": "Empty Nesters",
          "prizm": "Upper Crust",
          "category": "Household",
          "income": null
        },
        {
          "account_id": "001am00002A8XkeAAF",
          "net_worth": "$5M+",
          "wealth": 74.15,
          "invest": 87.65,
          "life_stage": "Young Families",
          "prizm": "Pools & Patios",
          "category": "Household",
          "income": null
        },
        {
          "account_id": "001am00002A9ffZAAR",
          "net_worth": "$5M+",
          "wealth": 73.88,
          "invest": 100,
          "life_stage": "Established Families",
          "prizm": "Young Achievers",
          "category": "Household",
          "income": null
        }
      ]
    },
    "wealthUpgrades_summarySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "wealthUpgrades_summarySql",
      "query": "\n  SELECT COUNT(*) AS candidates,\n         SUM(CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 1 ELSE 0 END) AS five_m,\n         SUM(CASE WHEN c.wealth_propensity_score__c >= 80 THEN 1 ELSE 0 END) AS high_propensity\n  FROM BT_Claritas_Demographics__dlm c\n  JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.account_id__c\n  WHERE c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)\n    AND (c.wealth_propensity_score__c >= 80 OR c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+'))\n    AND (a.FinServ_ClientCategory_c__c IS NULL OR a.FinServ_ClientCategory_c__c <> 'Wealth Management')\n    AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n",
      "limit": 100,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_390c7dd9-83ed-42a2-b5e8-dc039e64fb4f",
      "rows": [
        {
          "candidates": 467,
          "five_m": 23,
          "high_propensity": 43
        }
      ]
    },
    "jobChangeSignals_liquidityRowsSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "jobChangeSignals_liquidityRowsSql",
      "query": "\n  SELECT account_id__c, person_account_id__c, new_account_id__c, new_employer_name__c,\n         contact_name__c, old_title__c, contact_persona__c, was_champion__c,\n         relationship_risk_score__c, opportunity_score__c, detected_date__c\n  FROM BT_UserGems_Job_Changes__dlm\n  WHERE event_type__c = 'Departed'\n    AND liquidity_event_flag__c = true\n    AND person_account_id__c IS NOT NULL\n    AND detected_date__c >= current_date - INTERVAL '180' DAY\n    AND person_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ORDER BY opportunity_score__c DESC NULLS LAST, detected_date__c DESC\n  LIMIT 8\n",
      "limit": 8,
      "returnedRows": 0,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_e11a7354-ec05-4830-ac40-dffd5f0dc261",
      "rows": []
    },
    "jobChangeSignals_liquiditySummarySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "jobChangeSignals_liquiditySummarySql",
      "query": "\n  SELECT COUNT(DISTINCT person_account_id__c) AS total\n  FROM BT_UserGems_Job_Changes__dlm\n  WHERE event_type__c = 'Departed'\n    AND liquidity_event_flag__c = true\n    AND person_account_id__c IS NOT NULL\n    AND detected_date__c >= current_date - INTERVAL '180' DAY\n    AND person_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n",
      "limit": 100,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_c2f81509-e69e-44b3-8f5f-10a6d11806c2",
      "rows": [
        {
          "total": 0
        }
      ]
    },
    "transactionSignals_largeInflowSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "transactionSignals_largeInflowSql",
      "query": "\n  SELECT account_id, amount, description, tx_date FROM (\n    SELECT t.SFAccountID__c AS account_id, t.ssot__TransactionAmount__c AS amount,\n           t.ssot__Description__c AS description, t.ssot__TransactionDate__c AS tx_date,\n           ROW_NUMBER() OVER (PARTITION BY t.SFAccountID__c ORDER BY t.ssot__TransactionAmount__c DESC) AS rn\n    FROM ssot__FinancialAccountTransaction__dlm t\n    WHERE t.ssot__FinancialAccountTransactionType__c = 'Credit'\n      AND t.ssot__TransactionAmount__c >= 2000\n      AND t.ssot__TransactionDate__c >= current_date - INTERVAL '7' DAY\n      AND (t.ssot__Description__c LIKE '%Bonus%' OR t.ssot__Description__c LIKE '%BONUS%'\n           OR t.ssot__Description__c LIKE '%TAX REF%')\n      AND t.SFAccountID__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ) x\n  WHERE rn = 1\n  ORDER BY amount DESC\n  LIMIT 8\n",
      "limit": 8,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_600777eb-e8fe-476f-b56b-8a8a2157643c",
      "rows": [
        {
          "account_id": "001am000026ZtgJAAS",
          "amount": 4449.52,
          "description": "IRS TREAS 310 TAX REF",
          "tx_date": "2026-11-07T06:27:05+00:00"
        }
      ]
    },
    "transactionSignals_callSentimentSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "transactionSignals_callSentimentSql",
      "query": "\n  SELECT g.account_id__c AS account_id, g.overall_sentiment__c AS sentiment,\n         g.deal_risk_score__c AS deal_risk, g.next_scheduled_call_date__c AS next_call,\n         g.rm_last_logged_note_date__c AS last_note, g.key_topics_flags__c AS topics\n  FROM BT_Gong_Call_Sentiment__dlm g\n  WHERE g.profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)\n    AND g.overall_sentiment__c IN ('Negative', 'Very Negative')\n    AND g.sentiment_trend__c = 'Declining'\n    AND g.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ORDER BY g.deal_risk_score__c DESC\n  LIMIT 8\n",
      "limit": 8,
      "returnedRows": 8,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_b51ee46a-a80d-4d5a-a296-9e400ab08838",
      "rows": [
        {
          "account_id": "001am00002A9fC4AAJ",
          "sentiment": "Very Negative",
          "deal_risk": 74.85,
          "next_call": "2026-12-25",
          "last_note": "2026-10-26",
          "topics": "Competitor|Pricing"
        },
        {
          "account_id": "001am00002AA8OFAA1",
          "sentiment": "Very Negative",
          "deal_risk": 73.39,
          "next_call": "2027-01-03",
          "last_note": null,
          "topics": "FeatureRequest|Pricing"
        },
        {
          "account_id": "001am00002A9g0RAAR",
          "sentiment": "Very Negative",
          "deal_risk": 59.6,
          "next_call": null,
          "last_note": "2026-11-02",
          "topics": "Pricing"
        },
        {
          "account_id": "001am00002AYONUAA5",
          "sentiment": "Negative",
          "deal_risk": 56.44,
          "next_call": null,
          "last_note": "2026-11-08",
          "topics": "Competitor|FeatureRequest|Renewal"
        },
        {
          "account_id": "001am00002A9flYAAR",
          "sentiment": "Negative",
          "deal_risk": 55.14,
          "next_call": "2026-11-20",
          "last_note": "2026-09-10",
          "topics": "FeatureRequest|Pricing"
        },
        {
          "account_id": "001am00002A9fbqAAB",
          "sentiment": "Negative",
          "deal_risk": 45.89,
          "next_call": null,
          "last_note": null,
          "topics": "FeatureRequest"
        },
        {
          "account_id": "001am00002AYObrAAH",
          "sentiment": "Negative",
          "deal_risk": 38.19,
          "next_call": "2026-11-24",
          "last_note": "2026-10-26",
          "topics": "Competitor|FeatureRequest"
        },
        {
          "account_id": "001am00002AYOidAAH",
          "sentiment": "Negative",
          "deal_risk": 37.95,
          "next_call": "2026-12-25",
          "last_note": "2026-10-26",
          "topics": "FeatureRequest|Pricing"
        }
      ]
    },
    "transactionSignals_callSentimentWeeklySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "transactionSignals_callSentimentWeeklySql",
      "query": "\n  SELECT profile_week__c AS week, COUNT(DISTINCT account_id__c) AS n\n  FROM BT_Gong_Call_Sentiment__dlm\n  WHERE overall_sentiment__c IN ('Negative', 'Very Negative')\n    AND sentiment_trend__c = 'Declining'\n    AND profile_week__c >= (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm) - INTERVAL '49' DAY\n    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  GROUP BY profile_week__c\n  ORDER BY profile_week__c\n",
      "limit": 100,
      "returnedRows": 8,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_2833f55d-1f89-4706-8c5b-0a39262544b4",
      "rows": [
        {
          "week": "2026-09-21",
          "n": 21
        },
        {
          "week": "2026-09-28",
          "n": 20
        },
        {
          "week": "2026-10-05",
          "n": 26
        },
        {
          "week": "2026-10-12",
          "n": 24
        },
        {
          "week": "2026-10-19",
          "n": 14
        },
        {
          "week": "2026-10-26",
          "n": 29
        },
        {
          "week": "2026-11-02",
          "n": 19
        },
        {
          "week": "2026-11-09",
          "n": 10
        }
      ]
    },
    "transactionSignals_amlChangeSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "transactionSignals_amlChangeSql",
      "query": "\n  SELECT c.account_id__c AS account_id, c.overall_risk_rating__c AS risk_rating,\n         p.overall_risk_rating__c AS prev_rating, c.pep_hit__c AS pep, c.sanctions_hit__c AS sanctions,\n         c.adverse_media_hit__c AS adverse_media, c.adverse_media_categories__c AS am_cats,\n         c.case_reference__c AS case_ref, c.risk_jurisdiction_code__c AS jur, c.profile_date__c AS screened\n  FROM BT_WorldCheck_AML__dlm c\n  LEFT JOIN BT_WorldCheck_AML__dlm p ON p.account_id__c = c.account_id__c\n    AND p.profile_date__c = (SELECT MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm\n                             WHERE profile_date__c < (SELECT MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm))\n  WHERE c.profile_date__c = (SELECT MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm)\n    AND (   (c.change_since_last_run__c = 'New' AND c.overall_risk_rating__c IN ('High', 'Severe'))\n         OR (c.change_since_last_run__c = 'Changed'\n             AND (   (c.overall_risk_rating__c = 'Severe' AND COALESCE(p.overall_risk_rating__c, '') <> 'Severe')\n                  OR (c.overall_risk_rating__c = 'High' AND COALESCE(p.overall_risk_rating__c, '') NOT IN ('High', 'Severe'))\n                  OR (c.overall_risk_rating__c = 'Medium' AND COALESCE(p.overall_risk_rating__c, 'Low') = 'Low'))))\n    AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ORDER BY CASE WHEN c.overall_risk_rating__c = 'Severe' THEN 4 WHEN c.overall_risk_rating__c = 'High' THEN 3 ELSE 2 END DESC\n  LIMIT 8\n",
      "limit": 8,
      "returnedRows": 8,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_8d242917-8253-4c54-aa57-71e90848826c",
      "rows": [
        {
          "account_id": "001am00002AA8IlAAL",
          "risk_rating": "High",
          "prev_rating": "Low",
          "pep": false,
          "sanctions": true,
          "adverse_media": false,
          "am_cats": null,
          "case_ref": "WC-2026-66504",
          "jur": "US",
          "screened": "2026-11-13"
        },
        {
          "account_id": "001am00002AYONHAA5",
          "risk_rating": "High",
          "prev_rating": "Low",
          "pep": false,
          "sanctions": true,
          "adverse_media": false,
          "am_cats": null,
          "case_ref": "WC-2026-86535",
          "jur": "US",
          "screened": "2026-11-13"
        },
        {
          "account_id": "001am00002AA8CJAA1",
          "risk_rating": "High",
          "prev_rating": "Low",
          "pep": false,
          "sanctions": true,
          "adverse_media": false,
          "am_cats": null,
          "case_ref": "WC-2026-32533",
          "jur": "US",
          "screened": "2026-11-13"
        },
        {
          "account_id": "001am00002AYOF0AAP",
          "risk_rating": "High",
          "prev_rating": "Low",
          "pep": false,
          "sanctions": true,
          "adverse_media": false,
          "am_cats": null,
          "case_ref": "WC-2026-98468",
          "jur": "US",
          "screened": "2026-11-13"
        },
        {
          "account_id": "001am00002A9fhGAAR",
          "risk_rating": "High",
          "prev_rating": "Low",
          "pep": false,
          "sanctions": true,
          "adverse_media": false,
          "am_cats": null,
          "case_ref": "WC-2026-56037",
          "jur": "US",
          "screened": "2026-11-13"
        },
        {
          "account_id": "001am00002AYAL8AAP",
          "risk_rating": "High",
          "prev_rating": "Low",
          "pep": false,
          "sanctions": true,
          "adverse_media": false,
          "am_cats": null,
          "case_ref": "WC-2026-91987",
          "jur": "US",
          "screened": "2026-11-13"
        },
        {
          "account_id": "001am00002AA8MqAAL",
          "risk_rating": "High",
          "prev_rating": "Low",
          "pep": false,
          "sanctions": true,
          "adverse_media": false,
          "am_cats": null,
          "case_ref": "WC-2026-42579",
          "jur": "US",
          "screened": "2026-11-13"
        },
        {
          "account_id": "001am00002A9fBdAAJ",
          "risk_rating": "High",
          "prev_rating": "Medium",
          "pep": false,
          "sanctions": true,
          "adverse_media": false,
          "am_cats": null,
          "case_ref": "WC-2026-78244",
          "jur": "VN",
          "screened": "2026-11-13"
        }
      ]
    },
    "relationshipGraph_warmIntroSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "relationshipGraph_warmIntroSql",
      "query": "\n  SELECT dst_id, dst_name, dst_owned, src_id, conf, discovered FROM (\n    SELECT g.dst_account_id__c AS dst_id, d.ssot__Name__c AS dst_name,\n           CASE WHEN d.ssot__OwnerId__c IS NULL THEN 0 ELSE 1 END AS dst_owned,\n           g.src_account_id__c AS src_id, g.confidence_pct__c AS conf, g.edge_discovered_date__c AS discovered,\n           ROW_NUMBER() OVER (PARTITION BY g.dst_account_id__c ORDER BY g.confidence_pct__c DESC) AS rn\n    FROM BT_Synth_Relationship_Graph__dlm g\n    JOIN ssot__Account__dlm d ON d.ssot__Id__c = g.dst_account_id__c\n    WHERE g.edge_type__c = 'REFERRAL'\n      AND g.edge_discovered_date__c >= (SELECT MAX(edge_discovered_date__c) FROM BT_Synth_Relationship_Graph__dlm\n                                        WHERE edge_type__c = 'REFERRAL') - INTERVAL '60' DAY\n      AND g.src_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n      AND g.dst_account_id__c NOT IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ) x\n  WHERE rn = 1\n  ORDER BY conf DESC, discovered DESC\n  LIMIT 6\n",
      "limit": 6,
      "returnedRows": 6,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_da79c03c-3510-47ac-b75f-624788df4a84",
      "rows": [
        {
          "dst_id": "001am00002AA9thAAD",
          "dst_name": "Anthony R Garcia",
          "dst_owned": 1,
          "src_id": "001am00002A9feqAAB",
          "conf": 94.64,
          "discovered": "2026-11-05"
        },
        {
          "dst_id": "001am00002AA9JWAA1",
          "dst_name": "Matthew P Stein",
          "dst_owned": 1,
          "src_id": "001am00002A9fDRAAZ",
          "conf": 94.11,
          "discovered": "2026-10-10"
        },
        {
          "dst_id": "001am00002A9iqwAAB",
          "dst_name": "Anna C Wood",
          "dst_owned": 1,
          "src_id": "001am00002AYOa6AAH",
          "conf": 93.53,
          "discovered": "2026-10-17"
        },
        {
          "dst_id": "001am00002AA9TXAA1",
          "dst_name": "John K Villarreal",
          "dst_owned": 1,
          "src_id": "001am00002A9fgMAAR",
          "conf": 93.2,
          "discovered": "2026-10-01"
        },
        {
          "dst_id": "001am00002AAA5yAAH",
          "dst_name": "Ronald W Mendoza",
          "dst_owned": 1,
          "src_id": "001am00002AA86IAAT",
          "conf": 93.11,
          "discovered": "2026-10-31"
        },
        {
          "dst_id": "001am00002AA9YGAA1",
          "dst_name": "Derek L Craig",
          "dst_owned": 1,
          "src_id": "001am00002A9fafAAB",
          "conf": 92.42,
          "discovered": "2026-10-02"
        }
      ]
    },
    "campaignTouches_campaignTouchSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "campaignTouches_campaignTouchSql",
      "query": "\n  SELECT account_id, campaign, product, clicks, opens, last_at FROM (\n    SELECT x.*, ROW_NUMBER() OVER (PARTITION BY campaign ORDER BY clicks DESC, last_at DESC) AS pn FROM (\n      SELECT m.account_id__c AS account_id, m.campaign_name__c AS campaign, m.product_name__c AS product,\n             SUM(CASE WHEN m.engagement_type__c = 'Clicked' THEN 1 ELSE 0 END) AS clicks,\n             SUM(CASE WHEN m.engagement_type__c = 'Opened' THEN 1 ELSE 0 END) AS opens,\n             MAX(m.engagement_at__c) AS last_at,\n             ROW_NUMBER() OVER (PARTITION BY m.account_id__c ORDER BY SUM(CASE WHEN m.engagement_type__c = 'Clicked' THEN 1 ELSE 0 END) DESC, MAX(m.engagement_at__c) DESC) AS rn\n      FROM Marketing_Engagements__dlm m\n      WHERE m.engagement_type__c IN ('Opened', 'Clicked')\n        AND m.personal_business__c = 'Personal'\n        AND m.engagement_at__c >= (SELECT MAX(engagement_at__c) FROM Marketing_Engagements__dlm\n                                   WHERE engagement_type__c = 'Clicked' AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')) - INTERVAL '30' DAY\n        AND m.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n        AND m.account_id__c NOT IN (SELECT account_id__c FROM Marketing_Engagements__dlm\n                                    WHERE engagement_type__c = 'Unsubscribed' AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0'))\n      GROUP BY m.account_id__c, m.campaign_name__c, m.product_name__c\n    ) x\n    WHERE rn = 1 AND clicks > 0\n  ) z\n  ORDER BY pn, clicks DESC, last_at DESC\n  LIMIT 8\n",
      "limit": 8,
      "returnedRows": 0,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_69717015-f52c-41c0-97dc-019ab49d1820",
      "rows": []
    },
    "kpiTrend_netFlowSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "kpiTrend_netFlowSql",
      "query": "\n  SELECT CAST(CAST(DATE_TRUNC('week', transactiondate__c) AS DATE) AS VARCHAR) AS week,\n         SUM(CASE WHEN transaction_type__c = 'Credit' THEN amount__c ELSE 0 END) AS credits,\n         SUM(CASE WHEN transaction_type__c = 'Debit' THEN amount__c ELSE 0 END) AS debits,\n         COUNT(*) AS txns, COUNT(DISTINCT accountid__c) AS accts\n  FROM Financial_Transactions_BT_Snow__dll\n  WHERE transactiondate__c >= CURRENT_DATE - INTERVAL '70' DAY\n    AND transactiondate__c < DATE_TRUNC('week', CURRENT_DATE)\n    AND account_type__c = 'Personal'\n    AND sfaccountid__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  GROUP BY 1\n  ORDER BY 1\n",
      "limit": 400,
      "returnedRows": 10,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_2cbd5593-c45f-40d3-bfca-16a1d361f4b3",
      "rows": [
        {
          "week": "2026-08-31",
          "credits": 250,
          "debits": 1725.27,
          "txns": 26,
          "accts": 9
        },
        {
          "week": "2026-09-07",
          "credits": 5532.49,
          "debits": 3330.79,
          "txns": 51,
          "accts": 10
        },
        {
          "week": "2026-09-14",
          "credits": 135583.38,
          "debits": 14486.87,
          "txns": 73,
          "accts": 23
        },
        {
          "week": "2026-09-21",
          "credits": 2000,
          "debits": 2677.72,
          "txns": 36,
          "accts": 9
        },
        {
          "week": "2026-09-28",
          "credits": 77515.74,
          "debits": 28046.6,
          "txns": 62,
          "accts": 18
        },
        {
          "week": "2026-10-05",
          "credits": 11091.23,
          "debits": 4032.91,
          "txns": 56,
          "accts": 11
        },
        {
          "week": "2026-10-12",
          "credits": 32836.5,
          "debits": 2815.74,
          "txns": 54,
          "accts": 9
        },
        {
          "week": "2026-10-19",
          "credits": 9277.97,
          "debits": 3383.34,
          "txns": 46,
          "accts": 11
        },
        {
          "week": "2026-10-26",
          "credits": 44286.14,
          "debits": 2293.29,
          "txns": 48,
          "accts": 15
        },
        {
          "week": "2026-11-02",
          "credits": 10021.65,
          "debits": 4226.44,
          "txns": 57,
          "accts": 12
        }
      ]
    },
    "whitespace_offersSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "whitespace_offersSql",
      "query": "\n  SELECT t.acct AS acct, t.tot AS tot, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,\n         b.conversion_probability__c AS conv, b.expected_value_uplift__c AS ev,\n         b.recommended_channels__c AS channels, b.em_probability__c AS em_p, b.cc_probability__c AS cc_p\n  FROM (\n    SELECT account_id__c AS acct, SUM(expected_value_uplift__c) AS tot\n    FROM BT_Offer_Eligibility__dlm\n    WHERE action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')\n      AND recommended_action_rank__c IS NOT NULL AND expected_value_uplift__c > 0\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n    GROUP BY account_id__c\n    ORDER BY tot DESC\n    LIMIT 12\n  ) t\n  JOIN BT_Offer_Eligibility__dlm b ON b.account_id__c = t.acct\n  WHERE b.action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')\n  ORDER BY t.tot DESC",
      "limit": 400,
      "returnedRows": 28,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_f65297a4-ab6f-4670-8191-53e3fdc0f14b",
      "rows": [
        {
          "acct": "001am000026ZtgIAAS",
          "tot": 1323.72,
          "code": "MTG-JMB",
          "action_rank": null,
          "conv": 9.57,
          "ev": 338,
          "channels": "EM,CC",
          "em_p": 7.77,
          "cc_p": 5.63
        },
        {
          "acct": "001am000026ZtgIAAS",
          "tot": 1323.72,
          "code": "IRA-ROL",
          "action_rank": null,
          "conv": 33.47,
          "ev": 240.08,
          "channels": "EM,CC",
          "em_p": 27.16,
          "cc_p": 19.7
        },
        {
          "acct": "001am000026ZtgIAAS",
          "tot": 1323.72,
          "code": "HEL-ACQ",
          "action_rank": null,
          "conv": 12.97,
          "ev": 126.83,
          "channels": "EM,CC",
          "em_p": 10.53,
          "cc_p": 7.63
        },
        {
          "acct": "001am000026ZtgIAAS",
          "tot": 1323.72,
          "code": "WM-CASH",
          "action_rank": null,
          "conv": 17.44,
          "ev": 76.32,
          "channels": "EM,CC",
          "em_p": 14.15,
          "cc_p": 10.26
        },
        {
          "acct": "001am000026ZtgIAAS",
          "tot": 1323.72,
          "code": "PCHK-ACQ",
          "action_rank": null,
          "conv": 13.24,
          "ev": 44.88,
          "channels": "EM,CC",
          "em_p": 10.74,
          "cc_p": 7.79
        },
        {
          "acct": "001am000026ZtgIAAS",
          "tot": 1323.72,
          "code": "IRA-RTH",
          "action_rank": 4,
          "conv": 10.28,
          "ev": 10.29,
          "channels": "EM,CC",
          "em_p": 8.34,
          "cc_p": 6.05
        },
        {
          "acct": "001am000026ZtgIAAS",
          "tot": 1323.72,
          "code": "WM-MAS",
          "action_rank": 2,
          "conv": 23.36,
          "ev": 1313.43,
          "channels": "EM,CC",
          "em_p": 18.96,
          "cc_p": 13.75
        },
        {
          "acct": "001am00000qvjsAAAQ",
          "tot": 1313.63,
          "code": "PCHK-ACQ",
          "action_rank": 5,
          "conv": 14.71,
          "ev": 56.83,
          "channels": "EM,CC",
          "em_p": 10.02,
          "cc_p": 10.57
        },
        {
          "acct": "001am00000qvjsAAAQ",
          "tot": 1313.63,
          "code": "IRA-ROL",
          "action_rank": null,
          "conv": 41.17,
          "ev": 309.76,
          "channels": "EM,CC",
          "em_p": 28.06,
          "cc_p": 29.58
        },
        {
          "acct": "001am00000qvjsAAAQ",
          "tot": 1313.63,
          "code": "MTG-JMB",
          "action_rank": null,
          "conv": 8.29,
          "ev": 120,
          "channels": "EM,CC",
          "em_p": 5.65,
          "cc_p": 5.96
        },
        {
          "acct": "001am00000qvjsAAAQ",
          "tot": 1313.63,
          "code": "WM-CASH",
          "action_rank": null,
          "conv": 20.3,
          "ev": 104.76,
          "channels": "EM,CC",
          "em_p": 13.83,
          "cc_p": 14.59
        },
        {
          "acct": "001am00000qvjsAAAQ",
          "tot": 1313.63,
          "code": "WM-MAS",
          "action_rank": null,
          "conv": 21.05,
          "ev": 510.49,
          "channels": "EM,CC",
          "em_p": 14.34,
          "cc_p": 15.13
        },
        {
          "acct": "001am00000qvjsAAAQ",
          "tot": 1313.63,
          "code": "HEL-ACQ",
          "action_rank": 1,
          "conv": 18.67,
          "ev": 1256.8,
          "channels": "EM,CC",
          "em_p": 12.72,
          "cc_p": 13.42
        },
        {
          "acct": "001am000026ZtgNAAS",
          "tot": 768.59,
          "code": "IRA-ROL",
          "action_rank": 1,
          "conv": 36.15,
          "ev": 768.59,
          "channels": "EM,CC",
          "em_p": 31,
          "cc_p": 19.61
        },
        {
          "acct": "001am000026ZtgNAAS",
          "tot": 768.59,
          "code": "MTG-JMB",
          "action_rank": null,
          "conv": 9.39,
          "ev": 233.5,
          "channels": "EM,CC",
          "em_p": 8.05,
          "cc_p": 5.09
        },
        {
          "acct": "001am000026ZtgNAAS",
          "tot": 768.59,
          "code": "WM-CASH",
          "action_rank": null,
          "conv": 16.54,
          "ev": 81.06,
          "channels": "EM,CC",
          "em_p": 14.18,
          "cc_p": 8.97
        },
        {
          "acct": "001am000026ZtgNAAS",
          "tot": 768.59,
          "code": "HEL-ACQ",
          "action_rank": null,
          "conv": 11.11,
          "ev": 69.69,
          "channels": "EM,CC",
          "em_p": 9.53,
          "cc_p": 6.03
        },
        {
          "acct": "001am000026ZtgJAAS",
          "tot": 665.41,
          "code": "IRA-ROL",
          "action_rank": null,
          "conv": 30.24,
          "ev": 208.16,
          "channels": "EM,CC",
          "em_p": 24.58,
          "cc_p": 17.75
        },
        {
          "acct": "001am000026ZtgJAAS",
          "tot": 665.41,
          "code": "MTG-JMB",
          "action_rank": null,
          "conv": 7.84,
          "ev": 172,
          "channels": "EM,CC",
          "em_p": 6.37,
          "cc_p": 4.6
        },
        {
          "acct": "001am000026ZtgJAAS",
          "tot": 665.41,
          "code": "IRA-RTH",
          "action_rank": 1,
          "conv": 23.36,
          "ev": 665.41,
          "channels": "EM,CC",
          "em_p": 18.99,
          "cc_p": 13.71
        },
        {
          "acct": "001am000026ZtgJAAS",
          "tot": 665.41,
          "code": "HEL-ACQ",
          "action_rank": null,
          "conv": 12.39,
          "ev": 62.16,
          "channels": "EM,CC",
          "em_p": 10.07,
          "cc_p": 7.27
        },
        {
          "acct": "001am000026ZtgKAAS",
          "tot": 16.23,
          "code": "IRA-RTH",
          "action_rank": 1,
          "conv": 14.54,
          "ev": 16.23,
          "channels": "EM,CC",
          "em_p": 11.87,
          "cc_p": 8.48
        },
        {
          "acct": "001am000026ZtgKAAS",
          "tot": 16.23,
          "code": "IRA-ROL",
          "action_rank": null,
          "conv": 33.93,
          "ev": 248.88,
          "channels": "EM,CC",
          "em_p": 27.71,
          "cc_p": 19.8
        },
        {
          "acct": "001am000026ZtgKAAS",
          "tot": 16.23,
          "code": "MTG-JMB",
          "action_rank": null,
          "conv": 8.49,
          "ev": 150.5,
          "channels": "EM,CC",
          "em_p": 6.93,
          "cc_p": 4.95
        },
        {
          "acct": "001am000026ZtgKAAS",
          "tot": 16.23,
          "code": "HEL-ACQ",
          "action_rank": null,
          "conv": 10.79,
          "ev": 41.6,
          "channels": "EM,CC",
          "em_p": 8.81,
          "cc_p": 6.3
        },
        {
          "acct": "001am000026ZtgMAAS",
          "tot": 13.68,
          "code": "HEL-ACQ",
          "action_rank": null,
          "conv": 14.05,
          "ev": 102.94,
          "channels": "EM,CC",
          "em_p": 11.5,
          "cc_p": 8.17
        },
        {
          "acct": "001am000026ZtgMAAS",
          "tot": 13.68,
          "code": "MTG-JMB",
          "action_rank": null,
          "conv": 18.41,
          "ev": 669,
          "channels": "EM,CC",
          "em_p": 15.07,
          "cc_p": 10.71
        },
        {
          "acct": "001am000026ZtgMAAS",
          "tot": 13.68,
          "code": "IRA-RTH",
          "action_rank": 1,
          "conv": 13.59,
          "ev": 13.68,
          "channels": "EM,CC",
          "em_p": 11.12,
          "cc_p": 7.9
        }
      ]
    },
    "whitespace_rising": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "whitespace_rising",
      "query": "\n  SELECT h.acct AS acct, h.code AS code, h.conv AS conv, h.ev AS ev, h.action_rank AS action_rank,\n         h.channels AS channels, h.em_p AS em_p, h.cc_p AS cc_p, h.moved AS moved, h.ev_moved AS ev_moved,\n         h.first_mo AS first_mo, CAST(h.mo AS VARCHAR) AS mo\n  FROM (\n    SELECT account_id__c AS acct, action_code__c AS code, start_date__c AS mo,\n           conversion_probability__c AS conv, expected_value_uplift__c AS ev,\n           recommended_action_rank__c AS action_rank, recommended_channels__c AS channels,\n           em_probability__c AS em_p, cc_probability__c AS cc_p,\n           conversion_probability__c - FIRST_VALUE(conversion_probability__c)\n             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS moved,\n           expected_value_uplift__c - FIRST_VALUE(expected_value_uplift__c)\n             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS ev_moved,\n           CAST(FIRST_VALUE(start_date__c)\n             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS VARCHAR) AS first_mo\n    FROM BT_Offer_Eligibility_History__dlm\n    WHERE start_date__c >= (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm) - INTERVAL '6' MONTH\n      AND action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ) h\n  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)\n    AND h.action_rank IS NOT NULL AND h.ev > 0\n    AND (h.moved >= 2 OR h.ev_moved >= 250)\n  ORDER BY h.ev_moved DESC\n  LIMIT 50",
      "limit": 50,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_db038e90-5873-41db-bd6d-7ab543b0ffff",
      "rows": [
        {
          "acct": "001am00000qvjsAAAQ",
          "code": "HEL-ACQ",
          "conv": 18.67,
          "ev": 1256.8,
          "action_rank": 1,
          "channels": "EM,CC",
          "em_p": 12.72,
          "cc_p": 13.42,
          "moved": -0.17,
          "ev_moved": 581.21,
          "first_mo": "2026-05-01",
          "mo": "2026-11-01"
        }
      ]
    },
    "whitespace_falling": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "whitespace_falling",
      "query": "\n  SELECT h.acct AS acct, h.code AS code, h.conv AS conv, h.ev AS ev, h.action_rank AS action_rank,\n         h.channels AS channels, h.em_p AS em_p, h.cc_p AS cc_p, h.moved AS moved, h.ev_moved AS ev_moved,\n         h.first_mo AS first_mo, CAST(h.mo AS VARCHAR) AS mo\n  FROM (\n    SELECT account_id__c AS acct, action_code__c AS code, start_date__c AS mo,\n           conversion_probability__c AS conv, expected_value_uplift__c AS ev,\n           recommended_action_rank__c AS action_rank, recommended_channels__c AS channels,\n           em_probability__c AS em_p, cc_probability__c AS cc_p,\n           conversion_probability__c - FIRST_VALUE(conversion_probability__c)\n             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS moved,\n           expected_value_uplift__c - FIRST_VALUE(expected_value_uplift__c)\n             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS ev_moved,\n           CAST(FIRST_VALUE(start_date__c)\n             OVER (PARTITION BY account_id__c, action_code__c ORDER BY start_date__c) AS VARCHAR) AS first_mo\n    FROM BT_Offer_Eligibility_History__dlm\n    WHERE start_date__c >= (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm) - INTERVAL '6' MONTH\n      AND action_code__c IN ('PCHK-ACQ', 'WM-CASH', 'WM-MAS', 'IRA-RTH', 'IRA-ROL', 'MTG-JMB', 'HEL-ACQ')\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ) h\n  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)\n    AND h.action_rank IS NOT NULL AND h.ev > 0\n    AND (h.moved <= -2 OR h.ev_moved <= -250)\n  ORDER BY h.ev_moved ASC\n  LIMIT 50",
      "limit": 50,
      "returnedRows": 0,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_34cdb5a4-a601-4224-9513-9aba962c1bc7",
      "rows": []
    },
    "home_heldAwaySql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "home_heldAwaySql",
      "query": "\n  SELECT account_id, balance, institution, acct_type, net_flow, holdings FROM (\n    SELECT account_id__c AS account_id,\n           SUM(balance_usd__c) OVER (PARTITION BY account_id__c) AS balance,\n           SUM(monthly_net_flow_usd__c) OVER (PARTITION BY account_id__c) AS net_flow,\n           COUNT(*) OVER (PARTITION BY account_id__c) AS holdings,\n           institution_name__c AS institution, account_type__c AS acct_type,\n           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn\n    FROM BT_Plaid_Held_Away__dlm\n    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)\n      AND is_active__c = true AND balance_usd__c > 0\n      AND institution_type__c IN ('Brokerage', 'Robo-Advisor')\n      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n  ) t\n  WHERE rn = 1\n  ORDER BY balance DESC\n  LIMIT 8\n",
      "limit": 8,
      "returnedRows": 5,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_08074cfc-52a2-4668-b4b3-39b476425b84",
      "rows": [
        {
          "account_id": "001am000026ZtgIAAS",
          "balance": 783763.29,
          "institution": "Charles Schwab",
          "acct_type": "Brokerage",
          "net_flow": -157.47,
          "holdings": 1
        },
        {
          "account_id": "001am000026ZtgLAAS",
          "balance": 704128.8,
          "institution": "Fidelity",
          "acct_type": "Brokerage",
          "net_flow": -444.85,
          "holdings": 1
        },
        {
          "account_id": "001am000026ZtgJAAS",
          "balance": 397401.28,
          "institution": "Vanguard",
          "acct_type": "IRA",
          "net_flow": -199.17,
          "holdings": 1
        },
        {
          "account_id": "001am000026ZtgNAAS",
          "balance": 308817.61,
          "institution": "Robinhood",
          "acct_type": "401k",
          "net_flow": -146.61,
          "holdings": 1
        },
        {
          "account_id": "001am000026ZtgKAAS",
          "balance": 34795.48,
          "institution": "Wealthfront",
          "acct_type": "Managed Portfolio",
          "net_flow": 2384.02,
          "holdings": 1
        }
      ]
    },
    "home_heldAwayTotalSql": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "home_heldAwayTotalSql",
      "query": "\n  SELECT COUNT(DISTINCT account_id__c) AS clients, SUM(balance_usd__c) AS balance\n  FROM BT_Plaid_Held_Away__dlm\n  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)\n    AND is_active__c = true AND balance_usd__c > 0\n    AND institution_type__c IN ('Brokerage', 'Robo-Advisor')\n    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbCLAA0')\n",
      "limit": 400,
      "returnedRows": 1,
      "queryId": "MTAuNzguOS4xMTA6NzQ4NA_5711d1a3-6236-4ede-ab6d-5f143b734ffb",
      "rows": [
        {
          "clients": 5,
          "balance": 2228906.46
        }
      ]
    },
    "crm_financialAccounts": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "CRM financialAccounts",
      "query": "SELECT Id,Name,FinServ__PrimaryOwner__c,FinServ__Balance__c,FinServ__FinancialAccountType__c,FinServ__Status__c FROM FinServ__FinancialAccount__c WHERE FinServ__PrimaryOwner__r.OwnerId='005am000003PbCLAA0' ORDER BY FinServ__Balance__c DESC LIMIT 201",
      "rows": [
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MrAAI"
          },
          "Id": "a7kam00000349MrAAI",
          "Name": "Morris Family Mortgage",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": null,
          "FinServ__FinancialAccountType__c": null,
          "FinServ__Status__c": null
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDuAAN"
          },
          "Id": "a7kam00000UiQDuAAN",
          "Name": "Okafor Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
          "FinServ__Balance__c": 8500000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDzAAN"
          },
          "Id": "a7kam00000UiQDzAAN",
          "Name": "Brandt Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
          "FinServ__Balance__c": 6800000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDqAAN"
          },
          "Id": "a7kam00000UiQDqAAN",
          "Name": "Vogel Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
          "FinServ__Balance__c": 5400000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCQAA3"
          },
          "Id": "a7kam00000UiLCQAA3",
          "Name": "Rodriguez Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZtgJAAS",
          "FinServ__Balance__c": 5200000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCZAA3"
          },
          "Id": "a7kam00000UiLCZAA3",
          "Name": "Nakamura Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZtgLAAS",
          "FinServ__Balance__c": 3800000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLChAAN"
          },
          "Id": "a7kam00000UiLChAAN",
          "Name": "Venkatesh Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
          "FinServ__Balance__c": 3200000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDvAAN"
          },
          "Id": "a7kam00000UiQDvAAN",
          "Name": "Okafor Brokerage",
          "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
          "FinServ__Balance__c": 3200000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDlAAN"
          },
          "Id": "a7kam00000UiQDlAAN",
          "Name": "Patel Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
          "FinServ__Balance__c": 2800000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQE0AAN"
          },
          "Id": "a7kam00000UiQE0AAN",
          "Name": "Brandt Brokerage",
          "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
          "FinServ__Balance__c": 2600000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCUAA3"
          },
          "Id": "a7kam00000UiLCUAA3",
          "Name": "Patel Managed Advisory PA",
          "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
          "FinServ__Balance__c": 2400000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCdAAN"
          },
          "Id": "a7kam00000UiLCdAAN",
          "Name": "Brooks Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZtgMAAS",
          "FinServ__Balance__c": 2200000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDrAAN"
          },
          "Id": "a7kam00000UiQDrAAN",
          "Name": "Vogel Brokerage",
          "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
          "FinServ__Balance__c": 2100000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCRAA3"
          },
          "Id": "a7kam00000UiLCRAA3",
          "Name": "Rodriguez Brokerage",
          "FinServ__PrimaryOwner__c": "001am000026ZtgJAAS",
          "FinServ__Balance__c": 2100000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDsAAN"
          },
          "Id": "a7kam00000UiQDsAAN",
          "Name": "Vogel Family Revocable Trust",
          "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
          "FinServ__Balance__c": 1800000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MzAAI"
          },
          "Id": "a7kam00000349MzAAI",
          "Name": "401k-MORRIS Corporate-eTrade",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 1650000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCaAAN"
          },
          "Id": "a7kam00000UiLCaAAN",
          "Name": "Nakamura Brokerage",
          "FinServ__PrimaryOwner__c": "001am000026ZtgLAAS",
          "FinServ__Balance__c": 1500000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQE1AAN"
          },
          "Id": "a7kam00000UiQE1AAN",
          "Name": "Brandt Irrevocable Trust",
          "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
          "FinServ__Balance__c": 1500000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCiAAN"
          },
          "Id": "a7kam00000UiLCiAAN",
          "Name": "Venkatesh Brokerage",
          "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
          "FinServ__Balance__c": 1300000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MfAAI"
          },
          "Id": "a7kam00000349MfAAI",
          "Name": "Business Savings Account",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 1300000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MxAAI"
          },
          "Id": "a7kam00000349MxAAI",
          "Name": "ROTH IRA-MORRIS",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 1150000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDhAAN"
          },
          "Id": "a7kam00000UiQDhAAN",
          "Name": "Rodriguez Traditional IRA",
          "FinServ__PrimaryOwner__c": "001am000026ZhLmAAK",
          "FinServ__Balance__c": 1100000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCTAA3"
          },
          "Id": "a7kam00000UiLCTAA3",
          "Name": "Rodriguez High-Yield Savings",
          "FinServ__PrimaryOwner__c": "001am000026ZtgJAAS",
          "FinServ__Balance__c": 1090000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCYAA3"
          },
          "Id": "a7kam00000UiLCYAA3",
          "Name": "Patel Money Market",
          "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
          "FinServ__Balance__c": 1000000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCeAAN"
          },
          "Id": "a7kam00000UiLCeAAN",
          "Name": "Brooks Traditional IRA",
          "FinServ__PrimaryOwner__c": "001am000026ZtgMAAS",
          "FinServ__Balance__c": 850000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwTAAT"
          },
          "Id": "a7kam00000YUpwTAAT",
          "Name": "Cumulus Business Checking - 1340",
          "FinServ__PrimaryOwner__c": "001am00002Ce0l5AAB",
          "FinServ__Balance__c": 796304.1,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MeAAI"
          },
          "Id": "a7kam00000349MeAAI",
          "Name": "30 yr Fixed Mortgage",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 780000,
          "FinServ__FinancialAccountType__c": null,
          "FinServ__Status__c": null
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDwAAN"
          },
          "Id": "a7kam00000UiQDwAAN",
          "Name": "Okafor Roth IRA",
          "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
          "FinServ__Balance__c": 750000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCcAAN"
          },
          "Id": "a7kam00000UiLCcAAN",
          "Name": "Nakamura Roth IRA",
          "FinServ__PrimaryOwner__c": "001am000026ZtgLAAS",
          "FinServ__Balance__c": 680000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCgAAN"
          },
          "Id": "a7kam00000UiLCgAAN",
          "Name": "Brooks High-Yield Savings",
          "FinServ__PrimaryOwner__c": "001am000026ZtgMAAS",
          "FinServ__Balance__c": 600000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCXAA3"
          },
          "Id": "a7kam00000UiLCXAA3",
          "Name": "Patel High-Yield Savings PA",
          "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
          "FinServ__Balance__c": 520000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCjAAN"
          },
          "Id": "a7kam00000UiLCjAAN",
          "Name": "Venkatesh Roth IRA",
          "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
          "FinServ__Balance__c": 450000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDjAAN"
          },
          "Id": "a7kam00000UiQDjAAN",
          "Name": "Rodriguez High-Yield Savings",
          "FinServ__PrimaryOwner__c": "001am000026ZhLmAAK",
          "FinServ__Balance__c": 420000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwVAAT"
          },
          "Id": "a7kam00000YUpwVAAT",
          "Name": "Cumulus Business Checking - 8860",
          "FinServ__PrimaryOwner__c": "001am00002Ce0l6AAB",
          "FinServ__Balance__c": 390929.63,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwSAAT"
          },
          "Id": "a7kam00000YUpwSAAT",
          "Name": "Cumulus Business Term Loan - 1483",
          "FinServ__PrimaryOwner__c": "001am00002Ce0l1AAB",
          "FinServ__Balance__c": 389509.26,
          "FinServ__FinancialAccountType__c": "Loans",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwRAAT"
          },
          "Id": "a7kam00000YUpwRAAT",
          "Name": "Cumulus Business Checking - 6719",
          "FinServ__PrimaryOwner__c": "001am00002Ce0l1AAB",
          "FinServ__Balance__c": 367875.15,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDiAAN"
          },
          "Id": "a7kam00000UiQDiAAN",
          "Name": "Rodriguez 60-Month CD",
          "FinServ__PrimaryOwner__c": "001am000026ZhLmAAK",
          "FinServ__Balance__c": 350000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDoAAN"
          },
          "Id": "a7kam00000UiQDoAAN",
          "Name": "Patel High-Yield Savings",
          "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
          "FinServ__Balance__c": 320000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCSAA3"
          },
          "Id": "a7kam00000UiLCSAA3",
          "Name": "Rodriguez Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZtgJAAS",
          "FinServ__Balance__c": 310000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDxAAN"
          },
          "Id": "a7kam00000UiQDxAAN",
          "Name": "Okafor Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
          "FinServ__Balance__c": 280000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUp6nAAD"
          },
          "Id": "a7kam00000YUp6nAAD",
          "Name": "Cumulus Business Term Loan - 3987",
          "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
          "FinServ__Balance__c": 239878.79,
          "FinServ__FinancialAccountType__c": "Loans",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDkAAN"
          },
          "Id": "a7kam00000UiQDkAAN",
          "Name": "Rodriguez Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZhLmAAK",
          "FinServ__Balance__c": 230000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCkAAN"
          },
          "Id": "a7kam00000UiLCkAAN",
          "Name": "Venkatesh Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
          "FinServ__Balance__c": 220000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUp6mAAD"
          },
          "Id": "a7kam00000YUp6mAAD",
          "Name": "Cumulus Business Checking - 4765",
          "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
          "FinServ__Balance__c": 211921.14,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQE2AAN"
          },
          "Id": "a7kam00000UiQE2AAN",
          "Name": "Brandt Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
          "FinServ__Balance__c": 210000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCVAA3"
          },
          "Id": "a7kam00000UiLCVAA3",
          "Name": "Patel 529 Education Plan PA",
          "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
          "FinServ__Balance__c": 195000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwUAAT"
          },
          "Id": "a7kam00000YUpwUAAT",
          "Name": "Cumulus Business Term Loan - 9270",
          "FinServ__PrimaryOwner__c": "001am00002Ce0l5AAB",
          "FinServ__Balance__c": 194401.47,
          "FinServ__FinancialAccountType__c": "Loans",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDtAAN"
          },
          "Id": "a7kam00000UiQDtAAN",
          "Name": "Vogel Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
          "FinServ__Balance__c": 180000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDmAAN"
          },
          "Id": "a7kam00000UiQDmAAN",
          "Name": "Patel 529 Education Plan",
          "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
          "FinServ__Balance__c": 180000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCfAAN"
          },
          "Id": "a7kam00000UiLCfAAN",
          "Name": "Brooks Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZtgMAAS",
          "FinServ__Balance__c": 150000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCbAAN"
          },
          "Id": "a7kam00000UiLCbAAN",
          "Name": "Nakamura Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZtgLAAS",
          "FinServ__Balance__c": 120000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUp6oAAD"
          },
          "Id": "a7kam00000YUp6oAAD",
          "Name": "Cumulus Business Checking - 4550",
          "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
          "FinServ__Balance__c": 97018.74,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDnAAN"
          },
          "Id": "a7kam00000UiQDnAAN",
          "Name": "Patel Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
          "FinServ__Balance__c": 95000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCWAA3"
          },
          "Id": "a7kam00000UiLCWAA3",
          "Name": "Patel Premier Checking PA",
          "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
          "FinServ__Balance__c": 85000,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MbAAI"
          },
          "Id": "a7kam00000349MbAAI",
          "Name": "529-MORRIS-eTrade Education Plan",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 84000,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MgAAI"
          },
          "Id": "a7kam00000349MgAAI",
          "Name": "High Yield Savings Account",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 75000,
          "FinServ__FinancialAccountType__c": null,
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000XikYoAAJ"
          },
          "Id": "a7kam00000XikYoAAJ",
          "Name": "Money Market Account",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 45750.25,
          "FinServ__FinancialAccountType__c": "Money Market",
          "FinServ__Status__c": null
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQE3AAN"
          },
          "Id": "a7kam00000UiQE3AAN",
          "Name": "Brandt Travel Points Card",
          "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
          "FinServ__Balance__c": 12500,
          "FinServ__FinancialAccountType__c": "Credit Cards",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000XikvNAAR"
          },
          "Id": "a7kam00000XikvNAAR",
          "Name": "Emergency Savings Account",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 12000,
          "FinServ__FinancialAccountType__c": "Savings",
          "FinServ__Status__c": null
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDyAAN"
          },
          "Id": "a7kam00000UiQDyAAN",
          "Name": "Okafor Cash Rewards Card",
          "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
          "FinServ__Balance__c": 8700,
          "FinServ__FinancialAccountType__c": "Credit Cards",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MwAAI"
          },
          "Id": "a7kam00000349MwAAI",
          "Name": "Julie Morris Debit Card",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 7796.18,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Lost"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MdAAI"
          },
          "Id": "a7kam00000349MdAAI",
          "Name": "Stratus Checking",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 7534,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUqAzAAL"
          },
          "Id": "a7kam00000YUqAzAAL",
          "Name": "Cumulus Corporate Card - 8972",
          "FinServ__PrimaryOwner__c": "001am00002Ce0l5AAB",
          "FinServ__Balance__c": 6872.11,
          "FinServ__FinancialAccountType__c": "Treasury Management",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MlAAI"
          },
          "Id": "a7kam00000349MlAAI",
          "Name": "Classic Savings Account",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 5600.48,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MhAAI"
          },
          "Id": "a7kam00000349MhAAI",
          "Name": "Julie Morris Platinum Visa Card",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 4587,
          "FinServ__FinancialAccountType__c": "Credit Cards",
          "FinServ__Status__c": "Lost"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDpAAN"
          },
          "Id": "a7kam00000UiQDpAAN",
          "Name": "Patel Travel Points Card",
          "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
          "FinServ__Balance__c": 4200,
          "FinServ__FinancialAccountType__c": "Credit Cards",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLClAAN"
          },
          "Id": "a7kam00000UiLClAAN",
          "Name": "Venkatesh Cash Rewards Card",
          "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
          "FinServ__Balance__c": 3800,
          "FinServ__FinancialAccountType__c": "Credit Cards",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000XiktlAAB"
          },
          "Id": "a7kam00000XiktlAAB",
          "Name": "Cumulus Premier Checking",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 3745.8,
          "FinServ__FinancialAccountType__c": "Checking",
          "FinServ__Status__c": null
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUqAyAAL"
          },
          "Id": "a7kam00000YUqAyAAL",
          "Name": "Cumulus Corporate Card - 6006",
          "FinServ__PrimaryOwner__c": "001am00002Ce0l1AAB",
          "FinServ__Balance__c": 3649.76,
          "FinServ__FinancialAccountType__c": "Treasury Management",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam000005zZvdAAE"
          },
          "Id": "a7kam000005zZvdAAE",
          "Name": "Everyday Checking Acct",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 1849.5,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MaAAI"
          },
          "Id": "a7kam00000349MaAAI",
          "Name": "Everyday Checking Account",
          "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
          "FinServ__Balance__c": 1589.37,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Open"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCMAA3"
          },
          "Id": "a7kam00000UiLCMAA3",
          "Name": "D. Chen Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZtgIAAS",
          "FinServ__Balance__c": 0,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Closed"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCNAA3"
          },
          "Id": "a7kam00000UiLCNAA3",
          "Name": "D. Chen Brokerage",
          "FinServ__PrimaryOwner__c": "001am000026ZtgIAAS",
          "FinServ__Balance__c": 0,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Closed"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCOAA3"
          },
          "Id": "a7kam00000UiLCOAA3",
          "Name": "D. Chen Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZtgIAAS",
          "FinServ__Balance__c": 0,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Closed"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCPAA3"
          },
          "Id": "a7kam00000UiLCPAA3",
          "Name": "D. Chen Revocable Trust",
          "FinServ__PrimaryOwner__c": "001am000026ZtgIAAS",
          "FinServ__Balance__c": 0,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Closed"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDdAAN"
          },
          "Id": "a7kam00000UiQDdAAN",
          "Name": "Chen Managed Advisory",
          "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
          "FinServ__Balance__c": 0,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Closed"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDeAAN"
          },
          "Id": "a7kam00000UiQDeAAN",
          "Name": "Chen Brokerage",
          "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
          "FinServ__Balance__c": 0,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Closed"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDfAAN"
          },
          "Id": "a7kam00000UiQDfAAN",
          "Name": "Chen Premier Checking",
          "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
          "FinServ__Balance__c": 0,
          "FinServ__FinancialAccountType__c": "Deposits",
          "FinServ__Status__c": "Closed"
        },
        {
          "attributes": {
            "type": "FinServ__FinancialAccount__c",
            "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDgAAN"
          },
          "Id": "a7kam00000UiQDgAAN",
          "Name": "Chen Family Revocable Trust",
          "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
          "FinServ__Balance__c": 0,
          "FinServ__FinancialAccountType__c": "Investments",
          "FinServ__Status__c": "Closed"
        }
      ],
      "limit": 201,
      "returnedRows": 79
    },
    "crm_goals": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "CRM goals",
      "query": "SELECT Id,Name,Type,Status,Priority,Description,TargetDate,TargetAmount,ActualAmount,FinancialPlanId,FinancialPlan.AccountId FROM FinancialGoal WHERE FinancialPlan.AccountId IN ('001am00000qvjsAAAQ','001am000026ZtgKAAS') LIMIT 50",
      "rows": [
        {
          "attributes": {
            "type": "FinancialGoal",
            "url": "/services/data/v67.0/sobjects/FinancialGoal/13Ram000000AQCfEAO"
          },
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
            "attributes": {
              "type": "FinancialPlan",
              "url": "/services/data/v67.0/sobjects/FinancialPlan/13Qam000000KniwEAC"
            },
            "AccountId": "001am00000qvjsAAAQ"
          }
        },
        {
          "attributes": {
            "type": "FinancialGoal",
            "url": "/services/data/v67.0/sobjects/FinancialGoal/13Ram000000AQCZEA4"
          },
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
            "attributes": {
              "type": "FinancialPlan",
              "url": "/services/data/v67.0/sobjects/FinancialPlan/13Qam000000KnixEAC"
            },
            "AccountId": "001am00000qvjsAAAQ"
          }
        },
        {
          "attributes": {
            "type": "FinancialGoal",
            "url": "/services/data/v67.0/sobjects/FinancialGoal/13Ram000000AQCaEAO"
          },
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
            "attributes": {
              "type": "FinancialPlan",
              "url": "/services/data/v67.0/sobjects/FinancialPlan/13Qam000000KnixEAC"
            },
            "AccountId": "001am00000qvjsAAAQ"
          }
        },
        {
          "attributes": {
            "type": "FinancialGoal",
            "url": "/services/data/v67.0/sobjects/FinancialGoal/13Ram000000AQCbEAO"
          },
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
            "attributes": {
              "type": "FinancialPlan",
              "url": "/services/data/v67.0/sobjects/FinancialPlan/13Qam000000KnixEAC"
            },
            "AccountId": "001am00000qvjsAAAQ"
          }
        }
      ],
      "limit": 50,
      "returnedRows": 4
    },
    "crm_leads": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "CRM leads",
      "query": "SELECT Id,FirstName,LastName,Name,Company,Status,LeadSource,Email,AnnualRevenue,OwnerId FROM Lead WHERE OwnerId='005am000003PbCLAA0' AND IsConverted=false LIMIT 30",
      "rows": [
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueBEAQ"
          },
          "Id": "00Qam000009wueBEAQ",
          "FirstName": "Daragh",
          "LastName": "Dennehy",
          "Name": "Daragh Dennehy",
          "Company": null,
          "Status": "New",
          "LeadSource": null,
          "Email": "ddennehy@salesforce.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueCEAQ"
          },
          "Id": "00Qam000009wueCEAQ",
          "FirstName": "Mellissa",
          "LastName": "Lavender",
          "Name": "Mellissa Lavender",
          "Company": "Peabody Coal Co",
          "Status": "Unqualified",
          "LeadSource": "Social Media",
          "Email": "mlavender@example.com",
          "AnnualRevenue": 54000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueDEAQ"
          },
          "Id": "00Qam000009wueDEAQ",
          "FirstName": "Dan",
          "LastName": "Hawes",
          "Name": "Dan Hawes",
          "Company": "Brenntag Pacific",
          "Status": "New",
          "LeadSource": "Marketing Event",
          "Email": "dhawes@example.com",
          "AnnualRevenue": 56000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueIEAQ"
          },
          "Id": "00Qam000009wueIEAQ",
          "FirstName": "Adrian",
          "LastName": "Newsom",
          "Name": "Adrian Newsom",
          "Company": "Jtl Group",
          "Status": "Working",
          "LeadSource": "Social Media",
          "Email": "anewsom@example.com",
          "AnnualRevenue": 97000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueJEAQ"
          },
          "Id": "00Qam000009wueJEAQ",
          "FirstName": "Megan",
          "LastName": "Salyer",
          "Name": "Megan Salyer",
          "Company": "Neville Homes",
          "Status": "New",
          "LeadSource": "Marketing Event",
          "Email": "msalyer@example.com",
          "AnnualRevenue": 7000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueKEAQ"
          },
          "Id": "00Qam000009wueKEAQ",
          "FirstName": "Sarah",
          "LastName": "Vickery",
          "Name": "Sarah Vickery",
          "Company": "Plum Creek Timber Co",
          "Status": "Working",
          "LeadSource": "Website",
          "Email": "svickery@example.com",
          "AnnualRevenue": 43000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueLEAQ"
          },
          "Id": "00Qam000009wueLEAQ",
          "FirstName": "Todd",
          "LastName": "Shock",
          "Name": "Todd Shock",
          "Company": "L7",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "tshock@example.com",
          "AnnualRevenue": 39000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueOEAQ"
          },
          "Id": "00Qam000009wueOEAQ",
          "FirstName": "Roman",
          "LastName": "Tindall",
          "Name": "Roman Tindall",
          "Company": "TT Systems",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "rtindall@example.com",
          "AnnualRevenue": 24000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueQEAQ"
          },
          "Id": "00Qam000009wueQEAQ",
          "FirstName": "Jeremie",
          "LastName": "Alonso",
          "Name": "Jeremie Alonso",
          "Company": "Clarity Corporation",
          "Status": "New",
          "LeadSource": "Social Media",
          "Email": "jalonso@example.com",
          "AnnualRevenue": 48000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueREAQ"
          },
          "Id": "00Qam000009wueREAQ",
          "FirstName": "Smith",
          "LastName": "Jack",
          "Name": "Smith Jack",
          "Company": "Smith Co",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "sjack@example.com",
          "AnnualRevenue": 45000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueTEAQ"
          },
          "Id": "00Qam000009wueTEAQ",
          "FirstName": "Lauren",
          "LastName": "Reynolds",
          "Name": "Lauren Reynolds",
          "Company": "Gutmann, Bauch and Gutmann",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "lreynolds@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueUEAQ"
          },
          "Id": "00Qam000009wueUEAQ",
          "FirstName": "A",
          "LastName": "Blitzer",
          "Name": "A Blitzer",
          "Company": "Torp-Price",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "ablitzer@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueVEAQ"
          },
          "Id": "00Qam000009wueVEAQ",
          "FirstName": "Frank",
          "LastName": "Caster",
          "Name": "Frank Caster",
          "Company": "Hackett and Sons",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "fcaster@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueWEAQ"
          },
          "Id": "00Qam000009wueWEAQ",
          "FirstName": "Rudy",
          "LastName": "Lehner",
          "Name": "Rudy Lehner",
          "Company": "Schoen-Davis",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "rudy.lehner@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueXEAQ"
          },
          "Id": "00Qam000009wueXEAQ",
          "FirstName": "Bruce",
          "LastName": "Watkins",
          "Name": "Bruce Watkins",
          "Company": "Cormier Inc",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "brucewatkins@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueYEAQ"
          },
          "Id": "00Qam000009wueYEAQ",
          "FirstName": "Adam",
          "LastName": "Blitzer",
          "Name": "Adam Blitzer",
          "Company": "Kerluke Group",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "ablizter@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueZEAQ"
          },
          "Id": "00Qam000009wueZEAQ",
          "FirstName": "Kenna",
          "LastName": "West",
          "Name": "Kenna West",
          "Company": "Kovacek Group",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "kenna.west@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueaEAA"
          },
          "Id": "00Qam000009wueaEAA",
          "FirstName": "Joanna",
          "LastName": "Ball",
          "Name": "Joanna Ball",
          "Company": "Considine, Goldner and Maggio",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "joanna.ball@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuebEAA"
          },
          "Id": "00Qam000009wuebEAA",
          "FirstName": "Dan",
          "LastName": "Milbrath",
          "Name": "Dan Milbrath",
          "Company": "Lakin-Carter",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "dmilbrath@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuecEAA"
          },
          "Id": "00Qam000009wuecEAA",
          "FirstName": "Keith",
          "LastName": "Lopez",
          "Name": "Keith Lopez",
          "Company": "Schimmel Inc",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "lizsmyth@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueoEAA"
          },
          "Id": "00Qam000009wueoEAA",
          "FirstName": "Margarita",
          "LastName": "Hanes",
          "Name": "Margarita Hanes",
          "Company": "Beppo Restaurant",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "mhanes@example.com",
          "AnnualRevenue": 91000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueqEAA"
          },
          "Id": "00Qam000009wueqEAA",
          "FirstName": "Kirstin",
          "LastName": "Woolum",
          "Name": "Kirstin Woolum",
          "Company": "ScanSnap, Inc.",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "kwoolum@example.com",
          "AnnualRevenue": 5000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuerEAA"
          },
          "Id": "00Qam000009wuerEAA",
          "FirstName": "Patrick",
          "LastName": "Ridout",
          "Name": "Patrick Ridout",
          "Company": "BMI, Inc.",
          "Status": "New",
          "LeadSource": "Social Media",
          "Email": "pridout@example.com",
          "AnnualRevenue": 70000000,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuesEAA"
          },
          "Id": "00Qam000009wuesEAA",
          "FirstName": "Alejandrin",
          "LastName": "Bergnaum",
          "Name": "Alejandrin Bergnaum",
          "Company": "Crona Inc",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "alejandrin.bergnaum@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuetEAA"
          },
          "Id": "00Qam000009wuetEAA",
          "FirstName": "Nichole",
          "LastName": "Keeling",
          "Name": "Nichole Keeling",
          "Company": "Powlowski-Kris",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "nichole.keeling@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueuEAA"
          },
          "Id": "00Qam000009wueuEAA",
          "FirstName": "Anne",
          "LastName": "Frost",
          "Name": "Anne Frost",
          "Company": "Green-Jerde",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "afrost@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuevEAA"
          },
          "Id": "00Qam000009wuevEAA",
          "FirstName": "Eldora",
          "LastName": "Mraz",
          "Name": "Eldora Mraz",
          "Company": "Reichel, Bergstrom and Hoeger",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "eldora.mraz@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuewEAA"
          },
          "Id": "00Qam000009wuewEAA",
          "FirstName": "Sophia",
          "LastName": "Wiza",
          "Name": "Sophia Wiza",
          "Company": "D'Amore Ltd",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "sophia.wiza@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuexEAA"
          },
          "Id": "00Qam000009wuexEAA",
          "FirstName": "Quinn",
          "LastName": "Poirier",
          "Name": "Quinn Poirier",
          "Company": "Wolf LLC",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "qpoirier@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Lead",
            "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueyEAA"
          },
          "Id": "00Qam000009wueyEAA",
          "FirstName": "Robert",
          "LastName": "Weiss",
          "Name": "Robert Weiss",
          "Company": "Hessel-Klocko",
          "Status": "New",
          "LeadSource": "Website",
          "Email": "rweiss@example.com",
          "AnnualRevenue": null,
          "OwnerId": "005am000003PbCLAA0"
        }
      ],
      "limit": 30,
      "returnedRows": 30
    },
    "crm_opportunities": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "CRM opportunities",
      "query": "SELECT Id,Name,AccountId,Amount,StageName,IsClosed,IsWon,CloseDate,LeadSource,OwnerId FROM Opportunity WHERE OwnerId='005am000003PbCLAA0' ORDER BY Amount DESC LIMIT 201",
      "rows": [
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy6AAF"
          },
          "Id": "006am00000LcOy6AAF",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjtXAAQ",
          "Amount": 5257150000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyXAAV"
          },
          "Id": "006am00000LcOyXAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjttAAA",
          "Amount": 4470741000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyZAAV"
          },
          "Id": "006am00000LcOyZAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvju6AAA",
          "Amount": 3416803000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyMAAV"
          },
          "Id": "006am00000LcOyMAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjtuAAA",
          "Amount": 2008102000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyYAAV"
          },
          "Id": "006am00000LcOyYAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvju2AAA",
          "Amount": 1697721000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-31",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyHAAV"
          },
          "Id": "006am00000LcOyHAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsXAAQ",
          "Amount": 1112076000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy8AAF"
          },
          "Id": "006am00000LcOy8AAF",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjswAAA",
          "Amount": 141234000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZbFAAX"
          },
          "Id": "006am00000KJZbFAAX",
          "Name": "IDO House Account - Cumulus Syndicated Loan",
          "AccountId": "001am00000qvjtuAAA",
          "Amount": 94824697,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": "Partner",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyFAAV"
          },
          "Id": "006am00000LcOyFAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsTAAQ",
          "Amount": 89774000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyRAAV"
          },
          "Id": "006am00000LcOyRAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjspAAA",
          "Amount": 85370000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy5AAF"
          },
          "Id": "006am00000LcOy5AAF",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjtqAAA",
          "Amount": 84666000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyPAAV"
          },
          "Id": "006am00000LcOyPAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjslAAA",
          "Amount": 73950000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy7AAF"
          },
          "Id": "006am00000LcOy7AAF",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsaAAA",
          "Amount": 56906000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZPxAAP"
          },
          "Id": "006am00000KJZPxAAP",
          "Name": "Bennett Household - Cumulus Commercial Real Estate",
          "AccountId": "001am00000qvjtkAAA",
          "Amount": 46632341,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-30",
          "LeadSource": "Partner",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyaAAF"
          },
          "Id": "006am00000LcOyaAAF",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjuBAAQ",
          "Amount": 43770000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyJAAV"
          },
          "Id": "006am00000LcOyJAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsZAAQ",
          "Amount": 36244000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyNAAV"
          },
          "Id": "006am00000LcOyNAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsfAAA",
          "Amount": 29742000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyCAAV"
          },
          "Id": "006am00000LcOyCAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsOAAQ",
          "Amount": 20446000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyOAAV"
          },
          "Id": "006am00000LcOyOAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjshAAA",
          "Amount": 19765000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJIP8AAP"
          },
          "Id": "006am00000KJIP8AAP",
          "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Business Analyzed Checking - New Business - $16.6M",
          "AccountId": "001am00000qvjttAAA",
          "Amount": 16574839,
          "StageName": "Prospecting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy9AAF"
          },
          "Id": "006am00000LcOy9AAF",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjs5AAA",
          "Amount": 14975000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOySAAV"
          },
          "Id": "006am00000LcOySAAV",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjsqAAA",
          "Amount": 13734000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-31",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyDAAV"
          },
          "Id": "006am00000LcOyDAAV",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjsPAAQ",
          "Amount": 10591000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyEAAV"
          },
          "Id": "006am00000LcOyEAAV",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjsQAAQ",
          "Amount": 10520000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJKfTAAX"
          },
          "Id": "006am00000KJKfTAAX",
          "Name": "United Technologies Corporation - Cumulus Business Analyzed Checking - New Business - $10.3M",
          "AccountId": "001am00000qvjtyAAA",
          "Amount": 10320119,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOybAAF"
          },
          "Id": "006am00000LcOybAAF",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjuIAAQ",
          "Amount": 9729000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyWAAV"
          },
          "Id": "006am00000LcOyWAAV",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjtsAAA",
          "Amount": 8234000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ijAAC"
          },
          "Id": "006am000005W2ijAAC",
          "Name": "Harry Gray - Cumulus Business Fundamentals Checking - New Business - $8.0M",
          "AccountId": "001am00000qvjsHAAQ",
          "Amount": 8000000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJP43AAH"
          },
          "Id": "006am00000KJP43AAH",
          "Name": "Morris Family Trust - Cumulus Commercial Real Estate",
          "AccountId": "001am00000qvju4AAA",
          "Amount": 7926800,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-30",
          "LeadSource": "Partner",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZOLAA5"
          },
          "Id": "006am00000KJZOLAA5",
          "Name": "CirrusCloud - Cumulus Commercial Real Estate",
          "AccountId": "001am00000qvjtaAAA",
          "Amount": 7880018,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": "Partner",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2icAAC"
          },
          "Id": "006am000005W2icAAC",
          "Name": "Will Johnson - Cumulus Business Fundamentals Checking - New Business - $6.0M",
          "AccountId": "001am00000qvjsIAAQ",
          "Amount": 6000000,
          "StageName": "Preparation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZY1AAP"
          },
          "Id": "006am00000KJZY1AAP",
          "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Business Term Loan",
          "AccountId": "001am00000qvjtrAAA",
          "Amount": 4343200,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJPopAAH"
          },
          "Id": "006am00000KJPopAAH",
          "Name": "Lazard Middle Market LLC - Cumulus Commercial Real Estate",
          "AccountId": "001am00000qvjtYAAQ",
          "Amount": 4185200,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-05",
          "LeadSource": "Partner",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZMjAAP"
          },
          "Id": "006am00000KJZMjAAP",
          "Name": "Lazard Middle Market LLC - Cumulus Business Term Loan",
          "AccountId": "001am00000qvjtYAAQ",
          "Amount": 4090500,
          "StageName": "Prospecting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOr9AAH"
          },
          "Id": "006am00000KJOr9AAH",
          "Name": "CCAnonymous - Cumulus Business Term Loan",
          "AccountId": "001am00000qvjtVAAQ",
          "Amount": 3843300,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j8AAC"
          },
          "Id": "006am000005W2j8AAC",
          "Name": "Wellspring, Inc. - Cumulus Equipment Loan - Add-On Business - $3.5M",
          "AccountId": "001am00000qvjswAAA",
          "Amount": 3518000,
          "StageName": "Underwriting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOycAAF"
          },
          "Id": "006am00000LcOycAAF",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjuJAAQ",
          "Amount": 3399000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXb5AAH"
          },
          "Id": "006am00000KJXb5AAH",
          "Name": "Blake Real Estate Holdings - Cumulus Business Term Loan",
          "AccountId": "001am00000qvjuKAAQ",
          "Amount": 3374700,
          "StageName": "Closed Lost",
          "IsClosed": true,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJO4lAAH"
          },
          "Id": "006am00000KJO4lAAH",
          "Name": "United Technologies Corporation - Cumulus Wire Transfers - New Business - $3.1M",
          "AccountId": "001am00000qvjtyAAA",
          "Amount": 3051783,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jYAAS"
          },
          "Id": "006am000005W2jYAAS",
          "Name": "AJC Corporation - Cumulus Commercial Real Estate",
          "AccountId": "001am00000qvjsuAAA",
          "Amount": 3000000,
          "StageName": "Closing/Funding",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXuPAAX"
          },
          "Id": "006am00000KJXuPAAX",
          "Name": "Kari Rende - Cumulus Statement Savings - New Business - $2.9M",
          "AccountId": "001am00000qvjtCAAQ",
          "Amount": 2907400,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZWPAA5"
          },
          "Id": "006am00000KJZWPAA5",
          "Name": "Sample Account for Entitlements - Cumulus Equipment Loan",
          "AccountId": "001am00000qvjtpAAA",
          "Amount": 2871323,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyBAAV"
          },
          "Id": "006am00000LcOyBAAV",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjsNAAQ",
          "Amount": 2780000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJY45AAH"
          },
          "Id": "006am00000KJY45AAH",
          "Name": "Jon Allegri - Cumulus Everyday Checking - New Business - $2.7M",
          "AccountId": "001am00000qvjtDAAQ",
          "Amount": 2684700,
          "StageName": "Closed Lost",
          "IsClosed": true,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJWVKAA5"
          },
          "Id": "006am00000KJWVKAA5",
          "Name": "United Technologies Corporation - Cumulus Equipment Loan",
          "AccountId": "001am00000qvjtyAAA",
          "Amount": 2509805,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jEAAS"
          },
          "Id": "006am000005W2jEAAS",
          "Name": "Southern Solutions - Cumulus Positive Pay - New Business - $2.1M",
          "AccountId": "001am00000qvjsUAAQ",
          "Amount": 2100000,
          "StageName": "KYC / AML",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYX8AAP"
          },
          "Id": "006am00000KJYX8AAP",
          "Name": "Bennett Household - Cumulus Corporate Card",
          "AccountId": "001am00000qvjtkAAA",
          "Amount": 2085702,
          "StageName": "Closed Lost",
          "IsClosed": true,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iiAAC"
          },
          "Id": "006am000005W2iiAAC",
          "Name": "AJC Corporation - Cumulus Positive Pay",
          "AccountId": "001am00000qvjsuAAA",
          "Amount": 2000000,
          "StageName": "Proposed/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRtrAAH"
          },
          "Id": "006am00000KJRtrAAH",
          "Name": "Andy Peterson - Cumulus Managed Advisory",
          "AccountId": "001am00000qvjtSAAQ",
          "Amount": 1866900,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZplAAH"
          },
          "Id": "006am00000KJZplAAH",
          "Name": "Adena Commercial, LLC - Cumulus Business Fundamentals Checking - New Business - $1.8M",
          "AccountId": "001am00000qvju5AAA",
          "Amount": 1778300,
          "StageName": "Closed Lost",
          "IsClosed": true,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyVAAV"
          },
          "Id": "006am00000LcOyVAAV",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjtjAAA",
          "Amount": 1734000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyKAAV"
          },
          "Id": "006am00000LcOyKAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsbAAA",
          "Amount": 1717000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZxpAAH"
          },
          "Id": "006am00000KJZxpAAH",
          "Name": "Simon Says Legal - Cumulus Business Fundamentals Checking - New Business - $1.6M",
          "AccountId": "001am00000qvjuGAAQ",
          "Amount": 1644300,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJLQjAAP"
          },
          "Id": "006am00000KJLQjAAP",
          "Name": "CirrusCloud - Cumulus Equipment Loan",
          "AccountId": "001am00000qvjtaAAA",
          "Amount": 1363457,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXmMAAX"
          },
          "Id": "006am00000KJXmMAAX",
          "Name": "Mike Welch - Cumulus Managed Advisory",
          "AccountId": "001am00000qvjtNAAQ",
          "Amount": 1346000,
          "StageName": "Closed Lost",
          "IsClosed": true,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJMe3AAH"
          },
          "Id": "006am00000KJMe3AAH",
          "Name": "Duncan Macintosh - Cumulus Everyday Checking - New Business - $1.3M",
          "AccountId": "001am00000qvjt2AAA",
          "Amount": 1293300,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-06",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJQbDAAX"
          },
          "Id": "006am00000KJQbDAAX",
          "Name": "Frederick Simon - Cumulus Business Term Loan - New Business - $1.2M",
          "AccountId": "001am00000qvjthAAA",
          "Amount": 1238000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOHfAAP"
          },
          "Id": "006am00000KJOHfAAP",
          "Name": "Steve Sutherland - Cumulus Managed Advisory",
          "AccountId": "001am00000qvjtHAAQ",
          "Amount": 1233600,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYiPAAX"
          },
          "Id": "006am00000KJYiPAAX",
          "Name": "Mina Passini - Cumulus Everyday Checking - New Business - $1.2M",
          "AccountId": "001am00000qvjtPAAQ",
          "Amount": 1217700,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZGHAA5"
          },
          "Id": "006am00000KJZGHAA5",
          "Name": "Momentum Design - Cumulus Commercial Real Estate",
          "AccountId": "001am00000qvjsvAAA",
          "Amount": 1098686,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Partner",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYbyAAH"
          },
          "Id": "006am00000KJYbyAAH",
          "Name": "Q-Branch Demo Testing (Integrated Onboarding) - Cumulus Business Fundamentals Checking - New Business - $1.1M",
          "AccountId": "001am00000qvjtmAAA",
          "Amount": 1085400,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-07",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jFAAS"
          },
          "Id": "006am000005W2jFAAS",
          "Name": "Universal Services - Cumulus Remote Deposit Capture - New Business - $1.0M",
          "AccountId": "001am00000qvjsZAAQ",
          "Amount": 1000000,
          "StageName": "Loan Origination",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000GJt1BAAT"
          },
          "Id": "006am00000GJt1BAAT",
          "Name": "Julie Morris - Cumulus Statement Savings - New Business - $850K",
          "AccountId": "001am00000qvjsAAAQ",
          "Amount": 850000,
          "StageName": "Interested",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRU2AAP"
          },
          "Id": "006am00000KJRU2AAP",
          "Name": "Anne Frost - Cumulus 30 Year Fixed Mortgage",
          "AccountId": "001am00000qvjtTAAQ",
          "Amount": 774700,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXOBAA5"
          },
          "Id": "006am00000KJXOBAA5",
          "Name": "Levin Insurance Agency - Cumulus Business Fundamentals Checking - New Business - $757K",
          "AccountId": "001am00000qvjuDAAQ",
          "Amount": 757000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZUnAAP"
          },
          "Id": "006am00000KJZUnAAP",
          "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Business Fundamentals Checking - New Business - $735K",
          "AccountId": "001am00000qvjtnAAA",
          "Amount": 735400,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-04",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZHtAAP"
          },
          "Id": "006am00000KJZHtAAP",
          "Name": "Momentum Design - Cumulus SBA Loan",
          "AccountId": "001am00000qvjsvAAA",
          "Amount": 725466,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-06",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ifAAC"
          },
          "Id": "006am000005W2ifAAC",
          "Name": "Julie Morris - Cumulus High-Yield Savings - New Business - $697K",
          "AccountId": "001am00000qvjsAAAQ",
          "Amount": 697000,
          "StageName": "Inerested",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYaLAAX"
          },
          "Id": "006am00000KJYaLAAX",
          "Name": "Mike Welch - Cumulus Everyday Checking - New Business - $646K",
          "AccountId": "001am00000qvjtNAAQ",
          "Amount": 646700,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJa2fAAD"
          },
          "Id": "006am00000KJa2fAAD",
          "Name": "The Blake Family Trust - Cumulus Business Term Loan",
          "AccountId": "001am00000qvjuJAAQ",
          "Amount": 590900,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJVcUAAX"
          },
          "Id": "006am00000KJVcUAAX",
          "Name": "Bennett Household - Cumulus Equipment Loan",
          "AccountId": "001am00000qvjtkAAA",
          "Amount": 524113,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJY5hAAH"
          },
          "Id": "006am00000KJY5hAAH",
          "Name": "Jon Allegri - Cumulus 30 Year Fixed Mortgage",
          "AccountId": "001am00000qvjtDAAQ",
          "Amount": 500300,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyAAAV"
          },
          "Id": "006am00000LcOyAAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsLAAQ",
          "Amount": 500000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jGAAS"
          },
          "Id": "006am000005W2jGAAS",
          "Name": "Advanced Communications - Cumulus Corporate Card - New Business - $500K",
          "AccountId": "001am00000qvjszAAA",
          "Amount": 500000,
          "StageName": "Approval",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-31",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2joAAC"
          },
          "Id": "006am000005W2joAAC",
          "Name": "Richard Bennett - Cumulus Everyday Checking - New Business - $500K",
          "AccountId": "001am00000qvjsBAAQ",
          "Amount": 500000,
          "StageName": "Underwriting Review",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZszAAH"
          },
          "Id": "006am00000KJZszAAH",
          "Name": "San Francisco School Board - Cumulus Business Fundamentals Checking - New Business - $496K",
          "AccountId": "001am00000qvjuEAAQ",
          "Amount": 496000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJWv8AAH"
          },
          "Id": "006am00000KJWv8AAH",
          "Name": "Windy City Non-Profit Board - Cumulus Business Fundamentals Checking - New Business - $472K",
          "AccountId": "001am00000qvjuFAAQ",
          "Amount": 472600,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyLAAV"
          },
          "Id": "006am00000LcOyLAAV",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjseAAA",
          "Amount": 429000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Kz8UzAAJ"
          },
          "Id": "006am00000Kz8UzAAJ",
          "Name": "Julie Morris - Cumulus 401k Rollover - New Business - $425K",
          "AccountId": "001am00000qvjsAAAQ",
          "Amount": 425000,
          "StageName": "Negotiation/Review",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4WCAAZ"
          },
          "Id": "006am00000Mm4WCAAZ",
          "Name": "SteelWorks Automation Suite",
          "AccountId": "001am00002Ce0l8AAB",
          "Amount": 420000,
          "StageName": "Closed Lost",
          "IsClosed": true,
          "IsWon": false,
          "CloseDate": "2026-02-28",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4WAAAZ"
          },
          "Id": "006am00000Mm4WAAAZ",
          "Name": "Green Energy Smart Grid",
          "AccountId": "001am00002Ce0l4AAB",
          "Amount": 380000,
          "StageName": "Negotiation/Review",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-10-31",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZo9AAH"
          },
          "Id": "006am00000KJZo9AAH",
          "Name": "Morris Family Trust - Cumulus Everyday Checking - New Business - $379K",
          "AccountId": "001am00000qvju4AAA",
          "Amount": 379400,
          "StageName": "Prospecting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-31",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyQAAV"
          },
          "Id": "006am00000LcOyQAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsmAAA",
          "Amount": 377000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJIP9AAP"
          },
          "Id": "006am00000KJIP9AAP",
          "Name": "Adena Commercial, LLC - Cumulus SBA Loan",
          "AccountId": "001am00000qvju5AAA",
          "Amount": 351600,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyIAAV"
          },
          "Id": "006am00000LcOyIAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjsYAAQ",
          "Amount": 351000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZjJAAX"
          },
          "Id": "006am00000KJZjJAAX",
          "Name": "Deloitte LLP - Cumulus Payment Processing",
          "AccountId": "001am00000qvju3AAA",
          "Amount": 338000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-05",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ibAAC"
          },
          "Id": "006am000005W2ibAAC",
          "Name": "Rachel Morris - Cumulus Statement Savings - Add-On Business - $300K",
          "AccountId": "001am00000qvjsCAAQ",
          "Amount": 300000,
          "StageName": "Underwriting Review",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Wally Slone",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJa13AAD"
          },
          "Id": "006am00000KJa13AAD",
          "Name": "Blake Household - Cumulus Corporate Card",
          "AccountId": "001am00000qvjuIAAQ",
          "Amount": 289200,
          "StageName": "Prospecting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOrBAAX"
          },
          "Id": "006am00000KJOrBAAX",
          "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Equipment Loan",
          "AccountId": "001am00000qvjtrAAA",
          "Amount": 280800,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyTAAV"
          },
          "Id": "006am00000LcOyTAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjstAAA",
          "Amount": 275000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJa4HAAT"
          },
          "Id": "006am00000KJa4HAAT",
          "Name": "Blake Real Estate Holdings - Cumulus ACH Origination",
          "AccountId": "001am00000qvjuKAAQ",
          "Amount": 267000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-05",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyUAAV"
          },
          "Id": "006am00000LcOyUAAV",
          "Name": "Innovation Pipeline",
          "AccountId": "001am00000qvjszAAA",
          "Amount": 264000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZcrAAH"
          },
          "Id": "006am00000KJZcrAAH",
          "Name": "United Semiconductor - Cumulus Payment Processing",
          "AccountId": "001am00000qvjtzAAA",
          "Amount": 257800,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZD3AAP"
          },
          "Id": "006am00000KJZD3AAP",
          "Name": "Summit Resellers - Cumulus Corporate Card",
          "AccountId": "001am00000qvjscAAA",
          "Amount": 254500,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iRAAS"
          },
          "Id": "006am000005W2iRAAS",
          "Name": "Acme Partners - Cumulus Sweep Account - New Business - $250K",
          "AccountId": "001am00000qvjs5AAA",
          "Amount": 250000,
          "StageName": "Initial Due Diligence",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4W6AAJ"
          },
          "Id": "006am00000Mm4W6AAJ",
          "Name": "Global Industries ERP Integration",
          "AccountId": "001am00002Ce0l0AAB",
          "Amount": 250000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-09-15",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOrAAAX"
          },
          "Id": "006am00000KJOrAAAX",
          "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus SBA Loan",
          "AccountId": "001am00000qvjtnAAA",
          "Amount": 235400,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j4AAC"
          },
          "Id": "006am000005W2j4AAC",
          "Name": "Salesforce.com, Inc. - Cumulus Business Analyzed Checking - New Business - $230K",
          "AccountId": "001am00000qvjtZAAQ",
          "Amount": 230000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-31",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXSzAAP"
          },
          "Id": "006am00000KJXSzAAP",
          "Name": "Heath Axworth - Cumulus 12Mo CD Renewal",
          "AccountId": "001am00000qvjt1AAA",
          "Amount": 224400,
          "StageName": "Prospecting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYAXAA5"
          },
          "Id": "006am00000KJYAXAA5",
          "Name": "Niki Sullivan - Cumulus HELOC",
          "AccountId": "001am00000qvjtEAAQ",
          "Amount": 216200,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZ6bAAH"
          },
          "Id": "006am00000KJZ6bAAH",
          "Name": "Christian Wolff - Cumulus 12Mo CD Renewal",
          "AccountId": "001am00000qvjtiAAA",
          "Amount": 215000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJPDuAAP"
          },
          "Id": "006am00000KJPDuAAP",
          "Name": "Stephen Blake - Cumulus HELOC",
          "AccountId": "001am00000qvjteAAA",
          "Amount": 212900,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-01",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJSwMAAX"
          },
          "Id": "006am00000KJSwMAAX",
          "Name": "Frederick Simon - Cumulus Business Fundamentals Checking - New Business - $212K",
          "AccountId": "001am00000qvjthAAA",
          "Amount": 212800,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-30",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXkjAAH"
          },
          "Id": "006am00000KJXkjAAH",
          "Name": "Mark Smith - Cumulus HELOC",
          "AccountId": "001am00000qvjt7AAA",
          "Amount": 206000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJN2EAAX"
          },
          "Id": "006am00000KJN2EAAX",
          "Name": "Heath Axworth - Cumulus HELOC",
          "AccountId": "001am00000qvjt1AAA",
          "Amount": 203600,
          "StageName": "Prospecting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXb3AAH"
          },
          "Id": "006am00000KJXb3AAH",
          "Name": "Gabe Hoskins - Cumulus 12Mo CD Renewal",
          "AccountId": "001am00000qvjt4AAA",
          "Amount": 200600,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZeTAAX"
          },
          "Id": "006am00000KJZeTAAX",
          "Name": "United Semiconductor - Cumulus SBA Loan",
          "AccountId": "001am00000qvjtzAAA",
          "Amount": 194900,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXj7AAH"
          },
          "Id": "006am00000KJXj7AAH",
          "Name": "Mark Smith - Cumulus 12Mo CD Renewal",
          "AccountId": "001am00000qvjt7AAA",
          "Amount": 194200,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYAYAA5"
          },
          "Id": "006am00000KJYAYAA5",
          "Name": "Sample Account for Entitlements - Cumulus Business Analyzed Checking - New Business - $178K",
          "AccountId": "001am00000qvjtpAAA",
          "Amount": 178945,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-02",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXUbAAP"
          },
          "Id": "006am00000KJXUbAAP",
          "Name": "Lance Gonzales - Cumulus HELOC",
          "AccountId": "001am00000qvjt3AAA",
          "Amount": 177600,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-07",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyGAAV"
          },
          "Id": "006am00000LcOyGAAV",
          "Name": "Revenue Diversification",
          "AccountId": "001am00000qvjsUAAQ",
          "Amount": 158000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4W7AAJ"
          },
          "Id": "006am00000Mm4W7AAJ",
          "Name": "Bright Horizon EMR System",
          "AccountId": "001am00002Ce0l1AAB",
          "Amount": 150000,
          "StageName": "Needs Analysis",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-31",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ieAAC"
          },
          "Id": "006am000005W2ieAAC",
          "Name": "Alex Cooper - Cumulus Everyday Checking - New Client - $150K",
          "AccountId": "001am00000qvjtbAAA",
          "Amount": 150000,
          "StageName": "Onboarding",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": "Marketing Event",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000GCsGMAA1"
          },
          "Id": "006am00000GCsGMAA1",
          "Name": "Julie Morris - Cumulus Personal Loan - New Business - $150K",
          "AccountId": "001am00000qvjsAAAQ",
          "Amount": 150000,
          "StageName": "Needs Analysis",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZubAAH"
          },
          "Id": "006am00000KJZubAAH",
          "Name": "San Francisco School Board - Cumulus Corporate Card",
          "AccountId": "001am00000qvjuEAAQ",
          "Amount": 147400,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-30",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYVVAA5"
          },
          "Id": "006am00000KJYVVAA5",
          "Name": "Tammy Baxter - Cumulus Everyday Checking",
          "AccountId": "001am00000qvjtLAAQ",
          "Amount": 136100,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJY7JAAX"
          },
          "Id": "006am00000KJY7JAAX",
          "Name": "Niki Sullivan - Cumulus 12Mo CD Renewal",
          "AccountId": "001am00000qvjtEAAQ",
          "Amount": 134300,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-31",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jUAAS"
          },
          "Id": "006am000005W2jUAAS",
          "Name": "Homeland Company - Cumulus Business Fundamentals Checking - Add-On Business - $130K",
          "AccountId": "001am00000qvjsfAAA",
          "Amount": 130000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-02",
          "LeadSource": "Marketing Event",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZzRAAX"
          },
          "Id": "006am00000KJZzRAAX",
          "Name": "Blake Household - Cumulus Payment Processing",
          "AccountId": "001am00000qvjuIAAQ",
          "Amount": 121600,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-02",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j3AAC"
          },
          "Id": "006am000005W2j3AAC",
          "Name": "Heroku, Inc. - Cumulus Business Analyzed Checking - New Business - $121K",
          "AccountId": "001am00000qvju0AAA",
          "Amount": 121000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-31",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jBAAS"
          },
          "Id": "006am000005W2jBAAS",
          "Name": "Associated Supply Co. - Cumulus Merchant Integration - Add-On Business - $121K",
          "AccountId": "001am00000qvjsbAAA",
          "Amount": 121000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4W9AAJ"
          },
          "Id": "006am00000Mm4W9AAJ",
          "Name": "Summit Financial Analytics",
          "AccountId": "001am00002Ce0l3AAB",
          "Amount": 120000,
          "StageName": "Proposal/Price Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-31",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iSAAS"
          },
          "Id": "006am000005W2iSAAS",
          "Name": "Permadyne GmbH, LTD - Cumulus Corporate Card - Add-On Business - $116K",
          "AccountId": "001am00000qvjslAAA",
          "Amount": 116000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-19",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJY8vAAH"
          },
          "Id": "006am00000KJY8vAAH",
          "Name": "Niki Sullivan - Cumulus Everyday Checking",
          "AccountId": "001am00000qvjtEAAQ",
          "Amount": 115500,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jMAAS"
          },
          "Id": "006am000005W2jMAAS",
          "Name": "Permadyne GmbH, LTD - Cumulus Business Term Loan - Add-On Business - $114K",
          "AccountId": "001am00000qvjslAAA",
          "Amount": 114000,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-10-24",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRU3AAP"
          },
          "Id": "006am00000KJRU3AAP",
          "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Corporate Card",
          "AccountId": "001am00000qvjtsAAA",
          "Amount": 112900,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jLAAS"
          },
          "Id": "006am000005W2jLAAS",
          "Name": "UlyssesNet - Cumulus Lockbox Services - Add-On Business - $112K",
          "AccountId": "001am00000qvjskAAA",
          "Amount": 112000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-10-17",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0NxAAK"
          },
          "Id": "006am000005W0NxAAK",
          "Name": "AJC Corporation - Cumulus Business Term Loan - Add-On Business - $111K",
          "AccountId": "001am00000qvjsuAAA",
          "Amount": 111000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-04",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jCAAS"
          },
          "Id": "006am000005W2jCAAS",
          "Name": "Goodman Imports - Cumulus Corporate Card - New Business - $110K",
          "AccountId": "001am00000qvjsqAAA",
          "Amount": 110000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iYAAS"
          },
          "Id": "006am000005W2iYAAS",
          "Name": "Assurity Corporation - Cumulus Business Analyzed Checking - New Business - $110K",
          "AccountId": "001am00000qvjtvAAA",
          "Amount": 110000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-10-02",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jXAAS"
          },
          "Id": "006am000005W2jXAAS",
          "Name": "Vand Enterprises, Inc. - Cumulus Corporate Card - Services - $109K",
          "AccountId": "001am00000qvjsyAAA",
          "Amount": 109999.42,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-10",
          "LeadSource": "Marketing Event",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jKAAS"
          },
          "Id": "006am000005W2jKAAS",
          "Name": "Missoula & Sons Inc. - Cumulus Payment Processing - New Business - $109K",
          "AccountId": "001am00000qvjsVAAQ",
          "Amount": 109000,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-10-17",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jVAAS"
          },
          "Id": "006am000005W2jVAAS",
          "Name": "Red Studio Designs - Cumulus Wire Transfers - Add-On Business - $108K",
          "AccountId": "001am00000qvjsNAAQ",
          "Amount": 108000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-02",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jTAAS"
          },
          "Id": "006am000005W2jTAAS",
          "Name": "Green Fields Media - Cumulus Wire Transfers - Add-On Business - $105K",
          "AccountId": "001am00000qvjs8AAA",
          "Amount": 105000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-02",
          "LeadSource": "Marketing Event",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iZAAS"
          },
          "Id": "006am000005W2iZAAS",
          "Name": "Charlie Ellis - Cumulus Personal Loan",
          "AccountId": "001am00000qvjsDAAQ",
          "Amount": 100000,
          "StageName": "Verification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j6AAC"
          },
          "Id": "006am000005W2j6AAC",
          "Name": "Rachel Morris - Cumulus Everyday Checking - New Business - $100K",
          "AccountId": "001am00000qvjsCAAQ",
          "Amount": 100000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-30",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iqAAC"
          },
          "Id": "006am000005W2iqAAC",
          "Name": "UlyssesNet - Cumulus ACH Services - Services - $100K",
          "AccountId": "001am00000qvjskAAA",
          "Amount": 100000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-11-16",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iLAAS"
          },
          "Id": "006am000005W2iLAAS",
          "Name": "Aims Social, Inc. - Cumulus Corporate Card - New Business - $99K",
          "AccountId": "001am00000qvjsPAAQ",
          "Amount": 99000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ihAAC"
          },
          "Id": "006am000005W2ihAAC",
          "Name": "Goldfinch Bicycles - Cumulus ACH Services",
          "AccountId": "001am00000qvjsEAAQ",
          "Amount": 98300,
          "StageName": "Prospecting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jRAAS"
          },
          "Id": "006am000005W2jRAAS",
          "Name": "Southern Solutions - Cumulus Business Analyzed Checking - Add-On Business - $98K",
          "AccountId": "001am00000qvjsUAAQ",
          "Amount": 98000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-02",
          "LeadSource": "Marketing Event",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ilAAC"
          },
          "Id": "006am000005W2ilAAC",
          "Name": "Julie Morris - Cumulus Auto Loan - New Business - $98K",
          "AccountId": "001am00000qvjsAAAQ",
          "Amount": 98000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jPAAS"
          },
          "Id": "006am000005W2jPAAS",
          "Name": "Homeland Company - Cumulus Payment Processing - Add-On Business - $96K",
          "AccountId": "001am00000qvjsfAAA",
          "Amount": 96000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-30",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXO9AAP"
          },
          "Id": "006am00000KJXO9AAP",
          "Name": "Jen Hartley - Cumulus HELOC",
          "AccountId": "001am00000qvjsJAAQ",
          "Amount": 94600,
          "StageName": "Closed Lost",
          "IsClosed": true,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJVuEAAX"
          },
          "Id": "006am00000KJVuEAAX",
          "Name": "United Semiconductor - Cumulus ACH Services",
          "AccountId": "001am00000qvjtzAAA",
          "Amount": 92600,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-31",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jIAAS"
          },
          "Id": "006am000005W2jIAAS",
          "Name": "Roseburg Products - Cumulus Corporate Card - Add-On Business - $90K",
          "AccountId": "001am00000qvjsrAAA",
          "Amount": 90000,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-10",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jSAAS"
          },
          "Id": "006am000005W2jSAAS",
          "Name": "Tech Labs - Cumulus Business Analyzed Checking - Add-On Business - $90K",
          "AccountId": "001am00000qvjsMAAQ",
          "Amount": 90000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-02",
          "LeadSource": "Marketing Event",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRKMAA5"
          },
          "Id": "006am00000KJRKMAA5",
          "Name": "Nicole Grace - Cumulus Everyday Checking",
          "AccountId": "001am00000qvjtJAAQ",
          "Amount": 89400,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-02",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYIbAAP"
          },
          "Id": "006am00000KJYIbAAP",
          "Name": "Benjamin Young - Cumulus 529 Plan",
          "AccountId": "001am00000qvjtIAAQ",
          "Amount": 89400,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": "Community",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jWAAS"
          },
          "Id": "006am000005W2jWAAS",
          "Name": "Southern Solutions - Cumulus Wire Transfers - Add-On Business - $88K",
          "AccountId": "001am00000qvjsUAAQ",
          "Amount": 88000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-02",
          "LeadSource": "Marketing Event",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYKDAA5"
          },
          "Id": "006am00000KJYKDAA5",
          "Name": "Nicole Grace - Cumulus HELOC",
          "AccountId": "001am00000qvjtJAAQ",
          "Amount": 86900,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-31",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4WBAAZ"
          },
          "Id": "006am00000Mm4WBAAZ",
          "Name": "Pacific Retail POS Upgrade",
          "AccountId": "001am00002Ce0l5AAB",
          "Amount": 85000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-03-15",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jNAAS"
          },
          "Id": "006am000005W2jNAAS",
          "Name": "Haven Enterprises - Cumulus Payment Processing - Add-On Business - $84K",
          "AccountId": "001am00000qvjspAAA",
          "Amount": 84000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-10-12",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j7AAC"
          },
          "Id": "006am000005W2j7AAC",
          "Name": "Pardot LLC - Cumulus Business Fundamentals Checking - New Business - $83K",
          "AccountId": "001am00000qvjtwAAA",
          "Amount": 83000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-05",
          "LeadSource": "Social Media",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iUAAS"
          },
          "Id": "006am000005W2iUAAS",
          "Name": "Advanced Communications - Cumulus Commercial Real Estate - Services - $80K",
          "AccountId": "001am00000qvjszAAA",
          "Amount": 80000,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-10",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYX7AAP"
          },
          "Id": "006am00000KJYX7AAP",
          "Name": "Tammy Baxter - Cumulus HELOC",
          "AccountId": "001am00000qvjtLAAQ",
          "Amount": 78200,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iyAAC"
          },
          "Id": "006am000005W2iyAAC",
          "Name": "Tech Labs - Cumulus Positive Pay - Add-On Business - $78K",
          "AccountId": "001am00000qvjsMAAQ",
          "Amount": 78000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-05-02",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYyXAAX"
          },
          "Id": "006am00000KJYyXAAX",
          "Name": "Olivia Blake - Cumulus 12Mo CD Renewal",
          "AccountId": "001am00000qvjtfAAA",
          "Amount": 77300,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXhWAAX"
          },
          "Id": "006am00000KJXhWAAX",
          "Name": "Jim Morris Estate - Cumulus Payment Processing",
          "AccountId": "001am00000qvju6AAA",
          "Amount": 75000,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-31",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4W5AAJ"
          },
          "Id": "006am00000Mm4W5AAJ",
          "Name": "Acme Platform Upgrade",
          "AccountId": "001am00002Ce0kzAAB",
          "Amount": 75000,
          "StageName": "Prospecting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-06-30",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jqAAC"
          },
          "Id": "006am000005W2jqAAC",
          "Name": "Morpon Brothers - Cumulus Business Term Loan - New Business - $75K",
          "AccountId": "001am00000qvjsYAAQ",
          "Amount": 75000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-09-06",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jQAAS"
          },
          "Id": "006am000005W2jQAAS",
          "Name": "Accusage, Inc. - Cumulus Business Term Loan - Services - $75K",
          "AccountId": "001am00000qvju7AAA",
          "Amount": 75000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-02",
          "LeadSource": "Marketing Event",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iIAAS"
          },
          "Id": "006am000005W2iIAAS",
          "Name": "Open Source Inc. - Cumulus Positive Pay - Services - $72K",
          "AccountId": "001am00000qvjshAAA",
          "Amount": 72000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-09-27",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYDlAAP"
          },
          "Id": "006am00000KJYDlAAP",
          "Name": "Bob Warkentine - Cumulus HELOC",
          "AccountId": "001am00000qvjtGAAQ",
          "Amount": 70800,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O0AAK"
          },
          "Id": "006am000005W0O0AAK",
          "Name": "Datanet, Inc. - Cumulus Wire Transfers - New Business - $70K",
          "AccountId": "001am00000qvjsOAAQ",
          "Amount": 70000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-29",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iTAAS"
          },
          "Id": "006am000005W2iTAAS",
          "Name": "Employnet - Cumulus Business Term Loan - New Business - $66K",
          "AccountId": "001am00000qvjsmAAA",
          "Amount": 66000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZmXAAX"
          },
          "Id": "006am00000KJZmXAAX",
          "Name": "Morris Family Trust - Cumulus Payment Processing",
          "AccountId": "001am00000qvju4AAA",
          "Amount": 65100,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-07",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ioAAC"
          },
          "Id": "006am000005W2ioAAC",
          "Name": "Universal Services - Cumulus Cash Rewards Card - Add-On Business - $65K",
          "AccountId": "001am00000qvjsZAAQ",
          "Amount": 65000,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-11-13",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O8AAK"
          },
          "Id": "006am000005W0O8AAK",
          "Name": "Advanced Communications - Cumulus Wire Transfers - Add-On Business - $65K",
          "AccountId": "001am00000qvjszAAA",
          "Amount": 65000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-29",
          "LeadSource": "Social Media",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJV6PAAX"
          },
          "Id": "006am00000KJV6PAAX",
          "Name": "Troy Bullock - Cumulus HELOC",
          "AccountId": "001am00000qvjtAAAQ",
          "Amount": 64700,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jrAAC"
          },
          "Id": "006am000005W2jrAAC",
          "Name": "Employnet - Cumulus Business Line of Credit - Services - $64K",
          "AccountId": "001am00000qvjsmAAA",
          "Amount": 64000,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-09-10",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2izAAC"
          },
          "Id": "006am000005W2izAAC",
          "Name": "Associated Supply Co. - Cumulus ACH Origination - New Business - $64K",
          "AccountId": "001am00000qvjsbAAA",
          "Amount": 64000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-26",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jDAAS"
          },
          "Id": "006am000005W2jDAAS",
          "Name": "Green Fields Media - Cumulus Zero Balance Account - Add-On Business - $63K",
          "AccountId": "001am00000qvjs8AAA",
          "Amount": 63000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-10",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXftAAH"
          },
          "Id": "006am00000KJXftAAH",
          "Name": "Robert Simpson - Cumulus Everyday Checking",
          "AccountId": "001am00000qvjt5AAA",
          "Amount": 62100,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-31",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jpAAC"
          },
          "Id": "006am000005W2jpAAC",
          "Name": "Tech Labs - Cumulus Zero Balance Account - Add-On Business - $59K",
          "AccountId": "001am00000qvjsMAAQ",
          "Amount": 59000,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-09-02",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jHAAS"
          },
          "Id": "006am000005W2jHAAS",
          "Name": "General Utilities - Cumulus Positive Pay - Add-On Business - $58K",
          "AccountId": "001am00000qvjsXAAQ",
          "Amount": 58000,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0OCAA0"
          },
          "Id": "006am000005W0OCAA0",
          "Name": "Silodyne Company - Cumulus Business Term Loan - Add-On Business - $57K",
          "AccountId": "001am00000qvju9AAA",
          "Amount": 57000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-29",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOHeAAP"
          },
          "Id": "006am00000KJOHeAAP",
          "Name": "Robert Janzen - Cumulus 12Mo CD Renewal",
          "AccountId": "001am00000qvjt0AAA",
          "Amount": 55900,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJKZ1AAP"
          },
          "Id": "006am00000KJKZ1AAP",
          "Name": "Peter Houston - Cumulus Auto Loan",
          "AccountId": "001am00000qvjt9AAA",
          "Amount": 55200,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-04",
          "LeadSource": "Partner",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0NyAAK"
          },
          "Id": "006am000005W0NyAAK",
          "Name": "Accusage, Inc. - Cumulus Remote Deposit Capture - Services - $55K",
          "AccountId": "001am00000qvju7AAA",
          "Amount": 55000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-29",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O9AAK"
          },
          "Id": "006am000005W0O9AAK",
          "Name": "Aims Social, Inc. - Cumulus Business Fundamentals Checking - Services - $55K",
          "AccountId": "001am00000qvjsPAAQ",
          "Amount": 55000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-29",
          "LeadSource": "Website",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYs5AAH"
          },
          "Id": "006am00000KJYs5AAH",
          "Name": "Jennifer Blake - Cumulus Auto Loan",
          "AccountId": "001am00000qvjtcAAA",
          "Amount": 54700,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-05",
          "LeadSource": "Partner",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iWAAS"
          },
          "Id": "006am000005W2iWAAS",
          "Name": "Silodyne Company - Cumulus Corporate Card - New Business - $54K",
          "AccountId": "001am00000qvju9AAA",
          "Amount": 54000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-04-12",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2irAAC"
          },
          "Id": "006am000005W2irAAC",
          "Name": "Tyconet - Cumulus ACH Origination - Add-On Business - $54K",
          "AccountId": "001am00000qvjsoAAA",
          "Amount": 54000,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-11-01",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jkAAC"
          },
          "Id": "006am000005W2jkAAC",
          "Name": "United Partners - Cumulus ACH Services - Add-On Business - $53K",
          "AccountId": "001am00000qvjtXAAQ",
          "Amount": 53000,
          "StageName": "Assessment Needed",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jjAAC"
          },
          "Id": "006am000005W2jjAAC",
          "Name": "United Partners - Cumulus Lockbox Services - Add-On Business - $53K",
          "AccountId": "001am00000qvjtXAAQ",
          "Amount": 53000,
          "StageName": "Assessment Needed",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jlAAC"
          },
          "Id": "006am000005W2jlAAC",
          "Name": "United Partners - Cumulus Positive Pay - Add-On Business - $53K",
          "AccountId": "001am00000qvjtXAAQ",
          "Amount": 53000,
          "StageName": "Assessment Needed",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-29",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iVAAS"
          },
          "Id": "006am000005W2iVAAS",
          "Name": "United Partners - Cumulus Wire Transfers - Add-On Business - $53K",
          "AccountId": "001am00000qvjtXAAQ",
          "Amount": 53000,
          "StageName": "Assessment Needed",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jiAAC"
          },
          "Id": "006am000005W2jiAAC",
          "Name": "UlyssesNet - Cumulus Positive Pay - New Business - $52K",
          "AccountId": "001am00000qvjskAAA",
          "Amount": 52000,
          "StageName": "Discovery",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-10-28",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJSgEAAX"
          },
          "Id": "006am00000KJSgEAAX",
          "Name": "Russell Hartman - Cumulus Auto Loan",
          "AccountId": "001am00000qvjtMAAQ",
          "Amount": 51100,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-30",
          "LeadSource": "Partner",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXb4AAH"
          },
          "Id": "006am00000KJXb4AAH",
          "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Payment Processing",
          "AccountId": "001am00000qvjtnAAA",
          "Amount": 50600,
          "StageName": "Closed Lost",
          "IsClosed": true,
          "IsWon": false,
          "CloseDate": "2026-07-30",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O4AAK"
          },
          "Id": "006am000005W0O4AAK",
          "Name": "Permadyne GmbH, LTD - Cumulus Business Analyzed Checking - Add-On Business - $50K",
          "AccountId": "001am00000qvjslAAA",
          "Amount": 50000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-29",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2inAAC"
          },
          "Id": "006am000005W2inAAC",
          "Name": "Southern Solutions - Cumulus Purchasing Card - Add-On Business - $50K",
          "AccountId": "001am00000qvjsUAAQ",
          "Amount": 50000,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-11-16",
          "LeadSource": null,
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0OBAA0"
          },
          "Id": "006am000005W0OBAA0",
          "Name": "Haven Enterprises - Cumulus Business Analyzed Checking - Services - $50K",
          "AccountId": "001am00000qvjspAAA",
          "Amount": 50000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-29",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZZdAAP"
          },
          "Id": "006am00000KJZZdAAP",
          "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus ACH Services",
          "AccountId": "001am00000qvjttAAA",
          "Amount": 50000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-07",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYvJAAX"
          },
          "Id": "006am00000KJYvJAAX",
          "Name": "Stephen Blake - Cumulus Personal Loan",
          "AccountId": "001am00000qvjteAAA",
          "Amount": 48500,
          "StageName": "Negotiation",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRkAAAX"
          },
          "Id": "006am00000KJRkAAAX",
          "Name": "Russell Hartman - Cumulus Personal Loan",
          "AccountId": "001am00000qvjtMAAQ",
          "Amount": 48000,
          "StageName": "Proposal/Quote",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-06",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O3AAK"
          },
          "Id": "006am000005W0O3AAK",
          "Name": "Vand Enterprises, Inc. - Cumulus SBA Loan - Services - $48K",
          "AccountId": "001am00000qvjsyAAA",
          "Amount": 48000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-29",
          "LeadSource": "Marketing Event",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJUdCAAX"
          },
          "Id": "006am00000KJUdCAAX",
          "Name": "Chip Colli - Cumulus Personal Loan",
          "AccountId": "001am00000qvjtFAAQ",
          "Amount": 47700,
          "StageName": "Prospecting",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-03",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJPDsAAP"
          },
          "Id": "006am00000KJPDsAAP",
          "Name": "Nigel Morris - Cumulus Personal Loan",
          "AccountId": "001am00000qvjsGAAQ",
          "Amount": 47200,
          "StageName": "Qualification",
          "IsClosed": false,
          "IsWon": false,
          "CloseDate": "2026-08-01",
          "LeadSource": "Inbound Call",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYYjAAP"
          },
          "Id": "006am00000KJYYjAAP",
          "Name": "Russell Hartman - Cumulus Everyday Checking",
          "AccountId": "001am00000qvjtMAAQ",
          "Amount": 47000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-08-04",
          "LeadSource": "Referral",
          "OwnerId": "005am000003PbCLAA0"
        },
        {
          "attributes": {
            "type": "Opportunity",
            "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0NzAAK"
          },
          "Id": "006am000005W0NzAAK",
          "Name": "Allied Technologies - Cumulus Business Analyzed Checking - New Business - $47K",
          "AccountId": "001am00000qvjsdAAA",
          "Amount": 47000,
          "StageName": "Closed Won",
          "IsClosed": true,
          "IsWon": true,
          "CloseDate": "2026-07-29",
          "LeadSource": "Cold Call",
          "OwnerId": "005am000003PbCLAA0"
        }
      ],
      "limit": 201,
      "returnedRows": 201
    },
    "crm_tasks": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "CRM tasks",
      "query": "SELECT Id,Subject,Status,Priority,ActivityDate,WhoId,WhatId,OwnerId,Description FROM Task WHERE OwnerId='005am000003PbCLAA0' ORDER BY ActivityDate DESC NULLS LAST LIMIT 30",
      "rows": [
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000VD9zhEAD"
          },
          "Id": "00Tam00000VD9zhEAD",
          "Subject": "Speak with Julie Morris about her daughter's 529 account",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-10-19",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsAAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000UdfoPEAR"
          },
          "Id": "00Tam00000UdfoPEAR",
          "Subject": "Follow up with Julie Morris - Business Loans",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-10-05",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsAAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000UPCuLEAX"
          },
          "Id": "00Tam00000UPCuLEAX",
          "Subject": "Follow up with Julie Morris - Business Loans",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-30",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsLAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Follow up with Julie Morris regarding business loan options for Morris Roasters, LLC."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000UNl3OEAT"
          },
          "Id": "00Tam00000UNl3OEAT",
          "Subject": "Follow up with Julie Morris regarding business loans",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-29",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsAAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TzFr3EAF"
          },
          "Id": "00Tam00000TzFr3EAF",
          "Subject": "Insurance Outreach - Alexis E Smith",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-24",
          "WhoId": "003am00000e7EhJAAU",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Tier 1 insurance campaign outreach. Discuss long-term care, whole life, and final expense insurance. Income $1.54M, age 69, married, 2 dependents, homeowner, 35% tax bracket. Urgency given age — insurability window narrowing. No existing policies on record."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TzFpREAV"
          },
          "Id": "00Tam00000TzFpREAV",
          "Subject": "Insurance Outreach - Bailey S White",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-24",
          "WhoId": "003am00000e7ZjUAAU",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Tier 1 insurance campaign outreach. Discuss life insurance, disability insurance, and long-term care. Income $1.53M, age 57, married, 3 dependents, homeowner, 35% tax bracket. Civil engineer — occupational disability coverage especially relevant. No existing policies on record."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TzFsfEAF"
          },
          "Id": "00Tam00000TzFsfEAF",
          "Subject": "Insurance Outreach - Alexis S Smith",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-24",
          "WhoId": "003am00000e7Zk8AAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Tier 1 insurance campaign outreach. Discuss long-term care, whole life, and final expense insurance. Income $1.54M, age 69, married, 2 dependents, homeowner, 35% tax bracket. Urgency given age — insurability window narrowing. No existing policies on record."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TzFmDEAV"
          },
          "Id": "00Tam00000TzFmDEAV",
          "Subject": "Insurance Outreach - Nigel E Morris",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-24",
          "WhoId": "003am000008yOmMAAU",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Tier 1 insurance campaign outreach. Discuss life insurance, umbrella liability, and long-term care. Income $8.6M, age 57, married, 2 dependents, homeowner, 37% tax bracket. No existing policies on record."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000Tz3DHEAZ"
          },
          "Id": "00Tam00000Tz3DHEAZ",
          "Subject": "Insurance Outreach - Bailey U White",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-24",
          "WhoId": "003am00000e7EgfAAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Tier 1 insurance campaign outreach. Discuss life insurance, disability insurance, and long-term care. Income $1.53M, age 57, married, 3 dependents, homeowner, 35% tax bracket. Civil engineer — occupational disability coverage especially relevant. No existing policies on record."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TyPXVEA3"
          },
          "Id": "00Tam00000TyPXVEA3",
          "Subject": "Follow up with Julie Morris - Business Loans",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-23",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsLAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Follow up with Julie Morris regarding business loan opportunities for Morris Roasters, LLC. Key items: Equipment Loan ($58K, closes Oct 17), Asset-Based Lending ($14K), and Syndicated Loan ($14K) currently in pipeline. Also discuss wallet share opportunity given low Roastery deposits vs. $10M revenue."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TyLwvEAF"
          },
          "Id": "00Tam00000TyLwvEAF",
          "Subject": "Follow up with Julie Morris - Business Loans",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-23",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsAAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000Txj8TEAR"
          },
          "Id": "00Tam00000Txj8TEAR",
          "Subject": "Follow up with Julie Morris - Business Loans",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-22",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsAAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Follow up with Julie E Morris regarding business loans."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TxhBWEAZ"
          },
          "Id": "00Tam00000TxhBWEAZ",
          "Subject": "Follow up with Julie Morris - Business Loans",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-22",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsAAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Follow up with Julie Morris regarding business loan opportunities for Morris Roasters, LLC. Key items: Equipment Loan ($58K), Asset-Based Lending ($14K), and Syndicated Loan ($14K) currently in pipeline. Also discuss wallet share opportunity given low Roastery deposits vs. $10M revenue."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TxaMxEAJ"
          },
          "Id": "00Tam00000TxaMxEAJ",
          "Subject": "Follow up with Julie Morris regarding business loans",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-22",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsLAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TjbqjEAB"
          },
          "Id": "00Tam00000TjbqjEAB",
          "Subject": "Discuss Commercial Real Estate Lending Opportunity",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-09-17",
          "WhoId": null,
          "WhatId": "001am00000qvjs6AAA",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Speak with Omega, Inc. about a potential Commercial Real Estate lending opportunity."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TybaHEAR"
          },
          "Id": "00Tam00000TybaHEAR",
          "Subject": "Call: Discuss brokerage account",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-09-16",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsAAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Call Julie E Morris to discuss her brokerage account."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIVXEA2"
          },
          "Id": "00Tam000004jIVXEA2",
          "Subject": "Call Rachel - Confirm close date",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-09-14",
          "WhoId": "003am000008yOmFAAU",
          "WhatId": "006am000005W2igAAC",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TiZarEAF"
          },
          "Id": "00Tam00000TiZarEAF",
          "Subject": "Speak to Julie Morris about latest HELOC offers",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-09-14",
          "WhoId": "003am00000htooSAAQ",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TiXu1EAF"
          },
          "Id": "00Tam00000TiXu1EAF",
          "Subject": "Call Julie Morris - 529 Options",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-09-09",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Call Julie Morris to discuss and present 529 plan options."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TRc6vEAD"
          },
          "Id": "00Tam00000TRc6vEAD",
          "Subject": "Review lending relationship",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-09-02",
          "WhoId": null,
          "WhatId": "001am00002AYQfoAAH",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Discuss next steps and confirm outstanding items."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TCGmfEAH"
          },
          "Id": "00Tam00000TCGmfEAH",
          "Subject": "Follow up with Omega, Inc. regarding Loan options",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-08-31",
          "WhoId": null,
          "WhatId": "001am00000qvjs6AAA",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000TDOjlEAH"
          },
          "Id": "00Tam00000TDOjlEAH",
          "Subject": "Call Julie Morris",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-08-31",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "001am00000qvjsAAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Follow up with Julie to confirm her interest in home insurance products, including homeowners coverage and earthquake rider. Reference the insurance gap analysis discussion."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIWGEA2"
          },
          "Id": "00Tam000004jIWGEA2",
          "Subject": "BDR on Julie Morris",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-08-24",
          "WhoId": null,
          "WhatId": "006am000005W2ifAAC",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIVUEA2"
          },
          "Id": "00Tam000004jIVUEA2",
          "Subject": "Complete KYC Approval (Manager)",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-08-24",
          "WhoId": "003am000008yOmFAAU",
          "WhatId": "001am00000qvju3AAA",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIVTEA2"
          },
          "Id": "00Tam000004jIVTEA2",
          "Subject": "Discuss mortgage options",
          "Status": "In Progress",
          "Priority": "Normal",
          "ActivityDate": "2026-08-24",
          "WhoId": "003am000008yOmFAAU",
          "WhatId": "006am000005W2ibAAC",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000Sr7hZEAR"
          },
          "Id": "00Tam00000Sr7hZEAR",
          "Subject": "Follow up with Omega, Inc. regarding Loan options",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-08-17",
          "WhoId": null,
          "WhatId": "001am00000qvjs6AAA",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000Sr6dREAR"
          },
          "Id": "00Tam00000Sr6dREAR",
          "Subject": "Follow up with Omega, Inc. regarding Loan options",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-08-17",
          "WhoId": null,
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Task for Jose Sifontes to follow up with Omega, Inc. regarding Loan options."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIVYEA2"
          },
          "Id": "00Tam000004jIVYEA2",
          "Subject": "Call Julie Morris about CD Opening Process",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-08-17",
          "WhoId": "003am000008yOmCAAU",
          "WhatId": "006am000005W2ifAAC",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000SqzNSEAZ"
          },
          "Id": "00Tam00000SqzNSEAZ",
          "Subject": "Send Loan Product Information to Omega, Inc.",
          "Status": "Not Started",
          "Priority": "Normal",
          "ActivityDate": "2026-08-17",
          "WhoId": null,
          "WhatId": "001am00000qvjs6AAA",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Follow up with Omega, Inc. contacts to share information on relevant Cumulus loan products including Business Term Loan, Business Line of Credit, SBA Loan Programs, and Equipment Financing options."
        },
        {
          "attributes": {
            "type": "Task",
            "url": "/services/data/v67.0/sobjects/Task/00Tam00000STbNREA1"
          },
          "Id": "00Tam00000STbNREA1",
          "Subject": "VIP Jumbo Mortgage Advisor Follow-Up",
          "Status": "Not Started",
          "Priority": "High",
          "ActivityDate": "2026-08-10",
          "WhoId": null,
          "WhatId": "001am00000qvjsAAAQ",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "High-priority Jumbo Mortgage follow-up.\n\nCustomer: Julie E Morris\nEmail: jmorris@example.com\nReason: The customer requested contact from an advisor about a Jumbo Mortgage.\nNext action: Review the Agentforce customer briefing and contact the customer promptly."
        }
      ],
      "limit": 30,
      "returnedRows": 30
    },
    "crm_events": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "CRM events",
      "query": "SELECT Id,Subject,StartDateTime,EndDateTime,DurationInMinutes,WhoId,WhatId,OwnerId,Description,Location,ShowAs FROM Event WHERE OwnerId='005am000003PbCLAA0' ORDER BY StartDateTime DESC LIMIT 20",
      "rows": [
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam00000LdwG9EAJ"
          },
          "Id": "00Uam00000LdwG9EAJ",
          "Subject": "Call — Omega, Inc.",
          "StartDateTime": "2026-09-16T21:30:00.000+0000",
          "EndDateTime": "2026-09-16T22:00:00.000+0000",
          "DurationInMinutes": 30,
          "WhoId": null,
          "WhatId": "001am00000qvjs6AAA",
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Resolve open items, review opportunity, set next step.",
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGT3EAM"
          },
          "Id": "00Uam000002nGT3EAM",
          "Subject": "Onsite Presentation to Executive Team",
          "StartDateTime": "2026-08-26T22:30:00.000+0000",
          "EndDateTime": "2026-08-27T00:30:00.000+0000",
          "DurationInMinutes": 120,
          "WhoId": "003am000008yOmvAAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGW3EAM"
          },
          "Id": "00Uam000002nGW3EAM",
          "Subject": "Review Social Listening and Identify Keywords",
          "StartDateTime": "2026-08-26T17:30:00.000+0000",
          "EndDateTime": "2026-08-26T18:00:00.000+0000",
          "DurationInMinutes": 30,
          "WhoId": "003am000008yOmAAAU",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGVxEAM"
          },
          "Id": "00Uam000002nGVxEAM",
          "Subject": "Internal: Review Pricing Structure",
          "StartDateTime": "2026-08-26T16:30:00.000+0000",
          "EndDateTime": "2026-08-26T18:00:00.000+0000",
          "DurationInMinutes": 90,
          "WhoId": "003am000008yOnQAAU",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGUqEAM"
          },
          "Id": "00Uam000002nGUqEAM",
          "Subject": "Left Voicemail: Introduction",
          "StartDateTime": "2026-08-26T16:30:00.000+0000",
          "EndDateTime": "2026-08-26T17:30:00.000+0000",
          "DurationInMinutes": 60,
          "WhoId": null,
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGUdEAM"
          },
          "Id": "00Uam000002nGUdEAM",
          "Subject": "Draft Mutual Plan",
          "StartDateTime": "2026-08-26T14:35:51.000+0000",
          "EndDateTime": "2026-08-26T15:05:51.000+0000",
          "DurationInMinutes": 30,
          "WhoId": "003am000008yOnsAAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGT1EAM"
          },
          "Id": "00Uam000002nGT1EAM",
          "Subject": "Review Ad Text Options for A/B Testing",
          "StartDateTime": "2026-08-25T22:30:00.000+0000",
          "EndDateTime": "2026-08-25T23:30:00.000+0000",
          "DurationInMinutes": 60,
          "WhoId": null,
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGTKEA2"
          },
          "Id": "00Uam000002nGTKEA2",
          "Subject": "Demo for the Sales Team",
          "StartDateTime": "2026-08-25T22:30:00.000+0000",
          "EndDateTime": "2026-08-26T00:30:00.000+0000",
          "DurationInMinutes": 120,
          "WhoId": "003am000008yOmyAAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGT5EAM"
          },
          "Id": "00Uam000002nGT5EAM",
          "Subject": "Volunteering - Business Skills Workshop",
          "StartDateTime": "2026-08-25T22:00:00.000+0000",
          "EndDateTime": "2026-08-25T23:00:00.000+0000",
          "DurationInMinutes": 60,
          "WhoId": "003am000008yOmvAAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGWOEA2"
          },
          "Id": "00Uam000002nGWOEA2",
          "Subject": "Internal team strategy meeting",
          "StartDateTime": "2026-08-25T21:30:00.000+0000",
          "EndDateTime": "2026-08-25T22:30:00.000+0000",
          "DurationInMinutes": 60,
          "WhoId": null,
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": "Conference Room 6",
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGRLEA2"
          },
          "Id": "00Uam000002nGRLEA2",
          "Subject": "Discuss Next Steps",
          "StartDateTime": "2026-08-25T21:00:00.000+0000",
          "EndDateTime": "2026-08-25T21:30:00.000+0000",
          "DurationInMinutes": 30,
          "WhoId": null,
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGTWEA2"
          },
          "Id": "00Uam000002nGTWEA2",
          "Subject": "Demo",
          "StartDateTime": "2026-08-25T20:30:00.000+0000",
          "EndDateTime": "2026-08-25T21:30:00.000+0000",
          "DurationInMinutes": 60,
          "WhoId": "003am000008yOn1AAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGWeEAM"
          },
          "Id": "00Uam000002nGWeEAM",
          "Subject": "Meeting w/ VP Sales",
          "StartDateTime": "2026-08-25T20:30:00.000+0000",
          "EndDateTime": "2026-08-25T21:30:00.000+0000",
          "DurationInMinutes": 60,
          "WhoId": "003am000008yOm5AAE",
          "WhatId": "001am00000qvjs6AAA",
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": "Onsite at Customer",
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGUaEAM"
          },
          "Id": "00Uam000002nGUaEAM",
          "Subject": "Design Social Command Center Requirements",
          "StartDateTime": "2026-08-25T20:00:00.000+0000",
          "EndDateTime": "2026-08-25T20:30:00.000+0000",
          "DurationInMinutes": 30,
          "WhoId": "003am000008yOnrAAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGSuEAM"
          },
          "Id": "00Uam000002nGSuEAM",
          "Subject": "Left Voicemail: Update",
          "StartDateTime": "2026-08-25T19:30:00.000+0000",
          "EndDateTime": "2026-08-25T21:00:00.000+0000",
          "DurationInMinutes": 90,
          "WhoId": "003am000008yOnpAAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGSaEAM"
          },
          "Id": "00Uam000002nGSaEAM",
          "Subject": "Cold Call with Prospect",
          "StartDateTime": "2026-08-25T17:30:00.000+0000",
          "EndDateTime": "2026-08-25T18:00:00.000+0000",
          "DurationInMinutes": 30,
          "WhoId": null,
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGUiEAM"
          },
          "Id": "00Uam000002nGUiEAM",
          "Subject": "Reserve Venue for Customer Conference",
          "StartDateTime": "2026-08-25T17:30:00.000+0000",
          "EndDateTime": "2026-08-25T18:30:00.000+0000",
          "DurationInMinutes": 60,
          "WhoId": "003am000008yOn7AAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGRqEAM"
          },
          "Id": "00Uam000002nGRqEAM",
          "Subject": "Work on RFP",
          "StartDateTime": "2026-08-25T17:00:00.000+0000",
          "EndDateTime": "2026-08-25T19:00:00.000+0000",
          "DurationInMinutes": 120,
          "WhoId": null,
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGS3EAM"
          },
          "Id": "00Uam000002nGS3EAM",
          "Subject": "Discovery Meeting",
          "StartDateTime": "2026-08-25T14:35:51.000+0000",
          "EndDateTime": "2026-08-25T15:35:51.000+0000",
          "DurationInMinutes": 60,
          "WhoId": null,
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": "Get a better understanding of this customer's challenges and start considering solutions that might need their needs.",
          "Location": null,
          "ShowAs": "Busy"
        },
        {
          "attributes": {
            "type": "Event",
            "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGVLEA2"
          },
          "Id": "00Uam000002nGVLEA2",
          "Subject": "Internal: Review Pricing Structure",
          "StartDateTime": "2026-08-24T23:30:00.000+0000",
          "EndDateTime": "2026-08-25T00:00:00.000+0000",
          "DurationInMinutes": 30,
          "WhoId": "003am000008yOmjAAE",
          "WhatId": null,
          "OwnerId": "005am000003PbCLAA0",
          "Description": null,
          "Location": null,
          "ShowAs": "Busy"
        }
      ],
      "limit": 20,
      "returnedRows": 20
    },
    "crm_deepAccounts": {
      "status": "available",
      "scope": "book",
      "ownerId": "005am000003PbCLAA0",
      "label": "CRM deepAccounts",
      "query": "SELECT Id,Name,OwnerId,PersonEmail,PersonContactId FROM Account WHERE Id IN ('001am00000qvjsAAAQ','001am000026ZtgKAAS')",
      "rows": [
        {
          "attributes": {
            "type": "Account",
            "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsAAAQ"
          },
          "Id": "001am00000qvjsAAAQ",
          "Name": "Julie E Morris",
          "OwnerId": "005am000003PbCLAA0",
          "PersonEmail": "jmorris@example.com",
          "PersonContactId": "003am000008yOmCAAU"
        },
        {
          "attributes": {
            "type": "Account",
            "url": "/services/data/v67.0/sobjects/Account/001am000026ZtgKAAS"
          },
          "Id": "001am000026ZtgKAAS",
          "Name": "Anika A Patel",
          "OwnerId": "005am000003PbCLAA0",
          "PersonEmail": "mdmp25421@cumulus.example.com",
          "PersonContactId": "003am00000c9fUJAAY"
        }
      ],
      "limit": null,
      "returnedRows": 2
    }
  },
  "accounts": [
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsAAAQ"
      },
      "Id": "001am00000qvjsAAAQ",
      "Name": "Julie E Morris",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": "jmorris@example.com",
      "PersonContactId": "003am000008yOmCAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZhLmAAK"
      },
      "Id": "001am000026ZhLmAAK",
      "Name": "Rodriguez Retirement Holdings",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZkI2AAK"
      },
      "Id": "001am000026ZkI2AAK",
      "Name": "Chen Family Trust",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZtgJAAS"
      },
      "Id": "001am000026ZtgJAAS",
      "Name": "Marcus G Rodriguez",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": "mdmp25420@cumulus.example.com",
      "PersonContactId": "003am00000c9fUIAAY"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZtgKAAS"
      },
      "Id": "001am000026ZtgKAAS",
      "Name": "Anika A Patel",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": "mdmp25421@cumulus.example.com",
      "PersonContactId": "003am00000c9fUJAAY"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZtgLAAS"
      },
      "Id": "001am000026ZtgLAAS",
      "Name": "Julia D Nakamura",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": "mdmp25422@cumulus.example.com",
      "PersonContactId": "003am00000c9fUKAAY"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZtgNAAS"
      },
      "Id": "001am000026ZtgNAAS",
      "Name": "Priya S Venkatesh",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": "mdmp25424@cumulus.example.com",
      "PersonContactId": "003am00000c9fUMAAY"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A8XkeAAF"
      },
      "Id": "001am00002A8XkeAAF",
      "Name": "Turner Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fC4AAJ"
      },
      "Id": "001am00002A9fC4AAJ",
      "Name": "Garcia Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fDPAAZ"
      },
      "Id": "001am00002A9fDPAAZ",
      "Name": "Lawson Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fE0AAJ"
      },
      "Id": "001am00002A9fE0AAJ",
      "Name": "Martinez Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fKSAAZ"
      },
      "Id": "001am00002A9fKSAAZ",
      "Name": "Barnes Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fLoAAJ"
      },
      "Id": "001am00002A9fLoAAJ",
      "Name": "Ponce Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fLxAAJ"
      },
      "Id": "001am00002A9fLxAAJ",
      "Name": "Peterson Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fbqAAB"
      },
      "Id": "001am00002A9fbqAAB",
      "Name": "Nichols Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9ffZAAR"
      },
      "Id": "001am00002A9ffZAAR",
      "Name": "Burns Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9flYAAR"
      },
      "Id": "001am00002A9flYAAR",
      "Name": "Conner Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9flwAAB"
      },
      "Id": "001am00002A9flwAAB",
      "Name": "Flores Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fnRAAR"
      },
      "Id": "001am00002A9fnRAAR",
      "Name": "Gillespie Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9ft0AAB"
      },
      "Id": "001am00002A9ft0AAB",
      "Name": "Williams Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9g0RAAR"
      },
      "Id": "001am00002A9g0RAAR",
      "Name": "Gill Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9sJBAAZ"
      },
      "Id": "001am00002A9sJBAAZ",
      "Name": "Shannon Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9sJLAAZ"
      },
      "Id": "001am00002A9sJLAAZ",
      "Name": "Burton Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA81dAAD"
      },
      "Id": "001am00002AA81dAAD",
      "Name": "Barnett Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA86sAAD"
      },
      "Id": "001am00002AA86sAAD",
      "Name": "Caldwell Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA87mAAD"
      },
      "Id": "001am00002AA87mAAD",
      "Name": "Parks Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA8DMAA1"
      },
      "Id": "001am00002AA8DMAA1",
      "Name": "Gross Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA8DVAA1"
      },
      "Id": "001am00002AA8DVAA1",
      "Name": "Duncan Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA8DnAAL"
      },
      "Id": "001am00002AA8DnAAL",
      "Name": "Wiley Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA8IlAAL"
      },
      "Id": "001am00002AA8IlAAL",
      "Name": "Hayes Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA8OFAA1"
      },
      "Id": "001am00002AA8OFAA1",
      "Name": "Graham Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA8bKAAT"
      },
      "Id": "001am00002AA8bKAAT",
      "Name": "Benjamin Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYALEAA5"
      },
      "Id": "001am00002AYALEAA5",
      "Name": "Robles Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYALLAA5"
      },
      "Id": "001am00002AYALLAA5",
      "Name": "West Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYAMIAA5"
      },
      "Id": "001am00002AYAMIAA5",
      "Name": "Williams Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYOGGAA5"
      },
      "Id": "001am00002AYOGGAA5",
      "Name": "Hill Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYOGzAAP"
      },
      "Id": "001am00002AYOGzAAP",
      "Name": "Hansen Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYOMnAAP"
      },
      "Id": "001am00002AYOMnAAP",
      "Name": "Reyes Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYONUAA5"
      },
      "Id": "001am00002AYONUAA5",
      "Name": "Ramirez Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYONXAA5"
      },
      "Id": "001am00002AYONXAA5",
      "Name": "Bowman Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYOZGAA5"
      },
      "Id": "001am00002AYOZGAA5",
      "Name": "Lucas Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYObHAAX"
      },
      "Id": "001am00002AYObHAAX",
      "Name": "Fry Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYObrAAH"
      },
      "Id": "001am00002AYObrAAH",
      "Name": "Gallagher Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYOidAAH"
      },
      "Id": "001am00002AYOidAAH",
      "Name": "Fleming Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYOusAAH"
      },
      "Id": "001am00002AYOusAAH",
      "Name": "Fields Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYOztAAH"
      },
      "Id": "001am00002AYOztAAH",
      "Name": "Ramirez Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fBdAAJ"
      },
      "Id": "001am00002A9fBdAAJ",
      "Name": "Rollins Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fhGAAR"
      },
      "Id": "001am00002A9fhGAAR",
      "Name": "King Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA8CJAA1"
      },
      "Id": "001am00002AA8CJAA1",
      "Name": "Thomas Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA8MqAAL"
      },
      "Id": "001am00002AA8MqAAL",
      "Name": "Aguilar Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYAL8AAP"
      },
      "Id": "001am00002AYAL8AAP",
      "Name": "Burton Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYOF0AAP"
      },
      "Id": "001am00002AYOF0AAP",
      "Name": "Adkins Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYONHAA5"
      },
      "Id": "001am00002AYONHAA5",
      "Name": "Fox Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZtgIAAS"
      },
      "Id": "001am000026ZtgIAAS",
      "Name": "David H Chen",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": "mdmp25419@cumulus.example.com",
      "PersonContactId": "003am00000c9fUHAAY"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZtgMAAS"
      },
      "Id": "001am000026ZtgMAAS",
      "Name": "Ethan D Brooks",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": "mdmp25423@cumulus.example.com",
      "PersonContactId": "003am00000c9fULAAY"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fDRAAZ"
      },
      "Id": "001am00002A9fDRAAZ",
      "Name": "Rodriguez Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fafAAB"
      },
      "Id": "001am00002A9fafAAB",
      "Name": "Martin Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9feqAAB"
      },
      "Id": "001am00002A9feqAAB",
      "Name": "Martinez Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9fgMAAR"
      },
      "Id": "001am00002A9fgMAAR",
      "Name": "Huang Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA86IAAT"
      },
      "Id": "001am00002AA86IAAT",
      "Name": "Salazar Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYOa6AAH"
      },
      "Id": "001am00002AYOa6AAH",
      "Name": "Hernandez Household",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002Ce0l0AAB"
      },
      "Id": "001am00002Ce0l0AAB",
      "Name": "Global Industries",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002Ce0l1AAB"
      },
      "Id": "001am00002Ce0l1AAB",
      "Name": "Bright Horizon Health",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002Ce0l3AAB"
      },
      "Id": "001am00002Ce0l3AAB",
      "Name": "Summit Financial",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002Ce0l4AAB"
      },
      "Id": "001am00002Ce0l4AAB",
      "Name": "Green Energy Co",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002Ce0l8AAB"
      },
      "Id": "001am00002Ce0l8AAB",
      "Name": "SteelWorks Inc",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZgO7AAK"
      },
      "Id": "001am000026ZgO7AAK",
      "Name": "Okafor Capital Holdings",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZldvAAC"
      },
      "Id": "001am000026ZldvAAC",
      "Name": "Vogel Family Trust",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZtmjAAC"
      },
      "Id": "001am000026ZtmjAAC",
      "Name": "Brandt Holdings LLC",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am000026ZtwPAAS"
      },
      "Id": "001am000026ZtwPAAS",
      "Name": "Patel Family Holdings",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002Ce0kzAAB"
      },
      "Id": "001am00002Ce0kzAAB",
      "Name": "Acme Corp",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002Ce0l5AAB"
      },
      "Id": "001am00002Ce0l5AAB",
      "Name": "Pacific Retail Group",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002Ce0l6AAB"
      },
      "Id": "001am00002Ce0l6AAB",
      "Name": "Metro Services Inc",
      "OwnerId": "005am000003PbCLAA0",
      "PersonEmail": null,
      "PersonContactId": null
    }
  ],
  "financialAccounts": [
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MrAAI"
      },
      "Id": "a7kam00000349MrAAI",
      "Name": "Morris Family Mortgage",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": null,
      "FinServ__FinancialAccountType__c": null,
      "FinServ__Status__c": null
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDuAAN"
      },
      "Id": "a7kam00000UiQDuAAN",
      "Name": "Okafor Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
      "FinServ__Balance__c": 8500000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDzAAN"
      },
      "Id": "a7kam00000UiQDzAAN",
      "Name": "Brandt Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
      "FinServ__Balance__c": 6800000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDqAAN"
      },
      "Id": "a7kam00000UiQDqAAN",
      "Name": "Vogel Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
      "FinServ__Balance__c": 5400000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCQAA3"
      },
      "Id": "a7kam00000UiLCQAA3",
      "Name": "Rodriguez Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZtgJAAS",
      "FinServ__Balance__c": 5200000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCZAA3"
      },
      "Id": "a7kam00000UiLCZAA3",
      "Name": "Nakamura Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZtgLAAS",
      "FinServ__Balance__c": 3800000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLChAAN"
      },
      "Id": "a7kam00000UiLChAAN",
      "Name": "Venkatesh Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
      "FinServ__Balance__c": 3200000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDvAAN"
      },
      "Id": "a7kam00000UiQDvAAN",
      "Name": "Okafor Brokerage",
      "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
      "FinServ__Balance__c": 3200000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDlAAN"
      },
      "Id": "a7kam00000UiQDlAAN",
      "Name": "Patel Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
      "FinServ__Balance__c": 2800000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQE0AAN"
      },
      "Id": "a7kam00000UiQE0AAN",
      "Name": "Brandt Brokerage",
      "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
      "FinServ__Balance__c": 2600000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCUAA3"
      },
      "Id": "a7kam00000UiLCUAA3",
      "Name": "Patel Managed Advisory PA",
      "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
      "FinServ__Balance__c": 2400000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCdAAN"
      },
      "Id": "a7kam00000UiLCdAAN",
      "Name": "Brooks Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZtgMAAS",
      "FinServ__Balance__c": 2200000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDrAAN"
      },
      "Id": "a7kam00000UiQDrAAN",
      "Name": "Vogel Brokerage",
      "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
      "FinServ__Balance__c": 2100000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCRAA3"
      },
      "Id": "a7kam00000UiLCRAA3",
      "Name": "Rodriguez Brokerage",
      "FinServ__PrimaryOwner__c": "001am000026ZtgJAAS",
      "FinServ__Balance__c": 2100000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDsAAN"
      },
      "Id": "a7kam00000UiQDsAAN",
      "Name": "Vogel Family Revocable Trust",
      "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
      "FinServ__Balance__c": 1800000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MzAAI"
      },
      "Id": "a7kam00000349MzAAI",
      "Name": "401k-MORRIS Corporate-eTrade",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 1650000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCaAAN"
      },
      "Id": "a7kam00000UiLCaAAN",
      "Name": "Nakamura Brokerage",
      "FinServ__PrimaryOwner__c": "001am000026ZtgLAAS",
      "FinServ__Balance__c": 1500000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQE1AAN"
      },
      "Id": "a7kam00000UiQE1AAN",
      "Name": "Brandt Irrevocable Trust",
      "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
      "FinServ__Balance__c": 1500000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCiAAN"
      },
      "Id": "a7kam00000UiLCiAAN",
      "Name": "Venkatesh Brokerage",
      "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
      "FinServ__Balance__c": 1300000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MfAAI"
      },
      "Id": "a7kam00000349MfAAI",
      "Name": "Business Savings Account",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 1300000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MxAAI"
      },
      "Id": "a7kam00000349MxAAI",
      "Name": "ROTH IRA-MORRIS",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 1150000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDhAAN"
      },
      "Id": "a7kam00000UiQDhAAN",
      "Name": "Rodriguez Traditional IRA",
      "FinServ__PrimaryOwner__c": "001am000026ZhLmAAK",
      "FinServ__Balance__c": 1100000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCTAA3"
      },
      "Id": "a7kam00000UiLCTAA3",
      "Name": "Rodriguez High-Yield Savings",
      "FinServ__PrimaryOwner__c": "001am000026ZtgJAAS",
      "FinServ__Balance__c": 1090000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCYAA3"
      },
      "Id": "a7kam00000UiLCYAA3",
      "Name": "Patel Money Market",
      "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
      "FinServ__Balance__c": 1000000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCeAAN"
      },
      "Id": "a7kam00000UiLCeAAN",
      "Name": "Brooks Traditional IRA",
      "FinServ__PrimaryOwner__c": "001am000026ZtgMAAS",
      "FinServ__Balance__c": 850000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwTAAT"
      },
      "Id": "a7kam00000YUpwTAAT",
      "Name": "Cumulus Business Checking - 1340",
      "FinServ__PrimaryOwner__c": "001am00002Ce0l5AAB",
      "FinServ__Balance__c": 796304.1,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MeAAI"
      },
      "Id": "a7kam00000349MeAAI",
      "Name": "30 yr Fixed Mortgage",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 780000,
      "FinServ__FinancialAccountType__c": null,
      "FinServ__Status__c": null
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDwAAN"
      },
      "Id": "a7kam00000UiQDwAAN",
      "Name": "Okafor Roth IRA",
      "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
      "FinServ__Balance__c": 750000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCcAAN"
      },
      "Id": "a7kam00000UiLCcAAN",
      "Name": "Nakamura Roth IRA",
      "FinServ__PrimaryOwner__c": "001am000026ZtgLAAS",
      "FinServ__Balance__c": 680000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCgAAN"
      },
      "Id": "a7kam00000UiLCgAAN",
      "Name": "Brooks High-Yield Savings",
      "FinServ__PrimaryOwner__c": "001am000026ZtgMAAS",
      "FinServ__Balance__c": 600000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCXAA3"
      },
      "Id": "a7kam00000UiLCXAA3",
      "Name": "Patel High-Yield Savings PA",
      "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
      "FinServ__Balance__c": 520000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCjAAN"
      },
      "Id": "a7kam00000UiLCjAAN",
      "Name": "Venkatesh Roth IRA",
      "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
      "FinServ__Balance__c": 450000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDjAAN"
      },
      "Id": "a7kam00000UiQDjAAN",
      "Name": "Rodriguez High-Yield Savings",
      "FinServ__PrimaryOwner__c": "001am000026ZhLmAAK",
      "FinServ__Balance__c": 420000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwVAAT"
      },
      "Id": "a7kam00000YUpwVAAT",
      "Name": "Cumulus Business Checking - 8860",
      "FinServ__PrimaryOwner__c": "001am00002Ce0l6AAB",
      "FinServ__Balance__c": 390929.63,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwSAAT"
      },
      "Id": "a7kam00000YUpwSAAT",
      "Name": "Cumulus Business Term Loan - 1483",
      "FinServ__PrimaryOwner__c": "001am00002Ce0l1AAB",
      "FinServ__Balance__c": 389509.26,
      "FinServ__FinancialAccountType__c": "Loans",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwRAAT"
      },
      "Id": "a7kam00000YUpwRAAT",
      "Name": "Cumulus Business Checking - 6719",
      "FinServ__PrimaryOwner__c": "001am00002Ce0l1AAB",
      "FinServ__Balance__c": 367875.15,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDiAAN"
      },
      "Id": "a7kam00000UiQDiAAN",
      "Name": "Rodriguez 60-Month CD",
      "FinServ__PrimaryOwner__c": "001am000026ZhLmAAK",
      "FinServ__Balance__c": 350000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDoAAN"
      },
      "Id": "a7kam00000UiQDoAAN",
      "Name": "Patel High-Yield Savings",
      "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
      "FinServ__Balance__c": 320000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCSAA3"
      },
      "Id": "a7kam00000UiLCSAA3",
      "Name": "Rodriguez Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZtgJAAS",
      "FinServ__Balance__c": 310000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDxAAN"
      },
      "Id": "a7kam00000UiQDxAAN",
      "Name": "Okafor Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
      "FinServ__Balance__c": 280000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUp6nAAD"
      },
      "Id": "a7kam00000YUp6nAAD",
      "Name": "Cumulus Business Term Loan - 3987",
      "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
      "FinServ__Balance__c": 239878.79,
      "FinServ__FinancialAccountType__c": "Loans",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDkAAN"
      },
      "Id": "a7kam00000UiQDkAAN",
      "Name": "Rodriguez Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZhLmAAK",
      "FinServ__Balance__c": 230000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCkAAN"
      },
      "Id": "a7kam00000UiLCkAAN",
      "Name": "Venkatesh Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
      "FinServ__Balance__c": 220000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUp6mAAD"
      },
      "Id": "a7kam00000YUp6mAAD",
      "Name": "Cumulus Business Checking - 4765",
      "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
      "FinServ__Balance__c": 211921.14,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQE2AAN"
      },
      "Id": "a7kam00000UiQE2AAN",
      "Name": "Brandt Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
      "FinServ__Balance__c": 210000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCVAA3"
      },
      "Id": "a7kam00000UiLCVAA3",
      "Name": "Patel 529 Education Plan PA",
      "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
      "FinServ__Balance__c": 195000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUpwUAAT"
      },
      "Id": "a7kam00000YUpwUAAT",
      "Name": "Cumulus Business Term Loan - 9270",
      "FinServ__PrimaryOwner__c": "001am00002Ce0l5AAB",
      "FinServ__Balance__c": 194401.47,
      "FinServ__FinancialAccountType__c": "Loans",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDtAAN"
      },
      "Id": "a7kam00000UiQDtAAN",
      "Name": "Vogel Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
      "FinServ__Balance__c": 180000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDmAAN"
      },
      "Id": "a7kam00000UiQDmAAN",
      "Name": "Patel 529 Education Plan",
      "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
      "FinServ__Balance__c": 180000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCfAAN"
      },
      "Id": "a7kam00000UiLCfAAN",
      "Name": "Brooks Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZtgMAAS",
      "FinServ__Balance__c": 150000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCbAAN"
      },
      "Id": "a7kam00000UiLCbAAN",
      "Name": "Nakamura Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZtgLAAS",
      "FinServ__Balance__c": 120000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUp6oAAD"
      },
      "Id": "a7kam00000YUp6oAAD",
      "Name": "Cumulus Business Checking - 4550",
      "FinServ__PrimaryOwner__c": "001am000026ZldvAAC",
      "FinServ__Balance__c": 97018.74,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDnAAN"
      },
      "Id": "a7kam00000UiQDnAAN",
      "Name": "Patel Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
      "FinServ__Balance__c": 95000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCWAA3"
      },
      "Id": "a7kam00000UiLCWAA3",
      "Name": "Patel Premier Checking PA",
      "FinServ__PrimaryOwner__c": "001am000026ZtgKAAS",
      "FinServ__Balance__c": 85000,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MbAAI"
      },
      "Id": "a7kam00000349MbAAI",
      "Name": "529-MORRIS-eTrade Education Plan",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 84000,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MgAAI"
      },
      "Id": "a7kam00000349MgAAI",
      "Name": "High Yield Savings Account",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 75000,
      "FinServ__FinancialAccountType__c": null,
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000XikYoAAJ"
      },
      "Id": "a7kam00000XikYoAAJ",
      "Name": "Money Market Account",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 45750.25,
      "FinServ__FinancialAccountType__c": "Money Market",
      "FinServ__Status__c": null
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQE3AAN"
      },
      "Id": "a7kam00000UiQE3AAN",
      "Name": "Brandt Travel Points Card",
      "FinServ__PrimaryOwner__c": "001am000026ZtmjAAC",
      "FinServ__Balance__c": 12500,
      "FinServ__FinancialAccountType__c": "Credit Cards",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000XikvNAAR"
      },
      "Id": "a7kam00000XikvNAAR",
      "Name": "Emergency Savings Account",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 12000,
      "FinServ__FinancialAccountType__c": "Savings",
      "FinServ__Status__c": null
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDyAAN"
      },
      "Id": "a7kam00000UiQDyAAN",
      "Name": "Okafor Cash Rewards Card",
      "FinServ__PrimaryOwner__c": "001am000026ZgO7AAK",
      "FinServ__Balance__c": 8700,
      "FinServ__FinancialAccountType__c": "Credit Cards",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MwAAI"
      },
      "Id": "a7kam00000349MwAAI",
      "Name": "Julie Morris Debit Card",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 7796.18,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Lost"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MdAAI"
      },
      "Id": "a7kam00000349MdAAI",
      "Name": "Stratus Checking",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 7534,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUqAzAAL"
      },
      "Id": "a7kam00000YUqAzAAL",
      "Name": "Cumulus Corporate Card - 8972",
      "FinServ__PrimaryOwner__c": "001am00002Ce0l5AAB",
      "FinServ__Balance__c": 6872.11,
      "FinServ__FinancialAccountType__c": "Treasury Management",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MlAAI"
      },
      "Id": "a7kam00000349MlAAI",
      "Name": "Classic Savings Account",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 5600.48,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MhAAI"
      },
      "Id": "a7kam00000349MhAAI",
      "Name": "Julie Morris Platinum Visa Card",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 4587,
      "FinServ__FinancialAccountType__c": "Credit Cards",
      "FinServ__Status__c": "Lost"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDpAAN"
      },
      "Id": "a7kam00000UiQDpAAN",
      "Name": "Patel Travel Points Card",
      "FinServ__PrimaryOwner__c": "001am000026ZtwPAAS",
      "FinServ__Balance__c": 4200,
      "FinServ__FinancialAccountType__c": "Credit Cards",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLClAAN"
      },
      "Id": "a7kam00000UiLClAAN",
      "Name": "Venkatesh Cash Rewards Card",
      "FinServ__PrimaryOwner__c": "001am000026ZtgNAAS",
      "FinServ__Balance__c": 3800,
      "FinServ__FinancialAccountType__c": "Credit Cards",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000XiktlAAB"
      },
      "Id": "a7kam00000XiktlAAB",
      "Name": "Cumulus Premier Checking",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 3745.8,
      "FinServ__FinancialAccountType__c": "Checking",
      "FinServ__Status__c": null
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000YUqAyAAL"
      },
      "Id": "a7kam00000YUqAyAAL",
      "Name": "Cumulus Corporate Card - 6006",
      "FinServ__PrimaryOwner__c": "001am00002Ce0l1AAB",
      "FinServ__Balance__c": 3649.76,
      "FinServ__FinancialAccountType__c": "Treasury Management",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam000005zZvdAAE"
      },
      "Id": "a7kam000005zZvdAAE",
      "Name": "Everyday Checking Acct",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 1849.5,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000349MaAAI"
      },
      "Id": "a7kam00000349MaAAI",
      "Name": "Everyday Checking Account",
      "FinServ__PrimaryOwner__c": "001am00000qvjsAAAQ",
      "FinServ__Balance__c": 1589.37,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Open"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCMAA3"
      },
      "Id": "a7kam00000UiLCMAA3",
      "Name": "D. Chen Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZtgIAAS",
      "FinServ__Balance__c": 0,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Closed"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCNAA3"
      },
      "Id": "a7kam00000UiLCNAA3",
      "Name": "D. Chen Brokerage",
      "FinServ__PrimaryOwner__c": "001am000026ZtgIAAS",
      "FinServ__Balance__c": 0,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Closed"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCOAA3"
      },
      "Id": "a7kam00000UiLCOAA3",
      "Name": "D. Chen Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZtgIAAS",
      "FinServ__Balance__c": 0,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Closed"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiLCPAA3"
      },
      "Id": "a7kam00000UiLCPAA3",
      "Name": "D. Chen Revocable Trust",
      "FinServ__PrimaryOwner__c": "001am000026ZtgIAAS",
      "FinServ__Balance__c": 0,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Closed"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDdAAN"
      },
      "Id": "a7kam00000UiQDdAAN",
      "Name": "Chen Managed Advisory",
      "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
      "FinServ__Balance__c": 0,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Closed"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDeAAN"
      },
      "Id": "a7kam00000UiQDeAAN",
      "Name": "Chen Brokerage",
      "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
      "FinServ__Balance__c": 0,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Closed"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDfAAN"
      },
      "Id": "a7kam00000UiQDfAAN",
      "Name": "Chen Premier Checking",
      "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
      "FinServ__Balance__c": 0,
      "FinServ__FinancialAccountType__c": "Deposits",
      "FinServ__Status__c": "Closed"
    },
    {
      "attributes": {
        "type": "FinServ__FinancialAccount__c",
        "url": "/services/data/v67.0/sobjects/FinServ__FinancialAccount__c/a7kam00000UiQDgAAN"
      },
      "Id": "a7kam00000UiQDgAAN",
      "Name": "Chen Family Revocable Trust",
      "FinServ__PrimaryOwner__c": "001am000026ZkI2AAK",
      "FinServ__Balance__c": 0,
      "FinServ__FinancialAccountType__c": "Investments",
      "FinServ__Status__c": "Closed"
    }
  ],
  "goals": [
    {
      "attributes": {
        "type": "FinancialGoal",
        "url": "/services/data/v67.0/sobjects/FinancialGoal/13Ram000000AQCfEAO"
      },
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
        "attributes": {
          "type": "FinancialPlan",
          "url": "/services/data/v67.0/sobjects/FinancialPlan/13Qam000000KniwEAC"
        },
        "AccountId": "001am00000qvjsAAAQ"
      }
    },
    {
      "attributes": {
        "type": "FinancialGoal",
        "url": "/services/data/v67.0/sobjects/FinancialGoal/13Ram000000AQCZEA4"
      },
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
        "attributes": {
          "type": "FinancialPlan",
          "url": "/services/data/v67.0/sobjects/FinancialPlan/13Qam000000KnixEAC"
        },
        "AccountId": "001am00000qvjsAAAQ"
      }
    },
    {
      "attributes": {
        "type": "FinancialGoal",
        "url": "/services/data/v67.0/sobjects/FinancialGoal/13Ram000000AQCaEAO"
      },
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
        "attributes": {
          "type": "FinancialPlan",
          "url": "/services/data/v67.0/sobjects/FinancialPlan/13Qam000000KnixEAC"
        },
        "AccountId": "001am00000qvjsAAAQ"
      }
    },
    {
      "attributes": {
        "type": "FinancialGoal",
        "url": "/services/data/v67.0/sobjects/FinancialGoal/13Ram000000AQCbEAO"
      },
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
        "attributes": {
          "type": "FinancialPlan",
          "url": "/services/data/v67.0/sobjects/FinancialPlan/13Qam000000KnixEAC"
        },
        "AccountId": "001am00000qvjsAAAQ"
      }
    }
  ],
  "leads": [
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueBEAQ"
      },
      "Id": "00Qam000009wueBEAQ",
      "FirstName": "Daragh",
      "LastName": "Dennehy",
      "Name": "Daragh Dennehy",
      "Company": null,
      "Status": "New",
      "LeadSource": null,
      "Email": "ddennehy@salesforce.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueCEAQ"
      },
      "Id": "00Qam000009wueCEAQ",
      "FirstName": "Mellissa",
      "LastName": "Lavender",
      "Name": "Mellissa Lavender",
      "Company": "Peabody Coal Co",
      "Status": "Unqualified",
      "LeadSource": "Social Media",
      "Email": "mlavender@example.com",
      "AnnualRevenue": 54000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueDEAQ"
      },
      "Id": "00Qam000009wueDEAQ",
      "FirstName": "Dan",
      "LastName": "Hawes",
      "Name": "Dan Hawes",
      "Company": "Brenntag Pacific",
      "Status": "New",
      "LeadSource": "Marketing Event",
      "Email": "dhawes@example.com",
      "AnnualRevenue": 56000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueIEAQ"
      },
      "Id": "00Qam000009wueIEAQ",
      "FirstName": "Adrian",
      "LastName": "Newsom",
      "Name": "Adrian Newsom",
      "Company": "Jtl Group",
      "Status": "Working",
      "LeadSource": "Social Media",
      "Email": "anewsom@example.com",
      "AnnualRevenue": 97000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueJEAQ"
      },
      "Id": "00Qam000009wueJEAQ",
      "FirstName": "Megan",
      "LastName": "Salyer",
      "Name": "Megan Salyer",
      "Company": "Neville Homes",
      "Status": "New",
      "LeadSource": "Marketing Event",
      "Email": "msalyer@example.com",
      "AnnualRevenue": 7000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueKEAQ"
      },
      "Id": "00Qam000009wueKEAQ",
      "FirstName": "Sarah",
      "LastName": "Vickery",
      "Name": "Sarah Vickery",
      "Company": "Plum Creek Timber Co",
      "Status": "Working",
      "LeadSource": "Website",
      "Email": "svickery@example.com",
      "AnnualRevenue": 43000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueLEAQ"
      },
      "Id": "00Qam000009wueLEAQ",
      "FirstName": "Todd",
      "LastName": "Shock",
      "Name": "Todd Shock",
      "Company": "L7",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "tshock@example.com",
      "AnnualRevenue": 39000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueOEAQ"
      },
      "Id": "00Qam000009wueOEAQ",
      "FirstName": "Roman",
      "LastName": "Tindall",
      "Name": "Roman Tindall",
      "Company": "TT Systems",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "rtindall@example.com",
      "AnnualRevenue": 24000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueQEAQ"
      },
      "Id": "00Qam000009wueQEAQ",
      "FirstName": "Jeremie",
      "LastName": "Alonso",
      "Name": "Jeremie Alonso",
      "Company": "Clarity Corporation",
      "Status": "New",
      "LeadSource": "Social Media",
      "Email": "jalonso@example.com",
      "AnnualRevenue": 48000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueREAQ"
      },
      "Id": "00Qam000009wueREAQ",
      "FirstName": "Smith",
      "LastName": "Jack",
      "Name": "Smith Jack",
      "Company": "Smith Co",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "sjack@example.com",
      "AnnualRevenue": 45000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueTEAQ"
      },
      "Id": "00Qam000009wueTEAQ",
      "FirstName": "Lauren",
      "LastName": "Reynolds",
      "Name": "Lauren Reynolds",
      "Company": "Gutmann, Bauch and Gutmann",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "lreynolds@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueUEAQ"
      },
      "Id": "00Qam000009wueUEAQ",
      "FirstName": "A",
      "LastName": "Blitzer",
      "Name": "A Blitzer",
      "Company": "Torp-Price",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "ablitzer@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueVEAQ"
      },
      "Id": "00Qam000009wueVEAQ",
      "FirstName": "Frank",
      "LastName": "Caster",
      "Name": "Frank Caster",
      "Company": "Hackett and Sons",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "fcaster@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueWEAQ"
      },
      "Id": "00Qam000009wueWEAQ",
      "FirstName": "Rudy",
      "LastName": "Lehner",
      "Name": "Rudy Lehner",
      "Company": "Schoen-Davis",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "rudy.lehner@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueXEAQ"
      },
      "Id": "00Qam000009wueXEAQ",
      "FirstName": "Bruce",
      "LastName": "Watkins",
      "Name": "Bruce Watkins",
      "Company": "Cormier Inc",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "brucewatkins@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueYEAQ"
      },
      "Id": "00Qam000009wueYEAQ",
      "FirstName": "Adam",
      "LastName": "Blitzer",
      "Name": "Adam Blitzer",
      "Company": "Kerluke Group",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "ablizter@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueZEAQ"
      },
      "Id": "00Qam000009wueZEAQ",
      "FirstName": "Kenna",
      "LastName": "West",
      "Name": "Kenna West",
      "Company": "Kovacek Group",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "kenna.west@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueaEAA"
      },
      "Id": "00Qam000009wueaEAA",
      "FirstName": "Joanna",
      "LastName": "Ball",
      "Name": "Joanna Ball",
      "Company": "Considine, Goldner and Maggio",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "joanna.ball@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuebEAA"
      },
      "Id": "00Qam000009wuebEAA",
      "FirstName": "Dan",
      "LastName": "Milbrath",
      "Name": "Dan Milbrath",
      "Company": "Lakin-Carter",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "dmilbrath@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuecEAA"
      },
      "Id": "00Qam000009wuecEAA",
      "FirstName": "Keith",
      "LastName": "Lopez",
      "Name": "Keith Lopez",
      "Company": "Schimmel Inc",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "lizsmyth@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueoEAA"
      },
      "Id": "00Qam000009wueoEAA",
      "FirstName": "Margarita",
      "LastName": "Hanes",
      "Name": "Margarita Hanes",
      "Company": "Beppo Restaurant",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "mhanes@example.com",
      "AnnualRevenue": 91000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueqEAA"
      },
      "Id": "00Qam000009wueqEAA",
      "FirstName": "Kirstin",
      "LastName": "Woolum",
      "Name": "Kirstin Woolum",
      "Company": "ScanSnap, Inc.",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "kwoolum@example.com",
      "AnnualRevenue": 5000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuerEAA"
      },
      "Id": "00Qam000009wuerEAA",
      "FirstName": "Patrick",
      "LastName": "Ridout",
      "Name": "Patrick Ridout",
      "Company": "BMI, Inc.",
      "Status": "New",
      "LeadSource": "Social Media",
      "Email": "pridout@example.com",
      "AnnualRevenue": 70000000,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuesEAA"
      },
      "Id": "00Qam000009wuesEAA",
      "FirstName": "Alejandrin",
      "LastName": "Bergnaum",
      "Name": "Alejandrin Bergnaum",
      "Company": "Crona Inc",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "alejandrin.bergnaum@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuetEAA"
      },
      "Id": "00Qam000009wuetEAA",
      "FirstName": "Nichole",
      "LastName": "Keeling",
      "Name": "Nichole Keeling",
      "Company": "Powlowski-Kris",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "nichole.keeling@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueuEAA"
      },
      "Id": "00Qam000009wueuEAA",
      "FirstName": "Anne",
      "LastName": "Frost",
      "Name": "Anne Frost",
      "Company": "Green-Jerde",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "afrost@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuevEAA"
      },
      "Id": "00Qam000009wuevEAA",
      "FirstName": "Eldora",
      "LastName": "Mraz",
      "Name": "Eldora Mraz",
      "Company": "Reichel, Bergstrom and Hoeger",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "eldora.mraz@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuewEAA"
      },
      "Id": "00Qam000009wuewEAA",
      "FirstName": "Sophia",
      "LastName": "Wiza",
      "Name": "Sophia Wiza",
      "Company": "D'Amore Ltd",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "sophia.wiza@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wuexEAA"
      },
      "Id": "00Qam000009wuexEAA",
      "FirstName": "Quinn",
      "LastName": "Poirier",
      "Name": "Quinn Poirier",
      "Company": "Wolf LLC",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "qpoirier@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v67.0/sobjects/Lead/00Qam000009wueyEAA"
      },
      "Id": "00Qam000009wueyEAA",
      "FirstName": "Robert",
      "LastName": "Weiss",
      "Name": "Robert Weiss",
      "Company": "Hessel-Klocko",
      "Status": "New",
      "LeadSource": "Website",
      "Email": "rweiss@example.com",
      "AnnualRevenue": null,
      "OwnerId": "005am000003PbCLAA0"
    }
  ],
  "opportunities": [
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy6AAF"
      },
      "Id": "006am00000LcOy6AAF",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjtXAAQ",
      "Amount": 5257150000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyXAAV"
      },
      "Id": "006am00000LcOyXAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjttAAA",
      "Amount": 4470741000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyZAAV"
      },
      "Id": "006am00000LcOyZAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvju6AAA",
      "Amount": 3416803000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyMAAV"
      },
      "Id": "006am00000LcOyMAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjtuAAA",
      "Amount": 2008102000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyYAAV"
      },
      "Id": "006am00000LcOyYAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvju2AAA",
      "Amount": 1697721000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-31",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyHAAV"
      },
      "Id": "006am00000LcOyHAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsXAAQ",
      "Amount": 1112076000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy8AAF"
      },
      "Id": "006am00000LcOy8AAF",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjswAAA",
      "Amount": 141234000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZbFAAX"
      },
      "Id": "006am00000KJZbFAAX",
      "Name": "IDO House Account - Cumulus Syndicated Loan",
      "AccountId": "001am00000qvjtuAAA",
      "Amount": 94824697,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": "Partner",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyFAAV"
      },
      "Id": "006am00000LcOyFAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsTAAQ",
      "Amount": 89774000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyRAAV"
      },
      "Id": "006am00000LcOyRAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjspAAA",
      "Amount": 85370000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy5AAF"
      },
      "Id": "006am00000LcOy5AAF",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjtqAAA",
      "Amount": 84666000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyPAAV"
      },
      "Id": "006am00000LcOyPAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjslAAA",
      "Amount": 73950000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy7AAF"
      },
      "Id": "006am00000LcOy7AAF",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsaAAA",
      "Amount": 56906000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZPxAAP"
      },
      "Id": "006am00000KJZPxAAP",
      "Name": "Bennett Household - Cumulus Commercial Real Estate",
      "AccountId": "001am00000qvjtkAAA",
      "Amount": 46632341,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-30",
      "LeadSource": "Partner",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyaAAF"
      },
      "Id": "006am00000LcOyaAAF",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjuBAAQ",
      "Amount": 43770000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyJAAV"
      },
      "Id": "006am00000LcOyJAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsZAAQ",
      "Amount": 36244000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyNAAV"
      },
      "Id": "006am00000LcOyNAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsfAAA",
      "Amount": 29742000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyCAAV"
      },
      "Id": "006am00000LcOyCAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsOAAQ",
      "Amount": 20446000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyOAAV"
      },
      "Id": "006am00000LcOyOAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjshAAA",
      "Amount": 19765000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJIP8AAP"
      },
      "Id": "006am00000KJIP8AAP",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Business Analyzed Checking - New Business - $16.6M",
      "AccountId": "001am00000qvjttAAA",
      "Amount": 16574839,
      "StageName": "Prospecting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOy9AAF"
      },
      "Id": "006am00000LcOy9AAF",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjs5AAA",
      "Amount": 14975000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOySAAV"
      },
      "Id": "006am00000LcOySAAV",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjsqAAA",
      "Amount": 13734000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-31",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyDAAV"
      },
      "Id": "006am00000LcOyDAAV",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjsPAAQ",
      "Amount": 10591000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyEAAV"
      },
      "Id": "006am00000LcOyEAAV",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjsQAAQ",
      "Amount": 10520000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJKfTAAX"
      },
      "Id": "006am00000KJKfTAAX",
      "Name": "United Technologies Corporation - Cumulus Business Analyzed Checking - New Business - $10.3M",
      "AccountId": "001am00000qvjtyAAA",
      "Amount": 10320119,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOybAAF"
      },
      "Id": "006am00000LcOybAAF",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjuIAAQ",
      "Amount": 9729000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyWAAV"
      },
      "Id": "006am00000LcOyWAAV",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjtsAAA",
      "Amount": 8234000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ijAAC"
      },
      "Id": "006am000005W2ijAAC",
      "Name": "Harry Gray - Cumulus Business Fundamentals Checking - New Business - $8.0M",
      "AccountId": "001am00000qvjsHAAQ",
      "Amount": 8000000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJP43AAH"
      },
      "Id": "006am00000KJP43AAH",
      "Name": "Morris Family Trust - Cumulus Commercial Real Estate",
      "AccountId": "001am00000qvju4AAA",
      "Amount": 7926800,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-30",
      "LeadSource": "Partner",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZOLAA5"
      },
      "Id": "006am00000KJZOLAA5",
      "Name": "CirrusCloud - Cumulus Commercial Real Estate",
      "AccountId": "001am00000qvjtaAAA",
      "Amount": 7880018,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": "Partner",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2icAAC"
      },
      "Id": "006am000005W2icAAC",
      "Name": "Will Johnson - Cumulus Business Fundamentals Checking - New Business - $6.0M",
      "AccountId": "001am00000qvjsIAAQ",
      "Amount": 6000000,
      "StageName": "Preparation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZY1AAP"
      },
      "Id": "006am00000KJZY1AAP",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Business Term Loan",
      "AccountId": "001am00000qvjtrAAA",
      "Amount": 4343200,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJPopAAH"
      },
      "Id": "006am00000KJPopAAH",
      "Name": "Lazard Middle Market LLC - Cumulus Commercial Real Estate",
      "AccountId": "001am00000qvjtYAAQ",
      "Amount": 4185200,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-05",
      "LeadSource": "Partner",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZMjAAP"
      },
      "Id": "006am00000KJZMjAAP",
      "Name": "Lazard Middle Market LLC - Cumulus Business Term Loan",
      "AccountId": "001am00000qvjtYAAQ",
      "Amount": 4090500,
      "StageName": "Prospecting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOr9AAH"
      },
      "Id": "006am00000KJOr9AAH",
      "Name": "CCAnonymous - Cumulus Business Term Loan",
      "AccountId": "001am00000qvjtVAAQ",
      "Amount": 3843300,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j8AAC"
      },
      "Id": "006am000005W2j8AAC",
      "Name": "Wellspring, Inc. - Cumulus Equipment Loan - Add-On Business - $3.5M",
      "AccountId": "001am00000qvjswAAA",
      "Amount": 3518000,
      "StageName": "Underwriting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOycAAF"
      },
      "Id": "006am00000LcOycAAF",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjuJAAQ",
      "Amount": 3399000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXb5AAH"
      },
      "Id": "006am00000KJXb5AAH",
      "Name": "Blake Real Estate Holdings - Cumulus Business Term Loan",
      "AccountId": "001am00000qvjuKAAQ",
      "Amount": 3374700,
      "StageName": "Closed Lost",
      "IsClosed": true,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJO4lAAH"
      },
      "Id": "006am00000KJO4lAAH",
      "Name": "United Technologies Corporation - Cumulus Wire Transfers - New Business - $3.1M",
      "AccountId": "001am00000qvjtyAAA",
      "Amount": 3051783,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jYAAS"
      },
      "Id": "006am000005W2jYAAS",
      "Name": "AJC Corporation - Cumulus Commercial Real Estate",
      "AccountId": "001am00000qvjsuAAA",
      "Amount": 3000000,
      "StageName": "Closing/Funding",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXuPAAX"
      },
      "Id": "006am00000KJXuPAAX",
      "Name": "Kari Rende - Cumulus Statement Savings - New Business - $2.9M",
      "AccountId": "001am00000qvjtCAAQ",
      "Amount": 2907400,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZWPAA5"
      },
      "Id": "006am00000KJZWPAA5",
      "Name": "Sample Account for Entitlements - Cumulus Equipment Loan",
      "AccountId": "001am00000qvjtpAAA",
      "Amount": 2871323,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyBAAV"
      },
      "Id": "006am00000LcOyBAAV",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjsNAAQ",
      "Amount": 2780000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJY45AAH"
      },
      "Id": "006am00000KJY45AAH",
      "Name": "Jon Allegri - Cumulus Everyday Checking - New Business - $2.7M",
      "AccountId": "001am00000qvjtDAAQ",
      "Amount": 2684700,
      "StageName": "Closed Lost",
      "IsClosed": true,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJWVKAA5"
      },
      "Id": "006am00000KJWVKAA5",
      "Name": "United Technologies Corporation - Cumulus Equipment Loan",
      "AccountId": "001am00000qvjtyAAA",
      "Amount": 2509805,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jEAAS"
      },
      "Id": "006am000005W2jEAAS",
      "Name": "Southern Solutions - Cumulus Positive Pay - New Business - $2.1M",
      "AccountId": "001am00000qvjsUAAQ",
      "Amount": 2100000,
      "StageName": "KYC / AML",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYX8AAP"
      },
      "Id": "006am00000KJYX8AAP",
      "Name": "Bennett Household - Cumulus Corporate Card",
      "AccountId": "001am00000qvjtkAAA",
      "Amount": 2085702,
      "StageName": "Closed Lost",
      "IsClosed": true,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iiAAC"
      },
      "Id": "006am000005W2iiAAC",
      "Name": "AJC Corporation - Cumulus Positive Pay",
      "AccountId": "001am00000qvjsuAAA",
      "Amount": 2000000,
      "StageName": "Proposed/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRtrAAH"
      },
      "Id": "006am00000KJRtrAAH",
      "Name": "Andy Peterson - Cumulus Managed Advisory",
      "AccountId": "001am00000qvjtSAAQ",
      "Amount": 1866900,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZplAAH"
      },
      "Id": "006am00000KJZplAAH",
      "Name": "Adena Commercial, LLC - Cumulus Business Fundamentals Checking - New Business - $1.8M",
      "AccountId": "001am00000qvju5AAA",
      "Amount": 1778300,
      "StageName": "Closed Lost",
      "IsClosed": true,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyVAAV"
      },
      "Id": "006am00000LcOyVAAV",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjtjAAA",
      "Amount": 1734000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyKAAV"
      },
      "Id": "006am00000LcOyKAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsbAAA",
      "Amount": 1717000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZxpAAH"
      },
      "Id": "006am00000KJZxpAAH",
      "Name": "Simon Says Legal - Cumulus Business Fundamentals Checking - New Business - $1.6M",
      "AccountId": "001am00000qvjuGAAQ",
      "Amount": 1644300,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJLQjAAP"
      },
      "Id": "006am00000KJLQjAAP",
      "Name": "CirrusCloud - Cumulus Equipment Loan",
      "AccountId": "001am00000qvjtaAAA",
      "Amount": 1363457,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXmMAAX"
      },
      "Id": "006am00000KJXmMAAX",
      "Name": "Mike Welch - Cumulus Managed Advisory",
      "AccountId": "001am00000qvjtNAAQ",
      "Amount": 1346000,
      "StageName": "Closed Lost",
      "IsClosed": true,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJMe3AAH"
      },
      "Id": "006am00000KJMe3AAH",
      "Name": "Duncan Macintosh - Cumulus Everyday Checking - New Business - $1.3M",
      "AccountId": "001am00000qvjt2AAA",
      "Amount": 1293300,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-06",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJQbDAAX"
      },
      "Id": "006am00000KJQbDAAX",
      "Name": "Frederick Simon - Cumulus Business Term Loan - New Business - $1.2M",
      "AccountId": "001am00000qvjthAAA",
      "Amount": 1238000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOHfAAP"
      },
      "Id": "006am00000KJOHfAAP",
      "Name": "Steve Sutherland - Cumulus Managed Advisory",
      "AccountId": "001am00000qvjtHAAQ",
      "Amount": 1233600,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYiPAAX"
      },
      "Id": "006am00000KJYiPAAX",
      "Name": "Mina Passini - Cumulus Everyday Checking - New Business - $1.2M",
      "AccountId": "001am00000qvjtPAAQ",
      "Amount": 1217700,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZGHAA5"
      },
      "Id": "006am00000KJZGHAA5",
      "Name": "Momentum Design - Cumulus Commercial Real Estate",
      "AccountId": "001am00000qvjsvAAA",
      "Amount": 1098686,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Partner",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYbyAAH"
      },
      "Id": "006am00000KJYbyAAH",
      "Name": "Q-Branch Demo Testing (Integrated Onboarding) - Cumulus Business Fundamentals Checking - New Business - $1.1M",
      "AccountId": "001am00000qvjtmAAA",
      "Amount": 1085400,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-07",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jFAAS"
      },
      "Id": "006am000005W2jFAAS",
      "Name": "Universal Services - Cumulus Remote Deposit Capture - New Business - $1.0M",
      "AccountId": "001am00000qvjsZAAQ",
      "Amount": 1000000,
      "StageName": "Loan Origination",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000GJt1BAAT"
      },
      "Id": "006am00000GJt1BAAT",
      "Name": "Julie Morris - Cumulus Statement Savings - New Business - $850K",
      "AccountId": "001am00000qvjsAAAQ",
      "Amount": 850000,
      "StageName": "Interested",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRU2AAP"
      },
      "Id": "006am00000KJRU2AAP",
      "Name": "Anne Frost - Cumulus 30 Year Fixed Mortgage",
      "AccountId": "001am00000qvjtTAAQ",
      "Amount": 774700,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXOBAA5"
      },
      "Id": "006am00000KJXOBAA5",
      "Name": "Levin Insurance Agency - Cumulus Business Fundamentals Checking - New Business - $757K",
      "AccountId": "001am00000qvjuDAAQ",
      "Amount": 757000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZUnAAP"
      },
      "Id": "006am00000KJZUnAAP",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Business Fundamentals Checking - New Business - $735K",
      "AccountId": "001am00000qvjtnAAA",
      "Amount": 735400,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-04",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZHtAAP"
      },
      "Id": "006am00000KJZHtAAP",
      "Name": "Momentum Design - Cumulus SBA Loan",
      "AccountId": "001am00000qvjsvAAA",
      "Amount": 725466,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-06",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ifAAC"
      },
      "Id": "006am000005W2ifAAC",
      "Name": "Julie Morris - Cumulus High-Yield Savings - New Business - $697K",
      "AccountId": "001am00000qvjsAAAQ",
      "Amount": 697000,
      "StageName": "Inerested",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYaLAAX"
      },
      "Id": "006am00000KJYaLAAX",
      "Name": "Mike Welch - Cumulus Everyday Checking - New Business - $646K",
      "AccountId": "001am00000qvjtNAAQ",
      "Amount": 646700,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJa2fAAD"
      },
      "Id": "006am00000KJa2fAAD",
      "Name": "The Blake Family Trust - Cumulus Business Term Loan",
      "AccountId": "001am00000qvjuJAAQ",
      "Amount": 590900,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJVcUAAX"
      },
      "Id": "006am00000KJVcUAAX",
      "Name": "Bennett Household - Cumulus Equipment Loan",
      "AccountId": "001am00000qvjtkAAA",
      "Amount": 524113,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJY5hAAH"
      },
      "Id": "006am00000KJY5hAAH",
      "Name": "Jon Allegri - Cumulus 30 Year Fixed Mortgage",
      "AccountId": "001am00000qvjtDAAQ",
      "Amount": 500300,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyAAAV"
      },
      "Id": "006am00000LcOyAAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsLAAQ",
      "Amount": 500000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jGAAS"
      },
      "Id": "006am000005W2jGAAS",
      "Name": "Advanced Communications - Cumulus Corporate Card - New Business - $500K",
      "AccountId": "001am00000qvjszAAA",
      "Amount": 500000,
      "StageName": "Approval",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-31",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2joAAC"
      },
      "Id": "006am000005W2joAAC",
      "Name": "Richard Bennett - Cumulus Everyday Checking - New Business - $500K",
      "AccountId": "001am00000qvjsBAAQ",
      "Amount": 500000,
      "StageName": "Underwriting Review",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZszAAH"
      },
      "Id": "006am00000KJZszAAH",
      "Name": "San Francisco School Board - Cumulus Business Fundamentals Checking - New Business - $496K",
      "AccountId": "001am00000qvjuEAAQ",
      "Amount": 496000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJWv8AAH"
      },
      "Id": "006am00000KJWv8AAH",
      "Name": "Windy City Non-Profit Board - Cumulus Business Fundamentals Checking - New Business - $472K",
      "AccountId": "001am00000qvjuFAAQ",
      "Amount": 472600,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyLAAV"
      },
      "Id": "006am00000LcOyLAAV",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjseAAA",
      "Amount": 429000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Kz8UzAAJ"
      },
      "Id": "006am00000Kz8UzAAJ",
      "Name": "Julie Morris - Cumulus 401k Rollover - New Business - $425K",
      "AccountId": "001am00000qvjsAAAQ",
      "Amount": 425000,
      "StageName": "Negotiation/Review",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4WCAAZ"
      },
      "Id": "006am00000Mm4WCAAZ",
      "Name": "SteelWorks Automation Suite",
      "AccountId": "001am00002Ce0l8AAB",
      "Amount": 420000,
      "StageName": "Closed Lost",
      "IsClosed": true,
      "IsWon": false,
      "CloseDate": "2026-02-28",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4WAAAZ"
      },
      "Id": "006am00000Mm4WAAAZ",
      "Name": "Green Energy Smart Grid",
      "AccountId": "001am00002Ce0l4AAB",
      "Amount": 380000,
      "StageName": "Negotiation/Review",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-10-31",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZo9AAH"
      },
      "Id": "006am00000KJZo9AAH",
      "Name": "Morris Family Trust - Cumulus Everyday Checking - New Business - $379K",
      "AccountId": "001am00000qvju4AAA",
      "Amount": 379400,
      "StageName": "Prospecting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-31",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyQAAV"
      },
      "Id": "006am00000LcOyQAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsmAAA",
      "Amount": 377000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJIP9AAP"
      },
      "Id": "006am00000KJIP9AAP",
      "Name": "Adena Commercial, LLC - Cumulus SBA Loan",
      "AccountId": "001am00000qvju5AAA",
      "Amount": 351600,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyIAAV"
      },
      "Id": "006am00000LcOyIAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjsYAAQ",
      "Amount": 351000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZjJAAX"
      },
      "Id": "006am00000KJZjJAAX",
      "Name": "Deloitte LLP - Cumulus Payment Processing",
      "AccountId": "001am00000qvju3AAA",
      "Amount": 338000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-05",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ibAAC"
      },
      "Id": "006am000005W2ibAAC",
      "Name": "Rachel Morris - Cumulus Statement Savings - Add-On Business - $300K",
      "AccountId": "001am00000qvjsCAAQ",
      "Amount": 300000,
      "StageName": "Underwriting Review",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Wally Slone",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJa13AAD"
      },
      "Id": "006am00000KJa13AAD",
      "Name": "Blake Household - Cumulus Corporate Card",
      "AccountId": "001am00000qvjuIAAQ",
      "Amount": 289200,
      "StageName": "Prospecting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOrBAAX"
      },
      "Id": "006am00000KJOrBAAX",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Equipment Loan",
      "AccountId": "001am00000qvjtrAAA",
      "Amount": 280800,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyTAAV"
      },
      "Id": "006am00000LcOyTAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjstAAA",
      "Amount": 275000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJa4HAAT"
      },
      "Id": "006am00000KJa4HAAT",
      "Name": "Blake Real Estate Holdings - Cumulus ACH Origination",
      "AccountId": "001am00000qvjuKAAQ",
      "Amount": 267000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-05",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyUAAV"
      },
      "Id": "006am00000LcOyUAAV",
      "Name": "Innovation Pipeline",
      "AccountId": "001am00000qvjszAAA",
      "Amount": 264000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZcrAAH"
      },
      "Id": "006am00000KJZcrAAH",
      "Name": "United Semiconductor - Cumulus Payment Processing",
      "AccountId": "001am00000qvjtzAAA",
      "Amount": 257800,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZD3AAP"
      },
      "Id": "006am00000KJZD3AAP",
      "Name": "Summit Resellers - Cumulus Corporate Card",
      "AccountId": "001am00000qvjscAAA",
      "Amount": 254500,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iRAAS"
      },
      "Id": "006am000005W2iRAAS",
      "Name": "Acme Partners - Cumulus Sweep Account - New Business - $250K",
      "AccountId": "001am00000qvjs5AAA",
      "Amount": 250000,
      "StageName": "Initial Due Diligence",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4W6AAJ"
      },
      "Id": "006am00000Mm4W6AAJ",
      "Name": "Global Industries ERP Integration",
      "AccountId": "001am00002Ce0l0AAB",
      "Amount": 250000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-09-15",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOrAAAX"
      },
      "Id": "006am00000KJOrAAAX",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus SBA Loan",
      "AccountId": "001am00000qvjtnAAA",
      "Amount": 235400,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j4AAC"
      },
      "Id": "006am000005W2j4AAC",
      "Name": "Salesforce.com, Inc. - Cumulus Business Analyzed Checking - New Business - $230K",
      "AccountId": "001am00000qvjtZAAQ",
      "Amount": 230000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-31",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXSzAAP"
      },
      "Id": "006am00000KJXSzAAP",
      "Name": "Heath Axworth - Cumulus 12Mo CD Renewal",
      "AccountId": "001am00000qvjt1AAA",
      "Amount": 224400,
      "StageName": "Prospecting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYAXAA5"
      },
      "Id": "006am00000KJYAXAA5",
      "Name": "Niki Sullivan - Cumulus HELOC",
      "AccountId": "001am00000qvjtEAAQ",
      "Amount": 216200,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZ6bAAH"
      },
      "Id": "006am00000KJZ6bAAH",
      "Name": "Christian Wolff - Cumulus 12Mo CD Renewal",
      "AccountId": "001am00000qvjtiAAA",
      "Amount": 215000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJPDuAAP"
      },
      "Id": "006am00000KJPDuAAP",
      "Name": "Stephen Blake - Cumulus HELOC",
      "AccountId": "001am00000qvjteAAA",
      "Amount": 212900,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-01",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJSwMAAX"
      },
      "Id": "006am00000KJSwMAAX",
      "Name": "Frederick Simon - Cumulus Business Fundamentals Checking - New Business - $212K",
      "AccountId": "001am00000qvjthAAA",
      "Amount": 212800,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-30",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXkjAAH"
      },
      "Id": "006am00000KJXkjAAH",
      "Name": "Mark Smith - Cumulus HELOC",
      "AccountId": "001am00000qvjt7AAA",
      "Amount": 206000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJN2EAAX"
      },
      "Id": "006am00000KJN2EAAX",
      "Name": "Heath Axworth - Cumulus HELOC",
      "AccountId": "001am00000qvjt1AAA",
      "Amount": 203600,
      "StageName": "Prospecting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXb3AAH"
      },
      "Id": "006am00000KJXb3AAH",
      "Name": "Gabe Hoskins - Cumulus 12Mo CD Renewal",
      "AccountId": "001am00000qvjt4AAA",
      "Amount": 200600,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZeTAAX"
      },
      "Id": "006am00000KJZeTAAX",
      "Name": "United Semiconductor - Cumulus SBA Loan",
      "AccountId": "001am00000qvjtzAAA",
      "Amount": 194900,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXj7AAH"
      },
      "Id": "006am00000KJXj7AAH",
      "Name": "Mark Smith - Cumulus 12Mo CD Renewal",
      "AccountId": "001am00000qvjt7AAA",
      "Amount": 194200,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYAYAA5"
      },
      "Id": "006am00000KJYAYAA5",
      "Name": "Sample Account for Entitlements - Cumulus Business Analyzed Checking - New Business - $178K",
      "AccountId": "001am00000qvjtpAAA",
      "Amount": 178945,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-02",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXUbAAP"
      },
      "Id": "006am00000KJXUbAAP",
      "Name": "Lance Gonzales - Cumulus HELOC",
      "AccountId": "001am00000qvjt3AAA",
      "Amount": 177600,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-07",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000LcOyGAAV"
      },
      "Id": "006am00000LcOyGAAV",
      "Name": "Revenue Diversification",
      "AccountId": "001am00000qvjsUAAQ",
      "Amount": 158000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4W7AAJ"
      },
      "Id": "006am00000Mm4W7AAJ",
      "Name": "Bright Horizon EMR System",
      "AccountId": "001am00002Ce0l1AAB",
      "Amount": 150000,
      "StageName": "Needs Analysis",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-31",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ieAAC"
      },
      "Id": "006am000005W2ieAAC",
      "Name": "Alex Cooper - Cumulus Everyday Checking - New Client - $150K",
      "AccountId": "001am00000qvjtbAAA",
      "Amount": 150000,
      "StageName": "Onboarding",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": "Marketing Event",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000GCsGMAA1"
      },
      "Id": "006am00000GCsGMAA1",
      "Name": "Julie Morris - Cumulus Personal Loan - New Business - $150K",
      "AccountId": "001am00000qvjsAAAQ",
      "Amount": 150000,
      "StageName": "Needs Analysis",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZubAAH"
      },
      "Id": "006am00000KJZubAAH",
      "Name": "San Francisco School Board - Cumulus Corporate Card",
      "AccountId": "001am00000qvjuEAAQ",
      "Amount": 147400,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-30",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYVVAA5"
      },
      "Id": "006am00000KJYVVAA5",
      "Name": "Tammy Baxter - Cumulus Everyday Checking",
      "AccountId": "001am00000qvjtLAAQ",
      "Amount": 136100,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJY7JAAX"
      },
      "Id": "006am00000KJY7JAAX",
      "Name": "Niki Sullivan - Cumulus 12Mo CD Renewal",
      "AccountId": "001am00000qvjtEAAQ",
      "Amount": 134300,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-31",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jUAAS"
      },
      "Id": "006am000005W2jUAAS",
      "Name": "Homeland Company - Cumulus Business Fundamentals Checking - Add-On Business - $130K",
      "AccountId": "001am00000qvjsfAAA",
      "Amount": 130000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-02",
      "LeadSource": "Marketing Event",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZzRAAX"
      },
      "Id": "006am00000KJZzRAAX",
      "Name": "Blake Household - Cumulus Payment Processing",
      "AccountId": "001am00000qvjuIAAQ",
      "Amount": 121600,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-02",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j3AAC"
      },
      "Id": "006am000005W2j3AAC",
      "Name": "Heroku, Inc. - Cumulus Business Analyzed Checking - New Business - $121K",
      "AccountId": "001am00000qvju0AAA",
      "Amount": 121000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-31",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jBAAS"
      },
      "Id": "006am000005W2jBAAS",
      "Name": "Associated Supply Co. - Cumulus Merchant Integration - Add-On Business - $121K",
      "AccountId": "001am00000qvjsbAAA",
      "Amount": 121000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4W9AAJ"
      },
      "Id": "006am00000Mm4W9AAJ",
      "Name": "Summit Financial Analytics",
      "AccountId": "001am00002Ce0l3AAB",
      "Amount": 120000,
      "StageName": "Proposal/Price Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-31",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iSAAS"
      },
      "Id": "006am000005W2iSAAS",
      "Name": "Permadyne GmbH, LTD - Cumulus Corporate Card - Add-On Business - $116K",
      "AccountId": "001am00000qvjslAAA",
      "Amount": 116000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-19",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJY8vAAH"
      },
      "Id": "006am00000KJY8vAAH",
      "Name": "Niki Sullivan - Cumulus Everyday Checking",
      "AccountId": "001am00000qvjtEAAQ",
      "Amount": 115500,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jMAAS"
      },
      "Id": "006am000005W2jMAAS",
      "Name": "Permadyne GmbH, LTD - Cumulus Business Term Loan - Add-On Business - $114K",
      "AccountId": "001am00000qvjslAAA",
      "Amount": 114000,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-10-24",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRU3AAP"
      },
      "Id": "006am00000KJRU3AAP",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Corporate Card",
      "AccountId": "001am00000qvjtsAAA",
      "Amount": 112900,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jLAAS"
      },
      "Id": "006am000005W2jLAAS",
      "Name": "UlyssesNet - Cumulus Lockbox Services - Add-On Business - $112K",
      "AccountId": "001am00000qvjskAAA",
      "Amount": 112000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-10-17",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0NxAAK"
      },
      "Id": "006am000005W0NxAAK",
      "Name": "AJC Corporation - Cumulus Business Term Loan - Add-On Business - $111K",
      "AccountId": "001am00000qvjsuAAA",
      "Amount": 111000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-04",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jCAAS"
      },
      "Id": "006am000005W2jCAAS",
      "Name": "Goodman Imports - Cumulus Corporate Card - New Business - $110K",
      "AccountId": "001am00000qvjsqAAA",
      "Amount": 110000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iYAAS"
      },
      "Id": "006am000005W2iYAAS",
      "Name": "Assurity Corporation - Cumulus Business Analyzed Checking - New Business - $110K",
      "AccountId": "001am00000qvjtvAAA",
      "Amount": 110000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-10-02",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jXAAS"
      },
      "Id": "006am000005W2jXAAS",
      "Name": "Vand Enterprises, Inc. - Cumulus Corporate Card - Services - $109K",
      "AccountId": "001am00000qvjsyAAA",
      "Amount": 109999.42,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-10",
      "LeadSource": "Marketing Event",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jKAAS"
      },
      "Id": "006am000005W2jKAAS",
      "Name": "Missoula & Sons Inc. - Cumulus Payment Processing - New Business - $109K",
      "AccountId": "001am00000qvjsVAAQ",
      "Amount": 109000,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-10-17",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jVAAS"
      },
      "Id": "006am000005W2jVAAS",
      "Name": "Red Studio Designs - Cumulus Wire Transfers - Add-On Business - $108K",
      "AccountId": "001am00000qvjsNAAQ",
      "Amount": 108000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-02",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jTAAS"
      },
      "Id": "006am000005W2jTAAS",
      "Name": "Green Fields Media - Cumulus Wire Transfers - Add-On Business - $105K",
      "AccountId": "001am00000qvjs8AAA",
      "Amount": 105000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-02",
      "LeadSource": "Marketing Event",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iZAAS"
      },
      "Id": "006am000005W2iZAAS",
      "Name": "Charlie Ellis - Cumulus Personal Loan",
      "AccountId": "001am00000qvjsDAAQ",
      "Amount": 100000,
      "StageName": "Verification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j6AAC"
      },
      "Id": "006am000005W2j6AAC",
      "Name": "Rachel Morris - Cumulus Everyday Checking - New Business - $100K",
      "AccountId": "001am00000qvjsCAAQ",
      "Amount": 100000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-30",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iqAAC"
      },
      "Id": "006am000005W2iqAAC",
      "Name": "UlyssesNet - Cumulus ACH Services - Services - $100K",
      "AccountId": "001am00000qvjskAAA",
      "Amount": 100000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-11-16",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iLAAS"
      },
      "Id": "006am000005W2iLAAS",
      "Name": "Aims Social, Inc. - Cumulus Corporate Card - New Business - $99K",
      "AccountId": "001am00000qvjsPAAQ",
      "Amount": 99000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ihAAC"
      },
      "Id": "006am000005W2ihAAC",
      "Name": "Goldfinch Bicycles - Cumulus ACH Services",
      "AccountId": "001am00000qvjsEAAQ",
      "Amount": 98300,
      "StageName": "Prospecting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jRAAS"
      },
      "Id": "006am000005W2jRAAS",
      "Name": "Southern Solutions - Cumulus Business Analyzed Checking - Add-On Business - $98K",
      "AccountId": "001am00000qvjsUAAQ",
      "Amount": 98000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-02",
      "LeadSource": "Marketing Event",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ilAAC"
      },
      "Id": "006am000005W2ilAAC",
      "Name": "Julie Morris - Cumulus Auto Loan - New Business - $98K",
      "AccountId": "001am00000qvjsAAAQ",
      "Amount": 98000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jPAAS"
      },
      "Id": "006am000005W2jPAAS",
      "Name": "Homeland Company - Cumulus Payment Processing - Add-On Business - $96K",
      "AccountId": "001am00000qvjsfAAA",
      "Amount": 96000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-30",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXO9AAP"
      },
      "Id": "006am00000KJXO9AAP",
      "Name": "Jen Hartley - Cumulus HELOC",
      "AccountId": "001am00000qvjsJAAQ",
      "Amount": 94600,
      "StageName": "Closed Lost",
      "IsClosed": true,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJVuEAAX"
      },
      "Id": "006am00000KJVuEAAX",
      "Name": "United Semiconductor - Cumulus ACH Services",
      "AccountId": "001am00000qvjtzAAA",
      "Amount": 92600,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-31",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jIAAS"
      },
      "Id": "006am000005W2jIAAS",
      "Name": "Roseburg Products - Cumulus Corporate Card - Add-On Business - $90K",
      "AccountId": "001am00000qvjsrAAA",
      "Amount": 90000,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-10",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jSAAS"
      },
      "Id": "006am000005W2jSAAS",
      "Name": "Tech Labs - Cumulus Business Analyzed Checking - Add-On Business - $90K",
      "AccountId": "001am00000qvjsMAAQ",
      "Amount": 90000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-02",
      "LeadSource": "Marketing Event",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRKMAA5"
      },
      "Id": "006am00000KJRKMAA5",
      "Name": "Nicole Grace - Cumulus Everyday Checking",
      "AccountId": "001am00000qvjtJAAQ",
      "Amount": 89400,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-02",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYIbAAP"
      },
      "Id": "006am00000KJYIbAAP",
      "Name": "Benjamin Young - Cumulus 529 Plan",
      "AccountId": "001am00000qvjtIAAQ",
      "Amount": 89400,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": "Community",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jWAAS"
      },
      "Id": "006am000005W2jWAAS",
      "Name": "Southern Solutions - Cumulus Wire Transfers - Add-On Business - $88K",
      "AccountId": "001am00000qvjsUAAQ",
      "Amount": 88000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-02",
      "LeadSource": "Marketing Event",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYKDAA5"
      },
      "Id": "006am00000KJYKDAA5",
      "Name": "Nicole Grace - Cumulus HELOC",
      "AccountId": "001am00000qvjtJAAQ",
      "Amount": 86900,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-31",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4WBAAZ"
      },
      "Id": "006am00000Mm4WBAAZ",
      "Name": "Pacific Retail POS Upgrade",
      "AccountId": "001am00002Ce0l5AAB",
      "Amount": 85000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-03-15",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jNAAS"
      },
      "Id": "006am000005W2jNAAS",
      "Name": "Haven Enterprises - Cumulus Payment Processing - Add-On Business - $84K",
      "AccountId": "001am00000qvjspAAA",
      "Amount": 84000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-10-12",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2j7AAC"
      },
      "Id": "006am000005W2j7AAC",
      "Name": "Pardot LLC - Cumulus Business Fundamentals Checking - New Business - $83K",
      "AccountId": "001am00000qvjtwAAA",
      "Amount": 83000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-05",
      "LeadSource": "Social Media",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iUAAS"
      },
      "Id": "006am000005W2iUAAS",
      "Name": "Advanced Communications - Cumulus Commercial Real Estate - Services - $80K",
      "AccountId": "001am00000qvjszAAA",
      "Amount": 80000,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-10",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYX7AAP"
      },
      "Id": "006am00000KJYX7AAP",
      "Name": "Tammy Baxter - Cumulus HELOC",
      "AccountId": "001am00000qvjtLAAQ",
      "Amount": 78200,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iyAAC"
      },
      "Id": "006am000005W2iyAAC",
      "Name": "Tech Labs - Cumulus Positive Pay - Add-On Business - $78K",
      "AccountId": "001am00000qvjsMAAQ",
      "Amount": 78000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-05-02",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYyXAAX"
      },
      "Id": "006am00000KJYyXAAX",
      "Name": "Olivia Blake - Cumulus 12Mo CD Renewal",
      "AccountId": "001am00000qvjtfAAA",
      "Amount": 77300,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXhWAAX"
      },
      "Id": "006am00000KJXhWAAX",
      "Name": "Jim Morris Estate - Cumulus Payment Processing",
      "AccountId": "001am00000qvju6AAA",
      "Amount": 75000,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-31",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000Mm4W5AAJ"
      },
      "Id": "006am00000Mm4W5AAJ",
      "Name": "Acme Platform Upgrade",
      "AccountId": "001am00002Ce0kzAAB",
      "Amount": 75000,
      "StageName": "Prospecting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-06-30",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jqAAC"
      },
      "Id": "006am000005W2jqAAC",
      "Name": "Morpon Brothers - Cumulus Business Term Loan - New Business - $75K",
      "AccountId": "001am00000qvjsYAAQ",
      "Amount": 75000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-09-06",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jQAAS"
      },
      "Id": "006am000005W2jQAAS",
      "Name": "Accusage, Inc. - Cumulus Business Term Loan - Services - $75K",
      "AccountId": "001am00000qvju7AAA",
      "Amount": 75000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-02",
      "LeadSource": "Marketing Event",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iIAAS"
      },
      "Id": "006am000005W2iIAAS",
      "Name": "Open Source Inc. - Cumulus Positive Pay - Services - $72K",
      "AccountId": "001am00000qvjshAAA",
      "Amount": 72000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-09-27",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYDlAAP"
      },
      "Id": "006am00000KJYDlAAP",
      "Name": "Bob Warkentine - Cumulus HELOC",
      "AccountId": "001am00000qvjtGAAQ",
      "Amount": 70800,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O0AAK"
      },
      "Id": "006am000005W0O0AAK",
      "Name": "Datanet, Inc. - Cumulus Wire Transfers - New Business - $70K",
      "AccountId": "001am00000qvjsOAAQ",
      "Amount": 70000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-29",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iTAAS"
      },
      "Id": "006am000005W2iTAAS",
      "Name": "Employnet - Cumulus Business Term Loan - New Business - $66K",
      "AccountId": "001am00000qvjsmAAA",
      "Amount": 66000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZmXAAX"
      },
      "Id": "006am00000KJZmXAAX",
      "Name": "Morris Family Trust - Cumulus Payment Processing",
      "AccountId": "001am00000qvju4AAA",
      "Amount": 65100,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-07",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2ioAAC"
      },
      "Id": "006am000005W2ioAAC",
      "Name": "Universal Services - Cumulus Cash Rewards Card - Add-On Business - $65K",
      "AccountId": "001am00000qvjsZAAQ",
      "Amount": 65000,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-11-13",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O8AAK"
      },
      "Id": "006am000005W0O8AAK",
      "Name": "Advanced Communications - Cumulus Wire Transfers - Add-On Business - $65K",
      "AccountId": "001am00000qvjszAAA",
      "Amount": 65000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-29",
      "LeadSource": "Social Media",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJV6PAAX"
      },
      "Id": "006am00000KJV6PAAX",
      "Name": "Troy Bullock - Cumulus HELOC",
      "AccountId": "001am00000qvjtAAAQ",
      "Amount": 64700,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jrAAC"
      },
      "Id": "006am000005W2jrAAC",
      "Name": "Employnet - Cumulus Business Line of Credit - Services - $64K",
      "AccountId": "001am00000qvjsmAAA",
      "Amount": 64000,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-09-10",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2izAAC"
      },
      "Id": "006am000005W2izAAC",
      "Name": "Associated Supply Co. - Cumulus ACH Origination - New Business - $64K",
      "AccountId": "001am00000qvjsbAAA",
      "Amount": 64000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-26",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jDAAS"
      },
      "Id": "006am000005W2jDAAS",
      "Name": "Green Fields Media - Cumulus Zero Balance Account - Add-On Business - $63K",
      "AccountId": "001am00000qvjs8AAA",
      "Amount": 63000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-10",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXftAAH"
      },
      "Id": "006am00000KJXftAAH",
      "Name": "Robert Simpson - Cumulus Everyday Checking",
      "AccountId": "001am00000qvjt5AAA",
      "Amount": 62100,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-31",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jpAAC"
      },
      "Id": "006am000005W2jpAAC",
      "Name": "Tech Labs - Cumulus Zero Balance Account - Add-On Business - $59K",
      "AccountId": "001am00000qvjsMAAQ",
      "Amount": 59000,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-09-02",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jHAAS"
      },
      "Id": "006am000005W2jHAAS",
      "Name": "General Utilities - Cumulus Positive Pay - Add-On Business - $58K",
      "AccountId": "001am00000qvjsXAAQ",
      "Amount": 58000,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0OCAA0"
      },
      "Id": "006am000005W0OCAA0",
      "Name": "Silodyne Company - Cumulus Business Term Loan - Add-On Business - $57K",
      "AccountId": "001am00000qvju9AAA",
      "Amount": 57000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-29",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJOHeAAP"
      },
      "Id": "006am00000KJOHeAAP",
      "Name": "Robert Janzen - Cumulus 12Mo CD Renewal",
      "AccountId": "001am00000qvjt0AAA",
      "Amount": 55900,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJKZ1AAP"
      },
      "Id": "006am00000KJKZ1AAP",
      "Name": "Peter Houston - Cumulus Auto Loan",
      "AccountId": "001am00000qvjt9AAA",
      "Amount": 55200,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-04",
      "LeadSource": "Partner",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0NyAAK"
      },
      "Id": "006am000005W0NyAAK",
      "Name": "Accusage, Inc. - Cumulus Remote Deposit Capture - Services - $55K",
      "AccountId": "001am00000qvju7AAA",
      "Amount": 55000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-29",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O9AAK"
      },
      "Id": "006am000005W0O9AAK",
      "Name": "Aims Social, Inc. - Cumulus Business Fundamentals Checking - Services - $55K",
      "AccountId": "001am00000qvjsPAAQ",
      "Amount": 55000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-29",
      "LeadSource": "Website",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYs5AAH"
      },
      "Id": "006am00000KJYs5AAH",
      "Name": "Jennifer Blake - Cumulus Auto Loan",
      "AccountId": "001am00000qvjtcAAA",
      "Amount": 54700,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-05",
      "LeadSource": "Partner",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iWAAS"
      },
      "Id": "006am000005W2iWAAS",
      "Name": "Silodyne Company - Cumulus Corporate Card - New Business - $54K",
      "AccountId": "001am00000qvju9AAA",
      "Amount": 54000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-04-12",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2irAAC"
      },
      "Id": "006am000005W2irAAC",
      "Name": "Tyconet - Cumulus ACH Origination - Add-On Business - $54K",
      "AccountId": "001am00000qvjsoAAA",
      "Amount": 54000,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-11-01",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jkAAC"
      },
      "Id": "006am000005W2jkAAC",
      "Name": "United Partners - Cumulus ACH Services - Add-On Business - $53K",
      "AccountId": "001am00000qvjtXAAQ",
      "Amount": 53000,
      "StageName": "Assessment Needed",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jjAAC"
      },
      "Id": "006am000005W2jjAAC",
      "Name": "United Partners - Cumulus Lockbox Services - Add-On Business - $53K",
      "AccountId": "001am00000qvjtXAAQ",
      "Amount": 53000,
      "StageName": "Assessment Needed",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jlAAC"
      },
      "Id": "006am000005W2jlAAC",
      "Name": "United Partners - Cumulus Positive Pay - Add-On Business - $53K",
      "AccountId": "001am00000qvjtXAAQ",
      "Amount": 53000,
      "StageName": "Assessment Needed",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-29",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2iVAAS"
      },
      "Id": "006am000005W2iVAAS",
      "Name": "United Partners - Cumulus Wire Transfers - Add-On Business - $53K",
      "AccountId": "001am00000qvjtXAAQ",
      "Amount": 53000,
      "StageName": "Assessment Needed",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2jiAAC"
      },
      "Id": "006am000005W2jiAAC",
      "Name": "UlyssesNet - Cumulus Positive Pay - New Business - $52K",
      "AccountId": "001am00000qvjskAAA",
      "Amount": 52000,
      "StageName": "Discovery",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-10-28",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJSgEAAX"
      },
      "Id": "006am00000KJSgEAAX",
      "Name": "Russell Hartman - Cumulus Auto Loan",
      "AccountId": "001am00000qvjtMAAQ",
      "Amount": 51100,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-30",
      "LeadSource": "Partner",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJXb4AAH"
      },
      "Id": "006am00000KJXb4AAH",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus Payment Processing",
      "AccountId": "001am00000qvjtnAAA",
      "Amount": 50600,
      "StageName": "Closed Lost",
      "IsClosed": true,
      "IsWon": false,
      "CloseDate": "2026-07-30",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O4AAK"
      },
      "Id": "006am000005W0O4AAK",
      "Name": "Permadyne GmbH, LTD - Cumulus Business Analyzed Checking - Add-On Business - $50K",
      "AccountId": "001am00000qvjslAAA",
      "Amount": 50000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-29",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W2inAAC"
      },
      "Id": "006am000005W2inAAC",
      "Name": "Southern Solutions - Cumulus Purchasing Card - Add-On Business - $50K",
      "AccountId": "001am00000qvjsUAAQ",
      "Amount": 50000,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-11-16",
      "LeadSource": null,
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0OBAA0"
      },
      "Id": "006am000005W0OBAA0",
      "Name": "Haven Enterprises - Cumulus Business Analyzed Checking - Services - $50K",
      "AccountId": "001am00000qvjspAAA",
      "Amount": 50000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-29",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJZZdAAP"
      },
      "Id": "006am00000KJZZdAAP",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account - Cumulus ACH Services",
      "AccountId": "001am00000qvjttAAA",
      "Amount": 50000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-07",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYvJAAX"
      },
      "Id": "006am00000KJYvJAAX",
      "Name": "Stephen Blake - Cumulus Personal Loan",
      "AccountId": "001am00000qvjteAAA",
      "Amount": 48500,
      "StageName": "Negotiation",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJRkAAAX"
      },
      "Id": "006am00000KJRkAAAX",
      "Name": "Russell Hartman - Cumulus Personal Loan",
      "AccountId": "001am00000qvjtMAAQ",
      "Amount": 48000,
      "StageName": "Proposal/Quote",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-06",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0O3AAK"
      },
      "Id": "006am000005W0O3AAK",
      "Name": "Vand Enterprises, Inc. - Cumulus SBA Loan - Services - $48K",
      "AccountId": "001am00000qvjsyAAA",
      "Amount": 48000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-29",
      "LeadSource": "Marketing Event",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJUdCAAX"
      },
      "Id": "006am00000KJUdCAAX",
      "Name": "Chip Colli - Cumulus Personal Loan",
      "AccountId": "001am00000qvjtFAAQ",
      "Amount": 47700,
      "StageName": "Prospecting",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-03",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJPDsAAP"
      },
      "Id": "006am00000KJPDsAAP",
      "Name": "Nigel Morris - Cumulus Personal Loan",
      "AccountId": "001am00000qvjsGAAQ",
      "Amount": 47200,
      "StageName": "Qualification",
      "IsClosed": false,
      "IsWon": false,
      "CloseDate": "2026-08-01",
      "LeadSource": "Inbound Call",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am00000KJYYjAAP"
      },
      "Id": "006am00000KJYYjAAP",
      "Name": "Russell Hartman - Cumulus Everyday Checking",
      "AccountId": "001am00000qvjtMAAQ",
      "Amount": 47000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-08-04",
      "LeadSource": "Referral",
      "OwnerId": "005am000003PbCLAA0"
    },
    {
      "attributes": {
        "type": "Opportunity",
        "url": "/services/data/v67.0/sobjects/Opportunity/006am000005W0NzAAK"
      },
      "Id": "006am000005W0NzAAK",
      "Name": "Allied Technologies - Cumulus Business Analyzed Checking - New Business - $47K",
      "AccountId": "001am00000qvjsdAAA",
      "Amount": 47000,
      "StageName": "Closed Won",
      "IsClosed": true,
      "IsWon": true,
      "CloseDate": "2026-07-29",
      "LeadSource": "Cold Call",
      "OwnerId": "005am000003PbCLAA0"
    }
  ],
  "tasks": [
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000VD9zhEAD"
      },
      "Id": "00Tam00000VD9zhEAD",
      "Subject": "Speak with Julie Morris about her daughter's 529 account",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-10-19",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsAAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000UdfoPEAR"
      },
      "Id": "00Tam00000UdfoPEAR",
      "Subject": "Follow up with Julie Morris - Business Loans",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-10-05",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsAAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000UPCuLEAX"
      },
      "Id": "00Tam00000UPCuLEAX",
      "Subject": "Follow up with Julie Morris - Business Loans",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-30",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsLAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Follow up with Julie Morris regarding business loan options for Morris Roasters, LLC."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000UNl3OEAT"
      },
      "Id": "00Tam00000UNl3OEAT",
      "Subject": "Follow up with Julie Morris regarding business loans",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-29",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsAAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TzFr3EAF"
      },
      "Id": "00Tam00000TzFr3EAF",
      "Subject": "Insurance Outreach - Alexis E Smith",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-24",
      "WhoId": "003am00000e7EhJAAU",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Tier 1 insurance campaign outreach. Discuss long-term care, whole life, and final expense insurance. Income $1.54M, age 69, married, 2 dependents, homeowner, 35% tax bracket. Urgency given age — insurability window narrowing. No existing policies on record."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TzFpREAV"
      },
      "Id": "00Tam00000TzFpREAV",
      "Subject": "Insurance Outreach - Bailey S White",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-24",
      "WhoId": "003am00000e7ZjUAAU",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Tier 1 insurance campaign outreach. Discuss life insurance, disability insurance, and long-term care. Income $1.53M, age 57, married, 3 dependents, homeowner, 35% tax bracket. Civil engineer — occupational disability coverage especially relevant. No existing policies on record."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TzFsfEAF"
      },
      "Id": "00Tam00000TzFsfEAF",
      "Subject": "Insurance Outreach - Alexis S Smith",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-24",
      "WhoId": "003am00000e7Zk8AAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Tier 1 insurance campaign outreach. Discuss long-term care, whole life, and final expense insurance. Income $1.54M, age 69, married, 2 dependents, homeowner, 35% tax bracket. Urgency given age — insurability window narrowing. No existing policies on record."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TzFmDEAV"
      },
      "Id": "00Tam00000TzFmDEAV",
      "Subject": "Insurance Outreach - Nigel E Morris",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-24",
      "WhoId": "003am000008yOmMAAU",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Tier 1 insurance campaign outreach. Discuss life insurance, umbrella liability, and long-term care. Income $8.6M, age 57, married, 2 dependents, homeowner, 37% tax bracket. No existing policies on record."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000Tz3DHEAZ"
      },
      "Id": "00Tam00000Tz3DHEAZ",
      "Subject": "Insurance Outreach - Bailey U White",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-24",
      "WhoId": "003am00000e7EgfAAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Tier 1 insurance campaign outreach. Discuss life insurance, disability insurance, and long-term care. Income $1.53M, age 57, married, 3 dependents, homeowner, 35% tax bracket. Civil engineer — occupational disability coverage especially relevant. No existing policies on record."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TyPXVEA3"
      },
      "Id": "00Tam00000TyPXVEA3",
      "Subject": "Follow up with Julie Morris - Business Loans",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-23",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsLAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Follow up with Julie Morris regarding business loan opportunities for Morris Roasters, LLC. Key items: Equipment Loan ($58K, closes Oct 17), Asset-Based Lending ($14K), and Syndicated Loan ($14K) currently in pipeline. Also discuss wallet share opportunity given low Roastery deposits vs. $10M revenue."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TyLwvEAF"
      },
      "Id": "00Tam00000TyLwvEAF",
      "Subject": "Follow up with Julie Morris - Business Loans",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-23",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsAAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000Txj8TEAR"
      },
      "Id": "00Tam00000Txj8TEAR",
      "Subject": "Follow up with Julie Morris - Business Loans",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-22",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsAAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Follow up with Julie E Morris regarding business loans."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TxhBWEAZ"
      },
      "Id": "00Tam00000TxhBWEAZ",
      "Subject": "Follow up with Julie Morris - Business Loans",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-22",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsAAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Follow up with Julie Morris regarding business loan opportunities for Morris Roasters, LLC. Key items: Equipment Loan ($58K), Asset-Based Lending ($14K), and Syndicated Loan ($14K) currently in pipeline. Also discuss wallet share opportunity given low Roastery deposits vs. $10M revenue."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TxaMxEAJ"
      },
      "Id": "00Tam00000TxaMxEAJ",
      "Subject": "Follow up with Julie Morris regarding business loans",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-22",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsLAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TjbqjEAB"
      },
      "Id": "00Tam00000TjbqjEAB",
      "Subject": "Discuss Commercial Real Estate Lending Opportunity",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-09-17",
      "WhoId": null,
      "WhatId": "001am00000qvjs6AAA",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Speak with Omega, Inc. about a potential Commercial Real Estate lending opportunity."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TybaHEAR"
      },
      "Id": "00Tam00000TybaHEAR",
      "Subject": "Call: Discuss brokerage account",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-09-16",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsAAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Call Julie E Morris to discuss her brokerage account."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIVXEA2"
      },
      "Id": "00Tam000004jIVXEA2",
      "Subject": "Call Rachel - Confirm close date",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-09-14",
      "WhoId": "003am000008yOmFAAU",
      "WhatId": "006am000005W2igAAC",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TiZarEAF"
      },
      "Id": "00Tam00000TiZarEAF",
      "Subject": "Speak to Julie Morris about latest HELOC offers",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-09-14",
      "WhoId": "003am00000htooSAAQ",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TiXu1EAF"
      },
      "Id": "00Tam00000TiXu1EAF",
      "Subject": "Call Julie Morris - 529 Options",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-09-09",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Call Julie Morris to discuss and present 529 plan options."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TRc6vEAD"
      },
      "Id": "00Tam00000TRc6vEAD",
      "Subject": "Review lending relationship",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-09-02",
      "WhoId": null,
      "WhatId": "001am00002AYQfoAAH",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Discuss next steps and confirm outstanding items."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TCGmfEAH"
      },
      "Id": "00Tam00000TCGmfEAH",
      "Subject": "Follow up with Omega, Inc. regarding Loan options",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-08-31",
      "WhoId": null,
      "WhatId": "001am00000qvjs6AAA",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000TDOjlEAH"
      },
      "Id": "00Tam00000TDOjlEAH",
      "Subject": "Call Julie Morris",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-08-31",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "001am00000qvjsAAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Follow up with Julie to confirm her interest in home insurance products, including homeowners coverage and earthquake rider. Reference the insurance gap analysis discussion."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIWGEA2"
      },
      "Id": "00Tam000004jIWGEA2",
      "Subject": "BDR on Julie Morris",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-08-24",
      "WhoId": null,
      "WhatId": "006am000005W2ifAAC",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIVUEA2"
      },
      "Id": "00Tam000004jIVUEA2",
      "Subject": "Complete KYC Approval (Manager)",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-08-24",
      "WhoId": "003am000008yOmFAAU",
      "WhatId": "001am00000qvju3AAA",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIVTEA2"
      },
      "Id": "00Tam000004jIVTEA2",
      "Subject": "Discuss mortgage options",
      "Status": "In Progress",
      "Priority": "Normal",
      "ActivityDate": "2026-08-24",
      "WhoId": "003am000008yOmFAAU",
      "WhatId": "006am000005W2ibAAC",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000Sr7hZEAR"
      },
      "Id": "00Tam00000Sr7hZEAR",
      "Subject": "Follow up with Omega, Inc. regarding Loan options",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-08-17",
      "WhoId": null,
      "WhatId": "001am00000qvjs6AAA",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000Sr6dREAR"
      },
      "Id": "00Tam00000Sr6dREAR",
      "Subject": "Follow up with Omega, Inc. regarding Loan options",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-08-17",
      "WhoId": null,
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Task for Jose Sifontes to follow up with Omega, Inc. regarding Loan options."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam000004jIVYEA2"
      },
      "Id": "00Tam000004jIVYEA2",
      "Subject": "Call Julie Morris about CD Opening Process",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-08-17",
      "WhoId": "003am000008yOmCAAU",
      "WhatId": "006am000005W2ifAAC",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000SqzNSEAZ"
      },
      "Id": "00Tam00000SqzNSEAZ",
      "Subject": "Send Loan Product Information to Omega, Inc.",
      "Status": "Not Started",
      "Priority": "Normal",
      "ActivityDate": "2026-08-17",
      "WhoId": null,
      "WhatId": "001am00000qvjs6AAA",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Follow up with Omega, Inc. contacts to share information on relevant Cumulus loan products including Business Term Loan, Business Line of Credit, SBA Loan Programs, and Equipment Financing options."
    },
    {
      "attributes": {
        "type": "Task",
        "url": "/services/data/v67.0/sobjects/Task/00Tam00000STbNREA1"
      },
      "Id": "00Tam00000STbNREA1",
      "Subject": "VIP Jumbo Mortgage Advisor Follow-Up",
      "Status": "Not Started",
      "Priority": "High",
      "ActivityDate": "2026-08-10",
      "WhoId": null,
      "WhatId": "001am00000qvjsAAAQ",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "High-priority Jumbo Mortgage follow-up.\n\nCustomer: Julie E Morris\nEmail: jmorris@example.com\nReason: The customer requested contact from an advisor about a Jumbo Mortgage.\nNext action: Review the Agentforce customer briefing and contact the customer promptly."
    }
  ],
  "events": [
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam00000LdwG9EAJ"
      },
      "Id": "00Uam00000LdwG9EAJ",
      "Subject": "Call — Omega, Inc.",
      "StartDateTime": "2026-09-16T21:30:00.000+0000",
      "EndDateTime": "2026-09-16T22:00:00.000+0000",
      "DurationInMinutes": 30,
      "WhoId": null,
      "WhatId": "001am00000qvjs6AAA",
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Resolve open items, review opportunity, set next step.",
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGT3EAM"
      },
      "Id": "00Uam000002nGT3EAM",
      "Subject": "Onsite Presentation to Executive Team",
      "StartDateTime": "2026-08-26T22:30:00.000+0000",
      "EndDateTime": "2026-08-27T00:30:00.000+0000",
      "DurationInMinutes": 120,
      "WhoId": "003am000008yOmvAAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGW3EAM"
      },
      "Id": "00Uam000002nGW3EAM",
      "Subject": "Review Social Listening and Identify Keywords",
      "StartDateTime": "2026-08-26T17:30:00.000+0000",
      "EndDateTime": "2026-08-26T18:00:00.000+0000",
      "DurationInMinutes": 30,
      "WhoId": "003am000008yOmAAAU",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGVxEAM"
      },
      "Id": "00Uam000002nGVxEAM",
      "Subject": "Internal: Review Pricing Structure",
      "StartDateTime": "2026-08-26T16:30:00.000+0000",
      "EndDateTime": "2026-08-26T18:00:00.000+0000",
      "DurationInMinutes": 90,
      "WhoId": "003am000008yOnQAAU",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGUqEAM"
      },
      "Id": "00Uam000002nGUqEAM",
      "Subject": "Left Voicemail: Introduction",
      "StartDateTime": "2026-08-26T16:30:00.000+0000",
      "EndDateTime": "2026-08-26T17:30:00.000+0000",
      "DurationInMinutes": 60,
      "WhoId": null,
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGUdEAM"
      },
      "Id": "00Uam000002nGUdEAM",
      "Subject": "Draft Mutual Plan",
      "StartDateTime": "2026-08-26T14:35:51.000+0000",
      "EndDateTime": "2026-08-26T15:05:51.000+0000",
      "DurationInMinutes": 30,
      "WhoId": "003am000008yOnsAAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGT1EAM"
      },
      "Id": "00Uam000002nGT1EAM",
      "Subject": "Review Ad Text Options for A/B Testing",
      "StartDateTime": "2026-08-25T22:30:00.000+0000",
      "EndDateTime": "2026-08-25T23:30:00.000+0000",
      "DurationInMinutes": 60,
      "WhoId": null,
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGTKEA2"
      },
      "Id": "00Uam000002nGTKEA2",
      "Subject": "Demo for the Sales Team",
      "StartDateTime": "2026-08-25T22:30:00.000+0000",
      "EndDateTime": "2026-08-26T00:30:00.000+0000",
      "DurationInMinutes": 120,
      "WhoId": "003am000008yOmyAAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGT5EAM"
      },
      "Id": "00Uam000002nGT5EAM",
      "Subject": "Volunteering - Business Skills Workshop",
      "StartDateTime": "2026-08-25T22:00:00.000+0000",
      "EndDateTime": "2026-08-25T23:00:00.000+0000",
      "DurationInMinutes": 60,
      "WhoId": "003am000008yOmvAAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGWOEA2"
      },
      "Id": "00Uam000002nGWOEA2",
      "Subject": "Internal team strategy meeting",
      "StartDateTime": "2026-08-25T21:30:00.000+0000",
      "EndDateTime": "2026-08-25T22:30:00.000+0000",
      "DurationInMinutes": 60,
      "WhoId": null,
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": "Conference Room 6",
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGRLEA2"
      },
      "Id": "00Uam000002nGRLEA2",
      "Subject": "Discuss Next Steps",
      "StartDateTime": "2026-08-25T21:00:00.000+0000",
      "EndDateTime": "2026-08-25T21:30:00.000+0000",
      "DurationInMinutes": 30,
      "WhoId": null,
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGTWEA2"
      },
      "Id": "00Uam000002nGTWEA2",
      "Subject": "Demo",
      "StartDateTime": "2026-08-25T20:30:00.000+0000",
      "EndDateTime": "2026-08-25T21:30:00.000+0000",
      "DurationInMinutes": 60,
      "WhoId": "003am000008yOn1AAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGWeEAM"
      },
      "Id": "00Uam000002nGWeEAM",
      "Subject": "Meeting w/ VP Sales",
      "StartDateTime": "2026-08-25T20:30:00.000+0000",
      "EndDateTime": "2026-08-25T21:30:00.000+0000",
      "DurationInMinutes": 60,
      "WhoId": "003am000008yOm5AAE",
      "WhatId": "001am00000qvjs6AAA",
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": "Onsite at Customer",
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGUaEAM"
      },
      "Id": "00Uam000002nGUaEAM",
      "Subject": "Design Social Command Center Requirements",
      "StartDateTime": "2026-08-25T20:00:00.000+0000",
      "EndDateTime": "2026-08-25T20:30:00.000+0000",
      "DurationInMinutes": 30,
      "WhoId": "003am000008yOnrAAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGSuEAM"
      },
      "Id": "00Uam000002nGSuEAM",
      "Subject": "Left Voicemail: Update",
      "StartDateTime": "2026-08-25T19:30:00.000+0000",
      "EndDateTime": "2026-08-25T21:00:00.000+0000",
      "DurationInMinutes": 90,
      "WhoId": "003am000008yOnpAAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGSaEAM"
      },
      "Id": "00Uam000002nGSaEAM",
      "Subject": "Cold Call with Prospect",
      "StartDateTime": "2026-08-25T17:30:00.000+0000",
      "EndDateTime": "2026-08-25T18:00:00.000+0000",
      "DurationInMinutes": 30,
      "WhoId": null,
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGUiEAM"
      },
      "Id": "00Uam000002nGUiEAM",
      "Subject": "Reserve Venue for Customer Conference",
      "StartDateTime": "2026-08-25T17:30:00.000+0000",
      "EndDateTime": "2026-08-25T18:30:00.000+0000",
      "DurationInMinutes": 60,
      "WhoId": "003am000008yOn7AAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGRqEAM"
      },
      "Id": "00Uam000002nGRqEAM",
      "Subject": "Work on RFP",
      "StartDateTime": "2026-08-25T17:00:00.000+0000",
      "EndDateTime": "2026-08-25T19:00:00.000+0000",
      "DurationInMinutes": 120,
      "WhoId": null,
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGS3EAM"
      },
      "Id": "00Uam000002nGS3EAM",
      "Subject": "Discovery Meeting",
      "StartDateTime": "2026-08-25T14:35:51.000+0000",
      "EndDateTime": "2026-08-25T15:35:51.000+0000",
      "DurationInMinutes": 60,
      "WhoId": null,
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": "Get a better understanding of this customer's challenges and start considering solutions that might need their needs.",
      "Location": null,
      "ShowAs": "Busy"
    },
    {
      "attributes": {
        "type": "Event",
        "url": "/services/data/v67.0/sobjects/Event/00Uam000002nGVLEA2"
      },
      "Id": "00Uam000002nGVLEA2",
      "Subject": "Internal: Review Pricing Structure",
      "StartDateTime": "2026-08-24T23:30:00.000+0000",
      "EndDateTime": "2026-08-25T00:00:00.000+0000",
      "DurationInMinutes": 30,
      "WhoId": "003am000008yOmjAAE",
      "WhatId": null,
      "OwnerId": "005am000003PbCLAA0",
      "Description": null,
      "Location": null,
      "ShowAs": "Busy"
    }
  ],
  "references": [
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9j8rAAB"
      },
      "Id": "001am00002A9j8rAAB",
      "Name": "Brandon D Ward",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": "swhite@example.org",
      "PersonContactId": "003am00000e7EiQAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AAAK9AAP"
      },
      "Id": "001am00002AAAK9AAP",
      "Name": "Ryan B Stewart",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": "kevin86@example.org",
      "PersonContactId": "003am00000e7ZbCAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AAALRAA5"
      },
      "Id": "001am00002AAALRAA5",
      "Name": "Justin W Turner",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": "hernandezphilip@example.net",
      "PersonContactId": "003am00000e7ZcUAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYR1IAAX"
      },
      "Id": "001am00002AYR1IAAX",
      "Name": "Lisa C Smith",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": "nguyenpenny@example.net",
      "PersonContactId": "003am00000eO7raAAC"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjs5AAA"
      },
      "Id": "001am00000qvjs5AAA",
      "Name": "Acme Partners",
      "OwnerId": "005am000003PYsvAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsHAAQ"
      },
      "Id": "001am00000qvjsHAAQ",
      "Name": "Harry P Gray",
      "OwnerId": "005am000003PYssAAG",
      "PersonEmail": "harry.gray@cumulusfsc.com",
      "PersonContactId": "003am000008yOmNAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsIAAQ"
      },
      "Id": "001am00000qvjsIAAQ",
      "Name": "Will H Johnson",
      "OwnerId": "005am000003PYsqAAG",
      "PersonEmail": "will.johnson@cumulusfsc.com",
      "PersonContactId": "003am000008yOmOAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsOAAQ"
      },
      "Id": "001am00000qvjsOAAQ",
      "Name": "Datanet, Inc.",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsPAAQ"
      },
      "Id": "001am00000qvjsPAAQ",
      "Name": "Aims Social, Inc.",
      "OwnerId": "005am000003PbFEAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsQAAQ"
      },
      "Id": "001am00000qvjsQAAQ",
      "Name": "Universal Containers",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsTAAQ"
      },
      "Id": "001am00000qvjsTAAQ",
      "Name": "Opportunity Resources Inc",
      "OwnerId": "005am000003PYuLAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsXAAQ"
      },
      "Id": "001am00000qvjsXAAQ",
      "Name": "General Utilities",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsZAAQ"
      },
      "Id": "001am00000qvjsZAAQ",
      "Name": "Universal Services",
      "OwnerId": "005am000003PYtqAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsaAAA"
      },
      "Id": "001am00000qvjsaAAA",
      "Name": "Anaco Limited",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsfAAA"
      },
      "Id": "001am00000qvjsfAAA",
      "Name": "Homeland Company",
      "OwnerId": "005am000003PYuLAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjshAAA"
      },
      "Id": "001am00000qvjshAAA",
      "Name": "Open Source Inc.",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjslAAA"
      },
      "Id": "001am00000qvjslAAA",
      "Name": "Permadyne GmbH, LTD",
      "OwnerId": "005am000003PbFHAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjspAAA"
      },
      "Id": "001am00000qvjspAAA",
      "Name": "Haven Enterprises",
      "OwnerId": "005am000003PbFFAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsqAAA"
      },
      "Id": "001am00000qvjsqAAA",
      "Name": "Goodman Imports",
      "OwnerId": "005am000003PYtsAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsuAAA"
      },
      "Id": "001am00000qvjsuAAA",
      "Name": "AJC Corporation",
      "OwnerId": "005am000003PYuLAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjswAAA"
      },
      "Id": "001am00000qvjswAAA",
      "Name": "Wellspring, Inc.",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtCAAQ"
      },
      "Id": "001am00000qvjtCAAQ",
      "Name": "Kari H Rende",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": "krende@example.com",
      "PersonContactId": "003am000008yOo5AAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtVAAQ"
      },
      "Id": "001am00000qvjtVAAQ",
      "Name": "CCAnonymous",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtXAAQ"
      },
      "Id": "001am00000qvjtXAAQ",
      "Name": "United Partners",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtYAAQ"
      },
      "Id": "001am00000qvjtYAAQ",
      "Name": "Lazard Middle Market LLC",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtaAAA"
      },
      "Id": "001am00000qvjtaAAA",
      "Name": "CirrusCloud",
      "OwnerId": "005am000003PbFBAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtkAAA"
      },
      "Id": "001am00000qvjtkAAA",
      "Name": "Bennett Household",
      "OwnerId": "005am000003PbFHAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtqAAA"
      },
      "Id": "001am00000qvjtqAAA",
      "Name": "Biospan, LLC.",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtrAAA"
      },
      "Id": "001am00000qvjtrAAA",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account",
      "OwnerId": "005am000003PYsqAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtsAAA"
      },
      "Id": "001am00000qvjtsAAA",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account",
      "OwnerId": "005am000003PYssAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjttAAA"
      },
      "Id": "001am00000qvjttAAA",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtuAAA"
      },
      "Id": "001am00000qvjtuAAA",
      "Name": "IDO House Account",
      "OwnerId": "005am000003PYstAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtyAAA"
      },
      "Id": "001am00000qvjtyAAA",
      "Name": "United Technologies Corporation",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvju2AAA"
      },
      "Id": "001am00000qvju2AAA",
      "Name": "Frank Household",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvju4AAA"
      },
      "Id": "001am00000qvju4AAA",
      "Name": "Morris Family Trust",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvju6AAA"
      },
      "Id": "001am00000qvju6AAA",
      "Name": "Jim Morris Estate",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjuBAAQ"
      },
      "Id": "001am00000qvjuBAAQ",
      "Name": "Amptech Corporation",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjuIAAQ"
      },
      "Id": "001am00000qvjuIAAQ",
      "Name": "Blake Household",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjuJAAQ"
      },
      "Id": "001am00000qvjuJAAQ",
      "Name": "The Blake Family Trust",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjuKAAQ"
      },
      "Id": "001am00000qvjuKAAQ",
      "Name": "Blake Real Estate Holdings",
      "OwnerId": "005am000003PbFFAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002A9iqwAAB"
      },
      "Id": "001am00002A9iqwAAB",
      "Name": "Anna C Wood",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": "nathan26@example.org",
      "PersonContactId": "003am00000e7EaBAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA9JWAA1"
      },
      "Id": "001am00002AA9JWAA1",
      "Name": "Matthew P Stein",
      "OwnerId": "005am000006ffBpAAI",
      "PersonEmail": "lynchlaura@example.org",
      "PersonContactId": "003am00000e7YYxAAM"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA9TXAA1"
      },
      "Id": "001am00002AA9TXAA1",
      "Name": "John K Villarreal",
      "OwnerId": "005am000006ffBpAAI",
      "PersonEmail": "bpierce@example.org",
      "PersonContactId": "003am00000e7YhMAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA9YGAA1"
      },
      "Id": "001am00002AA9YGAA1",
      "Name": "Derek L Craig",
      "OwnerId": "005am000003PbFBAA0",
      "PersonEmail": "vwells@example.net",
      "PersonContactId": "003am00000e7Ym5AAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AA9thAAD"
      },
      "Id": "001am00002AA9thAAD",
      "Name": "Anthony R Garcia",
      "OwnerId": "005am000006ffBpAAI",
      "PersonEmail": "rsantos@example.com",
      "PersonContactId": "003am00000e7ZAkAAM"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AAA5yAAH"
      },
      "Id": "001am00002AAA5yAAH",
      "Name": "Ronald W Mendoza",
      "OwnerId": "005am000006ffBpAAI",
      "PersonEmail": "pperez@example.com",
      "PersonContactId": "003am00000e7ZOdAAM"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsBAAQ"
      },
      "Id": "001am00000qvjsBAAQ",
      "Name": "Richard F Bennett",
      "OwnerId": "005am000003PYsqAAG",
      "PersonEmail": "rbennett@example.com",
      "PersonContactId": "003am000008yOmEAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsCAAQ"
      },
      "Id": "001am00000qvjsCAAQ",
      "Name": "Rachel E Morris",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": "rachel@sample.com",
      "PersonContactId": "003am000008yOmFAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsLAAQ"
      },
      "Id": "001am00000qvjsLAAQ",
      "Name": "Morris Roasters, LLC",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsNAAQ"
      },
      "Id": "001am00000qvjsNAAQ",
      "Name": "Red Studio Designs",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsUAAQ"
      },
      "Id": "001am00000qvjsUAAQ",
      "Name": "Southern Solutions",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsYAAQ"
      },
      "Id": "001am00000qvjsYAAQ",
      "Name": "Morpon Brothers",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsbAAA"
      },
      "Id": "001am00000qvjsbAAA",
      "Name": "Associated Supply Co.",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjscAAA"
      },
      "Id": "001am00000qvjscAAA",
      "Name": "Summit Resellers",
      "OwnerId": "005am000003PYsvAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjseAAA"
      },
      "Id": "001am00000qvjseAAA",
      "Name": "Big Sky & Sons",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjskAAA"
      },
      "Id": "001am00000qvjskAAA",
      "Name": "UlyssesNet",
      "OwnerId": "005am000003PYtsAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsmAAA"
      },
      "Id": "001am00000qvjsmAAA",
      "Name": "Employnet",
      "OwnerId": "005am000003PbFHAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjstAAA"
      },
      "Id": "001am00000qvjstAAA",
      "Name": "Harmon Consulting",
      "OwnerId": "005am000003PbFHAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsvAAA"
      },
      "Id": "001am00000qvjsvAAA",
      "Name": "Momentum Design",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjszAAA"
      },
      "Id": "001am00000qvjszAAA",
      "Name": "Advanced Communications",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjt1AAA"
      },
      "Id": "001am00000qvjt1AAA",
      "Name": "Heath C Axworth",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": "haxworth@example.com",
      "PersonContactId": "003am000008yOnuAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjt2AAA"
      },
      "Id": "001am00000qvjt2AAA",
      "Name": "Duncan L Macintosh",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": "dmacintosh@example.com",
      "PersonContactId": "003am000008yOnvAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjt3AAA"
      },
      "Id": "001am00000qvjt3AAA",
      "Name": "Lance U Gonzales",
      "OwnerId": "005am000003PbFFAA0",
      "PersonEmail": "lgonzales@example.com",
      "PersonContactId": "003am000008yOnwAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjt4AAA"
      },
      "Id": "001am00000qvjt4AAA",
      "Name": "Gabe X Hoskins",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": "ghoskins@example.com",
      "PersonContactId": "003am000008yOnxAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjt7AAA"
      },
      "Id": "001am00000qvjt7AAA",
      "Name": "Mark S Smith",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": "msmith@example.com",
      "PersonContactId": "003am000008yOo0AAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtDAAQ"
      },
      "Id": "001am00000qvjtDAAQ",
      "Name": "Jon Q Allegri",
      "OwnerId": "005am000003PYsqAAG",
      "PersonEmail": "jallegri@example.com",
      "PersonContactId": "003am000008yOo6AAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtEAAQ"
      },
      "Id": "001am00000qvjtEAAQ",
      "Name": "Niki V Sullivan",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": "nsullivan@example.com",
      "PersonContactId": "003am000008yOo7AAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtHAAQ"
      },
      "Id": "001am00000qvjtHAAQ",
      "Name": "Steve B Sutherland",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": "ssutherland@example.com",
      "PersonContactId": "003am000008yOoAAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtLAAQ"
      },
      "Id": "001am00000qvjtLAAQ",
      "Name": "Tammy Z Baxter",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": "tbaxter@example.com",
      "PersonContactId": "003am000008yOoEAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtNAAQ"
      },
      "Id": "001am00000qvjtNAAQ",
      "Name": "Mike W Welch",
      "OwnerId": "005am000003PbFFAA0",
      "PersonEmail": "mwelch@example.com",
      "PersonContactId": "003am000008yOoGAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtPAAQ"
      },
      "Id": "001am00000qvjtPAAQ",
      "Name": "Mina K Passini",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": "mpassini@example.com",
      "PersonContactId": "003am000008yOoIAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtSAAQ"
      },
      "Id": "001am00000qvjtSAAQ",
      "Name": "Andy N Peterson",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": "apeterson@example.com",
      "PersonContactId": "003am000008yOoLAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtTAAQ"
      },
      "Id": "001am00000qvjtTAAQ",
      "Name": "Anne I Frost",
      "OwnerId": "005am000003PbFFAA0",
      "PersonEmail": "afrost@example.com",
      "PersonContactId": "003am000008yOoMAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtZAAQ"
      },
      "Id": "001am00000qvjtZAAQ",
      "Name": "Salesforce.com, Inc.",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtbAAA"
      },
      "Id": "001am00000qvjtbAAA",
      "Name": "Alex E Cooper",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": "alexcooper@example.com",
      "PersonContactId": "003am000008yOokAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjteAAA"
      },
      "Id": "001am00000qvjteAAA",
      "Name": "Stephen L Blake",
      "OwnerId": "005am000003PbFFAA0",
      "PersonEmail": "sblake@example.com",
      "PersonContactId": "003am000008yOonAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjthAAA"
      },
      "Id": "001am00000qvjthAAA",
      "Name": "Frederick P Simon",
      "OwnerId": "005am000003PbFFAA0",
      "PersonEmail": "fsimon@example.com",
      "PersonContactId": "003am000008yOoqAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtiAAA"
      },
      "Id": "001am00000qvjtiAAA",
      "Name": "Christian A Wolff",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": "cwolff@example.com",
      "PersonContactId": "003am000008yOorAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtjAAA"
      },
      "Id": "001am00000qvjtjAAA",
      "Name": "Morris Household",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtmAAA"
      },
      "Id": "001am00000qvjtmAAA",
      "Name": "Q-Branch Demo Testing (Integrated Onboarding)",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtnAAA"
      },
      "Id": "001am00000qvjtnAAA",
      "Name": "B2B Commerce Lightning Experience Guest Buyer Account",
      "OwnerId": "005am000003PYsqAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtpAAA"
      },
      "Id": "001am00000qvjtpAAA",
      "Name": "Sample Account for Entitlements",
      "OwnerId": "005am000003PYsqAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtvAAA"
      },
      "Id": "001am00000qvjtvAAA",
      "Name": "Assurity Corporation",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtzAAA"
      },
      "Id": "001am00000qvjtzAAA",
      "Name": "United Semiconductor",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvju0AAA"
      },
      "Id": "001am00000qvju0AAA",
      "Name": "Heroku, Inc.",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvju3AAA"
      },
      "Id": "001am00000qvju3AAA",
      "Name": "Delone LLP",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvju5AAA"
      },
      "Id": "001am00000qvju5AAA",
      "Name": "Adena Commercial, LLC",
      "OwnerId": "005am000003PYtqAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjuDAAQ"
      },
      "Id": "001am00000qvjuDAAQ",
      "Name": "Levin Insurance Agency",
      "OwnerId": "005am000003PbFEAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjuEAAQ"
      },
      "Id": "001am00000qvjuEAAQ",
      "Name": "San Francisco School Board",
      "OwnerId": "005am000003PbFEAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjuFAAQ"
      },
      "Id": "001am00000qvjuFAAQ",
      "Name": "Windy City Non-Profit Board",
      "OwnerId": "005am000003PbFEAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjuGAAQ"
      },
      "Id": "001am00000qvjuGAAQ",
      "Name": "Simon Says Legal",
      "OwnerId": "005am000003PbFBAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjs6AAA"
      },
      "Id": "001am00000qvjs6AAA",
      "Name": "Omega, Inc.",
      "OwnerId": "005am000003PbFHAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjs8AAA"
      },
      "Id": "001am00000qvjs8AAA",
      "Name": "Green Fields Media",
      "OwnerId": "005am000003PYuLAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsDAAQ"
      },
      "Id": "001am00000qvjsDAAQ",
      "Name": "Charlie T Ellis",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": "cellis@example.com",
      "PersonContactId": "003am000008yOmGAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsEAAQ"
      },
      "Id": "001am00000qvjsEAAQ",
      "Name": "Goldfinch Bicycles",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsGAAQ"
      },
      "Id": "001am00000qvjsGAAQ",
      "Name": "Nigel E Morris",
      "OwnerId": "005am000003PYstAAG",
      "PersonEmail": "nigel.morris@gmail.com",
      "PersonContactId": "003am000008yOmMAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsJAAQ"
      },
      "Id": "001am00000qvjsJAAQ",
      "Name": "Jen B Hartley",
      "OwnerId": "005am000003PYssAAG",
      "PersonEmail": "jen@example.com",
      "PersonContactId": "003am000008yOmPAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsMAAQ"
      },
      "Id": "001am00000qvjsMAAQ",
      "Name": "Tech Labs",
      "OwnerId": "005am000003PbFHAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsVAAQ"
      },
      "Id": "001am00000qvjsVAAQ",
      "Name": "Missoula & Sons Inc.",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsdAAA"
      },
      "Id": "001am00000qvjsdAAA",
      "Name": "Allied Technologies",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsoAAA"
      },
      "Id": "001am00000qvjsoAAA",
      "Name": "Tyconet",
      "OwnerId": "005am000003PYtnAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsrAAA"
      },
      "Id": "001am00000qvjsrAAA",
      "Name": "Roseburg Products",
      "OwnerId": "005am000003PYtqAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjsyAAA"
      },
      "Id": "001am00000qvjsyAAA",
      "Name": "Vand Enterprises, Inc.",
      "OwnerId": "005am000003PYuLAAW",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjt0AAA"
      },
      "Id": "001am00000qvjt0AAA",
      "Name": "Robert Z Janzen",
      "OwnerId": "005am000003PYuMAAW",
      "PersonEmail": "rjanzen@example.com",
      "PersonContactId": "003am000008yOntAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjt5AAA"
      },
      "Id": "001am00000qvjt5AAA",
      "Name": "Robert F Simpson",
      "OwnerId": "005am000003PbFFAA0",
      "PersonEmail": "rsimpson@example.com",
      "PersonContactId": "003am000008yOnyAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjt9AAA"
      },
      "Id": "001am00000qvjt9AAA",
      "Name": "Peter K Houston",
      "OwnerId": "005am000003PbFCAA0",
      "PersonEmail": "phouston@example.com",
      "PersonContactId": "003am000008yOo2AAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtAAAQ"
      },
      "Id": "001am00000qvjtAAAQ",
      "Name": "Troy U Bullock",
      "OwnerId": "005am000003PYuLAAW",
      "PersonEmail": "tbullock@example.com",
      "PersonContactId": "003am000008yOo3AAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtFAAQ"
      },
      "Id": "001am00000qvjtFAAQ",
      "Name": "Chip G Colli",
      "OwnerId": "005am000003PbFCAA0",
      "PersonEmail": "ccolli@example.com",
      "PersonContactId": "003am000008yOo8AAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtGAAQ"
      },
      "Id": "001am00000qvjtGAAQ",
      "Name": "Bob S Warkentine",
      "OwnerId": "005am000003PYuLAAW",
      "PersonEmail": "bwarkentine@example.com",
      "PersonContactId": "003am000008yOo9AAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtIAAQ"
      },
      "Id": "001am00000qvjtIAAQ",
      "Name": "Benjamin A Young",
      "OwnerId": "005am000003PbFAAA0",
      "PersonEmail": "byoung@example.com",
      "PersonContactId": "003am000008yOoBAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtJAAQ"
      },
      "Id": "001am00000qvjtJAAQ",
      "Name": "Nicole C Grace",
      "OwnerId": "005am000003PYsqAAG",
      "PersonEmail": "ngrace@example.com",
      "PersonContactId": "003am000008yOoCAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtMAAQ"
      },
      "Id": "001am00000qvjtMAAQ",
      "Name": "Russell B Hartman",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": "whardin@example.com",
      "PersonContactId": "003am000008yOoFAAU"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtcAAA"
      },
      "Id": "001am00000qvjtcAAA",
      "Name": "Jennifer C Blake",
      "OwnerId": "005am000003PbFGAA0",
      "PersonEmail": "jblake1234@example.com",
      "PersonContactId": "003am000008yOolAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtfAAA"
      },
      "Id": "001am00000qvjtfAAA",
      "Name": "Olivia I Blake",
      "OwnerId": "005am000003PbFCAA0",
      "PersonEmail": "oblake@example.com",
      "PersonContactId": "003am000008yOooAAE"
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvjtwAAA"
      },
      "Id": "001am00000qvjtwAAA",
      "Name": "Pardot LLC",
      "OwnerId": "005am000003PbFBAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvju7AAA"
      },
      "Id": "001am00000qvju7AAA",
      "Name": "Accusage, Inc.",
      "OwnerId": "005am000003PYtsAAG",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00000qvju9AAA"
      },
      "Id": "001am00000qvju9AAA",
      "Name": "Silodyne Company",
      "OwnerId": "005am000003PbFDAA0",
      "PersonEmail": null,
      "PersonContactId": null
    },
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v67.0/sobjects/Account/001am00002AYQfoAAH"
      },
      "Id": "001am00002AYQfoAAH",
      "Name": "Mark C Robinson",
      "OwnerId": "005am000003PbFBAA0",
      "PersonEmail": "olivia70@example.org",
      "PersonContactId": "003am00000eO7XiAAK"
    }
  ],
  "offers": [
    {
      "account": "001am000026ZtgIAAS",
      "code": "MTG-JMB",
      "rank": null,
      "probability": 9.57,
      "value": 338,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgIAAS",
      "code": "IRA-ROL",
      "rank": null,
      "probability": 33.47,
      "value": 240.08,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgIAAS",
      "code": "HEL-ACQ",
      "rank": null,
      "probability": 12.97,
      "value": 126.83,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgIAAS",
      "code": "WM-CASH",
      "rank": null,
      "probability": 17.44,
      "value": 76.32,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgIAAS",
      "code": "PCHK-ACQ",
      "rank": null,
      "probability": 13.24,
      "value": 44.88,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgIAAS",
      "code": "IRA-RTH",
      "rank": 4,
      "probability": 10.28,
      "value": 10.29,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgIAAS",
      "code": "WM-MAS",
      "rank": 2,
      "probability": 23.36,
      "value": 1313.43,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am00000qvjsAAAQ",
      "code": "PCHK-ACQ",
      "rank": 5,
      "probability": 14.71,
      "value": 56.83,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am00000qvjsAAAQ",
      "code": "IRA-ROL",
      "rank": null,
      "probability": 41.17,
      "value": 309.76,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am00000qvjsAAAQ",
      "code": "MTG-JMB",
      "rank": null,
      "probability": 8.29,
      "value": 120,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am00000qvjsAAAQ",
      "code": "WM-CASH",
      "rank": null,
      "probability": 20.3,
      "value": 104.76,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am00000qvjsAAAQ",
      "code": "WM-MAS",
      "rank": null,
      "probability": 21.05,
      "value": 510.49,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am00000qvjsAAAQ",
      "code": "HEL-ACQ",
      "rank": 1,
      "probability": 18.67,
      "value": 1256.8,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgNAAS",
      "code": "IRA-ROL",
      "rank": 1,
      "probability": 36.15,
      "value": 768.59,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgNAAS",
      "code": "MTG-JMB",
      "rank": null,
      "probability": 9.39,
      "value": 233.5,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgNAAS",
      "code": "WM-CASH",
      "rank": null,
      "probability": 16.54,
      "value": 81.06,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgNAAS",
      "code": "HEL-ACQ",
      "rank": null,
      "probability": 11.11,
      "value": 69.69,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgJAAS",
      "code": "IRA-ROL",
      "rank": null,
      "probability": 30.24,
      "value": 208.16,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgJAAS",
      "code": "MTG-JMB",
      "rank": null,
      "probability": 7.84,
      "value": 172,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgJAAS",
      "code": "IRA-RTH",
      "rank": 1,
      "probability": 23.36,
      "value": 665.41,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgJAAS",
      "code": "HEL-ACQ",
      "rank": null,
      "probability": 12.39,
      "value": 62.16,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgKAAS",
      "code": "IRA-RTH",
      "rank": 1,
      "probability": 14.54,
      "value": 16.23,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgKAAS",
      "code": "IRA-ROL",
      "rank": null,
      "probability": 33.93,
      "value": 248.88,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgKAAS",
      "code": "MTG-JMB",
      "rank": null,
      "probability": 8.49,
      "value": 150.5,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgKAAS",
      "code": "HEL-ACQ",
      "rank": null,
      "probability": 10.79,
      "value": 41.6,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgMAAS",
      "code": "HEL-ACQ",
      "rank": null,
      "probability": 14.05,
      "value": 102.94,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgMAAS",
      "code": "MTG-JMB",
      "rank": null,
      "probability": 18.41,
      "value": 669,
      "channels": "EM,CC",
      "period": "2026-11-01"
    },
    {
      "account": "001am000026ZtgMAAS",
      "code": "IRA-RTH",
      "rank": 1,
      "probability": 13.59,
      "value": 13.68,
      "channels": "EM,CC",
      "period": "2026-11-01"
    }
  ],
  "products": [
    {
      "label": "Premier Checking",
      "codes": [
        "PCHK-ACQ"
      ]
    },
    {
      "label": "High-Yield Cash",
      "codes": [
        "WM-CASH"
      ]
    },
    {
      "label": "Managed Account",
      "codes": [
        "WM-MAS"
      ]
    },
    {
      "label": "Roth / IRA",
      "codes": [
        "IRA-RTH"
      ]
    },
    {
      "label": "401k Rollover",
      "codes": [
        "IRA-ROL"
      ]
    },
    {
      "label": "Jumbo Mortgage",
      "codes": [
        "MTG-JMB"
      ]
    },
    {
      "label": "HELOC",
      "codes": [
        "HEL-ACQ"
      ]
    }
  ]
};
