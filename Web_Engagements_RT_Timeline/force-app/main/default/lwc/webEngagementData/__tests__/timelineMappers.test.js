import { parseDataGraphResponse } from '../timelineMappers';

describe('parseDataGraphResponse', () => {
    it('returns empty array for empty input', () => {
        expect(parseDataGraphResponse('')).toEqual([]);
        expect(parseDataGraphResponse(null)).toEqual([]);
        expect(parseDataGraphResponse('[]')).toEqual([]);
    });

    it('returns empty array for unparseable JSON', () => {
        expect(parseDataGraphResponse('not-json{{')).toEqual([]);
    });

    it('parses direct-JSON shape with one engagement', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-1',
                    dateTime__c: '2026-05-01T10:00:00Z',
                    webInteractions_pageTitle__c: 'Pricing Page',
                    webInteractions_productType__c: 'Marketing',
                    deviceId__c: 'd-1',
                    eventType__c: 'page_view',
                    webInteractions_userId__c: 'u-1',
                    webInteractions_userEmail__c: 'a@b.com'
                }
            ]
        });

        const result = parseDataGraphResponse(input);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: 'evt-1',
            source: 'web',
            sourceLabel: 'Web',
            occurredAt: '2026-05-01T10:00:00Z',
            title: 'Pricing Page',
            subtitle: 'Visited Page',
            iconColor: '#7f56d9'
        });
    });

    it('parses wrapped-blob shape with HTML-entity-encoded inner JSON', () => {
        const innerBlobRaw = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-2',
                    dateTime__c: '2026-05-02T11:00:00Z',
                    webInteractions_pageTitle__c: 'Apply for Loan',
                    webInteractions_applicationStatus__c: 'submit_app',
                    webInteractions_productType__c: 'Loan',
                    webInteractions_requestedAmount__c: '25000'
                }
            ]
        });
        const escaped = innerBlobRaw.replace(/"/g, '&quot;');
        const outer = { data: [{ json_blob__c: escaped }] };

        const result = parseDataGraphResponse(JSON.stringify(outer));

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: 'evt-2',
            source: 'web',
            title: 'Apply for Loan - submit_app',
            subtitle: 'Application Submitted',
            iconName: 'standard:task2'
        });
        expect(result[0].details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ label: 'Requested Amount', value: '25000' })
            ])
        );
    });

    it('parses wrapped-blob shape with un-escaped inner JSON (already valid)', () => {
        const innerBlobRaw = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                { eventId__c: 'evt-clean', dateTime__c: '2026-05-02T11:00:00Z',
                  webInteractions_pageTitle__c: 'Clean' }
            ]
        });
        const outer = { data: [{ json_blob__c: innerBlobRaw }] };

        const result = parseDataGraphResponse(JSON.stringify(outer));

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('evt-clean');
    });

    it('overrides title to "Login - Home" when productType is "Your Dashboard"', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-3',
                    dateTime__c: '2026-05-03T09:00:00Z',
                    webInteractions_pageTitle__c: 'Account Overview',
                    webInteractions_productType__c: 'Your Dashboard'
                }
            ]
        });

        const result = parseDataGraphResponse(input);

        expect(result[0].title).toBe('Login - Home');
    });

    it('routes Contact Us pages to the Contact Request Form subtitle', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-4',
                    dateTime__c: '2026-05-04T12:00:00Z',
                    webInteractions_pageTitle__c: 'Reach Us',
                    webInteractions_productType__c: 'Contact Us — Mortgages',
                    webInteractions_contactName__c: 'Jane',
                    webInteractions_contactPhone__c: '555-1212',
                    webInteractions_contactRequestType__c: 'Callback'
                }
            ]
        });

        const result = parseDataGraphResponse(input);

        expect(result[0].subtitle).toBe('Contact Request Form');
        expect(result[0].iconName).toBe('custom:custom105');
        const labels = result[0].details.map(d => d.label);
        expect(labels).toEqual(
            expect.arrayContaining(['Contact Name', 'Contact Phone', 'Contact Request'])
        );
    });

    it('dedupes by id and sorts DESC by occurredAt', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                { eventId__c: 'a', dateTime__c: '2026-05-01T00:00:00Z', webInteractions_pageTitle__c: 'A' },
                { eventId__c: 'a', dateTime__c: '2026-05-01T00:00:00Z', webInteractions_pageTitle__c: 'A-dup' },
                { eventId__c: 'b', dateTime__c: '2026-05-03T00:00:00Z', webInteractions_pageTitle__c: 'B' },
                { eventId__c: 'c', dateTime__c: '2026-05-02T00:00:00Z', webInteractions_pageTitle__c: 'C' }
            ]
        });

        const result = parseDataGraphResponse(input);

        expect(result.map(r => r.id)).toEqual(['b', 'c', 'a']);
        expect(result).toHaveLength(3);
    });

    it('filters out null/undefined details', () => {
        const input = JSON.stringify({
            CumulusWeb_Engagements__dlm: [
                {
                    eventId__c: 'evt-clean',
                    dateTime__c: '2026-05-05T00:00:00Z',
                    webInteractions_pageTitle__c: 'Page',
                    deviceId__c: 'd-only',
                    eventType__c: null
                }
            ]
        });

        const result = parseDataGraphResponse(input);

        const labels = result[0].details.map(d => d.label);
        expect(labels).toEqual(['Device Id']);
    });
});
