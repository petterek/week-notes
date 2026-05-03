/**
 * <note-meta-panel notes_service="NotesService" path="YYYY-WNN/file.md">
 *
 * Self-loading meta inspector with two tabs:
 *   • Strukturert — renders the existing <note-meta-view>
 *   • Rå JSON     — pretty-printed sidecar JSON in a <pre>
 *
 * Domain: notes. Service must implement meta(week, file).
 *
 * Attributes:
 *   notes_service  — global name of the NotesService (resolved by WNElement)
 *   path           — "YYYY-WNN/file.md" (preferred)
 *   week, file     — alternative to path; takes precedence if both set
 *   tab            — initial tab: "structured" (default) or "raw"
 *
 * Public API:
 *   el.reload()    — re-fetches the sidecar
 */
import { WNElement, html, escapeHtml } from './_shared.js';
import './note-meta-view.js';

const STYLES = `
    :host { display: block; }
    .nmp-tabs {
        display: flex; gap: 4px;
        border-bottom: 1px solid var(--border-soft);
        margin-bottom: 10px;
    }
    .nmp-tab {
        background: transparent; border: 1px solid transparent; border-bottom: none;
        color: var(--text-muted); cursor: pointer;
        padding: 6px 14px; border-radius: 6px 6px 0 0; font: inherit;
        margin-bottom: -1px;
    }
    .nmp-tab[aria-selected="true"] {
        background: var(--surface);
        border-color: var(--border-soft);
        color: var(--accent); font-weight: 600;
    }
    .nmp-loading, .nmp-error {
        color: var(--text-muted); font-style: italic; padding: 10px 4px;
    }
    .nmp-error { color: var(--danger, #c53030); }
    .nmp-raw {
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

class NoteMetaPanel extends WNElement {
    static get domain() { return 'notes'; }
    static get observedAttributes() { return ['path', 'week', 'file', 'tab']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (!this._tab) this._tab = this.getAttribute('tab') === 'raw' ? 'raw' : 'structured';
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (ev) => {
            const t = ev.target;
            const tabBtn = t && t.closest && t.closest('.nmp-tab');
            if (tabBtn && tabBtn.dataset && tabBtn.dataset.tab) {
                this._tab = tabBtn.dataset.tab;
                this.requestRender();
            }
        });
        this._load();
    }

    attributeChangedCallback(name, oldV, newV) {
        super.attributeChangedCallback(name, oldV, newV);
        if (oldV === newV) return;
        if (name === 'tab') {
            this._tab = newV === 'raw' ? 'raw' : 'structured';
            this.requestRender();
        } else if (this.isConnected) {
            this._load();
        }
    }

    reload() { this._load(); }

    _resolve() {
        const path = this.getAttribute('path') || '';
        const week = this.getAttribute('week') || '';
        const file = this.getAttribute('file') || '';
        if (week && file) return { week, file };
        if (path) {
            const s = String(path).replace(/^\/+/, '');
            const idx = s.indexOf('/');
            if (idx > 0) return { week: s.slice(0, idx), file: s.slice(idx + 1) };
        }
        return null;
    }

    async _load() {
        const parts = this._resolve();
        if (!parts) {
            this._meta = null; this._error = null; this._loading = false;
            this.requestRender();
            return;
        }
        if (!this.service || !this.service.meta) {
            this._error = 'Ingen notes_service tilkoblet';
            this._loading = false;
            this.requestRender();
            return;
        }
        this._loading = true;
        this._error = null;
        this.requestRender();
        const reqId = ++this._reqSeq || (this._reqSeq = 1);
        try {
            const meta = await this.service.meta(parts.week, parts.file);
            if (this._reqSeq !== reqId) return;
            this._meta = Object.assign({ week: parts.week, file: parts.file }, meta || {});
            this._loading = false;
            this.requestRender();
        } catch (e) {
            if (this._reqSeq !== reqId) return;
            this._error = 'Kunne ikke laste meta: ' + (e.message || e);
            this._loading = false;
            this.requestRender();
        }
    }

    render() {
        const tab = this._tab || 'structured';
        return html`
            <div class="nmp-tabs" role="tablist">
                <button type="button" class="nmp-tab" role="tab" data-tab="structured" aria-selected="${tab === 'structured' ? 'true' : 'false'}">Strukturert</button>
                <button type="button" class="nmp-tab" role="tab" data-tab="raw" aria-selected="${tab === 'raw' ? 'true' : 'false'}">Rå JSON</button>
            </div>
            ${this._error ? html`<div class="nmp-error">${escapeHtml(this._error)}</div>` : ''}
            ${this._loading ? html`<div class="nmp-loading">Laster…</div>` : ''}
            ${(!this._error && !this._loading && this._meta) ? (
                tab === 'raw'
                    ? html`<pre class="nmp-raw">${escapeHtml(JSON.stringify(this._meta, null, 2))}</pre>`
                    : html`<note-meta-view></note-meta-view>`
            ) : ''}
        `;
    }

    requestRender() {
        super.requestRender();
        const nmv = this.shadowRoot && this.shadowRoot.querySelector('note-meta-view');
        if (nmv && this._meta) nmv.meta = this._meta;
    }

    updated() {
        const nmv = this.shadowRoot && this.shadowRoot.querySelector('note-meta-view');
        if (nmv && this._meta) nmv.meta = this._meta;
    }
}

if (!customElements.get('note-meta-panel')) customElements.define('note-meta-panel', NoteMetaPanel);
