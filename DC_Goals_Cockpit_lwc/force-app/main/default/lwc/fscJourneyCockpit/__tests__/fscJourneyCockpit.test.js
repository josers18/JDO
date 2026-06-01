import { createElement } from 'lwc';
import FscJourneyCockpit from 'c/fscJourneyCockpit';

// Mock the Apex method as a wire adapter (NOT a plain jest.fn). The component
// reads via @wire, so tests must drive emit/error through the adapter.
jest.mock(
    '@salesforce/apex/FscJourneyCockpitController.getCockpit',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/wire-service-jest-util');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

// Mock NavigationMixin so tests can verify navigation calls without
// loading the real Lightning runtime. The real module exports
// NavigationMixin as a function with a static .Navigate Symbol property
// — the component uses `this[NavigationMixin.Navigate](...)`.
const mockNavigate = jest.fn();
jest.mock(
    'lightning/navigation',
    () => {
        const NAVIGATE = Symbol('Navigate');
        const NavigationMixin = (Base) =>
            class extends Base {
                [NAVIGATE](...args) {
                    return mockNavigate(...args);
                }
            };
        NavigationMixin.Navigate = NAVIGATE;
        return { NavigationMixin };
    },
    { virtual: true }
);

import getCockpit from '@salesforce/apex/FscJourneyCockpitController.getCockpit';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PERSON_VIEW = {
    recordType: 'person',
    journeyLabel: 'Life Events',
    journey: [
        {
            recordId: 'a01life1',
            recordUrl: '/lightning/r/PersonLifeEvent/a01life1/view',
            label: 'Marriage',
            eventDate: '2018-04-09',
            completed: true,
            count: 1
        },
        {
            recordId: 'a01life2',
            recordUrl: '/lightning/r/PersonLifeEvent/a01life2/view',
            label: 'Graduation',
            eventDate: null,
            completed: false,
            count: 2
        }
    ],
    panelTitle: 'Goals',
    kpis: [
        { label: 'Goals', icon: 'target', value: '6', meta: '4 life events recorded' },
        { label: 'Avg funded', icon: 'gauge', value: '64%', meta: 'across all goals' },
        { label: 'Total tracked', icon: 'wallet', value: '$8M', meta: 'in goal balances' },
        { label: 'Next deadline', icon: 'calendar-clock', value: 'Jul 31, 2025', meta: "Rachel's Wedding Fund" }
    ],
    cards: [
        {
            recordId: '001a',
            recordUrl: '/lightning/r/FinancialGoal/001a/view',
            name: 'Estate Planning',
            icon: 'utility:document',
            primaryAmount: 1500000,
            targetAmount: 1500000,
            fundedPct: 100,
            progressPct: 100,
            ringPct: 100,
            ringVariant: 'full',
            chipLabel: 'Completed',
            chipVariant: 'green',
            footRight: 'Reached Nov 9, 2017'
        },
        {
            recordId: '001b',
            recordUrl: '/lightning/r/FinancialGoal/001b/view',
            name: "Rachel's Wedding Fund",
            icon: 'utility:diamond',
            primaryAmount: 85000,
            targetAmount: 120000,
            fundedPct: 70.83,
            progressPct: 70.83,
            ringPct: 70.83,
            ringVariant: 'gold',
            chipLabel: 'High',
            chipVariant: 'High',
            footRight: 'Target Jul 31, 2025'
        }
    ]
};

const BUSINESS_VIEW = {
    recordType: 'business',
    journeyLabel: 'Business Milestones',
    journey: [
        {
            recordId: 'b01ms1',
            recordUrl: '/lightning/r/BusinessMilestone/b01ms1/view',
            label: 'New CEO Named',
            eventDate: '2020-10-05',
            completed: true,
            count: 1
        }
    ],
    panelTitle: 'Opportunities',
    kpis: [
        { label: 'Open deals', icon: 'target', value: '5', meta: 'in active pipeline' },
        { label: 'Pipeline', icon: 'wallet', value: '$22.5M', meta: 'total opportunity value' },
        { label: 'Weighted', icon: 'gauge', value: '$15.2M', meta: 'probability-adjusted' },
        { label: 'Next close', icon: 'calendar-clock', value: 'Jun 20, 2026', meta: 'Working Capital Line' }
    ],
    cards: [
        {
            recordId: '006a',
            recordUrl: '/lightning/r/Opportunity/006a/view',
            name: 'Working Capital Line',
            icon: 'utility:money',
            primaryAmount: 3000000,
            targetAmount: null,
            fundedPct: null,
            progressPct: 90,
            ringPct: 90,
            ringVariant: 'blue',
            chipLabel: 'Closing',
            chipVariant: 'blue',
            footRight: 'Close Jun 20, 2026'
        }
    ]
};

const EMPTY_BUSINESS_VIEW = {
    recordType: 'business',
    journeyLabel: 'Business Milestones',
    journey: [],
    panelTitle: 'Opportunities',
    kpis: BUSINESS_VIEW.kpis,
    cards: []
};

// ─── Test harness ────────────────────────────────────────────────────────────

function buildElement(props = {}) {
    const el = createElement('c-fsc-journey-cockpit', { is: FscJourneyCockpit });
    Object.assign(el, { recordId: '001000000000001AAA' }, props);
    document.body.appendChild(el);
    return el;
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
});

