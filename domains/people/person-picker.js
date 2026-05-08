/**
 * <person-picker>
 *
 * A reusable combobox for selecting a single person by `key`. The trigger
 * is a text input that doubles as a filter — focus it and start typing to
 * narrow the list. Pick with mouse or keyboard (↑/↓/Enter), Esc closes
 * the popup and reverts to the previously committed selection.
 *
 * Loads the people list from `people_service` (resolved via
 * `WNElement.serviceFor('people')`), falling back to `fetch('/api/people')`
 * if no service is configured. The "me" person (`window.mePersonKey`)
 * floats to the top with a "(meg)" suffix.
 *
 * Attributes:
 *   people_service  — service path attribute (e.g. "MockPeopleService")
 *   value           — initial selected key
 *   placeholder     — input placeholder when nothing is selected
 *                     (default "Velg person…")
 *   default-me      — preselect the @me person if no value is set
 *   disabled        — disable the underlying control
 *
 * Properties:
 *   .value          — current key (string, '' when none)
 *   .selectedPerson — the loaded person object (or null)
 *
 * Events (bubbling, composed):
 *   change          — { value, person }   when the user picks a person
 *   people-loaded   — { count }           after the option list is populated
 *
 * Example:
 *   <person-picker people_service="week-note-services.people_service"
 *                  default-me></person-picker>
 */
import { WNElement, html, escapeHtml } from '../../components/_shared.js';

const CSS = `
    :host { display: inline-block; min-width: 0; width: 100%; position: relative; }
    .wrap { display: flex; gap: 4px; align-items: stretch; }
    input.trig {
        flex: 1; min-width: 0;
        padding: 8px 12px;
        border: 2px solid var(--border-soft);
        border-radius: 8px; font-size: 0.95em; outline: none;
        background: var(--bg); color: var(--text);
        font-family: inherit;
    }
    input.trig:focus { border-color: var(--accent); }
    input.trig::placeholder { color: var(--text-subtle); }
    button.clear {
        border: 2px solid var(--border-soft); background: var(--bg);
        color: var(--text-muted); border-radius: 8px;
        padding: 0 10px; cursor: pointer; font: inherit;
    }
    button.clear:hover { color: var(--text-strong); border-color: var(--accent); }
    button.clear[hidden] { display: none; }
    :host([disabled]) input.trig,
    :host([disabled]) button.clear {
        opacity: 0.5; pointer-events: none;
    }

    .menu {
        position: absolute; left: 0; right: 0; top: calc(100% + 2px);
        max-height: 240px; overflow-y: auto;
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
    .opt.selected { color: var(--accent-strong, var(--accent)); font-weight: 600; }
    .opt.empty { color: var(--text-subtle); font-style: italic; cursor: default; }
    .opt .me { color: var(--text-muted); font-size: 0.85em; margin-left: 4px; }
`;

class PersonPicker extends WNElement {
    static get domain() { return 'people'; }
    static get observedAttributes() {
        return ['people_service', 'value', 'placeholder', 'default-me', 'disabled'];
    }

    css() { return CSS; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        const root = this.shadowRoot;
        this._input = root.querySelector('input.trig');
        this._clear = root.querySelector('button.clear');
        this._menu  = root.querySelector('.menu');
        this._value = this.getAttribute('value') || '';
        this._activeIdx = -1;
        this._people = [];

        this._input.addEventListener('focus', () => this._open());
        this._input.addEventListener('mousedown', () => {
            if (this.hasAttribute('open')) return;
            // Defer so focus handler runs first.
            setTimeout(() => this._open(), 0);
        });
        this._input.addEventListener('input', () => {
            this._open();
            this._renderMenu();
        });
        this._input.addEventListener('keydown', e => this._onKey(e));
        this._clear.addEventListener('mousedown', e => {
            e.preventDefault();
            this._select('');
            this._input.focus();
        });
        this._menu.addEventListener('mousedown', e => {
            const opt = e.target.closest('.opt[data-key]');
            if (!opt) return;
            e.preventDefault();
            this._select(opt.dataset.key);
            this._input.blur();
        });
        // Outside-click handler (capture, so it sees clicks before they're handled).
        this._onOutside = e => {
            if (!this.hasAttribute('open')) return;
            const path = e.composedPath ? e.composedPath() : [];
            if (!path.includes(this)) this._close(true);
        };
        document.addEventListener('mousedown', this._onOutside, true);

        if (this.hasAttribute('disabled')) this._input.disabled = true;
        // Load deferred: only fetch the people list when the picker is
        // actually opened. For default-me, set the @me key synchronously
        // (display falls back to the raw key until the list loads).
        if (this.hasAttribute('default-me') && !this._value) {
            const meKey = (typeof window !== 'undefined' && window.mePersonKey) || '';
            if (meKey) { this._value = meKey; this._syncDisplay(); }
        } else {
            this._syncDisplay();
        }
    }

    disconnectedCallback() {
        if (this._onOutside) document.removeEventListener('mousedown', this._onOutside, true);
    }

    attributeChangedCallback(name, _old, val) {
        if (!this._wired) return;
        if (name === 'value') {
            this._value = val || '';
            this._syncDisplay();
        } else if (name === 'disabled') {
            this._input.disabled = val !== null;
        } else if (name === 'placeholder') {
            this._input.placeholder = val || 'Velg person…';
        } else if (name === 'people_service') {
            this._loaded = false;
            this._load();
        } else if (name === 'default-me' && !this._value) {
            this._applyDefaultMe();
        }
    }

