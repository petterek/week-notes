/**
 * <meeting-edit
 *     meetings_service="week-note-services.MeetingsService"
 *     settings_service="week-note-services.SettingsService"
 *     context="...">
 *
 * Form component for editing or deleting an existing meeting.
 *
 * Use `setMeeting(meeting)` to populate the form. Start and end use the
 * canonical <date-time-picker> in datetime mode (popup-trigger pattern,
 * mirrors task-edit-modal). The end-date is kept locked to the start-date.
 *
 * Events:
 *   meeting-edit:saved    detail: { meeting }   — after successful PUT
 *   meeting-edit:cancel                          — when the cancel button is clicked
 *   meeting-edit:deleted  detail: { id }         — after successful DELETE
 *   meeting-edit:error    detail: { error }      — on submit/delete failure
 */
import { WNElement, html, escapeHtml } from './_shared.js';
import '/components/date-time-picker.js';

const STYLES = `
    :host { display: block; color: var(--text-strong); font: inherit; }
    form { display: flex; flex-direction: column; gap: 10px; }
    label { display: block; font-size: 0.78em; color: var(--text-muted-warm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    input[type=text], select, textarea {
        width: 100%; box-sizing: border-box; padding: 8px 10px;
        border: 1px solid var(--border); border-radius: 5px;
        font-family: inherit; font-size: 0.95em; margin-top: 5px;
        background: var(--bg); color: var(--text-strong);
        text-transform: none; letter-spacing: normal;
        transition: border-color 0.12s, box-shadow 0.12s;
    }
    input:focus, select:focus, textarea:focus {
        outline: none; border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
        background: var(--surface);
    }
    textarea { font-family: ui-monospace, monospace; font-size: 0.88em; resize: vertical; min-height: 80px; }
    .row { display: flex; gap: 10px; }
    .row > label { flex: 1; }
    .dt-trigger {
        margin-top: 5px; width: 100%;
        padding: 8px 10px; border: 1px solid var(--border); border-radius: 5px;
        background: var(--bg); color: var(--text-strong);
        font: inherit; font-size: 0.95em; text-align: left;
        cursor: pointer; text-transform: none; letter-spacing: normal;
    }
    .dt-trigger:hover { border-color: var(--accent); }
    .dt-trigger.empty { color: var(--text-muted); }
    .actions { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
    .actions .spacer { flex: 1; }
    button {
        padding: 7px 14px; border-radius: 5px; border: 1px solid var(--border);
        background: var(--surface); color: var(--text-strong);
        cursor: pointer; font: inherit; font-size: 0.9em;
    }
    button:hover { background: var(--surface-alt); }
    button[type=submit] { background: var(--accent); color: var(--text-on-accent); border-color: var(--accent); }
    button[type=submit]:hover { background: var(--accent-strong); }
    button[type=submit]:disabled { opacity: 0.6; cursor: progress; }
    button.danger { background: transparent; color: var(--danger, #c53030); border-color: var(--danger, #c53030); }
    button.danger:hover { background: var(--danger, #c53030); color: var(--text-on-accent, #fff); }
    .err { color: var(--danger, #c53030); font-size: 0.85em; margin-top: 4px; min-height: 1em; }
    .hint { color: var(--text-subtle); font-size: 0.78em; font-weight: 400; text-transform: none; letter-spacing: normal; }
`;

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDateTime(date, time) {
    if (!date) return '';
    return time ? `${date} ${time}` : date;
}

function parseDateTime(v) {
    if (!v) return { date: '', time: '' };
    const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(String(v));
    if (!m) return { date: '', time: '' };
    return { date: m[1], time: m[2] || '' };
}

class MeetingEdit extends WNElement {
    static get domain() { return 'meetings'; }
    static get observedAttributes() {
        return ['meetings_service', 'settings_service', 'context'];
    }

    css() { return STYLES; }

