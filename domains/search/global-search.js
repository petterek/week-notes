/**
 * <global-search> — singleton modal for global search.
 *
 * Renders its own trigger button; clicking opens the modal. Reads
 * ?gs=1 on connect for the editor's Søk button. Modal lives in light
 * DOM so existing #globalSearchModal CSS rules still apply.
 *
 * Public API:
 *   window.openSearch(prefill?) / window.closeSearch()
 *   element.openSearch(prefill?) / element.closeSearch()
 *   window.__openGlobalSearch / window.__closeGlobalSearch (legacy)
 * Events (cancelable, bubbling):
 *   search:open, search:close
 */
import { WNElement, html, escapeHtml } from './_shared.js';
import './note-card.js';

function decodeFile(enc) { try { return decodeURIComponent(enc); } catch { return enc; } }

function highlight(escaped, q) {
    if (!q) return escaped;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return escaped.replace(re, '<mark>$1</mark>');
}

const TYPE_META = {
    note:    { icon: '📝', label: 'Notater' },
    task:    { icon: '✅', label: 'Oppgaver' },
    meeting: { icon: '📅', label: 'Møter' },
    person:  { icon: '👤', label: 'Personer' },
    result:  { icon: '🏁', label: 'Resultater' },
};
const ORDER = ['note', 'task', 'meeting', 'person', 'result'];

