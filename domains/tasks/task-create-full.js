/**
 * <task-create-full> — expanded "new task" / "edit task" form.
 *
 * The full-form sibling of <task-create>. Renders text input, optional
 * note textarea, and a meta-row with "Ansvarlig" person picker, "Mål"
 * goal picker and "Frist" due-date input, plus a submit button.
 *
 * Modes
 * -----
 * Create mode (default): submit calls `service.create(text, opts)`
 *   and dispatches `task:created` with detail { task, tasks }.
 *
 * Edit mode: triggered by either the `task-id` attribute (the widget
 *   fetches the matching task via service.list()) or by setting the
 *   `task` property to a task object directly. In edit mode submit
 *   calls `service.update(id, patch)` and dispatches `task:updated`
 *   with detail { id, patch, task }. The button label defaults to
 *   "Lagre" instead of "Legg til".
 *
 * Attributes (all optional):
 *   placeholder    — input placeholder (default "Ny oppgave...")
 *   button-label   — submit button text (default depends on mode)
 *   goal-id        — preselected goal id; user may change/clear
 *   week           — ISO-week (YYYY-WNN) sent on create
 *   task-id        — switches to edit mode and prefills from the task
 *   no-note        — boolean; hides the note textarea
 *   autofocus-on-connect — focus the text input on mount
 *   tasks_service  — service path attribute
 *
 * Properties:
 *   task — set to a task object to enter edit mode without a fetch.
 *
 * Public API:
 *   element.focus()  — focus the text input
 *   element.value    — get/set current text
 *
 * Events:
 *   task:created       — { task, tasks }       (create mode)
 *   task:create-failed — { error }
 *   task:updated       — { id, patch, task }   (edit mode)
 *   task:update-failed — { error }
 *
 * Submit shortcut: Ctrl/Cmd+Enter while in any field.
 */
import { WNElement, html } from './_shared.js';
import '/components/date-time-picker.js';
import '/components/person-picker.js';
import '/components/person-multi-picker.js';

const CSS = `
    :host { display: block; box-sizing: border-box; }
    input.txt, select.sel, textarea.note {
        padding: 10px 14px; min-width: 0;
        border: 2px solid var(--border-soft);
        border-radius: 8px; font-size: 1em; outline: none;
        background: var(--bg); color: var(--text);
        font-family: inherit;
    }
    input.txt, textarea.note { width: 100%; box-sizing: border-box; }
    textarea.note { resize: vertical; min-height: 60px; line-height: 1.4; }
    input.txt:focus, select.sel:focus, textarea.note:focus {
        border-color: var(--accent);
    }
    button.btn {
        padding: 10px 20px; background: var(--success); color: var(--text-on-accent);
        border: none; border-radius: 8px; font-weight: 600;
        cursor: pointer; font-size: 1em; font-family: inherit;
        white-space: nowrap;
    }
    button.btn:hover:not(:disabled) { background: var(--success-strong); }
    button.btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .err { color: var(--danger); font-size: 0.8em; margin-top: 4px; min-height: 1em; }

    .form { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .meta-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px 12px;
        align-items: center;
    }
    .meta-grid > .lbl {
        color: var(--text-muted); font-size: 0.9em;
        justify-self: end;
    }
    .meta-grid > .field { min-width: 0; display: flex; }
    .meta-grid > .field > .sel { flex: 1; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    :host([no-note]) textarea.note { display: none; }

    .due-row { display: flex; gap: 4px; align-items: stretch; flex: 1; }
    .due-trigger {
        flex: 1;
        text-align: left;
        background: var(--bg); color: var(--text);
        border: 2px solid var(--border-soft); border-radius: 8px;
        padding: 8px 12px; font: inherit; font-size: 0.95em;
        cursor: pointer; min-width: 0;
    }
    .due-trigger:hover { border-color: var(--accent); }
    .due-trigger.empty { color: var(--text-subtle); }
    .due-clear {
        border: 2px solid var(--border-soft); background: var(--bg);
        color: var(--text-muted); border-radius: 8px;
        padding: 0 10px; cursor: pointer; font: inherit;
    }
    .due-clear:hover { color: var(--text-strong); border-color: var(--accent); }
`;

