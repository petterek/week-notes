/**
 * <help-modal> — fetches /help.md on first open and renders it as markdown
 * (using window.marked when available, else as a <pre>). Exposes an open()
 * method; clicking any element with id="helpBtn" triggers it.
 *
 * Closes on backdrop click and Escape.
 */
import { WNElement, html } from './_shared.js';

const STYLES = `
    :host { position: fixed; inset: 0; display: none; z-index: 2000; align-items: center; justify-content: center; background: var(--overlay); }
    :host([open]) { display: flex; }
    .card { background: var(--bg); color: var(--text-strong); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; width: min(780px, 92vw); max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px var(--shadow); }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .head h3 { margin: 0; font-family: var(--font-heading); color: var(--accent); }
    .close { background: none; border: none; font-size: 1.3em; cursor: pointer; color: var(--text-muted); }
    .body { overflow-y: auto; flex: 1; padding: 4px 4px 4px 0; line-height: 1.6; border: none; }
    markdown-preview.body { padding: 4px; background: transparent; }
`;

class HelpModal extends WNElement {
    static get observedAttributes() { return ['open']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;

        this.shadowRoot.querySelector('.close').addEventListener('click', () => this.close());
        this.addEventListener('click', (e) => { if (e.target === this) this.close(); });

        this._onKey = (e) => {
            if (e.key === 'Escape' && this.hasAttribute('open')) this.close();
        };
        document.addEventListener('keydown', this._onKey);

        const btn = document.getElementById('helpBtn');
        if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); this.open(); });
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onKey);
    }

    css() { return STYLES; }

    render() {
        return html`
            <div class="card">
                <div class="head"><h3>❓ Hjelp</h3><button class="close" title="Lukk (Esc)">✕</button></div>
                <markdown-preview class="body" placeholder="Laster…"></markdown-preview>
            </div>
        `;
    }

    open() {
        this.setAttribute('open', '');
        if (this._loaded) return;
        const body = this.shadowRoot.querySelector('.body');
        if (!body) return;
        fetch('/help.md')
            .then(r => r.text())
            .then(md => {
                body.value = md;
                this._loaded = true;
            })
            .catch(() => { body.value = '_Kunne ikke laste hjelp._'; });
    }

    close() { this.removeAttribute('open'); }
}

if (!customElements.get('help-modal')) customElements.define('help-modal', HelpModal);
