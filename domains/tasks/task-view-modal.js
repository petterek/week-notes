/**
 * <task-view-modal>
 *
 * Read-only modal that displays all details of a task: text, note
 * (rendered as markdown), week, due date, status, participants,
 * responsible, goal, creation/completion dates, and completion comment.
 *
 *   const modal = document.querySelector('task-view-modal');
 *   modal.open(taskObj, { people, goals });
 *
 * Methods:
 *   - open(task, opts?)  — shows the modal with all task info.
 *       opts.people:  Person[] for resolving participant keys.
 *       opts.goals:   Goal[] for resolving goalId.
 *       opts.onEdit:  callback(task) invoked if user clicks Edit.
 *       opts.onComplete: callback(task) invoked if user clicks Complete.
 *   - close()           — hides the modal.
 *
 * Keyboard: Escape closes, E opens edit, C toggles complete.
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions, modalZ } from './_shared.js';

const STYLES = `
    :host { display: inline-block; font: inherit; }

    .backdrop {
        position: fixed; inset: 0; display: none;
        align-items: flex-start; justify-content: center;
        background: var(--overlay);
        padding: 5vh 16px;
        overflow-y: auto;
    }
    :host([open]) .backdrop { display: flex; }

    .card {
        background: var(--bg); color: var(--text-strong);
        border: 1px solid var(--border); border-radius: 10px;
        padding: 24px 28px; width: min(640px, 92vw);
        box-shadow: 0 20px 60px var(--shadow);
        font-family: var(--font-family);
        animation: tvmSlide 0.15s ease-out;
    }
    @keyframes tvmSlide { from { opacity: 0; transform: translateY(-10px); } }

    .head {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 12px; margin-bottom: 16px;
    }
    .head h3 {
        margin: 0; font-family: var(--font-heading);
        color: var(--text-strong); font-weight: 600; font-size: 1.15em;
        line-height: 1.4;
    }
    .close {
        background: none; border: none; font-size: 1.3em;
        cursor: pointer; color: var(--text-muted); flex-shrink: 0;
    }
    .close:hover { color: var(--text-strong); }

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
    .person-chip {
        display: inline-flex; align-items: center; gap: 4px;
        background: var(--surface-alt); border: 1px solid var(--border-soft);
        border-radius: 14px; padding: 2px 10px; font-size: 0.85em;
        color: var(--text);
    }
    .person-chip.responsible {
        border-color: var(--accent); background: var(--accent-soft);
        color: var(--accent-strong);
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

    /* Entity mention styling */
    .entity-mention {
        color: var(--accent); font-weight: 500;
        cursor: pointer;
    }
    .entity-mention:hover { text-decoration: underline; }

    .hint {
        color: var(--text-subtle); font-size: 0.75em;
        margin-top: 10px; text-align: right;
    }
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
    static get observedAttributes() { return ['open']; }

    css() { return STYLES; }

    render() {
        const t = this._task;
        if (!t) {
            return html`<div class="backdrop" data-backdrop><div class="card"></div></div>`;
        }
        const people = this._people || [];
        const goals = this._goals || [];
        const companies = this._companies || [];
        const teams = this._teams || [];

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

        // Title with rendered mentions
        const titleHtml = linkMentions(escapeHtml(t.text || '(Uten tittel)'), people, companies, teams);

        // Build meta rows
        const meta = [];

        // Week
        if (t.week) meta.push(['Opprettet uke', weekLabel(t.week)]);

        // Due date
        if (t.dueDate) {
            const dueFmt = fmtDate(t.dueDate);
            const overStr = overdue ? ' <span style="color:#c53030">(forfalt)</span>' : '';
            meta.push(['Frist', dueFmt + overStr]);
        }

        // Responsible
        if (t.responsible) {
            const rPerson = people.find(p => p.key === t.responsible);
            const rName = rPerson ? (rPerson.name || rPerson.key) : t.responsible;
            meta.push(['Ansvarlig', `<span class="entity-mention">@${escapeHtml(rName)}</span>`]);
        }

        // Goal
        if (t.goalId) {
            const goal = goals.find(g => g.id === t.goalId);
            const gName = goal ? (goal.title || goal.text || t.goalId) : t.goalId;
            meta.push(['Mål', `🎯 ${escapeHtml(gName)}`]);
        }

        // Author
        if (t.author) {
            const aPerson = people.find(p => p.key === t.author);
            const aName = aPerson ? (aPerson.name || aPerson.key) : t.author;
            meta.push(['Opprettet av', `@${escapeHtml(aName)}`]);
        }

        // Created date
        if (t.created) meta.push(['Opprettet', fmtDateTime(t.created)]);

        // Completed info
        if (t.done) {
            if (t.completedWeek) meta.push(['Fullført uke', weekLabel(t.completedWeek)]);
            if (t.completedAt) meta.push(['Fullført dato', fmtDateTime(t.completedAt)]);
            if (t.completedBy) {
                const cPerson = people.find(p => p.key === t.completedBy);
                const cName = cPerson ? (cPerson.name || cPerson.key) : t.completedBy;
                meta.push(['Fullført av', `@${escapeHtml(cName)}`]);
            }
        }

        // Participants section
        let participantsHtml = '';
        const parts = t.participants || [];
        if (parts.length > 0) {
            const chips = parts.map(key => {
                const p = people.find(pp => pp.key === key);
                const name = p ? (p.name || p.key) : key;
                const isResp = (key === t.responsible);
                return `<span class="person-chip${isResp ? ' responsible' : ''}" title="${escapeHtml(key)}">@${escapeHtml(name)}${isResp ? ' (ansvarlig)' : ''}</span>`;
            }).join('');
            participantsHtml = `
                <div class="meta-label" style="align-self:start;padding-top:4px">Deltakere</div>
                <div class="meta-value"><div class="participants">${chips}</div></div>
            `;
        }

        // Meta grid HTML
        const metaHtml = meta.map(([label, value]) =>
            `<div class="meta-label">${escapeHtml(label)}</div><div class="meta-value">${value}</div>`
        ).join('') + participantsHtml;

        // Note section
        let noteSection = '';
        if (t.note) {
            const noteHtml = linkMentions(escapeHtml(t.note).replace(/\n/g, '<br>'), people, companies, teams);
            noteSection = `
                <div class="note-section">
                    <h4>📝 Notat</h4>
                    <div class="note-body">${noteHtml}</div>
                </div>
            `;
        }

        // Completion comment section
        let commentSection = '';
        if (t.done && t.comment) {
            const commentHtml = linkMentions(escapeHtml(t.comment).replace(/\n/g, '<br>'), people, companies, teams);
            commentSection = `
                <div class="comment-section">
                    <h4>💬 Fullføringskommentar</h4>
                    <div class="comment-body">${commentHtml}</div>
                </div>
            `;
        }

        // Action buttons
        const editBtn = `<button data-act="edit">✏️ Rediger</button>`;
        const toggleBtn = t.done
            ? `<button data-act="uncomplete">↩️ Gjenåpne</button>`
            : `<button data-act="complete" class="primary">✓ Fullfør</button>`;

        return html`
            <div class="backdrop" data-backdrop>
                <div class="card" role="dialog" aria-modal="true" aria-labelledby="tvm-title">
                    <div class="head">
                        <h3 id="tvm-title">${unsafeHTML(titleHtml)}</h3>
                        <button type="button" class="close" data-act="close" title="Lukk (Esc)">✕</button>
                    </div>
                    ${unsafeHTML(statusHtml)}
                    <div class="meta">${unsafeHTML(metaHtml)}</div>
                    ${unsafeHTML(noteSection)}
                    ${unsafeHTML(commentSection)}
                    <div class="actions">
                        ${unsafeHTML(toggleBtn)}
                        ${unsafeHTML(editBtn)}
                    </div>
                    <div class="hint">Esc lukk · E rediger · C fullfør/gjenåpne</div>
                </div>
            </div>
        `;
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this._wired) this._wire();
    }

    _wire() {
        if (this._wired) return;
        this._wired = true;

        this.shadowRoot.addEventListener('click', (ev) => {
            const act = ev.target.closest('[data-act]');
            if (!act) {
                // Backdrop click
                if (ev.target.matches('[data-backdrop]')) this._cancel();
                return;
            }
            const action = act.dataset.act;
            if (action === 'close') this._cancel();
            else if (action === 'edit') this._doEdit();
            else if (action === 'complete') this._doComplete();
            else if (action === 'uncomplete') this._doUncomplete();
        });

        this.shadowRoot.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') { ev.stopPropagation(); this._cancel(); }
            else if (ev.key === 'e' || ev.key === 'E') { if (!ev.ctrlKey && !ev.metaKey) this._doEdit(); }
            else if (ev.key === 'c' || ev.key === 'C') { if (!ev.ctrlKey && !ev.metaKey) { this._task?.done ? this._doUncomplete() : this._doComplete(); } }
        });
    }

    open(task, opts = {}) {
        this._task = task || {};
        this._people = opts.people || [];
        this._goals = opts.goals || [];
        this._companies = opts.companies || [];
        this._teams = opts.teams || [];
        this._onEdit = opts.onEdit || null;
        this._onComplete = opts.onComplete || null;
        this._onUncomplete = opts.onUncomplete || null;
        this.requestRender();
        this._zIndex = modalZ.next();
        this.setAttribute('open', '');
        const bd = this.shadowRoot && this.shadowRoot.querySelector('.backdrop');
        if (bd) bd.style.zIndex = this._zIndex;
        // Trap focus
        requestAnimationFrame(() => {
            const card = this.shadowRoot.querySelector('.card');
            if (card) card.focus();
        });
    }

    close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        modalZ.release();
        this._zIndex = null;
    }

    _cancel() {
        this.close();
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
}

if (!customElements.get('task-view-modal')) customElements.define('task-view-modal', TaskViewModal);
