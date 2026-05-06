/**
 * <goals-page goals_service="…" tasks_service="…" results_service="…">
 *
 * Full-page Goals view. Lists goals grouped by status (active / achieved /
 * abandoned). Lets the user create, edit, change status, set target date,
 * and delete. Shows linked tasks/results count + progress per goal.
 *
 * Service contract:
 *   goals_service.list()                                    → Goal[]
 *   goals_service.create({title, description, targetDate})  → {goal}
 *   goals_service.update(id, {title?, description?, status?, targetDate?}) → {goal}
 *   goals_service.remove(id)                                → { ok: true }
 *   tasks_service.list()    (optional)                      → Task[]
 *   results_service.list()  (optional)                      → Result[]
 *
 * Goals carry an optional `targetDate` (YYYY-MM-DD) and one of three
 * statuses: 'active', 'achieved', 'abandoned'.
 */
import { WNElement, html, unsafeHTML, escapeHtml } from './_shared.js';

const STATUS_LABEL = { active: 'Aktiv', achieved: 'Oppnådd', abandoned: 'Forlatt' };
const STATUS_ICON  = { active: '🎯', achieved: '🏆', abandoned: '🗑️' };
const STATUS_ORDER = ['active', 'achieved', 'abandoned'];

const STYLES = `
    :host { display: block; padding: 20px 24px; box-sizing: border-box; color: var(--text-strong); font: inherit; }
    .gp { max-width: 920px; }
    .gp-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; flex-wrap: wrap; }
    .gp-head h1 {
        margin: 0; font-family: var(--font-heading, Georgia, serif);
        font-weight: 400; color: var(--accent);
    }
    .gp-hint { color: var(--text-subtle); font-size: 0.85em; margin: 0 0 24px; }

    .gp-btn-primary {
        background: var(--accent); color: var(--surface, #fff);
        border: none; padding: 8px 16px; border-radius: 6px;
        font: inherit; font-weight: 600; cursor: pointer;
    }
    .gp-btn-primary:hover { filter: brightness(0.95); }

    .gp-section { margin-bottom: 32px; }
    .gp-section-h {
        color: var(--accent); font-size: 0.95em; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.05em;
        margin: 0 0 10px; padding-bottom: 6px;
        border-bottom: 2px solid var(--border-soft);
        display: flex; align-items: center; gap: 10px;
    }
    .gp-section-h .c { color: var(--text-subtle); font-size: 0.85em; font-weight: 500; }

    .gp-card {
        background: var(--surface); border: 1px solid var(--border-soft);
        border-left: 4px solid var(--accent); border-radius: 8px;
        padding: 14px 18px; margin-bottom: 10px;
    }
    .gp-card.achieved { border-left-color: var(--accent-strong, var(--accent)); opacity: 0.92; }
    .gp-card.abandoned { border-left-color: var(--text-subtle); opacity: 0.7; }

    .gp-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 6px; }
    .gp-title { flex: 1; font-size: 1.05em; font-weight: 600; color: var(--text-strong); }
    .gp-act {
        background: none; border: none; cursor: pointer;
        font-size: 1em; padding: 2px 6px; border-radius: 4px;
        font-family: inherit; color: var(--text-muted);
    }
    .gp-act:hover { background: var(--surface-head); }
    .gp-del { color: #c53030; }
    .gp-desc {
        color: var(--text-muted); font-size: 0.92em; line-height: 1.45;
        white-space: pre-wrap; word-break: break-word; margin: 6px 0 8px;
    }
    .gp-meta {
        display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
        font-size: 0.82em; color: var(--text-subtle);
    }
    .gp-meta .due { color: var(--text-muted-warm, var(--text-muted)); }
    .gp-meta .due.overdue { color: #c53030; font-weight: 600; }
    .gp-progress {
        display: inline-flex; align-items: center; gap: 8px;
    }
    .gp-bar {
        position: relative; width: 120px; height: 6px;
        background: var(--surface-head); border-radius: 3px; overflow: hidden;
    }
    .gp-bar > i {
        display: block; height: 100%; background: var(--accent);
        border-radius: 3px;
    }
    .gp-value {
        display: flex; align-items: center; gap: 10px;
        margin: 6px 0 8px; font-size: 0.92em;
    }
    .gp-value .gp-vbar {
        flex: 1; max-width: 220px; height: 8px;
        background: var(--surface-head); border-radius: 4px; overflow: hidden;
        position: relative;
    }
    .gp-value .gp-vbar > i {
        display: block; height: 100%; background: var(--accent);
        border-radius: 4px;
    }
    .gp-value .gp-vbar.done > i { background: var(--success, var(--accent)); }
    .gp-value .gp-vnum { color: var(--text-strong); font-variant-numeric: tabular-nums; }
    .gp-value .gp-vnum b { font-weight: 600; }

    .gp-empty { color: var(--text-subtle); font-style: italic; margin-top: 8px; }
    .gp-loading, .gp-error { padding: 24px; text-align: center; color: var(--text-muted); font-style: italic; }
    .gp-error { color: var(--danger, #c0392b); }

    .gp-card .gp-title { cursor: pointer; user-select: none; }
    .gp-chev {
        display: inline-block; transition: transform 0.15s;
        margin-right: 4px; color: var(--text-subtle); font-size: 0.85em;
    }
    .gp-card.expanded .gp-chev { transform: rotate(90deg); }

    .gp-detail {
        margin-top: 12px; padding-top: 12px;
        border-top: 1px dashed var(--border-soft);
        display: flex; flex-direction: column; gap: 14px;
    }
    .gp-detail h4 {
        margin: 0 0 6px; font-size: 0.85em; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.04em;
        color: var(--text-muted);
    }
    .gp-detail ul { list-style: none; margin: 0; padding: 0; }
    .gp-detail li {
        padding: 4px 0; font-size: 0.92em; color: var(--text-strong);
        display: flex; align-items: baseline; gap: 8px;
    }
    .gp-detail li .mark { width: 1.1em; flex: 0 0 auto; color: var(--text-subtle); }
    .gp-detail li.done .text { color: var(--text-subtle); text-decoration: line-through; }
    .gp-detail li .text { flex: 1; word-break: break-word; }
    .gp-detail li a.wk {
        color: var(--text-subtle); font-size: 0.85em; text-decoration: none;
        white-space: nowrap;
    }
    .gp-detail li a.wk:hover { color: var(--accent); text-decoration: underline; }
    .gp-detail .empty { color: var(--text-subtle); font-style: italic; font-size: 0.9em; }
    .gp-quickadd { margin-top: 8px; }

    .modal {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        display: none; align-items: center; justify-content: center;
        z-index: 1000;
    }
    .modal.open { display: flex; }
    .modal-card {
        background: var(--surface, #fff); color: var(--text-strong);
        border-radius: 10px; padding: 22px; width: min(560px, 92vw);
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    }
    .modal-head {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 16px;
    }
    .modal-head h3 { margin: 0; }
    .modal-close {
        background: none; border: none; font-size: 1.3em; cursor: pointer;
        color: var(--text-subtle); font-family: inherit;
    }
    .modal-form { display: flex; flex-direction: column; gap: 12px; }
    .modal-form label {
        font-size: 0.85em; font-weight: 600; color: var(--text-muted);
        display: block;
    }
    .modal-form textarea, .modal-form input, .modal-form select {
        display: block; width: 100%; margin-top: 4px;
        box-sizing: border-box;
        padding: 8px 10px; border: 1px solid var(--border);
        border-radius: 6px; background: var(--bg);
        color: var(--text-strong); font: inherit;
    }
    .modal-form textarea:focus, .modal-form input:focus, .modal-form select:focus {
        border-color: var(--accent); outline: none;
    }
    .modal-actions {
        display: flex; justify-content: flex-end; gap: 10px;
        margin-top: 20px;
    }
    .modal-btn {
        padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border);
        background: var(--surface); color: var(--text-strong);
        font: inherit; cursor: pointer;
    }
    .modal-btn:hover { background: var(--surface-head); }
    .modal-btn.primary {
        background: var(--accent); color: #fff; border-color: var(--accent);
        font-weight: 600;
    }
    .modal-btn.primary:hover { filter: brightness(0.95); }
`;

