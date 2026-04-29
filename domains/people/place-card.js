/**
 * <place-card>
 *
 * Dumb presentation card for a single place. Receives all data via
 * `setData(d)`; never loads anything itself. Used by <people-page> on the
 * Steder tab.
 *
 *   const card = document.createElement('place-card');
 *   card.setData({
 *       place:     { id, key, name, address, lat, lng, notes },
 *       meetings:  [{ id, title, date, start, week }],
 *       people:    [...],   // for @mention link resolution
 *       companies: [...],
 *       open:      false,
 *   });
 *
 * `setData` may be called before or after the element is connected.
 *
 * Events (cancelable, bubbling, composed):
 *   - 'toggle'         { key }            — header click. Host owns expanded
 *                                           state and re-renders.
 *   - 'edit'           { id, key }        — pencil button.
 *   - 'select-meeting' { id, week }       — meeting ref click.
 *   - 'hover-meeting'  { id, week, entering }
 *
 * The mini-map (Leaflet) is rendered inside the card's own shadow root when
 * `lat` and `lng` are finite numbers. Leaflet is loaded lazily on first
 * render that needs it.
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions } from '../../components/_shared.js';

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
        const existing = document.querySelector('script[data-leaflet]');
        if (existing) { existing.addEventListener('load', () => resolve(window.L)); return; }
        const s = document.createElement('script');
        s.src = LEAFLET_JS;
        s.dataset.leaflet = '1';
        s.onload  = () => resolve(window.L);
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
    });
    return _leafletLoaderPromise;
}

const STYLES = `
    :host { display: block; }
    .person-card { margin-bottom: 8px; background: var(--surface); border-radius: 8px; border: 1px solid var(--border-soft); overflow: hidden; }
    .person-header { padding: 8px 14px; background: var(--surface-head); display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
    .person-chev { font-size: 0.7em; color: var(--text-subtle); transition: transform 0.15s; display: inline-block; width: 10px; }
    .person-card.open .person-chev { transform: rotate(90deg); }
    .person-icon { font-size: 1.1em; }
    .person-name-wrap { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .person-name { font-weight: 600; color: var(--accent); }
    .person-handle { font-size: 0.8em; color: var(--text-subtle); }
    .person-title { font-size: 0.82em; color: var(--text-muted); }
    .person-refs { font-size: 0.8em; color: var(--text-subtle); white-space: nowrap; }
    .person-edit-btn { background: none; border: none; cursor: pointer; font-size: 1em; padding: 2px 6px; border-radius: 4px; color: var(--text-muted); }
    .person-edit-btn:hover { background: var(--border-soft); }
    .person-details { display: none; }
    .person-card.open .person-details { display: block; }
    .person-contact { padding: 8px 18px; background: var(--surface-alt); border-top: 1px solid var(--border-soft); display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.85em; color: var(--text-muted); }
    .person-contact a { color: var(--accent); text-decoration: none; }
    .person-contact a:hover { text-decoration: underline; }
    .place-mini-map { height: 200px; border-top: 1px solid var(--border-soft); border-bottom: 1px solid var(--border-soft); }
    .person-notes { padding: 8px 18px; background: var(--surface-head); border-top: 1px solid var(--border-soft); font-size: 0.85em; color: var(--text-muted); font-style: italic; white-space: pre-wrap; }
    .person-section { padding: 10px 18px; border-top: 1px solid var(--border-faint); }
    .person-section-h { font-size: 0.75em; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    .person-section-h .c { display: inline-block; min-width: 18px; padding: 0 6px; margin-left: 4px; background: var(--surface-alt); color: var(--text-muted); border-radius: 9px; font-size: 0.95em; text-align: center; }
    .person-ref { padding: 3px 0; font-size: 0.88em; }
    .person-ref-link { color: var(--text); cursor: pointer; }
    .person-ref-link:hover { text-decoration: underline; color: var(--accent); }
    .person-ref .ref-when { font-size: 0.85em; color: var(--text-subtle); margin-left: 6px; }
    .person-empty { padding: 10px 18px; border-top: 1px solid var(--border-faint); font-size: 0.88em; color: var(--text-subtle); font-style: italic; }
`;

export class PlaceCard extends WNElement {
    static get domain() { return 'people'; }

    constructor() {
        super();
        this._data = null;
        this._wired = false;
        this._mapEl = null;
        this._map = null;
        this._mapKey = null;
        this._cssInjected = false;
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
        // Rendering replaces innerHTML, so the previous map element (if any)
        // is gone. Re-init if the card is open and has coords.
        this._map = null;
        this._mapEl = null;
        if (this._data && this._data.open) this._maybeInitMap();
    }

    _wire() {
        if (!this.shadowRoot || this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
        this.shadowRoot.addEventListener('pointerover', (e) => this._onHover(e, true));
        this.shadowRoot.addEventListener('pointerout',  (e) => this._onHover(e, false));
    }

    _refDetail(el) {
        const detail = { kind: el.dataset.ref, id: el.dataset.id || '' };
        if (el.dataset.week !== undefined) detail.week = el.dataset.week || '';
        return { kind: detail.kind, detail };
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
        const p = this._data.place || {};
        const key = p.key;
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

    _maybeInitMap() {
        if (!this.shadowRoot) return;
        const el = this.shadowRoot.querySelector('.place-mini-map');
        if (!el) return;
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        if (!isFinite(lat) || !isFinite(lng)) return;
        if (!this._cssInjected) {
            const style = document.createElement('style');
            style.textContent = `@import url("${LEAFLET_CSS}");`;
            this.shadowRoot.appendChild(style);
            this._cssInjected = true;
        }
        if (!window.L) {
            loadLeaflet().then(() => this._maybeInitMap());
            return;
        }
        this._mapEl = el;
        try {
            this._map = window.L.map(el, {
                zoomControl: false, attributionControl: false,
                dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
            }).setView([lat, lng], 15);
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(this._map);
            window.L.marker([lat, lng], { title: el.dataset.name || '' }).addTo(this._map);
            setTimeout(() => { try { this._map && this._map.invalidateSize(); } catch {} }, 50);
        } catch (e) {
            // Leaflet inside shadow DOM occasionally throws on first init —
            // ignore; user can re-toggle the card.
        }
    }

    render() {
        if (!this._data || !this._data.place) {
            return html`<div class="person-empty">Ingen data.</div>`;
        }
        const d = this._data;
        const p = d.place;
        const k = p.key;
        const meetings = d.meetings || [];
        const open = !!d.open;
        const hasCoords = Number.isFinite(p.lat) && Number.isFinite(p.lng);
        const sorted = meetings.slice().sort((a, b) =>
            (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));

        return html`
            <div class="person-card ${open ? 'open' : ''}" data-card="place" data-key="${k}" id="pl-${k}">
                <div class="person-header">
                    <span class="person-chev">▶</span>
                    <span class="person-icon">📍</span>
                    <div class="person-name-wrap">
                        <span class="person-name">${p.name}</span>
                        ${p.address ? html`<span class="person-title">· ${p.address}</span>` : ''}
                        ${hasCoords ? html`<span class="person-handle">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</span>` : ''}
                    </div>
                    <span class="person-refs">${meetings.length} møter</span>
                    <button class="person-edit-btn" data-act="edit" title="Rediger">✏️</button>
                </div>
                <div class="person-details">
                    ${hasCoords ? html`
                        <div class="person-contact">
                            <span>📍 <a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}" target="_blank" rel="noopener">Vis på kart (OSM)</a></span>
                        </div>
                        <div class="place-mini-map" data-lat="${p.lat}" data-lng="${p.lng}" data-name="${p.name || ''}"></div>` : ''}
                    ${p.notes ? html`<div class="person-notes">${p.notes}</div>` : ''}
                    ${meetings.length ? html`
                        <div class="person-section">
                            <div class="person-section-h">Møter <span class="c">${meetings.length}</span></div>
                            ${sorted.map(m => html`
                                <div class="person-ref">
                                    <span class="person-ref-link" data-ref="meeting" data-id="${m.id || ''}" data-week="${m.week || ''}">📅 ${this._link(m.title || '')} <span class="ref-when">${m.date || ''}${m.start ? ' ' + m.start : ''}</span></span>
                                </div>`)}
                        </div>` : html`<div class="person-empty">Ingen møter knyttet til dette stedet ennå.</div>`}
                </div>
            </div>`;
    }
}

if (!customElements.get('place-card')) customElements.define('place-card', PlaceCard);
