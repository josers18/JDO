-- commercialWhoToCall_rowsSql: captured 2026-11-13, scope explicit in SQL

  WITH d AS (
    SELECT account_id__c AS acct, MAX(0.5 * (100 - failure_risk_score__c) + 0.3 * (100 - paydex_score__c) + 0.2 * (100 - delinquency_predictor_score__c)) AS idx, MAX(supplier_risk_level__c) AS tier,
           MIN(paydex_score__c) AS paydex, MAX(average_days_beyond_terms__c) AS dbt
    FROM BT_DNB_Business_Credit__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm)
      AND (supplier_risk_level__c IN ('Severe', 'High') OR paydex_score__c < 60)
      AND failure_risk_score__c IS NOT NULL AND paydex_score__c IS NOT NULL
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
    GROUP BY account_id__c
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
    GROUP BY account_id__c
  ),
  m AS (
    SELECT account_id__c AS acct, MAX(rating_outlook__c) AS outlook, MAX(credit_rating__c) AS rating
    FROM BT_Moodys_Market_Context__dlm
    WHERE profile_date__c = (SELECT MAX(profile_date__c) FROM BT_Moodys_Market_Context__dlm)
      AND rating_outlook__c IN ('Negative', 'Watch')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
    GROUP BY account_id__c
  ),
  f AS (
    SELECT SFAccountID__c AS acct, COUNT(*) AS fees
    FROM ssot__FinancialAccountTransaction__dlm
    WHERE ssot__FinancialAccountTransactionType__c = 'Debit'
      AND ssot__Description__c IN ('NSF Returned Item Fee', 'Overdraft Fee', 'Late Payment Fee')
      AND ssot__TransactionDate__c >= current_date - INTERVAL '30' DAY
      AND SFAccountID__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
    GROUP BY SFAccountID__c
    HAVING COUNT(*) >= 3 AND MAX(CASE WHEN ssot__Description__c <> 'Overdraft Fee' THEN 1 ELSE 0 END) = 1
  ),
  o AS (
    SELECT acct, code, conv FROM (
      SELECT acct, code, conv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY action_rank, ev DESC) AS rn FROM (
        -- Business accounts: treasury, lending, deposit + card scores from Snowflake (keyed to the Account Id).
        SELECT b.account_id__c AS acct, b.action_code__c AS code, b.conversion_probability__c AS conv,
               b.recommended_action_rank__c AS action_rank, b.expected_value_uplift__c AS ev
        FROM BT_Offer_Eligibility__dlm b
        WHERE b.action_code__c LIKE 'BIZ-%' AND b.recommended_action_rank__c IS NOT NULL AND b.expected_value_uplift__c > 0
          AND b.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
      ) u
    ) t WHERE rn = 1
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM d UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM m
      UNION ALL SELECT acct FROM f UNION ALL SELECT acct FROM o
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, d.idx AS credit_idx, d.tier AS tier, d.paydex AS paydex, d.dbt AS days_beyond,
           g.sentiment AS sentiment, g.risk AS deal_risk, m.outlook AS outlook, m.rating AS rating,
           f.fees AS fees, o.code AS offer_code, o.conv AS conv,
           0.3 * COALESCE(CASE WHEN d.idx >= 60 THEN 1 WHEN d.idx <= 20 THEN 0
                                       ELSE (d.idx - 20) / 40.0 END, 0)
         + 0.25 * COALESCE(g.risk / 100.0, 0)
         + 0.1 * COALESCE(CASE WHEN m.outlook = 'Watch' THEN 1 WHEN m.outlook = 'Negative' THEN 0.6 END, 0)
         + 0.2 * COALESCE(CASE WHEN f.fees >= 6 THEN 1 ELSE f.fees / 6.0 END, 0)
         + 0.15 * COALESCE(CASE WHEN o.conv >= 50 THEN 1 ELSE o.conv / 50.0 END, 0) AS score
    FROM ids
    LEFT JOIN d ON d.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN m ON m.acct = ids.acct
    LEFT JOIN f ON f.acct = ids.acct
    LEFT JOIN o ON o.acct = ids.acct
  )
  SELECT * FROM b ORDER BY score DESC LIMIT 8
;

-- commercialWhoToCall_summarySql: captured 2026-11-13, scope explicit in SQL

  WITH d AS (
    SELECT account_id__c AS acct, MAX(0.5 * (100 - failure_risk_score__c) + 0.3 * (100 - paydex_score__c) + 0.2 * (100 - delinquency_predictor_score__c)) AS idx, MAX(supplier_risk_level__c) AS tier,
           MIN(paydex_score__c) AS paydex, MAX(average_days_beyond_terms__c) AS dbt
    FROM BT_DNB_Business_Credit__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm)
      AND (supplier_risk_level__c IN ('Severe', 'High') OR paydex_score__c < 60)
      AND failure_risk_score__c IS NOT NULL AND paydex_score__c IS NOT NULL
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
    GROUP BY account_id__c
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
    GROUP BY account_id__c
  ),
  m AS (
    SELECT account_id__c AS acct, MAX(rating_outlook__c) AS outlook, MAX(credit_rating__c) AS rating
    FROM BT_Moodys_Market_Context__dlm
    WHERE profile_date__c = (SELECT MAX(profile_date__c) FROM BT_Moodys_Market_Context__dlm)
      AND rating_outlook__c IN ('Negative', 'Watch')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
    GROUP BY account_id__c
  ),
  f AS (
    SELECT SFAccountID__c AS acct, COUNT(*) AS fees
    FROM ssot__FinancialAccountTransaction__dlm
    WHERE ssot__FinancialAccountTransactionType__c = 'Debit'
      AND ssot__Description__c IN ('NSF Returned Item Fee', 'Overdraft Fee', 'Late Payment Fee')
      AND ssot__TransactionDate__c >= current_date - INTERVAL '30' DAY
      AND SFAccountID__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
    GROUP BY SFAccountID__c
    HAVING COUNT(*) >= 3 AND MAX(CASE WHEN ssot__Description__c <> 'Overdraft Fee' THEN 1 ELSE 0 END) = 1
  ),
  o AS (
    SELECT acct, code, conv FROM (
      SELECT acct, code, conv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY action_rank, ev DESC) AS rn FROM (
        -- Business accounts: treasury, lending, deposit + card scores from Snowflake (keyed to the Account Id).
        SELECT b.account_id__c AS acct, b.action_code__c AS code, b.conversion_probability__c AS conv,
               b.recommended_action_rank__c AS action_rank, b.expected_value_uplift__c AS ev
        FROM BT_Offer_Eligibility__dlm b
        WHERE b.action_code__c LIKE 'BIZ-%' AND b.recommended_action_rank__c IS NOT NULL AND b.expected_value_uplift__c > 0
          AND b.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
      ) u
    ) t WHERE rn = 1
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM d UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM m
      UNION ALL SELECT acct FROM f UNION ALL SELECT acct FROM o
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, d.idx AS credit_idx, d.tier AS tier, d.paydex AS paydex, d.dbt AS days_beyond,
           g.sentiment AS sentiment, g.risk AS deal_risk, m.outlook AS outlook, m.rating AS rating,
           f.fees AS fees, o.code AS offer_code, o.conv AS conv,
           0.3 * COALESCE(CASE WHEN d.idx >= 60 THEN 1 WHEN d.idx <= 20 THEN 0
                                       ELSE (d.idx - 20) / 40.0 END, 0)
         + 0.25 * COALESCE(g.risk / 100.0, 0)
         + 0.1 * COALESCE(CASE WHEN m.outlook = 'Watch' THEN 1 WHEN m.outlook = 'Negative' THEN 0.6 END, 0)
         + 0.2 * COALESCE(CASE WHEN f.fees >= 6 THEN 1 ELSE f.fees / 6.0 END, 0)
         + 0.15 * COALESCE(CASE WHEN o.conv >= 50 THEN 1 ELSE o.conv / 50.0 END, 0) AS score
    FROM ids
    LEFT JOIN d ON d.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN m ON m.acct = ids.acct
    LEFT JOIN f ON f.acct = ids.acct
    LEFT JOIN o ON o.acct = ids.acct
  )
  SELECT COUNT(*) AS clients,
         SUM(CASE WHEN (CASE WHEN credit_idx IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN deal_risk IS NOT NULL THEN 1 ELSE 0 END)
                     + (CASE WHEN outlook IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN fees IS NOT NULL THEN 1 ELSE 0 END) >= 2
                  THEN 1 ELSE 0 END) AS multi
  FROM b
