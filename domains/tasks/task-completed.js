/**
 * <task-completed week="YYYY-WNN" service="TaskService"> — sidebar list
 * of tasks completed during the given ISO week. Crossed-out style,
 * per-row "undo" button. Renders inside its own shadow DOM with theming
 * via inherited CSS custom properties.
 *
 * Service contract (window[serviceName]):
 *   list() → Promise<Task[]>
 *
 * Emits 'task-completed:undo' (composed/bubbles, cancelable) with
 * detail { id, text } when the user clicks the undo button. Page can
 * preventDefault to take over.
 */
import {
    WNElement, html, unsafeHTML, escapeHtml,
    linkMentions, wireMentionClicks,
} from './_shared.js';

const STYLES = `
    :host { display: block; color: var(--text-strong); font: inherit; font-size: 0.92em; }
    .sec-h {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); border-bottom: 1px solid var(--border-soft);
        padding-bottom: 6px; margin: 0 0 10px; font-size: 1.05em;
    }
    .sec-h .c { color: var(--text-subtle); font-size: 0.85em; margin-left: 4px; }
    .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }
    .row {
        display: flex; align-items: center; gap: 8px;
        padding: 4px 6px; border-radius: 6px;
        cursor: pointer;
    }
    .row:hover { background: var(--surface-alt); }
    .text {
        flex: 1; color: var(--text-subtle);
        text-decoration: line-through; word-break: break-word;
    }
    .text a { color: var(--accent); text-decoration: line-through; }
    .when { color: var(--text-subtle); font-size: 0.8em; }
    .undo {
        border: 0; background: transparent; cursor: pointer;
        opacity: 0.5; padding: 0 4px; font-size: 0.9em; color: var(--text-muted);
    }
    .undo:hover { opacity: 1; }
    .wk-group { margin-bottom: 12px; }
    .wk-h {
        font-family: var(--font-heading); font-weight: 600;
        color: var(--text-muted); font-size: 0.85em;
        margin: 8px 0 4px; padding-left: 6px;
    }
`;

class TaskCompleted extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['week', 'tasks_service', 'people_service', 'companies_service']; }

    css() { return STYLES; }

    refresh() {
        this.invalidateAwait();
        if (this.isConnected) this.requestRender();
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this._wired) this._wire();
    }

    // Notification methods. The host page listens for global task events
    // and calls the matching method on each list component.
    taskCompleted()   { this.refresh(); }
    taskUncompleted() { this.refresh(); }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) this.invalidateAwait();
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    loadData() {
        if (!this.service) return null;
        const peopleSvc = this.serviceFor('people');
        const compSvc = this.serviceFor('companies');
        return {
            tasks:     () => this.service.list().then(t => t || []),
            people:    () => peopleSvc ? peopleSvc.list() : Promise.resolve([]),
            companies: () => compSvc   ? compSvc.list()   : Promise.resolve([]),
        };
    }

    _wire() {
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-act="undo"]');
            if (btn) {
                ev.stopPropagation();
                const id = btn.dataset.taskid;
                const text = btn.dataset.tasktext || '';
                this.dispatchEvent(new CustomEvent('task-completed:undo', {
                    bubbles: true, composed: true, cancelable: true,
                    detail: { id, text },
                }));
                return;
            }
            if (ev.target.closest('a.mention-link')) return;
            const row = ev.target.closest('.row[data-taskid]');
            if (!row) return;
            const id = row.dataset.taskid;
            const task = (this._lastTasks || []).find(t => t.id === id);
            if (!task) return;
            this.dispatchEvent(new CustomEvent('task:request-view', {
                bubbles: true, composed: true,
                detail: { task },
            }));
        });
        wireMentionClicks(this.shadowRoot);
    }

    render(data = {}) {
        if (!this.service) return this.renderNoService();
        const week = this.getAttribute('week') || '';
        if (data._loading) return html`<h3 class="sec-h">Fullført</h3><p class="empty-quiet">Laster…</p>`;
        const tasks = Array.isArray(data.tasks) ? data.tasks : null;
        if (!tasks) return html`<h3 class="sec-h">Fullført</h3><p class="empty-quiet">Kunne ikke laste</p>`;
        this._lastTasks = tasks;
        const people = data.people || [];
        const companies = data.companies || [];
        const allDone = tasks.filter(t => t.done);
        const done = week ? allDone.filter(t => (t.completedWeek || t.week) === week) : allDone;
        if (done.length === 0) {
            return html`<h3 class="sec-h">Fullført <span class="c">0</span></h3><p class="empty-quiet">Ingen fullførte oppgaver</p>`;
        }

        const rowFor = (t) => {
            const id = t.id || '';
            const text = t.text || '';
            const textHtml = unsafeHTML(linkMentions(escapeHtml(text), people, companies));
            const dShort = t.completed ? `${t.completed.slice(8, 10)}.${t.completed.slice(5, 7)}` : '';
            return html`
                <div class="row" data-taskid="${id}" title="Vis detaljer">
                    <span class="text">${textHtml}</span>
                    ${dShort ? html`<span class="when">${dShort}</span>` : null}
                    <button type="button" class="undo" data-act="undo" data-taskid="${id}" data-tasktext="${text}" title="Angre">↺</button>
                </div>
            `;
        };

        if (week) {
            return html`
                <h3 class="sec-h">Fullført <span class="c">${done.length}</span></h3>
                ${done.map(rowFor)}
            `;
        }

        const byWeek = new Map();
        done.forEach(t => {
            const w = t.completedWeek || t.week || '—';
            if (!byWeek.has(w)) byWeek.set(w, []);
            byWeek.get(w).push(t);
        });
        const sortedWeeks = Array.from(byWeek.keys()).sort((a, b) => b.localeCompare(a));
        return html`
            <h3 class="sec-h">Fullført <span class="c">${done.length}</span></h3>
            ${sortedWeeks.map(w => html`
                <div class="wk-group">
                    <div class="wk-h">Uke ${w}</div>
                    ${byWeek.get(w).map(rowFor)}
                </div>
            `)}
        `;
    }
}

if (!customElements.get('task-completed')) customElements.define('task-completed', TaskCompleted);
