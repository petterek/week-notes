/**
 * <help-modal> — fetches /help.md on first open and renders it as markdown
 * (using window.marked when available, else as a <pre>). Triggered by clicking
 * any element with id="helpBtn", or by sending the custom event 'help:open' to
 * the document.
 *
 * Closes on backdrop click and Escape.
 */
(function () {
    if (window.customElements && customElements.get('help-modal')) return;

    const TEMPLATE = `
        <style>
            :host { position: fixed; inset: 0; display: none; z-index: 2000; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); }
            :host([open]) { display: flex; }
            .card { background: var(--bg, #fff); color: var(--text-strong, #222); border: 1px solid var(--border, #ccc); border-radius: 10px; padding: 18px 20px; width: min(780px, 92vw); max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
            .head h3 { margin: 0; font-family: Georgia, "Times New Roman", serif; color: var(--accent, #2a4365); }
            .close { background: none; border: none; font-size: 1.3em; cursor: pointer; color: var(--text-muted, #888); }
            .body { overflow-y: auto; flex: 1; padding: 4px 4px 4px 0; line-height: 1.6; }
            .body :first-child { margin-top: 0; }
            .body a { color: var(--accent, #2a4365); }
        </style>
        <div class="card">
            <div class="head"><h3>❓ Hjelp</h3><button class="close" title="Lukk (Esc)">✕</button></div>
            <div class="body">Laster…</div>
        </div>
    `;

    function escapeHtml(s) {
        return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    }

    class HelpModal extends HTMLElement {
        connectedCallback() {
            if (this.shadowRoot) return;
            const root = this.attachShadow({ mode: 'open' });
            root.innerHTML = TEMPLATE;
            this._body = root.querySelector('.body');

            root.querySelector('.close').addEventListener('click', () => this.close());
            this.addEventListener('click', (e) => { if (e.target === this) this.close(); });

            this._onKey = (e) => {
                if (e.key === 'Escape' && this.hasAttribute('open')) this.close();
            };
            document.addEventListener('keydown', this._onKey);

            this._onCustom = () => this.open();
            document.addEventListener('help:open', this._onCustom);

            const btn = document.getElementById('helpBtn');
            if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); this.open(); });
        }
        disconnectedCallback() {
            document.removeEventListener('keydown', this._onKey);
            document.removeEventListener('help:open', this._onCustom);
        }
        open() {
            this.setAttribute('open', '');
            if (this._loaded) return;
            fetch('/help.md')
                .then(r => r.text())
                .then(md => {
                    this._body.innerHTML = window.marked
                        ? window.marked.parse(md)
                        : `<pre>${escapeHtml(md)}</pre>`;
                    this._loaded = true;
                })
                .catch(() => { this._body.textContent = 'Kunne ikke laste hjelp.'; });
        }
        close() { this.removeAttribute('open'); }
    }

    customElements.define('help-modal', HelpModal);
})();