    get value() { return this._value || ''; }
    set value(v) {
        this._value = v == null ? '' : String(v);
        this._syncDisplay();
    }

    get selectedPerson() {
        return (this._people || []).find(p => p.key === this._value) || null;
    }

    _open() {
        if (this.hasAttribute('disabled') || this.hasAttribute('open')) return;
        this.setAttribute('open', '');
        this._activeIdx = -1;
        // When opening, clear the filter so all options are visible.
        this._input.value = '';
        // Lazy-load the people list on first open.
        if (!this._loaded) {
            this._load().then(() => {
                if (this.hasAttribute('open')) this._renderMenu();
            });
        }
        this._renderMenu();
    }

    _close(revert) {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this._activeIdx = -1;
        if (revert) this._syncDisplay();
    }

    _onKey(e) {
        const isOpen = this.hasAttribute('open');
        if (e.key === 'Escape') {
            if (isOpen) { e.preventDefault(); this._close(true); this._input.blur(); }
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
            const opts = this._currentOpts();
            if (this._activeIdx >= 0 && opts[this._activeIdx]) {
                e.preventDefault();
                this._select(opts[this._activeIdx].key);
                this._input.blur();
            } else if (opts.length === 1) {
                e.preventDefault();
                this._select(opts[0].key);
                this._input.blur();
            }
            return;
        }
        if (e.key === 'Tab') {
            this._close(true);
            return;
        }
    }

    _select(key) {
        const prev = this._value;
        this._value = key || '';
        this._syncDisplay();
        this._close(false);
        if (prev !== this._value) {
            this.dispatchEvent(new CustomEvent('change', {
                bubbles: true, composed: true,
                detail: { value: this._value, person: this.selectedPerson },
            }));
        }
    }

    _syncDisplay() {
        if (!this._input) return;
        const p = this.selectedPerson;
        const placeholder = this.getAttribute('placeholder') || 'Velg person…';
        this._input.placeholder = placeholder;
        // If we have a value but the people list hasn't loaded yet, show
        // the raw key as a placeholder name. It'll be replaced with the
        // proper display name as soon as the list loads (on open).
        const fallback = this._value && !this._loaded ? this._value : '';
        this._input.value = p ? this._labelFor(p) : fallback;
        this._clear.hidden = !this._value;
    }

    _labelFor(p) {
        return p.isMe ? `${p.name} (meg)` : p.name;
    }

    _currentOpts() {
        const q = (this._input.value || '').trim().toLowerCase();
        if (!q) return this._people.slice();
        return this._people.filter(p =>
            p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
        );
    }

    _renderMenu() {
        const opts = this._currentOpts();
        if (!opts.length) {
            this._menu.innerHTML = `<div class="opt empty">Ingen treff</div>`;
            this._activeIdx = -1;
            return;
        }
        // Default highlight: keep current selection visible if present, else first.
        if (this._activeIdx < 0 || this._activeIdx >= opts.length) {
            const idx = this._value ? opts.findIndex(p => p.key === this._value) : 0;
            this._activeIdx = idx >= 0 ? idx : 0;
        }
        this._menu.innerHTML = opts.map((p, i) => {
            const cls = ['opt'];
            if (p.key === this._value) cls.push('selected');
            if (i === this._activeIdx) cls.push('active');
            const me = p.isMe ? `<span class="me">(meg)</span>` : '';
            return `<div class="${cls.join(' ')}" data-key="${escapeHtml(p.key)}">${escapeHtml(p.name)}${me}</div>`;
        }).join('');
        this._scrollActiveIntoView();
    }

    _highlight() {
        const items = this._menu.querySelectorAll('.opt');
        items.forEach((el, i) => el.classList.toggle('active', i === this._activeIdx));
        this._scrollActiveIntoView();
    }

    _scrollActiveIntoView() {
        const item = this._menu.querySelector('.opt.active');
        if (item && item.scrollIntoView) item.scrollIntoView({ block: 'nearest' });
    }

    _applyDefaultMe() {
        if (this._value) return;
        const meKey = (typeof window !== 'undefined' && window.mePersonKey) || '';
        if (meKey && this._people.some(p => p.key === meKey)) {
            this._value = meKey;
            this._syncDisplay();
        }
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
            const items = arr
                .filter(p => p && p.key)
                .map(p => ({ key: p.key, name: p.name || p.key, isMe: p.key === meKey }))
                .sort((a, b) => {
                    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            this._people = items;
            if (!this._value && this.hasAttribute('default-me')) this._applyDefaultMe();
            else this._syncDisplay();
            if (this.hasAttribute('open')) this._renderMenu();
            this.dispatchEvent(new CustomEvent('people-loaded', {
                bubbles: true, composed: true,
                detail: { count: items.length },
            }));
        } catch (_) { /* leave default */ }
    }

    render() {
        const ph = this.getAttribute('placeholder') || 'Velg person…';
        return html`
            <div class="wrap">
                <input class="trig" type="text" autocomplete="off" placeholder="${escapeHtml(ph)}" />
                <button type="button" class="clear" title="Fjern" hidden>✕</button>
            </div>
            <div class="menu" role="listbox"></div>
        `;
    }
}

if (!customElements.get('person-picker')) customElements.define('person-picker', PersonPicker);
