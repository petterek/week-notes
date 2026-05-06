/**
 * <result-create> — reusable "new result" input.
 *
 * Two modes:
 *   - inline (default): single-line text + Submit button. Quick-add path.
 *   - full (boolean attribute `full`): expanded form with text input and
 *     an optional "Mål" picker. Used by future result-add-modal.
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
 *   full              — boolean attr; expanded form (text + Mål)
 *   goal-id           — optional; preselected goal id (sent on create
 *                       even in inline mode, where there's no picker)
 *   week              — optional ISO-week (YYYY-WNN)
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
    input.txt, select.sel {
        padding: 10px 14px; min-width: 0;
        border: 2px solid var(--border-soft);
        border-radius: 8px; font-size: 1em; outline: none;
        background: var(--bg); color: var(--text);
        font-family: inherit;
    }
    input.txt { flex: 1; }
    input.txt:focus, select.sel:focus { border-color: var(--accent); }
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

    /* Full-form layout */
    :host([full]) .form { display: grid; grid-template-columns: 1fr; gap: 8px; }
    :host([full]) .meta-row { display: flex; gap: 8px; flex-wrap: wrap; }
    :host([full]) .meta-row label {
        display: flex; align-items: center; gap: 6px;
        color: var(--text-muted); font-size: 0.9em;
    }
    :host([full]) .actions { display: flex; justify-content: flex-end; gap: 8px; }
`;

class ResultCreate extends WNElement {
    static get domain() { return 'results'; }
    static get observedAttributes() { return ['placeholder', 'button-label', 'full']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this._refreshRefs();
        this._btn.addEventListener('click', () => this._submit());
        this._input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !this.hasAttribute('full')) { e.preventDefault(); this._submit(); }
            if (e.key === 'Enter' && this.hasAttribute('full') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault(); this._submit();
            }
        });
        this._apply();
        if (this.hasAttribute('full')) this._loadGoals();
        if (this.hasAttribute('autofocus-on-connect')) {
            setTimeout(() => this._input && this._input.focus(), 0);
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.shadowRoot && oldVal !== newVal) {
            this._refreshRefs();
            this._apply();
            if (name === 'full' && this.hasAttribute('full')) this._loadGoals();
        }
    }

    css() { return CSS; }

    render() {
        if (this.hasAttribute('full')) {
            return html`
                <div class="form">
                    <input class="txt" type="text" data-el="text" />
                    <div class="meta-row">
                        <label>
                            <span>Mål:</span>
                            <select class="sel" data-el="goal">
                                <option value="">(ingen)</option>
                            </select>
                        </label>
                    </div>
                    <div class="actions">
                        <button class="btn" type="button" data-el="submit"></button>
                    </div>
                    <div class="err" data-err></div>
                </div>
            `;
        }
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
        this._goalSel = root.querySelector('[data-el="goal"]');
    }

    _apply() {
        if (!this._input || !this._btn) return;
        this._input.placeholder = this.getAttribute('placeholder') || 'Nytt resultat...';
        this._btn.textContent = this.getAttribute('button-label') || 'Legg til';
    }

    get value() { return this._input ? this._input.value : ''; }
    set value(v) { if (this._input) this._input.value = v == null ? '' : String(v); }

    focus() { if (this._input) this._input.focus(); }

    async _loadGoals() {
        if (!this._goalSel || this._goalsLoaded) return;
        this._goalsLoaded = true;
        const preselect = this.getAttribute('goal-id') || '';
        try {
            const resp = await fetch('/api/goals');
            const arr = await resp.json();
            if (!Array.isArray(arr)) return;
            const items = arr
                .filter(g => g && g.id)
                .sort((a, b) => {
                    const sa = a.status === 'active' ? 0 : 1;
                    const sb = b.status === 'active' ? 0 : 1;
                    if (sa !== sb) return sa - sb;
                    return (a.title || '').localeCompare(b.title || '');
                });
            const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            this._goalSel.innerHTML =
                '<option value="">(ingen)</option>' +
                items.map(g => {
                    const icon = g.status === 'achieved' ? '🏆 ' : g.status === 'abandoned' ? '🗑️ ' : '🎯 ';
                    return `<option value="${esc(g.id)}">${esc(icon + (g.title || ''))}</option>`;
                }).join('');
            if (preselect) this._goalSel.value = preselect;
        } catch (_) { /* leave empty */ }
    }

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
        let goalId = '';
        if (this.hasAttribute('full') && this._goalSel) goalId = this._goalSel.value || '';
        if (!goalId) goalId = this.getAttribute('goal-id') || '';
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
