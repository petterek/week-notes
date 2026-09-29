import { WNElement, html } from './_shared.js';
import { MARKDOWN_PREVIEW_CSS, renderMarkdownPreview } from '/services/_shared/wn-markdown-preview.js';

class MarkdownPreview extends WNElement {
    static get domain() { return 'notes'; }
    static get observedAttributes() { return ['value', 'placeholder', 'offset']; }

    css() { return MARKDOWN_PREVIEW_CSS; }

    connectedCallback() {
        super.connectedCallback();
        if (!this._root) {
            this._root = document.createElement('div');
            this._root.className = 'root';
            this.shadowRoot.appendChild(this._root);
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
        this._renderContent();
        this._applyOffset();
    }

    attributeChangedCallback(name, oldV, newV) {
        super.attributeChangedCallback(name, oldV, newV);
        if (oldV === newV) return;
        if (name === 'value') {
            this._value = newV == null ? '' : newV;
            this._renderContent();
            this._applyOffset();
        } else if (name === 'placeholder') {
            this._renderContent();
        } else if (name === 'offset') {
            this._applyOffset();
        }
    }

    render() {
        // Base render handled by WNElement; content is managed imperatively in _root
        return html`<slot></slot>`;
    }

    get value() { return this._value == null ? '' : this._value; }
    set value(v) {
        this._value = v == null ? '' : String(v);
        this._renderContent();
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

    _renderContent() {
        if (!this._root) return;
        renderMarkdownPreview(this._root, this.value, {
            placeholder: this.getAttribute('placeholder') || '',
            marked: window.marked,
        });
    }
}

if (!customElements.get('markdown-preview')) customElements.define('markdown-preview', MarkdownPreview);
