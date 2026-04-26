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

            const trigger = this.querySelector('.ctx-trigger');
            if (!trigger) return;

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.classList.toggle('open');
            });

            this._onDocClick = (e) => {
                if (!this.contains(e.target)) this.classList.remove('open');
            };
            document.addEventListener('click', this._onDocClick);

            this.querySelectorAll('.ctx-item[data-id]').forEach((b) => {
                b.addEventListener('click', async () => {
                    const id = b.getAttribute('data-id');
                    try {
                        const r = await fetch('/api/contexts/switch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id }),
                        });
                        const d = await r.json();
                        if (d.ok) location.reload();
                        else alert(`Kunne ikke bytte kontekst: ${d.error}`);
                    } catch (e) {
                        alert(`Kunne ikke bytte kontekst: ${e.message || e}`);
                    }
                });
            });

            const cb = this.querySelector('#ctxCommitBtn');
            if (cb) {
                cb.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = cb.getAttribute('data-active');
                    const msg = prompt('Commit-melding (valgfritt):', '');
                    if (msg === null) return;
                    cb.textContent = '⏳ Committer...';
                    try {
                        const r = await fetch(`/api/contexts/${encodeURIComponent(id)}/commit`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: msg }),
                        });
                        const d = await r.json();
                        if (d.ok) {
                            cb.textContent = d.committed ? '✓ Committet' : 'Ingen endringer';
                            setTimeout(() => this.classList.remove('open'), 1200);
                        } else {
                            cb.textContent = `✗ ${d.error}`;
                        }
                    } catch (err) {
                        cb.textContent = `✗ ${err.message || err}`;
                    }
                });
            }
        }
        disconnectedCallback() {
            if (this._onDocClick) document.removeEventListener('click', this._onDocClick);
        }
    }

    customElements.define('ctx-switcher', CtxSwitcher);
})();
