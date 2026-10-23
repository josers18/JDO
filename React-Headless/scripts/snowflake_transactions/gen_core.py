"""Product-aware transaction generator keyed to FinServ__FinancialAccount__c (§7 of
React-Headless/docs/SNOWFLAKE_DATA_FIXES.md). Shared by the one-off backfill and the
DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS procedure (start == end == today).

Rows are FINANCIAL_TRANSACTION_ACCOUNTS records (dicts keyed by column name): one per
open FinServ__FinancialAccount__c, ACCOUNTID = FinServ Id, SFACCOUNTID = its PrimaryOwner.
Output tuples follow FINANCIAL_TRANSACTIONS column order (see COLUMNS).
Deterministic per (FA Id, window): account traits come from a static seed, events
from a seed that includes the window start, so re-running a day reproduces it.
"""
import hashlib, math, random, uuid
from datetime import date, datetime, timedelta

COLUMNS = ['ACCOUNTID', 'TRANSACTIONID', 'POSTINGDATE', 'TRANSACTIONDATE', 'AMOUNT', 'DESCRIPTION',
           'TRANSACTION_CATEGORY', 'MCC', 'MCC_DESCRIPTION', 'TRANSACTION_STATUS', 'CURRENCY',
           'TRANSACTION_TYPE', 'SOURCE_TRANSACTION_TYPE', 'DATA_DATE', 'SFACCOUNTID', 'CONTACTID', 'ACCOUNT_TYPE']
BASE_DAYS = 90  # signal probabilities are per 90-day window; shorter windows scale them down

LINE_WORDS = ('HELOC', 'Line of Credit', 'Credit Card', 'Rewards Card', 'Cash Rewards', 'Corporate Card')


def classify(t, name):
    if t == 'Credit Cards' or any(w in name for w in LINE_WORDS): return 'line'
    if t == 'Deposits' or (not t and 'Checking' in name): return 'deposit'
    if t == 'Loans' or (not t and ('Loan' in name or 'Mortgage' in name)): return 'loan'
    if t == 'Investments': return 'investment'
    return None  # Treasury Management, Merchant Services, unknown


def deposit_type(name):
    n = name.lower()
    if ' cd' in n or 'certificate' in n: return 'cd'
    if 'money market' in n: return 'mm'
    if 'saving' in n: return 'sav'
    return 'chk'


def rng(key, salt=''):
    return random.Random(int(hashlib.sha1((key + salt).encode()).hexdigest()[:12], 16))


def f(x, d=0.0):
    try: return float(x) if x is not None and x != '' else d
    except (TypeError, ValueError): return d


def pdate(s):
    if not s: return None
    if isinstance(s, datetime): return s.date()
    if isinstance(s, date): return s
    return date.fromisoformat(str(s)[:10])


# (category, mcc, mcc_description, weight, median $)
PERSONAL_SPEND = [
    ('Food & Dining', 5812, 'Eating Places and Restaurants', 14, 42),
    ('Food & Dining', 5814, 'Fast Food Restaurants', 12, 14),
    ('Food & Dining', 5411, 'Grocery Stores and Supermarkets', 16, 85),
    ('Food & Dining', 5813, 'Drinking Places (Alcoholic Beverages) Bars, Taverns, Nightclubs, Cocktail Lounges, and Discotheques', 3, 38),
    ('Auto & Transport', 5541, 'Service Stations (With or Without Ancillary Services)', 8, 48),
    ('Auto & Transport', 4121, 'Taxicabs and Limousines', 4, 24),
    ('Shopping', 5311, 'Department Stores', 5, 68),
    ('Shopping', 5942, 'Book Stores', 1, 22),
    ('Shopping', 5732, 'Electronics Stores', 2, 145),
    ('Shopping', 5651, 'Family Clothing Stores', 4, 72),
    ('Shopping', 5912, 'Drug Stores and Pharmacies', 5, 28),
    ('Shopping', 5964, 'Direct Marketing Catalog Merchant', 6, 46),
    ('Shopping', 5251, 'Hardware Stores', 3, 52),
    ('Entertainment', 7832, 'Motion Picture Theaters', 2, 31),
    ('Entertainment', 7941, 'Commercial Sports, Professional Sports Clubs, Athletic Fields, and Sports Promoters', 1, 95),
    ('Health & Fitness', 7997, 'Membership Clubs (Sports, Recreation, Athletic), Country Clubs, and Private Golf Courses', 1, 60),
    ('Health & Fitness', 8021, 'Dentists and Orthodontists', 1, 160),
    ('Travel', 4511, 'Airlines and Air Carriers', 1, 380),
    ('Travel', 7011, 'Lodging - Hotels, Motels, and Resorts', 1, 240),
]
BUSINESS_SPEND = [
    ('Business Services', 7399, 'Business Services (Not Elsewhere Classified)', 14, 850),
    ('Business Services', 5111, 'Stationery, Office Supplies, Printing and Writing Paper', 6, 220),
    ('Business Services', 5045, 'Computers, Computer Peripheral Equipment, and Software', 4, 1400),
    ('Business Services', 4214, 'Motor Freight Carriers and Trucking - Local and Long Distance, Moving and Storage Companies', 5, 1250),
    ('Bills & Utilities', 4814, 'Telecommunication Services', 2, 640),
    ('Bills & Utilities', 4900, 'Utilities - Electric, Gas, Water, and Sanitary', 2, 1800),
    ('Travel', 4511, 'Airlines and Air Carriers', 2, 620),
    ('Food & Dining', 5812, 'Eating Places and Restaurants', 4, 140),
    ('Shopping', 5085, 'Industrial Supplies (Not Elsewhere Classified)', 4, 2100),
]
PAYERS = ('ACME CORP', 'NORTHWIND LLC', 'GLOBEX INC', 'INITECH', 'UMBRELLA CO', 'STARK SUPPLY', 'WAYNE LOGISTICS', 'HOOLI', 'VANDELAY IMPORTS', 'SOYLENT FOODS')
EMPLOYERS = ('ADP PAYROLL', 'GUSTO PAYROLL', 'PAYCHEX', 'WORKDAY PAY', 'INTUIT PAYROLL')
FIN = 'Financial Institutions - Merchandise and Services'
WIRE = 'Wire Transfer Money Orders'


