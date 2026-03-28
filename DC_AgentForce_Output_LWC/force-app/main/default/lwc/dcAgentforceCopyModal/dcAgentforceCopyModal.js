import { api } from 'lwc';
import LightningModal from 'lightning/modal';

export default class DcAgentforceCopyModal extends LightningModal {
    /** Modal title (use headerLabel in .open() — base class reserves `label`). */
    @api headerLabel = 'Copy text';
    @api bodyText = '';

    _didSelect = false;
    _lastSyncedBody = null;

    handleClose() {
        this.close('close');
    }

    connectedCallback() {
        this._didSelect = false;
        this._lastSyncedBody = null;
    }

    renderedCallback() {
        const ta = this.template.querySelector('[data-copy-fallback]');
        const text = this.bodyText == null ? '' : String(this.bodyText);
        if (ta) {
            if (this._lastSyncedBody !== text) {
                this._lastSyncedBody = text;
                ta.value = text;
                this._didSelect = false;
            }
        }
        if (!ta || !text.length || this._didSelect) {
            return;
        }
        this._didSelect = true;
        /* eslint-disable-next-line @lwc/lwc/no-async-operation */
        requestAnimationFrame(() => {
            try {
                ta.focus();
                ta.select();
                ta.setSelectionRange(0, text.length);
            } catch (ignore) {
                // selection may be blocked in some contexts
            }
        });
    }
}
