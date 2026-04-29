/**
 * <nav-button> — navigation link element used in the top navbar.
 *
 * Attributes:
 *   - href : link target (default "/")
 *   - text : button text (default "Ukenotater")
 *   - icon : optional emoji/glyph rendered before the text
 *   - size : 1 (smallest) … 5 (largest); default 3
 * Events (cancelable, bubbling):
 *   - nav-clicked : detail { href } — host should navigate.
 */
import { WNElement, html } from './_shared.js';

const STYLES = `
    :host { display: inline-block; }
    a {
        color: var(--accent);
        font-family: var(--font-heading);
        font-weight: 700;
        font-size: var(--nb-size, 1.1em);
        letter-spacing: -0.01em;
        text-decoration: none;
        cursor: pointer;
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        white-space: nowrap;
    }
    a:hover { color: var(--accent-strong); background: var(--surface-alt); }
    :host([selected]) a {
        background: var(--accent-soft);
        color: var(--accent-strong);
    }
    :host([selected]) a:hover { background: var(--accent-soft); }
    .icon { margin-right: 0.35em; }
    :host([size="1"]) { --nb-size: 0.75em; }
    :host([size="2"]) { --nb-size: 0.9em; }
    :host([size="3"]) { --nb-size: 1.1em; }
    :host([size="4"]) { --nb-size: 1.4em; }
    :host([size="5"]) { --nb-size: 1.8em; }
`;

class NavButton extends WNElement {
    static get observedAttributes() { return ['href', 'text', 'size', 'icon', 'selected']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (e) => {
            const a = e.target.closest('a');
            if (!a) return;
            e.preventDefault();
            const href = this.getAttribute('href') || '/';
            this.dispatchEvent(new CustomEvent('nav-clicked', {
                bubbles: true, composed: true, cancelable: true,
                detail: { href },
            }));
        });
    }

    css() { return STYLES; }

    render() {
        const href = this.getAttribute('href') || '/';
        const text = this.getAttribute('text') || 'Ukenotater';
        const icon = this.getAttribute('icon') || '';
        const iconHtml = icon ? html`<span class="icon" aria-hidden="true">${icon}</span>` : '';
        return html`<a part="link" href="${href}">${iconHtml}${text}</a>`;
    }
}

if (!customElements.get('nav-button')) customElements.define('nav-button', NavButton);
