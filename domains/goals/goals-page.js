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
    body:has(goals-page) { max-width: none; }
    .gp { display: flex; flex-direction: column; height: calc(100vh - 100px); min-height: 400px; }
    .gp-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; flex-wrap: wrap; flex: 0 0 auto; }
    .gp-head h1 {
        margin: 0; font-family: var(--font-heading, Georgia, serif);
        font-weight: 400; color: var(--accent);
    }
    .gp-hint { color: var(--text-subtle); font-size: 0.85em; margin: 0 0 12px; flex: 0 0 auto; }

    .gp-btn-primary {
        background: var(--accent); color: var(--surface, #fff);
        border: none; padding: 8px 16px; border-radius: 6px;
        font: inherit; font-weight: 600; cursor: pointer;
    }
    .gp-btn-primary:hover { filter: brightness(0.95); }

    /* --- master/detail layout --- */
    .gp-body { display: flex; gap: 0; flex: 1 1 auto; min-height: 0; border: 1px solid var(--border-soft); border-radius: 10px; overflow: hidden; }
    .gp-master {
        width: 320px; flex: 0 0 320px;
        border-right: 1px solid var(--border-soft);
        overflow-y: auto; background: var(--bg);
    }
    .gp-detail-pane {
        flex: 1 1 auto; min-width: 0;
        overflow-y: auto; padding: 24px 28px;
        background: var(--surface);
    }

    /* --- master list --- */
    .gp-section { margin: 0; }
    .gp-section-h {
        color: var(--text-muted); font-size: 0.72em; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.06em;
        margin: 0; padding: 10px 14px 4px;
        border-bottom: 1px solid var(--border-faint, var(--border-soft));
        display: flex; align-items: center; gap: 8px;
        position: sticky; top: 0; background: var(--bg); z-index: 1;
    }
    .gp-section-h .c { color: var(--text-subtle); font-size: 0.95em; font-weight: 500; }

    .gp-item {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 14px; cursor: pointer;
        border-bottom: 1px solid var(--border-faint, var(--border-soft));
        transition: background 0.12s;
    }
    .gp-item:hover { background: var(--surface-alt); }
    .gp-item.selected { background: var(--accent-soft); border-left: 3px solid var(--accent); padding-left: 11px; }
    .gp-item.achieved { opacity: 0.75; }
    .gp-item.abandoned { opacity: 0.55; }
    .gp-item-icon { flex: 0 0 auto; font-size: 1.05em; }
    .gp-item-body { flex: 1; min-width: 0; }
    .gp-item-title { font-weight: 600; font-size: 0.92em; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .gp-item-sub { font-size: 0.78em; color: var(--text-subtle); display: flex; align-items: center; gap: 8px; margin-top: 2px; }
    .gp-item-bar { width: 50px; height: 4px; background: var(--surface-head); border-radius: 2px; overflow: hidden; flex: 0 0 auto; }
    .gp-item-bar > i { display: block; height: 100%; background: var(--accent); border-radius: 2px; }

    /* --- detail pane --- */
    .gp-dp-empty { color: var(--text-subtle); font-style: italic; padding: 40px 0; text-align: center; }
    .gp-dp-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .gp-dp-title {
        flex: 1; margin: 0;
        font-family: var(--font-heading, Georgia, serif);
        font-weight: 400; font-size: 1.5em; color: var(--accent);
    }
    .gp-act {
        background: none; border: none; cursor: pointer;
        font-size: 1em; padding: 4px 8px; border-radius: 4px;
        font-family: inherit; color: var(--text-muted);
    }
    .gp-act:hover { background: var(--surface-head); }
    .gp-del { color: var(--danger, #c53030); }
    .gp-desc {
        color: var(--text-muted); font-size: 0.95em; line-height: 1.5;
        white-space: pre-wrap; word-break: break-word; margin: 0 0 16px;
    }
    .gp-meta {
        display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
        font-size: 0.85em; color: var(--text-subtle); margin-bottom: 20px;
    }
    .gp-meta .due { color: var(--text-muted-warm, var(--text-muted)); }
    .gp-meta .due.overdue { color: var(--danger, #c53030); font-weight: 600; }
    .gp-people { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .gp-people .gp-person {
        display: inline-flex; align-items: center; padding: 1px 8px;
        font-size: 0.92em; line-height: 1.6;
        background: var(--accent-soft); color: var(--accent-strong);
        border-radius: 10px; text-decoration: none;
        border: 1px solid var(--border-soft);
    }
    .gp-people .gp-person:hover { background: var(--accent); color: var(--text-on-accent); }
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
        margin: 0 0 16px; font-size: 0.95em;
    }
    .gp-value .gp-vbar {
        flex: 1; max-width: 260px; height: 8px;
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

    .gp-detail {
        display: flex; flex-direction: column; gap: 20px;
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
    .gp-detail li input.mark { margin: 0; cursor: pointer; align-self: center; }
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
    static get observedAttributes() { return ['goals_service', 'tasks_service', 'results_service', 'people_service']; }

    constructor() {
        super();
        this._state = null;
        this._error = null;
        this._modal = null;
        this._selectedId = null;
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._wire();
        const m = (location.hash || '').match(/^#g-(.+)$/);
        if (m) this._selectedId = decodeURIComponent(m[1]);
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
        if (oldVal !== newVal) this.invalidateAwait();
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    loadData() {
        if (!this.service) return {};
        const tasksSvc = this.serviceFor('tasks');
        const resultsSvc = this.serviceFor('results');
        const peopleSvc = this.serviceFor('people');
        return {
            goals: async () => {
                const g = await this.service.list();
                return (g || []).slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
            },
            tasks:   () => tasksSvc ? tasksSvc.list() : Promise.resolve([]),
            results: () => resultsSvc ? resultsSvc.list() : Promise.resolve([]),
            people:  () => peopleSvc ? peopleSvc.list() : Promise.resolve([]),
        };
    }

    _refresh() { this.invalidateAwait(); this.requestRender(); }

    _wire() {
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
        this.shadowRoot.addEventListener('change', (e) => this._onChange(e));
        this.shadowRoot.addEventListener('task:created', () => this._refresh());
        this.shadowRoot.addEventListener('task:completed', () => this._refresh());
        this.shadowRoot.addEventListener('result:created', () => this._refresh());
    }

    _onChange(e) {
        const cb = e.target.closest('input[data-act="toggle"]');
        if (!cb) return;
        const id = cb.dataset.taskid;
        const text = cb.dataset.tasktext || '';
        const tasksSvc = this.serviceFor('tasks');
        if (!tasksSvc || typeof tasksSvc.toggle !== 'function') {
            cb.checked = !cb.checked;
            return;
        }
        if (cb.checked) {
            this.dispatchEvent(new CustomEvent('task:request-complete', {
                bubbles: true, composed: true,
                detail: {
                    id, text,
                    callback: async (res) => {
                        if (!res || !res.confirmed) { cb.checked = false; return; }
                        try { await tasksSvc.toggle(res.id, res.comment || ''); }
                        catch (err) { console.error('goals-page: toggle failed', err); }
                        this._refresh();
                        this.dispatchEvent(new CustomEvent('task:completed', {
                            bubbles: true, composed: true,
                            detail: { id: res.id, comment: res.comment || '' },
                        }));
                    },
                },
            }));
        } else {
            (async () => {
                try { await tasksSvc.toggle(id, ''); }
                catch (err) { console.error('goals-page: toggle failed', err); }
                this._refresh();
            })();
        }
    }

    _onClick(e) {
        const path = e.composedPath();
        if (path.find(n => n.id === 'gpNewBtn')) { this._openNew(); return; }
        const item = path.find(n => n.classList && n.classList.contains('gp-item'));
        if (item && item.dataset.id) {
            // don't select if clicking an action button inside the item
            if (!path.find(n => n.classList && (n.classList.contains('gp-act') || n.classList.contains('gp-del')))) {
                this._selectedId = item.dataset.id;
                history.replaceState(null, '', '#g-' + encodeURIComponent(item.dataset.id));
                this.requestRender();
                return;
            }
        }
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

    _select(id) {
        this._selectedId = id;
        history.replaceState(null, '', '#g-' + encodeURIComponent(id));
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
            this._refresh();
        } catch (e) {
            alert((e && e.message) || 'Feil');
        }
    }

    async _cycleStatus(id, next) {
        try {
            await this.service.update(id, { status: next });
            this._refresh();
        } catch (e) { alert((e && e.message) || 'Feil'); }
    }

    async _delete(id) {
        if (!confirm('Slett dette målet? Koblinger til oppgaver/resultater vil bli fjernet.')) return;
        try {
            await this.service.remove(id);
            this._refresh();
        } catch (e) { alert((e && e.message) || 'Feil'); }
    }

    _participantsFor(tasks) {
        const people = this._state.people || [];
        if (!people.length || !tasks.length) return [];
        const byKey = new Map(people.filter(p => !p.deleted).map(p => [String(p.key || '').toLowerCase(), p]));
        const seen = new Set();
        const out = [];
        const add = (key) => {
            const k = String(key || '').toLowerCase();
            if (!k || seen.has(k)) return;
            const p = byKey.get(k);
            if (!p) return;
            seen.add(k);
            out.push(p);
        };
        const re = /(?:^|[\s\n(\[])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g;
        for (const t of tasks) {
            if (t.responsible) add(t.responsible);
            const blob = String(t.text || '') + '\n' + String(t.note || '');
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(blob))) add(m[1]);
        }
        out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'nb'));
        return out;
    }

    _renderItem(g) {
        const tasks = (this._state.tasks || []).filter(t => t.goalId === g.id);
        const tDone = tasks.filter(t => t.done).length;
        const tTotal = tasks.length;
        const pct = tTotal === 0 ? 0 : Math.round((tDone / tTotal) * 100);
        const selected = this._selectedId === g.id;
        const statusCls = g.status === 'achieved' ? ' achieved' : g.status === 'abandoned' ? ' abandoned' : '';
        const selCls = selected ? ' selected' : '';
        return html`
            <div class="${'gp-item' + statusCls + selCls}" data-id="${g.id}">
                <span class="gp-item-icon">${STATUS_ICON[g.status] || '🎯'}</span>
                <div class="gp-item-body">
                    <div class="gp-item-title">${g.title}</div>
                    <div class="gp-item-sub">
                        ${g.targetDate ? html`<span>📅 ${g.targetDate}</span>` : ''}
                        <span>${tDone}/${tTotal}</span>
                        ${tTotal ? html`<span class="gp-item-bar">${unsafeHTML(`<i style="width:${pct}%"></i>`)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    _renderDetailPane(g) {
        const tasks = (this._state.tasks || []).filter(t => t.goalId === g.id);
        const results = (this._state.results || []).filter(r => r.goalId === g.id);
        const tDone = tasks.filter(t => t.done).length;
        const tTotal = tasks.length;
        const pct = tTotal === 0 ? 0 : Math.round((tDone / tTotal) * 100);
        const dueOverdue = g.targetDate && g.status === 'active' && g.targetDate < new Date().toISOString().slice(0, 10);
        const nextStatus = g.status === 'active' ? 'achieved' : g.status === 'achieved' ? 'abandoned' : 'active';
        const statusBtnTitle = g.status === 'active' ? 'Marker som oppnådd'
            : g.status === 'achieved' ? 'Marker som forlatt'
            : 'Reaktiver';

        return html`
            <div class="gp-dp-head">
                <h2 class="gp-dp-title">${STATUS_ICON[g.status] || '🎯'} ${g.title}</h2>
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
                ${(() => {
                    const participants = this._participantsFor(tasks);
                    if (!participants.length) return '';
                    return html`<span class="gp-people" title="Deltakere fra oppgavene">👥 ${participants.map(p => html`<a class="gp-person" href="/people#p-${encodeURIComponent(p.key || '')}" title="${p.name || p.key}">@${p.name || p.key}</a>`)}</span>`;
                })()}
            </div>
            ${this._renderDetail(g, tasks, results)}
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
                                <input type="checkbox" class="mark" data-act="toggle"
                                    data-taskid="${t.id}" data-tasktext="${t.text || ''}"
                                    ${t.done ? unsafeHTML('checked') : ''}>
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

    render(data = {}) {
        if (!this.service) return this.renderNoService();
        if (data._loading) return html`<div class="gp-loading">Laster…</div>`;
        if (!Array.isArray(data.goals)) return html`<div class="gp-error">Kunne ikke laste mål</div>`;

        this._state = { goals: data.goals, tasks: data.tasks || [], results: data.results || [], people: data.people || [] };
        const goals = data.goals;
        const byStatus = { active: [], achieved: [], abandoned: [] };
        goals.forEach(g => { (byStatus[g.status] || byStatus.active).push(g); });

        // auto-select first active goal if nothing selected
        if (!this._selectedId || !goals.find(g => g.id === this._selectedId)) {
            this._selectedId = (byStatus.active[0] || goals[0] || {}).id || null;
        }
        const selected = goals.find(g => g.id === this._selectedId);

        const masterList = goals.length === 0
            ? html`<p class="gp-empty" style="padding:14px;">Ingen mål ennå.</p>`
            : STATUS_ORDER.map(st => {
                const items = byStatus[st];
                if (!items.length) return '';
                return html`
                    <section class="gp-section">
                        <h2 class="gp-section-h">
                            ${STATUS_ICON[st]} ${STATUS_LABEL[st]}
                            <span class="c">${items.length}</span>
                        </h2>
                        ${items.map(g => this._renderItem(g))}
                    </section>
                `;
            });

        return html`
            <div class="gp">
                <div class="gp-head">
                    <h1>🎯 Mål</h1>
                    <button class="gp-btn-primary" id="gpNewBtn" type="button">➕ Nytt mål</button>
                </div>
                <p class="gp-hint">
                    Langsiktige mål du jobber mot. Knytt oppgaver og resultater til et mål for å se framdrift.
                </p>
                <div class="gp-body">
                    <nav class="gp-master">${masterList}</nav>
                    <div class="gp-detail-pane">
                        ${selected
                            ? this._renderDetailPane(selected)
                            : html`<p class="gp-dp-empty">Velg et mål fra listen</p>`}
                    </div>
                </div>
                ${this._renderModal()}
            </div>
        `;
    }
}

if (!customElements.get('goals-page')) customElements.define('goals-page', GoalsPage);
