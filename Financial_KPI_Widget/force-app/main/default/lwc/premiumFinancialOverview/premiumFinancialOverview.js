import { LightningElement, api, wire } from 'lwc';
import getFinancialMetrics from '@salesforce/apex/FinancialOverviewController.getFinancialMetrics';
import getTrendData from '@salesforce/apex/FinancialOverviewController.getTrendData';

const ANIM_DURATION_MS = 1200;
const SPARK_W = 100;
const SPARK_H = 30;
const SPARK_PAD = 3;

export default class PremiumFinancialOverview extends LightningElement {
    // Record context — auto-populated on record pages; passed in by Flow elsewhere.
    @api recordId;

    // Design-time config
    @api trendMonths = 6;
    @api headline = '';

    // Flow-variable overrides. Strings so a blank value means "use Apex result".
    @api overrideDepositsAmount;
    @api overrideLoansAmount;
    @api overrideLoansBalance;
    @api overrideLoansInterest;
    @api overrideInvestmentsAmount;
    @api overrideInvestmentsBalance;
    @api overrideInvestmentsRoi;
    @api overrideDepositsTrend;
    @api overrideLoansTrend;
    @api overrideInvestmentsTrend;

    // Reactive state
    rawMetrics = {};
    rawTrends = { deposits: [], loans: [], investments: [] };
    animated = {
        depositsAmount: 0, loansAmount: 0, loansBalance: 0, loansInterest: 0,
        investmentsAmount: 0, investmentsBalance: 0, investmentsRoi: 0
    };
    metricsLoaded = false;
    trendsLoaded = false;
    errorMessage;
    _rafId;

    // --- Data wiring -------------------------------------------------------
    // The '$recordId' prefix makes the wire reactive: Salesforce re-runs the
    // Apex call (and its SOQL) whenever recordId changes.

    @wire(getFinancialMetrics, { recordId: '$recordId' })
    wiredMetrics({ data, error }) {
        if (data) {
            this.rawMetrics = data;
            this.metricsLoaded = true;
            this.errorMessage = undefined;
            this.kickoffCountUp();
        } else if (error) {
            this.errorMessage = this.reduceError(error);
            this.metricsLoaded = true;
        }
    }

    @wire(getTrendData, { recordId: '$recordId', months: '$trendMonths' })
    wiredTrends({ data, error }) {
        if (data) {
            this.rawTrends = {
                deposits: data.depositsTrend || [],
                loans: data.loansTrend || [],
                investments: data.investmentsTrend || []
            };
            this.trendsLoaded = true;
        } else if (error) {
            // Non-fatal — sparklines simply render empty
            this.trendsLoaded = true;
        }
    }

    get isLoading() {
        return !this.metricsLoaded && !this.errorMessage;
    }

    // --- Effective values (overrides win, Apex fills the rest) ------------

    get effective() {
        const r = this.rawMetrics || {};
        return {
            depositsAmount:     this.pick(this.overrideDepositsAmount,     r.depositsAmount),
            loansAmount:        this.pick(this.overrideLoansAmount,        r.loansAmount),
            loansBalance:       this.pick(this.overrideLoansBalance,       r.loansBalance),
            loansInterest:      this.pick(this.overrideLoansInterest,      r.loansInterest),
            investmentsAmount:  this.pick(this.overrideInvestmentsAmount,  r.investmentsAmount),
            investmentsBalance: this.pick(this.overrideInvestmentsBalance, r.investmentsBalance),
            investmentsRoi:     this.pick(this.overrideInvestmentsRoi,     r.investmentsRoi)
        };
    }

    get effectiveTrends() {
        return {
            deposits:    this.parseCsv(this.overrideDepositsTrend)    || this.rawTrends.deposits,
            loans:       this.parseCsv(this.overrideLoansTrend)       || this.rawTrends.loans,
            investments: this.parseCsv(this.overrideInvestmentsTrend) || this.rawTrends.investments
        };
    }

    // --- Count-up animation -----------------------------------------------