;

-- intentSignals_intentRowsSql: captured 2026-11-13, scope explicit in SQL

  WITH w AS (
  SELECT account_id__c AS acct, intent_topic__c AS topic, journey_stage__c AS stage,
         intent_score__c AS score, unique_researchers__c AS researchers,
         researching_competitor__c AS competitor, last_signal_date__c AS signal_date,
         surge_flag__c AS surge,
         CASE WHEN journey_stage__c = 'Purchase' THEN 3 WHEN journey_stage__c = 'Decision' THEN 2
              WHEN journey_stage__c = 'Consideration' THEN 1 ELSE 0 END AS stage_rank
  FROM BT_Demandbase_Intent_Signals__dlm
  WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Demandbase_Intent_Signals__dlm)
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ),
  a AS (
  SELECT *, CASE WHEN MAX(CASE WHEN competitor IS NOT NULL AND stage_rank >= 1 THEN 1 ELSE 0 END) OVER (PARTITION BY acct) = 1
                 THEN 'competitor' ELSE 'surge' END AS kind,
         ROW_NUMBER() OVER (PARTITION BY acct ORDER BY CASE WHEN competitor IS NOT NULL AND stage_rank >= 1 THEN 1 ELSE 0 END DESC, score DESC) AS rn
  FROM w WHERE (competitor IS NOT NULL AND stage_rank >= 1) OR surge
  )
  SELECT account_id, kind, topic, stage, score, researchers, competitor, signal_date FROM (
    SELECT acct AS account_id, kind, topic, stage, score, researchers, competitor, signal_date,
           ROW_NUMBER() OVER (PARTITION BY kind ORDER BY stage_rank DESC, score DESC, researchers DESC) AS kn
    FROM a WHERE rn = 1
  ) x
  WHERE kn <= 6
  ORDER BY kind, kn
;

-- intentSignals_intentSummarySql: captured 2026-11-13, scope explicit in SQL

  WITH w AS (
  SELECT account_id__c AS acct, intent_topic__c AS topic, journey_stage__c AS stage,
         intent_score__c AS score, unique_researchers__c AS researchers,
         researching_competitor__c AS competitor, last_signal_date__c AS signal_date,
         surge_flag__c AS surge,
         CASE WHEN journey_stage__c = 'Purchase' THEN 3 WHEN journey_stage__c = 'Decision' THEN 2
              WHEN journey_stage__c = 'Consideration' THEN 1 ELSE 0 END AS stage_rank
  FROM BT_Demandbase_Intent_Signals__dlm
  WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Demandbase_Intent_Signals__dlm)
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ),
  a AS (
  SELECT *, CASE WHEN MAX(CASE WHEN competitor IS NOT NULL AND stage_rank >= 1 THEN 1 ELSE 0 END) OVER (PARTITION BY acct) = 1
                 THEN 'competitor' ELSE 'surge' END AS kind,
         ROW_NUMBER() OVER (PARTITION BY acct ORDER BY CASE WHEN competitor IS NOT NULL AND stage_rank >= 1 THEN 1 ELSE 0 END DESC, score DESC) AS rn
  FROM w WHERE (competitor IS NOT NULL AND stage_rank >= 1) OR surge
  )
  SELECT COUNT(DISTINCT CASE WHEN kind = 'surge' THEN acct END) AS surging,
         COUNT(DISTINCT CASE WHEN kind = 'competitor' THEN acct END) AS competitor
  FROM a WHERE rn = 1
;

-- fundingSignals_fundingRowsSql: captured 2026-11-13, scope explicit in SQL

  SELECT account_id__c, last_funding_stage__c, funding_status__c, last_round_usd__c,
         est_runway_months__c, lead_investor__c, last_funding_date__c
  FROM BT_Harmonic_Company_Signals__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Harmonic_Company_Signals__dlm)
    AND recently_funded_flag__c = true
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ORDER BY last_round_usd__c DESC NULLS LAST
  LIMIT 6
;

-- fundingSignals_fundingSummarySql: captured 2026-11-13, scope explicit in SQL

  SELECT COUNT(DISTINCT account_id__c) AS funded
  FROM BT_Harmonic_Company_Signals__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Harmonic_Company_Signals__dlm)
    AND recently_funded_flag__c = true
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
;

-- jobChangeSignals_championRowsSql: captured 2026-11-13, scope explicit in SQL

  SELECT account_id__c, person_account_id__c, new_account_id__c, new_employer_name__c,
         contact_name__c, old_title__c, contact_persona__c, was_champion__c,
         relationship_risk_score__c, opportunity_score__c, detected_date__c
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND (was_champion__c = true OR was_primary_contact__c = true)
    AND detected_date__c >= current_date - INTERVAL '30' DAY
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ORDER BY relationship_risk_score__c DESC NULLS LAST
  LIMIT 6
