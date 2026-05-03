/**
 * <task-note> — dumb form for editing a task's note (markdown).
 *
 * The component does not load or save anything; the host owns the
 * service AND the modal chrome (typically wrap it in a
 * <modal-container>). Set the current task via the `task` property
 * and listen for `task-note:save` / `task-note:cancel` events.
 *
 * Properties:
 *   .task = { id, text, note }   sets header + textarea content
 *
 * Methods:
 *   .focus()                     focus the textarea (cursor at end)
 *   .save()                      emit save event with current note
 *   .cancel()                    emit cancel event
 *
 * Events (bubbles, composed):
 *   task-note:save    detail: { id, note }
 *   task-note:cancel  detail: { id }
 *
 * Keyboard shortcuts inside the textarea: Ctrl/Cmd+Enter saves,
 * Escape cancels.
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const STYLES = `
    :host { display: block; font: inherit; }
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
    .hint { color: var(--text-subtle); font-size: 0.78em; margin-top: 6px; }
`;

class TaskNote extends WNElement {
    css() { return STYLES; }

    render() {
        const t = this._task || {};
        const text = t.text || '';
        return html`
            ${text ? html`<p class="task-text">${escapeHtml(text)}</p>` : html``}
            <textarea data-el="note" rows="6" placeholder="Skriv notat her…"></textarea>
            <div class="hint">Ctrl/⌘ + Enter for å lagre, Esc for å avbryte. Markdown og @mentions støttes.</div>
        `;
    }

    set task(v) {
        this._task = v || {};
        this.requestRender();
        queueMicrotask(() => {
            const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="note"]');
            if (ta) ta.value = (this._task && typeof this._task.note === 'string') ? this._task.note : '';
        });
    }
    get task() { return this._task || {}; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('keydown', (e) => {
            if (!e.target.matches('[data-el="note"]')) return;
            if (e.key === 'Escape') { e.preventDefault(); this.cancel(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.save(); }
        });
    }

    focus() {
        const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="note"]');
        if (!ta) return;
        ta.focus();
        const len = ta.value.length;
        try { ta.setSelectionRange(len, len); } catch {}
    }

    save() {
        const id = (this._task && this._task.id) || null;
        const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="note"]');
        const note = ta ? ta.value.trim() : '';
        this.dispatchEvent(new CustomEvent('task-note:save', {
            bubbles: true, composed: true, detail: { id, note },
        }));
    }

    cancel() {
        const id = (this._task && this._task.id) || null;
        this.dispatchEvent(new CustomEvent('task-note:cancel', {
            bubbles: true, composed: true, detail: { id },
        }));
    }
}

if (!customElements.get('task-note')) customElements.define('task-note', TaskNote);
