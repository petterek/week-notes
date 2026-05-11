/**
 * <task-edit-modal>
 *
 * Centered modal that wraps <task-create-full> for edit / create flows.
 * The inner component owns the form, validation and persistence; this
 * shell just shows/hides it and routes the result back to the caller.
 *
 *   const modal = document.createElement('task-edit-modal');
 *   modal.open(taskObj, (res) => { if (res.saved) ... });
 *
 * Methods:
 *   - open(task, callback) — task with id ⇒ edit mode; without ⇒ create.
 *     Callback runs once with one of:
 *         { saved: true,  id, patch }   (patch carries the saved values)
 *         { saved: false, id }
 *   - close() — hides silently (no callback).
 *
 * Keyboard: Escape cancels, click outside the card cancels.
 *
 * Page-level singleton + `task:request-edit` document listener mirrors
 * the previous API so existing callers keep working.
 */
import { WNElement, html, escapeHtml, unsafeHTML } from './_shared.js';
import '/components/task-create-full.js';
import '/components/note-view.js';

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

    .source-ref {
        margin: -4px 0 12px;
        padding: 6px 10px;
        background: var(--surface-alt);
        border: 1px solid var(--border-soft);
        border-radius: 6px;
        font-size: 0.85em;
        color: var(--text-muted);
        display: flex; align-items: center; gap: 6px;
    }
    .source-ref a { color: var(--accent); text-decoration: none; }
    .source-ref a:hover { text-decoration: underline; }

    .hint { color: var(--text-subtle); font-size: 0.78em; margin-top: 6px; }
