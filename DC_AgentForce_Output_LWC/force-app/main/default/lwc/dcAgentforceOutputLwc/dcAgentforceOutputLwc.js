import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadScript } from 'lightning/platformResourceLoader';
import runPromptFlow from '@salesforce/apex/DcAgentforceOutputController.runPromptFlow';
import submitGenerationFeedback from '@salesforce/apex/DcAgentforceOutputController.submitGenerationFeedback';
import markedUrl from '@salesforce/resourceUrl/marked';
import DcAgentforceOutputModal from 'c/dcAgentforceOutputModal';
import DcAgentforceCopyModal from 'c/dcAgentforceCopyModal';
import {
    writeClipboard,
    buildPrintHtml,
    tryPrintWithIframe,
    tryPrintWithBlobUrl,
    sanitizeRichHtml
} from 'c/dcAgentforceClipboardPrint';
import { detectFormat } from 'c/dcAgentforceFormatDetect';

export default class DcAgentforceOutputLwc extends LightningElement {
    @api cardTitle = 'Generative output';

    /** SLDS icon for header and branding (e.g. utility:agent_astro). */
    @api headerIconName = 'utility:agent_astro';

    /** Title text color as #RGB or #RRGGBB. */
    @api titleColorHex = '#032d60';

    /** Autolaunched Flow API name (e.g. DC_Agentforce_Output_Prompt). */
    @api flowApiName = '';
    /** Flow Record (single) input API name (default recordID). */
    @api recordIdVariableName = 'recordID';
    /** Flow Text output to display. */
    @api promptResponseVariableName = 'promptResponse';

    /**
     * Optional Flow Text output variable holding the Models API generation Id (from your Gen AI / prompt step).
     * Required for thumbs feedback. Leave blank if the flow does not expose it.
     */
    @api generationIdVariableName = '';

    /** When not false, loads the page record and passes it into the flow under recordIdVariableName. */
    @api passRecordIdToFlow;

    @api recordId;

    @api autoExecuteOnLoad = false;
    @api heightMode = 'medium';

    /**
     * How to render the flow Text output: auto (detect), text (plain), html (sanitized rich text), markdown.
     */
    @api outputFormat = 'auto';

    loading = false;
    errorMessage = '';
    outputText = '';
    /** HTML passed to lightning-formatted-rich-text when format is html or markdown. */
    renderedRichHtml = '';
    lastGenerationId = null;
    userSentiment = null;
    _markedLoadPromise = null;
    _feedbackInFlight = false;

    connectedCallback() {
        if (this.autoExecuteOnLoad && this.resolvedFlowApiName) {
            this.handleExecute();
        }
    }

    get resolvedFlowApiName() {
        return (this.flowApiName || '').trim();
    }

    get effectivePassRecordId() {
        return this.passRecordIdToFlow !== false;
    }

    normalizedHeightMode(mode) {
        const m = (mode || 'medium').toLowerCase();
        const allowed = ['auto', 'compact', 'medium', 'tall'];
        return allowed.includes(m) ? m : 'medium';
    }

    get resolvedTitle() {
        return this.cardTitle || 'Generative output';
    }

    get resolvedHeaderIconName() {
        const raw = (this.headerIconName || '').trim();
        if (/^[A-Za-z]+:[A-Za-z0-9_]+$/.test(raw)) {
            return raw;
        }
        return 'utility:agent_astro';
    }

    /** Validated hex for title; used via CSS variable (more reliable than h2 style object in LEX). */
    get resolvedTitleColorHex() {
        const raw = (this.titleColorHex || '').trim();
        if (
            /^#[0-9A-Fa-f]{3}$/.test(raw) ||
            /^#[0-9A-Fa-f]{6}$/.test(raw) ||
            /^#[0-9A-Fa-f]{8}$/.test(raw)
        ) {
            return raw;
        }
        return '#032d60';
    }

    get shellStyleString() {
        return '--dc-output-title-color: ' + this.resolvedTitleColorHex + ';';
    }

    get outputHeightClass() {
        return `output-body output-body--${this.normalizedHeightMode(this.heightMode)}`;
    }

    get hasOutput() {
        return (this.outputText || '').length > 0;
    }

    get effectiveOutputFormat() {
        const mode = (this.outputFormat || 'auto').toLowerCase().trim();
        const allowed = ['auto', 'text', 'html', 'markdown'];
        const m = allowed.includes(mode) ? mode : 'auto';
        if (m !== 'auto') {
            return m;
        }
        return detectFormat(this.outputText || '');
    }

    get showPlainOutput() {
        return this.effectiveOutputFormat === 'text';
    }

    get showRichOutput() {
        const f = this.effectiveOutputFormat;
        return f === 'html' || f === 'markdown';
    }

    ensureMarked() {
        if (typeof window !== 'undefined' && typeof window.marked !== 'undefined') {
            return Promise.resolve();
        }
        if (!this._markedLoadPromise) {
            this._markedLoadPromise = loadScript(this, markedUrl).catch((e) => {
                this._markedLoadPromise = null;
                return Promise.reject(e);
            });
        }
        return this._markedLoadPromise;
    }

