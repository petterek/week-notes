import { WNElement, html, unsafeHTML } from './_shared.js';
import { renderRichText, RICH_TEXT_CSS } from '/services/_shared/wn-rich-text.js';
import '/components/feature-rich-text-area.js';

const STYLES = `
    :host { display: block; margin-top: 16px; color: var(--text); font: inherit; }
    h4 { margin: 0 0 8px; color: var(--text-muted); }
    ol { list-style: none; padding: 0; margin: 0 0 12px; }
    .comment-entry {
        margin-bottom: 8px; padding: 10px 12px;
        background: var(--surface-alt); border: 1px solid var(--border-soft);
        border-radius: 6px; overflow-wrap: anywhere;
    }
    time { display: block; margin-bottom: 6px; color: var(--text-muted); font-size: 0.85em; }
    .empty { color: var(--text-subtle); }
    feature-rich-text-area { display: block; margin-bottom: 8px; }
    button {
        padding: 7px 14px; border: 1px solid var(--accent); border-radius: 6px;
        background: var(--accent); color: var(--text-on-accent); font: inherit; cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: wait; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .hint { color: var(--text-subtle); font-size: 0.8em; }
`;

class TaskComments extends WNElement {
    static get domain() { return 'tasks'; }
    css() { return STYLES + RICH_TEXT_CSS; }

    set task(task) {
        if (this._task?.id !== task?.id) this._draft = '';
        this._task = task;
        this.requestRender();
    }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', e => {
            if (e.target.closest('[data-act="add-comment"]')) this.save();
        });
        this.shadowRoot.addEventListener('keydown', e => {
            if (e.target.matches('feature-rich-text-area') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                this.save();
            }
        });
    }

    async save() {
        if (this._saving) return;
        const editor = this.shadowRoot.querySelector('feature-rich-text-area');
        const button = this.shadowRoot.querySelector('button');
        const error = this.shadowRoot.querySelector('[role="alert"]');
        const text = editor.value;
        error.textContent = '';
        if (!text.trim()) {
            error.textContent = 'Skriv en kommentar.';
            editor.focus();
            return;
        }
        this._saving = true;
        button.disabled = true;
        try {
            if (!this.service?.addComment) throw new Error('Kommentartjenesten er ikke tilgjengelig.');
            const tasks = await this.service.addComment(this._task.id, text);
            const task = Array.isArray(tasks) && tasks.find(t => t.id === this._task.id);
            if (!task) throw new Error('Ugyldig oppgavesvar.');
            this._draft = editor.value === text ? '' : editor.value;
            this._task = task;
            this.requestRender();
            this.dispatchEvent(new CustomEvent('task:commented', {
                bubbles: true, composed: true, detail: { task, tasks },
            }));
            this.shadowRoot.querySelector('feature-rich-text-area').focus();
        } catch (err) {
            error.textContent = 'Kunne ikke lagre kommentaren: ' + err.message;
        } finally {
            this._saving = false;
            button.disabled = false;
        }
    }

    render() {
        const task = this._task;
        if (!task?.id) return html``;
        const comments = task.comments || [];
        return html`
            <h4>Kommentarer</h4>
            ${comments.length ? html`
                <ol>${comments.map(comment => html`
                    <li class="comment-entry">
                        <time datetime="${comment.created}">${new Date(comment.created).toLocaleString('nb-NO', {
                            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}</time>
                        <div class="rich-text">${unsafeHTML(renderRichText(comment.text))}</div>
                    </li>
                `)}</ol>
            ` : html`<p class="empty">Ingen kommentarer ennå.</p>`}
            <feature-rich-text-area rows="3" features="lists,emoji,mentions,dates"
                value="${this._draft || ''}" aria-label="Ny kommentar" placeholder="Skriv en kommentar…"
                people_service="${this.getAttribute('people_service') || 'week-note-services.people_service'}"
                companies_service="${this.getAttribute('companies_service') || 'week-note-services.companies_service'}"
                teams_service="${this.getAttribute('teams_service') || 'week-note-services.teams_service'}"></feature-rich-text-area>
            <button type="button" data-act="add-comment">Legg til kommentar</button>
            <p role="alert"></p>
            <p class="hint">Dato og klokkeslett settes automatisk. Ctrl/⌘ + Enter lagrer.</p>
        `;
    }
}

if (!customElements.get('task-comments')) customElements.define('task-comments', TaskComments);
