import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadScript } from 'lightning/platformResourceLoader';
import runPromptFlow from '@salesforce/apex/DcAgentforceOutputController.runPromptFlow';
import submitGenerationFeedback from '@salesforce/apex/DcAgentforceOutputController.submitGenerationFeedback';
import markedUrl from '@salesforce/resourceUrl/marked';
import DcAgentforceOutputModal from 'c/dcAgentforceOutputModal';
import DcAgentforceCopyModal from 'c/dcAgentforceCopyModal';

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

    connectedCallback() {
        if (this.autoExecuteOnLoad && this.resolvedFlowApiName) {
            /* eslint-disable-next-line @lwc/lwc/no-async-operation */
            setTimeout(() => {
                this.handleExecute();
            }, 0);
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
        return this.detectFormat(this.outputText || '');
    }

    get showPlainOutput() {
        return this.effectiveOutputFormat === 'text';
    }

    get showRichOutput() {
        const f = this.effectiveOutputFormat;
        return f === 'html' || f === 'markdown';
    }

    detectFormat(raw) {
        const s = (raw || '').trim();
        if (!s) {
            return 'text';
        }
        if (this.looksLikeHtml(s)) {
            return 'html';
        }
        if (this.looksLikeMarkdown(s)) {
            return 'markdown';
        }
        return 'text';
    }

    looksLikeHtml(s) {
        if (!s.startsWith('<')) {
            return false;
        }
        return (
            /^[\s]*<([a-zA-Z][a-zA-Z0-9]*)[\s>\/]/.test(s) ||
            /^[\s]*<\/[a-zA-Z]/.test(s) ||
            /^[\s]*<!--/.test(s) ||
            (s.includes('</') && s.includes('>'))
        );
    }

    looksLikeMarkdown(s) {
        if (this.looksLikeHtml(s)) {
            return false;
        }
        const lines = s.split(/\r?\n/);
        const firstNonEmpty = (lines.find((l) => l.trim()) || '').trim();
        if (/^#{1,6}\s/.test(firstNonEmpty)) {
            return true;
        }
        if (/^```/.test(s.trim())) {
            return true;
        }
        if (/^\s*([-*+]|\d+\.)\s+\S/.test(firstNonEmpty)) {
            return true;
        }
        if (/\*\*[^*\n]+\*\*/.test(s)) {
            return true;
        }
        return false;
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
            this.renderedRichHtml = raw;
            return;
        }
        if (fmt === 'markdown') {
            try {
                await this.ensureMarked();
                this.renderedRichHtml =
                    typeof window.marked !== 'undefined' && typeof window.marked.parse === 'function'
                        ? window.marked.parse(raw, { breaks: true, headerIds: false, mangle: false })
                        : '';
            } catch (ignore) {
                this.renderedRichHtml = '<p>Could not load markdown renderer.</p>';
            }
            return;
        }
        this.renderedRichHtml = '';
    }

    get feedbackDisabled() {
        return !this.lastGenerationId || this.loading;
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

    escapeForHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    buildPrintHtml(title, body, effectiveFormat, richHtml) {
        const t = this.escapeForHtml(title);
        const fmt = effectiveFormat || 'text';
        const rich = richHtml || '';
        let bodyBlock;
        if (fmt === 'text') {
            bodyBlock = '<pre>' + this.escapeForHtml(body) + '</pre>';
        } else {
            bodyBlock = '<div class="rich">' + rich + '</div>';
        }
        return (
            '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>' +
            t +
            '</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:24px;line-height:1.5;}h1{font-size:18px;margin-bottom:16px;}pre{white-space:pre-wrap;word-break:break-word;font-size:14px;}.rich{font-size:14px;line-height:1.55;}</style></head><body><h1>' +
            t +
            '</h1>' +
            bodyBlock +
            '</body></html>'
        );
    }

    openCopyFallbackModal(text, headerLabel) {
        DcAgentforceCopyModal.open({
            headerLabel: headerLabel || 'Copy text',
            bodyText: text == null ? '' : String(text),
            size: 'large'
        });
    }

    copyWithTemplateTextarea(value) {
        const ta = this.refs.copyBuffer;
        if (!ta) {
            return false;
        }
        try {
            ta.removeAttribute('readonly');
            ta.value = value;
            ta.focus();
            ta.select();
            if (value.length > 0) {
                ta.setSelectionRange(0, value.length);
            }
            const ok = document.execCommand('copy');
            ta.value = '';
            ta.setAttribute('readonly', '');
            return !!ok;
        } catch (ignore) {
            try {
                ta.value = '';
                ta.setAttribute('readonly', '');
            } catch (e2) {
                // ignore
            }
            return false;
        }
    }

    /**
     * Clipboard API is often blocked in Lightning; use a declared textarea + execCommand before a dynamic node.
     */
    async writeClipboard(text) {
        const value = text == null ? '' : String(text);
        if (value.length === 0) {
            throw new Error('Nothing to copy');
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(value);
                return;
            } catch (ignore) {
                // Lightning / iframe policies — try fallback
            }
        }
        if (this.copyWithTemplateTextarea(value)) {
            return;
        }
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
        this.template.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, value.length);
        const ok = document.execCommand('copy');
        this.template.removeChild(ta);
        if (!ok) {
            throw new Error('Copy command was rejected');
        }
    }

    async handleCopy() {
        const text = this.outputText || '';
        if (!text) {
            return;
        }
        try {
            await this.writeClipboard(text);
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

    handlePrintPdf() {
        const title = this.resolvedTitle;
        const body = this.outputText || '';
        if (!body) {
            return;
        }
        const html = this.buildPrintHtml(title, body, this.effectiveOutputFormat, this.renderedRichHtml);
        // Prefer iframe first — no pop-up; works more reliably in Lightning than about:blank + document.write.
        if (this.tryPrintWithIframe(html)) {
            return;
        }
        if (this.tryPrintWithBlobUrl(html)) {
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

    tryPrintWithBlobUrl(html) {
        let url;
        try {
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            url = URL.createObjectURL(blob);
            // Do not use noopener — it prevents a usable reference to call print() in some browsers.
            const w = window.open(url, '_blank');
            if (!w) {
                URL.revokeObjectURL(url);
                return false;
            }
            const cleanup = () => {
                try {
                    URL.revokeObjectURL(url);
                } catch (ignore) {
                    // ignore
                }
            };
            const runPrint = () => {
                try {
                    w.focus();
                    w.print();
                } catch (ignore) {
                    // ignore
                }
                window.setTimeout(cleanup, 120000);
            };
            window.setTimeout(runPrint, 300);
            return true;
        } catch (ignore) {
            if (url) {
                try {
                    URL.revokeObjectURL(url);
                } catch (e2) {
                    // ignore
                }
            }
            return false;
        }
    }

    tryPrintWithIframe(html) {
        const iframe = this.template.querySelector('[data-print-frame]');
        if (!iframe || !iframe.contentWindow) {
            return false;
        }
        try {
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            return true;
        } catch (ignore) {
            return false;
        }
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
        }
    }

}
