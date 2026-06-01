import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getCockpit from '@salesforce/apex/FscJourneyCockpitController.getCockpit';
import { THEMES } from './cockpitThemes';

const QUICK_THEMES = ['obsidian', 'midnight', 'graphite', 'ivory'];
const HEX_PATTERN = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const POPOVER_HOVER_DELAY_MS = 180;
const POPOVER_LEAVE_DELAY_MS = 200;

// Lucide → SLDS utility-icon mapping for journey tiles. The cockpit emits
// Lucide-style strings from the controller (the design mock used Lucide);
// LWC needs slds utility names.
const RAIL_ICON_BY_LABEL = {
    Birth: 'utility:user',
    Graduation: 'utility:education',
    Marriage: 'utility:groups',
    'New Home': 'utility:home',
    Home: 'utility:home',
    'New Job': 'utility:travel_and_places',
    Job: 'utility:travel_and_places',
    College: 'utility:education',
    Retirement: 'utility:moneybag',
    Relocation: 'utility:location',
    Baby: 'utility:user',
    'Appointed CEO': 'utility:user_role',
    'New CEO Named': 'utility:user_role',
    'Merger & Acquisition': 'utility:merge',
    'International Expansion': 'utility:world',
    Expansion: 'utility:world',
    'Market Listing': 'utility:flow',
    'New Funding': 'utility:money',
    'New Product Launch': 'utility:rocket',
    'New Partnership': 'utility:people',
    Bankruptcy: 'utility:warning'
};

// Object API names for the "+ New" buttons. Resolved per binding mode.
const NEW_BUTTON_OBJECT = {
    person: {
        managed: 'FinServ__LifeEvent__c',
        standard: 'PersonLifeEvent'
    },
    business: {
        managed: 'BusinessMilestone',
        standard: 'BusinessMilestone'
    }
};
const NEW_GOAL_OBJECT = {
    managed: 'FinServ__FinancialGoal__c',
    standard: 'FinancialGoal'
};
const NEW_OPP_OBJECT = 'Opportunity';

export default class FscJourneyCockpit extends NavigationMixin(LightningElement) {
    // ─── Public API (admin-set in App Builder) ───────────────────────────────
    @api recordId;
    @api objectApiName;

    // Defaults match FlexiPage meta: 'standard' is the FSC-native scope
    // for both goals (FinancialGoal+FinancialGoalParty) and life events
    // (PersonLifeEvent), and typically has more rows than the managed pkg.
    @api goalBinding = 'standard';
    @api lifeEventBinding = 'standard';
    @api cardColumns = 2;
    @api maxJourneyItems = 20;
    @api panelMode = 'auto';

    @api accentColor = '';
    @api warningColor = '';
    @api negativeColor = '';
    @api showThemeSwitcher = false;

    _themeMode = 'default';
    @api
    get themeMode() {
        return this._themeMode;
    }
    set themeMode(value) {
        const m = String(value || 'default').toLowerCase();
        this._themeMode = THEMES[m] ? m : 'default';
        this.scheduleApplyTheme();
    }

    // ─── Internal state ──────────────────────────────────────────────────────
    _isConnected = false;
    _animationPending = false;
    _lastAppliedThemeKey = null;
    _themeScheduleToken = 0;
    _hoverEnterTimer = null;
    _hoverLeaveTimer = null;

    cockpit = null;
    error = null;
    loading = true;

    // Popover state. One instance services hover-preview and action-menu.
    _popover = null; // { kind: 'hover'|'menu', recordId, recordUrl, anchor, ... }
    _popoverTrigger = null; // Element to return focus to on Esc-close (a11y).
    _boundEscHandler = null;

    // ─── Lifecycle ───────────────────────────────────────────────────────────
    connectedCallback() {
        this._isConnected = true;
        this.scheduleApplyTheme();
        // Bind once so removeEventListener can match the same reference.
        this._boundEscHandler = this.handleEscKey.bind(this);
        window.addEventListener('keyup', this._boundEscHandler);
    }

