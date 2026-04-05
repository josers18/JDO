import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import runPredictionFlow from '@salesforce/apex/MulticlassPredictionLwcController.runPredictionFlow';
import generateAnalysisSummary from '@salesforce/apex/MulticlassPredictionLwcController.generateAnalysisSummary';
import { THEMES } from './predictionThemes.js';

const BAR_TRANSITION = 'transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)';

function sanitizePmTextColor(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s || s.length > 120) {
        return null;
    }
    if (/[;}<>]|url\s*\(|expression\s*\(/i.test(s)) {
        return null;
    }
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) {
        return s;
    }
    if (/^rgba?\(/i.test(s)) {
        return s;
    }
    return null;
}

function clampSummaryFontScale(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
        return 1;
    }
    const p = Math.min(200, Math.max(80, Math.round(n)));
    return p / 100;
}

export default class MulticlassPredictionLwc extends LightningElement {
    @api cardTitle;
    @api summaryCardTitle;
    @api recommendationsSectionTitle;
    @api flowApiName;
    @api recordIdInputName = 'recordId';
    @api predictionVariableName = 'prediction';
    @api recommendationsVariableName = 'recommendations';
    @api promptTemplateId;
    @api promptInputApiName = 'Input:Prediction_Context';
    @api autoGenerateSummary;
    @api recommendationsPositiveMeansGood;
    @api riskColor = '#D4537E';
    @api goodColor = '#1D9E75';
    @api recommendationsRiskColor = '';
    @api recommendationsGoodColor = '';
    /** Label under the predicted class (e.g. Predicted class, Product line). */
    @api classSubtitle;
    /** When true (default), show title-style text (underscores → spaces, capitalized words). When false, show raw flow string. */
    @api humanizeClassName;

    _themeMode = 'default';
    _themeScheduleToken = 0;

    @api
    get themeMode() {
        return this._themeMode;
    }
    set themeMode(value) {
        const raw = (value && String(value).trim()) || 'default';
        const m = raw.toLowerCase();
        this._themeMode = THEMES[m] ? m : 'default';
        this.scheduleApplyTheme();
    }

    @api accentColor = '';
    @api showThemeSwitcher = false;
    @api warningColor = '#d4900a';
    @api negativeColor = '#c05070';

    /** Optional #hex or rgb()/rgba(). GenAI summary, section title, row labels, legend. Blank = theme default. */
    @api summaryAndLabelTextColor = '';

    /** 80–200. 100 = default GenAI summary size; larger = bigger summary text only. */
    @api summaryTextSizePercent = 100;

    loadingFlow = false;
    loadingSummary = false;
    errorMessage;
    predictionLabelRaw;
    recommendationsJson;
    summaryText;
    summaryError;

    _recordId;

    @api
    get recordId() {
        return this._recordId;
    }

    set recordId(value) {
        this._recordId = value;
        if (value) {
            this.refreshData();
        }
    }

    get hasPredictionLabel() {
        return typeof this.predictionLabelRaw === 'string' && this.predictionLabelRaw.trim().length > 0;
    }

    get predictionLabelDisplay() {
        if (!this.hasPredictionLabel) {
            return '';
        }
        const raw = this.predictionLabelRaw.trim();
        if (this.humanizeClassName === false) {
            return raw;
        }
        return this.humanizeClassLabel(raw);
    }

    humanizeClassLabel(s) {
        return s
            .split(/[\s_]+/)
            .filter((w) => w.length > 0)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }

    get hasData() {
        if (this.loadingFlow) {
            return false;
        }
        return this.hasPredictionLabel || this.insightItemCount(this.recommendationsJson) > 0;
    }

    get classSubtitleDisplay() {
        return this.trimmedOr(this.classSubtitle, 'Predicted class');
    }

    get classHeroAriaLabel() {
        const sub = this.classSubtitleDisplay;
        if (!this.hasPredictionLabel) {
            return `${sub} not available`;
        }
        return `${sub} ${this.predictionLabelDisplay}`;
    }

