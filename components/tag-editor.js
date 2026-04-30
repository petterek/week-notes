/**
 * <tag-editor> — chip-style tag input.
 *
 * Usage:
 *   <tag-editor name="availableThemes"
 *               value="planlegging,retro"
 *               suggestions="status,kunde"
 *               placeholder="Legg til tag…"></tag-editor>
 *
 * Attributes:
 *   name        : form field name (the joined CSV value is submitted under this).
 *   value       : initial CSV of tags.
 *   suggestions : CSV of suggestion tags shown in dropdown when typing.
 *   placeholder : input placeholder text.
 *   separator   : output separator when serialised for the form (default ",").
 *
 * Properties:
 *   .tags  : string[] (live; setter triggers re-render and form update)
 *   .value : same as tags joined by separator.
 *
 * Events:
 *   change : { detail: { tags } } when the tag list changes.
 *
 * Form-associated: the component participates in form submission as
 * `<name>=<csv>` via ElementInternals.setFormValue(). No hidden input
 * needed.
 */

import { WNElement, html, escapeHtml, unsafeHTML } from './_shared.js';

const STYLES = `
:host { display: block; }
.box { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 6px; min-height: 32px; border: 1px solid var(--border-faint, #ccc); border-radius: 6px; background: var(--surface-alt, #fff); cursor: text; }
.box:focus-within { border-color: var(--accent, #06c); box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.15); }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border-radius: 12px; background: var(--accent-soft, #e7f1fb); color: var(--accent, #06c); font-size: 0.85em; line-height: 1.2; }
.chip button { background: none; border: none; cursor: pointer; color: inherit; padding: 0 4px; font-size: 1em; line-height: 1; opacity: 0.7; }
.chip button:hover { opacity: 1; }
input { flex: 1; min-width: 100px; border: none; outline: none; background: transparent; font: inherit; padding: 4px 2px; color: inherit; }
.suggest { position: relative; }
.suggest-list { position: absolute; left: 0; right: 0; top: 100%; margin-top: 2px; background: var(--surface, #fff); border: 1px solid var(--border-faint, #ccc); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); max-height: 200px; overflow: auto; z-index: 10; padding: 4px 0; }
.suggest-list[hidden] { display: none; }
.suggest-list button { display: block; width: 100%; text-align: left; background: none; border: none; padding: 4px 12px; cursor: pointer; font: inherit; color: inherit; }
.suggest-list button:hover, .suggest-list button.active { background: var(--accent-soft, #e7f1fb); color: var(--accent, #06c); }
`;

function normalize(t) {
    return String(t || '').trim().toLowerCase();
}
function parseCsv(s) {
    return String(s || '')
        .split(',')
        .map(t => normalize(t))
        .filter(Boolean);
}

export class TagEditor extends WNElement {
    static formAssociated = true;
    static get observedAttributes() { return ['value', 'suggestions', 'placeholder', 'name', 'counts']; }

    constructor() {
        super();
        this._tags = [];
        this._activeIdx = -1;
        this._filter = '';
        try { this._internals = this.attachInternals(); } catch (_) { this._internals = null; }
    }

    set tags(arr) {
        const seen = new Set();
        this._tags = [];
        for (const t of (Array.isArray(arr) ? arr : [])) {
            const n = normalize(t);
            if (!n || seen.has(n)) continue;
            seen.add(n);
            this._tags.push(n);
        }
        this._syncForm();
        if (this.isConnected) this.requestRender();
    }
    get tags() { return this._tags.slice(); }
    get value() { return this._tags.join(this.getAttribute('separator') || ','); }
    set value(v) { this.tags = parseCsv(v); }

    attributeChangedCallback(name, _old, val) {
        if (name === 'value' && _old !== val) this.tags = parseCsv(val);
        super.attributeChangedCallback();
    }

    _syncForm() {
        if (this._internals && this._internals.setFormValue) {
            this._internals.setFormValue(this.value);
        }
        this.dispatchEvent(new CustomEvent('change', { detail: { tags: this.tags }, bubbles: true }));
    }

    _suggestions() {
        const all = parseCsv(this.getAttribute('suggestions') || '');
        const f = normalize(this._filter);
        return all.filter(s => !this._tags.includes(s) && (!f || s.startsWith(f)));
    }

    css() { return STYLES; }

    _counts() {
        const raw = this.getAttribute('counts');
        if (!raw) return null;
        try { const o = JSON.parse(raw); return (o && typeof o === 'object') ? o : null; }
        catch (_) { return null; }
    }

    _label(tag) {
        const c = this._counts();
        if (c && Object.prototype.hasOwnProperty.call(c, tag)) {
            return `${tag} (${c[tag]})`;
        }
        return tag;
    }