    disconnectedCallback() {
        if (super.disconnectedCallback) super.disconnectedCallback();
        this._closePicker();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (name === 'settings_service' || name === 'context') {
            this.invalidateAwait('types');
        }
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    async _fetchTypes() {
        const normalize = list => (Array.isArray(list) ? list : []).map(t => ({
            typeId: String(t.typeId || t.key || ''),
            icon: t.icon || '',
            name: t.name || t.label || t.typeId || t.key || '',
        })).filter(t => t.typeId);
        const ctx = this.getAttribute('context') || '';
        if (ctx) {
            const svc = this.serviceFor('settings');
            if (svc && typeof svc.getMeetingTypes === 'function') {
                try { return normalize(await svc.getMeetingTypes(ctx)); }
                catch (_) {}
            }
        }
        if (this.service && typeof this.service.listTypes === 'function') {
            try { return normalize(await this.service.listTypes()); }
            catch (_) {}
        }
        return [];
    }

    /**
     * Populate the form with an existing meeting record.
     * @param {{id, title, type, date, start, end, attendees, location, notes}} m
     */
    setMeeting(m) {
        this._meeting = m && typeof m === 'object' ? { ...m } : null;
        this._startDt = this._meeting ? fmtDateTime(this._meeting.date, this._meeting.start) : '';
        this._endDt   = this._meeting ? fmtDateTime(this._meeting.date, this._meeting.end)   : '';
        if (this.isConnected) this.requestRender();
    }

    loadData() {
        return { types: () => this._fetchTypes() };
    }

    render({ types = [] } = {}) {
        if (!this.service) return this.renderNoService();
        const m = this._meeting || {};
        const presetType = m.type || (types[0] && types[0].typeId) || 'meeting';
        const uid = this._uid || (this._uid = 'me' + Math.random().toString(36).slice(2, 8));
        const id = (k) => `${uid}-${k}`;

        const startLabel = this._startDt || 'Velg start…';
        const endLabel   = this._endDt   || 'Velg slutt…';
        const startCls = this._startDt ? 'dt-trigger' : 'dt-trigger empty';
        const endCls   = this._endDt   ? 'dt-trigger' : 'dt-trigger empty';

        const attRaw = Array.isArray(m.attendees) ? m.attendees.map(a => '@' + a).join(', ') : '';

        const tmpl = html`
            <form data-form>
                <label for="${id('title')}">Tittel
                    <input type="text" id="${id('title')}" name="title" required value="${escapeHtml(m.title || '')}" placeholder="Hva handler møtet om?" autofocus>
                </label>
                <label for="${id('type')}">Type
                    <select id="${id('type')}" name="type">
                        ${types.length
                            ? types.map(t => html`<option value="${t.typeId}" ${t.typeId === presetType ? 'selected' : ''}>${(t.icon || '') + ' ' + t.name}</option>`)
                            : html`<option value="${escapeHtml(presetType)}">${escapeHtml(presetType)}</option>`}
                    </select>
                </label>
                <div class="row">
                    <label>Fra
                        <button type="button" class="${startCls}" data-dt-trigger="start">${escapeHtml(startLabel)}</button>
                    </label>
                    <label>Til
                        <button type="button" class="${endCls}" data-dt-trigger="end">${escapeHtml(endLabel)}</button>
                    </label>
                </div>
                <label for="${id('attendees')}">Deltakere <span class="hint">(kommaseparert eller @navn)</span>
                    <input type="text" id="${id('attendees')}" name="attendees" value="${escapeHtml(attRaw)}" placeholder="@kari, @ola">
                </label>
                <label for="${id('location')}">Sted <span class="hint">(fritekst)</span>
                    <input type="text" id="${id('location')}" name="location" value="${escapeHtml(m.location || '')}" placeholder="Møterom, Teams, …">
                </label>
                <label for="${id('notes')}">Notater<textarea id="${id('notes')}" name="notes" rows="4" placeholder="Agenda, lenker, …">${escapeHtml(m.notes || '')}</textarea></label>
                <div class="err" data-err></div>
                <div class="actions">
                    <button type="button" class="danger" data-delete>🗑 Slett</button>
                    <span class="spacer"></span>
                    <button type="button" data-cancel>Avbryt</button>
                    <button type="submit" data-submit>💾 Lagre</button>
                </div>
            </form>
        `;
        return tmpl;
    }

    afterRender(data) {
        if (!data) return;
        this._wire();
    }

    _wire() {
        if (!this.shadowRoot) return;
        const form = this.shadowRoot.querySelector('[data-form]');
        if (!form || form._wired) return;
        form._wired = true;
        form.addEventListener('submit', (ev) => { ev.preventDefault(); this._submit(form); });
        const cancel = this.shadowRoot.querySelector('[data-cancel]');
        if (cancel) cancel.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('meeting-edit:cancel', { bubbles: true, composed: true }));
        });
        const del = this.shadowRoot.querySelector('[data-delete]');
        if (del) del.addEventListener('click', () => this._delete());
        this.shadowRoot.querySelectorAll('[data-dt-trigger]').forEach(btn => {
            btn.addEventListener('click', () => this._openPicker(btn.dataset.dtTrigger, btn));
        });
    }

    _showError(msg) {
        const err = this.shadowRoot && this.shadowRoot.querySelector('[data-err]');
        if (err) err.textContent = msg || '';
    }

    _openPicker(which, trig) {
        this._closePicker();
        const picker = document.createElement('date-time-picker');
        picker.setAttribute('mode', 'datetime');
        const cur = which === 'start' ? this._startDt : this._endDt;
        if (cur) picker.setAttribute('value', cur);
        picker.style.cssText = 'position:fixed;z-index:9999;visibility:hidden;left:-9999px;top:0';
        document.body.appendChild(picker);
        this._picker = picker;
        this._pickerWhich = which;

        const place = () => {
            const rect = trig.getBoundingClientRect();
            const w = picker.offsetWidth || 252;
            const h = picker.offsetHeight || 280;
            let left = rect.left;
            let top = rect.bottom + 4;
            if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
            if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 4);
            picker.style.left = left + 'px';
            picker.style.top = top + 'px';
            picker.style.visibility = 'visible';
        };
        requestAnimationFrame(place);

        const onSelected = (e) => {
            const v = (e && e.detail && e.detail.value) || '';
            this._setDateTime(which, v);
            this._closePicker();
        };
        const onCancelled = () => this._closePicker();
        const onOutside = (e) => {
            if (!this._picker) return;
            if (e.target === picker || picker.contains(e.target)) return;
            if (trig.contains && trig.contains(e.target)) return;
            this._closePicker();
        };
        picker.addEventListener('datetime-selected', onSelected);
        picker.addEventListener('datetime-cancelled', onCancelled);
        document.addEventListener('mousedown', onOutside, true);
        this._pickerOutside = onOutside;
    }

    _closePicker() {
        if (this._pickerOutside) {
            document.removeEventListener('mousedown', this._pickerOutside, true);
            this._pickerOutside = null;
        }
        if (this._picker && this._picker.parentNode) {
            this._picker.parentNode.removeChild(this._picker);
        }
        this._picker = null;
        this._pickerWhich = null;
    }

    _setDateTime(which, v) {
        const parts = parseDateTime(v);
        if (!parts.date) return;
        const value = parts.time ? `${parts.date} ${parts.time}` : parts.date;
        if (which === 'start') {
            this._startDt = value;
            // Keep the end on the same date; preserve its time if set.
            const endParts = parseDateTime(this._endDt);
            const endTime = endParts.time || '';
            this._endDt = endTime ? `${parts.date} ${endTime}` : parts.date;
        } else {
            // Lock end-date to start-date if start is set.
            const startParts = parseDateTime(this._startDt);
            const date = startParts.date || parts.date;
            this._endDt = parts.time ? `${date} ${parts.time}` : date;
        }
        // Update just the trigger labels without a full re-render (preserves
        // text input values the user has typed).
        const root = this.shadowRoot;
        if (!root) return;
        const startBtn = root.querySelector('[data-dt-trigger="start"]');
        const endBtn   = root.querySelector('[data-dt-trigger="end"]');
        if (startBtn) {
            startBtn.textContent = this._startDt || 'Velg start…';
            startBtn.className = this._startDt ? 'dt-trigger' : 'dt-trigger empty';
        }
        if (endBtn) {
            endBtn.textContent = this._endDt || 'Velg slutt…';
            endBtn.className = this._endDt ? 'dt-trigger' : 'dt-trigger empty';
        }
    }

    async _submit(form) {
        this._showError('');
        if (!this._meeting || !this._meeting.id) { this._showError('Mangler møte-id'); return; }
        const fd = new FormData(form);
        const startParts = parseDateTime(this._startDt);
        const endParts   = parseDateTime(this._endDt);
        if (!startParts.date) { this._showError('Velg starttid'); return; }
        const attRaw = (fd.get('attendees') || '').toString().trim();
        const attendees = attRaw
            ? attRaw.split(/[,\s]+/).map(s => s.replace(/^@/, '').trim()).filter(Boolean)
            : [];
        const data = {
            title: (fd.get('title') || '').toString().trim(),
            type: (fd.get('type') || 'meeting').toString(),
            date: startParts.date,
            start: startParts.time || '',
            end: endParts.time || '',
            attendees,
            location: (fd.get('location') || '').toString().trim(),
            notes: (fd.get('notes') || '').toString(),
        };
        if (!data.title) { this._showError('Tittel er påkrevd'); return; }

        const submitBtn = form.querySelector('[data-submit]');
        if (submitBtn) submitBtn.disabled = true;
        try {
            const r = await this.service.update(this._meeting.id, data);
            const meeting = (r && r.meeting) || r;
            this.dispatchEvent(new CustomEvent('meeting-edit:saved', {
                bubbles: true, composed: true, detail: { meeting },
            }));
        } catch (e) {
            const msg = (e && e.message) || 'Kunne ikke lagre møte';
            this._showError(msg);
            this.dispatchEvent(new CustomEvent('meeting-edit:error', {
                bubbles: true, composed: true, detail: { error: msg },
            }));
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async _delete() {
        if (!this._meeting || !this._meeting.id) return;
        const title = this._meeting.title || 'møtet';
        if (!confirm(`Slette ${title}?`)) return;
        try {
            await this.service.remove(this._meeting.id);
            this.dispatchEvent(new CustomEvent('meeting-edit:deleted', {
                bubbles: true, composed: true, detail: { id: this._meeting.id },
            }));
        } catch (e) {
            const msg = (e && e.message) || 'Kunne ikke slette møte';
            this._showError(msg);
            this.dispatchEvent(new CustomEvent('meeting-edit:error', {
                bubbles: true, composed: true, detail: { error: msg },
            }));
        }
    }
}

if (!customElements.get('meeting-edit')) customElements.define('meeting-edit', MeetingEdit);
