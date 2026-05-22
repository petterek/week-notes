/**
 * <tasks-page tasks_service="…" people_service="…" companies_service="…">
 *
 * Full-page table view for tasks. Sortable columns, inline filter,
 * quick-create, and integrated actions (complete, edit, note, delete).
 *
 * Service contract:
 *   tasks_service.list()               → Task[]
 *   tasks_service.create(text, opts)   → Task
 *   tasks_service.toggle(id, comment?) → Task
 *   tasks_service.update(id, patch)    → Task
 *   tasks_service.remove(id)           → { ok }
 *   people_service.list()              → Person[]
 *   companies_service.list()           → Company[]
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions, wireMentionClicks } from './_shared.js';
import './task-complete-modal.js';
import './task-note-modal.js';
import './task-edit-modal.js';
import './task-view-modal.js';

function isOverdue(due, done) {
    if (done || !due) return false;
    const m = String(due).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/);
    if (!m) return false;
    const hasTime = m[4] != null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], hasTime ? +m[4] : 23, hasTime ? +m[5] : 59);
    return d < new Date();
}

function fmtDate(d) {
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}.${m[2]}` : d;
}

function weekLabel(w) {
    if (!w) return '';
    const m = w.match(/W(\d+)$/);
    return m ? `W${+m[1]}` : w;
}

const STYLES = `
    :host { display: block; padding: 20px 24px 60px; color: var(--text-strong); font: inherit; }
    body:has(tasks-page) { max-width: none; }

    .tp { max-width: 1100px; margin: 0 auto; }

    /* --- toolbar --- */
    .tp-toolbar {
        display: flex; align-items: center; gap: 12px;
        margin-bottom: 16px; flex-wrap: wrap;
    }
    .tp-toolbar h1 {
        font-family: var(--font-heading, Georgia, serif);
        font-weight: 400; color: var(--accent);
        margin: 0; font-size: 1.4em; margin-right: auto;
    }
    .tp-stats {
        font-size: 0.85em; color: var(--text-muted);
        margin-right: 8px;
    }
    .tp-filter {
        padding: 7px 12px; border: 1px solid var(--border);
        border-radius: 6px; font-size: 0.85em; width: 220px;
        background: var(--surface); color: var(--text);
        font: inherit;
    }
    .tp-filter:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
    .tp-btn {
        padding: 7px 14px; background: var(--accent);
        color: var(--text-on-accent, #fff); border: none;
        border-radius: 6px; cursor: pointer; font: inherit;
        font-size: 0.85em; font-weight: 500;
    }
    .tp-btn:hover { filter: brightness(0.92); }

    /* --- create row --- */
    .tp-create {
        display: flex; gap: 8px; align-items: center;
        margin-bottom: 16px;
        background: var(--surface); border: 1px solid var(--border-soft);
        border-radius: 8px; padding: 10px 14px;
    }
    .tp-create input {
        flex: 1; padding: 8px 10px; border: 1px solid var(--border);
        border-radius: 6px; font: inherit; font-size: 0.9em;
        background: var(--surface); color: var(--text);
    }
    .tp-create input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
    .tp-create button {
        padding: 8px 14px; background: var(--accent);
        color: var(--text-on-accent, #fff); border: none;
        border-radius: 6px; cursor: pointer; font: inherit;
        font-weight: 500; font-size: 0.9em;
    }
    .tp-create button:hover { filter: brightness(0.92); }

    /* --- tabs --- */
    .tp-tabs {
        display: flex; gap: 2px; margin-bottom: 12px;
        border-bottom: 1px solid var(--border-soft);
    }
    .tp-tab {
        padding: 8px 16px; border: none; background: transparent;
        font: inherit; font-size: 0.85em; cursor: pointer;
        color: var(--text-muted); border-bottom: 2px solid transparent;
        margin-bottom: -1px; font-weight: 500;
    }
    .tp-tab:hover { color: var(--text-strong); }
    .tp-tab.active {
        color: var(--accent); border-bottom-color: var(--accent);
    }
    .tp-tab .count {
        font-size: 0.85em; margin-left: 4px;
        color: var(--text-subtle);
    }

    /* --- table --- */
    .tp-table {
        width: 100%; border-collapse: separate; border-spacing: 0;
        background: var(--surface); border: 1px solid var(--border-soft);
        border-radius: 10px; overflow: hidden;
    }
    .tp-table th {
        text-align: left; padding: 10px 14px;
        font-size: 0.75em; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--text-muted);
        font-weight: 600; background: var(--surface-alt);
        border-bottom: 1px solid var(--border-soft);
        cursor: pointer; user-select: none; white-space: nowrap;
    }
    .tp-table th:hover { color: var(--accent); }
    .tp-table th .arrow { margin-left: 3px; font-size: 0.9em; }
    .tp-table td {
        padding: 10px 14px; font-size: 0.88em;
        border-bottom: 1px solid var(--border-faint);
        color: var(--text); vertical-align: middle;
    }
    .tp-table tr:last-child td { border-bottom: none; }
    .tp-table tr:hover td { background: var(--accent-soft, rgba(42,67,101,0.04)); }
    .tp-table .task-title {
        font-weight: 500; color: var(--text-strong);
        word-break: break-word; cursor: pointer;
    }
    .tp-table .task-title:hover { color: var(--accent); }
    .tp-table .task-title a { color: var(--accent); text-decoration: none; }
    .tp-table .task-title a:hover { text-decoration: underline; }
    .tp-table .task-done .task-title {
        text-decoration: line-through; color: var(--text-subtle);
        font-weight: 400;
    }
    .tp-table .overdue { color: var(--danger, #c53030); font-weight: 500; }
    .tp-table .badge {
        display: inline-block; padding: 2px 8px;
        border-radius: 10px; font-size: 0.82em; font-weight: 500;
        white-space: nowrap;
    }
    .badge-open { background: var(--accent-soft, #ebf4ff); color: var(--accent); }
    .badge-overdue { background: var(--danger-soft, rgba(197,48,48,0.12)); color: var(--danger, #c53030); }
    .badge-done { background: rgba(39, 103, 73, 0.1); color: #276749; }
    .people-cell { font-size: 0.82em; color: var(--text-muted); }
    .goal-cell { font-size: 0.82em; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
    .actions-cell { display: flex; gap: 2px; }
    .actions-cell button {
        border: none; background: transparent; cursor: pointer;
        padding: 4px 5px; border-radius: 4px;
        color: var(--text-muted); font-size: 0.9em;
    }
    .actions-cell button:hover { background: var(--surface-alt); color: var(--text-strong); }

    .tp-empty {
        text-align: center; padding: 40px;
        color: var(--text-subtle); font-style: italic;
    }

    /* --- done toggle --- */
    .tp-done-toggle {
        margin-top: 16px;
    }
    .tp-done-toggle summary {
        cursor: pointer; font-size: 0.9em; color: var(--text-muted);
        user-select: none; padding: 8px 4px; list-style: none;
        display: inline-flex; align-items: center; gap: 8px;
    }
    .tp-done-toggle summary::-webkit-details-marker { display: none; }
    .tp-done-toggle summary::before {
        content: '▸'; font-size: 0.8em; transition: transform 0.15s;
        color: var(--text-subtle);
    }
    .tp-done-toggle[open] summary::before { transform: rotate(90deg); }
    .tp-done-toggle summary:hover { color: var(--text-strong); }
`;

class TasksPage extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['tasks_service', 'people_service', 'companies_service']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._sort = { col: 'week', dir: 'desc' };
        this._filter = '';
        this._tab = 'open';
        if (!this._wired) this._wire();
    }

    taskCreated()     { this.refresh(); }
    taskCompleted()   { this.refresh(); }
    taskUncompleted() { this.refresh(); }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) this.invalidateAwait();
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    refresh() {
        this.invalidateAwait();
        if (this.isConnected) this.requestRender();
    }

    loadData() {
        if (!this.service) return null;
        const peopleSvc = this.serviceFor('people');
        const compSvc = this.serviceFor('companies');
        const goalsSvc = this.serviceFor('goals');
        return {
            tasks:     () => this.service.list(),
            people:    () => peopleSvc ? peopleSvc.list() : Promise.resolve([]),
            companies: () => compSvc   ? compSvc.list()   : Promise.resolve([]),
            goals:     () => goalsSvc  ? goalsSvc.list()  : Promise.resolve([]),
        };
    }

    _wire() {
        if (this._wired) return;
        this._wired = true;

        this.shadowRoot.addEventListener('change', (ev) => {
            const cb = ev.target.closest('input[data-act="toggle"]');
            if (!cb) return;
            const id = cb.dataset.taskid;
            const task = this._findTask(id);
            if (!task) return;
            if (!task.done) {
                // Completing — dispatch to global modal
                cb.checked = false; // revert until confirmed
                this.dispatchEvent(new CustomEvent('task:request-complete', {
                    bubbles: true, composed: true,
                    detail: {
                        id, text: task.text || '',
                        callback: async (res) => {
                            if (!res || !res.confirmed) return;
                            try {
                                await this.service.toggle(res.id, res.comment || '');
                            } catch (err) { console.error('tasks-page: toggle failed', err); }
                            this.refresh();
                            this.dispatchEvent(new CustomEvent('task:completed', {
                                bubbles: true, composed: true,
                                detail: { id: res.id, comment: res.comment || '' },
                            }));
                        },
                    },
                }));
            } else {
                // Uncompleting
                (async () => {
                    try { await this.service.toggle(id); }
                    catch (err) { console.error('tasks-page: undo failed', err); }
                    this.refresh();
                    this.dispatchEvent(new CustomEvent('task:uncompleted', {
                        bubbles: true, composed: true, detail: { id },
                    }));
                })();
            }
        });

        this.shadowRoot.addEventListener('click', (ev) => {
            // View task (click on title cell)
            const viewCell = ev.target.closest('td[data-act="view"]');
            if (viewCell && !ev.target.closest('.entity-mention')) {
                const task = this._findTask(viewCell.dataset.taskid);
                if (!task) return;
                this._openViewModal(task);
                return;
            }
            const noteBtn = ev.target.closest('button[data-act="note"]');
            if (noteBtn) {
                const task = this._findTask(noteBtn.dataset.taskid);
                if (!task) return;
                const modal = this.shadowRoot.querySelector('task-note-modal');
                if (!modal) return;
                modal.open({ id: task.id, text: task.text, note: task.note || '' }, async (res) => {
                    if (!res || !res.saved) return;
                    try { await this.service.update(res.id, { note: res.note }); }
                    catch (err) { console.error('tasks-page: note update failed', err); }
                    this.refresh();
                });
                return;
            }
            const editBtn = ev.target.closest('button[data-act="edit"]');
            if (editBtn) {
                const task = this._findTask(editBtn.dataset.taskid);
                if (!task) return;
                this.dispatchEvent(new CustomEvent('task:request-edit', {
                    bubbles: true, composed: true,
                    detail: { task, service: this.service, callback: (res) => { if (res && res.saved) this.refresh(); } },
                }));
                return;
            }
            const delBtn = ev.target.closest('button[data-act="delete"]');
            if (delBtn) {
                const task = this._findTask(delBtn.dataset.taskid);
                if (!task) return;
                if (!confirm(`Slette oppgaven «${task.text}»?`)) return;
                (async () => {
                    try { await this.service.remove(task.id); }
                    catch (err) { console.error('tasks-page: delete failed', err); }
                    this.refresh();
                    this.dispatchEvent(new CustomEvent('task:deleted', {
                        bubbles: true, composed: true, detail: { id: task.id },
                    }));
                })();
                return;
            }
            // Sort header clicks
            const th = ev.target.closest('th[data-col]');
            if (th) {
                const col = th.dataset.col;
                if (this._sort.col === col) {
                    this._sort.dir = this._sort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    this._sort = { col, dir: col === 'title' ? 'asc' : 'desc' };
                }
                this.requestRender();
                return;
            }
            // Tab clicks
            const tab = ev.target.closest('button[data-tab]');
            if (tab) {
                this._tab = tab.dataset.tab;
                this.requestRender();
                return;
            }
        });

        // Filter input — apply visibility without re-rendering
        this.shadowRoot.addEventListener('input', (ev) => {
            if (ev.target.matches('.tp-filter')) {
                this._filter = ev.target.value.toLowerCase().trim();
                this._applyFilter();
            }
        });

        // Create form
        this.shadowRoot.addEventListener('keydown', (ev) => {
            if (ev.target.matches('.tp-create-input') && ev.key === 'Enter') {
                ev.preventDefault();
                this._doCreate();
            }
        });
        this.shadowRoot.addEventListener('click', (ev) => {
            if (ev.target.closest('.tp-create-btn')) this._doCreate();
        });

        wireMentionClicks(this.shadowRoot);
    }

    async _doCreate() {
        const input = this.shadowRoot.querySelector('.tp-create-input');
        const text = (input && input.value || '').trim();
        if (!text) return;
        try {
            await this.service.create(text);
            input.value = '';
            this.refresh();
            this.dispatchEvent(new CustomEvent('task:created', {
                bubbles: true, composed: true, detail: { text },
            }));
        } catch (err) { console.error('tasks-page: create failed', err); }
    }

    _findTask(id) {
        return (this._lastTasks || []).find(t => String(t.id) === String(id));
    }

    _openViewModal(task) {
        const modal = this.shadowRoot.querySelector('task-view-modal');
        if (!modal) return;
        const people = this._lastPeople || [];
        const goals = this._lastGoals || [];
        const companies = this._lastCompanies || [];
        modal.open(task, {
            people,
            goals,
            companies,
            onEdit: (t) => {
                this.dispatchEvent(new CustomEvent('task:request-edit', {
                    bubbles: true, composed: true,
                    detail: { task: t, service: this.service, callback: (res) => { if (res && res.saved) this.refresh(); } },
                }));
            },
            onComplete: (t) => {
                this.dispatchEvent(new CustomEvent('task:request-complete', {
                    bubbles: true, composed: true,
                    detail: {
                        id: t.id, text: t.text || '',
                        callback: async (res) => {
                            if (!res || !res.confirmed) return;
                            try { await this.service.toggle(res.id, res.comment || ''); }
                            catch (err) { console.error('tasks-page: toggle failed', err); }
                            this.refresh();
                        },
                    },
                }));
            },
            onUncomplete: async (t) => {
                try { await this.service.toggle(t.id); }
                catch (err) { console.error('tasks-page: undo failed', err); }
                this.refresh();
            },
        });
    }

    _applyFilter() {
        const rows = this.shadowRoot.querySelectorAll('tr[data-taskid]');
        const q = this._filter;
        let visibleCount = 0;
        rows.forEach(row => {
            if (!q) { row.style.display = ''; visibleCount++; return; }
            const text = (row.dataset.filtertext || '').toLowerCase();
            const match = text.includes(q);
            row.style.display = match ? '' : 'none';
            if (match) visibleCount++;
        });
        const empty = this.shadowRoot.querySelector('.tp-empty');
        if (empty) empty.style.display = visibleCount === 0 ? '' : 'none';
    }

    afterRender() {
        // Restore filter input value after re-render
        const input = this.shadowRoot.querySelector('.tp-filter');
        if (input && this._filter) {
            input.value = this._filter;
            this._applyFilter();
        }
    }

    render(data = {}) {
        if (!this.service) return this.renderNoService();
        if (data._loading) return html`<div class="tp"><p style="color:var(--text-subtle);font-style:italic">Laster…</p></div>`;
        const all = Array.isArray(data.tasks) ? data.tasks : [];
        this._lastTasks = all;
        const people = data.people || [];
        const companies = data.companies || [];
        this._lastPeople = people;
        this._lastCompanies = companies;
        this._lastGoals = data.goals || [];

        const open = all.filter(t => !t.done);
        const done = all.filter(t => t.done);
        const overdueCount = open.filter(t => isOverdue(t.dueDate, t.done)).length;

        // Determine which set to show
        let visible = this._tab === 'done' ? done : open;

        // Sort (filter is applied post-render via _applyFilter)
        visible = this._sortTasks(visible);

        const statsText = `${open.length} åpne${overdueCount ? ` · ⚠️ ${overdueCount} forfalte` : ''} · ${done.length} fullført`;

        const arrow = (col) => {
            if (this._sort.col !== col) return '';
            return this._sort.dir === 'asc' ? '↑' : '↓';
        };

        const goals = this._lastGoals || [];
        const rows = visible.map(t => this._renderRow(t, people, companies, goals));

        return html`
            <div class="tp">
                <div class="tp-toolbar">
                    <h1>Oppgaver</h1>
                    <span class="tp-stats">${statsText}</span>
                    <input class="tp-filter" type="text" placeholder="🔍 Filtrer…">
                </div>
                <div class="tp-create">
                    <input class="tp-create-input" type="text" placeholder="Ny oppgave…">
                    <button class="tp-create-btn" type="button">+ Opprett</button>
                </div>
                <div class="tp-tabs">
                    <button class="tp-tab${this._tab === 'open' ? ' active' : ''}" data-tab="open">
                        Åpne<span class="count">${open.length}</span>
                    </button>
                    <button class="tp-tab${this._tab === 'done' ? ' active' : ''}" data-tab="done">
                        Fullført<span class="count">${done.length}</span>
                    </button>
                </div>
                ${visible.length === 0
                    ? html`<div class="tp-empty">${this._tab === 'done' ? 'Ingen fullførte oppgaver' : 'Ingen åpne oppgaver'}</div>`
                    : html`
                        <table class="tp-table">
                            <thead>
                                <tr>
                                    <th style="width:34px"></th>
                                    <th data-col="title">Oppgave <span class="arrow">${arrow('title')}</span></th>
                                    <th data-col="week" style="width:70px">Uke <span class="arrow">${arrow('week')}</span></th>
                                    <th data-col="due" style="width:90px">Frist <span class="arrow">${arrow('due')}</span></th>
                                    <th data-col="responsible" style="width:110px">Ansvarlig</th>
                                    <th style="width:130px">Deltakere</th>
                                    <th style="width:130px">Mål</th>
                                    <th data-col="status" style="width:80px">Status</th>
                                    <th style="width:90px"></th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                        <div class="tp-empty" style="display:none">Ingen treff</div>
                    `
                }
                <task-note-modal></task-note-modal>
                <task-view-modal></task-view-modal>
            </div>
        `;
    }

    _renderRow(t, people, companies, goals) {
        const id = t.id || '';
        const overdue = isOverdue(t.dueDate, t.done);
        const textHtml = unsafeHTML(linkMentions(escapeHtml(t.text || ''), people, companies));
        const week = weekLabel(t.week);
        const due = t.dueDate ? fmtDate(t.dueDate) : '—';

        // Responsible
        let respName = '—';
        if (t.responsible) {
            const rp = people.find(pp => pp.key === t.responsible);
            respName = rp ? (rp.name || rp.key) : t.responsible;
        }

        // Participants (excluding responsible)
        const parts = (t.participants || []).filter(k => k !== t.responsible);
        const partsStr = parts.map(k => {
            const p = people.find(pp => pp.key === k);
            return p ? (p.name || p.key) : k;
        }).join(', ');

        // Goal
        let goalName = '—';
        if (t.goalId) {
            const g = goals.find(gg => gg.id === t.goalId);
            goalName = g ? (g.title || g.text || t.goalId) : t.goalId;
        }

        const status = t.done
            ? html`<span class="badge badge-done">Fullført</span>`
            : (overdue
                ? html`<span class="badge badge-overdue">Forfalt</span>`
                : html`<span class="badge badge-open">Åpen</span>`);
        const hasNote = !!(t.note && t.note.trim());
        const noteCls = hasNote ? '' : ' style="opacity:0.4"';
        const filterText = [t.text || '', t.note || '', respName, partsStr, goalName, t.responsible || ''].join(' ');

        return html`
            <tr class="${t.done ? 'task-done' : ''}" data-taskid="${id}" data-filtertext="${escapeHtml(filterText)}">
                <td><input type="checkbox" data-act="toggle" data-taskid="${id}" ${t.done ? 'checked' : ''}></td>
                <td class="task-title" data-act="view" data-taskid="${id}">${textHtml}</td>
                <td>${week}</td>
                <td class="${overdue ? 'overdue' : ''}">${overdue ? '⚠️ ' : ''}${due}</td>
                <td class="people-cell">${respName}</td>
                <td class="people-cell">${partsStr || '—'}</td>
                <td class="goal-cell">${goalName}</td>
                <td>${status}</td>
                <td class="actions-cell">
                    <button type="button" data-act="note" data-taskid="${id}" title="${hasNote ? 'Rediger notat' : 'Legg til notat'}"${unsafeHTML(noteCls)}>📓</button>
                    <button type="button" data-act="edit" data-taskid="${id}" title="Rediger">✏️</button>
                    <button type="button" data-act="delete" data-taskid="${id}" title="Slett">🗑️</button>
                </td>
            </tr>
        `;
    }

    _sortTasks(tasks) {
        const { col, dir } = this._sort;
        const mult = dir === 'asc' ? 1 : -1;
        return [...tasks].sort((a, b) => {
            // Overdue always first in open tab
            if (this._tab === 'open') {
                const ao = isOverdue(a.dueDate, a.done) ? 0 : 1;
                const bo = isOverdue(b.dueDate, b.done) ? 0 : 1;
                if (ao !== bo) return ao - bo;
            }
            let av, bv;
            switch (col) {
                case 'title':
                    av = (a.text || '').toLowerCase();
                    bv = (b.text || '').toLowerCase();
                    return mult * av.localeCompare(bv);
                case 'week':
                    av = a.week || '';
                    bv = b.week || '';
                    return mult * av.localeCompare(bv);
                case 'due':
                    av = a.dueDate || '';
                    bv = b.dueDate || '';
                    if (!av && !bv) return 0;
                    if (!av) return 1;
                    if (!bv) return -1;
                    return mult * av.localeCompare(bv);
                case 'status':
                    av = a.done ? 1 : (isOverdue(a.dueDate, a.done) ? 0 : 2);
                    bv = b.done ? 1 : (isOverdue(b.dueDate, b.done) ? 0 : 2);
                    return mult * (av - bv);
                default:
                    return 0;
            }
        });
    }
}

if (!customElements.get('tasks-page')) customElements.define('tasks-page', TasksPage);
