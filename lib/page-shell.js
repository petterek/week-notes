'use strict';

const { toClientPageRoutes } = require('./page-routes');

function serializeForScript(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

module.exports = function createPageShell(deps) {
    const {
        escapeHtml,
        navbarHtml,
        getActiveTheme,
        getMePersonKey,
        getDataContext,
    } = deps;

    function render(title, body, extraNavLinks, opts) {
        opts = opts || {};
        if (opts.fragment) {
            return `<title>${escapeHtml(title)}</title>\n<main id="content">${body}</main>`;
        }

        const nav = navbarHtml(extraNavLinks, { fixed: false });
        const theme = getActiveTheme();
        const pageRoutes = serializeForScript(toClientPageRoutes());
        const mePersonKey = serializeForScript(getMePersonKey(getDataContext()) || '');
        return `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link id="themeStylesheet" rel="stylesheet" href="/themes/${theme}.css">
    <link rel="stylesheet" href="/style.css">
</head>
<body><header id="appHeader">${nav}</header><main id="content">${body}</main><entity-callout id="appEntityCallout"></entity-callout><help-modal></help-modal><create-modal></create-modal><footer id="shortcutsBar" class="shortcuts-bar" aria-label="Hurtigtaster"><span><kbd>Alt</kbd>+<kbd>C</kbd> Opprett</span><span><kbd>Alt</kbd>+<kbd>H</kbd> Hjem</span><span><kbd>Alt</kbd>+<kbd>O</kbd> Oppgaver</span><span><kbd>Alt</kbd>+<kbd>K</kbd> Kalender</span><span><kbd>Alt</kbd>+<kbd>P</kbd> Personer</span><span><kbd>Alt</kbd>+<kbd>R</kbd> Resultater</span><span><kbd>Alt</kbd>+<kbd>M</kbd> Mål</span><span><kbd>Alt</kbd>+<kbd>N</kbd> Nytt notat</span><span><kbd>Alt</kbd>+<kbd>S</kbd> Innstillinger</span><span><kbd>/</kbd> Søk</span><span><kbd>Esc</kbd> Lukk</span><span><kbd>?</kbd> Hjelp</span></footer><script>window.WN_PAGE_ROUTES=${pageRoutes};window.WN_ME_PERSON_KEY=${mePersonKey};</script><script src="/app-shell.js"></script><script type="module" src="/components/_shared.js"></script><script type="module" src="/service-registry.js"></script><script type="module" src="/components/nav-meta.js"></script><script type="module" src="/components/nav-button.js"></script><script type="module" src="/components/ctx-switcher.js"></script><script type="module" src="/components/markdown-preview.js"></script><script type="module" src="/components/modal-container.js"></script><script type="module" src="/components/help-modal.js"></script><script type="module" src="/components/note-card.js"></script><script type="module" src="/components/note-meta-view.js"></script><script type="module" src="/components/note-meta-panel.js"></script><script type="module" src="/components/note-view.js"></script><script type="module" src="/components/note-editor.js"></script><script type="module" src="/components/task-open-list.js"></script><script type="module" src="/components/tasks-page.js"></script><script type="module" src="/components/task-create.js"></script><script type="module" src="/components/task-create-full.js"></script><script type="module" src="/components/task-add-modal.js"></script><script type="module" src="/components/task-complete-modal.js"></script><script type="module" src="/components/task-note-modal.js"></script><script type="module" src="/components/task-edit-modal.js"></script><script type="module" src="/components/upcoming-meetings.js"></script><script type="module" src="/components/today-calendar.js"></script><script type="module" src="/components/meeting-create.js"></script><script type="module" src="/components/meeting-create-modal.js"></script><script type="module" src="/components/week-results.js"></script><script type="module" src="/components/task-completed.js"></script><script type="module" src="/components/task-view.js"></script><script type="module" src="/components/week-section.js"></script><script type="module" src="/components/week-list.js"></script><script type="module" src="/components/week-pill.js"></script><script type="module" src="/components/global-search.js"></script><script type="module" src="/components/week-calendar.js"></script><script type="module" src="/components/week-notes-calendar.js"></script><script type="module" src="/components/all-contexts-calendar.js"></script><script type="module" src="/components/settings-page.js"></script><script type="module" src="/components/notes-page.js"></script><script type="module" src="/components/company-card.js"></script><script type="module" src="/components/person-card.js"></script><script type="module" src="/components/place-card.js"></script><script type="module" src="/components/entity-callout.js"></script><script type="module" src="/components/entity-mention.js"></script><script type="module" src="/components/inline-action.js"></script><script type="module" src="/components/inline-task.js"></script><script type="module" src="/components/inline-result.js"></script><script type="module" src="/components/inline-meeting.js"></script><script type="module" src="/components/icon-picker.js"></script><script type="module" src="/components/tag-editor.js"></script><script type="module" src="/components/people-page.js"></script><script type="module" src="/components/team-status-page.js"></script><script type="module" src="/components/results-page.js"></script><script type="module" src="/components/result-create.js"></script><script type="module" src="/components/goals-page.js"></script><script type="module" src="/components/active-goals.js"></script><script type="module" src="/components/meeting-series-page.js"></script><script type="module" src="/components/meeting-occurrence-page.js"></script><script type="module" src="/components/create-modal.js"></script><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script><script src="/emoji-ext.js"></script></body>
</html>`;
    }

    return render;
};
