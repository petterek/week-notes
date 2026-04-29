/**
 * <note-card note="WEEK/encoded-file.md" service="NotesService">
 * Self-loading note summary card. Calls service.card(week, file) and renders
 * inside its own shadow DOM with theming via inherited CSS custom properties.
 *
 * Pure component: emits cancelable bubbling/composed CustomEvents
 * 'view' / 'present' / 'edit' / 'delete' with detail = { filePath }.
 * Host pages decide what to do with them. The edit action also has a real
 * <a href> for fallback navigation; preventDefault on the event suppresses
 * that.
 *
 * Legacy notes: the host element keeps a `data-note-card="<week>/<file>"`
 * attribute so existing `document.querySelector('[data-note-card="…"]')`
 * removal code keeps working.
 */
import { WNElement, html, unsafeHTML, escapeHtml } from './_shared.js';

const TYPE_ICONS = { note: '📝', meeting: '🤝', task: '🎯', presentation: '🎤', other: '📌' };

const STYLES = `
    :host {
        display: block;
        background: var(--surface);
        border-radius: 8px;
        border-left: 4px solid var(--accent);
        padding: 14px 18px;
        margin: 8px 0;
        color: var(--text-strong);
        font: inherit;
    }
    :host(:hover) { background: var(--surface-alt); }
    .note-h {
        display: flex; justify-content: space-between; align-items: center;
        gap: 10px; font-weight: 500; color: var(--accent);
    }
    .note-actions { display: inline-flex; gap: 4px; align-items: center; }
    .note-icon-btn, .note-actions a {
        border: 0; background: transparent; cursor: pointer;
        opacity: 0.55; padding: 2px 4px; font-size: 1em;
        text-decoration: none; color: inherit;
    }
    .note-icon-btn:hover, .note-actions a:hover { opacity: 1; }
    .note-del:hover { color: var(--danger); }
    .note-body {
        margin-top: 6px; color: var(--text);
        font-size: 0.95em; line-height: 1.5;
    }
    .note-body a { color: var(--accent); }
`;

class NoteCard extends WNElement {
    static get observedAttributes() { return ['note', 'service']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (this.service && !this._loaded) this._load();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (name === 'note' && oldVal !== newVal && this.isConnected && this.service) {
            this._loaded = false;
            this._load();
        }
    }

    async _load() {
        const note = this.getAttribute('note');
        if (!note) return;
        this._loaded = true;
        const slash = note.indexOf('/');
        if (slash < 0) { this._state = { error: 'Ugyldig note-id' }; this.requestRender(); return; }
        const week = note.slice(0, slash);
        const fileEnc = note.slice(slash + 1);
        // Preserve host-side selector hook used by legacy delete handler.
        this.setAttribute('data-note-card', `${week}/${fileEnc}`);
        try {
            const d = await this.service.card(week, fileEnc);
            if (!d || !d.ok) throw new Error(d && d.error || 'load failed');
            this._state = { week, fileEnc, data: d };
        } catch {
            this._state = { error: 'Kunne ikke laste notat' };
        }
        this.requestRender();
        if (!this._wired) {
            this._wired = true;
            this.shadowRoot.addEventListener('click', (ev) => {
                const trigger = ev.target.closest('[data-act]');
                if (!trigger) return;
                const act = trigger.getAttribute('data-act');
                const { week, fileEnc } = this._state || {};
                if (!week || !fileEnc) return;
                const filePath = `${week}/${fileEnc}`;
                const evt = new CustomEvent(act, {
                    bubbles: true, composed: true, cancelable: true,
                    detail: { filePath },
                });
                const proceed = this.dispatchEvent(evt);
                if (!proceed && act === 'edit') ev.preventDefault();
            });
        }
    }

    render() {
        if (!this.service) return this.renderNoService();
        if (!this._state) return html`<div class="note-body" style="color:var(--text-subtle)">Laster…</div>`;
        if (this._state.error) return html`<div class="note-body" style="color:var(--text-subtle)">${this._state.error}</div>`;

        const { week, fileEnc, data: d } = this._state;
        const name = d.name || fileEnc.replace(/\.md$/, '');
        const typeIcon = TYPE_ICONS[d.type] || '📄';
        const editHref = `/editor/${week}/${fileEnc}`;
        const pinIcon = d.pinned ? unsafeHTML('<span title="Festet">📌</span> ') : '';
        const presentBtn = d.type === 'presentation'
            ? unsafeHTML(`<button type="button" class="note-icon-btn" data-act="present" title="Presenter ${escapeHtml(name)}">🎤</button>`)
            : '';
        const snippet = d.snippet ? unsafeHTML(`<div class="note-body">${d.snippet}</div>`) : '';

        return html`
            <div class="note-h">
                <span>${pinIcon}${typeIcon} ${name}</span>
                <span class="note-actions">
                    <button type="button" class="note-icon-btn" data-act="view" title="Vis ${name}">👁️</button>
                    ${presentBtn}
                    <a href="${editHref}" data-act="edit" title="Rediger ${name}">✏️</a>
                    <button type="button" class="note-icon-btn note-del" data-act="delete" title="Slett ${name}">🗑️</button>
                </span>
            </div>
            ${snippet}
        `;
    }
}

if (!customElements.get('note-card')) customElements.define('note-card', NoteCard);
