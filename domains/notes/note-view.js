/**
 * <note-view notes_service="…" path="YYYY-WNN/file.md">
 *
 * Modal overlay that loads and renders a note. Uses NotesService.renderHtml
 * via the service registry (set domain = 'notes' so the WNElement base
 * resolves the service via the `notes_service` attribute).
 *
 * Usage:
 *   const v = document.createElement('note-view');
 *   v.setAttribute('notes_service', 'NotesService');
 *   v.open('2026-W18/standup.md');           // shows modal, fetches, renders
 *   document.body.appendChild(v);
 *
 * Or declarative:
 *   <note-view notes_service="NotesService" path="2026-W18/standup.md" open></note-view>
 *
 * Events (cancelable, bubbling, composed):
 *   note-view:close   — fired when the overlay closes
 */
import { WNElement, html, unsafeHTML, escapeHtml } from './_shared.js';

const STYLES = `
    :host { display: contents; }
    .nv-backdrop {
        position: fixed; inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9000;
        display: flex; align-items: flex-start; justify-content: center;
        padding: 5vh 16px;
        overflow-y: auto;
        animation: nvFade 0.15s ease-out;
    }
    @keyframes nvFade { from { opacity: 0; } to { opacity: 1; } }
    .nv-card {
        background: var(--surface);
        color: var(--text-strong);
        border-radius: 10px;
        max-width: 900px; width: 100%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        display: flex; flex-direction: column;
        max-height: 90vh;
    }
    .nv-head {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-soft);
    }
    .nv-title {
        flex: 1; font-family: var(--font-heading); font-weight: 600;
        color: var(--accent); margin: 0; font-size: 1.05em;
        word-break: break-word;
    }
    .nv-close {
        background: transparent; border: 1px solid var(--border);
        color: var(--text-muted); cursor: pointer;
        border-radius: 6px; padding: 4px 10px; font: inherit;
    }
    .nv-close:hover { color: var(--accent); border-color: var(--accent); }
    .nv-body {
        padding: 16px 20px; overflow-y: auto; flex: 1;
        line-height: 1.55;
    }
    .nv-body :first-child { margin-top: 0; }
    .nv-loading, .nv-error {
        color: var(--text-muted); font-style: italic; padding: 16px 0;
    }
    .nv-error { color: var(--danger, #c53030); }
`;

class NoteView extends WNElement {
    static get domain() { return 'notes'; }
    static get observedAttributes() { return ['path', 'open']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this._onKey = (ev) => {
            if (this._isOpen && ev.key === 'Escape') {
                ev.preventDefault();
                this.close();
            }
        };
        document.addEventListener('keydown', this._onKey);
        this.shadowRoot.addEventListener('click', (ev) => {
            const t = ev.target;
            if (!t) return;
            if ((t.dataset && t.dataset.action === 'close') || (t.classList && t.classList.contains('nv-backdrop'))) {
                this.close();
            }
        });
        if (this.hasAttribute('open')) {
            const p = this.getAttribute('path');
            if (p) this.open(p);
        }
    }

    disconnectedCallback() {
        if (this._onKey) document.removeEventListener('keydown', this._onKey);
    }

    attributeChangedCallback(name, oldV, newV) {
        super.attributeChangedCallback(name, oldV, newV);
        if (oldV === newV) return;
        if (name === 'path' && this._isOpen && newV) {
            this._load(newV);
        } else if (name === 'open') {
            if (this.hasAttribute('open')) {
                const p = this.getAttribute('path');
                if (p) this.open(p);
            } else {
                this.close();
            }
        }
    }

    open(path) {
        if (path) this.setAttribute('path', path);
        this._isOpen = true;
        if (!this.hasAttribute('open')) this.setAttribute('open', '');
        this._html = null;
        this._error = null;
        this._loading = true;
        this.requestRender();
        const p = this.getAttribute('path') || '';
        this._load(p);
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this.requestRender();
        this.dispatchEvent(new CustomEvent('note-view:close', {
            bubbles: true, cancelable: true, composed: true,
            detail: { path: this.getAttribute('path') || '' }
        }));
    }

    _parsePath(p) {
        if (!p) return null;
        const s = String(p).replace(/^\/+/, '');
        const idx = s.indexOf('/');
        if (idx < 0) return null;
        return { week: s.slice(0, idx), file: s.slice(idx + 1) };
    }

    async _load(path) {
        const parts = this._parsePath(path);
        if (!parts) {
            this._loading = false;
            this._error = 'Ugyldig sti';
            this.requestRender();
            return;
        }
        if (!this.service || !this.service.renderHtml) {
            this._loading = false;
            this._error = 'Ingen notes_service tilkoblet';
            this.requestRender();
            return;
        }
        this._loading = true;
        this._error = null;
        this.requestRender();
        const reqId = ++this._reqSeq || (this._reqSeq = 1);
        try {
            const html = await this.service.renderHtml(parts.week, parts.file);
            if (this._reqSeq !== reqId) return;
            this._html = html;
            this._loading = false;
            this.requestRender();
        } catch (e) {
            if (this._reqSeq !== reqId) return;
            this._loading = false;
            this._error = 'Kunne ikke laste: ' + (e.message || e);
            this.requestRender();
        }
    }

    render() {
        if (!this._isOpen) return html``;
        const path = this.getAttribute('path') || '';
        return html`
            <div class="nv-backdrop">
                <div class="nv-card" role="dialog" aria-modal="true">
                    <div class="nv-head">
                        <h2 class="nv-title">${escapeHtml(path)}</h2>
                        <button type="button" class="nv-close" data-action="close">✕</button>
                    </div>
                    <div class="nv-body">
                        ${this._loading ? html`<div class="nv-loading">Laster…</div>` : ''}
                        ${this._error ? html`<div class="nv-error">${escapeHtml(this._error)}</div>` : ''}
                        ${(!this._loading && !this._error && this._html) ? unsafeHTML(this._html) : ''}
                    </div>
                </div>
            </div>
        `;
    }
}

if (!customElements.get('note-view')) customElements.define('note-view', NoteView);
