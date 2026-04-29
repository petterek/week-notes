/**
 * <person-card>
 *
 * Dumb presentation card for a single person. Receives all data via
 * `setData(d)`; never loads anything itself. Used by <people-page> on the
 * Personer tab.
 *
 *   const card = document.createElement('person-card');
 *   card.setData({
 *       person:         { id, key, firstName, lastName, name, title,
 *                         email, phone, notes, inactive, primaryCompanyKey,
 *                         extraCompanyKeys },
 *       primaryCompany: { id, key, name } | null,
 *       extraCompanies: [{ id, key, name }],
 *       tasks:          [{ id, text, done }],
 *       meetings:       [{ id, title, date, start, week }],
 *       results:        [{ id, text, week, created? }],
 *       people:         [...],   // for @mention link resolution
 *       companies:      [...],   // for @mention link resolution
 *       open:           false,
 *   });
 *
 * `setData` may be called before or after the element is connected.
 *
 * Events (cancelable, bubbling, composed):
 *   - 'toggle'         { key }            — header click. Host owns expanded
 *                                           state and re-renders.
 *   - 'edit'           { id, key }        — pencil button.
 *   - 'select-company' { key }            — company-pill click.
 *   - 'select-meeting' { id, week }       — meeting ref click.
 *   - 'select-result'  { id, week }       — result ref click.
 *   - 'select-task'    { id }             — task ref click.
 *   - 'hover-company'  { key, entering }
 *   - 'hover-meeting'  { id, week, entering }
 *   - 'hover-result'   { id, week, entering }
 *   - 'hover-task'     { id, entering }
 *
 * Refs are non-link <span>s — the card does not navigate.
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions } from '../../components/_shared.js';

const STYLES = `
    :host { display: block; }
    .person-card { margin-bottom: 8px; background: var(--surface); border-radius: 8px; border: 1px solid var(--border-soft); overflow: hidden; }
    .person-card.inactive { opacity: 0.65; }
    .person-header { padding: 8px 14px; background: var(--surface-head); display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
    .person-chev { font-size: 0.7em; color: var(--text-subtle); transition: transform 0.15s; display: inline-block; width: 10px; }
    .person-card.open .person-chev { transform: rotate(90deg); }
    .person-icon { font-size: 1.1em; }
    .person-name-wrap { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .person-name { font-weight: 600; color: var(--accent); }
    .person-handle { font-size: 0.8em; color: var(--text-subtle); }
    .person-title { font-size: 0.82em; color: var(--text-muted); }
    .person-badge { font-size: 0.72em; padding: 1px 6px; border-radius: 8px; background: var(--surface-alt); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .person-company-pill { font-size: 0.8em; padding: 2px 8px; background: var(--surface-alt); color: var(--text-muted); border-radius: 10px; }
    .person-refs { font-size: 0.8em; color: var(--text-subtle); white-space: nowrap; }
    .person-edit-btn { background: none; border: none; cursor: pointer; font-size: 1em; padding: 2px 6px; border-radius: 4px; color: var(--text-muted); }
    .person-edit-btn:hover { background: var(--border-soft); }
    .person-details { display: none; }
    .person-card.open .person-details { display: block; }
    .person-contact { padding: 8px 18px; background: var(--surface-alt); border-top: 1px solid var(--border-soft); display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.85em; color: var(--text-muted); }
    .person-contact a { color: var(--accent); text-decoration: none; }
    .person-contact a:hover { text-decoration: underline; }
    .person-companies { padding: 8px 18px; background: var(--surface-head); border-top: 1px solid var(--border-soft); display: flex; gap: 8px; flex-wrap: wrap; }
    .company-chip { font-size: 0.85em; padding: 3px 10px; background: var(--surface-alt); color: var(--text-muted); border-radius: 12px; border: 1px solid transparent; cursor: pointer; }
    .company-chip:hover { border-color: var(--accent); color: var(--accent); }
    .company-chip.primary { background: var(--accent); color: var(--surface); }
    .company-chip.primary:hover { border-color: var(--surface); }
    .chip-tag { font-size: 0.7em; opacity: 0.7; margin-left: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .person-notes { padding: 8px 18px; background: var(--surface-head); border-top: 1px solid var(--border-soft); font-size: 0.85em; color: var(--text-muted); font-style: italic; white-space: pre-wrap; }
    .person-section { padding: 10px 18px; border-top: 1px solid var(--border-faint); }
    .person-section-h { font-size: 0.75em; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    .person-section-h .c { display: inline-block; min-width: 18px; padding: 0 6px; margin-left: 4px; background: var(--surface-alt); color: var(--text-muted); border-radius: 9px; font-size: 0.95em; text-align: center; }
    .person-ref { padding: 3px 0; font-size: 0.88em; }
    .person-ref-link { color: var(--text); cursor: pointer; }
    .person-ref-link:hover { text-decoration: underline; color: var(--accent); }
    .person-ref-link.task-done { text-decoration: line-through; color: var(--text-subtle); }
    .person-ref .ref-when { font-size: 0.85em; color: var(--text-subtle); margin-left: 6px; }
    .person-empty { padding: 10px 18px; border-top: 1px solid var(--border-faint); font-size: 0.88em; color: var(--text-subtle); font-style: italic; }
`;

export class PersonCard extends WNElement {
    static get domain() { return 'people'; }

    constructor() {
        super();
        this._data = null;
        this._wired = false;
    }

    setData(d) {
        this._data = d || null;
        this.requestRender();
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._wire();
    }

    requestRender() {
        super.requestRender();
        this._wire();
    }

    _wire() {
        if (!this.shadowRoot || this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
        this.shadowRoot.addEventListener('pointerover', (e) => this._onHover(e, true));
        this.shadowRoot.addEventListener('pointerout',  (e) => this._onHover(e, false));
    }

    _refDetail(el) {
        const kind = el.dataset.ref;
        const detail = { kind };
        if (kind === 'company') detail.key = el.dataset.id || '';
        else {
            detail.id = el.dataset.id || '';
            if (el.dataset.week !== undefined) detail.week = el.dataset.week || '';
        }
        return { kind, detail };
    }

    _onHover(e, entering) {
        if (!this._data) return;
        const ref = e.target.closest('[data-ref]');
        if (!ref) return;
        const related = e.relatedTarget;
        if (related && ref.contains(related)) return;
        const { kind, detail } = this._refDetail(ref);
        detail.entering = entering;
        detail.x = e.clientX;
        detail.y = e.clientY;
        this.dispatchEvent(new CustomEvent('hover-' + kind, {
            detail, bubbles: true, composed: true, cancelable: true,
        }));
    }

    _onClick(e) {
        if (!this._data) return;
        const p = this._data.person || {};
        const key = this._personKey(p);
        const editBtn = e.target.closest('[data-act="edit"]');
        if (editBtn) {
            e.stopPropagation();
            this.dispatchEvent(new CustomEvent('edit', {
                detail: { id: p.id || '', key },
                bubbles: true, composed: true, cancelable: true,
            }));
            return;
        }
        const ref = e.target.closest('[data-ref]');
        if (ref) {
            const { kind, detail } = this._refDetail(ref);
            this.dispatchEvent(new CustomEvent('select-' + kind, {
                detail, bubbles: true, composed: true, cancelable: true,
            }));
            return;
        }
        if (e.target.closest('.person-header')) {
            this.dispatchEvent(new CustomEvent('toggle', {
                detail: { key },
                bubbles: true, composed: true, cancelable: true,
            }));
        }
    }

    _link(rawText) {
        const people = (this._data && this._data.people) || [];
        const companies = (this._data && this._data.companies) || [];
        return unsafeHTML(linkMentions(escapeHtml(rawText || ''), people, companies));
    }

    _personKey(p) { return (p.key || (p.name || '').toLowerCase()).toLowerCase(); }
    _personDisplay(p) {
        return p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : (p.name || p.key || '');
    }

    render() {
        if (!this._data || !this._data.person) {
            return html`<div class="person-empty">Ingen data.</div>`;
        }
        const d = this._data;
        const p = d.person;
        const k = this._personKey(p);
        const tasks = d.tasks || [];
        const meetings = d.meetings || [];
        const results = d.results || [];
        const refTotal = tasks.length + meetings.length + results.length;
        const open = !!d.open;
        const inactive = !!p.inactive;
        const display = this._personDisplay(p);
        const primaryCo = d.primaryCompany || null;
        const extraCos = d.extraCompanies || [];

        const sortedMeetings = meetings.slice().sort((a, b) =>
            (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
        const sortedResults = results.slice().sort((a, b) =>
            String(b.created || b.week || '').localeCompare(String(a.created || a.week || '')));

        return html`
            <div class="person-card ${open ? 'open' : ''} ${inactive ? 'inactive' : ''}" data-card="person" data-key="${k}" id="p-${k}">
                <div class="person-header">
                    <span class="person-chev">▶</span>
                    <span class="person-icon">${inactive ? '👻' : '👤'}</span>
                    <div class="person-name-wrap">
                        <span class="person-name">${display}</span>
                        <span class="person-handle">@${p.key || (p.name || '')}</span>
                        ${inactive ? html`<span class="person-badge">inaktiv</span>` : ''}
                        ${p.title ? html`<span class="person-title">· ${p.title}</span>` : ''}
                        ${primaryCo ? html`<span class="person-company-pill" data-ref="company" data-id="${primaryCo.key}" title="Hovedselskap">🏢 ${primaryCo.name}</span>` : ''}
                    </div>
                    <span class="person-refs">${refTotal} ref.</span>
                    <button class="person-edit-btn" data-act="edit" title="Rediger">✏️</button>
                </div>
                <div class="person-details">
                    ${(p.email || p.phone) ? html`
                        <div class="person-contact">
                            ${p.email ? html`<span>📧 <a href="mailto:${p.email}">${p.email}</a></span>` : ''}
                            ${p.phone ? html`<span>📞 ${p.phone}</span>` : ''}
                        </div>` : ''}
                    ${(primaryCo || extraCos.length) ? html`
                        <div class="person-companies">
                            ${primaryCo ? html`<span class="company-chip primary" data-ref="company" data-id="${primaryCo.key}" title="Hovedselskap">🏢 ${primaryCo.name} <span class="chip-tag">hoved</span></span>` : ''}
                            ${extraCos.map(c => html`<span class="company-chip" data-ref="company" data-id="${c.key}">🏢 ${c.name}</span>`)}
                        </div>` : ''}
                    ${p.notes ? html`<div class="person-notes">${p.notes}</div>` : ''}
                    ${tasks.length ? html`
                        <div class="person-section">
                            <div class="person-section-h">Oppgaver <span class="c">${tasks.length}</span></div>
                            ${tasks.map(t => html`
                                <div class="person-ref">
                                    <span class="person-ref-link ${t.done ? 'task-done' : ''}" data-ref="task" data-id="${t.id || ''}">${t.done ? '✅' : '☐'} ${this._link(t.text || '')}</span>
                                </div>`)}
                        </div>` : ''}
                    ${meetings.length ? html`
                        <div class="person-section">
                            <div class="person-section-h">Møter <span class="c">${meetings.length}</span></div>
                            ${sortedMeetings.map(m => html`
                                <div class="person-ref">
                                    <span class="person-ref-link" data-ref="meeting" data-id="${m.id || ''}" data-week="${m.week || ''}">📅 ${this._link(m.title || '')} <span class="ref-when">${m.date || ''}${m.start ? ' ' + m.start : ''}</span></span>
                                </div>`)}
                        </div>` : ''}
                    ${results.length ? html`
                        <div class="person-section">
                            <div class="person-section-h">Resultater <span class="c">${results.length}</span></div>
                            ${sortedResults.map(r => html`
                                <div class="person-ref">
                                    <span class="person-ref-link" data-ref="result" data-id="${r.id || ''}" data-week="${r.week || ''}">⚖️ ${this._link(r.text || '')} <span class="ref-when">${r.week || ''}</span></span>
                                </div>`)}
                        </div>` : ''}
                    ${refTotal === 0 ? html`<div class="person-empty">Ingen referanser funnet.</div>` : ''}
                </div>
            </div>`;
    }
}

if (!customElements.get('person-card')) customElements.define('person-card', PersonCard);