class TaskCreateFull extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['placeholder', 'button-label', 'goal-id', 'task-id']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this._refreshRefs();
        this._btn.addEventListener('click', () => this._submit());
        const onKey = e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._submit(); }
        };
        this._input.addEventListener('keydown', onKey);
        this._respSel && this._respSel.addEventListener('keydown', onKey);
        this._goalSel && this._goalSel.addEventListener('keydown', onKey);
        this._noteIn  && this._noteIn.addEventListener('keydown', onKey);
        this._dueTrig && this._dueTrig.addEventListener('click', e => {
            e.stopPropagation(); this._openDuePicker();
        });
        this._dueClr  && this._dueClr.addEventListener('click', e => {
            e.stopPropagation(); this._setDue('');
        });
        this._apply();
        this._loadGoals();
        if (this.hasAttribute('task-id') && !this._task) this._loadTask();
        else if (this._task) this._applyTask();
        if (this.hasAttribute('autofocus-on-connect')) {
            setTimeout(() => this._input && this._input.focus(), 0);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback && super.disconnectedCallback();
        this._closeDuePicker();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.shadowRoot && oldVal !== newVal) {
            this._refreshRefs();
            this._apply();
            if (name === 'goal-id' && this._goalSel && !this._task) {
                this._goalSel.value = this.getAttribute('goal-id') || '';
            }
            if (name === 'task-id' && this._wired) {
                this._task = null;
                this._loadTask();
            }
        }
    }

    /** Property setter: `el.task = {...}` enters edit mode without fetching. */
    set task(t) {
        this._task = t || null;
        if (this._wired) this._applyTask();
    }
    get task() { return this._task || null; }

    css() { return CSS; }

    render() {
        return html`
            <div class="form">
                <input class="txt" type="text" data-el="text" />
                <textarea class="note" data-el="note" rows="3" placeholder="Notat (valgfritt)..."></textarea>
                <div class="meta-grid">
                    <span class="lbl">Ansvarlig</span>
                    <span class="field">
                        <person-picker data-el="responsible" default-me></person-picker>
                    </span>
                    <span class="lbl">Mål</span>
                    <span class="field">
                        <select class="sel" data-el="goal">
                            <option value="">(ingen)</option>
                        </select>
                    </span>
                    <span class="lbl">Frist</span>
                    <span class="field">
                        <span class="due-row">
                            <button type="button" class="due-trigger empty" data-el="due-trigger">Velg tidspunkt…</button>
                            <button type="button" class="due-clear" data-el="due-clear" title="Fjern frist">✕</button>
                        </span>
                        <input type="hidden" data-el="due" />
                    </span>
                    <span class="lbl">Deltakere</span>
                    <span class="field">
                        <person-multi-picker data-el="participants"></person-multi-picker>
                    </span>
                </div>
                <div class="actions">
                    <button class="btn" type="button" data-el="submit"></button>
                </div>
                <div class="err" data-err></div>
            </div>
        `;
    }

    _refreshRefs() {
        const root = this.shadowRoot;
        this._input  = root.querySelector('[data-el="text"]');
        this._noteIn = root.querySelector('[data-el="note"]');
        this._btn    = root.querySelector('[data-el="submit"]');
        this._err    = root.querySelector('[data-err]');
        this._respSel = root.querySelector('[data-el="responsible"]');
        this._goalSel = root.querySelector('[data-el="goal"]');
        this._dueIn   = root.querySelector('[data-el="due"]');
        this._dueTrig = root.querySelector('[data-el="due-trigger"]');
        this._dueClr  = root.querySelector('[data-el="due-clear"]');
        this._partPicker = root.querySelector('[data-el="participants"]');
        // Forward people_service attr to the pickers.
        if (this._respSel) {
            const ps = this.getAttribute('people_service');
            if (ps) this._respSel.setAttribute('people_service', ps);
            if (this._isEdit()) this._respSel.removeAttribute('default-me');
        }
        if (this._partPicker) {
            const ps = this.getAttribute('people_service');
            if (ps) this._partPicker.setAttribute('people_service', ps);
        }
    }

    get value() { return this._input ? this._input.value : ''; }
    set value(v) { if (this._input) this._input.value = v == null ? '' : String(v); }

    focus() { if (this._input) this._input.focus(); }

    _isEdit() { return !!(this._task || this.getAttribute('task-id')); }

    _apply() {
        if (!this._input || !this._btn) return;
        this._input.placeholder = this.getAttribute('placeholder') || 'Ny oppgave...';
        const defaultLabel = this._isEdit() ? 'Lagre' : 'Legg til';
        this._btn.textContent = this.getAttribute('button-label') || defaultLabel;
    }

    async _loadTask() {
        const id = this.getAttribute('task-id');
        if (!id) return;
        const svc = this.service;
        if (!svc || typeof svc.list !== 'function') return;
        try {
            const tasks = await svc.list();
            if (!Array.isArray(tasks)) return;
            const t = tasks.find(x => x && x.id === id);
            if (t) {
                this._task = t;
                this._applyTask();
            }
        } catch (_) { /* ignore */ }
    }

    _applyTask() {
        if (!this._task || !this._input) return;
        const t = this._task;
        this._input.value = t.text || '';
        if (this._noteIn) this._noteIn.value = t.note || '';
        const due = (t.dueDate && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(t.dueDate)) ? t.dueDate : '';
        this._setDue(due);
        if (this._respSel) {
            this._respSel.value = t.responsible || '';
        }
        if (this._goalSel) {
            this._pendingGoal = t.goalId || '';
            if (this._goalsLoaded) this._goalSel.value = this._pendingGoal;
        }
        if (t.participants && this._partPicker) {
            this._partPicker.value = t.participants;
        }
        this._apply();
    }

    _setDue(value) {
        if (this._dueIn) this._dueIn.value = value || '';
        this._updateDueTrigger(value);
    }

    _updateDueTrigger(value) {
        if (!this._dueTrig) return;
        if (value) {
            this._dueTrig.textContent = value;
            this._dueTrig.classList.remove('empty');
        } else {
            this._dueTrig.textContent = 'Velg tidspunkt…';
            this._dueTrig.classList.add('empty');
        }
    }

    _openDuePicker() {
        this._closeDuePicker();
        if (!this._dueTrig) return;
        const picker = document.createElement('date-time-picker');
        picker.setAttribute('mode', 'datetime');
        const current = (this._dueIn && this._dueIn.value) || '';
        if (current) picker.setAttribute('value', current);
        picker.style.cssText = 'position:fixed;z-index:9999;visibility:hidden;left:-9999px;top:0';
        document.body.appendChild(picker);
        this._duePicker = picker;
        const place = () => {
            const rect = this._dueTrig.getBoundingClientRect();
            const w = picker.offsetWidth || 252;
            const h = picker.offsetHeight || 280;
            let left = rect.left;
            let top = rect.bottom + 4;
            if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
            if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 4);
            picker.style.left = left + 'px';
            picker.style.top = top + 'px';
            picker.style.visibility = 'visible';
        };
        requestAnimationFrame(place);
        const onSelected = e => {
            const v = (e && e.detail && e.detail.value) || '';
            this._setDue(v);
            this._closeDuePicker();
        };
        const onCancelled = () => this._closeDuePicker();
        const onOutside = e => {
            if (!this._duePicker) return;
            if (e.target === picker || picker.contains(e.target)) return;
            this._closeDuePicker();
        };
        picker.addEventListener('datetime-selected', onSelected);
        picker.addEventListener('datetime-cancelled', onCancelled);
        document.addEventListener('mousedown', onOutside, true);
        this._dueOutsideHandler = onOutside;
    }

    _closeDuePicker() {
        if (this._dueOutsideHandler) {
            document.removeEventListener('mousedown', this._dueOutsideHandler, true);
            this._dueOutsideHandler = null;
        }
        if (this._duePicker && this._duePicker.parentNode) {
            this._duePicker.parentNode.removeChild(this._duePicker);
        }
        this._duePicker = null;
    }

    async _loadGoals() {
        if (!this._goalSel || this._goalsLoaded) return;
        this._goalsLoaded = true;
        const preselect = (this._pendingGoal != null)
            ? this._pendingGoal
            : (this.getAttribute('goal-id') || '');
        try {
            const goalsSvc = this.serviceFor('goals');
            let arr;
            if (goalsSvc && typeof goalsSvc.list === 'function') {
                arr = await goalsSvc.list();
            } else {
                const resp = await fetch('/api/goals');
                arr = await resp.json();
            }
            if (!Array.isArray(arr)) return;
            const items = arr
                .filter(g => g && g.id)
                .sort((a, b) => {
                    const sa = a.status === 'active' ? 0 : 1;
                    const sb = b.status === 'active' ? 0 : 1;
                    if (sa !== sb) return sa - sb;
                    return (a.title || '').localeCompare(b.title || '');
                });
            const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            this._goalSel.innerHTML =
                '<option value="">(ingen)</option>' +
                items.map(g => {
                    const icon = g.status === 'achieved' ? '🏆 ' : g.status === 'abandoned' ? '🗑️ ' : '🎯 ';
                    return `<option value="${esc(g.id)}">${esc(icon + (g.title || ''))}</option>`;
                }).join('');
            if (preselect) this._goalSel.value = preselect;
        } catch (_) { /* leave default */ }
    }

    _getSelectedParticipants() {
        return this._partPicker ? this._partPicker.value : [];
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

        const responsible = this._respSel ? (this._respSel.value || '') : '';
        const goalId      = this._goalSel ? (this._goalSel.value || '') : '';
        const dueDate     = this._dueIn   ? (this._dueIn.value   || '') : '';
        const note        = this._noteIn  ? (this._noteIn.value  || '') : '';

        this._btn.disabled = true;
        try {
            if (this._task && this._task.id) {
                // --- edit mode ---
                if (typeof svc.update !== 'function') {
                    throw new Error('update ikke støttet av tjenesten');
                }
                const id = this._task.id;
                const participants = this._getSelectedParticipants();
                const patch = {
                    text, note,
                    responsible,
                    dueDate,                       // empty string → server clears
                    goalId: goalId || null,        // explicit clear
                    participants: participants.length ? participants : null,
                };
                await svc.update(id, patch);
                // Update local snapshot so subsequent submits see latest values.
                Object.assign(this._task, {
                    text, note, responsible,
                    dueDate: dueDate || undefined,
                    goalId: goalId || undefined,
                    participants: participants.length ? participants : undefined,
                });
                this.dispatchEvent(new CustomEvent('task:updated', {
                    bubbles: true, composed: true,
                    detail: { id, patch, task: this._task },
                }));
            } else {
                // --- create mode ---
                const opts = {};
                if (responsible) opts.responsible = responsible;
                if (dueDate) opts.dueDate = dueDate;
                if (goalId) opts.goalId = goalId;
                else {
                    const attr = this.getAttribute('goal-id');
                    if (attr) opts.goalId = attr;
                }
                if (note) opts.note = note;
                const participants = this._getSelectedParticipants();
                if (participants.length) opts.participants = participants;
                const week = this.getAttribute('week');
                if (week) opts.week = week;
                const tasks = await svc.create(text, opts);
                const task = Array.isArray(tasks) ? tasks[tasks.length - 1] : null;
                this._input.value = '';
                if (this._noteIn) this._noteIn.value = '';
                this._setDue('');
                this._input.focus();
                this.dispatchEvent(new CustomEvent('task:created', {
                    bubbles: true, composed: true,
                    detail: { task, tasks },
                }));
            }
        } catch (e) {
            this._err.textContent = e.message || 'Feil ved lagring';
            const evt = (this._task && this._task.id) ? 'task:update-failed' : 'task:create-failed';
            this.dispatchEvent(new CustomEvent(evt, {
                bubbles: true, composed: true,
                detail: { error: e.message || String(e) },
            }));
        } finally {
            this._btn.disabled = false;
        }
    }
}

if (!customElements.get('task-create-full')) customElements.define('task-create-full', TaskCreateFull);