;

-- jobChangeSignals_championSummarySql: captured 2026-11-13, scope explicit in SQL

  SELECT COUNT(DISTINCT account_id__c) AS total
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND (was_champion__c = true OR was_primary_contact__c = true)
    AND detected_date__c >= current_date - INTERVAL '30' DAY
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
;

-- marketSignals_outlookRowsSql: captured 2026-11-13, scope explicit in SQL

  SELECT account_id__c AS account_id, rating_outlook__c AS outlook, credit_rating__c AS rating,
         CAST(outlook_last_changed_date__c AS VARCHAR) AS since, rating_agency_flag_count__c AS flags,
         thirty_day_price_change_pct__c AS px30
  FROM BT_Moodys_Market_Context__dlm
  WHERE profile_date__c = (SELECT MAX(profile_date__c) FROM BT_Moodys_Market_Context__dlm)
    AND rating_outlook__c IN ('Negative', 'Watch')
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ORDER BY outlook_last_changed_date__c DESC NULLS LAST,
           CASE WHEN rating_outlook__c = 'Watch' THEN 1 ELSE 0 END DESC,
           rating_agency_flag_count__c DESC, annual_revenue_usd__c DESC
  LIMIT 4
;

-- marketSignals_outlookSummarySql: captured 2026-11-13, scope explicit in SQL

  SELECT SUM(CASE WHEN rating_outlook__c = 'Negative' THEN 1 ELSE 0 END) AS negative,
         SUM(CASE WHEN rating_outlook__c = 'Watch' THEN 1 ELSE 0 END) AS watch
  FROM BT_Moodys_Market_Context__dlm
  WHERE profile_date__c = (SELECT MAX(profile_date__c) FROM BT_Moodys_Market_Context__dlm)
    AND rating_outlook__c IN ('Negative', 'Watch')
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
;

-- marketSignals_leadershipRowsSql: captured 2026-11-13, scope explicit in SQL

  SELECT account_id, governance, event_date, ceo_tenure, director, angle FROM (
    SELECT account_id__c AS account_id, governance_rating__c AS governance,
           CAST(recent_governance_event_date__c AS VARCHAR) AS event_date, ceo_tenure_years__c AS ceo_tenure,
           key_director_name__c AS director, CASE WHEN governance_rating__c = 'Weak' THEN 'risk' ELSE 'opportunity' END AS angle,
           ROW_NUMBER() OVER (PARTITION BY CASE WHEN governance_rating__c = 'Weak' THEN 'risk' ELSE 'opportunity' END ORDER BY recent_governance_event_date__c DESC NULLS LAST) AS pn
    FROM BT_Boardex__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Boardex__dlm)
    AND exec_turnover_flag__c = true
      AND (governance_rating__c = 'Weak' OR recent_governance_event_date__c >= CURRENT_DATE - INTERVAL '90' DAY)
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ) x
  WHERE pn <= 3
  ORDER BY pn, angle
;

-- marketSignals_leadershipSummarySql: captured 2026-11-13, scope explicit in SQL

  SELECT COUNT(*) AS turnover,
         SUM(CASE WHEN recent_governance_event_date__c >= CURRENT_DATE - INTERVAL '90' DAY THEN 1 ELSE 0 END) AS recent,
         SUM(CASE WHEN governance_rating__c = 'Weak' THEN 1 ELSE 0 END) AS weak
  FROM BT_Boardex__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Boardex__dlm)
    AND exec_turnover_flag__c = true
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
;

-- marketSignals_esgRowsSql: captured 2026-11-13, scope explicit in SQL

  WITH cur AS (
    SELECT account_id__c AS acct, msci_esg_rating__c AS rating, CASE WHEN msci_esg_rating__c = 'AAA' THEN 7 WHEN msci_esg_rating__c = 'AA' THEN 6 WHEN msci_esg_rating__c = 'A' THEN 5
    WHEN msci_esg_rating__c = 'BBB' THEN 4 WHEN msci_esg_rating__c = 'BB' THEN 3 WHEN msci_esg_rating__c = 'B' THEN 2
    WHEN msci_esg_rating__c = 'CCC' THEN 1 END AS lvl, esg_score_overall__c AS score,
           controversy_flag_count__c AS controversies, top_controversy_category__c AS category
    FROM BT_MSCI_ESG_Scores__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ),
  prev AS (
    SELECT account_id__c AS acct, msci_esg_rating__c AS rating, CASE WHEN msci_esg_rating__c = 'AAA' THEN 7 WHEN msci_esg_rating__c = 'AA' THEN 6 WHEN msci_esg_rating__c = 'A' THEN 5
    WHEN msci_esg_rating__c = 'BBB' THEN 4 WHEN msci_esg_rating__c = 'BB' THEN 3 WHEN msci_esg_rating__c = 'B' THEN 2
    WHEN msci_esg_rating__c = 'CCC' THEN 1 END AS lvl, esg_score_overall__c AS score
    FROM BT_MSCI_ESG_Scores__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm WHERE profile_month__c < (SELECT MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm)) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ),
  mv AS (
    SELECT cur.acct AS acct, cur.rating AS rating, prev.rating AS from_rating, cur.score AS score,
           cur.score - prev.score AS move, cur.controversies AS controversies, cur.category AS category,
           CASE WHEN cur.lvl > prev.lvl THEN 'Upgrade' ELSE 'Downgrade' END AS direction
    FROM cur JOIN prev ON prev.acct = cur.acct
    WHERE ABS(cur.lvl - prev.lvl) <= 2
      AND ((cur.lvl > prev.lvl AND cur.score - prev.score >= 1)
        OR (cur.lvl < prev.lvl AND prev.score - cur.score >= 1))
  )
  SELECT account_id, direction, rating, from_rating, score, move, controversies, category FROM (
    SELECT acct AS account_id, direction, rating, from_rating, score, move, controversies, category,
           ROW_NUMBER() OVER (PARTITION BY direction ORDER BY
             CASE WHEN direction = 'Upgrade' THEN move ELSE controversies END DESC, ABS(move) DESC) AS pn
    FROM mv
  ) x
  WHERE pn <= 3
  ORDER BY pn, direction
;

