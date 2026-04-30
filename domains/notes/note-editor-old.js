/**
 * <note-editor service="NotesService"> — minimal new/edit-note editor.
 *
 * Renders a week selector, filename input, textarea + <markdown-preview>
 * and Save button inside its own shadow DOM. Theming flows from the page
 * via inherited CSS custom properties (--accent, --text, --surface, …).
 *
 * Service contract:
 *   listWeeks()                  → string[] | { week|name }[]
 *   raw(week, file)              → existing markdown text
 *   save({ folder, file, content }) → { ok, path? }
 *
 * Attributes:
 *   week  — pre-select this ISO week (default: current)
 *   file  — pre-fill filename (default: empty)
 *   value — pre-fill textarea content
 *   service_preview — service name passed through to inner <markdown-preview>
 *
 * Public API:
 *   element.save() / element.getContent() / element.setContent(s)
 *
 * Events (cancelable, bubbling, composed):
 *   note-editor:saved   { folder, file, path }
 *   note-editor:cancel
 */
(function () {
    if (customElements.get('note-editor')) return;

    const { html, escapeHtml, isoWeek } = window.WN;

    const STYLES = `
        :host {
            display: block; padding: 16px 20px; box-sizing: border-box;
            color: var(--text-strong); font: inherit;
        }
        .ne-row {
            display: flex; gap: 10px; align-items: center;
            margin-bottom: 12px; flex-wrap: wrap;
        }
        label {
            font-size: 0.85em; color: var(--text-muted-warm);
            display: flex; flex-direction: column; gap: 4px;
        }
        select, input[type=text] {
            padding: 6px 10px; border: 1px solid var(--border);
            border-radius: 6px; background: var(--surface);
            color: var(--text-strong); font: inherit;
        }
        .ne-split {
            display: grid; grid-template-columns: 1fr 1fr;
            gap: 16px; align-items: stretch;
        }
        @media (max-width: 900px) { .ne-split { grid-template-columns: 1fr; } }
        textarea {
            width: 100%; min-height: 60vh; padding: 14px;
            border: 1px solid var(--border); border-radius: 8px;
            font-family: var(--font-mono);
            font-size: 0.95em; line-height: 1.5; resize: vertical; outline: none;
            box-sizing: border-box;
            background: var(--surface); color: var(--text-strong);
        }
        textarea:focus { border-color: var(--accent); }
        markdown-preview { min-height: 60vh; display: block; }
        .ne-actions {
            display: flex; gap: 10px; justify-content: flex-end;
            margin-top: 12px; align-items: center;
        }
        .ne-status {
            color: var(--text-muted);
            font-size: 0.9em; margin-right: auto;
        }
        button {
            padding: 8px 16px; border-radius: 6px; border: 1px solid transparent;
            cursor: pointer; font: inherit;
        }
        button.ne-save {
            background: var(--accent); color: var(--text-on-accent); font-weight: 600;
        }
        button.ne-save:hover { filter: brightness(0.95); }
        button.ne-cancel {
            background: var(--surface);
            border-color: var(--border);
            color: var(--text-muted);
        }
        h1.ne-title {
            font-family: var(--font-heading); font-weight: 400;
            color: var(--accent); margin: 0 0 16px;
        }
    `;

    class NoteEditor extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }); }

        get service() {
            const name = this.getAttribute('service');
            return name ? (window[name] || null) : null;
        }

        _setHTML(body) { this.shadowRoot.innerHTML = `<style>${STYLES}</style>${body}`; }

        connectedCallback() {
            if (!this.service) {
                const n = this.getAttribute('service');
                const why = !n ? 'missing "service" attribute' : `service "${n}" not registered on window`;
                console.error('<note-editor>:', why);
                this._setHTML(html`<p style="color: var(--danger);font-style:italic;margin:0">no service connected</p>`);
                return;
            }
            if (this._wired) return;
            this._wired = true;

            const m = (typeof window !== 'undefined' && window.location)
                ? window.location.pathname.match(/^\/editor\/([^/]+)\/([^/]+\.md)$/) : null;
            const urlWeek = m ? decodeURIComponent(m[1]) : '';
            const urlFile = m ? decodeURIComponent(m[2]) : '';
            const initialWeek = this.getAttribute('week') || urlWeek || isoWeek(new Date());
            const initialFile = this.getAttribute('file') || urlFile || '';
            const initialValue = this.getAttribute('value') || this.textContent || '';
            this._editing = !!(urlWeek && urlFile);
            const previewSrv = this.getAttribute('service_preview') || this.getAttribute('service');

            const titleText = this._editing ? `Rediger ${initialFile}` : 'Nytt notat';
            const markup = html`
                <h1 class="ne-title">${titleText}</h1>
                <div class="ne-row">
                    <label>
                        Uke
                        <select class="ne-week"><option value="${initialWeek}">${initialWeek}</option></select>
                    </label>
                    <label style="flex:1; min-width:240px">
                        Filnavn
                        <input type="text" class="ne-file" placeholder="notat.md" value="${initialFile}">
                    </label>
                </div>
                <div class="ne-split">
                    <textarea class="ne-content" placeholder="# Tittel&#10;&#10;Skriv markdown…">${initialValue}</textarea>
                    <markdown-preview class="ne-preview" placeholder="Forhåndsvisning vises her…" service="${previewSrv}"></markdown-preview>
                </div>
                <div class="ne-actions">
                    <span class="ne-status" aria-live="polite"></span>
                    <button type="button" class="ne-cancel">Avbryt</button>
                    <button type="button" class="ne-save">Lagre</button>
                </div>
            `;
            this.shadowRoot.innerHTML = `<style>${STYLES}</style>${markup}`;

            this._weekSel = this.shadowRoot.querySelector('.ne-week');
            this._fileEl = this.shadowRoot.querySelector('.ne-file');
            this._contentEl = this.shadowRoot.querySelector('.ne-content');
            this._previewEl = this.shadowRoot.querySelector('.ne-preview');
            this._statusEl = this.shadowRoot.querySelector('.ne-status');
            const saveBtn = this.shadowRoot.querySelector('.ne-save');
            const cancelBtn = this.shadowRoot.querySelector('.ne-cancel');

            this.loadWeeks(initialWeek);
            if (this._editing) this.loadExisting(initialWeek, initialFile);
            this._renderPreview();

            saveBtn.addEventListener('click', () => this.save());
            cancelBtn.addEventListener('click', () => this.cancel());

            this._contentEl.addEventListener('input', () => this._renderPreview());
            this._contentEl.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                    e.preventDefault();
                    this.save();
                }
            });

            setTimeout(() => this._contentEl.focus(), 0);
        }

        _renderPreview() {
            if (!this._previewEl) return;
            this._previewEl.value = this._contentEl ? this._contentEl.value : '';
        }

        async loadExisting(week, file) {
            try {
                const text = await this.service.raw(week, file);
                if (this._contentEl) {
                    this._contentEl.value = text;
                    this._renderPreview();
                }
            } catch (_) {}
        }

        async loadWeeks(selected) {
            try {
                const weeks = await this.service.listWeeks();
                const list = Array.isArray(weeks) ? weeks : [];
                const seen = new Set();
                if (selected) seen.add(selected);
                const opts = [];
                if (selected) opts.push(selected);
                list.forEach(w => {
                    const k = w.week || w.name || w;
                    if (k && !seen.has(k)) { seen.add(k); opts.push(k); }
                });
                opts.sort().reverse();
                this._weekSel.innerHTML = opts.map(w =>
                    html`<option value="${w}"${w === selected ? ' selected' : ''}>${w}</option>`
                ).join('');
            } catch (_) {}
        }

        getContent() { return this._contentEl ? this._contentEl.value : ''; }
        setContent(s) { if (this._contentEl) this._contentEl.value = s == null ? '' : String(s); }

        cancel() {
            const evt = new CustomEvent('note-editor:cancel', { bubbles: true, composed: true, cancelable: true });
            if (!this.dispatchEvent(evt)) return;
            if (window.spaNavigate && window.spaNavigate('/')) return;
            window.location.href = '/';
        }

        async save() {
            if (!this._contentEl) return;
            const folder = this._weekSel.value.trim();
            let file = this._fileEl.value.trim();
            const content = this._contentEl.value;
            if (!folder) { this._setStatus('Velg uke', true); return; }
            if (!file) {
                file = this._suggestFilename(content) || 'notat.md';
                this._fileEl.value = file;
            }
            if (!file.endsWith('.md')) file += '.md';
            this._setStatus('Lagrer…');
            try {
                const data = await this.service.save({ folder, file, content });
                this._setStatus('Lagret');
                const evt = new CustomEvent('note-editor:saved', {
                    bubbles: true, composed: true, cancelable: true,
                    detail: { folder, file, path: (data && data.path) || ('/' + folder + '/' + file) }
                });
                if (!this.dispatchEvent(evt)) return;
                if (window.spaNavigate && window.spaNavigate('/')) return;
                window.location.href = '/';
            } catch (e) {
                this._setStatus('Feil: ' + (e.message || e), true);
            }
        }

        _setStatus(msg, isError) {
            if (!this._statusEl) return;
            this._statusEl.textContent = msg || '';
            this._statusEl.style.color = isError ? 'var(--danger)' : '';
        }

        _suggestFilename(content) {
            const m = (content || '').match(/^\s*#\s+(.+)/);
            if (!m) return '';
            const slug = m[1].toLowerCase()
                .replace(/[æå]/g, 'a').replace(/ø/g, 'o')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 60);
            return slug ? slug + '.md' : '';
        }
    }

    customElements.define('note-editor', NoteEditor);
})();
