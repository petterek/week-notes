/**
 * <ctx-switcher context_service="…"> — workspace/context dropdown.
 *
 * Self-contained shadow-DOM component. Fetches the context list via
 * `service.list()` and renders its own trigger button + menu. No light-DOM
 * children are read.
 *
 * Service contract:
 *   list()                     → Promise<Array | { active, contexts }>
 *                                Each context: { id, active?, name?, icon?,
 *                                settings?: { name, icon } }
 *   switchTo(id)               → Promise<{ ok, error? }>
 *   commit(id, { message })    → Promise<{ ok, committed?, error? }>
 *
 * Events (cancelable, bubbling, composed):
 *   context-selected  { id, result }
 *   context-commit    { id, result }
 */
import { WNElement, html, unsafeHTML } from './_shared.js';

const STYLES = `
    :host { display: inline-block; position: relative; font: inherit; }
    .ctx-trigger {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 10px;
        font: inherit; color: var(--text);
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 4px; cursor: pointer;
    }
    .ctx-trigger:hover { background: var(--surface-alt); }
    .ctx-icon { font-size: 1.05em; line-height: 1; }
    .ctx-name { font-weight: 600; }
    .ctx-caret { color: var(--text-muted); font-size: 0.8em; }
    .ctx-menu {
        display: none; position: absolute; top: calc(100% + 4px); left: 0;
        min-width: 240px;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 6px; padding: 4px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        z-index: 1000;
    }
    :host(.open) .ctx-menu { display: block; }
    .ctx-item {
        display: flex; align-items: center; gap: 10px;
        width: 100%; padding: 7px 10px;
        font: inherit; color: var(--text); text-align: left; text-decoration: none;
        background: none; border: none; border-radius: 4px; cursor: pointer;
        box-sizing: border-box;
    }
    .ctx-item:hover { background: var(--surface-alt); }
    .ctx-item.active { color: var(--accent); font-weight: 600; background: var(--accent-soft); }
    .ctx-item.active:hover { background: var(--accent-soft); filter: brightness(0.96); }
    .ctx-item .ctx-icon { width: 1.2em; text-align: center; }
    .ctx-sep { height: 1px; background: var(--border-soft, var(--border)); margin: 4px 0; }
    .ctx-empty { padding: 8px 10px; color: var(--text-muted); font-style: italic; font-size: 0.9em; }
`;

function normalize(data) {
    if (!data) return { active: null, contexts: [] };
    if (Array.isArray(data)) {
        const active = (data.find(c => c.active) || {}).id || null;
        return { active, contexts: data };
    }
    return { active: data.active || null, contexts: data.contexts || [] };
}

function ctxLabel(c) {
    return (c.settings && c.settings.name) || c.name || c.id;
}
function ctxIcon(c) {
    return (c.settings && c.settings.icon) || c.icon || '📁';
}