    async refreshRenderedOutput() {
        const raw = this.outputText || '';
        const fmt = this.effectiveOutputFormat;
        if (!raw) {
            this.renderedRichHtml = '';
            return;
        }
        if (fmt === 'html') {
            // Sanitize at the source so display, print, and modal expansion all
            // inherit a safe payload — lightning-formatted-rich-text filters at
            // display time, but the print path (iframe srcdoc) bypasses it.
            this.renderedRichHtml = sanitizeRichHtml(raw);
            return;
        }
        if (fmt === 'markdown') {
            try {
                await this.ensureMarked();
                const parsed =
                    typeof window.marked !== 'undefined' && typeof window.marked.parse === 'function'
                        ? window.marked.parse(raw, { breaks: true, headerIds: false, mangle: false })
                        : '';
                // marked has no built-in sanitizer; allowlist-strip before storing.
                // Display via lightning-formatted-rich-text + print via iframe srcdoc
                // both consume this string, and only the former filters at render time.
                this.renderedRichHtml = sanitizeRichHtml(parsed);
            } catch (ignore) {
                this.renderedRichHtml = '<p>Could not load markdown renderer.</p>';
            }
            return;
        }
        this.renderedRichHtml = '';
    }

    get feedbackDisabled() {
        return !this.lastGenerationId || this.loading || this._feedbackInFlight;
    }

    get thumbsUpVariant() {
        return this.userSentiment === 'up' ? 'brand' : 'border-filled';
    }

    get thumbsDownVariant() {
        return this.userSentiment === 'down' ? 'brand' : 'border-filled';
    }

    get feedbackTitle() {
        if (this.lastGenerationId) {
            return 'Submit feedback for this generation';
        }
        if ((this.generationIdVariableName || '').trim()) {
            return 'Flow did not return a generation Id in the configured variable — check the flow assignment.';
        }
        return 'Set Flow output: generation Id variable in App Builder (Models API id) to enable thumbs feedback.';
    }

    reduceError(error) {
        if (error?.body?.message) {
            return error.body.message;
        }
        return error?.message || 'Unknown error';
    }

    async handleExecute() {
        const flowName = this.resolvedFlowApiName;
        if (!flowName) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Configuration required',
                    message: 'Set Autolaunched Flow API name on the component (e.g. DC_Agentforce_Output_Prompt).',
                    variant: 'warning'
                })
            );
            return;
        }

        this.loading = true;
        this.errorMessage = '';
        this.userSentiment = null;
        try {
            const rid = this.recordId || null;
            const result = await runPromptFlow({
                flowApiName: flowName,
                recordId: rid,
                recordIdVariableName: this.recordIdVariableName,
                promptResponseVariableName: this.promptResponseVariableName,
                passRecordId: this.effectivePassRecordId,
                generationIdVariableName: (this.generationIdVariableName || '').trim() || null
            });
            this.outputText = result?.text || '';
            this.lastGenerationId = result?.generationId || null;
            await this.refreshRenderedOutput();
        } catch (e) {
            this.outputText = '';
            this.renderedRichHtml = '';
            this.lastGenerationId = null;
            this.errorMessage = this.reduceError(e);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Flow run failed',
                    message: this.errorMessage,
                    variant: 'error',
                    mode: 'sticky'
                })
            );
        } finally {
            this.loading = false;
        }
    }

    openCopyFallbackModal(text, headerLabel) {
        DcAgentforceCopyModal.open({
            headerLabel: headerLabel || 'Copy text',
            bodyText: text == null ? '' : String(text),
            size: 'large'
        });
    }

    async handleCopy() {
        const text = this.outputText || '';
        if (!text) {
            return;
        }
        try {
            await writeClipboard(this.template, this.refs.copyBuffer, text);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Copied',
                    message: 'Output copied to clipboard.',
                    variant: 'success'
                })
            );
        } catch (ignore) {
            this.openCopyFallbackModal(text, 'Copy output');
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Copy manually',
                    message: 'A dialog opened with the full text. Press Ctrl+C or Cmd+C to copy.',
                    variant: 'info',
                    mode: 'dismissable'
                })
            );
        }
    }

    async handlePrintPdf() {
        const title = this.resolvedTitle;
        const body = this.outputText || '';
        if (!body) {
            return;
        }
        const html = buildPrintHtml(title, body, this.effectiveOutputFormat, this.renderedRichHtml);
        // Prefer iframe first — no pop-up; works more reliably in Lightning than a popup window.
        if (await tryPrintWithIframe(this.template, html)) {
            return;
        }
        if (tryPrintWithBlobUrl(html)) {
            return;
        }
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Print unavailable',
                message: 'Allow pop-ups for this site, or use Expand and try Print again.',
                variant: 'warning'
            })
        );
    }

    handleExpand() {
        if (!this.hasOutput) {
            return;
        }
        DcAgentforceOutputModal.open({
            size: 'large',
            modalTitle: this.resolvedTitle,
            outputText: this.outputText,
            effectiveFormat: this.effectiveOutputFormat,
            renderedRichHtml: this.renderedRichHtml || ''
        });
    }

    handleThumbsUp() {
        this.submitThumbsFeedback(true);
    }

    handleThumbsDown() {
        this.submitThumbsFeedback(false);
    }

    async submitThumbsFeedback(up) {
        if (this.feedbackDisabled) {
            return;
        }
        this._feedbackInFlight = true;
        try {
            await submitGenerationFeedback({
                generationId: this.lastGenerationId,
                thumbsUp: up === true,
                feedbackText: ''
            });
            this.userSentiment = up ? 'up' : 'down';
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Feedback sent',
                    message: 'Thank you for your feedback.',
                    variant: 'success'
                })
            );
        } catch (e) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Feedback failed',
                    message: this.reduceError(e),
                    variant: 'error'
                })
            );
        } finally {
            this._feedbackInFlight = false;
        }
    }

}
