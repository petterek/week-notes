/**
 * Shared module for week-notes web components.
 *
 * Provides:
 *   - html``  — lit-html-style tagged template (escapes interpolations,
 *               inlines nested html`` results unescaped, accepts arrays).
 *   - unsafeHTML(s) — wraps a raw HTML string for safe interpolation.
 *   - escapeHtml(s)
 *   - linkMentions(htmlStr, people, companies) — server mirror.
 *   - wireMentionClicks(host) — bubbles 'mention-clicked' on click.
 *   - isoWeek(date)
 *   - WNElement — base class for shadow-DOM components. Subclasses
 *       implement css() and render(); base handles attachShadow,
 *       adoptedStyleSheets, render-on-connect, and re-render on
 *       observed attribute changes. Manual: this.requestRender().
 *   - WN.{people,companies,tasks,results,meetings,meetingTypes} —
 *       cached /api/* fetches shared across component instances.
 *
 * Loaded as an ES module (`<script type="module">`). Side-effect: also
 * exposes the same names on `window.WN` (and `window.html`,
 * `window.unsafeHTML`) so non-module inline page scripts keep working.
 */

const cache = {};
function once(key, url) {
    if (!cache[key]) {
        cache[key] = fetch(url).then(r => r.json()).catch(() => []);
    }
    return cache[key];
}
export function invalidate(key) {
    if (key == null) for (const k in cache) delete cache[k];
    else delete cache[key];
}

export function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Mirror server-side linkMentions: convert @key tokens in already-
 * escaped HTML into <a class="mention-link"> anchors. Returns a raw
 * HTML string — wrap with unsafeHTML() when interpolating into html``.
 */
export function linkMentions(s, people, companies) {
    if (!s) return s;
    return s.replace(/(^|[\s\n(\[>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g, (_m, pre, name) => {
        const lc = name.toLowerCase();
        const c = companies.find(x => x.key === lc);
        if (c) {
            return `${pre}<a href="/people#tab=companies&key=${encodeURIComponent(c.key)}" class="mention-link mention-company" data-company-key="${escapeHtml(c.key)}">${escapeHtml(c.name || name)}</a>`;
        }
        const p = people.find(x => x.name === name || x.key === lc);
        const display = p ? (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name) : name;
        const key = p ? (p.key || (p.name || '').toLowerCase()) : lc;
        return `${pre}<a href="/people" class="mention-link" data-person-key="${escapeHtml(key)}">${escapeHtml(display)}</a>`;
    });
}

export function wireMentionClicks(host) {
    host.addEventListener('click', (ev) => {
        const a = ev.target.closest('a.mention-link');
        if (!a || !host.contains(a)) return;
        ev.preventDefault();
        const id = a.dataset.companyKey || a.dataset.personKey || '';
        host.dispatchEvent(new CustomEvent('mention-clicked', {
            bubbles: true, cancelable: true, detail: { id },
        }));
    });
}

export function isoWeek(d) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dow + 3);
    const fy = t.getUTCFullYear();
    const ft = new Date(Date.UTC(fy, 0, 4));
    const fdow = (ft.getUTCDay() + 6) % 7;
    ft.setUTCDate(ft.getUTCDate() - fdow + 3);
    const w = 1 + Math.round((t - ft) / (7 * 24 * 3600 * 1000));
    return `${fy}-W${String(w).padStart(2, '0')}`;
}

// --- html tagged template ----------------------------------------------------
const RAW = Symbol('rawHtml');
function rawResult(s) {
    const value = String(s == null ? '' : s);
    return { [RAW]: true, value, toString() { return value; } };
}
export function unsafeHTML(s) { return rawResult(s); }
export function html(strings, ...values) {
    let out = '';
    for (let i = 0; i < strings.length; i++) {
        out += strings[i];
        if (i < values.length) {
            const v = values[i];
            if (v == null || v === false) {
                /* skip */
            } else if (Array.isArray(v)) {
                for (const item of v) {
                    if (item == null || item === false) continue;
                    if (item && typeof item === 'object' && item[RAW]) out += item.value;
                    else out += escapeHtml(String(item));
                }
            } else if (typeof v === 'object' && v[RAW]) {
                out += v.value;
            } else {
                out += escapeHtml(String(v));
            }
        }
    }
    return rawResult(out);
}

// --- WNElement base class ---------------------------------------------------
/**
 * Base class for shadow-DOM components.
 *
 * Lifecycle:
 *   1. constructor → attachShadow({mode:'open'}).
 *   2. connectedCallback → installs CSSStyleSheet from css(), then
 *      requestRender() to call render() and write to shadowRoot.innerHTML.
 *   3. attributeChangedCallback → if connected, requestRender().
 *   4. Subclasses fetch async data and call this.requestRender() when done.
 *
 * Subclasses define:
 *   static get observedAttributes() { return ['week', 'service', ...]; }
 *   css() { return STYLES; }                    // returns a CSS string
 *   render() { return html`...`; }              // returns html`` result
 *
 * Helpers on the base:
 *   this.service        → window[ getAttribute('service') ] or null
 *   this.serviceFor(k)  → window[ getAttribute('service_'+k) ] or null
 *   this.renderNoService() → html`` placeholder for the service-missing case
 */
export class WNElement extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this._applyCss();
        this.requestRender();
    }

    attributeChangedCallback() {
        if (this.isConnected) this.requestRender();
    }

    _applyCss() {
        const css = this.css();
        if (!css) return;
        if (!this._sheet) {
            this._sheet = new CSSStyleSheet();
            this.shadowRoot.adoptedStyleSheets = [this._sheet];
        }
        if (this._lastCss !== css) {
            this._sheet.replaceSync(css);
            this._lastCss = css;
        }
    }

    requestRender() {
        const r = this.render();
        if (r == null || r === false) { this.shadowRoot.innerHTML = ''; return; }
        this.shadowRoot.innerHTML = (typeof r === 'object' && r.value != null) ? r.value : String(r);
    }

    css() { return ''; }
    render() { return ''; }

    get service() {
        const name = this.getAttribute('service');
        return name ? (window[name] || null) : null;
    }
    serviceFor(key) {
        const name = this.getAttribute('service_' + key);
        return name ? (window[name] || null) : null;
    }
    renderNoService() {
        return html`<p style="color:var(--danger);font-style:italic;margin:0">no service connected</p>`;
    }
}

// --- WN namespace + globals (backward compat for inline page scripts) -------
const WN = {
    people:       () => once('people',       '/api/people'),
    companies:    () => once('companies',    '/api/companies'),
    tasks:        () => once('tasks',        '/api/tasks'),
    results:      () => once('results',      '/api/results'),
    meetings:     (q = '') => once(`meetings${q}`, `/api/meetings${q}`),
    meetingTypes: () => once('meetingTypes', '/api/meeting-types'),
    invalidate, escapeHtml, linkMentions, wireMentionClicks, isoWeek,
    html, unsafeHTML, WNElement,
};
window.WN = WN;
window.html = html;
window.unsafeHTML = unsafeHTML;

export const people       = WN.people;
export const companies    = WN.companies;
export const tasks        = WN.tasks;
export const results      = WN.results;
export const meetings     = WN.meetings;
export const meetingTypes = WN.meetingTypes;
