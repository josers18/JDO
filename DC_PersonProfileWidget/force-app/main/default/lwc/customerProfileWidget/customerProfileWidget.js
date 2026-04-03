import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getProfileData from '@salesforce/apex/CustomerProfileWidgetController.getProfileData';
import generateSummary from '@salesforce/apex/CustomerProfileWidgetController.generateSummary';
import runSignalGaugeFlow from '@salesforce/apex/CustomerProfileWidgetController.runSignalGaugeFlow';
import { buildProcessedRecommendationRows } from './profileInsightRows';

const THEMES = {

  /* ── ORIGINAL 4 ── */

  obsidian: {
    '--wp-shell-bg':       '#0c0a0f',
    '--wp-shell-border':   'rgba(184,149,106,0.07)',
    '--wp-panel-bg':       '#110e09',
    '--wp-surface':        '#150f0a',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.08)',
    '--wp-text-primary':   '#f0ebe0',
    '--wp-text-secondary': 'rgba(240,235,224,0.4)',
    '--wp-text-tertiary':  'rgba(240,235,224,0.25)',
    '--wp-kpi-bg':         '#110e09',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(184,149,106,0.12)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#030208',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.12)',
    '--wp-hdr-glow2':      'rgba(100,120,180,0.07)',
    '--wp-insight-bg':     'rgba(184,149,106,0.04)',
  },

  midnight: {
    '--wp-shell-bg':       '#060a14',
    '--wp-shell-border':   'rgba(184,149,106,0.08)',
    '--wp-panel-bg':       '#0a0f1a',
    '--wp-surface':        '#0c1220',
    '--wp-border-soft':    'rgba(255,255,255,0.06)',
    '--wp-border-med':     'rgba(255,255,255,0.10)',
    '--wp-text-primary':   '#e8eeff',
    '--wp-text-secondary': 'rgba(232,238,255,0.4)',
    '--wp-text-tertiary':  'rgba(232,238,255,0.22)',
    '--wp-kpi-bg':         '#0a0f1a',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(184,149,106,0.15)',
    '--wp-contact-bg':     'rgba(255,255,255,0.04)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#020408',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.10)',
    '--wp-hdr-glow2':      'rgba(40,60,120,0.12)',
    '--wp-insight-bg':     'rgba(184,149,106,0.05)',
  },

  graphite: {
    '--wp-shell-bg':       '#242424',
    '--wp-shell-border':   'rgba(184,149,106,0.15)',
    '--wp-panel-bg':       '#2a2a2a',
    '--wp-surface':        '#303030',
    '--wp-border-soft':    'rgba(255,255,255,0.08)',
    '--wp-border-med':     'rgba(255,255,255,0.12)',
    '--wp-text-primary':   '#f0ede8',
    '--wp-text-secondary': 'rgba(240,237,232,0.45)',
    '--wp-text-tertiary':  'rgba(240,237,232,0.28)',
    '--wp-kpi-bg':         '#2a2a2a',
    '--wp-track-bg':       'rgba(255,255,255,0.08)',
    '--wp-tab-border':     'rgba(184,149,106,0.20)',
    '--wp-contact-bg':     'rgba(255,255,255,0.04)',
    '--wp-org-bg':         'rgba(255,255,255,0.03)',
    '--wp-body-bg':        '#1a1a1a',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.09)',
    '--wp-hdr-glow2':      'rgba(60,60,60,0.30)',
    '--wp-insight-bg':     'rgba(184,149,106,0.06)',
  },

  ivory: {
    '--wp-shell-bg':       '#f7f4ee',
    '--wp-shell-border':   'rgba(184,149,106,0.20)',
    '--wp-panel-bg':       '#f0ece4',
    '--wp-surface':        '#f7f4ee',
    '--wp-border-soft':    'rgba(0,0,0,0.06)',
    '--wp-border-med':     'rgba(0,0,0,0.10)',
    '--wp-text-primary':   '#1a1510',
    '--wp-text-secondary': 'rgba(26,21,16,0.50)',
    '--wp-text-tertiary':  'rgba(26,21,16,0.35)',
    '--wp-kpi-bg':         '#ede9e0',
    '--wp-track-bg':       'rgba(0,0,0,0.08)',
    '--wp-tab-border':     'rgba(184,149,106,0.25)',
    '--wp-contact-bg':     'rgba(0,0,0,0.03)',
    '--wp-org-bg':         'rgba(0,0,0,0.02)',
    '--wp-body-bg':        '#e8e4dc',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.06)',
    '--wp-hdr-glow2':      'rgba(100,80,40,0.04)',
    '--wp-insight-bg':     'rgba(184,149,106,0.06)',
  },

  /* ── BATCH 2 — ELEGANT NEUTRALS ── */

  dusk: {
    '--wp-shell-bg':       '#1e1528',
    '--wp-shell-border':   'rgba(184,149,106,0.07)',
    '--wp-panel-bg':       '#241a30',
    '--wp-surface':        '#2a2038',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.08)',
    '--wp-text-primary':   '#f0e8f8',
    '--wp-text-secondary': 'rgba(240,232,248,0.40)',
    '--wp-text-tertiary':  'rgba(240,232,248,0.25)',
    '--wp-kpi-bg':         '#241a30',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(180,140,220,0.10)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#16101e',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.11)',
    '--wp-hdr-glow2':      'rgba(120,80,160,0.15)',
    '--wp-insight-bg':     'rgba(184,149,106,0.04)',
  },

  slate: {
    '--wp-shell-bg':       '#141e2a',
    '--wp-shell-border':   'rgba(184,149,106,0.07)',
    '--wp-panel-bg':       '#1a2535',
    '--wp-surface':        '#202d40',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.08)',
    '--wp-text-primary':   '#e8eef8',
    '--wp-text-secondary': 'rgba(232,238,248,0.38)',
    '--wp-text-tertiary':  'rgba(232,238,248,0.22)',
    '--wp-kpi-bg':         '#1a2535',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(100,140,200,0.10)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#0e1520',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.09)',
    '--wp-hdr-glow2':      'rgba(60,90,140,0.15)',
    '--wp-insight-bg':     'rgba(184,149,106,0.04)',
  },

  parchment: {
    '--wp-shell-bg':       '#f5edd8',
    '--wp-shell-border':   'rgba(160,120,60,0.20)',
    '--wp-panel-bg':       '#ede3cc',
    '--wp-surface':        '#f5edd8',
    '--wp-border-soft':    'rgba(42,30,16,0.07)',
    '--wp-border-med':     'rgba(42,30,16,0.12)',
    '--wp-text-primary':   '#2a1e10',
    '--wp-text-secondary': 'rgba(42,30,16,0.50)',
    '--wp-text-tertiary':  'rgba(42,30,16,0.35)',
    '--wp-kpi-bg':         '#ede3cc',
    '--wp-track-bg':       'rgba(42,30,16,0.09)',
    '--wp-tab-border':     'rgba(160,120,60,0.20)',
    '--wp-contact-bg':     'rgba(42,30,16,0.04)',
    '--wp-org-bg':         'rgba(42,30,16,0.02)',
    '--wp-body-bg':        '#ddd5c0',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.08)',
    '--wp-hdr-glow2':      'rgba(140,100,50,0.06)',
    '--wp-insight-bg':     'rgba(184,149,106,0.07)',
  },

  onyx: {
    '--wp-shell-bg':       '#0f0f0f',
    '--wp-shell-border':   'rgba(184,149,106,0.06)',
    '--wp-panel-bg':       '#151515',
    '--wp-surface':        '#1a1a1a',
    '--wp-border-soft':    'rgba(255,255,255,0.04)',
    '--wp-border-med':     'rgba(255,255,255,0.07)',
    '--wp-text-primary':   '#f0ebe0',
    '--wp-text-secondary': 'rgba(240,235,224,0.38)',
    '--wp-text-tertiary':  'rgba(240,235,224,0.22)',
    '--wp-kpi-bg':         '#151515',
    '--wp-track-bg':       'rgba(255,255,255,0.05)',
    '--wp-tab-border':     'rgba(184,149,106,0.08)',
    '--wp-contact-bg':     'rgba(255,255,255,0.02)',
    '--wp-org-bg':         'rgba(255,255,255,0.015)',
    '--wp-body-bg':        '#050505',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.07)',
    '--wp-hdr-glow2':      'rgba(0,0,0,0)',
    '--wp-insight-bg':     'rgba(184,149,106,0.03)',
  },

  fog: {
    '--wp-shell-bg':       '#eceef2',
    '--wp-shell-border':   'rgba(184,149,106,0.18)',
    '--wp-panel-bg':       '#e2e5ea',
    '--wp-surface':        '#eceef2',
    '--wp-border-soft':    'rgba(0,0,0,0.06)',
    '--wp-border-med':     'rgba(0,0,0,0.10)',
    '--wp-text-primary':   '#1a1a22',
    '--wp-text-secondary': 'rgba(26,26,34,0.48)',
    '--wp-text-tertiary':  'rgba(26,26,34,0.32)',
    '--wp-kpi-bg':         '#e2e5ea',
    '--wp-track-bg':       'rgba(26,26,34,0.09)',
    '--wp-tab-border':     'rgba(184,149,106,0.18)',
    '--wp-contact-bg':     'rgba(0,0,0,0.04)',
    '--wp-org-bg':         'rgba(0,0,0,0.02)',
    '--wp-body-bg':        '#d8dce2',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.07)',
    '--wp-hdr-glow2':      'rgba(80,100,130,0.05)',
    '--wp-insight-bg':     'rgba(184,149,106,0.06)',
  },

  /* ── BATCH 3 — GREENS & ORANGES ── */

  forest: {
    '--wp-shell-bg':       '#0c1810',
    '--wp-shell-border':   'rgba(100,180,120,0.08)',
    '--wp-panel-bg':       '#112016',
    '--wp-surface':        '#162a1c',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.08)',
    '--wp-text-primary':   '#e8f4ec',
    '--wp-text-secondary': 'rgba(232,244,236,0.40)',
    '--wp-text-tertiary':  'rgba(232,244,236,0.25)',
    '--wp-kpi-bg':         '#112016',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(80,180,100,0.10)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#060e09',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.10)',
    '--wp-hdr-glow2':      'rgba(30,100,50,0.20)',
    '--wp-insight-bg':     'rgba(184,149,106,0.04)',
  },

  ember: {
    '--wp-shell-bg':       '#18100a',
    '--wp-shell-border':   'rgba(220,120,40,0.08)',
    '--wp-panel-bg':       '#201610',
    '--wp-surface':        '#281c14',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.08)',
    '--wp-text-primary':   '#f8ece0',
    '--wp-text-secondary': 'rgba(248,236,224,0.40)',
    '--wp-text-tertiary':  'rgba(248,236,224,0.26)',
    '--wp-kpi-bg':         '#201610',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(220,120,40,0.10)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#0e0604',
    '--wp-hdr-glow1':      'rgba(220,120,40,0.14)',
    '--wp-hdr-glow2':      'rgba(160,60,20,0.15)',
    '--wp-insight-bg':     'rgba(220,120,40,0.05)',
  },

  sage: {
    '--wp-shell-bg':       '#e4ede6',
    '--wp-shell-border':   'rgba(80,120,80,0.18)',
    '--wp-panel-bg':       '#d8e4d8',
    '--wp-surface':        '#e4ede6',
    '--wp-border-soft':    'rgba(30,44,30,0.07)',
    '--wp-border-med':     'rgba(30,44,30,0.12)',
    '--wp-text-primary':   '#1e2c1e',
    '--wp-text-secondary': 'rgba(30,44,30,0.50)',
    '--wp-text-tertiary':  'rgba(30,44,30,0.35)',
    '--wp-kpi-bg':         '#d8e4d8',
    '--wp-track-bg':       'rgba(30,44,30,0.10)',
    '--wp-tab-border':     'rgba(80,120,80,0.18)',
    '--wp-contact-bg':     'rgba(30,44,30,0.04)',
    '--wp-org-bg':         'rgba(30,44,30,0.02)',
    '--wp-body-bg':        '#c8d4c8',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.06)',
    '--wp-hdr-glow2':      'rgba(60,100,60,0.06)',
    '--wp-insight-bg':     'rgba(184,149,106,0.07)',
  },

  copper: {
    '--wp-shell-bg':       '#160e08',
    '--wp-shell-border':   'rgba(200,130,50,0.08)',
    '--wp-panel-bg':       '#1e1208',
    '--wp-surface':        '#261a10',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.08)',
    '--wp-text-primary':   '#faf0e4',
    '--wp-text-secondary': 'rgba(250,240,228,0.40)',
    '--wp-text-tertiary':  'rgba(250,240,228,0.26)',
    '--wp-kpi-bg':         '#1e1208',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(200,130,50,0.10)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#0d0804',
    '--wp-hdr-glow1':      'rgba(200,130,50,0.16)',
    '--wp-hdr-glow2':      'rgba(120,60,20,0.18)',
    '--wp-insight-bg':     'rgba(200,130,50,0.05)',
  },

  verdant: {
    '--wp-shell-bg':       '#e8f2e8',
    '--wp-shell-border':   'rgba(60,120,70,0.18)',
    '--wp-panel-bg':       '#dceadc',
    '--wp-surface':        '#e8f2e8',
    '--wp-border-soft':    'rgba(22,32,24,0.07)',
    '--wp-border-med':     'rgba(22,32,24,0.12)',
    '--wp-text-primary':   '#162018',
    '--wp-text-secondary': 'rgba(22,32,24,0.50)',
    '--wp-text-tertiary':  'rgba(22,32,24,0.35)',
    '--wp-kpi-bg':         '#dceadc',
    '--wp-track-bg':       'rgba(22,32,24,0.10)',
    '--wp-tab-border':     'rgba(60,120,70,0.18)',
    '--wp-contact-bg':     'rgba(22,32,24,0.04)',
    '--wp-org-bg':         'rgba(22,32,24,0.02)',
    '--wp-body-bg':        '#c2d4c4',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.07)',
    '--wp-hdr-glow2':      'rgba(40,100,50,0.07)',
    '--wp-insight-bg':     'rgba(184,149,106,0.07)',
  },

  /* ── BATCH 4 — BLUES & GREYS ── */

  steel: {
    '--wp-shell-bg':       '#101826',
    '--wp-shell-border':   'rgba(184,149,106,0.07)',
    '--wp-panel-bg':       '#162030',
    '--wp-surface':        '#1c2838',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.08)',
    '--wp-text-primary':   '#e8f0fc',
    '--wp-text-secondary': 'rgba(232,240,252,0.38)',
    '--wp-text-tertiary':  'rgba(232,240,252,0.22)',
    '--wp-kpi-bg':         '#162030',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(60,120,200,0.10)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#080e18',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.11)',
    '--wp-hdr-glow2':      'rgba(30,70,130,0.18)',
    '--wp-insight-bg':     'rgba(184,149,106,0.04)',
  },

  mercury: {
    '--wp-shell-bg':       '#181c22',
    '--wp-shell-border':   'rgba(184,149,106,0.07)',
    '--wp-panel-bg':       '#20242c',
    '--wp-surface':        '#262c35',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.08)',
    '--wp-text-primary':   '#ecedee',
    '--wp-text-secondary': 'rgba(236,237,238,0.40)',
    '--wp-text-tertiary':  'rgba(236,237,238,0.24)',
    '--wp-kpi-bg':         '#20242c',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(160,170,190,0.10)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#0e1014',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.10)',
    '--wp-hdr-glow2':      'rgba(80,90,110,0.20)',
    '--wp-insight-bg':     'rgba(184,149,106,0.04)',
  },

  arctic: {
    '--wp-shell-bg':       '#dde8f4',
    '--wp-shell-border':   'rgba(80,130,180,0.18)',
    '--wp-panel-bg':       '#d0dff0',
    '--wp-surface':        '#dde8f4',
    '--wp-border-soft':    'rgba(18,32,46,0.07)',
    '--wp-border-med':     'rgba(18,32,46,0.12)',
    '--wp-text-primary':   '#12202e',
    '--wp-text-secondary': 'rgba(18,32,46,0.48)',
    '--wp-text-tertiary':  'rgba(18,32,46,0.32)',
    '--wp-kpi-bg':         '#d0dff0',
    '--wp-track-bg':       'rgba(18,32,46,0.10)',
    '--wp-tab-border':     'rgba(60,130,200,0.16)',
    '--wp-contact-bg':     'rgba(18,32,46,0.04)',
    '--wp-org-bg':         'rgba(18,32,46,0.02)',
    '--wp-body-bg':        '#c8d8e8',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.07)',
    '--wp-hdr-glow2':      'rgba(60,110,160,0.08)',
    '--wp-insight-bg':     'rgba(184,149,106,0.07)',
  },

  indigo: {
    '--wp-shell-bg':       '#10101e',
    '--wp-shell-border':   'rgba(184,149,106,0.07)',
    '--wp-panel-bg':       '#16162a',
    '--wp-surface':        '#1c1c34',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.08)',
    '--wp-text-primary':   '#eeeaf8',
    '--wp-text-secondary': 'rgba(238,234,248,0.38)',
    '--wp-text-tertiary':  'rgba(238,234,248,0.23)',
    '--wp-kpi-bg':         '#16162a',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(100,80,200,0.10)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#09080e',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.11)',
    '--wp-hdr-glow2':      'rgba(80,60,180,0.18)',
    '--wp-insight-bg':     'rgba(184,149,106,0.04)',
  },

  glacier: {
    '--wp-shell-bg':       '#e8eff5',
    '--wp-shell-border':   'rgba(100,130,160,0.18)',
    '--wp-panel-bg':       '#dce6f0',
    '--wp-surface':        '#e8eff5',
    '--wp-border-soft':    'rgba(24,36,46,0.07)',
    '--wp-border-med':     'rgba(24,36,46,0.12)',
    '--wp-text-primary':   '#18242e',
    '--wp-text-secondary': 'rgba(24,36,46,0.48)',
    '--wp-text-tertiary':  'rgba(24,36,46,0.32)',
    '--wp-kpi-bg':         '#dce6f0',
    '--wp-track-bg':       'rgba(24,36,46,0.10)',
    '--wp-tab-border':     'rgba(80,120,160,0.16)',
    '--wp-contact-bg':     'rgba(24,36,46,0.04)',
    '--wp-org-bg':         'rgba(24,36,46,0.02)',
    '--wp-body-bg':        '#ccd5de',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.06)',
    '--wp-hdr-glow2':      'rgba(80,110,140,0.07)',
    '--wp-insight-bg':     'rgba(184,149,106,0.07)',
  },

};

