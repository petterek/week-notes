/**
 * <ctx-switcher service="ContextService"> — wraps the server-rendered context
 * switcher (trigger button + dropdown menu). The server emits light-DOM
 * children which appear inside the component's shadow root via a <slot>.
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
 *
 * Service contract:
 *   switchTo(id) → Promise
 *   commit(id, { message }) → Promise<{ ok, committed?, error? }>
 *
 * Behavior unchanged: clicking the trigger toggles `.open` on the host;
 * clicking a context item switches; clicking the commit button commits.
 */
import { WNElement, html } from './_shared.js';

const STYLES = `
    :host { display: inline-block; position: relative; font: inherit; }
`;

class CtxSwitcher extends WNElement {
    css() { return STYLES; }

    render() {
        return html`<slot></slot>`;
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this.service) return;
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
                        const d = await this.service.switchTo(id);
                        if (d && d.ok) {
                            const evt = new CustomEvent('context-selected', {
                                bubbles: true, composed: true, cancelable: true,
                                detail: { id, result: d }
                            });
                            if (!this.dispatchEvent(evt)) return;
                            location.reload();
                        } else {
                            alert(`Kunne ikke bytte kontekst: ${d && d.error || 'ukjent feil'}`);
                        }
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
                        const d = await this.service.commit(id, { message: msg });
                        if (d && d.ok) {
                            cb.textContent = d.committed ? '✓ Committet' : 'Ingen endringer';
                            setTimeout(() => this.classList.remove('open'), 1200);
                        } else {
                            cb.textContent = `✗ ${d && d.error || 'feil'}`;
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

if (!customElements.get('ctx-switcher')) customElements.define('ctx-switcher', CtxSwitcher);
