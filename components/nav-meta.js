/**
 * <nav-meta> — small navbar widget showing weekday/date, ISO week badge and a live clock.
 * Updates once per second. Norwegian locale (nb-NO).
 *
 * Usage: <nav-meta></nav-meta>
 */
(function () {
    if (window.customElements && customElements.get('nav-meta')) return;

    function isoWeek(now) {
        var t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        var dow = (t.getUTCDay() + 6) % 7;
        t.setUTCDate(t.getUTCDate() - dow + 3);
        var fy = t.getUTCFullYear();
        var ft = new Date(Date.UTC(fy, 0, 4));
        var fdow = (ft.getUTCDay() + 6) % 7;
        ft.setUTCDate(ft.getUTCDate() - fdow + 3);
        return 1 + Math.round((t - ft) / (7 * 24 * 3600 * 1000));
    }

    var STYLE = '\
        :host { display: inline-flex; align-items: center; gap: 10px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85em; color: var(--text-muted-warm, #888); opacity: 0.65; letter-spacing: 0.02em; }\
        .nm-week { padding: 1px 6px; border: 1px solid var(--border, #ccc); border-radius: 3px; font-size: 0.78em; opacity: 0.9; }\
    ';

    class NavMeta extends HTMLElement {
        connectedCallback() {
            var root = this.attachShadow({ mode: 'open' });
            root.innerHTML = '<style>' + STYLE + '</style>'
                + '<span class="nm-date"></span>'
                + '<span class="nm-week"></span>'
                + '<span class="nm-clock"></span>';
            this._d = root.querySelector('.nm-date');
            this._w = root.querySelector('.nm-week');
            this._c = root.querySelector('.nm-clock');
            var self = this;
            function tick() {
                if (!self.isConnected) return;
                var now = new Date();
                self._c.textContent = now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                self._d.textContent = now.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: 'short' });
                self._w.textContent = 'Uke ' + isoWeek(now);
                self._timer = setTimeout(tick, 1000);
            }
            tick();
        }
        disconnectedCallback() {
            if (this._timer) clearTimeout(this._timer);
        }
    }

    customElements.define('nav-meta', NavMeta);
})();
