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
.toolbar { display: flex; justify-content: flex-end; align-items: center; gap: 6px; padding: 2px 0; font-size: 0.75em; color: var(--text-subtle, #666); }
.toolbar label { display: inline-flex; align-items: center; gap: 4px; }
.toolbar select, .toolbar button { font: inherit; background: var(--surface-alt, #fafafa); border: 1px solid var(--border-faint, #ddd); border-radius: 4px; padding: 2px 6px; cursor: pointer; color: var(--text-strong, #333); }
.toolbar button:hover, .toolbar select:hover { background: var(--surface-head, #f0f0f0); }
table { border-collapse: collapse; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--json-table-font-size, 12px); width: max-content; min-width: 100%; }
th, td { padding: 4px 8px; border-bottom: 1px solid var(--border-faint, #eee); text-align: left; vertical-align: top; white-space: nowrap; }
th { background: var(--surface-head, #f0f0f0); position: sticky; top: 0; font-weight: 600; color: var(--text-strong, #222); z-index: 1; cursor: pointer; user-select: none; }
th:hover { color: var(--accent, #06c); }
th .sort { display: inline-block; margin-left: 4px; opacity: 0.5; font-size: 0.85em; }
th[data-sort="asc"] .sort, th[data-sort="desc"] .sort { opacity: 1; }
tbody tr:hover { background: rgba(0,0,0,0.03); }
td.cell-obj { color: var(--text-subtle, #888); font-style: italic; }
td.cell-null { color: var(--text-subtle, #aaa); }
td.cell-num { text-align: right; }
td.cell-bool { color: var(--accent, #06c); font-weight: 600; }
td.cell-nested { padding: 2px; white-space: normal; }
td.cell-nested json-table { display: block; }
.empty { padding: 14px 18px; color: var(--text-subtle, #888); font-style: italic; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
.overlay { display: none; }
:host(.fullscreen) .overlay { display: flex; flex-direction: column; position: fixed; inset: 0; z-index: 9999; background: var(--surface, #fff); padding: 16px; box-sizing: border-box; }
:host(.fullscreen) .overlay .wrap { max-height: none; flex: 1; }
:host(.fullscreen) .overlay .ov-head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid var(--border-faint, #ddd); margin-bottom: 8px; }
:host(.fullscreen) .overlay .ov-head h3 { margin: 0; font-size: 1em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-strong, #222); }
:host(.fullscreen) .overlay button.close { font-size: 1.2em; background: none; border: none; cursor: pointer; padding: 4px 10px; color: var(--text-strong, #333); }
:host(.fullscreen) .overlay button.close:hover { color: var(--accent, #06c); }
:host(.fullscreen) .inline { display: none; }
`;

export class JsonTable extends WNElement {
    static get observedAttributes() { return ['columns', 'max-height', 'empty-text']; }

    constructor() {
        super();
        this._data = [];
        this._sortKey = null;
        this._sortDir = 0;
        this._fontSize = '12px';
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
        let extra = `:host { --json-table-font-size: ${this._fontSize}; }`;
        if (mh) extra += `:host { --json-table-max-height: ${mh}; }`;
        return STYLES + extra;
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
        if (Array.isArray(v)) {
            if (!v.length) return { cls: 'cell-obj', text: '[ ]' };
            const id = ++this._nestedCounter;
            this._nested.set(id, v);
            return { cls: 'cell-nested', raw: html`<json-table data-nested-id="${String(id)}" max-height="none" nested></json-table>` };
        }
        if (typeof v === 'object') {
            if (!Object.keys(v).length) return { cls: 'cell-obj', text: '{ }' };
            const id = ++this._nestedCounter;
            this._nested.set(id, v);
            return { cls: 'cell-nested', raw: html`<json-table data-nested-id="${String(id)}" max-height="none" nested></json-table>` };
        }
        if (typeof v === 'number') return { cls: 'cell-num', text: String(v) };
        if (typeof v === 'boolean') return { cls: 'cell-bool', text: v ? 'true' : 'false' };
        return { cls: '', text: String(v) };
    }

    _buildTable() {
        this._nested = new Map();
        this._nestedCounter = 0;
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
                if (cell.raw) return html`<td class="${cell.cls}">${cell.raw}</td>`;
                return html`<td class="${cell.cls}">${cell.text}</td>`;
            });
            return html`<tr>${tds}</tr>`;
        });
        return html`<div class="wrap"><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    render() {
        const nested = this.hasAttribute('nested');
        const table = this._buildTable();
        const sizes = [
            { v: '10px', l: 'XS' },
            { v: '11px', l: 'S' },
            { v: '12px', l: 'M' },
            { v: '14px', l: 'L' },
            { v: '16px', l: 'XL' },
        ];
        const opts = sizes.map(s => html`<option value="${s.v}"${s.v === this._fontSize ? html` selected` : html``}>${s.l}</option>`);
        const toolbar = nested ? html`` : html`<div class="toolbar"><label>Size <select class="size-sel">${opts}</select></label><button type="button" class="fs-btn" title="Open in overlay">⛶ Fullscreen</button></div>`;
        const inline = html`<div class="inline">${toolbar}${table}</div>`;
        if (nested) return inline;
        const title = this.getAttribute('title-text') || 'Table';
        const overlay = html`<div class="overlay"><div class="ov-head"><h3>${title} · ${String(this._data.length)} rows</h3><div><label style="font-size:0.85em;margin-right:8px">Size <select class="size-sel">${opts}</select></label><button type="button" class="close" aria-label="Close">×</button></div></div>${table}</div>`;
        return html`${inline}${overlay}`;
    }

    requestRender() {
        super.requestRender();
        if (!this._nested || !this._nested.size) return;
        const elems = this.shadowRoot.querySelectorAll('json-table[data-nested-id]');
        for (const el of elems) {
            const id = Number(el.dataset.nestedId);
            const val = this._nested.get(id);
            if (val == null) continue;
            const data = Array.isArray(val)
                ? val.map(x => (x && typeof x === 'object' && !Array.isArray(x)) ? x : { value: x })
                : Object.entries(val).map(([key, value]) => ({ key, value }));
            el.data = data;
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this.shadowRoot.addEventListener('change', this._onChange = (e) => {
            const sel = e.target.closest('.size-sel');
            if (!sel) return;
            this._fontSize = sel.value;
            this._applyCss();
            this.requestRender();
        });
        this.shadowRoot.addEventListener('click', this._onClick = (e) => {
            if (e.target.closest('.fs-btn')) { this.classList.add('fullscreen'); return; }
            if (e.target.closest('.overlay button.close')) { this.classList.remove('fullscreen'); return; }
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
        this._onKey = (e) => {
            if (e.key === 'Escape' && this.classList.contains('fullscreen')) {
                this.classList.remove('fullscreen');
            }
        };
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
        if (this._onKey) document.removeEventListener('keydown', this._onKey);
    }
}

customElements.define('json-table', JsonTable);