// ─── Record-type branching ───────────────────────────────────────────────────

describe('c-fsc-journey-cockpit · record-type branching', () => {
    it('renders Goals title for a person account', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const panelHeadings = el.shadowRoot.querySelectorAll('section.rp h3');
        expect(panelHeadings.length).toBe(1);
        expect(panelHeadings[0].textContent).toContain('Goals');
    });

    it('renders Opportunities title for a business account', async () => {
        const el = buildElement();
        getCockpit.emit(BUSINESS_VIEW);
        await flush();
        const heading = el.shadowRoot.querySelector('section.rp h3');
        expect(heading.textContent).toContain('Opportunities');
    });

    it('exposes journey label from controller', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const railHeading = el.shadowRoot.querySelector('section.tl h3');
        expect(railHeading.textContent).toContain('Life Events');
    });
});

// ─── Card decoration ─────────────────────────────────────────────────────────

describe('c-fsc-journey-cockpit · card rendering', () => {
    it('shows ✓ for fully-funded goals', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const rings = el.shadowRoot.querySelectorAll('.ring .pc');
        const fullRing = Array.from(rings).find((r) => r.textContent.trim() === '✓');
        expect(fullRing).not.toBeUndefined();
    });

    it('clamps fundedPct above 100 to 100% / ✓ at render time', async () => {
        const overFunded = JSON.parse(JSON.stringify(PERSON_VIEW));
        overFunded.cards[1].fundedPct = 150;
        overFunded.cards[1].ringPct = 150;
        overFunded.cards[1].progressPct = 150;
        overFunded.cards[1].ringVariant = 'full';

        const el = buildElement();
        getCockpit.emit(overFunded);
        await flush();
        const tracks = el.shadowRoot.querySelectorAll('.track i');
        tracks.forEach((bar) => {
            const m = (bar.getAttribute('style') || '').match(/width:(\d+(?:\.\d+)?)%/);
            expect(m).not.toBeNull();
            expect(parseFloat(m[1])).toBeLessThanOrEqual(100);
        });
    });

    it('renders empty-opportunity state when business has no cards', async () => {
        const el = buildElement();
        getCockpit.emit(EMPTY_BUSINESS_VIEW);
        await flush();
        const empty = el.shadowRoot.querySelector('.state.empty');
        expect(empty).not.toBeNull();
        expect(empty.textContent).toMatch(/no open opportunities/i);
    });

    it('renders empty-goals state when person has no cards', async () => {
        const emptyPerson = JSON.parse(JSON.stringify(PERSON_VIEW));
        emptyPerson.cards = [];
        const el = buildElement();
        getCockpit.emit(emptyPerson);
        await flush();
        const empty = el.shadowRoot.querySelector('.state.empty');
        expect(empty).not.toBeNull();
        expect(empty.textContent).toMatch(/no financial goals/i);
    });

    it('passes Opportunity.Probability through as the progress bar width', async () => {
        const el = buildElement();
        getCockpit.emit(BUSINESS_VIEW);
        await flush();
        const bar = el.shadowRoot.querySelector('.track i');
        expect(bar.getAttribute('style')).toContain('width:90%');
    });
});

// ─── KPI strip ───────────────────────────────────────────────────────────────

describe('c-fsc-journey-cockpit · KPI strip', () => {
    it('renders 4 KPI tiles', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const tiles = el.shadowRoot.querySelectorAll('.kpis .kpi');
        expect(tiles.length).toBe(4);
    });

    it('translates Apex icon strings to SLDS utility names', async () => {
        const el = buildElement();
        getCockpit.emit(BUSINESS_VIEW);
        await flush();
        const icons = el.shadowRoot.querySelectorAll('.kpis .kpi lightning-icon');
        expect(icons[0].iconName).toBe('utility:target');
        expect(icons[1].iconName).toBe('utility:moneybag');
        expect(icons[2].iconName).toBe('utility:dial');
        expect(icons[3].iconName).toBe('utility:date_time');
    });
});