    _suggestionsHtml() {
        const sugs = this._suggestions();
        const showList = !!sugs.length && this._focused;
        const list = sugs.map((s, i) => `<button type="button" data-add="${escapeHtml(s)}" class="${i === this._activeIdx ? 'active' : ''}">${escapeHtml(this._label(s))}</button>`).join('');
        return { list, hidden: !showList };
    }

    _refreshSuggestions() {
        const el = this.shadowRoot.querySelector('.suggest-list');
        if (!el) return;
        const { list, hidden } = this._suggestionsHtml();
        el.innerHTML = list;
        if (hidden) el.setAttribute('hidden', ''); else el.removeAttribute('hidden');
    }

    render() {
        const placeholder = this.getAttribute('placeholder') || 'Legg til tag…';
        const chips = this._tags.map(t => html`<span class="chip" data-tag="${t}">${this._label(t)}<button type="button" aria-label="Fjern ${t}" data-remove="${t}">×</button></span>`);
        const { list, hidden } = this._suggestionsHtml();
        return html`<div class="box">${chips}<div class="suggest" style="flex:1"><input type="text" placeholder="${placeholder}" autocomplete="off" /><div class="suggest-list" ${hidden ? html`hidden` : html``}>${unsafeHTML(list)}</div></div></div>`;
    }

    _input() { return this.shadowRoot.querySelector('input'); }

    _addCurrent(text) {
        const next = parseCsv(text);
        if (!next.length) return false;
        const merged = this._tags.slice();
        let added = false;
        for (const t of next) {
            if (!merged.includes(t)) { merged.push(t); added = true; }
        }
        if (added) {
            this._tags = merged;
            this._syncForm();
        }
        this._filter = '';
        this._activeIdx = -1;
        this.requestRender();
        const inp = this._input(); if (inp) { inp.value = ''; inp.focus(); }
        return added;
    }

    _remove(tag) {
        const i = this._tags.indexOf(tag);
        if (i < 0) return;
        this._tags.splice(i, 1);
        this._syncForm();
        this.requestRender();
    }

    connectedCallback() {
        if (this.hasAttribute('value')) this._tags = parseCsv(this.getAttribute('value'));
        super.connectedCallback();
        this._syncForm();

        this.shadowRoot.addEventListener('click', (e) => {
            const rm = e.target.closest('button[data-remove]');
            if (rm) { this._remove(rm.dataset.remove); return; }
            const add = e.target.closest('button[data-add]');
            if (add) { this._addCurrent(add.dataset.add); return; }
            const box = e.target.closest('.box');
            if (box) { const inp = this._input(); if (inp) inp.focus(); }
        });

        this.shadowRoot.addEventListener('input', (e) => {
            if (e.target.tagName !== 'INPUT') return;
            this._filter = e.target.value;
            this._activeIdx = -1;
            this._refreshSuggestions();
        });

        this.shadowRoot.addEventListener('keydown', (e) => {
            if (e.target.tagName !== 'INPUT') return;
            const sugs = this._suggestions();
            if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                if (this._activeIdx >= 0 && sugs[this._activeIdx]) {
                    e.preventDefault();
                    this._addCurrent(sugs[this._activeIdx]);
                } else if (e.target.value.trim()) {
                    e.preventDefault();
                    this._addCurrent(e.target.value);
                }
                return;
            }
            if (e.key === 'Backspace' && !e.target.value && this._tags.length) {
                e.preventDefault();
                this._tags.pop();
                this._syncForm();
                this.requestRender();
                return;
            }
            if (e.key === 'ArrowDown' && sugs.length) {
                e.preventDefault();
                this._activeIdx = (this._activeIdx + 1) % sugs.length;
                this._refreshSuggestions();
            } else if (e.key === 'ArrowUp' && sugs.length) {
                e.preventDefault();
                this._activeIdx = (this._activeIdx - 1 + sugs.length) % sugs.length;
                this._refreshSuggestions();
            } else if (e.key === 'Escape') {
                this._filter = ''; this._activeIdx = -1;
                e.target.value = '';
                this._refreshSuggestions();
            }
        });

        this.shadowRoot.addEventListener('focusin', () => { this._focused = true; this._refreshSuggestions(); });
        this.shadowRoot.addEventListener('focusout', () => {
            setTimeout(() => {
                const active = this.shadowRoot.activeElement;
                if (!active) { this._focused = false; this._refreshSuggestions(); }
            }, 120);
        });
    }

    formResetCallback() { this.tags = parseCsv(this.getAttribute('value')); }
    formDisabledCallback(disabled) {
        const inp = this._input(); if (inp) inp.disabled = disabled;
    }
}

customElements.define('tag-editor', TagEditor);
