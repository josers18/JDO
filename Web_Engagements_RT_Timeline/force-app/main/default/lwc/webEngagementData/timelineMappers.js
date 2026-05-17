/**
 * Pure functions for the multi-source timeline.
 *
 * All functions in this module accept inputs and return outputs without side
 * effects. They're testable in isolation via Jest with crafted inputs, no
 * LWC harness needed.
 */

import { SOURCE_CONFIG } from './sourceConfig';

/**
 * Decodes the 5 HTML entities that Data Cloud's wrapped-blob shape produces
 * when JSON is escaped inside JSON. Pure regex, no DOM touch — safer than
 * the textarea/innerHTML idiom and trivially testable in any Node env.
 *
 * Order matters: '&amp;' is replaced LAST so a double-encoded '&amp;quot;'
 * decodes to '"' across two passes (first pass yields '&quot;', second
 * pass yields '"'), not directly to '"'.
 */
function decodeEntities(html) {
    if (!html) return '';
    return String(html)
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g,  '<')
        .replace(/&gt;/g,  '>')
        .replace(/&amp;/g, '&');
}

export function parseDataGraphResponse(rawResponse) {
    if (!rawResponse || rawResponse === '[]') return [];

    let parsed;
    try {
        parsed = JSON.parse(rawResponse);
    } catch (e) {
        console.error('parseDataGraphResponse: invalid JSON', e);
        return [];
    }

    let graphData = null;
    if (parsed?.data?.[0]?.json_blob__c) {
        try {
            graphData = JSON.parse(decodeEntities(parsed.data[0].json_blob__c));
        } catch (e) {
            console.error('parseDataGraphResponse: failed to parse inner blob', e);
            return [];
        }
    } else {
        graphData = parsed;
    }

    if (!graphData) return [];

    const collected = [];
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node.CumulusWeb_Engagements__dlm)) {
            for (const e of node.CumulusWeb_Engagements__dlm) {
                collected.push(mapWebEngagement(e));
            }
        }
        for (const child of Object.values(node)) {
            if (Array.isArray(child)) {
                child.forEach(visit);
            } else if (child && typeof child === 'object') {
                visit(child);
            }
        }
    };
    visit(graphData);

    const byId = new Map();
    for (const evt of collected) {
        if (evt.id) byId.set(evt.id, evt);
    }
    return [...byId.values()].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
}

function mapWebEngagement(e) {
    const baseTitle = e.webInteractions_pageTitle__c;
    let title = e.webInteractions_applicationStatus__c
        ? `${baseTitle} - ${e.webInteractions_applicationStatus__c}`
        : baseTitle;
    if (e.webInteractions_productType__c === 'Your Dashboard') {
        title = 'Login - Home';
    }

    let subtitle = 'Visited Page';
    if (e.webInteractions_productType__c?.includes('Contact Us')) {
        subtitle = 'Contact Request Form';
    } else if (e.webInteractions_pageTitle__c?.includes('Apply')) {
        subtitle = 'Application';
    }

    let icon = SOURCE_CONFIG.web.defaultIcon;
    if (subtitle === 'Contact Request Form') {
        icon = 'custom:custom105';
    } else if (subtitle === 'Application') {
        switch (e.webInteractions_applicationStatus__c) {
            case 'submit_app':
                icon = 'standard:task2';
                subtitle = 'Application Submitted';
                break;
            case 'save_draft':
                icon = 'standard:record_update';
                subtitle = 'Application Saved';
                break;
            case 'cancel_app':
                icon = 'standard:cancel_checkout';
                subtitle = 'Application Cancelled';
                break;
            default:
                icon = 'standard:document';
        }
    }

    const details = [
        { label: 'Device Id', value: e.deviceId__c },
        { label: 'Event Type', value: e.eventType__c },
        { label: 'User Id', value: e.webInteractions_userId__c },
        { label: 'Contact Email', value: e.webInteractions_userEmail__c }
    ];
    if (e.webInteractions_productType__c?.includes('Contact Us')) {
        details.push({ label: 'Contact Name', value: e.webInteractions_contactName__c });
        details.push({ label: 'Contact Phone', value: e.webInteractions_contactPhone__c });
        details.push({ label: 'Contact Request', value: e.webInteractions_contactRequestType__c });
    }
    if (e.webInteractions_applicationStatus__c) {
        details.push({ label: 'Requested Amount', value: e.webInteractions_requestedAmount__c });
    }

    return {
        id: e.eventId__c,
        source: 'web',
        sourceLabel: SOURCE_CONFIG.web.label,
        iconName: icon,
        iconColor: SOURCE_CONFIG.web.color,
        occurredAt: e.dateTime__c,
        title,
        subtitle,
        recordUrl: null,
        details: details.filter(d => d.value !== null && d.value !== undefined)
    };
}
