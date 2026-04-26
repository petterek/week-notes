/**
 * <week-results week="YYYY-WNN"> — sidebar list of results for one ISO week.
 * Fetches /api/results + people + companies. Emits 'mention-clicked' for
 * @links inside results.
 */
(function () {
    if (customElements.get('week-results')) return;

    function inWeek(r, week) {
        if (r.week === week) return true;
        if (r.created && r.created.slice(0, 10) && window.WN.isoWeek(new Date(r.created)) === week) return true;
        return false;
    }

    class WeekResults extends HTMLElement {
        static get observedAttributes() { return ['week']; }

        connectedCallback() {
            if (this._loading) return;
            this._loading = true;
            this.innerHTML = `<h3 class="sec-h">Resultater</h3><p class="empty-quiet">Laster…</p>`;
            this._load();
        }

        async _load() {
            const week = this.getAttribute('week');
            try {
                const [results, people, companies] = await Promise.all([
                    window.WN.results(),
                    window.WN.people(),
                    window.WN.companies(),
                ]);
                const filtered = (results || []).filter(r => inWeek(r, week));
                this._render(filtered, people || [], companies || []);
            } catch {
                this.innerHTML = `<h3 class="sec-h">Resultater</h3><p class="empty-quiet">Kunne ikke laste</p>`;
            }
        }

        _render(results, people, companies) {
            const { escapeHtml, linkMentions, wireMentionClicks } = window.WN;
            const heading = `<h3 class="sec-h">Resultater <span class="c">${results.length}</span></h3>`;
            if (results.length === 0) {
                this.innerHTML = `${heading}<p class="empty-quiet">Ingen resultater</p>`;
                return;
            }
            const rows = results.map(r => {
                const dShort = r.created ? `${r.created.slice(8, 10)}.${r.created.slice(5, 7)}` : '';
                const peopleStr = (r.people && r.people.length > 0)
                    ? r.people.map(p => `@${escapeHtml(p)}`).join(', ')
                    : '';
                return `
                    <div class="result">
                        ${linkMentions(escapeHtml(r.text), people, companies)}
                        <div class="meta"><span>${peopleStr}</span><span>${dShort}</span></div>
                    </div>
                `;
            }).join('');
            this.innerHTML = `${heading}${rows}`;
            wireMentionClicks(this);
        }
    }

    customElements.define('week-results', WeekResults);
})();
