/**
 * <task-create> — reusable "new task" input + button.
 *
 * Calls `service.create(text)` (TaskService) and dispatches a
 * `task:created` event (bubbles, composed) with detail
 *   { task, tasks }
 * so the host page/component can refresh its list.
 *
 * Attributes:
 *   placeholder    — input placeholder text (default "Ny oppgave...")
 *   button-label   — submit button text (default "Legg til")
 *   compact        — boolean attr; renders a slimmer variant
 *   autofocus-on-connect — boolean; focus the input on mount
 *   tasks_service  — service path attribute (e.g. "week-note-services.tasks_service")
 *
 * Public API:
 *   element.focus()  — focus the input
 *   element.value    — get/set current input text
 *
 * Events:
 *   task:created     — { task, tasks } (bubbles, composed)
 *   task:create-failed — { error } (bubbles, composed)
 */
import { WNElement, html } from './_shared.js';

const CSS = `
    :host { display: block; box-sizing: border-box; }
    .row { display: flex; gap: 8px; align-items: stretch; }
    input.txt {
        flex: 1; padding: 10px 14px; min-width: 0;
        border: 2px solid var(--border-soft);
        border-radius: 8px; font-size: 1em; outline: none;
        background: var(--bg); color: var(--text);
        font-family: inherit;
    }
    input.txt:focus { border-color: var(--accent); }
    button.btn {
        padding: 10px 20px; background: var(--success); color: var(--text-on-accent);
        border: none; border-radius: 8px; font-weight: 600;
        cursor: pointer; font-size: 1em; font-family: inherit;
        white-space: nowrap;
    }
    button.btn:hover:not(:disabled) { background: var(--success-strong); }
    button.btn:disabled { opacity: 0.5; cursor: not-allowed; }
    :host([compact]) input.txt { padding: 6px 10px; font-size: 0.9em; }
    :host([compact]) button.btn { padding: 6px 12px; font-size: 0.9em; }
    .err { color: var(--danger); font-size: 0.8em; margin-top: 4px; min-height: 1em; }
`;

class TaskCreate extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['placeholder', 'button-label']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this._input = this.shadowRoot.querySelector('input.txt');
        this._btn = this.shadowRoot.querySelector('button.btn');
        this._err = this.shadowRoot.querySelector('[data-err]');
        this._btn.addEventListener('click', () => this._submit());
        this._input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); this._submit(); }
        });
        this._apply();
        if (this.hasAttribute('autofocus-on-connect')) {
            setTimeout(() => this._input && this._input.focus(), 0);
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.shadowRoot && oldVal !== newVal) this._apply();
    }

    css() { return CSS; }

    render() {
        return html`
            <div class="row">
                <input class="txt" type="text" />
                <button class="btn" type="button"></button>
            </div>
            <div class="err" data-err></div>
        `;
    }

    get value() { return this._input ? this._input.value : ''; }
    set value(v) { if (this._input) this._input.value = v == null ? '' : String(v); }

    focus() { if (this._input) this._input.focus(); }

    _apply() {
        if (!this._input || !this._btn) return;
        this._input.placeholder = this.getAttribute('placeholder') || 'Ny oppgave...';
        this._btn.textContent = this.getAttribute('button-label') || 'Legg til';
    }

    async _submit() {
        if (!this._input || !this._btn || !this._err) return;
        const text = (this._input.value || '').trim();
        this._err.textContent = '';
        if (!text) { this._input.focus(); return; }
        const svc = this.service;
        if (!svc || typeof svc.create !== 'function') {
            this._err.textContent = 'Tjeneste ikke koblet til';
            return;
        }
        this._btn.disabled = true;
        try {
            const tasks = await svc.create(text);
            const task = Array.isArray(tasks) ? tasks[tasks.length - 1] : null;
            this._input.value = '';
            this._input.focus();
            this.dispatchEvent(new CustomEvent('task:created', {
                bubbles: true, composed: true,
                detail: { task, tasks },
            }));
        } catch (e) {
            this._err.textContent = e.message || 'Feil ved lagring';
            this.dispatchEvent(new CustomEvent('task:create-failed', {
                bubbles: true, composed: true,
                detail: { error: e.message || String(e) },
            }));
        } finally {
            this._btn.disabled = false;
        }
    }
}

if (!customElements.get('task-create')) customElements.define('task-create', TaskCreate);
