/**
 * <task-view> — read-only detail view that renders every attribute of a
 * task object. Schema-driven: shows id, text, done, week, created,
 * completedAt, completedWeek, author, responsible, dueDate, note,
 * commentFile (and any unknown future fields too — last fallback row).
 *
 * Usage:
 *   const v = document.createElement('task-view');
 *   v.task = { id, text, ... };
 *   document.body.append(v);
 *
 * Or via attribute (loads from the tasks service):
 *   <task-view taskid="abc123"
 *              tasks_service="week-note-services.tasks_service"
 *              people_service="week-note-services.people_service"></task-view>
 *
 * Emits no events. Pure presentation.
 */
import {
    WNElement, html, unsafeHTML, escapeHtml,
    linkMentions, wireMentionClicks,
} from './_shared.js';

const STYLES = `
    :host { display: block; color: var(--text-strong); font: inherit; font-size: 0.95em; }
    .wrap {
        background: var(--surface);
        border: 1px solid var(--border-soft);
        border-radius: 8px;
        padding: 14px 16px;
    }
    h3 {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); margin: 0 0 10px;
        font-size: 1.1em;
        border-bottom: 1px solid var(--border-soft); padding-bottom: 6px;
    }
    h3 .badge {
        display: inline-block; margin-left: 8px;
        font-family: ui-sans-serif, system-ui;
        font-size: 0.7em; padding: 2px 7px; border-radius: 10px;
        background: var(--accent-soft); color: var(--accent-strong);
        vertical-align: middle;
    }
    h3 .badge.done {
        background: var(--surface-alt); color: var(--text-muted);
    }
    .text {
        font-size: 1.05em; line-height: 1.4; margin: 0 0 12px;
        word-break: break-word;
    }
    .text.done { text-decoration: line-through; color: var(--text-subtle); }
    .text a { color: var(--accent); }
    dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 4px 14px;
        margin: 0;
    }
    dt {
        color: var(--text-muted); font-size: 0.85em;
        text-transform: uppercase; letter-spacing: 0.04em;
        align-self: baseline; white-space: nowrap;
    }
    dd {
        margin: 0; font-family: ui-monospace, monospace;
        font-size: 0.9em; color: var(--text-strong);
        word-break: break-word;
    }
    dd.muted { color: var(--text-subtle); font-style: italic; }
    dd.overdue { color: var(--accent-strong); font-weight: 600; }
    dd a { color: var(--accent); }
    .note, .comment {
        margin-top: 12px; padding: 10px 12px;
        background: var(--surface-alt);
        border-left: 3px solid var(--accent-soft);
        border-radius: 4px;
        font-size: 0.92em;
        color: var(--text-strong);
    }
    .note { white-space: pre-wrap; }
    .section-h {
        margin-top: 16px; margin-bottom: 4px;
        font-size: 0.78em; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.05em;
        color: var(--text-muted);
    }
    .comment :first-child { margin-top: 0; }
    .comment :last-child { margin-bottom: 0; }
    .comment p { margin: 0.5em 0; }
    .comment a { color: var(--accent); }
    .comment code {
        background: var(--surface); padding: 1px 4px;
        border-radius: 3px; font-size: 0.92em;
    }
    .comment pre {
        background: var(--surface); padding: 8px;
        border-radius: 4px; overflow-x: auto;
    }
    .comment blockquote {
        border-left: 2px solid var(--border);
        margin: 0.5em 0; padding-left: 10px;
        color: var(--text-muted);
    }
    .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }
`;

// Order in which we render known fields. Unknown fields are appended.
const KNOWN_FIELDS = [
    'id', 'text', 'done',
    'week', 'created',
    'completedWeek', 'completedAt', 'completed', 'completedBy',
    'author', 'responsible', 'dueDate',
    'note', 'commentFile',
];

// Norwegian labels for known fields. Unknown fields fall back to the
// raw key so schema additions are still visible without a code change.
const FIELD_LABELS = {
    id: 'ID',
    text: 'Tekst',
    done: 'Fullført',
    week: 'Uke',
    created: 'Opprettet',
    completedWeek: 'Fullført uke',
    completedAt: 'Fullført tidspunkt',
    completed: 'Fullført',
    completedBy: 'Fullført av',
    author: 'Forfatter',
    responsible: 'Ansvarlig',
    dueDate: 'Frist',
    note: 'Notat',
    commentFile: 'Kommentarfil',
};
function labelFor(key) { return FIELD_LABELS[key] || key; }

// Fields that should always render (with a muted "—") even when the
// task doesn't have them yet — so old records pre-schema-change still
// show the slot and it's clear what's missing.
const ALWAYS_SHOW = new Set(['author', 'responsible', 'dueDate']);
// Same idea, but only when the task is marked done.
const ALWAYS_SHOW_WHEN_DONE = new Set(['completedBy']);

