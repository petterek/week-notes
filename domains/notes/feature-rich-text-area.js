import { WNElement, html } from '/components/_shared.js';
import { attachAutocomplete, highlightMatch, replaceRange } from '/components/wn-autocomplete.js';
import { attachDateTrigger } from '/components/wn-date-trigger.js';
import { attachMeetingShortcut } from './meeting-shortcut.js';
import { normalizeEmojiQuery, searchEmoji } from './emoji-search.js';
import { createMentionSource } from '/services/_shared/wn-mention-source.js';
import '/components/icon-picker.js';

const EMOJI = [
    { name: 'Smilefjes', icons: [
        { icon: '😀', name: 'grinning' }, { icon: '😃', name: 'smiley' }, { icon: '😄', name: 'smile' }, { icon: '😁', name: 'grin' },
        { icon: '😆', name: 'laughing' }, { icon: '😅', name: 'sweat_smile' }, { icon: '😂', name: 'joy' }, { icon: '🤣', name: 'rofl' },
        { icon: '🙂', name: 'slightly_smiling_face' }, { icon: '😉', name: 'wink' }, { icon: '😊', name: 'blush' }, { icon: '😇', name: 'innocent' },
        { icon: '🥰', name: 'smiling_face_with_three_hearts' }, { icon: '😍', name: 'heart_eyes' }, { icon: '🤩', name: 'star_struck' }, { icon: '😘', name: 'kissing_heart' },
        { icon: '😋', name: 'yum' }, { icon: '😜', name: 'stuck_out_tongue_winking_eye' }, { icon: '🤪', name: 'zany' }, { icon: '😎', name: 'sunglasses' },
        { icon: '🤓', name: 'nerd_face' }, { icon: '🧐', name: 'monocle' }, { icon: '🤔', name: 'thinking' }, { icon: '🤨', name: 'raised_eyebrow' },
        { icon: '😐', name: 'neutral_face' }, { icon: '😑', name: 'expressionless' }, { icon: '😶', name: 'no_mouth' }, { icon: '🙄', name: 'roll_eyes' },
        { icon: '😏', name: 'smirk' }, { icon: '😬', name: 'grimacing' }, { icon: '😌', name: 'relieved' }, { icon: '😔', name: 'pensive' },
        { icon: '😴', name: 'sleeping' }, { icon: '😷', name: 'mask' }, { icon: '🤒', name: 'face_with_thermometer' }, { icon: '🤯', name: 'exploding_head' },
        { icon: '🥳', name: 'partying' }, { icon: '😕', name: 'confused' }, { icon: '😟', name: 'worried' }, { icon: '😮', name: 'open_mouth' },
        { icon: '😲', name: 'astonished' }, { icon: '😳', name: 'flushed' }, { icon: '🥺', name: 'pleading' }, { icon: '😢', name: 'cry' },
        { icon: '😭', name: 'sob' }, { icon: '😱', name: 'scream' }, { icon: '😤', name: 'triumph' }, { icon: '😡', name: 'rage' },
        { icon: '🤬', name: 'symbols_over_mouth' }, { icon: '🤗', name: 'hugs' }, { icon: '🤫', name: 'shushing' }, { icon: '🤭', name: 'hand_over_mouth' },
        { icon: '😈', name: 'smiling_imp' }, { icon: '💀', name: 'skull' }, { icon: '🤖', name: 'robot' }, { icon: '👻', name: 'ghost' },
    ] },
    { name: 'Hender og folk', icons: [
        { icon: '👍', name: '+1' }, { icon: '👎', name: '-1' }, { icon: '👌', name: 'ok_hand' }, { icon: '✌️', name: 'v' },
        { icon: '🤞', name: 'crossed_fingers' }, { icon: '🤝', name: 'handshake' }, { icon: '👏', name: 'clap' }, { icon: '🙌', name: 'raised_hands' },
        { icon: '👐', name: 'open_hands' }, { icon: '🙏', name: 'pray' }, { icon: '💪', name: 'muscle' }, { icon: '👋', name: 'wave' },
        { icon: '✋', name: 'raised_hand' }, { icon: '👉', name: 'point_right' }, { icon: '👈', name: 'point_left' }, { icon: '👆', name: 'point_up_2' },
        { icon: '👇', name: 'point_down' }, { icon: '☝️', name: 'point_up' }, { icon: '✍️', name: 'writing_hand' }, { icon: '🤷', name: 'woman_shrugging' },
        { icon: '🙋', name: 'raising_hand_woman' }, { icon: '🙇', name: 'bowing_man' }, { icon: '👀', name: 'eyes' }, { icon: '🧠', name: 'brain' },
        { icon: '👶', name: 'baby' }, { icon: '👨‍💻', name: 'man_technologist' }, { icon: '👩‍💻', name: 'woman_technologist' }, { icon: '👥', name: 'busts_in_silhouette' },
    ] },
    { name: 'Hjerter og symboler', icons: [
        { icon: '❤️', name: 'heart' }, { icon: '🧡', name: 'orange_heart' }, { icon: '💛', name: 'yellow_heart' }, { icon: '💚', name: 'green_heart' },
        { icon: '💙', name: 'blue_heart' }, { icon: '💜', name: 'purple_heart' }, { icon: '🖤', name: 'black_heart' }, { icon: '💔', name: 'broken_heart' },
        { icon: '💯', name: '100' }, { icon: '✅', name: 'white_check_mark' }, { icon: '☑️', name: 'ballot_box_with_check' }, { icon: '✔️', name: 'heavy_check_mark' },
        { icon: '❌', name: 'x' }, { icon: '❎', name: 'negative_squared_cross_mark' }, { icon: '➕', name: 'heavy_plus_sign' }, { icon: '➖', name: 'heavy_minus_sign' },
        { icon: '❓', name: 'question' }, { icon: '❗', name: 'exclamation' }, { icon: '‼️', name: 'bangbang' }, { icon: '⁉️', name: 'interrobang' },
        { icon: '⚠️', name: 'warning' }, { icon: '🚫', name: 'no_entry_sign' }, { icon: '⛔', name: 'no_entry' }, { icon: '🔴', name: 'red_circle' },
        { icon: '🔵', name: 'large_blue_circle' }, { icon: '⚫', name: 'black_circle' }, { icon: '⚪', name: 'white_circle' }, { icon: '⭐', name: 'star' },
        { icon: '🌟', name: 'star2' }, { icon: '✨', name: 'sparkles' }, { icon: '💫', name: 'dizzy' }, { icon: '🔥', name: 'fire' },
        { icon: '💥', name: 'boom' }, { icon: '💡', name: 'bulb' }, { icon: '🔔', name: 'bell' }, { icon: '🔕', name: 'no_bell' },
        { icon: '♻️', name: 'recycle' }, { icon: '🆕', name: 'new' }, { icon: '🆗', name: 'ok' }, { icon: '🆙', name: 'up' },
    ] },
    { name: 'Arbeid og verktøy', icons: [
        { icon: '📝', name: 'memo' }, { icon: '📌', name: 'pushpin' }, { icon: '📍', name: 'round_pushpin' }, { icon: '📎', name: 'paperclip' },
        { icon: '🖇️', name: 'paperclips' }, { icon: '📋', name: 'clipboard' }, { icon: '📁', name: 'file_folder' }, { icon: '📂', name: 'open_file_folder' },
        { icon: '🗂️', name: 'card_index_dividers' }, { icon: '📅', name: 'date' }, { icon: '📆', name: 'calendar' }, { icon: '🗓️', name: 'spiral_calendar' },
        { icon: '🕒', name: 'clock3' }, { icon: '⏰', name: 'alarm_clock' }, { icon: '⏳', name: 'hourglass_flowing_sand' }, { icon: '⌛', name: 'hourglass' },
        { icon: '📊', name: 'bar_chart' }, { icon: '📈', name: 'chart_with_upwards_trend' }, { icon: '📉', name: 'chart_with_downwards_trend' }, { icon: '📄', name: 'page_facing_up' },
        { icon: '📃', name: 'page_with_curl' }, { icon: '📑', name: 'bookmark_tabs' }, { icon: '📚', name: 'books' }, { icon: '📖', name: 'open_book' },
        { icon: '🔖', name: 'bookmark' }, { icon: '🏷️', name: 'label' }, { icon: '✏️', name: 'pencil2' }, { icon: '🖊️', name: 'pen' },
        { icon: '🔍', name: 'mag' }, { icon: '🔎', name: 'mag_right' }, { icon: '🔑', name: 'key' }, { icon: '🔒', name: 'lock' },
        { icon: '🔓', name: 'unlock' }, { icon: '🛠️', name: 'hammer_and_wrench' }, { icon: '🔧', name: 'wrench' }, { icon: '🔨', name: 'hammer' },
        { icon: '⚙️', name: 'gear' }, { icon: '🧰', name: 'toolbox' }, { icon: '🧪', name: 'test_tube' }, { icon: '🧩', name: 'jigsaw' },
        { icon: '💻', name: 'computer' }, { icon: '🖥️', name: 'desktop_computer' }, { icon: '⌨️', name: 'keyboard' }, { icon: '📱', name: 'iphone' },
        { icon: '☎️', name: 'phone' }, { icon: '📞', name: 'telephone_receiver' }, { icon: '📧', name: 'e-mail' }, { icon: '📨', name: 'incoming_envelope' },
        { icon: '📬', name: 'mailbox_with_mail' }, { icon: '💬', name: 'speech_balloon' }, { icon: '🗨️', name: 'left_speech_bubble' }, { icon: '💭', name: 'thought_balloon' },
        { icon: '📣', name: 'mega' }, { icon: '📢', name: 'loudspeaker' }, { icon: '🎯', name: 'dart' }, { icon: '🏁', name: 'checkered_flag' },
        { icon: '🚩', name: 'triangular_flag_on_post' }, { icon: '🏆', name: 'trophy' }, { icon: '🥇', name: '1st_place_medal' }, { icon: '🎖️', name: 'medal_military' },
    ] },
    { name: 'Fremdrift og reise', icons: [
        { icon: '🚀', name: 'rocket' }, { icon: '✈️', name: 'airplane' }, { icon: '🚗', name: 'red_car' }, { icon: '🚲', name: 'bike' },
        { icon: '🏃', name: 'running_man' }, { icon: '🚶', name: 'walking_man' }, { icon: '🛑', name: 'stop_sign' }, { icon: '🚧', name: 'construction' },
        { icon: '🗺️', name: 'world_map' }, { icon: '🧭', name: 'compass' }, { icon: '🏠', name: 'house' }, { icon: '🏢', name: 'office' },
        { icon: '🏫', name: 'school' }, { icon: '🏥', name: 'hospital' }, { icon: '🌍', name: 'earth_africa' }, { icon: '🌐', name: 'globe_with_meridians' },
    ] },
    { name: 'Natur og vær', icons: [
        { icon: '☀️', name: 'sunny' }, { icon: '🌤️', name: 'sun_behind_small_cloud' }, { icon: '⛅', name: 'partly_sunny' }, { icon: '🌧️', name: 'cloud_with_rain' },
        { icon: '⛈️', name: 'cloud_with_lightning_and_rain' }, { icon: '❄️', name: 'snowflake' }, { icon: '🌈', name: 'rainbow' }, { icon: '🌙', name: 'crescent_moon' },
        { icon: '🌱', name: 'seedling' }, { icon: '🌳', name: 'deciduous_tree' }, { icon: '🌸', name: 'cherry_blossom' }, { icon: '🍀', name: 'four_leaf_clover' },
        { icon: '🐛', name: 'bug' }, { icon: '🐞', name: 'beetle' }, { icon: '🐶', name: 'dog' }, { icon: '🐱', name: 'cat' },
        { icon: '🦄', name: 'unicorn' },
    ] },
    { name: 'Mat og feiring', icons: [
        { icon: '☕', name: 'coffee' }, { icon: '🍵', name: 'tea' }, { icon: '🍺', name: 'beer' }, { icon: '🍷', name: 'wine_glass' },
        { icon: '🍕', name: 'pizza' }, { icon: '🍔', name: 'hamburger' }, { icon: '🍰', name: 'cake' }, { icon: '🎂', name: 'birthday' },
        { icon: '🍪', name: 'cookie' }, { icon: '🍎', name: 'apple' }, { icon: '🍌', name: 'banana' }, { icon: '🎉', name: 'tada' },
        { icon: '🎊', name: 'confetti_ball' }, { icon: '🎈', name: 'balloon' }, { icon: '🎁', name: 'gift' }, { icon: '🎵', name: 'musical_note' },
        { icon: '🎶', name: 'notes' }, { icon: '🎮', name: 'video_game' }, { icon: '🎬', name: 'clapper' }, { icon: '📷', name: 'camera' },
        { icon: '💰', name: 'moneybag' }, { icon: '💸', name: 'money_with_wings' }, { icon: '💳', name: 'credit_card' }, { icon: '🛒', name: 'shopping_cart' },
    ] },
];
const SHORTCODE_BY_EMOJI = new Map(EMOJI.flatMap(group =>
    group.icons.map(({ icon, name }) => [icon, name])
));

