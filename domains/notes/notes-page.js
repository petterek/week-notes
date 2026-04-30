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
    .np-tags {
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
    .np-chip-n { color: var(--text-muted); font-weight: normal; margin-left: 2px; }
    .np-chip.active .np-chip-n { color: var(--accent); }
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
    .np-note { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: start; }
    .np-note .np-week {
        color: var(--text-muted-warm); font-family: ui-monospace, monospace;
        font-size: 0.85em; padding-top: 18px;
    }

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
            tags: new Set(),
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
        root.addEventListener('view', (e) => this._onCardEvent(e));
        root.addEventListener('edit', (e) => this._onCardEvent(e));
        root.addEventListener('delete', (e) => this._onCardEvent(e));
    }

    _onInput(e) {
        const t = e.target;
        if (!t.dataset || !t.dataset.filter) return;
        const f = t.dataset.filter;
        if (f === 'type') this._filters.type = t.value;
        else if (f === 'weekFrom') this._filters.weekFrom = t.value;
        else if (f === 'weekTo') this._filters.weekTo = t.value;
        else if (f === 'pinnedOnly') this._filters.pinnedOnly = !!t.checked;
        this._renderResults();
    }

    _onClick(e) {
        const chip = e.composedPath().find(n => n.classList && n.classList.contains('np-chip'));
        if (chip) {
            const tag = chip.dataset.tag;
            if (this._filters.tags.has(tag)) this._filters.tags.delete(tag);
            else this._filters.tags.add(tag);
            chip.classList.toggle('active');
            this._renderResults();
            return;
        }
        const clear = e.composedPath().find(n => n.classList && n.classList.contains('np-clear'));
        if (clear) {
            this._filters = { type: '', tags: new Set(), weekFrom: '', weekTo: '', pinnedOnly: false };
            this.requestRender();
            return;
        }
    }

    _onCardEvent(e) {
        const fp = e.detail && e.detail.filePath;
        if (!fp) return;
        if (e.type === 'view' || e.type === 'edit') {
            e.preventDefault();
            const url = '/editor/' + fp;
            if (window.spaNavigate && window.spaNavigate(url)) return;
            window.location.href = url;
            return;
        }
        if (e.type === 'delete') {
            e.preventDefault();
            const [week, fileEnc] = fp.split('/');
            const file = decodeURIComponent(fileEnc);
            if (!confirm(`Slette ${file} (${week})?`)) return;
            const svc = this.serviceFor && this.serviceFor('notes') || this.service;
            const p = svc && svc.remove ? svc.remove(week, file) : Promise.reject(new Error('no service'));
            Promise.resolve(p).then(() => {
                this._all = (this._all || []).filter(n => !(n.week === week && n.file === file));
                this._renderResults();
            }).catch(err => alert('Kunne ikke slette: ' + (err && err.message || err)));
        }
    }

    _filtered() {
        if (!this._all) return [];
        const { type, tags, weekFrom, weekTo, pinnedOnly } = this._filters;
        return this._all.filter(n => {
            if (type && n.type !== type) return false;
            if (pinnedOnly && !n.pinned) return false;
            if (weekFrom && n.week < weekFrom) return false;
            if (weekTo && n.week > weekTo) return false;
            if (tags.size > 0) {
                const ns = new Set(n.tags || n.themes || []);
                for (const t of tags) if (!ns.has(t)) return false;
            }
            return true;
        });
    }

    _allTags() {
        const set = new Set();
        for (const n of (this._all || [])) for (const t of (n.tags || n.themes || [])) set.add(t);
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
        const tagsList = this._allTags();

        const typeOptions = [
            html`<option value="">Alle typer</option>`,
            ...TYPES.map(t => html`<option value="${t.id}" ${this._filters.type === t.id ? 'selected' : ''}>${t.icon} ${t.label}</option>`),
        ];

        const counts = {};
        for (const n of (this._all || [])) for (const t of (n.tags || n.themes || [])) counts[t] = (counts[t] || 0) + 1;

        const chips = tagsList.length
            ? tagsList.map(t => html`<span class="np-chip ${this._filters.tags.has(t) ? 'active' : ''}" data-tag="${t}">#${t} <span class="np-chip-n">(${counts[t] || 0})</span></span>`)
            : html`<span style="color:var(--text-subtle);font-style:italic">Ingen tagger funnet</span>`;

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
                <div class="np-tags">
                    Tagger
                    <div class="np-chips">${chips}</div>
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
        list.innerHTML = '';
        for (const n of filtered) {
            const wrap = document.createElement('div');
            wrap.className = 'np-note';
            const wk = document.createElement('span');
            wk.className = 'np-week';
            wk.textContent = n.week;
            const card = document.createElement('note-card');
            card.setData({
                week: n.week, file: n.file, name: n.name,
                type: n.type, pinned: n.pinned, themes: n.tags || n.themes || [],
            });
            wrap.appendChild(wk);
            wrap.appendChild(card);
            list.appendChild(wrap);
        }
    }
}

if (!customElements.get('notes-page')) customElements.define('notes-page', NotesPage);
