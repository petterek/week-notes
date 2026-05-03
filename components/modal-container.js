/**
 * <modal-container> — generic modal wrapper used for every modal in the app.
 *
 * Usage (in a host component's render output):
 *
 *   <modal-container size="md" id="my-modal">
 *     <span slot="title">Tittel</span>
 *     <div>... main body ...</div>            <!-- default slot -->
 *     <div slot="footer">
 *       <button data-act="cancel">Avbryt</button>
 *       <button data-act="save" class="primary">Lagre</button>
 *     </div>
 *   </modal-container>
 *
 * Public API:
 *   .open()                                — show the modal, fire 'modal-open'
 *   .close(reason='programmatic')         — hide, fire 'modal-close' with detail.reason
 *   .toggle(force?)                        — open/close conditionally
 *   property `open` reflects the boolean attribute
 *
 * Attributes:
 *   open                — boolean. Reflects state.
 *   size                — 'sm' | 'md' | 'lg' | 'xl' | 'full'. Default 'md'.
 *   no-close            — hide the ✕ button.
 *   no-backdrop-close   — disable click-on-backdrop closing.
 *   no-escape-close     — disable Escape key closing.
 *
 * Events (all composed/bubbles):
 *   modal-open
 *   modal-close   detail = { reason: 'escape'|'backdrop'|'button'|'programmatic' }
 *
 * The header is hidden if neither a title nor a close button is shown.
 * The footer is hidden if no slotted footer content exists.
 */

import { WNElement, html } from './_shared.js';

const STYLES = `
:host {
    position: fixed; inset: 0; display: none; z-index: var(--modal-z, 2000);
    align-items: center; justify-content: center;
    background: var(--overlay, rgba(0,0,0,0.45));
    box-sizing: border-box; padding: 16px;
}
:host([open]) { display: flex; }
.card {
    background: var(--bg, #fff); color: var(--text-strong, #222);
    border: 1px solid var(--border, #ddd); border-radius: 10px;
    box-shadow: 0 20px 60px var(--shadow, rgba(0,0,0,0.25));
    display: flex; flex-direction: column;
    width: var(--modal-card-width, min(620px, 92vw));
    max-height: var(--modal-card-max-height, 85vh);
    box-sizing: border-box;
}
:host([size="sm"]) .card { width: var(--modal-card-width, min(420px, 92vw)); }
:host([size="md"]) .card { width: var(--modal-card-width, min(620px, 92vw)); }
:host([size="lg"]) .card { width: var(--modal-card-width, min(820px, 92vw)); }
:host([size="xl"]) .card { width: var(--modal-card-width, min(1100px, 96vw)); }
:host([size="full"]) .card { width: 96vw; height: 92vh; max-height: 92vh; }

.head {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px; border-bottom: 1px solid var(--border-faint, #eee);
}
.head .title { flex: 1; font-family: var(--font-heading, Georgia, serif); color: var(--accent); font-size: 1.1em; font-weight: 400; }
.head .title ::slotted(*) { font-family: inherit; color: inherit; font-size: inherit; font-weight: inherit; margin: 0; }
.close { background: none; border: none; font-size: 1.3em; cursor: pointer; color: var(--text-muted, #888); padding: 0 4px; line-height: 1; }
.close:hover { color: var(--accent, #06c); }

.body { overflow: auto; padding: 16px 18px; flex: 1 1 auto; }

.foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border-faint, #eee); align-items: center; }
.foot[hidden] { display: none; }
.foot .mc-btn { font: inherit; font-size: 0.92em; padding: 6px 14px; border-radius: 4px; border: 1px solid var(--border, #ccc); background: var(--surface, #fff); color: var(--text-strong, #222); cursor: pointer; }
.foot .mc-btn:hover { background: var(--surface-alt, #f3f3f3); }
.foot .mc-btn.primary { background: var(--accent, #06c); color: var(--text-on-accent, #fff); border-color: var(--accent, #06c); }
.foot .mc-btn.primary:hover { filter: brightness(1.08); }
.foot .mc-btn.variant-danger { background: #c0392b; color: #fff; border-color: #c0392b; }
.foot .mc-btn.variant-danger:hover { filter: brightness(1.08); }
.foot .mc-btn.variant-ghost { background: transparent; border-color: transparent; color: var(--text-muted, #888); }
.foot .mc-btn.variant-ghost:hover { background: var(--surface-alt, #f3f3f3); color: var(--text-strong); }
.foot .mc-btn:disabled { opacity: 0.6; cursor: progress; }
.head[hidden] { display: none; }
`;