-- marketSignals_esgSummarySql: captured 2026-11-13, scope explicit in SQL

  WITH cur AS (
    SELECT account_id__c AS acct, msci_esg_rating__c AS rating, CASE WHEN msci_esg_rating__c = 'AAA' THEN 7 WHEN msci_esg_rating__c = 'AA' THEN 6 WHEN msci_esg_rating__c = 'A' THEN 5
    WHEN msci_esg_rating__c = 'BBB' THEN 4 WHEN msci_esg_rating__c = 'BB' THEN 3 WHEN msci_esg_rating__c = 'B' THEN 2
    WHEN msci_esg_rating__c = 'CCC' THEN 1 END AS lvl, esg_score_overall__c AS score,
           controversy_flag_count__c AS controversies, top_controversy_category__c AS category
    FROM BT_MSCI_ESG_Scores__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ),
  prev AS (
    SELECT account_id__c AS acct, msci_esg_rating__c AS rating, CASE WHEN msci_esg_rating__c = 'AAA' THEN 7 WHEN msci_esg_rating__c = 'AA' THEN 6 WHEN msci_esg_rating__c = 'A' THEN 5
    WHEN msci_esg_rating__c = 'BBB' THEN 4 WHEN msci_esg_rating__c = 'BB' THEN 3 WHEN msci_esg_rating__c = 'B' THEN 2
    WHEN msci_esg_rating__c = 'CCC' THEN 1 END AS lvl, esg_score_overall__c AS score
    FROM BT_MSCI_ESG_Scores__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm WHERE profile_month__c < (SELECT MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm)) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ),
  mv AS (
    SELECT cur.acct AS acct, cur.rating AS rating, prev.rating AS from_rating, cur.score AS score,
           cur.score - prev.score AS move, cur.controversies AS controversies, cur.category AS category,
           CASE WHEN cur.lvl > prev.lvl THEN 'Upgrade' ELSE 'Downgrade' END AS direction
    FROM cur JOIN prev ON prev.acct = cur.acct
    WHERE ABS(cur.lvl - prev.lvl) <= 2
      AND ((cur.lvl > prev.lvl AND cur.score - prev.score >= 1)
        OR (cur.lvl < prev.lvl AND prev.score - cur.score >= 1))
  )
  SELECT (SELECT COUNT(*) FROM mv WHERE direction = 'Upgrade') AS up,
         (SELECT COUNT(*) FROM mv WHERE direction = 'Downgrade') AS down,
         (SELECT COUNT(*) FROM cur WHERE controversies > 0) AS controversies
;

-- firmographics_upmarketSql: captured 2026-11-13, scope explicit in SQL

  SELECT account_id__c AS account_id, revenue_band__c AS revenue_band, employee_band__c AS employee_band,
         tech_stack_flags__c AS tech, industry_naics_code__c AS naics, hq_state_code__c AS state
  FROM BT_Zoominfo_Firmographics__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm) AND revenue_band__c IN ('$50M-$200M', '$200M-$1B', '$1B+')
    AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ORDER BY CASE WHEN revenue_band__c = '$1B+' THEN 3 WHEN revenue_band__c = '$200M-$1B' THEN 2 ELSE 1 END DESC, CASE WHEN tech_stack_flags__c IS NULL THEN 0 ELSE 1 END DESC
  LIMIT 5
;

-- firmographics_mixSql: captured 2026-11-13, scope explicit in SQL

  SELECT 'revenue' AS dim, revenue_band__c AS band, COUNT(*) AS n
  FROM BT_Zoominfo_Firmographics__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  GROUP BY revenue_band__c
  UNION ALL
  SELECT 'employee' AS dim, employee_band__c AS band, COUNT(*) AS n
  FROM BT_Zoominfo_Firmographics__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  GROUP BY employee_band__c
;

-- marketFootprint_rowsSql: captured 2026-11-13, scope explicit in SQL

  SELECT zip, state, rec, wealth, traffic, dist, tapestry, clients FROM (
    SELECT e.branch_zip__c AS zip, MAX(e.state_code__c) AS state, MAX(e.branch_recommendation__c) AS rec,
           MAX(e.wealth_index__c) AS wealth, MAX(e.foot_traffic_index__c) AS traffic,
           MAX(e.distance_to_nearest_branch_mi__c) AS dist, MAX(e.tapestry_segment_name__c) AS tapestry,
           COUNT(*) AS clients,
           ROW_NUMBER() OVER (PARTITION BY MAX(e.branch_recommendation__c)
                              ORDER BY COUNT(*) DESC, MAX(e.wealth_index__c) DESC) AS pn
    FROM ssot__Account__dlm a
    JOIN BT_ESRI_GEO_Footprint__dlm e ON e.branch_zip__c = a.BillingPostalCode__c
      AND e.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_ESRI_GEO_Footprint__dlm)
    WHERE a.ssot__Id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
    GROUP BY e.branch_zip__c
  ) x
  WHERE pn <= 3
  ORDER BY pn, rec
;

-- marketFootprint_summarySql: captured 2026-11-13, scope explicit in SQL

  SELECT COUNT(*) AS clients, COUNT(DISTINCT e.branch_zip__c) AS zips,
         SUM(CASE WHEN e.branch_recommendation__c = 'Consolidate' THEN 1 ELSE 0 END) AS consolidate,
         SUM(CASE WHEN e.wealth_index__c >= 120 THEN 1 ELSE 0 END) AS affluent,
         AVG(e.wealth_index__c) AS wealth, AVG(e.foot_traffic_index__c) AS traffic,
         AVG(e.distance_to_nearest_branch_mi__c) AS dist
  FROM ssot__Account__dlm a
    JOIN BT_ESRI_GEO_Footprint__dlm e ON e.branch_zip__c = a.BillingPostalCode__c
      AND e.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_ESRI_GEO_Footprint__dlm)
  WHERE a.ssot__Id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
;

-- businessOwners_handoffRowsSql: captured 2026-11-13, scope explicit in SQL

  SELECT owner_id, owner_name, biz_id, conf, wealth, net_worth, life_stage FROM (
    SELECT g.src_account_id__c AS owner_id, p.ssot__Name__c AS owner_name, g.dst_account_id__c AS biz_id,
           g.confidence_pct__c AS conf, c.wealth_propensity_score__c AS wealth,
           c.estimated_net_worth_band__c AS net_worth, c.life_stage__c AS life_stage, CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 3 WHEN c.estimated_net_worth_band__c = '$1M-$5M' THEN 2 WHEN c.estimated_net_worth_band__c = '$250K-$1M' THEN 1 ELSE 0 END AS nw,
           ROW_NUMBER() OVER (PARTITION BY g.src_account_id__c ORDER BY g.confidence_pct__c DESC) AS rn
    FROM BT_Synth_Relationship_Graph__dlm g
    JOIN ssot__Account__dlm p ON p.ssot__Id__c = g.src_account_id__c
    JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c = g.src_account_id__c AND c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
    WHERE g.edge_type__c = 'BUSINESS_OWNER'
      AND g.dst_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
  ) x
  WHERE rn = 1
  ORDER BY nw DESC, wealth DESC NULLS LAST, conf DESC
  LIMIT 4
