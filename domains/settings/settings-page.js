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
    :host { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; min-height: 0; }
    .app-panel { padding: 12px 16px 0; flex-shrink: 0; }
    .app-title { margin: 0 0 10px; font-size: 1.1em; font-weight: 700; color: var(--text-strong); }
    .app-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-soft); margin-bottom: -1px; }
    .app-tab { background: none; border: 1px solid transparent; border-bottom: none; padding: 6px 14px; cursor: pointer; font: inherit; color: var(--text-muted); border-radius: 6px 6px 0 0; }
    .app-tab:hover { color: var(--text-strong); }
    .app-tab.is-active { background: var(--surface); border-color: var(--border-soft); color: var(--text-strong); font-weight: 600; }
    .app-tab-panels { border: 1px solid var(--border-soft); border-radius: 0 8px 8px 8px; background: var(--surface); padding: 14px 18px; height: 420px; overflow: auto; box-sizing: border-box; }
    .app-tab-panel { display: none; }
    .app-tab-panel.is-active { display: block; }
    .app-card { background: transparent; border: 0; border-radius: 0; padding: 0; position: relative; }
    .app-sep { border: 0; border-top: 1px solid var(--border-soft); margin: 14px 0; }
    .app-card.welcome h3 { margin: 0 0 6px; font-size: 1.05em; color: var(--text-strong); }
    .app-card.welcome > p { margin: 0 0 14px; color: var(--text-muted); max-width: 70ch; line-height: 1.5; }
    .welcome-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; max-width: 80ch; }
    .welcome-list li { color: var(--text-muted); font-size: 0.92em; line-height: 1.5; }
    .welcome-list strong { color: var(--text-strong); font-weight: 600; white-space: nowrap; }
    .welcome-list code { font-family: ui-monospace, monospace; font-size: 0.92em; background: var(--surface-alt); padding: 1px 4px; border-radius: 3px; }
    .welcome-meta { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 0.85em; color: var(--text-muted); padding-top: 10px; border-top: 1px solid var(--border-soft); }
    .welcome-meta a { color: var(--accent); text-decoration: none; }
    .welcome-meta a:hover { text-decoration: underline; }
    .app-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .app-head .vs-actions { margin-left: auto; }
    .app-help { color: var(--text-muted); font-size: 0.88em; margin: 4px 0 12px; }
    .app-help code { font-family: ui-monospace, monospace; font-size: 0.95em; background: var(--surface-alt); padding: 1px 4px; border-radius: 3px; }
    .vs-pill { font-size: 0.72em; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
    .vs-pill-btn { border: 1px solid transparent; cursor: pointer; font-family: inherit; }
    .vs-pill-btn:hover { filter: brightness(0.95); border-color: rgba(0,0,0,0.15); }
    .vs-pill-disabled { background: var(--border-faint); color: var(--text-muted); }
    .vs-pill-loading  { background: #fff5d6; color: #8a6300; }
    .vs-pill-ready    { background: #d6f5e0; color: #116b32; }
    .vs-pill-error    { background: #ffe2e2; color: #a02020; }
    .vs-form { display: grid; gap: 10px; }
    .vs-row { display: flex; flex-direction: row; align-items: center; gap: 10px; color: var(--text-strong); font-size: 1em; }
    .vs-row .vs-label { min-width: 80px; color: var(--text-muted); font-size: 0.9em; }
    .vs-row select { flex: 1; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-strong); font: inherit; }
    .vs-desc { margin: 0 0 4px 90px; font-size: 0.85em; color: var(--text-muted); min-height: 1.2em; }
    .vs-progress { margin: 0 0 4px 90px; display: flex; align-items: center; gap: 10px; }
    .vs-progress[hidden] { display: none; }
    .vs-progress-bar { flex: 1; height: 8px; background: var(--border-faint); border-radius: 4px; overflow: hidden; max-width: 260px; }
    .vs-progress-fill { height: 100%; background: var(--accent); width: 0%; transition: width 200ms ease-out; }
    .vs-progress-label { font-size: 0.82em; color: var(--text-muted); }
    .vs-actions { display: flex; align-items: center; gap: 12px; }
    .vs-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; color: var(--text-strong); font-size: 0.9em; }
    .vs-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.88em; }
    .vs-table th { text-align: left; padding: 6px 10px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border-soft); font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.04em; }
    .vs-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-faint); vertical-align: middle; }
    .vs-table tr.is-active td { background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .vs-table tr:hover:not(.is-active) td { background: var(--surface-alt); }
    .vs-table .vs-name { font-weight: 600; color: var(--text-strong); }
    .vs-table .vs-name small { display: block; font-weight: 400; color: var(--text-muted); font-size: 0.85em; margin-top: 1px; }
    .vs-table .vs-status-ok { color: #116b32; }
    .vs-table .vs-status-no { color: var(--text-muted); }
    .vs-table .vs-status-loading { color: #8a6300; font-weight: 600; font-size: 0.85em; }
    .vs-row-prog { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
    .vs-row-bar { height: 6px; border-radius: 999px; background: var(--border-faint); overflow: hidden; }
    .vs-row-fill { height: 100%; background: linear-gradient(90deg, #f5b942, #e89a14); transition: width 0.2s ease; }
    .vs-table tr.is-loading { background: #fff9e6; }
    .vs-table .vs-action { padding: 4px 10px; font: inherit; font-size: 0.88em; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); color: var(--text-strong); cursor: pointer; margin-left: 4px; }
    .vs-table .vs-action:first-child { margin-left: 0; }
    .vs-table .vs-action:hover { border-color: var(--accent); color: var(--accent); }
    .vs-table .vs-action.is-active-btn { border-color: var(--accent); background: var(--accent); color: var(--text-on-accent, white); cursor: default; }
    .vs-table .vs-action.vs-action-danger { padding: 4px 8px; }
    .vs-table .vs-action.vs-action-danger:hover { border-color: #c0392b; color: #c0392b; }
    .vs-table .vs-action:disabled { opacity: 0.5; cursor: default; }
    .vs-save { padding: 6px 14px; border: 1px solid var(--accent); background: var(--accent); color: var(--text-on-accent, white); border-radius: 6px; cursor: pointer; font: inherit; }
    .vs-save:hover { filter: brightness(0.95); }
    .vs-save:disabled { opacity: 0.55; cursor: default; }
    .vs-save-status { font-size: 0.85em; color: var(--text-muted); }
    .sp { display: grid; grid-template-columns: 280px 1fr; gap: 16px; flex: 1; min-height: 0; padding: 12px 16px; box-sizing: border-box; }
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
    .rail-disconnected { margin-top: 12px; border-top: 1px solid var(--border-soft); padding-top: 8px; }
    .rail-disconnected summary { cursor: pointer; font-size: 0.9em; color: var(--text-muted); padding: 4px 6px; }
    .rail-disconnected summary:hover { color: var(--text-strong); }
    .dc-list { list-style: none; padding: 0; margin: 4px 0 0; display: flex; flex-direction: column; gap: 2px; }
    .dc-item { display: flex; align-items: stretch; gap: 4px; }
    .dc-clone { flex: 1; display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid transparent; border-radius: 4px; background: transparent; cursor: pointer; text-align: left; font: inherit; color: var(--text-strong); }
    .dc-clone:hover { background: var(--surface-alt); border-color: var(--border-soft); }
    .dc-ic { font-size: 1.1em; }
    .dc-meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
    .dc-meta strong { font-size: 0.92em; font-weight: 500; }
    .dc-remote { font-size: 0.78em; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dc-forget { width: 28px; padding: 0; border: 1px solid transparent; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: 4px; }
    .dc-forget:hover { background: var(--surface-alt); color: var(--danger); border-color: var(--border-soft); }
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
    .ix-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
    .ix-card { background: var(--surface-alt); border: 1px solid var(--border-soft); border-radius: 8px; padding: 12px 14px; }
    .ix-head { margin-bottom: 6px; color: var(--text-strong); }
    .ix-help { font-size: 0.82em; color: var(--text-muted); margin: 0 0 10px; line-height: 1.4; }
    .ix-stats { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; font-size: 0.88em; }
    .ix-stats dt { color: var(--text-muted); font-weight: 500; }
    .ix-stats dd { margin: 0; color: var(--text-strong); font-variant-numeric: tabular-nums; word-break: break-all; }
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
        this._initAppSettings();
        this._initSummarizeSettings();
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();
        if (this._vsSse) { try { this._vsSse.close(); } catch {} this._vsSse = null; }
        if (this._smSse) { try { this._smSse.close(); } catch {} this._smSse = null; }
    }

    async _initAppSettings() {
        const root = this.shadowRoot;
        // Tab switching (currently a single tab, but ready for more).
        root.querySelectorAll('[data-app-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.appTab;
                root.querySelectorAll('[data-app-tab]').forEach(b => b.classList.toggle('is-active', b === btn));
                root.querySelectorAll('[data-app-panel]').forEach(p => p.classList.toggle('is-active', p.dataset.appPanel === key));
            });
        });

        const $ = (k) => root.querySelector(`[data-vs="${k}"]`);
        const tbody    = $('tbody');
        const progress = $('progress');
        const fill     = $('fill');
        const progLabel = $('progLabel');
        const status   = $('status');
        const saveStatus = $('saveStatus');
        if (!tbody) return;

        let models = [];
        let appSettings = null;
        const loadAppSettings = async () => {
            try {
                const r = await fetch('/api/app-settings');
                const d = await r.json();
                models = d.models || [];
                appSettings = d.settings;
                return true;
            } catch { return false; }
        };
        await loadAppSettings();

        const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

        // Latest SSE state — used by renderTable to decorate the loading row.
        let liveState = null;

        const renderTable = () => {
            const activeId = appSettings && appSettings.vectorSearch.enabled ? appSettings.vectorSearch.model : null;
            const loadingId = (liveState && liveState.phase === 'loading') ? liveState.model : null;
            const loadingPct = (liveState && liveState.progress && typeof liveState.progress.pct === 'number')
                ? Math.round(liveState.progress.pct) : null;
            tbody.innerHTML = models.map(m => {
                const isActive = m.id === activeId;
                const isLoading = m.id === loadingId;
                const downloaded = m.downloaded || isActive;
                let statusCell;
                if (isLoading) {
                    const pctTxt = loadingPct != null ? (loadingPct + '%') : '…';
                    statusCell = `<div class="vs-row-prog">
                        <span class="vs-status-loading">⬇ Laster ${pctTxt}</span>
                        <div class="vs-row-bar"><div class="vs-row-fill" style="width:${loadingPct != null ? loadingPct : 5}%"></div></div>
                    </div>`;
                } else if (downloaded) {
                    statusCell = `<span class="vs-status-ok">✓ Lastet ned</span>`;
                } else {
                    statusCell = `<span class="vs-status-no">Ikke lastet ned</span>`;
                }
                let actions;
                if (isLoading) {
                    actions = `<button class="vs-action" disabled>Laster…</button>`;
                } else if (isActive) {
                    actions = `<button class="vs-action is-active-btn" disabled>Aktiv</button>`;
                } else if (downloaded) {
                    actions = `<button class="vs-action" data-vs-act="${escapeHtml(m.id)}">Aktiver</button>
                        <button class="vs-action vs-action-danger" data-vs-del="${escapeHtml(m.id)}" title="Slett nedlastet modell">Slett</button>`;
                } else {
                    actions = `<button class="vs-action" data-vs-act="${escapeHtml(m.id)}">⬇ Last ned</button>`;
                }
                return `<tr class="${isActive ? 'is-active' : ''}${isLoading ? ' is-loading' : ''}">
                    <td><div class="vs-name">${escapeHtml(m.label)}${m.recommended ? ' <small style="display:inline;color:var(--accent);font-weight:600;margin-left:4px">Anbefalt</small>' : ''}<small>${escapeHtml(m.id)}</small></div></td>
                    <td>~${m.sizeMb}MB</td>
                    <td>${escapeHtml(m.languages)}</td>
                    <td>${escapeHtml(m.description)}</td>
                    <td>${statusCell}</td>
                    <td style="text-align:right; white-space:nowrap">${actions}</td>
                </tr>`;
            }).join('');
        };
        renderTable();

        const deleteModel = async (modelId) => {
            const m = models.find(x => x.id === modelId);
            if (!m) return;
            if (!confirm('Slette nedlastede filer for ' + m.label + '?\n\nDu kan laste den ned igjen senere.')) return;
            saveStatus.textContent = 'Sletter…';
            try {
                const r = await fetch('/api/app-settings/models/' + encodeURIComponent(modelId), { method: 'DELETE' });
                const d = await r.json();
                if (d.ok) {
                    saveStatus.textContent = '✓ Slettet';
                    await loadAppSettings();
                    renderTable();
                    refreshPill();
                } else {
                    saveStatus.textContent = '✗ ' + (d.error || 'Feil');
                }
            } catch (e) {
                saveStatus.textContent = '✗ ' + e.message;
            } finally {
                setTimeout(() => { saveStatus.textContent = ''; }, 3000);
            }
        };

        // Activate (and download if needed) a model when its row button is clicked.
        const activateModel = async (modelId) => {
            saveStatus.textContent = 'Aktiverer…';
            try {
                const body = { vectorSearch: { enabled: true, model: modelId } };
                const r = await fetch('/api/app-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const d = await r.json();
                if (d.ok) {
                    saveStatus.textContent = '✓ Aktivert';
                    await loadAppSettings();
                    renderTable();
                    refreshPill();
                } else {
                    saveStatus.textContent = '✗ ' + (d.error || 'Feil');
                }
            } catch (e) {
                saveStatus.textContent = '✗ ' + e.message;
            } finally {
                setTimeout(() => { saveStatus.textContent = ''; }, 3000);
            }
        };
        tbody.addEventListener('click', (ev) => {
            const act = ev.target.closest('[data-vs-act]');
            const del = ev.target.closest('[data-vs-del]');
            if (act) activateModel(act.dataset.vsAct);
            else if (del) deleteModel(del.dataset.vsDel);
        });

        const setPill = (phase, label) => {
            status.className = 'vs-pill vs-pill-btn vs-pill-' + phase;
            status.textContent = label;
        };

        // Pill click: toggles search on/off. When off and current model isn't
        // downloaded yet, the pill reads "Last ned og aktiver" — clicking it
        // activates the configured model (downloading first if needed).
        const refreshPill = () => {
            if (!appSettings) return;
            const enabled = appSettings.vectorSearch.enabled;
            // While loading/ready/error, applyState owns the pill.
            if (liveState && (liveState.phase === 'loading' || liveState.phase === 'ready' || liveState.phase === 'error')) return;
            if (enabled) {
                setPill('ready', 'Aktiv');
            } else {
                const cur = models.find(m => m.id === appSettings.vectorSearch.model);
                if (cur && !cur.downloaded) setPill('disabled', '⬇ Last ned og aktiver');
                else setPill('disabled', 'Stoppet');
            }
        };
        refreshPill();

        status.addEventListener('click', async () => {
            if (!appSettings) return;
            const newEnabled = !appSettings.vectorSearch.enabled;
            saveStatus.textContent = newEnabled ? 'Aktiverer…' : 'Slår av…';
            try {
                const body = { vectorSearch: { enabled: newEnabled, model: appSettings.vectorSearch.model } };
                const r = await fetch('/api/app-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const d = await r.json();
                saveStatus.textContent = d.ok ? '✓ Lagret' : ('✗ ' + (d.error || 'Feil'));
                await loadAppSettings();
                renderTable();
                refreshPill();
            } catch (e) {
                saveStatus.textContent = '✗ ' + e.message;
            } finally {
                setTimeout(() => { saveStatus.textContent = ''; }, 2500);
            }
        });

        // Reverse-index (BM25) toggle: pill click toggles enabled/disabled.
        const $si = (k) => root.querySelector(`[data-si="${k}"]`);
        const siStatus = $si('status');
        const siSaveStatus = $si('saveStatus');
        let siEnabled = appSettings && appSettings.searchIndex ? appSettings.searchIndex.enabled !== false : true;
        const renderSiPill = () => {
            if (!siStatus) return;
            siStatus.className = 'vs-pill vs-pill-btn ' + (siEnabled ? 'vs-pill-ready' : 'vs-pill-disabled');
            siStatus.textContent = siEnabled ? 'Aktiv' : 'Stoppet';
        };
        renderSiPill();
        if (siStatus) {
            siStatus.addEventListener('click', async () => {
                const next = !siEnabled;
                siStatus.disabled = true;
                siSaveStatus.textContent = next ? 'Aktiverer…' : 'Slår av…';
                try {
                    const body = { searchIndex: { enabled: next } };
                    const r = await fetch('/api/app-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    const d = await r.json();
                    if (d.ok) {
                        siEnabled = next;
                        renderSiPill();
                        siSaveStatus.textContent = '✓ Lagret';
                    } else {
                        siSaveStatus.textContent = '✗ ' + (d.error || 'Feil');
                    }
                } catch (e) {
                    siSaveStatus.textContent = '✗ ' + e.message;
                } finally {
                    siStatus.disabled = false;
                    setTimeout(() => { siSaveStatus.textContent = ''; }, 2500);
                }
            });
        }

        const applyState = (s) => {
            if (!s) return;
            liveState = s;
            if (s.phase === 'disabled') { progress.hidden = true; refreshPill(); }
            else if (s.phase === 'loading') {
                const pct = s.progress && typeof s.progress.pct === 'number' ? Math.round(s.progress.pct) : null;
                setPill('loading', pct != null ? ('Laster ' + pct + '%') : 'Laster…');
                progress.hidden = true;
            }
            else if (s.phase === 'ready') {
                setPill('ready', 'Aktiv');
                progress.hidden = true;
                loadAppSettings().then(() => { renderTable(); refreshPill(); });
                return;
            }
            else if (s.phase === 'error') {
                setPill('error', 'Feil');
                status.title = 'Klikk for å prøve på nytt — ' + (s.error || 'feil ved lasting');
                progress.hidden = true;
                if (progLabel) progLabel.textContent = s.error || '';
            }
            renderTable();
        };

        // Live updates via SSE.
        const openSse = () => {
            try {
                this._vsSse = new EventSource('/api/embed/events');
                this._vsSse.onmessage = (ev) => { try { applyState(JSON.parse(ev.data)); } catch {} };
                this._vsSse.onerror = () => { try { this._vsSse.close(); } catch {} this._vsSse = null; setTimeout(openSse, 3000); };
            } catch {}
        };
        openSse();
    }

    async _initSummarizeSettings() {
        const root = this.shadowRoot;
        const $ = (k) => root.querySelector(`[data-sm="${k}"]`);
        const tbody = $('tbody');
        const status = $('status');
        const saveStatus = $('saveStatus');
        if (!tbody) return;

        let models = [];
        let appSettings = null;
        const load = async () => {
            try {
                const r = await fetch('/api/app-settings');
                const d = await r.json();
                models = d.summarizeModels || [];
                appSettings = d.settings;
                return true;
            } catch { return false; }
        };
        await load();

        const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        let liveState = null;

        const renderTable = () => {
            const activeId = appSettings && appSettings.summarization.enabled ? appSettings.summarization.model : null;
            const loadingId = (liveState && liveState.phase === 'loading') ? liveState.model : null;
            const loadingPct = (liveState && liveState.progress && typeof liveState.progress.pct === 'number')
                ? Math.round(liveState.progress.pct) : null;
            tbody.innerHTML = models.map(m => {
                const isActive = m.id === activeId;
                const isLoading = m.id === loadingId;
                const downloaded = m.downloaded || isActive;
                let statusCell;
                if (m.remote) {
                    statusCell = `<span class="vs-status-ok">☁ Ekstern</span>`;
                } else if (isLoading) {
                    const pctTxt = loadingPct != null ? (loadingPct + '%') : '…';
                    statusCell = `<div class="vs-row-prog">
                        <span class="vs-status-loading">⬇ Laster ${pctTxt}</span>
                        <div class="vs-row-bar"><div class="vs-row-fill" style="width:${loadingPct != null ? loadingPct : 5}%"></div></div>
                    </div>`;
                } else if (downloaded) {
                    statusCell = `<span class="vs-status-ok">✓ Lastet ned</span>`;
                } else {
                    statusCell = `<span class="vs-status-no">Ikke lastet ned</span>`;
                }
                let actions;
                if (isLoading) {
                    actions = `<button class="vs-action" disabled>Laster…</button>`;
                } else if (isActive) {
                    actions = `<button class="vs-action is-active-btn" disabled>Aktiv</button>`;
                } else if (m.remote) {
                    actions = `<button class="vs-action" data-sm-act="${escapeHtml(m.id)}">Aktiver</button>`;
                } else if (downloaded) {
                    actions = `<button class="vs-action" data-sm-act="${escapeHtml(m.id)}">Aktiver</button>
                        <button class="vs-action vs-action-danger" data-sm-del="${escapeHtml(m.id)}" title="Slett nedlastet modell">Slett</button>`;
                } else {
                    actions = `<button class="vs-action" data-sm-act="${escapeHtml(m.id)}">⬇ Last ned</button>`;
                }
                const sizeTxt = m.remote ? '—' : ('~' + m.sizeMb + 'MB');
                return `<tr class="${isActive ? 'is-active' : ''}${isLoading ? ' is-loading' : ''}">
                    <td><div class="vs-name">${escapeHtml(m.label)}${m.recommended ? ' <small style="display:inline;color:var(--accent);font-weight:600;margin-left:4px">Anbefalt</small>' : ''}<small>${escapeHtml(m.id)}</small></div></td>
                    <td>${sizeTxt}</td>
                    <td>${escapeHtml(m.languages)}</td>
                    <td>${escapeHtml(m.description)}</td>
                    <td>${statusCell}</td>
                    <td style="text-align:right; white-space:nowrap">${actions}</td>
                </tr>`;
            }).join('');
        };
        renderTable();

        const setPill = (phase, label) => {
            status.className = 'vs-pill vs-pill-btn vs-pill-' + phase;
            status.textContent = label;
        };
        const refreshPill = () => {
            if (!appSettings) return;
            if (liveState && (liveState.phase === 'loading' || liveState.phase === 'ready' || liveState.phase === 'error')) return;
            if (appSettings.summarization.enabled) setPill('ready', 'Aktiv');
            else {
                const cur = models.find(m => m.id === appSettings.summarization.model);
                if (cur && !cur.remote && !cur.downloaded) setPill('disabled', '⬇ Last ned og aktiver');
                else setPill('disabled', 'Stoppet');
            }
        };
        refreshPill();

        const activate = async (modelId) => {
            saveStatus.textContent = 'Aktiverer…';
            try {
                const body = { summarization: { enabled: true, model: modelId } };
                const r = await fetch('/api/app-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const d = await r.json();
                if (d.ok) {
                    saveStatus.textContent = '✓ Aktivert';
                    await load(); renderTable(); refreshPill();
                } else saveStatus.textContent = '✗ ' + (d.error || 'Feil');
            } catch (e) { saveStatus.textContent = '✗ ' + e.message; }
            finally { setTimeout(() => { saveStatus.textContent = ''; }, 3000); }
        };
        const del = async (modelId) => {
            const m = models.find(x => x.id === modelId);
            if (!m) return;
            if (!confirm('Slette nedlastede filer for ' + m.label + '?\n\nDu kan laste den ned igjen senere.')) return;
            saveStatus.textContent = 'Sletter…';
            try {
                const r = await fetch('/api/app-settings/models/' + encodeURIComponent(modelId), { method: 'DELETE' });
                const d = await r.json();
                if (d.ok) {
                    saveStatus.textContent = '✓ Slettet';
                    await load(); renderTable(); refreshPill();
                } else saveStatus.textContent = '✗ ' + (d.error || 'Feil');
            } catch (e) { saveStatus.textContent = '✗ ' + e.message; }
            finally { setTimeout(() => { saveStatus.textContent = ''; }, 3000); }
        };
        tbody.addEventListener('click', (ev) => {
            const a = ev.target.closest('[data-sm-act]');
            const d = ev.target.closest('[data-sm-del]');
            if (a) activate(a.dataset.smAct);
            else if (d) del(d.dataset.smDel);
        });

        status.addEventListener('click', async () => {
            if (!appSettings) return;
            const newEnabled = !appSettings.summarization.enabled;
            saveStatus.textContent = newEnabled ? 'Aktiverer…' : 'Slår av…';
            try {
                const body = { summarization: { enabled: newEnabled, model: appSettings.summarization.model } };
                const r = await fetch('/api/app-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const d = await r.json();
                saveStatus.textContent = d.ok ? '✓ Lagret' : ('✗ ' + (d.error || 'Feil'));
                await load(); renderTable(); refreshPill();
            } catch (e) { saveStatus.textContent = '✗ ' + e.message; }
            finally { setTimeout(() => { saveStatus.textContent = ''; }, 2500); }
        });

        const applyState = (s) => {
            if (!s) return;
            liveState = s;
            if (s.phase === 'disabled') refreshPill();
            else if (s.phase === 'loading') {
                const pct = s.progress && typeof s.progress.pct === 'number' ? Math.round(s.progress.pct) : null;
                setPill('loading', pct != null ? ('Laster ' + pct + '%') : 'Laster…');
            } else if (s.phase === 'ready') {
                setPill('ready', 'Aktiv');
                load().then(() => { renderTable(); refreshPill(); });
                return;
            } else if (s.phase === 'error') {
                setPill('error', 'Feil');
                status.title = 'Klikk for å prøve på nytt — ' + (s.error || 'feil ved lasting');
            }
            renderTable();
        };

        const openSse = () => {
            try {
                this._smSse = new EventSource('/api/summarize/events');
                this._smSse.onmessage = (ev) => { try { applyState(JSON.parse(ev.data)); } catch {} };
                this._smSse.onerror = () => { try { this._smSse.close(); } catch {} this._smSse = null; setTimeout(openSse, 3000); };
            } catch {}
        };
        openSse();
    }

    render() {
        if (!this.service) return this.renderNoService();
        return html`
            <section class="app-panel">
                <h2 class="app-title">Applikasjonsinnstillinger</h2>
                <div class="app-tabs" role="tablist">
                    <button type="button" class="app-tab is-active" role="tab" data-app-tab="welcome">👋 Velkommen</button>
                    <button type="button" class="app-tab" role="tab" data-app-tab="embeddings">🔍 Søk</button>
                    <button type="button" class="app-tab" role="tab" data-app-tab="summarize">📝 Oppsummer</button>
                </div>
                <div class="app-tab-panels">
                    <div class="app-tab-panel is-active" data-app-panel="welcome">
                        <div class="app-card welcome">
                            <h3>Ukenotater</h3>
                            <p>Et selv-hostet, single-binary verktøy for strukturerte ukenotater, oppgaver, personer, møter og resultater &mdash; én kontekst per livsområde.</p>
                            <ul class="welcome-list">
                                <li><strong>📁 Kontekster:</strong> hver kontekst (jobb, hjem, prosjekt) ligger i sin egen mappe under <code>data/</code> med eget git-repo. Bytt mellom dem fra navbaren.</li>
                                <li><strong>📝 Notater &amp; uker:</strong> friform markdown organisert per ISO-uke (<code>YYYY-WNN</code>). Bruk <code>@person</code> for å nevne folk og <code>#tema</code> for tagger.</li>
                                <li><strong>📅 Kalender &amp; møter:</strong> uke-basert kalender med møtetyper, arbeidstider per dag, og notater knyttet direkte til hvert møte.</li>
                                <li><strong>🔍 Søk:</strong> globalt søk i topp-baren (Ctrl+K). Reverse indeks for nøkkelord; valgfri embedding-indeks for semantisk søk (se neste fane).</li>
                                <li><strong>📦 Git per kontekst:</strong> hver kontekst er sitt eget git-repo. Endringer commitet automatisk; valgfri push til en remote du selv eier.</li>
                                <li><strong>🎨 Tema:</strong> per-kontekst tema og fargepalett. Lag dine egne i temaeditoren under Tema-fanen.</li>
                            </ul>
                            <div class="welcome-meta">
                                <span><strong>Versjon:</strong> 1.0.0</span>
                                <span><strong>Lokal-først:</strong> alle data ligger på din maskin</span>
                                <span><a href="/help.md" target="_blank" rel="noopener">📖 Hjelp ↗</a></span>
                                <span><a href="https://github.com/petterek/week-notes" target="_blank" rel="noopener">⭐ GitHub ↗</a></span>
                            </div>
                        </div>
                    </div>
                    <div class="app-tab-panel" data-app-panel="embeddings">
                        <div class="app-card">
                            <div class="app-head">
                                <strong>📑 Reverse indeks (BM25)</strong>
                                <button type="button" class="vs-pill vs-pill-disabled vs-pill-btn" data-si="status" title="Klikk for å slå på/av">Stoppet</button>
                                <div class="vs-actions">
                                    <span class="vs-save-status" data-si="saveStatus"></span>
                                </div>
                            </div>
                            <p class="app-help">Brukes til vanlig nøkkelord-søk i topp-baren (Ctrl+K). Bygges automatisk fra alle markdown-filer i konteksten ved oppstart, oppdateres når filer endres, og cachet til disk for rask kald-start. Anbefales på.</p>
                        </div>
                        <hr class="app-sep">
                        <div class="app-card">
                            <div class="app-head">
                                <strong>🧠 Semantisk søk (embeddings)</strong>
                                <button type="button" class="vs-pill vs-pill-disabled vs-pill-btn" data-vs="status" title="Klikk for å slå på/av">Stoppet</button>
                                <div class="vs-actions">
                                    <span class="vs-save-status" data-vs="saveStatus"></span>
                                </div>
                            </div>
                            <p class="app-help">Aktiverer en lokal vektor-modell som lar deg søke på <em>betydning</em>, ikke bare nøyaktige ord. Modellene lastes ned første gang og lagres i <code>models/</code>. Per-kontekst statistikk vises under hver kontekst (fanen <strong>🔍 Indekser</strong>).</p>
                            <div class="vs-progress" data-vs="progress" hidden>
                                <div class="vs-progress-bar"><div class="vs-progress-fill" data-vs="fill"></div></div>
                                <span class="vs-progress-label" data-vs="progLabel">Laster…</span>
                            </div>
                            <table class="vs-table" data-vs="table">
                                <thead>
                                    <tr><th>Navn</th><th>Størrelse</th><th>Språk</th><th>Beskrivelse</th><th>Status</th><th></th></tr>
                                </thead>
                                <tbody data-vs="tbody"><tr><td colspan="6">Laster…</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="app-tab-panel" data-app-panel="summarize">
                        <div class="app-card">
                            <div class="app-head">
                                <strong>📝 Oppsummering av uker</strong>
                                <button type="button" class="vs-pill vs-pill-disabled vs-pill-btn" data-sm="status" title="Klikk for å slå på/av">Stoppet</button>
                                <div class="vs-actions">
                                    <span class="vs-save-status" data-sm="saveStatus"></span>
                                </div>
                            </div>
                            <p class="app-help">Velg modell for &laquo;✨ Oppsummer&raquo;-knappen på uke-visningen. <strong>Ekstern</strong> bruker GitHub Models (gpt-4o-mini, krever <code>gh auth login</code>) — best kvalitet og eneste reelle alternativ for norske notater. <strong>Lokale</strong> modeller kjøres i en worker-tråd og lastes ned til <code>models/</code> første gang. Alle Xenovas oppsummerings-modeller er trent på engelsk (CNN/DailyMail) — norsk vil bli oversatt eller produsere dårlige resultater.</p>
                            <table class="vs-table" data-sm="table">
                                <thead>
                                    <tr><th>Navn</th><th>Størrelse</th><th>Språk</th><th>Beskrivelse</th><th>Status</th><th></th></tr>
                                </thead>
                                <tbody data-sm="tbody"><tr><td colspan="6">Laster…</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </section>
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
            const [ctxResp, themeResp, dcResp] = await Promise.all([
                ctxSvc.list(),
                settingsSvc.listThemes().catch(() => []),
                ctxSvc.listDisconnected().catch(() => []),
            ]);
            this._active = ctxResp.active;
            this._contexts = ctxResp.contexts || [];
            this._themes = (themeResp && themeResp.themes || themeResp || []).map(t => typeof t === 'string' ? { id: t, name: t } : t);
            this._disconnected = Array.isArray(dcResp) ? dcResp : [];
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
        const disconnected = Array.isArray(this._disconnected) ? this._disconnected : [];
        const dcBlock = disconnected.length === 0 ? '' : `
            <details class="rail-disconnected" data-rail-dc${disconnected.length ? ' open' : ''}>
                <summary>🔌 Frakoblede (${disconnected.length})</summary>
                <ul class="dc-list">
                    ${disconnected.map(d => `
                        <li class="dc-item">
                            <button type="button" class="dc-clone" data-dc-clone data-remote="${escapeHtml(d.remote || '')}" data-name="${escapeHtml(d.name || d.id)}" title="Klon tilbake">
                                <span class="dc-ic">${escapeHtml(d.icon || '📁')}</span>
                                <span class="dc-meta">
                                    <strong>${escapeHtml(d.name || d.id)}</strong>
                                    <span class="dc-remote">${escapeHtml(d.remote || '')}</span>
                                </span>
                            </button>
                            <button type="button" class="dc-forget" data-dc-forget="${escapeHtml(d.id)}" title="Glem denne">✕</button>
                        </li>`).join('')}
                </ul>
            </details>`;
        railEl.innerHTML = items + `<button type="button" class="rail-add" data-rail-add>+ Ny kontekst</button>` + dcBlock;
        railEl.querySelectorAll('.rail-item').forEach(el => {
            el.addEventListener('click', () => {
                this._selected = el.dataset.id;
                this._renderRail(railEl);
                this._renderDetail(this.shadowRoot.querySelector('.sp-detail'));
            });
        });
        const addBtn = railEl.querySelector('[data-rail-add]');
        if (addBtn) addBtn.addEventListener('click', () => this._openNewContext());
        railEl.querySelectorAll('[data-dc-clone]').forEach(b => {
            b.addEventListener('click', () => {
                this._openNewContext();
                const overlay = this.shadowRoot.querySelector('.nc-overlay');
                if (!overlay) return;
                this._setNcMode(overlay, 'clone');
                const r = overlay.querySelector('[data-nc="cloneRemote"]');
                const n = overlay.querySelector('[data-nc="cloneName"]');
                if (r) r.value = b.dataset.remote || '';
                if (n) n.value = b.dataset.name || '';
                if (r) r.focus();
            });
        });
        railEl.querySelectorAll('[data-dc-forget]').forEach(b => {
            b.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const id = b.dataset.dcForget;
                try { await this.serviceFor('context').forgetDisconnected(id); }
                catch (e) { alert('Feilet: ' + (e.message || e)); return; }
                this._disconnected = (this._disconnected || []).filter(d => d.id !== id);
                this._renderRail(railEl);
            });
        });
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
                <button type="button" class="sp-tab-btn" data-tab="indexes">🔍 Indekser</button>
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
                        <button type="button" data-git-disconnect style="margin-left:auto;color:var(--danger);border-color:var(--danger)">🔌 Koble fra</button>
                    </div>
                    <div class="git-status-msg" data-git-msg style="margin-top:8px;font-size:0.85em"></div>
                    <fieldset style="margin-top:14px">
                        <legend>Migreringer</legend>
                        <p style="font-size:0.85em;color:var(--text-muted);margin:0 0 8px">Datamigreringer for å bringe kontekstmappen i samsvar med gjeldende app-versjon.</p>
                        <div data-mig-list style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px">⏳ Laster…</div>
                        <pre data-mig-output style="background:var(--bg);border:1px solid var(--border-soft);border-radius:6px;padding:8px;font-size:0.82em;white-space:pre-wrap;max-height:240px;overflow:auto;margin:0;display:none"></pre>
                        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                            <button type="button" data-mig-preview>🔍 Forhåndsvis</button>
                            <label style="font-size:0.85em;display:inline-flex;align-items:center;gap:4px"><input type="checkbox" data-mig-quarantine> Quarantine ukjente filer</label>
                            <button type="button" data-mig-run style="margin-left:auto">▶️ Kjør valgte</button>
                        </div>
                    </fieldset>
                </fieldset>
            </div>
            <div class="sp-tab-panel" data-panel="indexes">
                <fieldset>
                    <legend>Indekser</legend>
                    <p style="font-size:0.85em;color:var(--text-muted);margin:0 0 12px">Søkeindekser for denne konteksten. Cachene ligger under <code>data/${escapeHtml(this._selected || '')}/.cache/</code> og er ekskludert fra git.</p>
                    <div class="ix-grid" data-ix-grid>
                        <div class="ix-card">
                            <div class="ix-head"><strong>📑 Reverse indeks (BM25)</strong></div>
                            <p class="ix-help">Brukes til vanlig nøkkelord-søk i topp-baren. Bygges automatisk fra alle markdown-filer i konteksten ved oppstart, og oppdateres når filer endres. Cachet til disk for rask kald-start.</p>
                            <dl class="ix-stats" data-ix-search>
                                <dt>Status</dt><dd data-k="status">…</dd>
                                <dt>Dokumenter</dt><dd data-k="docs">–</dd>
                                <dt>Unike termer</dt><dd data-k="tokens">–</dd>
                                <dt>Cache-fil</dt><dd data-k="size">–</dd>
                                <dt>Sist oppdatert</dt><dd data-k="mtime">–</dd>
                            </dl>
                        </div>
                        <div class="ix-card">
                            <div class="ix-head"><strong>🧠 Embedding-indeks (vektorer)</strong></div>
                            <p class="ix-help">Brukes til semantisk søk når funksjonen er slått på (se Applikasjonsinnstillinger øverst). Hver markdown-fil får én vektor som lagres på disk og gjenbrukes hvis innholdet ikke har endret seg.</p>
                            <dl class="ix-stats" data-ix-embed>
                                <dt>Status</dt><dd data-k="status">…</dd>
                                <dt>Dokumenter</dt><dd data-k="docs">–</dd>
                                <dt>Modell</dt><dd data-k="model">–</dd>
                                <dt>Dimensjon</dt><dd data-k="dim">–</dd>
                                <dt>Cache-fil</dt><dd data-k="size">–</dd>
                                <dt>Sist oppdatert</dt><dd data-k="mtime">–</dd>
                            </dl>
                        </div>
                    </div>
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
                if (target === 'indexes') this._loadIndexStats(detailEl);
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

    async _loadIndexStats(detailEl) {
        const id = this._selected;
        if (!id) return;
        const searchEl = detailEl.querySelector('[data-ix-search]');
        const embedEl  = detailEl.querySelector('[data-ix-embed]');
        if (!searchEl || !embedEl) return;
        const setStat = (root, key, value) => {
            const el = root.querySelector(`[data-k="${key}"]`);
            if (el) el.textContent = value;
        };
        const fmtBytes = (n) => {
            if (!n) return '–';
            if (n < 1024) return n + ' B';
            if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
            return (n / (1024 * 1024)).toFixed(2) + ' MB';
        };
        const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('no-NO') : '–';
        // Show loading state.
        ['status','docs','tokens','size','mtime'].forEach(k => setStat(searchEl, k, '…'));
        ['status','docs','model','dim','size','mtime'].forEach(k => setStat(embedEl, k, '…'));
        try {
            const r = await fetch(`/api/contexts/${encodeURIComponent(id)}/index-stats`);
            const d = await r.json();
            const s = d.search || {};
            setStat(searchEl, 'status', s.cacheExists ? '✓ Cachet' : 'Ingen cache (bygges ved første søk)');
            setStat(searchEl, 'docs',   s.docs != null ? s.docs : '–');
            setStat(searchEl, 'tokens', s.tokens != null ? s.tokens.toLocaleString('no-NO') : '–');
            setStat(searchEl, 'size',   fmtBytes(s.sizeBytes));
            setStat(searchEl, 'mtime',  fmtDate(s.mtime));

            const e = d.embed || {};
            const liveExtra = d.liveEmbed && d.liveEmbed.phase === 'ready' ? ` · live: ${d.liveEmbed.docCount} dok` : '';
            setStat(embedEl, 'status', e.cacheExists ? ('✓ Cachet' + liveExtra) : 'Ingen cache (lagres ved første indeksering)');
            setStat(embedEl, 'docs',   e.docs != null ? e.docs : '–');
            setStat(embedEl, 'model',  e.model || '–');
            setStat(embedEl, 'dim',    e.dim != null ? (e.dim + 'd') : '–');
            setStat(embedEl, 'size',   fmtBytes(e.sizeBytes));
            setStat(embedEl, 'mtime',  fmtDate(e.mtime));
        } catch (err) {
            setStat(searchEl, 'status', 'Feil: ' + (err.message || err));
            setStat(embedEl,  'status', 'Feil: ' + (err.message || err));
        }
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

        const migOut = detailEl.querySelector('[data-mig-output]');
        const migList = detailEl.querySelector('[data-mig-list]');
        const migQuar = detailEl.querySelector('[data-mig-quarantine]');
        const migRunBtn = detailEl.querySelector('[data-mig-run]');

        const renderMigList = (migrations) => {
            if (!migList) return;
            if (!migrations || !migrations.length) {
                migList.innerHTML = '<div style="font-size:0.85em;color:var(--text-muted)">Ingen migreringer registrert.</div>';
                if (migRunBtn) migRunBtn.disabled = true;
                return;
            }
            const pending = migrations.filter(m => m.applies);
            migList.innerHTML = migrations.map(m => {
                const checked = m.applies ? 'checked' : '';
                const dim = m.applies ? '' : 'opacity:0.55;';
                const tag = m.applies
                    ? '<span style="background:var(--accent);color:var(--accent-fg);font-size:0.7em;padding:1px 6px;border-radius:8px;margin-left:6px">PENDING</span>'
                    : '<span style="color:var(--text-muted);font-size:0.7em;margin-left:6px">opp-til-dato</span>';
                return `<label style="display:flex;align-items:flex-start;gap:6px;font-size:0.85em;${dim}">
                    <input type="checkbox" data-mig-id="${escapeHtml(m.id)}" ${checked} ${m.applies ? '' : 'disabled'} style="margin-top:3px">
                    <span><code style="font-size:0.95em">${escapeHtml(m.id)}</code>${tag}<br><span style="color:var(--text-muted)">${escapeHtml(m.description || '')}</span></span>
                </label>`;
            }).join('');
            if (migRunBtn) migRunBtn.disabled = pending.length === 0;
        };

        const loadMig = async () => {
            if (!migList) return;
            migList.innerHTML = '⏳ Laster…';
            try {
                const r = await this.serviceFor('context').previewMigrations(id);
                renderMigList(r && r.migrations);
                if (migOut && r && r.output) {
                    migOut.style.display = 'block';
                    migOut.textContent = r.output;
                }
            } catch (e) {
                migList.innerHTML = '<div style="color:var(--danger)">❌ ' + escapeHtml(e.message || String(e)) + '</div>';
            }
        };
        if (!detailEl.dataset.migLoaded) {
            detailEl.dataset.migLoaded = '1';
            loadMig();
        }

        wire('[data-mig-preview]', loadMig);
        wire('[data-mig-run]', async () => {
            const selected = Array.from(detailEl.querySelectorAll('[data-mig-id]:checked')).map(el => el.dataset.migId);
            if (!selected.length) {
                alert('Ingen migreringer valgt.');
                return;
            }
            if (!confirm('Kjør ' + selected.length + ' migrering(er) på ' + id + '?\n\n' + selected.join(', ') + '\n\nDette skriver endringer til disk og committer dem i kontekstens git-repo.')) return;
            if (migOut) {
                migOut.style.display = 'block';
                migOut.textContent = '⏳ Kjører migrering…';
            }
            try {
                const r = await this.serviceFor('context').runMigrations(id, {
                    only: selected,
                    quarantine: !!(migQuar && migQuar.checked),
                    commit: true,
                });
                if (migOut) migOut.textContent = (r && r.output) || (r && r.error) || '(ingen utdata)';
                renderMigList(r && r.migrations);
                this._loadGitInfo(detailEl);
            } catch (e) {
                if (migOut) migOut.textContent = '❌ ' + (e.message || e);
            }
        });

        wire('[data-git-disconnect]', async () => {
            const c = this._contexts.find(x => x.id === id);
            const name = (c && c.settings && c.settings.name) || id;
            const remote = (c && c.settings && c.settings.remote || '').trim();
            if (!remote) {
                alert(`"${name}" har ingen git-remote.\n\nÅ koble fra ville slettet alle data lokalt uten å pushe dem til origin.\n\nLegg til en remote i Git-fanen og lagre først.`);
                return;
            }
            if (!confirm(`Koble fra "${name}"?\n\nDette vil:\n  • committe alle endringer\n  • pushe til origin (${remote})\n  • slette den lokale mappen\n\nGit-URLen huskes lokalt så du kan klone den tilbake senere.`)) return;
            if (msg) { msg.textContent = '⏳ Kobler fra…'; msg.style.color = ''; }
            try {
                const r = await this.serviceFor('context').disconnect(id);
                if (r && r.ok === false) throw new Error(r.error || 'Operasjonen feilet');
                if (msg) { msg.textContent = '✓ Koblet fra'; msg.style.color = 'var(--accent)'; }
                this._selected = null;
                await this.refresh();
            } catch (e) {
                if (msg) { msg.textContent = '❌ ' + (e.message || 'Feilet'); msg.style.color = 'var(--danger)'; }
            }
        });
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
