import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getProfileData from '@salesforce/apex/BusinessProfileWidgetController.getProfileData';
import generateSummary from '@salesforce/apex/BusinessProfileWidgetController.generateSummary';
import { buildProcessedRecommendationRows } from './profileInsightRows';

const THEMES = {

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
  bordeaux: {
    '--wp-shell-bg':       '#362030',
    '--wp-shell-border':   'rgba(184,149,106,0.12)',
    '--wp-panel-bg':       '#422838',
    '--wp-surface':        '#4e3040',
    '--wp-border-soft':    'rgba(255,255,255,0.07)',
    '--wp-border-med':     'rgba(255,255,255,0.11)',
    '--wp-text-primary':   '#f5e8f0',
    '--wp-text-secondary': 'rgba(245,232,240,0.42)',
    '--wp-text-tertiary':  'rgba(245,232,240,0.26)',
    '--wp-kpi-bg':         '#422838',
    '--wp-track-bg':       'rgba(255,255,255,0.08)',
    '--wp-tab-border':     'rgba(184,149,106,0.14)',
    '--wp-contact-bg':     'rgba(255,255,255,0.05)',
    '--wp-org-bg':         'rgba(255,255,255,0.03)',
    '--wp-body-bg':        '#2a1622',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.18)',
    '--wp-hdr-glow2':      'rgba(180,50,80,0.15)',
    '--wp-insight-bg':     'rgba(184,149,106,0.06)',
  },
  pewter: {
    '--wp-shell-bg':       '#383a44',
    '--wp-shell-border':   'rgba(184,149,106,0.10)',
    '--wp-panel-bg':       '#424550',
    '--wp-surface':        '#4c4f5c',
    '--wp-border-soft':    'rgba(255,255,255,0.07)',
    '--wp-border-med':     'rgba(255,255,255,0.11)',
    '--wp-text-primary':   '#f0eef4',
    '--wp-text-secondary': 'rgba(240,238,244,0.42)',
    '--wp-text-tertiary':  'rgba(240,238,244,0.26)',
    '--wp-kpi-bg':         '#424550',
    '--wp-track-bg':       'rgba(255,255,255,0.08)',
    '--wp-tab-border':     'rgba(184,149,106,0.12)',
    '--wp-contact-bg':     'rgba(255,255,255,0.05)',
    '--wp-org-bg':         'rgba(255,255,255,0.03)',
    '--wp-body-bg':        '#2c2e36',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.14)',
    '--wp-hdr-glow2':      'rgba(100,105,130,0.20)',
    '--wp-insight-bg':     'rgba(184,149,106,0.06)',
  },
  walnut: {
    '--wp-shell-bg':       '#3a2a1e',
    '--wp-shell-border':   'rgba(184,149,106,0.14)',
    '--wp-panel-bg':       '#463424',
    '--wp-surface':        '#523e2e',
    '--wp-border-soft':    'rgba(255,255,255,0.06)',
    '--wp-border-med':     'rgba(255,255,255,0.10)',
    '--wp-text-primary':   '#f8f0e4',
    '--wp-text-secondary': 'rgba(248,240,228,0.42)',
    '--wp-text-tertiary':  'rgba(248,240,228,0.26)',
    '--wp-kpi-bg':         '#463424',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(184,149,106,0.16)',
    '--wp-contact-bg':     'rgba(255,255,255,0.04)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#2c2018',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.20)',
    '--wp-hdr-glow2':      'rgba(140,90,40,0.18)',
    '--wp-insight-bg':     'rgba(184,149,106,0.07)',
  },
  denim: {
    '--wp-shell-bg':       '#263650',
    '--wp-shell-border':   'rgba(184,149,106,0.10)',
    '--wp-panel-bg':       '#2e4060',
    '--wp-surface':        '#364a6c',
    '--wp-border-soft':    'rgba(255,255,255,0.07)',
    '--wp-border-med':     'rgba(255,255,255,0.11)',
    '--wp-text-primary':   '#eaf0f8',
    '--wp-text-secondary': 'rgba(234,240,248,0.40)',
    '--wp-text-tertiary':  'rgba(234,240,248,0.24)',
    '--wp-kpi-bg':         '#2e4060',
    '--wp-track-bg':       'rgba(255,255,255,0.08)',
    '--wp-tab-border':     'rgba(184,149,106,0.12)',
    '--wp-contact-bg':     'rgba(255,255,255,0.05)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#1e2c40',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.16)',
    '--wp-hdr-glow2':      'rgba(40,80,150,0.20)',
    '--wp-insight-bg':     'rgba(184,149,106,0.06)',
  },
  moss: {
    '--wp-shell-bg':       '#283428',
    '--wp-shell-border':   'rgba(184,149,106,0.10)',
    '--wp-panel-bg':       '#323e32',
    '--wp-surface':        '#3c4a3c',
    '--wp-border-soft':    'rgba(255,255,255,0.07)',
    '--wp-border-med':     'rgba(255,255,255,0.11)',
    '--wp-text-primary':   '#eaf4ec',
    '--wp-text-secondary': 'rgba(234,244,236,0.40)',
    '--wp-text-tertiary':  'rgba(234,244,236,0.24)',
    '--wp-kpi-bg':         '#323e32',
    '--wp-track-bg':       'rgba(255,255,255,0.08)',
    '--wp-tab-border':     'rgba(184,149,106,0.12)',
    '--wp-contact-bg':     'rgba(255,255,255,0.05)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#1e2a20',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.16)',
    '--wp-hdr-glow2':      'rgba(40,100,50,0.20)',
    '--wp-insight-bg':     'rgba(184,149,106,0.06)',
  },
  birch: {
    '--wp-shell-bg':       '#e8e0d0',
    '--wp-shell-border':   'rgba(100,70,30,0.18)',
    '--wp-panel-bg':       '#ddd6c4',
    '--wp-surface':        '#e8e0d0',
    '--wp-border-soft':    'rgba(40,32,14,0.08)',
    '--wp-border-med':     'rgba(40,32,14,0.14)',
    '--wp-text-primary':   '#1e1608',
    '--wp-text-secondary': 'rgba(30,22,8,0.50)',
    '--wp-text-tertiary':  'rgba(30,22,8,0.34)',
    '--wp-kpi-bg':         '#ddd6c4',
    '--wp-track-bg':       'rgba(30,22,8,0.12)',
    '--wp-tab-border':     'rgba(120,80,30,0.20)',
    '--wp-contact-bg':     'rgba(30,22,8,0.05)',
    '--wp-org-bg':         'rgba(30,22,8,0.02)',
    '--wp-body-bg':        '#b8aea0',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.14)',
    '--wp-hdr-glow2':      'rgba(120,90,50,0.08)',
    '--wp-insight-bg':     'rgba(120,80,30,0.07)',
  },
  mist: {
    '--wp-shell-bg':       '#dde6ee',
    '--wp-shell-border':   'rgba(60,100,140,0.16)',
    '--wp-panel-bg':       '#cfd9e4',
    '--wp-surface':        '#dde6ee',
    '--wp-border-soft':    'rgba(14,30,46,0.08)',
    '--wp-border-med':     'rgba(14,30,46,0.14)',
    '--wp-text-primary':   '#0e1e2e',
    '--wp-text-secondary': 'rgba(14,30,46,0.50)',
    '--wp-text-tertiary':  'rgba(14,30,46,0.34)',
    '--wp-kpi-bg':         '#cfd9e4',
    '--wp-track-bg':       'rgba(14,30,46,0.10)',
    '--wp-tab-border':     'rgba(184,149,106,0.20)',
    '--wp-contact-bg':     'rgba(14,30,46,0.04)',
    '--wp-org-bg':         'rgba(14,30,46,0.02)',
    '--wp-body-bg':        '#c8d8e8',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.14)',
    '--wp-hdr-glow2':      'rgba(60,100,160,0.08)',
    '--wp-insight-bg':     'rgba(184,149,106,0.10)',
  },
  cashew: {
    '--wp-shell-bg':       '#e4d4b8',
    '--wp-shell-border':   'rgba(100,70,20,0.18)',
    '--wp-panel-bg':       '#d9c8a8',
    '--wp-surface':        '#e4d4b8',
    '--wp-border-soft':    'rgba(28,18,4,0.08)',
    '--wp-border-med':     'rgba(28,18,4,0.14)',
    '--wp-text-primary':   '#1c1204',
    '--wp-text-secondary': 'rgba(28,18,4,0.50)',
    '--wp-text-tertiary':  'rgba(28,18,4,0.34)',
    '--wp-kpi-bg':         '#d9c8a8',
    '--wp-track-bg':       'rgba(28,18,4,0.10)',
    '--wp-tab-border':     'rgba(140,100,30,0.20)',
    '--wp-contact-bg':     'rgba(28,18,4,0.05)',
    '--wp-org-bg':         'rgba(28,18,4,0.02)',
    '--wp-body-bg':        '#a88870',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.20)',
    '--wp-hdr-glow2':      'rgba(0,0,0,0)',
    '--wp-insight-bg':     'rgba(140,100,30,0.08)',
  },
  mineral: {
    '--wp-shell-bg':       '#d0d8dc',
    '--wp-shell-border':   'rgba(60,90,110,0.18)',
    '--wp-panel-bg':       '#c2ccd2',
    '--wp-surface':        '#d0d8dc',
    '--wp-border-soft':    'rgba(12,28,40,0.08)',
    '--wp-border-med':     'rgba(12,28,40,0.14)',
    '--wp-text-primary':   '#0c1c28',
    '--wp-text-secondary': 'rgba(12,28,40,0.50)',
    '--wp-text-tertiary':  'rgba(12,28,40,0.34)',
    '--wp-kpi-bg':         '#c2ccd2',
    '--wp-track-bg':       'rgba(12,28,40,0.10)',
    '--wp-tab-border':     'rgba(184,149,106,0.20)',
    '--wp-contact-bg':     'rgba(12,28,40,0.04)',
    '--wp-org-bg':         'rgba(12,28,40,0.02)',
    '--wp-body-bg':        '#bcc8d0',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.16)',
    '--wp-hdr-glow2':      'rgba(50,80,100,0.08)',
    '--wp-insight-bg':     'rgba(184,149,106,0.10)',
  },
  blush: {
    '--wp-shell-bg':       '#e8d8d4',
    '--wp-shell-border':   'rgba(100,60,50,0.16)',
    '--wp-panel-bg':       '#dccac6',
    '--wp-surface':        '#e8d8d4',
    '--wp-border-soft':    'rgba(30,16,12,0.08)',
    '--wp-border-med':     'rgba(30,16,12,0.14)',
    '--wp-text-primary':   '#1e100c',
    '--wp-text-secondary': 'rgba(30,16,12,0.50)',
    '--wp-text-tertiary':  'rgba(30,16,12,0.34)',
    '--wp-kpi-bg':         '#dccac6',
    '--wp-track-bg':       'rgba(30,16,12,0.10)',
    '--wp-tab-border':     'rgba(140,80,60,0.20)',
    '--wp-contact-bg':     'rgba(30,16,12,0.05)',
    '--wp-org-bg':         'rgba(30,16,12,0.02)',
    '--wp-body-bg':        '#d0c0bc',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.16)',
    '--wp-hdr-glow2':      'rgba(160,90,70,0.08)',
    '--wp-insight-bg':     'rgba(140,80,60,0.08)',
  },
  chamois: {
    '--wp-shell-bg':       '#d8ccb4',
    '--wp-shell-border':   'rgba(90,65,20,0.18)',
    '--wp-panel-bg':       '#cdbfa4',
    '--wp-surface':        '#d8ccb4',
    '--wp-border-soft':    'rgba(26,20,4,0.08)',
    '--wp-border-med':     'rgba(26,20,4,0.14)',
    '--wp-text-primary':   '#1a1404',
    '--wp-text-secondary': 'rgba(26,20,4,0.52)',
    '--wp-text-tertiary':  'rgba(26,20,4,0.36)',
    '--wp-kpi-bg':         '#cdbfa4',
    '--wp-track-bg':       'rgba(26,20,4,0.10)',
    '--wp-tab-border':     'rgba(120,85,30,0.22)',
    '--wp-contact-bg':     'rgba(26,20,4,0.05)',
    '--wp-org-bg':         'rgba(26,20,4,0.02)',
    '--wp-body-bg':        '#b0a080',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.20)',
    '--wp-hdr-glow2':      'rgba(0,0,0,0)',
    '--wp-insight-bg':     'rgba(120,85,30,0.09)',
  },
  bullion: {
    '--wp-shell-bg':       '#12100a',
    '--wp-shell-border':   'rgba(212,168,32,0.18)',
    '--wp-panel-bg':       '#1c180c',
    '--wp-surface':        '#262010',
    '--wp-border-soft':    'rgba(212,168,32,0.08)',
    '--wp-border-med':     'rgba(212,168,32,0.14)',
    '--wp-text-primary':   '#f8f4e0',
    '--wp-text-secondary': 'rgba(248,244,224,0.42)',
    '--wp-text-tertiary':  'rgba(248,244,224,0.26)',
    '--wp-kpi-bg':         '#1c180c',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(212,168,32,0.14)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#0c0c08',
    '--wp-hdr-glow1':      'rgba(212,168,32,0.18)',
    '--wp-hdr-glow2':      'rgba(160,120,20,0.12)',
    '--wp-insight-bg':     'rgba(212,168,32,0.05)',
  },
  prussian: {
    '--wp-shell-bg':       '#12243a',
    '--wp-shell-border':   'rgba(184,149,106,0.14)',
    '--wp-panel-bg':       '#1a3050',
    '--wp-surface':        '#223c60',
    '--wp-border-soft':    'rgba(255,255,255,0.06)',
    '--wp-border-med':     'rgba(255,255,255,0.10)',
    '--wp-text-primary':   '#e8f0fa',
    '--wp-text-secondary': 'rgba(232,240,250,0.40)',
    '--wp-text-tertiary':  'rgba(232,240,250,0.24)',
    '--wp-kpi-bg':         '#1a3050',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(184,149,106,0.14)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#0c1828',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.18)',
    '--wp-hdr-glow2':      'rgba(20,60,120,0.25)',
    '--wp-insight-bg':     'rgba(184,149,106,0.05)',
  },
  coutts: {
    '--wp-shell-bg':       '#0a1e12',
    '--wp-shell-border':   'rgba(184,149,106,0.14)',
    '--wp-panel-bg':       '#102818',
    '--wp-surface':        '#183420',
    '--wp-border-soft':    'rgba(255,255,255,0.05)',
    '--wp-border-med':     'rgba(255,255,255,0.09)',
    '--wp-text-primary':   '#e4f2ea',
    '--wp-text-secondary': 'rgba(228,242,234,0.40)',
    '--wp-text-tertiary':  'rgba(228,242,234,0.24)',
    '--wp-kpi-bg':         '#102818',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(184,149,106,0.14)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#061410',
    '--wp-hdr-glow1':      'rgba(184,149,106,0.16)',
    '--wp-hdr-glow2':      'rgba(20,80,40,0.22)',
    '--wp-insight-bg':     'rgba(184,149,106,0.05)',
  },
  vault: {
    '--wp-shell-bg':       '#18191e',
    '--wp-shell-border':   'rgba(168,180,196,0.16)',
    '--wp-panel-bg':       '#202228',
    '--wp-surface':        '#28292e',
    '--wp-border-soft':    'rgba(168,180,196,0.08)',
    '--wp-border-med':     'rgba(168,180,196,0.14)',
    '--wp-text-primary':   '#eceef2',
    '--wp-text-secondary': 'rgba(236,238,242,0.40)',
    '--wp-text-tertiary':  'rgba(236,238,242,0.24)',
    '--wp-kpi-bg':         '#202228',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(168,180,196,0.14)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#101014',
    '--wp-hdr-glow1':      'rgba(168,180,196,0.12)',
    '--wp-hdr-glow2':      'rgba(80,90,110,0.18)',
    '--wp-insight-bg':     'rgba(168,180,196,0.06)',
  },
  endowment: {
    '--wp-shell-bg':       '#121c0e',
    '--wp-shell-border':   'rgba(184,164,80,0.16)',
    '--wp-panel-bg':       '#1a2814',
    '--wp-surface':        '#22341c',
    '--wp-border-soft':    'rgba(184,164,80,0.08)',
    '--wp-border-med':     'rgba(184,164,80,0.14)',
    '--wp-text-primary':   '#e8f0e0',
    '--wp-text-secondary': 'rgba(232,240,224,0.40)',
    '--wp-text-tertiary':  'rgba(232,240,224,0.24)',
    '--wp-kpi-bg':         '#1a2814',
    '--wp-track-bg':       'rgba(255,255,255,0.06)',
    '--wp-tab-border':     'rgba(184,164,80,0.16)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#0c1208',
    '--wp-hdr-glow1':      'rgba(184,164,80,0.18)',
    '--wp-hdr-glow2':      'rgba(30,80,30,0.22)',
    '--wp-insight-bg':     'rgba(184,164,80,0.06)',
  },
  trust: {
    '--wp-shell-bg':       '#0e1e36',
    '--wp-shell-border':   'rgba(220,196,130,0.16)',
    '--wp-panel-bg':       '#142848',
    '--wp-surface':        '#1c3458',
    '--wp-border-soft':    'rgba(220,196,130,0.08)',
    '--wp-border-med':     'rgba(220,196,130,0.14)',
    '--wp-text-primary':   '#f0ece0',
    '--wp-text-secondary': 'rgba(240,236,224,0.40)',
    '--wp-text-tertiary':  'rgba(240,236,224,0.24)',
    '--wp-kpi-bg':         '#142848',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(220,196,130,0.16)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#081428',
    '--wp-hdr-glow1':      'rgba(220,196,130,0.20)',
    '--wp-hdr-glow2':      'rgba(20,50,100,0.25)',
    '--wp-insight-bg':     'rgba(220,196,130,0.06)',
  },
  cobalt: {
    '--wp-shell-bg':       '#0c1a30',
    '--wp-shell-border':   'rgba(40,100,200,0.22)',
    '--wp-panel-bg':       '#102040',
    '--wp-surface':        '#183050',
    '--wp-border-soft':    'rgba(40,100,200,0.10)',
    '--wp-border-med':     'rgba(40,100,200,0.18)',
    '--wp-text-primary':   '#e4eefa',
    '--wp-text-secondary': 'rgba(228,238,250,0.40)',
    '--wp-text-tertiary':  'rgba(228,238,250,0.24)',
    '--wp-kpi-bg':         '#102040',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(40,120,220,0.16)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#081220',
    '--wp-hdr-glow1':      'rgba(40,120,220,0.20)',
    '--wp-hdr-glow2':      'rgba(20,60,140,0.20)',
    '--wp-insight-bg':     'rgba(40,120,220,0.07)',
  },
  heritage: {
    '--wp-shell-bg':       '#1e1008',
    '--wp-shell-border':   'rgba(200,110,30,0.20)',
    '--wp-panel-bg':       '#281808',
    '--wp-surface':        '#32220e',
    '--wp-border-soft':    'rgba(200,110,30,0.08)',
    '--wp-border-med':     'rgba(200,110,30,0.16)',
    '--wp-text-primary':   '#f8ede0',
    '--wp-text-secondary': 'rgba(248,237,224,0.40)',
    '--wp-text-tertiary':  'rgba(248,237,224,0.24)',
    '--wp-kpi-bg':         '#281808',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(200,110,30,0.16)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#140a04',
    '--wp-hdr-glow1':      'rgba(200,110,30,0.20)',
    '--wp-hdr-glow2':      'rgba(160,60,20,0.18)',
    '--wp-insight-bg':     'rgba(200,110,30,0.06)',
  },
  civic: {
    '--wp-shell-bg':       '#0a1e22',
    '--wp-shell-border':   'rgba(20,140,150,0.20)',
    '--wp-panel-bg':       '#10282e',
    '--wp-surface':        '#18343c',
    '--wp-border-soft':    'rgba(20,140,150,0.08)',
    '--wp-border-med':     'rgba(20,140,150,0.16)',
    '--wp-text-primary':   '#e0f0f2',
    '--wp-text-secondary': 'rgba(224,240,242,0.40)',
    '--wp-text-tertiary':  'rgba(224,240,242,0.24)',
    '--wp-kpi-bg':         '#10282e',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(20,160,170,0.16)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#051418',
    '--wp-hdr-glow1':      'rgba(20,160,170,0.18)',
    '--wp-hdr-glow2':      'rgba(10,80,90,0.22)',
    '--wp-insight-bg':     'rgba(20,160,170,0.06)',
  },
  cardinal: {
    '--wp-shell-bg':       '#200c0c',
    '--wp-shell-border':   'rgba(200,50,50,0.20)',
    '--wp-panel-bg':       '#2c1010',
    '--wp-surface':        '#381818',
    '--wp-border-soft':    'rgba(200,50,50,0.08)',
    '--wp-border-med':     'rgba(200,50,50,0.16)',
    '--wp-text-primary':   '#f8eaea',
    '--wp-text-secondary': 'rgba(248,234,234,0.40)',
    '--wp-text-tertiary':  'rgba(248,234,234,0.24)',
    '--wp-kpi-bg':         '#2c1010',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(200,60,50,0.16)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.02)',
    '--wp-body-bg':        '#180606',
    '--wp-hdr-glow1':      'rgba(200,60,50,0.20)',
    '--wp-hdr-glow2':      'rgba(140,30,30,0.18)',
    '--wp-insight-bg':     'rgba(200,60,50,0.06)',
  },
  meridian: {
    '--wp-shell-bg':       '#101828',
    '--wp-shell-border':   'rgba(60,120,200,0.20)',
    '--wp-panel-bg':       '#182234',
    '--wp-surface':        '#202c42',
    '--wp-border-soft':    'rgba(60,120,200,0.08)',
    '--wp-border-med':     'rgba(60,120,200,0.16)',
    '--wp-text-primary':   '#e4ecf8',
    '--wp-text-secondary': 'rgba(228,236,248,0.40)',
    '--wp-text-tertiary':  'rgba(228,236,248,0.24)',
    '--wp-kpi-bg':         '#182234',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(60,130,210,0.16)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#0a1018',
    '--wp-hdr-glow1':      'rgba(60,130,210,0.18)',
    '--wp-hdr-glow2':      'rgba(20,60,130,0.20)',
    '--wp-insight-bg':     'rgba(60,130,210,0.06)',
  },
  union: {
    '--wp-shell-bg':       '#1a1408',
    '--wp-shell-border':   'rgba(200,130,40,0.20)',
    '--wp-panel-bg':       '#221a0c',
    '--wp-surface':        '#2c2210',
    '--wp-border-soft':    'rgba(200,130,40,0.08)',
    '--wp-border-med':     'rgba(200,130,40,0.16)',
    '--wp-text-primary':   '#f8f0e0',
    '--wp-text-secondary': 'rgba(248,240,224,0.40)',
    '--wp-text-tertiary':  'rgba(248,240,224,0.24)',
    '--wp-kpi-bg':         '#221a0c',
    '--wp-track-bg':       'rgba(255,255,255,0.07)',
    '--wp-tab-border':     'rgba(200,130,40,0.16)',
    '--wp-contact-bg':     'rgba(255,255,255,0.03)',
    '--wp-org-bg':         'rgba(255,255,255,0.025)',
    '--wp-body-bg':        '#100e06',
    '--wp-hdr-glow1':      'rgba(200,140,40,0.20)',
    '--wp-hdr-glow2':      'rgba(140,80,20,0.18)',
    '--wp-insight-bg':     'rgba(200,130,40,0.06)',
  },

};