const THEME_API_DEFAULTS = {
    backgroundPrimary: '#0b0c14',
    backgroundSecondary: '#0f1020',
    accentColor: '#d4b469',
    accentColorSecondary: '#1d9e75',
    textPrimary: '#f0ebe0',
    textSecondary: 'rgba(240,235,224,0.4)',
    positiveColor: '#5dcaa5',
    negativeColor: '#d4537e',
    warningColor: '#e09840',
    headerGradientColor1: 'rgba(100,80,200,0.25)',
    headerGradientColor2: 'rgba(29,158,117,0.12)'
};

function normColor(v) {
    return String(v == null ? '' : v)
        .trim()
        .replace(/\s+/g, '')
        .toLowerCase();
}

/** Allow https/http and same-origin paths only (blocks javascript:, data:, etc.). */
function sanitizeProfilePhotoUrl(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) {
        return '';
    }
    const lower = s.slice(0, 12).toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:')) {
        return '';
    }
    if (/^https?:\/\//i.test(s)) {
        return s;
    }
    if (s.startsWith('/')) {
        return s;
    }
    return '';
}

const RING_CIRC = 175.9;

const SIGNAL_GAUGE_DEFAULT_LABELS = ['Propensity', 'Engagement', 'Churn risk'];
const SIGNAL_GAUGE_STROKES = ['var(--wp-positive)', 'var(--wp-accent)', 'var(--wp-negative)'];

