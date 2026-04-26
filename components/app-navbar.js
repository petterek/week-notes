/**
 * <app-navbar> — top navigation bar shell with named slots for dynamic content:
 *   - brand     : the "Ukenotater" link
 *   - switcher  : context switcher
 *   - links     : list of nav links
 *   - meta      : optional override for the <nav-meta> widget
 *
 * Attributes:
 *   - fixed     : if present, navbar is position:fixed (regular pages with
 *                 body padding-top). Omit on flex-layout pages such as the
 *                 editor where the navbar is just a flex item.
 */
(function () {
    if (window.customElements && customElements.get('app-navbar')) return;

    const TEMPLATE = `
        <style>
            :host { display: block; flex-shrink: 0; background: var(--bg, #fff); border-bottom: 1px solid var(--border-soft, #ddd); }
            :host([fixed]) { position: fixed; top: 0; left: 0; right: 0; z-index: 900; }
            .nav-inner { padding: 0 24px; display: flex; align-items: center; gap: 14px; height: 46px; }
            slot[name="meta"] { margin-left: auto; }
        </style>
        <div class="nav-inner">
            <slot name="brand"></slot>
            <slot name="switcher"></slot>
            <slot name="links"></slot>
            <slot name="meta"><nav-meta></nav-meta></slot>
        </div>
    `;

    class AppNavbar extends HTMLElement {
        connectedCallback() {
            if (this.shadowRoot) return;
            this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE;
        }
    }

    customElements.define('app-navbar', AppNavbar);
})();
