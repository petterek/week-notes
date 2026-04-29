/**
 * <open-tasks service="TaskService"> — self-loading sidebar widget that lists
 * open tasks. Renders inside its own shadow DOM. Theming flows from the page
 * via inherited CSS custom properties (--accent, --text, --surface, …).
 *
 * Service contract (window[serviceName]):
 *   list() → Promise<Task[]>
 *
 * Action handlers (optional window globals; component dispatches events as fallback):
 *   - showCommentModal(checkbox) : toggling a checkbox
 *   - openNoteModal(taskId)      : note button
 * Mentions bubble 'mention-clicked' (handled at page level).
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions, wireMentionClicks, people as fetchPeople, companies as fetchCompanies } from './_shared.js';

const STYLES = `
        :host { display: block; color: var(--text-strong); font: inherit; }
        .side-h {
            font-family: var(--font-heading);
            font-weight: 400;
            color: var(--accent);
            border-bottom: 1px solid var(--border-soft);
            padding-bottom: 6px;
            margin: 0 0 10px;
            font-size: 1.05em;
        }
        .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }
        .sidebar-tasks { display: flex; flex-direction: column; gap: 6px; }
        .sidebar-task { padding: 6px 8px; border-radius: 6px; background: var(--surface); }
        .sidebar-task:hover { background: var(--surface-alt); }
        .row { display: flex; align-items: center; gap: 8px; }
        .row input[type="checkbox"] { accent-color: var(--accent); }
        .row-text { flex: 1; word-break: break-word; }
        .row-text a { color: var(--accent); text-decoration: none; }
        .row-text a:hover { text-decoration: underline; }
        .row-note-btn {
            border: 0; background: transparent; cursor: pointer;
            opacity: 0.6; padding: 0 4px; font-size: 1em;
        }
        .row-note-btn:hover { opacity: 1; }
        .row-note-btn.empty { opacity: 0.25; }
        .row-note-body {
            margin: 6px 0 2px 26px;
            color: var(--text); font-size: 0.92em;
        }
        .row-note-body p { margin: 2px 0; }
`;

function renderTask(t, people, companies) {
        const id = t.id || '';
        const week = t.week || '';
        const weekBadge = week ? unsafeHTML(`<week-pill week="${escapeHtml(week)}"></week-pill>`) : '';
        const textHtml = unsafeHTML(linkMentions(escapeHtml(t.text || ''), people, companies));
        const hasNote = !!(t.note && t.note.trim());
        const noteHtml = hasNote && window.marked
            ? linkMentions(window.marked.parse(t.note), people, companies)
            : (hasNote ? escapeHtml(t.note) : '');
        const noteBody = hasNote ? unsafeHTML(`<div class="md-content row-note-body">${noteHtml}</div>`) : '';
        const noteBtnCls = hasNote ? 'row-note-btn' : 'row-note-btn empty';
        const noteBtnTitle = hasNote ? 'Rediger notat' : 'Legg til notat';
        return html`
            <div class="sidebar-task" data-taskid="${id}">
                <div class="row">
                    <input type="checkbox" data-taskid="${id}" data-tasktext="${t.text || ''}" data-act="toggle" />
                    <span class="row-text">${textHtml}</span>
                    ${weekBadge}
                    <button type="button" class="${noteBtnCls}" data-act="note" data-taskid="${id}" title="${noteBtnTitle}">📓</button>
                </div>
                ${noteBody}
            </div>
        `;
}

class OpenTasks extends WNElement {
    static get observedAttributes() { return ['service']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (this.service) this._load();
        this._onTaskCreated = () => this.refresh();
        document.addEventListener('task:created', this._onTaskCreated);
    }

    disconnectedCallback() {
        if (this._onTaskCreated) document.removeEventListener('task:created', this._onTaskCreated);
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.isConnected && this.service && oldVal !== newVal) this._load();
    }

    refresh() { this._load(); }

    async _load() {
        try {
            const [tasks, people, companies] = await Promise.all([
                this.service.list(),
                fetchPeople(),
                fetchCompanies(),
            ]);
            const open = (tasks || []).filter(t => !t.done);
            this._state = { open, people: people || [], companies: companies || [] };
        } catch {
            this._state = { error: true };
        }
        this.requestRender();
        if (!this._wired) {
            this._wired = true;
            this.shadowRoot.addEventListener('change', (ev) => {
                const cb = ev.target.closest('input[data-act="toggle"]');
                if (!cb) return;
                if (typeof window.showCommentModal === 'function') {
                    window.showCommentModal(cb);
                } else {
                    this.dispatchEvent(new CustomEvent('open-tasks:toggle', {
                        bubbles: true, composed: true, detail: { id: cb.dataset.taskid, checkbox: cb },
                    }));
                }
            });
            this.shadowRoot.addEventListener('click', (ev) => {
                const noteBtn = ev.target.closest('button[data-act="note"]');
                if (!noteBtn) return;
                const id = noteBtn.dataset.taskid;
                if (typeof window.openNoteModal === 'function') {
                    window.openNoteModal(id);
                } else {
                    this.dispatchEvent(new CustomEvent('open-tasks:note', {
                        bubbles: true, composed: true, detail: { id },
                    }));
                }
            });
            wireMentionClicks(this.shadowRoot);
        }
    }

    render() {
        if (!this.service) return this.renderNoService();
        if (!this._state) return html`<h3 class="side-h">Åpne oppgaver</h3><p class="empty-quiet">Laster…</p>`;
        if (this._state.error) return html`<h3 class="side-h">Åpne oppgaver</h3><p class="empty-quiet">Kunne ikke laste oppgaver</p>`;

        const { open, people, companies } = this._state;
        if (open.length === 0) {
            return html`<h3 class="side-h">Åpne oppgaver · 0</h3><p class="empty-quiet">Ingen åpne oppgaver</p>`;
        }
        const rows = open.map(t => renderTask(t, people, companies));
        return html`
            <h3 class="side-h">Åpne oppgaver · ${open.length}</h3>
            <div class="sidebar-tasks">${rows}</div>
        `;
    }
}

if (!customElements.get('open-tasks')) customElements.define('open-tasks', OpenTasks);
