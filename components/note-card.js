/**
 * <note-card note="WEEK/encoded-file.md">
 * Self-loading note summary card. Fetches /api/notes/<note>/card and renders
 * the same .note-card markup the home page used to emit inline.
 *
 * Buttons call window globals when present (openNoteViewModal, openPresentation,
 * deleteNoteFromHome) — defined on the home page. On other pages they bubble
 * 'note-card:view' / 'note-card:present' / 'note-card:delete' CustomEvents.
 */
(function () {
    if (customElements.get('note-card')) return;

    const TYPE_ICONS = { note: '📝', meeting: '🤝', task: '🎯', presentation: '🎤', other: '📌' };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    class NoteCard extends HTMLElement {
        static get observedAttributes() { return ['note']; }

        connectedCallback() {
            if (!this._loaded) this._load();
        }

        attributeChangedCallback(name, oldVal, newVal) {
            if (name === 'note' && oldVal !== newVal && this.isConnected) {
                this._loaded = false;
                this._load();
            }
        }

        async _load() {
            const note = this.getAttribute('note');
            if (!note) return;
            this._loaded = true;
            const slash = note.indexOf('/');
            if (slash < 0) { this._renderError('Ugyldig note-id'); return; }
            const week = note.slice(0, slash);
            const fileEnc = note.slice(slash + 1);
            // For legacy delete-handler that does
            // document.querySelector('[data-note-card="..."]').remove()
            this.setAttribute('data-note-card', `${week}/${fileEnc}`);
            this.classList.add('note-card');
            try {
                const r = await fetch(`/api/notes/${week}/${fileEnc}/card`);
                if (!r.ok) throw new Error(String(r.status));
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || 'load failed');
                this._render(week, fileEnc, d);
            } catch {
                this._renderError('Kunne ikke laste notat');
            }
        }

        _renderError(msg) {
            this.classList.add('note-card');
            this.innerHTML = `<div class="note-body" style="color:var(--text-subtle)">${esc(msg)}</div>`;
        }

        _render(week, fileEnc, d) {
            const name = d.name || fileEnc.replace(/\.md$/, '');
            const nameEsc = esc(name);
            const typeIcon = TYPE_ICONS[d.type] || '📄';
            const editHref = `/editor/${week}/${fileEnc}`;

            this.innerHTML = `
                <div class="note-h">
                    <span>${d.pinned ? '<span title="Festet">📌</span> ' : ''}${typeIcon} ${nameEsc}</span>
                    <span class="note-actions">
                        <button type="button" class="note-icon-btn" data-act="view" title="Vis ${nameEsc}">👁️</button>
                        ${d.type === 'presentation' ? `<button type="button" class="note-icon-btn" data-act="present" title="Presenter ${nameEsc}">🎤</button>` : ''}
                        <a href="${esc(editHref)}" title="Rediger ${nameEsc}">✏️</a>
                        <button type="button" class="note-icon-btn note-del" data-act="delete" title="Slett ${nameEsc}">🗑️</button>
                    </span>
                </div>
                ${d.snippet ? `<div class="note-body">${d.snippet}</div>` : ''}
            `;

            this.addEventListener('click', (ev) => {
                const btn = ev.target.closest('button[data-act]');
                if (!btn || !this.contains(btn)) return;
                const act = btn.getAttribute('data-act');
                const handlers = {
                    view: window.openNoteViewModal,
                    present: window.openPresentation,
                    delete: window.deleteNoteFromHome,
                };
                const fn = handlers[act];
                if (typeof fn === 'function') {
                    fn(week, fileEnc, name);
                } else {
                    this.dispatchEvent(new CustomEvent(`note-card:${act}`, {
                        bubbles: true,
                        detail: { week, file: fileEnc, name },
                    }));
                }
            });
        }
    }

    customElements.define('note-card', NoteCard);
})();
