/**
 * <entity-mention>
 *
 * Reusable inline chip that represents a reference to a person, company
 * or place. Given a `key`, it auto-resolves the entity from the global
 * services and shows a friendly display name (e.g. "FirstName LastName"
 * for a person). It still emits hover / select events so the global
 * callout and SPA navigation hooks pick them up.
 *
 *   <entity-mention kind="person"  key="anna-berg"></entity-mention>
 *   <entity-mention kind="company" key="acmeas"></entity-mention>
 *   <entity-mention kind="place"   key="oslo"></entity-mention>
 *
 * Attributes:
 *   - kind   — 'person' | 'company' | 'place' (default 'person')
 *   - key    — entity key. Required.
 *   - label  — optional display text. If set, lookup is skipped and the
 *              attribute value is rendered verbatim. Useful when a
 *              renderer already knows the display name.
 *
 * Data source: the component reads `window['week-note-services']`
 * (lazy, shared across all chips). Falls back to `window.MockServices`
 * (debug). Lookups are cached for the lifetime of the page.
 *
 * Events (cancelable, bubbling, composed):
 *   - 'hover-person'  | 'hover-company'  | 'hover-place'
 *       detail: { key, entering, x, y }
 *   - 'select-person' | 'select-company' | 'select-place'
 *       detail: { key }
 */
import { WNElement, html, escapeHtml } from '../../components/_shared.js';

const STYLES = `
    :host {
        display: inline;
        color: var(--accent, #2563eb);
        cursor: pointer;
        text-decoration: none;
    }
    :host([hidden]) { display: none; }
    .chip { color: inherit; }
    .chip:hover { text-decoration: underline; }
    :host([kind="place"]) .chip::before { content: '📍 '; }
`;

const VALID_KINDS = new Set(['person', 'company', 'place']);

// ----- Shared, page-wide entity cache. All chips share one Promise per
// kind so we never load the same list twice. -----
const _cache = { person: null, company: null, place: null };
const _loading = { person: null, company: null, place: null };

function _serviceFor(kind) {
    const ns = (typeof window !== 'undefined' && window['week-note-services']) || {};
    const map = { person: 'people_service', company: 'companies_service', place: 'places_service' };
    if (ns[map[kind]]) return ns[map[kind]];
    const mocks = (typeof window !== 'undefined' && window.MockServices) || {};
    const mockMap = { person: 'people', company: 'companies', place: 'places' };
    return mocks[mockMap[kind]] || null;
}

function _loadList(kind) {
    if (_cache[kind]) return Promise.resolve(_cache[kind]);
    if (_loading[kind]) return _loading[kind];
    const svc = _serviceFor(kind);
    if (!svc || typeof svc.list !== 'function') {
        _cache[kind] = [];
        return Promise.resolve(_cache[kind]);
    }
    _loading[kind] = Promise.resolve(svc.list()).then((arr) => {
        _cache[kind] = Array.isArray(arr) ? arr : [];
        _loading[kind] = null;
        return _cache[kind];
    }).catch(() => {
        _cache[kind] = [];
        _loading[kind] = null;
        return _cache[kind];
    });
    return _loading[kind];
}

function _findEntity(kind, key) {
    const list = _cache[kind] || [];
    if (!key) return null;
    const lk = String(key).toLowerCase();
    if (kind === 'person') {
        return list.find(x => (x.key && x.key.toLowerCase() === lk) || (x.name && x.name.toLowerCase() === lk)) || null;
    }
    return list.find(x => x.key === key || (x.key && x.key.toLowerCase() === lk)) || null;
}

function _displayName(kind, entity, key) {
    if (!entity) return key;
    if (kind === 'person') {
        if (entity.firstName && entity.lastName) return entity.firstName + ' ' + entity.lastName;
        if (entity.firstName) return entity.firstName;
        if (entity.name) return entity.name;
        return key;
    }
    return entity.name || key;
}

class EntityMention extends WNElement {
    static get observedAttributes() { return ['kind', 'key', 'label']; }

    constructor() {
        super();
        this._wired = false;
        this._resolved = null;
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this._wired) {
            this.shadowRoot.addEventListener('pointerover', (e) => this._onHover(e, true));
            this.shadowRoot.addEventListener('pointerout',  (e) => this._onHover(e, false));
            this.shadowRoot.addEventListener('click',       (e) => this._onClick(e));
            this._wired = true;
        }
        this._resolveIfNeeded();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback();
        if (oldVal === newVal) return;
        if (name === 'key' || name === 'kind') {
            this._resolved = null;
            if (this.isConnected) this._resolveIfNeeded();
        }
    }

    css() { return STYLES; }

    render() {
        return html`<span class="chip" part="chip">${escapeHtml(this._label())}</span>`;
    }

    _resolveIfNeeded() {
        if (this.getAttribute('label')) return;
        const key = this._key();
        if (!key) return;
        const kind = this._kind();
        _loadList(kind).then(() => {
            const entity = _findEntity(kind, key);
            this._resolved = _displayName(kind, entity, key);
            this.requestRender();
        });
    }

    _kind() {
        const k = (this.getAttribute('kind') || 'person').toLowerCase();
        return VALID_KINDS.has(k) ? k : 'person';
    }

    _key() { return this.getAttribute('key') || ''; }

    _label() {
        const explicit = this.getAttribute('label');
        if (explicit) return explicit;
        if (this._resolved) return this._resolved;
        const slotted = (this.textContent || '').trim();
        if (slotted) return slotted;
        return this._key();
    }

    _onHover(e, entering) {
        const key = this._key();
        if (!key) return;
        const related = e.relatedTarget;
        if (related && this.contains(related)) return;
        this.dispatchEvent(new CustomEvent('hover-' + this._kind(), {
            detail: { key, entering, x: e.clientX, y: e.clientY },
            bubbles: true, composed: true, cancelable: true,
        }));
    }

    _onClick(e) {
        const key = this._key();
        if (!key) return;
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('select-' + this._kind(), {
            detail: { key },
            bubbles: true, composed: true, cancelable: true,
        }));
    }
}

if (!customElements.get('entity-mention')) {
    customElements.define('entity-mention', EntityMention);
}

export { EntityMention };
