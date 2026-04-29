/**
 * <nav-button> — the "Ukenotater" link in the navbar.
 *
 * Attributes:
 *   - href : link target (default "/")
 *   - text : brand text (default "Ukenotater")
 *   - icon : optional emoji/glyph rendered before the text
 *   - size : 1 (smallest) … 5 (largest); default 3
 * Events (cancelable, bubbling):
 *   - brand-clicked : detail { href } — host should navigate.
 */
import { WNElement, html } from './_shared.js';

const STYLES = `
    :host { display: inline-block; }
    a {
        color: var(--accent);
        font-family: var(--font-heading);
        font-weight: 700;
        font-size: var(--nb-size, 1.1em);
        text-decoration: none;
        letter-spacing: -0.01em;
        cursor: pointer;
    }
    a:hover { color: var(--accent-strong); }
    .icon { margin-right: 0.35em; }
    :host([size="1"]) { --nb-size: 0.75em; }
    :host([size="2"]) { --nb-size: 0.9em; }
    :host([size="3"]) { --nb-size: 1.1em; }
    :host([size="4"]) { --nb-size: 1.4em; }
    :host([size="5"]) { --nb-size: 1.8em; }
`;

class NavButton extends WNElement {
    static get observedAttributes() { return ['href', 'text', 'size', 'icon']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        const href = this.getAttribute('href') || '/';
        this.shadowRoot.addEventListener('click', (e) => {
            const a = e.target.closest('a');
            if (!a) return;
            e.preventDefault();
            this.dispatchEvent(new CustomEvent('brand-clicked', {
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
