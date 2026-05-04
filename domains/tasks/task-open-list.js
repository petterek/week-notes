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
import './task-note-modal.js';
import './task-edit-modal.js';

const STYLES = `
        :host {
            display: flex; flex-direction: column;
            color: var(--text-strong); font: inherit; font-size: 0.92em;
            max-height: 420px;
            min-height: 0;
        }
        .side-h {
            flex: 0 0 auto;
            display: flex; align-items: center;
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
        .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }
        .sidebar-tasks {
            display: flex; flex-direction: column; gap: 6px;
            overflow-y: auto;
            min-height: 0;
            flex: 1 1 auto;
            padding-right: 4px;
        }
        .sidebar-task { padding: 6px 8px; border-radius: 6px; background: var(--surface); }
        .sidebar-task:hover { background: var(--surface-alt); }
        .row { display: flex; align-items: center; gap: 8px; }
        .row input[type="checkbox"] { accent-color: var(--accent); }
        .row-text { flex: 1; word-break: break-word; }
        .row-text a { color: var(--accent); text-decoration: none; }
        .row-text a:hover { text-decoration: underline; }
        .row-note-btn {
            border: 0; background: transparent; cursor: pointer;
            opacity: 0.85; padding: 0 4px; font-size: 1em;
            color: var(--text);
        }
        .row-note-btn:hover { opacity: 1; color: var(--text-strong); }
        .row-note-btn.empty { opacity: 0.45; }
        .row-edit-btn {
            border: 0; background: transparent; cursor: pointer;
            opacity: 0.85; padding: 0 4px; font-size: 1em;
            color: var(--text);
        }
        .row-edit-btn:hover { opacity: 1; color: var(--accent); }
        .row-del-btn {
            border: 0; background: transparent; cursor: pointer;
            opacity: 0.7; padding: 0 4px; font-size: 1em;
            color: var(--danger, #c53030);
        }
        .row-del-btn:hover { opacity: 1; }
        .row-note-body {
            margin: 6px 0 2px 26px;
            color: var(--text); font-size: 0.92em;
        }
        .row-note-body p { margin: 2px 0; }
        .due-pill {
            display: inline-flex; align-items: center; gap: 3px;
            font-size: 0.78em;
            padding: 1px 7px; border-radius: 10px;
            background: var(--surface-alt); color: var(--text-muted);
            border: 1px solid var(--border-soft);
            white-space: nowrap;
        }
        .due-pill.overdue {
            background: var(--danger-soft, rgba(197, 48, 48, 0.12));
            color: var(--danger, #c53030);
            border-color: var(--danger, #c53030);
            font-weight: 600;
        }
`;

function isOverdue(due, done) {
    if (done || !due) return false;
    const m = String(due).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/);
    if (!m) return false;
    const hasTime = m[4] != null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], hasTime ? +m[4] : 23, hasTime ? +m[5] : 59);
    return d < new Date();
}

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
        const due = t.dueDate || '';
        const overdue = isOverdue(due, t.done);
        const duePill = due
            ? unsafeHTML(`<span class="due-pill${overdue ? ' overdue' : ''}" title="Frist${overdue ? ' (forfalt)' : ''}">📅 ${escapeHtml(due)}</span>`)
            : '';
        return html`
            <div class="sidebar-task" data-taskid="${id}">
                <div class="row">
                    <input type="checkbox" data-taskid="${id}" data-tasktext="${t.text || ''}" data-act="toggle" />
                    <span class="row-text">${textHtml}</span>
                    ${duePill}
                    ${weekBadge}
                    <button type="button" class="${noteBtnCls}" data-act="note" data-taskid="${id}" title="${noteBtnTitle}">📓</button>
                    <button type="button" class="row-edit-btn" data-act="edit" data-taskid="${id}" title="Rediger oppgave">✎</button>
                    <button type="button" class="row-del-btn" data-act="delete" data-taskid="${id}" data-tasktext="${t.text || ''}" title="Slett oppgave">✕</button>
                </div>
                ${noteBody}
            </div>
        `;
}

class TaskOpenList extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['tasks_service', 'people_service', 'companies_service']; }

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
                this.dispatchEvent(new CustomEvent('task:request-complete', {
                    bubbles: true, composed: true,
                    detail: {
                        id, text,
                        callback: async (res) => {
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
                                bubbles: true, composed: true,
                                detail: { id: res.id, comment: res.comment || '' },
                            }));
                        },
                    },
                }));
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
                const editBtn = ev.target.closest('button[data-act="edit"]');
                if (!editBtn) return;
                const id = editBtn.dataset.taskid;
                const task = (this._state && this._state.open || []).find(t => String(t.id) === String(id));
                if (!task) return;
                this.dispatchEvent(new CustomEvent('task:request-edit', {
                    bubbles: true, composed: true,
                    detail: {
                        task,
                        service: this.service,
                        callback: (res) => {
                            if (res && res.saved) this.refresh();
                        },
                    },
                }));
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
            wireMentionClicks(this.shadowRoot);
        }
    }

    render() {
        if (!this.service) return this.renderNoService();
        const header = (countLabel) => html`
            <h3 class="side-h">
                <span class="side-h-title">Åpne oppgaver${countLabel ? ' · ' + countLabel : ''}</span>
            </h3>
        `;
        // <task-complete-modal> lives at the page level; the document-
        // level handler for `task:request-complete` opens it. The note
        // modal is still per-instance because nothing else needs it.
        const modals = html`<task-note-modal></task-note-modal>`;
        if (!this._state) return html`${header('')}<p class="empty-quiet">Laster…</p>${modals}`;
        if (this._state.error) return html`${header('')}<p class="empty-quiet">Kunne ikke laste oppgaver</p>${modals}`;

        const { open, people, companies } = this._state;
        if (open.length === 0) {
            return html`${header('0')}<p class="empty-quiet">Ingen åpne oppgaver</p>${modals}`;
        }
        const rows = open.map(t => renderTask(t, people, companies));
        return html`
            ${header(String(open.length))}
            <div class="sidebar-tasks">${rows}</div>
            ${modals}
        `;
    }
}

if (!customElements.get('task-open-list')) customElements.define('task-open-list', TaskOpenList);
