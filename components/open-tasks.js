/**
 * <open-tasks> — self-loading sidebar widget rendering "Åpne oppgaver" heading
 * + list of open tasks. Fetches /api/tasks (+ people/companies for @links).
 *
 * Action handlers (window globals when present):
 *   - showCommentModal(checkbox)   : toggling a checkbox
 *   - openNoteModal(taskId)        : note button
 * Mentions bubble 'mention-clicked' (handled at page level).
 */
(function () {
    if (customElements.get('open-tasks')) return;

    function renderTask(t, people, companies) {
        const { escapeHtml, linkMentions } = window.WN;
        const id = t.id || '';
        const week = t.week || '';
        const weekShort = week ? `U${week.split('-')[1] || ''}` : '';
        const weekBadge = weekShort
            ? `<span class="pill" title="Opprettet uke ${escapeHtml(week)}">${escapeHtml(weekShort)}</span>`
            : '';
        const textHtml = linkMentions(escapeHtml(t.text || ''), people, companies);
        const hasNote = !!(t.note && t.note.trim());
        const noteHtml = hasNote && window.marked
            ? linkMentions(window.marked.parse(t.note), people, companies)
            : (hasNote ? escapeHtml(t.note) : '');
        const noteBtnCls = hasNote ? 'row-note-btn' : 'row-note-btn empty';
        const noteBtnTitle = hasNote ? 'Rediger notat' : 'Legg til notat';
        const noteBody = hasNote ? `<div class="md-content row-note-body">${noteHtml}</div>` : '';
        return `
            <div class="sidebar-task" data-taskid="${escapeHtml(id)}">
                <div class="row">
                    <input type="checkbox" data-taskid="${escapeHtml(id)}" data-tasktext="${escapeHtml(t.text || '')}" data-act="toggle" />
                    <span class="row-text">${textHtml}</span>
                    ${weekBadge}
                    <button type="button" class="${noteBtnCls}" data-act="note" data-taskid="${escapeHtml(id)}" title="${noteBtnTitle}">📓</button>
                </div>
                ${noteBody}
            </div>
        `;
    }

    class OpenTasks extends HTMLElement {
        connectedCallback() {
            if (this._loading) return;
            this._loading = true;
            this.innerHTML = `<h3 class="side-h">Åpne oppgaver</h3><p class="empty-quiet">Laster…</p>`;
            this._load();
        }

        async _load() {
            try {
                const [tasks, people, companies] = await Promise.all([
                    window.WN.tasks(),
                    window.WN.people(),
                    window.WN.companies(),
                ]);
                const open = (tasks || []).filter(t => !t.done);
                this._render(open, people || [], companies || []);
            } catch {
                this.innerHTML = `<h3 class="side-h">Åpne oppgaver</h3><p class="empty-quiet">Kunne ikke laste oppgaver</p>`;
            }
        }

        _render(open, people, companies) {
            const heading = `<h3 class="side-h">Åpne oppgaver · ${open.length}</h3>`;
            if (open.length === 0) {
                this.innerHTML = `${heading}<p class="empty-quiet">Ingen åpne oppgaver</p>`;
                return;
            }
            const rows = open.map(t => renderTask(t, people, companies)).join('');
            this.innerHTML = `${heading}<div class="sidebar-tasks">${rows}</div>`;
            this._wire();
            window.WN.wireMentionClicks(this);
        }

        _wire() {
            this.addEventListener('change', (ev) => {
                const cb = ev.target.closest('input[data-act="toggle"]');
                if (!cb || !this.contains(cb)) return;
                if (typeof window.showCommentModal === 'function') {
                    window.showCommentModal(cb);
                } else {
                    this.dispatchEvent(new CustomEvent('open-tasks:toggle', {
                        bubbles: true, detail: { id: cb.dataset.taskid, checkbox: cb },
                    }));
                }
            });
            this.addEventListener('click', (ev) => {
                const noteBtn = ev.target.closest('button[data-act="note"]');
                if (!noteBtn || !this.contains(noteBtn)) return;
                const id = noteBtn.dataset.taskid;
                if (typeof window.openNoteModal === 'function') {
                    window.openNoteModal(id);
                } else {
                    this.dispatchEvent(new CustomEvent('open-tasks:note', {
                        bubbles: true, detail: { id },
                    }));
                }
            });
        }
    }

    customElements.define('open-tasks', OpenTasks);
})();
