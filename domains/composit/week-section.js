/**
 * <week-section
 *     week="YYYY-WNN" [current]
 *     service="NotesService"
 *     [service_notes="NotesService"]
 *     [service_results="ResultsService"]
 *     [service_tasks="TaskService"]>
 *
 * Renders one week block on the home page. Self-loads via service.getWeek()
 * (note list + date range + summary flag) plus shared cached /api/tasks and
 * /api/results for the "X fullført · Y resultater · Z notater" meta line.
 *
 * Children (<note-card>, <week-results>, <task-completed>) each require their
 * own service attribute. They are passed through via the optional attrs
 * above; if any is absent the corresponding child renders its own "no
 * service connected" error.
 *
 * Renders inside its own shadow DOM with theming via inherited CSS custom
 * properties.
 */
import { WNElement, html, unsafeHTML, escapeHtml, isoWeek } from './_shared.js';

const STYLES = `
    :host { display: block; color: var(--text-strong); font: inherit; }
    .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }
    .h-week {
        display: flex; align-items: baseline; gap: 12px;
        font-family: var(--font-heading); font-size: 1.5em;
        color: var(--accent); font-weight: 400; letter-spacing: -0.01em;
        margin: 14px 0 6px; padding-bottom: 6px;
        border-bottom: 1px solid var(--border-soft);
    }
    .h-week .meta {
        font-family: var(--font-family); font-size: 0.55em;
        color: var(--text-subtle); font-style: italic; margin-left: auto;
    }
    .pill.live {
        background: var(--accent); color: var(--surface);
        font-size: 0.45em; padding: 1px 8px; border-radius: 999px;
        text-transform: uppercase; letter-spacing: 0.05em;
    }
    .week-title-actions { display: flex; gap: 8px; margin: 6px 0 12px; }
    .btn-summarize {
        background: var(--surface-alt); border: 1px solid var(--border);
        color: var(--accent); padding: 4px 10px; border-radius: 6px;
        font: inherit; font-size: 0.85em; cursor: pointer;
    }
    .btn-summarize:hover { background: var(--surface); }
    .btn-summarize-saved { background: var(--surface); }
    .week-grid {
        display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 18px;
    }
    @media (max-width: 800px) {
        .week-grid { grid-template-columns: 1fr; }
    }
    .col-side { display: flex; flex-direction: column; gap: 14px; }
    .sec-h {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); border-bottom: 1px solid var(--border-soft);
        padding-bottom: 6px; margin: 0 0 8px; font-size: 1.05em;
    }
    .sec-h .c { color: var(--text-subtle); font-size: 0.85em; margin-left: 4px; }
    .day-h {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--text-muted); font-size: 0.9em;
        margin: 14px 0 6px; padding-bottom: 4px;
        border-bottom: 1px dashed var(--border-soft);
        text-transform: capitalize;
    }
    .day-h:first-of-type { margin-top: 4px; }
    .day-h .c { color: var(--text-subtle); font-size: 0.85em; margin-left: 4px; }
    details.older-week { margin: 14px 0; border-top: 1px solid var(--border-soft); }
    details.older-week > summary {
        list-style: none; cursor: pointer; padding: 8px 0;
        display: flex; align-items: baseline; gap: 10px;
        color: var(--accent); font-family: var(--font-heading);
    }
    details.older-week > summary::-webkit-details-marker { display: none; }
    .older .caret { transition: transform 0.15s; display: inline-block; }
    details[open] .caret { transform: rotate(90deg); }
    .older-meta { color: var(--text-subtle); font-size: 0.85em; margin-left: auto; }
    .older-body { padding: 4px 0 16px; }
`;

function pluralResult(n) { return n === 1 ? 'resultat' : 'resultater'; }
function pluralNote(n)   { return n === 1 ? 'notat'    : 'notater';   }

