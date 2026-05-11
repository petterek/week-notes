/**
 * <task-add-modal> — small "+" trigger button that opens the
 * page-level <task-edit-modal> in create mode.
 *
 * The modal handles persistence: on save it calls
 * `tasks_service.create(text, opts)` and emits `task:created` from the
 * document. Closes after a single create (Esc / backdrop / cancel).
 *
 * Attributes (all optional):
 *   tasks_service   — service path attribute (required for create)
 *   goal-id         — preselect goal in the modal
 *   week            — ISO week, sent on create
 *   trigger-title   — title attr on the + button (default "Ny oppgave")
 *   trigger-label   — text shown in the trigger button (default "+")
 *
 * Public methods:
 *   open()  — open the modal programmatically
 */
import { WNElement, html } from './_shared.js';
import './task-edit-modal.js';

const CSS = `
    :host { display: inline-block; }
    .add-btn {
        padding: 2px 10px;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: var(--text-on-accent);
        border-radius: 5px;
        cursor: pointer;
        font: inherit;
        font-size: 0.85em;
        line-height: 1.2;
    }
    .add-btn:hover { background: var(--accent-strong, var(--accent)); }
`;

class TaskAddModal extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() {
        return ['tasks_service', 'goal-id', 'week', 'trigger-title', 'trigger-label'];
    }

    css() { return CSS; }

    open() {
        const svc = this.serviceFor('tasks');
        const week = this.getAttribute('week') || '';
        const goalId = this.getAttribute('goal-id') || '';
        const task = {};
        if (week) task.week = week;
        if (goalId) task.goalId = goalId;
        this.dispatchEvent(new CustomEvent('task:request-edit', {
            bubbles: true, composed: true,
            detail: { task, service: svc },
        }));
    }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (ev) => {
            const trigger = ev.target.closest('button[data-act="add"]');
            if (!trigger) return;
            this.open();
        });
    }

    render() {
        const trigTitle = this.getAttribute('trigger-title') || 'Ny oppgave';
        const trigLabel = this.getAttribute('trigger-label') || '+';
        return html`
            <button type="button" class="add-btn" data-act="add" title="${trigTitle}">${trigLabel}</button>
        `;
    }
}

if (!customElements.get('task-add-modal')) customElements.define('task-add-modal', TaskAddModal);
