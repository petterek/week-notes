/**
 * <task-edit-modal>
 *
 * Centered modal that edits an open task's mutable fields:
 *   - text          (single-line input)
 *   - responsible   (person select; defaults to @me)
 *   - dueDate       (optional ISO date)
 *   - note          (markdown textarea)
 *
 * The component is dumb — it does not load or save anything itself.
 * The host opens it with a task object and a callback that receives
 * the result.
 *
 *   const modal = document.createElement('task-edit-modal');
 *   modal.open(taskObj, (res) => {
 *       if (res.saved) service.update(res.id, res.patch);
 *   });
 *
 * Methods:
 *   - open(task, callback) — sets the task, shows the modal, focuses
 *     the text input. Callback runs once with one of:
 *         { saved: true,  id, patch: { text, responsible, dueDate, note } }
 *         { saved: false, id }
 *   - close() — hides the modal silently (no callback).
 *
 * Keyboard: Escape cancels, Ctrl/Cmd+Enter saves.
 *
 * Also exports a page-level singleton + document listener for
 * `task:request-edit` events, mirroring the pattern used by
 * <task-complete-modal> and <task-view>:
 *
 *   el.dispatchEvent(new CustomEvent('task:request-edit', {
 *       bubbles: true, composed: true,
 *       detail: { task, callback: (res) => { ... } },
 *   }));
 */
import { WNElement, html, escapeHtml } from './_shared.js';
import '/components/date-time-picker.js';
import { attachDateTrigger } from '/components/wn-date-trigger.js';

const STYLES = `
    :host { display: inline-block; font: inherit; }

    .backdrop {
        position: fixed; inset: 0; display: none; z-index: 2000;
        align-items: center; justify-content: center;
        background: var(--overlay);
    }
    :host([open]) .backdrop { display: flex; }

    .card {
        background: var(--bg); color: var(--text-strong);
        border: 1px solid var(--border); border-radius: 10px;
        padding: 18px 20px; width: min(620px, 92vw);
        box-shadow: 0 20px 60px var(--shadow);
        font-family: var(--font-family);
    }
    .head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 12px;
    }
    .head h3 {
        margin: 0; font-family: var(--font-heading);
        color: var(--accent); font-weight: 400; font-size: 1.1em;
    }
    .close {
        background: none; border: none; font-size: 1.3em;
        cursor: pointer; color: var(--text-muted);
    }
    .close:hover { color: var(--text-strong); }

    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .field > label {
        color: var(--text-muted); font-size: 0.85em; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.04em;
    }
    input[type="text"], input[type="date"], select, textarea {
        width: 100%; box-sizing: border-box;
        padding: 8px 10px;
        background: var(--surface); color: var(--text-strong);
        border: 1px solid var(--border); border-radius: 6px;
        font: inherit; font-size: 0.95em;
    }
    textarea { min-height: 110px; resize: vertical; }
    input:focus, select:focus, textarea:focus {
        outline: 2px solid var(--accent); outline-offset: 1px;
    }

    .meta-row { display: flex; gap: 12px; }
    .meta-row .field { flex: 1; margin-bottom: 0; }
    .due-trigger {
        text-align: left;
        background: var(--surface); color: var(--text-strong);
        border: 1px solid var(--border); border-radius: 6px;
        padding: 8px 10px; font: inherit; font-size: 0.95em;
        cursor: pointer;
    }
    .due-trigger:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    .due-trigger.empty { color: var(--text-subtle); }
    .due-row { display: flex; gap: 6px; align-items: stretch; }
    .due-row .due-trigger { flex: 1; }
    .due-clear {
        border: 1px solid var(--border); background: var(--surface-alt);
        color: var(--text-muted); border-radius: 6px;
        padding: 0 10px; cursor: pointer; font: inherit;
    }
    .due-clear:hover { color: var(--text-strong); }

    .actions {
        display: flex; justify-content: flex-end; gap: 8px;
        margin-top: 14px;
    }
    button.btn {
        padding: 8px 14px; border: none; border-radius: 8px;
        font: inherit; font-weight: 600; cursor: pointer; font-size: 0.95em;
    }
    button.cancel { background: var(--surface-alt); color: var(--text); }
    button.cancel:hover { background: var(--surface-head); }
    button.save { background: var(--accent); color: var(--text-on-accent); }
    button.save:hover { filter: brightness(0.95); }

    .hint { color: var(--text-subtle); font-size: 0.78em; margin-top: 6px; }
`;

class TaskEditModal extends WNElement {
    static get observedAttributes() { return ['open']; }

    css() { return STYLES; }

