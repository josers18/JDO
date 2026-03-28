import { api } from 'lwc';
import LightningModal from 'lightning/modal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class DcAgentforceOutputModal extends LightningModal {
    @api modalTitle = '';
    @api outputText = '';
    /** text | html | markdown — matches parent effectiveOutputFormat. */
    @api effectiveFormat = 'text';
    @api renderedRichHtml = '';

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

    connectedCallback() {
        this._inlineCopySelected = false;
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
                // try fallbacks
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
        this.showInlineCopyFallback = false;
        this._inlineCopySelected = false;
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

    tryPrintWithBlobUrl(html) {
        let url;
        try {
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            url = URL.createObjectURL(blob);
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
            window.setTimeout(() => {
                try {
                    w.focus();
                    w.print();
                } catch (ignore) {
                    // ignore
                }
                window.setTimeout(cleanup, 120000);
            }, 300);
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

    handlePrint() {
        const title = this.modalTitle || 'Output';
        const body = this.outputText || '';
        if (!body) {
            return;
        }
        const html = this.buildPrintHtml(title, body, this.effectiveFormat, this.renderedRichHtml);
        if (this.tryPrintWithIframe(html)) {
            return;
        }
        if (this.tryPrintWithBlobUrl(html)) {
            return;
        }
    }
}
