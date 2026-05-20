/**
 * <person-multi-picker>
 *
 * Multi-select person picker with autocomplete. Selected people are shown
 * as removable chips. The text input filters the dropdown list.
 *
 * Attributes:
 *   people_service  — service path attribute
 *   value           — comma-separated keys (initial selection)
 *   placeholder     — input placeholder (default "Legg til person…")
 *   disabled        — disable the control
 *
 * Properties:
 *   .value          — array of selected keys (getter/setter)
 *
 * Events (bubbling, composed):
 *   change          — { value: string[] }  when selection changes
 */
import { WNElement, html, escapeHtml } from '../../components/_shared.js';

const CSS = `
    :host { display: block; min-width: 0; position: relative; }
    .wrap {
        display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
        padding: 6px 10px;
        border: 2px solid var(--border-soft);
        border-radius: 8px;
        background: var(--bg);
        cursor: text;
        min-height: 36px;
    }
    :host([open]) .wrap,
    .wrap:focus-within { border-color: var(--accent); }
    :host([disabled]) .wrap { opacity: 0.5; pointer-events: none; }

    .chip {
        display: inline-flex; align-items: center; gap: 3px;
        padding: 2px 8px; border-radius: 10px; font-size: 0.82em;
        background: var(--accent-soft); border: 1px solid var(--accent);
        color: var(--accent-strong); font-weight: 500;
        white-space: nowrap;
    }
    .chip .x {
        cursor: pointer; margin-left: 2px; font-size: 1.1em;
        color: var(--text-muted); line-height: 1;
    }
    .chip .x:hover { color: var(--danger, #c53030); }

    input.trig {
        flex: 1; min-width: 80px; border: none; outline: none;
        padding: 4px 2px; font-size: 0.95em;
        background: transparent; color: var(--text);
        font-family: inherit;
    }
    input.trig::placeholder { color: var(--text-subtle); }

    .menu {
        position: absolute; left: 0; right: 0; top: calc(100% + 2px);
        max-height: 200px; overflow-y: auto;
        background: var(--surface, var(--bg));
        border: 2px solid var(--border-soft);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        padding: 4px 0;
        display: none;
    }
    :host([open]) .menu { display: block; }
    .opt {
        padding: 6px 12px; cursor: pointer;
        font-size: 0.95em; color: var(--text);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .opt:hover, .opt.active { background: var(--accent-soft, var(--surface-alt)); }
    .opt .me { color: var(--text-muted); font-size: 0.85em; margin-left: 4px; }
    .opt.empty { color: var(--text-subtle); font-style: italic; cursor: default; }
`;

class PersonMultiPicker extends WNElement {
    static get domain() { return 'people'; }
    static get observedAttributes() { return ['people_service', 'value', 'placeholder', 'disabled']; }

    css() { return CSS; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        const root = this.shadowRoot;
        this._input = root.querySelector('input.trig');
        this._menu  = root.querySelector('.menu');
        this._chipsWrap = root.querySelector('.chips');
        this._selected = [];
        this._people = [];
        this._activeIdx = -1;

        // Parse initial value attribute
        const initVal = this.getAttribute('value') || '';
        if (initVal) this._selected = initVal.split(',').map(k => k.trim()).filter(Boolean);

        this._input.addEventListener('focus', () => this._open());
        this._input.addEventListener('input', () => {
            if (!this.hasAttribute('open')) this._open();
            this._renderMenu();
        });
        this._input.addEventListener('keydown', e => this._onKey(e));
        root.querySelector('.wrap').addEventListener('click', () => this._input.focus());

        this._menu.addEventListener('mousedown', e => {
            const opt = e.target.closest('.opt[data-key]');
            if (!opt) return;
            e.preventDefault();
            this._toggle(opt.dataset.key);
        });

        this._chipsWrap.addEventListener('click', e => {
            const x = e.target.closest('.x');
            if (!x) return;
            const chip = x.closest('.chip');
            if (chip && chip.dataset.key) this._remove(chip.dataset.key);
        });

        this._onOutside = e => {
            if (!this.hasAttribute('open')) return;
            const path = e.composedPath ? e.composedPath() : [];
            if (!path.includes(this)) this._close();
        };
        document.addEventListener('mousedown', this._onOutside, true);

        this._renderChips();
    }

    disconnectedCallback() {
        if (this._onOutside) document.removeEventListener('mousedown', this._onOutside, true);
    }

    attributeChangedCallback(name, _old, val) {
        if (!this._wired) return;
        if (name === 'value') {
            this._selected = (val || '').split(',').map(k => k.trim()).filter(Boolean);
            this._renderChips();
        } else if (name === 'disabled') {
            this._input.disabled = val !== null;
        } else if (name === 'placeholder') {
            this._input.placeholder = val || 'Legg til person…';
        } else if (name === 'people_service') {
            this._loaded = false;
        }
    }

