// Neutralises unsafe href/src URLs in HTML rendered by marked from user
// Markdown. Raw HTML is escaped before rendering, so the only attributes
// left are the double-quoted ones marked generates. No imports: the server
// (lib/core.js) requires this module too.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function decodeEntities(value) {
    return value
        .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16) || 0))
        .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10) || 0))
        .replace(/&colon;/gi, ':')
        .replace(/&(tab|newline);/gi, '');
}

export function isSafeUrl(url) {
    // Browsers ignore control characters and whitespace inside a scheme.
    const normalized = decodeEntities(String(url ?? '')).replace(/[\u0000-\u0020\u007f]/g, '');
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized);
    return !scheme || SAFE_PROTOCOLS.has(scheme[1].toLowerCase() + ':');
}

export function sanitizeHtmlUrls(html) {
    return String(html ?? '').replace(/\s(href|src)="([^"]*)"/gi,
        (match, attr, url) => (isSafeUrl(url) ? match : ` ${attr}="#"`));
}
