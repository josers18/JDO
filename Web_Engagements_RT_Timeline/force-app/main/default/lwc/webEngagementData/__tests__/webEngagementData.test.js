import { createElement } from 'lwc';
import WebEngagementData from 'c/webEngagementData';
import getWebEngagementData from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData';
import getCrmTimelineEvents from '@salesforce/apex/CrmTimelineController.getCrmTimelineEvents';

jest.mock('@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData', () => {
    return { default: jest.fn() };
}, { virtual: true });

jest.mock('@salesforce/apex/CrmTimelineController.getCrmTimelineEvents', () => {
    return { default: jest.fn() };
}, { virtual: true });

describe('c-web-engagement-data', () => {
    afterEach(() => {
        // Clean up any DOM created by previous tests.
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    /**
     * Builds the component with the given @api props, attaches to DOM,
     * and waits one microtask so LWC has a chance to render. Returns the
     * element so tests can query its shadow DOM.
     */
    async function buildElement(props = {}) {
        const el = createElement('c-web-engagement-data', { is: WebEngagementData });
        Object.assign(el, props);
        document.body.appendChild(el);
        // One microtask flushes initial render with the @api values applied.
        await Promise.resolve();
        return el;
    }

    describe('feedStyle (rendered as inline style on .engagement-feed)', () => {
        it('uses feedHeight in pixels when autoSize is off', async () => {
            const el = await buildElement({ feedHeight: 800, autoSize: false });
            const feed = el.shadowRoot.querySelector('.engagement-feed');
            expect(feed).not.toBeNull();
            expect(feed.style.maxHeight).toBe('800px');
            expect(feed.style.overflowY).toBe('auto');
        });

        it('falls back to default 600px when feedHeight not overridden and autoSize off', async () => {
            // No props passed — relies on the @api defaults declared in the JS class.
            const el = await buildElement({});
            const feed = el.shadowRoot.querySelector('.engagement-feed');
            expect(feed.style.maxHeight).toBe('600px');
            expect(feed.style.overflowY).toBe('auto');
        });

        it('uses 90vh when autoSize is on, ignoring feedHeight', async () => {
            const el = await buildElement({ feedHeight: 800, autoSize: true });
            const feed = el.shadowRoot.querySelector('.engagement-feed');
            expect(feed.style.maxHeight).toBe('90vh');
            expect(feed.style.overflowY).toBe('auto');
        });
    });

    describe('headerTitleIsLink (drives the lwc:if branch in the title slot)', () => {
        it('renders an <a> when cardTitleLink is set', async () => {
            const el = await buildElement({ cardTitleLink: 'https://example.com' });
            const anchor = el.shadowRoot.querySelector('h3[slot="title"] a');
            const span = el.shadowRoot.querySelector('h3[slot="title"] span');
            expect(anchor).not.toBeNull();
            expect(anchor.getAttribute('href')).toBe('https://example.com');
            expect(span).toBeNull();
        });

        it('renders a <span> when cardTitleLink is empty string', async () => {
            const el = await buildElement({ cardTitleLink: '' });
            const anchor = el.shadowRoot.querySelector('h3[slot="title"] a');
            const span = el.shadowRoot.querySelector('h3[slot="title"] span');
            expect(anchor).toBeNull();
            expect(span).not.toBeNull();
        });

        it('renders a <span> when cardTitleLink is not set (default empty string)', async () => {
            const el = await buildElement({});
            const anchor = el.shadowRoot.querySelector('h3[slot="title"] a');
            const span = el.shadowRoot.querySelector('h3[slot="title"] span');
            expect(anchor).toBeNull();
            expect(span).not.toBeNull();
        });
    });

    describe('chip bar (rendered via availableChips getter)', () => {
        beforeEach(() => {
            getWebEngagementData.mockClear();
            getCrmTimelineEvents.mockClear();
        });

        async function buildElementWithEvents(webEventsRaw = '[]', crmEvents = [], crmSettings = {}) {
            getWebEngagementData.mockResolvedValue(webEventsRaw);
            getCrmTimelineEvents.mockResolvedValue(crmEvents);

            const el = createElement('c-web-engagement-data', { is: WebEngagementData });
            el.recordId = '001000000000001AAA';
            // Enable CRM sources if crmEvents are provided
            if (crmEvents.length > 0) {
                el.showCases = crmSettings.showCases !== undefined ? crmSettings.showCases : true;
                el.showTasks = crmSettings.showTasks !== undefined ? crmSettings.showTasks : false;
                el.showEvents = crmSettings.showEvents !== undefined ? crmSettings.showEvents : false;
                el.showVoiceCalls = crmSettings.showVoiceCalls !== undefined ? crmSettings.showVoiceCalls : false;
            }
            document.body.appendChild(el);
            // Wait for connectedCallback + Apex calls + reactive re-render
            await flushPromises();
            return el;
        }

        async function flushPromises() {
            // Multiple microtask ticks to ensure:
            // 1. connectedCallback runs
            // 2. Apex mock promises resolve
            // 3. Component state updates
            // 4. Template re-renders
            // 5. Final DOM reflects the state
            return new Promise(resolve => setTimeout(resolve, 0));
        }

        const sample = (id, source, occurredAt, color) => ({
            id, source,
            sourceLabel: source[0].toUpperCase() + source.slice(1),
            iconName: 'standard:default',
            iconColor: color,
            occurredAt,
            title: id,
            subtitle: 'sub',
            recordUrl: null,
            details: []
        });

        it('renders an All chip plus one chip per source with events', async () => {
            const webEventsRaw = JSON.stringify({
                data: {
                    CumulusWeb_Engagements__dlm: [
                        {
                            eventId__c: 'w1',
                            dateTime__c: '2026-05-03T10:00:00Z',
                            webInteractions_pageTitle__c: 'Home Page',
                            deviceId__c: 'device1'
                        },
                        {
                            eventId__c: 'w2',
                            dateTime__c: '2026-05-02T10:00:00Z',
                            webInteractions_pageTitle__c: 'About Page',
                            deviceId__c: 'device2'
                        }
                    ]
                }
            });
            const crmEvents = [
                sample('c1', 'case', '2026-05-04T10:00:00Z', '#c23934')
            ];

            const el = await buildElementWithEvents(webEventsRaw, crmEvents);

            const chips = el.shadowRoot.querySelectorAll('.chip');
            expect(chips.length).toBe(3);
            const labels = [...chips].map(c => c.textContent.trim());
            expect(labels.some(l => l.startsWith('All'))).toBe(true);
            expect(labels.some(l => l.startsWith('Web'))).toBe(true);
            expect(labels.some(l => l.startsWith('Case'))).toBe(true);
        });

        it('does not render chips for sources with zero events', async () => {
            const webEventsRaw = JSON.stringify({ data: { CumulusWeb_Engagements__dlm: [] } });
            const crmEvents = [
                sample('c1', 'case', '2026-05-01T00:00:00Z', '#c23934')
            ];

            const el = await buildElementWithEvents(webEventsRaw, crmEvents);

            const chips = el.shadowRoot.querySelectorAll('.chip');
            const labels = [...chips].map(c => c.textContent.trim());
            expect(labels.some(l => l.startsWith('Task'))).toBe(false);
            expect(labels.some(l => l.startsWith('Event'))).toBe(false);
            expect(labels.some(l => l.startsWith('Voice'))).toBe(false);
        });

        it('renders day groups with the correct number of cards', async () => {
            const webEventsRaw = JSON.stringify({
                data: {
                    CumulusWeb_Engagements__dlm: [
                        {
                            eventId__c: 'w1',
                            dateTime__c: '2026-05-03T10:00:00Z',
                            webInteractions_pageTitle__c: 'Page 1',
                            deviceId__c: 'device1'
                        },
                        {
                            eventId__c: 'w2',
                            dateTime__c: '2026-05-02T10:00:00Z',
                            webInteractions_pageTitle__c: 'Page 2',
                            deviceId__c: 'device2'
                        },
                        {
                            eventId__c: 'w3',
                            dateTime__c: '2026-05-02T08:00:00Z',
                            webInteractions_pageTitle__c: 'Page 3',
                            deviceId__c: 'device3'
                        }
                    ]
                }
            });
            const crmEvents = [];

            const el = await buildElementWithEvents(webEventsRaw, crmEvents);

            const dayGroups = el.shadowRoot.querySelectorAll('.day-group');
            expect(dayGroups.length).toBe(2);
            const cards = el.shadowRoot.querySelectorAll('.stream-card');
            expect(cards.length).toBe(3);
        });

        it('inline left-rail color is set per event', async () => {
            const webEventsRaw = JSON.stringify({
                data: {
                    CumulusWeb_Engagements__dlm: [
                        {
                            eventId__c: 'w1',
                            dateTime__c: '2026-05-03T10:00:00Z',
                            webInteractions_pageTitle__c: 'Home',
                            deviceId__c: 'device1'
                        }
                    ]
                }
            });
            const crmEvents = [
                sample('c1', 'case', '2026-05-02T10:00:00Z', '#c23934')
            ];

            const el = await buildElementWithEvents(webEventsRaw, crmEvents);

            const cards = el.shadowRoot.querySelectorAll('.stream-card');
            expect(cards[0].style.borderLeftColor).not.toBe('');
            expect(cards[1].style.borderLeftColor).not.toBe('');
        });
    });
});