class ModalContainer extends WNElement {
    static get observedAttributes() { return ['open']; }

    constructor() {
        super();
        this._buttons = null; // null = use default Close button; [] = explicit empty
        this._onKeyBound = (e) => {
            if (e.key !== 'Escape') return;
            if (!this.hasAttribute('open')) return;
            if (this.hasAttribute('no-escape-close')) return;
            this.close('escape');
        };
    }

    /**
     * Set footer buttons programmatically.
     * @param {Array<{label:string, action?:(modal:ModalContainer)=>any|Promise<any>, primary?:boolean, dismiss?:boolean, variant?:string}>} buttons
     *   - label    : button text (required)
     *   - action   : callback receiving the modal. Return false (sync or via Promise) to prevent auto-close.
     *   - primary  : style as primary button
     *   - dismiss  : if true, close the modal after action (default: true)
     *   - variant  : 'danger' | 'ghost' | undefined — extra styling
     */
    setButtons(buttons) {
        this._buttons = Array.isArray(buttons) ? buttons.slice() : null;
        this.requestRender();
        queueMicrotask(() => this._updateFooterVisibility());
    }

    get buttons() { return this._buttons; }
    set buttons(v) { this.setButtons(v); }

    _effectiveButtons() {
        if (Array.isArray(this._buttons)) return this._buttons;
        return [{ label: 'Lukk', action: (m) => m.close('button'), variant: 'ghost', dismiss: false }];
    }

    /**
     * Inject body content. Replaces existing slotted children.
     * @param {string|Node} content  HTML string or DOM node.
     */
    setContent(content) {
        // Remove existing default-slot children (anything not slot="title"/"footer").
        Array.from(this.children).forEach(c => {
            const slot = c.getAttribute && c.getAttribute('slot');
            if (slot === 'title' || slot === 'footer') return;
            c.remove();
        });
        if (content == null) return;
        if (typeof content === 'string') {
            const tpl = document.createElement('template');
            tpl.innerHTML = content;
            this.appendChild(tpl.content);
        } else if (content instanceof Node) {
            this.appendChild(content);
        }
    }

    /**
     * Set the title (text or HTML string).
     */
    setTitle(text) {
        let titleEl = this.querySelector(':scope > [slot="title"]');
        if (!titleEl) {
            titleEl = document.createElement('span');
            titleEl.setAttribute('slot', 'title');
            this.appendChild(titleEl);
        }
        titleEl.innerHTML = (text == null) ? '' : String(text);
    }