function normalizeSignalGaugeFormat(raw) {
    const s = (raw || 'percent').trim().toLowerCase();
    const aliases = { classification: 'percent', logistic: 'percent', regression: 'decimal' };
    const k = aliases[s] || s;
    const allowed = ['percent', 'integer', 'decimal', 'currency'];
    return allowed.includes(k) ? k : 'percent';
}

function clampGaugeFractionDigits(n, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) {
        return fallback;
    }
    return Math.min(8, Math.max(0, Math.round(v)));
}

function signalGaugeRingPercent(raw, formatKey, ringMax) {
    if (raw == null || !Number.isFinite(Number(raw))) {
        return 0;
    }
    const x = Number(raw);
    if (formatKey === 'percent') {
        return Math.min(100, Math.max(0, x));
    }
    const max = Number(ringMax);
    if (Number.isFinite(max) && max > 0) {
        return Math.min(100, Math.max(0, (x / max) * 100));
    }
    return 0;
}

function formatSignalGaugeCenter(raw, formatKey, minFrac, maxFrac, currencyCode, loading, hasFlowError) {
    if (loading) {
        return '…';
    }
    if (hasFlowError) {
        return '—';
    }
    if (raw == null || !Number.isFinite(Number(raw))) {
        return '—';
    }
    const n = Number(raw);
    if (formatKey === 'percent') {
        return String(Math.round(n));
    }
    if (formatKey === 'integer') {
        return String(Math.round(n));
    }
    if (formatKey === 'currency') {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: minFrac,
            maximumFractionDigits: maxFrac
        }).format(n);
    }
    return new Intl.NumberFormat(undefined, {
        style: 'decimal',
        minimumFractionDigits: minFrac,
        maximumFractionDigits: maxFrac
    }).format(n);
}

/** Logical widget slots for profile assembly Flow (must match Apex PROFILE_ASSEMBLY_OUTPUT_KEYS). */
const ASSEMBLY_FLOW_LOGICAL_KEYS = [
    'fullName',
    'firstName',
    'lastName',
    'city',
    'state',
    'industry',
    'employees',
    'phone',
    'email',
    'website',
    'revenue',
    'tierSegment',
    'propensityScore',
    'engagementScore',
    'churnScore',
    'ltvScore',
    'crossSellScore',
    'savingsRate',
    'investmentBalance',
    'loanBalance',
    'depositYtd',
    'loanLimit',
    'riskProfile',
    'customerSince',
    'lastInteraction',
    'mobileEnrolled',
    'onlineEnrolled',
    'kycStatus',
    'twoFaStatus',
    'paperlessEnrolled',
    'alertsEnrolled',
    'wireEnabled',
    'street',
    'zip',
    'assignedBranch',
    'branchDistance',
    'assignedBranchAddress',
    'assignedBranchHours',
    'assignedBranchStatus',
    'nearbyBranches',
    'financialAccounts',
    'mapLatitude',
    'mapLongitude',
    'profilePhotoUrl'
];

const MMM_YYYY_UTC = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
});

/**
 * Format Salesforce / ISO date strings as "Mar 2026". Non-dates pass through unchanged.
 */
function formatMmmYyyy(raw) {
    if (raw == null || raw === '') {
        return '';
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? String(raw) : MMM_YYYY_UTC.format(d);
    }
    const s = String(raw).trim();
    if (!s) {
        return '';
    }
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) {
        const y = Number(ymd[1]);
        const m = Number(ymd[2]) - 1;
        const day = Number(ymd[3]);
        const d = new Date(Date.UTC(y, m, day));
        if (!Number.isNaN(d.getTime())) {
            return MMM_YYYY_UTC.format(d);
        }
    }
    const ms = Date.parse(s);
    if (!Number.isNaN(ms)) {
        return MMM_YYYY_UTC.format(new Date(ms));
    }
    return s;
}

