/**
 * <task-create-modal> — dumb modal hosting a <task-create> form.
 *
 * Callback API (no trigger button, no global state):
 *   modal.open(callback?)
 *     → callback({ created: true,  task, tasks })  on successful create
 *     → callback({ created: false })               on Esc / backdrop / ✕
 *   modal.close()                                  closes silently
 *
 * The component also re-bubbles the inner 'task:created' /
 * 'task:create-failed' events so the global task notification flow keeps
 * working.
 *
 * Attributes:
 *   modal-title    — modal heading (default "Ny oppgave")
 *   placeholder    — forwarded to <task-create>
 *   tasks_service  — forwarded to <task-create>
 */
import { WNElement, html } from './_shared.js';

const STYLES = `
    :host { display: contents; font: inherit; }

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
`;

class TaskCreateModal extends WNElement {
    static get observedAttributes() { return ['modal-title', 'placeholder', 'tasks_service']; }

    css() { return STYLES; }

    render() {
        const title = this.getAttribute('modal-title') || 'Ny oppgave';
        const placeholder = this.getAttribute('placeholder') || 'Beskriv oppgaven…';
        const svcPath = this.getAttribute('tasks_service') || '';
        return html`
            <div class="backdrop" data-backdrop>
                <div class="card" role="dialog" aria-modal="true">
                    <div class="head">
                        <h3>${title}</h3>
                        <button type="button" class="close" data-act="close" title="Lukk (Esc)">✕</button>
                    </div>
                    <task-create
                        placeholder="${placeholder}"
                        tasks_service="${svcPath}"
                    ></task-create>
                </div>
            </div>
        `;
    }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;

        this.shadowRoot.addEventListener('click', (ev) => {
            const t = ev.target.closest('[data-act]');
            if (t && t.getAttribute('data-act') === 'close') {
                this._runCallback({ created: false });
                this._closeQuiet();
                return;
            }
            if (ev.target.matches('[data-backdrop]')) {
                this._runCallback({ created: false });
                this._closeQuiet();
            }
        });

        this.shadowRoot.addEventListener('task:created', (ev) => {
            const detail = (ev && ev.detail) || {};
            this._runCallback({ created: true, task: detail.task, tasks: detail.tasks });
            this._closeQuiet();
        });

        this._onKey = (ev) => {
            if (ev.key === 'Escape' && this.hasAttribute('open')) {
                ev.preventDefault();
                this._runCallback({ created: false });
                this._closeQuiet();
            }
        };
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onKey);
    }

    /**
     * Open the modal. Optional callback is invoked exactly once with
     *   { created: true, task, tasks }   on successful create
     *   { created: false }               on cancel
     */
    open(callback) {
        this._callback = (typeof callback === 'function') ? callback : null;
        this.setAttribute('open', '');
        const tc = this.shadowRoot.querySelector('task-create');
        if (tc && typeof tc.focus === 'function') {
            setTimeout(() => tc.focus(), 0);
        }
    }

    /** Close without firing the callback. */
    close() { this._callback = null; this._closeQuiet(); }

    _closeQuiet() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        const tc = this.shadowRoot.querySelector('task-create');
        if (tc) tc.value = '';
    }

    _runCallback(result) {
        const cb = this._callback;
        this._callback = null;
        if (cb) { try { cb(result); } catch (e) { console.error('task-create-modal callback', e); } }
    }
}

if (!customElements.get('task-create-modal')) customElements.define('task-create-modal', TaskCreateModal);
