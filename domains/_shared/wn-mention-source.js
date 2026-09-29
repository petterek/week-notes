import { highlightMatch, replaceRange } from '/components/wn-autocomplete.js';

async function _loadList({ serviceFor, fetchImpl, serviceKey, url, filter }) {
    const svc = serviceFor ? serviceFor(serviceKey) : null;
    let rows;
    if (svc && typeof svc.list === 'function') {
        rows = await svc.list();
    } else {
        if (typeof fetchImpl !== 'function') throw new Error(`No source for ${serviceKey} mentions`);
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(`Cannot load ${serviceKey} mentions (${response.status})`);
        rows = await response.json();
    }
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
        throw new TypeError(`Expected a list of ${serviceKey} mention records`);
    }
    return rows.filter(filter);
}

function _displayPerson(p, key) {
    if (!p) return key;
    if (p.firstName && p.lastName) return `${p.firstName} ${p.lastName}`;
    if (p.firstName) return p.firstName;
    if (p.name) return p.name;
    return key;
}

function _normalizeKey(entity, fallback) {
    if (!entity) return fallback;
    return entity.key || (entity.name || '').toLowerCase() || fallback;
}

function _buildItems({ people, companies, teams, meKey }) {
    const out = [];
    if (meKey) {
        const me = people.find((p) => (p.key || (p.name || '').toLowerCase()) === meKey);
        const disp = me ? _displayPerson(me, meKey) : meKey;
        out.push({ value: 'me', label: disp, hint: 'meg', kind: 'me' });
    } else {
        out.push({ value: 'me', label: 'meg', hint: 'sett i Innstillinger', kind: 'me' });
    }
    for (const t of teams) {
        out.push({
            value: _normalizeKey(t, (t.name || '').toLowerCase()),
            label: t.name || t.key,
            hint: 'team',
            kind: 'team',
        });
    }
    for (const c of companies) {
        out.push({
            value: _normalizeKey(c, (c.name || '').toLowerCase()),
            label: c.name || c.key,
            hint: 'firma',
            kind: 'company',
        });
    }
    for (const p of people) {
        out.push({
            value: _normalizeKey(p, (p.name || '').toLowerCase()),
            label: _displayPerson(p, p.key || (p.name || '').toLowerCase()),
            hint: '',
            kind: 'person',
        });
    }
    return out;
}

function _mentionTriggerDetect(text, caret, opts) {
    let i = caret - 1;
    while (i >= 0 && /[a-zA-ZæøåÆØÅ0-9_-]/.test(text[i])) i--;
    if (i < 0 || text[i] !== '@') return null;
    if (i > 0 && !/[\s(\[,;]/.test(text[i - 1])) return null;
    const frag = text.slice(i + 1, caret);
    if (!frag && !(opts && opts.force)) return null;
    return { query: frag, start: i, end: caret };
}

function _mentionRenderItem(item, query) {
    const tag = item.kind === 'team' ? '👥' : item.kind === 'company' ? '🏢' : (item.kind === 'me' ? '🙋' : '👤');
    return `${tag} ${highlightMatch(item.label, query)}` +
        (item.hint ? `<span style="opacity:0.55;font-size:0.85em"> · ${item.hint}</span>` : '');
}

export function createMentionSource(options = {}) {
    const serviceFor = typeof options.serviceFor === 'function' ? options.serviceFor : null;
    const fetchImpl = typeof options.fetchImpl === 'function'
        ? options.fetchImpl
        : (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const meKey = () => options.meKey != null
        ? String(options.meKey)
        : ((typeof window !== 'undefined' && window.mePersonKey) || '');

    const pending = new Map();
    const lists = { people: [], companies: [], teams: [] };
    const ensure = (key) => {
        if (pending.has(key)) return pending.get(key);
        const promise = _loadList({
            serviceFor,
            fetchImpl,
            serviceKey: key,
            url: '/api/' + key,
            filter: row => !row.deleted && (key !== 'people' || !row.inactive),
        }).then((rows) => {
            lists[key] = rows;
            return rows;
        }).catch((error) => {
            pending.delete(key);
            throw error;
        });
        pending.set(key, promise);
        return promise;
    };
    const ensurePeople = () => ensure('people');
    const ensureCompanies = () => ensure('companies');
    const ensureTeams = () => ensure('teams');
    const loadAll = async () => {
        const [people, companies, teams] = await Promise.all([ensurePeople(), ensureCompanies(), ensureTeams()]);
        return { people, companies, teams };
    };

    const createTrigger = () => ({
        detect: _mentionTriggerDetect,
        fetchItems: async () => _buildItems({ ...await loadAll(), meKey: meKey() }),
        filter: 'starts',
        limit: 10,
        renderItem: _mentionRenderItem,
        onSelect: (item, ctx) => {
            replaceRange(ctx.textarea, ctx.range.start, ctx.range.end, `@${item.value} `);
        },
    });

    return {
        ensurePeople,
        ensureCompanies,
        ensureTeams,
        loadAll,
        createTrigger,
        buildItems: () => _buildItems({ ...lists, meKey: meKey() }),
    };
}

export default createMentionSource;
