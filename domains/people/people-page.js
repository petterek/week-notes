/**
 * <people-page> — SPA replacement for the legacy /people screen.
 *
 * Three tabs:
 *   - 👤 Personer  (people)
 *   - 🏢 Selskaper (companies)
 *   - 📍 Steder    (places)
 *
 * Each tab loads its data through services (passed as <name>_service
 * attributes resolved against window['week-note-services']):
 *   - people_service     PeopleService
 *   - companies_service  CompaniesService
 *   - places_service     PlacesService
 *   - tasks_service      TaskService     (cross-references)
 *   - meetings_service   MeetingsService (cross-references)
 *   - results_service    ResultsService  (cross-references)
 *
 * Notes cross-references are intentionally skipped in v1 — the legacy
 * page reads the markdown files directly off disk, which the SPA notes
 * service does not expose. (TODO: revisit once a search index is wired.)
 *
 * Modals (edit/create person, company, place) are rendered inside the
 * shadow root, with the single exception of the place picker map: the
 * place modal is mounted as a sibling in the *light* DOM so Leaflet
 * (which assumes regular CSS scoping) can render its tile layer
 * correctly. Leaflet CSS/JS is lazy-loaded the first time the place
 * modal opens. Mini-maps inside the places list use the same trick
 * but render into placeholders inside the shadow root once Leaflet
 * is loaded — Leaflet works inside shadow DOM as long as its CSS is
 * also injected there, which we do.
 *
 * Hash routing:
 *   #tab=people|companies|places   — preserved tab
 *   #p-<key>, #c-<key>, #pl-<key>  — scrolls to and expands a card
 */
import { WNElement, html, escapeHtml, linkMentions, unsafeHTML } from './_shared.js';
import './company-card.js';
import './person-card.js';
import './place-card.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let _leafletLoaderPromise = null;
function loadLeaflet() {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.L) return Promise.resolve(window.L);
    if (_leafletLoaderPromise) return _leafletLoaderPromise;
    _leafletLoaderPromise = new Promise((resolve) => {
        if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = LEAFLET_CSS;
            document.head.appendChild(link);
        }
        const existing = document.querySelector(`script[data-leaflet]`);
        if (existing) {
            existing.addEventListener('load', () => resolve(window.L));
            return;
        }
        const s = document.createElement('script');
        s.src = LEAFLET_JS;
        s.dataset.leaflet = '1';
        s.onload = () => resolve(window.L);
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
    });
    return _leafletLoaderPromise;
}

const STYLES = `
    :host { display: block; padding: 18px 22px; box-sizing: border-box; max-width: 1100px; margin: 0 auto; color: var(--text-strong); font: inherit; }
    h1.pp-title { font-family: var(--font-heading, Georgia, serif); font-weight: 400; color: var(--accent); margin: 0 0 14px; font-size: 1.4em; }

    .dir-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-soft); margin-bottom: 16px; flex-wrap: wrap; }
    .dir-tab { background: transparent; border: 1px solid transparent; border-bottom: none; padding: 8px 14px; cursor: pointer; font-size: 0.95em; color: var(--text-muted); border-radius: 8px 8px 0 0; font: inherit; }
    .dir-tab:hover { color: var(--text); background: var(--surface); }
    .dir-tab.active { background: var(--surface); color: var(--accent); border-color: var(--border-soft); border-bottom: 1px solid var(--surface); margin-bottom: -1px; font-weight: 600; }
    .dir-tab-c { display: inline-block; min-width: 18px; padding: 0 6px; margin-left: 4px; background: var(--surface-alt); color: var(--text-muted); border-radius: 9px; font-size: 0.8em; }
    .dir-pane { display: none; }
    .dir-pane.active { display: block; }

    .pp-toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
    .pp-toolbar input[type=text] { flex: 1; min-width: 220px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95em; outline: none; background: var(--surface); color: var(--text); font: inherit; }
    .pp-toolbar input[type=text]:focus { border-color: var(--accent); }
    .pp-toolbar select { padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95em; outline: none; background: var(--surface); color: var(--text); cursor: pointer; font: inherit; }
    .pp-toolbar .btn-ghost { padding: 8px 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 8px; cursor: pointer; color: var(--text-muted); font-size: 0.9em; font: inherit; }
    .pp-toolbar .btn-ghost:hover { background: var(--surface-head); border-color: var(--accent); }
    .pp-toolbar .btn-primary { padding: 8px 14px; border: 1px solid var(--accent); background: var(--accent); color: var(--text-on-accent, white); border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600; }
    .pp-toolbar .btn-primary:hover { filter: brightness(0.95); }
    .pp-toolbar .show-inactive { display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer; padding: 8px 6px; }
    .pp-count { font-size: 0.85em; color: var(--text-subtle); margin-left: auto; }

    .person-card { margin-bottom: 8px; background: var(--surface); border-radius: 8px; border: 1px solid var(--border-soft); overflow: hidden; }
    .person-card.inactive { opacity: 0.55; }
    .person-card.hl { box-shadow: 0 0 0 2px var(--accent); animation: ppHl 1.4s ease-out; }
    @keyframes ppHl { from { box-shadow: 0 0 0 4px var(--accent); } to { box-shadow: 0 0 0 0 transparent; } }
    .person-header { padding: 8px 14px; background: var(--surface-head); display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
    .person-chev { font-size: 0.7em; color: var(--text-subtle); transition: transform 0.15s; display: inline-block; width: 10px; }
    .person-card.open .person-chev { transform: rotate(90deg); }
    .person-icon { font-size: 1.1em; }
    .person-name-wrap { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .person-name { font-weight: 600; color: var(--accent); }
    .person-card.inactive .person-name { text-decoration: line-through; }
    .person-handle { font-size: 0.8em; color: var(--text-subtle); }
    .person-badge { font-size: 0.75em; background: var(--surface-alt); color: var(--text-muted); padding: 1px 8px; border-radius: 10px; font-weight: 500; }
    .person-title { font-size: 0.82em; color: var(--text-muted); }
    .person-company-pill { font-size: 0.78em; background: var(--surface-alt); color: var(--text-muted); padding: 1px 8px; border-radius: 10px; }
    .person-refs { font-size: 0.8em; color: var(--text-subtle); white-space: nowrap; }
    .person-edit-btn { background: none; border: none; cursor: pointer; font-size: 1em; padding: 2px 6px; border-radius: 4px; color: var(--text-muted); }
    .person-edit-btn:hover { background: var(--border-soft); }
    .person-details { display: none; }
    .person-card.open .person-details { display: block; }
    .person-contact { padding: 8px 18px; background: var(--surface-alt); border-top: 1px solid var(--border-soft); display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.85em; color: var(--text-muted); }
    .person-contact a { color: var(--accent); text-decoration: none; }
    .person-contact a:hover { text-decoration: underline; }
    .person-companies { padding: 8px 18px; border-top: 1px solid var(--border-soft); display: flex; gap: 6px; flex-wrap: wrap; }
    .company-chip { font-size: 0.85em; padding: 3px 10px; background: var(--surface-alt); color: var(--text-muted); border-radius: 12px; text-decoration: none; border: 1px solid transparent; cursor: pointer; }
    .company-chip:hover { border-color: var(--accent); color: var(--accent); }
    .company-chip.primary { background: var(--accent-soft, var(--surface-head)); color: var(--accent); font-weight: 600; }
    .chip-tag { font-size: 0.7em; opacity: 0.7; margin-left: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .person-notes { padding: 8px 18px; background: var(--surface-head); border-top: 1px solid var(--border-soft); font-size: 0.85em; color: var(--text-muted); font-style: italic; white-space: pre-wrap; }
    .person-section { padding: 10px 18px; border-top: 1px solid var(--border-faint); }
    .person-section-h { font-size: 0.75em; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    .person-section-h .c { display: inline-block; min-width: 18px; padding: 0 6px; margin-left: 4px; background: var(--surface-alt); color: var(--text-muted); border-radius: 9px; font-size: 0.95em; text-align: center; }
    .person-ref { padding: 3px 0; font-size: 0.88em; }
    .person-ref a { color: var(--text); text-decoration: none; }
    .person-ref a:hover { text-decoration: underline; color: var(--accent); }
    .person-ref a.task-done { text-decoration: line-through; color: var(--text-subtle); }
    .person-ref .ref-when { font-size: 0.85em; color: var(--text-subtle); margin-left: 6px; }
    .person-empty { padding: 10px 18px; border-top: 1px solid var(--border-faint); font-size: 0.88em; color: var(--text-subtle); font-style: italic; }
    .empty-quiet { color: var(--text-muted); font-style: italic; padding: 16px 0; }

    .place-mini-map { height: 180px; border-top: 1px solid var(--border-soft); }
    .leaflet-container { font-family: inherit; }

    /* Modals (rendered inside shadow DOM) */
    .pp-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 9000; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; }
    .pp-modal.open { display: flex; }
    .pp-modal-card { background: var(--bg, white); color: var(--text-strong); border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); padding: 22px; max-width: 540px; width: 100%; max-height: 90vh; overflow: auto; box-sizing: border-box; }
    .pp-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 10px; }
    .pp-modal-head h3 { margin: 0; font-family: var(--font-heading, Georgia, serif); color: var(--accent); font-weight: 400; }
    .pp-modal-x { background: none; border: none; font-size: 1.3em; cursor: pointer; color: var(--text-subtle); }
    .pp-form { display: flex; flex-direction: column; gap: 12px; }
    .pp-form label { font-size: 0.85em; font-weight: 600; color: var(--text-muted); display: block; }
    .pp-form input, .pp-form textarea, .pp-form select { display: block; width: 100%; margin-top: 4px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-strong); font: inherit; box-sizing: border-box; }
    .pp-form textarea { resize: vertical; min-height: 60px; }
    .pp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .cmpck-list { border: 1px solid var(--border); border-radius: 6px; padding: 6px; max-height: 130px; overflow-y: auto; background: var(--surface); margin-top: 4px; }
    .cmpck-list label { display: flex !important; align-items: center; gap: 6px; font-weight: normal !important; padding: 3px 4px; font-size: 0.9em; cursor: pointer; }
    .cmpck-list label:hover { background: var(--surface-head); border-radius: 4px; }
    .cmpck-list input[type=checkbox] { width: auto; margin: 0; }
    .pp-inactive-row { display: flex; align-items: center; gap: 8px; font-size: 0.9em; color: var(--text-muted); cursor: pointer; padding: 6px 0; }
    .pp-inactive-row input { width: 16px; height: 16px; margin: 0; }
    .pp-actions { margin-top: 18px; display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
    .pp-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); cursor: pointer; font: inherit; }
    .pp-btn:hover { background: var(--surface-head); }
    .pp-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-on-accent, white); font-weight: 600; }
    .pp-btn.primary:hover { filter: brightness(0.95); }
    .pp-btn.danger { background: #fff5f5; color: #c53030; border-color: #fed7d7; margin-right: auto; }
    .pp-loading, .pp-error { padding: 24px; text-align: center; color: var(--text-muted); font-style: italic; }
    .pp-error { color: var(--danger, #c0392b); }
    .pp-hint { font-size: 0.8em; color: var(--text-subtle); margin-top: -6px; }
`;

