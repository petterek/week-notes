/**
 * <week-completed week="YYYY-WNN"> — sidebar list of tasks completed in a
 * given ISO week. Fetches /api/tasks + people + companies. Toggling a
 * checkbox calls window.undoComplete(checkbox) when present, else emits
 * 'week-completed:undo'. @-mentions bubble 'mention-clicked'.
 */
(function () {
    if (customElements.get('week-completed')) return;

    class WeekCompleted extends HTMLElement {
        static get observedAttributes() { return ['week']; }

        connectedCallback() {
            if (this._loading) return;
            this._loading = true;
            this.innerHTML = `<h3 class="sec-h">Fullført</h3><p class="empty-quiet">Laster…</p>`;
            this._load();
        }

        async _load() {
            const week = this.getAttribute('week');
            try {
                const [tasks, people, companies] = await Promise.all([
                    window.WN.tasks(),
                    window.WN.people(),
                    window.WN.companies(),
                ]);
                const done = (tasks || []).filter(t => t.done && (t.completedWeek || t.week) === week);
                this._render(done, people || [], companies || []);
            } catch {
                this.innerHTML = `<h3 class="sec-h">Fullført</h3><p class="empty-quiet">Kunne ikke laste</p>`;
            }
        }

        _render(done, people, companies) {
            const { escapeHtml, linkMentions, wireMentionClicks } = window.WN;
            const heading = `<h3 class="sec-h">Fullført <span class="c">${done.length}</span></h3>`;
            if (done.length === 0) {
                this.innerHTML = `${heading}<p class="empty-quiet">Ingen fullførte oppgaver</p>`;
                return;
            }
            const rows = done.map(t => {
                const dShort = t.completedAt ? `${t.completedAt.slice(8, 10)}.${t.completedAt.slice(5, 7)}` : '';
                return `
                    <div class="row done">
                        <input type="checkbox" checked data-taskid="${escapeHtml(t.id)}" data-tasktext="${escapeHtml(t.text || '')}" data-act="undo" />
                        <span class="row-text">${linkMentions(escapeHtml(t.text || ''), people, companies)}</span>
                        ${dShort ? `<span class="when">${dShort}</span>` : ''}
                    </div>
                `;
            }).join('');
            this.innerHTML = `${heading}<div class="sidebar-tasks">${rows}</div>`;
            this._wire();
            wireMentionClicks(this);
        }

        _wire() {
            this.addEventListener('change', (ev) => {
                const cb = ev.target.closest('input[data-act="undo"]');
                if (!cb || !this.contains(cb)) return;
                if (typeof window.undoComplete === 'function') {
                    window.undoComplete(cb);
                } else {
                    this.dispatchEvent(new CustomEvent('week-completed:undo', {
                        bubbles: true, detail: { id: cb.dataset.taskid, checkbox: cb },
                    }));
                }
            });
        }
    }

    customElements.define('week-completed', WeekCompleted);
})();