    get processedRecommendations() {
        const raw = this.recommendationsJson;
        const arr = this.normalizeInsightSource(raw);
        const rows = this.buildInsightRowsFromArray(arr, 'recommendation');
        const colors = this.resolveColors(this.recommendationsRiskColor, this.recommendationsGoodColor);
        const treatPositiveAsGood = this.recommendationsPositiveMeansGood === true;
        return this.applyProcessedRowColors(rows, colors, treatPositiveAsGood);
    }

    get showSummaryCard() {
        return this.hasData && this.hasPromptTemplate;
    }

    get hasPromptTemplate() {
        return typeof this.promptTemplateId === 'string' && this.promptTemplateId.trim().length > 0;
    }

    get mainCardTitleDisplay() {
        return this.trimmedOr(this.cardTitle, 'Model prediction');
    }

    get recommendationsSectionTitleDisplay() {
        return this.trimmedOr(this.recommendationsSectionTitle, 'Suggested improvements');
    }

    /** Matches bar colors: positive (right) vs negative (left), same as applyProcessedRowColors. */
    get legendSupportsDotStyle() {
        const { supports } = this.getRecommendationDivergingLegendColors();
        return `background-color: ${supports}`;
    }

    get legendAgainstDotStyle() {
        const { against } = this.getRecommendationDivergingLegendColors();
        return `background-color: ${against}`;
    }

    getRecommendationDivergingLegendColors() {
        const { risk, good } = this.resolveColors(this.recommendationsRiskColor, this.recommendationsGoodColor);
        const treatPositiveAsGood = this.recommendationsPositiveMeansGood === true;
        return {
            supports: treatPositiveAsGood ? good : risk,
            against: treatPositiveAsGood ? risk : good
        };
    }

