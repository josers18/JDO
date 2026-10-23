from attrcsat import vocab as v

ATTR = ("CUSTOMER_SEGMENT_C", "CROSS_SELL_SCORE_C", "ONLINE_BANKING_C", "MOBILE_BANKING_C", "DIRECT_DEPOSIT_C",
        "AVG_NUMBER_OF_TRANSACTIONS_C", "TENURE_IN_MONTHS_C", "AVG_BALANCE_6_MONTHS_C", "NPS_SCORE_C",
        "SINGLE_PRODUCT_CUSTOMER_C", "PROMOTIONAL_PRODUCT_C", "PCT_BALANCE_DROP_6_MONTHS_AVG_C",
        "DAYS_SINCE_LAST_INTERACTION_C", "CHURNED_C", "UNIQUEID", "AVG_NUMBER_OF_CALL_CENTER_CALLS_C")
CSAT = ("SEGMENT", "AGE", "ANNUAL_INCOME", "ACCOUNT_BALANCE", "TENURE_YEARS", "NUM_PRODUCTS", "DIGITAL_ENGAGEMENT",
        "COMPLAINT_COUNT", "CUSTOMER_SERVICE_CONTACT", "CROSS_SELL_SCORE", "ESCALATED_CASES", "TRANSACTION_VOLUME",
        "CREDIT_SCORE", "ACCOUNTID")
ENR = ("ACCOUNTID", "MOBILE_ENROLLED", "ONLINE_ENROLLED", "KYC_STATUS", "MFA_STATUS", "PAPERLESS_ENROLLED",
       "ALERT_ENROLLED", "WIRE_ENABLED", "SAVINGS_RATE", "CROSS_SELL_SCORE", "AML_STATUS", "SNAPSHOT_DATE")


def test_column_orders():
    assert v.ATTRITION_COLUMNS == ATTR
    assert v.CSAT_COLUMNS == CSAT
    assert v.ENROLLMENT_COLUMNS == ENR


def test_categories():
    c = v.CATEGORIES
    assert c["CUSTOMER_SEGMENT_C"] == ("Regular", "Premium", "Preferred")
    assert c["NPS_SCORE_C"] == ("Promoter", "Passive", "Detractor")
    assert c["SEGMENT"] == ("Corporate", "WealthManagement", "Commercial", "Banking")
    assert c["KYC_STATUS"] == ("Current", "Pending", "Expired", "Under Review")
    assert c["AML_STATUS"] == ("Cleared", "Under Review", "Pending", "None")
    assert c["CHURNED_C"] == ("No",)


def test_yes_no_and_bool():
    assert set(v.YES_NO_COLUMNS) == {"ONLINE_BANKING_C", "MOBILE_BANKING_C", "DIRECT_DEPOSIT_C",
                                     "SINGLE_PRODUCT_CUSTOMER_C", "PROMOTIONAL_PRODUCT_C"}
    for col in v.YES_NO_COLUMNS:
        assert v.CATEGORIES[col] == ("Yes", "No")
    assert set(v.BOOL_COLUMNS) == {"MOBILE_ENROLLED", "ONLINE_ENROLLED", "MFA_STATUS",
                                   "PAPERLESS_ENROLLED", "ALERT_ENROLLED", "WIRE_ENABLED"}
    assert len(v.BOOL_COLUMNS) == 6


def test_columns_known():
    for cols in (v.ATTRITION_COLUMNS, v.CSAT_COLUMNS, v.ENROLLMENT_COLUMNS):
        assert len(set(cols)) == len(cols)
    for k in list(v.CATEGORIES) + list(v.BOOL_COLUMNS):
        assert any(k in cols for cols in (v.ATTRITION_COLUMNS, v.CSAT_COLUMNS, v.ENROLLMENT_COLUMNS))


def test_ranges_cover_numeric_columns():
    numeric = {
        "CROSS_SELL_SCORE_C", "AVG_NUMBER_OF_TRANSACTIONS_C", "TENURE_IN_MONTHS_C", "AVG_BALANCE_6_MONTHS_C",
        "PCT_BALANCE_DROP_6_MONTHS_AVG_C", "DAYS_SINCE_LAST_INTERACTION_C", "AVG_NUMBER_OF_CALL_CENTER_CALLS_C",
        "AGE", "ANNUAL_INCOME", "ACCOUNT_BALANCE", "TENURE_YEARS", "NUM_PRODUCTS", "DIGITAL_ENGAGEMENT",
        "COMPLAINT_COUNT", "CUSTOMER_SERVICE_CONTACT", "CSAT.CROSS_SELL_SCORE", "ESCALATED_CASES",
        "TRANSACTION_VOLUME", "CREDIT_SCORE", "ENR.SAVINGS_RATE", "ENR.CROSS_SELL_SCORE",
    }
    assert set(v.RANGES) == numeric
    for lo, hi in v.RANGES.values():
        assert lo < hi


def test_pinned_ranges():
    r = v.RANGES
    assert r["CROSS_SELL_SCORE_C"] == (1, 7)
    assert r["AVG_BALANCE_6_MONTHS_C"] == (1.70, 778793.36)
    assert r["PCT_BALANCE_DROP_6_MONTHS_AVG_C"] == (0, 0.84)
    assert r["ENR.SAVINGS_RATE"] == (0.00, 0.40)
    assert r["ENR.CROSS_SELL_SCORE"] == (1, 10)
    assert r["CSAT.CROSS_SELL_SCORE"] == (0, 100)
    assert r["ANNUAL_INCOME"] == (40004, 14795526)
    assert r["ACCOUNT_BALANCE"] == (3667.14, 7249807.74)
    assert r["CREDIT_SCORE"] == (621.78, 842)
    assert r["TRANSACTION_VOLUME"] == (1, 197)
    assert r["AGE"] == (18, 79)
