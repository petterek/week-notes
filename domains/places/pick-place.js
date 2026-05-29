/**
 * <pick-place>
 *
 * Single-select place picker with autocomplete. Shows existing places in a
 * dropdown filtered by the user's input. When the typed text has no exact
 * match a "➕ Opprett «…»" option is shown that creates a new place on the
 * server and selects it.  Typing free text without picking anything works
 * too — the typed string becomes a free-text location (key is null).
 *
 * Attributes:
 *   places_service  — service path (MockPlacesService or similar)
 *   placeholder     — input placeholder (default "Velg eller opprett sted…")
 *   disabled        — disable the control
 *
 * Properties:
 *   .value          — { key: string|null, name: string } | null
 *                     key is null for free-text; name is the display string.
 *                     Null means nothing is entered.
 *   .key            — shorthand: (this.value?.key ?? '')
 *
 * Events (bubbling, composed):
 *   change          — detail: { key: string|null, name: string }
 *                     Fires on selection, on create, and on clear.
 */
import { WNElement, html, escapeHtml } from '../../components/_shared.js';

const CSS = `
    :host { display: block; min-width: 0; position: relative; }
    .wrap {
        display: flex; align-items: center; gap: 4px;
        padding: 6px 10px;
        border: 2px solid var(--border-soft);
        border-radius: 8px;
        background: var(--bg);
        cursor: text;
        min-height: 36px;
        box-sizing: border-box;
    }
    :host([open]) .wrap,
    .wrap:focus-within { border-color: var(--accent); }
    :host([disabled]) .wrap { opacity: 0.5; pointer-events: none; }

    input.trig {
        flex: 1; min-width: 0; border: none; outline: none;
        padding: 2px 0; font-size: 0.95em;
        background: transparent; color: var(--text);
        font-family: inherit;
    }
    input.trig::placeholder { color: var(--text-subtle); }

    .link-badge {
        font-size: 0.78em; color: var(--accent-strong);
        background: var(--accent-soft); border: 1px solid var(--accent);
        border-radius: 4px; padding: 1px 5px; cursor: default;
        white-space: nowrap; flex-shrink: 0; line-height: 1.4;
        pointer-events: none;
    }
    .x-btn {
        flex-shrink: 0; background: none; border: none; cursor: pointer;
        color: var(--text-muted); font-size: 1.1em; padding: 0 2px;
        line-height: 1;
    }
    .x-btn:hover { color: var(--danger, #c53030); }

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
    .opt.create { color: var(--accent-strong); font-style: italic; }
    .opt.empty { color: var(--text-subtle); font-style: italic; cursor: default; }
    .opt.loading { color: var(--text-subtle); cursor: default; }
`;

class PickPlace extends WNElement {
    static get domain() { return 'places'; }
    static get observedAttributes() { return ['places_service', 'placeholder', 'disabled']; }

    css() { return CSS; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        const root = this.shadowRoot;
        this._input   = root.querySelector('input.trig');
        this._menu    = root.querySelector('.menu');
        this._badge   = root.querySelector('.link-badge');
        this._xBtn    = root.querySelector('.x-btn');
        this._places  = [];
        this._loaded  = false;
        this._creating = false;
        this._activeIdx = -1;
        this._key  = null;   // linked place key (null = free-text)
        this._text = '';     // display / input text

        this._input.addEventListener('focus', () => this._open());
        this._input.addEventListener('input', () => {
            this._text = this._input.value;
            this._key = null; // typing breaks the link
            this._updateBadge();
            if (!this.hasAttribute('open')) this._open();
            this._renderMenu();
        });
        this._input.addEventListener('blur', () => {
            // Delay so clicks on menu options register first
            setTimeout(() => {
                this._text = this._input.value.trim();
                this._close();
            }, 150);
        });
        this._input.addEventListener('keydown', e => this._onKey(e));

        root.querySelector('.wrap').addEventListener('click', () => this._input.focus());

        this._xBtn.addEventListener('mousedown', e => {
            e.preventDefault();
            this._clear();
        });

        this._menu.addEventListener('mousedown', e => {
            const opt = e.target.closest('.opt');
            if (!opt || opt.classList.contains('empty') || opt.classList.contains('loading')) return;
            e.preventDefault();
            if (opt.classList.contains('create')) {
                this._createPlace(this._text.trim());
            } else if (opt.dataset.key) {
                this._select(opt.dataset.key, opt.dataset.name);
            }
        });

        this._onOutside = e => {
            if (!this.hasAttribute('open')) return;
            const path = e.composedPath ? e.composedPath() : [];
            if (!path.includes(this)) this._close();
        };
        document.addEventListener('mousedown', this._onOutside, true);
    }

    disconnectedCallback() {
        if (this._onOutside) document.removeEventListener('mousedown', this._onOutside, true);
    }

    attributeChangedCallback(name, _old, val) {
        if (!this._wired) return;
        if (name === 'disabled') {
            this._input.disabled = val !== null;
        } else if (name === 'placeholder') {
            this._input.placeholder = val || 'Velg eller opprett sted…';
        } else if (name === 'places_service') {
            this._loaded = false;
        }
    }

