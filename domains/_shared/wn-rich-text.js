// Synchronous Markdown renderer for short user text written with
// <feature-rich-text-area> (descriptions, notes, comments, results).
// Supports the same features as the editor: Markdown, :emoji: shortcodes
// (via the global marked emoji extension), @mentions and {{?task}} markers.
import { escapeHtml } from '/components/_shared.js';
import { transformMarkdownFeatures } from '/components/markdown-features.js';
import { configureMarked } from '/services/_shared/wn-markdown-preview.js';
import { sanitizeHtmlUrls } from '/services/_shared/wn-safe-urls.js';

export const RICH_TEXT_CSS = `
    .rich-text { overflow-wrap: anywhere; }
    .rich-text > :first-child { margin-top: 0; }
    .rich-text > :last-child { margin-bottom: 0; }
    .rich-text p { margin: 0 0 0.4em; }
    .rich-text ul, .rich-text ol { margin: 0.2em 0 0.4em; padding-left: 1.4em; }
    .rich-text pre, .rich-text code { font-family: var(--font-mono, monospace); font-size: 0.92em; }
    .rich-text pre { padding: 6px 8px; overflow: auto; background: var(--surface-alt, var(--surface)); border-radius: 6px; }
    .rich-text blockquote { margin: 0.3em 0; padding-left: 10px; border-left: 3px solid var(--border); color: var(--text-muted); }
    .rich-text a { color: var(--accent); }
    .rich-text entity-mention { display: inline; color: var(--accent); cursor: pointer; }
`;

/**
 * @param {string} text  Raw Markdown from a rich text field.
 * @param {object} [options]
 * @param {Array}  [options.people] [options.companies] [options.teams]  mention lookup lists
 * @param {object} [options.taskTextById]  task id → text for {{?id}} markers
 * @param {boolean} [options.inline]  render without block wrappers (single line)
 * @returns {string} HTML. Raw HTML in the source is escaped.
 */
export function renderRichText(text, options = {}) {
    const source = String(text ?? '');
    if (!source.trim()) return '';
    const marked = options.marked || (typeof window !== 'undefined' ? window.marked : null);
    // Escape user-written HTML; Markdown syntax (including > quotes) still works.
    const safe = source.replace(/&(?![a-zA-Z#][\w#]*;)/g, '&amp;').replace(/</g, '&lt;');
    const markdown = transformMarkdownFeatures(safe, {
        people: options.people || [],
        companies: options.companies || [],
        teams: options.teams || [],
        taskTextById: options.taskTextById || {},
    });
    if (!marked || typeof marked.parse !== 'function') {
        return escapeHtml(source).replace(/\n/g, '<br>');
    }
    configureMarked(marked);
    return sanitizeHtmlUrls(options.inline && typeof marked.parseInline === 'function'
        ? marked.parseInline(markdown)
        : marked.parse(markdown));
}

export default renderRichText;
