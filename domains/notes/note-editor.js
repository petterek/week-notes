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
import { WNElement, html, escapeHtml, linkMentions, isoWeek } from './_shared.js';
import { attachAutocomplete, replaceRange, highlightMatch } from '/components/wn-autocomplete.js';

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
    .ne-autosave-info {
        color: var(--text-subtle);
        font-size: 0.85em;
    }
    button {
        padding: 8px 16px; border-radius: 6px; border: 1px solid transparent;
        cursor: pointer; font: inherit;
    }
    button.ne-save, button.ne-save-close {
        background: var(--accent); color: var(--text-on-accent); font-weight: 600;
    }
    button.ne-save:hover, button.ne-save-close:hover { filter: brightness(0.95); }
    button.ne-save-close {
        padding: 10px 22px; font-size: 1.05em; box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
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

    .ne-history-wrap { margin-top: 14px; border-top: 1px solid var(--border-soft); padding-top: 10px; }
    .ne-history-wrap > summary {
        cursor: pointer; font-size: 0.85em; color: var(--text-muted);
        user-select: none; list-style: none; padding: 4px 0;
    }
    .ne-history-wrap > summary::-webkit-details-marker { display: none; }
    .ne-history-wrap > summary::before { content: '▸ '; transition: transform 0.15s; display: inline-block; }
    .ne-history-wrap[open] > summary::before { content: '▾ '; }
    .ne-history-list { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; max-height: 260px; overflow: auto; }
    .ne-history-section { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-subtle); padding: 6px 8px 2px; }
    .ne-history-save { cursor: default; }
    .ne-history-save:hover { background: transparent; }
    .ne-history-empty, .ne-history-loading { font-size: 0.85em; color: var(--text-subtle); padding: 4px 0; }
    .ne-history-row {
        display: grid; grid-template-columns: 80px 130px 1fr; gap: 10px;
        padding: 5px 8px; border-radius: 4px; cursor: pointer;
        font-size: 0.85em; align-items: center;
        background: transparent; border: none; text-align: left; color: inherit;
    }
    .ne-history-row:hover { background: var(--surface-alt); }
    .ne-history-row .h-hash { font-family: var(--font-mono, monospace); color: var(--accent); }
    .ne-history-row .h-date { color: var(--text-muted); }
    .ne-history-row .h-subj { color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .ne-history-modal {
        position: fixed; inset: 0; background: rgba(0,0,0,0.45);
        display: flex; align-items: center; justify-content: center;
        z-index: 5000; padding: 24px;
    }
    .ne-history-modal[hidden] { display: none; }
    .ne-history-modal-inner {
        background: var(--surface, #fff); color: var(--text-strong);
        border-radius: 10px; padding: 18px;
        max-width: 900px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; gap: 10px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    }
    .ne-history-modal-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ne-history-modal-head h3 { margin: 0; font-size: 1em; color: var(--accent); }
    .ne-history-modal-head .meta { font-size: 0.85em; color: var(--text-muted); }
    .ne-history-modal-body { overflow: auto; flex: 1; min-height: 200px; }
    .ne-restore-diff {
        overflow: auto; flex: 1; min-height: 200px;
        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
        font-size: 0.88em; line-height: 1.45;
        background: var(--surface-alt, #f6f6f6); border: 1px solid var(--border-soft); border-radius: 6px;
        padding: 8px 0;
    }
    .ne-restore-diff .d-row {
        display: grid; grid-template-columns: 28px 1fr; gap: 0;
        padding: 0 10px; white-space: pre-wrap; word-break: break-word;
    }
    .ne-restore-diff .d-row .d-mark { color: var(--text-subtle); user-select: none; }
    .ne-restore-diff .d-add { background: rgba(46, 160, 67, 0.18); }
    .ne-restore-diff .d-add .d-mark { color: rgb(46, 160, 67); }
    .ne-restore-diff .d-del { background: rgba(248, 81, 73, 0.18); }
    .ne-restore-diff .d-del .d-mark { color: rgb(248, 81, 73); }
    .ne-restore-diff .d-del .d-text { text-decoration: line-through; opacity: 0.85; }
    .ne-restore-legend { font-size: 0.8em; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap; }
    .ne-restore-legend .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: middle; margin-right: 4px; }
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
        this._initialCreatedBy = '';
        this._initialLastSavedBy = '';
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
                    Tema
                    <tag-editor class="ne-tags" value="${escapeHtml((this._initialThemes || []).join(','))}" placeholder="Legg til tag…"></tag-editor>
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
                <span class="ne-autosave-info" aria-live="polite"></span>
                <button type="button" class="ne-detach" title="Åpne forhåndsvisning i eget vindu">📤 Detach</button>
                <button type="button" class="ne-cancel">Avbryt</button>
                <button type="button" class="ne-save-close" title="Ctrl+Shift+S">Ferdig</button>
            </div>
            <div class="ne-meta-footer">
                ${this._initialCreated ? html`<span><strong>Opprettet:</strong> ${this._fmtDate(this._initialCreated)}</span>` : ''}
                ${this._initialCreatedBy ? html`<span><strong>Opprettet av:</strong> <entity-mention kind="person" key="${this._initialCreatedBy}"></entity-mention></span>` : ''}
                ${this._initialModified ? html`<span><strong>Endret:</strong> ${this._fmtDate(this._initialModified)}</span>` : ''}
                ${this._initialLastSavedBy ? html`<span><strong>Sist lagret av:</strong> <entity-mention kind="person" key="${this._initialLastSavedBy}"></entity-mention></span>` : ''}
            </div>
            <details class="ne-history-wrap">
                <summary>🕘 Historikk</summary>
                <div class="ne-history-list" data-state="idle">
                    <div class="ne-history-empty">Lagre notatet for å bygge opp historikk.</div>
                </div>
            </details>
            <div class="ne-history-modal" hidden>
                <div class="ne-history-modal-inner">
                    <div class="ne-history-modal-head">
                        <h3 class="ne-history-modal-title">Versjon</h3>
                        <span class="ne-history-modal-meta meta"></span>
                        <button type="button" class="ne-history-revert">↩️ Tilbakestill til denne</button>
                        <button type="button" class="ne-history-close">Lukk</button>
                    </div>
                    <markdown-preview class="ne-history-modal-body" placeholder="Laster…"></markdown-preview>
                </div>
            </div>
            <div class="ne-history-modal ne-restore-modal" hidden>
                <div class="ne-history-modal-inner">
                    <div class="ne-history-modal-head">
                        <h3 class="ne-history-modal-title">💾 Gjenopprett autolagret versjon?</h3>
                        <span class="ne-history-modal-meta ne-restore-meta meta"></span>
                        <button type="button" class="ne-restore-apply">↩️ Gjenopprett</button>
                        <button type="button" class="ne-restore-discard">🗑️ Forkast</button>
                        <button type="button" class="ne-restore-cancel">Avbryt</button>
                    </div>
                    <div class="ne-restore-legend">
                        <span><span class="swatch" style="background: rgba(248,81,73,0.45)"></span>Lagret på disk</span>
                        <span><span class="swatch" style="background: rgba(46,160,67,0.45)"></span>Autolagret (ikke lagret)</span>
                    </div>
                    <div class="ne-history-modal-body ne-restore-diff" aria-label="Diff"></div>
                </div>
            </div>
        `;
    }

    async _loadEditor() {
        this.requestRender();
        // Wait for render
        await new Promise(resolve => setTimeout(resolve, 0));

        this._weekSel = this.shadowRoot.querySelector('.ne-week');
        this._fileEl = this.shadowRoot.querySelector('.ne-file');
        this._tagsEl = this.shadowRoot.querySelector('.ne-tags');
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
        this._autosaveInfoEl = this.shadowRoot.querySelector('.ne-autosave-info');
        const saveCloseBtn = this.shadowRoot.querySelector('.ne-save-close');
        const cancelBtn = this.shadowRoot.querySelector('.ne-cancel');

        this.loadWeeks(this._initialWeek);
        if (this._editing) this.loadExisting(this._initialWeek, this._initialFile);
        this._renderPreview();
        this._loadThemeSuggestions();
        this._installAutocompletes();
        this._installTagSpaceCommit();
        this._installHistoryPanel();
        this._updateAutosaveInfo();

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
        if (this._tagsEl) this._tagsEl.addEventListener('change', markDirty);
        if (this._pinnedEl) this._pinnedEl.addEventListener('change', markDirty);
        if (this._presStyleEl) this._presStyleEl.addEventListener('change', markDirty);
        if (this._typeEl) {
            this._typeEl.addEventListener('change', () => {
                if (this._taxonomyRow) this._taxonomyRow.classList.toggle('is-presentation', this._typeEl.value === 'presentation');
                markDirty();
            });
        }
        const saveKeyHandler = (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                if (e.shiftKey) this.save(true);
                else this.save(false);
            }
        };
        this._contentEl.addEventListener('keydown', saveKeyHandler);
        this._docKeyHandler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                this.save(true);
                return;
            }
            if (e.key === 'Escape') {
                const restore = this.shadowRoot.querySelector('.ne-restore-modal:not([hidden])');
                if (restore) {
                    e.preventDefault();
                    const btn = restore.querySelector('.ne-restore-cancel');
                    if (btn) btn.click();
                    return;
                }
                const history = this.shadowRoot.querySelector('.ne-history-modal:not(.ne-restore-modal):not([hidden])');
                if (history) {
                    e.preventDefault();
                    const btn = history.querySelector('.ne-history-close');
                    if (btn) btn.click();
                }
            }
        };
        document.addEventListener('keydown', this._docKeyHandler);

        setTimeout(() => this._contentEl.focus(), 0);
    }

    _markDirty() {
        this._dirty = true;
        if (this._countdownTimer) return;
        this._countdownLeft = 30;
        this._updateAutosaveInfo();
        this._countdownTimer = setInterval(() => {
            this._countdownLeft -= 1;
            if (this._countdownLeft <= 0) {
                this._stopCountdown();
                if (this._dirty && !this._saving) this.save(false, true);
                return;
            }
            this._updateAutosaveInfo();
        }, 1000);
    }

    _stopCountdown() {
        if (this._countdownTimer) {
            clearInterval(this._countdownTimer);
            this._countdownTimer = null;
        }
        this._countdownLeft = 0;
        this._updateAutosaveInfo();
    }

    _updateAutosaveInfo() {
        if (!this._autosaveInfoEl) return;
        const parts = [];
        if (this._countdownTimer && this._countdownLeft > 0) {
            parts.push(`Autolagrer om ${this._countdownLeft}s`);
        }
        if (this._lastAutosaveAt) {
            try {
                const d = new Date(this._lastAutosaveAt);
                if (!isNaN(d.getTime())) {
                    const t = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    parts.push(`Sist autolagret ${t}`);
                }
            } catch (_) {}
        }
        this._autosaveInfoEl.textContent = parts.join(' · ');
    }

    _renderPreview() {
        if (this._detached) {
            this._publishPreview();
            return;
        }
        if (!this._previewEl) return;
        const raw = this._contentEl ? this._contentEl.value : '';
        this._previewEl.value = this._previewTransform(raw);
    }

    // Preview-only transforms for inline markers:
    //  - A run of 2+ adjacent markers becomes an ordered task list
    //    ('1. [ ] text' / '1. [x] text') so marked produces a single
    //    <ol> with checkbox items.
    //  - A single marker stays inline as raw '<input type="checkbox">'
    //    HTML so it renders as a checkbox without forcing a list.
    //  - '{{X}}' (no id yet) is treated like an open ref using its
    //    inner text.
    // The textarea/source keeps the brace forms; the server applies
    // the closing/creating substitutions on explicit save.
    _previewTransform(md) {
        if (!md) return md;
        const map = this._taskTextById;
        if (!map) {
            this._loadTaskTexts();
        }
        // Resolve a marker (kind + id-or-text) to display text + checkbox state.
        const resolve = (kind, id) => {
            if (kind === 'X') return { text: id, done: false };
            const text = map && map[id];
            if (!text) return null;
            return { text, done: kind === '!' };
        };
        // Token regex: '{{?id}}', '{{!id}}', or '{{X}}' (typing form).
        // Inner text of typing form must not start with '!' or '?'.
        const TOKEN = /\{\{(?:([!?])([^{}\s]+)|([^{}!?][^{}]*))\}\}/g;
        const RUN = /(?:\{\{(?:[!?][^{}\s]+|[^{}!?][^{}]*)\}\}\s+){1,}\{\{(?:[!?][^{}\s]+|[^{}!?][^{}]*)\}\}/g;
        const itemFor = (m) => {
            const km = /\{\{(?:([!?])([^{}\s]+)|([^{}!?][^{}]*))\}\}/.exec(m);
            const kind = km[1] || 'X';
            const id = km[2] || (km[3] || '').trim();
            const r = resolve(kind, id);
            if (!r) return null;
            return r.done ? `1. [x] ${r.text}` : `1. [ ] ${r.text}`;
        };
        let out = md.replace(RUN, (run) => {
            const items = run.match(/\{\{(?:[!?][^{}\s]+|[^{}!?][^{}]*)\}\}/g) || [];
            const lines = items.map(itemFor).filter(Boolean);
            if (lines.length < 2) return run;
            return `\n\n${lines.join('\n')}\n\n`;
        });
        // Remaining single markers → inline checkbox via raw HTML
        // (marked passes <input> through inside paragraphs).
        out = out.replace(TOKEN, (m, kind, id, plain) => {
            const k = kind || 'X';
            const text = (k === 'X') ? (plain || '').trim() : (map && map[id]);
            if (!text) return m;
            const checked = k === '!' ? ' checked' : '';
            return `<input type="checkbox" disabled${checked}> ${text}`;
        });
        // Mirror server: render @mentions as <entity-mention> chips and
        // [[result]] markers as <inline-action kind="result">. People &
        // companies are loaded lazily; until they arrive, unknown @names
        // still render as raw text.
        if (!this._linkDataLoaded && !this._linkDataLoading) this._loadLinkData();
        out = linkMentions(out, this._people || [], this._companies || []);
        return out;
    }

    _loadLinkData() {
        this._linkDataLoading = true;
        Promise.all([
            fetch('/api/people').then(r => r.json()).catch(() => []),
            fetch('/api/companies').then(r => r.json()).catch(() => []),
        ]).then(([pp, cc]) => {
            this._people = (Array.isArray(pp) ? pp : []).filter(p => !p.inactive);
            this._companies = (Array.isArray(cc) ? cc : []).filter(c => !c.deleted);
            this._linkDataLoaded = true;
            this._linkDataLoading = false;
            this._renderPreview();
        }).catch(() => { this._linkDataLoading = false; });
    }

    _loadTaskTexts() {
        if (this._taskTextLoading) return;
        this._taskTextLoading = true;
        const svc = (typeof this.serviceFor === 'function') ? this.serviceFor('task') : null;
        if (!svc || typeof svc.list !== 'function') { this._taskTextById = {}; return; }
        Promise.resolve(svc.list()).then(all => {
            const map = {};
            (Array.isArray(all) ? all : []).forEach(t => { if (t && t.id) map[t.id] = t.text || ''; });
            this._taskTextById = map;
            this._renderPreview();
        }).catch(() => { this._taskTextById = {}; });
    }

    _publishPreview() {
        if (!this._pipRoot || !this._pipWindow) return;
        const raw = this._contentEl ? this._contentEl.value : '';
        const md = this._previewTransform(raw);
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
        if (this._acHandle) {
            try { this._acHandle.destroy(); } catch (_) {}
            this._acHandle = null;
            this._acAttached = false;
        }
        if (this._docKeyHandler) {
            document.removeEventListener('keydown', this._docKeyHandler);
            this._docKeyHandler = null;
        }
        if (this._pipWindow) {
            try { this._pipWindow.close(); } catch (_) {}
            this._pipWindow = null;
        }
        this._pipRoot = null;
        this._detached = false;
    }

    async loadExisting(week, file) {
        let realText = '';
        try {
            realText = await this.service.raw(week, file);
            if (this._contentEl) {
                this._contentEl.value = realText;
                this._renderPreview();
            }
        } catch (_) {}
        try {
            if (this.service.meta) {
                const meta = await this.service.meta(week, file);
                const tagsArr = Array.isArray(meta && meta.tags) ? meta.tags
                    : (Array.isArray(meta && meta.themes) ? meta.themes : []);
                if (this._tagsEl) this._tagsEl.tags = tagsArr;
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
                this._initialCreatedBy = (meta && meta.createdBy) || '';
                this._initialLastSavedBy = (meta && meta.lastSavedBy) || '';
                const footer = this.shadowRoot.querySelector('.ne-meta-footer');
                if (footer) {
                    const parts = [];
                    if (this._initialCreated) parts.push(`<span><strong>Opprettet:</strong> ${escapeHtml(this._fmtDate(this._initialCreated))}</span>`);
                    if (this._initialCreatedBy) parts.push(`<span><strong>Opprettet av:</strong> <entity-mention kind="person" key="${escapeHtml(this._initialCreatedBy)}"></entity-mention></span>`);
                    if (this._initialModified) parts.push(`<span><strong>Endret:</strong> ${escapeHtml(this._fmtDate(this._initialModified))}</span>`);
                    if (this._initialLastSavedBy) parts.push(`<span><strong>Sist lagret av:</strong> <entity-mention kind="person" key="${escapeHtml(this._initialLastSavedBy)}"></entity-mention></span>`);
                    footer.innerHTML = parts.join('');
                }
            }
        } catch (_) {}
        this._checkAutosave(week, file, realText);
    }

    async _checkAutosave(week, file, realText) {
        try {
            const f = file.endsWith('.md') ? file : file + '.md';
            const url = `/api/save/autosave?folder=${encodeURIComponent(week)}&file=${encodeURIComponent(f)}`;
            const r = await fetch(url);
            if (!r.ok) return;
            const data = await r.json();
            if (!data || !data.exists || typeof data.content !== 'string') return;
            if (data.content === realText) {
                // Stale duplicate — clean up silently.
                fetch('/api/save/autosave', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder: week, file: f }),
                }).catch(() => {});
                return;
            }
            this._showRestorePrompt(week, f, data.content, data.modified, realText);
        } catch (_) {}
    }

    _showRestorePrompt(week, file, autosaveContent, modifiedIso, realText) {
        const modal = this.shadowRoot.querySelector('.ne-restore-modal');
        const diffEl = this.shadowRoot.querySelector('.ne-restore-diff');
        const meta = this.shadowRoot.querySelector('.ne-restore-meta');
        const applyBtn = this.shadowRoot.querySelector('.ne-restore-apply');
        const discardBtn = this.shadowRoot.querySelector('.ne-restore-discard');
        const cancelBtn = this.shadowRoot.querySelector('.ne-restore-cancel');
        if (!modal || !diffEl || !applyBtn || !discardBtn || !cancelBtn) return;

        if (meta) meta.textContent = modifiedIso ? `Autolagret ${this._fmtDate(modifiedIso)}` : 'Autolagret versjon';
        diffEl.innerHTML = this._renderLineDiff(realText || '', autosaveContent || '');
        modal.hidden = false;

        const close = () => { modal.hidden = true; };
        const onApply = () => {
            if (this._contentEl) {
                this._contentEl.value = autosaveContent;
                this._renderPreview();
                this._setStatus('Autolagret innhold gjenopprettet – husk å lagre');
            }
            close();
            cleanup();
        };
        const onDiscard = () => {
            fetch('/api/save/autosave', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: week, file }),
            }).catch(() => {});
            close();
            cleanup();
        };
        const onCancel = () => { close(); cleanup(); };
        const onBackdrop = (e) => { if (e.target === modal) onCancel(); };
        const cleanup = () => {
            applyBtn.removeEventListener('click', onApply);
            discardBtn.removeEventListener('click', onDiscard);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
        };
        applyBtn.addEventListener('click', onApply);
        discardBtn.addEventListener('click', onDiscard);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
    }

    // Render a line-level diff between `a` (saved on disk) and `b`
    // (autosave). Returns HTML rows: unchanged plain, removed (in a only)
    // marked red with strike-through, added (in b only) marked green.
    _renderLineDiff(a, b) {
        const A = (a || '').split('\n');
        const B = (b || '').split('\n');
        // LCS table — bounded by note size which is small.
        const n = A.length, m = B.length;
        const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i][j] = (A[i] === B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        const rows = [];
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (A[i] === B[j]) { rows.push({ type: 'eq', text: A[i] }); i++; j++; }
            else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ type: 'del', text: A[i] }); i++; }
            else { rows.push({ type: 'add', text: B[j] }); j++; }
        }
        while (i < n) { rows.push({ type: 'del', text: A[i++] }); }
        while (j < m) { rows.push({ type: 'add', text: B[j++] }); }

        if (!rows.some(r => r.type !== 'eq')) {
            return '<div class="ne-history-empty" style="padding:10px">Ingen endringer.</div>';
        }
        return rows.map(r => {
            const cls = r.type === 'add' ? 'd-add' : r.type === 'del' ? 'd-del' : 'd-eq';
            const mark = r.type === 'add' ? '+' : r.type === 'del' ? '−' : '\u00a0';
            const text = r.text === '' ? '\u00a0' : escapeHtml(r.text);
            return `<div class="d-row ${cls}"><span class="d-mark">${mark}</span><span class="d-text">${text}</span></div>`;
        }).join('');
    }

    _fmtDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            return d.toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
        } catch (_) { return iso; }
    }

    async _loadThemeSuggestions() {
        if (!this._tagsEl || !this.service || !this.service.listThemes) return;
        try {
            const list = await this.service.listThemes();
            if (Array.isArray(list) && list.length) {
                this._tagsEl.setAttribute('suggestions', list.join(','));
                this._availableThemes = list.map(t => String(t).toLowerCase());
            }
        } catch (_) {}
    }

    _installTagSpaceCommit() {
        // Pressing space after '#tagName' commits it as a tag in the
        // tag-editor and strips the marker from the textarea — works
        // independently of the autocomplete popover.
        if (!this._contentEl || this._tagSpaceWired) return;
        const ta = this._contentEl;
        ta.addEventListener('keydown', (e) => {
            if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
            const caret = ta.selectionStart;
            if (caret !== ta.selectionEnd) return;
            const text = ta.value;
            let i = caret - 1;
            while (i >= 0 && /[\w-]/.test(text[i])) i--;
            if (i < 0 || text[i] !== '#') return;
            if (i > 0 && !/\s/.test(text[i - 1])) return;
            const word = text.slice(i + 1, caret);
            if (!word) return;
            e.preventDefault();
            const before = text.slice(0, i);
            const after = text.slice(caret);
            ta.value = before + after;
            try { ta.setSelectionRange(i, i); } catch (_) {}
            if (this._tagsEl) {
                const cur = this._tagsEl.tags || [];
                if (!cur.includes(word)) this._tagsEl.tags = cur.concat([word]);
            }
            this._renderPreview();
            this._markDirty();
        });
        this._tagSpaceWired = true;
    }

    _installHashTagAutocomplete() {
        // Replaced by _installAutocompletes which registers a #tag trigger
        // on the shared <wn-autocomplete> helper. Kept as a noop so any
        // older callers still work.
    }

    _installCloseTaskAutocomplete() {
        // Replaced by _installAutocompletes (task + tag + mention triggers
        // share the same popover via attachAutocomplete). Noop.
    }

    _installMentionAutocomplete() {
        // Mentions are wired through _installAutocompletes too. Kept as a
        // separate name in case external callers reference it.
    }

    _installAutocompletes() {
        if (!this._contentEl || this._acAttached) return;
        const ta = this._contentEl;
        const tasksSvc = (typeof this.serviceFor === 'function') ? this.serviceFor('task') : null;

        // Lazy caches — fetched on first activation, reused thereafter.
        let openTasks = null;
        let people = null;
        let companies = null;
        let results = null;
        const ensureOpenTasks = async () => {
            if (openTasks) return openTasks;
            try {
                const all = (tasksSvc && typeof tasksSvc.list === 'function') ? await tasksSvc.list() : [];
                openTasks = (Array.isArray(all) ? all : []).filter(t => !t.done);
            } catch (_) { openTasks = []; }
            return openTasks;
        };
        const ensurePeople = async () => {
            if (people) return people;
            try {
                const r = await fetch('/api/people');
                people = (await r.json() || []).filter(p => !p.inactive);
            } catch (_) { people = []; }
            return people;
        };
        const ensureCompanies = async () => {
            if (companies) return companies;
            try {
                const r = await fetch('/api/companies');
                companies = (await r.json() || []).filter(c => !c.deleted);
            } catch (_) { companies = []; }
            return companies;
        };
        const ensureResults = async () => {
            if (results) return results;
            try {
                const r = await fetch('/api/results');
                results = await r.json() || [];
                if (!Array.isArray(results)) results = [];
            } catch (_) { results = []; }
            return results;
        };

        const taskTrigger = {
            // Detect '{{?' or '{{!' before the caret with no '}' or
            // newline between. Extra carries the kind so onSelect can
            // emit the right marker.
            detect: (text, caret) => {
                const upto = text.slice(0, caret);
                const closeIdx = upto.lastIndexOf('{{!');
                const openIdx  = upto.lastIndexOf('{{?');
                const idx = Math.max(closeIdx, openIdx);
                if (idx < 0) return null;
                const between = upto.slice(idx + 3);
                if (/[\n}]/.test(between)) return null;
                const kind = (idx === closeIdx) ? '!' : '?';
                return { query: between, start: idx, end: caret, extra: { kind } };
            },
            fetchItems: async () => {
                const tasks = await ensureOpenTasks();
                return tasks.map(t => ({
                    value: t.id,
                    label: t.text || '(uten tekst)',
                    hint: t.week || '',
                    week: t.week || '',
                    created: t.created || '',
                }));
            },
            filter: 'words',
            limit: 12,
            renderItem: (item, query) => {
                const icon = '✓';
                return `${icon} ${highlightMatch(item.label, query)}` +
                    (item.hint ? `<span style="opacity:0.55;font-size:0.85em"> · ${highlightMatch(item.hint, query)}</span>` : '');
            },
            onSelect: (item, ctx) => {
                const kind = (ctx.extra && ctx.extra.kind) || '!';
                let endIdx = ctx.range.end;
                if (ta.value.slice(endIdx, endIdx + 2) === '}}') endIdx += 2;
                replaceRange(ta, ctx.range.start, endIdx, `{{${kind}${item.value}}} `);
                this._renderPreview();
                this._markDirty();
            },
        };

        const resultTrigger = {
            // Detect '[[?' before the caret with no ']' or newline between.
            // Selecting an item inserts '[[?<id>]]'.
            detect: (text, caret) => {
                const upto = text.slice(0, caret);
                const idx = upto.lastIndexOf('[[?');
                if (idx < 0) return null;
                const between = upto.slice(idx + 3);
                if (/[\n\]]/.test(between)) return null;
                return { query: between, start: idx, end: caret };
            },
            fetchItems: async () => {
                const all = await ensureResults();
                // Most recent first.
                const sorted = all.slice().sort((a, b) => {
                    const ad = a.created || a.week || '';
                    const bd = b.created || b.week || '';
                    return bd.localeCompare(ad);
                });
                return sorted.map(r => ({
                    value: r.id,
                    label: r.text || '(uten tekst)',
                    hint: r.week || '',
                }));
            },
            filter: 'words',
            limit: 12,
            renderItem: (item, query) => {
                return `🏁 ${highlightMatch(item.label, query)}` +
                    (item.hint ? `<span style="opacity:0.55;font-size:0.85em"> · ${highlightMatch(item.hint, query)}</span>` : '');
            },
            onSelect: (item, ctx) => {
                let endIdx = ctx.range.end;
                if (ta.value.slice(endIdx, endIdx + 2) === ']]') endIdx += 2;
                replaceRange(ta, ctx.range.start, endIdx, `[[?${item.value}]] `);
                this._renderPreview();
                this._markDirty();
            },
        };

        const tagTrigger = {
            // Detect '#tag' looking back from caret. Must be at start of
            // value or preceded by whitespace.
            detect: (text, caret, opts) => {
                let i = caret - 1;
                while (i >= 0 && /[\w-]/.test(text[i])) i--;
                if (i < 0 || text[i] !== '#') return null;
                if (i > 0 && !/\s/.test(text[i - 1])) return null;
                const frag = text.slice(i + 1, caret);
                if (!frag && !(opts && opts.force)) return null;
                return { query: frag, start: i, end: caret };
            },
            fetchItems: async () => {
                const list = this._availableThemes || [];
                const existing = (this._tagsEl && this._tagsEl.tags) ? this._tagsEl.tags : [];
                return list
                    .filter(t => !existing.includes(t))
                    .map(t => ({ value: t, label: t }));
            },
            filter: 'starts',
            limit: 8,
            renderItem: (item, query) => `#${highlightMatch(item.label, query)}`,
            onSelect: (item, ctx) => {
                // Strip '#tag' from textarea, append to tag-editor.
                replaceRange(ta, ctx.range.start, ctx.range.end, '');
                if (this._tagsEl) {
                    const cur = this._tagsEl.tags || [];
                    if (!cur.includes(item.value)) this._tagsEl.tags = cur.concat([item.value]);
                }
                this._renderPreview();
                this._markDirty();
            },
        };

        const mentionTrigger = {
            // Detect '@word' with the same boundary rules as the legacy
            // mention parser: start of value or preceded by whitespace /
            // bracket / paren / comma / semicolon.
            detect: (text, caret, opts) => {
                let i = caret - 1;
                while (i >= 0 && /[a-zA-ZæøåÆØÅ0-9_-]/.test(text[i])) i--;
                if (i < 0 || text[i] !== '@') return null;
                if (i > 0 && !/[\s(\[,;]/.test(text[i - 1])) return null;
                const frag = text.slice(i + 1, caret);
                if (!frag && !(opts && opts.force)) return null;
                return { query: frag, start: i, end: caret };
            },
            fetchItems: async () => {
                const [pp, cc] = await Promise.all([ensurePeople(), ensureCompanies()]);
                const out = [];
                const meKey = (typeof window !== 'undefined' && window.mePersonKey) || '';
                if (meKey) {
                    const me = pp.find(p => (p.key || (p.name || '').toLowerCase()) === meKey);
                    const disp = me
                        ? (me.firstName ? (me.lastName ? `${me.firstName} ${me.lastName}` : me.firstName) : (me.name || me.key))
                        : meKey;
                    out.push({ value: 'me', label: disp, hint: 'meg', kind: 'me' });
                } else {
                    out.push({ value: 'me', label: 'meg', hint: 'sett i Innstillinger', kind: 'me' });
                }
                for (const c of cc) {
                    out.push({ value: c.key || (c.name || '').toLowerCase(), label: c.name || c.key, hint: 'firma', kind: 'company' });
                }
                for (const p of pp) {
                    const display = p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name;
                    out.push({ value: p.key || (p.name || '').toLowerCase(), label: display || p.name || p.key, hint: '', kind: 'person' });
                }
                return out;
            },
            filter: 'substring',
            limit: 10,
            renderItem: (item, query) => {
                const tag = item.kind === 'company' ? '🏢' : (item.kind === 'me' ? '🙋' : '👤');
                return `${tag} ${highlightMatch(item.label, query)}` +
                    (item.hint ? `<span style="opacity:0.55;font-size:0.85em"> · ${item.hint}</span>` : '');
            },
            onSelect: (item, ctx) => {
                replaceRange(ta, ctx.range.start, ctx.range.end, `@${item.value} `);
                this._renderPreview();
                this._markDirty();
            },
        };

        this._acHandle = attachAutocomplete(ta, {
            triggers: [taskTrigger, resultTrigger, tagTrigger, mentionTrigger],
            container: this.shadowRoot,
        });
        this._acAttached = true;
    }

    _installHistoryPanel() {
        const wrap = this.shadowRoot.querySelector('.ne-history-wrap');
        const list = this.shadowRoot.querySelector('.ne-history-list');
        const modal = this.shadowRoot.querySelector('.ne-history-modal');
        const modalTitle = this.shadowRoot.querySelector('.ne-history-modal-title');
        const modalMeta = this.shadowRoot.querySelector('.ne-history-modal-meta');
        const modalBody = this.shadowRoot.querySelector('markdown-preview.ne-history-modal-body');
        const closeBtn = this.shadowRoot.querySelector('.ne-history-close');
        const revertBtn = this.shadowRoot.querySelector('.ne-history-revert');
        if (!wrap || !list || !modal) return;

        const closeModal = () => { modal.hidden = true; this._historyCurrent = null; };
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        if (revertBtn) revertBtn.addEventListener('click', () => {
            const cur = this._historyCurrent;
            if (!cur || typeof cur.content !== 'string') return;
            const ok = confirm(`Tilbakestill innholdet til versjon ${cur.shortHash || (cur.hash || '').slice(0, 7)}?\n\nDine ulagrede endringer i editoren overskrives. Endringen lagres ikke før du trykker "Lagre".`);
            if (!ok) return;
            if (this._contentEl) {
                this._contentEl.value = cur.content;
                this._contentEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            closeModal();
            this._setStatus(`Tilbakestilt til ${cur.shortHash || (cur.hash || '').slice(0, 7)} – husk å lagre`);
        });

        const render = (saves) => {
            if (!saves || !saves.length) {
                list.innerHTML = '<div class="ne-history-empty">Ingen lagringer ennå.</div>';
                return;
            }
            list.innerHTML = saves.slice().reverse().map(s => {
                const at = (s && typeof s === 'object') ? s.at : s;
                const by = (s && typeof s === 'object') ? s.by : '';
                const sha = (s && typeof s === 'object') ? s.sha : '';
                const shaShort = sha ? sha.slice(0, 7) : '';
                const tag = sha ? 'button' : 'div';
                const attrs = sha ? `type="button" data-hash="${escapeHtml(sha)}"` : '';
                return `
                    <${tag} class="ne-history-row${sha ? '' : ' ne-history-save'}" ${attrs}>
                        <span class="h-hash">${shaShort ? escapeHtml(shaShort) : '💾'}</span>
                        <span class="h-date">${escapeHtml(this._fmtDate(at))}</span>
                        <span class="h-subj">${by ? `<entity-mention kind="person" key="${escapeHtml(by)}"></entity-mention>` : '<span style="color:var(--text-subtle)">(ukjent)</span>'}</span>
                    </${tag}>
                `;
            }).join('');
        };

        const load = async () => {
            if (list.dataset.state === 'loading' || list.dataset.state === 'loaded') return;
            const folder = this._weekSel ? this._weekSel.value.trim() : '';
            const file = this._fileEl ? this._fileEl.value.trim() : '';
            if (!folder || !file || !this._editing) return;
            list.dataset.state = 'loading';
            list.innerHTML = '<div class="ne-history-loading">Henter historikk…</div>';
            try {
                const f = file.endsWith('.md') ? file : file + '.md';
                const meta = this.service.meta ? await this.service.meta(folder, f).catch(() => null) : null;
                const saves = (meta && Array.isArray(meta.saves)) ? meta.saves : [];
                render(saves);
                list.dataset.state = 'loaded';
            } catch (e) {
                list.innerHTML = `<div class="ne-history-empty">Kunne ikke hente historikk: ${escapeHtml(e.message || String(e))}</div>`;
                list.dataset.state = 'idle';
            }
        };

        const invalidate = () => { list.dataset.state = 'idle'; };
        // Refresh after a successful save so the new commit shows up.
        this.addEventListener('note-editor:saved', () => {
            invalidate();
            if (wrap.open) load();
        });

        wrap.addEventListener('toggle', () => { if (wrap.open) load(); });

        list.addEventListener('click', async (e) => {
            const btn = e.target.closest('.ne-history-row');
            if (!btn) return;
            const hash = btn.dataset.hash;
            const folder = this._weekSel ? this._weekSel.value.trim() : '';
            const file = this._fileEl ? this._fileEl.value.trim() : '';
            const f = file.endsWith('.md') ? file : file + '.md';
            modalTitle.textContent = `Versjon ${hash.slice(0, 7)}`;
            modalMeta.textContent = btn.querySelector('.h-date').textContent;
            modalBody.value = 'Laster…';
            modal.hidden = false;
            this._historyCurrent = { hash, shortHash: hash.slice(0, 7), content: null };
            try {
                const data = await (this.service.versionAt ? this.service.versionAt(folder, f, hash) : null);
                const content = (data && typeof data.content === 'string') ? data.content : '';
                this._historyCurrent = { hash, shortHash: hash.slice(0, 7), content };
                modalBody.value = content ? this._previewTransform(content) : '(tomt)';
            } catch (err) {
                this._historyCurrent = null;
                modalBody.value = `*(Kunne ikke hente versjonen: ${err.message || err})*`;
            }
        });
    }

    _caretCoords(ta) {
        // Mirror-div technique: build an offscreen <div> with the same styling
        // as the textarea up to the caret, ending with a span at the caret.
        const cs = getComputedStyle(ta);
        const div = document.createElement('div');
        const props = ['boxSizing','width','height','overflowX','overflowY','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','paddingTop','paddingRight','paddingBottom','paddingLeft','fontStyle','fontVariant','fontWeight','fontStretch','fontSize','fontSizeAdjust','lineHeight','fontFamily','textAlign','textTransform','textIndent','letterSpacing','wordSpacing','tabSize','MozTabSize','whiteSpace','wordWrap'];
        for (const p of props) div.style[p] = cs[p];
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word';
        div.style.top = '0'; div.style.left = '-9999px';
        const caret = ta.selectionStart;
        const before = ta.value.substring(0, caret);
        div.textContent = before;
        const span = document.createElement('span');
        span.textContent = ta.value.substring(caret) || '.';
        div.appendChild(span);
        document.body.appendChild(div);
        const rect = { left: span.offsetLeft - ta.scrollLeft, top: span.offsetTop - ta.scrollTop, height: parseFloat(cs.lineHeight) || 18 };
        document.body.removeChild(div);
        return rect;
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
        // Discard any pending autosave temp file before navigating away.
        try {
            const folder = this._weekSel ? this._weekSel.value.trim() : '';
            const file = this._fileEl ? this._fileEl.value.trim() : '';
            if (folder && file) {
                const f = file.endsWith('.md') ? file : file + '.md';
                fetch('/api/save/autosave', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder, file: f }),
                    keepalive: true,
                }).catch(() => {});
            }
        } catch (_) {}
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
        const tags = (this._tagsEl && Array.isArray(this._tagsEl.tags))
            ? this._tagsEl.tags.slice()
            : [];
        const type = this._typeEl ? this._typeEl.value : 'note';
        const presentationStyle = (type === 'presentation' && this._presStyleEl) ? this._presStyleEl.value : '';
        const pinned = !!(this._pinnedEl && this._pinnedEl.checked);
        if (!folder) { this._setStatus('Velg uke', true); return; }
        if (!file) {
            file = this._suggestFilename(content) || 'notat.md';
            this._fileEl.value = file;
        }
        if (!file.endsWith('.md')) file += '.md';
        if (!autosave) this._setStatus('Lagrer…');
        try {
            const payload = { folder, file, content, tags, type };
            if (presentationStyle) payload.presentationStyle = presentationStyle;
            if (autosave) payload.autosave = true;
            if (closeAfter && !autosave) payload.commit = true;
            if (!this._editing && !autosave) payload.createNew = true;
            const data = await this.service.save(payload);
            // Server may have deduped the filename if this was a new note
            // colliding with an existing file. Adopt whatever the server
            // actually wrote.
            if (data && typeof data.file === 'string' && data.file !== file) {
                file = data.file;
                if (this._fileEl) this._fileEl.value = file;
            }
            // Server may strip {{...}} / [[...]] markers and create entities on
            // explicit save; reflect the cleaned content in the editor.
            if (data && typeof data.content === 'string' && data.content !== content) {
                this._contentEl.value = data.content;
            }
            if (pinned !== this._initialPinned && this.service.setPinned) {
                try { await this.service.setPinned(folder, file, pinned); } catch (_) {}
                this._initialPinned = pinned;
            }
            if (autosave) {
                this._lastAutosaveAt = new Date().toISOString();
                this._dirty = false;
                this._updateAutosaveInfo();
                return;
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
                        this._initialCreatedBy = this._initialCreatedBy || (meta && meta.createdBy) || '';
                        this._initialLastSavedBy = (meta && meta.lastSavedBy) || this._initialLastSavedBy;
                        const footer = this.shadowRoot.querySelector('.ne-meta-footer');
                        if (footer) {
                            const parts = [];
                            if (this._initialCreated) parts.push(`<span><strong>Opprettet:</strong> ${escapeHtml(this._fmtDate(this._initialCreated))}</span>`);
                            if (this._initialCreatedBy) parts.push(`<span><strong>Opprettet av:</strong> <entity-mention kind="person" key="${escapeHtml(this._initialCreatedBy)}"></entity-mention></span>`);
                            if (this._initialModified) parts.push(`<span><strong>Endret:</strong> ${escapeHtml(this._fmtDate(this._initialModified))}</span>`);
                            if (this._initialLastSavedBy) parts.push(`<span><strong>Sist lagret av:</strong> <entity-mention kind="person" key="${escapeHtml(this._initialLastSavedBy)}"></entity-mention></span>`);
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
