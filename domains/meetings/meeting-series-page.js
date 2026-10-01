/**
 * <meeting-series-page meetings_service="…" tasks_service="…" people_service="…">
 *
 * Full-page dashboard for meeting series (recurring meetings with a
 * persistent, carry-forward agenda). Master/detail layout mirroring
 * <goals-page>: series list grouped by status (active/archived) on the
 * left, detail pane on the right with agenda queue, occurrence history,
 * follow-up tasks and a flattened decisions log.
 *
 * Service contract (MeetingsService):
 *   listSeries()                          → Series[] (with rollup fields)
 *   createSeries(data)                     → {series}
 *   updateSeries(id, patch)                → {series}
 *   removeSeries(id)                       → {ok}
 *   addAgendaItem(id, title)               → {item, series}
 *   updateAgendaItem(id, itemId, patch)    → {item, series}
 *   removeAgendaItem(id, itemId)           → {ok}
 *   list()                                 → Meeting[] (all occurrences, used to build history + decisions log)
 *   create(data)                           → {meeting}  (data.seriesId starts a new occurrence)
 *   tasks_service.list()   (optional)      → Task[]
 *   people_service.list()  (optional)      → Person[]
 *
 * A series: {id, title, description, status:'active'|'archived',
 *   defaultAttendees, defaultLocation, defaultPlaceKey, defaultType,
 *   defaultDurationMins, agendaItems:[{id,title,state,order}],
 *   occurrenceCount, queuedAgendaCount, nextOccurrence, lastOccurrence}
 */
import { WNElement, html, unsafeHTML, escapeHtml } from './_shared.js';
import '/components/pick-date-time-span.js';
import '/components/person-multi-picker.js';
import '/components/pick-place.js';
import { meetingPopupFeatures, rememberMeetingPopupSize } from '/components/meeting-popup.js';

const STATUS_LABEL = { active: 'Aktiv', archived: 'Arkivert' };
const STATUS_ICON  = { active: '📚', archived: '🗄️' };
const STATUS_ORDER = ['active', 'archived'];

const OCC_ICON  = { planned: '📝', 'in-progress': '▶️', closed: '✅' };
const OCC_LABEL = { planned: 'Planlagt', 'in-progress': 'Pågår', closed: 'Avsluttet' };

