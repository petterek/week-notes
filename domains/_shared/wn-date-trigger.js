/**
 * wn-date-trigger — Ctrl+D / Ctrl+Shift+D date picker for textarea/input.
 *
 *   Ctrl+D       → opens <date-time-picker mode="date"> popup (defaults to today).
 *                  Inserts `YYYY-MM-DD` at the caret on confirm.
 *   Ctrl+Shift+D → opens <date-time-picker mode="datetime"> popup (defaults to now).
 *                  Inserts `YYYY-MM-DD HH:MM` at the caret on confirm.
 *
 * Usage:
 *   import { attachDateTrigger } from '/components/wn-date-trigger.js';
 *   const handle = attachDateTrigger(textareaEl);
 *   handle.destroy();
 *
 * Notes:
 *   - The popup is appended to document.body so it overlays shadow DOMs.
 *   - If text is selected when the shortcut fires, the selection is
 *     replaced by the formatted value.
 *   - Esc / "Avbryt" / clicking outside cancels; Enter or "OK" commits.
 */
import '/components/date-time-picker.js';

// Scan around the caret for a YYYY-MM-DD (or YYYY-MM-DD HH:MM) and return
// {start, end, value} if found. In datetime mode prefer a match that
// includes the time; in date mode the time, if present, is dropped.
function findDateAround(text, caretStart, caretEnd, mode) {
    if (!text) return null;
    const dateRe = /\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?\b/g;
    let m;
    while ((m = dateRe.exec(text)) !== null) {
        const s = m.index;
        const e = s + m[0].length;
        // Caret may sit just after the match (cursor after "2026-05-06|").
        if (caretStart >= s && caretEnd <= e + 1 && caretStart <= e) {
            const raw = m[0].replace('T', ' ');
            const value = mode === 'datetime' ? raw : raw.slice(0, 10);
            return { start: s, end: e, value };
        }
        if (s > caretEnd) break;
    }
    return null;
}

export function attachDateTrigger(el) {
    if (!el || el.__wnDateAttached) return { destroy() {} };
    el.__wnDateAttached = true;

    let popup = null;
    let outsideHandler = null;

    function openPicker(mode) {
        closePicker();
        let start = el.selectionStart != null ? el.selectionStart : el.value.length;
        let end = el.selectionEnd != null ? el.selectionEnd : start;

        // If the caret/selection touches an existing date (or datetime) in
        // the text, expand the range to cover it and pre-select that value
        // in the picker — pressing Ctrl+D again on the date will round-trip.
        const hit = findDateAround(el.value, start, end, mode);
        let initialValue = '';
        if (hit) { start = hit.start; end = hit.end; initialValue = hit.value; }

        const picker = document.createElement('date-time-picker');
        picker.setAttribute('mode', mode);
        if (initialValue) picker.setAttribute('value', initialValue);
        const rect = el.getBoundingClientRect();

        // Place the popup off-screen first to measure, then anchor near
        // the field once we know its size.
        picker.style.cssText = 'position:fixed;z-index:9999;visibility:hidden;left:-9999px;top:0';
        document.body.appendChild(picker);

        // Measure after it has rendered.
        requestAnimationFrame(() => {
            const pr = picker.getBoundingClientRect();
            const top = Math.min(window.innerHeight - pr.height - 8,
                                 Math.max(8, rect.top + 24));
            const left = Math.min(window.innerWidth - pr.width - 8,
                                  Math.max(8, rect.left + 8));
            picker.style.cssText = 'position:fixed;z-index:9999;visibility:visible;'
                + 'top:' + top + 'px;left:' + left + 'px';
        });

        picker.addEventListener('datetime-selected', (e) => {
            insertValue(start, end, e.detail.value);
        });
        picker.addEventListener('dateweek-selected', (e) => {
            const v = String(e.detail.value || '');
            const m = v.match(/^(\d{4})-W(\d{2})$/);
            const text = m ? `Uke ${m[2]}, ${m[1]}` : v;
            insertValue(start, end, text);
        });
        picker.addEventListener('datetime-cancelled', () => {
            closePicker();
            el.focus();
        });

        // Hand keyboard control to the picker — installs a document-level
        // keydown listener that the picker tears down on commit/cancel.
        picker.focus();

        outsideHandler = (e) => {
            if (popup && !popup.contains(e.target) && e.target !== el && !el.contains(e.target)) {
                closePicker();
            }
        };
        // Use capture so we close before any other handler swallows the event.
        setTimeout(() => document.addEventListener('mousedown', outsideHandler, true), 0);

        popup = picker;
    }

    function insertValue(start, end, str) {
        const val = el.value;
        const before = val.slice(0, start);
        const after = val.slice(end);
        el.value = before + str + after;
        const np = before.length + str.length;
        try { el.selectionStart = el.selectionEnd = np; } catch (_) {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
        closePicker();
        el.focus();
    }

    function closePicker() {
        if (popup) { popup.remove(); popup = null; }
        if (outsideHandler) {
            document.removeEventListener('mousedown', outsideHandler, true);
            outsideHandler = null;
        }
    }

    function onKeydown(e) {
        if (!e.ctrlKey || e.altKey || e.metaKey) return;
        if ((e.key || '').toLowerCase() !== 'd') return;
        e.preventDefault();
        e.stopPropagation();
        openPicker(e.shiftKey ? 'datetime' : 'date');
    }

    el.addEventListener('keydown', onKeydown);

    return {
        destroy() {
            el.removeEventListener('keydown', onKeydown);
            closePicker();
            el.__wnDateAttached = false;
        },
    };
}

export default attachDateTrigger;
