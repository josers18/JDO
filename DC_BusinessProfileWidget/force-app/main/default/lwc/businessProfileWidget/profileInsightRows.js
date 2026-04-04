/**
 * Recommendation / factor row shaping (same JSON shapes as classificationModelLwc).
 */

function parseJsonToInsightArray(jsonString) {
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

function normalizeInsightSource(raw) {
    if (raw == null || raw === '') {
        return [];
    }
    if (Array.isArray(raw)) {
        return raw;
    }
    if (typeof raw === 'string') {
        return parseJsonToInsightArray(raw);
    }
    return [];
}

function resolveColors(sectionOverrideRisk, sectionOverrideGood, globalRisk, globalGood) {
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

function resolveRowDelta(row) {
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

function normalizeHexColorForCompare(value) {
    if (value == null || typeof value !== 'string') {
        return '';
    }
    return value.trim().toLowerCase();
}

function applyProcessedRowColors(rows, colors, treatPositiveAsGood) {
    const { risk, good } = colors;
    const riskKey = normalizeHexColorForCompare(risk);
    return rows.map((row) => {
        const parsedDelta = resolveRowDelta(row);
        const isPositiveDelta = parsedDelta > 0;
        let activeColor;
        if (isPositiveDelta) {
            activeColor = treatPositiveAsGood ? good : risk;
        } else if (parsedDelta < 0) {
            activeColor = treatPositiveAsGood ? risk : good;
        } else {
            activeColor = risk;
        }
        const activeKey = normalizeHexColorForCompare(activeColor);
        const deltaClass = activeKey === riskKey ? 'wp-delta-risk' : 'wp-delta-good';
        const barStyle = 'background: ' + activeColor;
        return {
            ...row,
            activeColor,
            barStyle,
            deltaClass
        };
    });
}

function formatInsightValue(raw) {
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

function collectPrescribedDisplay(source, allowNumericValueKeys) {
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
            return formatInsightValue(v);
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

function applyBarScales(rows) {
    const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.displayValue || 0)), 0);
    rows.forEach((r) => {
        const abs = r.displayValue != null ? Math.abs(r.displayValue) : 0;
        r.barScale = maxAbs > 0 ? abs / maxAbs : 0;
    });
    return rows;
}

function stripCustomFieldSuffixes(apiName) {
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

function humanizeApiName(name) {
    if (!name) {
        return 'Field';
    }
    let n = String(name).trim();
    n = stripCustomFieldSuffixes(n);
    n = n.replace(/_/g, ' ');
    return n.replace(/\s+/g, ' ').trim();
}

function formatPercent(raw) {
    if (raw == null || Number.isNaN(raw)) {
        return '—';
    }
    const sign = raw > 0 ? '+' : '';
    return `${sign}${raw.toFixed(1)}%`;
}

function firstInsightField(item) {
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

function stringPick(obj, keys) {
    if (!obj || typeof obj !== 'object') {
        return '';
    }
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === 'string' && v.trim()) {
            return v.trim();
        }
    }
    return '';
}

function buildInsightRowsFromArray(arr, kind) {
    if (!arr || arr.length === 0) {
        return [];
    }
    const rows = arr.map((item, index) => {
        const field = firstInsightField(item);
        const apiName = field.name || field.Name || item.name || item.Name || '';
        const labelRaw =
            (typeof field.label === 'string' && field.label.trim()) ||
            (typeof field.Label === 'string' && field.Label.trim()) ||
            '';
        let baseLabel = labelRaw || humanizeApiName(apiName);
        if (!baseLabel || baseLabel === 'Field') {
            const tf = stringPick(item, ['title', 'Title', 'action', 'Action', 'name', 'Name', 'label', 'Label']);
            if (tf) {
                baseLabel = tf;
            }
        }
        const prescribedRaw =
            collectPrescribedDisplay(field, true) || collectPrescribedDisplay(item, false);
        let prescribedStr = formatInsightValue(prescribedRaw);
        if (!prescribedStr) {
            prescribedStr = stringPick(item, ['detail', 'Detail', 'description', 'Description', 'body', 'Body', 'sub', 'subtitle']);
        }
        const detail = prescribedStr ? `${baseLabel}: ${prescribedStr}` : baseLabel;
        const rawVal =
            item.value ??
            item.Value ??
            item.impact ??
            item.Impact ??
            item.score ??
            item.Score;
        const value = Number(rawVal);
        const displayValue = Number.isFinite(value) ? value : null;
        return {
            rowKey: `${kind}-${index}`,
            detail,
            displayValue,
            formattedPercent: formatPercent(displayValue),
            barScale: 0
        };
    });

    if (kind === 'factor') {
        rows.sort((a, b) => (b.displayValue || 0) - (a.displayValue || 0));
    } else {
        rows.sort((a, b) => (a.displayValue || 0) - (b.displayValue || 0));
    }
    return applyBarScales(rows);
}

/**
 * @param {string|Array} rawJson — recommendationsJson string or already-parsed array from Apex
 * @param {{ riskColor: string, goodColor: string, sectionRisk?: string, sectionGood?: string, positiveMeansGood: boolean }} opts
 */
export function buildProcessedRecommendationRows(rawJson, opts) {
    const arr = normalizeInsightSource(rawJson);
    const rows = buildInsightRowsFromArray(arr, 'recommendation');
    const colors = resolveColors(opts.sectionRisk, opts.sectionGood, opts.riskColor, opts.goodColor);
    return applyProcessedRowColors(rows, colors, opts.positiveMeansGood === true);
}
