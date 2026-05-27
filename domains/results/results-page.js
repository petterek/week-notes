/**
 * <results-page results_service="…" people_service="…" companies_service="…">
 *
 * SPA replacement for the SSR /results page. Lists results grouped by ISO
 * week (descending), with a "New result" button and per-row edit / delete.
 *
 * Service contract:
 *   results_service.list()                → Result[]
 *   results_service.create({text, week})  → Result
 *   results_service.update(id, {text})    → Result
 *   results_service.remove(id)            → { ok: true }
 *   people_service.list()    (optional)   → Person[]   (for @mention rendering)
 *   companies_service.list() (optional)   → Company[]  (for @mention rendering)
 *
 * Mentions render as <entity-mention> chips (no @ prefix). The chip resolves
 * its display name from the registered services automatically.
 *
 * Hash deep links: #r-<id> scrolls + briefly highlights the matching row.
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions, isoWeek } from './_shared.js';

function currentYearWeek() {
    return isoWeek(new Date());
}

const STYLES = `
    :host { display: block; padding: 20px 24px; box-sizing: border-box; color: var(--text-strong); font: inherit; }
    .rp { max-width: 920px; }
    .rp-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; flex-wrap: wrap; }
    .rp-head h1 {
        margin: 0; font-family: var(--font-heading, Georgia, serif);
        font-weight: 400; color: var(--accent);
    }
    .rp-hint { color: var(--text-subtle); font-size: 0.85em; margin: 0 0 24px; }
    .rp-hint code { background: var(--surface-alt); padding: 1px 6px; border-radius: 3px; }

    .rp-btn-primary {
        background: var(--accent); color: var(--surface, #fff);
        border: none; padding: 8px 16px; border-radius: 6px;
        font: inherit; font-weight: 600; cursor: pointer;
    }
    .rp-btn-primary:hover { filter: brightness(0.95); }

    .rp-week { margin-bottom: 32px; }
    .rp-week-h {
        color: var(--accent); font-size: 0.95em; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.05em;
        margin: 0 0 10px; padding-bottom: 6px;
        border-bottom: 2px solid var(--border-soft);
        display: flex; align-items: center; gap: 10px;
    }
    .rp-pill-live {
        background: var(--accent-soft, rgba(237,137,54,.15));
        color: var(--accent); padding: 2px 8px; border-radius: 999px;
        font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.05em;
        font-weight: 600;
    }

    .rp-card {
        background: var(--surface); border: 1px solid var(--border-soft);
        border-left: 4px solid var(--accent); border-radius: 8px;
        padding: 14px 18px; margin-bottom: 10px;
        transition: box-shadow 200ms ease, border-color 200ms ease;
    }
    .rp-card.flash {
        box-shadow: 0 0 0 3px var(--accent);
        border-color: var(--accent);
    }
    .rp-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
    .rp-text { flex: 1; font-size: 1em; color: var(--text-strong); line-height: 1.45; }
    .rp-act {
        background: none; border: none; cursor: pointer;
        font-size: 1em; padding: 2px 6px; border-radius: 4px;
        font-family: inherit; color: var(--text-muted);
    }
    .rp-act:hover { background: var(--surface-head); }
    .rp-del { color: #c53030; }
    .rp-del:hover { background: #fff5f5; }

    .rp-meta {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        font-size: 0.82em; color: var(--text-subtle);
    }
    .rp-task a { color: var(--text-muted); text-decoration: none; }
    .rp-task a:hover { text-decoration: underline; }
    .rp-date { margin-left: auto; }

    .rp-empty { color: var(--text-subtle); font-style: italic; margin-top: 24px; }
    .rp-loading, .rp-error { padding: 24px; text-align: center; color: var(--text-muted); font-style: italic; }
    .rp-error { color: var(--danger, #c0392b); }

    .rp-card.sentiment-good { border-left-color: #38a169; }
    .rp-card.sentiment-bad  { border-left-color: #c53030; }

    .sentiment-pick { display: flex; gap: 4px; }
    .sentiment-pick button {
        background: var(--surface-alt); border: 2px solid var(--border-soft);
        border-radius: 6px; padding: 4px 10px; cursor: pointer;
        font: inherit; font-size: 0.9em; color: var(--text-muted);
    }
    .sentiment-pick button:hover { border-color: var(--accent); }
    .sentiment-pick button.active { border-color: var(--accent); background: var(--accent-soft); color: var(--text-strong); }

    /* Modals (shadow-local; .page-modal global styles do not pierce shadow). */
    .modal {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        display: none; align-items: center; justify-content: center;
        z-index: 1000;
    }
    .modal.open { display: flex; }
    .modal-card {
        background: var(--surface, #fff); color: var(--text-strong);
        border-radius: 10px; padding: 22px; width: min(560px, 92vw);
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    }
    .modal-head {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 16px;
    }
    .modal-head h3 { margin: 0; }
    .modal-close {
        background: none; border: none; font-size: 1.3em; cursor: pointer;
        color: var(--text-subtle); font-family: inherit;
    }
    .modal-form { display: flex; flex-direction: column; gap: 12px; }
    .modal-form label {
        font-size: 0.85em; font-weight: 600; color: var(--text-muted);
        display: block;
    }
    .modal-form textarea, .modal-form input {
        display: block; width: 100%; margin-top: 4px;
        box-sizing: border-box;
        padding: 8px 10px; border: 1px solid var(--border);
        border-radius: 6px; background: var(--bg);
        color: var(--text-strong); font: inherit;
    }
    .modal-form textarea:focus, .modal-form input:focus {
        border-color: var(--accent); outline: none;
    }
    .modal-actions {
        display: flex; justify-content: flex-end; gap: 10px;
        margin-top: 20px;
    }
    .modal-btn {
        padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border);
        background: var(--surface); color: var(--text-strong);
        font: inherit; cursor: pointer;
    }
    .modal-btn:hover { background: var(--surface-head); }
    .modal-btn.primary {
        background: var(--accent); color: #fff; border-color: var(--accent);
        font-weight: 600;
    }
    .modal-btn.primary:hover { filter: brightness(0.95); }
