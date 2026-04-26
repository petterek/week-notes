/**
 * <person-tip> — singleton hover tooltip for `.mention-link` elements anywhere
 * in the document. Loads /api/people and /api/companies once on first hover
 * and caches them. Renders person or company info next to the cursor.
 *
 * Mention-link contract:
 *   <a class="mention-link" data-person-key="anna">@anna</a>
 *   <a class="mention-link" data-company-key="acmeas">@acmeas</a>
 * If neither attribute is present, the link's lowercased text is used as the
 * key and tried as a company first, then a person.
 */
(function () {
    if (window.customElements && customElements.get('person-tip')) return;

    const TEMPLATE = `
        <style>
            :host { position: fixed; z-index: 2000; pointer-events: none; opacity: 0; transition: opacity 0.1s; left: 0; top: 0; }
            :host([visible]) { opacity: 1; }
            .tip { background: var(--bg, #fff); border: 1px solid var(--border, #ccc); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 10px 14px; font-size: 0.85em; color: var(--text-strong, #2d3748); max-width: 280px; }
            .pt-name { font-weight: 700; color: var(--accent, #2a4365); font-size: 1.05em; margin-bottom: 2px; }
            .pt-title { color: var(--text-muted, #888); font-style: italic; margin-bottom: 4px; }
            .pt-row { color: var(--text-muted-warm, #718096); font-size: 0.9em; }
            .pt-notes { color: var(--text-muted, #888); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-soft, #ddd); white-space: pre-wrap; }
            .pt-missing { color: #a0aec0; font-style: italic; }
        </style>
        <div class="tip"></div>
    `;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    let peopleCache = null, companiesCache = null, loadPromise = null;
    function loadAll() {
        if (peopleCache && companiesCache) return Promise.resolve();
        if (loadPromise) return loadPromise;
        loadPromise = Promise.all([
            fetch('/api/people').then(r => r.json()).catch(() => []),
            fetch('/api/companies').then(r => r.json()).catch(() => []),
        ]).then(([p, c]) => { peopleCache = p || []; companiesCache = c || []; });
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
        if (!p) return `<div class="pt-missing">Ingen oppføring for @${esc(key)}</div>`;
        const name = p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : (p.name || key);
        const company = p.primaryCompanyKey ? findCompany(p.primaryCompanyKey) : null;
        const notes = p.notes ? (p.notes.length > 140 ? p.notes.slice(0, 140) + '…' : p.notes) : '';
        return `
            <div class="pt-name">${esc(name)}</div>
            ${p.title ? `<div class="pt-title">${esc(p.title)}</div>` : ''}
            ${company ? `<div class="pt-row">🏢 ${esc(company.name || p.primaryCompanyKey)}</div>` : ''}
            ${p.email ? `<div class="pt-row">✉️ ${esc(p.email)}</div>` : ''}
            ${p.phone ? `<div class="pt-row">📞 ${esc(p.phone)}</div>` : ''}
            ${notes ? `<div class="pt-notes">${esc(notes)}</div>` : ''}
        `;
    }
    function renderCompany(c, key) {
        if (!c) return `<div class="pt-missing">Ingen oppføring for @${esc(key)}</div>`;
        const notes = c.notes ? (c.notes.length > 140 ? c.notes.slice(0, 140) + '…' : c.notes) : '';
        return `
            <div class="pt-name">🏢 ${esc(c.name || key)}</div>
            ${c.url ? `<div class="pt-row">🔗 ${esc(c.url)}</div>` : ''}
            ${c.address ? `<div class="pt-row">📍 ${esc(c.address)}</div>` : ''}
            ${c.orgnr ? `<div class="pt-row">Org.nr: ${esc(c.orgnr)}</div>` : ''}
            ${notes ? `<div class="pt-notes">${esc(notes)}</div>` : ''}
        `;
    }

    class PersonTip extends HTMLElement {
        connectedCallback() {
            if (this.shadowRoot) return;
            const root = this.attachShadow({ mode: 'open' });
            root.innerHTML = TEMPLATE;
            this._tip = root.querySelector('.tip');
            let current = null;

            this._onOver = (e) => {
                const a = e.target.closest && e.target.closest('.mention-link');
                if (!a) return;
                current = a;
                const compKey = a.getAttribute('data-company-key');
                const key = compKey || a.getAttribute('data-person-key') || a.textContent.trim().toLowerCase();
                loadAll().then(() => {
                    if (current !== a) return;
                    let html;
                    if (compKey) html = renderCompany(findCompany(compKey), compKey);
                    else {
                        const c = findCompany(key);
                        html = c ? renderCompany(c, key) : renderPerson(findPerson(key), key);
                    }
                    this._tip.innerHTML = html;
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

    customElements.define('person-tip', PersonTip);
})();
