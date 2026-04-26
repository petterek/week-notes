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

    var STYLE = '\
        :host { position: fixed; inset: 0; display: none; z-index: 2000; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); }\
        :host([open]) { display: flex; }\
        .card { background: var(--bg, #fff); color: var(--text-strong, #222); border: 1px solid var(--border, #ccc); border-radius: 10px; padding: 18px 20px; width: min(780px, 92vw); max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }\
        .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }\
        .head h3 { margin: 0; font-family: Georgia, "Times New Roman", serif; color: var(--accent, #2a4365); }\
        .close { background: none; border: none; font-size: 1.3em; cursor: pointer; color: var(--text-muted, #888); }\
        .body { overflow-y: auto; flex: 1; padding: 4px 4px 4px 0; line-height: 1.6; }\
        .body :first-child { margin-top: 0; }\
        .body a { color: var(--accent, #2a4365); }\
    ';

    function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

    class HelpModal extends HTMLElement {
        connectedCallback() {
            if (this.shadowRoot) return;
            var root = this.attachShadow({ mode: 'open' });
            root.innerHTML = '<style>' + STYLE + '</style>'
                + '<div class="card">'
                +   '<div class="head"><h3>❓ Hjelp</h3><button class="close" title="Lukk (Esc)">✕</button></div>'
                +   '<div class="body">Laster…</div>'
                + '</div>';
            this._body = root.querySelector('.body');
            var card = root.querySelector('.card');
            var self = this;

            root.querySelector('.close').addEventListener('click', function () { self.close(); });
            this.addEventListener('click', function (e) { if (e.target === self) self.close(); });

            this._onKey = function (e) {
                if (e.key === 'Escape' && self.hasAttribute('open')) self.close();
            };
            document.addEventListener('keydown', this._onKey);

            this._onTrigger = function (e) { e.preventDefault(); self.open(); };
            this._onCustom = function () { self.open(); };
            document.addEventListener('help:open', this._onCustom);

            // Wire any existing #helpBtn (and pick up later additions defensively).
            var btn = document.getElementById('helpBtn');
            if (btn) btn.addEventListener('click', this._onTrigger);
        }
        disconnectedCallback() {
            document.removeEventListener('keydown', this._onKey);
            document.removeEventListener('help:open', this._onCustom);
        }
        open() {
            this.setAttribute('open', '');
            if (this._loaded) return;
            var self = this;
            fetch('/help.md').then(function (r) { return r.text(); }).then(function (md) {
                self._body.innerHTML = window.marked ? window.marked.parse(md) : '<pre>' + escapeHtml(md) + '</pre>';
                self._loaded = true;
            }).catch(function () {
                self._body.textContent = 'Kunne ikke laste hjelp.';
            });
        }
        close() { this.removeAttribute('open'); }
    }

    customElements.define('help-modal', HelpModal);
})();
