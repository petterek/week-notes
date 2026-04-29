/**
 * <task-note-modal>
 *
 * Centered modal that edits a task's note (markdown). The component is
 * dumb &mdash; it does not load or save anything. The host opens it
 * with a task object and a callback that receives the result.
 *
 *   const modal = document.createElement('task-note-modal');
 *   modal.open({ id: 't42', text: 'Rapport', note: 'eksisterende' }, (res) => {
 *       if (res.saved) service.update(res.id, { note: res.note });
 *   });
 *
 * Methods:
 *   - open(task, callback) — sets the task, shows the modal, focuses
 *     the textarea (cursor at end). Callback runs once with one of:
 *         { saved: true,  id, note }
 *         { saved: false, id }
 *   - close() — hides the modal silently (no callback).
 *
 * Keyboard: Escape cancels, Ctrl/Cmd+Enter saves. Backdrop click and
 * the ✕ button cancel.
 */
import { WNElement, html, escapeHtml } from './_shared.js';

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
        padding: 18px 20px; width: min(560px, 92vw);
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

    .task-text {
        color: var(--text-muted); font-weight: 600;
        margin: 0 0 14px; word-break: break-word;
    }
    textarea {
        width: 100%; box-sizing: border-box;
        min-height: 140px; resize: vertical;
        padding: 8px 10px;
        background: var(--surface); color: var(--text-strong);
        border: 1px solid var(--border); border-radius: 6px;
        font: inherit; font-size: 0.95em;
    }
    textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

    .actions {
        display: flex; justify-content: flex-end; gap: 8px;
        margin-top: 14px;
    }
    button.btn {
        padding: 8px 14px; border: none; border-radius: 8px;
        font: inherit; font-weight: 600; cursor: pointer; font-size: 0.95em;
    }
    button.cancel {
        background: var(--surface-alt); color: var(--text);
    }
    button.cancel:hover { background: var(--surface-head); }
    button.save {
        background: var(--accent); color: var(--text-on-accent);
    }
    button.save:hover { filter: brightness(0.95); }

    .hint { color: var(--text-subtle); font-size: 0.78em; margin-top: 6px; }
`;

class TaskNoteModal extends WNElement {
    static get observedAttributes() { return ['open']; }

    css() { return STYLES; }

    render() {
        const t = (this._data && this._data.task) || null;
        const text = t ? (t.text || '') : '';
        return html`
            <div class="backdrop" data-backdrop>
                <div class="card" role="dialog" aria-modal="true" aria-labelledby="tnm-h">
                    <div class="head">
                        <h3 id="tnm-h">📓 Notat</h3>
                        <button type="button" class="close" data-act="cancel" title="Lukk (Esc)">✕</button>
                    </div>
                    <p class="task-text">${escapeHtml(text)}</p>
                    <textarea data-el="note" rows="6"
                        placeholder="Skriv notat her…"></textarea>
                    <div class="hint">Ctrl/⌘ + Enter for å lagre, Esc for å avbryte. Markdown og @mentions støttes.</div>
                    <div class="actions">
                        <button type="button" class="btn cancel" data-act="cancel">Avbryt</button>
                        <button type="button" class="btn save"   data-act="save">💾 Lagre</button>
                    </div>
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
        const initial = (task && typeof task.note === 'string') ? task.note : '';
        setTimeout(() => {
            const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="note"]');
            if (ta) {
                ta.value = initial;
                ta.focus();
                const len = ta.value.length;
                try { ta.setSelectionRange(len, len); } catch {}
            }
        }, 0);
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
            catch (err) { console.error('task-note-modal callback failed', err); }
        }
    }

    _cancel() {
        const id = this._currentId();
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ saved: false, id });
    }

    _save() {
        const id = this._currentId();
        const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="note"]');
        const note = ta ? ta.value.trim() : '';
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ saved: true, id, note });
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
            if (a.dataset.act === 'save')   this._save();
        });
    }
}

if (!customElements.get('task-note-modal')) customElements.define('task-note-modal', TaskNoteModal);