const STYLE_ID = 'global-search-styles';
function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        global-search { display: inline-block; }
        global-search .gs-trigger { display: inline-flex; align-items: center; gap: 6px; background: var(--surface-alt); border: 1px solid var(--border); color: var(--text-muted-warm); font: inherit; font-size: 0.9em; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
        global-search .gs-trigger:hover { background: var(--surface-alt); color: var(--accent); }
        global-search .gs-trigger .gs-trigger-kbd { font-family: var(--font-mono); font-size: 0.78em; background: var(--bg); border: 1px solid var(--border-soft); border-radius: 3px; padding: 1px 5px; opacity: 0.85; }
        global-search .page-modal { display: none; position: fixed; inset: 0; background: var(--overlay); z-index: 1000; align-items: center; justify-content: center; }
        global-search .gs-card { background: var(--bg); border: 1px solid var(--border-soft); border-radius: 10px; padding: 18px 20px; width: min(720px, 92vw); max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px var(--shadow); }
        global-search .gs-input-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        global-search .gs-mode { display: inline-flex; align-items: center; gap: 4px; font-size: 0.85em; color: var(--text-muted); cursor: pointer; user-select: none; white-space: nowrap; }
        global-search .gs-mode input { margin: 0; }
        global-search .gs-input { flex: 1; font-size: 1.05em; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-strong); outline: none; }
        global-search .gs-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent); }
        global-search .gs-close { background: none; border: none; font-size: 1.3em; cursor: pointer; color: var(--text-muted); }
        global-search .gs-results { overflow-y: auto; flex: 1; padding-right: 4px; }
        global-search .gs-hint { color: var(--text-subtle); font-size: 0.8em; margin-top: 6px; }
        global-search .search-result { padding: 12px 18px; margin: 8px 0; background: var(--surface); border-radius: 8px; border-left: 4px solid var(--accent); cursor: pointer; }
        global-search .search-result:hover { background: var(--surface-alt); }
        global-search .search-result .sr-title { font-weight: 600; color: var(--text-strong); }
        global-search .search-result .sr-path { font-size: 0.85em; color: var(--text-muted); }
        global-search .search-result .sr-snippet { font-size: 0.9em; color: var(--text-muted); margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
        global-search .search-result mark { background: var(--highlight); padding: 1px 2px; border-radius: 2px; }
        global-search .sr-group { margin: 18px 0 6px; font-size: 0.95em; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--border-soft); padding-bottom: 4px; }
        global-search .sr-group .sr-count { color: var(--text-subtle); font-weight: 400; font-size: 0.9em; margin-left: 6px; }
    `;
    document.head.appendChild(style);
}

class GlobalSearch extends WNElement {
    static get domain() { return 'search'; }
    // No observed attributes, no CSS (light DOM styling)
    css() { return ''; }

    render() {
        // Light-DOM exception: the trigger button + modal markup is set imperatively
        // in connectedCallback as light-DOM children. Expose them via a slot so the
        // (mandatory) shadow root doesn't hide them.
        return html`<slot></slot>`;
    }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        ensureStyles();

        this.innerHTML = `
            <button type="button" class="gs-trigger" title="Søk" aria-label="Søk">
                <span aria-hidden="true">🔍</span>
                <span class="gs-trigger-label">Søk</span>
            </button>
            <div id="globalSearchModal" class="page-modal">
                <div class="gs-card">
                    <div class="gs-input-row">
                        <input id="gsInput" class="gs-input" type="text"
                            placeholder="Søk i notater, oppgaver, møter, personer, resultater…"
                            autocomplete="off" />
                        <label class="gs-mode" title="Bruk semantisk søk (vektor-embeddings)">
                            <input id="gsEmbed" type="checkbox" />
                            <span>🧠 semantisk</span>
                        </label>
                        <button class="gs-close" title="Lukk (Esc)" type="button">✕</button>
                    </div>
                    <div id="gsResults" class="gs-results"></div>
                    <div class="gs-hint">↵ åpne første · Esc lukk</div>
                </div>
            </div>
        `;

        const trigger = this.querySelector('.gs-trigger');
        const modal = this.querySelector('#globalSearchModal');
        const input = this.querySelector('#gsInput');
        const embedToggle = this.querySelector('#gsEmbed');
        const resultsEl = this.querySelector('#gsResults');
        const closeBtn = this.querySelector('.gs-close');

        try { embedToggle.checked = localStorage.getItem('gs.embed') === '1'; } catch {}

        let debounceTimer = null;
        let lastQuery = '';

        const render = (data, q) => {
            if (!data || data.length === 0) {
                resultsEl.innerHTML = `<p style="color:var(--text-muted);font-style:italic">Ingen treff for «${escapeHtml(q)}»</p>`;
                return;
            }
            const groups = {};
            data.forEach(r => { (groups[r.type] = groups[r.type] || []).push(r); });
            let markup = `<p style="color:var(--text-muted);font-size:0.9em;margin:0 0 8px">${data.length} treff · `
                + ORDER.filter(t => groups[t]).map(t => TYPE_META[t].icon + ' ' + groups[t].length).join(' · ')
                + '</p>';
            ORDER.forEach(t => {
                if (!groups[t]) return;
                const meta = TYPE_META[t];
                markup += `<h3 class="sr-group">${meta.icon} ${meta.label} <span class="sr-count">${groups[t].length}</span></h3>`;
                if (t === 'note') {
                    markup += groups[t].map((r, i) => {
                        const ident = r.identifier == null ? '' : String(r.identifier);
                        return `<note-card class="search-result" data-type="note" data-identifier="${escapeHtml(ident)}" data-idx="${i}"></note-card>`;
                    }).join('');
                } else {
                    markup += groups[t].map(r => {
                        const snippet = r.snippet ? highlight(escapeHtml(r.snippet), q) : '';
                        const ident = r.identifier == null ? '' : String(r.identifier);
                        return `<a href="${r.href}" class="search-result"`
                            + ` data-type="${escapeHtml(r.type)}"`
                            + ` data-identifier="${escapeHtml(ident)}"`
                            + ` style="display:block;text-decoration:none">`
                            + `<div class="sr-title">${highlight(escapeHtml(r.title || ''), q)}</div>`
                            + (r.subtitle ? `<div class="sr-path">${highlight(escapeHtml(r.subtitle), q)}</div>` : '')
                            + (snippet ? `<div class="sr-snippet">${snippet}</div>` : '')
                            + '</a>';
                    }).join('');
                }
            });
            resultsEl.innerHTML = markup;

            // Hydrate note-card elements with data after innerHTML replace.
            if (groups.note) {
                const cards = resultsEl.querySelectorAll('note-card[data-type="note"]');
                cards.forEach((card, i) => {
                    const r = groups.note[i];
                    if (!r) return;
                    const ident = String(r.identifier || '');
                    const slash = ident.indexOf('/');
                    if (slash < 0) return;
                    const week = ident.slice(0, slash);
                    const file = decodeFile(ident.slice(slash + 1));
                    const name = r.title || file.replace(/\.md$/, '');
                    const snippet = r.snippet ? highlight(escapeHtml(r.snippet), q) : '';
                    card.setData({ week, file, name, type: 'note', snippet });
                });
            }
        };

        const doSearch = (q) => {
            lastQuery = q;
            if (!q) { resultsEl.innerHTML = ''; return; }
            const svc = this.service;
            const useEmbed = !!embedToggle.checked;
            const fn = useEmbed ? svc && svc.embedSearch : svc && svc.search;
            if (!svc || typeof fn !== 'function') {
                resultsEl.innerHTML = '<p style="color:var(--danger)">Søketjeneste ikke koblet til</p>';
                return;
            }
            Promise.resolve(fn.call(svc, q))
                .then(data => {
                    if (lastQuery !== q) return;
                    render(Array.isArray(data) ? data : [], q);
                })
                .catch(() => { resultsEl.innerHTML = '<p style="color:var(--danger)">Søkefeil</p>'; });
        };

        embedToggle.addEventListener('change', () => {
            try { localStorage.setItem('gs.embed', embedToggle.checked ? '1' : '0'); } catch {}
            const q = input.value.trim();
            if (q) doSearch(q);
        });

        const open = (prefill) => {
            const evt = new CustomEvent('search:open', { bubbles: true, cancelable: true, detail: { prefill } });
            if (!this.dispatchEvent(evt)) return;
            modal.style.display = 'flex';
            if (typeof prefill === 'string') input.value = prefill;
            setTimeout(() => { input.focus(); input.select(); }, 0);
            const q = input.value.trim();
            if (q && q !== lastQuery) doSearch(q);
        };
        const close = () => {
            const evt = new CustomEvent('search:close', { bubbles: true, cancelable: true });
            if (!this.dispatchEvent(evt)) return;
            modal.style.display = 'none';
        };

        // Backward-compat globals + new public API.
        window.__openGlobalSearch = open;
        window.__closeGlobalSearch = close;
        window.openSearch = open;
        window.closeSearch = close;
        this.openSearch = open;
        this.closeSearch = close;

        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        closeBtn.addEventListener('click', close);

        trigger.addEventListener('click', (e) => { e.preventDefault(); open(); });

        // Back-compat: if a legacy #navSearchBtn exists somewhere, still wire it.
        const navBtn = document.getElementById('navSearchBtn');
        if (navBtn) navBtn.addEventListener('click', (e) => { e.preventDefault(); open(); });

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = input.value.trim();
            if (!q) { resultsEl.innerHTML = ''; lastQuery = ''; return; }
            debounceTimer = setTimeout(() => doSearch(q), 200);
        });

        const fireSelected = (a, originalEvent) => {
            const type = a.dataset.type || '';
            const identifier = a.dataset.identifier || '';
            if (originalEvent) originalEvent.preventDefault();
            if (!type) return;
            this.dispatchEvent(new CustomEvent('element-selected', {
                bubbles: true, cancelable: true,
                detail: { type, identifier },
            }));
            close();
        };

        // Click on a result: emit event only — no navigation.
        resultsEl.addEventListener('click', (e) => {
            const a = e.target.closest('a.search-result');
            if (!a || !resultsEl.contains(a)) return;
            fireSelected(a, e);
        });

        // <note-card> events (from note results). 'view' → element-selected.
        // 'edit' has a real <a href="/editor/..."> — let it navigate, but close modal.
        // 'delete' → suppress in search context.
        resultsEl.addEventListener('view', (e) => {
            const card = e.target.closest('note-card.search-result');
            if (!card) return;
            const fp = (e.detail && e.detail.filePath) || card.dataset.identifier || '';
            e.preventDefault();
            this.dispatchEvent(new CustomEvent('element-selected', {
                bubbles: true, cancelable: true,
                detail: { type: 'note', identifier: fp },
            }));
            close();
        });
        resultsEl.addEventListener('edit', () => { close(); });
        resultsEl.addEventListener('delete', (e) => { e.preventDefault(); });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const firstNote = resultsEl.querySelector('note-card.search-result');
                const firstLink = resultsEl.querySelector('a.search-result');
                const first = firstNote || firstLink;
                if (first) {
                    e.preventDefault();
                    if (first.tagName === 'NOTE-CARD') {
                        const fp = first.dataset.identifier || '';
                        this.dispatchEvent(new CustomEvent('element-selected', {
                            bubbles: true, cancelable: true,
                            detail: { type: 'note', identifier: fp },
                        }));
                        close();
                    } else {
                        fireSelected(first, null);
                    }
                }
            } else if (e.key === 'Escape') {
                e.preventDefault(); close();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                e.preventDefault(); close(); return;
            }
        });

        // Auto-open via ?gs=1 (e.g. from editor's Søk button).
        try {
            const sp = new URLSearchParams(window.location.search);
            if (sp.get('gs') === '1') {
                open();
                sp.delete('gs');
                const qs = sp.toString();
                history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
            }
        } catch (_) {}
    }
}

if (!customElements.get('global-search')) customElements.define('global-search', GlobalSearch);
