import { LightningElement, api } from 'lwc';
import getWebEngagementData from '@salesforce/apex/DataCloudWebEngagementController.getWebEngagementData';

export default class WebEngagementData extends LightningElement {
    @api recordId;
    @api graphApiName;
    @api cardTitle;
    @api cardTitleLink;
    @api feedHeight;
    @api autoSize;
    webInteractions = [];
    
    isLoading = false;
    hasError = false;
    errorMessage = '';

    connectedCallback() {
        this.handleRefresh();
    }

    handleRefresh() {
        this.isLoading = true;
        this.hasError = false;
        this.webInteractions = [];

        getWebEngagementData({ accountId: this.recordId })
            .then(rawResponse => {
                console.log('Raw Response from Apex:', rawResponse);
                
                if (!rawResponse || rawResponse === '[]') {
                    console.warn('Empty response received.');
                    this.isLoading = false;
                    return;
                }

                try {
                    const parsedResponse = JSON.parse(rawResponse);
                    let graphData = null;

                    // 1. Check for Wrapped Blob (Common in Data Cloud REST API)
                    if (parsedResponse?.data?.[0]?.json_blob__c) {
                        console.log('Detected Wrapped Blob format.');
                        const innerBlob = parsedResponse.data[0].json_blob__c;
                        const unescapedJson = this.decodeHtml(innerBlob);
                        graphData = JSON.parse(unescapedJson);
                    } 
                    // 2. Fallback: Check if it is Direct JSON
                    // If it's not a blob, we assume the Apex returned the graph directly
                    else {
                        console.log('Detected Direct JSON format.');
                        graphData = parsedResponse;
                    }

                    if (graphData) {
                        console.log('Final Parsed Graph Data:', graphData);
                        this.processGraphData(graphData);
                    } else {
                        console.warn('Unknown JSON structure. Could not find Graph Root.');
                    }

                } catch (parseError) {
                    console.error('Parsing logic failed:', parseError);
                    throw parseError;
                }
                
                this.isLoading = false;
            })
            .catch(error => {
                console.error('Error processing Data Graph:', error);
                this.hasError = true;
                this.errorMessage = 'Unable to load engagement data.';
                this.isLoading = false;
            });
    }

    // UTILITY: Robust HTML decoding
    decodeHtml(html) {
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    processGraphData(rootData) {
        if (!rootData) return;

        let allEngagements = [];

        // RECURSIVE FUNCTION: "Search Everywhere" strategy
        const findAndProcessEngagements = (node) => {
            // Base case: Stop if node is null or not an object
            if (!node || typeof node !== 'object') return;

            // 1. Check for Engagements on the current node
            
            // A. CumulusWeb_Engagements DMO
            if (Array.isArray(node.CumulusWeb_Engagements__dlm)) {
                allEngagements.push(...node.CumulusWeb_Engagements__dlm.map(e => {
                    
                    // --- 1. Dynamic Title Logic ---
                    const baseTitle = e.webInteractions_pageTitle__c;
                    // Rule: "if webInteractions_applicationStatus__c is NOT NULL, then the title should be..."
                    let finalTitle = e.webInteractions_applicationStatus__c
                        ? `${baseTitle} - ${e.webInteractions_applicationStatus__c}`
                        : baseTitle;

                    // Rule: "if webInteractions_productType__c = 'Your Dashboard' then finalTitle is Login - Home"
                    if (e.webInteractions_productType__c === 'Your Dashboard') {
                        finalTitle = 'Login - Home';
                    }


                    // --- 2. Dynamic Subtitle Logic (Your new rules) ---
                    let finalSubtitle = 'Visited Page'; // Default
                    if (e.webInteractions_productType__c && e.webInteractions_productType__c.includes('Contact Us')) {
                        finalSubtitle = 'Contact Request Form';
                    } else if (e.webInteractions_pageTitle__c && e.webInteractions_pageTitle__c.includes('Apply')) {
                        finalSubtitle = 'Application';
                    }

                    // --- 3. Dynamic Icon Logic (Aligned with new subtitle) ---
                    let icon = 'custom:custom68'; // Default for 'Visited Page'
                    if (finalSubtitle === 'Contact Request Form') {
                        icon = 'custom:custom105';
                    } else if (finalSubtitle === 'Application') {
                        switch(e.webInteractions_applicationStatus__c) {
                            case 'submit_app':
                                icon = 'standard:task2'; // Success checkmark
                                finalSubtitle = 'Application Submitted';
                                break;
                            case 'save_draft':
                                icon = 'standard:record_update'; // Draft icon
                                finalSubtitle = 'Application Saved';
                                break;
                            case 'cancel_app':
                                icon = 'standard:cancel_checkout' // abandoned cart
                                finalSubtitle = 'Application Cancelled';
                                break;
                            default:
                                icon = 'standard:document'; // Generic app icon
                        }
                    }

                    // --- 4. Dynamic Details Logic ---
                    let details = [
                        { label: 'Device Id', value: e.deviceId__c },
                        { label: 'Event Type', value: e.eventType__c },
                        { label: 'User Id', value: e.webInteractions_userId__c },
                        { label: 'Contact Email', value: e.webInteractions_userEmail__c }
                    ];

                    // Rule: "show only when 'webInteractions_productType__c' includes 'Contact Us'"
                    if (e.webInteractions_productType__c && e.webInteractions_productType__c.includes('Contact Us')) {
                        details.push({ label: 'Contact Name', value: e.webInteractions_contactName__c });
                        details.push({ label: 'Contact Phone', value: e.webInteractions_contactPhone__c });
                        details.push({ label: 'Contact Request', value: e.webInteractions_contactRequestType__c });
                    }

                    // Rule: "show only when 'webInteractions_applicationStatus__c' is Not Null"
                    if (e.webInteractions_applicationStatus__c) {
                        details.push({ label: 'Requested Amount', value: e.webInteractions_requestedAmount__c });
                    }

                    // Filter out any details that are null or undefined for a clean UI
                    const finalDetails = details.filter(d => d.value !== null && d.value !== undefined);

                    // --- 5. Return the final object ---
                    return {
                        id: e.eventId__c,
                        type: e.webInteractions_productType__c, 
                        icon: icon,
                        date: e.dateTime__c,
                        title: finalTitle,
                        subtitle: finalSubtitle, // Use the new dynamic subtitle
                        expanded: false,
                        timelineClass: 'slds-timeline__item_expandable slds-timeline__item_task',
                        details: finalDetails // Use the filtered list
                    };
                }));
            }
            
            // --- B. Add other DMOs here if needed (e.g., ssot__ProductBrowseEngagement__dlm) ---


            // 2. Recurse into all children (objects or arrays)
            Object.values(node).forEach(child => {
                if (Array.isArray(child)) {
                    child.forEach(item => findAndProcessEngagements(item));
                } else if (child && typeof child === 'object') {
                    findAndProcessEngagements(child);
                }
            });
        };

        // Start the recursive search from the root
        findAndProcessEngagements(rootData);

        // 3. DEDUPLICATE (Safety Net)
        const uniqueMap = new Map();
        allEngagements.forEach(item => {
            if (item.id) uniqueMap.set(item.id, item);
        });
        const uniqueList = Array.from(uniqueMap.values());

        // 4. SORT
        this.webInteractions = uniqueList.sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
    }

    handleToggle(event) {
        const itemId = event.currentTarget.dataset.id;
        
        this.webInteractions = this.webInteractions.map(item => {
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
        return this.webInteractions.length > 0;
    }
}