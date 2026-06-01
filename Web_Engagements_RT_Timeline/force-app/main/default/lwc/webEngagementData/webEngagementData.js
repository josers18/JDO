import { LightningElement, api } from 'lwc';
import getWebEngagementsWithBackfill from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementsWithBackfill';
import getCrmTimelineEvents from '@salesforce/apex/CrmTimelineController.getCrmTimelineEvents';
import { parseDataGraphResponse, mergeAndSort, groupByDay } from './timelineMappers';
import { SOURCE_CONFIG, SOURCE_ORDER } from './sourceConfig';

// Runtime lookback presets shown in the header dropdown. 365 is the upper bound
// enforced by MAX_LOOKBACK_DAYS in CrmTimelineController.cls and COLD_MAX_LOOKBACK_DAYS
// in DataCloudWebEngagementController.cls — keep these in sync if Apex caps change.
// Values are STRINGS because lightning-combobox compares value-prop to option.value
// with strict equality; numeric values would render but never show as selected.
const LOOKBACK_OPTIONS = [
    { label: '30 days',  value: '30'  },
    { label: '60 days',  value: '60'  },
    { label: '90 days',  value: '90'  },
    { label: '180 days', value: '180' },
    { label: '365 days', value: '365' }
];
const LOOKBACK_VALUES = LOOKBACK_OPTIONS.map(o => parseInt(o.value, 10));

export default class WebEngagementData extends LightningElement {
    @api recordId;

    // App Builder properties — defaults match webEngagementData.js-meta.xml.
    @api dcDataGraphName = 'RT_Web_Engagementsv2';
    @api cardTitle = 'Real Time Engagements';
    @api cardTitleLink = '';
    @api feedHeight = 600;
    @api autoSize = false;
    @api showCases = false;
    @api showTasks = false;
    @api showEvents = false;
    @api showVoiceCalls = false;
    @api lookbackDays = 90;

    // Runtime override for the lookback window. Seeded from the @api default in
    // connectedCallback so App Builder still controls the initial value, but the
    // user can change it via the header dropdown without admin involvement. All
    // Apex calls read this private field, NOT the @api property, so the original
    // App Builder value remains a stable seed even after the user picks something.
    _currentLookback = null;

    webEvents = [];
    crmEvents = [];

    loadingWeb = false;
    loadingCrm = false;
    webError = null;
    crmError = null;

    activeSourceFilters = new Set();
    expandedIds = new Set();

    connectedCallback() {
        // Don't seed _currentLookback here — at connectedCallback time, @api
        // properties from FlexiPage may not be hydrated yet (especially when the
        // LWC sits inside a tab that gets activated late). The currentLookback
        // getter reads lookbackDays lazily so the dropdown reflects the actual
        // App Builder config on first render.
        this.handleRefresh();
    }

    handleRefresh() {
        this.loadWebEngagements();
        this.loadCrmEvents();
    }

    handleLookbackChange(event) {
        const next = parseInt(event.detail.value, 10);
        if (Number.isNaN(next) || next === this.effectiveLookbackDays) return;
        this._currentLookback = next;
        // Reset both data sources before refetching so partial-failure banners
        // and chip filters from the previous window don't bleed into the new one.
        this.webEvents = [];
        this.crmEvents = [];
        this.activeSourceFilters = new Set();
        this.handleRefresh();
    }

    get lookbackOptions() {
        return LOOKBACK_OPTIONS;
    }

    // String form of the active lookback for lightning-combobox value-prop matching.
    // The combobox compares value (string) to option.value (string) with strict equality.
    // When the user hasn't overridden, fall back to the @api seed clamped into the
    // supported set; an unsupported config value (e.g., 45) shows up as 90.
    get currentLookback() {
        const effective = this._currentLookback != null
            ? this._currentLookback
            : (LOOKBACK_VALUES.includes(this.lookbackDays) ? this.lookbackDays : 90);
        return String(effective);
    }

    // Numeric value for Apex calls. Mirrors currentLookback's fallback chain so that
    // both UI display and server-side queries always agree on the active window.
    get effectiveLookbackDays() {
        if (this._currentLookback != null) return this._currentLookback;
        return LOOKBACK_VALUES.includes(this.lookbackDays) ? this.lookbackDays : 90;
    }

    async loadWebEngagements() {
        this.loadingWeb = true;
        this.webError = null;
        try {
            // Hot Data Graph cache + cold-store DMO backfill, merged Apex-side. The LWC
            // sees the same envelope shape regardless of whether one or both sources had
            // events, so parseDataGraphResponse stays unchanged. lookbackDays bounds the
            // cold backfill window; it has no effect on the hot cache.
            const raw = await getWebEngagementsWithBackfill({
                accountId: this.recordId,
                dataGraphName: this.dcDataGraphName,
                lookbackDays: this.effectiveLookbackDays
            });
            this.webEvents = parseDataGraphResponse(raw);
            this.maybeAutoEnableChips();
        } catch (e) {
            console.error('Web engagements load failed:', e);
            this.webError = "Couldn't load web engagements.";
        } finally {
            this.loadingWeb = false;
        }
    }

    async loadCrmEvents() {
        const enabled = this.enabledCrmSources;
        if (enabled.length === 0) {
            this.crmEvents = [];
            return;
        }
        this.loadingCrm = true;
        this.crmError = null;
        try {
            const events = await getCrmTimelineEvents({
                recordId: this.recordId,
                enabledSources: enabled,
                lookbackDays: this.effectiveLookbackDays
            });
            this.crmEvents = events || [];
            this.maybeAutoEnableChips();
        } catch (e) {
            console.error('CRM events load failed:', e);
            this.crmError = "Couldn't load CRM activity.";
        } finally {
            this.loadingCrm = false;
        }
    }

