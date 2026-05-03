/**
 * wn-autocomplete — reusable caret-anchored autocomplete for textarea/input.
 *
 * Usage:
 *   import { attachAutocomplete } from '/components/wn-autocomplete.js';
 *
 *   const ac = attachAutocomplete(textareaEl, {
 *       triggers: [{
 *           // detect: inspect text+caret, return null to opt out, or
 *           // { query, start, end, kind? } to open the dropdown.
 *           detect(text, caret) { ... },
 *
 *           // fetchItems: return an array (or Promise of) of items.
 *           // Each item: { value, label, hint?, ...anything else }
 *           // 'value' is the literal that gets inserted, 'label' the
 *           // visible text. Items are filtered by the 'matches' helper
 *           // by default but you can pre-filter here too.
 *           async fetchItems(query, ctx) { ... },
 *
 *           // onSelect: called when the user picks an item. Default is
 *           // to replace the matched range with item.value + ' '.
 *           onSelect(item, ctx) { ... },
 *
 *           // optional: override how each row is rendered.
 *           renderItem(item, query) { ... html },
 *
 *           // optional: 'starts' (default) | 'words' | 'substring'.
 *           // Pre-built filter strategies for fetchItems output.
 *           filter: 'starts',
 *
 *           // optional: cap the number of rows shown.
 *           limit: 8,
 *       }],
 *       container: ShadowRoot | HTMLElement, // where to mount the popover
 *                                             // (defaults to document.body)
 *   });
 *
 *   // ac.destroy() removes listeners and the popover.
 */

const POP_STYLE = `
    position: fixed; z-index: 1000;
    background: var(--surface, #fff);
    color: var(--text, #2d3748);
    border: 1px solid var(--border, #ccc);
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.14);
    max-height: 240px; overflow: auto;
    padding: 4px 0; min-width: 180px;
    font: inherit;
`;
const ROW_STYLE = `
    display: block; width: 100%; text-align: left;
    border: 0; background: transparent; color: inherit;
    padding: 5px 12px; cursor: pointer; font: inherit;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
`;
const ROW_ACTIVE_BG = 'var(--accent-soft, #e7f1fb)';
const ROW_ACTIVE_FG = 'var(--accent, #06c)';

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Wraps every occurrence of any whitespace-separated word from `query`
// inside `text` with <mark>. Used by the default renderItem so multi-word
// search ("buy milk") highlights all hits.
export function highlightMatch(text, query) {
    const safe = escapeHtml(text || '');
    const words = String(query || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return safe;
    const pattern = new RegExp('(' + words.map(escapeRegExp).join('|') + ')', 'gi');
    return safe.replace(pattern, '<mark>$1</mark>');
}

// Built-in filters keyed by the trigger's `filter` option.
const FILTERS = {
    starts: (items, query) => {
        const q = query.toLowerCase();
        return items.filter(it => String(it.label || it.value || '').toLowerCase().startsWith(q));
    },
    substring: (items, query) => {
        const q = query.toLowerCase();
        return items.filter(it => String(it.label || it.value || '').toLowerCase().includes(q));
    },
    words: (items, query) => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return items;
        return items.filter(it => {
            const hay = String(it.label || it.value || '').toLowerCase();
            return words.every(w => hay.includes(w));
        });
    },
};

function defaultRenderItem(item, query) {
    const label = item.label != null ? item.label : item.value;
    const hint = item.hint
        ? `<span style="opacity:0.55;font-size:0.85em;margin-left:8px">${escapeHtml(item.hint)}</span>`
        : '';
    return highlightMatch(String(label || ''), query) + hint;
}

