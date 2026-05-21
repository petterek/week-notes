/**
 * <team-status-page> — Team status/relations page.
 *
 * Shows all relations for a team:
 *   - Members (people details)
 *   - Notes mentioning the team
 *   - Meetings with team members
 *   - Tasks assigned to team members
 *
 * Reads the team key from the current URL path: /team/:key
 * Fetches /api/teams/:key/status for aggregated data.
 */
import { WNElement, html, escapeHtml, unsafeHTML, linkMentions, isoWeek } from './_shared.js';

const STYLES = `
    :host { display: block; padding: 20px 24px; box-sizing: border-box; color: var(--text-strong); font: inherit; }
    .ts { max-width: 1000px; }
    .ts-head { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .ts-head h1 { margin: 0; font-family: var(--font-heading, Georgia, serif); font-weight: 400; color: var(--accent); }
    .ts-key { font-size: 0.85em; color: var(--text-muted); background: var(--surface-alt); padding: 2px 10px; border-radius: 12px; }
    .ts-back { font-size: 0.85em; color: var(--accent); text-decoration: none; }
    .ts-back:hover { text-decoration: underline; }

    .ts-section { margin-bottom: 32px; }
    .ts-section h2 {
        font-size: 1em; font-weight: 700; color: var(--accent);
        text-transform: uppercase; letter-spacing: 0.05em;
        margin: 0 0 12px; padding-bottom: 6px;
        border-bottom: 2px solid var(--border-soft);
    }

    .ts-members { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
    .ts-member {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 14px; background: var(--surface); border: 1px solid var(--border-soft);
        border-radius: 8px; text-decoration: none; color: var(--text);
    }
    .ts-member:hover { border-color: var(--accent); }
    .ts-member-icon { font-size: 1.4em; }
    .ts-member-info { flex: 1; min-width: 0; }
    .ts-member-name { font-weight: 600; color: var(--text-strong); }
    .ts-member-meta { font-size: 0.8em; color: var(--text-muted); }

    .ts-notes { display: flex; flex-direction: column; gap: 8px; }
    .ts-note {
        display: block; padding: 10px 14px; background: var(--surface);
        border: 1px solid var(--border-soft); border-radius: 8px;
        text-decoration: none; color: var(--text);
    }
    .ts-note:hover { border-color: var(--accent); }
    .ts-note-title { font-weight: 600; color: var(--text-strong); }
    .ts-note-week { font-size: 0.8em; color: var(--text-muted); margin-left: 8px; }
    .ts-note-snippet { font-size: 0.85em; color: var(--text-muted); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .ts-meetings { display: flex; flex-direction: column; gap: 8px; }
    .ts-meeting {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 14px; background: var(--surface);
        border: 1px solid var(--border-soft); border-radius: 8px;
        text-decoration: none; color: var(--text);
    }
    .ts-meeting:hover { border-color: var(--accent); }
    .ts-meeting-icon { font-size: 1.2em; }
    .ts-meeting-info { flex: 1; min-width: 0; }
    .ts-meeting-title { font-weight: 600; color: var(--text-strong); }
    .ts-meeting-meta { font-size: 0.8em; color: var(--text-muted); }
    .ts-meeting-att { font-size: 0.8em; color: var(--text-subtle); }

    .ts-tasks { display: flex; flex-direction: column; gap: 8px; }
    .ts-task {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 10px 14px; background: var(--surface);
        border: 1px solid var(--border-soft); border-radius: 8px;
    }
    .ts-task-check { font-size: 1.1em; flex-shrink: 0; }
    .ts-task-info { flex: 1; min-width: 0; }
    .ts-task-text { color: var(--text-strong); }
    .ts-task-text.done { text-decoration: line-through; color: var(--text-muted); }
    .ts-task-meta { font-size: 0.8em; color: var(--text-muted); margin-top: 2px; }

    .ts-empty { color: var(--text-subtle); font-style: italic; font-size: 0.9em; }
    .ts-loading { color: var(--text-muted); font-style: italic; }

    .ts-badge { display: inline-block; font-size: 0.75em; padding: 1px 8px; border-radius: 10px; background: var(--surface-alt); color: var(--text-muted); margin-left: 8px; }
`;