const NB_DAY_LONG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
function dayHeading(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${NB_DAY_LONG[d.getUTCDay()]} ${dd}.${mm}`;
}
function noteCardTag(week, file) {
    return `<note-card data-card-key="${escapeHtml(file)}"></note-card>`;
}
function groupNotesByDay(notes) {
    const pinned = [];
    const groups = new Map(); // date → notes[]
    const undated = [];
    for (const n of notes) {
        if (n.pinned) { pinned.push(n); continue; }
        const date = (n.created || '').slice(0, 10);
        if (!date) { undated.push(n); continue; }
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date).push(n);
    }
    const sortedDates = Array.from(groups.keys()).sort().reverse();
    return { pinned, dayGroups: sortedDates.map(d => ({ date: d, notes: groups.get(d) })), undated };
}

class WeekSection extends WNElement {
    static get domain() { return 'notes'; }
    static get observedAttributes() { return ['week']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (this.service) this._load();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.isConnected && this.service && oldVal !== newVal) this._load();
    }

    async _load() {
        const week = this.getAttribute('week');
        if (!week) { this._state = null; this.requestRender(); return; }
        const tasksSvc = this.serviceFor('tasks');
        const resultsSvc = this.serviceFor('results');
        try {
            const [info, tasks, results] = await Promise.all([
                this.service.getWeek(week),
                tasksSvc ? tasksSvc.list() : Promise.resolve([]),
                resultsSvc ? resultsSvc.list() : Promise.resolve([]),
            ]);
            const noteList = info.notes || [];
            const cardData = await Promise.all(noteList.map(n =>
                this.service.card(week, n.file).catch(() => ({ ok: false, file: n.file }))
            ));
            const cards = new Map();
            cardData.forEach((d, i) => {
                const file = noteList[i].file;
                cards.set(file, d && d.ok ? { week, ...d } : { week, file, error: true });
            });
            const completed = (tasks || []).filter(t => t.done && (t.completedWeek || t.week) === week);
            const weekResults = (results || []).filter(r => r.week === week);
            this._state = { info, cards, completedCount: completed.length, resultCount: weekResults.length };
        } catch {
            this._state = { error: true };
        }
        this.requestRender();
        this._injectCardData();
        if (!this._wired) {
            this._wired = true;
            this._wireEvents();
        }
    }

    _injectCardData() {
        if (!this._state || !this._state.cards) return;
        const cards = this._state.cards;
        this.shadowRoot.querySelectorAll('note-card[data-card-key]').forEach(el => {
            const key = el.getAttribute('data-card-key');
            const d = cards.get(key);
            if (d && el.setData) el.setData(d);
        });
    }

    render() {
        if (!this.service) return this.renderNoService();
        const week = this.getAttribute('week');
        if (!this._state) return html`<p class="empty-quiet">Laster…</p>`;
        if (this._state.error) return html`<p class="empty-quiet">Kunne ikke laste uke</p>`;

        const { info, completedCount, resultCount } = this._state;
        const isCurrent = this.hasAttribute('current') || week === isoWeek(new Date());
        const weekNum = info.weekNum || (week.split('-')[1] || '');
        const dateRange = info.dateRange || '';
        const noteCount = (info.notes || []).length;
        const summaryLine = `${completedCount} fullført · ${resultCount} ${pluralResult(resultCount)} · ${noteCount} ${pluralNote(noteCount)}`;

        const resultsSrv = this.getAttribute('results_service') || '';
        const tasksSrv = this.getAttribute('tasks_service') || '';
        const peopleSrv = this.getAttribute('people_service') || '';
        const companiesSrv = this.getAttribute('companies_service') || '';
        const peopleAttr    = peopleSrv    ? ` people_service="${escapeHtml(peopleSrv)}"` : '';
        const companiesAttr = companiesSrv ? ` companies_service="${escapeHtml(companiesSrv)}"` : '';
        const wEsc = escapeHtml(week);

        const noteCardsHtml = (info.notes || []).length === 0
            ? `<p class="empty-quiet">Ingen notater denne uken</p>`
            : (() => {
                const { pinned, dayGroups, undated } = groupNotesByDay(info.notes || []);
                let out = '';
                if (pinned.length) {
                    out += `<h4 class="day-h">📌 Festet <span class="c">${pinned.length}</span></h4>`;
                    out += pinned.map(n => noteCardTag(wEsc, n.file)).join('');
                }
                for (const g of dayGroups) {
                    out += `<h4 class="day-h">${escapeHtml(dayHeading(g.date))} <span class="c">${g.notes.length}</span></h4>`;
                    out += g.notes.map(n => noteCardTag(wEsc, n.file)).join('');
                }
                if (undated.length) {
                    out += `<h4 class="day-h">Uten dato <span class="c">${undated.length}</span></h4>`;
                    out += undated.map(n => noteCardTag(wEsc, n.file)).join('');
                }
                return out;
            })();

        const sideHtml =
            `<week-results week="${wEsc}" results_service="${escapeHtml(resultsSrv)}"${peopleAttr}${companiesAttr}></week-results>` +
            `<task-completed week="${wEsc}" tasks_service="${escapeHtml(tasksSrv)}"${peopleAttr}${companiesAttr}></task-completed>`;

        const viewBtn = info.hasSummary
            ? ` <button data-act="show-summary" class="btn-summarize btn-summarize-saved">📋 Vis oppsummering</button>`
            : '';
        const actions = `<div class="week-title-actions"><button data-act="summarize" class="btn-summarize" id="sum-${wEsc}">✨ Oppsummer</button>${viewBtn}</div>`;
        const notesHtml = `<h3 class="sec-h">Notater <span class="c">${noteCount}</span></h3>${noteCardsHtml}`;

        if (isCurrent) {
            return html`
                <div class="week-section">
                    <div class="h-week"><span class="h-week-label">Uke ${weekNum}</span> <span class="pill live">aktiv</span><span class="meta">${dateRange}</span></div>
                    ${unsafeHTML(actions)}
                    <div class="week-grid">
                        <div class="col-notes">${unsafeHTML(notesHtml)}</div>
                        <div class="col-side">${unsafeHTML(sideHtml)}</div>
                    </div>
                </div>
            `;
        } else {
            return html`
                <details class="older-week">
                    <summary class="older"><span class="caret">▸</span><span class="older-title">Uke ${weekNum}</span><span class="older-meta">${dateRange ? dateRange + '  ·  ' : ''}${summaryLine}</span></summary>
                    <div class="week-section older-body">
                        ${unsafeHTML(actions)}
                        <div class="week-grid">
                            <div class="col-notes">${unsafeHTML(notesHtml)}</div>
                            <div class="col-side">${unsafeHTML(sideHtml)}</div>
                        </div>
                    </div>
                </details>
            `;
        }
    }

    _wireEvents() {
        this.shadowRoot.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            const week = this.getAttribute('week');
            if (act === 'summarize') {
                if (typeof window.summarizeWeek === 'function') window.summarizeWeek(week);
                else this.dispatchEvent(new CustomEvent('week-section:summarize', { bubbles: true, composed: true, detail: { week } }));
            } else if (act === 'show-summary') {
                if (typeof window.showSavedSummary === 'function') window.showSavedSummary(week);
                else this.dispatchEvent(new CustomEvent('week-section:show-summary', { bubbles: true, composed: true, detail: { week } }));
            }
        });

        ['view', 'present', 'edit'].forEach((act) => {
            this.shadowRoot.addEventListener(act, (ev) => {
                const d = ev.detail || {};
                if (!d.filePath) return;
                ev.stopPropagation();
                const out = new CustomEvent(`note:${act}`, {
                    bubbles: true, composed: true, cancelable: true,
                    detail: { filePath: d.filePath },
                });
                const proceed = this.dispatchEvent(out);
                if (!proceed) ev.preventDefault();
            });
        });
    }
}

if (!customElements.get('week-section')) customElements.define('week-section', WeekSection);