const BUSINESS_DEFAULT_ACCENT = '#b8956a';

function normColor(v) {
    return String(v == null ? '' : v)
        .trim()
        .replace(/\s+/g, '')
        .toLowerCase();
}

/** Solid hex from theme chrome (--wp-tab-border rgba) when accentColor is still the designer default. */
function accentHexFromThemeTokens(tokens) {
    if (!tokens) {
        return null;
    }
    const raw = tokens['--wp-tab-border'];
    if (!raw || typeof raw !== 'string') {
        return null;
    }
    const m = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,|[)])/i);
    if (!m) {
        return null;
    }
    const r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(m[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function resolveBusinessAccentHex(accentColorProp, themeMode) {
    if (normColor(accentColorProp) !== normColor(BUSINESS_DEFAULT_ACCENT)) {
        const t = String(accentColorProp == null ? '' : accentColorProp).trim();
        return t || BUSINESS_DEFAULT_ACCENT;
    }
    const mode = (themeMode || 'obsidian').toLowerCase();
    const tok = THEMES[mode] || THEMES.obsidian;
    return accentHexFromThemeTokens(tok) || BUSINESS_DEFAULT_ACCENT;
}

/** Solid #hex tokens blended toward white when backgroundLightenPercent is greater than 0. */
const MIXABLE_SOLID_BG_KEYS = new Set([
    '--wp-shell-bg',
    '--wp-panel-bg',
    '--wp-surface',
    '--wp-kpi-bg',
    '--wp-body-bg'
]);

/**
 * Mix white into a #rrggbb color. whitePercent 0–100 = fraction of the way to white (lightens dark UIs).
 */
function blendHexTowardWhite(hexColor, whitePercent) {
    const p = Math.min(100, Math.max(0, Number(whitePercent) || 0));
    if (p === 0) {
        return hexColor;
    }
    const s = String(hexColor || '').trim();
    const m = /^#([0-9a-f]{6})$/i.exec(s);
    if (!m) {
        return hexColor;
    }
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    const t = p / 100;
    const mix = (c) => Math.round(c + (255 - c) * t);
    r = mix(r);
    g = mix(g);
    b = mix(b);
    const out = (r << 16) | (g << 8) | b;
    return `#${out.toString(16).padStart(6, '0')}`;
}

/**
 * App Builder text color override: #rgb / #rrggbb or rgba()/rgb(). Rejects obvious injection patterns.
 */
function normalizeOptionalCssColor(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) {
        return null;
    }
    if (/[;}<>]|url\s*\(|expression\s*\(/i.test(s)) {
        return null;
    }
    if (/^rgba?\(/i.test(s)) {
        if (s.length > 120) {
            return null;
        }
        return s;
    }
    let hex = s.startsWith('#') ? s : `#${s}`;
    const m3 = /^#([0-9a-f]{3})$/i.exec(hex);
    if (m3) {
        const x = m3[1];
        hex = `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`;
    }
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
        return hex.toLowerCase();
    }
    return null;
}

const MMM_YYYY_UTC = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
});

