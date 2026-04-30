/**
 * <icon-picker> — generic emoji / icon picker.
 *
 * Shows a grid of icons. One can be selected. Pure presentation
 * component — no server, no service. Use it in a form by reading
 * its `value` property or listening for the `icon-picker:change`
 * event, or by binding a hidden input via the `name` attribute.
 *
 * Attributes:
 *   value     — currently selected icon (string).
 *   icons     — JSON array of icons. Items may be either a plain
 *               string ("📁") or an object { icon: "📁", name: "Mappe" }.
 *               If `groups` is also set, `icons` is ignored.
 *   groups    — JSON array of groups for tabbed/sectioned mode:
 *               [{ name: "Faces", icons: ["😀", ...] }, ...].
 *               Renders the group name as a small heading above its
 *               grid; all groups are visible at once (vertical scroll).
 *   columns   — integer, number of columns in the grid (default 8).
 *   size      — pixel size of each cell (default 36).
 *   name      — form field name. When set, a hidden <input name="..">
 *               is rendered inside the host so the picker participates
 *               in form submission. Reflects `value`.
 *   readonly  — when present, clicks are ignored.
 *
 * Property:
 *   element.value (get/set, reflects to attribute and emits event on change).
 *
 * Events:
 *   icon-picker:change — { value } when the user clicks an icon.
 */
import { WNElement, escapeHtml } from './_shared.js';

const DEFAULT_ICONS = [
    '📁', '💼', '🏠', '📚', '🎨', '🎵', '🎮', '🧪',
    '🔬', '💡', '🌱', '🏃', '🐾', '🍳', '☕', '📷',
    '✍️', '🛒', '💰', '🏥', '📅', '⭐', '🚀', '✈️',
    '🏌️', '⛳', '🎯', '🛠️', '📋', '🔍', '🎬', '🎉',
];

function parseIcons(raw) {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : null;
    } catch { return null; }
}

function normalizeItem(it) {
    if (typeof it === 'string') return { icon: it, name: '' };
    if (it && typeof it === 'object' && it.icon) return { icon: String(it.icon), name: String(it.name || '') };
    return null;
}

const STYLES = `
    :host { display: inline-block; box-sizing: border-box; }
    :host([readonly]) .cell { cursor: default; }
    .group-name {
        font-family: var(--font-heading, inherit); font-weight: 400;
        color: var(--text-muted); font-size: 0.85em;
        margin: 8px 0 4px; padding: 0 2px;
    }
    .group-name:first-child { margin-top: 0; }
    .grid {
        display: grid; gap: 4px;
    }
    .cell {
        display: flex; align-items: center; justify-content: center;
        width: var(--cell-size, 36px); height: var(--cell-size, 36px);
        font-size: calc(var(--cell-size, 36px) * 0.55);
        border: 1px solid transparent; border-radius: 6px;
        background: transparent; cursor: pointer; padding: 0;
        line-height: 1; user-select: none;
        color: var(--text-strong);
    }
    .cell:hover { background: var(--surface-alt, rgba(0,0,0,0.05)); }
    .cell:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .cell.selected {
        background: var(--accent);
        color: var(--text-on-accent, #fff);
        border-color: var(--accent);
    }
`;

class IconPicker extends WNElement {
    static get domain() { return 'shared'; }
    static get observedAttributes() { return ['value', 'icons', 'groups', 'columns', 'size', 'name']; }

    css() { return STYLES; }

    get value() {
        return this.hasAttribute('value') ? this.getAttribute('value') : (this._value || '');
    }

    set value(v) {
        const next = v == null ? '' : String(v);
        if (next === this.value) return;
        if (next) this.setAttribute('value', next);
        else this.removeAttribute('value');
        this._value = next;
    }

    render() {
        // Unused: requestRender() is overridden to build HTML directly so
        // we can mix attributes and grouped grids without escaping pain.
        return '';
    }

    // Direct-DOM render: bypasses html`` so we can splat raw HTML safely.
    requestRender() {
        const cols = Math.max(1, parseInt(this.getAttribute('columns') || '8', 10) || 8);
        const size = Math.max(16, parseInt(this.getAttribute('size') || '36', 10) || 36);
        const value = this.value;
        const name = this.getAttribute('name') || '';

        const groupsRaw = parseIcons(this.getAttribute('groups'));
        let body;
        if (Array.isArray(groupsRaw) && groupsRaw.length) {
            body = groupsRaw.map(g => {
                const gName = g && g.name ? String(g.name) : '';
                const items = (Array.isArray(g && g.icons) ? g.icons : []).map(normalizeItem).filter(Boolean);
                return (gName ? `<div class="group-name">${escapeHtml(gName)}</div>` : '')
                    + this._gridHtml(items, value, cols);
            }).join('');
        } else {
            const itemsRaw = parseIcons(this.getAttribute('icons'));
            const items = (Array.isArray(itemsRaw) && itemsRaw.length ? itemsRaw : DEFAULT_ICONS)
                .map(normalizeItem).filter(Boolean);
            body = this._gridHtml(items, value, cols);
        }

        this.style.setProperty('--cell-size', size + 'px');

        const hidden = name
            ? `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`
            : '';

        this._applyCss();
        this.shadowRoot.innerHTML = hidden + body;
        // Listener is on shadowRoot (not replaced by innerHTML), so wire once.
        this._wire();
    }

    _gridHtml(items, value, cols) {
        if (!items.length) return '';
        const cells = items.map(it => {
            const sel = it.icon === value ? ' selected' : '';
            const title = it.name ? ` title="${escapeHtml(it.name)}"` : '';
            return `<button type="button" class="cell${sel}" data-icon="${escapeHtml(it.icon)}"${title}>${escapeHtml(it.icon)}</button>`;
        }).join('');
        return `<div class="grid" style="grid-template-columns: repeat(${cols}, var(--cell-size, 36px));">${cells}</div>`;
    }

    _wire() {
        if (!this.shadowRoot) return;
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (ev) => {
            if (this.hasAttribute('readonly')) return;
            const cell = ev.target.closest('.cell');
            if (!cell) return;
            const icon = cell.getAttribute('data-icon');
            if (icon == null) return;
            this.value = icon;
            this.dispatchEvent(new CustomEvent('icon-picker:change', {
                bubbles: true, composed: true, detail: { value: icon },
            }));
        });
    }
}

if (!customElements.get('icon-picker')) customElements.define('icon-picker', IconPicker);