/** UTC midnight ms for calendar-day diff (last contact vs today). */
function utcMidnightMsFromProfileDate(raw) {
    if (raw == null || raw === '') {
        return null;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
            return null;
        }
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const s = String(raw).trim();
    if (!s) {
        return null;
    }
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) {
        return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    }
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) {
        return null;
    }
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export default class CustomerProfileWidget extends LightningElement {
    // Group 1 — Data source
    @api coreCustomFieldsJson = '';
    @api profileAssemblyFlowApiName = '';
    @api profileAssemblyFlowRecordIdVariable = 'recordId';
    /**
     * API name of a Text output variable on the profile assembly flow whose value is the image URL.
     * Sent as logical key profilePhotoUrl when [Asm flow output] Profile photo URL and advanced JSON omit it.
     */
    @api profilePhotoFlowOutputVariable = '';
    /** Optional advanced: merged with per-slot assembly outputs; per-slot values override same key. */
    @api profileFlowOutputMapJson = '';
    @api assemblyOutFullName = '';
    @api assemblyOutFirstName = '';
    @api assemblyOutLastName = '';
    @api assemblyOutCity = '';
    @api assemblyOutState = '';
    @api assemblyOutIndustry = '';
    @api assemblyOutEmployees = '';
    @api assemblyOutPhone = '';
    @api assemblyOutEmail = '';
    @api assemblyOutWebsite = '';
    @api assemblyOutRevenue = '';
    @api assemblyOutTierSegment = '';
    @api assemblyOutPropensityScore = '';
    @api assemblyOutEngagementScore = '';
    @api assemblyOutChurnScore = '';
    @api assemblyOutLtvScore = '';
    @api assemblyOutCrossSellScore = '';
    @api assemblyOutSavingsRate = '';
    @api assemblyOutInvestmentBalance = '';
    @api assemblyOutLoanBalance = '';
    @api assemblyOutDepositYtd = '';
    @api assemblyOutLoanLimit = '';
    @api assemblyOutRiskProfile = '';
    @api assemblyOutCustomerSince = '';
    @api assemblyOutLastInteraction = '';
    @api assemblyOutMobileEnrolled = '';
    @api assemblyOutOnlineEnrolled = '';
    @api assemblyOutKycStatus = '';
    @api assemblyOutTwoFaStatus = '';
    @api assemblyOutPaperlessEnrolled = '';
    @api assemblyOutAlertsEnrolled = '';
    @api assemblyOutWireEnabled = '';
    @api assemblyOutStreet = '';
    @api assemblyOutZip = '';
    @api assemblyOutAssignedBranch = '';
    @api assemblyOutBranchDistance = '';
    @api assemblyOutAssignedBranchAddress = '';
    @api assemblyOutAssignedBranchHours = '';
    @api assemblyOutAssignedBranchStatus = '';
    @api assemblyOutNearbyBranches = '';
    @api assemblyOutPortfolioTrend = '';
    @api assemblyOutFinancialAccounts = '';
    @api assemblyOutMapLatitude = '';
    @api assemblyOutMapLongitude = '';
    @api assemblyOutProfilePhotoUrl = '';
    /** When not false, Apex geocodes billing address via OpenStreetMap Nominatim (Remote Site required). */
    @api geocodeBillingAddress;
    @api flowApiName = '';
    @api flowRecordIdVariable = 'recordId';
    @api flowPredictionVariable = 'prediction';
    @api flowRecommendationsVariable = 'recommendations';
    @api promptTemplateId = '';
    @api promptInputApiName = 'Input:Prediction_Context';
    @api autoGenerateSummary;
    /** Match classificationModelLwc: when true, positive recommendation % uses good color. */
    @api insightRecommendationsPositiveMeansGood;
    @api insightRecommendationsRiskColor = '';
    @api insightRecommendationsGoodColor = '';
    @api insightRecommendationsSectionTitle = 'Recommended actions';

    // Group 2 — Titles
    @api cardTitle = 'Client profile';
    @api overviewTabLabel = 'Overview';
    @api signalsTabLabel = 'AI Signals';
    /** Denominator for cross-sell score (e.g. 10 → "5 / 10"). */
    @api crossSellScoreMax;
    @api signalsDetailSectionLabel = 'Cross-sell & savings';
    /** Gauge 1–3: optional autolaunched inference flow; blank → use profile propensityScore / engagementScore / churnScore. */
    @api signalGauge1ModelLabel = 'Propensity';
    @api signalGauge1FlowApiName = '';
    @api signalGauge1RecordIdVariable = 'recordId';
    @api signalGauge1PredictionVariable = 'prediction';
    @api signalGauge1OutputFormat = 'percent';
    @api signalGauge1RingScaleMax = '';
    @api signalGauge2ModelLabel = 'Engagement';
    @api signalGauge2FlowApiName = '';
    @api signalGauge2RecordIdVariable = 'recordId';
    @api signalGauge2PredictionVariable = 'prediction';
    @api signalGauge2OutputFormat = 'percent';
    @api signalGauge2RingScaleMax = '';
    @api signalGauge3ModelLabel = 'Churn risk';
    @api signalGauge3FlowApiName = '';
    @api signalGauge3RecordIdVariable = 'recordId';
    @api signalGauge3PredictionVariable = 'prediction';
    @api signalGauge3OutputFormat = 'percent';
    @api signalGauge3RingScaleMax = '';
    @api signalGaugeCurrencyCode = 'USD';
    @api signalGaugeMinFractionDigits;
    @api signalGaugeMaxFractionDigits;
    @api portfolioTabLabel = 'Portfolio';
    @api servicesTabLabel = 'Services';
    /** Optional: body text under Suggested next steps when this service is not enrolled. Blank = built-in paragraph. */
    @api servicesSuggestionCopyMobileBanking = '';
    @api servicesSuggestionCopyOnlineBanking = '';
    @api servicesSuggestionCopyWireTransfers = '';
    @api servicesSuggestionCopyPaperless = '';
    @api servicesSuggestionCopyAccountAlerts = '';
    @api servicesSuggestionCopyKycCompliance = '';
    /**
     * Optional JSON map (service name → paragraph). Overrides built-in copy when a key matches; per-field properties above win over JSON.
     * Keys: "Mobile banking", "Online banking", "Wire transfers", "Paperless", "Account alerts", "KYC / compliance".
     */
    @api servicesSuggestionValueAddJson = '';
    @api locationTabLabel = 'Location';
    @api insightTabLabel = 'Insight';

    // Group 3 — Section visibility (LWC1503: no @api Boolean = true)
    @api showOverviewTab;
    @api showSignalsTab;
    @api showPortfolioTab;
    @api showServicesTab;
    @api showLocationTab;
    @api showInsightTab;
    @api showKpiStrip;
    @api showEnrollmentFlags;
    @api showSparkline;
    @api showBranchProximity;
    @api showAiActions;

    // Group 4 — Theme colors
    @api backgroundPrimary = '#0b0c14';
    @api backgroundSecondary = '#0f1020';
    @api accentColor = '#d4b469';
    @api accentColorSecondary = '#1d9e75';
    @api textPrimary = '#f0ebe0';
    @api textSecondary = 'rgba(240,235,224,0.4)';
    @api positiveColor = '#5dcaa5';
    @api negativeColor = '#d4537e';
    @api warningColor = '#e09840';

    _themeMode = 'obsidian';
    /** Monotonic token so scheduleApplyTheme never drops a themeMode/@api color update (renderedCallback vs flexipage prop order on live pages). */
    _themeScheduleToken = 0;

    @api
    get themeMode() {
        return this._themeMode;
    }
    set themeMode(value) {
        const raw = (value && String(value).trim()) || 'obsidian';
        const m = raw.toLowerCase();
        this._themeMode = THEMES[m] ? m : 'obsidian';
        // Never mutate host style synchronously here: App Builder / Aura can invoke this setter
        // mid–public-prop sync; touching the host during that window triggers vdom errors ("Re-setting of key is prohibited").
        this.scheduleApplyTheme();
    }

    @api showThemeSwitcher = false;

    // Group 5 — Gradient
    @api headerGradientStyle = 'radial';
    @api headerGradientColor1 = 'rgba(100,80,200,0.25)';
    @api headerGradientColor2 = 'rgba(29,158,117,0.12)';
    @api avatarRingStyle = 'gold';
    /** 85–160 (%). Scales widget typography via CSS; 100 = design default. */
    @api textScalePercent = 100;
    /** default | medium | stronger headings/KPIs; strong also boosts tabs/meta. */
    @api textEmphasis = 'default';
    /**
     * Optional avatar image URL (https recommended). Overrides assembly output, core custom field map, and Contact PhotoUrl when set.
     * Blank: use [Profile assembly Flow] Profile photo output variable, [Asm flow output] Profile photo URL, advanced JSON profilePhotoUrl, core field map, Contact PhotoUrl, or initials.
     */
    @api profilePhotoUrl = '';

    profileData = null;
    /** Flow inference results for signal gauges [0..2]; null = use profile fallback or no data. */
    gaugeInferencePredictions = [null, null, null];
    gaugeInferenceLoading = [false, false, false];
    gaugeInferenceErrors = [null, null, null];
    loading = false;
    errorMessage = null;
    summaryText = null;
    summaryLoading = false;
    summaryError = null;
    activeTab = 'overview';
    _recordId;

    @api
    get recordId() {
        return this._recordId;
    }
    set recordId(value) {
        this._recordId = value;
        if (value) {
            this.loadProfile();
        }
    }

    connectedCallback() {
        this.applyTheme();
        // .wp-shell may not exist until after first paint; rAF re-applies after DOM is ready (live record pages).
        requestAnimationFrame(() => {
            this.applyTheme();
            requestAnimationFrame(() => this.applyTheme());
        });
        this.ensureActiveTab();
        if (this._recordId) {
            this.loadProfile();
        }
    }

    renderedCallback() {
        this.scheduleApplyTheme();
    }

    ensureActiveTab() {
        const ids = this.visibleTabs.map((t) => t.id);
        if (!ids.includes(this.activeTab) && ids.length) {
            this.activeTab = ids[0];
        }
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

    /**
     * Apply CSS variables to the custom element host and to .wp-shell so tokens survive flexipage / hydration ordering
     * (App Builder preview vs live record page).
     */
    applyTheme() {
        const host = this.template?.host;
        const shell = this.template?.querySelector('.wp-shell');
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

        const mode = (this._themeMode || 'obsidian').toLowerCase();
        const tokens = THEMES[mode] || THEMES.obsidian;
        const d = THEME_API_DEFAULTS;

        const applyTo = (el) => {
            Object.entries(tokens).forEach(([prop, value]) => {
                el.style.setProperty(prop, value);
            });
            el.style.setProperty('--wp-border', tokens['--wp-border-med']);
            el.style.setProperty('--wp-bg-primary', tokens['--wp-shell-bg']);
            el.style.setProperty('--wp-bg-secondary', tokens['--wp-panel-bg']);

            if (normColor(this.headerGradientColor1) === normColor(d.headerGradientColor1)) {
                el.style.setProperty('--wp-gradient-1', tokens['--wp-hdr-glow1']);
            } else {
                el.style.setProperty('--wp-gradient-1', this.headerGradientColor1);
            }
            if (normColor(this.headerGradientColor2) === normColor(d.headerGradientColor2)) {
                el.style.setProperty('--wp-gradient-2', tokens['--wp-hdr-glow2']);
            } else {
                el.style.setProperty('--wp-gradient-2', this.headerGradientColor2);
            }

            if (normColor(this.backgroundPrimary) !== normColor(d.backgroundPrimary)) {
                el.style.setProperty('--wp-bg-primary', this.backgroundPrimary);
            }
            if (normColor(this.backgroundSecondary) !== normColor(d.backgroundSecondary)) {
                el.style.setProperty('--wp-bg-secondary', this.backgroundSecondary);
            }
            if (normColor(this.accentColor) !== normColor(d.accentColor)) {
                el.style.setProperty('--wp-accent', this.accentColor);
            }
            if (normColor(this.accentColorSecondary) !== normColor(d.accentColorSecondary)) {
                el.style.setProperty('--wp-accent-2', this.accentColorSecondary);
            }
            if (normColor(this.textPrimary) !== normColor(d.textPrimary)) {
                el.style.setProperty('--wp-text-primary', this.textPrimary);
            }
            if (normColor(this.textSecondary) !== normColor(d.textSecondary)) {
                el.style.setProperty('--wp-text-secondary', this.textSecondary);
            }
            if (normColor(this.positiveColor) !== normColor(d.positiveColor)) {
                el.style.setProperty('--wp-positive', this.positiveColor);
            }
            if (normColor(this.negativeColor) !== normColor(d.negativeColor)) {
                el.style.setProperty('--wp-negative', this.negativeColor);
            }
            if (normColor(this.warningColor) !== normColor(d.warningColor)) {
                el.style.setProperty('--wp-warning', this.warningColor);
            }
        };

        targets.forEach(applyTo);
    }

    handleThemeSwitch(event) {
        const theme = event.currentTarget.dataset.theme;
        if (theme && THEMES[theme]) {
            this.themeMode = theme;
        }
    }

    /**
     * Builds JSON for Apex: optional legacy JSON plus non-blank [Asm flow output] fields (per-slot wins on duplicate keys).
     */
    buildAssemblyOutputMapJson() {
        const map = {};
        const rawJson = this.profileFlowOutputMapJson;
        if (rawJson != null && String(rawJson).trim() !== '') {
            try {
                const parsed = JSON.parse(String(rawJson).trim());
                if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    Object.assign(map, parsed);
                }
            } catch (e) {
                // ignore invalid JSON; per-slot fields may still apply
            }
        }
        for (const logicalKey of ASSEMBLY_FLOW_LOGICAL_KEYS) {
            const prop = `assemblyOut${logicalKey.charAt(0).toUpperCase()}${logicalKey.slice(1)}`;
            const v = this[prop];
            if (v != null && String(v).trim() !== '') {
                map[logicalKey] = String(v).trim();
            }
        }
        const existingPhotoMap =
            map.profilePhotoUrl != null && String(map.profilePhotoUrl).trim() !== '';
        const slotPhoto = (this.assemblyOutProfilePhotoUrl || '').trim();
        const namedFlowPhoto = (this.profilePhotoFlowOutputVariable || '').trim();
        if (!existingPhotoMap && !slotPhoto && namedFlowPhoto) {
            map.profilePhotoUrl = namedFlowPhoto;
        }
        return JSON.stringify(map);
    }

    async loadProfile() {
        if (!this._recordId) {
            return;
        }
        this.loading = true;
        this.errorMessage = null;
        this.summaryText = null;
        this.summaryError = null;
        this.gaugeInferencePredictions = [null, null, null];
        this.gaugeInferenceLoading = [false, false, false];
        this.gaugeInferenceErrors = [null, null, null];
        try {
            const result = await getProfileData({
                recordId: this._recordId,
                flowApiName: this.flowApiName,
                flowRecordIdVariable: this.flowRecordIdVariable,
                flowPredictionVariable: this.flowPredictionVariable,
                flowRecommendationsVariable: this.flowRecommendationsVariable,
                coreCustomFieldsJson: this.coreCustomFieldsJson || '',
                profileAssemblyFlowApiName: this.profileAssemblyFlowApiName || '',
                profileAssemblyFlowRecordIdVariable: this.profileAssemblyFlowRecordIdVariable || 'recordId',
                profileFlowOutputMapJson: this.buildAssemblyOutputMapJson(),
                geocodeBillingAddress: this.geocodeBillingAddress !== false
            });
            this.profileData = result;
            this.ensureActiveTab();
            void this.refreshSignalGaugeFlows();
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => {
                this.animateBars();
            }, 400);
            if (this.promptTemplateId && this.autoGenerateSummary !== false) {
                this.loadSummary();
            }
        } catch (e) {
            this.errorMessage = this.reduceError(e);
            this.profileData = null;
            this.gaugeInferencePredictions = [null, null, null];
            this.gaugeInferenceLoading = [false, false, false];
            this.gaugeInferenceErrors = [null, null, null];
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Profile load failed',
                    message: this.errorMessage,
                    variant: 'error',
                    mode: 'sticky'
                })
            );
        } finally {
            this.loading = false;
        }
    }

    reduceError(e) {
        if (e.body && e.body.message) {
            return e.body.message;
        }
        if (e.message) {
            return e.message;
        }
        return 'Unknown error';
    }

    signalGaugeConfig(index) {
        const n = index + 1;
        const ringMaxRaw = this[`signalGauge${n}RingScaleMax`];
        const ringMaxNum = Number(ringMaxRaw);
        return {
            label: (this[`signalGauge${n}ModelLabel`] || '').trim(),
            flowApiName: (this[`signalGauge${n}FlowApiName`] || '').trim(),
            recordVar: (this[`signalGauge${n}RecordIdVariable`] || 'recordId').trim(),
            predVar: (this[`signalGauge${n}PredictionVariable`] || 'prediction').trim(),
            format: normalizeSignalGaugeFormat(this[`signalGauge${n}OutputFormat`]),
            ringMax: Number.isFinite(ringMaxNum) && ringMaxNum > 0 ? ringMaxNum : null
        };
    }

    patchGaugeSlot(i, patch) {
        const preds = [...this.gaugeInferencePredictions];
        const loads = [...this.gaugeInferenceLoading];
        const errs = [...this.gaugeInferenceErrors];
        if (Object.prototype.hasOwnProperty.call(patch, 'pred')) {
            preds[i] = patch.pred;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'loading')) {
            loads[i] = patch.loading;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'err')) {
            errs[i] = patch.err;
        }
        this.gaugeInferencePredictions = preds;
        this.gaugeInferenceLoading = loads;
        this.gaugeInferenceErrors = errs;
    }

    async refreshSignalGaugeFlows() {
        const rid = this._recordId;
        if (!rid) {
            return;
        }
        const jobs = [];
        for (let i = 0; i < 3; i++) {
            const { flowApiName } = this.signalGaugeConfig(i);
            if (!flowApiName) {
                continue;
            }
            jobs.push(this.runSignalGaugeFlowAt(i, flowApiName, rid));
        }
        if (jobs.length) {
            await Promise.all(jobs);
        }
    }

    async runSignalGaugeFlowAt(index, flowApiName, recordId) {
        const cfg = this.signalGaugeConfig(index);
        this.patchGaugeSlot(index, { pred: null, loading: true, err: null });
        try {
            const res = await runSignalGaugeFlow({
                flowApiName,
                recordId,
                recordIdVariableName: cfg.recordVar,
                predictionVariableName: cfg.predVar
            });
            const p = res?.prediction;
            const n = p != null ? Number(p) : NaN;
            this.patchGaugeSlot(index, {
                pred: Number.isFinite(n) ? n : null,
                loading: false,
                err: null
            });
        } catch (e) {
            this.patchGaugeSlot(index, {
                pred: null,
                loading: false,
                err: this.reduceError(e)
            });
        }
    }

    get signalGaugeResolvedCurrency() {
        const c = (this.signalGaugeCurrencyCode || 'USD').trim().toUpperCase();
        return /^[A-Z]{3}$/.test(c) ? c : 'USD';
    }

    get signalGaugeMinFracResolved() {
        return clampGaugeFractionDigits(this.signalGaugeMinFractionDigits, 0);
    }

    get signalGaugeMaxFracResolved() {
        const min = this.signalGaugeMinFracResolved;
        const max = clampGaugeFractionDigits(this.signalGaugeMaxFractionDigits, 2);
        return Math.max(min, max);
    }

    get signalGaugeSlots() {
        const fallbacks = ['propensityScore', 'engagementScore', 'churnScore'];
        const minF = this.signalGaugeMinFracResolved;
        const maxF = this.signalGaugeMaxFracResolved;
        const cur = this.signalGaugeResolvedCurrency;
        return [0, 1, 2].map((i) => {
            const cfg = this.signalGaugeConfig(i);
            const label = cfg.label || SIGNAL_GAUGE_DEFAULT_LABELS[i];
            const hasFlow = !!cfg.flowApiName;
            const loading = this.gaugeInferenceLoading[i];
            const err = this.gaugeInferenceErrors[i];
            let raw = null;
            if (hasFlow) {
                if (!loading && !err) {
                    raw = this.gaugeInferencePredictions[i];
                }
            } else {
                const fb = this.d?.[fallbacks[i]];
                if (fb == null || fb === '') {
                    raw = null;
                } else {
                    const n = Number(fb);
                    raw = Number.isFinite(n) ? n : null;
                }
            }
            const hasFlowError = hasFlow && !!err && !loading;
            const centerText = formatSignalGaugeCenter(
                raw,
                cfg.format,
                minF,
                maxF,
                cur,
                hasFlow && loading,
                hasFlowError
            );
            const ringPct = signalGaugeRingPercent(raw, cfg.format, cfg.ringMax);
            const showColoredArc =
                cfg.format === 'percent' || (cfg.ringMax != null && Number.isFinite(raw));
            const scoreClass =
                cfg.format === 'currency' && centerText.length > 7
                    ? 'wp-ring-score wp-ring-score--compact'
                    : 'wp-ring-score';
            return {
                gaugeKey: `sig-gauge-${i}`,
                label,
                stroke: SIGNAL_GAUGE_STROKES[i],
                dashOffset: String(this.ringDash(ringPct)),
                centerText,
                showColoredArc,
                scoreClass,
                title: hasFlowError ? err : ''
            };
        });
    }

    async loadSummary() {
        if (!this.promptTemplateId || !this.profileData) {
            return;
        }
        this.summaryLoading = true;
        this.summaryError = null;
        try {
            const text = await generateSummary({
                promptTemplateId: this.promptTemplateId,
                promptInputApiName: this.promptInputApiName,
                predictionLabel: this.profileData.predictionLabel,
                recommendationsJson: this.profileData.recommendationsJson || '[]'
            });
            this.summaryText = text;
        } catch (e) {
            this.summaryError = this.reduceError(e);
        } finally {
            this.summaryLoading = false;
        }
    }

    handleTabClick(event) {
        const tab = event.currentTarget.dataset.tab;
        if (tab) {
            this.activeTab = tab;
            if (tab === 'insight' || tab === 'signals') {
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(() => this.animateBars(), 80);
            }
        }
    }

    animateBars() {
        const fills = this.template.querySelectorAll('.wp-bar-fill, .wp-model-bar-fill');
        fills.forEach((el) => {
            const scale = el.dataset.scale || '0';
            el.style.transition = 'transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)';
            el.style.transform = `scaleX(${scale})`;
        });
    }

    get visibleTabs() {
        const defs = [
            { id: 'overview', label: this.overviewTabLabel, on: this.showOverviewTab },
            { id: 'signals', label: this.signalsTabLabel, on: this.showSignalsTab },
            { id: 'portfolio', label: this.portfolioTabLabel, on: this.showPortfolioTab },
            { id: 'services', label: this.servicesTabLabel, on: this.showServicesTab },
            { id: 'location', label: this.locationTabLabel, on: this.showLocationTab },
            { id: 'insight', label: this.insightTabLabel, on: this.showInsightTab }
        ];
        return defs
            .filter((t) => t.on !== false)
            .map((t) => ({
                id: t.id,
                label: t.label,
                tabClass: `wp-tab${this.activeTab === t.id ? ' wp-tab--active' : ''}`,
                ariaSelected: this.activeTab === t.id ? 'true' : 'false'
            }));
    }

    get d() {
        return this.profileData;
    }

    /**
     * KYC tier: ok (green), warn (yellow), bad (red). Display string preserves source casing.
     */
    getKycState(d) {
        if (!d) {
            return { tier: 'bad', display: '—' };
        }
        const raw = (d.kycStatus ?? '').toString().trim();
        if (!raw) {
            return { tier: 'bad', display: '—' };
        }
        const s = raw.toLowerCase();
        if (s === 'verified' || s === 'complete' || s === 'current') {
            return { tier: 'ok', display: raw };
        }
        if (s === 'pending') {
            return { tier: 'warn', display: raw };
        }
        if (/needs?\s+review/.test(s)) {
            return { tier: 'warn', display: raw };
        }
        if (s === 'in review' || s === 'under review' || s === 'needs review' || s === 'need review') {
            return { tier: 'warn', display: raw };
        }
        return { tier: 'bad', display: raw };
    }

    kycTierFlagClasses(tier) {
        if (tier === 'ok') {
            return { flag: 'wp-flag wp-flag--on', dot: 'wp-flag-dot wp-flag-dot--on' };
        }
        if (tier === 'warn') {
            return { flag: 'wp-flag wp-flag--warn', dot: 'wp-flag-dot wp-flag-dot--warn' };
        }
        return { flag: 'wp-flag wp-flag--off', dot: 'wp-flag-dot wp-flag-dot--off' };
    }

    kycSvcCardClass(tier) {
        if (tier === 'ok') {
            return 'wp-svc-card wp-svc-card--on';
        }
        if (tier === 'warn') {
            return 'wp-svc-card wp-svc-card--warn';
        }
        return 'wp-svc-card wp-svc-card--off';
    }

    kycSvcStatusClass(tier) {
        if (tier === 'ok') {
            return 'wp-svc-status wp-svc-status--on';
        }
        if (tier === 'warn') {
            return 'wp-svc-status wp-svc-status--warn';
        }
        return 'wp-svc-status wp-svc-status--off';
    }

    isKycPositive(d) {
        return this.getKycState(d).tier === 'ok';
    }

    /**
     * 2FA/MFA: legacy string Enabled, or boolean/string from CRM checkboxes (true, yes, 1).
     * Apex stores twoFaStatus as String; checkbox TRUE becomes "true".
     */
    isTwoFaPositive(d) {
        if (!d) {
            return false;
        }
        const v = d.twoFaStatus;
        if (v === true) {
            return true;
        }
        if (v === false) {
            return false;
        }
        const s = String(v ?? '').trim().toLowerCase();
        return s === 'enabled' || s === 'true' || s === 'yes' || s === '1';
    }

    isTwoFaReview(d) {
        if (!d) {
            return false;
        }
        const v = d.twoFaStatus;
        if (v == null || v === '') {
            return false;
        }
        return !this.isTwoFaPositive(d);
    }

    get fullName() {
        return this.d?.fullName || '';
    }

    get displayCustomerSince() {
        return formatMmmYyyy(this.d?.customerSince);
    }

    get displayLastInteractionDate() {
        return formatMmmYyyy(this.d?.lastInteractionDate);
    }

    get location() {
        const city = this.d?.city || '';
        const st = this.d?.state || '';
        return [city, st].filter(Boolean).join(', ');
    }

    get profilePhotoSrcResolved() {
        const fromApi = sanitizeProfilePhotoUrl(this.profilePhotoUrl);
        if (fromApi) {
            return fromApi;
        }
        return sanitizeProfilePhotoUrl(this.d?.profilePhotoUrl);
    }

    get showProfilePhoto() {
        return this.profilePhotoSrcResolved.length > 0;
    }

    get profilePhotoAlt() {
        const n = (this.fullName || '').trim();
        return n || 'Profile photo';
    }

    get initials() {
        const n = this.fullName.trim();
        if (!n) {
            return '—';
        }
        const parts = n.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
            return parts[0].slice(0, 2).toUpperCase();
        }
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    get tierSegment() {
        return this.d?.tierSegment || 'Standard';
    }

    get kpiRevenue() {
        return this.fmtCurrency(this.d?.revenue);
    }

    get kpiInvestments() {
        return this.fmtCurrency(this.d?.investmentBalance);
    }

    get kpiLoan() {
        return this.fmtCurrency(this.d?.loanBalance);
    }

    get kpiLoanLimit() {
        return this.fmtCurrency(this.d?.loanLimit);
    }

    get kpiDepositYtd() {
        return this.fmtCurrency(this.d?.depositYtd);
    }

    ringDash(pct) {
        const p = Math.min(100, Math.max(0, pct));
        return RING_CIRC * (1 - p / 100);
    }

    scoreNum(v) {
        if (v === null || v === undefined || v === '') {
            return 0;
        }
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    get resolvedCrossSellMax() {
        const m = Number(this.crossSellScoreMax);
        if (!Number.isFinite(m) || m < 1) {
            return 10;
        }
        return Math.min(1000, Math.floor(m));
    }

    get signalsDetailSectionLabelDisplay() {
        const s = (this.signalsDetailSectionLabel || '').trim();
        return s || 'Cross-sell & savings';
    }

    get crossSellScoreDisplay() {
        const max = this.resolvedCrossSellMax;
        const raw = this.d?.crossSellScore;
        if (raw == null || raw === '') {
            return `— / ${max}`;
        }
        const n0 = Number(raw);
        if (!Number.isFinite(n0)) {
            return `— / ${max}`;
        }
        let n = Math.round(n0);
        n = Math.min(max, Math.max(0, n));
        return `${n} / ${max}`;
    }

    get savingsRateDisplay() {
        const v = this.d?.savingsRate;
        if (v == null || v === '') {
            return '—';
        }
        const n = Number(v);
        if (!Number.isFinite(n)) {
            return '—';
        }
        return `${n.toFixed(1)}%`;
    }

    /** Whole calendar days since lastInteractionDate (UTC date parts); null if unknown or future. */
    get daysSinceLastContact() {
        const t0 = utcMidnightMsFromProfileDate(this.d?.lastInteractionDate);
        if (t0 == null) {
            return null;
        }
        const now = new Date();
        const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const diff = Math.floor((today - t0) / 86400000);
        return diff >= 0 ? diff : null;
    }

    get daysSinceLastContactDisplay() {
        const d = this.daysSinceLastContact;
        return d == null ? '—' : `${d} days`;
    }

    get daysSinceLastContactClass() {
        const d = this.daysSinceLastContact;
        if (d == null) {
            return 'wp-signal-metric-val';
        }
        if (d > 60) {
            return 'wp-signal-metric-val wp-signal-days--bad';
        }
        if (d > 30) {
            return 'wp-signal-metric-val wp-signal-days--warn';
        }
        return 'wp-signal-metric-val';
    }

    get allEnrollmentFlags() {
        const d = this.d;
        if (!d) {
            return [];
        }
        const rows = [];
        const add = (label, val, warn) => {
            let flag = 'wp-flag wp-flag--off';
            let dot = 'wp-flag-dot wp-flag-dot--off';
            let status = 'Off';
            if (val === true) {
                flag = 'wp-flag wp-flag--on';
                dot = 'wp-flag-dot wp-flag-dot--on';
                status = 'On';
            } else if (warn) {
                flag = 'wp-flag wp-flag--warn';
                dot = 'wp-flag-dot wp-flag-dot--warn';
                status = 'Review';
            }
            rows.push({ label, status, cssClass: flag, dotClass: dot });
        };
        add('Mobile', d.mobileEnrolled, false);
        add('Online', d.onlineEnrolled, false);
        const kyc = this.getKycState(d);
        const kycFc = this.kycTierFlagClasses(kyc.tier);
        rows.push({
            label: 'KYC',
            status: kyc.display,
            cssClass: kycFc.flag,
            dotClass: kycFc.dot,
            preserveStatusCase: true
        });
        add('2FA', this.isTwoFaPositive(d), this.isTwoFaReview(d));
        add('Paperless', d.paperlessEnrolled, false);
        add('Alerts', d.alertsEnrolled, false);
        add('Wire', d.wireEnabled, false);
        return rows.map((r, i) => ({ ...r, flagKey: `wp-enroll-${i}` }));
    }

    get allServiceCards() {
        const d = this.d;
        const kyc = this.getKycState(d);
        const cards = [
            {
                svcKey: 'svc-mbank',
                name: 'Mobile banking',
                detail: 'App access, biometric login, transfers',
                valueAdd:
                    'Mobile banking gives clients secure, always-on access to balances, transfers, and card controls—reducing branch and call-center load while supporting faster payments and deposit capture. For relationship managers, it improves visibility into day-to-day cash movement and helps spot unusual activity earlier.',
                status: d?.mobileEnrolled === true ? 'Active' : 'Not enrolled',
                cardClass: this.svcCardClass(d?.mobileEnrolled),
                statusClass: this.svcStatusClass(d?.mobileEnrolled),
                iconTypeMobile: true
            },
            {
                svcKey: 'svc-obank',
                name: 'Online banking',
                detail: 'Web portal, bill pay, statements',
                valueAdd:
                    'The web channel is the hub for self-service lending and deposit servicing: statements, tax docs, beneficiary updates, and bill pay in one place. Strong adoption lowers servicing cost per account, improves NPS, and keeps high-value clients engaged between advisor touchpoints.',
                status: d?.onlineEnrolled === true ? 'Active' : 'Not enrolled',
                cardClass: this.svcCardClass(d?.onlineEnrolled),
                statusClass: this.svcStatusClass(d?.onlineEnrolled),
                iconTypeWeb: true
            },
            {
                svcKey: 'svc-wire',
                name: 'Wire transfers',
                detail: 'Domestic & international wires',
                valueAdd:
                    'Enabling wires with the right limits and dual controls supports treasury operations, real estate closings, and vendor payments without branch visits. It strengthens share-of-wallet with business and affluent segments while preserving fraud controls that regulators expect for high-risk payment rails.',
                status: d?.wireEnabled === true ? 'Enabled' : 'Restricted',
                cardClass: this.svcCardClass(d?.wireEnabled),
                statusClass: this.svcStatusClass(d?.wireEnabled),
                iconTypeWire: true
            },
            {
                svcKey: 'svc-paperless',
                name: 'Paperless',
                detail: 'E-statements and notices',
                valueAdd:
                    'E-delivery cuts statement print and mail expense, speeds access to year-end tax and regulatory notices, and supports sustainability goals. Clients get encrypted in-box delivery tied to online banking, which also reduces “I never got it” disputes common with postal lag.',
                status: d?.paperlessEnrolled === true ? 'Active' : 'Not enrolled',
                cardClass: this.svcCardClass(d?.paperlessEnrolled),
                statusClass: this.svcStatusClass(d?.paperlessEnrolled),
                iconTypeDoc: true
            },
            {
                svcKey: 'svc-alerts',
                name: 'Account alerts',
                detail: 'Balance and security notifications',
                valueAdd:
                    'Proactive alerts on low balances, large withdrawals, and login or password changes help clients act before fees or fraud losses materialize. For the institution, alert adoption is correlated with lower write-offs, fewer chargeback escalations, and stronger evidence of “reasonable” customer monitoring.',
                status: d?.alertsEnrolled === true ? 'Active' : 'Not enrolled',
                cardClass: this.svcCardClass(d?.alertsEnrolled),
                statusClass: this.svcStatusClass(d?.alertsEnrolled),
                iconTypeBell: true
            },
            {
                svcKey: 'svc-kyc',
                name: 'KYC / compliance',
                detail: 'Identity verification status',
                valueAdd:
                    'Current KYC and risk data unlock higher transaction limits, wire entitlements, and tailored product offers while keeping BSA/AML and fraud models accurate. Completing or refreshing verification reduces onboarding friction for new accounts and protects the firm during audits and suspicious-activity reviews.',
                status: kyc.display,
                cardClass: this.kycSvcCardClass(kyc.tier),
                statusClass: `${this.kycSvcStatusClass(kyc.tier)} wp-svc-status-val`,
                iconTypeShield: true
            }
        ];
        return cards;
    }

    svcCardClass(on) {
        if (on === true) {
            return 'wp-svc-card wp-svc-card--on';
        }
        if (on === false) {
            return 'wp-svc-card wp-svc-card--off';
        }
        return 'wp-svc-card wp-svc-card--na';
    }

    svcStatusClass(on) {
        if (on === true) {
            return 'wp-svc-status wp-svc-status--on';
        }
        if (on === false) {
            return 'wp-svc-status wp-svc-status--off';
        }
        return 'wp-svc-status wp-svc-status--na';
    }

    get portfolioAllocations() {
        const d = this.d;
        const inv = this.scoreNum(d?.investmentBalance);
        const loan = this.scoreNum(d?.loanBalance);
        const dep = this.scoreNum(d?.depositYtd);
        const total = inv + loan + dep;
        if (total <= 0) {
            return [
                { name: 'Equities', pct: 35, color: 'var(--wp-accent)' },
                { name: 'Fixed income', pct: 25, color: 'var(--wp-accent-2)' },
                { name: 'Alternatives', pct: 22, color: '#7fb3e8' },
                { name: 'Cash & MM', pct: 18, color: 'rgba(240,235,224,0.35)' }
            ].map((a, i) => ({ ...a, dotStyle: `background-color:${a.color}`, allocKey: `alloc-${i}` }));
        }
        const p1 = Math.round((inv / total) * 100);
        const p2 = Math.round((loan / total) * 100);
        const p3 = Math.max(0, 100 - p1 - p2);
        return [
            { name: 'Investments', pct: p1, color: 'var(--wp-accent)' },
            { name: 'Lending', pct: p2, color: 'var(--wp-negative)' },
            { name: 'Liquidity', pct: p3, color: 'var(--wp-accent-2)' }
        ].map((a, i) => ({ ...a, dotStyle: `background-color:${a.color}`, allocKey: `alloc-${i}` }));
    }

    get donutSegments() {
        const all = this.portfolioAllocations;
        const r = 36;
        const circ = 2 * Math.PI * r;
        let cumFrac = 0;
        return all.map((a, i) => {
            const frac = Math.min(1, Math.max(0, a.pct / 100));
            const arcLen = frac * circ;
            const gap = Math.max(0.001, circ - arcLen);
            const dasharray = `${arcLen} ${gap}`;
            const rotation = -90 + cumFrac * 360;
            cumFrac += frac;
            return {
                pct: a.pct,
                color: a.color,
                dasharray,
                transform: `rotate(${rotation})`
            };
        });
    }

    get donutSegSlot0() {
        const s = this.donutSegments;
        return s[0] ?? null;
    }

    get donutSegSlot1() {
        const s = this.donutSegments;
        return s[1] ?? null;
    }

    get donutSegSlot2() {
        const s = this.donutSegments;
        return s[2] ?? null;
    }

    get donutSegSlot3() {
        const s = this.donutSegments;
        return s[3] ?? null;
    }

    get accountCards() {
        const d = this.d;
        const fromFlow = d?.financialAccounts;
        if (Array.isArray(fromFlow) && fromFlow.length > 0) {
            return fromFlow.map((row, i) => {
                const balance =
                    row.balance != null && row.balance !== ''
                        ? this.fmtCurrency(row.balance)
                        : '—';
                const delta = (row.delta ?? '').toString().trim() || '—';
                let up = row.deltaPositive === true;
                if (row.deltaPositive !== true && row.deltaPositive !== false) {
                    up = /^\s*\+|^\+|on schedule|current|positive|up|gain/i.test(delta);
                }
                return {
                    cardKey: `fa-${i}-${(row.type || '').slice(0, 12)}`,
                    type: row.type || 'Account',
                    number: row.accountNumber || row.number || '—',
                    balance,
                    delta,
                    deltaClass: up ? 'wp-account-delta wp-delta-up' : 'wp-account-delta wp-delta-dn'
                };
            });
        }
        return [
            {
                cardKey: 'fallback-inv',
                type: 'Investment accounts',
                number: '•••• 4821',
                balance: this.fmtCurrency(d?.investmentBalance),
                delta: '+4.2%',
                deltaClass: 'wp-account-delta wp-delta-up'
            },
            {
                cardKey: 'fallback-loan',
                type: 'Credit & lending',
                number: '•••• 9920',
                balance: this.fmtCurrency(d?.loanBalance),
                delta: 'On schedule',
                deltaClass: 'wp-account-delta wp-delta-up'
            }
        ];
    }

    parseMapCoordinate(raw) {
        if (raw == null || raw === '') {
            return NaN;
        }
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            return raw;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) {
            return n;
        }
        const s = String(raw).trim().replace(/,/g, '');
        const parsed = parseFloat(s);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    get mapMarkers() {
        const lat = this.parseMapCoordinate(this.d?.mapLatitude);
        const lng = this.parseMapCoordinate(this.d?.mapLongitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return [];
        }
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            return [];
        }
        if (lat === 0 && lng === 0) {
            return [];
        }
        const title = (this.fullName || 'Location').trim() || 'Location';
        const parts = [this.d?.billingStreet, this.d?.billingCity, this.d?.billingState, this.d?.billingPostalCode]
            .filter((x) => x != null && String(x).trim() !== '')
            .map((x) => String(x).trim());
        const description = parts.join(', ') || this.location || '';
        return [
            {
                location: { Latitude: lat, Longitude: lng },
                title,
                description
            }
        ];
    }

    get hasMapMarkers() {
        return this.mapMarkers.length > 0;
    }

    get insightRecommendationsSectionTitleDisplay() {
        const s = (this.insightRecommendationsSectionTitle || '').trim();
        return s || 'Recommended actions';
    }

    get processedInsightRecommendations() {
        if (this.showAiActions === false) {
            return [];
        }
        const raw = this.d?.recommendationsJson;
        return buildProcessedRecommendationRows(raw, {
            riskColor: (this.insightRecommendationsRiskColor || '').trim() || this.negativeColor,
            goodColor: (this.insightRecommendationsGoodColor || '').trim() || this.positiveColor,
            positiveMeansGood: this.insightRecommendationsPositiveMeansGood === true
        });
    }

    get allBranchCards() {
        const d = this.d;
        const list = [];
        if (d?.assignedBranch) {
            const st = (d.assignedBranchStatus || 'Open').toLowerCase();
            list.push({
                name: d.assignedBranch,
                detail: d.assignedBranchAddress || 'Primary relationship branch',
                dist: d.assignedBranchDistance || '—',
                hours: d.assignedBranchHours || 'Lobby 9–5',
                status: d.assignedBranchStatus || 'Open',
                assigned: true,
                nameClass: 'wp-branch-name wp-branch-name--gold',
                distClass: 'wp-branch-dist wp-branch-dist--gold',
                cardClass: 'wp-branch-card wp-branch-card--assigned',
                statusClass: st === 'open' ? 'wp-branch-status--open' : 'wp-branch-status--closed'
            });
        }
        const near = d?.nearbyBranches;
        if (Array.isArray(near)) {
            near.forEach((b) => {
                if (!b) {
                    return;
                }
                const st = (b.status || 'Open').toLowerCase();
                list.push({
                    name: b.name || 'Branch',
                    detail: b.address || '',
                    dist: b.distance || '',
                    hours: b.hours || '',
                    status: b.status || 'Open',
                    assigned: false,
                    nameClass: 'wp-branch-name',
                    distClass: 'wp-branch-dist',
                    cardClass: 'wp-branch-card',
                    statusClass: st === 'open' ? 'wp-branch-status--open' : 'wp-branch-status--closed'
                });
            });
        }
        if (list.length === 0) {
            list.push({
                name: 'Downtown Financial Center',
                detail: '1200 Market St',
                dist: '2.4 mi',
                hours: 'Mon–Fri 9–5',
                status: 'Open',
                assigned: false,
                nameClass: 'wp-branch-name',
                distClass: 'wp-branch-dist',
                cardClass: 'wp-branch-card',
                statusClass: 'wp-branch-status--open'
            });
        }
        return list.map((b, i) => ({ ...b, rowKey: `wp-br-${i}` }));
    }

    get servicesSuggestionValueAddOverrides() {
        const raw = this.servicesSuggestionValueAddJson;
        if (raw == null || String(raw).trim() === '') {
            return {};
        }
        try {
            const o = JSON.parse(String(raw).trim());
            if (o == null || typeof o !== 'object' || Array.isArray(o)) {
                return {};
            }
            const out = {};
            for (const k of Object.keys(o)) {
                const v = o[k];
                if (v != null && String(v).trim() !== '') {
                    out[k] = String(v).trim();
                }
            }
            return out;
        } catch (e) {
            return {};
        }
    }

    suggestionSubForService(name) {
        const fieldByName = {
            'Mobile banking': this.servicesSuggestionCopyMobileBanking,
            'Online banking': this.servicesSuggestionCopyOnlineBanking,
            'Wire transfers': this.servicesSuggestionCopyWireTransfers,
            Paperless: this.servicesSuggestionCopyPaperless,
            'Account alerts': this.servicesSuggestionCopyAccountAlerts,
            'KYC / compliance': this.servicesSuggestionCopyKycCompliance
        };
        const rawField = fieldByName[name];
        if (rawField != null && String(rawField).trim() !== '') {
            return String(rawField).trim();
        }
        const jsonMap = this.servicesSuggestionValueAddOverrides;
        const fromJson = jsonMap[name];
        if (fromJson && String(fromJson).trim() !== '') {
            return String(fromJson).trim();
        }
        return null;
    }

    get serviceRecommendations() {
        return this.allServiceCards
            .filter((c) => c.statusClass && c.statusClass.includes('off'))
            .slice(0, 3)
            .map((c, i) => {
                const isKyc = c.name === 'KYC / compliance';
                const customSub = this.suggestionSubForService(c.name);
                const sub = customSub || c.valueAdd || c.detail;
                return {
                    recKey: `rec-${i}-${c.name}`,
                    title: isKyc ? 'Complete KYC / compliance' : `Enroll in ${c.name}`,
                    sub
                };
            });
    }

    get hasData() {
        return this.profileData != null && !this.loading;
    }

    get hasError() {
        return Boolean(this.errorMessage);
    }

    get isLoading() {
        return this.loading;
    }

    get isTabOverview() {
        return this.activeTab === 'overview';
    }

    get isTabSignals() {
        return this.activeTab === 'signals';
    }

    get isTabPortfolio() {
        return this.activeTab === 'portfolio';
    }

    get isTabServices() {
        return this.activeTab === 'services';
    }

    get isTabLocation() {
        return this.activeTab === 'location';
    }

    get isTabInsight() {
        return this.activeTab === 'insight';
    }

    get resolvedTextScaleFactor() {
        let pct = Number(this.textScalePercent);
        if (!Number.isFinite(pct)) {
            pct = 100;
        }
        pct = Math.min(160, Math.max(85, Math.round(pct)));
        return pct / 100;
    }

    /** Bound on .wp-shell so flexipage @api updates apply every render (host-only applyTheme can run before props on live pages). */
    get shellTypographyStyle() {
        return `--wp-text-scale:${this.resolvedTextScaleFactor}`;
    }

    get shellClass() {
        const parts = ['wp-shell'];
        const em = (this.textEmphasis || 'default').trim().toLowerCase();
        if (em === 'medium') {
            parts.push('wp-shell--emph-medium');
        } else if (em === 'strong') {
            parts.push('wp-shell--emph-strong');
        }
        return parts.join(' ');
    }

    get accentColorStyle() {
        return `color:${this.accentColor}`;
    }

    get headerBgStyle() {
        if (this.headerGradientStyle === 'linear') {
            return 'background:linear-gradient(135deg,var(--wp-gradient-1),var(--wp-gradient-2));';
        }
        if (this.headerGradientStyle === 'solid') {
            return 'background:var(--wp-bg-primary);';
        }
        return 'background:radial-gradient(ellipse 120% 80% at 20% 0%,var(--wp-hdr-glow1) 0%,transparent 55%),radial-gradient(ellipse 100% 60% at 100% 100%,var(--wp-hdr-glow2) 0%,transparent 50%);';
    }

    get avatarRingClass() {
        const s = (this.avatarRingStyle || 'gold').toLowerCase();
        if (s === 'silver') {
            return 'wp-avatar-ring wp-avatar-ring--silver';
        }
        if (s === 'teal') {
            return 'wp-avatar-ring wp-avatar-ring--teal';
        }
        if (s === 'custom') {
            return 'wp-avatar-ring wp-avatar-ring--custom';
        }
        return 'wp-avatar-ring wp-avatar-ring--gold';
    }

    get predictionLabel() {
        return this.d?.predictionLabel || '—';
    }

    fmtCurrency(v) {
        if (v === null || v === undefined || v === '') {
            return '—';
        }
        const n = Number(v);
        if (!Number.isFinite(n)) {
            return '—';
        }
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    }

    get showKpiStripResolved() {
        return this.showKpiStrip !== false;
    }

    get showEnrollmentFlagsResolved() {
        return this.showEnrollmentFlags !== false;
    }

    get showThemeSwitcherResolved() {
        return this.showThemeSwitcher === true;
    }

    get themeBtnObsidian() {
        return 'wp-theme-btn wp-tb-obsidian' + (this._themeMode === 'obsidian' ? ' wp-tb-active' : '');
    }

    get themeBtnMidnight() {
        return 'wp-theme-btn wp-tb-midnight' + (this._themeMode === 'midnight' ? ' wp-tb-active' : '');
    }

    get themeBtnGraphite() {
        return 'wp-theme-btn wp-tb-graphite' + (this._themeMode === 'graphite' ? ' wp-tb-active' : '');
    }

    get themeBtnIvory() {
        return 'wp-theme-btn wp-tb-ivory' + (this._themeMode === 'ivory' ? ' wp-tb-active' : '');
    }

    get showBranchProximityResolved() {
        return this.showBranchProximity !== false;
    }

    get showAiActionsResolved() {
        return this.showAiActions !== false;
    }
}