    /**
     * High-level configurator. Combines title / content / init / actions.
     *
     * @param {object}   cfg
     * @param {string}   [cfg.title]    — title text/HTML
     * @param {string|Node} [cfg.content] — body HTML or DOM node
     * @param {Function} [cfg.init]     — called after content is mounted as
     *                                     init(modal). Use this to wire events
     *                                     and capture element references.
     * @param {Array}    [cfg.actions]  — passed to setButtons()
     * @param {string}   [cfg.size]     — 'sm'|'md'|'lg'|'xl'|'full'
     */
    setup(cfg) {
        cfg = cfg || {};
        if (cfg.size) this.setAttribute('size', cfg.size);
        if (cfg.title != null) this.setTitle(cfg.title);
        if (cfg.content != null) this.setContent(cfg.content);
        if (cfg.actions !== undefined) this.setButtons(cfg.actions || null);
        if (typeof cfg.init === 'function') {
            try { cfg.init(this, this); }
            catch (e) { console.error('modal-container init failed', e); }
        }
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('keydown', this._onKeyBound);
        if (this._wired) return;
        this._wired = true;
        // Close button (inside shadow DOM) + footer buttons.
        this.shadowRoot.addEventListener('click', (e) => {
            if (e.target.closest('.close')) { this.close('button'); return; }
            const bbtn = e.target.closest('button[data-btn-idx]');
            if (bbtn) {
                const idx = Number(bbtn.dataset.btnIdx);
                const cfg = this._effectiveButtons()[idx];
                if (!cfg) return;
                this._invokeButton(cfg, bbtn);
            }
        });
        // Backdrop click (events retargeted to host when clicking outside card).
        this.addEventListener('click', (e) => {
            if (e.target === this && !this.hasAttribute('no-backdrop-close')) {
                this.close('backdrop');
            }
        });
        this._updateFooterVisibility();
        const slot = this.shadowRoot.querySelector('slot[name="footer"]');
        if (slot) slot.addEventListener('slotchange', () => this._updateFooterVisibility());
        const titleSlot = this.shadowRoot.querySelector('slot[name="title"]');
        if (titleSlot) titleSlot.addEventListener('slotchange', () => this._updateHeaderVisibility());
        this._updateHeaderVisibility();
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onKeyBound);
    }

    _invokeButton(cfg, btnEl) {
        const dismiss = cfg.dismiss !== false; // default true
        const result = (typeof cfg.action === 'function') ? cfg.action(this, btnEl) : undefined;
        const finalize = (val) => {
            if (val === false) return; // explicit cancel
            if (dismiss) this.close('button');
        };
        if (result && typeof result.then === 'function') {
            btnEl.disabled = true;
            result.then(finalize, () => {}).finally(() => { btnEl.disabled = false; });
        } else {
            finalize(result);
        }
    }

    _updateFooterVisibility() {
        const slot = this.shadowRoot.querySelector('slot[name="footer"]');
        const foot = this.shadowRoot.querySelector('.foot');
        if (!foot) return;
        const slotted = slot ? slot.assignedNodes({ flatten: true }).some(n =>
            n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim().length)) : false;
        const hasButtons = (this._effectiveButtons().length > 0);
        foot.hidden = !(slotted || hasButtons);
    }

    _updateHeaderVisibility() {
        const titleSlot = this.shadowRoot.querySelector('slot[name="title"]');
        const head = this.shadowRoot.querySelector('.head');
        if (!titleSlot || !head) return;
        const hasTitle = titleSlot.assignedNodes({ flatten: true }).some(n =>
            n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim().length));
        const hasClose = !this.hasAttribute('no-close');
        head.hidden = !hasTitle && !hasClose;
        // If title is empty but close is shown, the title slot collapses naturally.
    }

    css() { return STYLES; }

    render() {
        const showClose = !this.hasAttribute('no-close');
        const eff = this._effectiveButtons();
        const buttonsHtml = eff.map((b, i) => {
            const cls = ['mc-btn'];
            if (b.primary) cls.push('primary');
            if (b.variant) cls.push('variant-' + b.variant);
            return html`<button type="button" class="${cls.join(' ')}" data-btn-idx="${String(i)}">${b.label || ''}</button>`;
        });
        return html`
            <div class="card" role="dialog" aria-modal="true">
                <div class="head">
                    <div class="title"><slot name="title"></slot></div>
                    ${showClose ? html`<button class="close" type="button" aria-label="Lukk" title="Lukk (Esc)">✕</button>` : html``}
                </div>
                <div class="body"><slot></slot></div>
                <div class="foot"><slot name="footer"></slot>${buttonsHtml}</div>
            </div>
        `;
    }

    get isOpen() { return this.hasAttribute('open'); }

    open() {
        if (this.hasAttribute('open')) return;
        this.setAttribute('open', '');
        this.dispatchEvent(new CustomEvent('modal-open', { bubbles: true, composed: true }));
    }

    close(reason = 'programmatic') {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this.dispatchEvent(new CustomEvent('modal-close', {
            detail: { reason },
            bubbles: true, composed: true,
        }));
    }

    toggle(force) {
        const want = (typeof force === 'boolean') ? force : !this.hasAttribute('open');
        if (want) this.open();
        else this.close();
    }
}

if (!customElements.get('modal-container')) customElements.define('modal-container', ModalContainer);