def pick(R, table):
    return R.choices(table, weights=[t[3] for t in table])[0]


def amt(R, median, sd=0.7):
    return round(max(1.0, median * math.exp(R.gauss(0, sd))), 2)


def cnt(R, x):
    """Stochastic rounding, so per-day rates still produce events in a 1-day window."""
    n = int(x)
    return n + (1 if R.random() < x - n else 0)


def loan_payment(r, bal, name):
    rate = f(r.get('INTEREST_RATE'))
    if not rate:
        rate = 0.065 if 'Mortgage' in name else 0.085 if 'Auto' in name else 0.125 if 'Personal' in name else 0.075
    mr = rate / 12 if rate < 1 else rate / 1200
    if 'CRE' in name or 'Commercial' in name:
        return round(bal * mr, 2)
    end = pdate(r.get('LOAN_END_DATE'))
    today = date.today()
    left = max(6, (end.year - today.year) * 12 + end.month - today.month) if end else (300 if 'Mortgage' in name else 48)
    return round(bal * mr / (1 - (1 + mr) ** -left), 2) if mr else round(bal / left, 2)


def generate(rows, start, end, now, id_prefix='FS-'):
    """Yield FINANCIAL_TRANSACTIONS tuples for every open, classifiable account."""
    span_all = (end - start).days + 1
    scale = span_all / BASE_DAYS
    data_date = now.strftime('%Y-%m-%d %H:%M:%S')
    accts = []
    for r in rows:
        if r.get('ACTIVE') in (False, 'false', 'FALSE', 0): continue
        kind = classify(r.get('FINANCIAL_ACCOUNT_TYPE') or '', r.get('ACCOUNT_NAME') or '')
        if kind and r.get('SFACCOUNTID'): accts.append((r, kind))

    # Loan payments are debited from the owner's primary (lowest-Id) checking account.
    owner_loans, primary_chk = {}, {}
    for r, kind in accts:
        owner, name = r['SFACCOUNTID'], r['ACCOUNT_NAME'] or ''
        if kind == 'loan' and f(r.get('BALANCE')) > 0:
            owner_loans.setdefault(owner, []).append((loan_payment(r, f(r['BALANCE']), name), rng(r['ACCOUNTID'], 'pay').randint(1, 28)))
        if kind == 'deposit' and deposit_type(name) == 'chk':
            if owner not in primary_chk or r['ACCOUNTID'] < primary_chk[owner]: primary_chk[owner] = r['ACCOUNTID']

    def days(dom, d0):
        """Dates in [d0, end] whose day-of-month == dom (clamped to 28)."""
        out, d = [], date(d0.year, d0.month, 1)
        while d <= end:
            x = date(d.year, d.month, min(dom, 28))
            if d0 <= x <= end: out.append(x)
            d = date(d.year + d.month // 12, d.month % 12 + 1, 1)
        return out

    for r, kind in accts:
        fa, name, owner = r['ACCOUNTID'], r['ACCOUNT_NAME'] or '', r['SFACCOUNTID']
        person = (r.get('ACCOUNTTYPE') or '') == 'Personal'
        contact = (r.get('CONTACTID') or None) if person else None
        acct_type = 'Personal' if person else 'Business'
        opened = pdate(r.get('OPEN_DATE')) or date(2020, 1, 1)
        d0 = max(start, opened)
        if d0 > end: continue
        span = (end - d0).days + 1
        S = rng(fa, 'static')                   # account traits, stable across runs
        R = rng(fa, 'tx' + start.isoformat())   # events for this window
        bal = max(0.0, f(r.get('BALANCE')))
        p = lambda base: base * scale           # per-window signal probability

        def day_in(lo=d0):
            lo = max(lo, d0)
            return lo + timedelta(days=R.randint(0, (end - lo).days))

        def recent(n):
            return end - timedelta(days=n)

        def E(d, amount, typ, cat, mcc, mcc_desc, desc=None):
            last_hour = min(22, max(6, now.hour - 1)) if d == now.date() else 22
            t = datetime(d.year, d.month, d.day, R.randint(min(6, last_hour), last_hour), R.randint(0, 59), R.randint(0, 59))
            posted = t + timedelta(days=R.choice((0, 1, 1, 2)))
            status = 'Pending' if posted > now else 'Posted'
            return (fa, id_prefix + str(uuid.UUID(int=R.getrandbits(128))), posted.strftime('%Y-%m-%d %H:%M:%S'),
                    t.strftime('%Y-%m-%d %H:%M:%S'), round(amount, 2), (desc or mcc_desc)[:128], cat, mcc, mcc_desc[:128],
                    status, 'USD', typ, typ, data_date, owner, contact, acct_type)

        if kind == 'deposit':
            dt = deposit_type(name)
            if dt == 'chk' and person:
                pay = round(f(r.get('DIRECT_DEPOSIT_AMOUNT')) / 2, 2)  # monthly amount, paid semi-monthly
                bonus = f(r.get('BONUS_AMOUNT'))
                emp = S.choice(EMPLOYERS)
                util_day, phone_day, sub_day = S.randint(3, 25), S.randint(3, 25), S.randint(1, 28)
                sub_amt = S.choice((9.99, 15.49, 17.99, 22.99))
                for d in days(1, d0) + days(15, d0) if pay > 0 else []:
                    yield E(d, pay * R.uniform(0.98, 1.02), 'Credit', 'Paycheck', 9961, 'Direct Deposit', f'{emp} DIRECT DEP')
                for _ in range(cnt(R, span * S.uniform(0.5, 1.0))):
                    c = pick(R, PERSONAL_SPEND)
                    yield E(day_in(), amt(R, c[4]), 'Debit', c[0], c[1], c[2])
                for d in days(util_day, d0):
                    yield E(d, amt(R, 160, 0.35), 'Debit', 'Bills & Utilities', 4900, 'Utilities - Electric, Gas, Water, and Sanitary')
                for d in days(phone_day, d0):
                    yield E(d, amt(R, 85, 0.25), 'Debit', 'Bills & Utilities', 4814, 'Telecommunication Services')
                for d in days(sub_day, d0):
                    yield E(d, sub_amt, 'Debit', 'Entertainment', 5815, 'Digital Goods Media - Books, Movies, Music', 'Streaming Subscription')
                if primary_chk.get(owner) == fa:
                    for amount, dd in owner_loans.get(owner, [])[:3]:
                        for d in days(dd, d0):
                            yield E(d, amount, 'Debit', 'Fees & Charges', 9980, 'Loan Payment')
                for d in days(1, d0) if bonus > 0 else []:
                    if d.month in (1, 4, 7, 10):  # quarterly bonus
                        yield E(d, bonus, 'Credit', 'Paycheck', 9961, 'Direct Deposit', f'{emp} BONUS')
                roll = R.random()
                if roll < p(0.04):    # bonus: large inbound credit
                    yield E(day_in(recent(20)), R.uniform(5000, 40000), 'Credit', 'Paycheck', 9961, 'Direct Deposit', 'Bonus')
                elif roll < p(0.07):  # tax refund
                    yield E(day_in(recent(20)), R.uniform(1500, 9000), 'Credit', 'Financial', 6012, FIN, 'IRS TREAS 310 TAX REF')
                elif roll < p(0.09):  # money leaving: outbound wire to another bank
                    yield E(day_in(recent(30)), max(2500, bal * R.uniform(0.3, 0.8)), 'Debit', 'Transfer', 4829, WIRE, 'Outgoing Wire Transfer - External Bank')
                if R.random() < p(0.03):
                    for _ in range(R.randint(1, 3)):
                        yield E(day_in(recent(30)), 35.00, 'Debit', 'Fees & Charges', 6012, FIN, 'Overdraft Fee')
            elif dt == 'chk':  # business operating account
                sc = max(0.3, min(8.0, bal / 150000))
                payroll = round(18000 * sc * S.uniform(0.6, 1.4), 2)
                pay1, pay2, emp = S.randint(1, 13), S.randint(15, 28), S.choice(EMPLOYERS)
                for _ in range(cnt(R, span * S.uniform(0.3, 0.6))):
                    yield E(day_in(), amt(R, 4200 * sc, 0.8), 'Credit', 'Financial', 6012, FIN, f'ACH CREDIT {R.choice(PAYERS)}')
                for _ in range(cnt(R, span * S.uniform(0.6, 1.2))):
                    c = pick(R, BUSINESS_SPEND)
                    yield E(day_in(), amt(R, c[4] * sc), 'Debit', c[0], c[1], c[2])
                for d in days(pay1, d0) + days(pay2, d0):
                    yield E(d, payroll * R.uniform(0.97, 1.03), 'Debit', 'Business Services', 7399, 'Business Services (Not Elsewhere Classified)', f'{emp} PAYROLL DEBIT')
                for d in days(1, d0):
                    yield E(d, 9000 * sc, 'Debit', 'Bills & Utilities', 6513, 'Real Estate Agents and Managers - Rentals', 'Commercial Lease Payment')
                if primary_chk.get(owner) == fa:
                    for amount, dd in owner_loans.get(owner, [])[:3]:
                        for d in days(dd, d0):
                            yield E(d, amount, 'Debit', 'Fees & Charges', 9980, 'Loan Payment')
                for d in days(28, d0):
                    yield E(d, R.uniform(25, 95), 'Debit', 'Fees & Charges', 6012, FIN, 'Monthly Service Fee')
                if R.random() < p(0.05):  # cash-flow stress: fee spike
                    for _ in range(R.randint(3, 8)):
                        yield E(day_in(recent(30)), R.choice((36.0, 38.0, 75.0)), 'Debit', 'Fees & Charges', 6012, FIN,
                                R.choice(('NSF Returned Item Fee', 'Overdraft Fee', 'Late Payment Fee')))
            else:  # savings / money market / CD
                rate = f(r.get('INTEREST_RATE')) or {'sav': 0.0035, 'mm': 0.025, 'cd': 0.042}[dt]
                rate = rate if rate < 1 else rate / 100
                for d in days(28, d0):
                    yield E(d, max(0.01, bal * rate / 12), 'Credit', 'Interest Income', 9967, 'Earned Interest')
                if dt != 'cd':
                    for _ in range(cnt(R, S.randint(0, 2) * 3 * span / BASE_DAYS)):
                        yield E(day_in(), amt(R, max(100, bal * 0.02)), R.choice(('Credit', 'Credit', 'Debit')), 'Transfer', 4829, WIRE, 'Online Transfer')

        elif kind == 'loan':
            if bal <= 0: continue
            amount, dd = loan_payment(r, bal, name), rng(fa, 'pay').randint(1, 28)
            for d in days(dd, d0):
                yield E(d, amount, 'Credit', 'Fees & Charges', 9980, 'Loan Payment')

        elif kind == 'line':
            card = 'card' in name.lower() or r.get('FINANCIAL_ACCOUNT_TYPE') == 'Credit Cards'
            if card:
                for _ in range(cnt(R, span * S.uniform(0.25, 0.5))):
                    c = pick(R, PERSONAL_SPEND if person else BUSINESS_SPEND)
                    yield E(day_in(), amt(R, c[4]), 'Debit', c[0], c[1], c[2])
            else:
                for _ in range(cnt(R, S.randint(0, 2) * 1.5 * span / BASE_DAYS)):
                    yield E(day_in(), amt(R, max(500, bal * 0.15)), 'Debit', 'Financial', 6012, FIN, 'Line Draw')
            for d in days(S.randint(5, 25), d0):
                yield E(d, max(25, bal * R.uniform(0.03, 0.2)), 'Credit', 'Financial', 6012, FIN, 'Payment - Thank You')

        else:  # investment
            if S.random() < 0.45:
                c_amt = S.choice((250, 500, 1000, 2000, 5000))
                for d in days(S.randint(1, 28), d0):
                    yield E(d, c_amt, 'Credit', 'Financial', 6211, 'Security Brokers/Dealers', 'Recurring Contribution')
            for d in days(S.choice((15, 20, 28)), d0):
                if d.month in (3, 6, 9, 12):  # quarterly dividend
                    yield E(d, max(1.0, bal * R.uniform(0.002, 0.006)), 'Credit', 'Interest Income', 6211, 'Security Brokers/Dealers', 'Dividend')
            if R.random() < p(0.05):  # distribution / withdrawal
                yield E(day_in(recent(30)), max(1000, bal * R.uniform(0.05, 0.25)), 'Debit', 'Transfer', 4829, WIRE, 'Distribution - Outgoing Transfer')
