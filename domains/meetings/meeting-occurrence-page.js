/**
 * <meeting-occurrence-page meetings_service="…" tasks_service="…" people_service="…">
 *
 * Single-occurrence workspace for a meeting that belongs to a series.
 * Reads its id from the URL (/meeting-occurrence/:id), fetches the
 * occurrence + its parent series (for title/back-link) + follow-up tasks
 * scoped to this occurrence, and renders an editable agenda (notes +
 * outcome), a decisions log, freeform minutes, follow-up quick-add, and
 * lifecycle actions (start / close / reopen) plus a PDF export link.
 *
 * Service contract (MeetingsService): get, update, start, close, reopen,
 * addOccurrenceAgendaItem, updateOccurrenceAgendaItem, addDecision,
 * removeDecision, getSeries, listTypes.
 */
import { WNElement, html, unsafeHTML } from './_shared.js';
import '/components/pick-date-time-span.js';
import '/components/person-multi-picker.js';
import '/components/pick-place.js';

const STATUS_LABEL = { planned: 'Planlagt', 'in-progress': 'Pågår', closed: 'Avsluttet' };
const STATUS_ICON  = { planned: '📝', 'in-progress': '▶️', closed: '✅' };
const OUTCOME_LABEL = { resolved: '✅ Løst', deferred: '⏭️ Utsatt', cancelled: '🚫 Avlyst' };

const STYLES = `
    :host { display: block; padding: 20px 24px; box-sizing: border-box; color: var(--text-strong); font: inherit; max-width: 900px; margin: 0 auto; }
    .mo-back { font-size: 0.85em; color: var(--accent); text-decoration: none; }
    .mo-back:hover { text-decoration: underline; }
    .mo-head { display: flex; align-items: flex-start; gap: 10px; margin: 10px 0 4px; flex-wrap: wrap; }
    .mo-head h1 { margin: 0; flex: 1; font-family: var(--font-heading, Georgia, serif); font-weight: 400; color: var(--accent); }
    .mo-status { font-size: 0.8em; padding: 2px 10px; border-radius: 10px; background: var(--surface-alt); color: var(--text-muted); white-space: nowrap; }
    .mo-meta { color: var(--text-subtle); font-size: 0.9em; margin-bottom: 16px; display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
    .mo-act { background: none; border: 1px solid var(--border); cursor: pointer; font-size: 0.88em; padding: 6px 12px; border-radius: 6px; font-family: inherit; color: var(--text-strong); background: var(--surface); }
    .mo-act:hover { background: var(--surface-alt); }
    .mo-act.primary { background: var(--accent); color: var(--text-on-accent); border-color: var(--accent); font-weight: 600; }
    .mo-act.primary:hover { filter: brightness(0.95); }
    .mo-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .mo-warn { color: var(--danger, #c53030); }

    .mo-section { margin-bottom: 26px; }
    .mo-section h2 { font-size: 0.85em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }

    .mo-agenda-item { border: 1px solid var(--border-soft); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; background: var(--surface); }
    .mo-agenda-item .row1 { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .mo-agenda-item .title { flex: 1; font-weight: 600; }
    .mo-agenda-item textarea { width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-strong); font: inherit; font-size: 0.9em; min-height: 50px; resize: vertical; }
    .mo-outcome-btns { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
    .mo-outcome-btn { padding: 4px 10px; border-radius: 12px; border: 1px solid var(--border-soft); background: var(--surface-alt); color: var(--text-muted); cursor: pointer; font: inherit; font-size: 0.8em; }
    .mo-outcome-btn:hover { border-color: var(--accent); }
    .mo-outcome-btn.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-strong); font-weight: 600; }
    .mo-agenda-add { display: flex; gap: 8px; margin-top: 4px; }
    .mo-agenda-add input { flex: 1; padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-strong); font: inherit; }
    .mo-agenda-add button { padding: 7px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); cursor: pointer; font: inherit; }

    .mo-decision { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-faint, var(--border-soft)); }
    .mo-decision .text { flex: 1; }
    .mo-decision .rm { background: none; border: none; color: var(--text-subtle); cursor: pointer; font-family: inherit; }
    .mo-decision .rm:hover { color: var(--danger, #c53030); }
    .mo-decision-add { display: flex; gap: 8px; margin-top: 8px; }
    .mo-decision-add input { flex: 1; padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-strong); font: inherit; }
    .mo-decision-add button { padding: 7px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); cursor: pointer; font: inherit; }

    .mo-minutes textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text-strong); font: inherit; font-size: 0.92em; min-height: 160px; resize: vertical; font-family: ui-monospace, monospace; }
    .mo-minutes .hint { font-size: 0.78em; color: var(--text-subtle); margin-top: 4px; }
    .mo-minutes .save-row { display: flex; justify-content: flex-end; margin-top: 6px; }

    .mo-tasks ul { list-style: none; margin: 0; padding: 0; }
    .mo-tasks li { padding: 5px 0; font-size: 0.92em; display: flex; align-items: baseline; gap: 8px; }
    .mo-tasks li.done .text { color: var(--text-subtle); text-decoration: line-through; }
    .mo-tasks li .text { flex: 1; word-break: break-word; }
    .mo-empty { color: var(--text-subtle); font-style: italic; font-size: 0.9em; }
    .mo-loading, .mo-error { padding: 40px 0; text-align: center; color: var(--text-muted); font-style: italic; }
    .mo-error { color: var(--danger, #c0392b); }

    .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 1000; }
    .modal.open { display: flex; }
    .modal-card { background: var(--surface, #fff); color: var(--text-strong); border-radius: 10px; padding: 22px; width: min(560px, 92vw); max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
    .modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .modal-head h3 { margin: 0; }
    .modal-close { background: none; border: none; font-size: 1.3em; cursor: pointer; color: var(--text-subtle); font-family: inherit; }
    .modal-form { display: flex; flex-direction: column; gap: 12px; }
    .modal-form label { font-size: 0.85em; font-weight: 600; color: var(--text-muted); display: block; }
    .modal-form input, .modal-form select { display: block; width: 100%; margin-top: 4px; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-strong); font: inherit; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
    .modal-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); font: inherit; cursor: pointer; }
    .modal-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 600; }
`;