// Mirror-div caret coordinate measurement. Builds an off-screen div that
// mirrors the textarea's typography and inserts a marker span at the caret.
function caretCoords(ta) {
    const cs = getComputedStyle(ta);
    const div = document.createElement('div');
    const props = ['boxSizing','width','height','overflowX','overflowY','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','paddingTop','paddingRight','paddingBottom','paddingLeft','fontStyle','fontVariant','fontWeight','fontStretch','fontSize','fontSizeAdjust','lineHeight','fontFamily','textAlign','textTransform','textIndent','letterSpacing','wordSpacing','tabSize','MozTabSize','whiteSpace','wordWrap'];
    for (const p of props) div.style[p] = cs[p];
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.top = '0'; div.style.left = '-9999px';
    const caret = ta.selectionStart;
    div.textContent = ta.value.substring(0, caret);
    const span = document.createElement('span');
    span.textContent = ta.value.substring(caret) || '.';
    div.appendChild(span);
    document.body.appendChild(div);
    const rect = { left: span.offsetLeft - ta.scrollLeft, top: span.offsetTop - ta.scrollTop, height: parseFloat(cs.lineHeight) || 18 };
    document.body.removeChild(div);
    return rect;
}

// Replace the [start, end) range in the textarea with `replacement`,
// move caret to end of replacement, and dispatch 'input' so listeners
// (preview, dirty marker, …) react.
export function replaceRange(ta, start, end, replacement) {
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    ta.value = before + replacement + after;
    const caret = before.length + replacement.length;
    try { ta.setSelectionRange(caret, caret); } catch (_) {}
    ta.dispatchEvent(new Event('input', { bubbles: true }));
}