const STYLES = `
    :host { display: block; padding: 20px 24px; box-sizing: border-box; color: var(--text-strong); font: inherit; }
    body:has(meeting-series-page) { max-width: none; }
    .mp { display: flex; flex-direction: column; height: calc(100vh - 100px); min-height: 400px; }
    .mp-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; flex-wrap: wrap; flex: 0 0 auto; }
    .mp-head h1 { margin: 0; font-family: var(--font-heading, Georgia, serif); font-weight: 400; color: var(--accent); }
    .mp-hint { color: var(--text-subtle); font-size: 0.85em; margin: 0 0 12px; flex: 0 0 auto; }

    .mp-btn-primary {
        background: var(--accent); color: var(--surface, #fff);
        border: none; padding: 8px 16px; border-radius: 6px;
        font: inherit; font-weight: 600; cursor: pointer;
    }
    .mp-btn-primary:hover { filter: brightness(0.95); }

    .mp-body { display: flex; gap: 0; flex: 1 1 auto; min-height: 0; border: 1px solid var(--border-soft); border-radius: 10px; overflow: hidden; }
    .mp-master { width: 320px; flex: 0 0 320px; border-right: 1px solid var(--border-soft); overflow-y: auto; background: var(--bg); }
    .mp-detail-pane { flex: 1 1 auto; min-width: 0; overflow-y: auto; padding: 24px 28px; background: var(--surface); }

    .mp-section { margin: 0; }
    .mp-section-h {
        color: var(--text-muted); font-size: 0.72em; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.06em;
        margin: 0; padding: 10px 14px 4px;
        border-bottom: 1px solid var(--border-faint, var(--border-soft));
        display: flex; align-items: center; gap: 8px;
        position: sticky; top: 0; background: var(--bg); z-index: 1;
    }
    .mp-section-h .c { color: var(--text-subtle); font-size: 0.95em; font-weight: 500; }

    .mp-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--border-faint, var(--border-soft)); transition: background 0.12s; }
    .mp-item:hover { background: var(--surface-alt); }
    .mp-item.selected { background: var(--accent-soft); border-left: 3px solid var(--accent); padding-left: 11px; }
    .mp-item.archived { opacity: 0.6; }
    .mp-item-icon { flex: 0 0 auto; font-size: 1.05em; }
    .mp-item-body { flex: 1; min-width: 0; }
    .mp-item-title { font-weight: 600; font-size: 0.92em; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mp-item-sub { font-size: 0.78em; color: var(--text-subtle); display: flex; align-items: center; gap: 8px; margin-top: 2px; flex-wrap: wrap; }
    .mp-badge { background: var(--accent-soft); color: var(--accent-strong); border-radius: 8px; padding: 0 6px; font-weight: 600; }

    .mp-dp-empty { color: var(--text-subtle); font-style: italic; padding: 40px 0; text-align: center; }
    .mp-dp-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .mp-dp-title { flex: 1; margin: 0; font-family: var(--font-heading, Georgia, serif); font-weight: 400; font-size: 1.5em; color: var(--accent); }
    .mp-act { background: none; border: none; cursor: pointer; font-size: 1em; padding: 4px 8px; border-radius: 4px; font-family: inherit; color: var(--text-muted); }
    .mp-act:hover { background: var(--surface-head); }
    .mp-del { color: var(--danger, #c53030); }
    .mp-desc { color: var(--text-muted); font-size: 0.95em; line-height: 1.5; white-space: pre-wrap; word-break: break-word; margin: 0 0 16px; }
    .mp-meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 0.85em; color: var(--text-subtle); margin-bottom: 20px; }

    .mp-detail { display: flex; flex-direction: column; gap: 20px; }
    .mp-detail h4 { margin: 0 0 6px; font-size: 0.85em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
    .mp-detail ul { list-style: none; margin: 0; padding: 0; }
    .mp-detail li { padding: 5px 0; font-size: 0.92em; color: var(--text-strong); display: flex; align-items: baseline; gap: 8px; }
    .mp-detail li .mark { width: 1.1em; flex: 0 0 auto; color: var(--text-subtle); }
    .mp-detail li.done .text { color: var(--text-subtle); text-decoration: line-through; }
    .mp-detail li .text { flex: 1; word-break: break-word; }
    .mp-detail .empty { color: var(--text-subtle); font-style: italic; font-size: 0.9em; }
    .mp-quickadd { margin-top: 8px; }

    .mp-agenda-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-faint, var(--border-soft)); }
    .mp-agenda-row .text { flex: 1; font-size: 0.92em; }
    .mp-agenda-add { display: flex; gap: 8px; margin-top: 8px; }
    .mp-agenda-add input { flex: 1; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-strong); font: inherit; }
    .mp-agenda-add button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); cursor: pointer; font: inherit; }
    .mp-agenda-add button:hover { background: var(--surface-alt); }

    .mp-occ-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border-faint, var(--border-soft)); cursor: pointer; }
    .mp-occ-row:hover { background: var(--surface-alt); }
    .mp-occ-date { font-weight: 600; font-size: 0.92em; white-space: nowrap; }
    .mp-occ-title { flex: 1; color: var(--text-muted); font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .mp-decision-grp { margin-bottom: 10px; }
    .mp-decision-grp .dgh { font-size: 0.8em; color: var(--text-subtle); margin-bottom: 4px; }

    .mp-loading, .mp-error { padding: 24px; text-align: center; color: var(--text-muted); font-style: italic; }
    .mp-error { color: var(--danger, #c0392b); }
    .mp-empty { color: var(--text-subtle); font-style: italic; margin-top: 8px; }

    .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 1000; }
    .modal.open { display: flex; }
    .mp-setup { display: flex; justify-content: center; padding: 24px; }
    .modal-card { background: var(--surface, #fff); color: var(--text-strong); border-radius: 10px; padding: 22px; width: min(560px, 92vw); max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
    .mp-setup .modal-card { box-sizing: border-box; width: min(610px, 100%); max-height: none; overflow: visible; }
    .modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .modal-head h3 { margin: 0; }
    .modal-close { background: none; border: none; font-size: 1.3em; cursor: pointer; color: var(--text-subtle); font-family: inherit; }
    .modal-form { display: flex; flex-direction: column; gap: 12px; }
    .modal-form label { font-size: 0.85em; font-weight: 600; color: var(--text-muted); display: block; }
    .modal-form textarea, .modal-form input, .modal-form select {
        display: block; width: 100%; margin-top: 4px; box-sizing: border-box;
        padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;
        background: var(--bg); color: var(--text-strong); font: inherit;
    }
    .modal-form textarea:focus, .modal-form input:focus, .modal-form select:focus { border-color: var(--accent); outline: none; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
    .modal-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); font: inherit; cursor: pointer; }
    .modal-btn:hover { background: var(--surface-head); }
    .modal-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 600; }
    .modal-btn.primary:hover { filter: brightness(0.95); }
    details.mp-adv { margin-top: 4px; }
    details.mp-adv summary { cursor: pointer; font-size: 0.85em; color: var(--text-muted); font-weight: 600; }
    details.mp-adv .modal-form { margin-top: 10px; }
`;

