/**
 * <person-picker>
 *
 * A reusable picker for selecting a single person by `key`.
 *
 * Loads the people list from `people_service` (resolved via
 * `WNElement.serviceFor('people')`), falling back to `fetch('/api/people')`
 * if no service is configured. The "me" person (`window.mePersonKey`)
 * floats to the top with a "(meg)" suffix.
 *
 * Attributes:
 *   people_service  — service path attribute (e.g. "MockPeopleService")
 *   value           — initial selected key
 *   placeholder     — text for the empty/clear option (default "(ingen)")
 *   default-me      — preselect the @me person if no value is set
 *   disabled        — disable the underlying control
 *
 * Properties:
 *   .value          — current key (string, '' when none)
 *   .selectedPerson — the loaded person object (or null)
 *
 * Events (bubbling, composed):
 *   change          — { value, person }   when the user picks a person
 *   people-loaded   — { count }           after the option list is populated
 *
 * Example:
 *   <person-picker people_service="week-note-services.people_service"
 *                  default-me></person-picker>
 */
import { WNElement, html, escapeHtml } from '../../components/_shared.js';

const CSS = `
    :host { display: inline-block; min-width: 0; width: 100%; }
    select.sel {
        width: 100%; box-sizing: border-box; min-width: 0;
        padding: 8px 12px;
        border: 2px solid var(--border-soft);
        border-radius: 8px; font-size: 0.95em; outline: none;
        background: var(--bg); color: var(--text);
        font-family: inherit;
        cursor: pointer;
    }
    select.sel:focus { border-color: var(--accent); }
    select.sel:disabled { opacity: 0.5; cursor: not-allowed; }
`;

class PersonPicker extends WNElement {
    static get domain() { return 'people'; }
    static get observedAttributes() {
        return ['people_service', 'value', 'placeholder', 'default-me', 'disabled'];
    }

    css() { return CSS; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this._sel = this.shadowRoot.querySelector('select');
        this._sel.addEventListener('change', () => {
            this._value = this._sel.value;
            const person = (this._people || []).find(p => p.key === this._value) || null;
            this.dispatchEvent(new CustomEvent('change', {
                bubbles: true, composed: true,
                detail: { value: this._value, person },
            }));
        });
        if (this.hasAttribute('value')) this._value = this.getAttribute('value');
        if (this.hasAttribute('disabled')) this._sel.disabled = true;
        this._load();
    }

    attributeChangedCallback(name, _old, val) {
        if (!this._sel) return;
        if (name === 'value') {
            this._value = val || '';
            this._sel.value = this._value;
        } else if (name === 'disabled') {
            this._sel.disabled = val !== null;
        } else if (name === 'placeholder' || name === 'default-me' || name === 'people_service') {
            // Re-render options
            this._loaded = false;
            this._load();
        }
    }

    get value() { return this._sel ? this._sel.value : (this._value || ''); }
    set value(v) {
        this._value = v == null ? '' : String(v);
        if (this._sel) this._sel.value = this._value;
    }

    get selectedPerson() {
        const v = this.value;
        return (this._people || []).find(p => p.key === v) || null;
    }

    async _load() {
        if (this._loaded) return;
        this._loaded = true;
        const placeholder = this.getAttribute('placeholder') || '(ingen)';
        const meKey = (typeof window !== 'undefined' && window.mePersonKey) || '';
        try {
            const svc = this.serviceFor('people');
            let arr;
            if (svc && typeof svc.list === 'function') {
                arr = await svc.list();
            } else {
                const resp = await fetch('/api/people');
                arr = await resp.json();
            }
            if (!Array.isArray(arr)) return;
            const items = arr
                .filter(p => p && p.key)
                .map(p => ({ key: p.key, name: p.name || p.key, isMe: p.key === meKey }))
                .sort((a, b) => {
                    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            this._people = items;
            const wantMe = this.hasAttribute('default-me') && !this._value;
            const preselect = this._value || (wantMe ? meKey : '');
            this._sel.innerHTML =
                `<option value="">${escapeHtml(placeholder)}</option>` +
                items.map(p => {
                    const label = p.isMe ? `${p.name} (meg)` : p.name;
                    return `<option value="${escapeHtml(p.key)}">${escapeHtml(label)}</option>`;
                }).join('');
            if (preselect) {
                this._sel.value = preselect;
                this._value = this._sel.value;
            }
            this.dispatchEvent(new CustomEvent('people-loaded', {
                bubbles: true, composed: true,
                detail: { count: items.length },
            }));
        } catch (_) { /* leave default */ }
    }

    render() {
        return html`<select class="sel"><option value="">${this.getAttribute('placeholder') || '(ingen)'}</option></select>`;
    }
}

if (!customElements.get('person-picker')) customElements.define('person-picker', PersonPicker);