    disconnectedCallback() {
        this._isConnected = false;
        this.clearHoverTimers();
        if (this._boundEscHandler) {
            window.removeEventListener('keyup', this._boundEscHandler);
            this._boundEscHandler = null;
        }
    }

    handleEscKey(event) {
        if (event.key !== 'Escape' || !this._popover) return;
        const focusBack = this._popoverTrigger;
        this.closePopover();
        // Return focus to the element that opened the popover for keyboard users.
        if (focusBack && typeof focusBack.focus === 'function') {
            focusBack.focus();
        }
    }

    renderedCallback() {
        if (!this._isConnected) return;
        if (this._animationPending) return;
        this._animationPending = true;
        requestAnimationFrame(() => {
            this._animationPending = false;
            this.applyTheme();
        });
    }

    // ─── Apex wire ───────────────────────────────────────────────────────────
    @wire(getCockpit, {
        recordId: '$recordId',
        goalBinding: '$goalBinding',
        lifeEventBinding: '$lifeEventBinding'
    })
    wiredCockpit({ data, error }) {
        if (data) {
            this.cockpit = data;
            this.error = null;
            this.loading = false;
        } else if (error) {
            this.cockpit = null;
            this.error = this.extractErrorMessage(error);
            this.loading = false;
        }
    }

    extractErrorMessage(err) {
        if (!err) return 'Unknown error.';
        if (Array.isArray(err.body)) {
            return err.body.map((e) => e.message).join(', ');
        }
        if (err.body && typeof err.body.message === 'string') {
            return err.body.message;
        }
        return err.message || 'Could not load cockpit.';
    }

    // ─── Render-side getters ─────────────────────────────────────────────────
    get hasData() {
        return Boolean(this.cockpit);
    }
    get hasError() {
        return Boolean(this.error);
    }
    get hasJourneyItems() {
        return this.journeyCount > 0;
    }
    get hasCards() {
        return this.cardsCount > 0;
    }
    get isPerson() {
        return this.cockpit && this.cockpit.recordType === 'person';
    }
    get journeyCount() {
        const items = this.cockpit && this.cockpit.journey;
        return Array.isArray(items) ? items.length : 0;
    }
    get cardsCount() {
        const cards = this.cockpit && this.cockpit.cards;
        return Array.isArray(cards) ? cards.length : 0;
    }

    get journeyItems() {
        const all = this.cockpit && this.cockpit.journey;
        if (!Array.isArray(all)) return [];
        const cap = Math.max(1, Number(this.maxJourneyItems) || 20);
        return all.slice(0, cap).map((j, idx) => {
            const completed = Boolean(j.completed);
            const stepClass = completed ? 'step' : 'step pending';
            const dateText = j.eventDate
                ? this.formatShortDate(j.eventDate)
                : completed
                ? 'Recorded'
                : 'Planned';
            // Description: the underlying record's Name. Show it between the
            // title (which is the EventType, e.g. "Job") and the date — but
            // only when it adds information (i.e. differs from the label).
            const desc = (j.description || '').trim();
            const showDescription = desc && desc !== (j.label || '').trim();
            return {
                ...j,
                key: `${j.label || 'item'}-${idx}`,
                stepClass,
                iconName: this.iconForLabel(j.label),
                // 'inverse' renders the icon white — readable on the blue
                // completed-node background. Pending nodes use default
                // (which currentColor on the .step-icon resolves to muted).
                iconVariant: completed ? 'inverse' : '',
                dateText,
                countBadge: j.count && j.count > 1 ? `x${j.count}` : '',
                showDescription,
                description: desc,
                ariaLabel: `${j.label || 'Event'}${showDescription ? ', ' + desc : ''}, ${dateText}`
            };
        });
    }