class TaskView extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['taskid', 'tasks_service', 'people_service', 'companies_service']; }

    css() { return STYLES; }

    set task(t) {
        this._task = t || null;
        this._comment = null;
        this._commentLoading = false;
        this._loadEntities();
        this._loadComment();
    }
    get task() { return this._task || null; }

    connectedCallback() {
        super.connectedCallback();
        if (this.hasAttribute('taskid') && this.service) this._loadFromService();
        else { this._loadEntities(); this._loadComment(); }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (!this.isConnected) return;
        if (name === 'taskid' && this.service && newVal) this._loadFromService();
    }

    async _loadFromService() {
        try {
            const id = this.getAttribute('taskid');
            const tasks = await this.service.list();
            this._task = (tasks || []).find(t => t.id === id) || null;
        } catch {
            this._task = null;
            this._error = true;
        }
        this._loadEntities();
        this._loadComment();
    }

    _loadComment() {
        const t = this._task;
        const cf = t && t.commentFile;
        if (!cf) { this._comment = null; this._commentError = false; return; }
        const m = String(cf).match(/^([^/]+)\/(.+)$/);
        if (!m) { this._comment = null; this._commentError = true; return; }
        const [, week, file] = m;
        const url = '/api/notes/' + encodeURIComponent(week) + '/' + encodeURIComponent(file) + '/raw';
        this._commentLoading = true;
        this._commentError = false;
        const expected = cf;
        fetch(url, { headers: { 'Accept': 'text/plain' } })
            .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
            .then(text => {
                if (!this._task || this._task.commentFile !== expected) return;
                this._comment = text || '';
                this._commentLoading = false;
                this.requestRender();
            })
            .catch(() => {
                if (!this._task || this._task.commentFile !== expected) return;
                this._comment = null;
                this._commentError = true;
                this._commentLoading = false;
                this.requestRender();
            });
    }

    async _loadEntities() {
        const peopleSvc = this.serviceFor('people');
        const compSvc = this.serviceFor('companies');
        try {
            const [people, companies] = await Promise.all([
                peopleSvc ? peopleSvc.list() : Promise.resolve([]),
                compSvc ? compSvc.list() : Promise.resolve([]),
            ]);
            this._people = people || [];
            this._companies = companies || [];
        } catch {
            this._people = []; this._companies = [];
        }
        this.requestRender();
        if (!this._wired) {
            this._wired = true;
            wireMentionClicks(this.shadowRoot);
        }
    }

    _personLabel(key) {
        if (!key) return '';
        const p = (this._people || []).find(x => x.key === key);
        return p ? `@${p.key}${p.name ? ' (' + p.name + ')' : ''}` : `@${key}`;
    }

    _isOverdue(dueDate, done) {
        if (done || !dueDate) return false;
        const now = new Date();
        const m = String(dueDate).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/);
        if (!m) return false;
        const dueHasTime = m[4] != null;
        const due = new Date(+m[1], +m[2] - 1, +m[3], dueHasTime ? +m[4] : 23, dueHasTime ? +m[5] : 59);
        return due < now;
    }

    _renderField(key, value) {
        const t = this._task;
        const lbl = labelFor(key);
        if (value === undefined || value === null || value === '') {
            return html`<dt>${lbl}</dt><dd class="muted">—</dd>`;
        }
        if (key === 'done') {
            return html`<dt>${lbl}</dt><dd>${value ? 'Ja' : 'Nei'}</dd>`;
        }
        if (key === 'author' || key === 'responsible' || key === 'completedBy') {
            return html`<dt>${lbl}</dt><dd>${this._personLabel(value)}</dd>`;
        }
        if (key === 'dueDate') {
            const overdue = this._isOverdue(value, t.done);
            return html`<dt>${lbl}</dt><dd class="${overdue ? 'overdue' : ''}">${value}${overdue ? ' (forfalt)' : ''}</dd>`;
        }
        if (key === 'commentFile') {
            return html`<dt>${lbl}</dt><dd>${unsafeHTML(`<a href="/${escapeHtml(value)}">${escapeHtml(value)}</a>`)}</dd>`;
        }
        if (key === 'note') {
            // Rendered separately below; suppress here to avoid duplication.
            return null;
        }
        if (typeof value === 'object') {
            return html`<dt>${lbl}</dt><dd>${JSON.stringify(value)}</dd>`;
        }
        return html`<dt>${lbl}</dt><dd>${String(value)}</dd>`;
    }

    _renderComment() {
        const t = this._task;
        if (!t || !t.commentFile) return null;
        if (this._commentLoading) {
            return html`
                <div class="section-h">Kommentar</div>
                <p class="empty-quiet">Laster kommentar…</p>
            `;
        }
        if (this._commentError) {
            return html`
                <div class="section-h">Kommentar</div>
                <p class="empty-quiet">Kunne ikke laste kommentaren (${escapeHtml(t.commentFile)}).</p>
            `;
        }
        const text = this._comment || '';
        if (!text.trim()) {
            return html`
                <div class="section-h">Kommentar</div>
                <p class="empty-quiet">(tom)</p>
            `;
        }
        // Render markdown if marked is available, else fall back to escaped text.
        let rendered;
        if (typeof window !== 'undefined' && window.marked && typeof window.marked.parse === 'function') {
            try {
                const md = window.marked.parse(text);
                const linked = linkMentions(md, this._people || [], this._companies || []);
                rendered = unsafeHTML(linked);
            } catch {
                rendered = unsafeHTML('<pre>' + escapeHtml(text) + '</pre>');
            }
        } else {
            rendered = unsafeHTML('<pre style="white-space:pre-wrap">' + escapeHtml(text) + '</pre>');
        }
        return html`
            <div class="section-h">Kommentar <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-subtle)">· ${unsafeHTML('<a href="/' + escapeHtml(t.commentFile) + '">' + escapeHtml(t.commentFile) + '</a>')}</span></div>
            <div class="comment">${rendered}</div>
        `;
    }

    render() {
        const t = this._task;
        if (this._error) return html`<div class="wrap"><p class="empty-quiet">Kunne ikke laste oppgave</p></div>`;
        if (!t) return html`<div class="wrap"><p class="empty-quiet">Ingen oppgave valgt</p></div>`;

        const textHtml = unsafeHTML(linkMentions(escapeHtml(t.text || ''), this._people || [], this._companies || []));
        const ordered = [];
        const seen = new Set();
        KNOWN_FIELDS.forEach(k => {
            const has = Object.prototype.hasOwnProperty.call(t, k);
            const force = ALWAYS_SHOW.has(k) || (t.done && ALWAYS_SHOW_WHEN_DONE.has(k));
            if (has || force) { ordered.push(k); seen.add(k); }
        });
        Object.keys(t).forEach(k => { if (!seen.has(k) && k !== 'text') ordered.push(k); });
        if (!seen.has('id')) ordered.unshift('id');

        // Note and commentFile get their own dedicated sections below.
        const rows = ordered
            .filter(k => k !== 'text' && k !== 'note' && k !== 'commentFile')
            .map(k => this._renderField(k, t[k]))
            .filter(Boolean);

        const note = t.note && t.note.trim();

        return html`
            <div class="wrap">
                <h3>
                    Oppgave
                    <span class="badge ${t.done ? 'done' : ''}">${t.done ? '✓ fullført' : '☐ åpen'}</span>
                </h3>
                <p class="text ${t.done ? 'done' : ''}">${textHtml}</p>
                <dl>${rows}</dl>
                ${note ? html`<div class="section-h">Notat</div><div class="note">${t.note}</div>` : null}
                ${this._renderComment()}
            </div>
        `;
    }
}

