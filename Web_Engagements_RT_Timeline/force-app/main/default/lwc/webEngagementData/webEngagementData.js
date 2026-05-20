import { LightningElement, api } from 'lwc';
import getWebEngagementsWithBackfill from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementsWithBackfill';
import getCrmTimelineEvents from '@salesforce/apex/CrmTimelineController.getCrmTimelineEvents';
import { parseDataGraphResponse, mergeAndSort, groupByDay } from './timelineMappers';
import { SOURCE_CONFIG, SOURCE_ORDER } from './sourceConfig';

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

    webEvents = [];
    crmEvents = [];

    loadingWeb = false;
    loadingCrm = false;
    webError = null;
    crmError = null;

    activeSourceFilters = new Set();
    expandedIds = new Set();

    connectedCallback() {
        this.handleRefresh();
    }

    handleRefresh() {
        this.loadWebEngagements();
        this.loadCrmEvents();
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
                lookbackDays: this.lookbackDays
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
                lookbackDays: this.lookbackDays
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

    get isFullyLoadedAndEmpty() {
        return !this.loadingWeb && !this.loadingCrm && !this.hasAnyEvents;
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