    trimmedOr(value, fallback) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
        return fallback;
    }

    connectedCallback() {
        this.applyTheme();
        /* eslint-disable @lwc/lwc/no-async-operation -- re-apply theme after flexipage / first paint */
        requestAnimationFrame(() => {
            this.applyTheme();
            requestAnimationFrame(() => this.applyTheme());
        });
        /* eslint-enable @lwc/lwc/no-async-operation */
        if (this._recordId) {
            this.refreshData();
        }
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- defer until after DOM paint for bar widths
        setTimeout(() => this.animateBars(), 200);
    }

    renderedCallback() {
        this.scheduleApplyTheme();
    }

    scheduleApplyTheme() {
        this._themeScheduleToken += 1;
        const token = this._themeScheduleToken;
        Promise.resolve().then(() => {
            if (token !== this._themeScheduleToken) {
                return;
            }
            this.applyTheme();
        });
    }

    applyTheme() {
        const host = this.template?.host;
        const shell = this.template?.querySelector('.lwc-shell');
        const targets = [];
        if (host?.style) {
            targets.push(host);
        }
        if (shell?.style && shell !== host) {
            targets.push(shell);
        }
        if (!targets.length) {
            return;
        }
        const mode = (this._themeMode || 'default').toLowerCase();
        const tokens = THEMES[mode] || THEMES.default;
        const applyTo = (node) => {
            Object.entries(tokens).forEach(([prop, value]) => {
                node.style.setProperty(prop, value);
            });
            const accent =
                typeof this.accentColor === 'string' && this.accentColor.trim().length > 0
                    ? this.accentColor.trim()
                    : '#b8956a';
            node.style.setProperty('--wp-accent', accent);
            if (accent.startsWith('#') && accent.length === 7) {
                node.style.setProperty('--wp-accent-bg', accent + '14');
                node.style.setProperty('--wp-accent-border', accent + '40');
                node.style.setProperty('--wp-accent-dim', accent + '99');
            }
            if (this.warningColor && this.warningColor !== '#d4900a') {
                node.style.setProperty('--wp-warning', this.warningColor);
            }
            if (this.negativeColor && this.negativeColor !== '#c05070') {
                node.style.setProperty('--wp-negative', this.negativeColor);
            }
            const labelColor = sanitizePmTextColor(this.summaryAndLabelTextColor);
            if (labelColor) {
                node.style.setProperty('--lwc-pm-summary-label-color', labelColor);
            } else {
                node.style.removeProperty('--lwc-pm-summary-label-color');
            }
            const sumScale = clampSummaryFontScale(this.summaryTextSizePercent);
            if (sumScale !== 1) {
                node.style.setProperty('--lwc-pm-summary-font-scale', String(sumScale));
            } else {
                node.style.removeProperty('--lwc-pm-summary-font-scale');
            }
        };
        targets.forEach(applyTo);
    }

    handleThemeSwitch(event) {
        const theme = event.currentTarget.dataset.theme;
        if (theme && THEMES[theme]) {
            this._themeMode = theme;
            this.applyTheme();
        }
    }

    get themeBtn_obsidian() {
        return 'pm-theme-btn pm-tb-obsidian' + (this._themeMode === 'obsidian' ? ' pm-tb-active' : '');
    }
    get themeBtn_midnight() {
        return 'pm-theme-btn pm-tb-midnight' + (this._themeMode === 'midnight' ? ' pm-tb-active' : '');
    }
    get themeBtn_graphite() {
        return 'pm-theme-btn pm-tb-graphite' + (this._themeMode === 'graphite' ? ' pm-tb-active' : '');
    }
    get themeBtn_ivory() {
        return 'pm-theme-btn pm-tb-ivory' + (this._themeMode === 'ivory' ? ' pm-tb-active' : '');
    }

    schedulePostRenderAnimations() {
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- defer until after DOM paint for bar widths
        setTimeout(() => this.animateBars(), 200);
    }

    refreshData() {
        this.errorMessage = undefined;
        this.summaryText = undefined;
        this.summaryError = undefined;
        this.runFlow();
    }

    async runFlow() {
        if (!this.flowApiName || !this._recordId) {
            return;
        }
        this.loadingFlow = true;
        try {
            const result = await runPredictionFlow({
                flowApiName: this.flowApiName,
                recordId: this._recordId,
                recordIdVariableName: this.recordIdInputName,
                predictionVariableName: this.predictionVariableName,
                recommendationsVariableName: this.recommendationsVariableName
            });
            this.predictionLabelRaw = result.predictionLabel;
            this.recommendationsJson = result.recommendationsJson;
        } catch (e) {
            this.errorMessage = this.reduceError(e);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Could not run prediction flow',
                    message: this.errorMessage,
                    variant: 'error',
                    mode: 'sticky'
                })
            );
        } finally {
            this.loadingFlow = false;
            Promise.resolve().then(() => this.schedulePostRenderAnimations());
        }

        if (!this.errorMessage && this.hasPromptTemplate && this.autoGenerateSummary !== false) {
            await this.runSummary();
        }
    }

    async runSummary() {
        if (!this.hasPromptTemplate) {
            return;
        }
        this.loadingSummary = true;
        this.summaryError = undefined;
        try {
            const text = await generateAnalysisSummary({
                promptTemplateId: this.promptTemplateId,
                promptInputApiName: this.promptInputApiName,
                predictionLabel: this.predictionLabelRaw || '',
                recommendationsJson: this.recommendationsJson || '[]'
            });
            this.summaryText = text || 'The model returned an empty response.';
        } catch (e) {
            this.summaryError = this.reduceError(e);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'AI summary failed',
                    message: this.summaryError,
                    variant: 'error',
                    mode: 'sticky'
                })
            );
        } finally {
            this.loadingSummary = false;
        }
    }

    animateBars() {
        const fills = this.template.querySelectorAll('.bar-fill');
        fills.forEach((el) => {
            const raw = el.getAttribute('data-scale');
            const scale = raw != null && raw !== '' ? Number(raw) : 0;
            const safe = Number.isFinite(scale) ? Math.min(1, Math.max(0, scale)) : 0;
            el.style.transition = BAR_TRANSITION;
            el.style.transform = 'scaleX(' + safe + ')';
            const color = el.dataset.color;
            if (color) {
                el.style.background = color;
            }
        });
    }

    parseJsonToInsightArray(jsonString) {
        if (jsonString == null || typeof jsonString !== 'string') {
            return [];
        }
        const trimmed = jsonString.trim();
        if (!trimmed) {
            return [];
        }
        try {
            let data = JSON.parse(trimmed);
            if (typeof data === 'string') {
                data = JSON.parse(data.trim());
            }
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }

    insightItemCount(jsonString) {
        return this.parseJsonToInsightArray(jsonString).length;
    }

    normalizeInsightSource(raw) {
        if (raw == null || raw === '') {
            return [];
        }
        if (Array.isArray(raw)) {
            return raw;
        }
        if (typeof raw === 'string') {
            return this.parseJsonToInsightArray(raw);
        }
        return [];
    }

    resolveColors(sectionOverrideRisk, sectionOverrideGood) {
        const globalRisk =
            typeof this.riskColor === 'string' && this.riskColor.trim().length > 0
                ? this.riskColor.trim()
                : '#D4537E';
        const globalGood =
            typeof this.goodColor === 'string' && this.goodColor.trim().length > 0
                ? this.goodColor.trim()
                : '#1D9E75';
        const risk =
            typeof sectionOverrideRisk === 'string' && sectionOverrideRisk.trim().length > 0
                ? sectionOverrideRisk.trim()
                : globalRisk;
        const good =
            typeof sectionOverrideGood === 'string' && sectionOverrideGood.trim().length > 0
                ? sectionOverrideGood.trim()
                : globalGood;
        return { risk, good };
    }

    resolveRowDelta(row) {
        if (row.displayValue != null && Number.isFinite(Number(row.displayValue))) {
            return Number(row.displayValue);
        }
        const fp = row.formattedPercent;
        if (typeof fp === 'string' && fp.trim().length > 0 && fp !== '—') {
            const n = parseFloat(fp.replace(/%/g, ''));
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    }

    normalizeHexColorForCompare(value) {
        if (value == null || typeof value !== 'string') {
            return '';
        }
        return value.trim().toLowerCase();
    }

    applyProcessedRowColors(rows, colors, treatPositiveAsGood) {
        const { risk, good } = colors;
        const riskKey = this.normalizeHexColorForCompare(risk);
        return rows.map((row) => {
            const parsedDelta = this.resolveRowDelta(row);
            const isPositiveDelta = parsedDelta > 0;
            let activeColor;
            if (isPositiveDelta) {
                activeColor = treatPositiveAsGood ? good : risk;
            } else if (parsedDelta < 0) {
                activeColor = treatPositiveAsGood ? risk : good;
            } else {
                activeColor = risk;
            }
            const activeKey = this.normalizeHexColorForCompare(activeColor);
            const deltaClass = activeKey === riskKey ? 'delta-risk' : 'delta-good';
            const barStyle = 'background: ' + activeColor;
            return {
                ...row,
                activeColor,
                barStyle,
                deltaClass
            };
        });
    }

    collectPrescribedDisplay(source, allowNumericValueKeys) {
        if (!source || typeof source !== 'object') {
            return '';
        }
        const tryScalar = (v, allowNum) => {
            if (v === undefined || v === null) {
                return '';
            }
            if (typeof v === 'string') {
                return v.trim();
            }
            if (typeof v === 'boolean') {
                return v ? 'Yes' : 'No';
            }
            if (allowNum && typeof v === 'number' && Number.isFinite(v)) {
                return this.formatInsightValue(v);
            }
            return '';
        };
        const keyOrder = [
            'inputValue',
            'InputValue',
            'prescribedValue',
            'PrescribedValue',
            'customText',
            'CustomText',
            'recommendedValue',
            'RecommendedValue',
            'displayValue',
            'DisplayValue',
            'text',
            'Text',
            'description',
            'Description'
        ];
        for (const k of keyOrder) {
            const s = tryScalar(source[k], true);
            if (s) {
                return s;
            }
        }
        const v = source.value ?? source.Value;
        return tryScalar(v, allowNumericValueKeys);
    }

    applyBarScales(rows) {
        const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.displayValue || 0)), 0);
        rows.forEach((r) => {
            const abs = r.displayValue != null ? Math.abs(r.displayValue) : 0;
            r.barScale = maxAbs > 0 ? abs / maxAbs : 0;
        });
        return rows;
    }

    buildInsightRowsFromArray(arr, kind) {
        if (!arr || arr.length === 0) {
            return [];
        }
        const rows = arr.map((item, index) => {
            const field = this.firstInsightField(item);
            const apiName = field.name || field.Name || item.name || item.Name || '';
            const labelRaw =
                (typeof field.label === 'string' && field.label.trim()) ||
                (typeof field.Label === 'string' && field.Label.trim()) ||
                '';
            const baseLabel = labelRaw || this.humanizeApiName(apiName);
            const prescribedRaw =
                this.collectPrescribedDisplay(field, true) ||
                this.collectPrescribedDisplay(item, false);
            const prescribedStr = this.formatInsightValue(prescribedRaw);
            const detail = prescribedStr ? `${baseLabel}: ${prescribedStr}` : baseLabel;
            const rawVal = item.value ?? item.Value;
            const value = Number(rawVal);
            const displayValue = Number.isFinite(value) ? value : null;
            return {
                key: `${kind}-${index}`,
                detail,
                displayValue,
                formattedPercent: this.formatPercent(displayValue),
                barScale: 0,
                isPositive: Number.isFinite(value) ? value > 0 : false
            };
        });

        rows.sort((a, b) => Math.abs(b.displayValue || 0) - Math.abs(a.displayValue || 0));
        return this.applyBarScales(rows);
    }

    firstInsightField(item) {
        if (!item || typeof item !== 'object') {
            return {};
        }
        const raw = item.fields ?? item.Fields;
        if (raw) {
            const arr = Array.isArray(raw) ? raw : [raw];
            return arr[0] && typeof arr[0] === 'object' ? arr[0] : {};
        }
        const topName = item.name ?? item.Name;
        if (topName) {
            return {
                name: topName,
                inputValue: item.inputValue ?? item.InputValue,
                prescribedValue: item.prescribedValue ?? item.PrescribedValue
            };
        }
        return {};
    }

    formatPercent(raw) {
        if (raw == null || Number.isNaN(raw)) {
            return '—';
        }
        const abs = Math.round(Math.abs(raw) * 10) / 10;
        const sign = raw > 0 ? '+' : raw < 0 ? '−' : '';
        return `${sign}${abs.toFixed(1)}`;
    }

    humanizeApiName(name) {
        if (!name) {
            return 'Field';
        }
        let n = String(name).trim();
        n = this.stripCustomFieldSuffixes(n);
        n = n.replace(/_/g, ' ');
        return n.replace(/\s+/g, ' ').trim();
    }

    stripCustomFieldSuffixes(apiName) {
        let n = apiName;
        const suffixes = ['_c__c', '__c', '__r', '_c'];
        for (let pass = 0; pass < 6; pass++) {
            let stripped = false;
            const lower = n.toLowerCase();
            for (const suf of suffixes) {
                if (lower.endsWith(suf.toLowerCase())) {
                    n = n.slice(0, n.length - suf.length);
                    stripped = true;
                    break;
                }
            }
            if (!stripped) {
                break;
            }
        }
        return n;
    }

    formatInsightValue(raw) {
        if (raw === undefined || raw === null) {
            return '';
        }
        let s = String(raw).trim();
        if (!s) {
            return '';
        }
        const num = Number(s);
        if (Number.isFinite(num) && /[eE.]/.test(s)) {
            if (Number.isInteger(num)) {
                return String(num);
            }
        }
        return s;
    }

    reduceError(error) {
        if (!error) {
            return 'Unknown error';
        }
        if (Array.isArray(error.body)) {
            return error.body.map((e) => e.message).join(', ');
        }
        if (typeof error.body?.message === 'string') {
            return error.body.message;
        }
        if (typeof error.message === 'string') {
            return error.message;
        }
        return String(error);
    }
}
