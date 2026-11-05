import '/components/date-time-picker.js';

export function attachMeetingShortcut(textarea) {
    let popup = null;
    let datePicker = null;
    let outsideHandler = null;

    const close = () => {
        if (datePicker) { datePicker.remove(); datePicker = null; }
        if (popup) { popup.remove(); popup = null; }
        if (outsideHandler) {
            document.removeEventListener('mousedown', outsideHandler, true);
            outsideHandler = null;
        }
    };

    const onKeydown = event => {
        if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'm') return;
        event.preventDefault();
        event.stopPropagation();
        if (popup) { close(); return; }

        const insertAt = textarea.selectionStart ?? textarea.value.length;
        const today = new Date();
        const pad = number => String(number).padStart(2, '0');
        let date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        let start = '09:00';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;z-index:9999;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:6px;min-width:260px;font-size:0.9em';
        wrap.innerHTML = `
            <div style="font-size:0.8em;color:var(--text-muted)">Nytt møte</div>
            <button type="button" class="m-when" style="text-align:left;padding:4px 8px;border:1px solid var(--border-soft);border-radius:4px;background:var(--surface);color:var(--text)">📅 ${date} ${start}</button>
            <input class="m-title" type="text" placeholder="Tittel" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)">
            <select class="m-duration" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)">
                <option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option>
                <option value="60" selected>60 min</option><option value="90">90 min</option><option value="120">2 t</option>
            </select>
            <div style="display:flex;justify-content:flex-end;gap:6px">
                <button type="button" class="m-cancel">Avbryt</button><button type="button" class="m-insert">Sett inn</button>
            </div>`;
        const rect = textarea.getBoundingClientRect();
        wrap.style.left = `${Math.min(window.innerWidth - 280, Math.max(8, rect.left + 16))}px`;
        wrap.style.top = `${Math.min(window.innerHeight - 220, Math.max(8, rect.top + 40))}px`;
        document.body.appendChild(wrap);
        popup = wrap;

        const whenButton = wrap.querySelector('.m-when');
        const titleInput = wrap.querySelector('.m-title');
        const formatWhen = () => {
            const months = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
            const [, year, month, day] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
            whenButton.textContent = `📅 ${year ? `${Number(day)}. ${months[Number(month) - 1]}` : date} ${start}`;
        };
        const openDatePicker = () => {
            if (datePicker) { datePicker.remove(); datePicker = null; }
            const picker = document.createElement('date-time-picker');
            picker.setAttribute('mode', 'datetime');
            picker.setAttribute('value', `${date} ${start}`);
            picker.style.cssText = 'position:fixed;z-index:10000;visibility:hidden;left:-9999px;top:0';
            document.body.appendChild(picker);
            requestAnimationFrame(() => {
                if (!picker.isConnected || popup !== wrap) return;
                const pickerRect = picker.getBoundingClientRect();
                const wrapRect = wrap.getBoundingClientRect();
                picker.style.cssText = `position:fixed;z-index:10000;top:${Math.max(8, Math.min(window.innerHeight - pickerRect.height - 8, wrapRect.bottom + 4))}px;left:${Math.max(8, Math.min(window.innerWidth - pickerRect.width - 8, wrapRect.left))}px`;
            });
            picker.addEventListener('datetime-selected', event => {
                const match = String(event.detail?.value || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
                if (match) { date = match[1]; start = match[2]; formatWhen(); }
                picker.remove();
                datePicker = null;
                titleInput.focus();
            });
            picker.addEventListener('datetime-cancelled', () => {
                picker.remove();
                datePicker = null;
                titleInput.focus();
            });
            datePicker = picker;
            picker.focus();
        };
        whenButton.addEventListener('click', openDatePicker);
        const cancel = () => { close(); textarea.focus(); };
        wrap.querySelector('.m-cancel').addEventListener('click', cancel);
        wrap.querySelector('.m-insert').addEventListener('click', () => {
            const title = titleInput.value.trim();
            if (!title) { titleInput.focus(); return; }
            const duration = Number.parseInt(wrap.querySelector('.m-duration').value, 10) || 60;
            const durationText = duration === 60 ? '' : ` ${duration}m`;
            const marker = `{{m:${title} @ ${date} ${start}${durationText}}}`;
            const value = textarea.value;
            textarea.value = value.slice(0, insertAt) + marker + value.slice(insertAt);
            const caret = insertAt + marker.length;
            textarea.setSelectionRange(caret, caret);
            close();
            textarea.focus();
            textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        });
        wrap.addEventListener('keydown', event => {
            if (event.key === 'Enter' && event.target !== whenButton) {
                event.preventDefault();
                wrap.querySelector('.m-insert').click();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
            }
        });
        setTimeout(() => {
            if (popup !== wrap) return;
            outsideHandler = event => {
                if (datePicker?.contains(event.target)) return;
                if (!wrap.contains(event.target) && event.target !== textarea) cancel();
            };
            document.addEventListener('mousedown', outsideHandler, true);
        }, 0);
        setTimeout(() => titleInput.focus(), 0);
    };

    textarea.addEventListener('keydown', onKeydown);
    return {
        destroy() {
            textarea.removeEventListener('keydown', onKeydown);
            close();
        },
    };
}
