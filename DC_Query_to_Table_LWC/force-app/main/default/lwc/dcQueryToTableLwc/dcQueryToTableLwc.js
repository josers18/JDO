import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import runDataCloudSql from '@salesforce/apex/DcQueryToTableController.runDataCloudSql';

/**
 * Runtime table options follow SLDS / lightning-datatable data-table patterns:
 * https://www.lightningdesignsystem.com/2e1ef8501/p/86f13a-data-table
 */
export default class DcQueryToTableLwc extends LightningElement {
    @api cardTitle = 'Data Cloud SQL';
    /** Set in App Builder only; not shown on the page. */
    @api defaultSql = 'SELECT * FROM "ssot__Individual__dlm" LIMIT 10';

    /** Kept for existing Lightning pages that reference this property; query always runs on load. */
    @api autoRunOnLoad;

    /** SLDS icon in namespace:name form (e.g. utility:table, utility:graph). */
    @api headerIconName = 'utility:table';
    /** Title text color: #RGB, #RRGGBB, or #RRGGBBAA (no spaces). */
    @api titleColorHex = '#032d60';

    /** When not false, shows the on-page “Table configuration” panel (checkboxes + numeric options). */
    @api showTableConfiguration;

    @api maxRows = 500;
    @api defaultColumnWrap = false;
    @api defaultColumnWidth;

    /** App Builder defaults for table UI; runtime panel can override until reload. */
    @api showRowSelectionColumn = false;
    @api showRowNumberColumn = false;
    @api columnWidthsMode = 'auto';
    @api minColumnWidth = 120;
    @api resizeColumnDisabled = false;
    @api wrapTableHeader = false;
    @api wrapTextMaxLines = 3;
    @api suppressBottomBar = false;

    @track tableColumns = [];
    @track tableRows = [];
    @track loading = false;
    @track errorMessage = '';
    @track metaWarning = '';

    @track cfgShowSelection = false;
    @track cfgShowRowNumbers = false;
    @track cfgFixedColumnWidths = false;
    @track cfgAllowColumnResize = true;
    @track cfgWrapHeaders = false;
    @track cfgWrapCells = false;
    @track cfgSuppressFooter = false;
    @track cfgMinColumnWidth = 120;
    @track cfgWrapMaxLines = 3;

    sortedBy;
    sortedDirection;

    connectedCallback() {
        this.syncTableOptionsFromApi();
        Promise.resolve().then(() => this.handleRun());
    }

    syncTableOptionsFromApi() {
        this.cfgShowSelection = this.showRowSelectionColumn === true;
        this.cfgShowRowNumbers = this.showRowNumberColumn === true;
        const mode = (this.columnWidthsMode || 'auto').toLowerCase();
        this.cfgFixedColumnWidths = mode === 'fixed';
        this.cfgAllowColumnResize = this.resizeColumnDisabled !== true;
        this.cfgWrapHeaders = this.wrapTableHeader === true;
        this.cfgWrapCells = this.defaultColumnWrap === true;
        this.cfgSuppressFooter = this.suppressBottomBar === true;
        const mw = Number(this.minColumnWidth);
        this.cfgMinColumnWidth = Number.isFinite(mw) && mw >= 20 ? mw : 120;
        const wl = Number(this.wrapTextMaxLines);
        this.cfgWrapMaxLines = Number.isFinite(wl) && wl >= 1 ? wl : 3;
    }

    get showConfigPanel() {
        return this.showTableConfiguration !== false;
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

    get effectiveColumnWidthsMode() {
        return this.cfgFixedColumnWidths ? 'fixed' : 'auto';
    }

    get effectiveHideSelectionColumn() {
        return this.cfgShowSelection !== true;
    }

    get effectiveResizeColumnDisabled() {
        return this.cfgAllowColumnResize !== true;
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
                defaultColumnWrap: this.cfgWrapCells === true,
                defaultInitialWidth: Number.isFinite(width) && width > 0 ? width : null
            });
            const cols = (result.columns || []).map((c) => this.normalizeColumn(c));
            this.tableColumns = cols;
            this.applyColumnWrapFromConfig();
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
            wrapText: this.cfgWrapCells === true
        };
        if (c.initialWidth) {
            col.initialWidth = c.initialWidth;
        }
        if (c.typeAttributes && typeof c.typeAttributes === 'object') {
            col.typeAttributes = c.typeAttributes;
        }
        return col;
    }

    applyColumnWrapFromConfig() {
        if (!this.tableColumns || this.tableColumns.length === 0) {
            return;
        }
        const wrap = this.cfgWrapCells === true;
        this.tableColumns = this.tableColumns.map((col) => {
            const next = { ...col, wrapText: wrap };
            return next;
        });
    }

    handleConfigCheckboxChange(event) {
        const key = event.currentTarget.dataset.cfg;
        const checked =
            typeof event.detail?.checked === 'boolean' ? event.detail.checked : event.target.checked;
        switch (key) {
            case 'selection':
                this.cfgShowSelection = checked === true;
                break;
            case 'rowNumbers':
                this.cfgShowRowNumbers = checked === true;
                break;
            case 'fixedWidths':
                this.cfgFixedColumnWidths = checked === true;
                break;
            case 'allowResize':
                this.cfgAllowColumnResize = checked === true;
                break;
            case 'wrapHeaders':
                this.cfgWrapHeaders = checked === true;
                break;
            case 'wrapCells':
                this.cfgWrapCells = checked === true;
                this.applyColumnWrapFromConfig();
                break;
            case 'suppressFooter':
                this.cfgSuppressFooter = checked === true;
                break;
            default:
                break;
        }
    }

    handleMinColumnWidthChange(event) {
        const raw = event.detail?.value != null ? event.detail.value : event.target.value;
        let v = parseInt(raw, 10);
        if (!Number.isFinite(v)) {
            v = 120;
        }
        v = Math.min(1000, Math.max(20, v));
        this.cfgMinColumnWidth = v;
    }

    handleWrapMaxLinesChange(event) {
        const raw = event.detail?.value != null ? event.detail.value : event.target.value;
        let v = parseInt(raw, 10);
        if (!Number.isFinite(v)) {
            v = 3;
        }
        v = Math.min(50, Math.max(1, v));
        this.cfgWrapMaxLines = v;
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

    get hasGrid() {
        return this.tableColumns.length > 0;
    }

    get tableHeightClass() {
        return 'dcqt-shell__table';
    }
}
