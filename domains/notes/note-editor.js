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
 *   preview_service — service path passed through to inner <markdown-preview>
 *                     (defaults to notes_service)
 *
 * Public API:
 *   element.save() / element.getContent() / element.setContent(s)
 *
 * Events (cancelable, bubbling, composed):
 *   note-editor:saved   { folder, file, path }
 *   note-editor:cancel
 */
import { WNElement, html, escapeHtml, isoWeek } from './_shared.js';

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
    .ne-split.detached { grid-template-columns: 1fr; }
    @media (max-width: 900px) { .ne-split { grid-template-columns: 1fr; } }
    textarea {
        width: 100%; min-height: 50vh; padding: 14px;
        border: 1px solid var(--border); border-radius: 8px;
        font-family: var(--font-mono);
        font-size: 0.95em; line-height: 1.5; resize: vertical; outline: none;
        box-sizing: border-box;
        background: var(--surface); color: var(--text-strong);
    }
    textarea:focus { border-color: var(--accent); }
    markdown-preview { min-height: 50vh; display: block; }
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
    button.ne-detach {
        background: var(--surface);
        border-color: var(--border);
        color: var(--text-muted);
    }
    button.ne-detach:hover { color: var(--accent); border-color: var(--accent); }
    button.ne-detach.detached {
        padding: 4px 10px; font-size: 0.85em;
        background: var(--accent-soft); border-color: var(--accent);
        color: var(--accent);
    }
    .ne-preview-wrap { position: relative; display: flex; flex-direction: column; min-height: 50vh; }
    .ne-preview-wrap[hidden] { display: none; }
    .ne-preview-wrap markdown-preview { flex: 1; }
    .ne-preview-detached { display: none; }
    h1.ne-title {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); margin: 0 0 16px;
    }
    label.ne-check {
        flex-direction: row; align-items: center; gap: 6px;
        cursor: pointer; user-select: none;
    }
    label.ne-check input { margin: 0; }
    .ne-pres { display: none; }
    .ne-row-taxonomy.is-presentation .ne-pres { display: flex; }
    .ne-meta-footer {
        margin-top: 10px; font-size: 0.8em; color: var(--text-subtle);
        display: flex; gap: 16px; flex-wrap: wrap;
    }
    .ne-meta-footer span strong { color: var(--text-muted); font-weight: 500; }
