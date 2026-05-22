/**
 * <task-complete-modal>
 *
 * Centered modal that confirms completion of a single task and lets the
 * user attach an optional comment. The component is dumb &mdash; it does
 * not load or save anything. The host opens it with a task object and a
 * callback that receives the result.
 *
 *   const modal = document.createElement('task-complete-modal');
 *   modal.open({ id: 't42', text: 'Sende rapport til @anna' }, (res) => {
 *       if (res.confirmed) service.toggle(res.id, res.comment);
 *       else cb.checked = false;
 *   });
 *
 * Methods:
 *   - open(task, callback)  — sets the task, shows the modal, stores the
 *                             callback. The textarea is cleared and focused.
 *                             Callback runs once with one of:
 *                               { confirmed: true,  id, comment }
 *                               { confirmed: false, id }
 *   - close()               — hides the modal (no callback).
 *
 * Keyboard: Escape cancels, Ctrl/Cmd+Enter confirms. Clicking the
 * backdrop or the close button cancels.
 */
import { WNElement, html, escapeHtml, modalZ } from './_shared.js';
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
        padding: 18px 20px; width: min(520px, 92vw);
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
        min-height: 92px; resize: vertical;
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
    button.confirm {
        background: var(--success); color: var(--text-on-accent);
    }
    button.confirm:hover { background: var(--success-strong); }

    .hint { color: var(--text-subtle); font-size: 0.78em; margin-top: 6px; }
`;

class TaskCompleteModal extends WNElement {
    static get observedAttributes() { return ['open']; }

    css() { return STYLES; }

    render() {
        const t = (this._data && this._data.task) || null;
        const text = t ? (t.text || '') : '';
        return html`
            <div class="backdrop" data-backdrop>
                <div class="card" role="dialog" aria-modal="true" aria-labelledby="ctm-h">
                    <div class="head">
                        <h3 id="ctm-h">✅ Fullfør oppgave</h3>
                        <button type="button" class="close" data-act="cancel" title="Lukk (Esc)">✕</button>
                    </div>
                    <p class="task-text">${escapeHtml(text)}</p>
                    <textarea data-el="comment" rows="4"
                        placeholder="Legg til en kommentar (valgfritt)…"></textarea>
                    <div class="hint">Ctrl/⌘ + Enter for å fullføre, Esc for å avbryte. @mentions støttes.</div>
                    <div class="actions">
                        <button type="button" class="btn cancel"  data-act="cancel">Avbryt</button>
                        <button type="button" class="btn confirm" data-act="confirm">✅ Fullført</button>
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
        if (task) this.setData({ task });
        this._callback = (typeof callback === 'function') ? callback : null;
        this._zIndex = modalZ.next();
        this.setAttribute('open', '');
        const bd = this.shadowRoot && this.shadowRoot.querySelector('.backdrop');
        if (bd) bd.style.zIndex = this._zIndex;
        setTimeout(() => {
            const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="comment"]');
            if (ta) {
                ta.value = ''; ta.focus();
                if (!ta.__wnMentionAttached) {
                    ta.__wnMentionAttached = true;
                    this._installMentionAutocomplete(ta);
                }
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
            catch (err) { console.error('task-complete-modal callback failed', err); }
        }
    }

    _cancel() {
        const id = this._currentId();
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ confirmed: false, id });
    }

    _confirm() {
        const id = this._currentId();
        const ta = this.shadowRoot && this.shadowRoot.querySelector('[data-el="comment"]');
        const comment = ta ? ta.value.trim() : '';
        if (this.hasAttribute('open')) this.removeAttribute('open');
        this._runCallback({ confirmed: true, id, comment });
    }

    connectedCallback() {
        super.connectedCallback();
        this._wire();
        if (this._keyWired) return;
        this._keyWired = true;
        this._onKey = (e) => {
            if (!this.hasAttribute('open')) return;
            if (e.key === 'Escape') { e.preventDefault(); this._cancel(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._confirm(); }
        };
        document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onKey);
        if (this._acHandle) { this._acHandle.destroy(); this._acHandle = null; }
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

    _wire() {
        if (this._wired) return;
        const root = this.shadowRoot;
        if (!root) return;
        this._wired = true;
        root.addEventListener('click', (e) => {
            if (e.target.matches('[data-backdrop]')) { this._cancel(); return; }
            const a = e.target.closest('[data-act]');
            if (!a) return;
            if (a.dataset.act === 'cancel')  this._cancel();
            if (a.dataset.act === 'confirm') this._confirm();
        });
    }
}

if (!customElements.get('task-complete-modal')) customElements.define('task-complete-modal', TaskCompleteModal);

// Page-level singleton + event handler. Any code that needs to confirm
// task completion dispatches a bubbling `task:request-complete` event;
// a single document-level listener mounts the modal lazily, opens it,
// and resolves the callback supplied in event.detail.
//
//   el.dispatchEvent(new CustomEvent('task:request-complete', {
//       bubbles: true, composed: true,
//       detail: { id, text, callback: (res) => { ... } },
//   }));
//
// `res` is `{ confirmed: true, id, comment }` or `{ confirmed: false, id }`.
// `composed: true` lets the event escape shadow DOM boundaries.
function getTaskCompleteModal() {
    if (typeof document === 'undefined') return null;
    let m = document.querySelector('body > task-complete-modal[data-singleton="page"]');
    if (!m) {
        m = document.createElement('task-complete-modal');
        m.setAttribute('data-singleton', 'page');
        document.body.appendChild(m);
    }
    return m;
}

if (typeof document !== 'undefined' && !document._taskCompleteRequestWired) {
    document._taskCompleteRequestWired = true;
    document.addEventListener('task:request-complete', (ev) => {
        const detail = (ev && ev.detail) || {};
        const cb = (typeof detail.callback === 'function') ? detail.callback : null;
        const m = getTaskCompleteModal();
        if (!m) {
            if (cb) cb({ confirmed: false, id: detail.id });
            return;
        }
        m.open({ id: detail.id, text: detail.text || '' }, (res) => {
            if (cb) cb(res);
        });
    });
}

if (typeof window !== 'undefined') {
    // Backwards-compatible direct entry points.
    window.getTaskCompleteModal = getTaskCompleteModal;
    window.openTaskCompleteModal = function openTaskCompleteModal(task, cb) {
        const m = getTaskCompleteModal();
        if (!m) { if (cb) cb({ confirmed: false, id: task && task.id }); return; }
        m.open(task, cb);
        return m;
    };
}
