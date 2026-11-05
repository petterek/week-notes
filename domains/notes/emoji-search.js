// fzf-style fuzzy scoring for the emoji selector.
//
// Every query character must appear in order in the target. The best
// alignment is chosen with dynamic programming: matches score points, word
// starts and consecutive runs earn bonuses, and gaps cost a little. This
// gives one continuous score, so "har", "hart" and "heart" rank the same
// emojis first instead of crossing length-based thresholds.

const SCORE_MATCH = 16;
const GAP_START = 3;
const GAP_EXTENSION = 1;
const BONUS_BOUNDARY = 8;
const BONUS_CONSECUTIVE = 4;
const FIRST_CHAR_MULTIPLIER = 2;
const TYPO_PENALTY = 24;
const KEYWORD_WEIGHT = 0.85;
const EXACT_NAME_BONUS = 64;
const MIN_SCORE_PER_CHAR = 12;

const NEG = -Infinity;

function isBoundary(target, index) {
    return index === 0 || /[^a-z0-9]/.test(target[index - 1]);
}

function isSubsequence(query, target) {
    let i = 0;
    for (let j = 0; j < target.length && i < query.length; j++) {
        if (target[j] === query[i]) i++;
    }
    return i === query.length;
}

/** Best alignment score of `query` in `target`, or null when not a subsequence. */
export function fuzzyScore(query, target) {
    if (!query || !isSubsequence(query, target)) return null;
    const n = query.length;
    const m = target.length;
    let previous = new Array(m).fill(NEG);
    for (let i = 0; i < n; i++) {
        const current = new Array(m).fill(NEG);
        let gapBest = NEG;
        for (let j = i; j < m; j++) {
            if (i > 0 && j >= 2) gapBest = Math.max(gapBest - GAP_EXTENSION, previous[j - 2] - GAP_START);
            if (target[j] !== query[i]) continue;
            const boundary = isBoundary(target, j) ? BONUS_BOUNDARY : 0;
            const base = SCORE_MATCH + (i === 0 ? boundary * FIRST_CHAR_MULTIPLIER : boundary);
            if (i === 0) {
                current[j] = base;
                continue;
            }
            const consecutive = j > 0 && previous[j - 1] > NEG
                ? previous[j - 1] + Math.max(BONUS_CONSECUTIVE, boundary)
                : NEG;
            const best = Math.max(consecutive, gapBest);
            if (best > NEG) current[j] = base + best;
        }
        previous = current;
    }
    const score = Math.max(...previous);
    return score > NEG ? score : null;
}

// One-typo variants: each adjacent swap ("rokcet" → "rocket") and each
// single deletion (covers an extra or wrong letter: "hwart" → "hart").
function typoVariants(word) {
    if (word.length < 4) return [];
    const variants = new Set();
    for (let i = 0; i < word.length - 1; i++) {
        variants.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
    }
    for (let i = 1; i < word.length; i++) variants.add(word.slice(0, i) + word.slice(i + 1));
    variants.delete(word);
    return [...variants];
}

function bestFieldScore(word, fields) {
    let best = null;
    for (const { text, weight } of fields) {
        const score = fuzzyScore(word, text);
        if (score != null) best = Math.max(best ?? NEG, score * weight);
    }
    return best;
}

function wordScore(word, fields) {
    const direct = bestFieldScore(word, fields);
    if (direct != null) return direct;
    let best = null;
    for (const variant of typoVariants(word)) {
        const score = bestFieldScore(variant, fields);
        if (score != null) best = Math.max(best ?? NEG, score - TYPO_PENALTY);
    }
    return best;
}

export function normalizeEmojiQuery(raw) {
    return String(raw || '').trim().toLowerCase().replace(/^:+|:+$/g, '').replace(/\s+/g, '_');
}

function splitWords(text) {
    return String(text).toLowerCase().split(/[\s_\-]+/).filter(Boolean);
}

/** Higher is better; null means the item does not match. */
export function emojiScore(item, query) {
    if (!query) return 0;
    const name = item.name.toLowerCase();
    // "_" separates words: each query word must match inside a single word.
    const fields = [
        ...splitWords(name).map(text => ({ text, weight: 1 })),
        ...(item.keywords || []).flatMap(splitWords).map(text => ({ text, weight: KEYWORD_WEIGHT })),
    ];
    let total = 0;
    let length = 0;
    for (const word of query.split('_').filter(Boolean)) {
        const score = wordScore(word, fields);
        if (score == null) return null;
        total += score;
        length += word.length;
    }
    if (total < length * MIN_SCORE_PER_CHAR) return null;
    if (name === query) total += EXACT_NAME_BONUS;
    return total;
}

/** Ranked matches: best score first, then shorter names, then catalog order. */
export function searchEmoji(items, query) {
    const seen = new Set();
    const hits = [];
    items.forEach((item, order) => {
        if (seen.has(item.name)) return;
        const score = emojiScore(item, query);
        if (score == null) return;
        seen.add(item.name);
        hits.push({ item, score, order });
    });
    hits.sort((a, b) => b.score - a.score
        || a.item.name.length - b.item.name.length
        || a.order - b.order);
    return hits.map(hit => hit.item);
}