    kickoffCountUp() {
        const targets = this.effective;
        if (this._rafId) cancelAnimationFrame(this._rafId);

        const start = performance.now();
        const easeOut = t => 1 - Math.pow(1 - t, 3);

        const tick = (now) => {
            const progress = Math.min((now - start) / ANIM_DURATION_MS, 1);
            const eased = easeOut(progress);

            this.animated = Object.keys(targets).reduce((acc, k) => {
                acc[k] = (targets[k] || 0) * eased;
                return acc;
            }, {});

            if (progress < 1) {
                this._rafId = requestAnimationFrame(tick);
            }
        };
        this._rafId = requestAnimationFrame(tick);
    }

    disconnectedCallback() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }

    // --- Display getters ---------------------------------------------------

    get depositsDisplay()         { return this.formatCurrency(this.animated.depositsAmount); }
    get loansAmountDisplay()      { return this.formatCurrency(this.animated.loansAmount); }
    get loansBalanceDisplay()     { return this.formatCurrency(this.animated.loansBalance); }
    get loansInterestDisplay()    { return this.formatCurrency(this.animated.loansInterest); }
    get investmentsAmountDisplay(){ return this.formatCurrency(this.animated.investmentsAmount); }
    get investmentsBalanceDisplay(){return this.formatCurrency(this.animated.investmentsBalance); }
    get investmentsRoiDisplay()   { return this.formatPercent(this.animated.investmentsRoi); }
    get trendLabel()              { return `${this.trendMonths} mo trend`; }

    // --- Sparkline path generation ----------------------------------------

    get depositsSpark()    { return this.buildSpark(this.effectiveTrends.deposits); }
    get loansSpark()       { return this.buildSpark(this.effectiveTrends.loans); }
    get investmentsSpark() { return this.buildSpark(this.effectiveTrends.investments); }

    buildSpark(values) {
        if (!values || values.length < 2) return { line: '', area: '' };
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const step = SPARK_W / (values.length - 1);
        const usableH = SPARK_H - SPARK_PAD * 2;

        const pts = values.map((v, i) => {
            const x = i * step;
            const y = SPARK_H - SPARK_PAD - ((v - min) / range) * usableH;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        });

        const line = `M ${pts.join(' L ')}`;
        const area = `${line} L ${SPARK_W},${SPARK_H} L 0,${SPARK_H} Z`;
        return { line, area };
    }

    // --- Trend percentage badges ------------------------------------------

    get depositsTrendPct()   { return this.fmtPct(this.calcTrendPct(this.effectiveTrends.deposits)); }
    get depositsTrendClass() { return this.trendClass(this.calcTrendPct(this.effectiveTrends.deposits)); }
    get depositsTrendArrow() { return this.trendArrow(this.calcTrendPct(this.effectiveTrends.deposits)); }

    calcTrendPct(values) {
        if (!values || values.length < 2) return null;
        const first = values[0];
        const last = values[values.length - 1];
        if (!first) return null;
        return ((last - first) / Math.abs(first)) * 100;
    }

    trendClass(pct) {
        if (pct === null || pct === undefined) return 'pfo-foot__muted';
        return pct >= 0 ? 'pfo-trend pfo-trend--up' : 'pfo-trend pfo-trend--down';
    }

    trendArrow(pct) {
        if (pct === null || pct === undefined) return '';
        return pct >= 0 ? '\u25B2' : '\u25BC';
    }

    fmtPct(pct) {
        if (pct === null || pct === undefined) return '—';
        return `${Math.abs(pct).toFixed(1)}%`;
    }

    // --- Formatters --------------------------------------------------------

    formatCurrency(n) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        const abs = Math.abs(n);
        if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
        if (abs >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
        return `$${Math.round(n).toLocaleString()}`;
    }

    formatPercent(n) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        return `${n.toFixed(2)}%`;
    }

    // --- Utilities ---------------------------------------------------------

    pick(override, fallback) {
        const parsed = this.parseNum(override);
        if (parsed !== null) return parsed;
        return (fallback !== null && fallback !== undefined) ? Number(fallback) : 0;
    }

    parseNum(v) {
        if (v === undefined || v === null || v === '') return null;
        const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
        return isNaN(n) ? null : n;
    }

    parseCsv(csv) {
        if (!csv) return null;
        const arr = csv.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
        return arr.length >= 2 ? arr : null;
    }

    reduceError(error) {
        if (!error) return 'Unknown error';
        if (Array.isArray(error.body)) return error.body.map(e => e.message).join(', ');
        if (error.body && error.body.message) return error.body.message;
        if (error.message) return error.message;
        return 'Unable to load financial data';
    }
}