;

-- businessOwners_handoffSummarySql: captured 2026-11-13, scope explicit in SQL

  SELECT COUNT(DISTINCT g.src_account_id__c) AS owners,
         COUNT(DISTINCT CASE WHEN c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+') THEN g.src_account_id__c END) AS millionaires
  FROM BT_Synth_Relationship_Graph__dlm g
  LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c = g.src_account_id__c AND c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
  WHERE g.edge_type__c = 'BUSINESS_OWNER'
    AND g.dst_account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
;

-- serviceDrag_serviceNowSql: captured 2026-11-13, scope explicit in SQL

  SELECT COUNT(*) AS open_n,
         SUM(CASE WHEN ssot__CreatedDate__c < current_date - INTERVAL '30' DAY THEN 1 ELSE 0 END) AS aged_n
  FROM ssot__Case__dlm
  WHERE ssot__DataSourceObjectId__c = 'service_now_cases'
    AND ssot__CaseStatusId__c IN ('open', 'in_progress')
    AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005am000003PbFDAA0')
;

-- businessInflowSql: captured 2026-11-13, scope explicit in SQL

  SELECT account_id, amount, description, tx_date FROM (
    SELECT t.SFAccountID__c AS account_id, t.ssot__TransactionAmount__c AS amount,
           t.ssot__Description__c AS description, t.ssot__TransactionDate__c AS tx_date,
           ROW_NUMBER() OVER (PARTITION BY t.SFAccountID__c ORDER BY t.ssot__TransactionAmount__c DESC) AS rn
    FROM ssot__FinancialAccountTransaction__dlm t
    WHERE t.ssot__FinancialAccountTransactionType__c = 'Credit'
      AND t.ssot__TransactionAmount__c >= 10000
      AND t.ssot__TransactionDate__c >= current_date - INTERVAL '7' DAY
      AND t.ssot__Description__c LIKE 'ACH CREDIT %'
      AND t.SFAccountID__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
  ) x
  WHERE rn = 1
  ORDER BY amount DESC
  LIMIT 8
;

-- callSentimentSql: captured 2026-11-13, scope explicit in SQL

  SELECT g.account_id__c AS account_id, g.overall_sentiment__c AS sentiment,
         g.deal_risk_score__c AS deal_risk, g.next_scheduled_call_date__c AS next_call,
         g.rm_last_logged_note_date__c AS last_note, g.key_topics_flags__c AS topics
  FROM BT_Gong_Call_Sentiment__dlm g
  WHERE g.profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
    AND g.overall_sentiment__c IN ('Negative', 'Very Negative')
    AND g.sentiment_trend__c = 'Declining'
    AND g.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
  ORDER BY g.deal_risk_score__c DESC
  LIMIT 8
;

-- amlChangeSql: captured 2026-11-13, scope explicit in SQL

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
    AND c.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
  ORDER BY CASE WHEN c.overall_risk_rating__c = 'Severe' THEN 4 WHEN c.overall_risk_rating__c = 'High' THEN 3 ELSE 2 END DESC
  LIMIT 8
;

-- feeSpikeSql: captured 2026-11-13, scope explicit in SQL

  WITH d AS (
    SELECT account_id__c AS acct, MAX(0.5 * (100 - failure_risk_score__c) + 0.3 * (100 - paydex_score__c) + 0.2 * (100 - delinquency_predictor_score__c)) AS idx, MAX(supplier_risk_level__c) AS tier,
           MIN(paydex_score__c) AS paydex, MAX(average_days_beyond_terms__c) AS dbt
    FROM BT_DNB_Business_Credit__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm)
      AND (supplier_risk_level__c IN ('Severe', 'High') OR paydex_score__c < 60)
      AND failure_risk_score__c IS NOT NULL AND paydex_score__c IS NOT NULL
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
    GROUP BY account_id__c
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
    GROUP BY account_id__c
  ),
  m AS (
    SELECT account_id__c AS acct, MAX(rating_outlook__c) AS outlook, MAX(credit_rating__c) AS rating
    FROM BT_Moodys_Market_Context__dlm
    WHERE profile_date__c = (SELECT MAX(profile_date__c) FROM BT_Moodys_Market_Context__dlm)
      AND rating_outlook__c IN ('Negative', 'Watch')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
    GROUP BY account_id__c
  ),
  f AS (
    SELECT SFAccountID__c AS acct, COUNT(*) AS fees
    FROM ssot__FinancialAccountTransaction__dlm
    WHERE ssot__FinancialAccountTransactionType__c = 'Debit'
      AND ssot__Description__c IN ('NSF Returned Item Fee', 'Overdraft Fee', 'Late Payment Fee')
      AND ssot__TransactionDate__c >= current_date - INTERVAL '30' DAY
      AND SFAccountID__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
    GROUP BY SFAccountID__c
    HAVING COUNT(*) >= 3 AND MAX(CASE WHEN ssot__Description__c <> 'Overdraft Fee' THEN 1 ELSE 0 END) = 1
  ),
  o AS (
    SELECT acct, code, conv FROM (
      SELECT acct, code, conv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY action_rank, ev DESC) AS rn FROM (
        -- Business accounts: treasury, lending, deposit + card scores from Snowflake (keyed to the Account Id).
        SELECT b.account_id__c AS acct, b.action_code__c AS code, b.conversion_probability__c AS conv,
               b.recommended_action_rank__c AS action_rank, b.expected_value_uplift__c AS ev
        FROM BT_Offer_Eligibility__dlm b
        WHERE b.action_code__c LIKE 'BIZ-%' AND b.recommended_action_rank__c IS NOT NULL AND b.expected_value_uplift__c > 0
          AND b.account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
      ) u
    ) t WHERE rn = 1
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM d UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM m
      UNION ALL SELECT acct FROM f UNION ALL SELECT acct FROM o
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, d.idx AS credit_idx, d.tier AS tier, d.paydex AS paydex, d.dbt AS days_beyond,
           g.sentiment AS sentiment, g.risk AS deal_risk, m.outlook AS outlook, m.rating AS rating,
           f.fees AS fees, o.code AS offer_code, o.conv AS conv,
           0.3 * COALESCE(CASE WHEN d.idx >= 60 THEN 1 WHEN d.idx <= 20 THEN 0
                                       ELSE (d.idx - 20) / 40.0 END, 0)
         + 0.25 * COALESCE(g.risk / 100.0, 0)
         + 0.1 * COALESCE(CASE WHEN m.outlook = 'Watch' THEN 1 WHEN m.outlook = 'Negative' THEN 0.6 END, 0)
         + 0.2 * COALESCE(CASE WHEN f.fees >= 6 THEN 1 ELSE f.fees / 6.0 END, 0)
         + 0.15 * COALESCE(CASE WHEN o.conv >= 50 THEN 1 ELSE o.conv / 50.0 END, 0) AS score
    FROM ids
    LEFT JOIN d ON d.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN m ON m.acct = ids.acct
    LEFT JOIN f ON f.acct = ids.acct
    LEFT JOIN o ON o.acct = ids.acct
  ),
  hh AS (
  SELECT m.ssot__Id__c AS member, MIN(ac.ssot__AccountId__c) AS household
  FROM ssot__AccountContact__dlm ac
  JOIN ssot__Account__dlm m ON m.PersonContactId__c = ac.ssot__IndividualId__c
  WHERE 1 = 0
  GROUP BY m.ssot__Id__c
  ),
  fa AS (
  SELECT SFAccountID__c AS acct, COUNT(*) AS fees,
         SUM(ssot__TransactionAmount__c) AS fee_total, MAX(ssot__TransactionDate__c) AS last_fee
  FROM ssot__FinancialAccountTransaction__dlm
  WHERE ssot__FinancialAccountTransactionType__c = 'Debit'
    AND ssot__Description__c IN ('NSF Returned Item Fee', 'Overdraft Fee', 'Late Payment Fee')
    AND ssot__TransactionDate__c >= current_date - INTERVAL '30' DAY
    AND (SFAccountID__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0') OR SFAccountID__c IN (SELECT member FROM hh))
  GROUP BY SFAccountID__c
  HAVING COUNT(*) >= 3 AND MAX(CASE WHEN ssot__Description__c <> 'Overdraft Fee' THEN 1 ELSE 0 END) = 1
  ),
  fs AS (
  SELECT COALESCE(hh.household, fa.acct) AS account_id, SUM(fa.fees) AS fees,
         SUM(fa.fee_total) AS fee_total, MAX(fa.last_fee) AS last_fee,
         MAX(CASE WHEN hh.household IS NOT NULL THEN 1 ELSE 0 END) AS household
  FROM fa LEFT JOIN hh ON hh.member = fa.acct
  GROUP BY COALESCE(hh.household, fa.acct)
  )
  SELECT fs.account_id AS account_id, fs.fees AS fees, fs.fee_total AS fee_total, fs.last_fee AS last_fee,
         fs.household AS household
  FROM fs LEFT JOIN b ON b.account_id = fs.account_id
  ORDER BY COALESCE(b.score, 0) DESC, fs.fees DESC, fs.fee_total DESC
  LIMIT 16
;

-- netFlow: captured 2026-11-13, scope explicit in SQL

  SELECT CAST(CAST(DATE_TRUNC('week', transactiondate__c) AS DATE) AS VARCHAR) AS week,
         SUM(CASE WHEN transaction_type__c = 'Credit' THEN amount__c ELSE 0 END) AS credits,
         SUM(CASE WHEN transaction_type__c = 'Debit' THEN amount__c ELSE 0 END) AS debits,
         COUNT(*) AS txns, COUNT(DISTINCT accountid__c) AS accts
  FROM Financial_Transactions_BT_Snow__dll
  WHERE transactiondate__c >= CURRENT_DATE - INTERVAL '70' DAY
    AND transactiondate__c < DATE_TRUNC('week', CURRENT_DATE)
    AND account_type__c = 'Business'
    AND sfaccountid__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
  GROUP BY 1
  ORDER BY 1
;

-- offers: captured 2026-11-13, scope explicit in SQL

  SELECT t.acct AS acct, t.tot AS tot, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,
         b.conversion_probability__c AS conv, b.expected_value_uplift__c AS ev,
         b.recommended_channels__c AS channels, b.em_probability__c AS em_p, b.cc_probability__c AS cc_p
  FROM (
    SELECT account_id__c AS acct, SUM(expected_value_uplift__c) AS tot
    FROM BT_Offer_Eligibility__dlm
    WHERE action_code__c IN ('BIZ-CHK', 'BIZ-TM-ACH', 'BIZ-TM-RDC', 'BIZ-TM-PP', 'BIZ-TM-SWP', 'BIZ-CARD', 'BIZ-LOC', 'BIZ-TL', 'BIZ-CRE', 'BIZ-EQF', 'BIZ-SBA')
      AND recommended_action_rank__c IS NOT NULL AND expected_value_uplift__c > 0
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
    GROUP BY account_id__c
    ORDER BY tot DESC
    LIMIT 9
  ) t
  JOIN BT_Offer_Eligibility__dlm b ON b.account_id__c = t.acct
  WHERE b.action_code__c IN ('BIZ-CHK', 'BIZ-TM-ACH', 'BIZ-TM-RDC', 'BIZ-TM-PP', 'BIZ-TM-SWP', 'BIZ-CARD', 'BIZ-LOC', 'BIZ-TL', 'BIZ-CRE', 'BIZ-EQF', 'BIZ-SBA')
  ORDER BY t.tot DESC;

-- rising: captured 2026-11-13, scope explicit in SQL

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
      AND action_code__c IN ('BIZ-CHK', 'BIZ-TM-ACH', 'BIZ-TM-RDC', 'BIZ-TM-PP', 'BIZ-TM-SWP', 'BIZ-CARD', 'BIZ-LOC', 'BIZ-TL', 'BIZ-CRE', 'BIZ-EQF', 'BIZ-SBA')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
  ) h
  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)
    AND h.action_rank IS NOT NULL AND h.ev > 0
    AND (h.moved >= 2 OR h.ev_moved >= 250)
  ORDER BY h.ev_moved DESC
  LIMIT 50;

