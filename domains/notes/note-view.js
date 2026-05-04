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
    .nv-tabs {
        display: flex; gap: 4px;
        padding: 0 16px;
        border-bottom: 1px solid var(--border-soft);
    }
    .nv-tab {
        background: transparent; border: 1px solid transparent; border-bottom: none;
        color: var(--text-muted); cursor: pointer;
        padding: 8px 14px; border-radius: 6px 6px 0 0; font: inherit;
        margin-bottom: -1px;
    }
    .nv-tab[aria-selected="true"] {
        background: var(--surface);
        border-color: var(--border-soft);
        color: var(--accent); font-weight: 600;
    }
    .nv-meta {
        margin: 0; padding: 12px 14px;
        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
        font-size: 0.85em; line-height: 1.45;
        background: var(--surface-alt, #f6f6f6);
        border: 1px solid var(--border-soft);
        border-radius: 6px;
        white-space: pre-wrap; word-break: break-word;
        color: var(--text-strong);
    }
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
                return;
            }
            if (t.dataset && t.dataset.action === 'copy') {
                this.copyText();
                return;
            }
            const tabBtn = t.closest && t.closest('.nv-tab');
            if (tabBtn && tabBtn.dataset && tabBtn.dataset.tab) {
                this._tab = tabBtn.dataset.tab;
                this.requestRender();
                if (this._tab === 'meta' && this._meta == null && !this._metaError) {
                    this._loadMeta();
                }
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
        this._meta = null;
        this._metaError = null;
        this._tab = 'content';
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

    async copyText() {
        const parts = this._parsePath(this.getAttribute('path') || '');
        if (!parts || !this.service || !this.service.raw) return;
        try {
            const text = await this.service.raw(parts.week, parts.file);
            const htmlOut = this._html || '';
            const plain = text || '';
            let copied = false;
            if (navigator.clipboard && typeof window.ClipboardItem === 'function' && navigator.clipboard.write) {
                try {
                    const item = new ClipboardItem({
                        'text/html': new Blob([htmlOut], { type: 'text/html' }),
                        'text/plain': new Blob([plain], { type: 'text/plain' }),
                    });
                    await navigator.clipboard.write([item]);
                    copied = true;
                } catch { /* fall through to text fallback */ }
            }
            if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(plain);
                copied = true;
            }
            if (!copied) {
                const ta = document.createElement('textarea');
                ta.value = plain;
                ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
            }
            this._copied = true;
            this.requestRender();
            clearTimeout(this._copiedTimer);
            this._copiedTimer = setTimeout(() => {
                this._copied = false;
                this.requestRender();
            }, 1500);
            this.dispatchEvent(new CustomEvent('note-view:copy', {
                bubbles: true, composed: true,
                detail: { path: this.getAttribute('path') || '' }
            }));
        } catch (e) {
            this._error = 'Kunne ikke kopiere: ' + (e.message || e);
            this.requestRender();
        }
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

    async _loadMeta() {
        const parts = this._parsePath(this.getAttribute('path') || '');
        if (!parts) { this._metaError = 'Ugyldig sti'; this.requestRender(); return; }
        if (!this.service || !this.service.meta) {
            this._metaError = 'Ingen meta-tjeneste tilkoblet'; this.requestRender(); return;
        }
        try {
            const meta = await this.service.meta(parts.week, parts.file);
            this._meta = meta || {};
            this._metaError = null;
        } catch (e) {
            this._metaError = 'Kunne ikke laste meta: ' + (e.message || e);
            this._meta = null;
        }
        this.requestRender();
    }

    render() {
        if (!this._isOpen) return html``;
        const path = this.getAttribute('path') || '';
        const tab = this._tab || 'content';
        return html`
            <div class="nv-backdrop">
                <div class="nv-card" role="dialog" aria-modal="true">
                    <div class="nv-head">
                        <h2 class="nv-title">${escapeHtml(path)}</h2>
                        <button type="button" class="nv-close" data-action="copy" title="Kopier (HTML, med markdown-fallback)">${this._copied ? '✓ Kopiert' : '📋 Kopier'}</button>
                        <button type="button" class="nv-close" data-action="close">✕</button>
                    </div>
                    <div class="nv-tabs" role="tablist">
                        <button type="button" class="nv-tab" role="tab" data-tab="content" aria-selected="${tab === 'content' ? 'true' : 'false'}">Innhold</button>
                        <button type="button" class="nv-tab" role="tab" data-tab="meta" aria-selected="${tab === 'meta' ? 'true' : 'false'}">Meta</button>
                    </div>
                    <div class="nv-body">
                        ${tab === 'content' ? html`
                            ${this._loading ? html`<div class="nv-loading">Laster…</div>` : ''}
                            ${this._error ? html`<div class="nv-error">${escapeHtml(this._error)}</div>` : ''}
                            ${(!this._loading && !this._error && this._html) ? unsafeHTML(this._html) : ''}
                        ` : ''}
                        ${tab === 'meta' ? html`
                            ${this._metaError ? html`<div class="nv-error">${escapeHtml(this._metaError)}</div>` : ''}
                            ${(!this._metaError && this._meta == null) ? html`<div class="nv-loading">Laster…</div>` : ''}
                            ${(!this._metaError && this._meta != null) ? html`<pre class="nv-meta">${JSON.stringify(this._meta, null, 2)}</pre>` : ''}
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }
}

if (!customElements.get('note-view')) customElements.define('note-view', NoteView);