`;

const NOTE_TYPES = [
    ['note', '📝 Notat'],
    ['meeting', '🤝 Møte'],
    ['task', '🎯 Oppgave'],
    ['presentation', '🎤 Presentasjon'],
];

const PRESENTATION_STYLES = ['paper', 'noir', 'klassisk', 'levende', 'minimal', 'matrix', 'nav'];

class NoteEditor extends WNElement {
    static get domain() { return 'notes'; }
    static get observedAttributes() { return ['week', 'file', 'value']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (!this.service) return;
        if (this._wired) return;
        this._wired = true;

        const m = (typeof window !== 'undefined' && window.location)
            ? window.location.pathname.match(/^\/editor\/([^/]+)\/([^/]+\.md)$/) : null;
        const urlWeek = m ? decodeURIComponent(m[1]) : '';
        const urlFile = m ? decodeURIComponent(m[2]) : '';
        this._initialWeek = this.getAttribute('week') || urlWeek || isoWeek(new Date());
        this._initialFile = this.getAttribute('file') || urlFile || '';
        this._initialValue = this.getAttribute('value') || this.textContent || '';
        this._initialThemes = [];
        this._initialType = 'note';
        this._initialPinned = false;
        this._initialPresStyle = '';
        this._initialCreated = '';
        this._initialModified = '';
        this._editing = !!(urlWeek && urlFile);

        // Load once, then wire events
        this._loadEditor();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        // Don't reload editor on attribute changes after initial setup
    }

    render() {
        if (!this.service) return this.renderNoService();
        const previewSrv = this.getAttribute('preview_service') || this.getAttribute('notes_service');
        const titleText = this._editing ? `Rediger ${this._initialFile}` : 'Nytt notat';
        return html`
            <h1 class="ne-title">${titleText}</h1>
            <div class="ne-row ne-row-identity">
                <label>
                    Uke
                    <select class="ne-week"><option value="${this._initialWeek}">${this._initialWeek}</option></select>
                </label>
                <label style="flex:1; min-width:240px">
                    Filnavn
                    <input type="text" class="ne-file" placeholder="notat.md" value="${this._initialFile}">
                </label>
                <label>
                    Type
                    <select class="ne-type">
                        ${NOTE_TYPES.map(([v, lbl]) => html`<option value="${v}"${v === this._initialType ? ' selected' : ''}>${lbl}</option>`)}
                    </select>
                </label>
                <label class="ne-check" title="Pin notatet til toppen av uka">
                    <input type="checkbox" class="ne-pinned"${this._initialPinned ? ' checked' : ''}>
                    📌 Festet
                </label>
            </div>
            <div class="ne-row ne-row-taxonomy${this._initialType === 'presentation' ? ' is-presentation' : ''}">
                <label style="flex:1; min-width:240px">
                    Tema (kommaseparert)
                    <input type="text" class="ne-themes" placeholder="f.eks. planlegging, retro" value="${escapeHtml((this._initialThemes || []).join(', '))}">
                </label>
                <label class="ne-pres">
                    Stil
                    <select class="ne-pres-style">
                        ${PRESENTATION_STYLES.map(s => html`<option value="${s}"${s === this._initialPresStyle ? ' selected' : ''}>${s}</option>`)}
                    </select>
                </label>
            </div>
            <div class="ne-split">
                <textarea class="ne-content" placeholder="# Tittel&#10;&#10;Skriv markdown…">${this._initialValue}</textarea>
                <div class="ne-preview-wrap">
                    <markdown-preview class="ne-preview" placeholder="Forhåndsvisning vises her…" notes_service="${previewSrv}"></markdown-preview>
                    <div class="ne-preview-detached" hidden>
                        <div>
                            📤 Forhåndsvisning er åpnet i eget vindu.
                            <br><button type="button" class="ne-reattach">Koble tilbake</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="ne-actions">
                <span class="ne-status" aria-live="polite"></span>
                <button type="button" class="ne-detach" title="Åpne forhåndsvisning i eget vindu">📤 Detach</button>
                <button type="button" class="ne-cancel">Avbryt</button>
                <button type="button" class="ne-save">Lagre</button>
                <button type="button" class="ne-save-close">Lagre og lukk</button>
            </div>
            <div class="ne-meta-footer">
                ${this._initialCreated ? html`<span><strong>Opprettet:</strong> ${this._fmtDate(this._initialCreated)}</span>` : ''}
                ${this._initialModified ? html`<span><strong>Endret:</strong> ${this._fmtDate(this._initialModified)}</span>` : ''}
            </div>
        `;
    }

    async _loadEditor() {
        this.requestRender();
        // Wait for render
        await new Promise(resolve => setTimeout(resolve, 0));

        this._weekSel = this.shadowRoot.querySelector('.ne-week');
        this._fileEl = this.shadowRoot.querySelector('.ne-file');
        this._themesEl = this.shadowRoot.querySelector('.ne-themes');
        this._typeEl = this.shadowRoot.querySelector('.ne-type');
        this._presStyleEl = this.shadowRoot.querySelector('.ne-pres-style');
        this._pinnedEl = this.shadowRoot.querySelector('.ne-pinned');
        this._taxonomyRow = this.shadowRoot.querySelector('.ne-row-taxonomy');
        this._contentEl = this.shadowRoot.querySelector('.ne-content');
        this._previewEl = this.shadowRoot.querySelector('.ne-preview');
        this._previewWrap = this.shadowRoot.querySelector('.ne-preview-wrap');
        this._detachedPanel = this.shadowRoot.querySelector('.ne-preview-detached');
        this._detachBtn = this.shadowRoot.querySelector('.ne-detach');
        this._reattachBtn = this.shadowRoot.querySelector('.ne-reattach');
        this._statusEl = this.shadowRoot.querySelector('.ne-status');
        this._saveBtn = this.shadowRoot.querySelector('.ne-save');
        const saveCloseBtn = this.shadowRoot.querySelector('.ne-save-close');
        const cancelBtn = this.shadowRoot.querySelector('.ne-cancel');

        this.loadWeeks(this._initialWeek);
        if (this._editing) this.loadExisting(this._initialWeek, this._initialFile);
        this._renderPreview();

        this._saveBtn.addEventListener('click', () => this.save(false));
        if (saveCloseBtn) saveCloseBtn.addEventListener('click', () => this.save(true));
        cancelBtn.addEventListener('click', () => this.cancel());
        this._detachBtn.addEventListener('click', () => {
            if (this._detached) this._reattachPreview();
            else this._detachPreview();
        });
        this._reattachBtn.addEventListener('click', () => this._reattachPreview());

        const markDirty = () => this._markDirty();
        this._contentEl.addEventListener('input', () => { this._renderPreview(); markDirty(); });
        this._fileEl.addEventListener('input', () => { if (this._detached) this._publishPreview(); markDirty(); });
        if (this._themesEl) this._themesEl.addEventListener('input', markDirty);
        if (this._pinnedEl) this._pinnedEl.addEventListener('change', markDirty);
        if (this._presStyleEl) this._presStyleEl.addEventListener('change', markDirty);
        if (this._typeEl) {
            this._typeEl.addEventListener('change', () => {
                if (this._taxonomyRow) this._taxonomyRow.classList.toggle('is-presentation', this._typeEl.value === 'presentation');
                markDirty();
            });
        }
        this._contentEl.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                this.save(false);
            }
        });

        setTimeout(() => this._contentEl.focus(), 0);
    }

    _markDirty() {
        this._dirty = true;
        if (this._countdownTimer) return;
        this._countdownLeft = 30;
        this._updateSaveBtnLabel();
        this._countdownTimer = setInterval(() => {
            this._countdownLeft -= 1;
            if (this._countdownLeft <= 0) {
                this._stopCountdown();
                if (this._dirty && !this._saving) this.save(false, true);
                return;
            }
            this._updateSaveBtnLabel();
        }, 1000);
    }

    _stopCountdown() {
        if (this._countdownTimer) {
            clearInterval(this._countdownTimer);
            this._countdownTimer = null;
        }
        this._countdownLeft = 0;
        this._updateSaveBtnLabel();
    }

    _updateSaveBtnLabel() {
        if (!this._saveBtn) return;
        if (this._countdownTimer && this._countdownLeft > 0) {
            this._saveBtn.textContent = `Lagre(${this._countdownLeft})`;
        } else {
            this._saveBtn.textContent = 'Lagre';
        }
    }

    _renderPreview() {
        if (this._detached) {
            this._publishPreview();
            return;
        }
        if (!this._previewEl) return;
        this._previewEl.value = this._contentEl ? this._contentEl.value : '';
    }

    _publishPreview() {
        if (!this._pipRoot || !this._pipWindow) return;
        const md = this._contentEl ? this._contentEl.value : '';
        try {
            const m = this._pipWindow.marked;
            this._pipRoot.innerHTML = (m && m.parse) ? m.parse(md) : escapeHtml(md);
        } catch (_) {}
    }

    async _detachPreview() {
        if (this._detached) return;
        if (!window.documentPictureInPicture || !window.documentPictureInPicture.requestWindow) {
            this._setStatus('Document Picture-in-Picture støttes ikke', true);
            return;
        }
        try {
            const pip = await window.documentPictureInPicture.requestWindow({ width: 900, height: 720 });
            this._setupPipWindow(pip);
        } catch (e) {
            this._setStatus('Kunne ikke åpne forhåndsvisning: ' + (e.message || e), true);
        }
    }

    _setupPipWindow(pip) {
        // Document Picture-in-Picture: render markdown directly into a plain
        // <div> in the PiP document. Avoids cross-realm custom-element upgrade
        // races by using `marked` (loaded into the PiP window) imperatively.
        this._pipWindow = pip;
        const doc = pip.document;
        doc.title = 'Forhåndsvisning';

        const themeLink = document.getElementById('themeStylesheet');
        if (themeLink) {
            const l = doc.createElement('link');
            l.rel = 'stylesheet';
            l.href = themeLink.href;
            doc.head.appendChild(l);
        }
        const s = doc.createElement('style');
        s.textContent = `
            html,body{margin:0;padding:0;height:100%;background:var(--bg);color:var(--text-strong);font-family:var(--font-family,-apple-system,sans-serif);line-height:1.55}
            #pip-root{position:fixed;inset:0;padding:20px 28px;overflow:auto;box-sizing:border-box}
            #pip-root > :first-child{margin-top:0}
            h1,h2,h3,h4{color:var(--accent);font-family:var(--font-heading);font-weight:400}
            a{color:var(--accent)}
            pre{background:var(--code-bg);color:var(--code-fg);padding:12px;border-radius:6px;overflow:auto}
            code{background:var(--surface-alt);padding:1px 5px;border-radius:3px;font-size:0.9em}
            pre code{background:none;padding:0}
            blockquote{border-left:4px solid var(--accent);padding:4px 12px;color:var(--text-muted);background:var(--surface-alt);border-radius:0 6px 6px 0}
            table{border-collapse:collapse;width:100%}
            th,td{border:1px solid var(--border-soft);padding:6px 10px;text-align:left}
            ul,ol{padding-left:1.4em}
            img{max-width:100%}
            .empty{color:var(--text-subtle);font-style:italic}
        `;
        doc.head.appendChild(s);

        const root = doc.createElement('div');
        root.id = 'pip-root';
        root.innerHTML = '<p class="empty">Venter på innhold…</p>';
        doc.body.appendChild(root);
        this._pipRoot = root;

        const marked = doc.createElement('script');
        marked.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
        marked.onload = () => this._publishPreview();
        doc.head.appendChild(marked);

        pip.addEventListener('pagehide', () => this._reattachPreview());
        this._setDetachedUI(true);
        this._publishPreview();
    }

    _setDetachedUI(on) {
        this._detached = !!on;
        const split = this.shadowRoot.querySelector('.ne-split');
        if (split) split.classList.toggle('detached', on);
        if (this._previewWrap) this._previewWrap.hidden = on;
        if (this._detachBtn) {
            this._detachBtn.textContent = on ? '📥 Koble tilbake' : '📤 Detach';
            this._detachBtn.title = on
                ? 'Lukk forhåndsvisningsvinduet og vis her'
                : 'Åpne forhåndsvisning i eget vindu';
            this._detachBtn.classList.toggle('detached', on);
        }
    }

    _reattachPreview() {
        if (!this._detached) return;
        if (this._pipWindow) {
            try { this._pipWindow.close(); } catch (_) {}
            this._pipWindow = null;
        }
        this._pipRoot = null;
        this._setDetachedUI(false);
        this._renderPreview();
    }

    disconnectedCallback() {
        if (this._pipWindow) {
            try { this._pipWindow.close(); } catch (_) {}
            this._pipWindow = null;
        }
        this._pipRoot = null;
        this._detached = false;
    }

    async loadExisting(week, file) {
        try {
            const text = await this.service.raw(week, file);
            if (this._contentEl) {
                this._contentEl.value = text;
                this._renderPreview();
            }
        } catch (_) {}
        try {
            if (this.service.meta) {
                const meta = await this.service.meta(week, file);
                const themes = Array.isArray(meta && meta.themes) ? meta.themes : [];
                if (this._themesEl) this._themesEl.value = themes.join(', ');
                const type = (meta && meta.type) || 'note';
                this._initialType = type;
                if (this._typeEl) this._typeEl.value = type;
                if (this._taxonomyRow) this._taxonomyRow.classList.toggle('is-presentation', type === 'presentation');
                this._initialPresStyle = (meta && meta.presentationStyle) || '';
                if (this._presStyleEl && this._initialPresStyle) this._presStyleEl.value = this._initialPresStyle;
                this._initialPinned = !!(meta && meta.pinned);
                if (this._pinnedEl) this._pinnedEl.checked = this._initialPinned;
                this._initialCreated = (meta && meta.created) || '';
                this._initialModified = (meta && meta.modified) || '';
                const footer = this.shadowRoot.querySelector('.ne-meta-footer');
                if (footer) {
                    const parts = [];
                    if (this._initialCreated) parts.push(`<span><strong>Opprettet:</strong> ${escapeHtml(this._fmtDate(this._initialCreated))}</span>`);
                    if (this._initialModified) parts.push(`<span><strong>Endret:</strong> ${escapeHtml(this._fmtDate(this._initialModified))}</span>`);
                    footer.innerHTML = parts.join('');
                }
            }
        } catch (_) {}
    }

    _fmtDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            return d.toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
        } catch (_) { return iso; }
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
                `<option value="${escapeHtml(w)}"${w === selected ? ' selected' : ''}>${escapeHtml(w)}</option>`
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

    async save(closeAfter = true, autosave = false) {
        if (!this._contentEl) return;
        const folder = this._weekSel.value.trim();
        let file = this._fileEl.value.trim();
        const content = this._contentEl.value;
        const themes = (this._themesEl ? this._themesEl.value : '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        const type = this._typeEl ? this._typeEl.value : 'note';
        const presentationStyle = (type === 'presentation' && this._presStyleEl) ? this._presStyleEl.value : '';
        const pinned = !!(this._pinnedEl && this._pinnedEl.checked);
        if (!folder) { this._setStatus('Velg uke', true); return; }
        if (!file) {
            file = this._suggestFilename(content) || 'notat.md';
            this._fileEl.value = file;
        }
        if (!file.endsWith('.md')) file += '.md';
        this._setStatus('Lagrer…');
        try {
            const payload = { folder, file, content, themes, type };
            if (presentationStyle) payload.presentationStyle = presentationStyle;
            if (autosave) payload.autosave = true;
            const data = await this.service.save(payload);
            // Server may strip {{...}} / [[...]] markers and create entities on
            // explicit save; reflect the cleaned content in the editor.
            if (data && typeof data.content === 'string' && data.content !== content) {
                this._contentEl.value = data.content;
            }
            if (pinned !== this._initialPinned && this.service.setPinned) {
                try { await this.service.setPinned(folder, file, pinned); } catch (_) {}
                this._initialPinned = pinned;
            }
            this._setStatus('Lagret');
            const evt = new CustomEvent('note-editor:saved', {
                bubbles: true, composed: true, cancelable: true,
                detail: { folder, file, path: (data && data.path) || ('/' + folder + '/' + file), closeAfter }
            });
            if (!this.dispatchEvent(evt)) return;
            if (!closeAfter) {
                // Stay on the page; refresh modified timestamp
                if (this.service.meta) {
                    try {
                        const meta = await this.service.meta(folder, file);
                        this._initialModified = (meta && meta.modified) || this._initialModified;
                        this._initialCreated = this._initialCreated || (meta && meta.created) || '';
                        const footer = this.shadowRoot.querySelector('.ne-meta-footer');
                        if (footer) {
                            const parts = [];
                            if (this._initialCreated) parts.push(`<span><strong>Opprettet:</strong> ${escapeHtml(this._fmtDate(this._initialCreated))}</span>`);
                            if (this._initialModified) parts.push(`<span><strong>Endret:</strong> ${escapeHtml(this._fmtDate(this._initialModified))}</span>`);
                            footer.innerHTML = parts.join('');
                        }
                    } catch (_) {}
                }
                // If we were creating a new note, switch URL to edit mode
                if (!this._editing) {
                    this._editing = true;
                    const newUrl = `/editor/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState({}, '', newUrl);
                    }
                }
                return;
            }
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

if (!customElements.get('note-editor')) customElements.define('note-editor', NoteEditor);