export function attachAutocomplete(target, config) {
    if (!target || !config || !Array.isArray(config.triggers) || !config.triggers.length) {
        return { destroy() {} };
    }
    const triggers = config.triggers;
    const container = config.container || document.body;

    const pop = document.createElement('div');
    pop.setAttribute('role', 'listbox');
    pop.style.cssText = POP_STYLE;
    pop.hidden = true;
    container.appendChild(pop);

    let activeIdx = -1;
    let currentItems = [];
    let currentQuery = '';
    let currentRange = null; // {start, end}
    let currentTrigger = null;
    let currentExtra = null; // any extras returned by detect (e.g. kind)
    // Async-race guard: each open() bumps the token; stale fetches that
    // resolve afterwards are discarded.
    let openToken = 0;

    function close() {
        pop.hidden = true;
        pop.innerHTML = '';
        activeIdx = -1;
        currentItems = [];
        currentRange = null;
        currentTrigger = null;
        currentExtra = null;
        openToken++;
    }

    function setActive(idx) {
        activeIdx = idx;
        const rows = pop.querySelectorAll('button[data-idx]');
        rows.forEach((el, i) => {
            const on = i === idx;
            el.style.background = on ? ROW_ACTIVE_BG : 'transparent';
            el.style.color = on ? ROW_ACTIVE_FG : 'inherit';
            el.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) el.scrollIntoView({ block: 'nearest' });
        });
    }

    function renderItems() {
        if (!currentItems.length) { close(); return; }
        const renderItem = currentTrigger.renderItem || defaultRenderItem;
        pop.innerHTML = currentItems.map((it, i) => `
            <button type="button" data-idx="${i}" role="option" style="${ROW_STYLE}">${renderItem(it, currentQuery)}</button>
        `).join('');
        pop.hidden = false;
        if (activeIdx < 0 || activeIdx >= currentItems.length) activeIdx = 0;
        setActive(activeIdx);
        position();
    }

    function position() {
        const pos = caretCoords(target);
        const r = target.getBoundingClientRect();
        let top = r.top + pos.top + pos.height + 2;
        let left = r.left + pos.left + 2;
        // Render once to measure, then nudge if it would overflow.
        const dd = pop.getBoundingClientRect();
        const vh = window.innerHeight, vw = window.innerWidth;
        if (top + dd.height > vh - 8) {
            top = Math.max(8, r.top + pos.top - dd.height - 4);
        }
        if (left + dd.width > vw - 8) {
            left = Math.max(8, vw - dd.width - 8);
        }
        pop.style.top = top + 'px';
        pop.style.left = left + 'px';
    }

    function defaultAccept(item) {
        if (!currentRange) return;
        const value = item.value != null ? item.value : item.label;
        replaceRange(target, currentRange.start, currentRange.end, String(value) + ' ');
    }

    function pick(item) {
        if (!item || !currentTrigger) { close(); return; }
        const ctx = {
            textarea: target,
            range: currentRange,
            query: currentQuery,
            extra: currentExtra,
        };
        try {
            if (typeof currentTrigger.onSelect === 'function') {
                currentTrigger.onSelect(item, ctx);
            } else {
                defaultAccept(item);
            }
        } catch (e) { console.error('autocomplete onSelect failed', e); }
        close();
        target.focus();
    }

    function detectAny(opts) {
        if (target.selectionStart !== target.selectionEnd) return null;
        const value = target.value;
        const caret = target.selectionStart;
        for (const trig of triggers) {
            let det;
            try { det = trig.detect(value, caret, opts || {}); } catch (_) { det = null; }
            if (det && det.start != null && det.end != null) return { trig, det };
        }
        return null;
    }

    async function update(opts) {
        if (target.selectionStart !== target.selectionEnd) { close(); return; }
        const value = target.value;
        const caret = target.selectionStart;
        for (const trig of triggers) {
            let det;
            try { det = trig.detect(value, caret, opts || {}); } catch (_) { det = null; }
            if (!det) continue;
            const { query, start, end } = det;
            if (start == null || end == null) continue;
            const token = ++openToken;
            currentTrigger = trig;
            currentRange = { start, end };
            currentQuery = String(query || '');
            currentExtra = det.extra != null ? det.extra : null;
            let items;
            try {
                items = await trig.fetchItems(currentQuery, { textarea: target, range: currentRange, extra: currentExtra });
            } catch (e) { items = []; }
            // A newer open() superseded us — bail.
            if (token !== openToken) return;
            items = items || [];
            const filterName = trig.filter || 'starts';
            const filterFn = (typeof trig.filter === 'function') ? trig.filter : FILTERS[filterName];
            if (filterFn && currentQuery) items = filterFn(items, currentQuery);
            if (typeof trig.limit === 'number' && trig.limit > 0) items = items.slice(0, trig.limit);
            currentItems = items;
            if (!currentItems.length) { close(); return; }
            renderItems();
            return;
        }
        close();
    }

    function onInput()   { update(); }
    function onClick()   { update(); }
    function onKeyup(e)  {
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(e.key)) return;
        update();
    }
    function onBlur()    { setTimeout(close, 150); }

    function onKeydown(e) {
        if (pop.hidden) {
            // Tab right after a trigger prefix opens the dropdown unfiltered.
            if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (detectAny({ force: true })) {
                    e.preventDefault();
                    update({ force: true });
                }
            }
            return;
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIdx + 1, currentItems.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)); }
        else if (e.key === 'Enter' || e.key === 'Tab') {
            if (activeIdx >= 0 && currentItems[activeIdx]) {
                e.preventDefault(); e.stopPropagation();
                pick(currentItems[activeIdx]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    }

    function onPopMousedown(e) {
        const btn = e.target.closest('button[data-idx]');
        if (!btn) return;
        e.preventDefault();
        const i = Number(btn.dataset.idx);
        if (Number.isInteger(i)) pick(currentItems[i]);
    }

    function onPopMouseover(e) {
        const btn = e.target.closest('button[data-idx]');
        if (!btn) return;
        const i = Number(btn.dataset.idx);
        if (Number.isInteger(i)) setActive(i);
    }

    function onDocumentMousedown(e) {
        if (pop.hidden) return;
        if (pop.contains(e.target) || e.target === target) return;
        close();
    }

    target.addEventListener('input', onInput);
    target.addEventListener('click', onClick);
    target.addEventListener('keyup', onKeyup);
    target.addEventListener('keydown', onKeydown);
    target.addEventListener('blur', onBlur);
    pop.addEventListener('mousedown', onPopMousedown);
    pop.addEventListener('mouseover', onPopMouseover);
    document.addEventListener('mousedown', onDocumentMousedown, true);

    return {
        close,
        update,
        destroy() {
            target.removeEventListener('input', onInput);
            target.removeEventListener('click', onClick);
            target.removeEventListener('keyup', onKeyup);
            target.removeEventListener('keydown', onKeydown);
            target.removeEventListener('blur', onBlur);
            document.removeEventListener('mousedown', onDocumentMousedown, true);
            try { pop.remove(); } catch (_) {}
        },
    };
}
