/**
 * <task-note-modal>
 *
 * Centered modal that edits a task's note (markdown). The component is
 * dumb &mdash; it does not load or save anything. The host opens it
 * with a task object and a callback that receives the result.
 *
 *   const modal = document.createElement('task-note-modal');
 *   modal.open({ id: 't42', text: 'Rapport', note: 'eksisterende' }, (res) => {
 *       if (res.saved) service.update(res.id, { note: res.note });
 *   });
 *
 * Methods:
 *   - open(task, callback) — sets the task, shows the modal, focuses
 *     the textarea (cursor at end). Callback runs once with one of:
 *         { saved: true,  id, note }
 *         { saved: false, id }
 *   - close() — hides the modal silently (no callback).
 *
 * Keyboard: Escape cancels, Ctrl/Cmd+Enter saves. Backdrop click and
 * the ✕ button cancel.
 */
import { WNElement, html, escapeHtml, modalZ } from './_shared.js';
import { attachDateTrigger } from '/components/wn-date-trigger.js';
import { attachAutocomplete, replaceRange, highlightMatch } from '/components/wn-autocomplete.js';

const STYLES = `
    :host { display: inline-block; font: inherit; }

    .backdrop {
        position: fixed; inset: 0; display: none;
        align-items: center; justify-content: center;
        background: var(--overlay);
    }
    :host([open]) .backdrop { display: flex; }

    .card {
        background: var(--bg); color: var(--text-strong);
        border: 1px solid var(--border); border-radius: 10px;
        padding: 18px 20px; width: min(560px, 92vw);
        box-shadow: 0 20px 60px var(--shadow);
        font-family: var(--font-family);
    }
    .head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 12px;
    }
    .head h3 {
        margin: 0; font-family: var(--font-heading);
        color: var(--accent); font-weight: 400; font-size: 1.1em;
    }
    .close {
        background: none; border: none; font-size: 1.3em;
        cursor: pointer; color: var(--text-muted);
    }
    .close:hover { color: var(--text-strong); }

    .task-text {
        color: var(--text-muted); font-weight: 600;
        margin: 0 0 14px; word-break: break-word;
    }
    textarea {
        width: 100%; box-sizing: border-box;
        min-height: 140px; resize: vertical;
        padding: 8px 10px;
        background: var(--surface); color: var(--text-strong);
        border: 1px solid var(--border); border-radius: 6px;
        font: inherit; font-size: 0.95em;
    }
    textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

    .actions {
        display: flex; justify-content: flex-end; gap: 8px;
        margin-top: 14px;
    }
    button.btn {
        padding: 8px 14px; border: none; border-radius: 8px;
        font: inherit; font-weight: 600; cursor: pointer; font-size: 0.95em;
    }
    button.cancel {
        background: var(--surface-alt); color: var(--text);
    }
    button.cancel:hover { background: var(--surface-head); }
    button.save {
        background: var(--accent); color: var(--text-on-accent);
    }
    button.save:hover { filter: brightness(0.95); }

    .hint { color: var(--text-subtle); font-size: 0.78em; margin-top: 6px; }
`;

class TaskNoteModal extends WNElement {
    static get observedAttributes() { return ['open']; }

    css() { return STYLES; }

    render() {
        const t = (this._data && this._data.task) || null;
        const text = t ? (t.text || '') : '';
        return html`
            <div class="backdrop" data-backdrop>
                <div class="card" role="dialog" aria-modal="true" aria-labelledby="tnm-h">
                    <div class="head">
                        <h3 id="tnm-h">📓 Notat</h3>
                        <button type="button" class="close" data-act="cancel" title="Lukk (Esc)">✕</button>
                    </div>
                    <p class="task-text">${escapeHtml(text)}</p>
                    <textarea data-el="note" rows="6"
                        placeholder="Skriv notat her…"></textarea>
                    <div class="hint">Ctrl/⌘ + Enter for å lagre, Esc for å avbryte. Markdown og @mentions støttes.</div>
                    <div class="actions">
                        <button type="button" class="btn cancel" data-act="cancel">Avbryt</button>
                        <button type="button" class="btn save"   data-act="save">💾 Lagre</button>
                    </div>
                </div>
            </div>
        `;
    }

    setData(d) {
        this._data = d || {};
        this.requestRender();
        this._wire();
    }

