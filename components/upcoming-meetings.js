/**
 * <upcoming-meetings days="14"> — sidebar widget listing meetings in the next
 * N days (default 14). Fetches /api/meetings?upcoming=N + people/companies/
 * meeting-types. Clicking a meeting row navigates to the calendar week with
 * the meeting anchor; clicking a 📝 link opens the meeting note. @mentions
 * bubble 'mention-clicked' (handled at the page level).
 */
(function () {
    if (customElements.get('upcoming-meetings')) return;

    const NB_DAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
    const NB_DAYS_TODAY = 'I dag';
    const NB_DAYS_TOMORROW = 'I morgen';

    function dayLabel(dateStr) {
        const d = new Date(dateStr + 'T00:00:00Z');
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        if (dateStr === todayStr) return NB_DAYS_TODAY;
        const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
        if (dateStr === tomorrow) return NB_DAYS_TOMORROW;
        return `${NB_DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    class UpcomingMeetings extends HTMLElement {
        connectedCallback() {
            if (this._loading) return;
            this._loading = true;
            this.innerHTML = `<h3 class="side-h" style="margin-top:18px">📅 Kommende møter</h3><p class="empty-quiet">Laster…</p>`;
            this._load();
        }

        async _load() {
            const days = parseInt(this.getAttribute('days') || '14', 10);
            try {
                const [meetings, people, companies, types] = await Promise.all([
                    window.WN.meetings(`?upcoming=${days}`),
                    window.WN.people(),
                    window.WN.companies(),
                    window.WN.meetingTypes(),
                ]);
                this._render(meetings || [], people || [], companies || [], types || []);
            } catch {
                this.innerHTML = `<h3 class="side-h" style="margin-top:18px">📅 Kommende møter</h3><p class="empty-quiet">Kunne ikke laste møter</p>`;
            }
        }

        _render(meetings, people, companies, types) {
            const { escapeHtml, linkMentions, isoWeek, wireMentionClicks } = window.WN;
            const heading = `<h3 class="side-h" style="margin-top:18px">📅 Kommende møter · ${meetings.length}</h3>`;
            if (meetings.length === 0) {
                this.innerHTML = `${heading}<p class="empty-quiet">Ingen møter de neste 14 dagene. <a href="/calendar">Legg til</a></p>`;
                return;
            }
            const typeMap = {};
            types.forEach(t => { typeMap[t.key] = t; });

            const rows = meetings.map(m => {
                const time = m.start
                    ? escapeHtml(m.start) + (m.end ? `–${escapeHtml(m.end)}` : '')
                    : 'Hele dagen';
                const att = (m.attendees || [])
                    .map(a => `<a class="mention-link" data-person-key="${escapeHtml(a)}" href="/people#${escapeHtml(a)}">@${escapeHtml(a)}</a>`)
                    .join(' ');
                const loc = m.location ? `<span class="mtg-loc">📍 ${escapeHtml(m.location)}</span>` : '';
                const t = typeMap[m.type];
                const typeHtml = t && t.icon
                    ? `<span class="mtg-type-icon" title="${escapeHtml(t.label || '')}">${t.icon}</span> `
                    : '';
                const calHref = `/calendar/${escapeHtml(isoWeek(new Date(m.date + 'T00:00:00Z')))}#m-${encodeURIComponent(m.id)}`;
                return `
                    <div class="sidebar-meeting" data-mid="${escapeHtml(m.id)}" data-cal-href="${calHref}" title="Åpne i kalender">
                        <a class="sidebar-mtg-note" href="/meeting-note/${encodeURIComponent(m.id)}" title="Åpne møtenotat">📝</a>
                        <div class="mtg-when"><strong>${escapeHtml(dayLabel(m.date))}</strong> · ${time}</div>
                        <div class="mtg-title">${typeHtml}${linkMentions(escapeHtml(m.title), people, companies)}</div>
                        ${att || loc ? `<div class="mtg-meta">${att}${att && loc ? ' · ' : ''}${loc}</div>` : ''}
                    </div>
                `;
            }).join('');

            this.innerHTML = `
                ${heading}
                <div class="sidebar-meetings">${rows}</div>
                <div class="upcoming-cal-link"><a href="/calendar">Åpne kalender →</a></div>
            `;
            this._wire();
            wireMentionClicks(this);
        }

        _wire() {
            this.addEventListener('click', (ev) => {
                if (ev.target.closest('a, button')) return;
                const card = ev.target.closest('.sidebar-meeting');
                if (!card || !this.contains(card)) return;
                const href = card.getAttribute('data-cal-href');
                if (!href) return;
                const evt = new CustomEvent('upcoming-meetings:open', {
                    bubbles: true, cancelable: true,
                    detail: { id: card.dataset.mid, href },
                });
                if (this.dispatchEvent(evt)) window.location.href = href;
            });
        }
    }

    customElements.define('upcoming-meetings', UpcomingMeetings);
})();
