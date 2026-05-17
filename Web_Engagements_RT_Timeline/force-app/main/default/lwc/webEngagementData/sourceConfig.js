/**
 * Source registry for the multi-source timeline.
 * Future sources (e.g., 'email') extend the SOURCE_CONFIG map and add to SOURCE_ORDER.
 */

export const SOURCE_CONFIG = {
    web:   { label: 'Web',   chipLabel: 'Web',   color: '#7f56d9', defaultIcon: 'custom:custom68' },
    case:  { label: 'Case',  chipLabel: 'Case',  color: '#c23934', defaultIcon: 'standard:case' },
    task:  { label: 'Task',  chipLabel: 'Task',  color: '#04844b', defaultIcon: 'standard:task' },
    event: { label: 'Event', chipLabel: 'Event', color: '#c97a00', defaultIcon: 'standard:event' },
    voice: { label: 'Voice', chipLabel: 'Voice', color: '#0176d3', defaultIcon: 'standard:live_chat' }
};

export const SOURCE_ORDER = ['web', 'case', 'task', 'event', 'voice'];
