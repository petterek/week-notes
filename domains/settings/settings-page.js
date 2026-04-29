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
    .wh-row { display: grid; grid-template-columns: 90px 80px 90px 90px auto; gap: 8px; align-items: center; padding: 4px 0; }
    .wh-row .day { font-weight: 600; color: var(--text-strong); }
    .wh-row .toggle { font-size: 0.85em; color: var(--text-muted); }
    .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; align-items: center; }
    .actions .status { color: var(--text-muted); font-size: 0.9em; margin-right: auto; }
    button.save { padding: 8px 18px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: var(--text-on-accent); font-weight: 600; cursor: pointer; font: inherit; }
    button.save:hover { filter: brightness(0.95); }
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
            <h1 class="sp-title" part="title">⚙️ Innstillinger</h1>
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
                <select data-wh-start ${enabled ? '' : 'disabled'}>${timeOpts(start)}</select>
                <select data-wh-end ${enabled ? '' : 'disabled'}>${timeOpts(end)}</select>
            </div>`;
        }).join('');

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
            <fieldset>
                <legend>Arbeidstid (per ukedag)</legend>
                ${whRows}
            </fieldset>
            <div class="actions">
                <span class="status" data-status></span>
                <button type="button" class="save">💾 Lagre</button>
            </div>
        `;

        detailEl.querySelectorAll('[data-wh-on]').forEach(cb => {
            cb.addEventListener('change', () => {
                const row = cb.closest('.wh-row');
                row.querySelector('[data-wh-start]').disabled = !cb.checked;
                row.querySelector('[data-wh-end]').disabled = !cb.checked;
            });
        });

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
            return {
                start: row.querySelector('[data-wh-start]').value,
                end: row.querySelector('[data-wh-end]').value
            };
        });
        return {
            icon: f('icon').trim(),
            name: f('name').trim(),
            description: f('description'),
            theme: f('theme'),
            upcomingMeetingsDays: parseInt(f('upcomingMeetingsDays'), 10) || 14,
            workHours: wh
        };
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