    render() {
        const t = (this._data && this._data.task) || null;
        const id = t ? (t.id || '') : '';
        return html`
            <div class="backdrop" data-backdrop>
                <div class="card" role="dialog" aria-modal="true" aria-labelledby="tem-h">
                    <div class="head">
                        <h3 id="tem-h">✎ Rediger oppgave</h3>
                        <button type="button" class="close" data-act="cancel" title="Lukk (Esc)">✕</button>
                    </div>
                    <div class="field">
                        <label>Tekst</label>
                        <input type="text" data-el="text" />
                    </div>
                    <div class="meta-row">
                        <div class="field">
                            <label>Ansvarlig</label>
                            <select data-el="responsible">
                                <option value="">(ingen)</option>
                            </select>
                        </div>
                        <div class="field">
                            <label>Frist</label>
                            <div class="due-row">
                                <button type="button" class="due-trigger empty" data-el="due-trigger">Velg tidspunkt…</button>
                                <button type="button" class="due-clear" data-el="due-clear" title="Fjern frist">✕</button>
                            </div>
                            <input type="hidden" data-el="due" />
                        </div>
                    </div>
                    <div class="field">
                        <label>Notat</label>
                        <textarea data-el="note" placeholder="Skriv notat her…"></textarea>
                    </div>
                    <div class="hint">Ctrl/⌘ + Enter for å lagre, Esc for å avbryte. Markdown og @mentions støttes i notat.</div>
                    <div class="actions">
                        <button type="button" class="btn cancel" data-act="cancel">Avbryt</button>
                        <button type="button" class="btn save"   data-act="save">💾 Lagre</button>
                    </div>
                    <input type="hidden" data-el="id" value="${escapeHtml(String(id))}" />
                </div>
            </div>
        `;
    }

    setData(d) {
        this._data = d || {};
        this.requestRender();
        this._wire();
    }

    open(task, callback) {
        this.setData({ task: task || {} });
        this._callback = (typeof callback === 'function') ? callback : null;
        this.setAttribute('open', '');
        const t = task || {};
        setTimeout(() => {
            const root = this.shadowRoot;
            if (!root) return;
            const text = root.querySelector('[data-el="text"]');
            const note = root.querySelector('[data-el="note"]');
            const due  = root.querySelector('[data-el="due"]');
            const resp = root.querySelector('[data-el="responsible"]');
            if (text) text.value = (t.text != null) ? String(t.text) : '';
            if (note) {
                note.value = (t.note != null) ? String(t.note) : '';
                if (!note.__wnDateAttached) attachDateTrigger(note);
            }
            if (text && !text.__wnDateAttached) attachDateTrigger(text);
            const initialDue = (t.dueDate && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(t.dueDate)) ? t.dueDate : '';
            if (due) due.value = initialDue;
            this._updateDueTrigger(initialDue);
            this._loadPeople(t.responsible || '').then(() => {
                if (resp) resp.value = t.responsible || '';
            });
            if (text) {
                text.focus();
                try { text.setSelectionRange(text.value.length, text.value.length); } catch {}
            }
        }, 0);
    }

