/**
 * <create-modal> — global Alt+C command palette for creating new items.
 *
 * Renders nothing visible in its own element. Appends a fixed overlay
 * to document.body. Registers a global keydown listener for Alt+C
 * and exposes window.openCreateModal(). When triggered, shows a modal
 * with a list of creatable item types.
 *
 * Public API:
 *   element.open()  / window.openCreateModal()
 *   element.close() / window.closeCreateModal()
 */
import { WNElement, html } from './_shared.js';

const STYLE_ID = 'create-modal-styles';
function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        create-modal { display: none !important; }
        .cm-overlay {
            display: none; position: fixed; inset: 0;
            background: var(--overlay, rgba(0,0,0,.4));
            z-index: 1100; align-items: flex-start; justify-content: center;
            padding-top: min(20vh, 160px);
        }
        .cm-overlay.open { display: flex; }
        .cm-card {
            background: var(--bg); border: 1px solid var(--border-soft);
            border-radius: 12px; padding: 12px 8px; width: min(400px, 90vw);
            box-shadow: 0 20px 60px var(--shadow, rgba(0,0,0,.2));
            animation: cm-pop .12s ease-out;
        }
        @keyframes cm-pop { from { opacity: 0; transform: translateY(-8px) scale(.97); } to { opacity: 1; transform: none; } }
        .cm-overlay .cm-title {
            font-size: 0.82em; font-weight: 600; color: var(--text-muted);
            padding: 4px 12px 8px; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .cm-overlay .cm-list { list-style: none; margin: 0; padding: 0; }
        .cm-overlay .cm-item {
            display: flex; align-items: center; gap: 12px;
            padding: 10px 14px; border-radius: 8px; cursor: pointer;
            color: var(--text); font-size: 0.95em; transition: background .1s;
        }
        .cm-overlay .cm-item:hover, .cm-overlay .cm-item.active {
            background: var(--accent-soft, #edf2f7);
        }
        .cm-overlay .cm-item .cm-icon { font-size: 1.2em; width: 28px; text-align: center; }
        .cm-overlay .cm-item .cm-label { flex: 1; }
        .cm-overlay .cm-item .cm-kbd {
            font-family: var(--font-mono, monospace); font-size: 0.75em;
            background: var(--surface-alt, #f0f0f0); border: 1px solid var(--border-faint);
            border-radius: 4px; padding: 2px 6px; color: var(--text-subtle);
        }
        .cm-overlay .cm-footer {
            padding: 8px 12px 4px; font-size: 0.75em; color: var(--text-subtle);
            border-top: 1px solid var(--border-faint); margin-top: 6px;
        }
    `;
    document.head.appendChild(style);
}

const ITEMS = [
    { key: 'n', icon: '📝', label: 'Nytt notat', action: 'note' },
    { key: 't', icon: '✅', label: 'Ny oppgave', action: 'task' },
    { key: 'm', icon: '📅', label: 'Nytt møte', action: 'meeting' },
    { key: 'r', icon: '🏁', label: 'Nytt resultat', action: 'result' },
    { key: 'g', icon: '🏆', label: 'Nytt mål', action: 'goal' },
    { key: 'p', icon: '👤', label: 'Ny person', action: 'person' },
];

class CreateModal extends WNElement {
    connectedCallback() {
        ensureStyles();
        this._activeIdx = 0;
        this._buildOverlay();
        this._onGlobalKey = this._onGlobalKey.bind(this);
        document.addEventListener('keydown', this._onGlobalKey);
        window.openCreateModal = () => this.open();
        window.closeCreateModal = () => this.close();
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onGlobalKey);
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        if (window.openCreateModal === this.open) window.openCreateModal = undefined;
    }

    _buildOverlay() {
        const items = ITEMS.map((it, i) => `
            <li class="cm-item${i === 0 ? ' active' : ''}" data-action="${it.action}" data-idx="${i}">
                <span class="cm-icon">${it.icon}</span>
                <span class="cm-label">${it.label}</span>
                <span class="cm-kbd">${it.key}</span>
            </li>
        `).join('');

        const overlay = document.createElement('div');
        overlay.className = 'cm-overlay';
        overlay.id = 'createModalOverlay';
        overlay.innerHTML = `
            <div class="cm-card">
                <div class="cm-title">Opprett ny…</div>
                <ul class="cm-list">${items}</ul>
                <div class="cm-footer">
                    <kbd>↑↓</kbd> naviger &nbsp; <kbd>Enter</kbd> velg &nbsp; <kbd>Esc</kbd> lukk
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this._overlay = overlay;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });
        overlay.querySelectorAll('.cm-item').forEach((el) => {
            el.addEventListener('click', () => {
                this._execute(el.dataset.action);
            });
            el.addEventListener('mouseenter', () => {
                this._setActive(parseInt(el.dataset.idx, 10));
            });
        });
    }

    open() {
        if (!this._overlay) return;
        this._overlay.classList.add('open');
        this._activeIdx = 0;
        this._updateActive();
    }

    close() {
        if (!this._overlay) return;
        this._overlay.classList.remove('open');
    }

    get _isOpen() {
        return this._overlay && this._overlay.classList.contains('open');
    }

    _setActive(idx) {
        this._activeIdx = Math.max(0, Math.min(ITEMS.length - 1, idx));
        this._updateActive();
    }

    _updateActive() {
        if (!this._overlay) return;
        this._overlay.querySelectorAll('.cm-item').forEach((el, i) => {
            el.classList.toggle('active', i === this._activeIdx);
        });
    }

    _onGlobalKey(e) {
        // Alt+C opens the modal
        if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'c' || e.key === 'C')) {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            e.preventDefault();
            if (this._isOpen) this.close();
            else this.open();
            return;
        }

        if (!this._isOpen) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._setActive(this._activeIdx + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._setActive(this._activeIdx - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this._execute(ITEMS[this._activeIdx].action);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        } else if (!e.altKey && !e.ctrlKey && !e.metaKey) {
            // Single-key shortcut within modal
            const match = ITEMS.find(it => it.key === e.key.toLowerCase());
            if (match) {
                e.preventDefault();
                this._execute(match.action);
            }
        }
    }

    _execute(action) {
        this.close();

        switch (action) {
            case 'note':
                this._fallbackNav('/editor');
                break;
            case 'task':
                if (typeof window.openTaskEditModal === 'function') {
                    window.openTaskEditModal(null);
                } else {
                    this._fallbackNav('/tasks');
                }
                break;
            case 'meeting':
                this._openMeetingModal();
                break;
            case 'result':
                this._openResultModal();
                break;
            case 'goal':
                this._openGoalModal();
                break;
            case 'person':
                this._openPersonModal();
                break;
        }
    }

    _fallbackNav(path) {
        if (window.spaNavigate && window.spaNavigate(path)) return;
        window.location.href = path;
    }

    _openMeetingModal() {
        // Reuse existing element if on the page, otherwise create one
        let mcm = document.querySelector('meeting-create-modal');
        if (!mcm) {
            if (!this._meetingModal) {
                mcm = document.createElement('meeting-create-modal');
                mcm.setAttribute('meetings_service', 'week-note-services.meetings_service');
                mcm.setAttribute('settings_service', 'week-note-services.settings_service');
                document.body.appendChild(mcm);
                this._meetingModal = mcm;
            } else {
                mcm = this._meetingModal;
            }
        }
        mcm.open();
    }

    _openResultModal() {
        if (!this._resultModal) {
            const modal = document.createElement('modal-container');
            modal.setAttribute('size', 'sm');
            const titleEl = document.createElement('span');
            titleEl.setAttribute('slot', 'title');
            titleEl.textContent = 'Nytt resultat';
            modal.appendChild(titleEl);
            const form = document.createElement('result-create');
            form.setAttribute('full', '');
            form.setAttribute('autofocus-on-connect', '');
            form.setAttribute('results_service', 'week-note-services.results_service');
            modal.appendChild(form);
            modal.setButtons([]);
            form.addEventListener('result:created', () => {
                modal.close('programmatic');
            });
            document.body.appendChild(modal);
            this._resultModal = modal;
        }
        this._resultModal.open();
        setTimeout(() => {
            const form = this._resultModal.querySelector('result-create');
            const input = form?.shadowRoot?.querySelector('input');
            if (input) input.focus();
        }, 30);
    }

    _openGoalModal() {
        if (!this._goalModal) {
            const modal = document.createElement('modal-container');
            modal.setAttribute('size', 'sm');
            const titleEl = document.createElement('span');
            titleEl.setAttribute('slot', 'title');
            titleEl.textContent = 'Nytt mål';
            const body = document.createElement('div');
            body.innerHTML = `
                <div style="padding:8px 0;display:flex;flex-direction:column;gap:10px;">
                    <div>
                        <label style="display:block;font-size:0.85em;color:var(--text-muted);margin-bottom:4px;">Tittel</label>
                        <input type="text" name="title" placeholder="Hva vil du oppnå?"
                            style="width:100%;font:inherit;font-size:1em;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);">
                    </div>
                    <div>
                        <label style="display:block;font-size:0.85em;color:var(--text-muted);margin-bottom:4px;">Beskrivelse (valgfritt)</label>
                        <textarea name="description" rows="2" placeholder="Kort beskrivelse…"
                            style="width:100%;font:inherit;font-size:0.95em;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical;"></textarea>
                    </div>
                </div>
            `;
            modal.appendChild(titleEl);
            modal.appendChild(body);
            modal.setButtons([
                { label: 'Opprett', action: async () => {
                    const input = body.querySelector('input[name=title]');
                    const title = (input.value || '').trim();
                    if (!title) { input.focus(); return; }
                    const desc = (body.querySelector('textarea[name=description]').value || '').trim();
                    try {
                        await fetch('/api/goals', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title, description: desc }),
                        });
                        modal.close('programmatic');
                    } catch (err) {
                        console.error('Goal create failed', err);
                    }
                }, variant: 'primary' },
                { label: 'Avbryt', action: (m) => m.close('button'), variant: 'ghost' },
            ]);
            document.body.appendChild(modal);
            this._goalModal = modal;
        }
        const input = this._goalModal.querySelector('input[name=title]');
        const desc = this._goalModal.querySelector('textarea[name=description]');
        if (input) input.value = '';
        if (desc) desc.value = '';
        this._goalModal.open();
        setTimeout(() => { if (input) input.focus(); }, 30);
    }

    _openPersonModal() {
        if (!this._personModal) {
            const modal = document.createElement('modal-container');
            modal.setAttribute('size', 'sm');
            const titleEl = document.createElement('span');
            titleEl.setAttribute('slot', 'title');
            titleEl.textContent = 'Ny person';
            const body = document.createElement('div');
            body.innerHTML = `
                <div style="padding:8px 0;display:flex;flex-direction:column;gap:10px;">
                    <div>
                        <label style="display:block;font-size:0.85em;color:var(--text-muted);margin-bottom:4px;">Navn</label>
                        <input type="text" name="name" placeholder="Fornavn Etternavn"
                            style="width:100%;font:inherit;font-size:1em;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);">
                    </div>
                    <div>
                        <label style="display:block;font-size:0.85em;color:var(--text-muted);margin-bottom:4px;">E-post (valgfritt)</label>
                        <input type="email" name="email" placeholder="epost@eksempel.no"
                            style="width:100%;font:inherit;font-size:1em;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);">
                    </div>
                </div>
            `;
            modal.appendChild(titleEl);
            modal.appendChild(body);
            modal.setButtons([
                { label: 'Opprett', action: async () => {
                    const input = body.querySelector('input[name=name]');
                    const name = (input.value || '').trim();
                    if (!name) { input.focus(); return; }
                    const email = (body.querySelector('input[name=email]').value || '').trim();
                    try {
                        await fetch('/api/people', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, email: email || undefined }),
                        });
                        modal.close('programmatic');
                    } catch (err) {
                        console.error('Person create failed', err);
                    }
                }, variant: 'primary' },
                { label: 'Avbryt', action: (m) => m.close('button'), variant: 'ghost' },
            ]);
            document.body.appendChild(modal);
            this._personModal = modal;
        }
        const input = this._personModal.querySelector('input[name=name]');
        const email = this._personModal.querySelector('input[name=email]');
        if (input) input.value = '';
        if (email) email.value = '';
        this._personModal.open();
        setTimeout(() => { if (input) input.focus(); }, 30);
    }
}

if (!customElements.get('create-modal')) {
    customElements.define('create-modal', CreateModal);
}
