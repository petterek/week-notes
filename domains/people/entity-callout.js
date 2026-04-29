/**
 * <entity-callout>
 *
 * Dumb floating tooltip that displays a read-only summary of a person,
 * company or place. The host (e.g. <people-page>) owns event listening,
 * entity resolution and positioning and drives the callout via two
 * methods:
 *
 *   const cal = document.createElement('entity-callout');
 *   cal.setData({ kind, entity, key, x, y });   // show
 *   cal.hide();                                 // hide
 *
 * `kind`   — 'person' | 'company' | 'place'.
 * `entity` — the resolved object, or null/undefined to render a "missing"
 *            message based on `key`.
 * `key`    — fallback identifier used in the missing message and as the
 *            handle (`@<key>`) when the entity has no key of its own.
 * `x`, `y` — viewport coordinates (clientX/clientY style). The callout
 *            positions itself near them, flipping to stay on screen.
 *
 * The component is presentational only — it dispatches no events,
 * subscribes to nothing, and reads no services.
 *
 * Mount one instance per host; place anywhere in the host's tree. Styled
 * `position: fixed`, the callout floats above any page chrome.
 */
import { WNElement, html, escapeHtml } from '../../components/_shared.js';

const STYLES = `
    :host { position: fixed; z-index: 2000; pointer-events: none; opacity: 0; transition: opacity 0.1s; left: 0; top: 0; }
    :host([visible]) { opacity: 1; }
    .ec { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px var(--shadow); padding: 12px 16px; font-size: 0.85em; color: var(--text-strong); max-width: 320px; }
    .ec-name { font-weight: 700; color: var(--accent); font-size: 1.05em; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; }
    .ec-handle { font-size: 0.78em; color: var(--text-subtle); font-weight: 400; }
    .ec-title { color: var(--text-muted); font-style: italic; margin-bottom: 4px; }
    .ec-row { color: var(--text-muted-warm); font-size: 0.9em; padding: 1px 0; }
    .ec-notes { color: var(--text-muted); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-soft); white-space: pre-wrap; font-style: italic; }
    .ec-missing { color: var(--text-subtle); font-style: italic; }
    .ec-badge { font-size: 0.72em; padding: 1px 6px; border-radius: 8px; background: var(--surface-alt); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
`;

function clip(s, n) { s = s || ''; return s.length > n ? s.slice(0, n) + '…' : s; }

function renderPerson(p, key) {
    if (!p) return html`<div class="ec-missing">Ingen oppføring for @${escapeHtml(key || '')}</div>`;
    const name = p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : (p.name || key || '');
    const company = p.company || null;
    return html`
        <div class="ec-name">${p.inactive ? '👻' : '👤'} ${name} <span class="ec-handle">@${p.key || key || ''}</span></div>
        ${p.title ? html`<div class="ec-title">${p.title}</div>` : ''}
        ${p.inactive ? html`<div class="ec-row"><span class="ec-badge">inaktiv</span></div>` : ''}
        ${company ? html`<div class="ec-row">🏢 ${company.name || company.key || ''}</div>` : ''}
        ${p.email ? html`<div class="ec-row">✉️ ${p.email}</div>` : ''}
        ${p.phone ? html`<div class="ec-row">📞 ${p.phone}</div>` : ''}
        ${p.notes ? html`<div class="ec-notes">${clip(p.notes, 160)}</div>` : ''}
    `;
}

function renderCompany(c, key) {
    if (!c) return html`<div class="ec-missing">Ingen oppføring for @${escapeHtml(key || '')}</div>`;
    return html`
        <div class="ec-name">🏢 ${c.name || key || ''} <span class="ec-handle">@${c.key || key || ''}</span></div>
        ${c.url ? html`<div class="ec-row">🔗 ${c.url}</div>` : ''}
        ${c.address ? html`<div class="ec-row">📍 ${c.address}</div>` : ''}
        ${c.orgnr ? html`<div class="ec-row">Org.nr: ${c.orgnr}</div>` : ''}
        ${c.notes ? html`<div class="ec-notes">${clip(c.notes, 160)}</div>` : ''}
    `;
}

function renderPlace(p, key) {
    if (!p) return html`<div class="ec-missing">Ingen oppføring for ${escapeHtml(key || '')}</div>`;
    const hasCoords = Number.isFinite(p.lat) && Number.isFinite(p.lng);
    return html`
        <div class="ec-name">📍 ${p.name || key || ''} <span class="ec-handle">@${p.key || key || ''}</span></div>
        ${p.address ? html`<div class="ec-row">${p.address}</div>` : ''}
        ${hasCoords ? html`<div class="ec-row">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</div>` : ''}
        ${p.notes ? html`<div class="ec-notes">${clip(p.notes, 160)}</div>` : ''}
    `;
}

class EntityCallout extends WNElement {
    static get domain() { return 'people'; }
    static get observedAttributes() { return []; }

    css() { return STYLES; }
    render() { return html`<div class="ec"></div>`; }

    setData(d) {
        d = d || {};
        const kind = d.kind, key = d.key;
        const entity = d.entity;
        let markup = '';
        if (kind === 'person')  markup = renderPerson(entity, key);
        else if (kind === 'company') markup = renderCompany(entity, key);
        else if (kind === 'place')   markup = renderPlace(entity, key);
        else return;
        const box = this.shadowRoot && this.shadowRoot.querySelector('.ec');
        if (!box) return;
        box.innerHTML = markup;
        this.setAttribute('visible', '');
        if (Number.isFinite(d.x) && Number.isFinite(d.y)) this._position(d.x, d.y);
    }

    hide() { this.removeAttribute('visible'); }

    position(x, y) {
        if (Number.isFinite(x) && Number.isFinite(y)) this._position(x, y);
    }

    _position(mx, my) {
        const r = 18, vw = window.innerWidth, vh = window.innerHeight;
        const w = this.offsetWidth, h = this.offsetHeight;
        let x = mx + r, y = my + r;
        if (x + w > vw - 8) x = mx - w - r;
        if (y + h > vh - 8) y = my - h - r;
        if (x < 8) x = 8;
        if (y < 8) y = 8;
        this.style.left = `${x}px`;
        this.style.top  = `${y}px`;
    }
}

if (!customElements.get('entity-callout')) customElements.define('entity-callout', EntityCallout);
