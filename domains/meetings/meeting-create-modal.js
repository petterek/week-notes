/**
 * <meeting-create-modal>
 *
 * Renders a small trigger button (a `+` by default) that, when clicked,
 * opens a <modal-container> hosting a <meeting-create> form. The modal
 * closes itself on cancel / successful create / Esc / backdrop click.
 *
 * Attributes (all forwarded to the inner <meeting-create> when set):
 *   meetings_service  — service id, e.g. "week-note-services.MeetingsService"
 *   settings_service  — service id, e.g. "week-note-services.SettingsService"
 *   context           — active context id
 *   date              — YYYY-MM-DD preset
 *   start             — HH:MM preset
 *   end               — HH:MM preset
 *   type              — meeting-type key preset
 *
 * Trigger appearance:
 *   label             — text shown on the trigger button (default "+")
 *   title             — accessible title/tooltip (default "Nytt møte")
 *
 * Public API:
 *   .open()           — show the modal
 *   .close()          — hide the modal
 *
 * Re-emitted events (composed/bubble):
 *   meeting-create:created  detail: { meeting }   — after successful POST
 *   meeting-create:cancel                          — when the form is cancelled
 *   meeting-create:error    detail: { error }     — on submit failure
 */
import { WNElement, html } from './_shared.js';
import './modal-container.js';
import './meeting-create.js';

const FORM_ATTRS = ['meetings_service', 'settings_service', 'context', 'date', 'start', 'end', 'type'];

const STYLES = `
    :host { display: inline-block; font: inherit; }
    button.trigger {
        padding: 2px 10px; border: 1px solid var(--accent); background: var(--accent);
        color: var(--text-on-accent); border-radius: 5px; cursor: pointer;
        font: inherit; font-size: 0.85em;
    }
    button.trigger:hover { background: var(--accent-strong); }
`;

class MeetingCreateModal extends WNElement {
    static get domain() { return 'meetings'; }
    static get observedAttributes() {
        return [...FORM_ATTRS, 'label', 'title'];
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (e) => {
            if (e.target.closest('button.trigger')) this.open();
        });
    }

    disconnectedCallback() {
        if (this._modal && this._modal.parentNode) {
            this._modal.parentNode.removeChild(this._modal);
        }
        this._modal = null;
        this._form = null;
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (FORM_ATTRS.includes(name) && this._form) {
            if (newVal == null) this._form.removeAttribute(name);
            else this._form.setAttribute(name, newVal);
        }
    }

    render() {
        const label = this.getAttribute('label') || '+';
        const title = this.getAttribute('title') || 'Nytt møte';
        return html`<button type="button" class="trigger" title="${title}">${label}</button>`;
    }

    /** Forward the current attribute values to the inner form. */
    _syncForm() {
        if (!this._form) return;
        FORM_ATTRS.forEach(a => {
            const v = this.getAttribute(a);
            if (v == null) this._form.removeAttribute(a);
            else this._form.setAttribute(a, v);
        });
        if (Array.isArray(this._typesOverride)) this._form.types = this._typesOverride;
    }

    /** Allow callers (e.g. <today-calendar>) to inject a shared types list. */
    set types(v) {
        this._typesOverride = Array.isArray(v) ? v.slice() : null;
        if (this._form) this._form.types = v;
    }
    get types() { return this._typesOverride ? this._typesOverride.slice() : []; }

    _ensureModal() {
        if (this._modal) return this._modal;
        const modal = document.createElement('modal-container');
        modal.setAttribute('size', 'md');
        const titleEl = document.createElement('span');
        titleEl.setAttribute('slot', 'title');
        titleEl.textContent = 'Nytt møte';
        modal.appendChild(titleEl);
        const form = document.createElement('meeting-create');
        modal.appendChild(form);
        modal.setButtons([]); // form has its own action buttons

        // Forward events from the inner form. Events bubble out of the
        // shadow tree because <meeting-create> dispatches with composed:true.
        form.addEventListener('meeting-create:created', (ev) => {
            this.dispatchEvent(new CustomEvent('meeting-create:created', {
                detail: ev.detail, bubbles: true, composed: true,
            }));
            this.close();
        });
        form.addEventListener('meeting-create:cancel', () => {
            this.dispatchEvent(new CustomEvent('meeting-create:cancel', {
                bubbles: true, composed: true,
            }));
            this.close();
        });
        form.addEventListener('meeting-create:error', (ev) => {
            this.dispatchEvent(new CustomEvent('meeting-create:error', {
                detail: ev.detail, bubbles: true, composed: true,
            }));
        });

        document.body.appendChild(modal);
        this._modal = modal;
        this._form = form;
        return modal;
    }

    open() {
        const modal = this._ensureModal();
        this._syncForm();
        modal.open();
        // Focus the title input once the form has rendered.
        setTimeout(() => {
            const root = this._form && this._form.shadowRoot;
            const t = root && root.querySelector('input[name=title]');
            if (t) t.focus();
        }, 30);
    }

    close() {
        if (this._modal) this._modal.close('programmatic');
    }
}

if (!customElements.get('meeting-create-modal')) {
    customElements.define('meeting-create-modal', MeetingCreateModal);
}