/** Strip legacy invalid default so SOQL is not forced to skip a non-existent Account path. */
function normalizeFoundedFieldApi(value) {
    if (value == null) {
        return '';
    }
    const v = String(value).trim();
    if (!v || /^yearfounded$/i.test(v)) {
        return '';
    }
    return v;
}

/** Allow https/http and same-origin paths only (blocks javascript:, data:, etc.). Same as Customer Profile widget. */
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

function hostnameFromWebsite(raw) {
    const s = String(raw || '').trim();
    if (!s) {
        return '';
    }
    try {
        const u = /^https?:\/\//i.test(s) ? new URL(s) : new URL(`https://${s}`);
        return u.hostname || '';
    } catch (e) {
        return '';
    }
}

/** https://host origin for building /favicon.ico URLs. */
function websiteOriginFromWebsite(raw) {
    const s = String(raw || '').trim();
    if (!s) {
        return '';
    }
    try {
        const u = /^https?:\/\//i.test(s) ? new URL(s) : new URL(`https://${s}`);
        return u.origin;
    } catch (e) {
        return '';
    }
}

/**
 * Ordered logo URLs from Account Website: direct https image first, then site favicons, then icon CDNs.
 * Lightning CSP often blocks google.com/s2; we try same-origin favicon and DuckDuckGo before Google.
 */
function buildWebsiteLogoUrlList(website) {
    const out = [];
    const seen = new Set();
    const push = (u) => {
        const t = (u || '').trim();
        if (t && !seen.has(t)) {
            seen.add(t);
            out.push(t);
        }
    };

    const direct = sanitizeProfilePhotoUrl(website);
    if (direct) {
        push(direct);
        return out;
    }

    const host = hostnameFromWebsite(website);
    if (!host) {
        return out;
    }

    const origin = websiteOriginFromWebsite(website);
    if (origin) {
        push(`${origin}/favicon.ico`);
        push(`${origin}/apple-touch-icon.png`);
    } else {
        push(`https://${host}/favicon.ico`);
        push(`https://${host}/apple-touch-icon.png`);
    }

    push(`https://icons.duckduckgo.com/ip3/${host}.ico`);

    const pageUrl = origin ? `${origin}/` : `https://${host}/`;
    push(
        `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`
    );
    push(
        `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(pageUrl)}&size=128`
    );

    return out;
}

/**
 * KYC-style tiering aligned with Person Profile `getKycState`, plus common Account picklist
 * spellings (e.g. Cleared, Approved) so CRM values map to green / amber / red consistently.
 * Reused for AML text status the same way.
 */
function complianceStatusTier(raw) {
    const trimmed = (raw ?? '').toString().trim();
    if (!trimmed) {
        return { tier: 'bad', display: '—' };
    }
    const s = trimmed.toLowerCase();
    if (
        s === 'verified' ||
        s === 'complete' ||
        s === 'current' ||
        s === 'cleared' ||
        s === 'approved' ||
        s === 'passed' ||
        s === 'compliant'
    ) {
        return { tier: 'ok', display: trimmed };
    }
    if (s === 'pending') {
        return { tier: 'warn', display: trimmed };
    }
    if (/needs?\s+review/.test(s)) {
        return { tier: 'warn', display: trimmed };
    }
    if (s === 'in review' || s === 'under review' || s === 'needs review' || s === 'need review') {
        return { tier: 'warn', display: trimmed };
    }
    return { tier: 'bad', display: trimmed };
}

function tierToComplianceFlagClasses(tier) {
    const status = tier === 'ok' ? 'on' : tier === 'warn' ? 'warn' : 'off';
    return {
        cssClass: `wp-flag wp-fl-${status}`,
        dotClass: `wp-fdot wp-fd-${status}`
    };
}

function coerceBooleanLike(val) {
    if (val === true) {
        return true;
    }
    if (val === false) {
        return false;
    }
    const s = String(val ?? '').trim().toLowerCase();
    if (s === 'true' || s === 'yes' || s === '1' || s === 'enabled') {
        return true;
    }
    if (s === 'false' || s === 'no' || s === '0' || s === 'disabled') {
        return false;
    }
    return null;
}

/** MFA / 2FA: boolean-style green/red; legacy App/SMS strings preserved as on/warn. */
function twoFaComplianceFlag(d) {
    const v = d?.twoFaStatus;
    const b = coerceBooleanLike(v);
    if (b === true) {
        return {
            label: '2FA',
            status: 'On',
            preserveStatusCase: false,
            ...tierToComplianceFlagClasses('ok')
        };
    }
    if (b === false) {
        return {
            label: '2FA',
            status: 'Off',
            preserveStatusCase: false,
            ...tierToComplianceFlagClasses('bad')
        };
    }
    const s = String(v ?? '').trim();
    if (!s) {
        return {
            label: '2FA',
            status: 'Off',
            preserveStatusCase: false,
            ...tierToComplianceFlagClasses('bad')
        };
    }
    const sl = s.toLowerCase();
    if (sl === 'app') {
        return {
            label: '2FA',
            status: s,
            preserveStatusCase: true,
            ...tierToComplianceFlagClasses('ok')
        };
    }
    if (sl === 'sms') {
        return {
            label: '2FA',
            status: s,
            preserveStatusCase: true,
            ...tierToComplianceFlagClasses('warn')
        };
    }
    return {
        label: '2FA',
        status: s,
        preserveStatusCase: true,
        ...tierToComplianceFlagClasses('warn')
    };
}

function booleanServiceFlag(label, val) {
    const b = coerceBooleanLike(val);
    const on = b === true;
    return {
        label,
        status: on ? 'On' : 'Off',
        preserveStatusCase: false,
        ...tierToComplianceFlagClasses(on ? 'ok' : 'bad')
    };
}