// Norwegian search words for common emojis (the catalog itself is English).
const NO_KEYWORDS = {
    grinning: 'glad smil', smiley: 'glad smil', smile: 'glad smil', grin: 'glis', laughing: 'latter le',
    joy: 'latter le gråte morsomt', rofl: 'latter le morsomt', wink: 'blunk', blush: 'rødme glad',
    innocent: 'uskyldig engel', heart_eyes: 'forelsket elsker', thinking: 'tenke hmm', sweat_smile: 'puh lettet',
    neutral_face: 'nøytral', roll_eyes: 'himle', sleeping: 'sove trøtt', mask: 'syk maske', partying_face: 'fest feiring',
    cry: 'trist gråte', sob: 'gråte trist', scream: 'redd skrik sjokk', rage: 'sint', angry: 'sint',
    sunglasses: 'kul', nerd_face: 'nerd', exploding_head: 'sjokk overrasket', robot: 'robot', ghost: 'spøkelse',
    '+1': 'tommel opp bra ja enig', '-1': 'tommel ned dårlig nei uenig', ok_hand: 'ok greit', clap: 'klappe bravo applaus',
    raised_hands: 'hurra jubel', pray: 'takk be vær så snill', muscle: 'sterk muskel', wave: 'hei vinke ha det',
    handshake: 'avtale håndtrykk', crossed_fingers: 'lykke krysse fingre', eyes: 'øyne se titte', brain: 'hjerne smart',
    point_right: 'peke høyre', point_left: 'peke venstre', point_up_2: 'peke opp', point_down: 'peke ned',
    shrug: 'vet ikke skuldre', raising_hand: 'rekke opp hånda spørsmål', writing_hand: 'skrive',
    heart: 'hjerte kjærlighet rød', broken_heart: 'knust hjerte', 100: 'hundre perfekt', white_check_mark: 'ferdig ok sjekk ja',
    heavy_check_mark: 'ferdig sjekk', x: 'nei feil kryss', question: 'spørsmål', exclamation: 'viktig utrop',
    warning: 'advarsel obs', no_entry_sign: 'forbudt', red_circle: 'rød', large_blue_circle: 'blå', star: 'stjerne',
    star2: 'stjerne', sparkles: 'glitter nytt', fire: 'ild brann hot', boom: 'smell eksplosjon', bulb: 'idé lyspære',
    bell: 'bjelle varsel', recycle: 'gjenbruk', new: 'ny',
    memo: 'notat skrive', pushpin: 'nål feste', round_pushpin: 'sted nål', paperclip: 'binders vedlegg',
    clipboard: 'utklippstavle liste', file_folder: 'mappe', open_file_folder: 'mappe', date: 'dato kalender',
    calendar: 'kalender dato', alarm_clock: 'alarm klokke', hourglass: 'tid venter', bar_chart: 'diagram statistikk',
    chart_with_upwards_trend: 'økning vekst opp', chart_with_downwards_trend: 'nedgang ned', page_facing_up: 'dokument side',
    books: 'bøker', book: 'bok', bookmark: 'bokmerke', label: 'etikett merke', pencil2: 'blyant', mag: 'søk forstørrelse',
    key: 'nøkkel', lock: 'lås', unlock: 'låse opp', hammer_and_wrench: 'verktøy', wrench: 'verktøy skiftenøkkel',
    hammer: 'hammer', gear: 'innstillinger tannhjul', toolbox: 'verktøykasse', test_tube: 'test', jigsaw: 'puslespill',
    computer: 'datamaskin pc', iphone: 'mobil telefon', phone: 'telefon', telephone_receiver: 'telefon ringe',
    email: 'epost e-post', speech_balloon: 'kommentar snakke prat', thought_balloon: 'tanke', mega: 'kunngjøring',
    loudspeaker: 'høyttaler kunngjøring', dart: 'mål blink', checkered_flag: 'mål ferdig', triangular_flag_on_post: 'flagg',
    trophy: 'pokal seier vinne', '1st_place_medal': 'medalje første', rocket: 'rakett lansering', airplane: 'fly reise',
    car: 'bil', bike: 'sykkel', runner: 'løpe', walking: 'gå', stop_sign: 'stopp', construction: 'under arbeid anleggsarbeid',
    world_map: 'kart', compass: 'kompass', house: 'hus hjem', office: 'kontor', school: 'skole', hospital: 'sykehus',
    earth_africa: 'jorda verden', globe_with_meridians: 'verden nett', sunny: 'sol', cloud_with_rain: 'regn',
    snowflake: 'snø', rainbow: 'regnbue', crescent_moon: 'måne natt', seedling: 'spire vokse', deciduous_tree: 'tre',
    four_leaf_clover: 'kløver lykke', bug: 'feil insekt bug', beetle: 'marihøne', dog: 'hund', cat: 'katt', unicorn: 'enhjørning',
    coffee: 'kaffe', tea: 'te', beer: 'øl', wine_glass: 'vin', cake: 'kake', birthday: 'bursdag kake', cookie: 'kjeks',
    apple: 'eple', tada: 'feiring gratulerer fest hurra', confetti_ball: 'konfetti fest', balloon: 'ballong',
    gift: 'gave presang', musical_note: 'musikk', video_game: 'spill', camera: 'kamera bilde', moneybag: 'penger',
    money_with_wings: 'penger utgift', credit_card: 'kort betale', shopping_cart: 'handle handlekurv',
};

