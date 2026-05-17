import { LightningElement, api } from 'lwc';
import getWebEngagementData from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData';
import { parseDataGraphResponse } from './timelineMappers';

export default class WebEngagementData extends LightningElement {
    @api recordId;

    // App Builder properties — defaults match webEngagementData.js-meta.xml.
    @api dcDataGraphName = 'RT_Web_Engagementsv2';
    @api cardTitle = 'Real Time Engagements';
    @api cardTitleLink = '';
    @api feedHeight = 600;
    @api autoSize = false;
    webEvents = [];
    
    isLoading = false;
    hasError = false;
    errorMessage = '';

    connectedCallback() {
        this.handleRefresh();
    }

    handleRefresh() {
        this.isLoading = true;
        this.hasError = false;
        this.webEvents = [];

        getWebEngagementData({ accountId: this.recordId, dataGraphName: this.dcDataGraphName })
            .then(rawResponse => {
                this.webEvents = parseDataGraphResponse(rawResponse);
                this.isLoading = false;
            })
            .catch(error => {
                console.error('Error processing Data Graph:', error);
                this.hasError = true;
                this.errorMessage = 'Unable to load engagement data.';
                this.isLoading = false;
            });
    }

    handleToggle(event) {
        const itemId = event.currentTarget.dataset.id;

        this.webEvents = this.webEvents.map(item => {
            if (item.id === itemId) {
                const isExpanded = !item.expanded;
                return {
                    ...item,
                    expanded: isExpanded,
                    timelineClass: isExpanded
                        ? 'slds-timeline__item_expandable slds-timeline__item_task slds-is-open'
                        : 'slds-timeline__item_expandable slds-timeline__item_task'
                };
            }
            return item;
        });
    }

    get hasInteractions() {
        return this.webEvents.length > 0;
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
}