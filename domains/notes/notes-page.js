/**
 * <notes-page notes_service="…"> — full-page note finder with filters.
 *
 * Loads the metadata index (`service.listAll()`) once and lets the user
 * narrow it down by type, themes (tags), week range, and pinned-only.
 *
 * Metadata-only: this page does NOT load card snippets or content. Free-text
 * search is intentionally separate (uses search_service, added later).
 *
 * Service contract:
 *   listAll() → Array<{ week, file, name, type, pinned, themes,
 *                       created?, modified? }>
 *
 * Events: none of its own. Click on a row navigates to /editor/<week>/<file>
 * via the SPA router (window.spaNavigate) when present, else full nav.
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const TYPES = [
    { id: 'note',         label: 'Notat',         icon: '📝' },
    { id: 'meeting',      label: 'Møte',          icon: '🤝' },
    { id: 'task',         label: 'Oppgave',       icon: '🎯' },
    { id: 'presentation', label: 'Presentasjon',  icon: '🎤' },
    { id: 'other',        label: 'Annet',         icon: '📌' },
];

function typeMeta(id) {
    return TYPES.find(t => t.id === id) || { id, label: id, icon: '📄' };
}

const STYLES = `
    :host {
        display: block; padding: 20px 24px; box-sizing: border-box;
        color: var(--text-strong); font: inherit;
    }
    .np-title {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); margin: 0 0 16px;
    }
    .np-filters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px 16px;
        padding: 14px 16px; margin-bottom: 16px;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 8px;
    }
    .np-filters label {
        display: flex; flex-direction: column; gap: 4px;
        font-size: 0.85em; color: var(--text-muted-warm);
    }
    .np-filters select, .np-filters input[type=text], .np-filters input[type=week] {
        padding: 6px 10px; border: 1px solid var(--border);
        border-radius: 6px; background: var(--bg);
        color: var(--text-strong); font: inherit;
    }
    .np-filters select:focus, .np-filters input:focus { border-color: var(--accent); outline: none; }
    .np-pin {
        display: flex; align-items: center; gap: 8px; padding-top: 18px;
        font-size: 0.9em; color: var(--text);
    }
    .np-themes {
        grid-column: 1 / -1;
        display: flex; flex-direction: column; gap: 4px;
        font-size: 0.85em; color: var(--text-muted-warm);
    }
    .np-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .np-chip {
        padding: 3px 10px; border-radius: 999px;
        background: var(--surface-alt); border: 1px solid var(--border);
        color: var(--text); font-size: 0.85em; cursor: pointer;
        user-select: none;
    }
    .np-chip:hover { border-color: var(--accent); }
    .np-chip.active {
        background: var(--accent-soft); border-color: var(--accent);
        color: var(--accent); font-weight: 600;
    }
    .np-actions {
        grid-column: 1 / -1;
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
    }
    .np-count { color: var(--text-muted); font-size: 0.9em; }
    .np-clear {
        padding: 5px 12px; border: 1px solid var(--border); border-radius: 6px;
        background: var(--bg); color: var(--text-muted); font: inherit;
        cursor: pointer;
    }
    .np-clear:hover { color: var(--accent); border-color: var(--accent); }

    .np-list { display: flex; flex-direction: column; gap: 6px; }
    .np-row {
        display: grid;
        grid-template-columns: 28px 110px 1fr auto;
        align-items: center; gap: 12px;
        padding: 8px 12px; background: var(--surface);
        border: 1px solid var(--border-faint); border-radius: 6px;
        text-decoration: none; color: var(--text);
        cursor: pointer;
    }
    .np-row:hover { border-color: var(--accent); background: var(--surface-alt); }
    .np-row .icon { font-size: 1.2em; }
    .np-row .week { color: var(--text-muted-warm); font-family: ui-monospace, monospace; font-size: 0.85em; }
    .np-row .name { font-weight: 500; }
    .np-row .name .pin { margin-right: 6px; }
    .np-row .tags { color: var(--text-muted); font-size: 0.85em; }
    .np-row .tags .t { color: var(--accent); margin-left: 6px; }

    .np-empty, .np-loading, .np-error {
        padding: 24px; text-align: center; color: var(--text-muted);
        font-style: italic;
    }
    .np-error { color: var(--danger, #c0392b); }
`;

class NotesPage extends WNElement {
    static get domain() { return 'notes'; }
    static get observedAttributes() { return ['notes_service']; }

    constructor() {
        super();
        this._all = null;
        this._error = null;
        this._filters = {
            type: '',
            themes: new Set(),
            weekFrom: '',
            weekTo: '',
            pinnedOnly: false,
        };
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._load();
    }

    async _load() {
        if (!this.service || typeof this.service.listAll !== 'function') {
            this._error = 'no-service';
            this.requestRender();
            return;
        }
        try {
            this._all = await this.service.listAll();
        } catch (e) {
            this._error = e.message || String(e);
        }
        this.requestRender();
        this._wire();
    }

    _wire() {
        if (this._wired) return;
        this._wired = true;
        const root = this.shadowRoot;
        root.addEventListener('input', (e) => this._onInput(e));
        root.addEventListener('change', (e) => this._onInput(e));
        root.addEventListener('click', (e) => this._onClick(e));
    }

    _onInput(e) {
        const t = e.target;
        if (!t.dataset || !t.dataset.filter) return;
        const f = t.dataset.filter;
        if (f === 'type') this._filters.type = t.value;
        else if (f === 'weekFrom') this._filters.weekFrom = t.value;
        else if (f === 'weekTo') this._filters.weekTo = t.value;
        else if (f === 'pinnedOnly') this._filters.pinnedOnly = !!t.checked;
        else if (f === 'themes') {
            const tags = Array.isArray(t.tags) ? t.tags : [];
            this._filters.themes = new Set(tags);
        }
        this._renderResults();
    }

    _onClick(e) {
        const clear = e.composedPath().find(n => n.classList && n.classList.contains('np-clear'));
        if (clear) {
            this._filters = { type: '', themes: new Set(), weekFrom: '', weekTo: '', pinnedOnly: false };
            this.requestRender();
            return;
        }
        const row = e.composedPath().find(n => n.classList && n.classList.contains('np-row'));
        if (row && row.dataset.week && row.dataset.file) {
            e.preventDefault();
            const url = '/editor/' + encodeURIComponent(row.dataset.week) + '/' + encodeURIComponent(row.dataset.file);
            if (window.spaNavigate && window.spaNavigate(url)) return;
            window.location.href = url;
        }
    }

    _filtered() {
        if (!this._all) return [];
        const { type, themes, weekFrom, weekTo, pinnedOnly } = this._filters;
        return this._all.filter(n => {
            if (type && n.type !== type) return false;
            if (pinnedOnly && !n.pinned) return false;
            if (weekFrom && n.week < weekFrom) return false;
            if (weekTo && n.week > weekTo) return false;
            if (themes.size > 0) {
                const ns = new Set(n.themes || []);
                for (const t of themes) if (!ns.has(t)) return false;
            }
            return true;
        });
    }

    _allThemes() {
        const set = new Set();
        for (const n of (this._all || [])) for (const t of (n.themes || [])) set.add(t);
        return [...set].sort((a, b) => a.localeCompare(b, 'no'));
    }

    _allWeeks() {
        const set = new Set();
        for (const n of (this._all || [])) set.add(n.week);
        return [...set].sort();
    }

    render() {
        if (!this.service) return this.renderNoService();
        if (this._error === 'no-service') return this.renderNoService();
        if (this._error) {
            return html`<h1 class="np-title">📚 Finn notater</h1><div class="np-error">Kunne ikke laste: ${this._error}</div>`;
        }
        if (!this._all) {
            return html`<h1 class="np-title">📚 Finn notater</h1><div class="np-loading">Laster…</div>`;
        }

        const weeks = this._allWeeks();
        const minWeek = weeks[0] || '';
        const maxWeek = weeks[weeks.length - 1] || '';
        const themes = this._allThemes();

        const typeOptions = [
            html`<option value="">Alle typer</option>`,
            ...TYPES.map(t => html`<option value="${t.id}" ${this._filters.type === t.id ? 'selected' : ''}>${t.icon} ${t.label}</option>`),
        ];

        const activeTags = Array.from(this._filters.themes).join(',');
        const suggestionAttr = themes.join(',');
        const counts = {};
        for (const n of (this._all || [])) for (const t of (n.themes || [])) counts[t] = (counts[t] || 0) + 1;
        const countsAttr = JSON.stringify(counts);

        return html`
            <h1 class="np-title">📚 Finn notater</h1>
            <div class="np-filters">
                <label>
                    Type
                    <select data-filter="type">${typeOptions}</select>
                </label>
                <label>
                    Fra uke
                    <input type="text" data-filter="weekFrom" placeholder="${minWeek}" value="${this._filters.weekFrom}" pattern="\\d{4}-W\\d{2}">
                </label>
                <label>
                    Til uke
                    <input type="text" data-filter="weekTo" placeholder="${maxWeek}" value="${this._filters.weekTo}" pattern="\\d{4}-W\\d{2}">
                </label>
                <label class="np-pin">
                    <input type="checkbox" data-filter="pinnedOnly" ${this._filters.pinnedOnly ? 'checked' : ''}>
                    📌 Bare festede
                </label>
                <div class="np-themes">
                    Tagger
                    <tag-editor data-filter="themes" placeholder="Legg til tag…" value="${activeTags}" suggestions="${suggestionAttr}" counts="${countsAttr}"></tag-editor>
                </div>
                <div class="np-actions">
                    <span class="np-count" data-count></span>
                    <button type="button" class="np-clear">Nullstill filtre</button>
                </div>
            </div>
            <div class="np-list" data-list></div>
        `;
    }

    requestRender() {
        super.requestRender();
        if (this._all) this._renderResults();
    }

    _renderResults() {
        const list = this.shadowRoot.querySelector('[data-list]');
        const count = this.shadowRoot.querySelector('[data-count]');
        if (!list || !count) return;
        const filtered = this._filtered();
        const total = (this._all || []).length;
        count.textContent = filtered.length === total
            ? `${total} notat${total === 1 ? '' : 'er'}`
            : `${filtered.length} av ${total} notat${total === 1 ? '' : 'er'}`;
        if (!filtered.length) {
            list.innerHTML = '<div class="np-empty">Ingen notater matcher filtrene.</div>';
            return;
        }
        list.innerHTML = filtered.map(n => {
            const tm = typeMeta(n.type);
            const pin = n.pinned ? '<span class="pin">📌</span>' : '';
            const tags = (n.themes || []).map(t => `<span class="t">#${escapeHtml(t)}</span>`).join('');
            return `<a class="np-row" href="/editor/${encodeURIComponent(n.week)}/${encodeURIComponent(n.file)}" data-week="${escapeHtml(n.week)}" data-file="${escapeHtml(n.file)}">
                <span class="icon" title="${escapeHtml(tm.label)}">${tm.icon}</span>
                <span class="week">${escapeHtml(n.week)}</span>
                <span class="name">${pin}${escapeHtml(n.name)}</span>
                <span class="tags">${tags}</span>
            </a>`;
        }).join('');
    }
}

if (!customElements.get('notes-page')) customElements.define('notes-page', NotesPage);