    get value() {
        const name = this._text.trim();
        if (!name && !this._key) return null;
        return { key: this._key, name };
    }

    set value(v) {
        if (!v) { this._clear(); return; }
        this._key  = v.key  || null;
        this._text = v.name || '';
        if (this._input) {
            this._input.value = this._text;
            this._updateBadge();
        }
    }

    get key() { return this._key || ''; }

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
    }

    _clear() {
        this._key  = null;
        this._text = '';
        if (this._input) this._input.value = '';
        this._updateBadge();
        this._emitChange();
    }

    _select(key, name) {
        this._key  = key;
        this._text = name;
        this._input.value = name;
        this._updateBadge();
        this._close();
        this._emitChange();
    }

    _updateBadge() {
        if (!this._badge || !this._xBtn) return;
        const linked = !!this._key;
        this._badge.hidden = !linked;
        this._xBtn.hidden  = !this._text;
    }

    _emitChange() {
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true, composed: true,
            detail: this.value,
        }));
    }

    _onKey(e) {
        const isOpen = this.hasAttribute('open');
        if (e.key === 'Escape') {
            if (isOpen) { e.preventDefault(); this._close(); this._input.blur(); }
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!isOpen) { this._open(); return; }
            const opts = this._visibleOpts();
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
            const opts = this._visibleOpts();
            const active = this._activeIdx >= 0 ? opts[this._activeIdx] : (opts.length === 1 ? opts[0] : null);
            if (!active) return;
            if (active.create) {
                this._createPlace(this._text.trim());
            } else {
                this._select(active.key, active.name);
            }
            return;
        }
        if (e.key === 'Tab') { this._close(); }
    }

    _visibleOpts() {
        const q = this._text.trim().toLowerCase();
        const filtered = q
            ? this._places.filter(p => p.name.toLowerCase().includes(q))
            : this._places;
        const opts = filtered.map(p => ({ key: p.key, name: p.name }));
        // Show create option when text is non-empty and no exact match
        if (q && !this._places.some(p => p.name.toLowerCase() === q)) {
            opts.push({ create: true, name: this._text.trim() });
        }
        return opts;
    }

    _renderMenu() {
        if (!this._loaded) {
            this._menu.innerHTML = `<div class="opt loading">Laster…</div>`;
            return;
        }
        const opts = this._visibleOpts();
        if (!opts.length) {
            this._menu.innerHTML = `<div class="opt empty">Ingen steder</div>`;
            this._activeIdx = -1;
            return;
        }
        if (this._activeIdx >= opts.length) this._activeIdx = 0;
        this._menu.innerHTML = opts.map((o, i) => {
            const cls = (i === this._activeIdx ? 'opt active' : 'opt') + (o.create ? ' create' : '');
            if (o.create) {
                return `<div class="${cls}">➕ Opprett «${escapeHtml(o.name)}»</div>`;
            }
            return `<div class="${cls}" data-key="${escapeHtml(o.key)}" data-name="${escapeHtml(o.name)}">${escapeHtml(o.name)}</div>`;
        }).join('');
    }

    _highlight() {
        const items = this._menu.querySelectorAll('.opt');
        items.forEach((el, i) => el.classList.toggle('active', i === this._activeIdx));
        const active = this._menu.querySelector('.opt.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    async _createPlace(name) {
        if (!name || this._creating) return;
        this._creating = true;
        this._menu.innerHTML = `<div class="opt loading">Oppretter…</div>`;
        try {
            const svc = this.serviceFor('places');
            let place;
            if (svc && typeof svc.create === 'function') {
                place = await svc.create({ name });
            } else {
                const r = await fetch('/api/places', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                });
                const data = await r.json();
                if (!data.ok) throw new Error(data.error || 'Kunne ikke opprette sted');
                place = data.place;
            }
            this._places.push({ key: place.key, name: place.name, id: place.id });
            this._select(place.key, place.name);
        } catch (err) {
            this._menu.innerHTML = `<div class="opt empty">${escapeHtml(String(err.message || 'Feil'))}</div>`;
        } finally {
            this._creating = false;
        }
    }

    async _load() {
        if (this._loaded) return;
        this._loaded = true;
        try {
            const svc = this.serviceFor('places');
            let arr;
            if (svc && typeof svc.list === 'function') {
                arr = await svc.list();
            } else {
                const r = await fetch('/api/places');
                arr = await r.json();
            }
            if (!Array.isArray(arr)) return;
            this._places = arr
                .filter(p => p && p.key && !p.deleted)
                .map(p => ({ key: p.key, name: p.name || p.key, id: p.id }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (_) { /* leave empty */ }
    }

    render() {
        const ph = this.getAttribute('placeholder') || 'Velg eller opprett sted…';
        return html`
            <div class="wrap">
                <input class="trig" type="text" autocomplete="off" placeholder="${escapeHtml(ph)}" />
                <span class="link-badge" hidden>🔗</span>
                <button type="button" class="x-btn" hidden title="Fjern sted">✕</button>
            </div>
            <div class="menu" role="listbox"></div>
        `;
    }
}

if (!customElements.get('pick-place')) customElements.define('pick-place', PickPlace);
