/**
 * <task-create> — reusable "new task" input.
 *
 * Two modes:
 *   - inline (default): single-line text + Submit button. Quick-add path.
 *     The created task is owned by @me with no due date.
 *   - full (boolean attribute `full`): expanded form with text input,
 *     "ansvarlig" person picker (defaults to @me) and optional due-date
 *     input. Used by <task-add-modal>.
 *
 * Calls `service.create(text, opts)` (TaskService) and dispatches a
 * `task:created` event (bubbles, composed) with detail
 *   { task, tasks }
 * so the host page/component can refresh its list.
 *
 * Attributes:
 *   placeholder    — input placeholder text (default "Ny oppgave...")
 *   button-label   — submit button text (default "Legg til")
 *   compact        — boolean attr; renders a slimmer inline variant
 *   full           — boolean attr; render the expanded form
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
    input.txt, select.sel, input.date {
        padding: 10px 14px; min-width: 0;
        border: 2px solid var(--border-soft);
        border-radius: 8px; font-size: 1em; outline: none;
        background: var(--bg); color: var(--text);
        font-family: inherit;
    }
    input.txt { flex: 1; }
    input.txt:focus, select.sel:focus, input.date:focus { border-color: var(--accent); }
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

    /* Full-form layout */
    :host([full]) .form { display: grid; grid-template-columns: 1fr; gap: 8px; }
    :host([full]) .meta-row { display: flex; gap: 8px; flex-wrap: wrap; }
    :host([full]) .meta-row label {
        display: flex; align-items: center; gap: 6px;
        color: var(--text-muted); font-size: 0.9em;
    }
    :host([full]) .actions { display: flex; justify-content: flex-end; gap: 8px; }
`;

class TaskCreate extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['placeholder', 'button-label', 'full']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this._refreshRefs();
        this._btn.addEventListener('click', () => this._submit());
        this._input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !this.hasAttribute('full')) { e.preventDefault(); this._submit(); }
            if (e.key === 'Enter' && this.hasAttribute('full') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault(); this._submit();
            }
        });
        this._apply();
        if (this.hasAttribute('full')) this._loadPeople();
        if (this.hasAttribute('autofocus-on-connect')) {
            setTimeout(() => this._input && this._input.focus(), 0);
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.shadowRoot && oldVal !== newVal) {
            this._refreshRefs();
            this._apply();
            if (name === 'full' && this.hasAttribute('full')) this._loadPeople();
        }
    }

    css() { return CSS; }

    render() {
        if (this.hasAttribute('full')) {
            return html`
                <div class="form">
                    <input class="txt" type="text" data-el="text" />
                    <div class="meta-row">
                        <label>
                            <span>Ansvarlig:</span>
                            <select class="sel" data-el="responsible">
                                <option value="">(ingen)</option>
                            </select>
                        </label>
                        <label>
                            <span>Frist:</span>
                            <input class="date" type="date" data-el="due" />
                        </label>
                    </div>
                    <div class="actions">
                        <button class="btn" type="button" data-el="submit"></button>
                    </div>
                    <div class="err" data-err></div>
                </div>
            `;
        }
        return html`
            <div class="row">
                <input class="txt" type="text" data-el="text" />
                <button class="btn" type="button" data-el="submit"></button>
            </div>
            <div class="err" data-err></div>
        `;
    }

    _refreshRefs() {
        const root = this.shadowRoot;
        this._input = root.querySelector('[data-el="text"]');
        this._btn   = root.querySelector('[data-el="submit"]');
        this._err   = root.querySelector('[data-err]');
        this._respSel = root.querySelector('[data-el="responsible"]');
        this._dueIn   = root.querySelector('[data-el="due"]');
    }

    get value() { return this._input ? this._input.value : ''; }
    set value(v) { if (this._input) this._input.value = v == null ? '' : String(v); }

    focus() { if (this._input) this._input.focus(); }

    _apply() {
        if (!this._input || !this._btn) return;
        this._input.placeholder = this.getAttribute('placeholder') || 'Ny oppgave...';
        this._btn.textContent = this.getAttribute('button-label') || 'Legg til';
    }

    async _loadPeople() {
        if (!this._respSel || this._peopleLoaded) return;
        this._peopleLoaded = true;
        const meKey = (typeof window !== 'undefined' && window.mePersonKey) || '';
        try {
            const resp = await fetch('/api/people');
            const arr = await resp.json();
            if (!Array.isArray(arr)) return;
            // Sort: @me first, then by name.
            const items = arr
                .filter(p => p && p.key)
                .map(p => ({ key: p.key, name: p.name || p.key, isMe: p.key === meKey }))
                .sort((a, b) => {
                    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            this._respSel.innerHTML =
                '<option value="">(ingen)</option>' +
                items.map(p => {
                    const label = p.isMe ? `${p.name} (meg)` : p.name;
                    const selected = p.isMe ? ' selected' : '';
                    return `<option value="${p.key}"${selected}>${label}</option>`;
                }).join('');
        } catch (_) { /* leave the empty option */ }
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
        const opts = {};
        if (this.hasAttribute('full')) {
            if (this._respSel) opts.responsible = this._respSel.value || '';
            if (this._dueIn && this._dueIn.value) opts.dueDate = this._dueIn.value;
        }
        this._btn.disabled = true;
        try {
            const tasks = await svc.create(text, opts);
            const task = Array.isArray(tasks) ? tasks[tasks.length - 1] : null;
            this._input.value = '';
            if (this._dueIn) this._dueIn.value = '';
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