class MeetingOccurrencePage extends WNElement {
    static get domain() { return 'meetings'; }
    static get observedAttributes() { return ['meetings_service', 'tasks_service', 'people_service']; }

    connectedCallback() {
        this._id = this._extractId();
        this._headerModal = null;
        super.connectedCallback();
        this._wire();
    }

    _extractId() {
        const m = location.pathname.match(/^\/meeting-occurrence\/([^/]+)$/);
        return m ? decodeURIComponent(m[1]) : '';
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) this.invalidateAwait();
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    css() { return STYLES; }

    loadData() {
        if (!this.service || !this._id) return {};
        const svc = this.service;
        const tasksSvc = this.serviceFor('tasks');
        const id = this._id;
        const meetingPromise = svc.get(id);
        return {
            meeting: () => meetingPromise,
            series: () => meetingPromise.then(m => (m && m.seriesId) ? svc.getSeries(m.seriesId).catch(() => null) : null),
            tasks: () => tasksSvc ? tasksSvc.list() : Promise.resolve([]),
            types: () => svc.listTypes ? svc.listTypes() : Promise.resolve([]),
        };
    }

    _refresh() { this.invalidateAwait(); this.requestRender(); }

    _wire() {
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
        this.shadowRoot.addEventListener('change', (e) => this._onChange(e));
        this.shadowRoot.addEventListener('task:created', () => this._refresh());
        this.shadowRoot.addEventListener('task:completed', () => this._refresh());
        this.shadowRoot.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const el = e.target;
            if (el && el.dataset && el.dataset.el === 'agenda-add') { e.preventDefault(); this._addAgendaItem(); }
            if (el && el.dataset && el.dataset.el === 'decision-add') { e.preventDefault(); this._addDecision(); }
        });
    }

    _onChange(e) {
        const cb = e.target.closest('input[data-act="toggle"]');
        if (!cb) return;
        const id = cb.dataset.taskid;
        const text = cb.dataset.tasktext || '';
        const tasksSvc = this.serviceFor('tasks');
        if (!tasksSvc || typeof tasksSvc.toggle !== 'function') { cb.checked = !cb.checked; return; }
        if (cb.checked) {
            this.dispatchEvent(new CustomEvent('task:request-complete', {
                bubbles: true, composed: true,
                detail: {
                    id, text,
                    callback: async (res) => {
                        if (!res || !res.confirmed) { cb.checked = false; return; }
                        try { await tasksSvc.toggle(res.id, res.comment || ''); } catch (err) { console.error(err); }
                        this._refresh();
                    },
                },
            }));
        } else {
            (async () => { try { await tasksSvc.toggle(id, ''); } catch (err) { console.error(err); } this._refresh(); })();
        }
    }

    async _onClick(e) {
        const path = e.composedPath();
        const act = (cls) => path.find(n => n.classList && n.classList.contains(cls));

        if (act('mo-start')) { await this._call(() => this.service.start(this._id)); return; }
        if (act('mo-close')) {
            const meeting = this._meeting;
            const undecided = (meeting && Array.isArray(meeting.agenda)) ? meeting.agenda.filter(a => !a.outcome).length : 0;
            const msg = undecided
                ? `${undecided} saklistepunkt(er) har ingen utfall og vil bli utsatt automatisk. Avslutte møtet?`
                : 'Avslutte møtet?';
            if (!confirm(msg)) return;
            await this._call(() => this.service.close(this._id));
            return;
        }
        if (act('mo-reopen')) { await this._call(() => this.service.reopen(this._id)); return; }

        const outcomeBtn = act('mo-outcome-btn');
        if (outcomeBtn) {
            const agendaItemId = outcomeBtn.dataset.item;
            const outcome = outcomeBtn.dataset.outcome;
            const current = outcomeBtn.dataset.current;
            const next = current === outcome ? null : outcome; // click again to clear
            await this._call(() => this.service.updateOccurrenceAgendaItem(this._id, agendaItemId, { outcome: next }));
            return;
        }

        if (act('mo-agenda-add-btn')) { this._addAgendaItem(); return; }
        if (act('mo-decision-add-btn')) { this._addDecision(); return; }
        const rmDecision = act('mo-decision-rm');
        if (rmDecision) { await this._call(() => this.service.removeDecision(this._id, rmDecision.dataset.id)); return; }

        if (act('mo-save-minutes')) {
            const ta = this.shadowRoot.querySelector('[data-el="minutes"]');
            if (ta) await this._call(() => this.service.update(this._id, { minutes: ta.value }));
            return;
        }

        if (act('mo-edit-head')) { this._openHeaderModal(); return; }
        const backdrop = act('modal');
        if (backdrop && e.target === backdrop) { this._headerModal = false; this.requestRender(); return; }
        if (act('modal-close') || (path.find(n => n.dataset && n.dataset.act === 'cancel'))) { this._headerModal = false; this.requestRender(); return; }
        if (path.find(n => n.dataset && n.dataset.act === 'save-head')) { this._saveHeader(); return; }
    }

    async _call(fn) {
        try { await fn(); this._refresh(); }
        catch (e) { alert((e && e.message) || 'Feil'); }
    }

    async _addAgendaItem() {
        const input = this.shadowRoot.querySelector('[data-el="agenda-add"]');
        if (!input) return;
        const title = (input.value || '').trim();
        if (!title) return;
        await this._call(() => this.service.addOccurrenceAgendaItem(this._id, title));
    }

    async _addDecision() {
        const input = this.shadowRoot.querySelector('[data-el="decision-add"]');
        if (!input) return;
        const text = (input.value || '').trim();
        if (!text) return;
        await this._call(() => this.service.addDecision(this._id, text));
    }

    async _saveAgendaNotes(agendaItemId, notes) {
        try { await this.service.updateOccurrenceAgendaItem(this._id, agendaItemId, { notes }); }
        catch (e) { console.error('meeting-occurrence-page: save notes failed', e); }
    }

    _openHeaderModal() {
        const m = this._meeting;
        this._headerModal = true;
        this.requestRender();
        setTimeout(() => {
            const root = this.shadowRoot;
            const span = root.querySelector('[data-span]');
            if (span && m) { span.start = `${m.date} ${m.start || '00:00'}`; span.end = `${m.endDate || m.date} ${m.end || m.start || '00:00'}`; }
            const att = root.getElementById('moHeadAttendees');
            if (att && m) att.value = m.attendees || [];
            const place = root.getElementById('moHeadPlace');
            if (place && m && m.location) place.value = { key: m.placeKey || null, name: m.location };
        }, 30);
    }

    async _saveHeader() {
        const root = this.shadowRoot;
        const titleIn = root.getElementById('moHeadTitle');
        const span = root.querySelector('[data-span]');
        const parseDt = (v) => { const mm = (v || '').match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/); return mm ? { date: mm[1], time: mm[2] } : { date: '', time: '' }; };
        const startParts = parseDt(span ? span.start : '');
        const endParts = parseDt(span ? span.end : '');
        const attPicker = root.getElementById('moHeadAttendees');
        const placePicker = root.getElementById('moHeadPlace');
        const placeVal = placePicker ? placePicker.value : null;
        const patch = {
            title: (titleIn.value || '').trim(),
            date: startParts.date, start: startParts.time, end: endParts.time,
            attendees: attPicker ? attPicker.value : [],
            location: placeVal ? placeVal.name : '',
            placeKey: placeVal ? (placeVal.key || '') : '',
        };
        if (endParts.date && endParts.date !== startParts.date) patch.endDate = endParts.date;
        try {
            await this.service.update(this._id, patch);
            this._headerModal = false;
            this._refresh();
        } catch (e) { alert((e && e.message) || 'Feil'); }
    }

    _renderAgendaItem(a) {
        const outcomes = ['resolved', 'deferred', 'cancelled'];
        return html`
            <div class="mo-agenda-item">
                <div class="row1"><span class="title">${a.title}</span></div>
                <textarea placeholder="Notater…" data-agenda="${a.agendaItemId}">${a.notes || ''}</textarea>
                <div class="mo-outcome-btns">
                    ${outcomes.map(o => html`
                        <button type="button" class="mo-outcome-btn ${a.outcome === o ? 'on' : ''}" data-item="${a.agendaItemId}" data-outcome="${o}" data-current="${a.outcome || ''}">${OUTCOME_LABEL[o]}</button>
                    `)}
                </div>
            </div>
        `;
    }

    _renderModal() {
        const m = this._meeting;
        return html`
            <div class="modal open">
                <div class="modal-card">
                    <div class="modal-head"><h3>✏️ Rediger møte</h3><button class="modal-close" type="button" aria-label="Lukk">✕</button></div>
                    <div class="modal-form">
                        <label>Tittel<input type="text" id="moHeadTitle" value="${(m && m.title) || ''}" /></label>
                        <pick-date-time-span data-span></pick-date-time-span>
                        <label>Deltakere<person-multi-picker id="moHeadAttendees"></person-multi-picker></label>
                        <label>Sted<pick-place id="moHeadPlace" placeholder="Velg eller opprett sted…"></pick-place></label>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn" type="button" data-act="cancel">Avbryt</button>
                        <button class="modal-btn primary" type="button" data-act="save-head">💾 Lagre</button>
                    </div>
                </div>
            </div>
        `;
    }

    render(data = {}) {
        if (!this.service) return this.renderNoService();
        if (!this._id) return html`<div class="mo-error">Fant ingen møte-id i URL-en</div>`;
        if (data._loading) return html`<div class="mo-loading">Laster…</div>`;
        const meeting = data.meeting;
        if (!meeting) return html`<div class="mo-error">Fant ikke møtet</div>`;
        this._meeting = meeting;
        this._types = data.types || [];
        const series = data.series;
        const tasks = (data.tasks || []).filter(t => t.meetingId === this._id);
        const agenda = Array.isArray(meeting.agenda) ? meeting.agenda.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
        const decisions = Array.isArray(meeting.decisions) ? meeting.decisions : [];
        const isSeriesOccurrence = !!meeting.seriesId;
        const timeRange = [meeting.start, meeting.end].filter(Boolean).join('–');

        return html`
            <div class="mo">
                ${series ? html`<a class="mo-back" href="/meeting-series#ms-${encodeURIComponent(series.id)}">← ${series.title}</a>` : ''}
                <div class="mo-head">
                    <h1>${meeting.title || 'Møte'}</h1>
                    ${isSeriesOccurrence ? html`<span class="mo-status">${STATUS_ICON[meeting.status] || ''} ${STATUS_LABEL[meeting.status] || ''}</span>` : ''}
                </div>
                <div class="mo-meta">
                    <span>📅 ${meeting.date}${timeRange ? ' ' + timeRange : ''}</span>
                    ${meeting.location ? html`<span>📍 ${meeting.location}</span>` : ''}
                    ${(meeting.attendees || []).length ? html`<span>👥 ${meeting.attendees.map(a => '@' + a).join(' ')}</span>` : ''}
                    <button type="button" class="mo-act mo-edit-head" title="Rediger møte">✏️ Rediger</button>
                    <a class="mo-act" href="/meetings/${encodeURIComponent(this._id)}/minutes" target="_blank" rel="noopener">📄 Eksporter til PDF</a>
                </div>

                ${isSeriesOccurrence ? html`
                    <div class="mo-actions">
                        ${meeting.status === 'planned' ? html`<button type="button" class="mo-act primary mo-start">▶️ Start møte</button>` : ''}
                        ${meeting.status === 'in-progress' ? html`<button type="button" class="mo-act primary mo-close">✅ Avslutt møte</button>` : ''}
                        ${meeting.status === 'closed' ? html`<button type="button" class="mo-act mo-reopen">↻ Gjenåpne</button>` : ''}
                    </div>

                    <div class="mo-section">
                        <h2>📋 Saksliste <span class="c">${agenda.length}</span></h2>
                        ${agenda.length === 0 ? html`<p class="mo-empty">Ingen saklistepunkter i dette møtet.</p>` : agenda.map(a => this._renderAgendaItem(a))}
                        <div class="mo-agenda-add">
                            <input type="text" data-el="agenda-add" placeholder="➕ Legg til saklistepunkt (også til serien)…" />
                            <button type="button" class="mo-agenda-add-btn">Legg til</button>
                        </div>
                    </div>

                    <div class="mo-section">
                        <h2>💡 Beslutninger <span class="c">${decisions.length}</span></h2>
                        ${decisions.length === 0 ? html`<p class="mo-empty">Ingen beslutninger registrert.</p>` : decisions.map(d => html`
                            <div class="mo-decision">
                                <span class="text">${d.text}</span>
                                <button type="button" class="rm mo-decision-rm" data-id="${d.id}" title="Fjern (korriger feilregistrering)">✕</button>
                            </div>
                        `)}
                        <div class="mo-decision-add">
                            <input type="text" data-el="decision-add" placeholder="➕ Ny beslutning…" />
                            <button type="button" class="mo-decision-add-btn">Legg til</button>
                        </div>
                    </div>
                ` : html`<p class="mo-empty">Dette møtet tilhører ikke en møteserie — saksliste, beslutninger og livssyklus er ikke tilgjengelig.</p>`}

                <div class="mo-section mo-minutes">
                    <h2>📝 Referat (fritekst)</h2>
                    <textarea data-el="minutes" placeholder="Skriv referat i markdown…">${meeting.minutes || ''}</textarea>
                    <div class="hint">Støtter markdown. Vises i PDF-eksporten.</div>
                    <div class="save-row"><button type="button" class="mo-act mo-save-minutes">💾 Lagre referat</button></div>
                </div>

                <div class="mo-section mo-tasks">
                    <h2>✅ Oppfølgingsoppgaver <span class="c">${tasks.length}</span></h2>
                    ${tasks.length === 0 ? html`<p class="mo-empty">Ingen oppfølgingsoppgaver for dette møtet ennå.</p>` : html`<ul>${tasks.map(t => html`
                        <li class="${t.done ? 'done' : ''}">
                            <input type="checkbox" data-act="toggle" data-taskid="${t.id}" data-tasktext="${t.text || ''}" ${t.done ? unsafeHTML('checked') : ''}>
                            <span class="text">${t.text || '(uten tekst)'}</span>
                        </li>
                    `)}</ul>`}
                    <task-create compact
                        tasks_service="week-note-services.tasks_service"
                        meeting-id="${this._id}"
                        meeting-series-id="${series ? series.id : ''}"
                        placeholder="➕ Ny oppfølgingsoppgave fra møtet"
                        button-label="Legg til"></task-create>
                </div>

                ${this._headerModal ? this._renderModal() : ''}
            </div>
        `;
    }

    afterRender(data) {
        if (!data || data._loading) return;
        // Wire per-item agenda notes autosave on blur (declarative render()
        // can't attach listeners directly; do it here where the DOM exists).
        const root = this.shadowRoot;
        root.querySelectorAll('textarea[data-agenda]').forEach(ta => {
            if (ta._wired) return;
            ta._wired = true;
            ta.addEventListener('blur', () => this._saveAgendaNotes(ta.dataset.agenda, ta.value));
        });
    }
}

if (!customElements.get('meeting-occurrence-page')) customElements.define('meeting-occurrence-page', MeetingOccurrencePage);