class CtxSwitcher extends WNElement {
    static get domain() { return 'context'; }
    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (!this._docWired) {
            this._docWired = true;
            this._onDocClick = (e) => {
                if (!this.contains(e.target)) this.classList.remove('open');
            };
            this._onKey = (e) => {
                if (e.key === 'Escape') this.classList.remove('open');
            };
            document.addEventListener('click', this._onDocClick);
            document.addEventListener('keydown', this._onKey);
        }
        if (!this._wired) {
            this._wired = true;
            this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
        }
        this._load();
    }

    disconnectedCallback() {
        if (this._onDocClick) document.removeEventListener('click', this._onDocClick);
        if (this._onKey) document.removeEventListener('keydown', this._onKey);
        this._docWired = false;
    }

    async _load() {
        if (!this.service || typeof this.service.list !== 'function') {
            this._state = { error: 'no-service' };
            this.requestRender();
            return;
        }
        try {
            const data = await this.service.list();
            this._state = normalize(data);
        } catch (e) {
            this._state = { error: e.message || String(e) };
        }
        this.requestRender();
    }

    render() {
        const s = this._state;
        if (!s) {
            return html`<button class="ctx-trigger" type="button" disabled>
                <span class="ctx-icon">⏳</span><span class="ctx-name">Laster…</span>
            </button>`;
        }
        if (s.error) {
            return html`<button class="ctx-trigger" type="button" disabled title="${s.error}">
                <span class="ctx-icon">⚠️</span><span class="ctx-name">Ingen kontekst</span>
            </button>`;
        }
        const active = s.contexts.find(c => c.id === s.active) || null;
        const trigger = active
            ? html`<button class="ctx-trigger" type="button" data-act="toggle" title="Bytt kontekst">
                <span class="ctx-icon">${ctxIcon(active)}</span>
                <span class="ctx-name">${ctxLabel(active)}</span>
                <span class="ctx-caret">▾</span>
            </button>`
            : html`<button class="ctx-trigger" type="button" data-act="toggle" title="Bytt kontekst">
                <span class="ctx-icon">📁</span>
                <span class="ctx-name">Ingen kontekst</span>
                <span class="ctx-caret">▾</span>
            </button>`;

        const items = s.contexts.length
            ? s.contexts.map(c => html`<button type="button" class="ctx-item ${c.id === s.active ? 'active' : ''}" data-act="switch" data-id="${c.id}">
                <span class="ctx-icon">${ctxIcon(c)}</span><span>${ctxLabel(c)}</span>
            </button>`)
            : html`<div class="ctx-empty">Ingen kontekster</div>`;

        const commit = s.active
            ? html`<button type="button" class="ctx-item" data-act="commit" data-id="${s.active}">
                <span class="ctx-icon">💾</span><span>Commit endringer i «${active ? ctxLabel(active) : s.active}»</span>
            </button>`
            : '';

        const sep = ((s.contexts.length || commit) ? unsafeHTML('<div class="ctx-sep"></div>') : '');

        return html`
            ${trigger}
            <div class="ctx-menu">
                ${items}
                ${sep}
                ${commit}
                <a class="ctx-item" href="/settings"><span class="ctx-icon">⚙️</span><span>Administrer kontekster</span></a>
            </div>
        `;
    }

    async _onClick(e) {
        const target = e.composedPath().find(n => n.dataset && n.dataset.act);
        if (!target) return;
        const act = target.dataset.act;
        if (act === 'toggle') {
            e.stopPropagation();
            this.classList.toggle('open');
            return;
        }
        if (act === 'switch') {
            const id = target.dataset.id;
            try {
                const d = await this.service.switchTo(id);
                if (d && d.ok) {
                    // Apply the new context's theme immediately so the page
                    // doesn't flash the old theme while it reloads.
                    try {
                        const ctx = (this._state && this._state.contexts || []).find(c => c.id === id);
                        const theme = ctx && ctx.settings && ctx.settings.theme;
                        const link = document.getElementById('themeStylesheet');
                        if (link && theme) {
                            link.href = '/themes/' + encodeURIComponent(theme) + '.css?ts=' + Date.now();
                        }
                    } catch (_) { /* best effort */ }
                    const evt = new CustomEvent('context-selected', {
                        bubbles: true, composed: true, cancelable: true,
                        detail: { id, result: d },
                    });
                    if (!this.dispatchEvent(evt)) return;
                    location.reload();
                } else {
                    alert(`Kunne ikke bytte kontekst: ${(d && d.error) || 'ukjent feil'}`);
                }
            } catch (err) {
                alert(`Kunne ikke bytte kontekst: ${err.message || err}`);
            }
            return;
        }
        if (act === 'commit') {
            e.stopPropagation();
            const id = target.dataset.id;
            const msg = prompt('Commit-melding (valgfritt):', '');
            if (msg === null) return;
            const original = target.innerHTML;
            target.innerHTML = '<span class="ctx-icon">⏳</span><span>Committer…</span>';
            try {
                const d = await this.service.commit(id, { message: msg });
                if (d && d.ok) {
                    target.innerHTML = d.committed
                        ? '<span class="ctx-icon">✓</span><span>Committet</span>'
                        : '<span class="ctx-icon">·</span><span>Ingen endringer</span>';
                    const evt = new CustomEvent('context-commit', {
                        bubbles: true, composed: true, cancelable: true,
                        detail: { id, result: d },
                    });
                    this.dispatchEvent(evt);
                    setTimeout(() => { this.classList.remove('open'); target.innerHTML = original; }, 1200);
                } else {
                    target.innerHTML = `<span class="ctx-icon">✗</span><span>${(d && d.error) || 'feil'}</span>`;
                }
            } catch (err) {
                target.innerHTML = `<span class="ctx-icon">✗</span><span>${err.message || err}</span>`;
            }
        }
    }
}

if (!customElements.get('ctx-switcher')) customElements.define('ctx-switcher', CtxSwitcher);