/** Format profile date strings as "Jan 2024" (matches Customer Profile widget). */
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

/** Whole calendar months from start UTC midnight to end UTC midnight (anniversary-style). */
function totalWholeMonthsUtc(startMs, endMs) {
    const s = new Date(startMs);
    const e = new Date(endMs);
    let months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
    if (e.getUTCDate() < s.getUTCDate()) {
        months--;
    }
    return Math.max(0, months);
}

function customerSinceTenurePhrase(raw) {
    const t0 = utcMidnightMsFromProfileDate(raw);
    if (t0 == null) {
        return null;
    }
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const total = totalWholeMonthsUtc(t0, today);
    if (total === 0) {
        const days = Math.floor((today - t0) / 86400000);
        if (days <= 0) {
            return '';
        }
        return `${days} day${days === 1 ? '' : 's'}`;
    }
    const y = Math.floor(total / 12);
    const m = total % 12;
    if (y === 0) {
        return `${total} month${total === 1 ? '' : 's'}`;
    }
    if (m === 0) {
        return y === 1 ? '1 year' : `${y} years`;
    }
    return y === 1
        ? `1 year, ${m} month${m === 1 ? '' : 's'}`
        : `${y} years, ${m} month${m === 1 ? '' : 's'}`;
}

/** KPI chip: months under 12, else completed years from month count. */
function customerSinceTenureShort(raw) {
    const t0 = utcMidnightMsFromProfileDate(raw);
    if (t0 == null) {
        return '';
    }
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const total = totalWholeMonthsUtc(t0, today);
    if (total === 0) {
        const days = Math.floor((today - t0) / 86400000);
        if (days <= 0) {
            return '';
        }
        return `${days}d`;
    }
    if (total < 12) {
        return `${total}mo`;
    }
    const y = Math.floor(total / 12);
    return y === 1 ? '1yr' : `${y}yr`;
}

function extractFoundedYearFromRawString(raw) {
    if (raw == null || raw === '') {
        return null;
    }
    const s = String(raw).trim();
    if (!s) {
        return null;
    }
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) {
        const year = Number(ymd[1]);
        return Number.isFinite(year) && year > 0 ? year : null;
    }
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (mdy) {
        const year = Number(mdy[3]);
        return Number.isFinite(year) && year > 0 ? year : null;
    }
    const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
    if (dmy) {
        const year = Number(dmy[3]);
        return Number.isFinite(year) && year > 0 ? year : null;
    }
    const yw = s.match(/\b(19|20)\d{2}\b/);
    if (yw) {
        const year = Number(yw[0]);
        return Number.isFinite(year) && year > 0 ? year : null;
    }
    return null;
}

/** Lower sorts first: CRM primary flag, then executive titles, then other contacts. */
function contactSortRank(c) {
    if (!c) {
        return 99;
    }
    if (String(c.isPrimary || c.IsPrimary || '').toLowerCase() === 'true') {
        return 0;
    }
    const hay = `${c.title || c.Title || ''} ${c.acrRole || ''}`.toLowerCase();
    if (hay.includes('ceo') || hay.includes('president') || hay.includes('chief executive')) {
        return 1;
    }
    if (hay.includes('cfo') || hay.includes('finance') || hay.includes('financial officer')) {
        return 2;
    }
    if (hay.includes('counsel') || hay.includes('legal')) {
        return 3;
    }
    if (hay.includes('coo') || hay.includes('oper')) {
        return 4;
    }
    return 5;
}

/** Small icon beside Last used channel for known picklist labels (Mobile, Web, Branch, Call Center, Other). */
function lastUsedChannelIconMeta(displayLabel) {
    const s = (displayLabel == null ? '' : String(displayLabel)).trim();
    if (!s) {
        return null;
    }
    const norm = s.replace(/\s+/g, ' ').toLowerCase();
    if (norm === '--none--' || norm === 'none') {
        return null;
    }
    const byNorm = {
        mobile: { iconName: 'utility:phone', alt: 'Mobile' },
        web: { iconName: 'utility:world', alt: 'Web' },
        branch: { iconName: 'utility:location', alt: 'Branch' },
        'call center': { iconName: 'utility:headset', alt: 'Call center' },
        other: { iconName: 'utility:custom', alt: 'Other' },
    };
    const hit = byNorm[norm];
    if (hit) {
        return hit;
    }
    return { iconName: 'utility:custom', alt: s };
}

export default class BusinessProfileWidget extends NavigationMixin(LightningElement) {
    @api recordIdFieldName = 'accountId__c';
    @api flowApiName = '';
    @api flowRecordIdVariable = 'recordId';
    /** Autolaunched flow for Insight tab: prediction + recommendations outputs (same as Customer Profile widget). */
    @api insightFlowApiName = '';
    @api insightFlowRecordIdVariable = 'recordId';
    @api flowPredictionVariable = 'prediction';
    @api flowRecommendationsVariable = 'recommendations';

    _geocodeBillingAddress = true;
    @api
    get geocodeBillingAddress() {
        return this._geocodeBillingAddress;
    }
    set geocodeBillingAddress(value) {
        this._geocodeBillingAddress = value !== false && value !== 'false';
    }

    @api promptTemplateId = '';
    @api promptInputApiName = 'Input:Prediction_Context';

    _autoGenerateSummary = true;
    @api
    get autoGenerateSummary() {
        return this._autoGenerateSummary;
    }
    set autoGenerateSummary(value) {
        this._autoGenerateSummary = value !== false && value !== 'false';
    }

    /** When true, positive recommendation % uses good bar color (match classification model LWC). */
    @api insightRecommendationsPositiveMeansGood;
    @api insightRecommendationsRiskColor = '';
    @api insightRecommendationsGoodColor = '';
    @api insightRecommendationsSectionTitle = 'Recommended actions';

    _showAiActions = true;
    @api
    get showAiActions() {
        return this._showAiActions;
    }
    set showAiActions(value) {
        this._showAiActions = value !== false && value !== 'false';
    }

    @api cardTitle = 'Business profile';
    @api overviewTabLabel = 'Overview';
    @api healthTabLabel = 'Pipeline';
    @api creditTabLabel = 'Credit';
    @api structureTabLabel = 'Structure';
    @api locationTabLabel = 'Location';
    @api insightTabLabel = 'Insight';

    _showOverviewTab = true;
    @api
    get showOverviewTab() {
        return this._showOverviewTab;
    }
    set showOverviewTab(value) {
        this._showOverviewTab = value !== false && value !== 'false';
    }

    _showHealthTab = true;
    @api
    get showHealthTab() {
        return this._showHealthTab;
    }
    set showHealthTab(value) {
        this._showHealthTab = value !== false && value !== 'false';
    }

    /**
     * 0 / unset → Apex loads up to 2000 open opportunities (practical “all”).
     * 1–2000 → cap the SOQL limit for the Pipeline tab.
     */
    @api pipelineOpportunityLimit = 0;

    _showCreditTab = true;
    @api
    get showCreditTab() {
        return this._showCreditTab;
    }
    set showCreditTab(value) {
        this._showCreditTab = value !== false && value !== 'false';
    }

    _showStructureTab = true;
    @api
    get showStructureTab() {
        return this._showStructureTab;
    }
    set showStructureTab(value) {
        this._showStructureTab = value !== false && value !== 'false';
    }

    _showLocationTab = true;
    @api
    get showLocationTab() {
        return this._showLocationTab;
    }
    set showLocationTab(value) {
        this._showLocationTab = value !== false && value !== 'false';
    }

    _showInsightTab = true;
    @api
    get showInsightTab() {
        return this._showInsightTab;
    }
    set showInsightTab(value) {
        this._showInsightTab = value !== false && value !== 'false';
    }

    _showKpiStrip = true;
    @api
    get showKpiStrip() {
        return this._showKpiStrip;
    }
    set showKpiStrip(value) {
        this._showKpiStrip = value !== false && value !== 'false';
    }

    _showComplianceFlags = true;
    @api
    get showComplianceFlags() {
        return this._showComplianceFlags;
    }
    set showComplianceFlags(value) {
        this._showComplianceFlags = value !== false && value !== 'false';
    }

    _showRiskMatrix = true;
    @api
    get showRiskMatrix() {
        return this._showRiskMatrix;
    }
    set showRiskMatrix(value) {
        this._showRiskMatrix = value !== false && value !== 'false';
    }

    _showWaterfallChart = true;
    @api
    get showWaterfallChart() {
        return this._showWaterfallChart;
    }
    set showWaterfallChart(value) {
        this._showWaterfallChart = value !== false && value !== 'false';
    }

    _showOrgChart = true;
    @api
    get showOrgChart() {
        return this._showOrgChart;
    }
    set showOrgChart(value) {
        this._showOrgChart = value !== false && value !== 'false';
    }

    _showKeyContacts = true;
    @api
    get showKeyContacts() {
        return this._showKeyContacts;
    }
    set showKeyContacts(value) {
        this._showKeyContacts = value !== false && value !== 'false';
    }

    _showBranchProximity = true;
    @api
    get showBranchProximity() {
        return this._showBranchProximity;
    }
    set showBranchProximity(value) {
        this._showBranchProximity = value !== false && value !== 'false';
    }

    @api showThemeSwitcher = false;

    /** 85–160 (%). Scales widget typography via CSS; 100 = design default (same as Customer Profile). */
    @api textScalePercent = 100;
    /** default | medium | strong — bolder name/KPIs; strong also boosts tabs/meta. */
    @api textEmphasis = 'default';

    /**
     * 0 = theme defaults. 1–50 blends that percentage of white into shell, panel, surface, KPI strip, and body hex
     * backgrounds (dark themes become noticeably lighter; light themes shift slightly brighter).
     */
    @api backgroundLightenPercent = 0;

    /** Optional. Sets --wp-text-primary after theme tokens (hex #rrggbb or rgba(...)). */
    @api textColorPrimaryOverride = '';
    /** Optional. Sets --wp-text-secondary (meta, labels). */
    @api textColorSecondaryOverride = '';
    /** Optional. Sets --wp-text-tertiary (muted captions). */
    @api textColorTertiaryOverride = '';

    /**
     * Preferred: Account field API name (logo image URL) or flow:VariableApiName — same pattern as Field: website.
     * Legacy properties below remain for existing Lightning pages.
     */
    @api fieldProfilePhotoUrl = '';
    /** Deprecated: use Field: header logo. Static https URL when set. */
    @api profilePhotoUrl = '';
    /** Deprecated: use Field: header logo as flow:VarName. Flow Text output variable API name. */
    @api profilePhotoFlowOutputVariable = '';
    /** Deprecated: alternate Flow variable slot for logo URL. */
    @api assemblyOutProfilePhotoUrl = '';

