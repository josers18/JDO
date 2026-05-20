import { api } from 'lwc';
import LightningModal from 'lightning/modal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import {
    writeClipboard,
    buildPrintHtml,
    tryPrintWithIframe,
    tryPrintWithBlobUrl
} from 'c/dcAgentforceClipboardPrint';

export default class DcAgentforceOutputModal extends LightningModal {
    @api modalTitle = '';
    @api outputText = '';
    /** text | html | markdown — matches parent effectiveOutputFormat. */
    @api effectiveFormat = 'text';
    @api renderedRichHtml = '';

    // LightningModal.open() instantiates a fresh component each call, so class-field
    // initializers below are the per-open initial state — no connectedCallback reset needed.
    showInlineCopyFallback = false;
    inlineCopyText = '';
    _inlineCopySelected = false;

    get showPlainOutput() {
        return (this.effectiveFormat || 'text') === 'text';
    }

    get showRichOutput() {
        const f = this.effectiveFormat || 'text';
        return f === 'html' || f === 'markdown';
    }

    renderedCallback() {
        if (!this.showInlineCopyFallback) {
            return;
        }
        const ta = this.refs.inlineCopyFallback;
        if (!ta) {
            return;
        }
        const v = this.inlineCopyText || '';
        if (ta.value !== v) {
            ta.value = v;
            this._inlineCopySelected = false;
        }
        if (!this._inlineCopySelected && v.length > 0) {
            this._inlineCopySelected = true;
            /* eslint-disable-next-line @lwc/lwc/no-async-operation */
            requestAnimationFrame(() => {
                try {
                    ta.focus();
                    ta.select();
                    ta.setSelectionRange(0, v.length);
                } catch (ignore) {
                    // ignore
                }
            });
        }
    }

    handleClose() {
        this.close('close');
    }

    async handleCopy() {
        const text = this.outputText || '';
        if (!text) {
            return;
        }
        this.showInlineCopyFallback = false;
        this._inlineCopySelected = false;
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
            this.inlineCopyText = text;
            this.showInlineCopyFallback = true;
            this._inlineCopySelected = false;
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Copy manually',
                    message: 'Select the text below and press Ctrl+C or Cmd+C.',
                    variant: 'info',
                    mode: 'dismissable'
                })
            );
        }
    }

    async handlePrint() {
        const title = this.modalTitle || 'Output';
        const body = this.outputText || '';
        if (!body) {
            return;
        }
        const html = buildPrintHtml(title, body, this.effectiveFormat, this.renderedRichHtml);
        if (await tryPrintWithIframe(this.template, html)) {
            return;
        }
        if (tryPrintWithBlobUrl(html)) {
            return;
        }
    }
}
