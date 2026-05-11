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
import { WNElement, html, unsafeHTML } from './_shared.js';

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
    static get observedAttributes() { return ['placeholder', 'button-label', 'full', 'goal-id']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        const sr = this.shadowRoot;
        sr.addEventListener('click', (e) => {
            const t = e.composedPath().find(n => n && n.dataset && n.dataset.el === 'submit');
            if (t) this._submit();
        });
        sr.addEventListener('keydown', (e) => {
            const t = e.composedPath().find(n => n && n.dataset && n.dataset.el === 'text');
            if (!t) return;
            if (e.key === 'Enter' && !this.hasAttribute('full')) { e.preventDefault(); this._submit(); }
            if (e.key === 'Enter' && this.hasAttribute('full') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault(); this._submit();
            }
        });
        if (this.hasAttribute('autofocus-on-connect')) {
            setTimeout(() => { const i = this._inputEl(); if (i) i.focus(); }, 0);
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal && (name === 'full' || name === 'goal-id')) this.invalidateAwait();
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    css() { return CSS; }

    loadData() {
        if (!this.hasAttribute('full')) return {};
        return {
            goals: async () => {
                try {
                    const arr = await fetch('/api/goals').then(r => r.json());
                    if (!Array.isArray(arr)) return [];
                    return arr.filter(g => g && g.id).sort((a, b) => {
                        const sa = a.status === 'active' ? 0 : 1;
                        const sb = b.status === 'active' ? 0 : 1;
                        if (sa !== sb) return sa - sb;
                        return (a.title || '').localeCompare(b.title || '');
                    });
                } catch (_) { return []; }
            },
        };
    }

    render(data = {}) {
        const placeholder = this.getAttribute('placeholder') || 'Nytt resultat...';
        const btnLabel = this.getAttribute('button-label') || 'Legg til';
        if (this.hasAttribute('full')) {
            const preselect = this.getAttribute('goal-id') || '';
            const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const goalOpts = (data.goals || []).map(g => {
                const icon = g.status === 'achieved' ? '🏆 ' : g.status === 'abandoned' ? '🗑️ ' : '🎯 ';
                const sel = g.id === preselect ? ' selected' : '';
                return `<option value="${esc(g.id)}"${sel}>${esc(icon + (g.title || ''))}</option>`;
            }).join('');
            return html`
                <div class="form">
                    <input class="txt" type="text" data-el="text" placeholder="${placeholder}" />
                    <div class="meta-row">
                        <label>
                            <span>Mål:</span>
                            <select class="sel" data-el="goal">
                                <option value="">(ingen)</option>
                                ${unsafeHTML(goalOpts)}
                            </select>
                        </label>
                    </div>
                    <div class="actions">
                        <button class="btn" type="button" data-el="submit">${btnLabel}</button>
                    </div>
                    <div class="err" data-err></div>
                </div>
            `;
        }
        return html`
            <div class="row">
                <input class="txt" type="text" data-el="text" placeholder="${placeholder}" />
                <button class="btn" type="button" data-el="submit">${btnLabel}</button>
            </div>
            <div class="err" data-err></div>
        `;
    }

    _inputEl() { return this.shadowRoot && this.shadowRoot.querySelector('[data-el="text"]'); }
    _btnEl()   { return this.shadowRoot && this.shadowRoot.querySelector('[data-el="submit"]'); }
    _errEl()   { return this.shadowRoot && this.shadowRoot.querySelector('[data-err]'); }
    _goalEl()  { return this.shadowRoot && this.shadowRoot.querySelector('[data-el="goal"]'); }

    get value() { const i = this._inputEl(); return i ? i.value : ''; }
    set value(v) { const i = this._inputEl(); if (i) i.value = v == null ? '' : String(v); }

    focus() { const i = this._inputEl(); if (i) i.focus(); }

    async _submit() {
        const input = this._inputEl(), btn = this._btnEl(), err = this._errEl();
        if (!input || !btn || !err) return;
        const text = (input.value || '').trim();
        err.textContent = '';
        if (!text) { input.focus(); return; }
        const svc = this.service;
        if (!svc || typeof svc.create !== 'function') {
            err.textContent = 'Tjeneste ikke koblet til';
            return;
        }
        const data = { text };
        let goalId = '';
        if (this.hasAttribute('full')) {
            const goalSel = this._goalEl();
            if (goalSel) goalId = goalSel.value || '';
        }
        if (!goalId) goalId = this.getAttribute('goal-id') || '';
        if (goalId) data.goalId = goalId;
        const week = this.getAttribute('week');
        if (week) data.week = week;
        btn.disabled = true;
        try {
            const result = await svc.create(data);
            input.value = '';
            input.focus();
            this.dispatchEvent(new CustomEvent('result:created', {
                bubbles: true, composed: true,
                detail: { result },
            }));
        } catch (e) {
            err.textContent = e.message || 'Feil ved lagring';
            this.dispatchEvent(new CustomEvent('result:create-failed', {
                bubbles: true, composed: true,
                detail: { error: e.message || String(e) },
            }));
        } finally {
            btn.disabled = false;
        }
    }
}

if (!customElements.get('result-create')) customElements.define('result-create', ResultCreate);