-- falling: captured 2026-11-13, scope explicit in SQL

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
      AND action_code__c IN ('BIZ-CHK', 'BIZ-TM-ACH', 'BIZ-TM-RDC', 'BIZ-TM-PP', 'BIZ-TM-SWP', 'BIZ-CARD', 'BIZ-LOC', 'BIZ-TL', 'BIZ-CRE', 'BIZ-EQF', 'BIZ-SBA')
      AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0')
  ) h
  WHERE h.mo = (SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)
    AND h.action_rank IS NOT NULL AND h.ev > 0
    AND (h.moved <= -2 OR h.ev_moved <= -250)
  ORDER BY h.ev_moved ASC
  LIMIT 50;

-- paymentBands: captured 2026-11-13, scope explicit in SQL
SELECT CASE WHEN average_days_beyond_terms__c >= 30 THEN '30+ days beyond terms' WHEN average_days_beyond_terms__c >= 15 THEN '15–29 days beyond terms' WHEN average_days_beyond_terms__c > 0 THEN '1–14 days beyond terms' ELSE 'Paying on terms' END AS band,COUNT(*) AS clients,AVG(paydex_score__c) AS paydex,MAX(profile_month__c) AS period FROM BT_DNB_Business_Credit__dlm WHERE profile_month__c=(SELECT MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0') GROUP BY CASE WHEN average_days_beyond_terms__c >= 30 THEN '30+ days beyond terms' WHEN average_days_beyond_terms__c >= 15 THEN '15–29 days beyond terms' WHEN average_days_beyond_terms__c > 0 THEN '1–14 days beyond terms' ELSE 'Paying on terms' END;

-- credit: captured 2026-11-13, scope explicit in SQL
SELECT account_id__c AS account_id,paydex_score__c AS paydex,average_days_beyond_terms__c AS days_beyond,supplier_risk_level__c AS tier,failure_risk_score__c AS failure,delinquency_predictor_score__c AS delinquency,profile_month__c AS period,CASE WHEN average_days_beyond_terms__c >= 30 THEN '30+ days beyond terms' WHEN average_days_beyond_terms__c >= 15 THEN '15–29 days beyond terms' WHEN average_days_beyond_terms__c > 0 THEN '1–14 days beyond terms' ELSE 'Paying on terms' END AS band FROM BT_DNB_Business_Credit__dlm WHERE profile_month__c=(SELECT MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm) AND account_id__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0') ORDER BY average_days_beyond_terms__c DESC LIMIT 16;

-- externalCases: captured 2026-11-13, scope explicit in SQL
SELECT ssot__AccountId__c AS account,ssot__Id__c AS ref,ssot__Subject__c AS subject,ssot__CaseStatusId__c AS status,ssot__CreatedDate__c AS dt FROM ssot__Case__dlm WHERE ssot__DataSourceObjectId__c='service_now_cases' AND ssot__CaseStatusId__c IN ('open','in_progress') AND ssot__AccountId__c IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c='005am000003PbFDAA0') ORDER BY ssot__CreatedDate__c DESC LIMIT 8;