// ─── Horizontal journey rail (Image #1 visual) ──────────────────────────────

describe('c-fsc-journey-cockpit · journey rail', () => {
    it('marks past-dated items as step-done (no .pending class) and undated as pending', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const steps = el.shadowRoot.querySelectorAll('.step');
        const marriage = Array.from(steps).find((s) => s.textContent.includes('Marriage'));
        const graduation = Array.from(steps).find((s) => s.textContent.includes('Graduation'));
        expect(marriage.className).toBe('step');
        expect(graduation.className).toContain('pending');
    });

    it('renders count badge x2 on grouped events', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const cnt = el.shadowRoot.querySelector('.step .cnt');
        expect(cnt).not.toBeNull();
        expect(cnt.textContent.trim()).toBe('x2');
    });

    it('caps rail items by maxJourneyItems @api', async () => {
        const fat = JSON.parse(JSON.stringify(PERSON_VIEW));
        fat.journey = Array.from({ length: 30 }, (_, i) => ({
            recordId: `evt${i}`,
            recordUrl: `/lightning/r/PersonLifeEvent/evt${i}/view`,
            label: `Event ${i}`,
            eventDate: '2020-01-01',
            completed: true,
            count: 1
        }));
        const el = buildElement({ maxJourneyItems: 5 });
        getCockpit.emit(fat);
        await flush();
        const steps = el.shadowRoot.querySelectorAll('.step');
        expect(steps.length).toBe(5);
    });

    it('rail labels are clickable links with the controller-supplied recordUrl', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const links = el.shadowRoot.querySelectorAll('.step .step-link');
        expect(links.length).toBe(PERSON_VIEW.journey.length);
        expect(links[0].getAttribute('href')).toBe(PERSON_VIEW.journey[0].recordUrl);
    });
});

// ─── Wire pass-through (binding params) ─────────────────────────────────────

describe('c-fsc-journey-cockpit · @api wire params', () => {
    it('passes goalBinding and lifeEventBinding through to the wire config', async () => {
        buildElement({ goalBinding: 'standard', lifeEventBinding: 'standard' });
        await flush();
        const config = getCockpit.getLastConfig();
        expect(config).toEqual({
            recordId: '001000000000001AAA',
            goalBinding: 'standard',
            lifeEventBinding: 'standard'
        });
    });

    it('defaults both bindings to standard (matches FSC native components)', async () => {
        buildElement();
        await flush();
        const config = getCockpit.getLastConfig();
        expect(config).toEqual({
            recordId: '001000000000001AAA',
            goalBinding: 'standard',
            lifeEventBinding: 'standard'
        });
    });
});

// ─── Click-through links (Feature A) ─────────────────────────────────────────

describe('c-fsc-journey-cockpit · click-through links', () => {
    it('renders card titles as anchors with the controller-supplied recordUrl', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const links = el.shadowRoot.querySelectorAll('a.nm-link');
        expect(links.length).toBe(PERSON_VIEW.cards.length);
        expect(links[0].getAttribute('href')).toBe(PERSON_VIEW.cards[0].recordUrl);
    });

    it('plain card-title click navigates via NavigationMixin (preventDefault)', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const link = el.shadowRoot.querySelector('a.nm-link');
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(event);
        await flush();
        expect(event.defaultPrevented).toBe(true);
        expect(mockNavigate).toHaveBeenCalledWith({
            type: 'standard__recordPage',
            attributes: { recordId: PERSON_VIEW.cards[0].recordId, actionName: 'view' }
        });
    });

    it('cmd+click on card title lets the browser handle navigation (no preventDefault)', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const link = el.shadowRoot.querySelector('a.nm-link');
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            metaKey: true
        });
        link.dispatchEvent(event);
        await flush();
        expect(event.defaultPrevented).toBe(false);
        expect(mockNavigate).not.toHaveBeenCalled();
    });
});

// ─── Theme switcher ──────────────────────────────────────────────────────────

describe('c-fsc-journey-cockpit · theme switcher', () => {
    it('hides switcher buttons by default', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const row = el.shadowRoot.querySelector('.cockpit-theme-row');
        expect(row).toBeNull();
    });

    it('renders quick-switch buttons when showThemeSwitcher is true', async () => {
        const el = buildElement({ showThemeSwitcher: true });
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const buttons = el.shadowRoot.querySelectorAll('.cockpit-theme-btn');
        expect(buttons.length).toBe(4);
    });
});