    get decoratedCards() {
        const cards = this.cockpit && this.cockpit.cards;
        if (!Array.isArray(cards)) return [];
        const RING_CIRC = 2 * Math.PI * 18.5;
        return cards.map((c, idx) => {
            const ringPct = Math.min(100, Math.max(0, Number(c.ringPct) || 0));
            const progressPct = Math.min(100, Math.max(0, Number(c.progressPct) || 0));
            const ringClass = `ring ${c.ringVariant === 'full' ? 'full' : c.ringVariant === 'blue' ? 'blue' : ''}`.trim();
            const trackClass = `track ${c.ringVariant === 'full' ? 'full' : c.ringVariant === 'blue' ? 'blue' : ''}`.trim();
            const ringDisplay = ringPct >= 99.9 ? '✓' : `${Math.round(ringPct)}%`;
            const ringDashOffset = (RING_CIRC * (1 - ringPct / 100)).toFixed(2);
            return {
                ...c,
                key: c.recordId || `${c.name || 'card'}-${idx}`,
                ringPctNum: ringPct,
                progressPctNum: progressPct,
                ringClass,
                trackClass,
                ringDisplay,
                ringDashOffset,
                primaryAmountFmt: this.formatUsd(c.primaryAmount),
                targetAmountFmt: c.targetAmount != null ? `of ${this.formatUsd(c.targetAmount)}` : '',
                progressStyle: `width:${progressPct}%`,
                chipClass: this.chipClassFor(c.chipVariant)
            };
        });
    }

    get kpis() {
        const k = this.cockpit && this.cockpit.kpis;
        if (!Array.isArray(k)) return [];
        return k.map((x, i) => ({ ...x, key: `${x.label}-${i}`, iconName: this.kpiIconName(x.icon) }));
    }

    kpiIconName(icon) {
        switch (icon) {
            case 'target':
                return 'utility:target';
            case 'gauge':
                return 'utility:dial';
            case 'wallet':
                return 'utility:moneybag';
            case 'calendar-clock':
                return 'utility:date_time';
            default:
                return 'utility:info';
        }
    }

    iconForLabel(label) {
        if (!label) return 'utility:event';
        return RAIL_ICON_BY_LABEL[label] || 'utility:event';
    }

    get gridStyle() {
        const cols = Math.max(1, Math.min(3, Number(this.cardColumns) || 2));
        return `--wp-card-cols:${cols}`;
    }

    get themeSwitcherButtons() {
        if (!this.showThemeSwitcher) return [];
        return QUICK_THEMES.map((name) => ({
            name,
            label: name.charAt(0).toUpperCase() + name.slice(1),
            class: `cockpit-theme-btn cockpit-tb-${name}` + (this._themeMode === name ? ' is-active' : '')
        }));
    }

    get addCardLabel() {
        return this.isPerson ? 'New Goal' : 'New Opportunity';
    }
    get addCardShortLabel() {
        // Compact label inside the small section-header button.
        return this.isPerson ? 'Goal' : 'Opportunity';
    }
    get addJourneyLabel() {
        return this.isPerson ? 'New Event' : 'New Milestone';
    }

    // ─── Popover state derivation ────────────────────────────────────────────
    get popoverVisible() {
        return Boolean(this._popover);
    }
    get popoverIsHover() {
        return this._popover && this._popover.kind === 'hover';
    }
    get popoverIsMenu() {
        return this._popover && this._popover.kind === 'menu';
    }
    get popoverClass() {
        return this._popover ? `popover popover-${this._popover.kind}` : 'popover';
    }
    get popoverRole() {
        return this._popover && this._popover.kind === 'menu' ? 'menu' : 'dialog';
    }
    get popoverStyle() {
        if (!this._popover) return '';
        const { x, y } = this._popover;
        return `left:${x}px;top:${y}px`;
    }
    get popoverEyebrow() {
        return this._popover ? this._popover.eyebrow : '';
    }
    get popoverTitle() {
        return this._popover ? this._popover.title : '';
    }
    get popoverFields() {
        return this._popover ? this._popover.fields || [] : [];
    }
    get popoverRecordUrl() {
        return this._popover ? this._popover.recordUrl : '';
    }
    get popoverMembers() {
        return this._popover ? this._popover.members || [] : [];
    }
    get popoverHasMembers() {
        const m = this._popover && this._popover.members;
        return Array.isArray(m) && m.length > 0;
    }
    get popoverSubtitle() {
        return this._popover ? this._popover.subtitle || '' : '';
    }

