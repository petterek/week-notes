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

    var STYLE = '\
        :host { position: fixed; z-index: 2000; pointer-events: none; opacity: 0; transition: opacity 0.1s; left: 0; top: 0; }\
        :host([visible]) { opacity: 1; }\
        .tip { background: var(--bg, #fff); border: 1px solid var(--border, #ccc); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 10px 14px; font-size: 0.85em; color: var(--text-strong, #2d3748); max-width: 280px; }\
        .pt-name { font-weight: 700; color: var(--accent, #2a4365); font-size: 1.05em; margin-bottom: 2px; }\
        .pt-title { color: var(--text-muted, #888); font-style: italic; margin-bottom: 4px; }\
        .pt-row { color: var(--text-muted-warm, #718096); font-size: 0.9em; }\
        .pt-notes { color: var(--text-muted, #888); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-soft, #ddd); white-space: pre-wrap; }\
        .pt-missing { color: #a0aec0; font-style: italic; }\
    ';

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    var peopleCache = null, companiesCache = null, loadPromise = null;
    function loadAll() {
        if (peopleCache && companiesCache) return Promise.resolve();
        if (loadPromise) return loadPromise;
        loadPromise = Promise.all([
            fetch('/api/people').then(function (r) { return r.json(); }).catch(function () { return []; }),
            fetch('/api/companies').then(function (r) { return r.json(); }).catch(function () { return []; })
        ]).then(function (arr) {
            peopleCache = arr[0] || [];
            companiesCache = arr[1] || [];
        });
        return loadPromise;
    }
    function findPerson(key) {
        if (!key || !peopleCache) return null;
        return peopleCache.find(function (p) { return (p.key && p.key === key) || (p.name && p.name.toLowerCase() === key); });
    }
    function findCompany(key) {
        if (!key || !companiesCache) return null;
        return companiesCache.find(function (c) { return c.key === key; });
    }
    function renderPerson(p, key) {
        if (!p) return '<div class="pt-missing">Ingen oppføring for @' + esc(key) + '</div>';
        var name = p.firstName ? (p.lastName ? p.firstName + ' ' + p.lastName : p.firstName) : (p.name || key);
        var html = '<div class="pt-name">' + esc(name) + '</div>';
        if (p.title) html += '<div class="pt-title">' + esc(p.title) + '</div>';
        if (p.primaryCompanyKey) {
            var c = findCompany(p.primaryCompanyKey);
            if (c) html += '<div class="pt-row">🏢 ' + esc(c.name || p.primaryCompanyKey) + '</div>';
        }
        if (p.email) html += '<div class="pt-row">✉️ ' + esc(p.email) + '</div>';
        if (p.phone) html += '<div class="pt-row">📞 ' + esc(p.phone) + '</div>';
        if (p.notes) {
            var n = p.notes.length > 140 ? p.notes.slice(0, 140) + '…' : p.notes;
            html += '<div class="pt-notes">' + esc(n) + '</div>';
        }
        return html;
    }
    function renderCompany(c, key) {
        if (!c) return '<div class="pt-missing">Ingen oppføring for @' + esc(key) + '</div>';
        var html = '<div class="pt-name">🏢 ' + esc(c.name || key) + '</div>';
        if (c.url) html += '<div class="pt-row">🔗 ' + esc(c.url) + '</div>';
        if (c.address) html += '<div class="pt-row">📍 ' + esc(c.address) + '</div>';
        if (c.orgnr) html += '<div class="pt-row">Org.nr: ' + esc(c.orgnr) + '</div>';
        if (c.notes) {
            var n = c.notes.length > 140 ? c.notes.slice(0, 140) + '…' : c.notes;
            html += '<div class="pt-notes">' + esc(n) + '</div>';
        }
        return html;
    }

    class PersonTip extends HTMLElement {
        connectedCallback() {
            if (this.shadowRoot) return;
            var root = this.attachShadow({ mode: 'open' });
            root.innerHTML = '<style>' + STYLE + '</style><div class="tip"></div>';
            this._tip = root.querySelector('.tip');
            var self = this;
            var current = null;

            this._onOver = function (e) {
                var a = e.target.closest && e.target.closest('.mention-link');
                if (!a) return;
                current = a;
                var compKey = a.getAttribute('data-company-key');
                var key = compKey || a.getAttribute('data-person-key') || a.textContent.trim().toLowerCase();
                loadAll().then(function () {
                    if (current !== a) return;
                    var html;
                    if (compKey) html = renderCompany(findCompany(compKey), compKey);
                    else { var c = findCompany(key); html = c ? renderCompany(c, key) : renderPerson(findPerson(key), key); }
                    self._tip.innerHTML = html;
                    self.setAttribute('visible', '');
                    self._position(e);
                });
            };
            this._onMove = function (e) {
                if (self.hasAttribute('visible') && e.target.closest && e.target.closest('.mention-link')) self._position(e);
            };
            this._onOut = function (e) {
                var a = e.target.closest && e.target.closest('.mention-link');
                if (!a) return;
                var to = e.relatedTarget;
                if (to && to.closest && to.closest('.mention-link') === a) return;
                current = null;
                self.removeAttribute('visible');
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
            var r = 18, vw = window.innerWidth, vh = window.innerHeight;
            var w = this.offsetWidth, h = this.offsetHeight;
            var x = ev.clientX + r, y = ev.clientY + r;
            if (x + w > vw - 8) x = ev.clientX - w - r;
            if (y + h > vh - 8) y = ev.clientY - h - r;
            if (x < 8) x = 8;
            if (y < 8) y = 8;
            this.style.left = x + 'px';
            this.style.top = y + 'px';
        }
    }

    customElements.define('person-tip', PersonTip);
})();
