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
import './time-picker.js';

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

class MeetingCreate extends WNElement {
    static get domain() { return 'meetings'; }
    static get observedAttributes() {
        return ['meetings_service', 'settings_service', 'context', 'date', 'start', 'end', 'type'];
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._loadTypes();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (name === 'settings_service' || name === 'context') this._loadTypes();
    }

    async _loadTypes() {
        if (Array.isArray(this._typesOverride) && this._typesOverride.length) return;
        const svc = this.serviceFor('settings');
        if (!svc || typeof svc.getMeetingTypes !== 'function') return;
        try {
            const ctx = this.getAttribute('context') || '';
            const list = await svc.getMeetingTypes(ctx);
            this._types = (Array.isArray(list) ? list : []).map(t => ({
                typeId: String(t.typeId || t.key || ''),
                icon: t.icon || '',
                name: t.name || t.label || t.typeId || t.key || '',
            })).filter(t => t.typeId);
            if (this.isConnected) this.requestRender();
        } catch (_) { /* ignore — render shows fallback option */ }
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
        if (arr.length) this._types = arr;
        if (this.isConnected) this.requestRender();
    }

    render() {
        if (!this.service) return this.renderNoService();
        const types = this._types || [];
        const presetType = this.getAttribute('type') || (types[0] && types[0].typeId) || 'meeting';
        const presetDate = this.getAttribute('date') || todayIso();
        const presetStart = this.getAttribute('start') || '';
        const presetEnd = this.getAttribute('end') || '';
        const uid = this._uid || (this._uid = 'mc' + Math.random().toString(36).slice(2, 8));
        const id = (k) => `${uid}-${k}`;

        const tmpl = html`
            <form data-form>
                <label for="${id('title')}">Tittel
                    <input type="text" id="${id('title')}" name="title" required placeholder="Hva handler møtet om?" autofocus>
                </label>
                <div class="row">
                    <label for="${id('type')}">Type
                        <select id="${id('type')}" name="type">
                            ${types.length
                                ? types.map(t => html`<option value="${t.typeId}" ${t.typeId === presetType ? 'selected' : ''}>${(t.icon || '') + ' ' + t.name}</option>`)
                                : html`<option value="meeting">Møte</option>`}
                        </select>
                    </label>
                    <label for="${id('date')}">Dato
                        <input type="date" id="${id('date')}" name="date" required value="${escapeHtml(presetDate)}">
                    </label>
                </div>
                <div class="row">
                    <label for="${id('start')}">Fra<time-picker id="${id('start')}" name="start" step="5" value="${escapeHtml(presetStart)}"></time-picker></label>
                    <label for="${id('end')}">Til<time-picker id="${id('end')}" name="end" step="5" value="${escapeHtml(presetEnd)}"></time-picker></label>
                </div>
                <label for="${id('attendees')}">Deltakere <span class="hint">(kommaseparert eller @navn)</span>
                    <input type="text" id="${id('attendees')}" name="attendees" placeholder="@kari, @ola">
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
        // Inject the safe HTML the WNElement way
        // (template returned; wiring happens after innerHTML set)
        setTimeout(() => this._wire(), 0);
        return tmpl;
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
        const fd = new FormData(form);
        const attRaw = (fd.get('attendees') || '').toString().trim();
        const attendees = attRaw
            ? attRaw.split(/[,\s]+/).map(s => s.replace(/^@/, '').trim()).filter(Boolean)
            : [];
        const data = {
            title: (fd.get('title') || '').toString().trim(),
            type: (fd.get('type') || 'meeting').toString(),
            date: (fd.get('date') || '').toString(),
            start: (fd.get('start') || '').toString(),
            end: (fd.get('end') || '').toString(),
            attendees,
            location: (fd.get('location') || '').toString().trim(),
            notes: (fd.get('notes') || '').toString(),
        };
        if (!data.title) { this._showError('Tittel er påkrevd'); return; }
        if (!data.date)  { this._showError('Dato er påkrevd'); return; }

        const submitBtn = form.querySelector('[data-submit]');
        if (submitBtn) submitBtn.disabled = true;
        try {
            const r = await this.service.create(data);
            const meeting = (r && r.meeting) || r;
            this.dispatchEvent(new CustomEvent('meeting-create:created', {
                bubbles: true, composed: true, detail: { meeting },
            }));
            form.reset();
            // Restore presets that should persist after reset.
            const dateInput = form.querySelector('[name=date]');
            if (dateInput) dateInput.value = this.getAttribute('date') || todayIso();
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