    open(task, callback) {
        this.setData({ task: task || {} });
        this._callback = (typeof callback === 'function') ? callback : null;
        this._zIndex = modalZ.next();
        this.setAttribute('open', '');
        const bd = this.shadowRoot && this.shadowRoot.querySelector('.backdrop');
        if (bd) bd.style.zIndex = this._zIndex;
        const initial = (task && typeof task.note === 'string') ? task.note : '';
        setTimeout(() => {
            const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="note"]');
            if (ta) {
                ta.value = initial;
                if (!ta.__wnDateAttached) attachDateTrigger(ta);
                if (!ta.__wnMentionAttached) {
                    ta.__wnMentionAttached = true;
                    this._installMentionAutocomplete(ta);
                }
                ta.focus();
                const len = ta.value.length;
                try { ta.setSelectionRange(len, len); } catch {}
            }
        }, 0);
    }

    close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        modalZ.release();
        this._zIndex = null;
        this._callback = null;
    }

    _currentId() {
        return (this._data && this._data.task && this._data.task.id) || null;
    }

    _runCallback(result) {
        const cb = this._callback;
        this._callback = null;
        if (cb) {
            try { cb(result); }
            catch (err) { console.error('task-note-modal callback failed', err); }
        }
    }

    _cancel() {
        const id = this._currentId();
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ saved: false, id });
    }

    _save() {
        const id = this._currentId();
        const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="note"]');
        const note = ta ? ta.value.trim() : '';
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ saved: true, id, note });
    }

    _installMentionAutocomplete(ta) {
        let people = null, companies = null, teams = null;
        const ensurePeople = async () => {
            if (people) return people;
            try { const r = await fetch('/api/people'); people = (await r.json() || []).filter(p => !p.inactive); } catch (_) { people = []; }
            return people;
        };
        const ensureCompanies = async () => {
            if (companies) return companies;
            try { const r = await fetch('/api/companies'); companies = (await r.json() || []).filter(c => !c.deleted); } catch (_) { companies = []; }
            return companies;
        };
        const ensureTeams = async () => {
            if (teams) return teams;
            try { const r = await fetch('/api/teams'); teams = (await r.json() || []).filter(t => !t.deleted); } catch (_) { teams = []; }
            return teams;
        };

        const mentionTrigger = {
            detect: (text, caret, opts) => {
                let i = caret - 1;
                while (i >= 0 && /[a-zA-ZæøåÆØÅ0-9_-]/.test(text[i])) i--;
                if (i < 0 || text[i] !== '@') return null;
                if (i > 0 && !/[\s(\[,;]/.test(text[i - 1])) return null;
                const frag = text.slice(i + 1, caret);
                if (!frag && !(opts && opts.force)) return null;
                return { query: frag, start: i, end: caret };
            },
            fetchItems: async () => {
                const [pp, cc, tt] = await Promise.all([ensurePeople(), ensureCompanies(), ensureTeams()]);
                const out = [];
                const meKey = (typeof window !== 'undefined' && window.mePersonKey) || '';
                if (meKey) {
                    const me = pp.find(p => (p.key || (p.name || '').toLowerCase()) === meKey);
                    const disp = me
                        ? (me.firstName ? (me.lastName ? `${me.firstName} ${me.lastName}` : me.firstName) : (me.name || me.key))
                        : meKey;
                    out.push({ value: 'me', label: disp, hint: 'meg', kind: 'me' });
                } else {
                    out.push({ value: 'me', label: 'meg', hint: 'sett i Innstillinger', kind: 'me' });
                }
                for (const t of tt) out.push({ value: t.key || (t.name || '').toLowerCase(), label: t.name || t.key, hint: 'team', kind: 'team' });
                for (const c of cc) out.push({ value: c.key || (c.name || '').toLowerCase(), label: c.name || c.key, hint: 'firma', kind: 'company' });
                for (const p of pp) {
                    const display = p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name;
                    out.push({ value: p.key || (p.name || '').toLowerCase(), label: display || p.name || p.key, hint: '', kind: 'person' });
                }
                return out;
            },
            filter: 'starts',
            limit: 10,
            renderItem: (item, query) => {
                const tag = item.kind === 'team' ? '👥' : item.kind === 'company' ? '🏢' : (item.kind === 'me' ? '🙋' : '👤');
                return `${tag} ${highlightMatch(item.label, query)}` +
                    (item.hint ? `<span style="opacity:0.55;font-size:0.85em"> · ${item.hint}</span>` : '');
            },
            onSelect: (item, ctx) => {
                replaceRange(ctx.textarea, ctx.range.start, ctx.range.end, `@${item.value} `);
            },
        };

        this._acHandle = attachAutocomplete(ta, {
            triggers: [mentionTrigger],
            container: this.shadowRoot.querySelector('.card') || this.shadowRoot,
        });
    }

    connectedCallback() {
        super.connectedCallback();
        this._wire();
        if (this._keyWired) return;
        this._keyWired = true;
        this._onKey = (e) => {
            if (!this.hasAttribute('open')) return;
            if (e.key === 'Escape') { e.preventDefault(); this._cancel(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._save(); }
        };
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onKey);
        if (this._acHandle) { this._acHandle.destroy(); this._acHandle = null; }
    }

    _wire() {
        if (this._wired) return;
        const root = this.shadowRoot;
        if (!root) return;
        this._wired = true;
        root.addEventListener('click', (e) => {
            if (e.target.matches('[data-backdrop]')) { this._cancel(); return; }
            const a = e.target.closest('[data-act]');
            if (!a) return;
            if (a.dataset.act === 'cancel') this._cancel();
            if (a.dataset.act === 'save')   this._save();
        });
    }
}

if (!customElements.get('task-note-modal')) customElements.define('task-note-modal', TaskNoteModal);
