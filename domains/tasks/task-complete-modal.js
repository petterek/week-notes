/**
 * <task-complete-modal>
 *
 * Centered modal that confirms completion of a single task and lets the
 * user attach an optional comment. The component is dumb &mdash; it does
 * not load or save anything. The host opens it with a task object and a
 * callback that receives the result.
 *
 *   const modal = document.createElement('task-complete-modal');
 *   modal.open({ id: 't42', text: 'Sende rapport til @anna' }, (res) => {
 *       if (res.confirmed) service.toggle(res.id, res.comment);
 *       else cb.checked = false;
 *   });
 *
 * Methods:
 *   - open(task, callback)  — sets the task, shows the modal, stores the
 *                             callback. The textarea is cleared and focused.
 *                             Callback runs once with one of:
 *                               { confirmed: true,  id, comment }
 *                               { confirmed: false, id }
 *   - close()               — hides the modal (no callback).
 *
 * Keyboard: Escape cancels, Ctrl/Cmd+Enter confirms. Clicking the
 * backdrop or the close button cancels.
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
        padding: 18px 20px; width: min(520px, 92vw);
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
        min-height: 92px; resize: vertical;
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
    button.confirm {
        background: var(--success); color: var(--text-on-accent);
    }
    button.confirm:hover { background: var(--success-strong); }

    .hint { color: var(--text-subtle); font-size: 0.78em; margin-top: 6px; }
`;

class TaskCompleteModal extends WNElement {
    static get observedAttributes() { return ['open']; }

    css() { return STYLES; }

    render() {
        const t = (this._data && this._data.task) || null;
        const text = t ? (t.text || '') : '';
        return html`
            <div class="backdrop" data-backdrop>
                <div class="card" role="dialog" aria-modal="true" aria-labelledby="ctm-h">
                    <div class="head">
                        <h3 id="ctm-h">✅ Fullfør oppgave</h3>
                        <button type="button" class="close" data-act="cancel" title="Lukk (Esc)">✕</button>
                    </div>
                    <p class="task-text">${escapeHtml(text)}</p>
                    <textarea data-el="comment" rows="4"
                        placeholder="Legg til en kommentar (valgfritt)…"></textarea>
                    <div class="hint">Ctrl/⌘ + Enter for å fullføre, Esc for å avbryte.</div>
                    <div class="actions">
                        <button type="button" class="btn cancel"  data-act="cancel">Avbryt</button>
                        <button type="button" class="btn confirm" data-act="confirm">✅ Fullført</button>
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
        if (task) this.setData({ task });
        this._callback = (typeof callback === 'function') ? callback : null;
        this.setAttribute('open', '');
        setTimeout(() => {
            const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="comment"]');
            if (ta) { ta.value = ''; ta.focus(); }
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
            catch (err) { console.error('task-complete-modal callback failed', err); }
        }
    }

    _cancel() {
        const id = this._currentId();
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ confirmed: false, id });
    }

    _confirm() {
        const id = this._currentId();
        const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="comment"]');
        const comment = ta ? ta.value.trim() : '';
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ confirmed: true, id, comment });
    }

    connectedCallback() {
        super.connectedCallback();
        this._wire();
        if (this._keyWired) return;
        this._keyWired = true;
        this._onKey = (e) => {
            if (!this.hasAttribute('open')) return;
            if (e.key === 'Escape') { e.preventDefault(); this._cancel(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._confirm(); }
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
            if (a.dataset.act === 'cancel')  this._cancel();
            if (a.dataset.act === 'confirm') this._confirm();
        });
    }
}

if (!customElements.get('task-complete-modal')) customElements.define('task-complete-modal', TaskCompleteModal);

// Page-level singleton + event handler. Any code that needs to confirm
// task completion dispatches a bubbling `task:request-complete` event;
// a single document-level listener mounts the modal lazily, opens it,
// and resolves the callback supplied in event.detail.
//
//   el.dispatchEvent(new CustomEvent('task:request-complete', {
//       bubbles: true, composed: true,
//       detail: { id, text, callback: (res) => { ... } },
//   }));
//
// `res` is `{ confirmed: true, id, comment }` or `{ confirmed: false, id }`.
// `composed: true` lets the event escape shadow DOM boundaries.
function getTaskCompleteModal() {
    if (typeof document === 'undefined') return null;
    let m = document.querySelector('body > task-complete-modal[data-singleton="page"]');
    if (!m) {
        m = document.createElement('task-complete-modal');
        m.setAttribute('data-singleton', 'page');
        document.body.appendChild(m);
    }
    return m;
}

if (typeof document !== 'undefined' && !document._taskCompleteRequestWired) {
    document._taskCompleteRequestWired = true;
    document.addEventListener('task:request-complete', (ev) => {
        const detail = (ev && ev.detail) || {};
        const cb = (typeof detail.callback === 'function') ? detail.callback : null;
        const m = getTaskCompleteModal();
        if (!m) {
            if (cb) cb({ confirmed: false, id: detail.id });
            return;
        }
        m.open({ id: detail.id, text: detail.text || '' }, (res) => {
            if (cb) cb(res);
        });
    });
}

if (typeof window !== 'undefined') {
    // Backwards-compatible direct entry points.
    window.getTaskCompleteModal = getTaskCompleteModal;
    window.openTaskCompleteModal = function openTaskCompleteModal(task, cb) {
        const m = getTaskCompleteModal();
        if (!m) { if (cb) cb({ confirmed: false, id: task && task.id }); return; }
        m.open(task, cb);
        return m;
    };
}