    _useWebsiteFavicon = false;
    @api
    get useWebsiteFavicon() {
        return this._useWebsiteFavicon;
    }
    set useWebsiteFavicon(value) {
        this._useWebsiteFavicon = value !== false && value !== 'false';
        this.logoLoadFailed = false;
        this._websiteLogoAttempt = 0;
        this.refreshWebsiteLogoCandidates();
    }

    /** After a broken image URL, show initials until the next profile load. */
    logoLoadFailed = false;

    /** Fallback chain when Use website logo is enabled (CSP-safe order). */
    _websiteLogoCandidates = [];

    @track _websiteLogoAttempt = 0;

    @api accentColor = '#b8956a';
    @api warningColor = '#d4900a';
    @api negativeColor = '#c05070';
    @api positiveColor = '#5a9e7a';

    @api fieldCompanyName = 'name';
    @api fieldLegalName = 'legalName';
    @api fieldCity = 'billingCity';
    @api fieldState = 'billingState';
    @api fieldStreet = 'billingStreet';
    @api fieldZip = 'billingPostalCode';
    @api fieldIndustry = 'industry';
    @api fieldEmployees = 'numberOfEmployees';
    @api fieldWebsite = 'website';
    /** Default CreatedDate = calendar year of the Account row in Salesforce (map another field for legal year founded). */
    @api fieldFounded = 'CreatedDate';
    @api fieldSicCode = 'sicCode';
    @api fieldSicDescription = 'sicDescription';
    @api fieldTaxId = 'taxId';
    @api fieldTierSegment = 'customerTier';
    @api fieldRevenue = 'annualRevenue';
    @api fieldRevenueGrowth = 'revenueGrowthPct';
    @api fieldLoanBalance = 'loanBalance';
    @api fieldLoanLimit = 'creditLimit';
    @api fieldLoanUtilization = 'loanUtilizationPct';
    @api fieldDepositYtd = 'depositYtd';
    @api fieldInvestmentBalance = 'investmentBalance';
    @api fieldInterestExpense = 'interestExpense';
    @api fieldCustomerSince = 'customerSince';
    @api fieldPrimaryRm = 'primaryRelationshipManager';
    @api fieldActiveProducts = 'activeProductCount';
    /** Retained for Lightning page bindings; value is not sent to Apex—subsidiaries count is computed from related accounts. */
    @api fieldSubsidiaries = 'subsidiaryCount';
    @api fieldLastInteraction = 'lastInteractionDate';
    @api fieldWalletCapture = '';
    @api fieldCreditRating = 'creditRating';
    @api fieldCreditRatingAgency = 'creditRatingAgency';
    @api fieldCreditOutlook = 'creditOutlook';
    @api fieldCreditScore = 'internalCreditScore';
    @api fieldMoodysRating = 'moodysRating';
    @api fieldDnbPaydexScore = 'DNB_PAYDEX_Score__c';
    @api fieldDnbDelinquencyScore = 'DNB_Delinquency_Score__c';
    @api fieldDnbFailureScore = 'DNB_Failure_Score__c';
    @api fieldDnbRating = 'DNB_Rating__c';
    @api fieldExperianIntelliscore = 'Experian_Intelliscore__c';
    @api fieldExperianRiskBand = 'Experian_Risk_Band__c';
    @api fieldEquifaxCreditRiskScore = 'Equifax_Credit_Risk_Score__c';
    @api fieldEquifaxFailureScoreCr = 'Equifax_Failure_Score_CR__c';
    @api fieldEquifaxPaymentIndex = 'Equifax_Payment_Index__c';
    @api fieldSpRating = 'SP_Rating__c';
    @api fieldSpCategory = 'SP_Category__c';
    @api fieldMoodysAgencyRating = 'Moodys_Rating__c';
    @api fieldMoodysAgencyCategory = 'Moodys_Category__c';
    @api fieldFitchRating = 'Fitch_Rating__c';
    @api fieldFitchCategory = 'Fitch_Category__c';
    @api fieldRelationshipScore = 'relationshipScore';
    @api fieldPropensityToExpand = 'propensityToExpand';
    @api fieldAttritionRisk = 'attritionRisk';
    @api fieldWalletShare = 'walletSharePct';
    @api fieldNps = 'npsScore';
    @api fieldKycStatus = 'kycStatus';
    @api fieldAmlStatus = 'amlStatus';
    @api fieldTwoFaStatus = 'twoFaStatus';
    @api fieldPaperlessEnrolled = 'paperlessEnrolled';
    @api fieldWireEnabled = 'wireTransferEnabled';
    @api fieldAssignedBranch = 'assignedBranch';
    @api fieldBranchDistance = 'assignedBranchDistance';
    @api fieldBranchAddress = 'assignedBranchAddress';
    @api fieldBranchHours = 'assignedBranchHours';
    @api fieldBranchStatus = 'assignedBranchOpenStatus';
    /** Account field API name for map latitude (e.g. BillingLatitude) or flow:OutputVar. */
    @api fieldMapLatitude = 'BillingLatitude';
    @api fieldMapLongitude = 'BillingLongitude';

    profileData = null;
    loading = false;
    errorMessage = null;
    summaryText = null;
    summaryLoading = false;
    summaryError = null;
    activeTab = 'overview';
    _themeMode = 'obsidian';
    _themeScheduleToken = 0;
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

    @api
    get themeMode() {
        return this._themeMode;
    }
    set themeMode(value) {
        this._themeMode = value || 'obsidian';
        this.scheduleApplyTheme();
    }

    get headerBgStyle() {
        return (
            'background: radial-gradient(ellipse 120% 80% at 20% 0%, var(--wp-hdr-glow1) 0%, transparent 55%), ' +
            'radial-gradient(ellipse 100% 60% at 100% 100%, var(--wp-hdr-glow2) 0%, transparent 50%);'
        );
    }

    get resolvedTextScaleFactor() {
        let pct = Number(this.textScalePercent);
        if (!Number.isFinite(pct)) {
            pct = 100;
        }
        pct = Math.min(160, Math.max(85, Math.round(pct)));
        return pct / 100;
    }

    /** Bound on .wp-shell so App Builder @api updates apply every render. */
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

