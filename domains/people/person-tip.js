/**
 * <person-tip> — singleton hover tooltip for `.mention-link` elements anywhere
 * in the document. Looks up people/companies and renders next to the cursor.
 *
 * Services (both optional — falls back to global cached fetchers from _shared.js):
 *   service           → PeopleService    (list() → Person[])
 *   service_companies → CompaniesService (list() → Company[])
 *
 * Mention-link contract:
 *   <a class="mention-link" data-person-key="anna">@anna</a>
 *   <a class="mention-link" data-company-key="acmeas">@acmeas</a>
 * If neither attribute is present, the link's lowercased text is used as the
 * key and tried as a company first, then a person.
 */
import { WNElement, html, escapeHtml, people as fetchPeople, companies as fetchCompanies } from './_shared.js';

const STYLES = `
    :host { position: fixed; z-index: 2000; pointer-events: none; opacity: 0; transition: opacity 0.1s; left: 0; top: 0; }
    :host([visible]) { opacity: 1; }
    .tip { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px var(--shadow); padding: 10px 14px; font-size: 0.85em; color: var(--text-strong); max-width: 280px; }
    .pt-name { font-weight: 700; color: var(--accent); font-size: 1.05em; margin-bottom: 2px; }
    .pt-title { color: var(--text-muted); font-style: italic; margin-bottom: 4px; }
    .pt-row { color: var(--text-muted-warm); font-size: 0.9em; }
    .pt-notes { color: var(--text-muted); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-soft); white-space: pre-wrap; }
    .pt-missing { color: var(--text-subtle); font-style: italic; }
`;

let peopleCache = null, companiesCache = null, loadPromise = null;
let lastSrc = null;
function loadAll(peopleSvc, compSvc) {
    const src = (peopleSvc ? 'p' : '-') + (compSvc ? 'c' : '-');
    if (peopleCache && companiesCache && lastSrc === src) return Promise.resolve();
    if (loadPromise && lastSrc === src) return loadPromise;
    lastSrc = src;
    const pP = peopleSvc && peopleSvc.list ? Promise.resolve(peopleSvc.list()) : fetchPeople();
    const pC = compSvc && compSvc.list ? Promise.resolve(compSvc.list()) : fetchCompanies();
    loadPromise = Promise.all([pP, pC]).then(([p, c]) => {
        peopleCache = p || []; companiesCache = c || [];
    });
    return loadPromise;
}
function findPerson(key) {
    if (!key || !peopleCache) return null;
    return peopleCache.find(p => (p.key && p.key === key) || (p.name && p.name.toLowerCase() === key));
}
function findCompany(key) {
    if (!key || !companiesCache) return null;
    return companiesCache.find(c => c.key === key);
}
function renderPerson(p, key) {
    if (!p) return html`<div class="pt-missing">Ingen oppføring for @${key}</div>`;
    const name = p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : (p.name || key);
    const company = p.primaryCompanyKey ? findCompany(p.primaryCompanyKey) : null;
    const notes = p.notes ? (p.notes.length > 140 ? p.notes.slice(0, 140) + '…' : p.notes) : '';
    return html`
        <div class="pt-name">${name}</div>
        ${p.title ? html`<div class="pt-title">${p.title}</div>` : ''}
        ${company ? html`<div class="pt-row">🏢 ${company.name || p.primaryCompanyKey}</div>` : ''}
        ${p.email ? html`<div class="pt-row">✉️ ${p.email}</div>` : ''}
        ${p.phone ? html`<div class="pt-row">📞 ${p.phone}</div>` : ''}
        ${notes ? html`<div class="pt-notes">${notes}</div>` : ''}
    `;
}
function renderCompany(c, key) {
    if (!c) return html`<div class="pt-missing">Ingen oppføring for @${key}</div>`;
    const notes = c.notes ? (c.notes.length > 140 ? c.notes.slice(0, 140) + '…' : c.notes) : '';
    return html`
        <div class="pt-name">🏢 ${c.name || key}</div>
        ${c.url ? html`<div class="pt-row">🔗 ${c.url}</div>` : ''}
        ${c.address ? html`<div class="pt-row">📍 ${c.address}</div>` : ''}
        ${c.orgnr ? html`<div class="pt-row">Org.nr: ${c.orgnr}</div>` : ''}
        ${notes ? html`<div class="pt-notes">${notes}</div>` : ''}
    `;
}

class PersonTip extends WNElement {
    // visible is intentionally NOT observed — toggling it must not re-render
    // (which would wipe the populated .tip content).
    static get observedAttributes() { return []; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        let current = null;

        this._onOver = (e) => {
            const a = e.target.closest && e.target.closest('.mention-link');
            if (!a) return;
            current = a;
            const compKey = a.getAttribute('data-company-key');
            const key = compKey || a.getAttribute('data-person-key') || a.textContent.trim().toLowerCase();
            const peopleSvc = this.service;
            const compSvc = this.serviceFor('companies');
            loadAll(peopleSvc, compSvc).then(() => {
                if (current !== a) return;
                let markup;
                if (compKey) markup = renderCompany(findCompany(compKey), compKey);
                else {
                    const c = findCompany(key);
                    markup = c ? renderCompany(c, key) : renderPerson(findPerson(key), key);
                }
                const tip = this.shadowRoot.querySelector('.tip');
                if (tip) tip.innerHTML = markup;
                this.setAttribute('visible', '');
                this._position(e);
            });
        };
        this._onMove = (e) => {
            if (this.hasAttribute('visible') && e.target.closest && e.target.closest('.mention-link')) this._position(e);
        };
        this._onOut = (e) => {
            const a = e.target.closest && e.target.closest('.mention-link');
            if (!a) return;
            const to = e.relatedTarget;
            if (to && to.closest && to.closest('.mention-link') === a) return;
            current = null;
            this.removeAttribute('visible');
        };
        document.addEventListener('mouseover', this._onOver);
        document.addEventListener('mousemove', this._onMove);
        document.addEventListener('mouseout', this._onOut);
    }

    disconnectedCallback() {
        document.removeEventListener('mouseover', this._onOver);
        document.removeEventListener('mousemove', this._onMove);
        document.removeEventListener('mouseout', this._onOut);
    }

    css() { return STYLES; }

    render() {
        return html`<div class="tip"></div>`;
    }

    _position(ev) {
        const r = 18, vw = window.innerWidth, vh = window.innerHeight;
        const w = this.offsetWidth, h = this.offsetHeight;
        let x = ev.clientX + r, y = ev.clientY + r;
        if (x + w > vw - 8) x = ev.clientX - w - r;
        if (y + h > vh - 8) y = ev.clientY - h - r;
        if (x < 8) x = 8;
        if (y < 8) y = 8;
        this.style.left = `${x}px`;
        this.style.top = `${y}px`;
    }
}

if (!customElements.get('person-tip')) customElements.define('person-tip', PersonTip);