class GoalsPage extends WNElement {
    static get domain() { return 'goals'; }
    static get observedAttributes() { return ['goals_service', 'tasks_service', 'results_service']; }

    constructor() {
        super();
        this._state = null;
        this._error = null;
        this._modal = null;
        this._expanded = new Set();
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._load();
        // Auto-expand if URL hash points to a specific goal (e.g. /goals#g-abc)
        const m = (location.hash || '').match(/^#g-(.+)$/);
        if (m) this._expanded.add(decodeURIComponent(m[1]));
        if (!this._kbWired) {
            this._kbWired = true;
            this._onKey = this._onKey.bind(this);
            document.addEventListener('keydown', this._onKey);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback && super.disconnectedCallback();
        if (this._kbWired) {
            document.removeEventListener('keydown', this._onKey);
            this._kbWired = false;
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.isConnected && oldVal !== newVal) this._load();
    }

    async _load() {
        if (!this.service) {
            this._error = 'no-service';
            this.requestRender();
            return;
        }
        const tasksSvc = this.serviceFor('tasks');
        const resultsSvc = this.serviceFor('results');
        try {
            const [goals, tasks, results] = await Promise.all([
                this.service.list(),
                tasksSvc ? tasksSvc.list() : Promise.resolve([]),
                resultsSvc ? resultsSvc.list() : Promise.resolve([]),
            ]);
            this._state = {
                goals: (goals || []).slice().sort((a, b) => (b.created || '').localeCompare(a.created || '')),
                tasks: tasks || [],
                results: results || [],
            };
            this._error = null;
        } catch (e) {
            this._error = e.message || String(e);
        }
        this.requestRender();
        this._wire();
    }

    _wire() {
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
        this.shadowRoot.addEventListener('task:created', () => this._load());
        this.shadowRoot.addEventListener('result:created', () => this._load());
    }

    _onClick(e) {
        const path = e.composedPath();
        if (path.find(n => n.id === 'gpNewBtn')) { this._openNew(); return; }
        const editBtn = path.find(n => n.classList && n.classList.contains('gp-edit'));
        if (editBtn) {
            const g = (this._state.goals || []).find(x => x.id === editBtn.dataset.id);
            if (g) this._openEdit(g);
            return;
        }
        const statusBtn = path.find(n => n.classList && n.classList.contains('gp-status'));
        if (statusBtn) {
            this._cycleStatus(statusBtn.dataset.id, statusBtn.dataset.next);
            return;
        }
        const delBtn = path.find(n => n.classList && n.classList.contains('gp-del'));
        if (delBtn) { this._delete(delBtn.dataset.id); return; }
        const titleEl = path.find(n => n.classList && n.classList.contains('gp-title'));
        if (titleEl && titleEl.dataset.id) { this._toggleExpanded(titleEl.dataset.id); return; }
        const backdrop = path.find(n => n.classList && n.classList.contains('modal'));
        if (backdrop && e.target === backdrop) { this._closeModal(); return; }
        if (path.find(n => n.classList && n.classList.contains('modal-close'))) { this._closeModal(); return; }
        if (path.find(n => n.dataset && n.dataset.act === 'cancel')) { this._closeModal(); return; }
        if (path.find(n => n.dataset && n.dataset.act === 'save')) { this._save(); return; }
    }

    _renderValue(g) {
        const fmt = n => {
            if (n == null || !Number.isFinite(n)) return '';
            const s = Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('no-NO')
                : (Math.round(n * 100) / 100).toString();
            return s;
        };
        const target = g.targetValue;
        const current = (g.currentValue != null) ? g.currentValue : 0;
        const unit = g.unit ? ' ' + g.unit : '';
        const has = g.currentValue != null;
        const pct = target ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : 0;
        const done = target != null && current >= target;
        return html`
            <span class="gp-vnum">
                ${has ? html`<b>${fmt(current)}</b>` : html`<i style="color:var(--text-subtle)">—</i>`}
                ${' / '}<b>${fmt(target)}</b>${unit}
                ${has && target ? html`<span style="color:var(--text-subtle); margin-left:6px;">(${pct}%)</span>` : ''}
            </span>
            ${target ? unsafeHTML(`<span class="gp-vbar${done ? ' done' : ''}"><i style="width:${pct}%"></i></span>`) : ''}
        `;
    }

    _toggleExpanded(id) {
        if (this._expanded.has(id)) this._expanded.delete(id);
        else this._expanded.add(id);
        this.requestRender();
    }

    _onKey(e) {
        if (!this._modal) return;
        if (e.key === 'Escape') { e.preventDefault(); this._closeModal(); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this._save(); }
    }

    _openNew() {
        this._modal = { mode: 'new', title: '', description: '', targetDate: '', status: 'active',
            targetValue: '', currentValue: '', unit: '' };
        this.requestRender();
        this._focusModalInput();
    }

    _openEdit(g) {
        this._modal = {
            mode: 'edit', id: g.id,
            title: g.title || '',
            description: g.description || '',
            targetDate: g.targetDate || '',
            status: g.status || 'active',
            targetValue: g.targetValue != null ? String(g.targetValue) : '',
            currentValue: g.currentValue != null ? String(g.currentValue) : '',
            unit: g.unit || '',
        };
        this.requestRender();
        this._focusModalInput();
    }

    _closeModal() { this._modal = null; this.requestRender(); }

    _focusModalInput() {
        setTimeout(() => {
            const inp = this.shadowRoot.getElementById('gpModalTitle');
            if (inp) inp.focus();
        }, 30);
    }

    async _save() {
        if (!this._modal) return;
        const root = this.shadowRoot;
        const title = (root.getElementById('gpModalTitle').value || '').trim();
        const description = root.getElementById('gpModalDesc').value || '';
        const targetDate = (root.getElementById('gpModalDate').value || '').trim();
        const status = root.getElementById('gpModalStatus').value || 'active';
        const targetValueRaw = (root.getElementById('gpModalTargetValue').value || '').trim();
        const currentValueRaw = (root.getElementById('gpModalCurrentValue').value || '').trim();
        const unit = (root.getElementById('gpModalUnit').value || '').trim();
        if (!title) return;
        const toNum = s => { if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
        const targetValue = toNum(targetValueRaw);
        const currentValue = toNum(currentValueRaw);
        try {
            if (this._modal.mode === 'new') {
                await this.service.create({
                    title, description, targetDate, status,
                    targetValue, currentValue, unit,
                });
            } else {
                await this.service.update(this._modal.id, {
                    title, description,
                    targetDate: targetDate || null,
                    status,
                    targetValue: targetValueRaw === '' ? null : targetValue,
                    currentValue: currentValueRaw === '' ? null : currentValue,
                    unit: unit === '' ? null : unit,
                });
            }
            this._modal = null;
            await this._load();
        } catch (e) {
            alert((e && e.message) || 'Feil');
        }
    }

    async _cycleStatus(id, next) {
        try {
            await this.service.update(id, { status: next });
            await this._load();
        } catch (e) { alert((e && e.message) || 'Feil'); }
    }

    async _delete(id) {
        if (!confirm('Slett dette målet? Koblinger til oppgaver/resultater vil bli fjernet.')) return;
        try {
            await this.service.remove(id);
            await this._load();
        } catch (e) { alert((e && e.message) || 'Feil'); }
    }

    _renderCard(g) {
        const tasks = (this._state.tasks || []).filter(t => t.goalId === g.id);
        const results = (this._state.results || []).filter(r => r.goalId === g.id);
        const tDone = tasks.filter(t => t.done).length;
        const tTotal = tasks.length;
        const pct = tTotal === 0 ? 0 : Math.round((tDone / tTotal) * 100);
        const statusCls = g.status === 'achieved' ? ' achieved' : g.status === 'abandoned' ? ' abandoned' : '';
        const expanded = this._expanded.has(g.id);
        const expCls = expanded ? ' expanded' : '';
        const dueOverdue = g.targetDate && g.status === 'active' && g.targetDate < new Date().toISOString().slice(0, 10);
        const nextStatus = g.status === 'active' ? 'achieved' : g.status === 'achieved' ? 'abandoned' : 'active';
        const statusBtnTitle = g.status === 'active' ? 'Marker som oppnådd'
            : g.status === 'achieved' ? 'Marker som forlatt'
            : 'Reaktiver';
        return html`
            <article class="${'gp-card' + statusCls + expCls}" id="${'gp-card-' + g.id}">
                <div class="gp-row">
                    <span class="gp-title" data-id="${g.id}" title="Klikk for å vise detaljer">
                        <span class="gp-chev">▸</span>${STATUS_ICON[g.status] || '🎯'} ${g.title}
                    </span>
                    <button class="gp-act gp-status" data-id="${g.id}" data-next="${nextStatus}" title="${statusBtnTitle}">
                        ${g.status === 'active' ? '🏆' : g.status === 'achieved' ? '🗑️' : '↻'}
                    </button>
                    <button class="gp-act gp-edit" data-id="${g.id}" title="Rediger">✏️</button>
                    <button class="gp-act gp-del" data-id="${g.id}" title="Slett">✕</button>
                </div>
                ${g.description ? html`<div class="gp-desc">${g.description}</div>` : ''}
                ${g.targetValue != null ? html`<div class="gp-value">${this._renderValue(g)}</div>` : ''}
                <div class="gp-meta">
                    ${g.targetDate ? unsafeHTML(`<span class="due${dueOverdue ? ' overdue' : ''}">📅 ${escapeHtml(g.targetDate)}</span>`) : ''}
                    <span class="gp-progress">
                        <span class="gp-bar"><i style="width:${pct}%"></i></span>
                        <span>${tDone}/${tTotal} oppgaver${tTotal ? ' (' + pct + '%)' : ''}</span>
                    </span>
                    ${results.length ? html`<span>📋 ${results.length} resultat${results.length === 1 ? '' : 'er'}</span>` : ''}
                </div>
                ${expanded ? this._renderDetail(g, tasks, results) : ''}
            </article>
        `;
    }

    _renderDetail(g, tasks, results) {
        const sortedTasks = tasks.slice().sort((a, b) => {
            if (!!a.done !== !!b.done) return a.done ? 1 : -1;
            return (b.created || '').localeCompare(a.created || '');
        });
        const sortedResults = results.slice().sort((a, b) =>
            (b.week || '').localeCompare(a.week || '')
            || (b.created || '').localeCompare(a.created || ''));
        return html`
            <div class="gp-detail">
                <div>
                    <h4>Oppgaver (${tasks.length})</h4>
                    ${tasks.length === 0
                        ? html`<p class="empty">Ingen oppgaver knyttet til dette målet ennå.</p>`
                        : html`<ul>${sortedTasks.map(t => html`
                            <li class="${t.done ? 'done' : ''}">
                                <span class="mark">${t.done ? '☑' : '☐'}</span>
                                <span class="text">${t.text || '(uten tekst)'}</span>
                                ${t.completedWeek
                                    ? html`<a class="wk" href="/${t.completedWeek}/" title="Fullført uke">${t.completedWeek}</a>`
                                    : t.week
                                        ? html`<a class="wk" href="/${t.week}/" title="Opprettet uke">${t.week}</a>`
                                        : ''}
                            </li>
                        `)}</ul>`}
                    <div class="gp-quickadd">
                        <task-create compact
                            tasks_service="week-note-services.tasks_service"
                            goal-id="${g.id}"
                            placeholder="➕ Ny oppgave knyttet til dette målet"
                            button-label="Legg til"></task-create>
                    </div>
                </div>
                <div>
                    <h4>Resultater (${results.length})</h4>
                    ${results.length === 0
                        ? html`<p class="empty">Ingen resultater knyttet til dette målet ennå.</p>`
                        : html`<ul>${sortedResults.map(r => html`
                            <li>
                                <span class="mark">📋</span>
                                <span class="text">${r.text || ''}</span>
                                ${r.week ? html`<a class="wk" href="/${r.week}/" title="Uke">${r.week}</a>` : ''}
                            </li>
                        `)}</ul>`}
                    <div class="gp-quickadd">
                        <result-create compact
                            results_service="week-note-services.results_service"
                            goal-id="${g.id}"
                            placeholder="➕ Nytt resultat knyttet til dette målet"
                            button-label="Legg til"></result-create>
                    </div>
                </div>
            </div>
        `;
    }

    _renderModal() {
        if (!this._modal) return '';
        const isNew = this._modal.mode === 'new';
        return html`
            <div class="modal open">
                <div class="modal-card">
                    <div class="modal-head">
                        <h3>${isNew ? '➕ Nytt mål' : '✏️ Rediger mål'}</h3>
                        <button class="modal-close" type="button" aria-label="Lukk">✕</button>
                    </div>
                    <div class="modal-form">
                        <label>Tittel
                            <input type="text" id="gpModalTitle" value="${this._modal.title || ''}" placeholder="Hva vil du oppnå?" />
                        </label>
                        <label>Beskrivelse (markdown)
                            <textarea id="gpModalDesc" rows="4" placeholder="Detaljer, suksesskriterier...">${this._modal.description || ''}</textarea>
                        </label>
                        <label>Måldato (valgfritt)
                            <input type="date" id="gpModalDate" value="${this._modal.targetDate || ''}" />
                        </label>
                        <div style="display:flex; gap:8px; align-items:flex-end;">
                            <label style="flex:1;">Nåverdi (valgfritt)
                                <input type="number" step="any" id="gpModalCurrentValue" value="${this._modal.currentValue || ''}" placeholder="0" />
                            </label>
                            <label style="flex:1;">Målverdi (valgfritt)
                                <input type="number" step="any" id="gpModalTargetValue" value="${this._modal.targetValue || ''}" placeholder="100" />
                            </label>
                            <label style="flex:0 0 90px;">Enhet
                                <input type="text" id="gpModalUnit" value="${this._modal.unit || ''}" placeholder="kg, NOK, …" maxlength="16" />
                            </label>
                        </div>
                        <label>Status
                            <select id="gpModalStatus">
                                <option value="active" ${this._modal.status === 'active' ? 'selected' : ''}>🎯 Aktiv</option>
                                <option value="achieved" ${this._modal.status === 'achieved' ? 'selected' : ''}>🏆 Oppnådd</option>
                                <option value="abandoned" ${this._modal.status === 'abandoned' ? 'selected' : ''}>🗑️ Forlatt</option>
                            </select>
                        </label>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn" type="button" data-act="cancel">Avbryt</button>
                        <button class="modal-btn primary" type="button" data-act="save">💾 Lagre</button>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        if (this._error === 'no-service') return this.renderNoService();
        if (this._error) return html`<div class="gp-error">Kunne ikke laste mål: ${this._error}</div>`;
        if (!this._state) return html`<div class="gp-loading">Laster…</div>`;

        const goals = this._state.goals || [];
        const byStatus = { active: [], achieved: [], abandoned: [] };
        goals.forEach(g => { (byStatus[g.status] || byStatus.active).push(g); });

        return html`
            <div class="gp">
                <div class="gp-head">
                    <h1>🎯 Mål</h1>
                    <button class="gp-btn-primary" id="gpNewBtn" type="button">➕ Nytt mål</button>
                </div>
                <p class="gp-hint">
                    Langsiktige mål du jobber mot. Knytt oppgaver og resultater til et mål for å se framdrift.
                </p>
                ${goals.length === 0
                    ? html`<p class="gp-empty">Ingen mål ennå. Klikk <strong>➕ Nytt mål</strong> for å legge til.</p>`
                    : STATUS_ORDER.map(st => {
                        const items = byStatus[st];
                        if (!items.length) return '';
                        return html`
                            <section class="gp-section">
                                <h2 class="gp-section-h">
                                    ${STATUS_ICON[st]} ${STATUS_LABEL[st]}
                                    <span class="c">${items.length}</span>
                                </h2>
                                ${items.map(g => this._renderCard(g))}
                            </section>
                        `;
                    })
                }
                ${this._renderModal()}
            </div>
        `;
    }
}

if (!customElements.get('goals-page')) customElements.define('goals-page', GoalsPage);
