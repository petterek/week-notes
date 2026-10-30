import { escapeHtml, linkMentions } from '/components/_shared.js';

export function transformMarkdownFeatures(markdown, options = {}) {
    if (!markdown) return markdown;
    const taskTextById = options.taskTextById || {};
    const resolve = (kind, id) => {
        if (kind === 'X') return { text: id, done: false };
        const text = taskTextById[id];
        return text ? { text, done: kind === '!' } : null;
    };

    const token = /\{\{(?:([!?])([^{}\s]+)|(?!m:)([^{}!?][^{}]*))\}\}/g;
    const run = /(?:\{\{(?:[!?][^{}\s]+|(?!m:)[^{}!?][^{}]*)\}\}\s+){1,}\{\{(?:[!?][^{}\s]+|(?!m:)[^{}!?][^{}]*)\}\}/g;
    const itemFor = marker => {
        const match = /\{\{(?:([!?])([^{}\s]+)|(?!m:)([^{}!?][^{}]*))\}\}/.exec(marker);
        const kind = match[1] || 'X';
        const id = match[2] || (match[3] || '').trim();
        const item = resolve(kind, id);
        return item ? `1. [${item.done ? 'x' : ' '}] ${escapeHtml(item.text)}` : null;
    };

    let output = markdown.replace(run, markers => {
        const items = (markers.match(/\{\{(?:[!?][^{}\s]+|(?!m:)[^{}!?][^{}]*)\}\}/g) || [])
            .map(itemFor).filter(Boolean);
        return items.length < 2 ? markers : `\n\n${items.join('\n')}\n\n`;
    });

    output = output.replace(token, (marker, kind, id, plain) => {
        const type = kind || 'X';
        const text = type === 'X' ? (plain || '').trim() : (taskTextById[id] || '');
        if (!text) return marker;
        return `<input type="checkbox" disabled${type === '!' ? ' checked' : ''}> ${escapeHtml(text)}`;
    });

    return linkMentions(output, options.people || [], options.companies || [], options.teams || []);
}