// ─── "+ New" buttons (Feature C) ─────────────────────────────────────────────

describe('c-fsc-journey-cockpit · + New buttons', () => {
    it('renders an Add button in each section header', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const buttons = el.shadowRoot.querySelectorAll('.hdr-action');
        expect(buttons.length).toBe(2);
        // Buttons render compact labels in the header ("New" / "Goal" / "Opportunity").
        const titles = Array.from(buttons).map((b) => b.title);
        expect(titles).toEqual(['New Event', 'New Goal']);
    });

    it('Add Goal button (person, default standard binding) navigates to FinancialGoal new', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const newGoalBtn = Array.from(el.shadowRoot.querySelectorAll('.hdr-action')).find(
            (b) => b.title === 'New Goal'
        );
        newGoalBtn.click();
        await flush();
        expect(mockNavigate).toHaveBeenCalledWith({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'FinancialGoal', actionName: 'new' }
        });
    });

    it('Add Event button on managed lifeEventBinding routes to FinServ__LifeEvent__c', async () => {
        const el = buildElement({ lifeEventBinding: 'managed' });
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const newEvtBtn = Array.from(el.shadowRoot.querySelectorAll('.hdr-action')).find(
            (b) => b.title === 'New Event'
        );
        newEvtBtn.click();
        await flush();
        expect(mockNavigate).toHaveBeenCalledWith({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'FinServ__LifeEvent__c', actionName: 'new' }
        });
    });

    it('Business panel Add buttons read New Milestone / New Opportunity', async () => {
        const el = buildElement();
        getCockpit.emit(BUSINESS_VIEW);
        await flush();
        const titles = Array.from(el.shadowRoot.querySelectorAll('.hdr-action')).map((b) => b.title);
        expect(titles).toEqual(['New Milestone', 'New Opportunity']);
    });
});

// ─── Per-card action menu (Feature D) ────────────────────────────────────────

describe('c-fsc-journey-cockpit · card action menu', () => {
    it('renders a chevron button on each card', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const buttons = el.shadowRoot.querySelectorAll('.card-menu-btn');
        expect(buttons.length).toBe(PERSON_VIEW.cards.length);
    });

    it('clicking the chevron opens a popover with View/Edit/Clone/Delete', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        const btn = el.shadowRoot.querySelector('.card-menu-btn');
        btn.click();
        await flush();
        const popover = el.shadowRoot.querySelector('.popover.popover-menu');
        expect(popover).not.toBeNull();
        const menuItems = popover.querySelectorAll('.menu button');
        const labels = Array.from(menuItems).map((m) => m.textContent.trim());
        expect(labels).toEqual(['View', 'Edit', 'Clone', 'Delete']);
    });

    it('clicking Edit triggers NavigationMixin with actionName=edit', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        el.shadowRoot.querySelector('.card-menu-btn').click();
        await flush();
        const editBtn = Array.from(el.shadowRoot.querySelectorAll('.popover .menu button')).find(
            (b) => b.textContent.trim() === 'Edit'
        );
        editBtn.click();
        await flush();
        expect(mockNavigate).toHaveBeenCalledWith({
            type: 'standard__recordPage',
            attributes: { recordId: PERSON_VIEW.cards[0].recordId, actionName: 'edit' }
        });
    });

    it('Esc key closes an open popover', async () => {
        const el = buildElement();
        getCockpit.emit(PERSON_VIEW);
        await flush();
        el.shadowRoot.querySelector('.card-menu-btn').click();
        await flush();
        expect(el.shadowRoot.querySelector('.popover.popover-menu')).not.toBeNull();

        // Dispatch Esc on window (matches the addEventListener in connectedCallback)
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
        await flush();
        expect(el.shadowRoot.querySelector('.popover.popover-menu')).toBeNull();
    });
});

// ─── Error path ──────────────────────────────────────────────────────────────

describe('c-fsc-journey-cockpit · error rendering', () => {
    it('shows the error message when the wire rejects', async () => {
        const el = buildElement();
        getCockpit.error({ message: 'Boom — controller exploded.' }, 500, 'Server Error');
        await flush();
        const err = el.shadowRoot.querySelector('.state.error');
        expect(err).not.toBeNull();
        expect(err.textContent).toContain('Boom');
    });
});
