import { html } from '/components/_shared.js';

export const SOURCE_LINK_STYLES = `
    .note-source-action { display: inline-block; margin-inline-start: 4px; padding: 2px 4px; border-radius: 4px; text-decoration: none; }
    .note-source-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

export function renderSourceLinks(reference) {
    if (!reference.href) return reference.label;
    if (reference.kind !== 'note') return html`<a href="${reference.href}">${reference.label}</a>`;
    const [week, file] = reference.id.split('/');
    return html`
        <span>${reference.label}</span>
        <a class="note-source-action" href="${reference.href}" data-note-preview data-week="${week}" data-file="${file}"
            aria-label="Forhåndsvis ${reference.label}" title="Forhåndsvis ${reference.label}"><span aria-hidden="true">👁️</span></a>
        <a class="note-source-action" href="/editor/${encodeURIComponent(week)}/${encodeURIComponent(file)}"
            aria-label="Rediger ${reference.label}" title="Rediger ${reference.label}"><span aria-hidden="true">✏️</span></a>
    `;
}

export function openNoteSourcePreview(event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
    const anchor = event.target.closest('a[data-note-preview]');
    if (!anchor || typeof window.openNoteViewModal !== 'function') return false;
    event.preventDefault();
    window.openNoteViewModal(anchor.dataset.week, encodeURIComponent(anchor.dataset.file));
    return true;
}