class MeetingSeriesPage extends WNElement {
    static get domain() { return 'meetings'; }
    static get observedAttributes() { return ['meetings_service', 'tasks_service', 'people_service']; }

    constructor() {
        super();
        this._state = null;
        this._setupSeriesId = new URLSearchParams(location.search).get('popup') === '1'
            ? new URLSearchParams(location.search).get('startSeries') : null;
        this._modal = this._setupSeriesId ? { kind: 'occurrence', seriesId: this._setupSeriesId } : null;
        this._selectedId = null;
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        rememberMeetingPopupSize();
        this._wire();
        const m = (location.hash || '').match(/^#ms-(.+)$/);
        if (m) this._selectedId = decodeURIComponent(m[1]);
        if (!this._kbWired) {
            this._kbWired = true;
            this._onKey = this._onKey.bind(this);
            document.addEventListener('keydown', this._onKey);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback && super.disconnectedCallback();
        if (this._kbWired) {
            document.removeEventListener('keydown', this._onKey);
            this._kbWired = false;
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) this.invalidateAwait();
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    loadData() {
        if (!this.service) return {};
        const tasksSvc = this.serviceFor('tasks');
        const peopleSvc = this.serviceFor('people');
        return {
            series: async () => {
                const s = await this.service.listSeries();
                return s || [];
            },
            occurrences: () => this.service.list(),
            tasks:   () => tasksSvc ? tasksSvc.list() : Promise.resolve([]),
            people:  () => peopleSvc ? peopleSvc.list() : Promise.resolve([]),
            types:   () => this.service.listTypes ? this.service.listTypes() : Promise.resolve([]),
        };
    }

    _refresh() { this.invalidateAwait(); this.requestRender(); }

    _wire() {
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
        this.shadowRoot.addEventListener('keydown', (e) => this._onFormKey(e));
        this.shadowRoot.addEventListener('task:created', () => this._refresh());
        this.shadowRoot.addEventListener('task:completed', () => this._refresh());
        this.shadowRoot.addEventListener('change', (e) => this._onChange(e));
    }

    _onFormKey(e) {
        if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.el === 'agenda-add') {
            e.preventDefault();
            this._addAgendaItem();
        }
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
                        try { await tasksSvc.toggle(res.id, res.comment || ''); }
                        catch (err) { console.error('meeting-series-page: toggle failed', err); }
                        this._refresh();
                    },
                },
            }));
        } else {
            (async () => {
                try { await tasksSvc.toggle(id, ''); }
                catch (err) { console.error('meeting-series-page: toggle failed', err); }
                this._refresh();
            })();
        }
    }

    _onKey(e) {
        if (!this._modal) return;
        if (e.key === 'Escape') { e.preventDefault(); this._closeModal(); }
    }

    _onClick(e) {
        const path = e.composedPath();
        if (path.find(n => n.id === 'mpNewBtn')) { this._openNewSeries(); return; }
        const item = path.find(n => n.classList && n.classList.contains('mp-item'));
        if (item && item.dataset.id) {
            if (!path.find(n => n.classList && (n.classList.contains('mp-act') || n.classList.contains('mp-del')))) {
                this._select(item.dataset.id);
                return;
            }
        }
        const occRow = path.find(n => n.classList && n.classList.contains('mp-occ-row'));
        if (occRow && occRow.dataset.id) {
            this._openMeetingPopup(`/meeting-occurrence/${encodeURIComponent(occRow.dataset.id)}?popup=1`);
            return;
        }

        const editBtn = path.find(n => n.classList && n.classList.contains('mp-edit'));
        if (editBtn) {
            const s = (this._state.series || []).find(x => x.id === editBtn.dataset.id);
            if (s) this._openEditSeries(s);
            return;
        }
        const archBtn = path.find(n => n.classList && n.classList.contains('mp-archive'));
        if (archBtn) { this._toggleArchive(archBtn.dataset.id, archBtn.dataset.next); return; }
        const delBtn = path.find(n => n.classList && n.classList.contains('mp-del'));
        if (delBtn) { this._deleteSeries(delBtn.dataset.id); return; }
        const newOccBtn = path.find(n => n.classList && n.classList.contains('mp-new-occ'));
        if (newOccBtn) { this._openNewOccurrence(newOccBtn.dataset.id); return; }
        const agendaAddBtn = path.find(n => n.classList && n.classList.contains('mp-agenda-add-btn'));
        if (agendaAddBtn) { this._addAgendaItem(); return; }
        const agendaRm = path.find(n => n.classList && n.classList.contains('mp-agenda-rm'));
        if (agendaRm) { this._removeAgendaItem(agendaRm.dataset.item); return; }
        const agendaEdit = path.find(n => n.classList && n.classList.contains('mp-agenda-edit'));
        if (agendaEdit) { this._renameAgendaItem(agendaEdit.dataset.item, agendaEdit.dataset.title); return; }

        const backdrop = path.find(n => n.classList && n.classList.contains('modal'));
        if (backdrop && e.target === backdrop) { this._closeModal(); return; }
        if (path.find(n => n.classList && n.classList.contains('modal-close'))) { this._closeModal(); return; }
        if (path.find(n => n.dataset && n.dataset.act === 'cancel')) { this._closeModal(); return; }
        if (path.find(n => n.dataset && n.dataset.act === 'save-series')) { this._saveSeries(); return; }
        if (path.find(n => n.dataset && n.dataset.act === 'save-occ')) { this._saveOccurrence(); return; }
    }

    _select(id) {
        this._selectedId = id;
        history.replaceState(null, '', '#ms-' + encodeURIComponent(id));
        this.requestRender();
    }

    // --- Series CRUD ---

    _openNewSeries() {
        this._modal = { kind: 'series', mode: 'new', title: '', description: '', defaultType: '', defaultDurationMins: 60 };
        this.requestRender();
        this._focusModalInput('mspModalTitle');
    }

    _openEditSeries(s) {
        this._modal = {
            kind: 'series', mode: 'edit', id: s.id,
            title: s.title || '', description: s.description || '',
            defaultType: s.defaultType || '', defaultDurationMins: s.defaultDurationMins || 60,
            defaultAttendees: s.defaultAttendees || [], defaultLocation: s.defaultLocation || '', defaultPlaceKey: s.defaultPlaceKey || '',
        };
        this.requestRender();
        this._focusModalInput('mspModalTitle');
        setTimeout(() => {
            const root = this.shadowRoot;
            const att = root.getElementById('mspModalAttendees');
            if (att) att.value = this._modal.defaultAttendees;
            const place = root.getElementById('mspModalPlace');
            if (place && this._modal.defaultLocation) place.value = { key: this._modal.defaultPlaceKey || null, name: this._modal.defaultLocation };
        }, 30);
    }

    _closeModal() {
        if (this._setupSeriesId) { window.close(); return; }
        this._modal = null;
        this.requestRender();
    }

    _focusModalInput(id) {
        setTimeout(() => { const inp = this.shadowRoot.getElementById(id); if (inp) inp.focus(); }, 30);
    }

    async _saveSeries() {
        if (!this._modal) return;
        const root = this.shadowRoot;
        const title = (root.getElementById('mspModalTitle').value || '').trim();
        if (!title) return;
        const description = root.getElementById('mspModalDesc').value || '';
        const defaultType = root.getElementById('mspModalType').value || '';
        const durRaw = (root.getElementById('mspModalDuration').value || '').trim();
        const defaultDurationMins = durRaw ? Number(durRaw) : 60;
        const attPicker = root.getElementById('mspModalAttendees');
        const placePicker = root.getElementById('mspModalPlace');
        const defaultAttendees = attPicker ? attPicker.value : [];
        const placeVal = placePicker ? placePicker.value : null;
        const data = {
            title, description, defaultType, defaultDurationMins,
            defaultAttendees,
            defaultLocation: placeVal ? placeVal.name : '',
            defaultPlaceKey: placeVal ? (placeVal.key || '') : '',
        };
        try {
            if (this._modal.mode === 'new') await this.service.createSeries(data);
            else await this.service.updateSeries(this._modal.id, data);
            this._modal = null;
            this._refresh();
        } catch (e) { alert((e && e.message) || 'Feil'); }
    }

    async _toggleArchive(id, next) {
        try { await this.service.updateSeries(id, { status: next }); this._refresh(); }
        catch (e) { alert((e && e.message) || 'Feil'); }
    }

    async _deleteSeries(id) {
        if (!confirm('Slett denne møteserien? Forekomster og oppgaver beholdes, men kobling til serien fjernes.')) return;
        try {
            await this.service.removeSeries(id);
            if (this._selectedId === id) this._selectedId = null;
            this._refresh();
        } catch (e) { alert((e && e.message) || 'Feil'); }
    }

    // --- Agenda queue ---

    async _addAgendaItem() {
        const root = this.shadowRoot;
        const input = root.querySelector('[data-el="agenda-add"]');
        if (!input) return;
        const title = (input.value || '').trim();
        if (!title || !this._selectedId) return;
        try {
            await this.service.addAgendaItem(this._selectedId, title);
            input.value = '';
            this._refresh();
        } catch (e) { alert((e && e.message) || 'Feil'); }
    }

    async _removeAgendaItem(itemId) {
        if (!this._selectedId || !itemId) return;
        if (!confirm('Fjerne dette saklistepunktet fra køen?')) return;
        try { await this.service.removeAgendaItem(this._selectedId, itemId); this._refresh(); }
        catch (e) { alert((e && e.message) || 'Feil'); }
    }

    async _renameAgendaItem(itemId, currentTitle) {
        if (!this._selectedId || !itemId) return;
        const next = prompt('Nytt saklistepunkt-navn:', currentTitle || '');
        if (next == null) return;
        const title = next.trim();
        if (!title) return;
        try { await this.service.updateAgendaItem(this._selectedId, itemId, { title }); this._refresh(); }
        catch (e) { alert((e && e.message) || 'Feil'); }
    }

    // --- New occurrence ---

    _openNewOccurrence(seriesId) {
        this._openMeetingPopup(`/meeting-series?startSeries=${encodeURIComponent(seriesId)}&popup=1`);
    }

    _openMeetingPopup(url) {
        const popup = window.open(
            url,
            '_blank',
            meetingPopupFeatures(900, 750)
        );
        if (!popup) {
            alert('Tillat popup-vinduer for å åpne møtet i eget vindu.');
            return;
        }
        popup.focus();
        const watch = setInterval(() => {
            if (!popup.closed) return;
            clearInterval(watch);
            if (location.pathname === '/meeting-series') location.reload();
        }, 300);
    }

    async _saveOccurrence() {
        if (!this._modal || this._modal.kind !== 'occurrence') return;
        const root = this.shadowRoot;
        const span = root.querySelector('[data-span]');
        const startVal = span ? span.start : '';
        const endVal = span ? span.end : '';
        const parseDt = (v) => {
            const m = (v || '').match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
            return m ? { date: m[1], time: m[2] } : { date: '', time: '' };
        };
        const startParts = parseDt(startVal);
        const endParts = parseDt(endVal);
        const data = { seriesId: this._modal.seriesId, date: startParts.date, start: startParts.time, end: endParts.time };
        if (endParts.date && endParts.date !== startParts.date) data.endDate = endParts.date;
        const titleIn = root.getElementById('mspOccTitle');
        if (titleIn && titleIn.value.trim()) data.title = titleIn.value.trim();
        const typeSel = root.getElementById('mspOccType');
        if (typeSel && typeSel.value) data.type = typeSel.value;
        const attPicker = root.getElementById('mspOccAttendees');
        if (attPicker && attPicker.value && attPicker.value.length) data.attendees = attPicker.value;
        const placePicker = root.getElementById('mspOccPlace');
        const placeVal = placePicker ? placePicker.value : null;
        if (placeVal && placeVal.name) { data.location = placeVal.name; data.placeKey = placeVal.key || ''; }
        if (!data.date) { alert('Dato/tid er påkrevd'); return; }
        let meeting;
        try {
            const r = await this.service.create(data);
            meeting = (r && r.meeting) || r;
            if (!meeting || !meeting.id) throw new Error('Møtet ble opprettet uten en id');
            await this.service.start(meeting.id);
            location.href = `/meeting-occurrence/${encodeURIComponent(meeting.id)}?popup=1`;
        } catch (e) {
            alert((e && e.message) || 'Feil');
            if (meeting && meeting.id) location.href = `/meeting-occurrence/${encodeURIComponent(meeting.id)}?popup=1`;
        }
    }

    // --- Rendering ---

    _renderItem(s) {
        const selected = this._selectedId === s.id;
        const cls = 'mp-item' + (s.status === 'archived' ? ' archived' : '') + (selected ? ' selected' : '');
        return html`
            <div class="${cls}" data-id="${s.id}">
                <span class="mp-item-icon">${STATUS_ICON[s.status] || '📚'}</span>
                <div class="mp-item-body">
                    <div class="mp-item-title">${s.title}</div>
                    <div class="mp-item-sub">
                        <span>${s.occurrenceCount || 0} møter</span>
                        ${s.queuedAgendaCount ? html`<span class="mp-badge">${s.queuedAgendaCount} i kø</span>` : ''}
                        ${s.nextOccurrence ? html`<span>📅 ${s.nextOccurrence.date}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    _renderDetailPane(s) {
        const tasks = (this._state.tasks || []).filter(t => t.meetingSeriesId === s.id);
        const occurrences = (this._state.occurrences || []).filter(m => m.seriesId === s.id)
            .slice().sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
        const nextStatus = s.status === 'active' ? 'archived' : 'active';
        const statusBtnTitle = s.status === 'active' ? 'Arkiver serien' : 'Reaktiver serien';
        const queued = (s.agendaItems || []).filter(a => a.state === 'queued').slice().sort((a, b) => (a.order || 0) - (b.order || 0));

        return html`
            <div class="mp-dp-head">
                <h2 class="mp-dp-title">${STATUS_ICON[s.status] || '📚'} ${s.title}</h2>
                <button class="mp-btn-primary mp-new-occ" data-id="${s.id}">▶️ Ny forekomst</button>
                <button class="mp-act mp-archive" data-id="${s.id}" data-next="${nextStatus}" title="${statusBtnTitle}">${s.status === 'active' ? '🗄️' : '↻'}</button>
                <button class="mp-act mp-edit" data-id="${s.id}" title="Rediger">✏️</button>
                <button class="mp-act mp-del" data-id="${s.id}" title="Slett">✕</button>
            </div>
            ${s.description ? html`<div class="mp-desc">${s.description}</div>` : ''}
            <div class="mp-meta">
                ${s.lastOccurrence ? html`<span>Sist: ${s.lastOccurrence.date}</span>` : ''}
                ${s.nextOccurrence ? html`<span>Neste: ${s.nextOccurrence.date}</span>` : ''}
            </div>
            <div class="mp-detail">
                <div>
                    <h4>📋 Saksliste i kø <span class="c">${queued.length}</span></h4>
                    ${queued.length === 0
                        ? html`<p class="empty">Ingen ventende saklistepunkter.</p>`
                        : html`${queued.map(a => html`
                            <div class="mp-agenda-row">
                                <span class="text">${a.title}</span>
                                <button class="mp-act mp-agenda-edit" data-item="${a.id}" data-title="${escapeHtml(a.title || '')}" title="Endre navn">✏️</button>
                                <button class="mp-act mp-del mp-agenda-rm" data-item="${a.id}" title="Fjern">✕</button>
                            </div>
                        `)}`}
                    <div class="mp-agenda-add">
                        <input type="text" data-el="agenda-add" placeholder="➕ Nytt saklistepunkt…" />
                        <button type="button" class="mp-agenda-add-btn">Legg til</button>
                    </div>
                </div>

                <div>
                    <h4>🗓️ Møtehistorikk <span class="c">${occurrences.length}</span></h4>
                    ${occurrences.length === 0
                        ? html`<p class="empty">Ingen forekomster ennå.</p>`
                        : html`${occurrences.map(m => html`
                            <div class="mp-occ-row" data-id="${m.id}">
                                <span class="mp-occ-date">${OCC_ICON[m.status] || '📝'} ${m.date}${m.start ? ' ' + m.start : ''}</span>
                                <span class="mp-occ-title">${m.title || ''}</span>
                                <span>${OCC_LABEL[m.status] || ''}</span>
                            </div>
                        `)}`}
                </div>

                <div>
                    <h4>✅ Oppfølgingsoppgaver <span class="c">${tasks.length}</span></h4>
                    ${this._renderTaskList(tasks)}
                    <div class="mp-quickadd">
                        <task-create compact
                            tasks_service="week-note-services.tasks_service"
                            meeting-series-id="${s.id}"
                            placeholder="➕ Ny oppfølgingsoppgave"
                            button-label="Legg til"></task-create>
                    </div>
                </div>

                <div>
                    <h4>💡 Beslutningslogg</h4>
                    ${this._renderDecisionsLog(occurrences)}
                </div>
            </div>
            ${this._renderModal()}
        `;
    }

    _renderTaskList(tasks) {
        if (!tasks.length) return html`<p class="empty">Ingen oppfølgingsoppgaver ennå.</p>`;
        const sorted = tasks.slice().sort((a, b) => {
            if (!!a.done !== !!b.done) return a.done ? 1 : -1;
            return (b.created || '').localeCompare(a.created || '');
        });
        return html`<ul>${sorted.map(t => html`
            <li class="${t.done ? 'done' : ''}">
                <input type="checkbox" class="mark" data-act="toggle" data-taskid="${t.id}" data-tasktext="${t.text || ''}" ${t.done ? unsafeHTML('checked') : ''}>
                <span class="text">${t.text || '(uten tekst)'}</span>
            </li>
        `)}</ul>`;
    }

    _renderDecisionsLog(occurrences) {
        const withDecisions = occurrences.filter(m => Array.isArray(m.decisions) && m.decisions.length);
        if (!withDecisions.length) return html`<p class="empty">Ingen beslutninger registrert ennå.</p>`;
        return html`${withDecisions.map(m => html`
            <div class="mp-decision-grp">
                <div class="dgh">${m.date}${m.title ? ' — ' + m.title : ''}</div>
                <ul>${m.decisions.map(d => html`<li><span class="mark">💡</span><span class="text">${d.text}</span></li>`)}</ul>
            </div>
        `)}`;
    }

    _renderModal() {
        if (!this._modal) return '';
        if (this._modal.kind === 'occurrence') return this._renderOccurrenceModal();
        return this._renderSeriesModal();
    }

    _renderSeriesModal() {
        const m = this._modal;
        const isNew = m.mode === 'new';
        const types = this._state.types || [];
        return html`
            <div class="modal open">
                <div class="modal-card">
                    <div class="modal-head">
                        <h3>${isNew ? '➕ Ny møteserie' : '✏️ Rediger møteserie'}</h3>
                        <button class="modal-close" type="button" aria-label="Lukk">✕</button>
                    </div>
                    <div class="modal-form">
                        <label>Tittel<input type="text" id="mspModalTitle" value="${m.title || ''}" placeholder="F.eks. Ukentlig statusmøte" /></label>
                        <label>Beskrivelse<textarea id="mspModalDesc" rows="3" placeholder="Hensikt, deltakere, …">${m.description || ''}</textarea></label>
                        <div style="display:flex; gap:8px;">
                            <label style="flex:1;">Standard type
                                <select id="mspModalType">
                                    <option value="">(møte)</option>
                                    ${types.map(t => html`<option value="${t.typeId || t.key}" ${(t.typeId || t.key) === m.defaultType ? 'selected' : ''}>${(t.icon || '') + ' ' + (t.name || t.label || '')}</option>`)}
                                </select>
                            </label>
                            <label style="flex:1;">Standard varighet (min)
                                <input type="number" id="mspModalDuration" value="${m.defaultDurationMins || 60}" min="5" step="5" />
                            </label>
                        </div>
                        <details class="mp-adv">
                            <summary>Flere standardverdier (deltakere, sted)</summary>
                            <div class="modal-form">
                                <label>Standard deltakere<person-multi-picker id="mspModalAttendees"></person-multi-picker></label>
                                <label>Standard sted<pick-place id="mspModalPlace" placeholder="Velg eller opprett sted…"></pick-place></label>
                            </div>
                        </details>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn" type="button" data-act="cancel">Avbryt</button>
                        <button class="modal-btn primary" type="button" data-act="save-series">💾 Lagre</button>
                    </div>
                </div>
            </div>
        `;
    }

    _renderOccurrenceModal() {
        const types = this._state.types || [];
        return html`
            <div class="${this._setupSeriesId ? 'mp-setup' : 'modal open'}">
                <div class="modal-card">
                    <div class="modal-head">
                        <h3>▶️ Ny møteforekomst</h3>
                        <button class="modal-close" type="button" aria-label="Lukk">✕</button>
                    </div>
                    <div class="modal-form">
                        <pick-date-time-span data-span></pick-date-time-span>
                        <details class="mp-adv">
                            <summary>Avvik fra standard (valgfritt)</summary>
                            <div class="modal-form">
                                <label>Tittel (tom = bruk seriens tittel)<input type="text" id="mspOccTitle" placeholder="…" /></label>
                                <label>Type
                                    <select id="mspOccType">
                                        <option value="">(bruk standard)</option>
                                        ${types.map(t => html`<option value="${t.typeId || t.key}">${(t.icon || '') + ' ' + (t.name || t.label || '')}</option>`)}
                                    </select>
                                </label>
                                <label>Deltakere (tom = bruk standard)<person-multi-picker id="mspOccAttendees"></person-multi-picker></label>
                                <label>Sted (tom = bruk standard)<pick-place id="mspOccPlace" placeholder="Velg eller opprett sted…"></pick-place></label>
                            </div>
                        </details>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn" type="button" data-act="cancel">Avbryt</button>
                        <button class="modal-btn primary" type="button" data-act="save-occ">▶️ Start</button>
                    </div>
                </div>
            </div>
        `;
    }

    render(data = {}) {
        if (!this.service) return this.renderNoService();
        if (data._loading) return html`<div class="mp-loading">Laster…</div>`;
        if (!Array.isArray(data.series)) return html`<div class="mp-error">Kunne ikke laste møteserier</div>`;

        this._state = {
            series: data.series, occurrences: data.occurrences || [],
            tasks: data.tasks || [], people: data.people || [], types: data.types || [],
        };
        if (this._setupSeriesId) {
            if (!data.series.some(s => s.id === this._setupSeriesId)) return html`<div class="mp-error">Fant ikke møteserien</div>`;
            return this._renderOccurrenceModal();
        }
        const series = data.series;
        const byStatus = { active: [], archived: [] };
        series.forEach(s => { (byStatus[s.status] || byStatus.active).push(s); });

        if (!this._selectedId || !series.find(s => s.id === this._selectedId)) {
            this._selectedId = (byStatus.active[0] || series[0] || {}).id || null;
        }
        const selected = series.find(s => s.id === this._selectedId);

        const masterList = series.length === 0
            ? html`<p class="mp-empty" style="padding:14px;">Ingen møteserier ennå.</p>`
            : STATUS_ORDER.map(st => {
                const items = byStatus[st];
                if (!items.length) return '';
                return html`
                    <section class="mp-section">
                        <h2 class="mp-section-h">${STATUS_ICON[st]} ${STATUS_LABEL[st]} <span class="c">${items.length}</span></h2>
                        ${items.map(s => this._renderItem(s))}
                    </section>
                `;
            });

        return html`
            <div class="mp">
                <div class="mp-head">
                    <h1>📚 Møteserier</h1>
                    <button class="mp-btn-primary" id="mpNewBtn" type="button">➕ Ny møteserie</button>
                </div>
                <p class="mp-hint">Faste møter med saksliste som følger med fra gang til gang, oppfølgingsoppgaver og beslutningslogg.</p>
                <div class="mp-body">
                    <nav class="mp-master">${masterList}</nav>
                    <div class="mp-detail-pane">
                        ${selected ? this._renderDetailPane(selected) : html`<p class="mp-dp-empty">Velg en møteserie fra listen, eller opprett en ny.</p>`}
                    </div>
                </div>
                ${!selected ? this._renderModal() : ''}
            </div>
        `;
    }
}

if (!customElements.get('meeting-series-page')) customElements.define('meeting-series-page', MeetingSeriesPage);
