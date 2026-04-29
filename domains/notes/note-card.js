/**
 * <note-card>
 *
 * Dumb presentation card for a single note. Receives its data via the
 * `setData(d)` instance method — it does not load anything itself.
 *
 *   const card = document.createElement('note-card');
 *   card.setData({
 *       week: '2026-W18', file: 'standup.md', name: 'Standup',
 *       type: 'note', pinned: false, snippet: '<p>…</p>',
 *       themes: ['planning'],
 *   });
 *
 * `setData` may be called before or after the element is connected; it
 * stores the data and re-renders.
 *
 * Pure component: emits cancelable bubbling/composed CustomEvents
 * 'view' / 'present' / 'edit' / 'delete' with detail = { filePath }.
 * Host pages decide what to do with them. The edit action also has a real
 * <a href> for fallback navigation; preventDefault on the event suppresses
 * that.
 *
 * Legacy notes: when `setData` is called the host element is given a
 * `data-note-card="<week>/<file>"` attribute so existing
 * `document.querySelector('[data-note-card="…"]')` removal code keeps working.
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
    .note-themes {
        margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px;
    }
    .note-theme {
        display: inline-block; padding: 1px 8px; border-radius: 999px;
        font-size: 0.75em; background: var(--accent-soft); color: var(--accent-strong);
        border: 1px solid var(--border-soft);
    }
`;

class NoteCard extends WNElement {
    css() { return STYLES; }

    setData(d) {
        if (!d || !d.week || !d.file) {
            this._data = null;
        } else {
            this._data = d;
            this.setAttribute('data-note-card', `${d.week}/${encodeURIComponent(d.file)}`);
        }
        if (this.isConnected) this.requestRender();
    }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (ev) => {
            const trigger = ev.target.closest('[data-act]');
            if (!trigger || !this._data) return;
            const act = trigger.getAttribute('data-act');
            const { week, file } = this._data;
            const filePath = `${week}/${encodeURIComponent(file)}`;
            const evt = new CustomEvent(act, {
                bubbles: true, composed: true, cancelable: true,
                detail: { filePath },
            });
            const proceed = this.dispatchEvent(evt);
            if (!proceed && act === 'edit') ev.preventDefault();
        });
    }

    render() {
        const d = this._data;
        if (!d) return html`<div class="note-body" style="color:var(--text-subtle)">Laster…</div>`;

        const fileEnc = encodeURIComponent(d.file);
        const name = d.name || String(d.file).replace(/\.md$/, '');
        const typeIcon = TYPE_ICONS[d.type] || '📄';
        const editHref = `/editor/${d.week}/${fileEnc}`;
        const pinIcon = d.pinned ? unsafeHTML('<span title="Festet">📌</span> ') : '';
        const presentBtn = d.type === 'presentation'
            ? unsafeHTML(`<button type="button" class="note-icon-btn" data-act="present" title="Presenter ${escapeHtml(name)}">🎤</button>`)
            : '';
        const snippet = d.snippet ? unsafeHTML(`<div class="note-body">${d.snippet}</div>`) : '';
        const themes = Array.isArray(d.themes) ? d.themes : [];
        const themesHtml = themes.length
            ? unsafeHTML(`<div class="note-themes">${themes.map(t =>
                `<span class="note-theme">#${escapeHtml(t)}</span>`).join('')}</div>`)
            : '';

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
            ${themesHtml}
        `;
    }
}

if (!customElements.get('note-card')) customElements.define('note-card', NoteCard);
