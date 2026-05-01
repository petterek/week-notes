/**
 * <inline-task task-id="<id>" state="open|done">
 *
 * Renders an interactive checkbox + task text for tasks referenced
 * inline in saved notes. The two reference forms are produced by
 * linkMentions on the server:
 *
 *   {{?<id>}} → <inline-task task-id="<id>" state="open">
 *   {{!<id>}} → <inline-task task-id="<id>" state="done">
 *
 * On click, the component flips the task state via
 * /api/tasks/:id/close-from-note, which also rewrites the marker in
 * the source note file so the new state survives a reload.
 *
 * On a successful toggle, a 'task-closed' CustomEvent is dispatched
 * (bubbles, composed) with detail = { taskId, done }. Global UI like
 * the open-tasks sidebar can listen for it on document/window and
 * refresh.
 *
 * The task text is fetched lazily from /api/tasks (one fetch shared
 * across instances on the page).
 */
import { WNElement, html } from './_shared.js';

const STYLES = `
    :host {
        display: inline;
        font: inherit;
    }
    .wrap {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        vertical-align: baseline;
        padding: 0 4px;
        border-radius: 4px;
        background: var(--neutral-soft, #f1f3f5);
        border: 1px solid var(--neutral, #c8ccd0);
        line-height: 1.35;
    }
    .wrap.done .text {
        text-decoration: line-through;
        opacity: 0.7;
    }
    input[type="checkbox"] {
        margin: 0;
        cursor: pointer;
    }
    .text {
        font-size: 0.95em;
    }
    .text.busy {
        opacity: 0.5;
    }
    .err {
        color: var(--danger, #c0392b);
        font-size: 0.85em;
        margin-left: 4px;
    }
`;

let _taskCache = null;
let _taskCachePromise = null;
const _instances = new Set();

function loadTaskMap() {
    if (_taskCache) return Promise.resolve(_taskCache);
    if (_taskCachePromise) return _taskCachePromise;
    _taskCachePromise = fetch('/api/tasks').then(r => r.json()).then(arr => {
        const map = {};
        if (Array.isArray(arr)) arr.forEach(t => { if (t && t.id) map[t.id] = t; });
        _taskCache = map;
        _taskCachePromise = null;
        // Re-render any waiting instances so they pick up the resolved text.
        for (const inst of _instances) inst.requestRender();
        return map;
    }).catch(() => {
        _taskCachePromise = null;
        return {};
    });
    return _taskCachePromise;
}

class InlineTask extends WNElement {
    static get observedAttributes() { return ['task-id', 'state']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        _instances.add(this);
        if (!this._wired) {
            this._wired = true;
            // Delegate via shadowRoot so re-rendering doesn't re-bind.
            this.shadowRoot.addEventListener('change', (e) => {
                if (e.target && e.target.matches('input[type="checkbox"]')) {
                    this._onToggle(e.target);
                }
            });
        }
        if (!_taskCache) loadTaskMap();
    }

    disconnectedCallback() {
        _instances.delete(this);
    }

    render() {
        const id = this.getAttribute('task-id') || '';
        const state = (this.getAttribute('state') || 'open') === 'done' ? 'done' : 'open';
        const checked = state === 'done' ? 'checked' : '';
        const task = (_taskCache && id) ? _taskCache[id] : null;
        const text = task ? (task.text || '') : (id ? '…' : '');
        return html`<span class="wrap ${state}">
            <input type="checkbox" ${checked} aria-label="${state === 'done' ? 'Gjenåpne oppgave' : 'Lukk oppgave'}" />
            <span class="text">${text}</span>
            <span class="err" hidden></span>
        </span>`;
    }

    async _onToggle(cb) {
        const id = this.getAttribute('task-id');
        if (!id) return;
        const wantDone = !!cb.checked;
        const errEl = this.shadowRoot.querySelector('.err');
        const textEl = this.shadowRoot.querySelector('.text');
        if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
        if (textEl) textEl.classList.add('busy');
        try {
            const resp = await fetch(`/api/tasks/${encodeURIComponent(id)}/close-from-note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ done: wantDone }),
            });
            const data = await resp.json();
            if (!resp.ok || !data.ok) throw new Error(data.error || 'Kunne ikke oppdatere');
            if (_taskCache && _taskCache[id]) _taskCache[id].done = wantDone;
            this.setAttribute('state', wantDone ? 'done' : 'open');
            // Notify any global listeners (open-tasks sidebar, search
            // index, etc.) so they can refresh. Bubbles + composed so
            // it crosses shadow DOM boundaries.
            this.dispatchEvent(new CustomEvent('task-closed', {
                bubbles: true,
                composed: true,
                detail: { taskId: id, done: wantDone },
            }));
        } catch (err) {
            cb.checked = !wantDone;
            if (errEl) { errEl.hidden = false; errEl.textContent = '⚠ ' + (err.message || 'Feil'); }
        } finally {
            if (textEl) textEl.classList.remove('busy');
        }
    }
}

if (!customElements.get('inline-task')) customElements.define('inline-task', InlineTask);
