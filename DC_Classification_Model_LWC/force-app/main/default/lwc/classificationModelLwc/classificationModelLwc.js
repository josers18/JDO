import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import runPredictionFlow from '@salesforce/apex/ClassificationModelLwcController.runPredictionFlow';
import generateAnalysisSummary from '@salesforce/apex/ClassificationModelLwcController.generateAnalysisSummary';

const GAUGE_CIRC = 502;
const GAUGE_DURATION_MS = 1400;
const BAR_TRANSITION = 'transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)';

function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export default class ClassificationModelLwc extends LightningElement {
    @api cardTitle;
    @api summaryCardTitle;
    @api factorsSectionTitle;
    @api recommendationsSectionTitle;
    @api flowApiName;
    @api recordIdInputName = 'recordId';
    @api predictionVariableName = 'prediction';
    @api factorsVariableName = 'factors';
    @api recommendationsVariableName = 'recommendations';
    @api promptTemplateId;
    @api promptInputApiName = 'Input:Prediction_Context';
    @api autoGenerateSummary;
    @api factorsPositiveMeansGood;
    @api recommendationsPositiveMeansGood;
    @api riskColor = '#D4537E';
    @api goodColor = '#1D9E75';
    @api factorsRiskColor = '';
    @api factorsGoodColor = '';
    @api recommendationsRiskColor = '';
    @api recommendationsGoodColor = '';
    @api gaugeSubtitle;
    @api gaugeGradientReverse;
    @api gaugeColorLow = '';
    @api gaugeColorMid = '';
    @api gaugeColorHigh = '';
    @api gaugeArcBadColor = '';
    @api gaugeArcGoodColor = '';

    loadingFlow = false;
    loadingSummary = false;
    errorMessage;
    prediction;
    factorsJson;
    recommendationsJson;
    summaryText;
    summaryError;

    _recordId;
    _gaugeRafId;

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

    get scorePercentRounded() {
        if (this.prediction == null || Number.isNaN(Number(this.prediction))) {
            return null;
        }
        return Math.round(Number(this.prediction));
    }

    get hasData() {
        if (this.loadingFlow) {
            return false;
        }
        return (
            this.prediction != null ||
            this.insightItemCount(this.factorsJson) > 0 ||
            this.insightItemCount(this.recommendationsJson) > 0
        );
    }

    get hasPredictionScore() {
        return this.scorePercentRounded != null;
    }

    get factorRows() {
        return this.parseInsightRows(this.factorsJson, 'factor', this.factorsPositiveMeansGood === true);
    }

    get recommendationRows() {
        return this.parseInsightRows(
            this.recommendationsJson,
            'recommendation',
            this.recommendationsPositiveMeansGood === true
        );
    }

    get processedFactors() {
        const raw = this.factorsJson;
        const arr = this.normalizeInsightSource(raw);
        const rows = this.buildInsightRowsFromArray(arr, 'factor');
        const colors = this.resolveColors(this.factorsRiskColor, this.factorsGoodColor);
        const treatPositiveAsGood = this.factorsPositiveMeansGood === true;
        return this.applyProcessedRowColors(rows, colors, treatPositiveAsGood);
    }

    get processedRecommendations() {
        const raw = this.recommendationsJson;
        const arr = this.normalizeInsightSource(raw);
        const rows = this.buildInsightRowsFromArray(arr, 'recommendation');
        const colors = this.resolveColors(this.recommendationsRiskColor, this.recommendationsGoodColor);
        const treatPositiveAsGood = this.recommendationsPositiveMeansGood === true;
        return this.applyProcessedRowColors(rows, colors, treatPositiveAsGood);
    }

    get gaugeSubtitleDisplay() {
        return this.trimmedOr(this.gaugeSubtitle, 'Prediction score');
    }

    get gaugeAriaLabel() {
        const label = this.gaugeSubtitleDisplay;
        if (this.scorePercentRounded != null) {
            return `${label} ${this.scorePercentRounded} percent`;
        }
        return `${label} not available`;
    }

    /**
     * Solid arc stroke: interpolate bad → good by score 0–100%.
     * gaugeArcBadColor / gaugeArcGoodColor override; if blank, falls back to gaugeColorLow / gaugeColorHigh then defaults.
     */
    get gaugeArcSolidColor() {
        const bad = this.resolveGaugeArcBadHex();
        const good = this.resolveGaugeArcGoodHex();
        const p = this.scorePercentRounded;
        if (p == null || Number.isNaN(Number(p))) {
            return '#b0b0b0';
        }
        const t = Math.min(100, Math.max(0, Number(p))) / 100;
        const u = this.gaugeGradientReverse === true ? 1 - t : t;
        return this.lerpColorHex(bad, good, u);
    }

    resolveGaugeArcBadHex() {
        if (typeof this.gaugeArcBadColor === 'string' && this.isLikelyHexColor(this.gaugeArcBadColor.trim())) {
            return this.gaugeArcBadColor.trim();
        }
        return this.resolvedGaugeHexColor(this.gaugeColorLow, '#E74C3C');
    }

    resolveGaugeArcGoodHex() {
        if (typeof this.gaugeArcGoodColor === 'string' && this.isLikelyHexColor(this.gaugeArcGoodColor.trim())) {
            return this.gaugeArcGoodColor.trim();
        }
        return this.resolvedGaugeHexColor(this.gaugeColorHigh, '#1D9E75');
    }

    /**
     * Blend colors in HSL so pairs like orange-red (#D95B43) → teal (#3B8686) stay vivid.
     * Naive RGB lerp mixes to muddy brown in the middle.
     */
    lerpColorHex(hexA, hexB, t) {
        const a = this.parseHexToRgb(hexA);
        const b = this.parseHexToRgb(hexB);
        if (!a || !b) {
            return hexA || '#888888';
        }
        const n = Math.min(1, Math.max(0, t));
        const hslA = this.rgbToHsl(a.r, a.g, a.b);
        const hslB = this.rgbToHsl(b.r, b.g, b.b);
        const h = this.lerpHueDegrees(hslA.h, hslB.h, n);
        const s = hslA.s + (hslB.s - hslA.s) * n;
        const l = hslA.l + (hslB.l - hslA.l) * n;
        const rgb = this.hslToRgb(h, s, l);
        return (
            '#' +
            [rgb.r, rgb.g, rgb.b]
                .map((x) => x.toString(16).padStart(2, '0'))
                .join('')
        );
    }

    rgbToHsl(r, g, b) {
        const rn = r / 255;
        const gn = g / 255;
        const bn = b / 255;
        const max = Math.max(rn, gn, bn);
        const min = Math.min(rn, gn, bn);
        const lum = (max + min) / 2;
        let h = 0;
        let s = 0;
        if (max !== min) {
            const d = max - min;
            s = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case rn:
                    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
                    break;
                case gn:
                    h = ((bn - rn) / d + 2) / 6;
                    break;
                default:
                    h = ((rn - gn) / d + 4) / 6;
                    break;
            }
        }
        return { h: h * 360, s, l: lum };
    }

    lerpHueDegrees(h1, h2, t) {
        let d = h2 - h1;
        if (d > 180) {
            d -= 360;
        }
        if (d < -180) {
            d += 360;
        }
        let h = h1 + d * t;
        while (h < 0) {
            h += 360;
        }
        while (h >= 360) {
            h -= 360;
        }
        return h;
    }

    hslToRgb(hDeg, s, l) {
        const h = hDeg / 360;
        const hue2rgb = (p, q, tt) => {
            let t = tt;
            if (t < 0) {
                t += 1;
            }
            if (t > 1) {
                t -= 1;
            }
            if (t < 1 / 6) {
                return p + (q - p) * 6 * t;
            }
            if (t < 1 / 2) {
                return q;
            }
            if (t < 2 / 3) {
                return p + (q - p) * (2 / 3 - t) * 6;
            }
            return p;
        };
        let r;
        let g;
        let b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return {
            r: Math.round(Math.min(255, Math.max(0, r * 255))),
            g: Math.round(Math.min(255, Math.max(0, g * 255))),
            b: Math.round(Math.min(255, Math.max(0, b * 255)))
        };
    }

    parseHexToRgb(hex) {
        if (!hex || typeof hex !== 'string') {
            return null;
        }
        let h = hex.trim().replace('#', '');
        if (h.length === 3) {
            h = h
                .split('')
                .map((c) => c + c)
                .join('');
        }
        if (h.length === 8) {
            h = h.slice(0, 6);
        }
        if (h.length !== 6) {
            return null;
        }
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        if ([r, g, b].some((v) => Number.isNaN(v))) {
            return null;
        }
        return { r, g, b };
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

    get summaryCardTitleDisplay() {
        return this.trimmedOr(this.summaryCardTitle, 'Analysis summary');
    }

    get factorsSectionTitleDisplay() {
        return this.trimmedOr(this.factorsSectionTitle, 'Top predictors');
    }

    get recommendationsSectionTitleDisplay() {
        return this.trimmedOr(this.recommendationsSectionTitle, 'Suggested improvements');
    }

    trimmedOr(value, fallback) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
        return fallback;
    }

    resolvedGaugeHexColor(value, fallbackHex) {
        if (typeof value === 'string' && this.isLikelyHexColor(value.trim())) {
            return value.trim();
        }
        return fallbackHex;
    }

    isLikelyHexColor(s) {
        return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(s);
    }

    connectedCallback() {
        if (this._recordId) {
            this.refreshData();
        }
        setTimeout(() => this.animateGauge(), 50);
        setTimeout(() => this.animateBars(), 200);
    }

    renderedCallback() {
        const arc = this.template.querySelector('.gauge-arc');
        if (arc) {
            arc.style.removeProperty('stroke');
        }
    }

    schedulePostRenderAnimations() {
        setTimeout(() => this.animateGauge(), 50);
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
                factorsVariableName: this.factorsVariableName,
                recommendationsVariableName: this.recommendationsVariableName
            });
            this.prediction = result.prediction;
            this.factorsJson = result.factorsJson;
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
                prediction: this.prediction,
                factorsJson: this.factorsJson || '[]',
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

    animateGauge() {
        const arc = this.template.querySelector('.gauge-arc');
        if (!arc) {
            return;
        }
        if (this._gaugeRafId != null) {
            cancelAnimationFrame(this._gaugeRafId);
            this._gaugeRafId = null;
        }

        const score =
            this.scorePercentRounded != null
                ? Math.min(100, Math.max(0, this.scorePercentRounded))
                : 0;
        const targetOffset = GAUGE_CIRC - (score / 100) * GAUGE_CIRC;
        const startOffset = GAUGE_CIRC;
        let startTime = null;

        const tick = (now) => {
            if (startTime == null) {
                startTime = now;
            }
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / GAUGE_DURATION_MS);
            const eased = easeOutExpo(t);
            const current = startOffset + (targetOffset - startOffset) * eased;
            arc.style.strokeDashoffset = String(current);
            if (t < 1) {
                this._gaugeRafId = requestAnimationFrame(tick);
            } else {
                this._gaugeRafId = null;
                arc.style.strokeDashoffset = String(targetOffset);
            }
        };

        arc.style.strokeDasharray = String(GAUGE_CIRC);
        arc.style.strokeDashoffset = String(startOffset);
        this._gaugeRafId = requestAnimationFrame(tick);
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
        } catch (e) {
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

    /**
     * Human-readable prescribed value for a row.
     *
     * Einstein / model-explanation rows often look like:
     * `{ "fields": [{ "name": "Api_c__c", "inputValue": "35.0", "prescribedValue": "" }], "value": 2.79 }`
     * (factors: current value in `inputValue`) or
     * `{ "fields": [{ "name": "Api_c__c", "inputValue": "", "prescribedValue": "3 to 4" }], "value": -5.8 }`
     * (recommendations: target in `prescribedValue`). Parent `value` is the numeric impact — do not
     * use it as display text when reading the parent row (`allowNumericValueKeys: false`).
     *
     * Nested `fields[]` may also put display text in `value`/`Value` (string); we read those when
     * merging from the field object (`allowNumericValueKeys: true`).
     */
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
        // Non-empty string only: skip "" so recommendations fall through inputValue → prescribedValue.
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

    parseInsightRows(jsonString, kind, _positiveMeansGood) {
        return this.buildInsightRowsFromArray(this.parseJsonToInsightArray(jsonString), kind);
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
                barScale: 0
            };
        });

        if (kind === 'factor') {
            rows.sort((a, b) => (b.displayValue || 0) - (a.displayValue || 0));
        } else {
            rows.sort((a, b) => (a.displayValue || 0) - (b.displayValue || 0));
        }
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
        const sign = raw > 0 ? '+' : '';
        return `${sign}${raw.toFixed(1)}%`;
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
