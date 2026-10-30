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

import '/components/feature-rich-text-area.js';

const STYLES = `
    :host { display: block; font: inherit; }
    .task-text {
        color: var(--text-muted); font-weight: 600;
        margin: 0 0 14px; word-break: break-word;
    }
    feature-rich-text-area { width: 100%; }
    .hint { color: var(--text-subtle); font-size: 0.78em; margin-top: 6px; }
`;

class TaskNote extends WNElement {
    css() { return STYLES; }

    render() {
        const t = this._task || {};
        const text = t.text || '';
        return html`
            ${text ? html`<p class="task-text">${escapeHtml(text)}</p>` : html``}
            <feature-rich-text-area data-el="note" rows="6"
                        features="lists,emoji,mentions,tasks,results,dates" value="${t.note || ''}"
                        people_service="${this.getAttribute('people_service') || 'week-note-services.people_service'}"
                        companies_service="${this.getAttribute('companies_service') || 'week-note-services.companies_service'}"
                        teams_service="${this.getAttribute('teams_service') || 'week-note-services.teams_service'}"
                        tasks_service="${this.getAttribute('tasks_service') || 'week-note-services.tasks_service'}"
                        results_service="${this.getAttribute('results_service') || 'week-note-services.results_service'}"
                        aria-label="Oppgavenotat" placeholder="Skriv notat her…"></feature-rich-text-area>
            <div class="hint">Ctrl/⌘ + Enter for å lagre, Esc for å avbryte. Markdown og @mentions støttes.</div>
        `;
    }

    set task(v) {
        this._task = v || {};
        this.requestRender();
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

    async save() {
        if (this._converting) return;
        this._converting = true;
        try { await this._saveImpl(); }
        finally { this._converting = false; }
    }

    async _saveImpl() {
        const t = this._task || {};
        const id = t.id || null;
        const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="note"]');
        if (!ta) return;
        // {{X}} / [[X]] become tasks/results; the note keeps the plain text.
        try {
            await ta.convert({ week: t.week || '', taskId: id || '', taskText: t.text || '', replaceWith: 'text' });
        } catch (e) {
            const hint = this.shadowRoot.querySelector('.hint');
            if (hint) hint.textContent = 'Kunne ikke opprette fra markører: ' + (e.message || e);
            return;
        }
        const note = ta.value.trim();
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
