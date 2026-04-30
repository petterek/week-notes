/**
 * <settings-page> — minimal master/detail context settings.
 *
 * Lists all contexts on the left, edits the selected one on the right.
 * Can edit: icon, name, description, theme, and per-day working hours.
 * Saves via PUT /api/contexts/:id/settings. Can switch active context
 * via POST /api/contexts/switch.
 *
 * Out of scope (handled by the legacy page until ported): git, meeting
 * types, version markers, creating/cloning new contexts.
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const DAY_NAMES = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

// Grouped icon set for meeting types — 7 cols × 2 rows = 14 per group.
const MEETING_ICON_GROUPS = [
    { name: 'Jobb',     icons: ['💼', '💻', '📊', '📈', '🤝', '📞', '📧',
                                '🗂️', '📝', '🖥️', '⌨️', '🖱️', '🏢', '🧾'] },
    { name: 'Møter',    icons: ['👥', '🗣️', '🎤', '📅', '☕', '🍽️', '🎉',
                                '🍻', '🥂', '🍕', '🍣', '🎂', '🪑', '📋'] },
    { name: 'Trening',  icons: ['🏃', '🏋️', '⚽', '🎾', '🏊', '🚴', '🧘',
                                '🥊', '⛳', '🏐', '🏀', '🏓', '🛹', '🏆'] },
    { name: 'Hjem',     icons: ['🏠', '👨‍👩‍👧', '🛋️', '🍳', '🧺', '🛒', '🐕',
                                '🐈', '🛏️', '🧹', '🧼', '🪴', '🧸', '🔧'] },
    { name: 'Reise',    icons: ['✈️', '🚗', '🚄', '🏨', '🌍', '🗺️', '⛵',
                                '🚌', '🚲', '🏖️', '🏔️', '🏝️', '🎒', '🧳'] },
    { name: 'Annet',    icons: ['🎓', '📚', '🎨', '🎵', '🎮', '🎬', '🌳',
                                '🎸', '🎤', '🖼️', '🪐', '🔬', '🧪', '🧠'] },
];

// Context icons — 5 cols × 5 rows = 25 in two groups.
const CONTEXT_ICON_GROUPS = [
    { name: 'Liv',    icons: ['💼', '🏠', '👨‍👩‍👧', '🎓', '🧑‍💻',
                              '🎨', '🎵', '📚', '🧘', '✈️',
                              '🏖️', '⛺', '🌳'] },
    { name: 'Hobby',  icons: ['⛳', '🏌️', '🏃', '🚴', '⚽',
                              '🎾', '🎸', '🎮', '🍳', '📷',
                              '🐕', '🐈'] },
];

const DEFAULT_MEETING_TYPES = [
    { key: 'meeting',  label: 'Møte',        icon: '👥', color: '#4a90e2', defaultMinutes: 60 },
    { key: '1on1',     label: '1:1',         icon: '☕', color: '#a05a2c', defaultMinutes: 30 },
    { key: 'standup',  label: 'Standup',     icon: '🔄', color: '#7ab648', defaultMinutes: 15 },
    { key: 'workshop', label: 'Workshop',    icon: '🛠️', color: '#e08a3c', defaultMinutes: 120 },
    { key: 'demo',     label: 'Demo',        icon: '🎬', color: '#9b59b6', defaultMinutes: 60 },
    { key: 'planning', label: 'Planlegging', icon: '📋', color: '#3aa3a3', defaultMinutes: 60 },
    { key: 'review',   label: 'Gjennomgang', icon: '🔍', color: '#34495e', defaultMinutes: 60 },
    { key: 'social',   label: 'Sosialt',     icon: '🎉', color: '#e91e63', defaultMinutes: 60 },
    { key: 'call',     label: 'Telefon',     icon: '📞', color: '#16a085', defaultMinutes: 30 },
    { key: 'focus',    label: 'Fokus',       icon: '🎯', color: '#d35400', defaultMinutes: 60 },
    { key: 'vacation', label: 'Ferie',       icon: '🌴', color: '#2ecc71', allDay: true },
];

const STYLES = `
    :host { display: block; height: 100%; box-sizing: border-box; }
    .sp { display: grid; grid-template-columns: 280px 1fr; gap: 16px; height: 100%; padding: 12px 16px; box-sizing: border-box; }
    @media (max-width: 760px) { .sp { grid-template-columns: 1fr; } }
    h1.sp-title { font-family: var(--font-heading); font-weight: 400; color: var(--accent); margin: 0 0 12px; font-size: 1.3em; }
    .sp-rail { background: var(--surface); border: 1px solid var(--border-soft); border-radius: 8px; padding: 8px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
    .rail-add { margin-top: 8px; padding: 6px 10px; border: 1px dashed var(--border); background: transparent; color: var(--accent); border-radius: 6px; cursor: pointer; font: inherit; font-size: 0.92em; }
    .rail-add:hover { background: var(--surface-alt); }
    .nc-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: flex-start; justify-content: center; padding: 5vh 16px; box-sizing: border-box; overflow-y: auto; }
    .nc-overlay.open { display: flex; }
    .nc-card { background: var(--surface); border: 1px solid var(--border-soft); border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.25); padding: 18px 20px; width: min(480px, 100%); box-sizing: border-box; }
    .nc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .nc-head h2 { margin: 0; font-family: var(--font-heading); font-weight: 400; color: var(--accent); font-size: 1.1em; flex: 1; }
    .nc-head button { background: transparent; border: 0; color: var(--text-muted); font-size: 1.3em; cursor: pointer; padding: 0 4px; }
    .nc-head button:hover { color: var(--text-strong); }
    .nc-form label { display: block; font-size: 0.9em; color: var(--text-muted); margin-bottom: 8px; }
    .nc-form input, .nc-form textarea { width: 100%; box-sizing: border-box; padding: 6px 10px; font: inherit; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-strong); margin-top: 2px; }
    .nc-form .row { display: grid; grid-template-columns: 80px 1fr; gap: 8px; }
    .nc-actions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
    .nc-actions .spacer { flex: 1; }
    .nc-actions button { padding: 5px 12px; border-radius: 5px; cursor: pointer; font: inherit; }
    .nc-actions .save { background: var(--accent); color: var(--text-on-accent); border: 1px solid var(--accent); }
    .nc-actions .save:hover { background: var(--accent-strong); }
    .nc-actions .cancel { background: var(--surface); color: var(--text-strong); border: 1px solid var(--border); }
    .nc-status { font-size: 0.9em; color: var(--text-muted); }
    .nc-modes { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--border-soft); }
    .nc-mode-btn { background: transparent; border: none; border-bottom: 2px solid transparent; padding: 6px 12px; font: inherit; font-size: 0.92em; color: var(--text-muted-warm); cursor: pointer; margin-bottom: -1px; }
    .nc-mode-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
    .nc-pane { display: none; }
    .nc-pane.active { display: block; }
    .rail-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid transparent; border-radius: 6px; background: transparent; cursor: pointer; text-align: left; font: inherit; color: var(--text-strong); }
    .rail-item:hover { background: var(--surface-alt); }
    .rail-item.selected { border-color: var(--accent); background: var(--surface-alt); }
    .rail-item .ic { font-size: 1.4em; }
    .rail-item .nm { flex: 1; min-width: 0; }
    .rail-item .nm-name { font-weight: 600; }
    .rail-item .nm-id { font-size: 0.8em; color: var(--text-muted); }
    .rail-item .badge { color: var(--accent); }
    .sp-detail { background: var(--surface); border: 1px solid var(--border-soft); border-radius: 8px; padding: 16px 18px; overflow: auto; }
    .det-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .det-head h2 { margin: 0; font-family: var(--font-heading); font-weight: 400; color: var(--accent); }
    .det-head .ic-lg { font-size: 2em; }
    .det-head .id { color: var(--text-muted); font-size: 0.85em; }
    .det-head .switch-btn { margin-left: auto; padding: 6px 14px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: var(--text-on-accent); cursor: pointer; font: inherit; }
    .det-head .active-badge { margin-left: auto; padding: 4px 10px; border-radius: 12px; background: var(--surface-alt); color: var(--accent); font-size: 0.85em; font-weight: 600; }
    fieldset { border: 1px solid var(--border-soft); border-radius: 6px; padding: 12px 14px; margin: 0 0 14px; }
    legend { padding: 0 6px; color: var(--text-muted); font-size: 0.9em; }
    .row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
    label { font-size: 0.85em; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; }
    input[type=text], textarea, select { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-strong); font: inherit; }
    textarea { width: 100%; min-height: 60px; resize: vertical; }
    .wh-grid { display: flex; gap: 8px; flex-wrap: wrap; }
    .wh-row { display: flex; flex-direction: column; gap: 6px; align-items: stretch; padding: 8px; border: 1px solid var(--border-soft); border-radius: 6px; background: var(--surface); min-width: 92px; flex: 1 1 92px; }
    .wh-row .day { font-weight: 600; color: var(--text-strong); text-align: center; }
    .wh-row .toggle { font-size: 0.78em; color: var(--text-muted); justify-content: center; }
    .wh-row select, .wh-row input[type=text] { font-size: 0.88em; padding: 4px 6px; width: 100%; box-sizing: border-box; text-align: center; }
    .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; align-items: center; }
    .actions .status { color: var(--text-muted); font-size: 0.9em; margin-right: auto; }
    button.save { padding: 8px 18px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: var(--text-on-accent); font-weight: 600; cursor: pointer; font: inherit; }
    button.save:hover { filter: brightness(0.95); }
    .sp-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-soft); margin: 0 0 14px; flex-wrap: wrap; }
    .sp-tab-btn { background: transparent; border: none; border-bottom: 2px solid transparent; padding: 8px 14px; font-size: 0.92em; color: var(--text-muted-warm); cursor: pointer; margin-bottom: -1px; font: inherit; }
    .sp-tab-btn:hover { color: var(--text-strong); background: var(--surface-alt); }
    .sp-tab-btn.is-active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
    .sp-tab-panel { display: none; }
    .sp-tab-panel.is-active { display: block; }
    .tag-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; padding: 0; list-style: none; }
    .tag-list-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--surface-alt); border-radius: 6px; }
    .tag-list-item .tag-name { flex: 1; color: var(--text-strong); font-family: ui-monospace, monospace; font-size: 0.92em; }
    .tag-list-item .tag-name::before { content: '#'; color: var(--text-muted); margin-right: 2px; }
    .tag-list-empty { padding: 12px; text-align: center; color: var(--text-muted); font-style: italic; background: var(--surface-alt); border-radius: 6px; }
    .tag-edit-bar { display: flex; gap: 8px; margin-top: 10px; }
    .tag-edit-bar button { padding: 6px 14px; }
    .tag-chip { background: var(--accent-soft); color: var(--accent); padding: 2px 10px; border-radius: 12px; font-size: 0.82em; }
    .mt-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .mt-row { display: grid; grid-template-columns: 60px 44px 130px 1fr 78px auto 36px; gap: 8px; align-items: center; }
    .mt-row input { padding: 4px 8px; font-size: 0.92em; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-strong); }
    .mt-row button[data-mt-icon] { padding: 0; height: 28px; font-size: 1.15em; cursor: pointer; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-strong); display: flex; align-items: center; justify-content: center; }
    .mt-row button[data-mt-icon]:hover { background: var(--surface-alt); border-color: var(--accent); }
    .mt-row input[data-mt-color] { padding: 0; height: 28px; width: 100%; cursor: pointer; }
    .mt-row input[data-mt-min] { text-align: right; }
    .mt-row label.mt-allday { display: flex; align-items: center; gap: 4px; font-size: 0.85em; color: var(--text-muted); white-space: nowrap; cursor: pointer; }
    .mt-row label.mt-allday input { width: auto; padding: 0; }
    .mt-row .mt-del { background: transparent; border: 0; color: var(--text-muted); cursor: pointer; font-size: 1em; }
    .mt-row .mt-del:hover { color: var(--danger, #c53030); }
    .mt-add { margin-top: 8px; padding: 5px 12px; border: 1px dashed var(--border); background: transparent; color: var(--text-strong); border-radius: 4px; cursor: pointer; font: inherit; font-size: 0.88em; }
    .mt-add:hover { background: var(--surface-alt); }
    .hours-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    @media (max-width: 700px) { .hours-grid { grid-template-columns: 1fr; } }
    .mt-icon-pop { position: absolute; z-index: 200; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.15); padding: 6px; display: none; }
    .mt-icon-pop[data-open] { display: block; }
    button.icon-btn { width: 60px; height: 32px; padding: 0; font-size: 1.2em; cursor: pointer; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-strong); display: inline-flex; align-items: center; justify-content: center; }
    button.icon-btn:hover { background: var(--surface-alt); border-color: var(--accent); }
    .theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 6px; }
    .theme-swatch { position: relative; display: flex; flex-direction: column; align-items: stretch; cursor: pointer; padding: 6px; border: 1px solid var(--border-faint); border-radius: 6px; background: var(--bg); transition: border-color 0.12s, box-shadow 0.12s, transform 0.08s; font: inherit; color: var(--text-strong); }
    .theme-swatch:hover { border-color: var(--border); transform: translateY(-1px); }
    .theme-swatch.is-selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
    .theme-swatch.is-custom { border-style: dashed; }
    .theme-badge { position: absolute; top: 4px; right: 6px; font-size: 0.78em; color: var(--accent); background: var(--surface); border: 1px solid var(--border-faint); border-radius: 10px; padding: 0 6px; line-height: 16px; font-weight: 600; }
    .theme-actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
    .theme-actions button, .theme-actions a { padding: 5px 12px; border-radius: 5px; cursor: pointer; font: inherit; font-size: 0.88em; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
    .theme-actions button:hover, .theme-actions a:hover { background: var(--surface-alt); }
    .theme-preview { display: flex; flex-direction: column; height: 64px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(0,0,0,0.08); }
    .theme-bar { height: 14px; flex: 0 0 14px; }
    .theme-body { flex: 1; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; justify-content: flex-start; }
    .theme-line { display: block; height: 4px; border-radius: 2px; }
    .theme-line-1 { width: 80%; }
    .theme-line-2 { width: 60%; }
    .theme-line-3 { width: 40%; }
    .theme-name { text-align: center; font-size: 0.78em; color: var(--text-muted-warm); margin-top: 6px; font-weight: 600; }
`;

function timeOpts(selected) {
    const out = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            const v = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
            out.push(`<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`);
        }
    }
    return out.join('');
}

class SettingsPage extends WNElement {
    static get domain() { return 'settings'; }
    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (!this.service) return;
        this._selected = null;
        this.refresh();
    }

    render() {
        if (!this.service) return this.renderNoService();
        return html`
            <div class="sp">
                <div class="sp-rail" part="rail">Laster…</div>
                <div class="sp-detail" part="detail"></div>
            </div>
        `;
    }

    async refresh() {
        // Wait for render
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const railEl = this.shadowRoot.querySelector('.sp-rail');
        const detailEl = this.shadowRoot.querySelector('.sp-detail');
        if (!railEl || !detailEl) return;

        try {
            const ctxSvc = this.serviceFor('context');
            const settingsSvc = this.service;
            if (!ctxSvc || !settingsSvc) {
                railEl.textContent = 'Tjenester ikke koblet til.';
                return;
            }
            const [ctxResp, themeResp] = await Promise.all([
                ctxSvc.list(),
                settingsSvc.listThemes().catch(() => [])
            ]);
            this._active = ctxResp.active;
            this._contexts = ctxResp.contexts || [];
            this._themes = (themeResp && themeResp.themes || themeResp || []).map(t => typeof t === 'string' ? { id: t, name: t } : t);
            if (!this._selected) this._selected = this._active || (this._contexts[0] && this._contexts[0].id);
            this._renderRail(railEl);
            this._renderDetail(detailEl);
        } catch (e) {
            railEl.textContent = 'Kunne ikke laste kontekster.';
        }
    }

    _renderRail(railEl) {
        const items = this._contexts.map(c => {
            const s = c.settings || {};
            const isSelected = c.id === this._selected;
            const isActive = c.id === this._active;
            return `<button type="button" class="rail-item${isSelected ? ' selected' : ''}" data-id="${escapeHtml(c.id)}">
                <span class="ic">${escapeHtml(s.icon || '📁')}</span>
                <span class="nm">
                    <span class="nm-name">${escapeHtml(s.name || c.id)}</span>
                    <span class="nm-id">${escapeHtml(c.id)}</span>
                </span>
                ${isActive ? '<span class="badge" title="Aktiv">●</span>' : ''}
            </button>`;
        }).join('');
        railEl.innerHTML = items + `<button type="button" class="rail-add" data-rail-add>+ Ny kontekst</button>`;
        railEl.querySelectorAll('.rail-item').forEach(el => {
            el.addEventListener('click', () => {
                this._selected = el.dataset.id;
                this._renderRail(railEl);
                this._renderDetail(this.shadowRoot.querySelector('.sp-detail'));
            });
        });
        const addBtn = railEl.querySelector('[data-rail-add]');
        if (addBtn) addBtn.addEventListener('click', () => this._openNewContext());
    }

    _openNewContext() {
        let overlay = this.shadowRoot.querySelector('.nc-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'nc-overlay';
            overlay.innerHTML = `
                <div class="nc-card">
                    <div class="nc-head">
                        <h2>Ny kontekst</h2>
                        <button type="button" data-nc-close title="Lukk">✕</button>
                    </div>
                    <form class="nc-form" data-nc-form>
                        <div class="nc-modes" role="tablist">
                            <button type="button" class="nc-mode-btn active" data-nc-mode="create">✨ Ny</button>
                            <button type="button" class="nc-mode-btn" data-nc-mode="clone">📥 Klon fra git</button>
                        </div>
                        <div class="nc-pane active" data-nc-pane="create">
                            <label>Navn
                                <input type="text" data-nc="name" placeholder="Jobb">
                            </label>
                            <div class="row">
                                <label>Ikon
                                    <button type="button" data-nc="icon" data-icon-set="context" data-icon-value="📁" class="icon-btn" title="Velg ikon">📁</button>
                                </label>
                                <label>Beskrivelse
                                    <input type="text" data-nc="description" placeholder="Kort beskrivelse">
                                </label>
                            </div>
                            <label>Git remote <span style="color:var(--text-subtle);font-weight:normal">(valgfritt)</span>
                                <input type="text" data-nc="remote" placeholder="git@github.com:user/repo.git">
                            </label>
                        </div>
                        <div class="nc-pane" data-nc-pane="clone">
                            <label>Git remote URL
                                <input type="text" data-nc="cloneRemote" placeholder="git@github.com:user/repo.git">
                            </label>
                            <label>Navn <span style="color:var(--text-subtle);font-weight:normal">(valgfritt — utledes fra repo)</span>
                                <input type="text" data-nc="cloneName" placeholder="Overstyr navn">
                            </label>
                            <p style="font-size:0.85em;color:var(--text-muted);margin:4px 0 0">Kloner et eksisterende week-notes-repo fra git og legger til som ny kontekst.</p>
                        </div>
                        <div class="nc-actions">
                            <span class="nc-status" data-nc-status></span>
                            <span class="spacer"></span>
                            <button type="button" class="cancel" data-nc-close>Avbryt</button>
                            <button type="submit" class="save" data-nc-submit>💾 Opprett</button>
                        </div>
                    </form>
                </div>
            `;
            this.shadowRoot.appendChild(overlay);
            const close = () => overlay.classList.remove('open');
            overlay.querySelectorAll('[data-nc-close]').forEach(b => b.addEventListener('click', close));
            overlay.addEventListener('click', (ev) => {
                if (ev.target === overlay) close();
            });
            const form = overlay.querySelector('[data-nc-form]');
            form.addEventListener('submit', (ev) => {
                ev.preventDefault();
                this._submitNewContext(overlay);
            });
            const ncIconBtn = overlay.querySelector('[data-nc="icon"]');
            if (ncIconBtn) {
                ncIconBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this._openIconPicker(ncIconBtn, overlay.querySelector('.nc-card'));
                });
            }
            overlay.querySelectorAll('[data-nc-mode]').forEach(btn => {
                btn.addEventListener('click', () => this._setNcMode(overlay, btn.dataset.ncMode));
            });
        } else {
            overlay.querySelectorAll('input').forEach(i => { i.value = ''; });
            const iconBtn = overlay.querySelector('[data-nc="icon"]');
            if (iconBtn) { iconBtn.dataset.iconValue = '📁'; iconBtn.textContent = '📁'; }
            const status = overlay.querySelector('[data-nc-status]');
            if (status) { status.textContent = ''; status.style.color = ''; }
            this._setNcMode(overlay, 'create');
        }
        overlay.classList.add('open');
        this._setNcMode(overlay, 'create');
        setTimeout(() => {
            const t = overlay.querySelector('[data-nc="name"]');
            if (t) t.focus();
        }, 30);
    }

    _setNcMode(overlay, mode) {
        overlay.querySelectorAll('[data-nc-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.ncMode === mode);
        });
        overlay.querySelectorAll('[data-nc-pane]').forEach(p => {
            p.classList.toggle('active', p.dataset.ncPane === mode);
        });
        const submitBtn = overlay.querySelector('[data-nc-submit]');
        if (submitBtn) submitBtn.textContent = mode === 'clone' ? '📥 Klon' : '💾 Opprett';
        overlay.dataset.ncMode = mode;
        setTimeout(() => {
            const sel = mode === 'clone' ? '[data-nc="cloneRemote"]' : '[data-nc="name"]';
            const t = overlay.querySelector(sel);
            if (t) t.focus();
        }, 30);
    }

    async _submitNewContext(overlay) {
        const status = overlay.querySelector('[data-nc-status]');
        const get = (k) => {
            const el = overlay.querySelector(`[data-nc="${k}"]`);
            if (!el) return '';
            if (el.tagName === 'BUTTON') return (el.dataset.iconValue || '').trim();
            return (el.value || '').trim();
        };
        const mode = overlay.dataset.ncMode || 'create';
        const ctxSvc = this.serviceFor('context');
        let payload, action, label;
        if (mode === 'clone') {
            const remote = get('cloneRemote');
            if (!remote) {
                status.textContent = 'Git remote er påkrevd';
                status.style.color = 'var(--danger, #c53030)';
                return;
            }
            payload = { remote, name: get('cloneName') };
            action = (force) => ctxSvc.clone(Object.assign({}, payload, { force: !!force }));
            label = 'Kloner';
        } else {
            const data = {
                name: get('name'),
                icon: get('icon') || '📁',
                description: get('description'),
                remote: get('remote'),
            };
            if (!data.name) {
                status.textContent = 'Navn er påkrevd';
                status.style.color = 'var(--danger, #c53030)';
                return;
            }
            payload = data;
            action = (force) => ctxSvc.create(Object.assign({}, data, { force: !!force }));
            label = 'Oppretter';
        }
        const send = async (force) => {
            status.style.color = '';
            status.textContent = `⏳ ${label}${force ? ' (bekreftet)' : ''}…`;
            try {
                return await action(force);
            } catch (e) {
                return { ok: false, error: e.message || String(e) };
            }
        };
        try {
            let d = await send(false);
            if (!d.ok && d.needsConfirm && confirm(d.error + '\n\nVil du opprette .week-notes-fil og fortsette?')) {
                d = await send(true);
            }
            if (!d.ok) {
                status.textContent = '✗ ' + (d.error || 'Feil');
                status.style.color = 'var(--danger, #c53030)';
                return;
            }
            status.textContent = mode === 'clone' ? '✓ Klonet' : '✓ Opprettet';
            status.style.color = 'var(--accent)';
            this._selected = d.id;
            await this.refresh();
            setTimeout(() => overlay.classList.remove('open'), 400);
        } catch (e) {
            status.textContent = '✗ ' + (e.message || e);
            status.style.color = 'var(--danger, #c53030)';
        }
    }

    _renderDetail(detailEl) {
        const c = this._contexts.find(x => x.id === this._selected);
        if (!c) { detailEl.textContent = 'Ingen kontekst valgt.'; return; }
        const s = c.settings || {};
        const wh = Array.isArray(s.workHours) ? s.workHours : [];
        const isActive = c.id === this._active;

        const whRows = DAY_NAMES.map((dn, i) => {
            const e = wh[i];
            const enabled = !!e;
            const start = e && e.start ? e.start : '08:00';
            const end = e && e.end ? e.end : '16:00';
            return `<div class="wh-row" data-wh-row="${i}">
                <span class="day">${dn}</span>
                <label class="toggle"><input type="checkbox" data-wh-on ${enabled ? 'checked' : ''}> Arbeid</label>
                <input type="text" data-wh-range value="${enabled ? `${start}-${end}` : '08:00-16:00'}" placeholder="HH:MM-HH:MM" pattern="\\d{2}:\\d{2}-\\d{2}:\\d{2}" ${enabled ? '' : 'disabled'}>
            </div>`;
        }).join('');

        const tags = Array.isArray(s.availableThemes) ? s.availableThemes : [];
        detailEl.innerHTML = `
            <div class="det-head">
                <span class="ic-lg">${escapeHtml(s.icon || '📁')}</span>
                <div style="flex:1;min-width:0">
                    <h2>${escapeHtml(s.name || c.id)}</h2>
                    <div class="id">${escapeHtml(c.id)}</div>
                </div>
                ${isActive
                    ? '<span class="active-badge">Aktiv kontekst</span>'
                    : `<button type="button" class="switch-btn" data-switch>Bytt til</button>`}
            </div>
            <div class="sp-tabs" role="tablist">
                <button type="button" class="sp-tab-btn is-active" data-tab="general">📝 Generelt</button>
                <button type="button" class="sp-tab-btn" data-tab="theme">🎨 Tema</button>
                <button type="button" class="sp-tab-btn" data-tab="tags">🏷️ Tagger</button>
                <button type="button" class="sp-tab-btn" data-tab="hours">🕓 Arbeidstid</button>
                <button type="button" class="sp-tab-btn" data-tab="meetings">📅 Møter</button>
                <button type="button" class="sp-tab-btn" data-tab="git">📦 Git</button>
            </div>
            <div class="sp-tab-panel is-active" data-panel="general">
                <fieldset>
                    <legend>Generelt</legend>
                    <div class="row">
                        <label>Ikon
                            <button type="button" data-f="icon" data-icon-set="context" data-icon-value="${escapeHtml(s.icon || '')}" class="icon-btn" title="Velg ikon">${escapeHtml(s.icon || '·')}</button>
                        </label>
                        <label style="flex:1; min-width:200px">Navn
                            <input type="text" data-f="name" value="${escapeHtml(s.name || '')}">
                        </label>
                    </div>
                    <label style="display:block">Beskrivelse
                        <textarea data-f="description">${escapeHtml(s.description || '')}</textarea>
                    </label>
                </fieldset>
            </div>
            <div class="sp-tab-panel" data-panel="theme">
                <fieldset>
                    <legend>Tema</legend>
                    <p style="font-size:0.85em;color:var(--text-muted);margin:0 0 10px">Visuelt tema for denne konteksten. Klikk en flis for å velge.</p>
                    <input type="hidden" data-f="theme" value="${escapeHtml(s.theme || 'paper')}">
                    <div class="theme-grid">${this._themes.map(t => this._themeSwatchHtml(t, s.theme || 'paper')).join('')}</div>
                    <div class="theme-actions">
                        <button type="button" data-theme-clone>🧬 Klon valgt tema</button>
                        <a href="/themes" target="_blank" rel="noopener">🎨 Åpne temaeditor ↗</a>
                    </div>
                </fieldset>
            </div>
            <div class="sp-tab-panel" data-panel="tags">
                <fieldset>
                    <legend>Tilgjengelige tagger</legend>
                    <p style="font-size:0.85em;color:var(--text-muted);margin:0 0 10px">Tagger (tema) for autofullføring i notatredigereren og som filter på notater-siden.</p>
                    <div data-tag-view${tags.length === 0 ? ' hidden' : ''}>
                        <ul class="tag-list">
                            ${tags.map(t => `<li class="tag-list-item"><span class="tag-name">${escapeHtml(t)}</span></li>`).join('')}
                        </ul>
                    </div>
                    <div data-tag-empty class="tag-list-empty"${tags.length === 0 ? '' : ' hidden'}>Ingen tagger ennå.</div>
                    <div data-tag-edit hidden>
                        <tag-editor data-f="availableThemes" value="${escapeHtml(tags.join(','))}" placeholder="Legg til tag…"></tag-editor>
                    </div>
                    <div class="tag-edit-bar">
                        <button type="button" class="primary" data-tag-edit-btn>✏️ Rediger tagger</button>
                        <button type="button" data-tag-done-btn hidden>✓ Ferdig</button>
                    </div>
                </fieldset>
            </div>
            <div class="sp-tab-panel" data-panel="hours">
                <fieldset>
                    <legend>Synlig tid på kalenderen</legend>
                    <p style="font-size:0.85em;color:var(--text-muted);margin:0 0 10px">Viser kun timene mellom disse på kalendersiden.</p>
                    <div class="row">
                        <label>Fra
                            <select data-f="visibleStartHour">
                                ${Array.from({length:24},(_,h)=>{const v=String(h).padStart(2,'0');const cur=String(s.visibleStartHour ?? 0).padStart(2,'0');return `<option value="${v}"${v===cur?' selected':''}>${v}:00</option>`;}).join('')}
                            </select>
                        </label>
                        <label>Til
                            <select data-f="visibleEndHour">
                                ${Array.from({length:24},(_,h)=>{const hr=h+1;const v=String(hr).padStart(2,'0');const cur=String(s.visibleEndHour ?? 24).padStart(2,'0');return `<option value="${v}"${v===cur?' selected':''}>${v}:00</option>`;}).join('')}
                            </select>
                        </label>
                    </div>
                </fieldset>
                <fieldset>
                    <legend>Arbeidstid (per ukedag)</legend>
                    <div class="wh-grid">${whRows}</div>
                </fieldset>
            </div>
            <div class="sp-tab-panel" data-panel="meetings">
                <fieldset>
                    <legend>Generelt</legend>
                    <div class="row">
                        <label>Standard møtelengde (min)
                            <input type="number" min="5" max="600" step="5" data-f="defaultMeetingMinutes" value="${escapeHtml(s.defaultMeetingMinutes || 60)}" style="width:90px">
                        </label>
                        <label>Kommende møter (dager)
                            <input type="number" min="1" max="365" data-f="upcomingMeetingsDays" value="${escapeHtml(s.upcomingMeetingsDays || 14)}" style="width:90px">
                        </label>
                    </div>
                </fieldset>
                <fieldset>
                    <legend>Møtetyper</legend>
                    <p style="font-size:0.85em;color:var(--text-muted);margin:0 0 10px">Brukes på kalenderen (høyreklikk for å opprette møte) og i nytt-møte-skjemaet. <code>Nøkkel</code> må være unik (lowercase).</p>
                    <div class="mt-list" data-mt-list>
                        ${(Array.isArray(s.meetingTypes) && s.meetingTypes.length ? s.meetingTypes : DEFAULT_MEETING_TYPES).map((mt, i) => this._mtRowHtml(mt, i)).join('')}
                    </div>
                    <button type="button" class="mt-add" data-mt-add>+ Ny type</button>
                </fieldset>
            </div>
            <div class="sp-tab-panel" data-panel="git">
                <fieldset>
                    <legend>Git</legend>
                    <p style="font-size:0.85em;color:var(--text-muted);margin:0 0 10px">Hver kontekst lagres som sitt eget git-repo i <code>data/${escapeHtml(this._selected || '')}/</code>. Eksplisitte lagringer blir automatisk committet.</p>
                    <label style="display:block">Remote
                        <input type="text" data-f="remote" value="${escapeHtml(s.remote || '')}" placeholder="git@github.com:user/repo.git">
                    </label>
                    <div class="git-info" data-git-info style="margin-top:12px;font-size:0.9em;color:var(--text-muted)">Henter git-status…</div>
                    <div class="git-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                        <button type="button" data-git-commit>✓ Commit endringer</button>
                        <button type="button" data-git-push>⬆️ Push</button>
                        <button type="button" data-git-pull>⬇️ Pull</button>
                        <button type="button" data-git-refresh>🔄 Oppdater</button>
                    </div>
                    <div class="git-status-msg" data-git-msg style="margin-top:8px;font-size:0.85em"></div>
                </fieldset>
            </div>
            <div class="actions">
                <span class="status" data-status></span>
                <button type="button" class="save">💾 Lagre</button>
            </div>
        `;

        // Tab switching
        const tabBtns = detailEl.querySelectorAll('.sp-tab-btn');
        const tabPanels = detailEl.querySelectorAll('.sp-tab-panel');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-tab');
                tabBtns.forEach(b => b.classList.toggle('is-active', b === btn));
                tabPanels.forEach(p => p.classList.toggle('is-active', p.getAttribute('data-panel') === target));
                try { localStorage.setItem('spSettingsTab', target); } catch {}
                if (target === 'git') this._loadGitInfo(detailEl);
            });
        });
        try {
            const saved = localStorage.getItem('spSettingsTab');
            if (saved) {
                const targetBtn = detailEl.querySelector(`.sp-tab-btn[data-tab="${saved}"]`);
                if (targetBtn) targetBtn.click();
            }
        } catch {}

        detailEl.querySelectorAll('[data-wh-on]').forEach(cb => {
            cb.addEventListener('change', () => {
                const row = cb.closest('.wh-row');
                row.querySelector('[data-wh-range]').disabled = !cb.checked;
            });
        });

        const ctxIconBtn = detailEl.querySelector('[data-f="icon"]');
        if (ctxIconBtn && ctxIconBtn.tagName === 'BUTTON') {
            ctxIconBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this._openIconPicker(ctxIconBtn, detailEl); });
        }

        const themeGrid = detailEl.querySelector('.theme-grid');
        const themeInput = detailEl.querySelector('input[data-f="theme"]');
        if (themeGrid && themeInput) {
            const isActiveCtx = c.id === this._active;
            const applyLive = (id) => {
                if (!isActiveCtx) return;
                const link = document.getElementById('themeStylesheet');
                if (link) link.href = '/themes/' + id + '.css?ts=' + Date.now();
            };
            themeGrid.addEventListener('click', (ev) => {
                const sw = ev.target.closest('.theme-swatch');
                if (!sw) return;
                const id = sw.dataset.themeId;
                themeInput.value = id;
                themeGrid.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('is-selected', s === sw));
                applyLive(id);
            });
            const cloneBtn = detailEl.querySelector('[data-theme-clone]');
            if (cloneBtn) {
                cloneBtn.addEventListener('click', async () => {
                    const fromId = themeInput.value || 'paper';
                    const fromTheme = this._themes.find(t => t.id === fromId);
                    const baseName = (fromTheme && fromTheme.name || fromId) + ' (kopi)';
                    const name = prompt('Navn på det nye temaet:', baseName);
                    if (!name || !name.trim()) return;
                    cloneBtn.disabled = true;
                    try {
                        const settingsSvc = this.service;
                        const d = await settingsSvc.createTheme({ from: fromId, name: name.trim() });
                        if (!d || d.error) throw new Error((d && d.error) || 'Klon feilet');
                        // refresh themes list
                        const list = await settingsSvc.listThemes();
                        this._themes = (list || []).map(t => typeof t === 'string' ? { id: t, name: t } : t);
                        // re-render the grid
                        const newId = d.id || (d.theme && d.theme.id) || name.trim().toLowerCase().replace(/\s+/g, '-');
                        themeInput.value = newId;
                        themeGrid.innerHTML = this._themes.map(t => this._themeSwatchHtml(t, newId)).join('');
                        applyLive(newId);
                    } catch (e) {
                        alert('Klon feilet: ' + (e.message || e));
                    } finally {
                        cloneBtn.disabled = false;
                    }
                });
            }
        }

        const mtList = detailEl.querySelector('[data-mt-list]');
        const mtAdd = detailEl.querySelector('[data-mt-add]');
        if (mtList) {
            mtList.addEventListener('click', (ev) => {
                const del = ev.target.closest('[data-mt-del]');
                if (del) { del.closest('.mt-row').remove(); return; }
                const iconBtn = ev.target.closest('[data-mt-icon]');
                if (iconBtn) { ev.stopPropagation(); this._openIconPicker(iconBtn, detailEl); }
            });
        }
        if (mtAdd && mtList) {
            mtAdd.addEventListener('click', () => {
                const idx = mtList.querySelectorAll('.mt-row').length;
                mtList.insertAdjacentHTML('beforeend', this._mtRowHtml({ icon: '', key: '', label: '' }, idx));
            });
        }

        const swBtn = detailEl.querySelector('[data-switch]');
        if (swBtn) swBtn.addEventListener('click', () => this._switchTo(c.id, detailEl));

        const tagEditBtn = detailEl.querySelector('[data-tag-edit-btn]');
        const tagDoneBtn = detailEl.querySelector('[data-tag-done-btn]');
        if (tagEditBtn && tagDoneBtn) {
            tagEditBtn.addEventListener('click', () => this._toggleTagEdit(detailEl, true));
            tagDoneBtn.addEventListener('click', () => this._toggleTagEdit(detailEl, false));
        }

        detailEl.querySelector('.save').addEventListener('click', () => this._save(c, detailEl));
    }

    _toggleTagEdit(detailEl, editing) {
        const view = detailEl.querySelector('[data-tag-view]');
        const empty = detailEl.querySelector('[data-tag-empty]');
        const edit = detailEl.querySelector('[data-tag-edit]');
        const editBtn = detailEl.querySelector('[data-tag-edit-btn]');
        const doneBtn = detailEl.querySelector('[data-tag-done-btn]');
        const te = detailEl.querySelector('tag-editor[data-f="availableThemes"]');
        if (editing) {
            if (view) view.hidden = true;
            if (empty) empty.hidden = true;
            if (edit) edit.hidden = false;
            if (editBtn) editBtn.hidden = true;
            if (doneBtn) doneBtn.hidden = false;
            setTimeout(() => {
                const inp = te && te.shadowRoot && te.shadowRoot.querySelector('input');
                if (inp) inp.focus();
            }, 50);
        } else {
            if (edit) edit.hidden = true;
            if (editBtn) editBtn.hidden = false;
            if (doneBtn) doneBtn.hidden = true;
            const tags = (te && te.tags) ? te.tags.slice() : [];
            if (view) {
                view.hidden = tags.length === 0;
                const ul = view.querySelector('.tag-list');
                if (ul) ul.innerHTML = tags.map(t => `<li class="tag-list-item"><span class="tag-name">${escapeHtml(t)}</span></li>`).join('');
            }
            if (empty) empty.hidden = tags.length > 0;
        }
    }

    async _switchTo(id, detailEl) {
        const status = detailEl.querySelector('[data-status]');
        if (status) status.textContent = '⏳ Bytter…';
        try {
            const ctxSvc = this.serviceFor('context');
            await ctxSvc.switchTo(id);
            try {
                const ctx = (this._contexts || []).find(c => c.id === id);
                const theme = ctx && ctx.settings && ctx.settings.theme;
                const link = document.getElementById('themeStylesheet');
                if (link && theme) {
                    link.href = '/themes/' + encodeURIComponent(theme) + '.css?ts=' + Date.now();
                }
            } catch (_) { /* best effort */ }
            location.reload();
        } catch (_) {
            if (status) status.textContent = '❌ Kunne ikke bytte';
        }
    }

    _collectForm(detailEl) {
        const f = (k) => {
            const el = detailEl.querySelector(`[data-f="${k}"]`);
            if (!el) return '';
            if (el.tagName === 'BUTTON') return el.dataset.iconValue || '';
            if (el.tagName === 'TAG-EDITOR') return el.tags || [];
            return el.value;
        };
        const wh = DAY_NAMES.map((_, i) => {
            const row = detailEl.querySelector(`[data-wh-row="${i}"]`);
            if (!row) return null;
            const on = row.querySelector('[data-wh-on]').checked;
            if (!on) return null;
            const raw = (row.querySelector('[data-wh-range]').value || '').trim();
            const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw);
            if (!m) return null;
            const pad = n => String(n).padStart(2, '0');
            return {
                start: pad(m[1]) + ':' + m[2],
                end: pad(m[3]) + ':' + m[4],
            };
        });
        const tagsVal = f('availableThemes');
        return {
            icon: f('icon').trim(),
            name: f('name').trim(),
            description: f('description'),
            remote: (f('remote') || '').trim(),
            theme: f('theme'),
            availableThemes: Array.isArray(tagsVal) ? tagsVal : String(tagsVal || '').split(',').map(s => s.trim()).filter(Boolean),
            upcomingMeetingsDays: parseInt(f('upcomingMeetingsDays'), 10) || 14,
            visibleStartHour: Math.max(0, Math.min(23, parseInt(f('visibleStartHour'), 10) || 0)),
            visibleEndHour: Math.max(1, Math.min(24, parseInt(f('visibleEndHour'), 10) || 24)),
            defaultMeetingMinutes: Math.max(5, Math.min(600, parseInt(f('defaultMeetingMinutes'), 10) || 60)),
            workHours: wh,
            meetingTypes: this._collectMeetingTypes(detailEl),
        };
    }

    _openIconPicker(btn, container) {
        let pop = container.querySelector(':scope > .mt-icon-pop');
        if (!pop) {
            pop = document.createElement('div');
            pop.className = 'mt-icon-pop';
            const ip = document.createElement('icon-picker');
            pop.appendChild(ip);
            container.appendChild(pop);
            ip.addEventListener('valueChanged', (ev) => {
                const target = pop._target;
                if (target) {
                    const v = ev.detail && ev.detail.value || '';
                    target.dataset.iconValue = v;
                    target.textContent = v || '·';
                }
                pop.removeAttribute('data-open');
                pop._target = null;
            });
            document.addEventListener('click', (ev) => {
                if (!pop.hasAttribute('data-open')) return;
                if (pop.contains(ev.target) || ev.target === pop._target) return;
                pop.removeAttribute('data-open');
                pop._target = null;
            });
            document.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape' && pop.hasAttribute('data-open')) {
                    pop.removeAttribute('data-open');
                    pop._target = null;
                }
            });
        }
        const ip = pop.querySelector('icon-picker');
        const set = btn.dataset.iconSet || 'meeting';
        if (pop._set !== set) {
            if (set === 'context') {
                ip.setAttribute('columns', '5');
                ip.setAttribute('groups', JSON.stringify(CONTEXT_ICON_GROUPS));
            } else {
                ip.setAttribute('columns', '7');
                ip.setAttribute('groups', JSON.stringify(MEETING_ICON_GROUPS));
            }
            pop._set = set;
        }
        ip.value = btn.dataset.iconValue || '';
        pop._target = btn;
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const dRect = container.getBoundingClientRect();
        const bRect = btn.getBoundingClientRect();
        pop.style.top = (bRect.bottom - dRect.top + 4) + 'px';
        pop.style.left = (bRect.left - dRect.left) + 'px';
        pop.setAttribute('data-open', '');
    }

    _themeSwatchHtml(t, current) {
        const v = t.vars || {};
        const id = t.id;
        const name = t.name || id;
        const sel = id === current ? ' is-selected' : '';
        const custom = t.builtin === false;
        const bg = escapeHtml(v.bg || '#fff');
        const surfaceHead = escapeHtml(v['surface-head'] || v.surface || bg);
        const border = escapeHtml(v['border-faint'] || v.border || '#ccc');
        const accent = escapeHtml(v.accent || '#333');
        const muted = escapeHtml(v['text-muted-warm'] || v['text-muted'] || accent);
        const subtle = escapeHtml(v['text-subtle'] || muted);
        return `<button type="button" class="theme-swatch${sel}${custom ? ' is-custom' : ''}" data-theme-id="${escapeHtml(id)}" title="${escapeHtml(name)}${custom ? ' (egendefinert)' : ''}">
            ${custom ? `<span class="theme-badge" title="Egendefinert">✎</span>` : ''}
            <span class="theme-preview" style="background:${bg};">
                <span class="theme-bar" style="background:${surfaceHead};border-bottom:1px solid ${border};"></span>
                <span class="theme-body">
                    <span class="theme-line theme-line-1" style="background:${accent};"></span>
                    <span class="theme-line theme-line-2" style="background:${muted};"></span>
                    <span class="theme-line theme-line-3" style="background:${subtle};"></span>
                </span>
            </span>
            <span class="theme-name">${escapeHtml(name)}</span>
        </button>`;
    }

    _mtRowHtml(mt, i) {
        const icon = escapeHtml(mt && mt.icon || '');
        const key = escapeHtml(mt && (mt.key || mt.typeId) || '');
        const label = escapeHtml(mt && (mt.label || mt.name) || '');
        const color = escapeHtml(mt && mt.color || '#888888');
        const allDay = !!(mt && (mt.allDay || mt.fullDay));
        const mins = (mt && mt.defaultMinutes != null && mt.defaultMinutes !== '') ? String(mt.defaultMinutes) : '';
        return `<div class="mt-row" data-mt-row="${i}">
            <button type="button" data-mt-icon data-icon-value="${icon}" title="Velg ikon">${icon || '·'}</button>
            <input type="color" data-mt-color value="${color}" title="Farge">
            <input type="text" data-mt-key value="${key}" placeholder="meeting">
            <input type="text" data-mt-label value="${label}" placeholder="Etikett">
            <input type="number" data-mt-min value="${escapeHtml(mins)}" placeholder="min" min="5" step="5" title="Standard varighet (min)">
            <label class="mt-allday" title="Heldagshendelse (vises som linje øverst)">
                <input type="checkbox" data-mt-allday${allDay ? ' checked' : ''}>heldag
            </label>
            <button type="button" class="mt-del" data-mt-del title="Fjern">🗑️</button>
        </div>`;
    }

    _collectMeetingTypes(detailEl) {
        const rows = detailEl.querySelectorAll('.mt-row');
        const out = [];
        rows.forEach(r => {
            const key = (r.querySelector('[data-mt-key]').value || '').trim().toLowerCase();
            if (!key) return;
            const icon = (r.querySelector('[data-mt-icon]').dataset.iconValue || '').trim();
            const label = (r.querySelector('[data-mt-label]').value || '').trim() || key;
            const colorEl = r.querySelector('[data-mt-color]');
            const color = (colorEl && colorEl.value || '').trim();
            const allDayEl = r.querySelector('[data-mt-allday]');
            const allDay = !!(allDayEl && allDayEl.checked);
            const minEl = r.querySelector('[data-mt-min]');
            const minRaw = minEl ? (minEl.value || '').trim() : '';
            const mins = minRaw === '' ? null : parseInt(minRaw, 10);
            const row = { key, icon, label };
            if (color) row.color = color;
            if (allDay) row.allDay = true;
            if (mins != null && !isNaN(mins) && mins > 0) row.defaultMinutes = mins;
            out.push(row);
        });
        return out;
    }

    async _loadGitInfo(detailEl) {
        const id = this._selected;
        const info = detailEl.querySelector('[data-git-info]');
        const msg = detailEl.querySelector('[data-git-msg]');
        if (!id || !info) return;
        info.textContent = 'Henter git-status…';
        if (msg) { msg.textContent = ''; msg.style.color = ''; }
        try {
            const ctxSvc = this.serviceFor('context');
            const data = await ctxSvc.gitStatus(id);
            this._renderGitInfo(info, data);
        } catch (e) {
            info.textContent = 'Kunne ikke hente git-status: ' + (e.message || e);
        }
        // Wire actions (idempotent)
        const wire = (sel, fn) => {
            const b = detailEl.querySelector(sel);
            if (!b || b.dataset.wired === '1') return;
            b.dataset.wired = '1';
            b.addEventListener('click', fn);
        };
        const action = async (label, fn) => {
            if (!msg) return;
            msg.textContent = '⏳ ' + label + '…'; msg.style.color = '';
            try {
                const r = await fn();
                if (r && r.ok === false) throw new Error(r.error || 'Operasjonen feilet');
                msg.textContent = '✓ ' + label + ' OK'; msg.style.color = 'var(--accent)';
                this._loadGitInfo(detailEl);
            } catch (e) {
                msg.textContent = '❌ ' + (e.message || 'Feilet'); msg.style.color = 'var(--danger)';
            }
        };
        wire('[data-git-commit]', () => {
            const m = prompt('Commit-melding:', 'Manuell commit');
            if (!m) return;
            const ctxSvc = this.serviceFor('context');
            action('Commit', () => ctxSvc.commit(id, { message: m }));
        });
        wire('[data-git-push]', () => {
            const ctxSvc = this.serviceFor('context');
            action('Push', () => ctxSvc.push(id));
        });
        wire('[data-git-pull]', () => {
            const ctxSvc = this.serviceFor('context');
            action('Pull', () => ctxSvc.pull(id));
        });
        wire('[data-git-refresh]', () => this._loadGitInfo(detailEl));
    }

    _renderGitInfo(el, data) {
        if (!data) { el.textContent = '—'; return; }
        if (!data.isRepo) { el.innerHTML = '<em>Ikke et git-repo enda. Eksplisitte lagringer vil opprette ett.</em>'; return; }
        const parts = [];
        parts.push(`<div><strong>Status:</strong> ${data.dirty ? '<span style="color:var(--danger)">● Endringer som ikke er committet</span>' : '<span style="color:var(--accent)">● Rent (alt committet)</span>'}</div>`);
        if (data.remote) {
            parts.push(`<div><strong>Remote:</strong> <code>${escapeHtml(data.remote)}</code></div>`);
        } else {
            parts.push('<div><strong>Remote:</strong> <em>Ingen</em></div>');
        }
        if (data.last) {
            const d = data.last.date ? new Date(data.last.date).toLocaleString('nb-NO') : '';
            parts.push(`<div><strong>Siste commit:</strong> <code>${escapeHtml(data.last.hash || '')}</code> · ${escapeHtml(d)}</div>`);
            if (data.last.subject) parts.push(`<div style="margin-left:1em;color:var(--text-strong)">"${escapeHtml(data.last.subject)}"</div>`);
        } else {
            parts.push('<div><em>Ingen commits ennå.</em></div>');
        }
        el.innerHTML = parts.join('');
    }

    async _save(ctx, detailEl) {
        const status = detailEl.querySelector('[data-status]');
        const merged = Object.assign({}, ctx.settings || {}, this._collectForm(detailEl));
        if (status) { status.textContent = '⏳ Lagrer…'; status.style.color = ''; }
        try {
            const settingsSvc = this.service;
            const data = await settingsSvc.saveSettings(ctx.id, merged);
            if (data && data.error) throw new Error(data.error);
            if (status) { status.textContent = '✓ Lagret'; status.style.color = 'var(--accent)'; }
            // Refresh underlying data, but keep selection.
            const keep = this._selected;
            await this.refresh();
            this._selected = keep;
            const railEl = this.shadowRoot.querySelector('.sp-rail');
            if (railEl) this._renderRail(railEl);
            // Don't re-render detail to keep cursor focus, status remains visible briefly.
            // Apply theme right away if we updated it for the active context.
            if (ctx.id === this._active) {
                const link = document.getElementById('themeStylesheet');
                if (link && merged.theme) link.href = '/themes/' + merged.theme + '.css?ts=' + Date.now();
            }
        } catch (e) {
            if (status) { status.textContent = '❌ ' + (e.message || 'Lagring feilet'); status.style.color = 'var(--danger)'; }
        }
    }
}

if (!customElements.get('settings-page')) customElements.define('settings-page', SettingsPage);