    get resolvedBackgroundLightenPercent() {
        let p = Number(this.backgroundLightenPercent);
        if (!Number.isFinite(p)) {
            p = 0;
        }
        return Math.min(50, Math.max(0, Math.round(p)));
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
     * Apply theme tokens to host and .wp-shell when available (App Builder can set @api before host/style exists).
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

        const lighten = this.resolvedBackgroundLightenPercent;

        const applyTo = (el) => {
            const effectiveAccent = resolveBusinessAccentHex(this.accentColor, mode);

            Object.entries(tokens).forEach(([prop, value]) => {
                let v = value;
                if (lighten > 0 && MIXABLE_SOLID_BG_KEYS.has(prop)) {
                    v = blendHexTowardWhite(String(value), lighten);
                }
                el.style.setProperty(prop, v);
            });
            el.style.setProperty('--wp-accent', effectiveAccent);
            if (effectiveAccent.startsWith('#') && effectiveAccent.length === 7) {
                el.style.setProperty('--wp-accent-bg', effectiveAccent + '14');
                el.style.setProperty('--wp-accent-border', effectiveAccent + '40');
                el.style.setProperty('--wp-accent-dim', effectiveAccent + '99');
            }
            if (this.warningColor !== '#d4900a') {
                el.style.setProperty('--wp-warning', this.warningColor);
            }
            if (this.negativeColor !== '#c05070') {
                el.style.setProperty('--wp-negative', this.negativeColor);
            }
            if (this.positiveColor !== '#5a9e7a') {
                el.style.setProperty('--wp-positive', this.positiveColor);
            }
            const tp = normalizeOptionalCssColor(this.textColorPrimaryOverride);
            if (tp) {
                el.style.setProperty('--wp-text-primary', tp);
            }
            const ts = normalizeOptionalCssColor(this.textColorSecondaryOverride);
            if (ts) {
                el.style.setProperty('--wp-text-secondary', ts);
            }
            const tt = normalizeOptionalCssColor(this.textColorTertiaryOverride);
            if (tt) {
                el.style.setProperty('--wp-text-tertiary', tt);
            }
            el.style.setProperty('--wp-text-scale', String(this.resolvedTextScaleFactor));
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
        return 'wp-theme-btn wp-tb-obsidian' + (this._themeMode === 'obsidian' ? ' wp-tb-active' : '');
    }
    get themeBtn_midnight() {
        return 'wp-theme-btn wp-tb-midnight' + (this._themeMode === 'midnight' ? ' wp-tb-active' : '');
    }
    get themeBtn_graphite() {
        return 'wp-theme-btn wp-tb-graphite' + (this._themeMode === 'graphite' ? ' wp-tb-active' : '');
    }
    get themeBtn_ivory() {
        return 'wp-theme-btn wp-tb-ivory' + (this._themeMode === 'ivory' ? ' wp-tb-active' : '');
    }

    connectedCallback() {
        this.applyTheme();
        requestAnimationFrame(() => {
            this.applyTheme();
            requestAnimationFrame(() => this.applyTheme());
        });
        if (this._recordId) {
            this.loadProfile();
        }
    }

    renderedCallback() {
        this.scheduleApplyTheme();
        const ids = this.visibleTabIds;
        if (ids.length && !ids.includes(this.activeTab)) {
            this.activeTab = ids[0];
        }
    }

    get visibleTabIds() {
        return [
            { id: 'overview', show: this.showOverviewTab },
            { id: 'health', show: this.showHealthTab },
            { id: 'credit', show: this.showCreditTab },
            { id: 'structure', show: this.showStructureTab },
            { id: 'location', show: this.showLocationTab },
            { id: 'insight', show: this.showInsightTab }
        ]
            .filter((t) => t.show)
            .map((t) => t.id);
    }

    get pipelineOpportunityLimitForApex() {
        const n = this.pipelineOpportunityLimit;
        if (n == null || n === '') {
            return null;
        }
        const v = Math.floor(Number(n));
        if (!Number.isFinite(v) || v <= 0) {
            return null;
        }
        return Math.min(v, 2000);
    }

    async loadProfile() {
        this.loading = true;
        this.errorMessage = null;
        this.summaryText = null;
        this.summaryError = null;
        try {
            const result = await getProfileData({
                recordId: this._recordId,
                fieldMappingsJson: this.buildFieldMappings(),
                flowApiName: this.flowApiName || '',
                flowRecordIdVariable: this.flowRecordIdVariable || 'recordId',
                insightFlowApiName: (this.insightFlowApiName || '').trim(),
                insightFlowRecordIdVariable: this.insightFlowRecordIdVariable || 'recordId',
                flowPredictionVariable: this.flowPredictionVariable || 'prediction',
                flowRecommendationsVariable: this.flowRecommendationsVariable || 'recommendations',
                geocodeBillingAddress: this.geocodeBillingAddress !== false,
                pipelineOpportunityLimit: this.pipelineOpportunityLimitForApex
            });
            this.profileData = JSON.parse(result);
            this.logoLoadFailed = false;
            this._websiteLogoAttempt = 0;
            this.refreshWebsiteLogoCandidates();
            setTimeout(() => this.animateBars(), 400);
            if (this.promptTemplateId && this.autoGenerateSummary) {
                this.loadSummary();
            }
        } catch (error) {
            this.errorMessage = error.body?.message || 'Failed to load profile data.';
            this.profileData = null;
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error loading profile',
                    message: this.errorMessage,
                    variant: 'error'
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

    buildFieldMappings() {
        return JSON.stringify({
            fieldCompanyName: this.fieldCompanyName,
            fieldLegalName: this.fieldLegalName,
            fieldCity: this.fieldCity,
            fieldState: this.fieldState,
            fieldStreet: this.fieldStreet,
            fieldZip: this.fieldZip,
            fieldIndustry: this.fieldIndustry,
            fieldEmployees: this.fieldEmployees,
            fieldWebsite: this.fieldWebsite,
            fieldProfilePhotoUrl: this.resolveHeaderLogoFieldMapping(),
            fieldFounded: normalizeFoundedFieldApi(this.fieldFounded),
            fieldSicCode: this.fieldSicCode,
            fieldSicDescription: this.fieldSicDescription,
            fieldTaxId: this.fieldTaxId,
            fieldTierSegment: this.fieldTierSegment,
            fieldRevenue: this.fieldRevenue,
            fieldRevenueGrowth: this.fieldRevenueGrowth,
            fieldLoanBalance: this.fieldLoanBalance,
            fieldLoanLimit: this.fieldLoanLimit,
            fieldLoanUtilization: this.fieldLoanUtilization,
            fieldDepositYtd: this.fieldDepositYtd,
            fieldInvestmentBalance: this.fieldInvestmentBalance,
            fieldInterestExpense: this.fieldInterestExpense,
            fieldCustomerSince: this.fieldCustomerSince,
            fieldPrimaryRm: this.fieldPrimaryRm,
            fieldActiveProducts: this.fieldActiveProducts,
            fieldLastInteraction: this.fieldLastInteraction,
            fieldWalletCapture: this.fieldWalletCapture,
            fieldCreditRating: this.fieldCreditRating,
            fieldCreditRatingAgency: this.fieldCreditRatingAgency,
            fieldCreditOutlook: this.fieldCreditOutlook,
            fieldCreditScore: this.fieldCreditScore,
            fieldMoodysRating: this.fieldMoodysRating,
            fieldDnbPaydexScore: this.fieldDnbPaydexScore,
            fieldDnbDelinquencyScore: this.fieldDnbDelinquencyScore,
            fieldDnbFailureScore: this.fieldDnbFailureScore,
            fieldDnbRating: this.fieldDnbRating,
            fieldExperianIntelliscore: this.fieldExperianIntelliscore,
            fieldExperianRiskBand: this.fieldExperianRiskBand,
            fieldEquifaxCreditRiskScore: this.fieldEquifaxCreditRiskScore,
            fieldEquifaxFailureScoreCr: this.fieldEquifaxFailureScoreCr,
            fieldEquifaxPaymentIndex: this.fieldEquifaxPaymentIndex,
            fieldSpRating: this.fieldSpRating,
            fieldSpCategory: this.fieldSpCategory,
            fieldMoodysAgencyRating: this.fieldMoodysAgencyRating,
            fieldMoodysAgencyCategory: this.fieldMoodysAgencyCategory,
            fieldFitchRating: this.fieldFitchRating,
            fieldFitchCategory: this.fieldFitchCategory,
            fieldRelationshipScore: this.fieldRelationshipScore,
            fieldPropensityToExpand: this.fieldPropensityToExpand,
            fieldAttritionRisk: this.fieldAttritionRisk,
            fieldWalletShare: this.fieldWalletShare,
            fieldNps: this.fieldNps,
            fieldKycStatus: this.fieldKycStatus,
            fieldAmlStatus: this.fieldAmlStatus,
            fieldTwoFaStatus: this.fieldTwoFaStatus,
            fieldPaperlessEnrolled: this.fieldPaperlessEnrolled,
            fieldWireEnabled: this.fieldWireEnabled,
            fieldAssignedBranch: this.fieldAssignedBranch,
            fieldBranchDistance: this.fieldBranchDistance,
            fieldBranchAddress: this.fieldBranchAddress,
            fieldBranchHours: this.fieldBranchHours,
            fieldBranchStatus: this.fieldBranchStatus,
            fieldMapLatitude: this.fieldMapLatitude,
            fieldMapLongitude: this.fieldMapLongitude
        });
    }

    /** Single mapping line: field path or flow:Var; legacy assembly props only if field is blank. */
    resolveHeaderLogoFieldMapping() {
        const field = (this.fieldProfilePhotoUrl || '').trim();
        if (field) {
            return field;
        }
        const asm = (this.assemblyOutProfilePhotoUrl || '').trim();
        if (asm) {
            return `flow:${asm}`;
        }
        const named = (this.profilePhotoFlowOutputVariable || '').trim();
        if (named) {
            return `flow:${named}`;
        }
        return '';
    }

    refreshWebsiteLogoCandidates() {
        this._websiteLogoCandidates = [];
        if (!this.profileData) {
            return;
        }
        if (sanitizeProfilePhotoUrl(this.profileData.profilePhotoUrl)) {
            return;
        }
        if (this._useWebsiteFavicon) {
            this._websiteLogoCandidates = buildWebsiteLogoUrlList(this.profileData.website);
        }
    }

    animateBars() {
        this.template.querySelectorAll('.wp-bar-fill[data-scale], .wp-model-bar-fill[data-scale]').forEach((el) => {
            const scale = parseFloat(el.dataset.scale);
            el.style.transition = 'transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)';
            el.style.transform = `scaleX(${scale})`;
        });
    }

    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.tab;
        setTimeout(() => this.animateBars(), 150);
    }

    get visibleTabs() {
        return [
            { id: 'overview', label: this.overviewTabLabel, show: this.showOverviewTab },
            { id: 'health', label: this.healthTabLabel, show: this.showHealthTab },
            { id: 'credit', label: this.creditTabLabel, show: this.showCreditTab },
            { id: 'structure', label: this.structureTabLabel, show: this.showStructureTab },
            { id: 'location', label: this.locationTabLabel, show: this.showLocationTab },
            { id: 'insight', label: this.insightTabLabel, show: this.showInsightTab }
        ]
            .filter((t) => t.show)
            .map((t) => ({
                ...t,
                tabClass: 'wp-tab' + (t.id === this.activeTab ? ' wp-tab--active' : '')
            }));
    }

    get isTab_overview() {
        return this.activeTab === 'overview';
    }
    get isTab_health() {
        return this.activeTab === 'health';
    }
    get isTab_credit() {
        return this.activeTab === 'credit';
    }
    get isTab_structure() {
        return this.activeTab === 'structure';
    }
    get isTab_location() {
        return this.activeTab === 'location';
    }
    get isTab_insight() {
        return this.activeTab === 'insight';
    }
    get hasData() {
        return !this.loading && this.profileData != null;
    }
    get hasError() {
        return !this.loading && !!this.errorMessage;
    }
    get isLoading() {
        return this.loading;
    }

    get companyName() {
        return this.profileData?.companyName || '';
    }
    get legalName() {
        return this.profileData?.legalName || this.companyName;
    }
    get location() {
        return [this.profileData?.city, this.profileData?.state].filter(Boolean).join(', ');
    }
    get industry() {
        return this.profileData?.industry || '';
    }
    get employees() {
        const e = this.profileData?.employees;
        return e != null && e !== '' ? Number(e).toLocaleString() : '';
    }
    get tierSegment() {
        return this.profileData?.tierSegment || '';
    }
    get initials() {
        const n = this.companyName.trim().split(/\s+/).filter(Boolean);
        if (n.length >= 2) {
            return (n[0][0] + n[1][0]).toUpperCase();
        }
        return (n[0] || 'CO').slice(0, 3).toUpperCase();
    }

    get profilePhotoEffectiveUrl() {
        const legacyStatic = sanitizeProfilePhotoUrl(this.profilePhotoUrl);
        if (legacyStatic) {
            return legacyStatic;
        }
        if (!this.profileData) {
            return '';
        }
        const mapped = sanitizeProfilePhotoUrl(this.profileData.profilePhotoUrl);
        if (mapped) {
            return mapped;
        }
        if (this._useWebsiteFavicon && this._websiteLogoCandidates.length > 0) {
            const i = Math.min(this._websiteLogoAttempt, this._websiteLogoCandidates.length - 1);
            return this._websiteLogoCandidates[i] || '';
        }
        return '';
    }

    get profilePhotoSrcResolved() {
        return this.profilePhotoEffectiveUrl || '';
    }

    get showCompanyLogo() {
        return !this.logoLoadFailed && Boolean(this.profilePhotoEffectiveUrl);
    }

    get profilePhotoAlt() {
        const n = (this.companyName || '').trim();
        return n ? `${n} logo` : 'Company logo';
    }

    handleCompanyLogoError() {
        const mapped = sanitizeProfilePhotoUrl(this.profileData?.profilePhotoUrl);
        if (mapped) {
            this.logoLoadFailed = true;
            return;
        }
        if (this._useWebsiteFavicon && this._websiteLogoCandidates.length > 0) {
            this._websiteLogoAttempt += 1;
            if (this._websiteLogoAttempt >= this._websiteLogoCandidates.length) {
                this.logoLoadFailed = true;
            }
            return;
        }
        this.logoLoadFailed = true;
    }

    get kpiRevenue() {
        return this.formatCurrency(this.profileData?.revenue);
    }
    get kpiRevenueDelta() {
        const g = this.profileData?.revenueGrowth;
        if (g == null || g === '') {
            return '';
        }
        return '+' + g + '%';
    }
    get kpiLoan() {
        return this.formatCurrency(this.profileData?.loanBalance);
    }
    get kpiLoanUtil() {
        const u = this.profileData?.loanUtilization;
        return u != null && u !== '' ? u + '% util.' : '';
    }
    get kpiCreditRating() {
        const d = this.profileData || {};
        return d.spRating || d.creditRating || '—';
    }
    get kpiTenure() {
        const s = this.profileData?.customerSince;
        if (!s) {
            return '';
        }
        return customerSinceTenureShort(s);
    }

    get complianceFlags() {
        const d = this.profileData || {};
        const kyc = complianceStatusTier(d.kycStatus);
        const aml = complianceStatusTier(d.amlStatus);
        const rows = [
            {
                key: 'flag-kyc',
                label: 'KYC',
                status: kyc.display,
                preserveStatusCase: true,
                ...tierToComplianceFlagClasses(kyc.tier)
            },
            {
                key: 'flag-aml',
                label: 'AML',
                status: aml.display,
                preserveStatusCase: true,
                ...tierToComplianceFlagClasses(aml.tier)
            },
            { key: 'flag-2fa', ...twoFaComplianceFlag(d) },
            { key: 'flag-paperless', ...booleanServiceFlag('Paperless', d.paperlessEnrolled) },
            { key: 'flag-wire', ...booleanServiceFlag('Wire', d.wireEnabled) }
        ];
        return rows;
    }

    get waterfallRows() {
        const d = this.profileData || {};
        const max = Number(d.revenue) || 1;
        const pct = (v) => Math.min(Math.round((v / max) * 100), 100);
        return [
            { label: 'Revenue', value: Number(d.revenue) || 0, color: '#185fa5', delta: this.kpiRevenueDelta, deltaClass: 'wp-kd-up' },
            { label: 'Deposits', value: Number(d.depositYtd) || 0, color: '#1d9e75', delta: 'YTD', deltaClass: 'wp-kd-muted' },
            { label: 'Investments', value: Number(d.investmentBalance) || 0, color: '#534ab7', delta: '', deltaClass: '' },
            { label: 'Int. expense', value: Number(d.interestExpense) || 0, color: '#ba7517', delta: 'cost', deltaClass: 'wp-kd-dn' },
            { label: 'Loan balance', value: Number(d.loanBalance) || 0, color: '#a32d2d', delta: this.kpiLoanUtil, deltaClass: 'wp-kd-warn' }
        ].map((r, i) => ({
            ...r,
            key: 'wf-' + i,
            fillStyle: `width:${pct(r.value)}%;background:${r.color}`,
            formattedVal: this.formatCurrency(r.value)
        }));
    }

    formatBureauValue(v) {
        if (v == null || v === '') {
            return '—';
        }
        if (typeof v === 'number' && Number.isFinite(v)) {
            return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
        }
        const s = String(v).trim();
        return s || '—';
    }

    get creditRating() {
        const d = this.profileData || {};
        return d.spRating || d.creditRating || '—';
    }
    get creditAgency() {
        const d = this.profileData || {};
        if (d.spCategory) {
            return 'S&P · ' + d.spCategory;
        }
        return d.creditRatingAgency || 'Credit overview';
    }
    get creditOutlook() {
        const d = this.profileData || {};
        return d.experianRiskBand || d.creditOutlook || '—';
    }
    get moodysRating() {
        const d = this.profileData || {};
        return d.moodysAgencyRating || d.moodysRating || '';
    }
    get creditHeroMoodysCategory() {
        const d = this.profileData || {};
        return d.moodysAgencyCategory || '';
    }

    /** Prefer bureau numeric scores for the dial (0–100 scale when possible). */
    get creditDialScore() {
        const d = this.profileData || {};
        const candidates = [
            Number(d.dnbPaydexScore),
            Number(d.equifaxCreditRiskScore),
            Number(d.experianIntelliscore),
            Number(d.creditScore)
        ].filter((n) => Number.isFinite(n) && n > 0);
        if (!candidates.length) {
            return 0;
        }
        const raw = candidates[0];
        return Math.min(100, Math.max(0, Math.round(raw)));
    }
    get creditScoreDash() {
        return Math.round(251.2 - (this.creditDialScore / 100) * 251.2);
    }
    get creditScoreText() {
        return this.creditDialScore + '/100';
    }
    get creditDialCaption() {
        const d = this.profileData || {};
        if (d.dnbPaydexScore != null && d.dnbPaydexScore !== '') {
            return 'PAYDEX';
        }
        if (d.equifaxCreditRiskScore != null && d.equifaxCreditRiskScore !== '') {
            return 'Equifax risk';
        }
        if (d.experianIntelliscore != null && d.experianIntelliscore !== '') {
            return 'Intelliscore';
        }
        return 'internal score';
    }

    get creditBureauSections() {
        const d = this.profileData || {};
        const row = (key, label, value) => ({
            key,
            label,
            value: this.formatBureauValue(value)
        });
        const card = (key, title, hint, mod, rows) => ({
            key,
            title,
            hint,
            cardClass: 'wp-bureau-card ' + mod,
            rows
        });
        return [
            card('dnb', 'Dun & Bradstreet', 'Commercial analytics', 'wp-bureau-card--dnb', [
                    row('dnb-pdex', 'PAYDEX score', d.dnbPaydexScore),
                    row('dnb-dq', 'Delinquency score', d.dnbDelinquencyScore),
                    row('dnb-fail', 'Failure score', d.dnbFailureScore),
                    row('dnb-rate', 'D&B rating', d.dnbRating)
            ]),
            card('experian', 'Experian', 'Business credit', 'wp-bureau-card--exp', [
                row('ex-int', 'Intelliscore', d.experianIntelliscore),
                row('ex-band', 'Risk band', d.experianRiskBand)
            ]),
            card('equifax', 'Equifax', 'Credit risk', 'wp-bureau-card--efx', [
                row('eq-risk', 'Credit risk score', d.equifaxCreditRiskScore),
                row('eq-fail', 'Failure score (CR)', d.equifaxFailureScoreCr),
                row('eq-pay', 'Payment index', d.equifaxPaymentIndex)
            ]),
            card('sp', 'S&P Global', 'Issuer view', 'wp-bureau-card--sp', [
                row('sp-r', 'S&P rating', d.spRating),
                row('sp-c', 'Category', d.spCategory)
            ]),
            card('moodys', "Moody's", 'Issuer view', 'wp-bureau-card--mc', [
                row('md-r', "Moody's rating", d.moodysAgencyRating),
                row('md-c', 'Category', d.moodysAgencyCategory)
            ]),
            card('fitch', 'Fitch', 'Issuer view', 'wp-bureau-card--ft', [
                row('ft-r', 'Fitch rating', d.fitchRating),
                row('ft-c', 'Category', d.fitchCategory)
            ])
        ];
    }

    get creditFacilityRows() {
        const d = this.profileData || {};
        const avail = (Number(d.loanLimit) || 0) - (Number(d.loanBalance) || 0);
        return [
            { label: 'Total limit', val: this.formatCurrency(d.loanLimit), cls: '', iconName: 'utility:currency' },
            {
                label: 'Utilized',
                val: `${this.formatCurrency(d.loanBalance)} (${d.loanUtilization || 0}%)`,
                cls: 'wp-td-warn',
                iconName: 'utility:metrics'
            },
            { label: 'Available', val: this.formatCurrency(avail), cls: 'wp-td-accent', iconName: 'utility:success' },
            { label: 'Rate', val: d.interestRate || 'Prime + 1.25%', cls: '', iconName: 'utility:percent' },
            { label: 'Next review', val: d.creditReviewDate || '', cls: '', iconName: 'utility:date_input' },
            { label: 'Collateral', val: d.collateralType || '', cls: '', iconName: 'utility:product' }
        ].map((r, i) => ({
            ...r,
            key: 'cr-' + i,
            valClass: ['wp-field-val', r.cls].filter(Boolean).join(' ')
        }));
    }

    get companyFields() {
        const d = this.profileData || {};
        const emp =
            d.employees != null && d.employees !== ''
                ? Number(d.employees).toLocaleString() + ' full-time'
                : '';
        return [
            { label: 'Legal name', val: d.legalName || '', cls: '', iconName: 'utility:company' },
            { label: 'Industry', val: d.industry || '', cls: '', iconName: 'utility:company' },
            { label: 'Employees', val: emp, cls: '', iconName: 'utility:people' },
            { label: 'HQ address', val: [d.street, d.city].filter(Boolean).join(', '), cls: '', iconName: 'utility:location' },
            {
                label: 'Founded',
                val: this.displayFoundedSummary,
                cls: '',
                iconName: 'utility:date_time'
            },
            { label: 'Website', val: d.website || '', cls: 'wp-td-link', iconName: 'utility:link' },
            { label: 'Tax / EIN', val: d.taxId ? '····' + String(d.taxId).slice(-4) : '', cls: 'wp-td-muted', iconName: 'utility:lock' },
            { label: 'SIC code', val: [d.sicCode, d.sicDescription].filter(Boolean).join(' · '), cls: '', iconName: 'utility:number_input' }
        ].map((r, i) => ({
            ...r,
            key: 'co-' + i,
            valClass: ['wp-field-val', r.cls].filter(Boolean).join(' ')
        }));
    }

    get displayFoundedSummary() {
        const d = this.profileData || {};
        let year = null;
        const fy = d.founded;
        if (fy != null && fy !== '') {
            const n = Number(fy);
            if (Number.isFinite(n) && n > 0) {
                year = n;
            }
        }
        if (year == null) {
            year = extractFoundedYearFromRawString(d.foundedDateRaw);
        }
        if (year == null) {
            return '';
        }
        const age = new Date().getFullYear() - year;
        return `${year} · ${age} years`;
    }

    get displayCustomerSinceRelationship() {
        const raw = this.profileData?.customerSince;
        const mmm = formatMmmYyyy(raw);
        if (!mmm) {
            return '';
        }
        const tenure = customerSinceTenurePhrase(raw);
        if (!tenure) {
            return mmm;
        }
        return `${mmm} - ${tenure}`;
    }

    get daysSinceLastContact() {
        const t0 = utcMidnightMsFromProfileDate(this.profileData?.lastInteractionDate);
        if (t0 == null) {
            return null;
        }
        const now = new Date();
        const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const diff = Math.floor((today - t0) / 86400000);
        return diff >= 0 ? diff : null;
    }

    get displayLastInteractionRelationship() {
        const raw = this.profileData?.lastInteractionDate;
        const mmm = formatMmmYyyy(raw);
        if (!mmm) {
            return '';
        }
        const d = this.daysSinceLastContact;
        if (d == null) {
            return mmm;
        }
        return `${mmm} · ${d} day${d === 1 ? '' : 's'}`;
    }

    get lastInteractionRelationshipClass() {
        const d = this.daysSinceLastContact;
        if (d == null) {
            return 'wp-td-warn';
        }
        if (d > 60) {
            return 'wp-td-warn wp-lid-days--bad';
        }
        if (d > 30) {
            return 'wp-td-warn wp-lid-days--warn';
        }
        return 'wp-td-warn';
    }

    get relationshipFields() {
        const d = this.profileData || {};
        const activeProductsVal = (() => {
            if (d.activeProducts == null || d.activeProducts === '') {
                return '';
            }
            const n = Number(d.activeProducts);
            if (!Number.isFinite(n)) {
                return String(d.activeProducts);
            }
            if (d.activeProductsReflectsFinancialAccounts === true) {
                return `${n} active financial account${n === 1 ? '' : 's'}`;
            }
            return `${n} facilities`;
        })();
        return [
            { label: 'Customer since', val: this.displayCustomerSinceRelationship, cls: '', iconName: 'utility:date_input' },
            { label: 'Segment', val: d.tierSegment || '', cls: 'wp-td-accent', iconName: 'utility:chart' },
            { label: 'Primary RM', val: d.primaryRm || '', cls: '', iconName: 'utility:user' },
            {
                label: 'Active products',
                val: activeProductsVal,
                cls: 'wp-td-accent',
                iconName: 'utility:product'
            },
            {
                label: 'Subsidiaries',
                val:
                    d.subsidiaries != null && d.subsidiaries !== ''
                        ? `${d.subsidiaries} related account${Number(d.subsidiaries) === 1 ? '' : 's'}`
                        : '',
                cls: '',
                iconName: 'utility:hierarchy'
            },
            {
                label: 'Last interaction',
                val: this.displayLastInteractionRelationship,
                cls: this.lastInteractionRelationshipClass,
                iconName: 'utility:event'
            },
            (() => {
                const chVal =
                    d.lastUsedChannel != null && String(d.lastUsedChannel).trim() !== ''
                        ? String(d.lastUsedChannel).trim()
                        : '';
                const chMeta = lastUsedChannelIconMeta(chVal);
                return {
                    label: 'Last used channel',
                    val: chVal,
                    cls: chMeta ? 'wp-field-val--channel' : '',
                    channelIconName: chMeta ? chMeta.iconName : '',
                    channelIconAlt: chMeta ? chMeta.alt : '',
                    iconName: 'utility:connected_apps'
                };
            })()
        ].map((r, i) => ({
            ...r,
            key: 'rf-' + i,
            valClass: ['wp-field-val', r.cls].filter(Boolean).join(' ')
        }));
    }

    get pipelineOpportunityRows() {
        const rows = this.profileData?.pipelineOpenOpportunities;
        if (!Array.isArray(rows) || rows.length === 0) {
            return [];
        }
        return rows.map((o, i) => {
            const amt = o.amount;
            const hasAmt = amt != null && amt !== '' && Number.isFinite(Number(amt));
            return {
                key: 'pipe-' + i,
                id: o.id,
                name: o.name || 'Opportunity',
                stageName: o.stageName || '—',
                amountDisplay: hasAmt ? this.formatCurrency(amt) : '—'
            };
        });
    }

    get hasPipelineOpportunities() {
        return this.pipelineOpportunityRows.length > 0;
    }

    get orgChartRootSublabel() {
        const t = (this.profileData?.accountType || '').trim();
        return t || 'Parent entity';
    }

    get orgChartChildrenRows() {
        return (this.profileData?.orgChartChildren || []).map((n, i) => {
            const kind = (n.kind || '').toLowerCase();
            const nodeClass =
                kind === 'contact'
                    ? 'wp-org-node wp-org-node--contact'
                    : 'wp-org-node wp-org-node--account';
            const accountId = (n.accountId || '').trim();
            const contactId = (n.contactId || '').trim();
            return {
                key: 'org-' + i,
                name: n.name || '',
                sublabel: n.sublabel || '',
                nodeClass,
                accountId,
                contactId,
                showAccountLink: kind === 'account' && accountId.length > 0,
                showContactLink: kind === 'contact' && contactId.length > 0
            };
        });
    }

    get orgChartShowConnectors() {
        return this.orgChartChildrenRows.length > 0;
    }

    get structureLinkedAccountsDisplay() {
        const s = (this.profileData?.structureLinkedAccountsText || '').trim();
        return s || 'Commercial + treasury';
    }

    get structureLinkedContactsDisplay() {
        const s = (this.profileData?.structureLinkedContactsText || '').trim();
        return s || 'RM coverage + executives';
    }

    get structureReferralNetworkDisplay() {
        const s = (this.profileData?.structureReferralNetworkText || '').trim();
        return s || 'Private wealth introductions';
    }

    get keyContacts() {
        const raw = [...(this.profileData?.keyContacts || [])];
        raw.sort((a, b) => {
            const ra = contactSortRank(a);
            const rb = contactSortRank(b);
            if (ra !== rb) {
                return ra - rb;
            }
            const la = (a.lastName || a.LastName || '').toLowerCase();
            const lb = (b.lastName || b.LastName || '').toLowerCase();
            const cmp = la.localeCompare(lb);
            if (cmp !== 0) {
                return cmp;
            }
            return (a.firstName || a.FirstName || '').localeCompare(b.firstName || b.FirstName || '');
        });
        return raw.map((c, i) => {
            const fn = c.firstName || c.FirstName || '';
            const ln = c.lastName || c.LastName || '';
            const initials = ((fn[0] || '') + (ln[0] || '')).toUpperCase();
            const title = (c.title || c.Title || '').trim();
            const acr = (c.acrRole || '').trim();
            const hay = `${title} ${acr}`.toLowerCase();
            let badge;
            if (hay.includes('ceo') || hay.includes('president') || hay.includes('chief executive')) {
                badge = {
                    label: 'Primary',
                    cls: 'wp-contact-badge wp-cb-primary',
                    avatarCls: 'wp-contact-av wp-contact-av--primary'
                };
            } else if (hay.includes('cfo') || hay.includes('finance') || hay.includes('financial officer')) {
                badge = {
                    label: 'Finance',
                    cls: 'wp-contact-badge wp-cb-finance',
                    avatarCls: 'wp-contact-av wp-contact-av--finance'
                };
            } else if (hay.includes('coo') || hay.includes('oper')) {
                badge = {
                    label: 'Ops',
                    cls: 'wp-contact-badge wp-cb-ops',
                    avatarCls: 'wp-contact-av wp-contact-av--ops'
                };
            } else if (hay.includes('counsel') || hay.includes('legal')) {
                badge = {
                    label: 'Legal',
                    cls: 'wp-contact-badge wp-cb-legal',
                    avatarCls: 'wp-contact-av wp-contact-av--legal'
                };
            } else {
                badge = {
                    label: 'Contact',
                    cls: 'wp-contact-badge wp-cb-ops',
                    avatarCls: 'wp-contact-av wp-contact-av--ops'
                };
            }
            const contactId = (c.contactId || c.ContactId || '').trim();
            return {
                key: 'kc-' + i,
                initials: initials || '—',
                fullName: `${fn} ${ln}`.trim(),
                title: title || acr,
                avatarClass: badge.avatarCls,
                label: badge.label,
                cls: badge.cls,
                contactId,
                showNameLink: contactId.length > 0
            };
        });
    }

    handleNavigateToRecord(event) {
        const id = event.currentTarget?.dataset?.id;
        const objectApiName = event.currentTarget?.dataset?.object;
        if (!id || !objectApiName) {
            return;
        }
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: id,
                objectApiName,
                actionName: 'view'
            }
        });
    }

    get addressCells() {
        const d = this.profileData || {};
        return [
            { label: 'Street', val: d.street || '' },
            { label: 'City / State', val: [d.city, d.state].filter(Boolean).join(', ') },
            { label: 'ZIP code', val: d.zip || '' },
            { label: 'Market zone', val: d.marketZone || '' }
        ].map((r, i) => ({ ...r, key: 'addr-' + i }));
    }

    get branchCards() {
        const d = this.profileData || {};
        const statusOpen = (s) => (s || '').toLowerCase().includes('open');
        const lineFor = (isOpen, status, hours) => {
            if (isOpen) {
                return '';
            }
            return hours || status || 'See hours';
        };
        const assigned = {
            key: 'branch-0',
            displayName: d.assignedBranch || (d.branchAddress ? 'Assigned branch' : ''),
            address: d.branchAddress || '',
            distance: d.branchDistance || '',
            isAssigned: true,
            isOpen: statusOpen(d.branchStatus),
            statusLine: lineFor(statusOpen(d.branchStatus), d.branchStatus, d.branchHours),
            cardClass: 'wp-branch-card wp-branch-card--assigned',
            nameClass: 'wp-branch-name wp-branch-name--accent',
            distClass: 'wp-branch-dist wp-branch-dist--accent'
        };
        const nearby = (d.nearbyBranches || []).map((b, i) => {
            const open = statusOpen(b.status);
            return {
                key: 'branch-' + (i + 1),
                displayName: b.name || 'Branch',
                address: b.address || '',
                distance: b.distance || '',
                isAssigned: false,
                isOpen: open,
                statusLine: lineFor(open, b.status, b.hours),
                cardClass: 'wp-branch-card',
                nameClass: 'wp-branch-name',
                distClass: 'wp-branch-dist'
            };
        });
        const out = [];
        if (assigned.displayName || assigned.address || assigned.distance) {
            out.push(assigned);
        }
        out.push(...nearby);
        return out;
    }

    get subsidiariesDisplay() {
        const n = this.profileData?.subsidiaries;
        if (n == null || n === '') {
            return '—';
        }
        const num = Number(n);
        return `${num} related account${num === 1 ? '' : 's'}`;
    }

    get structureUnifiedRelationshipFields() {
        return [
            {
                label: 'Linked accounts',
                val: this.structureLinkedAccountsDisplay,
                cls: 'wp-td-accent',
                iconName: 'standard:account'
            },
            {
                label: 'Linked contacts',
                val: this.structureLinkedContactsDisplay,
                cls: '',
                iconName: 'utility:people'
            },
            {
                label: 'Subsidiaries',
                val: this.subsidiariesDisplay,
                cls: '',
                iconName: 'utility:hierarchy'
            },
            {
                label: 'Referral network',
                val: this.structureReferralNetworkDisplay,
                cls: 'wp-td-muted',
                iconName: 'utility:groups'
            }
        ].map((r, i) => ({
            ...r,
            key: 'sr-' + i,
            valClass: ['wp-field-val', r.cls].filter(Boolean).join(' ')
        }));
    }

    get cityLabel() {
        return this.profileData?.city || 'HQ';
    }

    get d() {
        return this.profileData;
    }

    get predictionLabel() {
        return this.d?.predictionLabel || '—';
    }

    get aiSummary() {
        return this.summaryText || '';
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

    get showAiActionsResolved() {
        return this.showAiActions !== false;
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
        const d = this.d;
        const lat = this.parseMapCoordinate(d?.mapLatitude);
        const lng = this.parseMapCoordinate(d?.mapLongitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return [];
        }
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            return [];
        }
        if (lat === 0 && lng === 0) {
            return [];
        }
        const title = (this.companyName || 'Location').trim() || 'Location';
        const parts = [d?.street, d?.city, d?.state, d?.zip]
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

    formatCurrency(val) {
        if (val == null || val === '' || isNaN(Number(val))) {
            return '';
        }
        const n = Number(val);
        if (n >= 1000000) {
            return '$' + (Math.round(n / 100000) / 10).toFixed(1) + 'M';
        }
        if (n >= 1000) {
            return '$' + (Math.round(n / 100) / 10).toFixed(1) + 'K';
        }
        return '$' + n.toLocaleString();
    }
}