-- holderOffers: captured 2026-11-13, scope explicit in SQL
SELECT account_id__c AS acct,action_code__c AS code,recommended_action_rank__c AS action_rank,conversion_probability__c AS conv,expected_value_uplift__c AS ev,recommended_channels__c AS channels FROM BT_Offer_Eligibility__dlm WHERE account_id__c IN ('001am00002A9jm3AAB','001am00002AYRl8AAH','001am00002A9jr0AAB') AND action_code__c LIKE 'BIZ-%' ORDER BY account_id__c,recommended_action_rank__c LIMIT 100;

-- 001am00002AAAvtAAH_transactions: captured 2026-11-13, scope explicit in SQL
SELECT ssot__TransactionDate__c dt, ssot__FinancialTransactionCategory__c cat, ssot__FinancialAccountTransactionType__c typ, ssot__TransactionAmount__c amt FROM ssot__FinancialAccountTransaction__dlm WHERE SFAccountID__c = '001am00002AAAvtAAH' ORDER BY ssot__TransactionDate__c DESC LIMIT 12;

-- 001am00002AAAvtAAH_interactions: captured 2026-11-13, scope explicit in SQL
SELECT CreatedDate__c dt, Name__c nm, InteractionPurpose__c purp, MeetingNotes__c notes, NextSteps__c nxt FROM InteractionSummary_Home__dlm WHERE AccountId__c = '001am00002AAAvtAAH' ORDER BY CreatedDate__c DESC LIMIT 8;

-- 001am00002AAAvtAAH_notes: captured 2026-11-13, scope explicit in SQL
SELECT Date_c__c dt, Title_c__c ttl, Notes_c__c notes FROM Meeting_Note_c_Home__dlm WHERE Account_c__c = '001am00002AAAvtAAH' ORDER BY Date_c__c DESC LIMIT 6;

-- 001am00002AAAvtAAH_campaigns: captured 2026-11-13, scope explicit in SQL
SELECT campaign_name__c nm, product_category__c cat, product_name__c prod, MAX(CASE engagement_type__c WHEN 'Unsubscribed' THEN 5 WHEN 'Clicked' THEN 4 WHEN 'Opened' THEN 3 WHEN 'Delivered' THEN 2 WHEN 'Bounced' THEN 1 ELSE 0 END) rk, MIN(engagement_at__c) dt FROM Marketing_Engagements__dlm WHERE account_id__c = '001am00002AAAvtAAH' GROUP BY send_id__c, campaign_name__c, product_category__c, product_name__c ORDER BY dt DESC LIMIT 8;

-- 001am00002AAAvtAAH_firmographics: captured 2026-11-13, scope explicit in SQL
SELECT revenue_band__c rev, employee_band__c emp, industry_naics_code__c naics, industry_sic_code__c sic, founded_year__c founded, website_domain__c web, hq_state_code__c state, hq_country_code__c country, linkedin_followers__c li, tech_stack_flags__c tech, profile_month__c m FROM BT_Zoominfo_Firmographics__dlm WHERE account_id__c = '001am00002AAAvtAAH' ORDER BY profile_month__c DESC LIMIT 1;

-- 001am00002AAAvtAAH_governance: captured 2026-11-13, scope explicit in SQL
SELECT board_size__c size, ceo_tenure_years__c ceo, board_avg_tenure_years__c avg, governance_rating__c rating, key_director_name__c dir, interlock_count__c interlock, exec_turnover_flag__c turnover, recent_governance_event_date__c evt, profile_month__c m FROM BT_Boardex__dlm WHERE account_id__c = '001am00002AAAvtAAH' ORDER BY profile_month__c DESC LIMIT 1;

-- 001am00002AAAvtAAH_esg: captured 2026-11-13, scope explicit in SQL
SELECT esg_score_overall__c overall, environmental_score__c env, social_score__c soc, governance_score__c gov, msci_esg_rating__c rating, carbon_intensity_tons_per_m_revenue__c carbon, controversy_flag_count__c ctrl, top_controversy_category__c topc, last_rating_change_direction__c dir, profile_month__c m FROM BT_MSCI_ESG_Scores__dlm WHERE account_id__c = '001am00002AAAvtAAH' ORDER BY profile_month__c DESC LIMIT 1;

-- 001am00002AAAvtAAH_filings: captured 2026-11-13, scope explicit in SQL
SELECT filingtype__c ftype, section__c sect, section_text__c txt, uniqueid__c uid FROM SEC_Filings__dlm WHERE accountid__c = '001am00002AAAvtAAH' LIMIT 40;