if (!customElements.get('task-view')) customElements.define('task-view', TaskView);

// Page-level singleton + event handler. Any code that wants to show a
// task in a read-only modal dispatches a bubbling `task:request-view`
// event; a single document-level listener mounts <modal-container> +
// <task-view> lazily, sets the task, and opens.
//
//   el.dispatchEvent(new CustomEvent('task:request-view', {
//       bubbles: true, composed: true, detail: { task },
//   }));
//
// `composed: true` is required when dispatched from inside a shadow DOM.
function getTaskViewModal() {
    if (typeof document === 'undefined') return null;
    let modal = document.querySelector('body > modal-container[data-task-view-singleton="page"]');
    if (modal) return modal;
    modal = document.createElement('modal-container');
    modal.setAttribute('data-task-view-singleton', 'page');
    modal.setAttribute('size', 'md');
    const title = document.createElement('span');
    title.setAttribute('slot', 'title');
    title.textContent = '📋 Oppgave';
    const view = document.createElement('task-view');
    view.id = 'page-task-view';
    view.setAttribute('people_service', 'week-note-services.people_service');
    view.setAttribute('companies_service', 'week-note-services.companies_service');
    modal.append(title, view);
    document.body.appendChild(modal);
    customElements.whenDefined('modal-container').then(() => {
        modal.setButtons([
            { label: 'Lukk', primary: true, action: () => { modal.close(); return false; } },
        ]);
    });
    return modal;
}

if (typeof document !== 'undefined' && !document._taskViewRequestWired) {
    document._taskViewRequestWired = true;
    document.addEventListener('task:request-view', (ev) => {
        const detail = (ev && ev.detail) || {};
        const task = detail.task;
        if (!task) return;
        const modal = getTaskViewModal();
        if (!modal) return;
        const view = modal.querySelector('#page-task-view');
        if (view) view.task = task;
        Promise.resolve(customElements.whenDefined('modal-container')).then(() => modal.open());
    });
}

if (typeof window !== 'undefined') {
    window.getTaskViewModal = getTaskViewModal;
    window.openTaskViewModal = function openTaskViewModal(task) {
        const modal = getTaskViewModal();
        if (!modal) return null;
        const view = modal.querySelector('#page-task-view');
        if (view) view.task = task;
        customElements.whenDefined('modal-container').then(() => modal.open());
        return modal;
    };
}