`;

class TaskEditModal extends WNElement {
    static get observedAttributes() { return ['open']; }

    css() { return STYLES; }

    render() {
        const t = (this._data && this._data.task) || null;
        const id = t ? (t.id || '') : '';
        const isCreate = !id;
        const noteRef = (t && typeof t.noteRef === 'string' && /^[^/]+\/[^/]+\.md$/.test(t.noteRef)) ? t.noteRef : '';
        let sourceRef = '';
        if (noteRef) {
            const [w, f] = noteRef.split('/');
            const label = f.replace(/\.md$/, '');
            sourceRef = `<div class="source-ref">📝 Fra notat: <a href="#" data-act="view-source" data-week="${escapeHtml(w)}" data-file="${escapeHtml(f)}" title="Vis notatet">${escapeHtml(label)}</a> <span>· ${escapeHtml(w)}</span></div>`;
        }
        const title = isCreate ? '➕ Ny oppgave' : '✎ Rediger oppgave';
        const buttonLabel = isCreate ? '💾 Opprett' : '💾 Lagre';
        const week = (t && t.week) ? ` week="${escapeHtml(t.week)}"` : '';
        const goalId = (t && t.goalId) ? ` goal-id="${escapeHtml(t.goalId)}"` : '';
        return html`
            <div class="backdrop" data-backdrop>
                <div class="card" role="dialog" aria-modal="true" aria-labelledby="tem-h">
                    <div class="head">
                        <h3 id="tem-h">${title}</h3>
                        <button type="button" class="close" data-act="cancel" title="Lukk (Esc)">✕</button>
                    </div>
                    ${sourceRef ? unsafeHTML(sourceRef) : ''}
                    ${unsafeHTML(`<task-create-full
                        data-el="form"
                        tasks_service="week-note-services.tasks_service"
                        people_service="week-note-services.people_service"
                        button-label="${escapeHtml(buttonLabel)}"
                        placeholder="Hva skal gjøres?"
                        ${week}
                        ${goalId}></task-create-full>`)}
                    <div class="hint">Esc for å avbryte. Markdown og @mentions støttes i notat.</div>
                </div>
            </div>
        `;
    }

    afterRender() {
        if (!this._data) return;
        const root = this.shadowRoot;
        if (!root) return;
        const form = root.querySelector('[data-el="form"]');
        if (!form) return;
        const t = (this._data && this._data.task) || {};
        // Push the task into the inner form. Setting .task triggers
        // edit mode + prefill (or create mode if no id).
        if (t && t.id) {
            form.task = t;
        } else {
            // Create mode — clear any prior state on the singleton.
            form._task = null;
            if (form._wired) {
                if (form._input) form._input.value = '';
                if (form._noteIn) form._noteIn.value = '';
                if (form._setDue) form._setDue('');
                if (form._respSel) form._respSel.value = '';
                if (form._goalSel) form._goalSel.value = '';
                if (form._apply) form._apply();
            }
        }
        // Focus the text input shortly after the inner form has wired.
        requestAnimationFrame(() => {
            try {
                const txt = form.shadowRoot && form.shadowRoot.querySelector('input.txt');
                if (txt) {
                    txt.focus();
                    try { txt.setSelectionRange(txt.value.length, txt.value.length); } catch {}
                }
            } catch {}
        });
    }

    setData(d) {
        this._data = d || {};
        this.requestRender();
    }

    open(task, callback) {
        this._callback = (typeof callback === 'function') ? callback : null;
        this.setData({ task: task || {} });
        this.setAttribute('open', '');
    }

    close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this._callback = null;
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
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ saved: false, id });
    }

    _openSourceNote(week, file) {
        if (typeof document === 'undefined') return;
        if (typeof window !== 'undefined' && typeof window.openNoteViewModal === 'function') {
            window.openNoteViewModal(week, encodeURIComponent(file));
            return;
        }
        const existing = document.querySelector('note-view[data-task-source]');
        if (existing) existing.remove();
        const v = document.createElement('note-view');
        v.setAttribute('notes_service', 'week-note-services.notes_service');
        v.setAttribute('data-task-source', '1');
        v.addEventListener('note-view:close', () => { try { v.remove(); } catch (_) {} });
        document.body.appendChild(v);
        if (typeof v.open === 'function') v.open(`${week}/${encodeURIComponent(file)}`);
        else { v.setAttribute('path', `${week}/${encodeURIComponent(file)}`); v.setAttribute('open', ''); }
    }

    connectedCallback() {
        super.connectedCallback();
        this._wire();
        if (this._keyWired) return;
        this._keyWired = true;
        this._onKey = (e) => {
            if (!this.hasAttribute('open')) return;
            if (e.key === 'Escape') { e.preventDefault(); this._cancel(); }
        };
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
        if (this._onKey) document.removeEventListener('keydown', this._onKey);
    }

    _wire() {
        if (this._wired) return;
        const root = this.shadowRoot;
        if (!root) return;
        this._wired = true;
        root.addEventListener('click', (e) => {
            if (e.target.matches('[data-backdrop]')) { this._cancel(); return; }
            const a = e.target.closest('[data-act]');
            if (!a) return;
            if (a.dataset.act === 'cancel') this._cancel();
            if (a.dataset.act === 'view-source') {
                e.preventDefault();
                const w = a.dataset.week, f = a.dataset.file;
                if (w && f) this._openSourceNote(w, f);
            }
        });
        // Catch task:created / task:updated dispatched by the inner
        // <task-create-full>. composed:true bubbles them across the shadow
        // boundary into our root.
        root.addEventListener('task:created', (ev) => {
            if (!this.hasAttribute('open')) return;
            const detail = (ev && ev.detail) || {};
            const task = detail.task || {};
            const id = task.id || null;
            const patch = {
                text: task.text || '',
                note: task.note || '',
                responsible: task.responsible || '',
                dueDate: task.dueDate || '',
                goalId: task.goalId || null,
            };
            this.removeAttribute('open');
            this._runCallback({ saved: true, id, patch });
        });
        root.addEventListener('task:updated', (ev) => {
            if (!this.hasAttribute('open')) return;
            const detail = (ev && ev.detail) || {};
            this.removeAttribute('open');
            this._runCallback({ saved: true, id: detail.id || null, patch: detail.patch || {} });
        });
    }
}

if (!customElements.get('task-edit-modal')) customElements.define('task-edit-modal', TaskEditModal);

// Page-level singleton + event handler. Any code that wants to edit a
// task dispatches a bubbling `task:request-edit` event; the listener
// here mounts the modal lazily, opens it, and forwards the result via
// the supplied callback (if any). The inner <task-create-full> handles
// persistence itself, so we don't call service.update/create here.
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
        const m = getTaskEditModal();
        if (!m) { if (cb) cb({ saved: false, id: task.id }); return; }
        m.open(task, (res) => { if (cb) cb(res); });
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
