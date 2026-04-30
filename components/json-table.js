/**
 * <json-table> — renders an array of objects as a sortable HTML table.
 *
 * Usage:
 *   const t = document.createElement('json-table');
 *   t.data = [{a: 1, b: 2}, {a: 3, b: 4}];
 *   document.body.appendChild(t);
 *
 * Attributes:
 *   columns    : comma-separated list of property names to use as columns
 *                (default: union of all keys, in first-seen order).
 *   max-height : CSS max-height for the scroll container (default: 320px).
 *   empty-text : text to show when data is empty (default: "No rows").
 *
 * Properties:
 *   .data : array of objects. Setting replaces the rows and re-renders.
 *
 * Cells render primitives with String(); objects/arrays render as JSON
 * with a 'cell-obj' class. Click a header to sort by that column;
 * click again to flip direction; a third click clears the sort.
 */

import { WNElement, html, escapeHtml } from './_shared.js';

const STYLES = `
:host { display: block; }
.wrap { max-height: var(--json-table-max-height, 320px); overflow: auto; border: 1px solid var(--border-faint, #ddd); border-radius: 6px; background: var(--surface-alt, #fafafa); }
table { width: 100%; border-collapse: collapse; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78em; }
th, td { padding: 4px 8px; border-bottom: 1px solid var(--border-faint, #eee); text-align: left; vertical-align: top; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
th { background: var(--surface-head, #f0f0f0); position: sticky; top: 0; font-weight: 600; color: var(--text-strong, #222); z-index: 1; cursor: pointer; user-select: none; }
th:hover { color: var(--accent, #06c); }
th .sort { display: inline-block; margin-left: 4px; opacity: 0.5; font-size: 0.85em; }
th[data-sort="asc"] .sort, th[data-sort="desc"] .sort { opacity: 1; }
tbody tr:hover { background: rgba(0,0,0,0.03); }
td.cell-obj { color: var(--text-subtle, #888); font-style: italic; }
td.cell-null { color: var(--text-subtle, #aaa); }
td.cell-num { text-align: right; }
td.cell-bool { color: var(--accent, #06c); font-weight: 600; }
.empty { padding: 14px 18px; color: var(--text-subtle, #888); font-style: italic; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
`;

export class JsonTable extends WNElement {
    static get observedAttributes() { return ['columns', 'max-height', 'empty-text']; }

    constructor() {
        super();
        this._data = [];
        this._sortKey = null;
        this._sortDir = 0;
    }

    set data(value) {
        this._data = Array.isArray(value) ? value : [];
        this._sortKey = null;
        this._sortDir = 0;
        if (this.isConnected) this.requestRender();
    }
    get data() { return this._data; }

    css() {
        const mh = this.getAttribute('max-height');
        return STYLES + (mh ? `:host { --json-table-max-height: ${mh}; }` : '');
    }

    _columns() {
        const attr = this.getAttribute('columns');
        if (attr) return attr.split(',').map(s => s.trim()).filter(Boolean);
        const seen = new Set();
        for (const row of this._data) {
            if (row && typeof row === 'object') {
                for (const k of Object.keys(row)) seen.add(k);
            }
        }
        return Array.from(seen);
    }

    _sortedRows() {
        if (!this._sortKey || !this._sortDir) return this._data;
        const k = this._sortKey;
        const dir = this._sortDir;
        const sorted = this._data.slice();
        sorted.sort((a, b) => {
            const av = a == null ? undefined : a[k];
            const bv = b == null ? undefined : b[k];
            if (av === bv) return 0;
            if (av === undefined || av === null) return 1;
            if (bv === undefined || bv === null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av).localeCompare(String(bv)) * dir;
        });
        return sorted;
    }

    _renderCell(v) {
        if (v === null || v === undefined) return { cls: 'cell-null', text: '' };
        if (typeof v === 'object') return { cls: 'cell-obj', text: JSON.stringify(v) };
        if (typeof v === 'number') return { cls: 'cell-num', text: String(v) };
        if (typeof v === 'boolean') return { cls: 'cell-bool', text: v ? 'true' : 'false' };
        return { cls: '', text: String(v) };
    }

    render() {
        const cols = this._columns();
        if (!this._data.length) {
            const empty = this.getAttribute('empty-text') || 'No rows';
            return html`<div class="wrap"><div class="empty">${empty}</div></div>`;
        }
        const rows = this._sortedRows();
        const headers = cols.map(c => {
            const sort = this._sortKey === c ? (this._sortDir > 0 ? 'asc' : this._sortDir < 0 ? 'desc' : '') : '';
            const arrow = sort === 'asc' ? '▲' : sort === 'desc' ? '▼' : '↕';
            return html`<th data-col="${c}"${sort ? html` data-sort="${sort}"` : html``}>${c}<span class="sort">${arrow}</span></th>`;
        });
        const body = rows.map(r => {
            const tds = cols.map(c => {
                const cell = this._renderCell(r ? r[c] : undefined);
                return html`<td class="${cell.cls}">${cell.text}</td>`;
            });
            return html`<tr>${tds}</tr>`;
        });
        return html`<div class="wrap"><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    connectedCallback() {
        super.connectedCallback();
        this.shadowRoot.addEventListener('click', this._onClick = (e) => {
            const th = e.target.closest('th[data-col]');
            if (!th) return;
            const col = th.dataset.col;
            if (this._sortKey !== col) {
                this._sortKey = col; this._sortDir = 1;
            } else if (this._sortDir === 1) {
                this._sortDir = -1;
            } else {
                this._sortKey = null; this._sortDir = 0;
            }
            this.requestRender();
        });
    }
}

customElements.define('json-table', JsonTable);
