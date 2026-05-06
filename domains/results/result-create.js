/**
 * <result-create> — reusable "new result" input.
 *
 * Inline single-line text + Submit button. Mirrors <task-create>'s inline
 * mode but for results.
 *
 * Calls `service.create({ text, week?, goalId? })` (ResultsService) and
 * dispatches a `result:created` event (bubbles, composed) with detail
 *   { result }
 * so the host can refresh.
 *
 * Attributes:
 *   placeholder       — input placeholder (default "Nytt resultat...")
 *   button-label      — submit button text (default "Legg til")
 *   compact           — boolean attr; slimmer variant
 *   goal-id           — optional; included as goalId on create
 *   week              — optional ISO-week (YYYY-WNN); server defaults to current week
 *   autofocus-on-connect — boolean; focus the input on mount
 *   results_service   — service path attribute
 *
 * Events:
 *   result:created       — { result }
 *   result:create-failed — { error }
 */
import { WNElement, html } from './_shared.js';

const CSS = `
    :host { display: block; box-sizing: border-box; }
    .row { display: flex; gap: 8px; align-items: stretch; }
    input.txt {
        flex: 1; min-width: 0;
        padding: 10px 14px;
        border: 2px solid var(--border-soft);
        border-radius: 8px; font-size: 1em; outline: none;
        background: var(--bg); color: var(--text);
        font-family: inherit;
    }
    input.txt:focus { border-color: var(--accent); }
    button.btn {
        padding: 10px 20px; background: var(--success); color: var(--text-on-accent);
        border: none; border-radius: 8px; font-weight: 600;
        cursor: pointer; font-size: 1em; font-family: inherit;
        white-space: nowrap;
    }
    button.btn:hover:not(:disabled) { background: var(--success-strong); }
    button.btn:disabled { opacity: 0.5; cursor: not-allowed; }
    :host([compact]) input.txt { padding: 6px 10px; font-size: 0.9em; }
    :host([compact]) button.btn { padding: 6px 12px; font-size: 0.9em; }
    .err { color: var(--danger); font-size: 0.8em; margin-top: 4px; min-height: 1em; }
`;

class ResultCreate extends WNElement {
    static get domain() { return 'results'; }
    static get observedAttributes() { return ['placeholder', 'button-label']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this._refreshRefs();
        this._btn.addEventListener('click', () => this._submit());
        this._input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); this._submit(); }
        });
        this._apply();
        if (this.hasAttribute('autofocus-on-connect')) {
            setTimeout(() => this._input && this._input.focus(), 0);
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.shadowRoot && oldVal !== newVal) {
            this._refreshRefs();
            this._apply();
        }
    }

    css() { return CSS; }

    render() {
        return html`
            <div class="row">
                <input class="txt" type="text" data-el="text" />
                <button class="btn" type="button" data-el="submit"></button>
            </div>
            <div class="err" data-err></div>
        `;
    }

    _refreshRefs() {
        const root = this.shadowRoot;
        this._input = root.querySelector('[data-el="text"]');
        this._btn   = root.querySelector('[data-el="submit"]');
        this._err   = root.querySelector('[data-err]');
    }

    _apply() {
        if (!this._input || !this._btn) return;
        this._input.placeholder = this.getAttribute('placeholder') || 'Nytt resultat...';
        this._btn.textContent = this.getAttribute('button-label') || 'Legg til';
    }

    get value() { return this._input ? this._input.value : ''; }
    set value(v) { if (this._input) this._input.value = v == null ? '' : String(v); }

    focus() { if (this._input) this._input.focus(); }

    async _submit() {
        if (!this._input || !this._btn || !this._err) return;
        const text = (this._input.value || '').trim();
        this._err.textContent = '';
        if (!text) { this._input.focus(); return; }
        const svc = this.service;
        if (!svc || typeof svc.create !== 'function') {
            this._err.textContent = 'Tjeneste ikke koblet til';
            return;
        }
        const data = { text };
        const goalId = this.getAttribute('goal-id');
        if (goalId) data.goalId = goalId;
        const week = this.getAttribute('week');
        if (week) data.week = week;
        this._btn.disabled = true;
        try {
            const result = await svc.create(data);
            this._input.value = '';
            this._input.focus();
            this.dispatchEvent(new CustomEvent('result:created', {
                bubbles: true, composed: true,
                detail: { result },
            }));
        } catch (e) {
            this._err.textContent = e.message || 'Feil ved lagring';
            this.dispatchEvent(new CustomEvent('result:create-failed', {
                bubbles: true, composed: true,
                detail: { error: e.message || String(e) },
            }));
        } finally {
            this._btn.disabled = false;
        }
    }
}

if (!customElements.get('result-create')) customElements.define('result-create', ResultCreate);
