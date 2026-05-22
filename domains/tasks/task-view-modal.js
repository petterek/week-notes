/**
 * <task-view-modal>
 *
 * Read-only modal that displays all details of a task using the standard
 * <modal-container>. Shows text, note (rendered as markdown), week, due
 * date, status, participants, responsible, goal, creation/completion
 * dates, and completion comment.
 *
 *   const modal = document.querySelector('task-view-modal');
 *   modal.open(taskObj, { onEdit, onComplete });
 *
 * Methods:
 *   - open(task, opts?)  — shows the modal with all task info.
 *       opts.onEdit:  callback(task) invoked if user clicks Edit.
 *       opts.onComplete: callback(task) invoked if user clicks Complete.
 *   - close()           — hides the modal.
 *
 * Keyboard: Escape closes (via modal-container), E opens edit, C toggles complete.
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions } from './_shared.js';

const STYLES = `
    :host { display: inline-block; font: inherit; }

    /* Status badge */
    .badge {
        display: inline-block; padding: 3px 10px;
        border-radius: 12px; font-size: 0.78em; font-weight: 500;
        margin-bottom: 16px;
    }
    .badge-open { background: var(--accent-soft); color: var(--accent-strong); }
    .badge-done { background: #d4edda; color: #155724; }
    .badge-overdue { background: #fff3cd; color: #856404; }

    /* Meta grid */
    .meta {
        display: grid; grid-template-columns: auto 1fr;
        gap: 6px 16px; margin-bottom: 16px;
        font-size: 0.9em;
    }
    .meta-label {
        color: var(--text-muted); font-weight: 500;
        white-space: nowrap;
    }
    .meta-value { color: var(--text-strong); }
    .meta-value a { color: var(--accent); text-decoration: none; }
    .meta-value a:hover { text-decoration: underline; }

    /* Note section */
    .note-section {
        margin-top: 16px; padding-top: 16px;
        border-top: 1px solid var(--border-soft);
    }
    .note-section h4 {
        margin: 0 0 8px; font-size: 0.85em;
        color: var(--text-muted); font-weight: 500;
        text-transform: uppercase; letter-spacing: 0.5px;
    }
    .note-body {
        background: var(--surface-alt);
        border: 1px solid var(--border-faint);
        border-radius: 8px; padding: 12px 14px;
        font-size: 0.9em; line-height: 1.6;
        color: var(--text);
    }
    .note-body p { margin: 0 0 8px; }
    .note-body p:last-child { margin-bottom: 0; }

    /* Comment section */
    .comment-section {
        margin-top: 12px; padding-top: 12px;
        border-top: 1px solid var(--border-faint);
    }
    .comment-section h4 {
        margin: 0 0 8px; font-size: 0.85em;
        color: var(--text-muted); font-weight: 500;
        text-transform: uppercase; letter-spacing: 0.5px;
    }
    .comment-body {
        background: var(--surface-alt);
        border: 1px solid var(--border-faint);
        border-radius: 8px; padding: 12px 14px;
        font-size: 0.9em; line-height: 1.6;
        color: var(--text);
    }

    /* Participants */
    .participants {
        display: flex; flex-wrap: wrap; gap: 6px;
    }

    /* Actions footer */
    .actions {
        display: flex; gap: 10px; margin-top: 20px;
        padding-top: 16px; border-top: 1px solid var(--border-soft);
    }
    .actions button {
        padding: 7px 14px; border-radius: 6px;
        border: 1px solid var(--border); background: var(--surface);
        color: var(--text-strong); cursor: pointer; font-size: 0.88em;
        font-family: var(--font-family);
    }
    .actions button:hover { background: var(--surface-alt); }
    .actions .primary {
        background: var(--accent); color: var(--text-on-accent);
        border-color: var(--accent);
    }
    .actions .primary:hover { opacity: 0.9; }

    .hint {
        color: var(--text-subtle); font-size: 0.75em;
        margin-top: 10px; text-align: right;
    }
    .muted { color: var(--text-subtle); font-style: italic; }
`;

function isOverdue(due, done) {
    if (done || !due) return false;
    const m = String(due).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/);
    if (!m) return false;
    const hasTime = m[4] != null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], hasTime ? +m[4] : 23, hasTime ? +m[5] : 59);
    return d < new Date();
}

function fmtDate(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const day = d.toLocaleDateString('nb-NO', { weekday: 'short' });
    return `${day} ${m[3]}.${m[2]}.${m[1]}`;
}

function fmtDateTime(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('nb-NO', {
            weekday: 'short', day: 'numeric', month: 'short',
            year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    } catch { return iso; }
}

function weekLabel(w) {
    if (!w) return '';
    const m = w.match(/W(\d+)$/);
    return m ? `Uke ${+m[1]}` : w;
}

class TaskViewModal extends WNElement {
    css() { return STYLES; }

    render() {
        return html`<span></span>`;
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this._wired) this._wire();
    }

    _wire() {
        if (this._wired) return;
        this._wired = true;
        // Keyboard shortcuts on the document when modal is open
        this._keyHandler = (ev) => {
            if (!this._modal || !this._modal.hasAttribute('open')) return;
            if (ev.key === 'e' || ev.key === 'E') { if (!ev.ctrlKey && !ev.metaKey) this._doEdit(); }
            else if (ev.key === 'c' || ev.key === 'C') { if (!ev.ctrlKey && !ev.metaKey) { this._task?.done ? this._doUncomplete() : this._doComplete(); } }
        };
        document.addEventListener('keydown', this._keyHandler);
    }

    _ensureModal() {
        if (this._modal) return this._modal;
        const modal = document.createElement('modal-container');
        modal.setAttribute('size', 'md');
        const titleEl = document.createElement('span');
        titleEl.setAttribute('slot', 'title');
        titleEl.textContent = '📋 Oppgave';
        this._titleEl = titleEl;
        this._body = document.createElement('div');
        modal.append(titleEl, this._body);
        modal.setButtons([]);
        document.body.appendChild(modal);

        // Listen for close
        modal.addEventListener('modal-close', () => {
            this._modal = modal; // keep ref
        });

        // Click delegation on body
        this._body.addEventListener('click', (ev) => {
            const act = ev.target.closest('[data-act]');
            if (!act) return;
            const action = act.dataset.act;
            if (action === 'edit') this._doEdit();
            else if (action === 'complete') this._doComplete();
            else if (action === 'uncomplete') this._doUncomplete();
            else if (action === 'open-note') {
                ev.preventDefault();
                const notePath = act.dataset.path;
                if (notePath && window.openNoteViewModal) {
                    window.openNoteViewModal(notePath);
                }
            }
        });

        this._modal = modal;
        return modal;
    }

    open(task, opts = {}) {
        this._task = task || {};
        this._onEdit = opts.onEdit || null;
        this._onComplete = opts.onComplete || null;
        this._onUncomplete = opts.onUncomplete || null;

        const modal = this._ensureModal();
        this._titleEl.innerHTML = linkMentions(escapeHtml(task?.text || 'Oppgave'), [], [], []);
        this._body.innerHTML = this._buildContent(task);
        modal.open();
    }

    close() {
        if (this._modal) this._modal.close();
    }

    _buildContent(t) {
        if (!t) return '';

        // Status
        const overdue = isOverdue(t.dueDate, t.done);
        let statusHtml;
        if (t.done) {
            statusHtml = `<span class="badge badge-done">✓ Fullført</span>`;
        } else if (overdue) {
            statusHtml = `<span class="badge badge-overdue">⚠️ Forfalt</span>`;
        } else {
            statusHtml = `<span class="badge badge-open">◯ Åpen</span>`;
        }

        // Build meta rows
        const meta = [];

        if (t.week) meta.push(['Opprettet uke', weekLabel(t.week)]);

        if (t.dueDate) {
            const dueFmt = fmtDate(t.dueDate);
            const overStr = overdue ? ' <span style="color:var(--danger, #c53030)">(forfalt)</span>' : '';
            meta.push(['Frist', dueFmt + overStr]);
        }

        // Responsible (always show)
        if (t.responsible) {
            meta.push(['Ansvarlig', `<entity-mention kind="person" key="${escapeHtml(t.responsible)}"></entity-mention>`]);
        } else {
            meta.push(['Ansvarlig', `<span class="muted">—</span>`]);
        }

        // Goal (always show)
        if (t.goalId) {
            meta.push(['Mål', `🎯 <span>${escapeHtml(t.goalId)}</span>`]);
        } else {
            meta.push(['Mål', `<span class="muted">—</span>`]);
        }

        // Author
        if (t.author) {
            meta.push(['Opprettet av', `<entity-mention kind="person" key="${escapeHtml(t.author)}"></entity-mention>`]);
        }

        if (t.created) meta.push(['Opprettet', fmtDateTime(t.created)]);

        if (t.done) {
            if (t.completedWeek) meta.push(['Fullført uke', weekLabel(t.completedWeek)]);
            if (t.completedAt) meta.push(['Fullført dato', fmtDateTime(t.completedAt)]);
            if (t.completedBy) {
                meta.push(['Fullført av', `<entity-mention kind="person" key="${escapeHtml(t.completedBy)}"></entity-mention>`]);
            }
        }

        // Note references
        if (t.noteRef && /^[^/]+\/[^/]+\.md$/.test(t.noteRef)) {
            const [w, f] = t.noteRef.split('/');
            const label = f.replace(/\.md$/, '');
            meta.push(['Kilde-notat', `<a href="#" data-act="open-note" data-path="${escapeHtml(t.noteRef)}">📝 ${escapeHtml(label)}</a> <span style="color:var(--text-subtle)">(${escapeHtml(w)})</span>`]);
        }
        if (t.commentFile && /^[^/]+\/[^/]+\.md$/.test(t.commentFile)) {
            const [w, f] = t.commentFile.split('/');
            const label = f.replace(/\.md$/, '');
            meta.push(['Oppgave-notat', `<a href="#" data-act="open-note" data-path="${escapeHtml(t.commentFile)}">📄 ${escapeHtml(label)}</a> <span style="color:var(--text-subtle)">(${escapeHtml(w)})</span>`]);
        }

        // Participants (always show)
        let participantsHtml;
        const parts = t.participants || [];
        if (parts.length > 0) {
            const chips = parts.map(key =>
                `<entity-mention kind="person" key="${escapeHtml(key)}"></entity-mention>`
            ).join(' ');
            participantsHtml = `
                <div class="meta-label" style="align-self:start;padding-top:4px">Deltakere</div>
                <div class="meta-value"><div class="participants">${chips}</div></div>
            `;
        } else {
            participantsHtml = `
                <div class="meta-label">Deltakere</div>
                <div class="meta-value"><span class="muted">—</span></div>
            `;
        }

        const metaHtml = meta.map(([label, value]) =>
            `<div class="meta-label">${escapeHtml(label)}</div><div class="meta-value">${value}</div>`
        ).join('') + participantsHtml;

        // Note section
        let noteSection = '';
        if (t.note) {
            const noteHtml = escapeHtml(t.note).replace(/\n/g, '<br>');
            noteSection = `
                <div class="note-section">
                    <h4>📝 Notat</h4>
                    <div class="note-body">${noteHtml}</div>
                </div>
            `;
        }

        // Completion comment
        let commentSection = '';
        if (t.done && t.comment) {
            const commentHtml = escapeHtml(t.comment).replace(/\n/g, '<br>');
            commentSection = `
                <div class="comment-section">
                    <h4>💬 Fullføringskommentar</h4>
                    <div class="comment-body">${commentHtml}</div>
                </div>
            `;
        }

        // Action buttons
        const toggleBtn = t.done
            ? `<button data-act="uncomplete">↩️ Gjenåpne</button>`
            : `<button data-act="complete" class="primary">✓ Fullfør</button>`;
        const editBtn = `<button data-act="edit">✏️ Rediger</button>`;

        return `
            <style>${STYLES}</style>
            ${statusHtml}
            <div class="meta">${metaHtml}</div>
            ${noteSection}
            ${commentSection}
            <div class="actions">
                ${toggleBtn}
                ${editBtn}
            </div>
            <div class="hint">E rediger · C fullfør/gjenåpne</div>
        `;
    }

    _doEdit() {
        const task = this._task;
        this.close();
        if (this._onEdit) this._onEdit(task);
        else {
            this.dispatchEvent(new CustomEvent('task-view:edit', {
                bubbles: true, composed: true, detail: { task },
            }));
        }
    }

    _doComplete() {
        const task = this._task;
        this.close();
        if (this._onComplete) this._onComplete(task);
        else {
            this.dispatchEvent(new CustomEvent('task-view:complete', {
                bubbles: true, composed: true, detail: { task },
            }));
        }
    }

    _doUncomplete() {
        const task = this._task;
        this.close();
        if (this._onUncomplete) this._onUncomplete(task);
        else {
            this.dispatchEvent(new CustomEvent('task-view:uncomplete', {
                bubbles: true, composed: true, detail: { task },
            }));
        }
    }

    disconnectedCallback() {
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
        if (this._modal && this._modal.parentNode) {
            this._modal.parentNode.removeChild(this._modal);
        }
        this._modal = null;
    }
}

if (!customElements.get('task-view-modal')) customElements.define('task-view-modal', TaskViewModal);
