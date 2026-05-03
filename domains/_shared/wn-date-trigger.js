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

export function attachDateTrigger(el) {
    if (!el || el.__wnDateAttached) return { destroy() {} };
    el.__wnDateAttached = true;

    let popup = null;
    let outsideHandler = null;

    function openPicker(mode) {
        closePicker();
        const start = el.selectionStart != null ? el.selectionStart : el.value.length;
        const end = el.selectionEnd != null ? el.selectionEnd : start;

        const picker = document.createElement('date-time-picker');
        picker.setAttribute('mode', mode);
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