    handleToggle(event) {
        const itemId = event.currentTarget.dataset.id;
        if (this.expandedIds.has(itemId)) {
            this.expandedIds.delete(itemId);
        } else {
            this.expandedIds.add(itemId);
        }
        this.expandedIds = new Set(this.expandedIds);
    }

    /**
     * Inline style string for the .engagement-feed container.
     * - autoSize on  -> cap at 90% of viewport height
     * - autoSize off -> cap at the numeric feedHeight (px)
     * Always sets `overflow-y: auto` so scrolling kicks in once the cap is hit.
     */
    get feedStyle() {
        const cap = this.autoSize ? '90vh' : `${this.feedHeight}px`;
        return `max-height: ${cap}; overflow-y: auto;`;
    }

    /**
     * True when an explicit cardTitleLink was provided in App Builder.
     * Used by the template to choose between an <a> and plain text.
     */
    get headerTitleIsLink() {
        return Boolean(this.cardTitleLink);
    }

    get enabledCrmSources() {
        const out = [];
        if (this.showCases)      out.push('case');
        if (this.showTasks)      out.push('task');
        if (this.showEvents)     out.push('event');
        if (this.showVoiceCalls) out.push('voice');
        return out;
    }

    get mergedEvents() {
        const merged = mergeAndSort(this.webEvents, this.crmEvents);
        return merged.map(evt => ({
            ...evt,
            isExpanded: this.expandedIds.has(evt.id)
        }));
    }

    get sourceCounts() {
        const counts = {};
        for (const evt of this.mergedEvents) {
            counts[evt.source] = (counts[evt.source] || 0) + 1;
        }
        return counts;
    }

    get availableChips() {
        const counts = this.sourceCounts;
        const chips = [];

        const total = this.mergedEvents.length;
        const allActive = SOURCE_ORDER.every(s =>
            counts[s] === undefined || this.activeSourceFilters.has(s)
        );
        chips.push({
            source: '__all__',
            label: 'All',
            count: total,
            cssClass: 'chip ' + (allActive ? 'chip-on' : ''),
            // The "All" chip is intentionally neutral — it has no single source color,
            // so its CSS falls back to the default chip styling without --chip-color.
            style: ''
        });

        for (const s of SOURCE_ORDER) {
            if (!counts[s]) continue;
            const cfg = SOURCE_CONFIG[s];
            chips.push({
                source: s,
                label: cfg.chipLabel,
                count: counts[s],
                cssClass: 'chip chip--colored ' + (this.activeSourceFilters.has(s) ? 'chip-on' : ''),
                // Inject the source color as a CSS custom property so the chip's CSS
                // can use the same hex for tint, border, and active fill.
                // SOURCE_CONFIG is the single source of truth for these colors —
                // matches iconColor on each event, so chip ↔ left-rail ↔ icon agree.
                style: `--chip-color: ${cfg.color};`
            });
        }
        return chips;
    }

    get groupedByDay() {
        const filtered = this.mergedEvents.filter(e =>
            this.activeSourceFilters.size === 0 || this.activeSourceFilters.has(e.source)
        );
        return groupByDay(filtered);
    }

    get hasAnyEvents() {
        return this.mergedEvents.length > 0;
    }

    get isCrmLoadingChip() {
        return this.loadingCrm && !this.loadingWeb;
    }

    get isInitialLoading() {
        return this.loadingWeb && this.webEvents.length === 0;
    }

    // Fallback fires as soon as the web (Data Graph + cold-store) call confirms zero
    // events. CRM is intentionally excluded from the gate: if CRM is still loading,
    // the italic "Loading CRM activity..." chip renders BELOW the fallback, then the
    // fallback disappears the moment CRM events arrive. Including !loadingCrm here
    // would suppress the fallback any time CRM hung/lagged, which is what produced
    // the "completely blank card" symptom.
    get isWebLoadedAndEmpty() {
        return !this.loadingWeb && !this.hasAnyEvents;
    }

    // After data loads, auto-enable all source chips so the chip bar starts
    // with 'All' active. Idempotent: adds any new sources that have events
    // but aren't yet in the filter set. Called from both loadWebEngagements
    // and loadCrmEvents so it works on whichever Promise resolves first.
    maybeAutoEnableChips() {
        if (this.mergedEvents.length === 0) return;

        const counts = this.sourceCounts;
        const availableSources = SOURCE_ORDER.filter(s => counts[s]);

        // If filters are empty, enable all available sources
        if (this.activeSourceFilters.size === 0) {
            this.activeSourceFilters = new Set(availableSources);
            return;
        }

        // Otherwise, add any new sources that aren't already enabled
        const updated = new Set(this.activeSourceFilters);
        let changed = false;
        for (const s of availableSources) {
            if (!updated.has(s)) {
                updated.add(s);
                changed = true;
            }
        }
        if (changed) {
            this.activeSourceFilters = updated;
        }
    }

    handleChipToggle(event) {
        const source = event.currentTarget.dataset.source;
        if (source === '__all__') {
            const counts = this.sourceCounts;
            const allActive = SOURCE_ORDER.every(s =>
                counts[s] === undefined || this.activeSourceFilters.has(s)
            );
            if (allActive) {
                this.activeSourceFilters = new Set();
            } else {
                this.activeSourceFilters = new Set(SOURCE_ORDER.filter(s => counts[s]));
            }
            return;
        }
        const next = new Set(this.activeSourceFilters);
        if (next.has(source)) next.delete(source);
        else next.add(source);
        this.activeSourceFilters = next;
    }

    handleRetryWeb()  { this.loadWebEngagements(); }
    handleRetryCrm()  { this.loadCrmEvents(); }
}