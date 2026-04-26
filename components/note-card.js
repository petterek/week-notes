// <note-card note="WEEK/encoded-file.md">
// Self-loading note summary card. Fetches /api/notes/<note>/card and renders
// the same .note-card markup the home page used to emit inline.
//
// Buttons call window globals when present (openNoteViewModal, openPresentation,
// deleteNoteFromHome) — defined on the home page. On other pages they're skipped.
(function () {
    if (customElements.get('note-card')) return;

    const TYPE_ICONS = { note: '📝', meeting: '🤝', task: '🎯', presentation: '🎤', other: '📌' };

    function escAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
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
            // Mark for legacy delete-handler that does
            // document.querySelector('[data-note-card="..."]').remove()
            this.setAttribute('data-note-card', week + '/' + fileEnc);
            this.classList.add('note-card');
            try {
                const r = await fetch('/api/notes/' + week + '/' + fileEnc + '/card');
                if (!r.ok) throw new Error(String(r.status));
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || 'load failed');
                this._render(week, fileEnc, d);
            } catch (e) {
                this._renderError('Kunne ikke laste notat');
            }
        }

        _renderError(msg) {
            this.classList.add('note-card');
            this.innerHTML = '<div class="note-body" style="color:#c53030">' + escAttr(msg) + '</div>';
        }

        _render(week, fileEnc, d) {
            const name = d.name || fileEnc.replace(/\.md$/, '');
            const nameEsc = escAttr(name);
            const typeIcon = TYPE_ICONS[d.type] || '📄';
            const pinIcon = d.pinned ? '<span title="Festet">📌</span> ' : '';
            const editHref = '/editor/' + week + '/' + fileEnc;
            const presentBtn = d.type === 'presentation'
                ? '<button type="button" class="note-icon-btn" data-act="present" title="Presenter ' + nameEsc + '">🎤</button>'
                : '';
            const snippet = d.snippet
                ? '<div class="note-body">' + d.snippet + '</div>'
                : '';
            this.innerHTML =
                '<div class="note-h">' +
                  '<span>' + pinIcon + typeIcon + ' ' + nameEsc + '</span>' +
                  '<span class="note-actions">' +
                    '<button type="button" class="note-icon-btn" data-act="view" title="Vis ' + nameEsc + '">👁️</button>' +
                    presentBtn +
                    '<a href="' + escAttr(editHref) + '" title="Rediger ' + nameEsc + '">✏️</a>' +
                    '<button type="button" class="note-icon-btn note-del" data-act="delete" title="Slett ' + nameEsc + '">🗑️</button>' +
                  '</span>' +
                '</div>' +
                snippet;

            this.addEventListener('click', (ev) => {
                const btn = ev.target.closest('button[data-act]');
                if (!btn || !this.contains(btn)) return;
                const act = btn.getAttribute('data-act');
                if (act === 'view' && typeof window.openNoteViewModal === 'function') {
                    window.openNoteViewModal(week, fileEnc);
                } else if (act === 'present' && typeof window.openPresentation === 'function') {
                    window.openPresentation(week, fileEnc);
                } else if (act === 'delete' && typeof window.deleteNoteFromHome === 'function') {
                    window.deleteNoteFromHome(week, fileEnc, name);
                } else {
                    // Fallback: dispatch event so future hosts can hook in
                    this.dispatchEvent(new CustomEvent('note-card:' + act, {
                        bubbles: true,
                        detail: { week, file: fileEnc, name },
                    }));
                }
            });
        }
    }

    customElements.define('note-card', NoteCard);
})();