    // ─── Theme application ──────────────────────────────────────────────────
    scheduleApplyTheme() {
        this._themeScheduleToken += 1;
        const token = this._themeScheduleToken;
        Promise.resolve().then(() => {
            if (token !== this._themeScheduleToken) return;
            this.applyTheme();
        });
    }

    applyTheme() {
        const host = this.template?.host;
        const shell = this.template?.querySelector('.lwc-shell');
        const targets = [];
        if (host?.style) targets.push(host);
        if (shell?.style && shell !== host) targets.push(shell);
        if (!targets.length) return;

        const mode = (this._themeMode || 'default').toLowerCase();
        const accent = this.sanitizeHex(this.accentColor);
        const warning = this.sanitizeHex(this.warningColor);
        const negative = this.sanitizeHex(this.negativeColor);

        const key = [mode, accent || '', warning || '', negative || '', String(targets.length)].join('|');
        if (key === this._lastAppliedThemeKey) return;
        this._lastAppliedThemeKey = key;

        const tokens = THEMES[mode] || THEMES.default;
        const accentResolved = accent || '#b08a4a';
        const accentRgb =
            accentResolved.startsWith('#') && (accentResolved.length === 7 || accentResolved.length === 9)
                ? accentResolved.slice(0, 7)
                : null;

        targets.forEach((node) => {
            Object.entries(tokens).forEach(([prop, value]) => node.style.setProperty(prop, value));
            node.style.setProperty('--wp-accent', accentResolved);
            if (accentRgb) {
                node.style.setProperty('--wp-accent-bg', `${accentRgb}14`);
                node.style.setProperty('--wp-accent-border', `${accentRgb}40`);
                node.style.setProperty('--wp-accent-dim', `${accentRgb}99`);
            }
            if (warning) node.style.setProperty('--wp-warning', warning);
            if (negative) node.style.setProperty('--wp-negative', negative);
        });
    }

    sanitizeHex(value) {
        if (typeof value !== 'string') return '';
        const trimmed = value.trim();
        return HEX_PATTERN.test(trimmed) ? trimmed : '';
    }

    chipClassFor(variant) {
        const safe = typeof variant === 'string' && variant.length > 0 ? variant : 'neutral';
        return `chip ${safe}`;
    }

    // ─── Event handlers ─────────────────────────────────────────────────────
    handleThemeButton(event) {
        const next = event.currentTarget?.dataset?.theme;
        if (next && THEMES[next]) {
            this._themeMode = next;
            this.scheduleApplyTheme();
        }
    }

    handleHostClick(event) {
        // Click-outside dismissal for the action menu. Hover popovers are
        // dismissed by mouseleave in the timers below.
        if (this._popover && this._popover.kind === 'menu') {
            const insidePopover = event.target.closest && event.target.closest('.popover');
            const insideTrigger = event.target.closest && event.target.closest('.card-menu-btn');
            if (!insidePopover && !insideTrigger) {
                this.closePopover();
            }
        }
    }