    close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this._callback = null;
    }

    async _loadPeople(currentKey) {
        const root = this.shadowRoot;
        if (!root) return;
        const sel = root.querySelector('[data-el="responsible"]');
        if (!sel) return;
        const meKey = (typeof window !== 'undefined' && window.mePersonKey) || '';
        try {
            const resp = await fetch('/api/people');
            const arr = await resp.json();
            if (!Array.isArray(arr)) return;
            const items = arr
                .filter(p => p && p.key)
                .map(p => ({ key: p.key, name: p.name || p.key, isMe: p.key === meKey }))
                .sort((a, b) => {
                    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            const opts = ['<option value="">(ingen)</option>'];
            for (const p of items) {
                const label = p.isMe ? `${p.name} (meg)` : p.name;
                opts.push(`<option value="${escapeHtml(p.key)}">${escapeHtml(label)}</option>`);
            }
            sel.innerHTML = opts.join('');
            if (currentKey) sel.value = currentKey;
        } catch {}
    }

    _currentId() {
        return (this._data && this._data.task && this._data.task.id) || null;
    }

    _runCallback(result) {
        const cb = this._callback;
        this._callback = null;
        if (cb) {
            try { cb(result); }
            catch (err) { console.error('task-edit-modal callback failed', err); }
        }
    }

    _cancel() {
        const id = this._currentId();
        this._closeDuePicker();
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ saved: false, id });
    }

    _save() {
        const id = this._currentId();
        const root = this.shadowRoot;
        if (!root) { this._cancel(); return; }
        const text = (root.querySelector('[data-el="text"]') || {}).value || '';
        const note = (root.querySelector('[data-el="note"]') || {}).value || '';
        const due  = (root.querySelector('[data-el="due"]')  || {}).value || '';
        const resp = (root.querySelector('[data-el="responsible"]') || {}).value || '';
        const patch = {
            text: text.trim(),
            note: note,
            responsible: resp,
            // Always send dueDate so server can clear it when blank.
            dueDate: due,
        };
        if (!patch.text) {
            // Don't allow saving an empty task text.
            const ti = root.querySelector('[data-el="text"]');
            if (ti) ti.focus();
            return;
        }
        this._closeDuePicker();
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ saved: true, id, patch });
    }

    connectedCallback() {
        super.connectedCallback();
        this._wire();
        if (this._keyWired) return;
        this._keyWired = true;
        this._onKey = (e) => {
            if (!this.hasAttribute('open')) return;
            if (e.key === 'Escape') { e.preventDefault(); this._cancel(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._save(); }
        };
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onKey);
    }

    _updateDueTrigger(value) {
        const root = this.shadowRoot;
        if (!root) return;
        const trig = root.querySelector('[data-el="due-trigger"]');
        if (!trig) return;
        if (value) {
            trig.textContent = value;
            trig.classList.remove('empty');
        } else {
            trig.textContent = 'Velg tidspunkt…';
            trig.classList.add('empty');
        }
    }

    _setDue(value) {
        const root = this.shadowRoot;
        if (!root) return;
        const hidden = root.querySelector('[data-el="due"]');
        if (hidden) hidden.value = value || '';
        this._updateDueTrigger(value);
    }

    _openDuePicker() {
        // Mount the picker as a popup attached to document.body so it
        // overlays the modal correctly. Mirrors the approach used by
        // wn-date-trigger.js.
        this._closeDuePicker();
        const root = this.shadowRoot;
        if (!root) return;
        const trig = root.querySelector('[data-el="due-trigger"]');
        if (!trig) return;

        const picker = document.createElement('date-time-picker');
        picker.setAttribute('mode', 'datetime');
        const current = (root.querySelector('[data-el="due"]') || {}).value || '';
        if (current) picker.setAttribute('value', current);

        picker.style.cssText = 'position:fixed;z-index:9999;visibility:hidden;left:-9999px;top:0';
        document.body.appendChild(picker);
        this._duePicker = picker;

        const place = () => {
            const rect = trig.getBoundingClientRect();
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
        // Defer placement until the picker has rendered.
        requestAnimationFrame(place);

        const onSelected = (e) => {
            const v = (e && e.detail && e.detail.value) || '';
            this._setDue(v);
            this._closeDuePicker();
        };
        const onCancelled = () => this._closeDuePicker();
        const onOutside = (e) => {
            if (!this._duePicker) return;
            if (e.target === picker || picker.contains(e.target)) return;
            // Click on the trigger again should toggle, not re-open.
            this._closeDuePicker();
        };

        picker.addEventListener('datetime-selected', onSelected);
        picker.addEventListener('datetime-cancelled', onCancelled);
        // Use capture so we beat the modal's own click handler.
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

    _wire() {
        if (this._wired) return;
        const root = this.shadowRoot;
        if (!root) return;
        this._wired = true;
        root.addEventListener('click', (e) => {
            if (e.target.matches('[data-backdrop]')) { this._cancel(); return; }
            const trig = e.target.closest('[data-el="due-trigger"]');
            if (trig) { e.stopPropagation(); this._openDuePicker(); return; }
            const clear = e.target.closest('[data-el="due-clear"]');
            if (clear) { e.stopPropagation(); this._setDue(''); return; }
            const a = e.target.closest('[data-act]');
            if (!a) return;
            if (a.dataset.act === 'cancel') this._cancel();
            if (a.dataset.act === 'save')   this._save();
        });
    }
}

if (!customElements.get('task-edit-modal')) customElements.define('task-edit-modal', TaskEditModal);

// Page-level singleton + event handler. Any code that wants to edit a
// task dispatches a bubbling `task:request-edit` event; the listener
// here mounts the modal lazily, opens it, optionally calls
// `service.update(id, patch)` itself, and forwards the result via the
// supplied callback (if any).
//
//   el.dispatchEvent(new CustomEvent('task:request-edit', {
//       bubbles: true, composed: true,
//       detail: {
//           task,                 // required: task object to edit
//           service,              // optional: TaskService-shaped object;
//                                 //   if present and saved, listener calls
//                                 //   service.update(id, patch).
//           callback: (res) => { ... },  // optional
//       },
//   }));
function getTaskEditModal() {
    if (typeof document === 'undefined') return null;
    let m = document.querySelector('body > task-edit-modal[data-singleton="page"]');
    if (!m) {
        m = document.createElement('task-edit-modal');
        m.setAttribute('data-singleton', 'page');
        document.body.appendChild(m);
    }
    return m;
}

if (typeof document !== 'undefined' && !document._taskEditRequestWired) {
    document._taskEditRequestWired = true;
    document.addEventListener('task:request-edit', (ev) => {
        const detail = (ev && ev.detail) || {};
        const task = detail.task;
        if (!task) return;
        const cb = (typeof detail.callback === 'function') ? detail.callback : null;
        const svc = detail.service || null;
        const m = getTaskEditModal();
        if (!m) { if (cb) cb({ saved: false, id: task.id }); return; }
        m.open(task, async (res) => {
            if (res && res.saved && svc && typeof svc.update === 'function') {
                try { await svc.update(res.id, res.patch); }
                catch (err) { console.error('task-edit-modal: update failed', err); }
                document.dispatchEvent(new CustomEvent('task:updated', {
                    bubbles: true, detail: { id: res.id, patch: res.patch },
                }));
            }
            if (cb) cb(res);
        });
    });
}

if (typeof window !== 'undefined') {
    window.getTaskEditModal = getTaskEditModal;
    window.openTaskEditModal = function openTaskEditModal(task, cb) {
        const m = getTaskEditModal();
        if (!m) { if (cb) cb({ saved: false, id: task && task.id }); return; }
        m.open(task, cb);
        return m;
    };
}
