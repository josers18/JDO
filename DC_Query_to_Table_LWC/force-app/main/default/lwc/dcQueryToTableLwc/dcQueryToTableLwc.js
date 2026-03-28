import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import runDataCloudSql from '@salesforce/apex/DcQueryToTableController.runDataCloudSql';

/**
 * Table layout follows SLDS / lightning-datatable data-table patterns; all options are App Builder only.
 * https://www.lightningdesignsystem.com/2e1ef8501/p/86f13a-data-table
 */
export default class DcQueryToTableLwc extends LightningElement {
    @api cardTitle = 'Data Cloud SQL';
    @api defaultSql = 'SELECT * FROM "ssot__Individual__dlm" LIMIT 10';

    /**
     * When true (default), runs the SQL when the page loads. When false, shows Run query until the user runs it.
     */
    @api autoRunOnLoad;

    @api headerIconName = 'utility:table';
    @api titleColorHex = '#032d60';
    @api showTitle;

    /** Legacy FlexiPage property; not displayed—configure table via App Builder properties below. */
    @api showTableConfiguration;

    @api maxRows = 500;
    @api defaultColumnWrap = false;
    @api defaultColumnWidth;

    @api showRowSelectionColumn = false;
    @api showRowNumberColumn = false;
    @api columnWidthsMode = 'auto';
    @api minColumnWidth = 120;
    @api resizeColumnDisabled = false;
    @api wrapTableHeader = false;
    @api wrapTextMaxLines = 3;
    @api suppressBottomBar = false;

    /** When not false, column headers are sortable (client-side sort on loaded rows). */
    @api enableColumnSorting;

    @track tableColumns = [];
    @track tableRows = [];
    @track loading = false;
    @track errorMessage = '';
    @track metaWarning = '';

    sortedBy;
    sortedDirection;

    connectedCallback() {
        if (this.autoRunOnLoad !== false) {
            Promise.resolve().then(() => this.handleRun());
        }
    }

    /** Unchecked in App Builder → manual Run only. Undefined preserves previous default (auto-run). */
    get showRunButton() {
        return this.autoRunOnLoad === false;
    }

    get titleVisible() {
        return this.showTitle !== false;
    }

    /** Header row only if title, Run button, or loading spinner is needed. */
    get showHeaderRow() {
        return this.titleVisible || this.showRunButton || this.loading === true;
    }

    get shellClassName() {
        let c = 'dcqt-shell';
        if (!this.titleVisible) {
            c += ' dcqt-shell--no-title';
        }
        if (!this.showHeaderRow) {
            c += ' dcqt-shell--no-header-row';
        }
        return c;
    }

    get headerClassName() {
        return this.titleVisible
            ? 'dcqt-shell__header'
            : 'dcqt-shell__header dcqt-shell__header--no-title';
    }

    get resolvedCardTitle() {
        return (this.cardTitle || '').trim() || 'Data Cloud SQL';
    }

    get resolvedHeaderIconName() {
        const raw = (this.headerIconName || '').trim();
        if (/^[A-Za-z]+:[A-Za-z0-9_]+$/.test(raw)) {
            return raw;
        }
        return 'utility:table';
    }

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
        return '--dcqt-title-color: ' + this.resolvedTitleColorHex + ';';
    }

    get resolvedColumnWidthsMode() {
        const m = (this.columnWidthsMode || 'auto').toLowerCase();
        return m === 'fixed' ? 'fixed' : 'auto';
    }

    get hideSelectionColumn() {
        return this.showRowSelectionColumn !== true;
    }

    get resolvedMinColumnWidth() {
        const mw = Number(this.minColumnWidth);
        if (Number.isFinite(mw) && mw >= 20) {
            return Math.min(1000, mw);
        }
        return 120;
    }

    get resolvedWrapTextMaxLines() {
        const wl = Number(this.wrapTextMaxLines);
        if (Number.isFinite(wl) && wl >= 1) {
            return Math.min(50, wl);
        }
        return 3;
    }

    get columnSortingEnabled() {
        return this.enableColumnSorting !== false;
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
            this.tableColumns = (result.columns || []).map((c) => this.normalizeColumn(c));
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
            wrapText: this.defaultColumnWrap === true,
            sortable: this.columnSortingEnabled === true
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
        if (this.columnSortingEnabled !== true) {
            return;
        }
        const { fieldName, sortDirection } = event.detail;
        if (!fieldName || fieldName === '_rowUid') {
            return;
        }
        this.sortedBy = fieldName;
        this.sortedDirection = sortDirection;
        const col = (this.tableColumns || []).find((c) => c.fieldName === fieldName);
        const colType = col ? col.type : 'text';
        const copy = this.cloneRows(this.tableRows);
        const mult = sortDirection === 'asc' ? 1 : -1;
        copy.sort((a, b) =>
            this.compareCellsTyped(a[fieldName], b[fieldName], mult, colType)
        );
        this.tableRows = copy;
    }

    compareCellsTyped(a, b, mult, colType) {
        if (a == null && b == null) {
            return 0;
        }
        if (a == null) {
            return -1 * mult;
        }
        if (b == null) {
            return 1 * mult;
        }
        if (typeof a === 'boolean' && typeof b === 'boolean') {
            if (a === b) {
                return 0;
            }
            return (a ? 1 : -1) * mult;
        }
        if (typeof a === 'number' && typeof b === 'number') {
            return (a - b) * mult;
        }
        const t = (colType || 'text').toLowerCase();
        if (t === 'date' || t === 'datetime') {
            const da = a instanceof Date ? a.getTime() : Date.parse(String(a));
            const db = b instanceof Date ? b.getTime() : Date.parse(String(b));
            if (!Number.isNaN(da) && !Number.isNaN(db)) {
                return (da - db) * mult;
            }
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

    get hasGrid() {
        return this.tableColumns.length > 0;
    }

    get tableHeightClass() {
        return 'dcqt-shell__table';
    }
}
