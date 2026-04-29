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

const DEFAULT_MEETING_TYPES = [
    { key: 'meeting',  label: 'Møte',        icon: '👥', color: '#4a90e2' },
    { key: '1on1',     label: '1:1',         icon: '☕', color: '#a05a2c' },
    { key: 'standup',  label: 'Standup',     icon: '🔄', color: '#7ab648' },
    { key: 'workshop', label: 'Workshop',    icon: '🛠️', color: '#e08a3c' },
    { key: 'demo',     label: 'Demo',        icon: '🎬', color: '#9b59b6' },
    { key: 'planning', label: 'Planlegging', icon: '📋', color: '#3aa3a3' },
    { key: 'review',   label: 'Gjennomgang', icon: '🔍', color: '#34495e' },
    { key: 'social',   label: 'Sosialt',     icon: '🎉', color: '#e91e63' },
    { key: 'call',     label: 'Telefon',     icon: '📞', color: '#16a085' },
    { key: 'focus',    label: 'Fokus',       icon: '🎯', color: '#d35400' },
    { key: 'vacation', label: 'Ferie',       icon: '🌴', color: '#2ecc71', allDay: true },
];

const STYLES = `
    :host { display: block; height: 100%; box-sizing: border-box; }
    .sp { display: grid; grid-template-columns: 280px 1fr; gap: 16px; height: 100%; padding: 12px 16px; box-sizing: border-box; }
    @media (max-width: 760px) { .sp { grid-template-columns: 1fr; } }
    h1.sp-title { font-family: var(--font-heading); font-weight: 400; color: var(--accent); margin: 0 0 12px; font-size: 1.3em; }
    .sp-rail { background: var(--surface); border: 1px solid var(--border-soft); border-radius: 8px; padding: 8px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
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
    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .tag-chip { background: var(--accent-soft); color: var(--accent); padding: 2px 10px; border-radius: 12px; font-size: 0.82em; }
    .mt-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .mt-row { display: grid; grid-template-columns: 60px 44px 130px 1fr auto 36px; gap: 8px; align-items: center; }
    .mt-row input { padding: 4px 8px; font-size: 0.92em; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-strong); }
    .mt-row input[data-mt-icon] { text-align: center; font-size: 1.05em; }
    .mt-row input[data-mt-color] { padding: 0; height: 28px; width: 100%; cursor: pointer; }
    .mt-row label.mt-allday { display: flex; align-items: center; gap: 4px; font-size: 0.85em; color: var(--text-muted); white-space: nowrap; cursor: pointer; }
    .mt-row label.mt-allday input { width: auto; padding: 0; }
    .mt-row .mt-del { background: transparent; border: 0; color: var(--text-muted); cursor: pointer; font-size: 1em; }
    .mt-row .mt-del:hover { color: var(--danger, #c53030); }
    .mt-add { margin-top: 8px; padding: 5px 12px; border: 1px dashed var(--border); background: transparent; color: var(--text-strong); border-radius: 4px; cursor: pointer; font: inherit; font-size: 0.88em; }
    .mt-add:hover { background: var(--surface-alt); }
    .hours-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    @media (max-width: 700px) { .hours-grid { grid-template-columns: 1fr; } }
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
            const [ctxResp, themeResp] = await Promise.all([
                fetch('/api/contexts').then(r => r.json()),
                fetch('/api/themes').then(r => r.json()).catch(() => ({ themes: [] }))
            ]);
            this._active = ctxResp.active;
            this._contexts = ctxResp.contexts || [];
            this._themes = (themeResp.themes || themeResp || []).map(t => typeof t === 'string' ? { id: t, name: t } : t);
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
        railEl.innerHTML = items;
        railEl.querySelectorAll('.rail-item').forEach(el => {
            el.addEventListener('click', () => {
                this._selected = el.dataset.id;
                this._renderRail(railEl);
                this._renderDetail(this.shadowRoot.querySelector('.sp-detail'));
            });
        });
    }

    _renderDetail(detailEl) {
        const c = this._contexts.find(x => x.id === this._selected);
        if (!c) { detailEl.textContent = 'Ingen kontekst valgt.'; return; }
        const s = c.settings || {};
        const wh = Array.isArray(s.workHours) ? s.workHours : [];
        const themeOpts = this._themes.map(t =>
            `<option value="${escapeHtml(t.id)}"${t.id === s.theme ? ' selected' : ''}>${escapeHtml(t.name || t.id)}</option>`
        ).join('');
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
                <button type="button" class="sp-tab-btn" data-tab="tags">🏷️ Tagger</button>
                <button type="button" class="sp-tab-btn" data-tab="hours">🕓 Arbeidstid</button>
            </div>
            <div class="sp-tab-panel is-active" data-panel="general">
                <fieldset>
                    <legend>Generelt</legend>
                    <div class="row">
                        <label>Ikon
                            <input type="text" data-f="icon" value="${escapeHtml(s.icon || '')}" maxlength="4" style="width:60px">
                        </label>
                        <label style="flex:1; min-width:200px">Navn
                            <input type="text" data-f="name" value="${escapeHtml(s.name || '')}">
                        </label>
                        <label style="min-width:160px">Tema
                            <select data-f="theme">${themeOpts}</select>
                        </label>
                    </div>
                    <label style="display:block">Beskrivelse
                        <textarea data-f="description">${escapeHtml(s.description || '')}</textarea>
                    </label>
                    <div class="row" style="margin-top:10px">
                        <label>Kommende møter (dager)
                            <input type="number" min="1" max="365" data-f="upcomingMeetingsDays" value="${escapeHtml(s.upcomingMeetingsDays || 14)}" style="width:90px">
                        </label>
                    </div>
                </fieldset>
            </div>
            <div class="sp-tab-panel" data-panel="tags">
                <fieldset>
                    <legend>Tilgjengelige tagger</legend>
                    <p style="font-size:0.85em;color:var(--text-muted);margin:0 0 10px">Tagger (tema) for autofullføring i notatredigereren og som filter på notater-siden.</p>
                    <label style="display:block">Tagger (kommaseparert)
                        <input type="text" data-f="availableThemes" value="${escapeHtml(tags.join(', '))}" placeholder="planlegging, retro, status, kunde">
                    </label>
                    ${tags.length ? `<div class="tag-list">${tags.map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
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
                <fieldset>
                    <legend>Møtetyper</legend>
                    <p style="font-size:0.85em;color:var(--text-muted);margin:0 0 10px">Brukes på kalenderen (høyreklikk for å opprette møte) og i nytt-møte-skjemaet. <code>Nøkkel</code> må være unik (lowercase).</p>
                    <div class="mt-list" data-mt-list>
                        ${(Array.isArray(s.meetingTypes) && s.meetingTypes.length ? s.meetingTypes : DEFAULT_MEETING_TYPES).map((mt, i) => this._mtRowHtml(mt, i)).join('')}
                    </div>
                    <button type="button" class="mt-add" data-mt-add>+ Ny type</button>
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

        const mtList = detailEl.querySelector('[data-mt-list]');
        const mtAdd = detailEl.querySelector('[data-mt-add]');
        if (mtList) {
            mtList.addEventListener('click', (ev) => {
                const del = ev.target.closest('[data-mt-del]');
                if (del) del.closest('.mt-row').remove();
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

        detailEl.querySelector('.save').addEventListener('click', () => this._save(c, detailEl));
    }

    async _switchTo(id, detailEl) {
        const status = detailEl.querySelector('[data-status]');
        if (status) status.textContent = '⏳ Bytter…';
        try {
            await fetch('/api/contexts/switch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            location.reload();
        } catch (_) {
            if (status) status.textContent = '❌ Kunne ikke bytte';
        }
    }

    _collectForm(detailEl) {
        const f = (k) => {
            const el = detailEl.querySelector(`[data-f="${k}"]`);
            return el ? el.value : '';
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
        return {
            icon: f('icon').trim(),
            name: f('name').trim(),
            description: f('description'),
            theme: f('theme'),
            availableThemes: f('availableThemes').split(',').map(s => s.trim()).filter(Boolean),
            upcomingMeetingsDays: parseInt(f('upcomingMeetingsDays'), 10) || 14,
            visibleStartHour: Math.max(0, Math.min(23, parseInt(f('visibleStartHour'), 10) || 0)),
            visibleEndHour: Math.max(1, Math.min(24, parseInt(f('visibleEndHour'), 10) || 24)),
            workHours: wh,
            meetingTypes: this._collectMeetingTypes(detailEl),
        };
    }

    _mtRowHtml(mt, i) {
        const icon = escapeHtml(mt && mt.icon || '');
        const key = escapeHtml(mt && (mt.key || mt.typeId) || '');
        const label = escapeHtml(mt && (mt.label || mt.name) || '');
        const color = escapeHtml(mt && mt.color || '#888888');
        const allDay = !!(mt && (mt.allDay || mt.fullDay));
        return `<div class="mt-row" data-mt-row="${i}">
            <input type="text" data-mt-icon value="${icon}" placeholder="🤝" maxlength="4">
            <input type="color" data-mt-color value="${color}" title="Farge">
            <input type="text" data-mt-key value="${key}" placeholder="meeting">
            <input type="text" data-mt-label value="${label}" placeholder="Etikett">
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
            const icon = (r.querySelector('[data-mt-icon]').value || '').trim();
            const label = (r.querySelector('[data-mt-label]').value || '').trim() || key;
            const colorEl = r.querySelector('[data-mt-color]');
            const color = (colorEl && colorEl.value || '').trim();
            const allDayEl = r.querySelector('[data-mt-allday]');
            const allDay = !!(allDayEl && allDayEl.checked);
            const row = { key, icon, label };
            if (color) row.color = color;
            if (allDay) row.allDay = true;
            out.push(row);
        });
        return out;
    }

    async _save(ctx, detailEl) {
        const status = detailEl.querySelector('[data-status]');
        const merged = Object.assign({}, ctx.settings || {}, this._collectForm(detailEl));
        if (status) { status.textContent = '⏳ Lagrer…'; status.style.color = ''; }
        try {
            const r = await fetch('/api/contexts/' + encodeURIComponent(ctx.id) + '/settings', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(merged)
            });
            const data = await r.json();
            if (!r.ok || data.error) throw new Error(data.error || ('HTTP ' + r.status));
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