`;

class ResultsPage extends WNElement {
    static get domain() { return 'results'; }
    static get observedAttributes() { return ['results_service', 'people_service', 'companies_service']; }

    constructor() {
        super();
        this._state = null;
        this._error = null;
        this._modal = null; // null | { mode: 'new' | 'edit', id?, text?, week?, goalId? }
        this._goals = [];
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._wire();
        if (!this._kbWired) {
            this._kbWired = true;
            this._onKey = this._onKey.bind(this);
            document.addEventListener('keydown', this._onKey);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback && super.disconnectedCallback();
        if (this._kbWired) {
            document.removeEventListener('keydown', this._onKey);
            this._kbWired = false;
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) this.invalidateAwait();
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    loadData() {
        if (!this.service) return {};
        const peopleSvc = this.serviceFor('people');
        const compSvc = this.serviceFor('companies');
        return {
            results: async () => {
                const r = await this.service.list();
                return (r || []).slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
            },
            people: () => peopleSvc ? peopleSvc.list() : Promise.resolve([]),
            companies: () => compSvc ? compSvc.list() : Promise.resolve([]),
            goals: () => fetch('/api/goals').then(r => r.json()).catch(() => []),
        };
    }

    _wire() {
        if (this._wired) return;
        this._wired = true;
        const root = this.shadowRoot;
        root.addEventListener('click', (e) => this._onClick(e));
    }

    _onClick(e) {
        const path = e.composedPath();
        const sentimentBtn = path.find(n => n.dataset && n.dataset.sentiment);
        if (sentimentBtn && this._modal) {
            this._modal.sentiment = sentimentBtn.dataset.sentiment;
            this.requestRender();
            return;
        }
        const newBtn = path.find(n => n.id === 'rpNewBtn');
        if (newBtn) { this._openNew(); return; }
        const editBtn = path.find(n => n.classList && n.classList.contains('rp-edit'));
        if (editBtn) {
            const id = editBtn.dataset.id;
            const r = (this._state && this._state.results || []).find(x => x.id === id);
            if (r) this._openEdit(r);
            return;
        }
        const delBtn = path.find(n => n.classList && n.classList.contains('rp-del'));
        if (delBtn) {
            const id = delBtn.dataset.id;
            if (id) this._delete(id);
            return;
        }
        const backdrop = path.find(n => n.classList && n.classList.contains('modal'));
        if (backdrop && e.target === backdrop) { this._closeModal(); return; }
        const closeBtn = path.find(n => n.classList && n.classList.contains('modal-close'));
        if (closeBtn) { this._closeModal(); return; }
        const cancelBtn = path.find(n => n.dataset && n.dataset.act === 'cancel');
        if (cancelBtn) { this._closeModal(); return; }
        const saveBtn = path.find(n => n.dataset && n.dataset.act === 'save');
        if (saveBtn) { this._save(); return; }
    }

    _onKey(e) {
        if (!this._modal) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            this._closeModal();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            this._save();
        }
    }

    _openNew() {
        this._modal = { mode: 'new', text: '', week: currentYearWeek(), goalId: '', sentiment: 'neutral' };
        this.requestRender();
        this._focusModalInput();
    }

    _openEdit(r) {
        this._modal = { mode: 'edit', id: r.id, text: r.text || '', week: r.week || '', goalId: r.goalId || '', sentiment: r.sentiment || 'neutral' };
        this.requestRender();
        this._focusModalInput();
    }

    _closeModal() {
        this._modal = null;
        this.requestRender();
    }

    _focusModalInput() {
        setTimeout(() => {
            const ta = this.shadowRoot.getElementById('rpModalText');
            if (ta) ta.focus();
        }, 30);
    }

    async _save() {
        if (!this._modal) return;
        const ta = this.shadowRoot.getElementById('rpModalText');
        const wkInput = this.shadowRoot.getElementById('rpModalWeek');
        const goalSel = this.shadowRoot.getElementById('rpModalGoal');
        const text = (ta ? ta.value : '').trim();
        const week = wkInput ? wkInput.value.trim() : this._modal.week;
        const goalId = goalSel ? goalSel.value : '';
        const sentiment = this._modal.sentiment || 'neutral';
        if (!text) return;
        try {
            if (this._modal.mode === 'new') {
                const payload = { text, week, goalId };
                if (sentiment !== 'neutral') payload.sentiment = sentiment;
                await this.service.create(payload);
            } else {
                await this.service.update(this._modal.id, { text, goalId, sentiment });
            }
            this._modal = null;
            this.invalidateAwait();
            this.requestRender();
        } catch (e) {
            alert((e && e.message) || 'Feil');
        }
    }

    async _delete(id) {
        if (!confirm('Slett dette resultatet?')) return;
        try {
            await this.service.remove(id);
            this.invalidateAwait();
            this.requestRender();
        } catch (e) {
            alert((e && e.message) || 'Feil');
        }
    }

    _maybeFlashHash() {
        const h = (window.location.hash || '').replace(/^#/, '');
        if (!h.startsWith('r-')) return;
        const id = decodeURIComponent(h.slice(2));
        setTimeout(() => {
            const el = this.shadowRoot.getElementById('rp-card-' + id);
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('flash');
            setTimeout(() => el.classList.remove('flash'), 1600);
        }, 60);
    }

    _renderCard(r) {
        const { people, companies } = this._state;
        const dShort = r.created ? r.created.slice(0, 10) : '';
        const textHtml = unsafeHTML(linkMentions(escapeHtml(r.text || ''), people, companies));
        const linkedPeople = (r.people || []).map(name => {
            const key = String(name).toLowerCase();
            const p = people.find(p => (p.key && p.key === key) || (p.name && p.name.toLowerCase() === key));
            const display = p ? (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name) : name;
            return `<entity-mention kind="person" key="${escapeHtml(key)}" label="${escapeHtml(display)}"></entity-mention>`;
        }).join(' ');
        const sentimentClass = r.sentiment === 'good' ? ' sentiment-good' : r.sentiment === 'bad' ? ' sentiment-bad' : '';
        const sentimentIcon = r.sentiment === 'good' ? '🟢 ' : r.sentiment === 'bad' ? '🔴 ' : '';
        return html`
            <article class=${'rp-card' + sentimentClass} id=${'rp-card-' + r.id}>
                <div class="rp-row">
                    <span class="rp-text">${sentimentIcon}${textHtml}</span>
                    <button class="rp-act rp-edit" data-id=${r.id} title="Rediger">✏️</button>
                    <button class="rp-act rp-del" data-id=${r.id} title="Slett">✕</button>
                </div>
                <div class="rp-meta">
                    ${r.taskText ? unsafeHTML(`<span class="rp-task">📌 <a href="/tasks">${escapeHtml(r.taskText)}</a></span>`) : ''}
                    ${linkedPeople ? unsafeHTML(`<span class="rp-people">${linkedPeople}</span>`) : ''}
                    <span class="rp-date">${dShort}</span>
                </div>
            </article>
        `;
    }

    _renderModal() {
        if (!this._modal) return '';
        const isNew = this._modal.mode === 'new';
        const s = this._modal.sentiment || 'neutral';
        const goals = (this._goals || []).slice().sort((a, b) => {
            const sa = a.status === 'active' ? 0 : 1;
            const sb = b.status === 'active' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return (a.title || '').localeCompare(b.title || '');
        });
        return html`
            <div class="modal open">
                <div class="modal-card">
                    <div class="modal-head">
                        <h3>${isNew ? '➕ Nytt resultat' : '✏️ Rediger resultat'}</h3>
                        <button class="modal-close" type="button" aria-label="Lukk">✕</button>
                    </div>
                    <div class="modal-form">
                        <label>Tekst
                            <textarea id="rpModalText" rows="3"
                                placeholder="Hva ble besluttet eller oppnådd?">${escapeHtml(this._modal.text || '')}</textarea>
                        </label>
                        <label>Vurdering
                            <div class="sentiment-pick">
                                <button type="button" data-sentiment="good" class=${s === 'good' ? 'active' : ''}>🟢 Bra</button>
                                <button type="button" data-sentiment="neutral" class=${s === 'neutral' ? 'active' : ''}>⚪ Nøytral</button>
                                <button type="button" data-sentiment="bad" class=${s === 'bad' ? 'active' : ''}>🔴 Dårlig</button>
                            </div>
                        </label>
                        ${isNew ? html`
                            <label>Uke
                                <input type="text" id="rpModalWeek" value=${this._modal.week || ''} placeholder="YYYY-WNN" />
                            </label>
                        ` : ''}
                        <label>Mål (valgfritt)
                            <select id="rpModalGoal">
                                <option value="" ${!this._modal.goalId ? 'selected' : ''}>(ingen)</option>
                                ${goals.map(g => unsafeHTML(`<option value="${escapeHtml(g.id)}"${g.id === this._modal.goalId ? ' selected' : ''}>${escapeHtml((g.status === 'achieved' ? '🏆 ' : g.status === 'abandoned' ? '🗑️ ' : '🎯 ') + (g.title || ''))}</option>`))}
                            </select>
                        </label>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn" type="button" data-act="cancel">Avbryt</button>
                        <button class="modal-btn primary" type="button" data-act="save">💾 Lagre</button>
                    </div>
                </div>
            </div>
        `;
    }

    afterRender(data) {
        if (!data || data._loading || !Array.isArray(data.results)) return;
        this._maybeFlashHash();
    }

    render(data = {}) {
        if (!this.service) return this.renderNoService();
        if (data._loading) return html`<div class="rp-loading">Laster…</div>`;
        if (!Array.isArray(data.results)) return html`<div class="rp-error">Kunne ikke laste resultater</div>`;

        const results = data.results;
        const people = data.people || [];
        const companies = data.companies || [];
        this._goals = Array.isArray(data.goals) ? data.goals : [];
        this._state = { results, people, companies };

        const byWeek = {};
        results.forEach(r => {
            const w = r.week || '';
            (byWeek[w] = byWeek[w] || []).push(r);
        });
        const weeks = Object.keys(byWeek).sort((a, b) => b.localeCompare(a));
        const cw = currentYearWeek();

        return html`
            <div class="rp">
                <div class="rp-head">
                    <h1>⚖️ Resultater</h1>
                    <button class="rp-btn-primary" id="rpNewBtn" type="button">➕ Nytt resultat</button>
                </div>
                <p class="rp-hint">
                    Tips: Skriv ${unsafeHTML('<code>[beslutning]</code>')} i et oppgavenotat for å lage et resultat knyttet til en oppgave.
                </p>
                ${results.length === 0
                    ? html`<p class="rp-empty">Ingen resultater ennå. Klikk <strong>➕ Nytt resultat</strong> for å legge til, eller skriv <code>[beslutning]</code> i et oppgavenotat.</p>`
                    : weeks.map(week => {
                        const items = byWeek[week].slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
                        const weekNum = (week || '').split('-W')[1] || week || '?';
                        return html`
                            <section class="rp-week">
                                <h2 class="rp-week-h">
                                    Uke ${weekNum}
                                    ${week === cw ? unsafeHTML('<span class="rp-pill-live">aktiv</span>') : ''}
                                </h2>
                                ${items.map(r => this._renderCard(r))}
                            </section>
                        `;
                    })
                }
                ${this._renderModal()}
            </div>
        `;
    }
}

if (!customElements.get('results-page')) customElements.define('results-page', ResultsPage);