-- 001am00002AYRm2AAH_transactions: captured 2026-11-13, scope explicit in SQL
SELECT ssot__TransactionDate__c dt, ssot__FinancialTransactionCategory__c cat, ssot__FinancialAccountTransactionType__c typ, ssot__TransactionAmount__c amt FROM ssot__FinancialAccountTransaction__dlm WHERE SFAccountID__c = '001am00002AYRm2AAH' ORDER BY ssot__TransactionDate__c DESC LIMIT 12;

-- 001am00002AYRm2AAH_interactions: captured 2026-11-13, scope explicit in SQL
SELECT CreatedDate__c dt, Name__c nm, InteractionPurpose__c purp, MeetingNotes__c notes, NextSteps__c nxt FROM InteractionSummary_Home__dlm WHERE AccountId__c = '001am00002AYRm2AAH' ORDER BY CreatedDate__c DESC LIMIT 8;

-- 001am00002AYRm2AAH_notes: captured 2026-11-13, scope explicit in SQL
SELECT Date_c__c dt, Title_c__c ttl, Notes_c__c notes FROM Meeting_Note_c_Home__dlm WHERE Account_c__c = '001am00002AYRm2AAH' ORDER BY Date_c__c DESC LIMIT 6;

-- 001am00002AYRm2AAH_campaigns: captured 2026-11-13, scope explicit in SQL
SELECT campaign_name__c nm, product_category__c cat, product_name__c prod, MAX(CASE engagement_type__c WHEN 'Unsubscribed' THEN 5 WHEN 'Clicked' THEN 4 WHEN 'Opened' THEN 3 WHEN 'Delivered' THEN 2 WHEN 'Bounced' THEN 1 ELSE 0 END) rk, MIN(engagement_at__c) dt FROM Marketing_Engagements__dlm WHERE account_id__c = '001am00002AYRm2AAH' GROUP BY send_id__c, campaign_name__c, product_category__c, product_name__c ORDER BY dt DESC LIMIT 8;

-- 001am00002AYRm2AAH_firmographics: captured 2026-11-13, scope explicit in SQL
SELECT revenue_band__c rev, employee_band__c emp, industry_naics_code__c naics, industry_sic_code__c sic, founded_year__c founded, website_domain__c web, hq_state_code__c state, hq_country_code__c country, linkedin_followers__c li, tech_stack_flags__c tech, profile_month__c m FROM BT_Zoominfo_Firmographics__dlm WHERE account_id__c = '001am00002AYRm2AAH' ORDER BY profile_month__c DESC LIMIT 1;

-- 001am00002AYRm2AAH_governance: captured 2026-11-13, scope explicit in SQL
SELECT board_size__c size, ceo_tenure_years__c ceo, board_avg_tenure_years__c avg, governance_rating__c rating, key_director_name__c dir, interlock_count__c interlock, exec_turnover_flag__c turnover, recent_governance_event_date__c evt, profile_month__c m FROM BT_Boardex__dlm WHERE account_id__c = '001am00002AYRm2AAH' ORDER BY profile_month__c DESC LIMIT 1;

-- 001am00002AYRm2AAH_esg: captured 2026-11-13, scope explicit in SQL
SELECT esg_score_overall__c overall, environmental_score__c env, social_score__c soc, governance_score__c gov, msci_esg_rating__c rating, carbon_intensity_tons_per_m_revenue__c carbon, controversy_flag_count__c ctrl, top_controversy_category__c topc, last_rating_change_direction__c dir, profile_month__c m FROM BT_MSCI_ESG_Scores__dlm WHERE account_id__c = '001am00002AYRm2AAH' ORDER BY profile_month__c DESC LIMIT 1;

-- 001am00002AYRm2AAH_filings: captured 2026-11-13, scope explicit in SQL
SELECT filingtype__c ftype, section__c sect, section_text__c txt, uniqueid__c uid FROM SEC_Filings__dlm WHERE accountid__c = '001am00002AYRm2AAH' LIMIT 40;

-- history: captured 2026-11-13, scope explicit in SQL
SELECT account_id__c AS acct,action_code__c AS code,CAST(start_date__c AS VARCHAR) AS mo,conversion_probability__c AS conv,conversion_probability__c-FIRST_VALUE(conversion_probability__c) OVER (PARTITION BY account_id__c,action_code__c ORDER BY start_date__c) AS moved,expected_value_uplift__c-FIRST_VALUE(expected_value_uplift__c) OVER (PARTITION BY account_id__c,action_code__c ORDER BY start_date__c) AS ev_moved FROM BT_Offer_Eligibility_History__dlm WHERE start_date__c>=(SELECT MAX(start_date__c) FROM BT_Offer_Eligibility_History__dlm)-INTERVAL '6' MONTH AND account_id__c IN ('001am00002AAB59AAH','001am00002AAB6BAAX','001am00002A9jrrAAB','001am00002A9jt0AAB','001am00002A9c6GAAR','001am00002AAB68AAH','001am00002AAB6HAAX','001am00002AAB6FAAX','001am00002A9jrzAAB','001am00002A9jm3AAB','001am00002AYRl8AAH','001am00002A9jr0AAB','001am00002AAAvtAAH','001am00002AYRm2AAH') AND action_code__c LIKE 'BIZ-%' ORDER BY acct,code,mo LIMIT 1501;

-- heldAway: captured 2026-11-13, scope explicit in SQL
SELECT account_id__c AS acct,account_type__c AS type,institution_name__c AS inst,balance_usd__c AS bal FROM BT_Plaid_Held_Away__dlm WHERE profile_month__c=(SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm) AND is_active__c=true AND balance_usd__c>0 AND account_id__c IN ('001am00002AAB59AAH','001am00002AAB6BAAX','001am00002A9jrrAAB','001am00002A9jt0AAB','001am00002A9c6GAAR','001am00002AAB68AAH','001am00002AAB6HAAX','001am00002AAB6FAAX','001am00002A9jrzAAB','001am00002A9jm3AAB','001am00002AYRl8AAH','001am00002A9jr0AAB','001am00002AAAvtAAH','001am00002AYRm2AAH') LIMIT 201;

-- companyOffers: captured 2026-11-13, scope explicit in SQL
SELECT account_id__c AS acct,action_code__c AS code,recommended_action_rank__c AS action_rank,conversion_probability__c AS conv,expected_value_uplift__c AS ev,recommended_channels__c AS channels FROM BT_Offer_Eligibility__dlm WHERE account_id__c IN ('001am00002AAAvtAAH','001am00002AYRm2AAH') AND action_code__c LIKE 'BIZ-%' LIMIT 100;
