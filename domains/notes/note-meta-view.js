/**
 * <note-meta-view> — service-less display of a note's metadata.
 *
 * The parent passes a meta object via the `meta` JS property:
 *   {
 *     week, file, name?, type?, pinned?, themes?: string[],
 *     created?, modified?, presentationStyle?
 *   }
 *
 * Emits cancelable, bubbling, composed CustomEvents:
 *   note-meta:view     { week, file }
 *   note-meta:edit     { week, file }
 *   note-meta:present  { week, file, presentationStyle? }   (only if type === 'presentation')
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const TYPE_LABELS = {
    note:         { icon: '📝', label: 'Notat' },
    meeting:      { icon: '🤝', label: 'Møte' },
    task:         { icon: '🎯', label: 'Oppgave' },
    presentation: { icon: '🎤', label: 'Presentasjon' },
};

const STYLES = `
    :host { display: block; }
    .nmv {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px 14px;
        color: var(--text-strong);
        font: inherit;
    }
    .nmv-head {
        display: flex; align-items: center; gap: 10px;
        margin-bottom: 8px; flex-wrap: wrap;
    }
    .nmv-name { font-weight: 600; flex: 1; min-width: 160px; word-break: break-word; }
    .nmv-type {
        font-size: 0.85em; color: var(--text-muted);
        background: var(--surface-alt); border-radius: 12px;
        padding: 2px 8px; white-space: nowrap;
    }
    .nmv-pinned { font-size: 0.95em; }
    .nmv-meta {
        display: flex; gap: 14px; flex-wrap: wrap;
        font-size: 0.82em; color: var(--text-subtle);
        margin-bottom: 8px;
    }
    .nmv-meta strong { color: var(--text-muted); font-weight: 500; }
    .nmv-themes {
        display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;
    }
    .nmv-theme {
        background: var(--accent-soft); color: var(--accent);
        padding: 2px 8px; border-radius: 10px; font-size: 0.78em;
    }
    .nmv-actions {
        display: flex; gap: 8px; flex-wrap: wrap;
    }
    button {
        padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border);
        background: var(--surface); color: var(--text-strong);
        font: inherit; font-size: 0.9em; cursor: pointer;
    }
    button:hover { border-color: var(--accent); color: var(--accent); }
    button.primary {
        background: var(--accent); color: var(--text-on-accent);
        border-color: var(--accent); font-weight: 600;
    }
    button.primary:hover { filter: brightness(0.95); color: var(--text-on-accent); }
`;

function fmtDate(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) { return iso; }
}

class NoteMetaView extends WNElement {
    css() { return STYLES; }

    set meta(val) {
        this._meta = val && typeof val === 'object' ? val : null;
        this.requestRender();
    }
    get meta() { return this._meta || null; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this.addEventListener('click', (ev) => {
            const action = ev.target && ev.target.dataset && ev.target.dataset.action;
            if (!action) return;
            const m = this._meta || {};
            const detail = { week: m.week || '', file: m.file || '' };
            if (action === 'present') detail.presentationStyle = m.presentationStyle || '';
            this.dispatchEvent(new CustomEvent('note-meta:' + action, {
                bubbles: true, cancelable: true, composed: true, detail
            }));
        });
    }

    render() {
        const m = this._meta;
        if (!m) return html`<div class="nmv"><em>Ingen metadata</em></div>`;
        const type = m.type || 'note';
        const tInfo = TYPE_LABELS[type] || { icon: '📌', label: type };
        const themes = Array.isArray(m.themes) ? m.themes : [];
        const isPresentation = type === 'presentation';
        return html`
            <div class="nmv">
                <div class="nmv-head">
                    <span class="nmv-name">${m.name || m.file || '(uten navn)'}</span>
                    <span class="nmv-type">${tInfo.icon} ${tInfo.label}</span>
                    ${m.pinned ? html`<span class="nmv-pinned" title="Festet">📌</span>` : ''}
                </div>
                <div class="nmv-meta">
                    ${m.week ? html`<span><strong>Uke:</strong> ${escapeHtml(m.week)}</span>` : ''}
                    ${m.file ? html`<span><strong>Fil:</strong> ${escapeHtml(m.file)}</span>` : ''}
                    ${m.created ? html`<span><strong>Opprettet:</strong> ${escapeHtml(fmtDate(m.created))}</span>` : ''}
                    ${m.modified ? html`<span><strong>Endret:</strong> ${escapeHtml(fmtDate(m.modified))}</span>` : ''}
                    ${isPresentation && m.presentationStyle ? html`<span><strong>Stil:</strong> ${escapeHtml(m.presentationStyle)}</span>` : ''}
                </div>
                ${themes.length ? html`
                    <div class="nmv-themes">
                        ${themes.map(t => html`<span class="nmv-theme">#${escapeHtml(t)}</span>`)}
                    </div>
                ` : ''}
                <div class="nmv-actions">
                    <button type="button" class="primary" data-action="view">👁 Vis</button>
                    <button type="button" data-action="edit">✏️ Rediger</button>
                    ${isPresentation ? html`<button type="button" data-action="present">🎤 Presenter</button>` : ''}
                </div>
            </div>
        `;
    }
}

if (!customElements.get('note-meta-view')) customElements.define('note-meta-view', NoteMetaView);
