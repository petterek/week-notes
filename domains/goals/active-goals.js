/**
 * <active-goals goals_service="…" tasks_service="…">
 *
 * Compact home-page sidebar widget showing active goals with a tiny
 * progress bar for each (based on linked tasks). Rows link to /goals.
 *
 * Service contract:
 *   goals_service.list()                     → Goal[]
 *   tasks_service.list()  (optional)         → Task[]   (for progress)
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const STYLES = `
    :host { display: block; color: var(--text-strong); font: inherit; font-size: 0.92em; }
    .sec-h {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); border-bottom: 1px solid var(--border-soft);
        padding-bottom: 6px; margin: 0 0 10px; font-size: 1.05em;
        display: flex; align-items: center; justify-content: space-between;
    }
    .sec-h .c { color: var(--text-subtle); font-size: 0.85em; margin-left: 4px; }
    .sec-h a { color: var(--text-subtle); text-decoration: none; font-size: 0.8em; }
    .sec-h a:hover { color: var(--accent); }
    .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }

    .goal {
        padding: 6px 8px; border-radius: 6px; background: var(--surface);
        margin-bottom: 6px; cursor: pointer;
        border-left: 3px solid var(--accent);
    }
    .goal:hover { background: var(--surface-head); }
    .goal-title { font-weight: 600; color: var(--text-strong); margin-bottom: 4px; }
    .goal-meta {
        display: flex; align-items: center; gap: 8px;
        color: var(--text-subtle); font-size: 0.85em;
    }
    .goal-meta .due.overdue { color: #c53030; font-weight: 600; }
    .bar {
        flex: 1; position: relative; height: 5px;
        background: var(--surface-head); border-radius: 3px; overflow: hidden;
    }
    .bar > i {
        display: block; height: 100%; background: var(--accent);
    }
`;

class ActiveGoals extends WNElement {
    static get domain() { return 'goals'; }
    static get observedAttributes() { return ['goals_service', 'tasks_service']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (!this._wired) this._wire();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) this.invalidateAwait();
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    loadData() {
        if (!this.service) return null;
        const tasksSvc = this.serviceFor('tasks');
        return {
            goals: async () => {
                const goals = await this.service.list();
                return (goals || []).filter(g => g.status === 'active');
            },
            tasks: () => tasksSvc ? tasksSvc.list() : Promise.resolve([]),
        };
    }

    _wire() {
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (e) => {
            const path = e.composedPath();
            const row = path.find(n => n.classList && n.classList.contains('goal'));
            if (row) {
                e.preventDefault();
                window.location.href = '/goals#g-' + encodeURIComponent(row.dataset.id);
            }
        });
    }

    render(data = {}) {
        if (!this.service) return this.renderNoService();
        if (data._loading) return html`<h3 class="sec-h">🎯 Mål</h3><p class="empty-quiet">Laster…</p>`;
        const goals = Array.isArray(data.goals) ? data.goals : null;
        if (!goals) return html`<h3 class="sec-h">🎯 Mål</h3><p class="empty-quiet">Kunne ikke laste</p>`;
        const tasks = data.tasks || [];

        const today = new Date().toISOString().slice(0, 10);
        if (!goals.length) {
            return html`
                <h3 class="sec-h"><span>🎯 Mål <span class="c">0</span></span><a href="/goals">+</a></h3>
                <p class="empty-quiet">Ingen aktive mål. <a href="/goals">Legg til</a></p>
            `;
        }
        const rows = goals.map(g => {
            const linked = tasks.filter(t => t.goalId === g.id);
            const done = linked.filter(t => t.done).length;
            const total = linked.length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            const overdue = g.targetDate && g.targetDate < today;
            const hasVal = g.targetValue != null;
            const cur = g.currentValue != null ? g.currentValue : 0;
            const valPct = hasVal && g.targetValue
                ? Math.max(0, Math.min(100, Math.round((cur / g.targetValue) * 100)))
                : 0;
            const fmt = n => Number.isFinite(n)
                ? (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('no-NO') : (Math.round(n * 100) / 100).toString())
                : '';
            return html`
                <div class="goal" data-id="${g.id}" title="${g.description || ''}">
                    <div class="goal-title">${g.title}</div>
                    <div class="goal-meta">
                        <span class="bar"><i style="width:${pct}%"></i></span>
                        <span>${done}/${total}</span>
                        ${hasVal ? html`<span title="Verdi">${fmt(cur)}/${fmt(g.targetValue)}${g.unit ? ' ' + g.unit : ''}${g.targetValue ? ' (' + valPct + '%)' : ''}</span>` : ''}
                        ${g.targetDate ? html`<span class="${'due' + (overdue ? ' overdue' : '')}">${g.targetDate.slice(5)}</span>` : ''}
                    </div>
                </div>
            `;
        });
        return html`
            <h3 class="sec-h"><span>🎯 Mål <span class="c">${goals.length}</span></span><a href="/goals" title="Alle mål">→</a></h3>
            ${rows}
        `;
    }
}

if (!customElements.get('active-goals')) customElements.define('active-goals', ActiveGoals);
