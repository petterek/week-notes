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
`;

class TaskCompleted extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['week', 'tasks_service', 'people_service', 'companies_service']; }

    css() { return STYLES; }

    refresh() { if (this.service) this._load(); }

    connectedCallback() {
        super.connectedCallback();
        if (this.service) this._load();
    }

    // Notification methods. The host page listens for global task events
    // and calls the matching method on each list component.
    taskCompleted()   { this.refresh(); }
    taskUncompleted() { this.refresh(); }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.isConnected && this.service && oldVal !== newVal) this._load();
    }

    async _load() {
        const peopleSvc = this.serviceFor('people');
        const compSvc = this.serviceFor('companies');
        try {
            const [tasks, people, companies] = await Promise.all([
                this.service.list(),
                peopleSvc ? peopleSvc.list() : Promise.resolve([]),
                compSvc ? compSvc.list() : Promise.resolve([]),
            ]);
            this._state = { tasks: tasks || [], people: people || [], companies: companies || [] };
        } catch {
            this._state = { error: true };
        }
        this.requestRender();
        if (!this._wired) {
            this._wired = true;
            this.shadowRoot.addEventListener('click', (ev) => {
                const btn = ev.target.closest('button[data-act="undo"]');
                if (!btn) return;
                const id = btn.dataset.taskid;
                const text = btn.dataset.tasktext || '';
                this.dispatchEvent(new CustomEvent('task-completed:undo', {
                    bubbles: true, composed: true, cancelable: true,
                    detail: { id, text },
                }));
            });
            wireMentionClicks(this.shadowRoot);
        }
    }

    render() {
        if (!this.service) return this.renderNoService();
        const week = this.getAttribute('week') || '';
        if (!this._state) return html`<h3 class="sec-h">Fullført</h3><p class="empty-quiet">Laster…</p>`;
        if (this._state.error) return html`<h3 class="sec-h">Fullført</h3><p class="empty-quiet">Kunne ikke laste</p>`;

        const { tasks, people, companies } = this._state;
        const done = (tasks || []).filter(t => t.done && (t.completedWeek || t.week) === week);
        if (done.length === 0) {
            return html`<h3 class="sec-h">Fullført <span class="c">0</span></h3><p class="empty-quiet">Ingen fullførte oppgaver</p>`;
        }

        const rows = done.map(t => {
            const id = t.id || '';
            const text = t.text || '';
            const textHtml = unsafeHTML(linkMentions(escapeHtml(text), people, companies));
            const dShort = t.completed ? `${t.completed.slice(8, 10)}.${t.completed.slice(5, 7)}` : '';
            return html`
                <div class="row">
                    <span class="text">${textHtml}</span>
                    ${dShort ? html`<span class="when">${dShort}</span>` : null}
                    <button type="button" class="undo" data-act="undo" data-taskid="${id}" data-tasktext="${text}" title="Angre">↺</button>
                </div>
            `;
        });

        return html`
            <h3 class="sec-h">Fullført <span class="c">${done.length}</span></h3>
            ${rows}
        `;
    }
}

if (!customElements.get('task-completed')) customElements.define('task-completed', TaskCompleted);
