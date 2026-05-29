/**
 * <meeting-create
 *     meetings_service="week-note-services.MeetingsService"
 *     settings_service="week-note-services.SettingsService">
 *
 * Form component for creating a new meeting.
 *
 * Services:
 *   meetings_service — required; used for `create(data)` to persist the meeting.
 *   settings_service — required to fill the type dropdown; uses
 *                      `getMeetingTypes(contextId)` against the active context.
 *
 * Optional attributes (preset values for the form):
 *   date  — YYYY-MM-DD (defaults to today)
 *   start — HH:MM
 *   end   — HH:MM
 *   type  — meeting-type key (selected on render)
 *
 * Events:
 *   meeting-create:created  detail: { meeting }   — after successful POST
 *   meeting-create:cancel                          — when the cancel button is clicked
 *   meeting-create:error    detail: { error }      — on submit failure
 */
import { WNElement, html, escapeHtml } from './_shared.js';
import '/components/pick-date-time-span.js';
import '/components/person-multi-picker.js';

const STYLES = `
    :host { display: block; color: var(--text-strong); font: inherit; }
    form { display: flex; flex-direction: column; gap: 10px; }
    label { display: block; font-size: 0.78em; color: var(--text-muted-warm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    input[type=text], input[type=date], input[type=time], select, textarea {
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
    .err { color: var(--danger, #c53030); font-size: 0.85em; margin-top: 4px; min-height: 1em; }
    .hint { color: var(--text-subtle); font-size: 0.78em; font-weight: 400; text-transform: none; letter-spacing: normal; }
`;

function todayIso() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function nowRounded5() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const m = Math.ceil(d.getMinutes() / 5) * 5;
    const h = m >= 60 ? d.getHours() + 1 : d.getHours();
    return pad(h % 24) + ':' + pad(m % 60);
}

function addMinutes(time, mins) {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + mins;
    const pad = n => String(n).padStart(2, '0');
    return pad(Math.floor(total / 60) % 24) + ':' + pad(total % 60);
}

class MeetingCreate extends WNElement {
    static get domain() { return 'meetings'; }
    static get observedAttributes() {
        return ['meetings_service', 'settings_service', 'context', 'date', 'start', 'end', 'type'];
    }

    css() { return STYLES; }