    get value() { return this._selected.slice(); }
    set value(v) {
        this._selected = Array.isArray(v) ? v.slice() : [];
        this._renderChips();
    }

    _open() {
        if (this.hasAttribute('disabled') || this.hasAttribute('open')) return;
        this.setAttribute('open', '');
        this._activeIdx = -1;
        if (!this._loaded) {
            this._load().then(() => {
                if (this.hasAttribute('open')) this._renderMenu();
            });
        }
        this._renderMenu();
    }

    _close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this._activeIdx = -1;
        this._input.value = '';
    }

    _onKey(e) {
        const isOpen = this.hasAttribute('open');
        if (e.key === 'Escape') {
            if (isOpen) { e.preventDefault(); this._close(); this._input.blur(); }
            return;
        }
        if (e.key === 'Backspace' && !this._input.value && this._selected.length) {
            e.preventDefault();
            this._remove(this._selected[this._selected.length - 1]);
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!isOpen) { this._open(); return; }
            const opts = this._currentOpts();
            if (!opts.length) return;
            e.preventDefault();
            const dir = e.key === 'ArrowDown' ? 1 : -1;
            this._activeIdx = (this._activeIdx + dir + opts.length) % opts.length;
            this._highlight();
            return;
        }
        if (e.key === 'Enter') {
            if (!isOpen) return;
            e.preventDefault();
            const opts = this._currentOpts();
            if (this._activeIdx >= 0 && opts[this._activeIdx]) {
                this._toggle(opts[this._activeIdx].key);
            } else if (opts.length === 1) {
                this._toggle(opts[0].key);
            }
            return;
        }
        if (e.key === 'Tab') {
            this._close();
            return;
        }
    }

    _toggle(key) {
        if (this._selected.includes(key)) {
            this._remove(key);
        } else {
            this._selected.push(key);
            this._renderChips();
            this._input.value = '';
            this._renderMenu();
            this._emitChange();
        }
    }

    _remove(key) {
        this._selected = this._selected.filter(k => k !== key);
        this._renderChips();
        this._renderMenu();
        this._emitChange();
    }

    _emitChange() {
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true, composed: true,
            detail: { value: this._selected.slice() },
        }));
    }

    _renderChips() {
        if (!this._chipsWrap) return;
        const esc = escapeHtml;
        this._chipsWrap.innerHTML = this._selected.map(key => {
            const p = this._people.find(x => x.key === key);
            const label = p ? (p.isMe ? `${p.name} (meg)` : p.name) : key;
            return `<span class="chip" data-key="${esc(key)}">${esc(label)}<span class="x">✕</span></span>`;
        }).join('');
    }

    _currentOpts() {
        const q = (this._input.value || '').trim().toLowerCase();
        const selectedSet = new Set(this._selected);
        let filtered = this._people.filter(p => !selectedSet.has(p.key));
        if (q) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
            );
        }
        return filtered;
    }

    _renderMenu() {
        const opts = this._currentOpts();
        if (!opts.length) {
            this._menu.innerHTML = `<div class="opt empty">Ingen treff</div>`;
            this._activeIdx = -1;
            return;
        }
        if (this._activeIdx >= opts.length) this._activeIdx = 0;
        this._menu.innerHTML = opts.map((p, i) => {
            const cls = i === this._activeIdx ? 'opt active' : 'opt';
            const me = p.isMe ? `<span class="me">(meg)</span>` : '';
            return `<div class="${cls}" data-key="${escapeHtml(p.key)}">${escapeHtml(p.name)}${me}</div>`;
        }).join('');
    }

    _highlight() {
        const items = this._menu.querySelectorAll('.opt');
        items.forEach((el, i) => el.classList.toggle('active', i === this._activeIdx));
        const active = this._menu.querySelector('.opt.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    async _load() {
        if (this._loaded) return;
        this._loaded = true;
        const meKey = (typeof window !== 'undefined' && window.mePersonKey) || '';
        try {
            const svc = this.serviceFor('people');
            let arr;
            if (svc && typeof svc.list === 'function') {
                arr = await svc.list();
            } else {
                const resp = await fetch('/api/people');
                arr = await resp.json();
            }
            if (!Array.isArray(arr)) return;
            this._people = arr
                .filter(p => p && p.key)
                .map(p => ({ key: p.key, name: p.name || p.key, isMe: p.key === meKey }))
                .sort((a, b) => {
                    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            // Re-render chips now that we have names
            this._renderChips();
        } catch (_) { /* leave empty */ }
    }

    render() {
        const ph = this.getAttribute('placeholder') || 'Legg til person…';
        return html`
            <div class="wrap">
                <span class="chips"></span>
                <input class="trig" type="text" autocomplete="off" placeholder="${escapeHtml(ph)}" />
            </div>
            <div class="menu" role="listbox"></div>
        `;
    }
}

if (!customElements.get('person-multi-picker')) customElements.define('person-multi-picker', PersonMultiPicker);
