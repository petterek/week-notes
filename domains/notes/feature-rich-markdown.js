import { WNElement, html } from '/components/_shared.js';
import { MARKDOWN_PREVIEW_CSS, renderMarkdownPreview } from '/services/_shared/wn-markdown-preview.js';
import { createMentionSource } from '/services/_shared/wn-mention-source.js';
import { transformMarkdownFeatures } from './markdown-features.js';
import '/components/entity-mention.js';
import '/components/inline-action.js';
import '/components/inline-result.js';

class FeatureRichMarkdown extends WNElement {
    static get domain() { return 'notes'; }
    static get observedAttributes() { return ['value', 'placeholder', 'offset']; }

    css() { return MARKDOWN_PREVIEW_CSS; }

    connectedCallback() {
        if (this._value == null) {
            this._value = this.getAttribute('value') ?? this.textContent ?? '';
        }
        super.connectedCallback();
        if (!this._scrollWired) {
            this._onScroll = () => {
                if (this._suppressScroll) return;
                this.dispatchEvent(new CustomEvent('feature-rich-markdown:scroll', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        offset: this.scrollTop,
                        scrollHeight: this.scrollHeight,
                        clientHeight: this.clientHeight,
                    },
                }));
            };
            this.addEventListener('scroll', this._onScroll, { passive: true });
            this._scrollWired = true;
        }
        this.setAttribute('aria-live', this.getAttribute('aria-live') || 'polite');
        this._applyOffset();
        this._loadFeatureData();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'value') this._value = newValue || '';
        if (name === 'value' || name === 'placeholder') this._renderContent();
        if (name === 'offset') this._applyOffset();
    }

    render() { return html`<div class="root"></div>`; }

    afterRender() {
        this._root = this.shadowRoot.querySelector('.root');
        this._renderContent();
    }

    get value() { return this._value == null ? '' : this._value; }
    set value(value) {
        this._value = value == null ? '' : String(value);
        this._renderContent();
        this._applyOffset();
    }

    get offset() { return this.scrollTop; }
    set offset(value) {
        const number = Number(value);
        if (Number.isFinite(number)) this._scrollTo(number);
    }

    async _loadFeatureData() {
        if (this._featureDataLoading || this._featureDataLoaded) return;
        this._featureDataLoading = true;
        const source = createMentionSource({ serviceFor: key => this.serviceFor(key), servicesOnly: true });
        const tasksService = this.serviceFor('tasks');
        try {
            const [mentions, tasks] = await Promise.all([
                source.loadAll(),
                tasksService && typeof tasksService.list === 'function' ? tasksService.list() : Promise.resolve([]),
            ]);
            this._featureData = {
                ...(mentions || {}),
                taskTextById: Object.fromEntries((Array.isArray(tasks) ? tasks : [])
                    .filter(task => task && task.id)
                    .map(task => [task.id, task.text || ''])),
            };
            this._featureDataLoaded = true;
            this._renderContent();
        } catch (error) {
            this.dispatchEvent(new CustomEvent('feature-rich-markdown:error', {
                bubbles: true,
                composed: true,
                detail: { error },
            }));
        } finally {
            this._featureDataLoading = false;
        }
    }

    _renderContent() {
        if (!this._root) return;
        const markdown = transformMarkdownFeatures(this.value, this._featureData || {});
        renderMarkdownPreview(this._root, markdown, {
            placeholder: this.getAttribute('placeholder') || '',
            marked: window.marked,
        });
    }

    _applyOffset() {
        if (!this.isConnected) return;
        const raw = this.getAttribute('offset');
        if (raw != null && raw !== '' && Number.isFinite(Number(raw))) this._scrollTo(Number(raw));
    }

    _scrollTo(value) {
        this._suppressScroll = true;
        this.scrollTop = value;
        requestAnimationFrame(() => requestAnimationFrame(() => { this._suppressScroll = false; }));
    }
}

if (!customElements.get('feature-rich-markdown')) {
    customElements.define('feature-rich-markdown', FeatureRichMarkdown);
}
