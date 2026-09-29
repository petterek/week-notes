import { escapeHtml } from '/components/_shared.js';

const CONTENT_CSS = `
    .root > :first-child { margin-top: 0; }
    .root > :last-child { margin-bottom: 0; }
    h1, h2, h3, h4 { color: var(--accent); font-family: var(--font-heading); font-weight: 400; }
    a { color: var(--accent); }
    pre { background: var(--code-bg); color: var(--code-fg); padding: 12px; border-radius: 6px; overflow: auto; }
    code { background: var(--surface-alt); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid var(--accent); padding: 4px 12px; color: var(--text-muted); background: var(--surface-alt); border-radius: 0 6px 6px 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid var(--border-soft); padding: 6px 10px; text-align: left; }
    ul, ol { padding-left: 1.4em; }
    img { max-width: 100%; }
    .empty { color: var(--text-subtle); font-style: italic; margin: 0; }
`;

export const MARKDOWN_PREVIEW_CSS = `
    :host { display: block; padding: 14px 18px; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--surface); overflow: auto; box-sizing: border-box; color: var(--text-strong); line-height: 1.55; }
    :host([hidden]) { display: none; }
${CONTENT_CSS}
`;

export const MARKDOWN_PREVIEW_DETACHED_CSS = `
    html,body{margin:0;padding:0;height:100%;background:var(--bg);color:var(--text-strong);font-family:var(--font-family,-apple-system,sans-serif);line-height:1.55}
    #pip-root{position:fixed;inset:0;padding:20px 28px;overflow:auto;box-sizing:border-box}
${CONTENT_CSS}
`;

export function configureMarked(marked) {
    if (!marked || typeof marked.use !== 'function' || marked.__wnMarkdownPreviewConfigured) return;
    marked.use({ breaks: true, gfm: true });
    marked.__wnMarkdownPreviewConfigured = true;
}

export function renderMarkdownPreview(root, markdown, options = {}) {
    if (!root) return;
    const md = markdown == null ? '' : String(markdown);
    if (!md || !md.trim()) {
        const placeholder = options.placeholder || '';
        root.innerHTML = placeholder
            ? `<p class="empty">${escapeHtml(placeholder)}</p>`
            : '';
        return;
    }
    const marked = options.marked || (typeof window !== 'undefined' ? window.marked : null);
    configureMarked(marked);
    try {
        const markup = (marked && typeof marked.parse === 'function')
            ? marked.parse(md)
            : escapeHtml(md);
        root.innerHTML = markup;
    } catch (e) {
        console.error('markdown preview rendering failed', e);
        root.textContent = md;
    }
}

function _injectComponent(doc, src) {
    const s = doc.createElement('script');
    s.type = 'module';
    s.src = src;
    return new Promise((resolve, reject) => {
        s.addEventListener('load', resolve, { once: true });
        s.addEventListener('error', () => reject(new Error(`Cannot load preview component: ${src}`)), { once: true });
        doc.head.appendChild(s);
    });
}

export function createDetachedMarkdownPreview(doc, options = {}) {
    if (!doc || !doc.head || !doc.body) {
        throw new TypeError('Detached preview requires a document with a head and body');
    }
    if (doc.defaultView && options.services) {
        doc.defaultView['week-note-services'] = options.services;
    }
    doc.title = options.title || 'Forhåndsvisning';
    let themeLink;
    if (options.themeHref) {
        themeLink = doc.createElement('link');
        themeLink.rel = 'stylesheet';
        themeLink.href = options.themeHref;
        doc.head.appendChild(themeLink);
    }
    const style = doc.createElement('style');
    style.textContent = MARKDOWN_PREVIEW_DETACHED_CSS;
    doc.head.appendChild(style);

    const root = doc.createElement('div');
    root.id = options.rootId || 'pip-root';
    root.className = 'root';
    root.innerHTML = '<p class="empty">Venter på innhold…</p>';
    doc.body.appendChild(root);

    const scripts = options.loadComponents === false
        ? []
        : ['/components/entity-mention.js', '/components/inline-action.js', '/components/inline-result.js'];
    const ready = Promise.all(scripts.map((src) => _injectComponent(doc, src)));
    const marked = options.marked || (typeof window !== 'undefined' ? window.marked : null);

    return {
        root,
        ready,
        render(markdown, renderOptions = {}) {
            renderMarkdownPreview(root, markdown, {
                ...renderOptions,
                marked: renderOptions.marked || marked,
            });
        },
        destroy() {
            root.remove();
            style.remove();
            if (themeLink) themeLink.remove();
        },
    };
}

export default {
    MARKDOWN_PREVIEW_CSS,
    MARKDOWN_PREVIEW_DETACHED_CSS,
    configureMarked,
    renderMarkdownPreview,
    createDetachedMarkdownPreview,
};
