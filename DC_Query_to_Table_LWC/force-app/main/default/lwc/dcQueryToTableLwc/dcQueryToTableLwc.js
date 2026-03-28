import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import runDataCloudSql from '@salesforce/apex/DcQueryToTableController.runDataCloudSql';

export default class DcQueryToTableLwc extends LightningElement {
    @api cardTitle = 'Data Cloud SQL';
    /** Set in App Builder only; not shown on the page. */
    @api defaultSql = 'SELECT * FROM "ssot__Individual__dlm" LIMIT 10';
    /** Initial state of the on-page “run when page loads” checkbox. */
    @api autoRunOnLoad = false;
    @api maxRows = 500;
    @api defaultColumnWrap = false;
    @api defaultColumnWidth;

    /** lightning-datatable / SLDS-style table options (read-only / base table) */
    @api showRowSelectionColumn = false;
    @api showRowNumberColumn = false;
    @api columnWidthsMode = 'auto';
    @api minColumnWidth = 120;
    @api resizeColumnDisabled = false;
    @api wrapTableHeader = false;
    @api wrapTextMaxLines = 3;
    @api suppressBottomBar = false;

    @track runOnLoad = false;
    @track tableColumns = [];
    @track tableRows = [];
    @track loading = false;
    @track errorMessage = '';
    @track metaWarning = '';

    sortedBy;
    sortedDirection;

    connectedCallback() {
        this.runOnLoad = this.autoRunOnLoad === true;
        if (this.runOnLoad) {
            Promise.resolve().then(() => this.handleRun());
        }
    }

    handleAutoRunToggle(event) {
        const checked =
            typeof event.detail?.checked === 'boolean' ? event.detail.checked : event.target.checked;
        this.runOnLoad = checked === true;
        if (this.runOnLoad) {
            this.handleRun();
        }
    }

    async handleRun() {
        const sql = (this.defaultSql || '').trim();
        if (!sql) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Configuration required',
                    message: 'Set the Data Cloud SQL query in Lightning App Builder.',
                    variant: 'warning'
                })
            );
            return;
        }

        this.errorMessage = '';
        this.metaWarning = '';
        this.loading = true;
        this.sortedBy = undefined;
        this.sortedDirection = undefined;
        try {
            const width =
                this.defaultColumnWidth != null && this.defaultColumnWidth !== ''
                    ? Number(this.defaultColumnWidth)
                    : null;
            const result = await runDataCloudSql({
                sql,
                maxRows: Number(this.maxRows) || 500,
                defaultColumnWrap: this.defaultColumnWrap === true,
                defaultInitialWidth: Number.isFinite(width) && width > 0 ? width : null
            });
            const cols = (result.columns || []).map((c) => this.normalizeColumn(c));
            this.tableColumns = cols;
            this.tableRows = this.cloneRows(result.rows || []);
            this.metaWarning = result.warning || '';
            if (this.metaWarning) {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Data Cloud',
                        message: this.metaWarning,
                        variant: 'info'
                    })
                );
            }
            if (this.tableColumns.length > 0 && this.tableRows.length === 0) {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'No rows',
                        message: 'Query succeeded but returned no data rows.',
                        variant: 'info'
                    })
                );
            }
        } catch (e) {
            this.tableColumns = [];
            this.tableRows = [];
            const msg = this.reduceError(e);
            this.errorMessage = msg;
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Query failed',
                    message: msg,
                    variant: 'error',
                    mode: 'sticky'
                })
            );
        } finally {
            this.loading = false;
        }
    }

    normalizeColumn(c) {
        const col = {
            fieldName: c.fieldName,
            label: c.label || c.fieldName,
            type: c.type || 'text',
            wrapText: c.wrapText === true
        };
        if (c.initialWidth) {
            col.initialWidth = c.initialWidth;
        }
        if (c.typeAttributes && typeof c.typeAttributes === 'object') {
            col.typeAttributes = c.typeAttributes;
        }
        return col;
    }

    cloneRows(rows) {
        return rows.map((r) => ({ ...r }));
    }

    handleSort(event) {
        const { fieldName, sortDirection } = event.detail;
        if (!fieldName || fieldName === '_rowUid') {
            return;
        }
        this.sortedBy = fieldName;
        this.sortedDirection = sortDirection;
        const copy = this.cloneRows(this.tableRows);
        const mult = sortDirection === 'asc' ? 1 : -1;
        copy.sort((a, b) => this.compareCells(a[fieldName], b[fieldName], mult));
        this.tableRows = copy;
    }

    compareCells(a, b, mult) {
        if (a == null && b == null) {
            return 0;
        }
        if (a == null) {
            return -1 * mult;
        }
        if (b == null) {
            return 1 * mult;
        }
        if (typeof a === 'number' && typeof b === 'number') {
            return (a - b) * mult;
        }
        const sa = String(a);
        const sb = String(b);
        return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' }) * mult;
    }

    reduceError(error) {
        if (!error) {
            return 'Unknown error';
        }
        if (Array.isArray(error.body)) {
            return error.body.map((e) => e.message).join(', ');
        }
        if (error.body && typeof error.body.message === 'string') {
            return error.body.message;
        }
        if (typeof error.message === 'string') {
            return error.message;
        }
        return 'Unknown error';
    }

    /** Show grid when we have column definitions (empty row set still renders headers). */
    get hasGrid() {
        return this.tableColumns.length > 0;
    }

    get showRunButton() {
        return !this.runOnLoad;
    }

    /** Default read-only grid: hide checkboxes unless App Builder enables selection column. */
    get hideSelectionColumn() {
        return this.showRowSelectionColumn !== true;
    }

    get tableHeightClass() {
        return 'dcqt-shell__table';
    }
}
