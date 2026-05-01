/**
 * <task-open-list service="TaskService"> — self-loading sidebar widget that lists
 * open tasks. Renders inside its own shadow DOM. Theming flows from the page
 * via inherited CSS custom properties (--accent, --text, --surface, …).
 *
 * Service contract (window[serviceName]):
 *   list()                 → Promise<Task[]>
 *   toggle(id, comment?)   → Promise<Task>      (used to complete a task)
 *
 * Completion flow:
 *   Clicking the checkbox opens a <task-complete-modal>. The component
 *   waits for the modal's 'task-complete:confirm' (calls service.toggle
 *   with the comment, then refreshes) or 'task-complete:cancel' (reverts
 *   the checkbox).
 *
 * Action handlers (optional window globals; component dispatches events as fallback):
 *   - openNoteModal(taskId)      : note button
 * Mentions bubble 'mention-clicked' (handled at page level).
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions, wireMentionClicks } from './_shared.js';
import './task-complete-modal.js';
import './task-create-modal.js';
import './task-note-modal.js';

const STYLES = `
        :host { display: block; color: var(--text-strong); font: inherit; }
        .side-h {
            display: flex; align-items: center; justify-content: space-between;
            gap: 8px;
            font-family: var(--font-heading);
            font-weight: 400;
            color: var(--accent);
            border-bottom: 1px solid var(--border-soft);
            padding-bottom: 6px;
            margin: 0 0 10px;
            font-size: 1.05em;
        }
        .side-h-title { display: flex; align-items: baseline; gap: 6px; }
        .add-btn {
            padding: 2px 10px; border: 1px solid var(--accent); background: var(--accent);
            color: var(--text-on-accent); border-radius: 5px; cursor: pointer;
            font: inherit; font-size: 0.85em;
        }
        .add-btn:hover { background: var(--accent-strong); }
        .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }
        .sidebar-tasks { display: flex; flex-direction: column; gap: 6px; }
        .sidebar-task { padding: 6px 8px; border-radius: 6px; background: var(--surface); }
        .sidebar-task:hover { background: var(--surface-alt); }
        .row { display: flex; align-items: center; gap: 8px; }
        .row input[type="checkbox"] { accent-color: var(--accent); }
        .row-text { flex: 1; word-break: break-word; }
        .row-text a { color: var(--accent); text-decoration: none; }
        .row-text a:hover { text-decoration: underline; }
        .row-note-btn {
            border: 0; background: transparent; cursor: pointer;
            opacity: 0.6; padding: 0 4px; font-size: 1em;
        }
        .row-note-btn:hover { opacity: 1; }
        .row-note-btn.empty { opacity: 0.25; }
        .row-del-btn {
            border: 0; background: transparent; cursor: pointer;
            opacity: 0.35; padding: 0 4px; font-size: 1em;
            color: #c53030;
        }
        .row-del-btn:hover { opacity: 1; }
        .row-note-body {
            margin: 6px 0 2px 26px;
            color: var(--text); font-size: 0.92em;
        }
        .row-note-body p { margin: 2px 0; }
`;

function renderTask(t, people, companies) {
        const id = t.id || '';
        const week = t.week || '';
        const weekBadge = week ? unsafeHTML(`<week-pill week="${escapeHtml(week)}"></week-pill>`) : '';
        const textHtml = unsafeHTML(linkMentions(escapeHtml(t.text || ''), people, companies));
        const hasNote = !!(t.note && t.note.trim());
        const noteHtml = hasNote && window.marked
            ? linkMentions(window.marked.parse(t.note), people, companies)
            : (hasNote ? escapeHtml(t.note) : '');
        const noteBody = hasNote ? unsafeHTML(`<div class="md-content row-note-body">${noteHtml}</div>`) : '';
        const noteBtnCls = hasNote ? 'row-note-btn' : 'row-note-btn empty';
        const noteBtnTitle = hasNote ? 'Rediger notat' : 'Legg til notat';
        return html`
            <div class="sidebar-task" data-taskid="${id}">
                <div class="row">
                    <input type="checkbox" data-taskid="${id}" data-tasktext="${t.text || ''}" data-act="toggle" />
                    <span class="row-text">${textHtml}</span>
                    ${weekBadge}
                    <button type="button" class="${noteBtnCls}" data-act="note" data-taskid="${id}" title="${noteBtnTitle}">📓</button>
                    <button type="button" class="row-del-btn" data-act="delete" data-taskid="${id}" data-tasktext="${t.text || ''}" title="Slett oppgave">✕</button>
                </div>
                ${noteBody}
            </div>
        `;
}

class TaskOpenList extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['tasks_service', 'people_service', 'companies_service', 'show_add_button']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (this.service) this._load();
    }

    // Notification methods. The host page listens for global task events
    // and calls the matching method on each list component.
    taskCreated()     { this.refresh(); }
    taskCompleted()   { this.refresh(); }
    taskUncompleted() { this.refresh(); }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.isConnected && this.service && oldVal !== newVal) this._load();
    }

    refresh() { this._load(); }

    async _load() {
        const peopleSvc = this.serviceFor('people');
        const compSvc = this.serviceFor('companies');
        try {
            const [tasks, people, companies] = await Promise.all([
                this.service.list(),
                peopleSvc ? peopleSvc.list() : Promise.resolve([]),
                compSvc ? compSvc.list() : Promise.resolve([]),
            ]);
            const open = (tasks || []).filter(t => !t.done);
            this._state = { open, people: people || [], companies: companies || [] };
        } catch {
            this._state = { error: true };
        }
        this.requestRender();
        if (!this._wired) {
            this._wired = true;
            this.shadowRoot.addEventListener('change', (ev) => {
                const cb = ev.target.closest('input[data-act="toggle"]');
                if (!cb) return;
                if (!cb.checked) return;
                const id = cb.dataset.taskid;
                const text = cb.dataset.tasktext || '';
                const modal = this.shadowRoot.querySelector('task-complete-modal');
                if (!modal || typeof modal.open !== 'function') {
                    cb.checked = false;
                    this.dispatchEvent(new CustomEvent('task-open-list:toggle', {
                        bubbles: true, composed: true, detail: { id, checkbox: cb },
                    }));
                    return;
                }
                modal.open({ id, text }, async (res) => {
                    if (!res || !res.confirmed) {
                        cb.checked = false;
                        return;
                    }
                    try {
                        if (this.service && typeof this.service.toggle === 'function') {
                            await this.service.toggle(res.id, res.comment || '');
                        }
                    } catch (err) {
                        console.error('task-open-list: toggle failed', err);
                    }
                    this.refresh();
                    this.dispatchEvent(new CustomEvent('task:completed', {
                        bubbles: true, composed: true, detail: { id: res.id, comment: res.comment || '' },
                    }));
                });
            });
            this.shadowRoot.addEventListener('click', (ev) => {
                const noteBtn = ev.target.closest('button[data-act="note"]');
                if (!noteBtn) return;
                const id = noteBtn.dataset.taskid;
                const task = (this._state && this._state.open || []).find(t => String(t.id) === String(id));
                if (!task) return;
                const modal = this.shadowRoot.querySelector('task-note-modal');
                if (!modal || typeof modal.open !== 'function') return;
                modal.open({ id: task.id, text: task.text, note: task.note || '' }, async (res) => {
                    if (!res || !res.saved) return;
                    try {
                        if (this.service && typeof this.service.update === 'function') {
                            await this.service.update(res.id, { note: res.note });
                        }
                    } catch (err) {
                        console.error('task-open-list: note update failed', err);
                    }
                    this.refresh();
                });
            });
            this.shadowRoot.addEventListener('click', (ev) => {
                const delBtn = ev.target.closest('button[data-act="delete"]');
                if (!delBtn) return;
                const id = delBtn.dataset.taskid;
                const text = delBtn.dataset.tasktext || '';
                if (!confirm(`Slette oppgaven «${text}»?`)) return;
                (async () => {
                    try {
                        if (this.service && typeof this.service.remove === 'function') {
                            await this.service.remove(id);
                        }
                    } catch (err) {
                        console.error('task-open-list: delete failed', err);
                    }
                    this.refresh();
                    this.dispatchEvent(new CustomEvent('task:deleted', {
                        bubbles: true, composed: true, detail: { id },
                    }));
                })();
            });
            this.shadowRoot.addEventListener('click', (ev) => {
                const addBtn = ev.target.closest('button[data-act="add"]');
                if (!addBtn) return;
                const modal = this.shadowRoot.querySelector('task-create-modal');
                if (!modal) return;
                modal.open((res) => {
                    if (res && res.created) this.refresh();
                });
            });
            wireMentionClicks(this.shadowRoot);
        }
    }

    render() {
        if (!this.service) return this.renderNoService();
        const showAdd = this.getAttribute('show_add_button') !== 'false';
        const addBtn = showAdd
            ? html`<button type="button" class="add-btn" data-act="add" title="Ny oppgave">+</button>`
            : '';
        const headerWithAdd = (countLabel) => html`
            <h3 class="side-h">
                <span class="side-h-title">Åpne oppgaver${countLabel ? ' · ' + countLabel : ''}</span>
                ${addBtn}
            </h3>
        `;
        const tasksSvcPath = this.getAttribute('tasks_service') || '';
        const modals = showAdd
            ? html`<task-complete-modal></task-complete-modal><task-create-modal tasks_service="${tasksSvcPath}"></task-create-modal><task-note-modal></task-note-modal>`
            : html`<task-complete-modal></task-complete-modal><task-note-modal></task-note-modal>`;
        if (!this._state) return html`${headerWithAdd('')}<p class="empty-quiet">Laster…</p>${modals}`;
        if (this._state.error) return html`${headerWithAdd('')}<p class="empty-quiet">Kunne ikke laste oppgaver</p>${modals}`;

        const { open, people, companies } = this._state;
        if (open.length === 0) {
            return html`${headerWithAdd('0')}<p class="empty-quiet">Ingen åpne oppgaver</p>${modals}`;
        }
        const rows = open.map(t => renderTask(t, people, companies));
        return html`
            ${headerWithAdd(String(open.length))}
            <div class="sidebar-tasks">${rows}</div>
            ${modals}
        `;
    }
}

if (!customElements.get('task-open-list')) customElements.define('task-open-list', TaskOpenList);
