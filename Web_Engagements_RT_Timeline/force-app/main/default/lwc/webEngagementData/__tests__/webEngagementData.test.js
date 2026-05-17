import { createElement } from 'lwc';
import WebEngagementData from 'c/webEngagementData';

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
});
