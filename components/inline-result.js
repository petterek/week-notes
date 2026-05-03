/**
 * <inline-result result-id="<id>">
 *
 * Renders a styled chip for a result referenced inline in a saved note.
 * Mirror of <inline-task> but for results — emitted by linkMentions for
 * the reference form `[[?<id>]]` (produced when the server sees `[[X]]`
 * on explicit save and creates a new result).
 *
 * Click navigates to /results#r-<id>. Result text is fetched lazily
 * from /api/results (one fetch shared across instances).
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const STYLES = `
    :host {
        display: inline;
        font: inherit;
    }
    .pill {
        display: inline-block;
        padding: 0 6px;
        border-radius: 4px;
        font-size: 0.92em;
        font-weight: 600;
        line-height: 1.35;
        white-space: pre-wrap;
        vertical-align: baseline;
        background: var(--info-soft, #d6e7ff);
        color: var(--info-strong, #1a4c8b);
        border: 1px solid var(--info, #2f7ad9);
        cursor: pointer;
        text-decoration: none;
    }
    .pill:hover { filter: brightness(0.97); }
    .pill.missing {
        background: var(--danger-soft, #fde8e8);
        color: var(--danger, #c0392b);
        border-color: var(--danger, #c0392b);
        cursor: default;
    }
    .pill.busy { opacity: 0.6; }
`;

let _resultCache = null;
let _resultPromise = null;
const _instances = new Set();

function loadResultMap() {
    if (_resultCache) return Promise.resolve(_resultCache);
    if (_resultPromise) return _resultPromise;
    _resultPromise = fetch('/api/results').then(r => r.json()).then(arr => {
        const map = {};
        if (Array.isArray(arr)) arr.forEach(r => { if (r && r.id) map[r.id] = r; });
        _resultCache = map;
        _resultPromise = null;
        for (const inst of _instances) inst.requestRender();
        return map;
    }).catch(() => {
        _resultPromise = null;
        return {};
    });
    return _resultPromise;
}

class InlineResult extends WNElement {
    static get observedAttributes() { return ['result-id']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        _instances.add(this);
        if (!this._wired) {
            this._wired = true;
            this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
        }
        if (!_resultCache) loadResultMap();
    }

    disconnectedCallback() {
        _instances.delete(this);
    }

    _onClick(e) {
        const id = this.getAttribute('result-id') || '';
        const r = (_resultCache && id) ? _resultCache[id] : null;
        if (!r) return;
        e.preventDefault();
        // Bubbling event for SPA navigation; falls back to direct nav.
        const navEvent = new CustomEvent('result:navigate', {
            bubbles: true, composed: true, detail: { id },
        });
        this.dispatchEvent(navEvent);
        if (!navEvent.defaultPrevented) {
            window.location.href = `/results#r-${encodeURIComponent(id)}`;
        }
    }

    render() {
        const id = this.getAttribute('result-id') || '';
        const r = (_resultCache && id) ? _resultCache[id] : null;
        if (!_resultCache) return html`<span class="pill busy">…</span>`;
        if (!r) return html`<span class="pill missing" title="Resultat ikke funnet">[[?${escapeHtml(id)}]]</span>`;
        return html`<span class="pill" title="Resultat — klikk for å åpne">🏁 ${escapeHtml(r.text || id)}</span>`;
    }
}

if (!customElements.get('inline-result')) customElements.define('inline-result', InlineResult);
