/**
 * <markdown-preview> — renders markdown via window.marked (Shadow DOM).
 *
 * Usage:
 *   <markdown-preview value="# Hello"></markdown-preview>
 *   el.value = '...'   // or el.setAttribute('value', '...')
 *
 * Attributes:
 *   value       — markdown source (observed)
 *   placeholder — text shown when value is empty
 *   offset      — initial / programmatic scrollTop in pixels (observed)
 *
 * Public API:
 *   element.value (get/set)
 *   element.offset (get/set; pixels)
 *   element.render()
 *
 * Events:
 *   markdown-preview:scroll — fired when the user scrolls. Detail:
 *     { offset, scrollHeight, clientHeight }. Suppressed for
 *     programmatic scrolls triggered via the offset attribute/property.
 *
 * Styling: uses CSS custom properties from the surrounding theme
 * (--accent, --border-soft, --surface-alt, --text-strong, etc.).
 * The host element accepts width/height/min-height/border etc. via
 * normal CSS on the host selector.
 */
(function () {
    if (customElements.get('markdown-preview')) return;

    const { html, unsafeHTML, escapeHtml } = window.WN;

    const TEMPLATE_CSS = `
        :host { display: block; padding: 14px 18px; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--surface); overflow: auto; box-sizing: border-box; color: var(--text-strong); line-height: 1.55; }
        :host([hidden]) { display: none; }
        .root > :first-child { margin-top: 0; }
        .root > :last-child { margin-bottom: 0; }
        h1, h2, h3, h4 { color: var(--accent); font-family: var(--font-heading); font-weight: 400; }
        a { color: var(--accent); }
        pre { background: var(--code-bg); color: var(--code-fg); padding: 12px; border-radius: 6px; overflow: auto; }
        code { background: var(--surface-alt); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
        pre code { background: none; padding: 0; }
        blockquote { border-left: 4px solid var(--accent); padding: 4px 12px; color: var(--text-muted); background: var(--surface-alt); border-radius: 0 6px 6px 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid var(--border-soft); padding: 6px 10px; text-align: left; }
        ul, ol { padding-left: 1.4em; }
        img { max-width: 100%; }
        .empty { color: var(--text-subtle); font-style: italic; margin: 0; }
    `;

    class MarkdownPreview extends HTMLElement {
        static get observedAttributes() { return ['value', 'placeholder', 'offset']; }


        get service() {
            const name = this.getAttribute('service');
            return name ? (window[name] || null) : null;
        }

        connectedCallback() {
            if (!this.service) {
                const n = this.getAttribute('service');
                const why = !n ? 'missing "service" attribute' : 'service "' + n + '" not registered on window';
                console.error('<markdown-preview>:', why);
                const markup = html`<p style="color: var(--danger);font-style:italic;margin:0">no service connected</p>`;
                if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
                this.shadowRoot.innerHTML = markup;
                return;
            }
            if (!this.shadowRoot) {
                const root = this.attachShadow({ mode: 'open' });
                const style = document.createElement('style');
                style.textContent = TEMPLATE_CSS;
                root.appendChild(style);
                this._root = document.createElement('div');
                this._root.className = 'root';
                root.appendChild(this._root);
                this._onScroll = () => {
                    if (this._suppressScroll) return;
                    this.dispatchEvent(new CustomEvent('markdown-preview:scroll', {
                        bubbles: true, composed: true,
                        detail: {
                            offset: this.scrollTop,
                            scrollHeight: this.scrollHeight,
                            clientHeight: this.clientHeight,
                        },
                    }));
                };
                this.addEventListener('scroll', this._onScroll, { passive: true });
            }
            this.setAttribute('aria-live', this.getAttribute('aria-live') || 'polite');
            if (this._value == null) {
                const attr = this.getAttribute('value');
                if (attr != null) {
                    this._value = attr;
                } else {
                    const txt = this.textContent;
                    this._value = (txt && txt.trim()) ? txt : '';
                }
            }
            this.render();
            this._applyOffset();
        }

        attributeChangedCallback(name, oldV, newV) {
            if (oldV === newV) return;
            if (name === 'value') {
                this._value = newV == null ? '' : newV;
                this.render();
                this._applyOffset();
            } else if (name === 'placeholder') {
                this.render();
            } else if (name === 'offset') {
                this._applyOffset();
            }
        }

        get value() { return this._value == null ? '' : this._value; }
        set value(v) {
            this._value = v == null ? '' : String(v);
            this.render();
            this._applyOffset();
        }

        get offset() { return this.scrollTop; }
        set offset(v) {
            const n = Number(v);
            if (!isFinite(n)) return;
            this._scrollTo(n);
        }

        _applyOffset() {
            if (!this.isConnected) return;
            const raw = this.getAttribute('offset');
            if (raw == null || raw === '') return;
            const n = Number(raw);
            if (!isFinite(n)) return;
            this._scrollTo(n);
        }

        _scrollTo(n) {
            this._suppressScroll = true;
            this.scrollTop = n;
            // Scroll events fire asynchronously; clear the guard after
            // the next frame so genuine user scrolls aren't swallowed.
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => requestAnimationFrame(() => { this._suppressScroll = false; }));
            } else {
                setTimeout(() => { this._suppressScroll = false; }, 30);
            }
        }

        render() {
            if (!this._root) return;
            const md = this.value;
            if (!md || !md.trim()) {
                const placeholder = this.getAttribute('placeholder') || '';
                this._root.innerHTML = placeholder
                    ? html`<p class="empty">${placeholder}</p>`
                    : '';
                return;
            }
            try {
                const markup = (window.marked && window.marked.parse)
                    ? window.marked.parse(md)
                    : escapeHtml(md);
                this._root.innerHTML = markup;
            } catch (e) {
                this._root.textContent = md;
            }
        }
    }

    customElements.define('markdown-preview', MarkdownPreview);
})();