const MENTION_RE = /(^|[\s\n([>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g;
function extractMentions(text) {
    const out = new Set();
    if (!text) return out;
    let m;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(String(text)))) out.add(m[2].toLowerCase());
    return out;
}

class PeoplePage extends WNElement {
    static get observedAttributes() {
        return ['people_service', 'companies_service', 'places_service',
                'tasks_service', 'meetings_service', 'results_service'];
    }

    constructor() {
        super();
        this._loaded = false;
        this._loading = true;
        this._error = null;
        this._people = [];
        this._companies = [];
        this._places = [];
        this._tasks = [];
        this._meetings = [];
        this._results = [];
        this._taskRefs = [];
        this._meetingRefs = [];
        this._resultRefs = [];
        this._companyMembers = new Map();
        this._placeMeetings = new Map();
        this._companiesByKey = {};
        this._tab = 'people';
        this._filters = { people: '', company: '', place: '' };
        this._sort = 'name-asc';
        this._showInactive = false;
        this._expanded = new Set();   // ids/keys of open cards
        this._modal = null;           // current modal name or null
        this._modalCtx = null;        // current edit context (the row being edited)
        this._lightModal = null;      // light-DOM container for the place modal
        this._placeMap = null;
        this._placeMarker = null;
        this._miniMaps = new WeakSet();
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._readHash();
        this._load();
        this._onHash = () => { this._readHash(); this._applyTab(); this._scrollToHashKey(); };
        window.addEventListener('hashchange', this._onHash);
        this._onKey = (e) => {
            if (e.key === 'Escape' && this._modal) this._closeModal();
        };
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
        window.removeEventListener('hashchange', this._onHash);
        document.removeEventListener('keydown', this._onKey);
        this._teardownLightModal();
    }

    _readHash() {
        const h = (location.hash || '').replace(/^#/, '');
        const params = {};
        h.split('&').forEach(seg => {
            const i = seg.indexOf('=');
            if (i > 0) params[seg.slice(0, i)] = decodeURIComponent(seg.slice(i + 1));
            else if (seg) params[seg] = true;
        });
        // Allow legacy `#p-<key>`-style hashes too — interpret them as
        // tab + key.
        if (params['p-' + (params['p-'] || '')]) {/* noop */}
        // Direct anchor form: #p-<key> / #c-<key> / #pl-<key>
        const anchorMatch = h.match(/^(p|c|pl)-(.+)$/);
        if (anchorMatch) {
            this._tab = anchorMatch[1] === 'p' ? 'people' : anchorMatch[1] === 'c' ? 'companies' : 'places';
            this._hashKey = anchorMatch[2];
        } else {
            const t = params.tab;
            if (t === 'people' || t === 'companies' || t === 'places') this._tab = t;
            this._hashKey = params.key || null;
        }
    }

    _writeHash() {
        const params = ['tab=' + this._tab];
        const newHash = '#' + params.join('&');
        if (location.hash !== newHash) {
            try { history.replaceState(null, '', newHash); } catch {}
        }
    }

    async _load() {
        const ps = this.serviceFor('people');
        const cs = this.serviceFor('companies');
        const pls = this.serviceFor('places');
        const ts = this.serviceFor('tasks');
        const ms = this.serviceFor('meetings');
        const rs = this.serviceFor('results');
        if (!ps || !cs || !pls) {
            this._error = 'no-service';
            this._loading = false;
            this.requestRender();
            return;
        }
        try {
            const [people, companies, places, tasks, meetings, results] = await Promise.all([
                ps.list().catch(() => []),
                cs.list().catch(() => []),
                pls.list().catch(() => []),
                ts ? ts.list().catch(() => []) : [],
                ms ? ms.list().catch(() => []) : [],
                rs ? rs.list().catch(() => []) : [],
            ]);
            this._people = (people || []).slice().sort((a, b) =>
                String(a.name || '').localeCompare(String(b.name || ''), 'nb'));
            this._companies = (companies || []).slice().sort((a, b) =>
                String(a.name || '').localeCompare(String(b.name || ''), 'nb'));
            this._places = (places || []).slice().sort((a, b) =>
                String(a.name || '').localeCompare(String(b.name || ''), 'nb'));
            this._tasks = tasks || [];
            this._meetings = meetings || [];
            this._results = results || [];
            this._buildIndexes();
            this._loaded = true;
            this._loading = false;
            this._error = null;
        } catch (e) {
            this._error = e.message || String(e);
            this._loading = false;
        }
        this.requestRender();
        this._applyTab();
        // Defer hash scroll until after the next paint so cards exist.
        requestAnimationFrame(() => this._scrollToHashKey());
    }

    _buildIndexes() {
        this._taskRefs = this._tasks.map(t => ({
            t,
            mentions: new Set([...extractMentions(t.text), ...extractMentions(t.note || '')]),
        }));
        this._meetingRefs = this._meetings.map(m => ({
            m,
            mentions: new Set([
                ...((m.attendees || []).map(a => String(a).toLowerCase())),
                ...extractMentions(m.title || ''),
                ...extractMentions(m.notes || ''),
                ...extractMentions(m.location || ''),
            ]),
        }));
        this._resultRefs = this._results.map(r => ({
            r,
            mentions: new Set([
                ...((r.people || []).map(p => String(p).toLowerCase())),
                ...extractMentions(r.text || ''),
            ]),
        }));
        this._companyMembers = new Map();
        this._people.forEach(p => {
            if (p.primaryCompanyKey) {
                const arr = this._companyMembers.get(p.primaryCompanyKey) || [];
                arr.push({ person: p, primary: true });
                this._companyMembers.set(p.primaryCompanyKey, arr);
            }
            (p.extraCompanyKeys || []).forEach(k => {
                if (k === p.primaryCompanyKey) return;
                const arr = this._companyMembers.get(k) || [];
                arr.push({ person: p, primary: false });
                this._companyMembers.set(k, arr);
            });
        });
        this._placeMeetings = new Map();
        this._meetings.forEach(m => {
            if (m.placeKey) {
                const arr = this._placeMeetings.get(m.placeKey) || [];
                arr.push(m);
                this._placeMeetings.set(m.placeKey, arr);
            }
        });
        this._companiesByKey = Object.fromEntries(this._companies.map(c => [c.key, c]));
    }

    // ---------------- rendering -----------------------------------------

    render() {
        if (!this.serviceFor('people') || !this.serviceFor('companies') || !this.serviceFor('places')) {
            return this.renderNoService();
        }
        if (this._loading) {
            return html`<h1 class="pp-title">👥 Personer og steder</h1><div class="pp-loading">Laster…</div>`;
        }
        if (this._error && this._error !== 'no-service') {
            return html`<h1 class="pp-title">👥 Personer og steder</h1><div class="pp-error">Kunne ikke laste: ${this._error}</div>`;
        }

        const tabs = html`
            <div class="dir-tabs" role="tablist">
                <button class="dir-tab ${this._tab === 'people' ? 'active' : ''}" data-tab="people" role="tab">👤 Personer <span class="dir-tab-c">${this._people.length}</span></button>
                <button class="dir-tab ${this._tab === 'companies' ? 'active' : ''}" data-tab="companies" role="tab">🏢 Selskaper <span class="dir-tab-c">${this._companies.length}</span></button>
                <button class="dir-tab ${this._tab === 'places' ? 'active' : ''}" data-tab="places" role="tab">📍 Steder <span class="dir-tab-c">${this._places.length}</span></button>
            </div>`;

        return html`
            <h1 class="pp-title">👥 Personer og steder</h1>
            ${tabs}
            <section class="dir-pane ${this._tab === 'people' ? 'active' : ''}" data-pane="people">
                ${this._renderPeoplePane()}
            </section>
            <section class="dir-pane ${this._tab === 'companies' ? 'active' : ''}" data-pane="companies">
                ${this._renderCompaniesPane()}
            </section>
            <section class="dir-pane ${this._tab === 'places' ? 'active' : ''}" data-pane="places">
                ${this._renderPlacesPane()}
            </section>
            ${this._renderModals()}
        `;
    }

    requestRender() {
        super.requestRender();
        this._wire();
        this._populateCompanyCards();
        this._populatePersonCards();
        this._populatePlaceCards();
    }

    _populateCompanyCards() {
        const cards = this.shadowRoot.querySelectorAll('company-card[data-key]');
        if (!cards.length) return;
        cards.forEach(card => {
            const k = card.dataset.key;
            const c = this._companies.find(x => x.key === k);
            if (!c) return;
            const inSet = (s) => s.has(k);
            const tasks    = this._taskRefs.filter(x => inSet(x.mentions)).map(x => x.t);
            const meetings = this._meetingRefs.filter(x => inSet(x.mentions)).map(x => x.m);
            const results  = this._resultRefs.filter(x => inSet(x.mentions)).map(x => x.r);
            const members  = this._companyMembers.get(k) || [];
            card.setData({
                company: c, members, tasks, meetings, results,
                people: this._people, companies: this._companies,
                open: this._expanded.has('c-' + k),
            });
        });
    }

    _populatePersonCards() {
        const cards = this.shadowRoot.querySelectorAll('person-card[data-key]');
        if (!cards.length) return;
        cards.forEach(card => {
            const k = card.dataset.key;
            const p = this._people.find(x => this._personKey(x) === k);
            if (!p) return;
            const inSet = (s) => s.has(k);
            const tasks    = this._taskRefs.filter(x => inSet(x.mentions)).map(x => x.t);
            const meetings = this._meetingRefs.filter(x => inSet(x.mentions)).map(x => x.m);
            const results  = this._resultRefs.filter(x => inSet(x.mentions)).map(x => x.r);
            const primaryCompany = p.primaryCompanyKey ? this._companiesByKey[p.primaryCompanyKey] || null : null;
            const extraCompanies = (p.extraCompanyKeys || []).map(x => this._companiesByKey[x]).filter(Boolean);
            card.setData({
                person: p, primaryCompany, extraCompanies, tasks, meetings, results,
                people: this._people, companies: this._companies,
                open: this._expanded.has('p-' + k),
            });
        });
    }

    _populatePlaceCards() {
        const cards = this.shadowRoot.querySelectorAll('place-card[data-key]');
        if (!cards.length) return;
        cards.forEach(card => {
            const k = card.dataset.key;
            const place = this._places.find(x => x.key === k);
            if (!place) return;
            const meetings = this._placeMeetings.get(k) || [];
            card.setData({
                place, meetings,
                people: this._people, companies: this._companies,
                open: this._expanded.has('pl-' + k),
            });
        });
    }

    _wire() {
        const root = this.shadowRoot;
        if (!root || this._wired) return;
        this._wired = true;
        root.addEventListener('click', (e) => this._onClick(e));
        root.addEventListener('input', (e) => this._onInput(e));
        root.addEventListener('change', (e) => this._onInput(e));
        // Events from <company-card>, <person-card>, <place-card>
        root.addEventListener('toggle', (e) => {
            const card = e.target.closest('company-card, person-card, place-card');
            if (!card) return;
            const tag = card.tagName.toLowerCase();
            const prefix = tag === 'company-card' ? 'c-' : tag === 'person-card' ? 'p-' : 'pl-';
            const id = prefix + card.dataset.key;
            if (this._expanded.has(id)) this._expanded.delete(id);
            else this._expanded.add(id);
            if (tag === 'company-card') this._populateCompanyCards();
            else if (tag === 'person-card') this._populatePersonCards();
            else this._populatePlaceCards();
        });
        root.addEventListener('edit', (e) => {
            const card = e.target.closest('company-card, person-card, place-card');
            if (!card) return;
            const tag = card.tagName.toLowerCase();
            const k = card.dataset.key;
            if (tag === 'company-card') {
                const c = this._companies.find(x => x.key === k);
                if (c) this._openCompanyModal(c);
            } else if (tag === 'person-card') {
                const p = this._people.find(x => this._personKey(x) === k);
                if (p) this._openPersonModal(p);
            } else {
                const pl = this._places.find(x => x.key === k);
                if (pl) this._openPlaceModal(pl);
            }
        });
        root.addEventListener('select-person', (e) => {
            if (!e.target.closest('company-card')) return;
            this._gotoTabKey('people', e.detail.key);
        });
        root.addEventListener('select-company', (e) => {
            if (!e.target.closest('person-card')) return;
            this._gotoTabKey('companies', e.detail.key);
        });
    }

    // ---------------- helpers -------------------------------------------

    _personKey(p) { return (p.key || (p.name || '').toLowerCase()).toLowerCase(); }
    _personDisplay(p) {
        return p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : (p.name || p.key || '');
    }

    _filterPeople() {
        const q = (this._filters.people || '').trim().toLowerCase();
        let arr = this._people.slice().filter(p => {
            if (!this._showInactive && p.inactive) return false;
            if (!q) return true;
            const blob = [p.firstName, p.lastName, p.name, p.key, p.title, p.email, p.phone, p.notes].filter(Boolean).join(' ').toLowerCase();
            return blob.includes(q);
        });
        const refsOf = (p) => {
            const k = this._personKey(p);
            const m = (s) => s.has(k);
            return this._taskRefs.filter(x => m(x.mentions)).length
                 + this._meetingRefs.filter(x => m(x.mentions)).length
                 + this._resultRefs.filter(x => m(x.mentions)).length;
        };
        arr.sort((a, b) => {
            const ai = a.inactive ? 1 : 0;
            const bi = b.inactive ? 1 : 0;
            if (ai !== bi) return ai - bi;
            const an = this._personDisplay(a).toLowerCase();
            const bn = this._personDisplay(b).toLowerCase();
            if (this._sort === 'name-asc')  return an.localeCompare(bn, 'nb');
            if (this._sort === 'name-desc') return bn.localeCompare(an, 'nb');
            if (this._sort === 'refs-desc') return refsOf(b) - refsOf(a) || an.localeCompare(bn, 'nb');
            if (this._sort === 'refs-asc')  return refsOf(a) - refsOf(b) || an.localeCompare(bn, 'nb');
            return 0;
        });
        return arr;
    }

    _filterCompanies() {
        const q = (this._filters.company || '').trim().toLowerCase();
        return this._companies.filter(c => {
            if (!q) return true;
            const blob = [c.name, c.key, c.address, c.url, c.orgnr, c.notes].filter(Boolean).join(' ').toLowerCase();
            return blob.includes(q);
        });
    }

    _filterPlaces() {
        const q = (this._filters.place || '').trim().toLowerCase();
        return this._places.filter(p => {
            if (p.deleted) return false;
            if (!q) return true;
            const blob = [p.name, p.key, p.address, p.notes].filter(Boolean).join(' ').toLowerCase();
            return blob.includes(q);
        });
    }

    // Render mention-style links inside escaped HTML using loaded data.
    _link(rawText) {
        return unsafeStringMentions(rawText, this._people, this._companies);
    }

    _renderPeoplePane() {
        const filtered = this._filterPeople();
        const total = this._people.length;
        const cards = filtered.map(p => this._renderPersonCard(p));
        return html`
            <div class="pp-toolbar">
                <input type="text" placeholder="🔍 Filter på navn, tittel, e-post..." data-input="people" value="${this._filters.people}" />
                <select data-input="sort">
                    <option value="name-asc"  ${this._sort === 'name-asc'  ? 'selected' : ''}>Navn A–Å</option>
                    <option value="name-desc" ${this._sort === 'name-desc' ? 'selected' : ''}>Navn Å–A</option>
                    <option value="refs-desc" ${this._sort === 'refs-desc' ? 'selected' : ''}>Flest referanser</option>
                    <option value="refs-asc"  ${this._sort === 'refs-asc'  ? 'selected' : ''}>Færrest referanser</option>
                </select>
                <button class="btn-ghost" data-act="expand-all" data-tab="people" title="Utvid alle">⇣ Utvid</button>
                <button class="btn-ghost" data-act="collapse-all" data-tab="people" title="Skjul alle">⇡ Skjul</button>
                <label class="show-inactive"><input type="checkbox" data-input="show-inactive" ${this._showInactive ? 'checked' : ''} /> Vis inaktive</label>
                <span class="pp-count">${filtered.length} av ${total}</span>
                <button class="btn-primary" data-act="new-person">➕ Ny person</button>
            </div>
            ${total === 0
                ? html`<p class="empty-quiet">Ingen personer registrert ennå. Klikk <strong>➕ Ny person</strong> for å legge til.</p>`
                : html`<div data-list="people">${cards}</div>`}
        `;
    }

    _renderPersonCard(p) {
        const k = this._personKey(p);
        return html`<person-card data-key="${k}" data-id="${p.id || ''}"></person-card>`;
    }

    _renderTaskList(tasks) {
        if (!tasks.length) return '';
        return html`
            <div class="person-section">
                <div class="person-section-h">Oppgaver <span class="c">${tasks.length}</span></div>
                ${tasks.map(t => html`
                    <div class="person-ref">
                        <a class="${t.done ? 'task-done' : ''}" href="/tasks">${t.done ? '✅' : '☐'} ${this._link(t.text || '')}</a>
                    </div>`)}
            </div>`;
    }

    _renderMeetingList(meetings) {
        if (!meetings.length) return '';
        const sorted = meetings.slice().sort((a, b) =>
            (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
        return html`
            <div class="person-section">
                <div class="person-section-h">Møter <span class="c">${meetings.length}</span></div>
                ${sorted.map(m => {
                    const wk = m.week || '';
                    const href = wk ? `/calendar/${encodeURIComponent(wk)}#m-${encodeURIComponent(m.id)}` : '/calendar';
                    return html`
                    <div class="person-ref">
                        <a href="${href}">📅 ${this._link(m.title || '')} <span class="ref-when">${m.date || ''}${m.start ? ' ' + m.start : ''}</span></a>
                    </div>`;
                })}
            </div>`;
    }

    _renderResultList(results) {
        if (!results.length) return '';
        const sorted = results.slice().sort((a, b) =>
            String(b.created || '').localeCompare(String(a.created || '')));
        return html`
            <div class="person-section">
                <div class="person-section-h">Resultater <span class="c">${results.length}</span></div>
                ${sorted.map(r => html`
                    <div class="person-ref">
                        <a href="/results">⚖️ ${this._link(r.text || '')} <span class="ref-when">${r.week || ''}</span></a>
                    </div>`)}
            </div>`;
    }

    _renderCompaniesPane() {
        const filtered = this._filterCompanies();
        const total = this._companies.length;
        return html`
            <div class="pp-toolbar">
                <input type="text" placeholder="🔍 Filter på navn, adresse, notat..." data-input="company" value="${this._filters.company}" />
                <button class="btn-ghost" data-act="expand-all" data-tab="companies">⇣ Utvid</button>
                <button class="btn-ghost" data-act="collapse-all" data-tab="companies">⇡ Skjul</button>
                <span class="pp-count">${filtered.length} av ${total}</span>
                <button class="btn-primary" data-act="new-company">➕ Nytt selskap</button>
            </div>
            ${total === 0
                ? html`<p class="empty-quiet">Ingen selskaper registrert ennå.</p>`
                : html`<div data-list="companies">${filtered.map(c => this._renderCompanyCard(c))}</div>`}
        `;
    }

    _renderCompanyCard(c) {
        const k = c.key;
        const inSet = (s) => s.has(k);
        const tasks = this._taskRefs.filter(x => inSet(x.mentions)).map(x => x.t);
        const meetings = this._meetingRefs.filter(x => inSet(x.mentions)).map(x => x.m);
        const results = this._resultRefs.filter(x => inSet(x.mentions)).map(x => x.r);
        const members = this._companyMembers.get(k) || [];
        const open = this._expanded.has('c-' + k);
        return html`<company-card data-key="${k}" data-id="${c.id || ''}"></company-card>`;
    }

    _renderPlacesPane() {
        const filtered = this._filterPlaces();
        const total = this._places.filter(p => !p.deleted).length;
        return html`
            <div class="pp-toolbar">
                <input type="text" placeholder="🔍 Filter på navn, adresse..." data-input="place" value="${this._filters.place}" />
                <button class="btn-ghost" data-act="expand-all" data-tab="places">⇣ Utvid</button>
                <button class="btn-ghost" data-act="collapse-all" data-tab="places">⇡ Skjul</button>
                <span class="pp-count">${filtered.length} av ${total}</span>
                <button class="btn-primary" data-act="new-place">➕ Nytt sted</button>
            </div>
            ${total === 0
                ? html`<p class="empty-quiet">Ingen steder registrert ennå.</p>`
                : html`<div data-list="places">${filtered.map(p => this._renderPlaceCard(p))}</div>`}
        `;
    }

    _renderPlaceCard(p) {
        const k = p.key;
        return html`<place-card data-key="${k}" data-id="${p.id || ''}"></place-card>`;
    }

    _renderModals() {
        const m = this._modal;
        return html`
            <div class="pp-modal ${m === 'person' ? 'open' : ''}" data-modal-bg="person">
                ${m === 'person' ? this._renderPersonForm() : ''}
            </div>
            <div class="pp-modal ${m === 'company' ? 'open' : ''}" data-modal-bg="company">
                ${m === 'company' ? this._renderCompanyForm() : ''}
            </div>
        `;
        // Place modal lives in the light DOM (see _openPlaceModal).
    }

    _renderPersonForm() {
        const p = this._modalCtx || {};
        const isEdit = !!p.id;
        const primary = p.primaryCompanyKey || '';
        const extras = new Set(p.extraCompanyKeys || []);
        const companyOptions = [
            html`<option value="">— ingen —</option>`,
            ...this._companies.map(c => html`<option value="${c.key}" ${c.key === primary ? 'selected' : ''}>${c.name}</option>`),
        ];
        const extraChecks = this._companies.filter(c => c.key !== primary).map(c => html`
            <label><input type="checkbox" data-extra-co value="${c.key}" ${extras.has(c.key) ? 'checked' : ''} /> ${c.name}</label>
        `);
        return html`
            <div class="pp-modal-card" data-modal-card>
                <div class="pp-modal-head">
                    <h3>${isEdit ? '✏️ Rediger person' : '➕ Ny person'}</h3>
                    <button class="pp-modal-x" data-act="close-modal" title="Lukk (Esc)">✕</button>
                </div>
                <div class="pp-form">
                    <div class="pp-grid">
                        <label>Fornavn *<input type="text" data-f="firstName" value="${p.firstName || ''}" placeholder="Ole" /></label>
                        <label>Etternavn<input type="text" data-f="lastName" value="${p.lastName || ''}" placeholder="Hansen" /></label>
                    </div>
                    <label>Tittel<input type="text" data-f="title" value="${p.title || ''}" /></label>
                    <label>Hovedselskap<select data-f="primaryCompanyKey">${companyOptions}</select></label>
                    ${this._companies.length ? html`
                        <div>
                            <label>Andre selskaper</label>
                            <div class="cmpck-list">${extraChecks.length ? extraChecks : html`<div style="color:var(--text-subtle);padding:6px;font-style:italic">Velg hovedselskap først.</div>`}</div>
                        </div>` : ''}
                    <label>E-post<input type="email" data-f="email" value="${p.email || ''}" /></label>
                    <label>Telefon<input type="tel" data-f="phone" value="${p.phone || ''}" /></label>
                    <label>Notat<textarea rows="3" data-f="notes">${p.notes || ''}</textarea></label>
                    <label class="pp-inactive-row"><input type="checkbox" data-f="inactive" ${p.inactive ? 'checked' : ''} /> Inaktiv (skjules fra @-autofullføring)</label>
                </div>
                <div class="pp-actions">
                    ${isEdit ? html`<button class="pp-btn danger" data-act="delete-person">🗑️ Slett</button>` : ''}
                    <button class="pp-btn" data-act="close-modal">Avbryt</button>
                    <button class="pp-btn primary" data-act="save-person">💾 Lagre</button>
                </div>
            </div>`;
    }

    _renderCompanyForm() {
        const c = this._modalCtx || {};
        const isEdit = !!c.id;
        return html`
            <div class="pp-modal-card" data-modal-card>
                <div class="pp-modal-head">
                    <h3>${isEdit ? '✏️ Rediger selskap' : '➕ Nytt selskap'}</h3>
                    <button class="pp-modal-x" data-act="close-modal" title="Lukk (Esc)">✕</button>
                </div>
                <div class="pp-form">
                    <label>Navn *<input type="text" data-f="name" value="${c.name || ''}" placeholder="Acme AS" /></label>
                    <label>Org.nr<input type="text" data-f="orgnr" value="${c.orgnr || ''}" /></label>
                    <label>Web<input type="text" data-f="url" value="${c.url || ''}" placeholder="https://" /></label>
                    <label>Adresse<input type="text" data-f="address" value="${c.address || ''}" /></label>
                    <label>Notat<textarea rows="3" data-f="notes">${c.notes || ''}</textarea></label>
                </div>
                <div class="pp-actions">
                    ${isEdit ? html`<button class="pp-btn danger" data-act="delete-company">🗑️ Slett</button>` : ''}
                    <button class="pp-btn" data-act="close-modal">Avbryt</button>
                    <button class="pp-btn primary" data-act="save-company">💾 Lagre</button>
                </div>
            </div>`;
    }

    // ---------------- events --------------------------------------------

    _onClick(e) {
        const path = e.composedPath();
        const find = (sel) => path.find(n => n.matches && n.matches(sel));
        // Tab switch
        const tab = find('.dir-tab');
        if (tab && tab.dataset.tab) {
            this._tab = tab.dataset.tab;
            this._writeHash();
            this._applyTab();
            return;
        }
        const act = find('[data-act]');
        if (!act) return;
        const a = act.dataset.act;
        if (a === 'toggle-card') {
            const card = path.find(n => n.dataset && n.dataset.card);
            if (!card) return;
            const id = (card.dataset.card === 'place' ? 'pl-' : card.dataset.card === 'company' ? 'c-' : 'p-') + card.dataset.key;
            if (this._expanded.has(id)) this._expanded.delete(id);
            else this._expanded.add(id);
            card.classList.toggle('open');
            // Lazy init mini-map when a place card opens with coords.
            if (card.dataset.card === 'place' && card.classList.contains('open')) {
                const m = card.querySelector('.place-mini-map');
                if (m) this._initMiniMap(m);
            }
            return;
        }
        if (a === 'expand-all' || a === 'collapse-all') {
            const tab = act.dataset.tab;
            const expand = a === 'expand-all';
            const prefix = tab === 'people' ? 'p-' : tab === 'companies' ? 'c-' : 'pl-';
            const tag = tab === 'people' ? 'person-card' : tab === 'companies' ? 'company-card' : 'place-card';
            this.shadowRoot.querySelectorAll(`${tag}[data-key]`).forEach(card => {
                const id = prefix + card.dataset.key;
                if (expand) this._expanded.add(id);
                else this._expanded.delete(id);
            });
            if (tab === 'companies') this._populateCompanyCards();
            else if (tab === 'people') this._populatePersonCards();
            else this._populatePlaceCards();
            return;
        }
        if (a === 'new-person')   { this._openPersonModal(null); return; }
        if (a === 'edit-person')  { const p = this._people.find(x => x.id === act.dataset.id); this._openPersonModal(p); return; }
        if (a === 'save-person')  { this._savePerson(); return; }
        if (a === 'delete-person'){ this._deletePerson(); return; }
        if (a === 'new-company')  { this._openCompanyModal(null); return; }
        if (a === 'edit-company') { const c = this._companies.find(x => x.id === act.dataset.id); this._openCompanyModal(c); return; }
        if (a === 'save-company') { this._saveCompany(); return; }
        if (a === 'delete-company'){ this._deleteCompany(); return; }
        if (a === 'new-place')    { this._openPlaceModal(null); return; }
        if (a === 'edit-place')   { const p = this._places.find(x => x.id === act.dataset.id); this._openPlaceModal(p); return; }
        if (a === 'close-modal')  { this._closeModal(); return; }
        if (a === 'goto-company') { this._gotoTabKey('companies', act.dataset.key); return; }
        if (a === 'goto-person')  { this._gotoTabKey('people', act.dataset.key); return; }
    }

    _onInput(e) {
        const t = e.target;
        if (!t.dataset) return;
        if (t.dataset.input === 'people')   { this._filters.people = t.value; this._refreshPane('people'); return; }
        if (t.dataset.input === 'company')  { this._filters.company = t.value; this._refreshPane('companies'); return; }
        if (t.dataset.input === 'place')    { this._filters.place = t.value; this._refreshPane('places'); return; }
        if (t.dataset.input === 'sort')     { this._sort = t.value; this._refreshPane('people'); return; }
        if (t.dataset.input === 'show-inactive') { this._showInactive = !!t.checked; this._refreshPane('people'); return; }
        // Person form: refresh extras list when primary company changes.
        if (this._modal === 'person' && t.dataset.f === 'primaryCompanyKey') {
            const card = this.shadowRoot.querySelector('[data-modal-card]');
            if (card) {
                const primary = t.value;
                const checked = new Set(Array.from(card.querySelectorAll('[data-extra-co]:checked')).map(x => x.value));
                const list = card.querySelector('.cmpck-list');
                if (list) {
                    list.innerHTML = this._companies.filter(c => c.key !== primary).map(c =>
                        `<label><input type="checkbox" data-extra-co value="${escapeHtml(c.key)}" ${checked.has(c.key) ? 'checked' : ''} /> ${escapeHtml(c.name)}</label>`
                    ).join('') || '<div style="color:var(--text-subtle);padding:6px;font-style:italic">Ingen flere selskaper.</div>';
                }
            }
        }
    }

    _refreshPane(which) {
        // Re-render only the pane to keep input focus where possible.
        // Easier: full re-render but preserve focus selector.
        const active = this.shadowRoot.activeElement;
        const sel = active && active.dataset && active.dataset.input;
        const pos = active ? active.selectionStart : null;
        this.requestRender();
        if (sel) {
            const next = this.shadowRoot.querySelector(`[data-input="${sel}"]`);
            if (next) {
                next.focus();
                if (pos != null && next.setSelectionRange) {
                    try { next.setSelectionRange(pos, pos); } catch {}
                }
            }
        }
    }

    _applyTab() {
        this.shadowRoot.querySelectorAll('.dir-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === this._tab));
        this.shadowRoot.querySelectorAll('.dir-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === this._tab));
        if (this._tab === 'places') this._populatePlaceCards();
    }

    _gotoTabKey(tab, key) {
        this._tab = tab;
        const prefix = tab === 'people' ? 'p-' : tab === 'companies' ? 'c-' : 'pl-';
        this._expanded.add(prefix + key);
        this._writeHash();
        this.requestRender();
        this._applyTab();
        requestAnimationFrame(() => {
            const tag = tab === 'people' ? 'person-card' : tab === 'companies' ? 'company-card' : 'place-card';
            const el = this.shadowRoot.querySelector(`${tag}[data-key="${key}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('hl');
                setTimeout(() => el.classList.remove('hl'), 1500);
            }
        });
    }

    _scrollToHashKey() {
        if (!this._hashKey) return;
        const prefix = this._tab === 'people' ? 'p-' : this._tab === 'companies' ? 'c-' : 'pl-';
        this._expanded.add(prefix + this._hashKey);
        this.requestRender();
        this._applyTab();
        requestAnimationFrame(() => {
            const tag = this._tab === 'people' ? 'person-card' : this._tab === 'companies' ? 'company-card' : 'place-card';
            const el = this.shadowRoot.querySelector(`${tag}[data-key="${this._hashKey}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('hl');
                setTimeout(() => el.classList.remove('hl'), 1500);
            }
        });
    }

    // ---------------- modal lifecycle -----------------------------------

    _openPersonModal(p) {
        this._modalCtx = p ? { ...p } : {};
        this._modal = 'person';
        this.requestRender();
        setTimeout(() => {
            const el = this.shadowRoot.querySelector('[data-f="firstName"]');
            if (el) el.focus();
        }, 30);
    }
    _openCompanyModal(c) {
        this._modalCtx = c ? { ...c } : {};
        this._modal = 'company';
        this.requestRender();
        setTimeout(() => {
            const el = this.shadowRoot.querySelector('[data-f="name"]');
            if (el) el.focus();
        }, 30);
    }
    _closeModal() {
        if (this._modal === 'place') {
            this._teardownLightModal();
        }
        this._modal = null;
        this._modalCtx = null;
        this.requestRender();
        this._applyTab();
    }

    _readForm() {
        const card = this.shadowRoot.querySelector('[data-modal-card]');
        if (!card) return {};
        const out = {};
        card.querySelectorAll('[data-f]').forEach(el => {
            const k = el.dataset.f;
            if (el.type === 'checkbox') out[k] = !!el.checked;
            else out[k] = el.value;
        });
        return out;
    }

    async _savePerson() {
        const data = this._readForm();
        if (!data.firstName || !data.firstName.trim()) { alert('Fornavn er påkrevd'); return; }
        const card = this.shadowRoot.querySelector('[data-modal-card]');
        const extraKeys = card ? Array.from(card.querySelectorAll('[data-extra-co]:checked')).map(x => x.value) : [];
        data.extraCompanyKeys = extraKeys;
        // Strip empty strings.
        Object.keys(data).forEach(k => { if (typeof data[k] === 'string') data[k] = data[k].trim(); });
        const id = this._modalCtx && this._modalCtx.id;
        const svc = this.serviceFor('people');
        try {
            if (id) await svc.update(id, data);
            else    await svc.create(data);
            await this._reload();
            this._closeModal();
        } catch (e) {
            alert('Feil: ' + (e.message || e));
        }
    }

    async _deletePerson() {
        const id = this._modalCtx && this._modalCtx.id;
        if (!id) return;
        const name = this._personDisplay(this._modalCtx) || 'denne personen';
        if (!confirm('Slette ' + name + '?')) return;
        try {
            await this.serviceFor('people').remove(id);
            await this._reload();
            this._closeModal();
        } catch (e) { alert('Feil: ' + (e.message || e)); }
    }

    async _saveCompany() {
        const data = this._readForm();
        if (!data.name || !data.name.trim()) { alert('Navn er påkrevd'); return; }
        Object.keys(data).forEach(k => { if (typeof data[k] === 'string') data[k] = data[k].trim(); });
        const id = this._modalCtx && this._modalCtx.id;
        const svc = this.serviceFor('companies');
        try {
            if (id) await svc.update(id, data);
            else    await svc.create(data);
            await this._reload();
            this._closeModal();
        } catch (e) { alert('Feil: ' + (e.message || e)); }
    }

    async _deleteCompany() {
        const id = this._modalCtx && this._modalCtx.id;
        if (!id) return;
        if (!confirm('Slette dette selskapet?')) return;
        try {
            await this.serviceFor('companies').remove(id);
            await this._reload();
            this._closeModal();
        } catch (e) { alert('Feil: ' + (e.message || e)); }
    }

    // ---- Place modal (light DOM) ---------------------------------------

    async _openPlaceModal(p) {
        this._modalCtx = p ? { ...p } : {};
        this._modal = 'place';
        await loadLeaflet();
        this._mountLightModal();
    }

    _mountLightModal() {
        if (!this._lightModal) {
            const wrap = document.createElement('div');
            wrap.className = 'wn-people-place-modal-host';
            wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box';
            wrap.addEventListener('click', (e) => {
                if (e.target === wrap) this._closeModal();
            });
            document.body.appendChild(wrap);
            this._lightModal = wrap;
        }
        const p = this._modalCtx || {};
        const isEdit = !!p.id;
        // Inline styling so the light-DOM modal matches theme tokens.
        this._lightModal.innerHTML = `
            <div style="background:var(--bg,white);color:var(--text-strong);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,0.25);padding:22px;max-width:640px;width:100%;max-height:90vh;overflow:auto;box-sizing:border-box;font:inherit">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:10px">
                    <h3 style="margin:0;font-family:var(--font-heading,Georgia,serif);color:var(--accent);font-weight:400">${isEdit ? '✏️ Rediger sted' : '➕ Nytt sted'}</h3>
                    <button data-act="close" title="Lukk" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:var(--text-subtle)">✕</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:12px">
                    <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Navn *<input data-f="name" type="text" value="${escapeAttr(p.name || '')}" placeholder="Hovedkontor" style="display:block;width:100%;margin-top:4px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-strong);font:inherit;box-sizing:border-box" /></label>
                    <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Adresse<input data-f="address" type="text" value="${escapeAttr(p.address || '')}" style="display:block;width:100%;margin-top:4px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-strong);font:inherit;box-sizing:border-box" /></label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                        <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Breddegrad (lat)<input data-f="lat" type="text" value="${escapeAttr(p.lat == null ? '' : p.lat)}" placeholder="59.9139" style="display:block;width:100%;margin-top:4px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-strong);font:inherit;box-sizing:border-box" /></label>
                        <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Lengdegrad (lng)<input data-f="lng" type="text" value="${escapeAttr(p.lng == null ? '' : p.lng)}" placeholder="10.7522" style="display:block;width:100%;margin-top:4px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-strong);font:inherit;box-sizing:border-box" /></label>
                    </div>
                    <div style="font-size:0.8em;color:var(--text-subtle);margin-top:-6px">Klikk på kartet for å plassere markøren. Dra for å justere.</div>
                    <div data-place-map style="height:320px;border-radius:6px;border:1px solid var(--border)"></div>
                    <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Notat<textarea data-f="notes" rows="2" style="display:block;width:100%;margin-top:4px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-strong);font:inherit;box-sizing:border-box;resize:vertical">${escapeHtml(p.notes || '')}</textarea></label>
                </div>
                <div style="margin-top:18px;display:flex;align-items:center;gap:10px;justify-content:flex-end">
                    ${isEdit ? `<button data-act="delete" style="padding:8px 16px;border-radius:6px;background:#fff5f5;color:#c53030;border:1px solid #fed7d7;cursor:pointer;font:inherit;margin-right:auto">🗑️ Slett</button>` : ''}
                    <button data-act="close" style="padding:8px 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-strong);cursor:pointer;font:inherit">Avbryt</button>
                    <button data-act="save" style="padding:8px 16px;border-radius:6px;background:var(--accent);border:1px solid var(--accent);color:var(--text-on-accent,white);cursor:pointer;font:inherit;font-weight:600">💾 Lagre</button>
                </div>
            </div>`;
        this._lightModal.querySelectorAll('[data-act]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const a = btn.dataset.act;
                if (a === 'close') this._closeModal();
                else if (a === 'save') this._savePlace();
                else if (a === 'delete') this._deletePlace();
            });
        });
        const mapEl = this._lightModal.querySelector('[data-place-map]');
        const latIn = this._lightModal.querySelector('[data-f="lat"]');
        const lngIn = this._lightModal.querySelector('[data-f="lng"]');
        const setMarker = (lat, lng) => {
            latIn.value = lat.toFixed(6);
            lngIn.value = lng.toFixed(6);
            if (!this._placeMarker) {
                this._placeMarker = window.L.marker([lat, lng], { draggable: true }).addTo(this._placeMap);
                this._placeMarker.on('dragend', e => {
                    const ll = e.target.getLatLng();
                    latIn.value = ll.lat.toFixed(6);
                    lngIn.value = ll.lng.toFixed(6);
                });
            } else {
                this._placeMarker.setLatLng([lat, lng]);
            }
        };
        if (window.L) {
            this._placeMap = window.L.map(mapEl).setView([59.9139, 10.7522], 12);
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(this._placeMap);
            this._placeMap.on('click', e => setMarker(e.latlng.lat, e.latlng.lng));
            if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
                this._placeMap.setView([p.lat, p.lng], 15);
                setMarker(p.lat, p.lng);
            }
            setTimeout(() => this._placeMap && this._placeMap.invalidateSize(), 50);
        } else {
            mapEl.textContent = '(Kunne ikke laste kart)';
        }
        setTimeout(() => {
            const f = this._lightModal.querySelector('[data-f="name"]');
            if (f) f.focus();
        }, 30);
    }

    _teardownLightModal() {
        try {
            if (this._placeMarker) { this._placeMarker = null; }
            if (this._placeMap) { this._placeMap.remove(); this._placeMap = null; }
        } catch {}
        if (this._lightModal && this._lightModal.parentNode) {
            this._lightModal.parentNode.removeChild(this._lightModal);
        }
        this._lightModal = null;
    }

    async _savePlace() {
        if (!this._lightModal) return;
        const get = (k) => {
            const el = this._lightModal.querySelector(`[data-f="${k}"]`);
            return el ? el.value : '';
        };
        const name = (get('name') || '').trim();
        if (!name) { alert('Navn er påkrevd'); return; }
        const latStr = (get('lat') || '').trim();
        const lngStr = (get('lng') || '').trim();
        const data = {
            name,
            address: (get('address') || '').trim(),
            lat: latStr === '' ? null : parseFloat(latStr),
            lng: lngStr === '' ? null : parseFloat(lngStr),
            notes: (get('notes') || '').trim(),
        };
        const id = this._modalCtx && this._modalCtx.id;
        const svc = this.serviceFor('places');
        try {
            if (id) await svc.update(id, data);
            else    await svc.create(data);
            await this._reload();
            this._closeModal();
        } catch (e) { alert('Feil: ' + (e.message || e)); }
    }

    async _deletePlace() {
        const id = this._modalCtx && this._modalCtx.id;
        if (!id) return;
        if (!confirm('Slette dette stedet?')) return;
        try {
            await this.serviceFor('places').remove(id);
            await this._reload();
            this._closeModal();
        } catch (e) { alert('Feil: ' + (e.message || e)); }
    }

    // ---- Mini-maps in places list --------------------------------------

    _initMiniMap(el) {
        if (!el || this._miniMaps.has(el) || !window.L) {
            // If Leaflet isn't loaded yet, kick it off and try again later.
            if (el && !this._miniMaps.has(el) && !window.L) {
                loadLeaflet().then(() => this._initMiniMap(el));
            }
            return;
        }
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        if (!isFinite(lat) || !isFinite(lng)) return;
        // Inject Leaflet's CSS into the shadow root so tile layers paint
        // correctly inside the encapsulated DOM. Done once per host.
        if (!this._leafletShadowCss) {
            const style = document.createElement('style');
            style.textContent = `@import url("${LEAFLET_CSS}");`;
            this.shadowRoot.appendChild(style);
            this._leafletShadowCss = style;
        }
        this._miniMaps.add(el);
        try {
            const m = window.L.map(el, {
                zoomControl: false, attributionControl: false,
                dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
            }).setView([lat, lng], 15);
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
            window.L.marker([lat, lng], { title: el.dataset.name || '' }).addTo(m);
            setTimeout(() => m.invalidateSize(), 50);
        } catch (e) {
            // Leaflet inside shadow DOM occasionally throws on first init —
            // swallow and let the user click "Vis på kart (OSM)" instead.
        }
    }

    // ---- Reload after mutation -----------------------------------------

    async _reload() {
        // Refresh the underlying data without re-rendering loading state.
        const ps = this.serviceFor('people');
        const cs = this.serviceFor('companies');
        const pls = this.serviceFor('places');
        const ts = this.serviceFor('tasks');
        const ms = this.serviceFor('meetings');
        const rs = this.serviceFor('results');
        const [people, companies, places, tasks, meetings, results] = await Promise.all([
            ps.list().catch(() => this._people),
            cs.list().catch(() => this._companies),
            pls.list().catch(() => this._places),
            ts ? ts.list().catch(() => this._tasks) : this._tasks,
            ms ? ms.list().catch(() => this._meetings) : this._meetings,
            rs ? rs.list().catch(() => this._results) : this._results,
        ]);
        this._people = (people || []).slice().sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'nb'));
        this._companies = (companies || []).slice().sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'nb'));
        this._places = (places || []).slice().sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'nb'));
        this._tasks = tasks; this._meetings = meetings; this._results = results;
        this._buildIndexes();
        this.requestRender();
        this._applyTab();
    }
}

// Helper for the place modal's light-DOM template (attribute escape).
function escapeAttr(s) { return escapeHtml(s); }

// Render @mentions as anchors. Returns a raw HTML wrapper so it can be
// interpolated directly into html`` results.
function unsafeStringMentions(text, people, companies) {
    return unsafeHTML(linkMentions(escapeHtml(text), people, companies));
}

if (!customElements.get('people-page')) customElements.define('people-page', PeoplePage);