    attributeChangedCallback(name, oldVal, newVal) {
        if (name === 'settings_service' || name === 'context') {
            this.invalidateAwait('types');
        }
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    async _fetchTypes() {
        if (Array.isArray(this._typesOverride) && this._typesOverride.length) {
            return this._typesOverride;
        }
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
        // Fall back to the active-context endpoint via meetings_service.listTypes().
        if (this.service && typeof this.service.listTypes === 'function') {
            try { return normalize(await this.service.listTypes()); }
            catch (_) {}
        }
        return [];
    }

    get types() { return Array.isArray(this._types) ? this._types.slice() : []; }
    set types(v) {
        const arr = Array.isArray(v)
            ? v.filter(t => t && (t.typeId || t.key)).map(t => ({
                typeId: String(t.typeId || t.key),
                icon: t.icon || '',
                name: t.name || t.label || t.typeId || t.key,
            }))
            : [];
        this._typesOverride = arr.length ? arr : null;
        this.invalidateAwait('types');
        if (this.isConnected) this.requestRender();
    }

    loadData() {
        return { types: () => this._fetchTypes() };
    }

    render({ types = [] } = {}) {
        if (!this.service) return this.renderNoService();
        const presetType = this.getAttribute('type') || (types[0] && types[0].typeId) || 'meeting';
        const presetDate = this.getAttribute('date') || todayIso();
        const presetStart = this.getAttribute('start') || nowRounded5();
        const presetEnd = this.getAttribute('end') || addMinutes(presetStart, 60);
        const spanStart = `${presetDate} ${presetStart}`;
        const spanEnd = `${presetDate} ${presetEnd}`;
        const uid = this._uid || (this._uid = 'mc' + Math.random().toString(36).slice(2, 8));
        const id = (k) => `${uid}-${k}`;

        const tmpl = html`
            <form data-form>
                <label for="${id('title')}">Tittel
                    <input type="text" id="${id('title')}" name="title" required placeholder="Hva handler møtet om?" autofocus>
                </label>
                <label for="${id('type')}">Type
                    <select id="${id('type')}" name="type">
                        ${types.length
                            ? types.map(t => html`<option value="${t.typeId}" ${t.typeId === presetType ? 'selected' : ''}>${(t.icon || '') + ' ' + t.name}</option>`)
                            : html`<option value="meeting">Møte</option>`}
                    </select>
                </label>
                <pick-date-time-span data-span start="${escapeHtml(spanStart)}" end="${escapeHtml(spanEnd)}"></pick-date-time-span>
                <label>Deltakere
                    <person-multi-picker data-el="attendees"></person-multi-picker>
                </label>
                <label for="${id('location')}">Sted <span class="hint">(fritekst)</span>
                    <input type="text" id="${id('location')}" name="location" placeholder="Møterom, Teams, …">
                </label>
                <label for="${id('notes')}">Notater<textarea id="${id('notes')}" name="notes" rows="4" placeholder="Agenda, lenker, …"></textarea></label>
                <div class="err" data-err></div>
                <div class="actions">
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
            this.dispatchEvent(new CustomEvent('meeting-create:cancel', { bubbles: true, composed: true }));
        });
    }

    _showError(msg) {
        const err = this.shadowRoot && this.shadowRoot.querySelector('[data-err]');
        if (err) err.textContent = msg || '';
    }

    async _submit(form) {
        this._showError('');
        const sr = this.shadowRoot;
        const span = sr && sr.querySelector('[data-span]');
        const startVal = span ? span.start : '';
        const endVal = span ? span.end : '';

        // Parse "YYYY-MM-DD HH:MM" into date + time
        const parseDt = (v) => {
            const m = (v || '').match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
            return m ? { date: m[1], time: m[2] } : { date: '', time: '' };
        };
        const startParts = parseDt(startVal);
        const endParts = parseDt(endVal);

        const fd = new FormData(form);
        const attPicker = sr.querySelector('[data-el="attendees"]');
        const attendees = attPicker ? attPicker.value : [];
        const data = {
            title: (fd.get('title') || '').toString().trim(),
            type: (fd.get('type') || 'meeting').toString(),
            date: startParts.date,
            start: startParts.time,
            end: endParts.time,
            attendees,
            location: (fd.get('location') || '').toString().trim(),
            notes: (fd.get('notes') || '').toString(),
        };
        // Multi-day meeting: include endDate when it differs from start date
        if (endParts.date && endParts.date !== startParts.date) {
            data.endDate = endParts.date;
        }
        if (!data.title) { this._showError('Tittel er påkrevd'); return; }
        if (!data.date)  { this._showError('Dato er påkrevd'); return; }
        if (startVal && endVal && endVal <= startVal) {
            this._showError('Sluttid må være etter starttid');
            return;
        }

        const submitBtn = form.querySelector('[data-submit]');
        if (submitBtn) submitBtn.disabled = true;
        try {
            const r = await this.service.create(data);
            const meeting = (r && r.meeting) || r;
            this.dispatchEvent(new CustomEvent('meeting-create:created', {
                bubbles: true, composed: true, detail: { meeting },
            }));
            form.reset();
            // Restore picker presets after reset.
            if (span) {
                const presetDate = this.getAttribute('date') || todayIso();
                const presetStart = this.getAttribute('start') || nowRounded5();
                const presetEnd = this.getAttribute('end') || addMinutes(presetStart, 60);
                span.start = `${presetDate} ${presetStart}`;
                span.end = `${presetDate} ${presetEnd}`;
            }
        } catch (e) {
            const msg = (e && e.message) || 'Kunne ikke lagre møte';
            this._showError(msg);
            this.dispatchEvent(new CustomEvent('meeting-create:error', {
                bubbles: true, composed: true, detail: { error: msg },
            }));
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }
}

if (!customElements.get('meeting-create')) customElements.define('meeting-create', MeetingCreate);