export class TeamStatusPage extends WNElement {
    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._data = null;
        this._error = null;
        this._teamKey = this._extractKey();
        this._fetchData();
    }

    _extractKey() {
        const m = location.pathname.match(/^\/team\/([^/]+)$/);
        return m ? decodeURIComponent(m[1]) : '';
    }

    async _fetchData() {
        if (!this._teamKey) { this._error = 'No team key'; this.requestRender(); return; }
        try {
            const resp = await fetch(`/api/teams/${encodeURIComponent(this._teamKey)}/status`);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            this._data = await resp.json();
        } catch (e) {
            this._error = e.message;
        }
        this.requestRender();
    }

    render() {
        if (this._error) return html`<div class="ts"><p class="ts-empty">Feil: ${this._error}</p></div>`;
        if (!this._data) return html`<div class="ts"><p class="ts-loading">Laster teamstatus…</p></div>`;

        const { team, memberDetails, notesMentioning, meetings, tasks } = this._data;
        const openTasks = tasks.filter(t => !t.done);
        const doneTasks = tasks.filter(t => t.done).slice(0, 20);

        return html`
        <div class="ts">
            <a href="/people#t-teams" class="ts-back">← Tilbake til personer</a>
            <div class="ts-head">
                <h1>👥 ${team.name}</h1>
                <span class="ts-key">@${team.key}</span>
                <span class="ts-badge">${(team.members || []).length} medlemmer</span>
            </div>

            ${this._renderMembers(memberDetails)}
            ${this._renderNotes(notesMentioning)}
            ${this._renderMeetings(meetings)}
            ${this._renderTasks(openTasks, doneTasks)}
        </div>`;
    }

    _renderMembers(members) {
        if (!members || members.length === 0) {
            return html`<section class="ts-section"><h2>👤 Medlemmer</h2><p class="ts-empty">Ingen medlemmer</p></section>`;
        }
        const cards = members.map(p => {
            const name = p.name || p.key;
            const meta = [p.title, p.primaryCompanyKey ? `🏢 ${p.primaryCompanyKey}` : ''].filter(Boolean).join(' · ');
            return html`
                <a class="ts-member" href="/people#p-${encodeURIComponent(p.key)}">
                    <span class="ts-member-icon">👤</span>
                    <span class="ts-member-info">
                        <span class="ts-member-name">${name}</span>
                        ${meta ? html`<br><span class="ts-member-meta">${meta}</span>` : ''}
                    </span>
                </a>`;
        });
        return html`<section class="ts-section"><h2>👤 Medlemmer <span class="ts-badge">${members.length}</span></h2><div class="ts-members">${cards}</div></section>`;
    }

    _renderNotes(notes) {
        if (!notes || notes.length === 0) {
            return html`<section class="ts-section"><h2>📝 Notater som nevner teamet</h2><p class="ts-empty">Ingen notater nevner @${this._teamKey}</p></section>`;
        }
        const items = notes.map(n => html`
            <a class="ts-note" href="${n.href}">
                <span class="ts-note-title">${n.title}</span>
                <span class="ts-note-week">${n.week}</span>
                ${n.snippet ? html`<div class="ts-note-snippet">${n.snippet}</div>` : ''}
            </a>`);
        return html`<section class="ts-section"><h2>📝 Notater <span class="ts-badge">${notes.length}</span></h2><div class="ts-notes">${items}</div></section>`;
    }

    _renderMeetings(meetings) {
        if (!meetings || meetings.length === 0) {
            return html`<section class="ts-section"><h2>📅 Møter</h2><p class="ts-empty">Ingen møter med teammedlemmer</p></section>`;
        }
        const items = meetings.map(m => {
            const date = m.date || '';
            const time = [m.start, m.end].filter(Boolean).join('–');
            const att = (m.attendees || []).join(', ');
            return html`
                <a class="ts-meeting" href="/calendar/${m.date ? isoWeek(new Date(m.date + 'T00:00:00Z')) : ''}#m-${encodeURIComponent(m.id)}">
                    <span class="ts-meeting-icon">📅</span>
                    <span class="ts-meeting-info">
                        <span class="ts-meeting-title">${m.title || '(uten tittel)'}</span>
                        <span class="ts-meeting-meta">${date} ${time}</span>
                        ${att ? html`<span class="ts-meeting-att">Deltakere: ${att}</span>` : ''}
                    </span>
                </a>`;
        });
        return html`<section class="ts-section"><h2>📅 Møter <span class="ts-badge">${meetings.length}</span></h2><div class="ts-meetings">${items}</div></section>`;
    }

    _renderTasks(open, done) {
        const openItems = open.map(t => this._taskRow(t));
        const doneItems = done.map(t => this._taskRow(t));
        const hasAny = open.length > 0 || done.length > 0;
        return html`
        <section class="ts-section">
            <h2>☑️ Oppgaver <span class="ts-badge">${open.length} åpne</span></h2>
            ${!hasAny ? html`<p class="ts-empty">Ingen oppgaver knyttet til teammedlemmer</p>` : ''}
            ${open.length > 0 ? html`<div class="ts-tasks">${openItems}</div>` : ''}
            ${done.length > 0 ? html`
                <details style="margin-top: 12px;">
                    <summary style="cursor:pointer; color: var(--text-muted); font-size: 0.9em;">Fullførte oppgaver (${done.length})</summary>
                    <div class="ts-tasks" style="margin-top: 8px;">${doneItems}</div>
                </details>` : ''}
        </section>`;
    }

    _taskRow(t) {
        const check = t.done ? '✓' : '☐';
        const cls = t.done ? 'done' : '';
        const responsible = t.responsible ? `@${t.responsible}` : '';
        const participants = (t.participants || []).map(p => `@${p}`).join(', ');
        const people = [responsible, participants].filter(Boolean).join(' · ');
        const week = t.completedWeek || t.week || '';
        return html`
            <div class="ts-task">
                <span class="ts-task-check">${check}</span>
                <span class="ts-task-info">
                    <span class="ts-task-text ${cls}">${t.text || '(uten tittel)'}</span>
                    <div class="ts-task-meta">${people} ${week ? `· ${week}` : ''}</div>
                </span>
            </div>`;
    }
}

customElements.define('team-status-page', TeamStatusPage);