const RECENT_KEY = 'wn-emoji-recent';
const RECENT_MAX = 16;
const SEARCH_LIMIT = 96;

function curatedSearchItems() {
    return EMOJI.flatMap(group => group.icons.map(({ icon, name }) => ({
        icon, name, keywords: (NO_KEYWORDS[name] || '').split(' ').filter(Boolean),
    })));
}

let catalogPromise = null;
function loadEmojiCatalog() {
    if (!catalogPromise) {
        catalogPromise = fetch('/emoji-catalog.json')
            .then(response => response.ok ? response.json() : [])
            .then(items => (Array.isArray(items) ? items : []).filter(item => item && item.name && item.icon))
            .catch(() => []);
    }
    return catalogPromise;
}

function readRecentEmoji() {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        return Array.isArray(list) ? list.filter(item => item && item.icon && item.name).slice(0, RECENT_MAX) : [];
    } catch { return []; }
}

function rememberEmoji(item) {
    try {
        const list = [item, ...readRecentEmoji().filter(other => other.name !== item.name)].slice(0, RECENT_MAX);
        localStorage.setItem(RECENT_KEY, JSON.stringify(list.map(({ icon, name }) => ({ icon, name }))));
    } catch { /* storage unavailable */ }
}

const MENTION_RE = /(?:^|[\s\n(\[])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g;
function extractMentions(text) {
    return [...new Set([...String(text || '').matchAll(MENTION_RE)].map(m => m[1]))];
}

const FEATURES = ['lists', 'indent', 'emoji', 'mentions', 'tasks', 'results', 'dates', 'meetings', 'help'];
const HELP = {
    lists: 'Enter fortsetter lister',
    indent: 'Tab/Shift+Tab innrykk',
    emoji: ':: emoji',
    mentions: '@ omtale',
    tasks: '{{? oppgave',
    results: '[[? resultat',
    dates: 'Ctrl+D dato · Ctrl+Shift+D dato/tid',
    meetings: 'Ctrl+M møte',
};

const STYLES = `
    :host { display: block; position: relative; width: 100%; height: 100%; min-height: 0; }
    :host([rows]) { height: auto; }
    :host([rows]) .editor { height: auto; }
    :host([rows]) textarea { flex: none; min-height: 3.2em; padding: 8px 10px; resize: vertical; font-family: inherit; }
    textarea[readonly] { background: var(--surface-alt, var(--surface)); color: var(--text-muted); }
    .editor { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
    textarea { flex: 1 1 auto; width: 100%; min-height: 0; padding: 14px; border: 1px solid var(--border); border-radius: 8px; font-family: var(--font-mono, monospace); font-size: 0.95em; line-height: 1.5; resize: none; outline: none; box-sizing: border-box; background: var(--surface); color: var(--text-strong); overflow: auto; }
    textarea:focus { border-color: var(--accent); }
    .editor-help { flex: 0 0 auto; padding: 5px 2px 0; color: var(--text-subtle); font-size: 0.72em; line-height: 1.45; }
    .emoji-pop { position: absolute; z-index: 20; left: 8px; top: 8px; display: none; max-width: calc(100% - 16px); max-height: calc(100% - 16px); overflow: auto; padding: 8px; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--surface); }
    .emoji-pop[open] { display: block; }
    .emoji-search { display: block; width: 100%; box-sizing: border-box; margin-bottom: 8px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-strong); font: inherit; outline: none; }
    .emoji-search:focus { border-color: var(--accent); }
    .emoji-empty { padding: 6px 2px; color: var(--text-subtle); font-size: 0.85em; }
    .emoji-empty[hidden] { display: none; }
    .emoji-preview { position: sticky; bottom: -8px; display: flex; align-items: center; gap: 8px; margin: 8px -8px -8px; padding: 6px 10px; border-top: 1px solid var(--border-faint, var(--border-soft)); background: var(--surface-alt, var(--surface)); font-size: 0.8em; color: var(--text-muted); }
    .emoji-preview-icon { font-size: 1.8em; line-height: 1; }
    .emoji-preview-name { color: var(--text-strong); font-family: var(--font-mono, monospace); }
    .emoji-preview-hint { margin-left: auto; color: var(--text-subtle); white-space: nowrap; }
`;

class FeatureRichTextArea extends WNElement {
    static get domain() { return 'notes'; }
    static get observedAttributes() { return ['value', 'placeholder', 'disabled', 'readonly', 'rows', 'features']; }
    static get formAssociated() { return true; }

    constructor() {
        super();
        this._internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    }

    // Comma/space separated subset of FEATURES; absent means every feature.
    get features() {
        const raw = this.getAttribute('features');
        if (raw == null) return new Set(FEATURES);
        return new Set(raw.split(/[\s,]+/).filter(name => FEATURES.includes(name)));
    }

    _has(feature) { return this.features.has(feature); }

    // Help line: enabled features plus `help` labels on host triggers.
    _helpText() {
        const features = this.features;
        if (!features.has('help')) return '';
        return [
            ...FEATURES.filter(name => features.has(name) && HELP[name]).map(name => HELP[name]),
            ...(this._extraTriggers || []).map(trigger => trigger?.help).filter(Boolean),
        ].join(' · ');
    }

    _updateHelp() {
        const textarea = this.textarea;
        if (!textarea) return;
        const text = textarea.readOnly || textarea.disabled ? '' : this._helpText();
        let el = this.shadowRoot.querySelector('.editor-help');
        if (!text) { el?.remove(); return; }
        if (!el) {
            el = document.createElement('div');
            el.className = 'editor-help';
            textarea.after(el);
        }
        el.textContent = text;
    }

    css() { return STYLES; }

    render() {
        const value = this.value;
        const rows = Math.max(2, Number(this.getAttribute('rows')) || 10);
        const disabled = this.hasAttribute('disabled');
        const readonly = this.hasAttribute('readonly');
        const features = this.features;
        const help = !readonly && !disabled ? this._helpText() : '';
        return html`
            <div class="editor">
                <textarea aria-label="${this.getAttribute('aria-label') || 'Markdown'}" placeholder="${this.getAttribute('placeholder') || ''}" rows="${rows}" ${disabled ? 'disabled' : ''} ${readonly ? 'readonly' : ''}>${value}</textarea>
                ${help ? html`<div class="editor-help">${help}</div>` : ''}
                <div class="emoji-pop" role="dialog" aria-label="Velg emoji" aria-modal="false">
                    <input type="search" class="emoji-search" placeholder="Søk emoji – navn eller ord (f.eks. tommel, rakett)…" aria-label="Søk emoji" autocomplete="off">
                    <div class="emoji-empty" hidden>Ingen treff</div>
                    <icon-picker columns="8" size="32" groups="${JSON.stringify(EMOJI)}"></icon-picker>
                    <div class="emoji-preview" aria-live="polite">
                        <span class="emoji-preview-icon"></span>
                        <code class="emoji-preview-name"></code>
                        <span class="emoji-preview-hint">↑↓←→ velg · Enter sett inn · Esc avbryt</span>
                    </div>
                </div>
            </div>
        `;
    }

    connectedCallback() {
        if (this._value == null) this._value = this.getAttribute('value') ?? this.textContent ?? '';
        if (this._defaultValue == null) this._defaultValue = this._value;
        this._syncFormValue();
        super.connectedCallback();
    }

    formResetCallback() { this.value = this._defaultValue || ''; }

    formDisabledCallback(disabled) { this.toggleAttribute('disabled', disabled); }

    _syncFormValue() { this._internals?.setFormValue?.(this.value); }

    focus(options) {
        if (this.textarea) this.textarea.focus(options);
        else super.focus(options);
    }

    get selectionStart() { return this.textarea?.selectionStart ?? 0; }
    get selectionEnd() { return this.textarea?.selectionEnd ?? 0; }
    setSelectionRange(start, end, direction) { this.textarea?.setSelectionRange(start, end, direction); }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'value') {
            this._value = newValue || '';
            this._syncFormValue();
        }
        super.attributeChangedCallback(name, oldValue, newValue);
    }

    afterRender() {
        this._shortcutHandles?.forEach(handle => handle.destroy());
        this._shortcutHandles = [];
        this._acHandle?.destroy();
        this._acHandle = null;
        const textarea = this.textarea;
        if (!textarea) return;
        if (this._selection) {
            textarea.setSelectionRange(this._selection.start, this._selection.end, this._selection.direction);
        }
        this.shadowRoot.querySelector('icon-picker')?.addEventListener('valueChanged', event => {
            const icon = event.detail?.value || '';
            const item = (this._emojiList || []).find(entry => entry.icon === icon);
            this._insertAtSelection(icon, item?.name || SHORTCODE_BY_EMOJI.get(icon));
            this._closeEmojiPicker();
        });
        this.shadowRoot.querySelector('.emoji-pop')?.addEventListener('keydown', event => this._onEmojiKeydown(event));
        this.shadowRoot.querySelector('.emoji-search')?.addEventListener('input', event => {
            event.stopPropagation();
            this._applyEmojiFilter();
        });
        textarea.addEventListener('mousedown', () => {
            if (this._emojiPickerOpen) this._closeEmojiPicker({ removeTrigger: false });
        });
        textarea.addEventListener('change', () => {
            this.dispatchEvent(new Event('change', { bubbles: true }));
        });
        textarea.addEventListener('input', () => {
            this._value = textarea.value;
            this._syncFormValue();
            this.dispatchEvent(new CustomEvent('feature-rich-text-area:input', {
                bubbles: true,
                composed: true,
                detail: { value: this.value },
            }));
            if (this._has('emoji') && !textarea.readOnly && !textarea.disabled) this._checkEmojiTrigger(textarea);
        });
        textarea.addEventListener('keydown', event => this._onKeydown(event));
        if (this.hasAttribute('readonly') || this.hasAttribute('disabled')) return;
        if (this._has('dates')) this._shortcutHandles.push(attachDateTrigger(textarea));
        if (this._has('meetings')) this._shortcutHandles.push(attachMeetingShortcut(textarea));
        this._reattachAutocomplete();
    }

    disconnectedCallback() {
        this._shortcutHandles?.forEach(handle => handle.destroy());
        this._shortcutHandles = [];
        this._acHandle?.destroy();
        this._acHandle = null;
    }

    _reattachAutocomplete() {
        this._acHandle?.destroy();
        this._acHandle = null;
        const textarea = this.textarea;
        if (!textarea || textarea.readOnly || textarea.disabled) return;
        this._acHandle = this._attachAutocomplete(textarea);
    }

    _mentionSource() {
        if (!this._mentions) this._mentions = createMentionSource({ serviceFor: key => this.serviceFor(key), servicesOnly: true });
        return this._mentions;
    }

    _attachAutocomplete(textarea) {
        const service = this.serviceFor('tasks');
        let openTasks = null;
        const taskTrigger = {
            detect: (text, caret) => {
                const prefix = text.slice(0, caret);
                const open = prefix.lastIndexOf('{{?');
                const close = prefix.lastIndexOf('{{!');
                const start = Math.max(open, close);
                if (start < 0) return null;
                const query = prefix.slice(start + 3);
                if (/[\n}]/.test(query)) return null;
                return { query, start, end: caret, extra: { kind: start === close ? '!' : '?' } };
            },
            fetchItems: async () => {
                if (!openTasks) {
                    if (!service || typeof service.list !== 'function') {
                        throw new Error('Task autocomplete requires a tasks_service with list()');
                    }
                    const tasks = await service.list();
                    if (!Array.isArray(tasks)) throw new TypeError('tasks_service.list() must return an array');
                    openTasks = tasks.filter(task => task && !task.done);
                }
                return openTasks.map(task => ({
                    value: task.id,
                    label: task.text || '(uten tekst)',
                    hint: task.week || '',
                }));
            },
            filter: 'words',
            limit: 12,
            renderItem: (item, query) => `✓ ${highlightMatch(item.label, query)}` +
                (item.hint ? `<span style="opacity:0.55;font-size:0.85em"> · ${highlightMatch(item.hint, query)}</span>` : ''),
            onSelect: (item, context) => {
                let end = context.range.end;
                if (textarea.value.slice(end, end + 2) === '}}') end += 2;
                const kind = context.extra?.kind || '?';
                replaceRange(textarea, context.range.start, end, `{{${kind}${item.value}}} `);
            },
        };
        const triggers = [...(this._extraTriggers || [])];
        if (this._has('tasks')) triggers.push(taskTrigger);
        if (this._has('results')) triggers.push(this._resultTrigger(textarea));
        if (this._has('mentions')) triggers.push(this._mentionSource().createTrigger());
        return attachAutocomplete(textarea, {
            triggers,
            container: this.shadowRoot,
        });
    }

    // '[[?' picks a result from results_service and inserts '[[?<id>]]'.
    _resultTrigger(textarea) {
        const service = this.serviceFor('results');
        let results = null;
        return {
            detect: (text, caret) => {
                const prefix = text.slice(0, caret);
                const start = prefix.lastIndexOf('[[?');
                if (start < 0) return null;
                const query = prefix.slice(start + 3);
                if (/[\n\]]/.test(query)) return null;
                return { query, start, end: caret };
            },
            fetchItems: async () => {
                if (!results) {
                    if (!service || typeof service.list !== 'function') {
                        throw new Error('Result autocomplete requires a results_service with list()');
                    }
                    const list = await service.list();
                    if (!Array.isArray(list)) throw new TypeError('results_service.list() must return an array');
                    results = list.slice().sort((a, b) =>
                        String(b.created || b.week || '').localeCompare(String(a.created || a.week || '')));
                }
                return results.map(result => ({
                    value: result.id,
                    label: result.text || '(uten tekst)',
                    hint: result.week || '',
                }));
            },
            filter: 'words',
            limit: 12,
            renderItem: (item, query) => `🏁 ${highlightMatch(item.label, query)}` +
                (item.hint ? `<span style="opacity:0.55;font-size:0.85em"> · ${highlightMatch(item.hint, query)}</span>` : ''),
            onSelect: (item, context) => {
                let end = context.range.end;
                if (textarea.value.slice(end, end + 2) === ']]') end += 2;
                replaceRange(textarea, context.range.start, end, `[[?${item.value}]] `);
            },
        };
    }

    // Host-specific autocomplete triggers (same shape as wn-autocomplete
    // triggers); onSelect receives the inner textarea as ctx.textarea.
    // An optional `help` string is appended to the help line.
    get triggers() { return this._extraTriggers || []; }
    set triggers(list) {
        this._extraTriggers = Array.isArray(list) ? list : [];
        this._updateHelp();
        this._reattachAutocomplete();
    }

    get textarea() { return this.shadowRoot?.querySelector('textarea') || null; }
    get value() { return this._value == null ? '' : String(this._value); }
    set value(value) {
        this._value = value == null ? '' : String(value);
        if (this.textarea && this.textarea.value !== this._value) this.textarea.value = this._value;
        this._syncFormValue();
    }

    _replace(start, end, insertion, selectionStart = null, selectionEnd = null) {
        const textarea = this.textarea;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);
        textarea.value = before + insertion + after;
        const caret = before.length + insertion.length;
        textarea.setSelectionRange(selectionStart ?? caret, selectionEnd ?? selectionStart ?? caret);
        this._value = textarea.value;
        this._syncFormValue();
        textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }

    // Turn inline create markers into entities through the injected
    // services. Hosts await this before saving. Enabled features decide
    // what is converted:
    //   tasks    {{X}}                              → tasks_service.create
    //   results  [[X]] / [[X+]] / [[X-]]            → results_service.create
    //   meetings {{m:Title @ YYYY-MM-DD HH:MM[ Nm]}} → meetings_service.create
    // replaceWith 'ref' writes {{?id}} / [[?id]] / {{m:?id}}; 'text' keeps
    // only the plain text. Returns { value, created }.
    async convert({ week = '', noteRef = '', taskId = '', taskText = '', replaceWith = 'ref' } = {}) {
        const asText = replaceWith === 'text';
        const noteMentions = extractMentions(this.value);
        const created = { tasks: [], results: [], meetings: [] };
        const need = key => {
            const service = this.serviceFor(key);
            if (!service || typeof service.create !== 'function') throw new Error(`${key}_service mangler`);
            return service;
        };
        let value = this.value;
        // Replace one marker at a time so markers already turned into
        // entities stay converted even if a later create fails.
        const each = async (re, fn) => {
            let pos = 0;
            for (;;) {
                re.lastIndex = pos;
                const m = re.exec(value);
                if (!m) return;
                const replacement = await fn(m);
                value = value.slice(0, m.index) + replacement + value.slice(m.index + m[0].length);
                pos = m.index + replacement.length;
            }
        };
        const commit = () => {
            if (value === this.value) return;
            this.value = value;
            this.textarea?.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        };

        try {
            if (this._has('tasks')) {
                await each(/\{\{([^{}]+)\}\}/g, async m => {
                    const text = m[1].trim();
                    if (!text || /^[?!]/.test(text) || /^m:/i.test(text)) return m[0];
                    const opts = {};
                    if (week) opts.week = week;
                    if (noteRef) opts.noteRef = noteRef;
                    const res = await need('tasks').create(text, opts);
                    const task = Array.isArray(res) ? res[res.length - 1] : (res?.task || res);
                    if (!task?.id) throw new Error('Kunne ikke opprette oppgave');
                    created.tasks.push(task);
                    return asText ? text : `{{?${task.id}}}`;
                });
            }

            if (this._has('results')) {
                await each(/\[\[([^[\]]+)\]\]/g, async m => {
                    let text = m[1].trim();
                    if (!text || /^[?!]/.test(text)) return m[0];
                    let sentiment = null;
                    if (text.endsWith('+')) sentiment = 'good';
                    else if (text.endsWith('-')) sentiment = 'bad';
                    if (sentiment) text = text.slice(0, -1).trimEnd();
                    if (!text) return m[0];
                    const data = { text, people: [...new Set([...noteMentions, ...extractMentions(text)])] };
                    if (week) data.week = week;
                    if (sentiment) data.sentiment = sentiment;
                    if (taskId) data.taskId = taskId;
                    if (taskText) data.taskText = taskText;
                    const res = await need('results').create(data);
                    const result = res?.result || res;
                    if (!result?.id) throw new Error('Kunne ikke opprette resultat');
                    created.results.push(result);
                    return asText ? text : `[[?${result.id}]]`;
                });
            }

            if (this._has('meetings')) {
                await each(/\{\{m:([^{}]+)\}\}/gi, async m => {
                    const inner = m[1].trim();
                    if (/^[?!]/.test(inner)) return m[0];
                    const at = inner.lastIndexOf('@');
                    if (at < 0) return m[0];
                    const title = inner.slice(0, at).trim();
                    const when = inner.slice(at + 1).trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?:\s+(\d+)m)?$/);
                    if (!title || !when) return m[0];
                    const data = { title, date: when[1], start: when[2], type: 'standup', attendees: noteMentions };
                    if (when[3]) data.durationMinutes = parseInt(when[3], 10);
                    if (noteRef) data.noteRef = noteRef;
                    const res = await need('meetings').create(data);
                    const meeting = res?.meeting || res;
                    if (!meeting?.id) throw new Error('Kunne ikke opprette møte');
                    created.meetings.push(meeting);
                    return asText ? title : `{{m:?${meeting.id}}}`;
                });
            }
        } finally {
            commit();
        }
        return { value, created };
    }

    _insertAtSelection(value, name = SHORTCODE_BY_EMOJI.get(value)) {
        const textarea = this.textarea;
        const range = this._selection || {
            start: textarea.selectionStart,
            end: textarea.selectionEnd,
        };
        if (name) rememberEmoji({ icon: value, name });
        this._replace(range.start, range.end, name ? `:${name}:` : value);
        textarea.focus();
        this._selection = null;
    }

    _checkEmojiTrigger(textarea) {
        if (this._emojiPickerOpen || textarea.selectionStart !== textarea.selectionEnd) return;
        const caret = textarea.selectionStart;
        if (caret < 2 || textarea.value.slice(caret - 2, caret) !== '::') return;
        // The "::" stays in the text until an emoji replaces it or Esc removes it.
        this._selection = { start: caret - 2, end: caret };
        this._emojiPickerOpen = true;
        this.shadowRoot.querySelector('.emoji-pop')?.setAttribute('open', '');
        const search = this.shadowRoot.querySelector('.emoji-search');
        if (search) search.value = '';
        this._applyEmojiFilter();
        search?.focus();
        if (!this._catalog) {
            loadEmojiCatalog().then(items => {
                this._catalog = items;
                if (this._emojiPickerOpen && this._emojiQuery()) this._applyEmojiFilter();
            });
        }
    }

    _emojiQuery() {
        return normalizeEmojiQuery(this.shadowRoot.querySelector('.emoji-search')?.value);
    }

    _searchItems() {
        if (this._searchItemsCache && this._searchItemsFor === this._catalog) return this._searchItemsCache;
        // Merge the curated Norwegian keywords into the full English catalog.
        const byName = new Map(curatedSearchItems().map(item => [item.name, { ...item }]));
        for (const item of this._catalog || []) {
            const existing = byName.get(item.name);
            if (existing) existing.keywords = [...existing.keywords, ...(item.keywords || [])];
            else byName.set(item.name, { icon: item.icon, name: item.name, keywords: item.keywords || [] });
        }
        this._searchItemsFor = this._catalog;
        this._searchItemsCache = [...byName.values()];
        return this._searchItemsCache;
    }

    _emojiGroups(query) {
        if (!query) {
            const recent = readRecentEmoji();
            return recent.length ? [{ name: 'Nylig brukt', icons: recent }, ...EMOJI] : EMOJI;
        }
        const hits = searchEmoji(this._searchItems(), query);
        const icons = hits.slice(0, SEARCH_LIMIT).map(({ icon, name }) => ({ icon, name }));
        const more = hits.length > icons.length ? ` – viser ${icons.length}` : '';
        return icons.length ? [{ name: `Treff (${hits.length}${more})`, icons }] : [];
    }

    _applyEmojiFilter() {
        const picker = this.shadowRoot.querySelector('icon-picker');
        const groups = this._emojiGroups(this._emojiQuery());
        this._emojiList = groups.flatMap(group => group.icons);
        picker?.setAttribute('groups', JSON.stringify(groups));
        const empty = this.shadowRoot.querySelector('.emoji-empty');
        if (empty) empty.hidden = this._emojiList.length > 0;
        this._setActiveEmoji(0);
    }

    _setActiveEmoji(index) {
        const picker = this.shadowRoot.querySelector('icon-picker');
        this._emojiActive = index;
        const cells = picker?.shadowRoot?.querySelectorAll('.cell') || [];
        cells.forEach((cell, i) => {
            cell.classList.toggle('selected', i === index);
            cell.setAttribute('aria-selected', String(i === index));
        });
        cells[index]?.scrollIntoView({ block: 'nearest' });
        const item = this._emojiList?.[index];
        const icon = this.shadowRoot.querySelector('.emoji-preview-icon');
        const name = this.shadowRoot.querySelector('.emoji-preview-name');
        if (icon) icon.textContent = item?.icon || '';
        if (name) name.textContent = item ? `:${item.name}:` : '';
    }

    _onEmojiKeydown(event) {
        if (!this._emojiPickerOpen) return;
        const list = this._emojiList || [];
        const picker = this.shadowRoot.querySelector('icon-picker');
        const columns = Math.max(1, Number(picker?.getAttribute('columns')) || 8);
        const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
        if (event.key in moves) {
            event.preventDefault();
            const next = (this._emojiActive || 0) + moves[event.key];
            if (next >= 0 && next < list.length) this._setActiveEmoji(next);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const item = list[this._emojiActive || 0];
            if (!item) return;
            this._insertAtSelection(item.icon, item.name);
            this._closeEmojiPicker();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this._closeEmojiPicker();
        }
    }

    _closeEmojiPicker({ removeTrigger = true } = {}) {
        const trigger = this._selection;
        this._emojiPickerOpen = false;
        this._selection = null;
        this.shadowRoot.querySelector('.emoji-pop')?.removeAttribute('open');
        const textarea = this.textarea;
        if (!textarea) return;
        if (removeTrigger && trigger && textarea.value.slice(trigger.start, trigger.end) === '::') {
            this._replace(trigger.start, trigger.end, '');
        }
        textarea.focus();
    }

    _onKeydown(event) {
        const textarea = event.currentTarget;
        if (event.key === 'Escape' && this._emojiPickerOpen) {
            event.preventDefault();
            this._closeEmojiPicker();
        } else if (textarea.readOnly || textarea.disabled) {
            return;
        } else if (event.key === 'Enter' && this._has('lists') && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (this._handleListEnter(textarea)) event.preventDefault();
        } else if (event.key === 'Tab' && this._has('indent') && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            if (!event.shiftKey && textarea.selectionStart === textarea.selectionEnd) {
                this._replace(textarea.selectionStart, textarea.selectionEnd, '    ');
            } else {
                this._indentLines(textarea, event.shiftKey);
            }
        }
    }

    _handleListEnter(textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        if (start !== end) return false;
        const value = textarea.value;
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIndex = value.indexOf('\n', start);
        const lineEnd = lineEndIndex < 0 ? value.length : lineEndIndex;
        const line = value.slice(lineStart, lineEnd);
        const match = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?(.*)$/.exec(line);
        if (!match) return false;

        const [, indent, marker, spacing, checkbox = '', content] = match;
        const prefixLength = indent.length + marker.length + spacing.length + checkbox.length;
        if (start < lineStart + prefixLength) return false;
        if (!content.trim()) {
            this._replace(lineStart, lineEnd, `${indent}\n`);
            textarea.setSelectionRange(lineStart + indent.length + 1, lineStart + indent.length + 1);
            return true;
        }
        const nextMarker = /^\d+[.)]$/.test(marker) ? `${Number.parseInt(marker, 10) + 1}${marker.slice(-1)}` : marker;
        const nextCheckbox = checkbox ? '[ ] ' : '';
        const skipSpace = /^[ \t]$/.test(value[start] || '') ? 1 : 0;
        this._replace(start, start + skipSpace, `\n${indent}${nextMarker}${spacing}${nextCheckbox}`);
        return true;
    }

    _indentLines(textarea, outdent) {
        const value = textarea.value;
        const selectionStart = textarea.selectionStart;
        const selectionEnd = textarea.selectionEnd;
        const start = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
        const endLineBreak = value.indexOf('\n', selectionEnd);
        let end = endLineBreak < 0 ? value.length : endLineBreak;
        if (selectionEnd > selectionStart && value[selectionEnd - 1] === '\n') end = selectionEnd - 1;
        const block = value.slice(start, end);
        const lines = block.split('\n');
        const changed = lines.map(line => {
            if (!outdent) return `    ${line}`;
            if (line.startsWith('\t')) return line.slice(1);
            if (line.startsWith('    ')) return line.slice(4);
            if (line.startsWith(' ')) return line.slice(1);
            return line;
        }).join('\n');
        if (changed === block) return;
        const removedIndent = line => line.startsWith('\t') ? 1 : Math.min(4, (line.match(/^ */) || [''])[0].length);
        const mapPosition = position => {
            const relative = Math.max(0, Math.min(block.length, position - start));
            const before = block.slice(0, relative);
            const lineIndex = (before.match(/\n/g) || []).length;
            const lineStart = before.lastIndexOf('\n') + 1;
            if (!outdent) return (lineIndex + 1) * 4;
            const localOffset = relative - lineStart;
            const priorDelta = -lines.slice(0, lineIndex).reduce((sum, line) => sum + removedIndent(line), 0);
            return priorDelta - Math.min(removedIndent(lines[lineIndex] || ''), localOffset);
        };
        const deltaBefore = mapPosition(selectionStart);
        const deltaEnd = mapPosition(selectionEnd);
        this._replace(start, end, changed, selectionStart + deltaBefore, selectionEnd + deltaEnd);
    }
}

if (!customElements.get('feature-rich-text-area')) {
    customElements.define('feature-rich-text-area', FeatureRichTextArea);
}
