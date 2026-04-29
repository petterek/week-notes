/**
 * <task-create-modal> — renders a "+ Ny oppgave" button. Clicking the
 * button opens a centered modal containing a <task-create> form.
 *
 * Closes automatically when the inner <task-create> dispatches
 * 'task:created', and on Escape, backdrop click, or the close button.
 *
 * Attributes:
 *   button-label  — trigger button text (default "+ Ny oppgave")
 *   modal-title   — modal heading (default "Ny oppgave")
 *   placeholder   — forwarded to <task-create>
 *   endpoint      — forwarded to <task-create>
 *
 * Re-bubbles 'task:created' / 'task:create-failed' through itself so
 * pages can listen on this element instead of digging into the form.
 */
import { WNElement, html } from './_shared.js';

const STYLES = `
    :host { display: inline-block; font: inherit; }
    button.trigger {
        padding: 8px 14px; background: var(--success); color: var(--text-on-accent);
        border: none; border-radius: 8px; font-weight: 600;
        cursor: pointer; font-size: 0.95em; font-family: inherit;
    }
    button.trigger:hover { background: var(--success-strong); }

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
    static get observedAttributes() { return ['button-label', 'modal-title', 'placeholder', 'endpoint']; }

    css() { return STYLES; }

    render() {
        const btnLabel = this.getAttribute('button-label') || '+ Ny oppgave';
        const title = this.getAttribute('modal-title') || 'Ny oppgave';
        const placeholder = this.getAttribute('placeholder') || 'Beskriv oppgaven…';
        const endpoint = this.getAttribute('endpoint') || '/api/tasks';
        return html`
            <button type="button" class="trigger" data-act="open">${btnLabel}</button>
            <div class="backdrop" data-backdrop>
                <div class="card" role="dialog" aria-modal="true">
                    <div class="head">
                        <h3>${title}</h3>
                        <button type="button" class="close" data-act="close" title="Lukk (Esc)">✕</button>
                    </div>
                    <task-create
                        placeholder="${placeholder}"
                        endpoint="${endpoint}"
                        autofocus-on-connect
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
            if (t) {
                const act = t.getAttribute('data-act');
                if (act === 'open') this.open();
                else if (act === 'close') this.close();
                return;
            }
            // Backdrop click (but not card content): close.
            if (ev.target.matches('[data-backdrop]')) this.close();
        });

        this.shadowRoot.addEventListener('task:created', () => this.close());

        this._onKey = (ev) => {
            if (ev.key === 'Escape' && this.hasAttribute('open')) {
                ev.preventDefault();
                this.close();
            }
        };
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onKey);
    }

    open() {
        this.setAttribute('open', '');
        // Re-focus the input — base re-render may have replaced the form,
        // but since open/close don't trigger a re-render we just reach in.
        const tc = this.shadowRoot.querySelector('task-create');
        if (tc && typeof tc.focus === 'function') {
            setTimeout(() => tc.focus(), 0);
        }
    }

    close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        // Clear any leftover input so the next open starts fresh.
        const tc = this.shadowRoot.querySelector('task-create');
        if (tc) tc.value = '';
    }
}

if (!customElements.get('task-create-modal')) customElements.define('task-create-modal', TaskCreateModal);