    // Card title click: prefer NavigationMixin; allow modifier-keys to
    // honor the native <a href="..."> default-tab behavior.
    handleRecordLinkClick(event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) {
            return; // let the browser open in a new tab/window
        }
        event.preventDefault();
        const recordId = event.currentTarget?.dataset?.recordId;
        if (!recordId) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId, actionName: 'view' }
        });
    }

    handleJourneyClick(event) {
        // Click on a rail tile = navigate to record (unless click came from
        // inside a popover trigger which already handled it).
        const tile = event.currentTarget;
        const recordId = tile?.dataset?.recordId;
        if (!recordId) return;
        // Use objectApiName-less recordPage; Lightning resolves the type from Id.
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId, actionName: 'view' }
        });
    }

    handleJourneyHover(event) {
        const tile = event.currentTarget;
        const popoverId = tile?.dataset?.popoverId;
        const item = this.journeyItems.find((x) => x.key === popoverId);
        if (!item) return;

        const memberCount = Array.isArray(item.members) ? item.members.length : 0;
        const hasMembers = memberCount > 1;

        // For ungrouped (single-member) hovers, show the standard summary fields.
        // For grouped (x2/x3) hovers, render each member as its own row in
        // the popover so users can click through to the specific event.
        const payload = {
            kind: 'hover',
            recordId: item.recordId,
            recordUrl: item.recordUrl,
            eyebrow: this.isPerson ? 'Person Life Event' : 'Business Milestone',
            title: item.label
        };
        if (hasMembers) {
            payload.members = item.members.map((m) => ({
                recordId: m.recordId,
                recordUrl: m.recordUrl,
                name: m.name || item.label,
                dateText: m.eventDate ? this.formatShortDate(m.eventDate) : 'Undated'
            }));
            payload.subtitle = `${memberCount} events on this date`;
        } else {
            payload.fields = [
                { label: this.isPerson ? 'Event Type' : 'Milestone Type', value: item.label },
                { label: 'Date', value: item.dateText },
                { label: 'Status', value: item.completed ? 'Recorded' : 'Planned' }
            ];
        }
        this.scheduleHoverPopover(tile, payload);
    }

    handleCardHover(event) {
        const card = event.currentTarget;
        const popoverId = card?.dataset?.popoverId;
        const decorated = this.decoratedCards.find((x) => x.key === popoverId);
        if (!decorated) return;
        const isOpp = !this.isPerson;
        const fields = [
            ...(decorated.primaryAmountFmt
                ? [{ label: isOpp ? 'Amount' : 'Actual', value: decorated.primaryAmountFmt }]
                : []),
            ...(decorated.targetAmount != null
                ? [{ label: 'Target', value: this.formatUsd(decorated.targetAmount) }]
                : []),
            ...(decorated.chipLabel
                ? [{ label: isOpp ? 'Stage' : 'Status', value: decorated.chipLabel }]
                : []),
            ...(decorated.targetDate
                ? [{ label: isOpp ? 'Close Date' : 'Target Date', value: this.formatShortDate(decorated.targetDate) }]
                : [])
        ];
        this.scheduleHoverPopover(card, {
            kind: 'hover',
            recordId: decorated.recordId,
            recordUrl: decorated.recordUrl,
            eyebrow: isOpp ? 'Opportunity' : 'Financial Goal',
            title: decorated.name,
            fields
        });
    }

    handleCardMenuClick(event) {
        event.stopPropagation();
        const btn = event.currentTarget;
        const recordId = btn.dataset.recordId;
        const popoverId = btn.dataset.popoverId;
        const decorated = this.decoratedCards.find((x) => x.key === popoverId);
        if (!recordId || !decorated) return;
        // Toggle: if menu is already open for this record, close it.
        if (this._popover && this._popover.kind === 'menu' && this._popover.recordId === recordId) {
            this.closePopover();
            return;
        }
        this.clearHoverTimers();
        const rect = btn.getBoundingClientRect();
        const shellRect = this.template.querySelector('.lwc-shell')?.getBoundingClientRect();
        const x = (shellRect ? rect.left - shellRect.left : rect.left) + rect.width;
        const y = (shellRect ? rect.top - shellRect.top : rect.top) + rect.height + 4;
        this._popoverTrigger = btn;
        this._popover = {
            kind: 'menu',
            recordId,
            recordUrl: decorated.recordUrl,
            x,
            y
        };
    }

    handlePopoverEnter() {
        // Cancel pending leave timer so the popover stays put while hovered.
        if (this._hoverLeaveTimer) {
            clearTimeout(this._hoverLeaveTimer);
            this._hoverLeaveTimer = null;
        }
    }

    handlePopoverLeave() {
        // Don't dismiss menus on mouseleave — only hover-mode popovers.
        if (!this._popover || this._popover.kind !== 'hover') return;
        if (this._hoverLeaveTimer) clearTimeout(this._hoverLeaveTimer);
        this._hoverLeaveTimer = setTimeout(() => {
            this._popover = null;
            this._hoverLeaveTimer = null;
        }, POPOVER_LEAVE_DELAY_MS);
    }

    handlePopoverAction(event) {
        const action = event.currentTarget?.dataset?.popoverAction;
        const pop = this._popover;
        if (!pop || !action) return;
        switch (action) {
            case 'view':
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: { recordId: pop.recordId, actionName: 'view' }
                });
                break;
            case 'edit':
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: { recordId: pop.recordId, actionName: 'edit' }
                });
                break;
            case 'clone':
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: { recordId: pop.recordId, actionName: 'clone' }
                });
                break;
            case 'delete':
                // Standard delete UI lives on the record page. Send users there;
                // platform handles the confirm dialog + redirect.
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: { recordId: pop.recordId, actionName: 'view' }
                });
                break;
            case 'new':
                // From the hover popover header — open the create page for the
                // hovered record's object.
                this.openNewForObject(this.objectFromRecordUrl(pop.recordUrl));
                break;
            default:
                break;
        }
        this.closePopover();
    }

    // "+ New" buttons in section headers
    handleNewJourneyClick() {
        const which = this.isPerson ? 'person' : 'business';
        const obj = NEW_BUTTON_OBJECT[which][this.lifeEventBinding] || NEW_BUTTON_OBJECT[which].managed;
        this.openNewForObject(obj);
    }
    handleNewCardClick() {
        const obj = this.isPerson
            ? NEW_GOAL_OBJECT[this.goalBinding] || NEW_GOAL_OBJECT.standard
            : NEW_OPP_OBJECT;
        this.openNewForObject(obj);
    }

    openNewForObject(objectApiName) {
        if (!objectApiName) return;
        // Navigate to the standard "new" page for this object. The Account
        // recordId is NOT passed as a default — the user picks fields on the
        // create form. (defaultFieldValues works only for standard fields and
        // is touchy for managed-package custom objects.)
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName, actionName: 'new' }
        });
    }

    objectFromRecordUrl(url) {
        // url looks like '/lightning/r/<obj>/<id>/view'. Derive the object
        // API name by string-splitting; cheaper than an extra DTO field.
        if (typeof url !== 'string') return '';
        const m = url.match(/^\/lightning\/r\/([^/]+)\//);
        return m ? m[1] : '';
    }

    // ─── Popover scheduling ─────────────────────────────────────────────────
    scheduleHoverPopover(anchorEl, payload) {
        // Don't replace an open menu with a hover preview.
        if (this._popover && this._popover.kind === 'menu') return;
        this.clearHoverTimers();
        this._hoverEnterTimer = setTimeout(() => {
            const rect = anchorEl.getBoundingClientRect();
            const shellRect = this.template.querySelector('.lwc-shell')?.getBoundingClientRect();
            const x = (shellRect ? rect.left - shellRect.left : rect.left) + rect.width / 2;
            const y = (shellRect ? rect.top - shellRect.top : rect.top) + rect.height + 6;
            this._popover = { ...payload, anchor: anchorEl, x, y };
            this._hoverEnterTimer = null;
        }, POPOVER_HOVER_DELAY_MS);
    }

    closePopover() {
        this._popover = null;
        this._popoverTrigger = null;
        this.clearHoverTimers();
    }

    clearHoverTimers() {
        if (this._hoverEnterTimer) {
            clearTimeout(this._hoverEnterTimer);
            this._hoverEnterTimer = null;
        }
        if (this._hoverLeaveTimer) {
            clearTimeout(this._hoverLeaveTimer);
            this._hoverLeaveTimer = null;
        }
    }

    // ─── Formatting helpers ─────────────────────────────────────────────────
    formatUsd(amount) {
        if (amount == null) return '';
        const num = Number(amount);
        if (!Number.isFinite(num)) return '';
        return '$' + Math.round(num).toLocaleString('en-US');
    }

    formatShortDate(value) {
        if (!value) return '';
        const [y, m, d] = String(value).split('-').map((p) => parseInt(p, 10));
        if (!y || !m || !d) return '';
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}
