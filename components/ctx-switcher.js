/**
 * <ctx-switcher> — wraps the server-rendered context switcher (trigger button +
 * dropdown menu) and wires up: open/close, click-outside, switch context, and
 * the optional commit-changes button.
 *
 * Expected light-DOM children (rendered server-side by contextSwitcherHtml()):
 *   <ctx-switcher>
 *     <button class="ctx-trigger">…</button>
 *     <div class="ctx-menu">
 *       <button class="ctx-item" data-id="…">…</button>
 *       <button class="ctx-item ctx-commit-btn" data-active="…">💾 …</button>
 *       <a class="ctx-item ctx-link" href="/settings">…</a>
 *     </div>
 *   </ctx-switcher>
 */
(function () {
    if (window.customElements && customElements.get('ctx-switcher')) return;

    class CtxSwitcher extends HTMLElement {
        connectedCallback() {
            if (this._wired) return;
            this._wired = true;

            var self = this;
            var trigger = this.querySelector('.ctx-trigger');
            if (!trigger) return;

            this._onTrigger = function (e) {
                e.stopPropagation();
                self.classList.toggle('open');
            };
            this._onDocClick = function (e) {
                if (!self.contains(e.target)) self.classList.remove('open');
            };
            trigger.addEventListener('click', this._onTrigger);
            document.addEventListener('click', this._onDocClick);

            this.querySelectorAll('.ctx-item[data-id]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var id = b.getAttribute('data-id');
                    fetch('/api/contexts/switch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: id })
                    })
                        .then(function (r) { return r.json(); })
                        .then(function (d) {
                            if (d.ok) location.reload();
                            else alert('Kunne ikke bytte kontekst: ' + d.error);
                        });
                });
            });

            var cb = this.querySelector('#ctxCommitBtn');
            if (cb) {
                cb.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var id = cb.getAttribute('data-active');
                    var msg = prompt('Commit-melding (valgfritt):', '');
                    if (msg === null) return;
                    cb.textContent = '⏳ Committer...';
                    fetch('/api/contexts/' + encodeURIComponent(id) + '/commit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: msg })
                    })
                        .then(function (r) { return r.json(); })
                        .then(function (d) {
                            if (d.ok) {
                                cb.textContent = d.committed ? '✓ Committet' : 'Ingen endringer';
                                setTimeout(function () { self.classList.remove('open'); }, 1200);
                            } else {
                                cb.textContent = '✗ ' + d.error;
                            }
                        });
                });
            }
        }
        disconnectedCallback() {
            if (this._onDocClick) document.removeEventListener('click', this._onDocClick);
        }
    }

    customElements.define('ctx-switcher', CtxSwitcher);
})();
