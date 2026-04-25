const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { execSync } = require('child_process');

const PORT = parseInt(process.env.PORT, 10) || 3001;
const CONTEXTS_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ACTIVE_FILE = path.join(CONTEXTS_DIR, '.active');

function safeName(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function listContexts() {
    try {
        return fs.readdirSync(CONTEXTS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
            .map(d => d.name)
            .sort();
    } catch { return []; }
}

function getActiveContext() {
    let active = '';
    try { active = fs.readFileSync(ACTIVE_FILE, 'utf-8').trim(); } catch {}
    const all = listContexts();
    if (active && all.includes(active)) return active;
    if (all.length === 0) return '';
    const first = all[0];
    try { fs.writeFileSync(ACTIVE_FILE, first); } catch {}
    return first;
}

function setActiveContext(name) {
    const safe = safeName(name);
    if (!safe) throw new Error('Ugyldig kontekstnavn');
    if (!listContexts().includes(safe)) throw new Error('Kontekst finnes ikke');
    // Commit any pending changes in the current context before switching
    try {
        const current = (function(){ try { return fs.readFileSync(ACTIVE_FILE, 'utf-8').trim(); } catch { return ''; } })();
        if (current && current !== safe && listContexts().includes(current)) {
            const curDir = path.join(CONTEXTS_DIR, current);
            gitInitIfNeeded(curDir, getContextSettings(current).name || current);
            if (gitIsDirty(curDir)) {
                gitCommitAll(curDir, `Auto: bytter til ${safe} (${new Date().toISOString()})`);
            }
        }
    } catch (e) { console.error('pre-switch commit failed', e.message); }
    fs.writeFileSync(ACTIVE_FILE, safe);
    // Pull the target context if it has a remote configured
    try {
        const targetDir = path.join(CONTEXTS_DIR, safe);
        const targetSettings = getContextSettings(safe);
        if (gitIsRepo(targetDir) && (targetSettings.remote || '').trim()) {
            try { git(targetDir, 'pull --ff-only --quiet'); }
            catch (e) { console.error('git pull failed for', safe, e.message); }
        }
    } catch (e) { console.error('post-switch pull failed', e.message); }
    return safe;
}

function createContext(rawName, settings) {
    const safe = safeName(rawName);
    if (!safe) throw new Error('Ugyldig kontekstnavn');
    const dir = path.join(CONTEXTS_DIR, safe);
    if (fs.existsSync(dir)) throw new Error('Kontekst finnes allerede');
    fs.mkdirSync(dir, { recursive: true });
    const cfg = Object.assign({ name: rawName || safe, icon: '📁' }, settings || {});
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(cfg, null, 2));
    gitInitIfNeeded(dir, cfg.name);
    // Configure remote if supplied
    if ((cfg.remote || '').trim() && gitIsRepo(dir)) {
        try { git(dir, `remote add origin "${String(cfg.remote).replace(/"/g, '\\"')}"`); } catch (e) { console.error('git remote add failed', e.message); }
    }
    return safe;
}

function getContextSettings(name) {
    const safe = safeName(name);
    try { return JSON.parse(fs.readFileSync(path.join(CONTEXTS_DIR, safe, 'settings.json'), 'utf-8')); }
    catch { return { name: safe, icon: '📁' }; }
}

function setContextSettings(name, data) {
    const safe = safeName(name);
    if (!listContexts().includes(safe)) throw new Error('Kontekst finnes ikke');
    const dir = path.join(CONTEXTS_DIR, safe);
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(data, null, 2));
    // Sync git remote with settings.remote (if any)
    try { gitInitIfNeeded(dir, data.name || safe); } catch {}
    if (gitIsRepo(dir)) {
        const desired = String(data.remote || '').trim();
        let current = '';
        try { current = git(dir, 'remote get-url origin').trim(); } catch {}
        if (desired && desired !== current) {
            try { git(dir, current ? `remote set-url origin "${desired.replace(/"/g, '\\"')}"` : `remote add origin "${desired.replace(/"/g, '\\"')}"`); } catch (e) { console.error('git remote set failed', e.message); }
        } else if (!desired && current) {
            try { git(dir, 'remote remove origin'); } catch {}
        }
    }
    return data;
}

// All data paths resolve via the *current* active context, so switching is hot.
function dataDir() { return path.join(CONTEXTS_DIR, getActiveContext()); }
function tasksFile() { return path.join(dataDir(), 'tasks.json'); }
function notesMetaFile() { return path.join(dataDir(), 'notes-meta.json'); }
function peopleFile() { return path.join(dataDir(), 'people.json'); }
function resultsFile() { return path.join(dataDir(), 'results.json'); }
function meetingsFile() { return path.join(dataDir(), 'meetings.json'); }

// --- Git per context ---
function checkExternalTools() {
    const required = [
        { cmd: 'git', test: 'git --version', why: 'each context is a git repo (commit/push/pull)' }
    ];
    const optional = [
        { cmd: 'gh', test: 'gh --version', why: 'fetch GitHub auth token (otherwise set GH_TOKEN env var)' }
    ];
    const missing = [];
    for (const t of required) {
        try { execSync(t.test, { stdio: 'ignore' }); }
        catch { missing.push(t); }
    }
    if (missing.length) {
        console.error('\n❌ Required tools are missing:');
        for (const t of missing) console.error(`   - ${t.cmd}  (${t.why})`);
        console.error('\nInstall them and try again. Aborting.\n');
        process.exit(1);
    }
    for (const t of optional) {
        try { execSync(t.test, { stdio: 'ignore' }); }
        catch { console.warn(`⚠️  Optional tool not found: ${t.cmd}  (${t.why})`); }
    }
    try {
        const v = execSync('git --version', { encoding: 'utf-8' }).trim();
        console.log(`✓ ${v}`);
    } catch {}
}

function git(cwd, args) {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitIsRepo(dir) {
    try { return fs.existsSync(path.join(dir, '.git')); } catch { return false; }
}

function gitInitIfNeeded(dir, contextName) {
    if (gitIsRepo(dir)) return false;
    try {
        git(dir, 'init -q -b main');
        try { git(dir, `config user.email "ukenotater@local"`); } catch {}
        try { git(dir, `config user.name "Ukenotater"`); } catch {}
        try { git(dir, 'add -A'); } catch {}
        try { git(dir, `commit -q --allow-empty -m "Init kontekst: ${(contextName || path.basename(dir)).replace(/"/g, '\\"')}"`); } catch {}
        return true;
    } catch (e) {
        console.error('git init failed for', dir, e.message);
        return false;
    }
}

function gitIsDirty(dir) {
    if (!gitIsRepo(dir)) return false;
    try { return git(dir, 'status --porcelain').trim().length > 0; }
    catch { return false; }
}

function gitCommitAll(dir, message) {
    if (!gitIsRepo(dir)) gitInitIfNeeded(dir);
    if (!gitIsDirty(dir)) return { ok: true, committed: false };
    try {
        git(dir, 'add -A');
        const safe = (message || 'Endringer').replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 200);
        git(dir, `commit -q -m "${safe}"`);
        return { ok: true, committed: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function gitLastCommit(dir) {
    if (!gitIsRepo(dir)) return null;
    try {
        const out = git(dir, 'log -1 --format=%H%x09%cI%x09%s').trim();
        if (!out) return null;
        const [hash, iso, ...rest] = out.split('\t');
        return { hash: hash.slice(0, 7), date: iso, subject: rest.join('\t') };
    } catch { return null; }
}

function gitGetRemote(dir) {
    if (!gitIsRepo(dir)) return null;
    try { return git(dir, 'remote get-url origin').trim() || null; }
    catch { return null; }
}

function gitPush(dir) {
    if (!gitIsRepo(dir)) return { ok: false, error: 'Ikke et git-repo' };
    if (!gitGetRemote(dir)) return { ok: false, error: 'Ingen remote konfigurert' };
    try {
        const out = require('child_process').execSync('git push origin HEAD 2>&1', { cwd: dir, encoding: 'utf-8', timeout: 60000 });
        return { ok: true, output: out.trim() };
    } catch (e) {
        return { ok: false, error: (e.stdout || '') + (e.stderr || '') || e.message };
    }
}

function ensureAllContextsInitialised() {
    for (const id of listContexts()) {
        const dir = path.join(CONTEXTS_DIR, id);
        gitInitIfNeeded(dir, getContextSettings(id).name || id);
    }
}

function loadTasks() {
    try { return JSON.parse(fs.readFileSync(tasksFile(), 'utf-8')); }
    catch { return []; }
}

function saveTasks(tasks) {
    fs.writeFileSync(tasksFile(), JSON.stringify(tasks, null, 2), 'utf-8');
}

function loadPeople() {
    try {
        const all = JSON.parse(fs.readFileSync(peopleFile(), 'utf-8'));
        return Array.isArray(all) ? all.filter(p => !p.deleted) : [];
    }
    catch { return []; }
}

function loadAllPeople() {
    // Includes tombstoned (deleted:true) entries; used by syncMentions
    // to avoid auto-recreating people that the user explicitly deleted.
    try { return JSON.parse(fs.readFileSync(peopleFile(), 'utf-8')); }
    catch { return []; }
}

function savePeople(people) {
    fs.writeFileSync(peopleFile(), JSON.stringify(people, null, 2), 'utf-8');
}

function loadMeetings() {
    try { return JSON.parse(fs.readFileSync(meetingsFile(), 'utf-8')); }
    catch { return []; }
}

function saveMeetings(meetings) {
    fs.writeFileSync(meetingsFile(), JSON.stringify(meetings, null, 2), 'utf-8');
}

const DEFAULT_MEETING_TYPES = [
    { key: 'meeting', label: 'Møte', icon: '👥' },
    { key: '1on1', label: '1:1', icon: '☕' },
    { key: 'standup', label: 'Standup', icon: '🔄' },
    { key: 'workshop', label: 'Workshop', icon: '🛠️' },
    { key: 'demo', label: 'Demo', icon: '🎬' },
    { key: 'planning', label: 'Planlegging', icon: '📋' },
    { key: 'review', label: 'Gjennomgang', icon: '🔍' },
    { key: 'social', label: 'Sosialt', icon: '🎉' },
    { key: 'call', label: 'Telefon', icon: '📞' },
    { key: 'focus', label: 'Fokus', icon: '🎯' }
];
function meetingTypesFile(ctxId) { return path.join(CONTEXTS_DIR, ctxId || getActiveContext(), 'meeting-types.json'); }
function loadMeetingTypes(ctxId) {
    try {
        const arr = JSON.parse(fs.readFileSync(meetingTypesFile(ctxId), 'utf-8'));
        if (Array.isArray(arr)) return arr.filter(t => t && t.key);
    } catch {}
    return DEFAULT_MEETING_TYPES.slice();
}
function saveMeetingTypes(types, ctxId) {
    fs.writeFileSync(meetingTypesFile(ctxId), JSON.stringify(types, null, 2), 'utf-8');
}
function meetingTypeIcon(key) {
    const t = loadMeetingTypes().find(x => x.key === key);
    return t ? (t.icon || '') : '';
}
function meetingTypeLabel(key) {
    const t = loadMeetingTypes().find(x => x.key === key);
    return t ? (t.label || '') : '';
}

function getWorkHours(ctxId) {
    const s = ctxId ? getContextSettings(ctxId) : (getActiveContext() ? getContextSettings(getActiveContext()) : {});
    const reTime = /^\d{2}:\d{2}$/;
    // New format: workHours = array of length 7 (0=Mon..6=Sun), each {start,end} or null
    if (Array.isArray(s.workHours) && s.workHours.length === 7) {
        return {
            hours: s.workHours.map(h => {
                if (h && reTime.test(h.start) && reTime.test(h.end)) return { start: h.start, end: h.end };
                return null;
            })
        };
    }
    // Backward-compat: derive from old workStart/workEnd/workDays
    const start = reTime.test(s.workStart) ? s.workStart : '08:00';
    const end = reTime.test(s.workEnd) ? s.workEnd : '16:00';
    const daysArr = Array.isArray(s.workDays) ? s.workDays.map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 6) : [0, 1, 2, 3, 4];
    const days = new Set(daysArr);
    const hours = [];
    for (let i = 0; i < 7; i++) hours.push(days.has(i) ? { start, end } : null);
    return { hours };
}

function getDefaultMeetingMinutes(ctxId) {
    const s = ctxId ? getContextSettings(ctxId) : (getActiveContext() ? getContextSettings(getActiveContext()) : {});
    const n = parseInt(s.defaultMeetingMinutes, 10);
    return n > 0 && n <= 600 ? n : 60;
}

function dateToIsoWeek(d) {
    // Canonical ISO 8601 week: target = Thursday of d's week
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isoWeekMonday(yearWeek) {
    const parts = (yearWeek || '').split('-W');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    if (!year || !week) return null;
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = (jan4.getUTCDay() + 6) % 7;
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
    const monday = new Date(week1Mon);
    monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
    return monday;
}

function currentIsoWeek() {
    return dateToIsoWeek(new Date());
}

function shiftIsoWeek(yearWeek, delta) {
    const mon = isoWeekMonday(yearWeek);
    if (!mon) return yearWeek;
    mon.setUTCDate(mon.getUTCDate() + delta * 7);
    return dateToIsoWeek(mon);
}

function meetingId() {
    return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function extractMentions(text) {
    if (!text) return [];
    const matches = [...text.matchAll(/(?:^|[\s\n(\[])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g)];
    return [...new Set(matches.map(m => m[1]))];
}

function syncMentions(...texts) {
    const people = loadAllPeople();
    let changed = false;
    texts.flat().forEach(text => {
        extractMentions(text).forEach(rawName => {
            const key = rawName.toLowerCase();
            if (!people.find(p => p.key === key)) {
                people.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), key, name: rawName, firstName: rawName, created: new Date().toISOString() });
                changed = true;
            }
        });
    });
    if (changed) savePeople(people);
}

function loadResults() {
    try { return JSON.parse(fs.readFileSync(resultsFile(), 'utf-8')); }
    catch { return []; }
}

function saveResults(results) {
    fs.writeFileSync(resultsFile(), JSON.stringify(results, null, 2), 'utf-8');
}

// Extract [bracketed text] from a note, return { results: string[], cleanNote: string }
function extractResults(noteText) {
    if (!noteText) return { results: [], cleanNote: noteText || '' };
    const extracted = [];
    const clean = noteText.replace(/\[([^\]]+)\]/g, (_, inner) => {
        const trimmed = inner.trim();
        if (trimmed) extracted.push(trimmed);
        return trimmed; // keep the text, just remove the brackets
    });
    return { results: extracted, cleanNote: clean };
}

// Set a task note: extract results, sync mentions, return cleaned note
function syncTaskNote(task, rawNote) {
    const { results: texts, cleanNote } = extractResults(rawNote);
    task.note = cleanNote;

    // Extract mentions from raw note (before stripping) for people registry + results
    const mentionNames = extractMentions(rawNote);

    // Replace results for this task
    let allResults = loadResults().filter(r => r.taskId !== task.id);
    texts.forEach(text => {
        // Merge mentions from the full note AND from the result text itself
        const textMentions = extractMentions(text);
        const allMentions = [...new Set([...mentionNames, ...textMentions])];
        allResults.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            text,
            week: task.week || '',
            taskId: task.id,
            taskText: task.text,
            people: allMentions,
            created: new Date().toISOString()
        });
    });
    saveResults(allResults);

    // Sync people registry using raw note
    syncMentions(task.text, rawNote);

    return cleanNote;
}

function loadNotesMeta() {
    try { return JSON.parse(fs.readFileSync(notesMetaFile(), 'utf-8')); }
    catch { return {}; }
}

function saveNotesMeta(meta) {
    fs.writeFileSync(notesMetaFile(), JSON.stringify(meta, null, 2), 'utf-8');
}

function getNoteMeta(week, file) {
    const meta = loadNotesMeta();
    return meta[week + '/' + file] || {};
}

function setNoteMeta(week, file, data) {
    const meta = loadNotesMeta();
    const key = week + '/' + file;
    meta[key] = { ...(meta[key] || {}), ...data };
    saveNotesMeta(meta);
}

function deleteNoteMeta(week, file) {
    const meta = loadNotesMeta();
    delete meta[week + '/' + file];
    saveNotesMeta(meta);
}

function getWeekDirs() {
    return fs.readdirSync(dataDir(), { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d{4}-\d{1,2}$/.test(d.name))
        .map(d => d.name)
        .sort((a, b) => b.localeCompare(a));
}

function getMdFiles(weekDir) {
    try {
        return fs.readdirSync(path.join(dataDir(), weekDir))
            .filter(f => f.endsWith('.md'))
            .sort();
    } catch {
        return [];
    }
}

function searchMdFiles(query) {
    const results = [];
    const q = query.toLowerCase();
    const weeks = getWeekDirs();
    for (const week of weeks) {
        for (const file of getMdFiles(week)) {
            const filePath = path.join(dataDir(), week, file);            let content;
            try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }
            const nameLower = file.toLowerCase();
            const contentLower = content.toLowerCase();
            const nameMatch = nameLower.includes(q);
            const idx = contentLower.indexOf(q);
            if (!nameMatch && idx === -1) continue;

            let snippet = '';
            if (idx !== -1) {
                const start = Math.max(0, idx - 60);
                const end = Math.min(content.length, idx + query.length + 60);
                snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
            }
            results.push({ week, file, snippet });
        }
    }
    return results;
}

function getGhToken() {
    try { return execSync('gh auth token', { encoding: 'utf-8' }).trim(); }
    catch { return process.env.GH_TOKEN || ''; }
}

function summarizeWeek(week) {
    return new Promise((resolve, reject) => {
        const files = getMdFiles(week);
        const tasks = loadTasks().filter(t => t.week === week);

        let context = `Oppsummer hva som skjedde i uke ${week}.\n\nSkriv oppsummeringen på norsk i markdown-format. Vær grundig og dekkende — ta med detaljer, kontekst og diskusjoner fra notatene, ikke bare overskrifter.\n\nStruktur oppsummeringen med følgende seksjoner (bruk ## overskrifter):\n\n## Hovedpunkter\nEt fyldig sammendrag (flere avsnitt) av hva som skjedde i uken. Beskriv møter, diskusjoner, problemstillinger, og beslutninger i prosa. Ta med kontekst og nyanser fra notatene.\n\n## Oppgaver\nList fullførte og pågående oppgaver. Nevn kort hva som ble oppnådd på fullførte oppgaver (bruk notat/kommentar).\n\n## Resultater og beslutninger\nList opp ALLE elementer fra seksjonen \"Resultater\" nedenfor. Hvert resultat som eget punkt. Ikke utelat noen.\n\n## Involverte personer\nList opp ALLE personer fra seksjonen \"Personer\" nedenfor. For hver person: navn, rolle/tittel hvis kjent, og hva de bidro med eller ble nevnt i forbindelse med denne uken.\n\nIkke utelat resultater eller personer. Vær utfyllende under Hovedpunkter.\n\n`;

        for (const f of files) {
            if (f === 'summarize.md') continue;
            try {
                const content = fs.readFileSync(path.join(dataDir(), week, f), 'utf-8');
                context += `--- ${f} ---\n${content}\n\n`;
            } catch {}
        }

        if (tasks.length > 0) {
            context += '--- Oppgaver ---\n';
            tasks.forEach(t => {
                context += `- [${t.done ? 'x' : ' '}] ${t.text}${t.comment ? ' (' + t.comment + ')' : ''}\n`;
                if (t.note && t.note.trim()) {
                    context += `  Notat: ${t.note.replace(/\n/g, '\n  ')}\n`;
                }
            });
        }

        const results = loadResults().filter(r => r.week === week);
        if (results.length > 0) {
            context += '\n--- Resultater ---\n';
            results.forEach(r => {
                const who = (r.people && r.people.length) ? ` [${r.people.join(', ')}]` : '';
                const fromTask = r.taskText ? ` (fra oppgave: ${r.taskText})` : '';
                context += `- ${r.text}${who}${fromTask}\n`;
            });
        }

        // Collect people referenced in this week (from tasks, notes, results)
        const allPeople = loadPeople();
        const referenced = new Set();
        const collect = (text) => {
            if (!text) return;
            const re = /(?:^|[\s\n(\[])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g;
            let m;
            while ((m = re.exec(text)) !== null) referenced.add(m[1]);
        };
        tasks.forEach(t => { collect(t.text); collect(t.note); collect(t.comment); });
        results.forEach(r => (r.people || []).forEach(p => referenced.add(p)));
        for (const f of files) {
            if (f === 'summarize.md') continue;
            try { collect(fs.readFileSync(path.join(dataDir(), week, f), 'utf-8')); } catch {}
        }
        if (referenced.size > 0) {
            context += '\n--- Personer ---\n';
            for (const name of referenced) {
                const p = allPeople.find(x => x.name === name || (x.key && x.key === name.toLowerCase()));
                if (p) {
                    const display = (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name);
                    const parts = [display];
                    if (p.title) parts.push(p.title);
                    if (p.notes) parts.push(p.notes);
                    context += `- @${name}: ${parts.join(' — ')}\n`;
                } else {
                    context += `- @${name}\n`;
                }
            }
        }

        const token = getGhToken();
        if (!token) return reject(new Error('Ingen GitHub-token funnet'));

        const payload = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Du er en assistent som oppsummerer ukentlige notater for et utviklingsteam som jobber med migrering fra Arena til Kelvin (AAP-systemet). Skriv en konsis oppsummering i markdown.' },
                { role: 'user', content: context }
            ],
            max_tokens: 4000,
            temperature: 0.4
        });

        const req = https.request('https://models.inference.ai.azure.com/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.choices && json.choices[0]) {
                        const summary = json.choices[0].message.content;
                        resolve(summary);
                    } else {
                        reject(new Error(json.error?.message || 'Uventet svar fra API'));
                    }
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function commentModalHtml() {
    return '<div id="commentModal" class="page-modal" onclick="if(event.target===this)cancelComment()"><div class="page-modal-card"><h3>✅ Fullfør oppgave</h3><p id="commentTaskText" style="color:#4a5568;margin-bottom:16px;font-weight:600"></p><textarea id="commentText" rows="4" placeholder="Legg til en kommentar (valgfritt)..."></textarea><div class="page-modal-actions"><button class="page-modal-btn cancel" onclick="cancelComment()">Avbryt</button><button class="page-modal-btn green" onclick="submitComment(true)">✅ Fullført</button></div></div></div>';
}

function noteModalHtml() {
    return '<div id="noteModal" class="page-modal" onclick="if(event.target===this)closeNoteModal()"><div class="page-modal-card"><h3>📓 Notat</h3><p id="noteTaskText" style="color:#4a5568;margin-bottom:12px;font-weight:600"></p><textarea id="noteText" rows="5" placeholder="Skriv notat her..."></textarea><div class="page-modal-actions"><button class="page-modal-btn cancel" onclick="closeNoteModal()">Avbryt</button><button class="page-modal-btn blue" onclick="saveNote()">💾 Lagre</button></div></div></div>';
}

const CONTEXT_ICONS = ['💼','⛳','🏌️','🏠','📚','✈️','🎨','🎵','🎮','🧪','🔬','💡','🌱','🏃','🐾','🍳','☕','📷','✍️','🛒','💰','🏥','📅','📁','⭐','🚀'];

function iconPickerHtml(name, current, pickerId, inputId) {
    const safeCurrent = escapeHtml(current || '📁');
    const inputAttr = inputId ? ` id="${escapeHtml(inputId)}"` : '';
    const buttons = CONTEXT_ICONS.map(ic => {
        const sel = ic === (current || '📁') ? ' selected' : '';
        return `<button type="button" class="icon-option${sel}" data-icon="${escapeHtml(ic)}" tabindex="-1">${escapeHtml(ic)}</button>`;
    }).join('');
    return `<div class="icon-picker" data-picker="${escapeHtml(pickerId)}">
        <button type="button" class="icon-trigger" data-icon-trigger>
            <span class="icon-current">${safeCurrent}</span>
            <span class="icon-caret">▾</span>
        </button>
        <input type="hidden" name="${escapeHtml(name)}"${inputAttr} value="${safeCurrent}">
        <div class="icon-grid">${buttons}</div>
    </div>`;
}

function contextSwitcherHtml() {
    const active = getActiveContext();
    const contexts = listContexts();
    const cur = active ? getContextSettings(active) : { name: '', icon: '📁' };
    const curIcon = escapeHtml(cur.icon || '📁');
    const curLabel = active ? escapeHtml(cur.name || active) : 'Ingen kontekst';
    const items = contexts.map(id => {
        const s = getContextSettings(id);
        const isActive = id === active ? ' active' : '';
        return `<button type="button" class="ctx-item${isActive}" data-id="${escapeHtml(id)}"><span class="ctx-icon">${escapeHtml(s.icon || '📁')}</span>${escapeHtml(s.name || id)}</button>`;
    }).join('');
    const commitBtn = active
        ? `<button type="button" class="ctx-item ctx-commit-btn" id="ctxCommitBtn" data-active="${escapeHtml(active)}">💾 Commit endringer i «${escapeHtml(cur.name || active)}»</button>`
        : '';
    const sep = (items || commitBtn) ? '<div class="ctx-sep"></div>' : '';
    return `<div class="ctx-switcher">
        <button type="button" class="ctx-trigger" id="ctxTrigger" title="Bytt kontekst"><span class="ctx-icon">${curIcon}</span><span class="ctx-name">${curLabel}</span><span class="ctx-caret">▾</span></button>
        <div class="ctx-menu" id="ctxMenu">
            ${items}
            ${sep}
            ${commitBtn}
            <a class="ctx-item ctx-link" href="/settings">⚙️ Administrer kontekster</a>
        </div>
    </div>`;
}

function pageHtml(title, body, extraNavLinks) {
    const extra = extraNavLinks || '';
    const nav = `<nav class="navbar">
        <div class="nav-inner">
            <a href="/" class="nav-brand">Ukenotater</a>
            ${contextSwitcherHtml()}
            <div class="nav-links">
                <a href="/" data-key="h" title="Hjem (Alt+H)">🏠 Hjem <kbd>Alt+H</kbd></a>
                <a href="/tasks" data-key="o" title="Oppgaver (Alt+O)">☑️ Oppgaver <kbd>Alt+O</kbd></a>
                <a href="/calendar" data-key="k" title="Kalender (Alt+K)">📅 Kalender <kbd>Alt+K</kbd></a>
                <a href="/people" data-key="p" title="Personer (Alt+P)">👥 Personer <kbd>Alt+P</kbd></a>
                <a href="/results" data-key="r" title="Resultater (Alt+R)">⚖️ Resultater <kbd>Alt+R</kbd></a>
                <a href="/editor" data-key="n" title="Nytt notat (Alt+N)">📝 Nytt <kbd>Alt+N</kbd></a>
                <a href="/settings" data-key="s" title="Innstillinger (Alt+S)">⚙️ Innstillinger <kbd>Alt+S</kbd></a>
                <a href="#" id="helpBtn" title="Hjelp">❓ Hjelp</a>
                ${extra}
            </div>
            <span id="navClock" class="nav-clock"></span>
        </div>
    </nav>`;
    return `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 1100px; margin: 0 auto; padding: 20px; padding-top: 70px; line-height: 1.6; color: #1a202c; background: #fbf9f4; }
        .navbar { position: fixed; top: 0; left: 0; right: 0; background: #fbf9f4; z-index: 900; border-bottom: 1px solid #e8e2d2; }
        .nav-inner { padding: 0 24px; display: flex; align-items: center; gap: 14px; height: 46px; }
        .nav-brand { color: #1a365d; font-family: Georgia, "Times New Roman", serif; font-weight: 700; font-size: 1.1em; text-decoration: none; letter-spacing: -0.01em; }
        .nav-brand:hover { text-decoration: none; color: #102542; }
        .nav-links { display: flex; gap: 4px; }
        .nav-links a { color: #3c3a30; opacity: 0.65; text-decoration: none; padding: 6px 10px; border-radius: 4px; font-size: 0.9em; transition: opacity 0.15s, background 0.15s; display: inline-flex; align-items: center; gap: 6px; }
        .nav-links a:hover { opacity: 1; background: #f0e8d4; color: #1a365d; text-decoration: none; }
        .nav-links kbd { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.72em; background: #f0e8d4; color: #7a6f4d; border: 1px solid #d6cdb6; border-radius: 3px; padding: 1px 5px; letter-spacing: 0.02em; opacity: 0.85; }
        .nav-links a:hover kbd { background: #e6dec5; color: #1a365d; }
        .ctx-switcher { position: relative; }
        .ctx-trigger { display: inline-flex; align-items: center; gap: 8px; background: #f0e8d4; border: 1px solid #d6cdb6; color: #1a365d; font-family: inherit; font-size: 0.9em; padding: 5px 10px; border-radius: 6px; cursor: pointer; transition: background 0.15s; }
        .ctx-trigger:hover { background: #e6dec5; }
        .ctx-icon { font-size: 1.05em; line-height: 1; display: inline-block; flex-shrink: 0; }
        .ctx-name { font-weight: 600; }
        .ctx-caret { font-size: 0.75em; opacity: 0.6; }
        .ctx-menu { display: none; position: absolute; top: calc(100% + 6px); left: 0; min-width: 220px; background: #fffdf7; border: 1px solid #d6cdb6; border-radius: 8px; box-shadow: 0 8px 24px rgba(26,54,93,0.12); padding: 6px; z-index: 1000; }
        .ctx-switcher.open .ctx-menu { display: block; }
        .ctx-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 4px; cursor: pointer; background: none; border: none; width: 100%; text-align: left; font-family: inherit; font-size: 0.9em; color: #1a365d; text-decoration: none; }
        .ctx-item:hover { background: #f0e8d4; }
        .ctx-item.active { background: #ebf2fa; font-weight: 600; }
        .ctx-sep { height: 1px; background: #e8e2d2; margin: 4px 0; }
        .ctx-link { color: #2a4365; }
        .nav-clock { margin-left: auto; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85em; color: #7a6f4d; opacity: 0.65; letter-spacing: 0.02em; }
        h1 { color: #1a365d; border-bottom: 1px solid #e8e2d2; padding-bottom: 10px; font-family: Georgia, "Times New Roman", serif; font-weight: 400; letter-spacing: -0.01em; }
        h2 { color: #2a4365; }
        a { color: #2b6cb0; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .card { display: block; padding: 14px 18px; margin: 8px 0; background: #fffdf7; border-radius: 8px; border-left: 4px solid #2b6cb0; transition: background 0.15s; }
        .card:hover { background: #f5efe1; text-decoration: none; }
        .breadcrumb { font-size: 0.9em; color: #718096; margin-bottom: 20px; }
        .breadcrumb a { color: #4a5568; }
        .week-section { margin-bottom: 24px; }
        .week-title { font-family: Georgia, "Times New Roman", serif; font-size: 1.5em; font-weight: 400; color: #1a365d; margin: 14px 0 6px; padding-bottom: 6px; border-bottom: 1px solid #e8e2d2; display: flex; align-items: baseline; gap: 12px; letter-spacing: -0.01em; }
        .week-title .week-meta { font-family: -apple-system, sans-serif; font-size: 0.55em; color: #a99a78; font-style: italic; margin-left: auto; font-weight: 400; }
        .week-active-pill { font-family: -apple-system, sans-serif; font-size: 0.5em; background: #e6dec5; color: #7a6f4d; padding: 2px 8px; border-radius: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; vertical-align: middle; font-style: normal; }
        .sec-h { font-family: Georgia, "Times New Roman", serif; font-style: italic; color: #7a6f4d; font-size: 1.05em; font-weight: 400; margin: 22px 0 10px; display: flex; align-items: center; gap: 8px; }
        .sec-h:first-child { margin-top: 4px; }
        .sec-h .sec-count { background: #f0e8d4; color: #7a6f4d; font-size: 0.7em; padding: 1px 8px; border-radius: 10px; font-style: normal; font-family: -apple-system, sans-serif; }
        .week-grid { display: grid; grid-template-columns: 1.7fr 1fr; gap: 36px; margin-top: 8px; }
        .week-grid .col-side { padding-left: 24px; border-left: 1px solid #e8e2d2; min-width: 0; }
        .week-grid .col-notes { min-width: 0; }
        .result { font-size: 0.93em; color: #3c3a30; padding: 8px 0 8px 14px; border-left: 1px solid #1a365d; margin-bottom: 10px; }
        .result .meta { display: flex; justify-content: space-between; gap: 8px; color: #a99a78; font-size: 0.75em; margin-top: 3px; }
        .empty-quiet { color: #a99a78; font-size: 0.88em; font-style: italic; margin: 6px 0; }
        @media (max-width: 1100px) { .week-grid { grid-template-columns: 1fr; gap: 0; } .week-grid .col-side { padding-left: 0; border-left: none; border-top: 1px solid #e8e2d2; padding-top: 12px; margin-top: 18px; } }
        .older-week { margin: 0; }
        .older-week > .older { list-style: none; cursor: pointer; padding: 14px 8px; display: flex; align-items: baseline; gap: 14px; color: #7a6f4d; font-size: 1em; user-select: none; border-top: 1px solid #e8e2d2; border-radius: 4px; }
        .older-week > .older::-webkit-details-marker { display: none; }
        .older-week > .older .caret { color: #7a6f4d; font-size: 1.4em; line-height: 1; transition: transform 0.15s; display: inline-block; width: 22px; text-align: center; }
        .older-week[open] > .older .caret { transform: rotate(90deg); }
        .older-week > .older:hover { color: #1a365d; background: #faf6ec; }
        .older-week > .older:hover .older-title { color: #1a365d; }
        .older-week .older-title { font-family: Georgia, "Times New Roman", serif; font-style: normal; font-size: 1.15em; color: #3c3a30; }
        .older-week .older-meta { color: #a99a78; font-size: 0.9em; margin-left: auto; font-style: italic; }
        .older-body { padding: 6px 0 14px 24px; }
        .week-title-actions { display: flex; gap: 8px; margin: 6px 0 12px; }
        .btn-summarize { font-size: 0.75em; padding: 3px 10px; background: #805ad5; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
        .btn-summarize:hover { background: #6b46c1; }
        .btn-summarize:disabled { background: #a0aec0; cursor: not-allowed; }
        .md-content { background: #fff; }
        .md-content table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        .md-content th, .md-content td { border: 1px solid #e8e2d2; padding: 8px 12px; text-align: left; }
        .md-content th { background: #2a4365; color: white; }
        .md-content blockquote { background: #ebf8ff; border-left: 4px solid #2b6cb0; margin: 16px 0; padding: 12px 16px; }
        .md-content code { background: #f5efe1; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
        .md-content pre { background: #1a202c; color: #e8e2d2; padding: 16px; border-radius: 8px; overflow-x: auto; }
        .md-content pre code { background: none; color: inherit; padding: 0; }
        .note-card { padding: 10px 14px; margin-bottom: 10px; border: 1px solid #e8e2d2; border-radius: 6px; background: #fffdf7; font-size: 0.93em; }
        .note-card .note-h { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: 600; color: #3c3a30; margin-bottom: 4px; }
        .note-card .note-h a { color: #7a6f4d; text-decoration: none; padding: 2px 4px; border-radius: 3px; }
        .note-card .note-h a:hover { background: #f0e8d4; color: #1a365d; }
        .note-card .note-h .note-actions { display: inline-flex; align-items: center; gap: 2px; }
        .note-card .note-h .note-icon-btn { background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 1em; line-height: 1; border-radius: 3px; color: inherit; }
        .note-card .note-h .note-icon-btn:hover { background: #f0e8d4; }
        .note-card .note-h .note-icon-btn.note-del:hover { background: #fed7d7; color: #c53030; }
        .note-card .note-body { color: #7a6f4d; font-size: 0.92em; line-height: 1.5; }
        .file-card { margin: 6px 0; background: #fffdf7; border-radius: 6px; border: 1px solid #e8e2d2; overflow: hidden; }
        .file-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background: #fffdf7; cursor: pointer; user-select: none; }
        .file-header:hover { background: #f5efe1; }
        .file-name { font-weight: 600; color: #1a365d; font-size: 0.95em; }
        .file-actions a { color: #2b6cb0; text-decoration: none; padding: 2px 6px; }
        .file-card .md-content { padding: 10px 14px; background: white; display: none; font-size: 0.92em; }
        .file-card .md-content h1, .file-card .md-content h2, .file-card .md-content h3 { margin-top: 8px; }
        .file-card.open .md-content { display: block; }
        .file-toggle { font-size: 0.75em; color: #718096; margin-right: 8px; transition: transform 0.15s; }
        .file-card.open .file-toggle { transform: rotate(90deg); }
        .week-tasks { margin: 4px 0 8px; }
        .week-task { display: flex; align-items: center; gap: 8px; padding: 4px 14px; font-size: 0.9em; color: #4a5568; }
        .week-task.done { color: #a0aec0; text-decoration: line-through; }
        .week-task input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; }
        .home-layout { display: flex; gap: 24px; align-items: stretch; height: calc(100vh - 70px); }
        body:has(.home-layout) { max-width: none; overflow: hidden; }
        .home-main { flex: 1; min-width: 0; overflow-y: auto; padding: 0 4px; }
        .results-sidebar { width: 340px; flex-shrink: 0; overflow-y: auto; padding-right: 4px; }
        @media (max-width: 1100px) { .results-sidebar { width: 280px; } }
        @media (max-width: 900px) { body:has(.home-layout) { overflow: auto; } .home-layout { flex-direction: column; height: auto; } .task-sidebar, .results-sidebar { width: 100%; max-height: none; overflow: visible; } .home-main { overflow: visible; } }
        .task-sidebar { width: 380px; flex-shrink: 0; overflow-y: auto; padding-left: 4px; }
        .task-sidebar-inner { background: transparent; border: none; padding: 0; }
        .side-h, .task-sidebar-title { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 1.1em; font-weight: 400; color: #3c3a30; margin: 0 0 14px; padding-bottom: 6px; border-bottom: 1px solid #d6cdb6; }
        .pill { display: inline-block; font-size: 0.7em; background: #f0e8d4; color: #7a6f4d; padding: 1px 8px; border-radius: 10px; white-space: nowrap; }
        .pill.live { font-family: -apple-system, sans-serif; font-style: normal; font-size: 0.5em; background: #e6dec5; color: #7a6f4d; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.06em; text-transform: uppercase; vertical-align: middle; font-weight: 600; }
        .h-week { font-family: Georgia, "Times New Roman", serif; font-size: 1.6em; color: #1a365d; margin: 8px 0 14px; display: flex; align-items: baseline; gap: 12px; letter-spacing: -0.01em; }
        .h-week .meta { font-style: italic; color: #a99a78; font-size: 0.55em; margin-left: auto; font-family: -apple-system, sans-serif; }
        .sidebar-tasks { margin: 0; }
        .sidebar-task + .sidebar-task { border-top: 1px dotted #e0d8c4; }
        .row { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 0.93em; color: #3c3a30; }
        .row .row-text { flex: 1; min-width: 0; }
        .row.done { color: #a99a78; text-decoration: line-through; }
        .row.done + .row.done { border-top: 1px dotted #e0d8c4; }
        .row .when { margin-left: auto; font-size: 0.78em; color: #a99a78; white-space: nowrap; }
        .row input[type=checkbox] { accent-color: #7a6f4d; width: 15px; height: 15px; cursor: pointer; flex-shrink: 0; }
        .row-note-btn { background: none; border: none; cursor: pointer; font-size: 0.9em; padding: 0; }
        .row-note-btn.empty { opacity: 0.3; }
        .row-note-body { margin: 1px 0 6px 26px; font-size: 0.82em; color: #7a6f4d; background: transparent; }
        .sidebar-meetings { display: flex; flex-direction: column; gap: 8px; }
        .sidebar-meeting { position: relative; padding: 8px 10px; background: #fffdf7; border: 1px solid #ebe2cb; border-left: 3px solid #2b6cb0; border-radius: 4px; font-size: 0.85em; cursor: pointer; transition: background 0.1s; }
        .sidebar-meeting .sidebar-mtg-note { position: absolute; top: 6px; right: 6px; text-decoration: none; padding: 2px 5px; border-radius: 3px; opacity: 0.55; font-size: 0.95em; line-height: 1; }
        .sidebar-meeting .sidebar-mtg-note:hover { opacity: 1; background: #f0e8d4; }
        .sidebar-meeting:hover { background: #f8f3e2; }
        .sidebar-meeting .mtg-when { color: #4a5568; font-size: 0.85em; margin-bottom: 2px; }
        .sidebar-meeting .mtg-when strong { color: #1a365d; font-weight: 600; }
        .sidebar-meeting .mtg-title { color: #1a202c; font-weight: 500; line-height: 1.3; }
        .sidebar-meeting .mtg-meta { margin-top: 4px; color: #7a6f4d; font-size: 0.85em; }
        .sidebar-meeting .mtg-loc { color: #7a6f4d; }
        .search-box { display: none; }
        .search { width: 100%; box-sizing: border-box; padding: 14px 2px 10px; border: none; border-bottom: 1px solid #d6cdb6; border-radius: 0; font-size: 1em; outline: none; background: #fbf9f4; color: #3c3a30; font-style: italic; margin: 0 0 16px; font-family: inherit; position: sticky; top: 0; z-index: 50; }
        .search::placeholder { color: #a99a78; font-style: italic; }
        .search:focus { border-bottom-color: #1a365d; font-style: normal; }
        .search-result { padding: 12px 18px; margin: 8px 0; background: #fffdf7; border-radius: 8px; border-left: 4px solid #ed8936; }
        .search-result .sr-title { font-weight: 600; color: #2a4365; }
        .search-result .sr-path { font-size: 0.85em; color: #718096; }
        .search-result .sr-snippet { font-size: 0.9em; color: #4a5568; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
        .search-result mark { background: #fefcbf; padding: 1px 2px; border-radius: 2px; }
        .search-hidden { display: none; }
        .page-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center; }
        .page-modal.dark { background:rgba(0,0,0,0.6); }
        .page-modal-card { background:white; border-radius:12px; padding:24px; max-width:500px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
        .page-modal-btn { padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600; border:none; color:white; }
        .page-modal-btn.cancel { border:1px solid #e8e2d2; background:white; color:#4a5568; font-weight:normal; }
        .page-modal-btn.green { background:#48bb78; }
        .page-modal-btn.blue { background:#2b6cb0; }
        .page-modal-btn.purple { background:#805ad5; }
        .page-modal-btn.orange { background:#ed8936; }
        .page-modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; }
        .page-modal-card h3 { color:#1a365d; margin-bottom:8px; }
        .page-modal-card textarea, .page-modal-card input[type=text], .page-modal-card input[type=email], .page-modal-card input[type=tel] { width:100%; padding:10px; border:2px solid #e8e2d2; border-radius:8px; font-size:0.95em; font-family:inherit; outline:none; box-sizing:border-box; }
        .page-modal-card textarea { resize:vertical; }
        .mention-link { color:#2b6cb0; text-decoration:none; background:#ebf8ff; border-radius:4px; padding:0 5px; font-size:0.9em; }
        .mention-link:hover { background:#bee3f8; }
        #personTip { position: fixed; z-index: 2000; background: white; border: 1px solid #d6cdb6; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 10px 14px; font-size: 0.85em; color: #2d3748; max-width: 280px; pointer-events: none; opacity: 0; transition: opacity 0.1s; }
        #personTip.visible { opacity: 1; }
        #personTip .pt-name { font-weight: 700; color: #1a365d; font-size: 1.05em; margin-bottom: 2px; }
        #personTip .pt-title { color: #4a5568; font-style: italic; margin-bottom: 4px; }
        #personTip .pt-row { color: #718096; font-size: 0.9em; }
        #personTip .pt-notes { color: #4a5568; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e8e2d2; white-space: pre-wrap; }
        #personTip .pt-missing { color: #a0aec0; font-style: italic; }
    </style>
</head>
<body>${nav}${body}<div id="personTip"></div><div id="helpModal" class="page-modal" onclick="if(event.target===this)this.style.display='none'"><div class="page-modal-card" style="max-width:780px;max-height:85vh;display:flex;flex-direction:column"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px"><h3 style="margin:0">❓ Hjelp</h3><button onclick="document.getElementById('helpModal').style.display='none'" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:#718096">✕</button></div><div id="helpContent" class="md-content" style="overflow-y:auto;flex:1;padding:4px 4px 4px 0">Laster…</div></div></div><script>(function(){var btn=document.getElementById('helpBtn');var modal=document.getElementById('helpModal');var loaded=false;if(!btn||!modal)return;btn.addEventListener('click',function(e){e.preventDefault();modal.style.display='flex';if(loaded)return;fetch('/help.md').then(function(r){return r.text();}).then(function(md){document.getElementById('helpContent').innerHTML=window.marked?marked.parse(md):'<pre>'+md.replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];})+'</pre>';loaded=true;}).catch(function(){document.getElementById('helpContent').textContent='Kunne ikke laste hjelp.';});});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal.style.display==='flex')modal.style.display='none';});})();</script><script>document.addEventListener('keydown',function(e){if(!e.altKey||e.ctrlKey||e.metaKey)return;var link=document.querySelector('.nav-links a[data-key="'+e.key.toLowerCase()+'"]');if(link){e.preventDefault();window.location.href=link.href;}});(function(){var t=document.getElementById('ctxTrigger');var sw=t&&t.parentElement;if(!t)return;t.addEventListener('click',function(e){e.stopPropagation();sw.classList.toggle('open');});document.addEventListener('click',function(e){if(!sw.contains(e.target))sw.classList.remove('open');});sw.querySelectorAll('.ctx-item[data-id]').forEach(function(b){b.addEventListener('click',function(){var id=b.getAttribute('data-id');fetch('/api/contexts/switch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})}).then(function(r){return r.json();}).then(function(d){if(d.ok)location.reload();else alert('Kunne ikke bytte kontekst: '+d.error);});});});var cb=document.getElementById('ctxCommitBtn');if(cb)cb.addEventListener('click',function(e){e.stopPropagation();var id=cb.getAttribute('data-active');var msg=prompt('Commit-melding (valgfritt):','');if(msg===null)return;cb.textContent='⏳ Committer...';fetch('/api/contexts/'+encodeURIComponent(id)+'/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg})}).then(function(r){return r.json();}).then(function(d){if(d.ok){cb.textContent=d.committed?'✓ Committet':'Ingen endringer';setTimeout(function(){sw.classList.remove('open');},1200);}else{cb.textContent='✗ '+d.error;}});});})();(function tick(){var c=document.getElementById('navClock');if(c)c.textContent=new Date().toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit',second:'2-digit'});setTimeout(tick,1000)})();(function(){var tip=document.getElementById('personTip');var peopleCache=null;var peoplePromise=null;function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}function loadPeople(){if(peopleCache)return Promise.resolve(peopleCache);if(peoplePromise)return peoplePromise;peoplePromise=fetch('/api/people').then(function(r){return r.json();}).then(function(d){peopleCache=d||[];return peopleCache;}).catch(function(){peopleCache=[];return peopleCache;});return peoplePromise;}function findPerson(people,key){if(!key)return null;return people.find(function(p){return (p.key&&p.key===key)||(p.name&&p.name.toLowerCase()===key);});}function render(p,key){if(!p){return '<div class="pt-missing">Ingen oppføring for @'+esc(key)+'</div>';}var name=p.firstName?(p.lastName?p.firstName+' '+p.lastName:p.firstName):(p.name||key);var html='<div class="pt-name">'+esc(name)+'</div>';if(p.title)html+='<div class="pt-title">'+esc(p.title)+'</div>';if(p.email)html+='<div class="pt-row">✉️ '+esc(p.email)+'</div>';if(p.phone)html+='<div class="pt-row">📞 '+esc(p.phone)+'</div>';if(p.notes){var n=p.notes.length>140?p.notes.slice(0,140)+'…':p.notes;html+='<div class="pt-notes">'+esc(n)+'</div>';}return html;}function position(ev){var r=18,vw=window.innerWidth,vh=window.innerHeight;var w=tip.offsetWidth,h=tip.offsetHeight;var x=ev.clientX+r,y=ev.clientY+r;if(x+w>vw-8)x=ev.clientX-w-r;if(y+h>vh-8)y=ev.clientY-h-r;if(x<8)x=8;if(y<8)y=8;tip.style.left=x+'px';tip.style.top=y+'px';}var current=null;document.addEventListener('mouseover',function(e){var a=e.target.closest&&e.target.closest('.mention-link');if(!a)return;current=a;var key=a.getAttribute('data-person-key')||a.textContent.trim().toLowerCase();loadPeople().then(function(people){if(current!==a)return;tip.innerHTML=render(findPerson(people,key),key);tip.classList.add('visible');position(e);});});document.addEventListener('mousemove',function(e){if(tip.classList.contains('visible')&&e.target.closest&&e.target.closest('.mention-link'))position(e);});document.addEventListener('mouseout',function(e){var a=e.target.closest&&e.target.closest('.mention-link');if(!a)return;var to=e.relatedTarget;if(to&&to.closest&&to.closest('.mention-link')===a)return;current=null;tip.classList.remove('visible');});})();</script></body>
</html>`;
}

function getCurrentYearWeek() {
    const now = new Date();
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    // ISO 8601: week containing the Thursday → shift to Thursday of current week
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-${weekNum}`;
}

function isoWeekToDateRange(yearWeek) {
    if (!yearWeek) return '';
    const parts = yearWeek.split('-');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    if (!year || !week) return '';
    // Monday of ISO week
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = (jan4.getUTCDay() + 6) % 7; // 0 = Mon
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
    const monday = new Date(week1Mon);
    monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const months = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
    const dM = monday.getUTCDate(), mM = monday.getUTCMonth();
    const dS = sunday.getUTCDate(), mS = sunday.getUTCMonth();
    if (mM === mS) return `${dM}.– ${dS}. ${months[mS]}`;
    return `${dM}. ${months[mM]} – ${dS}. ${months[mS]}`;
}

function noteSnippet(md, len) {
    if (!md) return '';
    const max = len || 200;
    let text = md
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[*_~]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length > max) text = text.slice(0, max).replace(/\s+\S*$/, '') + '…';
    return text;
}

function presentationStyleCss(style) {
    const styles = {
        paper: `
            :root { --r-main-font: Georgia, "Times New Roman", serif; --r-heading-font: Georgia, "Times New Roman", serif; --r-main-color: #3c3a30; --r-heading-color: #1a365d; --r-link-color: #2b6cb0; --r-background-color: #fbf9f4; }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #1a365d; font-weight: 400; letter-spacing: -0.01em; text-transform: none; }
            .reveal h1 { border-bottom: 1px solid #d6cdb6; padding-bottom: 12px; }
            .reveal blockquote { background: #ebf8ff; border-left: 4px solid #2b6cb0; padding: 14px 20px; box-shadow: none; color: #2c5282; font-style: normal; }
            .reveal code { background: #f5efe1; color: #7a6f4d; padding: 2px 8px; border-radius: 3px; font-size: 0.85em; }
            .reveal pre { background: #1a202c; color: #e8e2d2; box-shadow: none; border-radius: 6px; }
            .reveal pre code { background: none; color: inherit; }
            .reveal table th { background: #2a4365; color: white; padding: 8px 12px; text-align: left; font-size: 0.85em; }
            .reveal table td { border: 1px solid #e8e2d2; padding: 8px 12px; }
            .reveal a { border-bottom: 1px dashed #2b6cb0; }
            .reveal hr { border: none; border-top: 1px solid #e8e2d2; }
        `,
        noir: `
            :root { --r-main-font: Georgia, "Times New Roman", serif; --r-heading-font: Georgia, "Times New Roman", serif; --r-main-color: #e8e2d2; --r-heading-color: #f5e6a8; --r-link-color: #f0c674; --r-background-color: #0d0d0d; }
            body { background: #0d0d0d; }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #f5e6a8; font-weight: 400; letter-spacing: -0.01em; text-transform: none; }
            .reveal h1 { border-bottom: 1px solid #3a3a3a; padding-bottom: 12px; color: #fffdf7; }
            .reveal h2 { color: #f5e6a8; font-style: italic; }
            .reveal blockquote { background: rgba(245,230,168,0.08); border-left: 3px solid #f5e6a8; padding: 14px 20px; box-shadow: none; color: #f5e6a8; font-style: italic; }
            .reveal code { background: #1a1a1a; color: #7ee787; padding: 2px 8px; border-radius: 3px; border: 1px solid #2a2a2a; }
            .reveal pre { background: #050505; color: #e8e2d2; box-shadow: none; border: 1px solid #2a2a2a; border-radius: 6px; }
            .reveal pre code { background: none; color: inherit; border: none; }
            .reveal table th { background: #1a1a1a; color: #f5e6a8; padding: 8px 12px; text-align: left; font-size: 0.85em; border-bottom: 1px solid #3a3a3a; }
            .reveal table td { border: 1px solid #2a2a2a; padding: 8px 12px; color: #e8e2d2; }
            .reveal a { color: #f0c674; border-bottom: 1px dashed #f0c674; }
            .reveal strong { color: #fffdf7; }
            .reveal em { color: #f0c674; }
        `,
        klassisk: `
            :root { --r-main-font: "Times New Roman", Times, serif; --r-heading-font: "Times New Roman", Times, serif; --r-main-color: #1a1a1a; --r-heading-color: #000; --r-link-color: #0066cc; --r-background-color: #ffffff; }
            body { background: #ffffff; }
            .reveal .slides { text-align: center; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #000; font-weight: 700; letter-spacing: 0; text-transform: none; font-family: "Times New Roman", Times, serif; }
            .reveal h1 { font-size: 2.6em; margin-bottom: 0.5em; }
            .reveal h2 { font-size: 1.9em; }
            .reveal p, .reveal li { font-size: 1.1em; line-height: 1.5; }
            .reveal blockquote { background: transparent; border-left: 4px solid #000; padding: 8px 24px; box-shadow: none; color: #1a1a1a; font-style: italic; font-size: 1.1em; }
            .reveal code { background: #f0f0f0; color: #1a1a1a; padding: 2px 6px; border-radius: 0; font-family: "Courier New", Courier, monospace; }
            .reveal pre { background: #f0f0f0; color: #1a1a1a; box-shadow: none; border-radius: 0; font-family: "Courier New", Courier, monospace; }
            .reveal pre code { background: none; color: inherit; }
            .reveal table th { background: #000; color: #fff; padding: 10px 14px; }
            .reveal table td { border: 1px solid #1a1a1a; padding: 8px 14px; }
            .reveal a { color: #0066cc; }
            .reveal hr { border: none; border-top: 2px solid #000; width: 30%; margin: 1em auto; }
        `,
        levende: `
            :root { --r-main-font: "Helvetica Neue", Helvetica, Arial, sans-serif; --r-heading-font: "Helvetica Neue", Helvetica, Arial, sans-serif; --r-main-color: #ffffff; --r-heading-color: #ffffff; --r-link-color: #ffe066; --r-background-color: #2d1b69; }
            body { background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%) !important; background-attachment: fixed !important; }
            .reveal { color: #ffffff; }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #ffffff; font-weight: 800; letter-spacing: -0.02em; text-transform: none; text-shadow: 0 2px 12px rgba(0,0,0,0.25); }
            .reveal h1 { font-size: 3.2em; background: linear-gradient(90deg, #ffe066, #f093fb); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
            .reveal h2 { font-size: 2.2em; }
            .reveal blockquote { background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); border-left: 4px solid #ffe066; padding: 14px 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); color: #ffffff; border-radius: 4px; }
            .reveal code { background: rgba(0,0,0,0.35); color: #ffe066; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; }
            .reveal pre { background: rgba(0,0,0,0.45); color: #f8f8f2; box-shadow: 0 8px 24px rgba(0,0,0,0.2); border-radius: 8px; backdrop-filter: blur(10px); }
            .reveal pre code { background: none; color: inherit; }
            .reveal table th { background: rgba(0,0,0,0.35); color: #ffe066; padding: 10px 14px; text-align: left; }
            .reveal table td { border: 1px solid rgba(255,255,255,0.2); padding: 8px 14px; color: #ffffff; }
            .reveal a { color: #ffe066; border-bottom: 1px solid #ffe066; }
            .reveal strong { color: #ffe066; }
            .reveal em { color: #f093fb; }
            .reveal hr { border: none; border-top: 2px solid rgba(255,255,255,0.3); }
        `,
        minimal: `
            :root { --r-main-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; --r-heading-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; --r-main-color: #2d3748; --r-heading-color: #1a202c; --r-link-color: #3182ce; --r-background-color: #ffffff; }
            body { background: #ffffff; }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #1a202c; font-weight: 200; letter-spacing: -0.03em; text-transform: none; }
            .reveal h1 { font-size: 4em; font-weight: 100; }
            .reveal h2 { font-size: 2.4em; font-weight: 200; color: #4a5568; }
            .reveal h3 { font-size: 1.6em; font-weight: 300; color: #718096; }
            .reveal p, .reveal li { font-size: 1.05em; color: #4a5568; line-height: 1.7; font-weight: 300; }
            .reveal blockquote { background: transparent; border-left: 2px solid #cbd5e0; padding: 4px 24px; box-shadow: none; color: #718096; font-style: normal; font-weight: 300; }
            .reveal code { background: #f7fafc; color: #4a5568; padding: 1px 6px; border-radius: 2px; font-size: 0.85em; border: 1px solid #edf2f7; }
            .reveal pre { background: #f7fafc; color: #2d3748; box-shadow: none; border-radius: 4px; border: 1px solid #edf2f7; }
            .reveal pre code { background: none; color: inherit; border: none; }
            .reveal table th { background: transparent; color: #1a202c; padding: 10px 0; text-align: left; border-bottom: 2px solid #1a202c; font-weight: 600; }
            .reveal table td { border: none; border-bottom: 1px solid #edf2f7; padding: 10px 0; color: #4a5568; font-weight: 300; }
            .reveal a { color: #3182ce; border-bottom: 1px solid #3182ce; }
            .reveal strong { color: #1a202c; font-weight: 600; }
            .reveal hr { border: none; border-top: 1px solid #edf2f7; }
        `,
        matrix: `
            :root { --r-main-font: "Courier New", Courier, ui-monospace, monospace; --r-heading-font: "Courier New", Courier, ui-monospace, monospace; --r-main-color: #00ff41; --r-heading-color: #00ff41; --r-link-color: #39ff14; --r-background-color: #000000; }
            body { background: #000000; }
            .matrix-rain { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.35; }
            .reveal { color: #00ff41; text-shadow: 0 0 6px rgba(0,255,65,0.55); position: relative; z-index: 1; }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #00ff41; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; text-shadow: 0 0 10px rgba(0,255,65,0.7), 0 0 22px rgba(0,255,65,0.35); }
            .reveal h1 { font-size: 2.6em; border-bottom: 1px solid rgba(0,255,65,0.4); padding-bottom: 12px; }
            .reveal h2 { font-size: 1.9em; }
            .reveal h3 { color: #39ff14; font-size: 1.4em; }
            .reveal p, .reveal li { color: #00ff41; }
            .reveal blockquote { background: rgba(0,255,65,0.06); border-left: 3px solid #00ff41; padding: 14px 20px; box-shadow: 0 0 20px rgba(0,255,65,0.18); color: #b9ffc6; font-style: italic; }
            .reveal code { background: rgba(0,255,65,0.08); color: #b9ffc6; padding: 2px 8px; border-radius: 0; border: 1px solid rgba(0,255,65,0.3); }
            .reveal pre { background: rgba(0,20,5,0.85); color: #00ff41; box-shadow: 0 0 20px rgba(0,255,65,0.18); border: 1px solid rgba(0,255,65,0.4); border-radius: 0; }
            .reveal pre code { background: none; color: inherit; border: none; }
            .reveal table th { background: rgba(0,255,65,0.12); color: #00ff41; padding: 8px 12px; text-align: left; font-size: 0.85em; text-transform: uppercase; border-bottom: 1px solid #00ff41; }
            .reveal table td { border: 1px solid rgba(0,255,65,0.25); padding: 8px 12px; color: #b9ffc6; }
            .reveal a { color: #39ff14; border-bottom: 1px dashed #39ff14; text-shadow: 0 0 8px rgba(57,255,20,0.6); }
            .reveal strong { color: #ffffff; text-shadow: 0 0 8px rgba(255,255,255,0.6); }
            .reveal em { color: #b9ffc6; }
            .reveal hr { border: none; border-top: 1px dashed rgba(0,255,65,0.4); }
            .reveal ::selection { background: #00ff41; color: #000; }
        `,
        nav: `
            :root { --r-main-font: var(--ax-font-family, "Source Sans 3", "Source Sans Pro", Arial, sans-serif); --r-heading-font: var(--ax-font-family, "Source Sans 3", "Source Sans Pro", Arial, sans-serif); --r-main-color: var(--ax-neutral-1000, #202733); --r-heading-color: var(--ax-neutral-1000, #202733); --r-link-color: var(--ax-accent-700, #0063c1); --r-background-color: #ffffff; }
            body { background: #ffffff; font-family: var(--ax-font-family, "Source Sans 3", "Source Sans Pro", Arial, sans-serif); }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: var(--ax-neutral-1000, #202733); font-weight: 600; text-transform: none; letter-spacing: -0.01em; }
            .reveal h1 { font-size: 2.6em; font-weight: 600; }
            .reveal h2 { font-size: 1.9em; font-weight: 600; color: var(--ax-neutral-1000, #202733); }
            .reveal h3 { color: var(--ax-accent-700, #0063c1); font-size: 1.35em; font-weight: 600; }
            .reveal h4 { color: var(--ax-neutral-900, #49515e); font-size: 1.1em; font-weight: 600; }
            .reveal p, .reveal li { color: var(--ax-neutral-1000, #202733); line-height: 1.55; font-size: 1em; font-weight: 400; }
            .reveal blockquote { background: var(--ax-accent-100, #f1f7ff); border-left: 4px solid var(--ax-accent-600, #2176d4); padding: 16px 20px; box-shadow: none; color: var(--ax-neutral-1000, #202733); font-style: normal; font-size: 1em; border-radius: 4px; }
            .reveal code { background: var(--ax-neutral-100, #f5f6f7); color: var(--ax-neutral-1000, #202733); padding: 1px 6px; border-radius: 4px; font-size: 0.9em; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
            .reveal pre { background: var(--ax-neutral-100, #f5f6f7); color: var(--ax-neutral-1000, #202733); box-shadow: none; border-radius: 8px; }
            .reveal pre code { background: none; color: inherit; }
            .reveal table { border-collapse: collapse; }
            .reveal table th { background: transparent; color: var(--ax-neutral-1000, #202733); padding: 10px 14px; text-align: left; font-weight: 600; border: none; border-bottom: 2px solid var(--ax-neutral-1000, #202733); }
            .reveal table td { border: none; border-bottom: 1px solid var(--ax-neutral-200, #ecedef); padding: 10px 14px; color: var(--ax-neutral-1000, #202733); }
            .reveal a { color: var(--ax-accent-700, #0063c1); border-bottom: 1px solid var(--ax-accent-700, #0063c1); text-decoration: none; font-weight: 600; }
            .reveal a:hover { color: var(--ax-accent-900, #004ea3); border-bottom-color: var(--ax-accent-900, #004ea3); }
            .reveal strong { color: var(--ax-neutral-1000, #202733); font-weight: 600; }
            .reveal em { color: var(--ax-neutral-1000, #202733); font-style: italic; }
            .reveal hr { border: none; border-top: 1px solid var(--ax-neutral-400, #cfd3d8); margin: 24px 0; }
            .reveal ul li::marker { color: var(--ax-accent-600, #2176d4); }
            .reveal ol li::marker { color: var(--ax-neutral-1000, #202733); font-weight: 600; }
            .reveal .progress { color: var(--ax-accent-600, #2176d4); }
            .reveal .controls { color: var(--ax-accent-700, #0063c1); }
            .reveal ::selection { background: var(--ax-accent-200, #e4eeff); color: var(--ax-neutral-1000, #202733); }
            .nav-logo { position: fixed; top: -22vh; left: -8vh; z-index: 0; width: 70vh; height: 70vh; pointer-events: none; opacity: 0.15; }
            .nav-logo svg { width: 100%; height: 100%; display: block; }
            .reveal { position: relative; z-index: 1; }
        `
    };
    return styles[style] || styles.paper;
}

function presentationPageHtml(week, file, content, style) {
    const name = file.replace(/\.md$/, '');
    const safeContent = String(content || '').replace(/<\/script>/gi, '<\\/script>');
    const themeCss = presentationStyleCss(style);
    return `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <title>${escapeHtml(name)} · Presentasjon</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/white.css" id="theme">
    ${style === 'nav' ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap"><link rel="stylesheet" href="https://unpkg.com/@navikt/ds-tokens@8.10.2/dist/tokens.css">' : ''}
    <style>
        ${themeCss}
        .reveal table { border-collapse: collapse; width: 100%; }
        .reveal pre { padding: 16px; overflow-x: auto; }
        .reveal ul, .reveal ol { display: block; }
        .pres-toolbar { position: fixed; top: 8px; right: 12px; z-index: 60; display: flex; gap: 6px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; opacity: 0.35; transition: opacity 0.2s; }
        .pres-toolbar:hover { opacity: 1; }
        .pres-toolbar a, .pres-toolbar button { background: rgba(255,253,247,0.95); border: 1px solid #d6cdb6; color: #3c3a30; padding: 4px 10px; font-size: 0.78em; border-radius: 4px; text-decoration: none; cursor: pointer; }
        .pres-toolbar a:hover, .pres-toolbar button:hover { background: #f0e8d4; color: #1a365d; }
        .fs-overlay { position: fixed; inset: 0; background: rgba(26,54,93,0.92); color: #fffdf7; z-index: 1000; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 16px; cursor: pointer; font-family: Georgia, "Times New Roman", serif; }
        .fs-overlay.show { display: flex; }
        .fs-overlay .fs-icon { font-size: 4em; }
        .fs-overlay .fs-title { font-size: 2em; font-style: italic; }
        .fs-overlay .fs-hint { font-size: 1em; opacity: 0.75; font-family: -apple-system, sans-serif; font-style: normal; }
        .fs-overlay .fs-skip { position: absolute; bottom: 18px; right: 18px; font-size: 0.8em; opacity: 0.6; font-family: -apple-system, sans-serif; }
    </style>
</head>
<body${style === 'matrix' ? ' class="is-matrix"' : ''}>
    ${style === 'matrix' ? '<canvas class="matrix-rain" id="matrixRain"></canvas>' : ''}
    <div class="pres-toolbar">
        <a href="/editor/${week}/${encodeURIComponent(file)}" title="Rediger">✏️ Rediger</a>
        <a href="#" onclick="window.close();return false;" title="Lukk">✕ Lukk</a>
    </div>
    ${style === 'nav' ? `<div class="nav-logo" aria-label="NAV"><svg viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="#C30000"/><path fill-rule="evenodd" clip-rule="evenodd" d="M19.814 8.78589H17.9828C17.9828 8.78589 17.8566 8.78589 17.812 8.89741L16.7985 12.0013L15.786 8.89741C15.7414 8.78589 15.6144 8.78589 15.6144 8.78589H12.0934C12.0172 8.78589 11.9533 8.84958 11.9533 8.92535V9.97942C11.9533 9.14327 11.064 8.78589 10.5433 8.78589C9.3772 8.78589 8.59659 9.55433 8.35354 10.7226C8.34037 9.94758 8.27598 9.66987 8.06732 9.38546C7.97147 9.24612 7.83293 9.12899 7.68208 9.03211C7.37147 8.85007 7.09257 8.78589 6.49318 8.78589H5.78939C5.78939 8.78589 5.6622 8.78589 5.61732 8.89741L4.97695 10.4852V8.92535C4.97695 8.84958 4.91354 8.78589 4.83744 8.78589H3.20891C3.20891 8.78589 3.08317 8.78589 3.03744 8.89741L2.37171 10.5484C2.37171 10.5484 2.30525 10.7135 2.4572 10.7135H3.08317V13.8594C3.08317 13.9375 3.14464 13.9994 3.22305 13.9994H4.83744C4.91354 13.9994 4.97695 13.9375 4.97695 13.8594V10.7135H5.60622C5.96732 10.7135 6.04378 10.7233 6.18427 10.7889C6.26891 10.8208 6.34513 10.8855 6.38671 10.96C6.47183 11.1204 6.49318 11.3129 6.49318 11.8806V13.8594C6.49318 13.9375 6.55586 13.9994 6.6333 13.9994H8.18062C8.18062 13.9994 8.35549 13.9994 8.42464 13.8266L8.76757 12.9786C9.22354 13.6176 9.97403 13.9994 10.9067 13.9994H11.1105C11.1105 13.9994 11.2865 13.9994 11.3561 13.8266L11.9533 12.3468V13.8594C11.9533 13.9375 12.0172 13.9994 12.0934 13.9994H13.6729C13.6729 13.9994 13.8472 13.9994 13.9172 13.8266C13.9172 13.8266 14.5489 12.2574 14.5514 12.2456H14.5523C14.5766 12.115 14.4117 12.115 14.4117 12.115H13.8479V9.42243L15.6217 13.8266C15.691 13.9994 15.8656 13.9994 15.8656 13.9994H17.7316C17.7316 13.9994 17.9072 13.9994 17.9765 13.8266L19.9429 8.95475C20.011 8.78589 19.814 8.78589 19.814 8.78589ZM11.9531 12.115H10.8921C10.4698 12.115 10.1263 11.7729 10.1263 11.3499C10.1263 10.9276 10.4698 10.5833 10.8921 10.5833H11.1888C11.61 10.5833 11.9531 10.9276 11.9531 11.3499V12.115Z" fill="white"/></svg></div>` : ''}
    <div class="fs-overlay" id="fsOverlay">
        <div class="fs-icon">🎤</div>
        <div class="fs-title">${escapeHtml(name)}</div>
        <div class="fs-hint">Klikk hvor som helst for å starte i fullskjerm</div>
        <div class="fs-skip">Esc lukker presentasjonen</div>
    </div>
    <div class="reveal">
        <div class="slides">
            <section data-markdown data-separator="^---$" data-separator-vertical="^--$" data-separator-notes="^Note:">
                <textarea data-template>${escapeHtml(safeContent)}</textarea>
            </section>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/markdown/markdown.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/highlight.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/notes/notes.js"></script>
    <script>
        Reveal.initialize({
            hash: true,
            slideNumber: 'c/t',
            controls: true,
            progress: true,
            transition: 'slide',
            plugins: [ RevealMarkdown, RevealHighlight, RevealNotes ]
        });
        (function() {
            var params = new URLSearchParams(window.location.search);
            if (params.get('fs') !== '1') return;
            var overlay = document.getElementById('fsOverlay');
            overlay.classList.add('show');
            function enterFs() {
                overlay.classList.remove('show');
                var el = document.documentElement;
                var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
                if (req) {
                    try { req.call(el).catch(function(){}); } catch (e) {}
                }
                overlay.removeEventListener('click', enterFs);
                document.removeEventListener('keydown', onStartKey);
            }
            function onStartKey(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterFs(); } }
            overlay.addEventListener('click', enterFs);
            document.addEventListener('keydown', onStartKey);
            // Esc closes the chromeless presentation window
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    window.close();
                }
            }, true);
        })();
        ${style === 'matrix' ? `
        (function() {
            var canvas = document.getElementById('matrixRain');
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            var chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF<>/=*+-'.split('');
            var fontSize = 16;
            var columns, drops;
            function resize() {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                columns = Math.floor(canvas.width / fontSize);
                drops = new Array(columns).fill(0).map(function(){ return Math.random() * -50; });
            }
            resize();
            window.addEventListener('resize', resize);
            function draw() {
                ctx.fillStyle = 'rgba(0,0,0,0.08)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.font = fontSize + 'px "Courier New", monospace';
                for (var i = 0; i < drops.length; i++) {
                    var ch = chars[Math.floor(Math.random() * chars.length)];
                    var y = drops[i] * fontSize;
                    ctx.fillStyle = y < fontSize * 2 ? '#ccffd6' : '#00ff41';
                    ctx.fillText(ch, i * fontSize, y);
                    if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
                    drops[i] += 1;
                }
            }
            setInterval(draw, 55);
        })();
        ` : ''}
    </script>
</body>
</html>`;
}

function editorPageHtml(week, file, content) {
    const isNew = !week && !file;
    const title = isNew ? 'Nytt notat' : `Rediger ${file}`;
    const currentWeek = getCurrentYearWeek();
    const defaultWeek = week || currentWeek;

    return `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a202c; height: 100vh; display: flex; flex-direction: column; background: #fbf9f4; }
        .navbar { display: flex; align-items: center; gap: 14px; padding: 0 24px; height: 46px; background: #fbf9f4; border-bottom: 1px solid #e8e2d2; flex-shrink: 0; }
        .navbar .nav-brand { color: #1a365d; font-family: Georgia, "Times New Roman", serif; font-weight: 700; font-size: 1.1em; text-decoration: none; letter-spacing: -0.01em; }
        .navbar .nav-brand:hover { color: #102542; }
        .navbar .nav-links { display: flex; gap: 4px; }
        .navbar .nav-links a { color: #3c3a30; opacity: 0.65; text-decoration: none; padding: 6px 10px; border-radius: 4px; font-size: 0.9em; display: inline-flex; align-items: center; gap: 6px; transition: opacity 0.15s, background 0.15s; }
        .navbar .nav-links a:hover { opacity: 1; background: #f0e8d4; color: #1a365d; }
        .navbar .nav-links kbd { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.72em; background: #f0e8d4; color: #7a6f4d; border: 1px solid #d6cdb6; border-radius: 3px; padding: 1px 5px; letter-spacing: 0.02em; opacity: 0.85; }
        .navbar .nav-clock { margin-left: auto; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85em; color: #7a6f4d; opacity: 0.65; letter-spacing: 0.02em; }
        .ctx-switcher { position: relative; }
        .ctx-trigger { display: inline-flex; align-items: center; gap: 8px; background: #f0e8d4; border: 1px solid #d6cdb6; color: #1a365d; font-family: inherit; font-size: 0.9em; padding: 5px 10px; border-radius: 6px; cursor: pointer; transition: background 0.15s; }
        .ctx-trigger:hover { background: #e6dec5; }
        .ctx-icon { font-size: 1.05em; line-height: 1; display: inline-block; flex-shrink: 0; }
        .ctx-name { font-weight: 600; }
        .ctx-caret { font-size: 0.75em; opacity: 0.6; }
        .ctx-menu { display: none; position: absolute; top: calc(100% + 6px); left: 0; min-width: 220px; background: #fffdf7; border: 1px solid #d6cdb6; border-radius: 8px; box-shadow: 0 8px 24px rgba(26,54,93,0.12); padding: 6px; z-index: 1000; }
        .ctx-switcher.open .ctx-menu { display: block; }
        .ctx-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 4px; cursor: pointer; background: none; border: none; width: 100%; text-align: left; font-family: inherit; font-size: 0.9em; color: #1a365d; text-decoration: none; }
        .ctx-item:hover { background: #f0e8d4; }
        .ctx-item.active { background: #ebf2fa; font-weight: 600; }
        .ctx-sep { height: 1px; background: #e8e2d2; margin: 4px 0; }
        .ctx-link { color: #2a4365; }
        .toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 24px; background: #faf6ec; color: #3c3a30; flex-shrink: 0; flex-wrap: wrap; border-bottom: 1px solid #e8e2d2; }
        .toolbar .crumb { font-family: Georgia, "Times New Roman", serif; font-style: italic; color: #7a6f4d; font-size: 0.95em; margin-right: 4px; }
        .toolbar select, .toolbar input[type="text"] { padding: 6px 10px; border: 1px solid #d6cdb6; border-radius: 4px; font-size: 0.88em; background: #fffdf7; color: #3c3a30; font-family: inherit; }
        .toolbar input[type="text"] { width: 240px; }
        .toolbar input[type="text"]:focus, .toolbar select:focus { outline: none; border-color: #1a365d; background: white; }
        .toolbar button { padding: 6px 12px; border: 1px solid #d6cdb6; border-radius: 4px; font-size: 0.85em; cursor: pointer; font-weight: 500; background: #fffdf7; color: #3c3a30; display: inline-flex; align-items: center; gap: 6px; transition: background 0.12s, border-color 0.12s, color 0.12s; line-height: 1.2; }
        .toolbar button:hover { background: #f0e8d4; border-color: #b9ac88; color: #1a365d; }
        .toolbar button:active { background: #e6dec5; }
        .toolbar button:disabled { opacity: 0.5; cursor: not-allowed; }
        .toolbar button kbd { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.72em; background: rgba(0,0,0,0.04); color: #a99a78; border: 1px solid #d6cdb6; border-radius: 3px; padding: 1px 5px; font-weight: normal; margin-left: 2px; }
        .btn-save { background: #1a365d !important; color: #fffdf7 !important; border-color: #1a365d !important; font-weight: 600 !important; }
        .btn-save:hover { background: #102542 !important; border-color: #102542 !important; color: white !important; }
        .btn-save kbd { background: rgba(255,255,255,0.12) !important; color: rgba(255,255,255,0.75) !important; border-color: rgba(255,255,255,0.2) !important; }
        .btn-danger:hover { color: #c53030 !important; border-color: #f5b7b7 !important; background: #fff5f5 !important; }
        .toolbar .sep { width: 1px; height: 22px; background: #d6cdb6; margin: 0 4px; }
        .status { font-size: 0.82em; color: #a99a78; font-style: italic; margin-left: auto; }
        .editor-wrap { display: flex; flex: 1; min-height: 0; }
        .pane { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .pane-header { padding: 6px 14px; background: #f5efe1; font-size: 0.82em; font-weight: 600; color: #7a6f4d; border-bottom: 1px solid #e8e2d2; flex-shrink: 0; display: flex; align-items: center; gap: 8px; letter-spacing: 0.02em; text-transform: uppercase; }
        .editor-wrap textarea { flex: 1; width: 100%; border: none; resize: none; padding: 18px 22px; padding-bottom: 20vh; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.95em; line-height: 1.65; outline: none; tab-size: 4; background: #fffdf7; color: #3c3a30; }
        .divider { width: 4px; background: #e8e2d2; cursor: col-resize; flex-shrink: 0; }
        .divider:hover { background: #1a365d; }
        .preview { flex: 1; overflow-y: auto; padding: 22px 28px; background: #fffdf7; color: #3c3a30; font-size: 0.95em; line-height: 1.7; }
        .preview table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        .preview th, .preview td { border: 1px solid #e8e2d2; padding: 8px 12px; text-align: left; }
        .preview th { background: #2a4365; color: white; font-size: 0.85em; }
        .preview blockquote { background: #ebf8ff; border-left: 4px solid #2b6cb0; margin: 16px 0; padding: 12px 16px; color: #2c5282; }
        .preview code { background: #f5efe1; color: #7a6f4d; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }
        .preview pre { background: #1a202c; color: #e8e2d2; padding: 16px; border-radius: 6px; overflow-x: auto; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }
        .preview pre code { background: none; color: inherit; padding: 0; border: none; }
        .preview h1, .preview h2, .preview h3 { color: #1a365d; font-family: Georgia, "Times New Roman", serif; font-weight: 400; margin: 22px 0 10px; letter-spacing: -0.01em; }
        .preview h1 { border-bottom: 1px solid #d6cdb6; padding-bottom: 6px; }
        .preview h2 { color: #2a4365; }
        .preview h3 { color: #2b6cb0; font-size: 1.1em; }
        .preview p { margin: 0 0 12px; }
        .preview a { color: #2b6cb0; text-decoration: none; border-bottom: 1px dashed #2b6cb0; }
        .preview a:hover { color: #1a365d; }
        .preview strong { color: #1a365d; }
        .preview em { color: #7a6f4d; }
        .preview hr { border: none; border-top: 1px solid #e8e2d2; margin: 20px 0; }
        .preview ul, .preview ol { margin: 0 0 12px 22px; }
        .preview li { margin: 4px 0; }
        .preview li::marker { color: #2b6cb0; }
        .preview img { border-radius: 6px; border: 1px solid #e8e2d2; max-width: 100%; }
        .help-btn { background: white; border: 1px solid #d6cdb6; color: #7a6f4d; font-size: 0.78em; padding: 2px 10px; border-radius: 4px; cursor: pointer; margin-left: auto; font-weight: normal; }
        .help-btn:hover { background: #f0e8d4; color: #1a365d; }
        .pres-help { display: none; flex-shrink: 0; background: #faf6ec; border-top: 1px solid #e8e2d2; padding: 14px 18px; font-size: 0.82em; color: #3c3a30; line-height: 1.55; max-height: 38vh; overflow-y: auto; }
        body.is-presentation .pres-help { display: block; }
        .pres-help h4 { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-weight: 400; color: #1a365d; font-size: 1em; margin: 0 0 10px; padding-bottom: 4px; border-bottom: 1px solid #d6cdb6; }
        .pres-help h5 { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-weight: 400; color: #2a4365; font-size: 0.92em; margin: 14px 0 6px; }
        .pres-help dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
        .pres-help dt { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; color: #1a365d; white-space: nowrap; }
        .pres-help dt code { background: #fffdf7; border: 1px solid #e8e2d2; padding: 1px 6px; border-radius: 3px; font-size: 0.95em; }
        .pres-help dd { margin: 0; color: #7a6f4d; }
        .pres-help code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; background: #fffdf7; border: 1px solid #e8e2d2; padding: 1px 6px; border-radius: 3px; color: #1a365d; font-size: 0.92em; }
        .pres-help pre { background: #fffdf7; border: 1px solid #e8e2d2; border-radius: 4px; padding: 8px 10px; margin: 4px 0; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85em; color: #3c3a30; line-height: 1.4; overflow-x: auto; white-space: pre; }
        .pres-help a { color: #2b6cb0; }
        body.is-presentation .pane:first-child textarea { min-height: 0; }
        .pres-style-select { display: none; }
        body.is-presentation .pres-style-select { display: inline-block; }
        .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; }
        .modal-overlay.open { display: flex; }
        .modal { background: white; border-radius: 8px; width: min(700px, 90vw); max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: #1a365d; color: white; border-radius: 8px 8px 0 0; position: sticky; top: 0; }
        .modal-head h2 { font-size: 1.1em; margin: 0; font-family: Georgia, "Times New Roman", serif; font-weight: 400; }
        .modal-close { background: none; border: none; color: white; font-size: 1.4em; cursor: pointer; padding: 0 4px; opacity: 0.8; }
        .modal-close:hover { opacity: 1; }
        .modal-body { padding: 20px; }
        .modal-body table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        .modal-body th { text-align: left; background: #2a4365; color: white; padding: 8px 12px; font-size: 0.85em; }
        .modal-body td { padding: 8px 12px; border-bottom: 1px solid #e8e2d2; font-size: 0.9em; vertical-align: top; }
        .modal-body td:first-child { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; white-space: pre-wrap; background: #fffdf7; width: 50%; }
        .modal-body h3 { font-size: 0.95em; color: #1a365d; margin: 18px 0 8px; font-family: Georgia, serif; font-weight: 400; }
        .modal-body h3:first-child { margin-top: 0; }
        .modal-body kbd { background: #f5efe1; border: 1px solid #d6cdb6; border-radius: 3px; padding: 1px 5px; font-size: 0.85em; }
    </style>
</head>
<body>
    <nav class="navbar">
        <a href="/" class="nav-brand">Ukenotater</a>
        ${contextSwitcherHtml()}
        <div class="nav-links">
            <a href="/" data-key="h" title="Hjem (Alt+H)">🏠 Hjem <kbd>Alt+H</kbd></a>
            <a href="/tasks" data-key="o" title="Oppgaver (Alt+O)">☑️ Oppgaver <kbd>Alt+O</kbd></a>
            <a href="/people" data-key="p" title="Personer (Alt+P)">👥 Personer <kbd>Alt+P</kbd></a>
            <a href="/results" data-key="r" title="Resultater (Alt+R)">⚖️ Resultater <kbd>Alt+R</kbd></a>
            <a href="/editor" data-key="n" title="Nytt notat (Alt+N)">📝 Nytt <kbd>Alt+N</kbd></a>
            <a href="/settings" data-key="s" title="Innstillinger (Alt+S)">⚙️ Innstillinger <kbd>Alt+S</kbd></a>
        </div>
        <span id="navClock" class="nav-clock"></span>
    </nav>
    <div class="toolbar">
        <span class="crumb">📁 ${defaultWeek}/</span>
        <select id="noteType">
            <option value="note">📝 Notat</option>
            <option value="meeting">🤝 Møte</option>
            <option value="task">🎯 Oppgave</option>
            <option value="presentation">🎤 Presentasjon</option>
            <option value="other">📌 Annet</option>
        </select>
        <select id="presStyle" class="pres-style-select" title="Presentasjonsstil">
            <option value="paper">🌾 Papir</option>
            <option value="noir">🌙 Noir</option>
            <option value="klassisk">📜 Klassisk</option>
            <option value="levende">🌈 Levende</option>
            <option value="minimal">⬜ Minimal</option>
            <option value="matrix">🟢 Matrix</option>
            <option value="nav">🟥 NAV</option>
        </select>
        <input type="text" id="fileName" placeholder="filnavn.md" value="${file || ''}" />
        <span class="sep"></span>
        <button class="btn-save" id="saveBtn" onclick="save()">💾 Lagre <kbd>Ctrl+S</kbd></button>
        <button id="saveCloseBtn" onclick="saveAndClose()">Lagre &amp; lukk <kbd>Ctrl+⇧+S</kbd></button>
        <span class="sep"></span>
        <button onclick="openTaskModal()">☑️ Ny oppgave <kbd>Alt+T</kbd></button>
        ${isNew ? '' : `<button onclick="window.open('/present/${week}/${encodeURIComponent(file)}','_blank')">🎤 Presenter</button>`}
        ${isNew ? '' : '<button id="pinBtn" onclick="togglePin()">📌 Fest</button>'}
        ${isNew ? '' : '<button onclick="showMeta()">ℹ️ Info</button>'}
        ${isNew ? '' : '<button class="btn-danger" onclick="deleteNote()">🗑️ Slett</button>'}
        <span class="status" id="status"></span>
    </div>
    <div class="editor-wrap">
        <div class="pane">
            <div class="pane-header">✏️ Markdown <button class="help-btn" onclick="document.getElementById('helpModal').classList.add('open')" title="Markdown-hjelp (F1)">❓ Hjelp</button></div>
            <textarea id="editor" spellcheck="true" placeholder="Skriv markdown her..." autofocus>${escapeHtml(content || '')}</textarea>
            <div class="pres-help">
                <h4>🎤 Reveal.js – presentasjons-syntaks</h4>
                <dl>
                    <dt><code>---</code></dt><dd>Nytt lysbilde (egen linje)</dd>
                    <dt><code>--</code></dt><dd>Vertikalt undertema</dd>
                    <dt><code>Note: …</code></dt><dd>Talenotat (vises med <code>S</code>)</dd>
                    <dt><code># Tittel</code></dt><dd>Hovedoverskrift på lysbildet</dd>
                    <dt><code>## Undertittel</code></dt><dd>Underoverskrift</dd>
                    <dt><code>&gt; sitat</code></dt><dd>Blokksitat</dd>
                    <dt><code>\`kode\`</code></dt><dd>Inline kode</dd>
                </dl>
                <h5>Eksempel</h5>
                <pre># Velkommen
Et innledende lysbilde

---

## Agenda
- Punkt 1
- Punkt 2

--

### Detalj
Vertikalt under-lysbilde

Note: Husk å nevne tidsplanen.

---

## Takk!</pre>
                <h5>Snarveier under presentasjon</h5>
                <dl>
                    <dt><code>F</code></dt><dd>Fullskjerm</dd>
                    <dt><code>S</code></dt><dd>Talenotater</dd>
                    <dt><code>Esc</code> / <code>O</code></dt><dd>Oversikt over lysbilder</dd>
                    <dt><code>B</code></dt><dd>Sort skjerm (pause)</dd>
                    <dt><code>?</code></dt><dd>Vis alle snarveier</dd>
                </dl>
                <p style="margin-top:10px"><a href="https://revealjs.com/markdown/" target="_blank">📖 Full reveal.js-dokumentasjon →</a></p>
            </div>
        </div>
        <div class="divider" id="divider"></div>
        <div class="pane">
            <div class="pane-header">👁️ Forhåndsvisning</div>
            <div class="preview" id="preview"></div>
        </div>
    </div>
    <script>
        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');
        const fileName = document.getElementById('fileName');
        const status = document.getElementById('status');
        const saveBtn = document.getElementById('saveBtn');
        const noteType = document.getElementById('noteType');
        const currentFolder = '${defaultWeek}';
        const presStyle = document.getElementById('presStyle');

        // Parse type from metadata
        noteType.value = '${(content && file) ? (getNoteMeta(week, file).type || 'note') : 'note'}';
        presStyle.value = '${(content && file) ? (getNoteMeta(week, file).presentationStyle || 'paper') : 'paper'}';
        const PRESENTATION_TEMPLATE = [
            '# Tittel på presentasjonen',
            '',
            'Kort undertittel eller intro',
            '',
            '---',
            '',
            '## Agenda',
            '',
            '- Punkt 1',
            '- Punkt 2',
            '- Punkt 3',
            '',
            '---',
            '',
            '## Hovedinnhold',
            '',
            'Skriv innholdet her.',
            '',
            '> Et viktig sitat eller poeng',
            '',
            'Note: Talenotat – synlig med tasten S under presentasjonen.',
            '',
            '--',
            '',
            '### Detalj',
            '',
            'Vertikalt under-lysbilde med mer detaljer.',
            '',
            '---',
            '',
            '## Takk for oppmerksomheten 🎤',
            '',
            'Spørsmål?',
            ''
        ].join('\\n');
        function updatePresHelp() {
            const isPres = noteType.value === 'presentation';
            document.body.classList.toggle('is-presentation', isPres);
            if (isPres && editor.value.trim() === '') {
                editor.value = PRESENTATION_TEMPLATE;
                render();
                editor.selectionStart = editor.selectionEnd = 0;
            }
        }
        updatePresHelp();
        noteType.addEventListener('change', updatePresHelp);

        function syncScroll() {
            var maxScroll = editor.scrollHeight - editor.clientHeight;
            var scrollPct = maxScroll > 0 ? Math.min(editor.scrollTop / (maxScroll - editor.clientHeight * 0.2), 1) : 0;
            preview.scrollTop = scrollPct * (preview.scrollHeight - preview.clientHeight);
        }
        function render() {
            preview.innerHTML = marked.parse(editor.value, { breaks: true });
            syncScroll();
        }
        editor.addEventListener('input', render);
        editor.addEventListener('scroll', syncScroll);
        render();
        editor.selectionStart = editor.selectionEnd = editor.value.length;

        // Tab key inserts spaces
        editor.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 4;
                render();
            }
            // Ctrl+S / Cmd+S to save, Ctrl+Shift+S / Cmd+Shift+S to save & close
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (e.shiftKey) { saveAndClose(); } else { save(); }
            }
            // Alt+D inserts current date
            if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                var now = new Date();
                var ds = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
                var start = editor.selectionStart, end = editor.selectionEnd;
                editor.value = editor.value.substring(0, start) + ds + editor.value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + ds.length;
                render();
            }
        });

        // Draggable divider
        const divider = document.getElementById('divider');
        const editorWrap = document.querySelector('.editor-wrap');
        let dragging = false;
        divider.addEventListener('mousedown', () => { dragging = true; document.body.style.cursor = 'col-resize'; });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const panes = editorWrap.querySelectorAll('.pane');
            const rect = editorWrap.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            if (pct > 20 && pct < 80) {
                panes[0].style.flex = 'none';
                panes[0].style.width = pct + '%';
                panes[1].style.flex = '1';
            }
        });
        document.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = ''; });

        async function save(autosave = false) {
            let file = fileName.value.trim();
            let autoNamed = false;
            if (!file) {
                const headingMatch = editor.value.match(/^#+ +(.+)/m);
                if (headingMatch) {
                    file = headingMatch[1].trim().replace(/[^a-zA-Z0-9æøåÆØÅ _-]/g, '').replace(/\\s+/g, '-').substring(0, 80);
                } else {
                    const now = new Date();
                    const dd = String(now.getDate()).padStart(2, '0');
                    const mm = String(now.getMonth() + 1).padStart(2, '0');
                    const yyyy = now.getFullYear();
                    file = yyyy + '-' + mm + '-' + dd;
                }
                autoNamed = true;
            }
            const finalFile = file.endsWith('.md') ? file : file + '.md';

            saveBtn.disabled = true;
            status.textContent = '⏳ Lagrer...';
            try {
                const resp = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder: currentFolder, file: finalFile, content: editor.value, append: autoNamed, type: noteType.value, presentationStyle: presStyle.value, autosave })
                });
                const data = await resp.json();
                if (resp.ok) {
                    status.textContent = '✅ Lagret!';
                    lastSaved = editor.value;
                    history.replaceState(null, '', '/editor/' + currentFolder + '/' + encodeURIComponent(finalFile));
                    fileName.value = finalFile;
                    saveBtn.disabled = false;
                    return true;
                } else {
                    status.textContent = '❌ ' + (data.error || 'Feil ved lagring');
                }
            } catch (e) {
                status.textContent = '❌ Nettverksfeil';
            }
            saveBtn.disabled = false;
            return false;
        }

        async function saveAndClose() {
            const ok = await save();
            if (ok) window.location.href = '/';
        }

        // Clock
        (function tick() {
            var now = new Date();
            document.getElementById('navClock').textContent = now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setTimeout(tick, 1000);
        })();

        async function deleteNote() {
            var file = fileName.value.trim();
            if (!file) return;
            if (!confirm('Er du sikker på at du vil slette ' + file + '?')) return;
            var resp = await fetch('/api/notes/' + currentFolder + '/' + encodeURIComponent(file), { method: 'DELETE' });
            if (resp.ok) { window.location.href = '/'; }
            else { status.textContent = '❌ Kunne ikke slette'; }
        }

        async function togglePin() {
            var file = fileName.value.trim();
            if (!file) return;
            var resp = await fetch('/api/notes/' + currentFolder + '/' + encodeURIComponent(file) + '/pin', { method: 'PUT' });
            if (resp.ok) {
                var data = await resp.json();
                document.getElementById('pinBtn').textContent = data.pinned ? '📌 Festet' : '📌 Fest';
                status.textContent = data.pinned ? '📌 Festet!' : 'Fjernet fra festet';
            }
        }

        async function showMeta() {
            var file = fileName.value.trim();
            if (!file) return;
            var resp = await fetch('/api/notes/' + currentFolder + '/' + encodeURIComponent(file) + '/meta');
            if (!resp.ok) { status.textContent = '❌ Kunne ikke hente info'; return; }
            var meta = await resp.json();
            var typeLabels = { note: '📝 Notat', meeting: '🤝 Møte', task: '🎯 Oppgave', other: '📌 Annet' };
            var body = '<table>';
            body += '<tr><th>Egenskap</th><th>Verdi</th></tr>';
            body += '<tr><td>Type</td><td>' + (typeLabels[meta.type] || '📄 Ukjent') + '</td></tr>';
            body += '<tr><td>Opprettet</td><td>' + (meta.created ? meta.created.slice(0, 16).replace('T', ' ') : '—') + '</td></tr>';
            body += '<tr><td>Sist endret</td><td>' + (meta.modified ? meta.modified.slice(0, 16).replace('T', ' ') : '—') + '</td></tr>';
            body += '<tr><td>Festet</td><td>' + (meta.pinned ? '✅ Ja' : 'Nei') + '</td></tr>';
            body += '<tr><td>Antall lagringer</td><td>' + (meta.saves ? meta.saves.length : 0) + '</td></tr>';
            if (meta.saves && meta.saves.length > 0) {
                body += '<tr><td colspan="2" style="padding-top:12px"><strong>Lagringshistorikk</strong></td></tr>';
                meta.saves.slice().reverse().forEach(function(s, i) {
                    body += '<tr><td style="color:#718096">#' + (meta.saves.length - i) + '</td><td>' + s.slice(0, 16).replace('T', ' ') + '</td></tr>';
                });
            }
            body += '</table>';
            document.querySelector('#metaModal .modal-body').innerHTML = body;
            document.getElementById('metaModal').classList.add('open');
        }

        // Autosave every 30 seconds if content changed and file has a name
        let lastSaved = editor.value;
        window.addEventListener('beforeunload', function(e) {
            if (editor.value !== lastSaved) { e.preventDefault(); }
        });
        setInterval(() => {
            if (fileName.value.trim() && editor.value !== lastSaved) {
                lastSaved = editor.value;
                save(true).then(() => {});
            }
        }, 30000);
    </script>
    <script src="/mention-autocomplete.js"></script>
    <script>initMentionAutocomplete(document.getElementById('editor'));</script>
    <div class="modal-overlay" id="metaModal">
        <div class="modal" style="width:min(500px,90vw)">
            <div class="modal-head" style="background:#4a5568">
                <h2>ℹ️ Notatinfo</h2>
                <button class="modal-close" onclick="document.getElementById('metaModal').classList.remove('open')" title="Lukk (Esc)">&times;</button>
            </div>
            <div class="modal-body"></div>
        </div>
    </div>
    <script>
        (function() {
            var mm = document.getElementById('metaModal');
            mm.addEventListener('click', function(e) { if (e.target === mm) mm.classList.remove('open'); });
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && mm.classList.contains('open')) mm.classList.remove('open');
            });
        })();
    </script>
    <div class="modal-overlay" id="taskModal">
        <div class="modal" style="width:min(500px,90vw)">
            <div class="modal-head" style="background:#553c9a">
                <h2>☑️ Ny oppgave</h2>
                <button class="modal-close" onclick="closeTaskModal()" title="Lukk (Esc)">&times;</button>
            </div>
            <div class="modal-body" style="padding:20px">
                <label style="display:block;font-weight:600;margin-bottom:8px;font-size:0.9em;color:#4a5568">Oppgavetekst</label>
                <input type="text" id="taskInput" placeholder="Beskriv oppgaven..." style="width:100%;padding:10px 12px;border:1px solid #e8e2d2;border-radius:6px;font-size:0.95em;outline:none;box-sizing:border-box" />
                <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
                    <button onclick="closeTaskModal()" style="padding:8px 16px;border:1px solid #e8e2d2;border-radius:6px;background:white;cursor:pointer;font-size:0.9em">Avbryt</button>
                    <button id="taskSubmitBtn" onclick="submitTask()" style="padding:8px 20px;border:none;border-radius:6px;background:#805ad5;color:white;cursor:pointer;font-weight:600;font-size:0.9em">Opprett</button>
                </div>
                <div id="taskStatus" style="margin-top:10px;font-size:0.85em;color:#48bb78"></div>
            </div>
        </div>
    </div>
    <script>
        var _savedCursorStart = null, _savedCursorEnd = null;
        function openTaskModal() {
            var ed = document.getElementById('editor');
            _savedCursorStart = ed ? ed.selectionStart : null;
            _savedCursorEnd   = ed ? ed.selectionEnd   : null;
            document.getElementById('taskModal').classList.add('open');
            document.getElementById('taskInput').focus();
        }
        function closeTaskModal() {
            document.getElementById('taskModal').classList.remove('open');
            var ed = document.getElementById('editor');
            if (ed && _savedCursorStart !== null) {
                ed.focus();
                ed.selectionStart = _savedCursorStart;
                ed.selectionEnd   = _savedCursorEnd;
            }
        }
        (function() {
            var tm = document.getElementById('taskModal');
            var ti = document.getElementById('taskInput');
            tm.addEventListener('click', function(e) { if (e.target === tm) closeTaskModal(); });
            ti.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); submitTask(); }
            });
            document.addEventListener('keydown', function(e) {
                if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 't') {
                    e.preventDefault();
                    openTaskModal();
                }
                if (e.key === 'Escape' && tm.classList.contains('open')) { closeTaskModal(); }
            });
        })();
        async function submitTask() {
            var ti = document.getElementById('taskInput');
            var ts = document.getElementById('taskStatus');
            var text = ti.value.trim();
            if (!text) { ti.focus(); return; }
            document.getElementById('taskSubmitBtn').disabled = true;
            ts.textContent = '⏳ Oppretter...';
            try {
                var resp = await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });
                if (resp.ok) {
                    ts.style.color = '#48bb78';
                    ts.textContent = '✅ Oppgave opprettet!';
                    ti.value = '';
                    setTimeout(function() {
                        closeTaskModal();
                        ts.textContent = '';
                    }, 1000);
                } else {
                    ts.style.color = '#e53e3e';
                    ts.textContent = '❌ Feil ved opprettelse';
                }
            } catch(e) {
                ts.style.color = '#e53e3e';
                ts.textContent = '❌ Nettverksfeil';
            }
            document.getElementById('taskSubmitBtn').disabled = false;
        }
    </script>
    <div class="modal-overlay" id="helpModal">
        <div class="modal">
            <div class="modal-head">
                <h2>📖 Markdown-hjelp</h2>
                <button class="modal-close" onclick="document.getElementById('helpModal').classList.remove('open')" title="Lukk (Esc)">&times;</button>
            </div>
            <div class="modal-body">
                <h3>Overskrifter</h3>
                <table><tr><th>Skriv dette</th><th>Resultat</th></tr>
                <tr><td># Overskrift 1</td><td><strong style="font-size:1.4em">Overskrift 1</strong></td></tr>
                <tr><td>## Overskrift 2</td><td><strong style="font-size:1.2em">Overskrift 2</strong></td></tr>
                <tr><td>### Overskrift 3</td><td><strong style="font-size:1.05em">Overskrift 3</strong></td></tr>
                </table>

                <h3>Tekstformatering</h3>
                <table><tr><th>Skriv dette</th><th>Resultat</th></tr>
                <tr><td>**fet tekst**</td><td><strong>fet tekst</strong></td></tr>
                <tr><td>*kursiv tekst*</td><td><em>kursiv tekst</em></td></tr>
                <tr><td>~~gjennomstreking~~</td><td><s>gjennomstreking</s></td></tr>
                <tr><td>\`inline kode\`</td><td><code style="background:#f5efe1;padding:2px 5px;border-radius:3px">inline kode</code></td></tr>
                </table>

                <h3>Lister</h3>
                <table><tr><th>Skriv dette</th><th>Resultat</th></tr>
                <tr><td>- Punkt 1\n- Punkt 2\n  - Underpunkt</td><td>• Punkt 1<br>• Punkt 2<br>&nbsp;&nbsp;◦ Underpunkt</td></tr>
                <tr><td>1. Første\n2. Andre\n3. Tredje</td><td>1. Første<br>2. Andre<br>3. Tredje</td></tr>
                <tr><td>- [ ] Ugjort\n- [x] Ferdig</td><td>☐ Ugjort<br>☑ Ferdig</td></tr>
                </table>

                <h3>Lenker og bilder</h3>
                <table><tr><th>Skriv dette</th><th>Resultat</th></tr>
                <tr><td>[Lenketekst](https://url.no)</td><td><a style="color:#2b6cb0">Lenketekst</a></td></tr>
                <tr><td>![Bildetekst](bilde.png)</td><td>🖼️ <em>Bilde vises her</em></td></tr>
                </table>

                <h3>Sitat og skillelinje</h3>
                <table><tr><th>Skriv dette</th><th>Resultat</th></tr>
                <tr><td>> Dette er et sitat</td><td><blockquote style="border-left:3px solid #2b6cb0;padding-left:10px;color:#4a5568;margin:0">Dette er et sitat</blockquote></td></tr>
                <tr><td>---</td><td><hr style="margin:4px 0"></td></tr>
                </table>

                <h3>Tabell</h3>
                <table><tr><th>Skriv dette</th><th>Resultat</th></tr>
                <tr><td>| Kolonne 1 | Kolonne 2 |\n|-----------|----------|\n| Celle 1   | Celle 2  |</td><td><table style="border-collapse:collapse;font-size:0.9em"><tr><th style="background:#2a4365;color:white;padding:4px 8px">Kolonne 1</th><th style="background:#2a4365;color:white;padding:4px 8px">Kolonne 2</th></tr><tr><td style="border:1px solid #e8e2d2;padding:4px 8px">Celle 1</td><td style="border:1px solid #e8e2d2;padding:4px 8px">Celle 2</td></tr></table></td></tr>
                </table>

                <h3>Kodeblokk</h3>
                <table><tr><th>Skriv dette</th><th>Resultat</th></tr>
                <tr><td>\`\`\`javascript\nconsole.log("Hei!");\n\`\`\`</td><td><pre style="background:#1a202c;color:#e8e2d2;padding:8px;border-radius:4px;margin:0;font-size:0.9em">console.log("Hei!");</pre></td></tr>
                </table>

                <h3>Hurtigtaster i editoren</h3>
                <table><tr><th>Tastekombinasjon</th><th>Handling</th></tr>
                <tr><td><kbd>Ctrl+S</kbd></td><td>Lagre</td></tr>
                <tr><td><kbd>Ctrl+Shift+S</kbd></td><td>Lagre og lukk</td></tr>
                <tr><td><kbd>Tab</kbd></td><td>Sett inn 4 mellomrom</td></tr>
                <tr><td><kbd>F1</kbd></td><td>Vis/skjul denne hjelpen</td></tr>
                <tr><td><kbd>Alt+D</kbd></td><td>Sett inn dagens dato (yyyy-mm-dd)</td></tr>
                <tr><td><kbd>Alt+H</kbd></td><td>Gå til hjem</td></tr>
                <tr><td><kbd>Alt+O</kbd></td><td>Gå til oppgaver</td></tr>
                </table>
            </div>
        </div>
    </div>
    <script>
        (function() {
            var modal = document.getElementById('helpModal');
            modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); });
            document.addEventListener('keydown', function(e) {
                if (e.key === 'F1') { e.preventDefault(); modal.classList.toggle('open'); }
                if (e.key === 'Escape' && modal.classList.contains('open')) { modal.classList.remove('open'); }
            });
        })();
    </script>
    <script>document.addEventListener('keydown',function(e){if(!e.altKey||e.ctrlKey||e.metaKey)return;var k=e.key.toLowerCase();if(k==='h'){e.preventDefault();window.location.href='/';}if(k==='o'){e.preventDefault();window.location.href='/tasks';}if(k==='s'){e.preventDefault();window.location.href='/settings';}});(function(){var t=document.getElementById('ctxTrigger');var sw=t&&t.parentElement;if(!t)return;t.addEventListener('click',function(e){e.stopPropagation();sw.classList.toggle('open');});document.addEventListener('click',function(e){if(!sw.contains(e.target))sw.classList.remove('open');});sw.querySelectorAll('.ctx-item[data-id]').forEach(function(b){b.addEventListener('click',function(){var id=b.getAttribute('data-id');fetch('/api/contexts/switch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})}).then(function(r){return r.json();}).then(function(d){if(d.ok)location.href='/';else alert('Kunne ikke bytte: '+d.error);});});});})();</script>
</body>
</html>`;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Replace @name in already-escaped/rendered HTML with a link to /people (no @).
// Uses people registry for display name (firstName lastName) when available.
function linkMentions(html, people) {
    if (!html) return html;
    people = people || loadPeople();
    return html.replace(/(^|[\s\n(\[>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g, (m, pre, name) => {
        const p = people.find(x => x.name === name || x.key === name.toLowerCase());
        const display = p ? (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name) : name;
        const key = p ? (p.key || (p.name || '').toLowerCase()) : name.toLowerCase();
        return pre + `<a href="/people" class="mention-link" data-person-key="${escapeHtml(key)}">${escapeHtml(display)}</a>`;
    });
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    // Guard: if no contexts exist, force the user onto /settings to create one
    if (listContexts().length === 0) {
        const allowed = pathname === '/settings'
            || pathname.startsWith('/api/contexts')
            || pathname === '/_layouts' || pathname === '/_layouts.html';
        if (!allowed) {
            res.writeHead(302, { Location: '/settings' });
            res.end();
            return;
        }
    }

    // Layout mockups (design preview)
    if (pathname === '/_layouts' || pathname === '/_layouts.html') {
        try {
            const file = fs.readFileSync('/home/p/.copilot/session-state/46f37a99-6d5b-4ad2-b330-4e8127bb956b/files/layouts.html', 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(file);
        } catch (e) {
            res.writeHead(404); res.end('Layouts not found: ' + e.message);
        }
        return;
    }

    // Help content (rendered client-side via marked)
    if (pathname === '/help.md') {
        try {
            const file = fs.readFileSync(path.join(__dirname, 'help.md'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
            res.end(file);
        } catch (e) {
            res.writeHead(404); res.end('Help not found');
        }
        return;
    }

    // Root: list all weeks with their md files
    if (pathname === '/' || pathname === '/index.html') {
        const weeks = getWeekDirs();
        const tasks = loadTasks();
        const results = loadResults();
        const tasksByWeek = {};
        tasks.forEach(t => {
            const w = t.week || '';
            if (!tasksByWeek[w]) tasksByWeek[w] = [];
            tasksByWeek[w].push(t);
        });
        const resultsByWeek = {};
        results.forEach(r => {
            if (!resultsByWeek[r.week]) resultsByWeek[r.week] = [];
            resultsByWeek[r.week].push(r);
        });
        // Collect all weeks (from folders + tasks)
        const taskWeeks = Object.keys(tasksByWeek).filter(w => w && !weeks.includes(w));
        const allWeeks = [...weeks, ...taskWeeks].sort((a, b) => b.localeCompare(a));

        const savedSummaries = {};

        // Build sidebar: open tasks (global)
        const openTasks = tasks.filter(t => !t.done);
        const currentWeek = getCurrentYearWeek();

        let sidebar = '<aside class="task-sidebar"><div class="task-sidebar-inner">';
        sidebar += '<h3 class="side-h">Åpne oppgaver · ' + openTasks.length + '</h3>';
        if (openTasks.length === 0) {
            sidebar += '<p class="empty-quiet">Ingen åpne oppgaver</p>';
        } else {
            sidebar += '<div class="sidebar-tasks">';
            openTasks.forEach(t => {
                const noteIndicator = t.note ? `<button onclick="openNoteModal('${t.id}')" class="row-note-btn" title="Rediger notat">📓</button>` : `<button onclick="openNoteModal('${t.id}')" class="row-note-btn empty" title="Legg til notat">📓</button>`;
                const noteDiv = t.note ? `<div class="md-content row-note-body">${linkMentions(marked(t.note))}</div>` : '';
                const weekShort = t.week ? 'U' + t.week.split('-')[1] : '';
                const weekBadge = weekShort ? `<span class="pill" title="Opprettet uke ${t.week}">${weekShort}</span>` : '';
                sidebar += `<div class="sidebar-task"><div class="row"><input type="checkbox" data-taskid="${t.id}" data-tasktext="${escapeHtml(t.text)}" onchange="showCommentModal(this)" /><span class="row-text">${linkMentions(escapeHtml(t.text))}</span>${weekBadge}${noteIndicator}</div>${noteDiv}</div>`;
            });
            sidebar += '</div>';
        }
        sidebar += '</div></aside>';

        // Replace closing tag — augment with upcoming meetings section before </aside>
        sidebar = sidebar.replace('</aside>', (function(){
            const meetings = loadMeetings();
            const today = new Date();
            const todayStr = today.toISOString().slice(0,10);
            const cutoff = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0,10);
            const upcoming = meetings
                .filter(m => m.date >= todayStr && m.date <= cutoff)
                .sort((a,b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))
                .slice(0, 12);
            const dayLabel = (iso) => {
                const d = new Date(iso + 'T00:00:00Z');
                const t = today; t.setUTCHours(0,0,0,0);
                const days = Math.round((d - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / 86400000);
                if (days === 0) return 'I dag';
                if (days === 1) return 'I morgen';
                const wkd = ['søn','man','tir','ons','tor','fre','lør'][d.getUTCDay()];
                return wkd + ' ' + String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0');
            };
            let h = '<h3 class="side-h" style="margin-top:18px">📅 Kommende møter · ' + upcoming.length + '</h3>';
            if (upcoming.length === 0) {
                h += '<p class="empty-quiet">Ingen møter de neste 14 dagene. <a href="/calendar">Legg til</a></p>';
            } else {
                h += '<div class="sidebar-meetings">';
                upcoming.forEach(m => {
                    const time = m.start ? escapeHtml(m.start) + (m.end ? '–' + escapeHtml(m.end) : '') : 'Hele dagen';
                    const att = (m.attendees || []).map(a => '<a class="mention-link" data-person-key="' + escapeHtml(a) + '" href="/people#' + escapeHtml(a) + '">@' + escapeHtml(a) + '</a>').join(' ');
                    const loc = m.location ? '<span class="mtg-loc">📍 ' + escapeHtml(m.location) + '</span>' : '';
                    const typeIcon = meetingTypeIcon(m.type);
                    const typeLabel = meetingTypeLabel(m.type);
                    const typeHtml = typeIcon ? '<span class="mtg-type-icon" title="' + escapeHtml(typeLabel) + '">' + typeIcon + '</span> ' : '';
                    h += '<div class="sidebar-meeting" data-mid="' + escapeHtml(m.id) + '" data-cal-href="/calendar/' + escapeHtml(dateToIsoWeek(new Date(m.date + 'T00:00:00Z'))) + '#m-' + encodeURIComponent(m.id) + '" title="Åpne i kalender">'
                        + '<a class="sidebar-mtg-note" href="/meeting-note/' + encodeURIComponent(m.id) + '" title="Åpne møtenotat">📝</a>'
                        + '<div class="mtg-when"><strong>' + escapeHtml(dayLabel(m.date)) + '</strong> · ' + time + '</div>'
                        + '<div class="mtg-title">' + typeHtml + linkMentions(escapeHtml(m.title)) + '</div>'
                        + (att || loc ? '<div class="mtg-meta">' + att + (att && loc ? ' · ' : '') + loc + '</div>' : '')
                        + '</div>';
                });
                h += '</div>';
                h += '<div style="margin-top:8px"><a href="/calendar" style="font-size:0.85em;color:#2b6cb0">Åpne kalender →</a></div>';
            }
            return h + '</aside>';
        })());

        let body = '<div class="home-layout">' + sidebar + '<main class="home-main">';
        body += '<input class="search" id="searchInput" type="text" placeholder="Søk i notater…" />';
        body += '<div id="searchResults"></div>';
        body += '<div id="weekList">';

        let currentSideHtml = '';

        if (allWeeks.length === 0) {
            body += '<p class="empty-quiet">Ingen uker funnet.</p>';
        } else {
            allWeeks.forEach(week => {
                const files = getMdFiles(week);
                const weekResults = resultsByWeek[week] || [];
                const weekHasCompletedTask = tasks.some(t => t.done && (t.completedWeek || t.week) === week);
                if (files.length === 0 && weekResults.length === 0 && !weekHasCompletedTask) return;

                const isCurrent = week === currentWeek;
                const weekCompleted = tasks.filter(t => t.done && (t.completedWeek || t.week) === week);
                const noteFilesAll = files.filter(f => f !== 'summarize.md');
                const weekNum = week.split('-')[1];
                const dateRange = isoWeekToDateRange(week);
                const summaryLine = `${weekCompleted.length} fullført · ${weekResults.length} ${weekResults.length === 1 ? 'resultat' : 'resultater'} · ${noteFilesAll.length} ${noteFilesAll.length === 1 ? 'notat' : 'notater'}`;

                const hasSummary = files.includes('summarize.md');
                if (hasSummary) {
                    try { savedSummaries[week] = fs.readFileSync(path.join(dataDir(), week, 'summarize.md'), 'utf-8'); } catch {}
                }
                const viewBtn = hasSummary ? ` <button onclick="showSavedSummary('${week}')" class="btn-summarize" style="background:#2b6cb0">📋 Vis oppsummering</button>` : '';

                if (isCurrent) {
                    body += `<div class="week-section">`;
                    body += `<div class="h-week"><span class="h-week-label">Uke ${weekNum}</span> <span class="pill live">aktiv</span><span class="meta">${dateRange}</span></div>`;
                    body += `<div class="week-title-actions"><button onclick="summarizeWeek('${week}')" class="btn-summarize" id="sum-${week}">✨ Oppsummer</button>${viewBtn}</div>`;
                } else {
                    body += `<details class="older-week"><summary class="older"><span class="caret">▸</span><span class="older-title">Uke ${weekNum}</span><span class="older-meta">${dateRange ? dateRange + '  ·  ' : ''}${summaryLine}</span></summary>`;
                    body += `<div class="week-section older-body"><div class="week-title-actions"><button onclick="summarizeWeek('${week}')" class="btn-summarize" id="sum-${week}">✨ Oppsummer</button>${viewBtn}</div>`;
                }

                // Build notes column
                const noteFiles = noteFilesAll.slice();
                noteFiles.sort((a, b) => {
                    const aPinned = getNoteMeta(week, a).pinned ? 1 : 0;
                    const bPinned = getNoteMeta(week, b).pinned ? 1 : 0;
                    if (aPinned !== bPinned) return bPinned - aPinned;
                    const aCreated = getNoteMeta(week, a).created || '';
                    const bCreated = getNoteMeta(week, b).created || '';
                    if (aCreated && bCreated) return bCreated.localeCompare(aCreated);
                    if (aCreated) return -1;
                    if (bCreated) return 1;
                    return b.localeCompare(a);
                });
                let notesHtml = `<h3 class="sec-h">Notater <span class="c">${noteFiles.length}</span></h3>`;
                if (noteFiles.length === 0) {
                    notesHtml += '<p class="empty-quiet">Ingen notater denne uken</p>';
                } else {
                    noteFiles.forEach(f => {
                        const name = f.replace('.md', '');
                        const editHref = `/editor/${week}/${encodeURIComponent(f)}`;
                        const filePath = path.join(dataDir(), week, f);
                        const noteMeta = getNoteMeta(week, f);
                        const typeIcons = { note: '📝', meeting: '🤝', task: '🎯', presentation: '🎤', other: '📌' };
                        const typeIcon = typeIcons[noteMeta.type] || '📄';
                        const pinIcon = noteMeta.pinned ? '<span title="Festet">📌</span> ' : '';
                        const presentBtn = noteMeta.type === 'presentation' ? `<button type="button" class="note-icon-btn" onclick="openPresentation('${week}','${encodeURIComponent(f)}')" title="Presenter ${escapeHtml(name)}">🎤</button>` : '';
                        let raw = '';
                        try { raw = fs.readFileSync(filePath, 'utf-8'); } catch {}
                        const snippet = linkMentions(escapeHtml(noteSnippet(raw, 220)));
                        notesHtml += `<div class="note-card" data-note-card="${week}/${encodeURIComponent(f)}">
                            <div class="note-h"><span>${pinIcon}${typeIcon} ${escapeHtml(name)}</span><span class="note-actions"><button type="button" class="note-icon-btn" onclick="openNoteViewModal('${week}','${encodeURIComponent(f)}')" title="Vis ${escapeHtml(name)}">👁️</button>${presentBtn}<a href="${editHref}" title="Rediger ${escapeHtml(name)}">✏️</a><button type="button" class="note-icon-btn note-del" onclick="deleteNoteFromHome('${week}','${encodeURIComponent(f)}','${escapeHtml(name).replace(/'/g, "\\'")}')" title="Slett ${escapeHtml(name)}">🗑️</button></span></div>
                            ${snippet ? `<div class="note-body">${snippet}</div>` : ''}
                        </div>`;
                    });
                }

                // Build side column (results + completed)
                let sideHtml = `<h3 class="sec-h">Resultater <span class="c">${weekResults.length}</span></h3>`;
                if (weekResults.length === 0) {
                    sideHtml += '<p class="empty-quiet">Ingen resultater</p>';
                } else {
                    weekResults.forEach(r => {
                        const dShort = r.created ? r.created.slice(8, 10) + '.' + r.created.slice(5, 7) : '';
                        sideHtml += `<div class="result">${linkMentions(escapeHtml(r.text))}<div class="meta"><span>${r.people && r.people.length > 0 ? r.people.map(p => '@' + escapeHtml(p)).join(', ') : ''}</span><span>${dShort}</span></div></div>`;
                    });
                }
                sideHtml += `<h3 class="sec-h">Fullført <span class="c">${weekCompleted.length}</span></h3>`;
                if (weekCompleted.length === 0) {
                    sideHtml += '<p class="empty-quiet">Ingen fullførte oppgaver</p>';
                } else {
                    sideHtml += '<div class="sidebar-tasks">';
                    weekCompleted.forEach(t => {
                        const dShort = t.completedAt ? t.completedAt.slice(8, 10) + '.' + t.completedAt.slice(5, 7) : '';
                        sideHtml += `<div class="row done"><input type="checkbox" checked data-taskid="${t.id}" data-tasktext="${escapeHtml(t.text)}" onchange="undoComplete(this)" /><span class="row-text">${linkMentions(escapeHtml(t.text))}</span>${dShort ? `<span class="when">${dShort}</span>` : ''}</div>`;
                    });
                    sideHtml += '</div>';
                }

                if (isCurrent) {
                    // Current week: only render notes inline; results+completed go in the right sidebar
                    body += notesHtml;
                    currentSideHtml = sideHtml;
                } else {
                    body += `<div class="week-grid"><div class="col-notes">${notesHtml}</div><div class="col-side">${sideHtml}</div></div>`;
                }

                body += '</div>'; // end .week-section
                if (!isCurrent) body += '</details>';
            });
        }

        body += '</div>'; // end weekList
        body += '</main>';
        body += `<aside class="results-sidebar">${currentSideHtml}</aside>`;
        body += '</div>'; // end home-layout

        // Comment modal
        body += commentModalHtml();

        // Note modal
        body += noteModalHtml();

        // Add task modal
        body += '<div id="addTaskModal" class="page-modal" onclick="if(event.target===this)closeAddTaskModal()"><div class="page-modal-card"><h3>☑️ Ny oppgave</h3><p id="addTaskWeekLabel" style="color:#718096;font-size:0.85em;margin-bottom:12px"></p><input type="text" id="addTaskInput" placeholder="Beskriv oppgaven..." /><div class="page-modal-actions"><button class="page-modal-btn cancel" onclick="closeAddTaskModal()">Avbryt</button><button class="page-modal-btn green" onclick="submitAddTask()">Legg til</button></div></div></div>';

        // Summary modal
        body += '<div id="summaryModal" class="page-modal" onclick="if(event.target===this)closeSummary()"><div class="page-modal-card" style="max-width:700px;max-height:80vh;display:flex;flex-direction:column"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0" id="summaryTitle">✨ Oppsummering</h3><button onclick="closeSummary()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:#718096">✕</button></div><div id="summaryContent" class="md-content" style="overflow-y:auto;flex:1"></div><div class="page-modal-actions"><button class="page-modal-btn cancel" onclick="closeSummary()">Lukk</button><button id="summarySaveBtn" class="page-modal-btn purple" onclick="saveSummary()">💾 Lagre</button></div></div></div>';
        body += '<div id="noteViewModal" class="page-modal" onclick="if(event.target===this)closeNoteViewModal()"><div class="page-modal-card" style="max-width:780px;max-height:85vh;display:flex;flex-direction:column"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px"><h3 style="margin:0" id="noteViewTitle">📄 Notat</h3><div style="display:flex;gap:8px;align-items:center"><a id="noteViewEditLink" href="#" class="page-modal-btn blue" style="text-decoration:none;font-size:0.85em">✏️ Rediger</a><button onclick="closeNoteViewModal()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:#718096">✕</button></div></div><div id="noteViewContent" class="md-content" style="overflow-y:auto;flex:1;padding:4px 4px 4px 0"></div></div></div>';

        // Search script
        body += `<script>
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        const weekList = document.getElementById('weekList');
        let debounceTimer;

        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = searchInput.value.trim();
            if (!q) {
                searchResults.innerHTML = '';
                weekList.style.display = '';
                return;
            }
            debounceTimer = setTimeout(() => doSearch(q), 250);
        });

        async function doSearch(q) {
            try {
                const resp = await fetch('/api/search?q=' + encodeURIComponent(q));
                const data = await resp.json();
                if (data.length === 0) {
                    searchResults.innerHTML = '<p style="color:#718096;font-style:italic">Ingen treff for «' + escapeHtml(q) + '»</p>';
                } else {
                    searchResults.innerHTML = '<p style="color:#718096;font-size:0.9em">' + data.length + ' treff</p>'
                        + data.map(r => {
                            const name = r.file.replace('.md', '');
                            const snippet = r.snippet ? highlightSnippet(escapeHtml(r.snippet), q) : '';
                            return '<a href="/' + r.week + '/' + encodeURIComponent(r.file) + '" class="search-result" style="display:block;text-decoration:none">'
                                + '<div class="sr-title">' + escapeHtml(name) + '</div>'
                                + '<div class="sr-path">' + r.week + '/' + r.file + '</div>'
                                + (snippet ? '<div class="sr-snippet">' + snippet + '</div>' : '')
                                + '</a>';
                        }).join('');
                }
                weekList.style.display = 'none';
            } catch (e) {
                searchResults.innerHTML = '<p style="color:red">Søkefeil</p>';
            }
        }

        function escapeHtml(s) {
            return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        function highlightSnippet(escaped, q) {
            const re = new RegExp('(' + q.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$$&') + ')', 'gi');
            return escaped.replace(re, '<mark>$$1</mark>');
        }

        let pendingToggleEl = null;

        function showCommentModal(el) {
            pendingToggleEl = el;
            document.getElementById('commentTaskText').textContent = el.dataset.tasktext;
            document.getElementById('commentText').value = '';
            document.getElementById('commentModal').style.display = 'flex';
            setTimeout(() => document.getElementById('commentText').focus(), 100);
        }

        async function undoComplete(el) {
            const id = el.dataset.taskid;
            await fetch('/api/tasks/' + id + '/toggle', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            location.reload();
        }

        function cancelComment() {
            document.getElementById('commentModal').style.display = 'none';
            if (pendingToggleEl) pendingToggleEl.checked = false;
            pendingToggleEl = null;
        }

        async function submitComment(withComment) {
            const comment = withComment ? document.getElementById('commentText').value.trim() : '';
            const id = pendingToggleEl.dataset.taskid;
            document.getElementById('commentModal').style.display = 'none';
            pendingToggleEl = null;
            await fetch('/api/tasks/' + id + '/toggle', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment })
            });
            location.reload();
        }

        document.addEventListener('keydown', function(e) {
            if (document.getElementById('commentModal').style.display === 'flex') {
                if (e.key === 'Escape') cancelComment();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(true);
            }
            if (document.getElementById('noteModal').style.display === 'flex') {
                if (e.key === 'Escape') closeNoteModal();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote();
            }
            if (document.getElementById('addTaskModal').style.display === 'flex') {
                if (e.key === 'Escape') closeAddTaskModal();
                if (e.key === 'Enter') submitAddTask();
            }
            if (document.getElementById('summaryModal').style.display === 'flex') {
                if (e.key === 'Escape') closeSummary();
            }
            if (document.getElementById('noteViewModal') && document.getElementById('noteViewModal').style.display === 'flex') {
                if (e.key === 'Escape') closeNoteViewModal();
            }
            if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 't') {
                e.preventDefault();
                openAddTaskModal('${getCurrentYearWeek()}');
            }
        });
        function openNoteModal(id) {
            pendingNoteId = id;
            fetch('/api/tasks').then(r => r.json()).then(tasks => {
                const task = tasks.find(t => t.id === id);
                if (task) {
                    document.getElementById('noteTaskText').textContent = task.text;
                    document.getElementById('noteText').value = task.note || '';
                }
            });
            document.getElementById('noteModal').style.display = 'flex';
            setTimeout(() => document.getElementById('noteText').focus(), 150);
        }
        function closeNoteModal() {
            document.getElementById('noteModal').style.display = 'none';
            pendingNoteId = null;
        }
        async function saveNote() {
            if (!pendingNoteId) return;
            const note = document.getElementById('noteText').value.trim();
            await fetch('/api/tasks/' + pendingNoteId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note })
            });
            closeNoteModal();
            location.reload();
        }

        let addTaskWeek = null;
        function openAddTaskModal(week) {
            addTaskWeek = week;
            document.getElementById('addTaskWeekLabel').textContent = 'Uke ' + week;
            document.getElementById('addTaskInput').value = '';
            document.getElementById('addTaskModal').style.display = 'flex';
            setTimeout(() => document.getElementById('addTaskInput').focus(), 100);
        }
        function closeAddTaskModal() {
            document.getElementById('addTaskModal').style.display = 'none';
            addTaskWeek = null;
        }
        async function submitAddTask() {
            const text = document.getElementById('addTaskInput').value.trim();
            if (!text) return;
            await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, week: addTaskWeek })
            });
            closeAddTaskModal();
            location.reload();
        }
        let summaryMarkdown = '';
        const savedSummaries = ${JSON.stringify(savedSummaries).replace(/</g, '\\u003c')};

        function showSavedSummary(week) {
            const md = savedSummaries[week];
            if (!md) return;
            document.getElementById('summaryTitle').textContent = '📋 Oppsummering — Uke ' + week;
            document.getElementById('summaryContent').innerHTML = marked.parse(md);
            document.getElementById('summarySaveBtn').style.display = 'none';
            document.getElementById('summaryModal').style.display = 'flex';
        }

        async function summarizeWeek(week) {
            const btn = document.getElementById('sum-' + week);
            btn.disabled = true;
            btn.textContent = '⏳ Oppsummerer...';
            try {
                const resp = await fetch('/api/summarize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ week })
                });
                const data = await resp.json();
                if (resp.ok) {
                    btn.textContent = '✨ Oppsummer';
                    btn.disabled = false;
                    summaryWeek = week;
                    summaryMarkdown = data.summary;
                    document.getElementById('summaryTitle').textContent = '✨ Oppsummering — Uke ' + week;
                    document.getElementById('summaryContent').innerHTML = marked.parse(data.summary);
                    document.getElementById('summarySaveBtn').style.display = '';
                    document.getElementById('summaryModal').style.display = 'flex';
                } else {
                    btn.textContent = '❌ Feil';
                    alert(data.error || 'Noe gikk galt');
                    setTimeout(() => { btn.textContent = '✨ Oppsummer'; btn.disabled = false; }, 2000);
                }
            } catch (e) {
                btn.textContent = '❌ Feil';
                setTimeout(() => { btn.textContent = '✨ Oppsummer'; btn.disabled = false; }, 2000);
            }
        }

        function closeSummary() {
            document.getElementById('summaryModal').style.display = 'none';
        }

        function openPresentation(week, fileEnc) {
            const url = '/present/' + week + '/' + fileEnc + '?fs=1';
            const w = window.screen.availWidth;
            const h = window.screen.availHeight;
            const features = 'popup=yes,noopener=no,width=' + w + ',height=' + h + ',left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes';
            const win = window.open(url, 'presentation_' + Date.now(), features);
            if (win) win.focus();
        }

        async function deleteNoteFromHome(week, fileEnc, name) {
            if (!confirm('Slette notatet "' + name + '"?\\n\\nDette kan ikke angres.')) return;
            try {
                const resp = await fetch('/api/notes/' + week + '/' + fileEnc, { method: 'DELETE' });
                if (resp.ok) {
                    const card = document.querySelector('[data-note-card="' + week + '/' + fileEnc + '"]');
                    if (card) card.remove();
                } else {
                    alert('Kunne ikke slette notatet.');
                }
            } catch (e) {
                alert('Nettverksfeil: ' + e.message);
            }
        }

        async function openNoteViewModal(week, fileEnc) {
            const file = decodeURIComponent(fileEnc);
            const modal = document.getElementById('noteViewModal');
            const titleEl = document.getElementById('noteViewTitle');
            const contentEl = document.getElementById('noteViewContent');
            const editLink = document.getElementById('noteViewEditLink');
            titleEl.textContent = '📄 ' + file.replace(/\.md$/, '');
            contentEl.innerHTML = '<p style="color:#a99a78;font-style:italic">Laster…</p>';
            editLink.href = '/editor/' + week + '/' + fileEnc;
            modal.style.display = 'flex';
            try {
                const resp = await fetch('/api/notes/' + week + '/' + fileEnc + '/render');
                const data = await resp.json();
                if (data.ok) {
                    contentEl.innerHTML = data.html;
                } else {
                    contentEl.innerHTML = '<p style="color:#c53030">Kunne ikke laste notatet.</p>';
                }
            } catch (e) {
                contentEl.innerHTML = '<p style="color:#c53030">Feil ved lasting: ' + e.message + '</p>';
            }
        }

        function closeNoteViewModal() {
            document.getElementById('noteViewModal').style.display = 'none';
        }

        async function saveSummary() {
            const resp = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: summaryWeek, file: 'summarize.md', content: summaryMarkdown })
            });
            if (resp.ok) {
                document.getElementById('summarySaveBtn').textContent = '✅ Lagret!';
                document.getElementById('summarySaveBtn').disabled = true;
                setTimeout(() => { closeSummary(); location.reload(); }, 1000);
            }
        }
        </script>
        <script src="/mention-autocomplete.js"></script>
        <script>
        (function() {
            const origOpen = window.openAddTaskModal;
            window.openAddTaskModal = function(week) {
                origOpen(week);
                setTimeout(() => initMentionAutocomplete(document.getElementById('addTaskInput')), 120);
            };
        })();
        (function() {
            const orig = window.showCommentModal;
            window.showCommentModal = function(el) { orig(el); setTimeout(() => initMentionAutocomplete(document.getElementById('commentText')), 120); };
        })();
        (function() {
            const orig = window.openNoteModal;
            window.openNoteModal = function(id) { orig(id); setTimeout(() => initMentionAutocomplete(document.getElementById('noteText')), 120); };
        })();
        document.addEventListener('click', function(e) {
            const card = e.target.closest('.sidebar-meeting');
            if (!card) return;
            if (e.target.closest('a, button')) return;
            const href = card.getAttribute('data-cal-href');
            if (href) window.location.href = href;
        });
        </script>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Ukenotater', body));
        return;
    }

    // Results page
    if (pathname === '/results') {
        const results = loadResults().sort((a, b) => b.created.localeCompare(a.created));
        const people = loadPeople();

        const byWeek = {};
        results.forEach(r => {
            if (!byWeek[r.week]) byWeek[r.week] = [];
            byWeek[r.week].push(r);
        });
        const weeks = Object.keys(byWeek).sort((a, b) => b.localeCompare(a));

        let body = '<h1>⚖️ Resultater</h1>';

        if (results.length === 0) {
            body += '<p style="color:#718096;font-style:italic">Ingen resultater ennå. Skriv <code>[beslutning]</code> i et oppgavenotat for å opprette et resultat.</p>';
        } else {
            weeks.forEach(week => {
                body += `<div style="margin-bottom:32px">`;
                body += `<h2 style="color:#1a365d;font-size:1em;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e8e2d2">Uke ${week}</h2>`;
                byWeek[week].forEach(r => {
                    const linkedPeople = (r.people || []).map(name => {
                        const p = people.find(p => p.name === name || p.key === name.toLowerCase());
                        const display = p ? (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name) : name;
                        return `<a href="/people" style="color:#2b6cb0;text-decoration:none;background:#ebf8ff;border-radius:4px;padding:1px 6px;font-size:0.8em">${escapeHtml(display)}</a>`;
                    }).join(' ');
                    const rJson = JSON.stringify(r).replace(/'/g, '&#39;');

                    body += `<div style="background:white;border:1px solid #e8e2d2;border-left:4px solid #2b6cb0;border-radius:8px;padding:14px 18px;margin-bottom:10px">`;
                    body += `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">`;
                    body += `<span style="flex:1;font-size:1em;color:#1a202c">⚖️ ${linkMentions(escapeHtml(r.text))}</span>`;
                    body += `<button onclick='openEditResult(${rJson})' title="Rediger" style="background:none;border:none;cursor:pointer;font-size:1em;color:#718096;padding:2px 6px;border-radius:4px" onmouseover="this.style.background='#f5efe1'" onmouseout="this.style.background='none'">✏️</button>`;
                    body += `<button onclick="deleteResult('${r.id}')" title="Slett" style="background:none;border:none;cursor:pointer;font-size:1em;color:#e53e3e;padding:2px 6px;border-radius:4px" onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='none'">✕</button>`;
                    body += `</div>`;
                    body += `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:0.82em;color:#718096">`;
                    if (r.taskText) body += `<span>📌 <a href="/tasks" style="color:#4a5568;text-decoration:none">${escapeHtml(r.taskText)}</a></span>`;
                    if (linkedPeople) body += `<span>${linkedPeople}</span>`;
                    body += `<span style="margin-left:auto">${r.created.slice(0, 10)}</span>`;
                    body += `</div></div>`;
                });
                body += `</div>`;
            });
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Resultater', body + `
<div id="editResultModal" class="page-modal" onclick="if(event.target===this)closeEditResult()">
  <div class="page-modal-card" style="max-width:560px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="margin:0">✏️ Rediger resultat</h3>
      <button onclick="closeEditResult()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:#718096">✕</button>
    </div>
    <input type="hidden" id="editResultId" />
    <div style="display:flex;flex-direction:column;gap:12px">
      <label style="font-size:0.85em;font-weight:600;color:#4a5568">Resultat
        <textarea id="editResultText" rows="3" style="display:block;margin-top:4px"></textarea>
      </label>
    </div>
    <div class="page-modal-actions" style="margin-top:20px">
      <button class="page-modal-btn cancel" onclick="closeEditResult()">Avbryt</button>
      <button class="page-modal-btn blue" style="padding:8px 20px" onclick="saveEditResult()">💾 Lagre</button>
    </div>
  </div>
</div>
<script>
function openEditResult(r) {
    document.getElementById('editResultId').value = r.id;
    document.getElementById('editResultText').value = r.text;
    const modal = document.getElementById('editResultModal');
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('editResultText').focus(), 50);
}
function closeEditResult() {
    document.getElementById('editResultModal').style.display = 'none';
}
function saveEditResult() {
    const id = document.getElementById('editResultId').value;
    const text = document.getElementById('editResultText').value.trim();
    if (!text) return;
    fetch('/api/results/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); });
}
function deleteResult(id) {
    if (!confirm('Slett dette resultatet?')) return;
    fetch('/api/results/' + id, { method: 'DELETE' })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); });
}
document.addEventListener('keydown', function(e) {
    if (document.getElementById('editResultModal').style.display === 'flex') {
        if (e.key === 'Escape') closeEditResult();
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') saveEditResult();
    }
});
</script>`));
        return;
    }

    // People page
    if (pathname === '/settings') {
        const active = getActiveContext();
        const all = listContexts().map(id => {
            const dir = path.join(CONTEXTS_DIR, id);
            return {
                id,
                settings: getContextSettings(id),
                active: id === active,
                git: { isRepo: gitIsRepo(dir), dirty: gitIsDirty(dir), last: gitLastCommit(dir) }
            };
        });
        const cur = all.find(c => c.active) || all[0];
        const formatGitStatus = (c) => {
            if (!c.git.isRepo) return '<span class="git-row"><span class="git-dot off"></span>Ikke et git-repo</span>';
            const parts = [];
            if (c.git.dirty) {
                parts.push('<span class="git-pill dirty" title="Uforpliktede endringer">● Endringer</span>');
            } else {
                parts.push('<span class="git-pill clean" title="Arbeidstreet er rent">✓ Rent</span>');
            }
            if (c.settings.remote) {
                parts.push(`<span class="git-pill remote" title="${escapeHtml(c.settings.remote)}">🌐 origin</span>`);
                parts.push(`<button type="button" class="btn-push" data-push="${escapeHtml(c.id)}" title="git push origin HEAD">⬆️ Push</button>`);
            } else {
                parts.push('<span class="git-pill no-remote">⊘ ingen remote</span>');
            }
            if (c.git.last) {
                const when = c.git.last.date ? new Date(c.git.last.date).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : '';
                parts.push(`<span class="git-last" title="${escapeHtml(c.git.last.subject || '')}"><code>${escapeHtml(c.git.last.hash)}</code> ${escapeHtml(c.git.last.subject || '')}${when ? ` <span class="git-when">· ${escapeHtml(when)}</span>` : ''}</span>`);
            } else {
                parts.push('<span class="git-last muted">Ingen commits ennå</span>');
            }
            return `<div class="git-row">${parts.join('')}</div>`;
        };
        const railItem = (c) => `
            <button type="button" class="ctx-rail-item${c.active ? ' is-active' : ''}${c.id === cur.id ? ' selected' : ''}" data-target="${escapeHtml(c.id)}">
                <span class="ctx-rail-icon">${escapeHtml(c.settings.icon || '📁')}</span>
                <span class="ctx-rail-text">
                    <span class="ctx-rail-name">${escapeHtml(c.settings.name || c.id)}</span>
                    <span class="ctx-rail-id">${escapeHtml(c.id)}</span>
                </span>
                ${c.active ? '<span class="ctx-rail-badge">●</span>' : ''}
            </button>`;
        const detailPane = (c) => `
            <div class="ctx-detail${c.id === cur.id ? ' visible' : ''}" data-detail="${escapeHtml(c.id)}">
                <div class="ctx-detail-head">
                    <span class="ctx-icon-lg">${escapeHtml(c.settings.icon || '📁')}</span>
                    <div style="flex:1;min-width:0">
                        <h2 style="margin:0">${escapeHtml(c.settings.name || c.id)}</h2>
                        <div class="ctx-id">${escapeHtml(c.id)}</div>
                    </div>
                    ${c.active
                        ? '<span class="ctx-active-badge">Aktiv kontekst</span>'
                        : `<button type="button" class="btn-primary" data-switch="${escapeHtml(c.id)}">Bytt til</button>`}
                </div>
                ${c.settings.description ? `<div class="ctx-desc">${escapeHtml(c.settings.description)}</div>` : ''}
                <div class="ctx-detail-section">
                    <h3>📦 Status</h3>
                    ${formatGitStatus(c)}
                </div>
                <form class="ctx-edit-form" data-form="${escapeHtml(c.id)}">
                    <div class="ctx-detail-section">
                        <h3>📝 Generelt</h3>
                        <div class="ctx-form-grid">
                            <label>Navn<input type="text" name="name" value="${escapeHtml(c.settings.name || '')}" required></label>
                            <label>Ikon${iconPickerHtml('icon', c.settings.icon || '📁', 'pick-' + c.id)}</label>
                        </div>
                        <label>Beskrivelse<textarea name="description" rows="2">${escapeHtml(c.settings.description || '')}</textarea></label>
                        <label>Git-remote (origin)<input type="text" name="remote" value="${escapeHtml(c.settings.remote || '')}" placeholder="git@github.com:bruker/repo.git" spellcheck="false"></label>
                        <label>Standard møtelengde (minutter)<input type="number" name="defaultMeetingMinutes" value="${escapeHtml(String(c.settings.defaultMeetingMinutes || 60))}" min="5" max="600" step="5"></label>
                        <fieldset class="workhours-block">
                            <legend>Arbeidstid pr. dag</legend>
                            ${(function(){
                                const labels = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'];
                                const wh = getWorkHours(c.id).hours;
                                const hourOpts = (sel) => Array.from({length:24},(_,h)=>{const v=String(h).padStart(2,'0');return `<option value="${v}"${sel===v?' selected':''}>${v}</option>`;}).join('');
                                const minOpts = (sel) => Array.from({length:12},(_,k)=>{const v=String(k*5).padStart(2,'0');return `<option value="${v}"${sel===v?' selected':''}>${v}</option>`;}).join('');
                                return labels.map((lbl, i) => {
                                    const day = wh[i];
                                    const on = !!day;
                                    const sH = on ? day.start.slice(0,2) : '08';
                                    const sM = on ? day.start.slice(3,5) : '00';
                                    const eH = on ? day.end.slice(0,2) : '16';
                                    const eM = on ? day.end.slice(3,5) : '00';
                                    return `<div class="wh-row${on?' on':''}">
                                        <label class="wh-on"><input type="checkbox" name="wh-on-${i}"${on?' checked':''}> ${lbl}</label>
                                        <span class="time-pick"><select name="wh-sH-${i}" class="t-h">${hourOpts(sH)}</select><span class="t-sep">:</span><select name="wh-sM-${i}" class="t-m">${minOpts(sM)}</select></span>
                                        <span class="wh-dash">–</span>
                                        <span class="time-pick"><select name="wh-eH-${i}" class="t-h">${hourOpts(eH)}</select><span class="t-sep">:</span><select name="wh-eM-${i}" class="t-m">${minOpts(eM)}</select></span>
                                    </div>`;
                                }).join('');
                            })()}
                        </fieldset>
                    </div>
                    <div class="ctx-detail-section" data-mt="${escapeHtml(c.id)}">
                        <h3>🗓️ Møtetyper</h3>
                        <p class="section-hint">Definerer kategorier for møter i kalenderen i denne konteksten.</p>
                        <div class="mt-list" data-mt-list="${escapeHtml(c.id)}"></div>
                        <button type="button" class="btn-cancel mt-add" data-mt-add="${escapeHtml(c.id)}" style="margin-top:8px">+ Ny type</button>
                        <script type="application/json" data-mt-init="${escapeHtml(c.id)}">${JSON.stringify(loadMeetingTypes(c.id)).replace(/</g, '\\u003c')}</script>
                    </div>
                    <div class="ctx-detail-actions">
                        <button type="submit" class="btn-primary">💾 Lagre endringer</button>
                        <span class="settings-status" data-status="${escapeHtml(c.id)}"></span>
                    </div>
                </form>
            </div>`;
        const newPane = `
            <div class="ctx-detail" data-detail="__new">
                <div class="ctx-detail-head">
                    <span class="ctx-icon-lg">➕</span>
                    <div style="flex:1"><h2 style="margin:0">Ny kontekst</h2><div class="ctx-id">Opprett en ny isolert arbeidsmiljø</div></div>
                </div>
                <form id="newCtxForm" class="ctx-edit-form">
                    <div class="ctx-detail-section">
                        <div class="ctx-form-grid">
                            <label>Navn<input type="text" id="newName" placeholder="f.eks. Privat" required></label>
                            <label>Ikon${iconPickerHtml('icon', '📁', 'pick-new', 'newIcon')}</label>
                        </div>
                        <label>Beskrivelse<textarea id="newDescription" rows="2"></textarea></label>
                        <label>Git-remote (valgfritt)<input type="text" id="newRemote" placeholder="git@github.com:bruker/repo.git" spellcheck="false"></label>
                    </div>
                    <div class="ctx-detail-actions">
                        <button type="submit" class="btn-primary">➕ Opprett</button>
                        <span id="newCtxStatus" class="settings-status"></span>
                    </div>
                </form>
            </div>`;
        const emptyBanner = all.length === 0
            ? `<div style="background:#fff7e0;border:1px solid #f0d589;color:#8a5a00;padding:14px 16px;border-radius:8px;margin:16px 0">👋 Ingen kontekster ennå. Klikk «Ny kontekst» til venstre for å komme i gang.</div>`
            : '';
        const body = `
            <h1>⚙️ Kontekster</h1>
            <p style="color:#718096;margin-bottom:18px">Hver kontekst har sine egne notater, oppgaver, personer, møter og resultater. Data er fullstendig isolert mellom kontekster.</p>
            ${emptyBanner}
            <div class="ctx-page">
                <aside class="ctx-rail">
                    ${all.map(railItem).join('')}
                    <button type="button" class="ctx-rail-item ctx-rail-new" data-target="__new">
                        <span class="ctx-rail-icon">➕</span>
                        <span class="ctx-rail-text"><span class="ctx-rail-name">Ny kontekst</span><span class="ctx-rail-id">opprett ny</span></span>
                    </button>
                </aside>
                <section class="ctx-pane">
                    ${all.map(detailPane).join('')}
                    ${newPane}
                </section>
            </div>

            <style>
                body:has(.ctx-page) { max-width: none; }
                .ctx-page { display: grid; grid-template-columns: 260px 1fr; gap: 24px; align-items: start; }
                @media (max-width: 760px) { .ctx-page { grid-template-columns: 1fr; } }
                .ctx-rail { display: flex; flex-direction: column; gap: 4px; padding: 6px; background: #fffdf7; border: 1px solid #d6cdb6; border-radius: 8px; position: sticky; top: 16px; }
                .ctx-rail-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: none; border: 1px solid transparent; border-radius: 6px; cursor: pointer; font-family: inherit; text-align: left; color: #1a365d; }
                .ctx-rail-item:hover { background: #f8f3e2; }
                .ctx-rail-item.selected { background: #ebf2fa; border-color: #b9c8e0; }
                .ctx-rail-item.is-active.selected { background: #e6efff; border-color: #1a365d; }
                .ctx-rail-icon { font-size: 1.4em; flex-shrink: 0; }
                .ctx-rail-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
                .ctx-rail-name { font-weight: 600; font-size: 0.95em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .ctx-rail-id { font-family: ui-monospace, monospace; font-size: 0.72em; color: #a99a78; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .ctx-rail-badge { color: #1a365d; font-size: 1.2em; line-height: 1; }
                .ctx-rail-new { border-top: 1px dashed #d6cdb6; border-radius: 0; margin-top: 6px; padding-top: 12px; color: #4a5568; }
                .ctx-rail-new .ctx-rail-name { color: #4a5568; }

                .ctx-pane { min-width: 0; }
                .ctx-detail { display: none; background: #fffdf7; border: 1px solid #d6cdb6; border-radius: 8px; padding: 22px 26px; }
                .ctx-detail.visible { display: block; }
                .ctx-detail-head { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #ebe2cb; }
                .ctx-detail-head .ctx-id { color: #a99a78; font-family: ui-monospace, monospace; font-size: 0.8em; margin-top: 2px; }
                .ctx-detail-section { margin-bottom: 22px; }
                .ctx-detail-section:last-child { margin-bottom: 0; }
                .ctx-detail-section h3 { margin: 0 0 10px; font-size: 0.95em; color: #1a365d; font-weight: 600; }
                .ctx-detail-section .section-hint { margin: -6px 0 10px; font-size: 0.85em; color: #7a6f4d; }
                .ctx-detail-actions { display: flex; align-items: center; gap: 12px; padding-top: 14px; border-top: 1px solid #ebe2cb; }
                .ctx-form-grid { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; }
                .workhours-block { border:1px solid #ebe2cb; border-radius:6px; padding:8px 14px 12px; margin-top:6px; background:#fffdf7; }
                .workhours-block legend { font-size:0.85em; color:#7a6f4d; padding:0 6px; }
                .wh-row { display:flex; align-items:center; gap:10px; padding:4px 0; }
                .wh-row .wh-on { display:flex; align-items:center; gap:6px; min-width:120px; font-weight:normal; color:#3c3a30; cursor:pointer; }
                .wh-row .wh-on input { margin:0; }
                .wh-row:not(.on) .time-pick, .wh-row:not(.on) .wh-dash { opacity:0.4; }
                .wh-dash { color:#7a6f4d; }
                .ctx-active-badge { background: #1a365d; color: #fffdf7; font-size: 0.75em; padding: 4px 10px; border-radius: 10px; font-weight: 600; white-space: nowrap; }
                .ctx-icon-lg { font-size: 2em; line-height: 1; }
                .ctx-desc { margin-bottom: 16px; padding: 10px 14px; background: #f8f3e2; border-left: 3px solid #d6cdb6; border-radius: 4px; color: #4a5568; font-size: 0.9em; font-style: italic; }
                .ctx-edit-form label { display: block; font-size: 0.8em; color: #4a5568; font-weight: 600; margin-bottom: 12px; }
                .ctx-edit-form input[type=text], .ctx-edit-form textarea { width: 100%; box-sizing: border-box; padding: 7px 10px; border: 1px solid #d6cdb6; border-radius: 4px; font-family: inherit; font-size: 0.93em; margin-top: 4px; background: #fbf9f4; color: #1a202c; }
                .ctx-edit-form .icon-input { width: 70px; font-size: 1.4em; text-align: center; }

                .git-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 0.85em; color: #4a5568; }
                .git-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-weight: 600; font-size: 0.95em; border: 1px solid transparent; }
                .git-pill.clean { background: #e6f4ea; color: #1e6b3a; border-color: #b6dec0; }
                .git-pill.dirty { background: #fef0c7; color: #8a5a00; border-color: #f0d589; }
                .git-pill.remote { background: #e6efff; color: #1a365d; border-color: #b9c8e0; }
                .git-pill.no-remote { background: #f3eddc; color: #8a7a4a; border-color: #d6cdb6; }
                .btn-push { background: #1a365d; color: #fffdf7; border: none; padding: 2px 10px; border-radius: 10px; cursor: pointer; font-family: inherit; font-size: 0.78em; font-weight: 600; }
                .btn-push:hover:not(:disabled) { background: #102542; }
                .btn-push:disabled { opacity: 0.6; cursor: wait; }
                .git-last { color: #4a5568; }
                .git-last.muted { color: #a99a78; font-style: italic; }
                .git-last code { background: #f0e8d4; padding: 1px 5px; border-radius: 3px; font-size: 0.95em; color: #1a365d; }
                .git-when { color: #a99a78; font-weight: 400; }
                .git-dot.off { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #c8b88f; margin-right: 4px; }

                .mt-list { display: flex; flex-direction: column; gap: 6px; }
                .mt-row { display: flex; align-items: center; gap: 8px; }
                .mt-row .mt-icon { width: 38px; height: 38px; font-size: 1.3em; cursor: pointer; background: #fbf9f4; border: 1px solid #d6cdb6; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }
                .mt-row .mt-icon:hover { background: #f0e8d4; }
                .mt-row input[type=text] { flex: 1; padding: 7px 10px; margin: 0; }
                .mt-row .mt-del { background: #fff5f5; color: #c53030; border: 1px solid #fed7d7; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 0.85em; }
                .mt-row .mt-del:hover { background: #fed7d7; }
                .mt-icon-picker { display: none; position: fixed; inset: 0; background: rgba(26,32,44,0.55); z-index: 1100; align-items: center; justify-content: center; }
                .mt-icon-picker.open { display: flex; }
                .mt-icon-picker-card { background: #fffdf7; border: 1px solid #d6cdb6; border-radius: 8px; padding: 16px 20px; }
                .mt-icon-picker-card h4 { margin: 0 0 10px; }
                .mt-icon-grid { display: grid; grid-template-columns: repeat(8, 42px); gap: 6px; max-height: 70vh; overflow-y: auto; }
                .mt-icon-grid button { width: 42px; height: 42px; font-size: 1.5em; background: #fbf9f4; border: 1px solid #ebe2cb; border-radius: 4px; cursor: pointer; padding: 0; line-height: 1; }
                .mt-icon-grid button:hover { background: #f0e8d4; border-color: #1a365d; }
                .mt-icon-grid .mt-grp-label { grid-column: 1 / -1; font-size: 0.72em; font-weight: 600; color: #7a6f4d; text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 2px 2px; border-bottom: 1px solid #ebe2cb; }
                .mt-icon-grid .mt-grp-label:first-child { padding-top: 0; }

                .btn-primary { background: #1a365d; color: #fffdf7; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 0.95em; font-weight: 600; }
                .btn-primary:hover { background: #102542; }
                .btn-cancel { background: none; border: 1px solid #d6cdb6; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-family: inherit; color: #7a6f4d; font-size: 0.9em; }
                .btn-cancel:hover { background: #f0e8d4; }
                .settings-status { font-size: 0.85em; color: #2f855a; }

                .icon-picker { position: relative; display: inline-block; margin-top: 4px; }
                .icon-trigger { display: inline-flex; align-items: center; gap: 8px; background: #fbf9f4; border: 1px solid #d6cdb6; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-family: inherit; }
                .icon-trigger:hover { background: #f0e8d4; }
                .icon-current { font-size: 1.5em; line-height: 1; }
                .icon-caret { font-size: 0.75em; color: #7a6f4d; }
                .icon-grid { display: none; position: absolute; top: calc(100% + 6px); right: 0; background: #fffdf7; border: 1px solid #d6cdb6; border-radius: 6px; box-shadow: 0 8px 24px rgba(26,54,93,0.12); padding: 6px; z-index: 1000; grid-template-columns: repeat(5, 1fr); gap: 4px; width: 220px; }
                .icon-picker.open .icon-grid { display: grid; }
                .icon-option { background: none; border: 1px solid transparent; border-radius: 4px; padding: 4px; font-size: 1.4em; line-height: 1; cursor: pointer; }
                .icon-option:hover { background: #f0e8d4; }
                .icon-option.selected { background: #ebf2fa; border-color: #1a365d; }
            </style>

            <div id="mtIconPicker" class="mt-icon-picker" onclick="if(event.target===this)this.classList.remove('open')">
                <div class="mt-icon-picker-card">
                    <h4>Velg ikon</h4>
                    <div id="mtIconGrid" class="mt-icon-grid"></div>
                </div>
            </div>

            <script>
                document.querySelectorAll('.ctx-rail-item').forEach(b => b.addEventListener('click', () => {
                    const target = b.getAttribute('data-target');
                    document.querySelectorAll('.ctx-rail-item.selected').forEach(x => x.classList.remove('selected'));
                    b.classList.add('selected');
                    document.querySelectorAll('.ctx-detail').forEach(d => d.classList.toggle('visible', d.getAttribute('data-detail') === target));
                }));
                document.querySelectorAll('.icon-picker').forEach(picker => {
                    const trigger = picker.querySelector('[data-icon-trigger]');
                    const hidden = picker.querySelector('input[type="hidden"]');
                    const currentSpan = picker.querySelector('.icon-current');
                    trigger.addEventListener('click', e => {
                        e.stopPropagation();
                        document.querySelectorAll('.icon-picker.open').forEach(p => { if (p !== picker) p.classList.remove('open'); });
                        picker.classList.toggle('open');
                    });
                    picker.querySelectorAll('.icon-option').forEach(btn => btn.addEventListener('click', () => {
                        const ic = btn.getAttribute('data-icon');
                        hidden.value = ic;
                        currentSpan.textContent = ic;
                        picker.querySelectorAll('.icon-option.selected').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        picker.classList.remove('open');
                    }));
                });
                document.addEventListener('click', e => {
                    document.querySelectorAll('.icon-picker.open').forEach(p => { if (!p.contains(e.target)) p.classList.remove('open'); });
                });
                document.querySelectorAll('[data-push]').forEach(b => b.addEventListener('click', () => {
                    const id = b.getAttribute('data-push');
                    const orig = b.textContent;
                    b.disabled = true;
                    b.textContent = '⏳ Pusher...';
                    fetch('/api/contexts/' + encodeURIComponent(id) + '/push', { method: 'POST' })
                        .then(r => r.json()).then(d => {
                            if (d.ok) {
                                b.textContent = '✓ Pushed';
                                setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1800);
                            } else {
                                b.textContent = '✗ Feilet';
                                alert('Push feilet:\\n\\n' + (d.error || 'Ukjent feil'));
                                setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1800);
                            }
                        }).catch(err => {
                            b.textContent = '✗ Feilet';
                            alert('Push feilet: ' + err);
                            setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1800);
                        });
                }));
                document.querySelectorAll('[data-switch]').forEach(b => b.addEventListener('click', () => {
                    const id = b.getAttribute('data-switch');
                    fetch('/api/contexts/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
                        .then(r => r.json()).then(d => { if (d.ok) location.reload(); else alert(d.error); });
                }));
                document.querySelectorAll('form[data-form]').forEach(form => form.addEventListener('submit', e => {
                    e.preventDefault();
                    const id = form.getAttribute('data-form');
                    const fd = new FormData(form);
                    const data = {
                        name: fd.get('name'),
                        icon: fd.get('icon') || '📁',
                        description: fd.get('description'),
                        remote: fd.get('remote') || '',
                        defaultMeetingMinutes: parseInt(fd.get('defaultMeetingMinutes'), 10) || 60,
                        workHours: Array.from({length:7},(_,i)=>{
                            if(!fd.get('wh-on-'+i)) return null;
                            const sH = fd.get('wh-sH-'+i)||'08';
                            const sM = fd.get('wh-sM-'+i)||'00';
                            const eH = fd.get('wh-eH-'+i)||'16';
                            const eM = fd.get('wh-eM-'+i)||'00';
                            return { start: sH+':'+sM, end: eH+':'+eM };
                        })
                    };
                    const status = document.querySelector('[data-status="' + id + '"]');
                    const types = (window.__mtState && window.__mtState[id]) || null;
                    const settingsP = fetch('/api/contexts/' + encodeURIComponent(id) + '/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
                    const typesP = types
                        ? fetch('/api/contexts/' + encodeURIComponent(id) + '/meeting-types', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(types) }).then(r => r.json())
                        : Promise.resolve({ ok: true });
                    Promise.all([settingsP, typesP]).then(([s, t]) => {
                        if (s.ok && t.ok) { status.textContent = '✓ Lagret'; setTimeout(() => location.reload(), 600); }
                        else { status.textContent = '✗ ' + (s.error || t.error); status.style.color = '#c53030'; }
                    });
                }));
                document.querySelectorAll('.wh-row .wh-on input').forEach(cb => {
                    cb.addEventListener('change', () => {
                        cb.closest('.wh-row').classList.toggle('on', cb.checked);
                    });
                });
                (function() {
                    const ICON_GROUPS = [
                        { label: 'Personer', icons: ['👥','🤝','👋','🙌','👀','🗣️','💬','🗨️'] },
                        { label: 'Kommunikasjon', icons: ['📞','☎️','📱','📧','📨','📤','📥','🔔'] },
                        { label: 'Dokumenter', icons: ['📋','📝','✏️','📎','📌','📍','📅','🗓️'] },
                        { label: 'Planlegging', icons: ['📊','📈','📉','🎯','🧠','💡','🔍','⚖️'] },
                        { label: 'Arbeid', icons: ['🖥️','💻','🛠️','🔧','⚙️','🧪','🔬','🚀'] },
                        { label: 'Tid & status', icons: ['⏰','⏳','⌛','🟢','🟡','🔴','🔵','⚡'] },
                        { label: 'Feiring', icons: ['🎉','🎊','🎁','🎈','🍰','🏆','🎖️','🥇'] },
                        { label: 'Media & læring', icons: ['🎬','📷','📹','🎤','🎵','🎓','📚','☕'] },
                        { label: 'Mat & drikke', icons: ['🍕','🍔','🍱','🍷','🍺','🥂','🍻','🥗'] },
                        { label: 'Sport', icons: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','⛳','🏌️','🏓','🏸','🥊','🏃','🚴','🏊','🧗'] },
                        { label: 'Annet', icons: ['✅','❌','❓','❗','⚠️','⭐','🌟','✨'] }
                    ];
                    window.__mtState = {};
                    let pickerCtx = null, pickerIdx = null;
                    function slugKey(label) {
                        const base = (label || 'type').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
                        return base + '-' + Math.random().toString(36).slice(2, 6);
                    }
                    function renderList(ctxId) {
                        const list = document.querySelector('[data-mt-list="' + ctxId + '"]');
                        const types = window.__mtState[ctxId];
                        list.innerHTML = '';
                        types.forEach((t, i) => {
                            const row = document.createElement('div');
                            row.className = 'mt-row';
                            row.innerHTML = '<button type="button" class="mt-icon" data-i="' + i + '" title="Velg ikon">' + (t.icon || '·') + '</button>'
                                + '<input type="text" data-i="' + i + '" value="' + (t.label || '').replace(/"/g, '&quot;') + '" placeholder="Navn">'
                                + '<button type="button" class="mt-del" data-i="' + i + '" title="Slett">🗑️</button>';
                            list.appendChild(row);
                        });
                        list.querySelectorAll('.mt-icon').forEach(b => b.onclick = () => openPicker(ctxId, parseInt(b.dataset.i, 10)));
                        list.querySelectorAll('input[type=text]').forEach(inp => inp.oninput = () => { types[parseInt(inp.dataset.i, 10)].label = inp.value; });
                        list.querySelectorAll('.mt-del').forEach(b => b.onclick = () => { types.splice(parseInt(b.dataset.i, 10), 1); renderList(ctxId); });
                    }
                    function openPicker(ctxId, idx) {
                        pickerCtx = ctxId; pickerIdx = idx;
                        document.getElementById('mtIconPicker').classList.add('open');
                    }
                    function renderPickerGrid() {
                        const grid = document.getElementById('mtIconGrid');
                        grid.innerHTML = '';
                        ICON_GROUPS.forEach(grp => {
                            const h = document.createElement('div');
                            h.className = 'mt-grp-label';
                            h.textContent = grp.label;
                            grid.appendChild(h);
                            grp.icons.forEach(ic => {
                                const b = document.createElement('button');
                                b.type = 'button';
                                b.textContent = ic;
                                b.onclick = () => {
                                    if (pickerCtx != null && window.__mtState[pickerCtx] && window.__mtState[pickerCtx][pickerIdx]) {
                                        window.__mtState[pickerCtx][pickerIdx].icon = ic;
                                        renderList(pickerCtx);
                                    }
                                    document.getElementById('mtIconPicker').classList.remove('open');
                                };
                                grid.appendChild(b);
                            });
                        });
                    }
                    document.querySelectorAll('[data-mt-init]').forEach(s => {
                        const ctxId = s.getAttribute('data-mt-init');
                        try { window.__mtState[ctxId] = JSON.parse(s.textContent); }
                        catch { window.__mtState[ctxId] = []; }
                        renderList(ctxId);
                    });
                    document.querySelectorAll('[data-mt-add]').forEach(b => b.onclick = () => {
                        const ctxId = b.getAttribute('data-mt-add');
                        window.__mtState[ctxId].push({ key: slugKey('ny'), icon: '👥', label: 'Ny type' });
                        renderList(ctxId);
                    });
                    renderPickerGrid();
                    document.addEventListener('keydown', e => {
                        if (e.key === 'Escape') document.getElementById('mtIconPicker').classList.remove('open');
                    });
                })();
                document.getElementById('newCtxForm').addEventListener('submit', e => {
                    e.preventDefault();
                    const data = {
                        name: document.getElementById('newName').value,
                        icon: document.getElementById('newIcon').value || '📁',
                        description: document.getElementById('newDescription').value,
                        remote: document.getElementById('newRemote').value
                    };
                    fetch('/api/contexts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
                        .then(r => r.json()).then(d => {
                            const s = document.getElementById('newCtxStatus');
                            if (d.ok) { s.textContent = '✓ Opprettet'; setTimeout(() => location.reload(), 600); }
                            else { s.textContent = '✗ ' + d.error; s.style.color = '#c53030'; }
                        });
                });
            </script>
        `;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Innstillinger', body));
        return;
    }

    // Open or create a meeting note linked to a meeting id
    const meetingNoteMatch = pathname.match(/^\/meeting-note\/([A-Za-z0-9_]+)$/);
    if (meetingNoteMatch) {
        const mid = meetingNoteMatch[1];
        const meetings = loadMeetings();
        const m = meetings.find(x => x.id === mid);
        if (!m) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Møte ikke funnet');
            return;
        }
        // Search existing notes meta for one already linked to this meeting
        const meta = loadNotesMeta();
        for (const key of Object.keys(meta)) {
            if (meta[key] && meta[key].meetingId === mid) {
                const slash = key.indexOf('/');
                if (slash > 0) {
                    const w = key.slice(0, slash);
                    const f = key.slice(slash + 1);
                    if (fs.existsSync(path.join(dataDir(), w, f))) {
                        res.writeHead(302, { Location: `/editor/${w}/${encodeURIComponent(f)}` });
                        res.end();
                        return;
                    }
                }
            }
        }
        // Compute week folder (YYYY-N format used by note folders) from meeting date
        const md = new Date((m.date || '') + 'T00:00:00Z');
        let week;
        if (isNaN(md.getTime())) {
            week = getCurrentYearWeek();
        } else {
            const t = new Date(Date.UTC(md.getUTCFullYear(), md.getUTCMonth(), md.getUTCDate()));
            t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
            const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
            const wn = Math.ceil((((t - ys) / 86400000) + 1) / 7);
            week = `${t.getUTCFullYear()}-${wn}`;
        }
        const slug = (m.title || 'mote').toLowerCase()
            .replace(/[^a-z0-9æøå]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'mote';
        const dir = path.join(dataDir(), week);
        fs.mkdirSync(dir, { recursive: true });
        let file = `mote-${m.date}-${slug}.md`;
        let n = 1;
        while (fs.existsSync(path.join(dir, file))) {
            n += 1;
            file = `mote-${m.date}-${slug}-${n}.md`;
        }
        const lines = [
            `# ${m.title || 'Møte'}`,
            '',
            `**Dato:** ${m.date}${m.start ? ' kl. ' + m.start : ''}${m.end ? '–' + m.end : ''}  `
        ];
        if (m.location) lines.push(`**Sted:** ${m.location}  `);
        if (m.attendees && m.attendees.length) {
            lines.push(`**Deltakere:** ${m.attendees.map(a => '@' + a).join(' ')}  `);
        }
        lines.push('', '## Agenda', '', '- ', '', '## Notater', '');
        if (m.notes) lines.push(m.notes, '');
        lines.push('## Aksjonspunkter', '', '- [ ] ', '');
        fs.writeFileSync(path.join(dir, file), lines.join('\n'), 'utf-8');
        const now = new Date().toISOString();
        setNoteMeta(week, file, { type: 'meeting', meetingId: mid, created: now, modified: now });
        res.writeHead(302, { Location: `/editor/${week}/${encodeURIComponent(file)}` });
        res.end();
        return;
    }

    // Calendar page (week view)
    const calMatch = pathname.match(/^\/calendar(?:\/(\d{4}-W\d{2}))?$/);
    if (calMatch) {
        const week = calMatch[1] || currentIsoWeek();
        const monday = isoWeekMonday(week);
        if (!monday) {
            res.writeHead(404); res.end('Bad week'); return;
        }
        const days = [];
        const dayNames = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
        const todayStr = new Date().toISOString().slice(0, 10);
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setUTCDate(monday.getUTCDate() + i);
            const iso = d.toISOString().slice(0, 10);
            days.push({ iso, label: dayNames[i], dayNum: String(d.getUTCDate()).padStart(2, '0'), month: String(d.getUTCMonth() + 1).padStart(2, '0'), isToday: iso === todayStr });
        }
        const meetings = loadMeetings().filter(m => m.date >= days[0].iso && m.date <= days[6].iso);
        const prevWeek = shiftIsoWeek(week, -1);
        const nextWeek = shiftIsoWeek(week, 1);
        const HOUR_START = 0, HOUR_END = 23, HOUR_PX = 36;
        const work = getWorkHours();
        const hourLabels = [];
        for (let h = HOUR_START; h <= HOUR_END; h++) hourLabels.push(h);
        const dayColumns = days.map((d, i) => {
            const wh = work.hours[i];
            let workBand = '';
            if (wh) {
                const [wsH, wsM] = wh.start.split(':').map(n => parseInt(n, 10));
                const [weH, weM] = wh.end.split(':').map(n => parseInt(n, 10));
                const workTop = ((wsH - HOUR_START) + (wsM || 0) / 60) * HOUR_PX;
                const workH = Math.max(0, ((weH + (weM || 0) / 60) - (wsH + (wsM || 0) / 60)) * HOUR_PX);
                if (workH > 0) workBand = `<div class="work-band" style="top:${workTop}px;height:${workH}px"></div>`;
            }
            const dayMeetings = meetings.filter(m => m.date === d.iso);
            const blocks = dayMeetings.map(m => {
                let top = 0, height = HOUR_PX;
                if (m.start) {
                    const [sh, sm] = m.start.split(':').map(n => parseInt(n, 10));
                    top = ((sh - HOUR_START) + (sm || 0) / 60) * HOUR_PX;
                    if (m.end) {
                        const [eh, em] = m.end.split(':').map(n => parseInt(n, 10));
                        const dur = (eh + (em || 0) / 60) - (sh + (sm || 0) / 60);
                        height = Math.max(20, dur * HOUR_PX);
                    }
                }
                const att = (m.attendees || []).slice(0, 3).map(a => '@' + a).join(' ');
                const more = (m.attendees || []).length > 3 ? ' +' + ((m.attendees.length - 3)) : '';
                const typeIcon = meetingTypeIcon(m.type);
                return `<div class="mtg" id="m-${escapeHtml(m.id)}" data-mid="${escapeHtml(m.id)}" style="top:${Math.max(0, top)}px;height:${height}px">
                    <a class="mtg-note" href="/meeting-note/${encodeURIComponent(m.id)}" title="Åpne møtenotat" onclick="event.stopPropagation()">📝</a>
                    <div class="mtg-time">${escapeHtml(m.start || '')}${m.end ? '–' + escapeHtml(m.end) : ''}</div>
                    <div class="mtg-t">${typeIcon ? `<span class="mtg-type-icon" title="${escapeHtml(meetingTypeLabel(m.type))}">${typeIcon}</span> ` : ''}${escapeHtml(m.title)}</div>
                    ${att ? `<div class="mtg-att">${escapeHtml(att + more)}</div>` : ''}
                    ${m.location ? `<div class="mtg-l">📍 ${escapeHtml(m.location)}</div>` : ''}
                </div>`;
            }).join('');
            return `<div class="cal-col${d.isToday ? ' today' : ''}" data-date="${d.iso}">
                <div class="cal-col-head"><strong>${d.label}</strong><span>${d.dayNum}.${d.month}</span></div>
                <div class="cal-col-body" style="height:${(HOUR_END - HOUR_START + 1) * HOUR_PX}px">${workBand}${blocks}</div>
            </div>`;
        }).join('');
        const hoursCol = `<div class="cal-hours"><div class="cal-col-head"></div><div class="cal-col-body" style="height:${(HOUR_END - HOUR_START + 1) * HOUR_PX}px">${hourLabels.map(h => `<div class="hour-line" style="top:${(h - HOUR_START) * HOUR_PX}px">${String(h).padStart(2,'0')}:00</div>`).join('')}</div></div>`;
        const meetingTypes = loadMeetingTypes();
        const dateRange = isoWeekToDateRange(week);
        const body = `
            <div class="cal-page">
            <div class="cal-toolbar">
                <h1 style="margin:0">📅 Kalender · Uke ${week.split('-W')[1]}</h1>
                <span style="color:#a99a78">${escapeHtml(dateRange)}</span>
                <div style="margin-left:auto;display:flex;gap:6px">
                    <button type="button" class="cal-nav-btn cal-add-btn" onclick="newMeeting()" title="Nytt møte">+ Nytt møte</button>
                    <button type="button" class="cal-nav-btn" onclick="openTypesModal()" title="Rediger møtetyper">✏️ Typer</button>
                    <a href="/calendar/${prevWeek}" class="cal-nav-btn">‹ Forrige</a>
                    <a href="/calendar" class="cal-nav-btn">I dag</a>
                    <a href="/calendar/${nextWeek}" class="cal-nav-btn">Neste ›</a>
                </div>
            </div>
            <div class="cal-grid">
                ${hoursCol}
                ${dayColumns}
            </div>
            <div id="calCtxMenu" class="cal-ctx-menu"></div>
            <div id="mtgModal" class="mtg-modal" onclick="if(event.target===this)closeMtgModal()">
                <div class="mtg-modal-card">
                    <div class="mtg-modal-head">
                        <h3 id="mtgModalTitle" style="margin:0">Nytt møte</h3>
                        <button type="button" onclick="closeMtgModal()" class="mtg-x">✕</button>
                    </div>
                    <form id="mtgForm">
                        <input type="hidden" id="mtgId">
                        <label>Tittel<input type="text" id="mtgTitle" required autofocus></label>
                        <div class="mtg-row">
                            <label style="flex:1">Type<select id="mtgType">
                                ${meetingTypes.map(t => `<option value="${escapeHtml(t.key)}">${t.icon || ''} ${escapeHtml(t.label)}</option>`).join('')}
                            </select></label>
                            <label style="flex:1.2">Dato<input type="date" id="mtgDate" required></label>
                            <label style="flex:0.9">Fra<span class="time-pick"><select id="mtgStartH" class="t-h"></select><span class="t-sep">:</span><select id="mtgStartM" class="t-m"></select></span></label>
                            <label style="flex:0.9">Til<span class="time-pick"><select id="mtgEndH" class="t-h"></select><span class="t-sep">:</span><select id="mtgEndM" class="t-m"></select></span></label>
                        </div>
                        <label>Deltakere (kommaseparert eller @navn)<input type="text" id="mtgAttendees" placeholder="@kari, @ola"></label>
                        <label>Sted<input type="text" id="mtgLocation" placeholder="Møterom, Teams, …"></label>
                        <label>Notater<textarea id="mtgNotes" rows="4" placeholder="Agenda, lenker, …"></textarea></label>
                        <div class="mtg-modal-actions">
                            <button type="button" id="mtgDelete" class="mtg-btn-del" style="display:none">🗑️ Slett</button>
                            <span style="flex:1"></span>
                            <button type="button" onclick="closeMtgModal()" class="mtg-btn-cancel">Avbryt</button>
                            <button type="submit" class="mtg-btn-save">💾 Lagre</button>
                        </div>
                    </form>
                </div>
            </div>
            <div id="typesModal" class="mtg-modal" onclick="if(event.target===this)closeTypesModal()">
                <div class="mtg-modal-card" style="width:480px">
                    <div class="mtg-modal-head">
                        <h3 style="margin:0">✏️ Møtetyper</h3>
                        <button type="button" onclick="closeTypesModal()" class="mtg-x">✕</button>
                    </div>
                    <p style="font-size:0.85em;color:#7a6f4d;margin:0 0 12px">Klikk på et ikon for å bytte. Slett fjerner typen (eksisterende møter beholdes uten ikon).</p>
                    <div id="typesList"></div>
                    <button type="button" class="cal-nav-btn" onclick="addType()" style="margin-top:8px">+ Ny type</button>
                    <div class="mtg-modal-actions">
                        <span style="flex:1"></span>
                        <button type="button" onclick="closeTypesModal()" class="mtg-btn-cancel">Avbryt</button>
                        <button type="button" class="mtg-btn-save" onclick="saveTypes()">💾 Lagre</button>
                    </div>
                </div>
            </div>
            <div id="iconPicker" class="icon-picker" onclick="if(event.target===this)closeIconPicker()">
                <div class="icon-picker-card">
                    <div class="mtg-modal-head">
                        <h4 style="margin:0">Velg ikon</h4>
                        <button type="button" onclick="closeIconPicker()" class="mtg-x">✕</button>
                    </div>
                    <div id="iconGrid" class="icon-grid"></div>
                </div>
            </div>
            </div>
            <style>
                body:has(.cal-page) { max-width: none; }
                .cal-page { width: 100%; }
                .cal-toolbar { display:flex; align-items:center; gap:14px; margin-bottom:14px; }
                .cal-nav-btn { background:#fffdf7; border:1px solid #d6cdb6; padding:6px 12px; border-radius:4px; text-decoration:none; color:#1a365d; font-size:0.9em; cursor:pointer; font-family:inherit; }
                .cal-nav-btn:hover { background:#f0e8d4; text-decoration:none; }
                .cal-add-btn { background:#1a365d; color:#fffdf7; border-color:#1a365d; font-weight:600; }
                .cal-add-btn:hover { background:#102542; color:#fffdf7; }
                .cal-ctx-menu { display:none; position:fixed; background:#fffdf7; border:1px solid #d6cdb6; border-radius:6px; box-shadow:0 8px 24px rgba(26,54,93,0.18); padding:4px; z-index:1200; min-width:180px; }
                .cal-ctx-menu.open { display:block; }
                .cal-ctx-menu .cm-h { font-size:0.7em; font-weight:600; color:#7a6f4d; text-transform:uppercase; letter-spacing:0.08em; padding:6px 10px 4px; }
                .cal-ctx-menu .cm-item { display:flex; align-items:center; gap:10px; width:100%; background:none; border:none; padding:7px 10px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:0.9em; color:#1a365d; text-align:left; }
                .cal-ctx-menu .cm-item:hover { background:#f0e8d4; }
                .cal-ctx-menu .cm-item .cm-icon { font-size:1.15em; }
                .cal-grid { display:grid; grid-template-columns: 56px repeat(7, 1fr); gap:0; background:#fffdf7; border:1px solid #d6cdb6; border-radius:6px; overflow:hidden; }
                .cal-col, .cal-hours { border-right:1px solid #ebe2cb; }
                .cal-col:last-child { border-right:none; }
                .cal-col-head { background:#f8f3e2; padding:8px 10px; border-bottom:1px solid #d6cdb6; font-size:0.85em; color:#3c3a30; display:flex; justify-content:space-between; align-items:baseline; gap:6px; height:36px; box-sizing:border-box; overflow:hidden; }
                .cal-col-head span { color:#a99a78; }
                .cal-col.today .cal-col-head { background:#fff5d1; }
                .cal-col.today .cal-col-head strong { color:#8a5a00; }
                .cal-col-body { position:relative; cursor:crosshair; }
                .cal-col-body:hover { background:#fbf9f4; }
                .work-band { position:absolute; left:0; right:0; background:rgba(43,108,176,0.07); border-top:1px dashed rgba(43,108,176,0.35); border-bottom:1px dashed rgba(43,108,176,0.35); pointer-events:none; z-index:0; }
                .cal-hours .cal-col-body { cursor:default; }
                .cal-hours .cal-col-body:hover { background:transparent; }
                .hour-line { position:absolute; left:0; right:0; height:0; padding:0 6px; font-size:0.7em; color:#a99a78; text-align:right; line-height:1; display:flex; align-items:center; justify-content:flex-end; }
                .hour-line:first-child { align-items:flex-start; padding-top:2px; }
                .cal-col-body { background-image: repeating-linear-gradient(to bottom, #ebe2cb 0, #ebe2cb 1px, transparent 1px, transparent 48px); }
                .mtg { position:absolute; left:2px; right:2px; background:#e6efff; border:1px solid #b9c8e0; border-left:3px solid #2b6cb0; border-radius:3px; padding:3px 6px; font-size:0.78em; color:#1a365d; cursor:pointer; overflow:hidden; box-shadow:0 1px 2px rgba(26,54,93,0.1); }
                .mtg.targeted { box-shadow:0 0 0 2px #f6ad55, 0 1px 4px rgba(26,54,93,0.2); animation: mtgPulse 1.6s ease-in-out 2; }
                @keyframes mtgPulse { 0%,100% { background:#e6efff; } 50% { background:#fff3d6; } }
                .mtg:hover { background:#d9e5fb; z-index:5; }
                .mtg-time { font-weight:600; font-size:0.85em; }
                .mtg-t { font-weight:500; line-height:1.2; }
                .mtg-type-icon { font-size:0.95em; }
                .mtg-att, .mtg-l { color:#4a5568; font-size:0.92em; }
                .mtg-note { position:absolute; top:2px; right:3px; font-size:0.95em; text-decoration:none; padding:0 3px; opacity:0.55; line-height:1; border-radius:3px; }
                .mtg-note:hover { opacity:1; background:#fffdf7; }
                .mtg-modal { display:none; position:fixed; inset:0; background:rgba(26,32,44,0.45); z-index:1000; align-items:center; justify-content:center; }
                .mtg-modal.open { display:flex; }
                .mtg-modal-card { background:#fffdf7; border:1px solid #d6cdb6; border-radius:8px; padding:20px 24px; width:520px; max-width:92vw; max-height:90vh; overflow:auto; }
                .mtg-modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
                .mtg-x { background:none; border:none; font-size:1.3em; cursor:pointer; color:#718096; }
                #mtgForm label { display:block; margin-bottom:10px; font-size:0.85em; color:#4a5568; font-weight:600; }
                #mtgForm input[type=text], #mtgForm input[type=date], #mtgForm input[type=time], #mtgForm textarea { width:100%; box-sizing:border-box; padding:7px 10px; border:1px solid #d6cdb6; border-radius:4px; font-family:inherit; font-size:0.95em; margin-top:4px; background:#fbf9f4; color:#1a202c; }
                #mtgForm textarea { font-family: ui-monospace, monospace; font-size:0.88em; }
                .mtg-row { display:flex; gap:10px; }
                .time-pick { display:inline-flex; align-items:center; gap:2px; }
                .time-pick select { padding:7px 6px; border:1px solid #d6cdb6; border-radius:4px; font-family:inherit; background:#fffdf7; }
                .time-pick .t-sep { color:#7a6f4d; font-weight:600; }
                .mtg-modal-actions { display:flex; align-items:center; gap:8px; margin-top:14px; }
                .mtg-btn-save { background:#1a365d; color:#fffdf7; border:none; padding:8px 18px; border-radius:4px; cursor:pointer; font-weight:600; font-family:inherit; }
                .mtg-btn-save:hover { background:#102542; }
                .mtg-btn-cancel { background:none; border:1px solid #d6cdb6; padding:7px 14px; border-radius:4px; cursor:pointer; font-family:inherit; color:#7a6f4d; }
                .mtg-btn-del { background:#fef0c7; border:1px solid #f0d589; color:#8a5a00; padding:7px 12px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:0.9em; }
                .mtg-btn-del:hover { background:#f7e2a3; }
                .types-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; padding:6px; border:1px solid #ebe2cb; border-radius:4px; background:#fbf9f4; }
                .types-row .ti-icon { width:38px; height:38px; font-size:1.4em; cursor:pointer; background:#fffdf7; border:1px solid #d6cdb6; border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
                .types-row .ti-icon:hover { background:#f0e8d4; }
                .types-row input[type=text] { flex:1; padding:7px 10px; border:1px solid #d6cdb6; border-radius:4px; font-family:inherit; font-size:0.95em; background:#fffdf7; color:#1a202c; }
                .types-row .ti-del { background:#fff5f5; color:#c53030; border:1px solid #fed7d7; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:0.9em; }
                .types-row .ti-del:hover { background:#fed7d7; }
                .icon-picker { display:none; position:fixed; inset:0; background:rgba(26,32,44,0.55); z-index:1100; align-items:center; justify-content:center; }
                .icon-picker.open { display:flex; }
                .icon-picker-card { background:#fffdf7; border:1px solid #d6cdb6; border-radius:8px; padding:16px 20px; }
                .icon-grid { display:grid; grid-template-columns: repeat(8, 42px); gap:6px; max-height:70vh; overflow-y:auto; }
                .icon-grid button { width:42px; height:42px; font-size:1.5em; background:#fbf9f4; border:1px solid #ebe2cb; border-radius:4px; cursor:pointer; padding:0; line-height:1; }
                .icon-grid button:hover { background:#f0e8d4; border-color:#1a365d; }
                .icon-grid .ig-grp-label { grid-column: 1 / -1; font-size:0.72em; font-weight:600; color:#7a6f4d; text-transform:uppercase; letter-spacing:0.08em; padding:6px 2px 2px; border-bottom:1px solid #ebe2cb; }
                .icon-grid .ig-grp-label:first-child { padding-top:0; }
            </style>
            <script>
                (function(){
                    const HOUR_PX = ${HOUR_PX}, HOUR_START = ${HOUR_START}, HOUR_END = ${HOUR_END};
                    const DEFAULT_MTG_MIN = ${getDefaultMeetingMinutes()};
                    const MEETING_TYPES = ${JSON.stringify(meetingTypes)};
                    const modal = document.getElementById('mtgModal');
                    const $ = id => document.getElementById(id);
                    function addMinutesToTime(t, mins) {
                        if (!t) return '';
                        const [h, m] = t.split(':').map(n => parseInt(n, 10));
                        let total = h * 60 + (m || 0) + mins;
                        total = Math.max(0, Math.min(24 * 60 - 1, total));
                        return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
                    }
                    function fillTimeSelects() {
                        const hOpts = [];
                        for (let h = 0; h < 24; h++) hOpts.push('<option value="' + String(h).padStart(2, '0') + '">' + String(h).padStart(2, '0') + '</option>');
                        const mOpts = [];
                        for (let m = 0; m < 60; m += 5) mOpts.push('<option value="' + String(m).padStart(2, '0') + '">' + String(m).padStart(2, '0') + '</option>');
                        ['mtgStartH', 'mtgEndH'].forEach(id => { $(id).innerHTML = hOpts.join(''); });
                        ['mtgStartM', 'mtgEndM'].forEach(id => { $(id).innerHTML = mOpts.join(''); });
                    }
                    function setTime(prefix, val) {
                        if (!val) { $(prefix + 'H').value = ''; $(prefix + 'M').value = ''; return; }
                        const [h, m] = val.split(':');
                        $(prefix + 'H').value = (h || '00').padStart(2, '0');
                        const mi = Math.round(parseInt(m || '0', 10) / 5) * 5;
                        $(prefix + 'M').value = String(Math.min(55, mi)).padStart(2, '0');
                    }
                    function getTime(prefix) {
                        const h = $(prefix + 'H').value;
                        const m = $(prefix + 'M').value;
                        if (!h || !m) return '';
                        return h + ':' + m;
                    }
                    fillTimeSelects();
                    function openModal(meeting, prefillDate, prefillStart) {
                        $('mtgForm').reset();
                        if (meeting) {
                            $('mtgModalTitle').textContent = 'Rediger møte';
                            $('mtgId').value = meeting.id;
                            $('mtgTitle').value = meeting.title || '';
                            $('mtgType').value = meeting.type || 'meeting';
                            $('mtgDate').value = meeting.date || '';
                            setTime('mtgStart', meeting.start || '');
                            setTime('mtgEnd', meeting.end || '');
                            $('mtgAttendees').value = (meeting.attendees || []).map(a => '@' + a).join(', ');
                            $('mtgLocation').value = meeting.location || '';
                            $('mtgNotes').value = meeting.notes || '';
                            $('mtgDelete').style.display = '';
                        } else {
                            $('mtgModalTitle').textContent = 'Nytt møte';
                            $('mtgId').value = '';
                            $('mtgType').value = 'meeting';
                            $('mtgDate').value = prefillDate || '';
                            setTime('mtgStart', prefillStart || '');
                            setTime('mtgEnd', prefillStart ? addMinutesToTime(prefillStart, DEFAULT_MTG_MIN) : '');
                            $('mtgDelete').style.display = 'none';
                        }
                        modal.classList.add('open');
                        setTimeout(() => $('mtgTitle').focus(), 50);
                    }
                    window.closeMtgModal = function(){ modal.classList.remove('open'); };
                    window.newMeeting = function() {
                        const cols = document.querySelectorAll('.cal-col[data-date]');
                        if (!cols.length) { openModal(null, '', ''); return; }
                        const dates = Array.from(cols).map(c => c.getAttribute('data-date'));
                        const today = new Date().toISOString().slice(0, 10);
                        const date = dates.includes(today) ? today : dates[0];
                        const now = new Date();
                        let hh = now.getHours();
                        if (date !== today) hh = 9;
                        else hh = Math.min(Math.max(hh, HOUR_START), HOUR_END - 1);
                        openModal(null, date, String(hh).padStart(2, '0') + ':00');
                    };
                    document.querySelectorAll('.cal-col-body').forEach(body => {
                        body.addEventListener('click', e => {
                            if (e.target.closest('.mtg')) return;
                            const col = body.closest('.cal-col');
                            if (!col) return;
                            const rect = body.getBoundingClientRect();
                            const y = e.clientY - rect.top;
                            const hour = Math.max(HOUR_START, Math.min(HOUR_END, HOUR_START + Math.floor(y / HOUR_PX)));
                            const date = col.getAttribute('data-date');
                            openModal(null, date, String(hour).padStart(2,'0') + ':00');
                        });
                        body.addEventListener('contextmenu', e => {
                            if (e.target.closest('.mtg')) return;
                            const col = body.closest('.cal-col');
                            if (!col) return;
                            e.preventDefault();
                            const rect = body.getBoundingClientRect();
                            const y = e.clientY - rect.top;
                            const hour = Math.max(HOUR_START, Math.min(HOUR_END, HOUR_START + Math.floor(y / HOUR_PX)));
                            const date = col.getAttribute('data-date');
                            const start = String(hour).padStart(2, '0') + ':00';
                            showTypeMenu(e.clientX, e.clientY, date, start);
                        });
                    });
                    const ctxMenu = document.getElementById('calCtxMenu');
                    function showTypeMenu(x, y, date, start) {
                        ctxMenu.innerHTML = '';
                        const h = document.createElement('div');
                        h.className = 'cm-h';
                        h.textContent = 'Nytt møte · type';
                        ctxMenu.appendChild(h);
                        MEETING_TYPES.forEach(t => {
                            const b = document.createElement('button');
                            b.type = 'button';
                            b.className = 'cm-item';
                            b.innerHTML = '<span class="cm-icon">' + (t.icon || '👥') + '</span><span>' + (t.label || t.key) + '</span>';
                            b.onclick = () => {
                                hideTypeMenu();
                                openModal(null, date, start);
                                document.getElementById('mtgType').value = t.key;
                            };
                            ctxMenu.appendChild(b);
                        });
                        ctxMenu.style.left = '0px';
                        ctxMenu.style.top = '0px';
                        ctxMenu.classList.add('open');
                        const w = ctxMenu.offsetWidth, h2 = ctxMenu.offsetHeight;
                        const vw = window.innerWidth, vh = window.innerHeight;
                        ctxMenu.style.left = Math.min(x, vw - w - 8) + 'px';
                        ctxMenu.style.top = Math.min(y, vh - h2 - 8) + 'px';
                    }
                    function hideTypeMenu() { ctxMenu.classList.remove('open'); }
                    document.addEventListener('click', e => {
                        if (!ctxMenu.contains(e.target)) hideTypeMenu();
                    });
                    document.addEventListener('keydown', e => {
                        if (e.key === 'Escape') hideTypeMenu();
                    });
                    document.querySelectorAll('.mtg').forEach(el => {
                        el.addEventListener('click', e => {
                            e.stopPropagation();
                            const id = el.getAttribute('data-mid');
                            fetch('/api/meetings').then(r => r.json()).then(all => {
                                const m = all.find(x => x.id === id);
                                if (m) openModal(m);
                            });
                        });
                    });
                    $('mtgForm').addEventListener('submit', e => {
                        e.preventDefault();
                        const id = $('mtgId').value;
                        const attendeesRaw = $('mtgAttendees').value || '';
                        const attendees = attendeesRaw.split(/[,\\s]+/).map(s => s.replace(/^@/, '').toLowerCase()).filter(Boolean);
                        const data = {
                            title: $('mtgTitle').value.trim(),
                            type: $('mtgType').value,
                            date: $('mtgDate').value,
                            start: getTime('mtgStart'),
                            end: getTime('mtgEnd'),
                            attendees,
                            location: $('mtgLocation').value.trim(),
                            notes: $('mtgNotes').value
                        };
                        const url = id ? '/api/meetings/' + encodeURIComponent(id) : '/api/meetings';
                        const method = id ? 'PUT' : 'POST';
                        fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
                            .then(r => r.json()).then(d => { if (d.ok) location.reload(); else alert('Feil: ' + (d.error || '')); });
                    });
                    $('mtgDelete').addEventListener('click', () => {
                        const id = $('mtgId').value;
                        if (!id || !confirm('Slette dette møtet?')) return;
                        fetch('/api/meetings/' + encodeURIComponent(id), { method: 'DELETE' })
                            .then(r => r.json()).then(() => location.reload());
                    });
                    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMtgModal(); });
                    function focusFromHash() {
                        const m = (location.hash || '').match(/^#m-(.+)$/);
                        if (!m) return;
                        const el = document.getElementById('m-' + decodeURIComponent(m[1]));
                        if (!el) return;
                        document.querySelectorAll('.mtg.targeted').forEach(x => x.classList.remove('targeted'));
                        el.classList.add('targeted');
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    window.addEventListener('hashchange', focusFromHash);
                    setTimeout(focusFromHash, 50);
                })();
            </script>
            <script src="/mention-autocomplete.js"></script>
            <script>
                (function(){
                    ['mtgTitle','mtgAttendees','mtgNotes'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) initMentionAutocomplete(el);
                    });
                })();
            </script>
            <script>
                (function(){
                    const ICON_GROUPS = [
                        { label: 'Personer', icons: ['👥','🤝','👋','🙌','👀','🗣️','💬','🗨️'] },
                        { label: 'Kommunikasjon', icons: ['📞','☎️','📱','📧','📨','📤','📥','🔔'] },
                        { label: 'Dokumenter', icons: ['📋','📝','✏️','📎','📌','📍','📅','🗓️'] },
                        { label: 'Planlegging', icons: ['📊','📈','📉','🎯','🧠','💡','🔍','⚖️'] },
                        { label: 'Arbeid', icons: ['🖥️','💻','🛠️','🔧','⚙️','🧪','🔬','🚀'] },
                        { label: 'Tid & status', icons: ['⏰','⏳','⌛','🟢','🟡','🔴','🔵','⚡'] },
                        { label: 'Feiring', icons: ['🎉','🎊','🎁','🎈','🍰','🏆','🎖️','🥇'] },
                        { label: 'Media & læring', icons: ['🎬','📷','📹','🎤','🎵','🎓','📚','☕'] },
                        { label: 'Mat & drikke', icons: ['🍕','🍔','🍱','🍷','🍺','🥂','🍻','🥗'] },
                        { label: 'Sport', icons: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','⛳','🏌️','🏓','🏸','🥊','🏃','🚴','🏊','🧗'] },
                        { label: 'Annet', icons: ['✅','❌','❓','❗','⚠️','⭐','🌟','✨'] }
                    ];
                    let currentTypes = ${JSON.stringify(meetingTypes)};
                    let pickerTarget = null;

                    function slugKey(label) {
                        const base = (label || 'type').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
                        return base + '-' + Math.random().toString(36).slice(2, 6);
                    }
                    function renderTypes() {
                        const list = document.getElementById('typesList');
                        list.innerHTML = '';
                        currentTypes.forEach((t, i) => {
                            const row = document.createElement('div');
                            row.className = 'types-row';
                            row.innerHTML = '<button type="button" class="ti-icon" data-i="' + i + '" title="Velg ikon">' + (t.icon || '·') + '</button>'
                                + '<input type="text" data-i="' + i + '" value="' + (t.label || '').replace(/"/g, '&quot;') + '" placeholder="Navn">'
                                + '<button type="button" class="ti-del" data-i="' + i + '" title="Slett">🗑️</button>';
                            list.appendChild(row);
                        });
                        list.querySelectorAll('.ti-icon').forEach(b => b.onclick = () => openIconPicker(parseInt(b.dataset.i, 10)));
                        list.querySelectorAll('input[type=text]').forEach(inp => inp.oninput = () => { currentTypes[parseInt(inp.dataset.i, 10)].label = inp.value; });
                        list.querySelectorAll('.ti-del').forEach(b => b.onclick = () => { currentTypes.splice(parseInt(b.dataset.i, 10), 1); renderTypes(); });
                    }
                    function renderIconGrid() {
                        const grid = document.getElementById('iconGrid');
                        grid.innerHTML = '';
                        ICON_GROUPS.forEach(grp => {
                            const h = document.createElement('div');
                            h.className = 'ig-grp-label';
                            h.textContent = grp.label;
                            grid.appendChild(h);
                            grp.icons.forEach(ic => {
                                const b = document.createElement('button');
                                b.type = 'button';
                                b.textContent = ic;
                                b.onclick = () => {
                                    if (pickerTarget != null && currentTypes[pickerTarget]) {
                                        currentTypes[pickerTarget].icon = ic;
                                        renderTypes();
                                    }
                                    closeIconPicker();
                                };
                                grid.appendChild(b);
                            });
                        });
                    }
                    window.openTypesModal = function() {
                        renderTypes();
                        document.getElementById('typesModal').classList.add('open');
                    };
                    window.closeTypesModal = function() {
                        document.getElementById('typesModal').classList.remove('open');
                    };
                    window.addType = function() {
                        currentTypes.push({ key: slugKey('ny'), icon: '👥', label: 'Ny type' });
                        renderTypes();
                    };
                    window.openIconPicker = function(i) {
                        pickerTarget = i;
                        document.getElementById('iconPicker').classList.add('open');
                    };
                    window.closeIconPicker = function() {
                        pickerTarget = null;
                        document.getElementById('iconPicker').classList.remove('open');
                    };
                    window.saveTypes = function() {
                        const cleaned = currentTypes
                            .map(t => ({ key: t.key || slugKey(t.label), icon: (t.icon || '').trim(), label: (t.label || '').trim() }))
                            .filter(t => t.label);
                        fetch('/api/meeting-types', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cleaned) })
                            .then(r => r.json()).then(d => { if (d.ok) location.reload(); else alert('Feil ved lagring'); });
                    };
                    document.addEventListener('keydown', e => {
                        if (e.key !== 'Escape') return;
                        if (document.getElementById('iconPicker').classList.contains('open')) closeIconPicker();
                        else if (document.getElementById('typesModal').classList.contains('open')) closeTypesModal();
                    });
                    renderIconGrid();
                })();
            </script>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Kalender', body));
        return;
    }

    if (pathname === '/people') {
        const people = loadPeople().sort((a, b) => a.name.localeCompare(b.name, 'nb'));
        const tasks = loadTasks();
        const weeks = getWeekDirs();

        let body = '<h1>👥 Personer</h1>';

        if (people.length === 0) {
            body += '<p style="color:#718096;font-style:italic">Ingen personer registrert ennå. Bruk @navn i notater eller oppgaver.</p>';
        } else {
            body += `<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
                <input id="peopleFilter" type="text" placeholder="🔍 Filter på navn, tittel, e-post..." oninput="applyPeopleFilter()" style="flex:1;min-width:220px;padding:8px 12px;border:2px solid #e8e2d2;border-radius:8px;font-size:0.95em;outline:none" />
                <select id="peopleSort" onchange="applyPeopleFilter()" style="padding:8px 12px;border:2px solid #e8e2d2;border-radius:8px;font-size:0.95em;outline:none;background:white;cursor:pointer">
                    <option value="name-asc">Navn A–Å</option>
                    <option value="name-desc">Navn Å–A</option>
                    <option value="refs-desc">Flest referanser</option>
                    <option value="refs-asc">Færrest referanser</option>
                </select>
                <button onclick="expandAllPeople(true)" title="Utvid alle" style="padding:8px 12px;border:1px solid #e8e2d2;background:white;border-radius:8px;cursor:pointer;color:#4a5568;font-size:0.9em">⇣ Utvid</button>
                <button onclick="expandAllPeople(false)" title="Skjul alle" style="padding:8px 12px;border:1px solid #e8e2d2;background:white;border-radius:8px;cursor:pointer;color:#4a5568;font-size:0.9em">⇡ Skjul</button>
                <label style="display:flex;align-items:center;gap:6px;font-size:0.85em;color:#4a5568;cursor:pointer;padding:8px 6px"><input id="showInactive" type="checkbox" onchange="applyPeopleFilter()" /> Vis inaktive</label>
                <span id="peopleCount" style="font-size:0.85em;color:#718096"></span>
            </div>
            <div id="peopleList">`;
            people.forEach(person => {
                const pattern = new RegExp('(?:^|[\\s\\n(])@' + person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-zA-ZæøåÆØÅ0-9_-])', 'i');

                // Find matching tasks
                const mentionedTasks = tasks.filter(t =>
                    pattern.test(t.text) || pattern.test(t.note || '')
                );

                // Find matching notes
                const mentionedNotes = [];
                weeks.forEach(week => {
                    getMdFiles(week).forEach(file => {
                        try {
                            const content = fs.readFileSync(path.join(dataDir(), week, file), 'utf-8');
                            if (pattern.test(content)) mentionedNotes.push({ week, file });
                        } catch {}
                    });
                });

                const total = mentionedTasks.length + mentionedNotes.length;
                const personJson = JSON.stringify(person).replace(/'/g, '&#39;');
                const displayName = person.firstName
                    ? (person.lastName ? `${person.firstName} ${person.lastName}` : person.firstName)
                    : person.name;
                const searchBlob = [displayName, person.name, person.title, person.email, person.phone, person.notes].filter(Boolean).join(' ').toLowerCase();
                body += `<div class="person-card${person.inactive ? ' inactive' : ''}" data-name="${escapeHtml(displayName.toLowerCase())}" data-refs="${total}" data-inactive="${person.inactive ? '1' : '0'}" data-search="${escapeHtml(searchBlob)}" style="margin-bottom:8px;background:white;border-radius:8px;border:1px solid #e8e2d2;overflow:hidden${person.inactive ? ';opacity:0.55' : ''}">`;
                body += `<div class="person-header" onclick="togglePerson(this)" style="padding:8px 14px;background:#fffdf7;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none">`;
                body += `<span class="person-chev" style="font-size:0.7em;color:#a0aec0;transition:transform 0.15s;display:inline-block;width:10px">▶</span>`;
                body += `<span style="font-size:1.1em">${person.inactive ? '👻' : '👤'}</span>`;
                body += `<div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">`;
                body += `<span style="font-weight:600;color:#1a365d${person.inactive ? ';text-decoration:line-through' : ''}">${escapeHtml(displayName)}</span>`;
                body += `<span style="font-size:0.8em;color:#a0aec0">@${escapeHtml(person.name)}</span>`;
                if (person.inactive) body += `<span style="font-size:0.75em;background:#edf2f7;color:#4a5568;padding:1px 8px;border-radius:10px;font-weight:500">inaktiv</span>`;
                if (person.title) body += `<span style="font-size:0.82em;color:#4a5568">· ${escapeHtml(person.title)}</span>`;
                body += `</div>`;
                body += `<span style="font-size:0.8em;color:#718096;white-space:nowrap">${total} ref.</span>`;
                body += `<button onclick='event.stopPropagation();openEditPerson(${personJson})' title="Rediger person" style="background:none;border:none;cursor:pointer;font-size:1em;padding:2px 6px;border-radius:4px;color:#4a5568" onmouseover="this.style.background='#e8e2d2'" onmouseout="this.style.background='none'">✏️</button>`;
                body += `</div>`;
                body += `<div class="person-details" style="display:none">`;
                if (person.email || person.phone) {
                    body += `<div style="padding:8px 18px;background:#f5efe1;border-top:1px solid #e8e2d2;display:flex;gap:20px;font-size:0.85em;color:#4a5568">`;
                    if (person.email) body += `<span>📧 <a href="mailto:${escapeHtml(person.email)}" style="color:#2b6cb0">${escapeHtml(person.email)}</a></span>`;
                    if (person.phone) body += `<span>📞 ${escapeHtml(person.phone)}</span>`;
                    body += `</div>`;
                }
                if (person.notes) {
                    body += `<div style="padding:8px 18px;background:#fffbf0;border-top:1px solid #e8e2d2;font-size:0.85em;color:#4a5568;font-style:italic">${escapeHtml(person.notes)}</div>`;
                }

                if (mentionedTasks.length > 0) {
                    body += `<div style="padding:10px 18px;border-top:1px solid #f5efe1"><div style="font-size:0.75em;font-weight:600;color:#4a5568;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Oppgaver</div>`;
                    mentionedTasks.forEach(t => {
                        const icon = t.done ? '✅' : '☐';
                        const style = t.done ? 'text-decoration:line-through;color:#a0aec0' : 'color:#2d3748';
                        body += `<div style="padding:3px 0;font-size:0.88em"><a href="/tasks" style="text-decoration:none;${style}">${icon} ${linkMentions(escapeHtml(t.text))}</a></div>`;
                    });
                    body += `</div>`;
                }

                if (mentionedNotes.length > 0) {
                    body += `<div style="padding:10px 18px;border-top:1px solid #f5efe1"><div style="font-size:0.75em;font-weight:600;color:#4a5568;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Notater</div>`;
                    mentionedNotes.forEach(({ week, file }) => {
                        const name = file.replace('.md', '');
                        body += `<div style="padding:3px 0;font-size:0.88em"><a href="/editor/${week}/${encodeURIComponent(file)}" style="color:#2b6cb0;text-decoration:none">📝 ${escapeHtml(name)} <span style="color:#a0aec0;font-size:0.85em">${week}</span></a></div>`;
                    });
                    body += `</div>`;
                }

                if (total === 0) {
                    body += `<div style="padding:10px 18px;border-top:1px solid #f5efe1;font-size:0.88em;color:#a0aec0;font-style:italic">Ingen referanser funnet.</div>`;
                }
                body += `</div>`;

                body += `</div>`;
            });
            body += `</div>`;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Personer', body + `
<div id="editPersonModal" class="page-modal" onclick="if(event.target===this)closeEditPerson()">
  <div class="page-modal-card" style="max-width:480px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <h3 style="margin:0">✏️ Rediger person</h3>
      <button onclick="closeEditPerson()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:#718096">✕</button>
    </div>
    <input type="hidden" id="editPersonId" />
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:0.85em;font-weight:600;color:#4a5568">Fornavn *
          <input id="editPersonFirstName" type="text" placeholder="Ole" style="display:block;margin-top:4px" />
        </label>
        <label style="font-size:0.85em;font-weight:600;color:#4a5568">Etternavn
          <input id="editPersonLastName" type="text" placeholder="Hansen" style="display:block;margin-top:4px" />
        </label>
      </div>
      <label style="font-size:0.85em;font-weight:600;color:#4a5568">Tittel
        <input id="editPersonTitle" type="text" style="display:block;margin-top:4px" />
      </label>
      <label style="font-size:0.85em;font-weight:600;color:#4a5568">E-post
        <input id="editPersonEmail" type="email" style="display:block;margin-top:4px" />
      </label>
      <label style="font-size:0.85em;font-weight:600;color:#4a5568">Telefon
        <input id="editPersonPhone" type="tel" style="display:block;margin-top:4px" />
      </label>
      <label style="font-size:0.85em;font-weight:600;color:#4a5568">Notat
        <textarea id="editPersonNotes" rows="3" style="display:block;margin-top:4px"></textarea>
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:0.9em;color:#4a5568;cursor:pointer;padding:6px 0">
        <input id="editPersonInactive" type="checkbox" style="width:16px;height:16px;cursor:pointer" />
        <span>Inaktiv (skjules fra @-autofullføring)</span>
      </label>
    </div>
    <div class="page-modal-actions" style="margin-top:20px;display:flex;align-items:center;gap:10px">
      <button class="page-modal-btn" onclick="deleteEditPerson()" style="background:#fff5f5;color:#c53030;border:1px solid #fed7d7;margin-right:auto">🗑️ Slett</button>
      <button class="page-modal-btn cancel" onclick="closeEditPerson()">Avbryt</button>
      <button class="page-modal-btn blue" style="padding:8px 20px" onclick="saveEditPerson()">💾 Lagre</button>
    </div>
  </div>
</div>
<script>
function openEditPerson(p) {
    document.getElementById('editPersonId').value = p.id;
    // Support legacy single-name people: try to split on space
    const firstName = p.firstName || (p.name && !p.lastName ? p.name.split(' ')[0] : p.name) || '';
    const lastName = p.lastName || (p.name && p.name.includes(' ') && !p.firstName ? p.name.split(' ').slice(1).join(' ') : '') || '';
    document.getElementById('editPersonFirstName').value = firstName;
    document.getElementById('editPersonLastName').value = lastName;
    document.getElementById('editPersonTitle').value = p.title || '';
    document.getElementById('editPersonEmail').value = p.email || '';
    document.getElementById('editPersonPhone').value = p.phone || '';
    document.getElementById('editPersonNotes').value = p.notes || '';
    document.getElementById('editPersonInactive').checked = !!p.inactive;
    const modal = document.getElementById('editPersonModal');
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('editPersonFirstName').focus(), 50);
}
function closeEditPerson() {
    document.getElementById('editPersonModal').style.display = 'none';
}
function saveEditPerson() {
    const id = document.getElementById('editPersonId').value;
    const firstName = document.getElementById('editPersonFirstName').value.trim();
    const lastName = document.getElementById('editPersonLastName').value.trim();
    const data = {
        firstName,
        lastName,
        title: document.getElementById('editPersonTitle').value.trim(),
        email: document.getElementById('editPersonEmail').value.trim(),
        phone: document.getElementById('editPersonPhone').value.trim(),
        notes: document.getElementById('editPersonNotes').value.trim(),
        inactive: document.getElementById('editPersonInactive').checked
    };
    if (!data.firstName) { alert('Fornavn er påkrevd'); return; }
    fetch('/api/people/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); else alert('Feil ved lagring'); });
}
function deleteEditPerson() {
    const id = document.getElementById('editPersonId').value;
    const firstName = document.getElementById('editPersonFirstName').value.trim();
    const lastName = document.getElementById('editPersonLastName').value.trim();
    const name = (firstName + ' ' + lastName).trim() || 'denne personen';
    if (!confirm('Slette ' + name + '?\\n\\nDette fjerner kun selve oppføringen. @-referanser i notater og oppgaver beholdes som tekst.')) return;
    fetch('/api/people/' + id, { method: 'DELETE' })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); else alert('Feil ved sletting'); })
        .catch(() => alert('Nettverksfeil'));
}
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeEditPerson();
    if (e.key === 'Enter' && document.getElementById('editPersonModal').style.display === 'flex' && e.target.tagName !== 'TEXTAREA') saveEditPerson();
});

function applyPeopleFilter() {
    const filterEl = document.getElementById('peopleFilter');
    const sortEl = document.getElementById('peopleSort');
    const list = document.getElementById('peopleList');
    if (!list) return;
    const q = (filterEl ? filterEl.value : '').trim().toLowerCase();
    const sort = sortEl ? sortEl.value : 'name-asc';
    const showInactiveEl = document.getElementById('showInactive');
    const showInactive = showInactiveEl ? showInactiveEl.checked : false;
    const cards = Array.from(list.querySelectorAll('.person-card'));
    let visible = 0;
    cards.forEach(c => {
        const inactive = c.dataset.inactive === '1';
        const match = (!q || (c.dataset.search || '').includes(q)) && (showInactive || !inactive);
        c.style.display = match ? '' : 'none';
        if (match) visible++;
    });
    cards.sort((a, b) => {
        // Always push inactive to the bottom, regardless of sort field
        const ai = a.dataset.inactive === '1' ? 1 : 0;
        const bi = b.dataset.inactive === '1' ? 1 : 0;
        if (ai !== bi) return ai - bi;
        if (sort === 'name-asc') return a.dataset.name.localeCompare(b.dataset.name, 'nb');
        if (sort === 'name-desc') return b.dataset.name.localeCompare(a.dataset.name, 'nb');
        const ra = parseInt(a.dataset.refs || '0', 10), rb = parseInt(b.dataset.refs || '0', 10);
        if (sort === 'refs-desc') return rb - ra || a.dataset.name.localeCompare(b.dataset.name, 'nb');
        if (sort === 'refs-asc') return ra - rb || a.dataset.name.localeCompare(b.dataset.name, 'nb');
        return 0;
    });
    cards.forEach(c => list.appendChild(c));
    const countEl = document.getElementById('peopleCount');
    if (countEl) countEl.textContent = visible + ' av ' + cards.length;
}
applyPeopleFilter();

function togglePerson(header) {
    const card = header.closest('.person-card');
    const details = card.querySelector('.person-details');
    const chev = header.querySelector('.person-chev');
    const open = details.style.display !== 'none';
    details.style.display = open ? 'none' : '';
    if (chev) chev.style.transform = open ? '' : 'rotate(90deg)';
}

function expandAllPeople(expand) {
    document.querySelectorAll('#peopleList .person-card').forEach(card => {
        const details = card.querySelector('.person-details');
        const chev = card.querySelector('.person-chev');
        details.style.display = expand ? '' : 'none';
        if (chev) chev.style.transform = expand ? 'rotate(90deg)' : '';
    });
}
</script>`));
        return;
    }

    // Editor: new note
    if (pathname === '/editor') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(editorPageHtml('', '', ''));
        return;
    }

    // Editor: edit existing file
    const editorMatch = pathname.match(/^\/editor\/([^/]+)\/([^/]+\.md)$/);
    if (editorMatch) {
        const [, week, file] = editorMatch;
        const filePath = path.join(dataDir(), week, file);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(dataDir()))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        let content = '';
        try { content = fs.readFileSync(filePath, 'utf-8'); } catch {}
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(editorPageHtml(week, file, content));
        return;
    }

    // Presentation: render note as reveal.js slideshow
    const presentMatch = pathname.match(/^\/present\/([^/]+)\/([^/]+\.md)$/);
    if (presentMatch) {
        const [, weekRaw, fileRaw] = presentMatch;
        const week = decodeURIComponent(weekRaw);
        const file = decodeURIComponent(fileRaw);
        const filePath = path.join(dataDir(), week, file);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(dataDir()))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        let content = '';
        try { content = fs.readFileSync(filePath, 'utf-8'); } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Notat ikke funnet');
            return;
        }
        const styleParam = url.searchParams.get('style');
        const meta = getNoteMeta(week, file);
        const style = styleParam || meta.presentationStyle || 'paper';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(presentationPageHtml(week, file, content, style));
        return;
    }


    // API: summarize week
    if (pathname === '/api/summarize' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const { week } = body;
            if (!week || week.includes('/') || week.includes('\\')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ugyldig uke' }));
                return;
            }
            const summary = await summarizeWeek(week);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, summary }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API: search md files
    if (pathname === '/api/search' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('[]');
            return;
        }
        const results = searchMdFiles(q.trim());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
        return;
    }

    // API: save file
    if (pathname === '/api/save' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const { folder, file, content, append, type, presentationStyle, autosave } = body;

            if (!folder || !file || typeof content !== 'string') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Mangler mappe, filnavn eller innhold' }));
                return;
            }
            if (!file.endsWith('.md') || file.includes('/') || file.includes('\\') || folder.includes('/') || folder.includes('\\')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ugyldig mappe eller filnavn' }));
                return;
            }

            const dirPath = path.resolve(dataDir(), folder);
            if (!dirPath.startsWith(path.resolve(dataDir()))) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden' }));
                return;
            }

            fs.mkdirSync(path.join(dataDir(), folder), { recursive: true });
            const filePath = path.join(dataDir(), folder, file);
            if (append && fs.existsSync(filePath)) {
                fs.appendFileSync(filePath, '\n\n' + content, 'utf-8');
            } else {
                fs.writeFileSync(filePath, content, 'utf-8');
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, path: `/${folder}/${file}` }));

            const now = new Date().toISOString();
            const existing = getNoteMeta(folder, file);
            const saves = existing.saves || [];
            if (!autosave) saves.push(now);
            const updates = { type: type || existing.type || 'note', modified: now, saves };
            if (presentationStyle) updates.presentationStyle = presentationStyle;
            if (!existing.created) updates.created = now;
            setNoteMeta(folder, file, updates);
            syncMentions(content);
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Serverfeil: ' + e.message }));
        }
        return;
    }

    // Match /:week/:file.md — render markdown
    const match = pathname.match(/^\/([^/]+)\/([^/]+\.md)$/);
    if (match) {
        const [, week, file] = match;
        const filePath = path.join(dataDir(), week, file);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(dataDir()))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(filePath, 'utf-8', (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(pageHtml('Ikke funnet', '<h1>404</h1><p>Filen ble ikke funnet.</p><p><a href="/">← Tilbake</a></p>'));
                return;
            }

            const rendered = linkMentions(marked(content));
            const name = file.replace('.md', '');
            const editLink = `/editor/${week}/${encodeURIComponent(file)}`;
            const body = `<div class="md-content">${rendered}</div>`;

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(pageHtml(`${name} — ${week}`, body, `<a href="${editLink}">✏️ Rediger</a>`));
        });
        return;
    }

    // Tasks page
    if (pathname === '/tasks') {
        const tasks = loadTasks();
        const tasksJson = JSON.stringify(tasks).replace(/</g, '\\u003c');
        const body = `
        <div class="breadcrumb"><a href="/">Ukenotater</a> / Oppgaver</div>
        <h1>☑️ Oppgaver</h1>
        <div style="display:flex;gap:8px;margin-bottom:20px">
            <input type="text" id="taskInput" placeholder="Ny oppgave..." style="flex:1;padding:10px 14px;border:2px solid #e8e2d2;border-radius:8px;font-size:1em;outline:none" />
            <button onclick="addTask()" style="padding:10px 20px;background:#48bb78;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:1em">Legg til</button>
        </div>
        <div style="margin-bottom:16px"><label style="cursor:pointer;font-size:0.9em;color:#4a5568;user-select:none"><input type="checkbox" id="showDone" onchange="localStorage.setItem('showDone',this.checked);renderTasks()" style="margin-right:6px" />Vis fullførte oppgaver</label></div>
        <div id="taskList"></div>
        ${commentModalHtml()}
        ${noteModalHtml()}
        <div id="mergeModal" class="page-modal dark" onclick="if(event.target===this)closeMergeModal()"><div class="page-modal-card"><h3 style="color:#c05621">⚠️ Slå sammen oppgaver</h3><p style="color:#4a5568;font-size:0.9em;margin-bottom:16px">Den første oppgaven beholdes. Den andre legges til som notat og slettes.</p><div style="background:#fff8f0;border:1px solid #fbd38d;border-radius:8px;padding:12px;margin-bottom:8px"><div style="font-size:0.75em;color:#c05621;font-weight:600;margin-bottom:4px">BEHOLDER</div><div id="mergeTgtText" style="font-weight:600;color:#2d3748"></div></div><div style="background:#fff5f5;border:1px solid #fed7d7;border-radius:8px;padding:12px;margin-bottom:20px"><div style="font-size:0.75em;color:#c53030;font-weight:600;margin-bottom:4px">SLETTES</div><div id="mergeSrcText" style="color:#2d3748"></div></div><div class="page-modal-actions"><button class="page-modal-btn cancel" onclick="closeMergeModal()">Avbryt</button><button class="page-modal-btn orange" style="padding:8px 20px" onclick="confirmMerge()">Slå sammen</button></div></div></div>
        <script>
        let tasks = ${tasksJson};

        const taskInput = document.getElementById('taskInput');
        taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

        function renderTasks() {
            const list = document.getElementById('taskList');
            if (tasks.length === 0) {
                list.innerHTML = '<p style="color:#718096;font-style:italic">Ingen oppgaver ennå.</p>';
                return;
            }

            // Group by week
            const byWeek = {};
            tasks.forEach(t => {
                const w = t.week || 'Uten uke';
                if (!byWeek[w]) byWeek[w] = [];
                byWeek[w].push(t);
            });

            // Sort weeks descending
            const sortedWeeks = Object.keys(byWeek).sort((a, b) => b.localeCompare(a));

            let html = '';
            const showDone = document.getElementById('showDone').checked;
            sortedWeeks.forEach(w => {
                const weekTasks = byWeek[w];
                const pending = weekTasks.filter(t => !t.done);
                const done = weekTasks.filter(t => t.done);
                const total = weekTasks.length;
                const doneCount = done.length;

                if (!showDone && pending.length === 0) return;

                html += '<div style="margin-bottom:24px">';
                html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
                html += '<span style="font-size:1.15em;font-weight:600;color:#2a4365">Uke ' + escapeHtml(w) + '</span>';
                html += '<span style="font-size:0.85em;color:#718096">' + doneCount + '/' + total + ' fullført</span>';
                html += '</div>';
                pending.forEach(t => { html += taskHtml(t); });
                if (showDone) { done.forEach(t => { html += taskHtml(t); }); }
                html += '</div>';
            });
            list.innerHTML = html;
        }

        function taskHtml(t) {
            const checked = t.done ? 'checked' : '';
            const textStyle = t.done ? 'text-decoration:line-through;color:#a0aec0' : '';
            const completedDate = t.done && t.completedAt ? '<span style="font-size:0.8em;color:#a0aec0;white-space:nowrap">' + t.completedAt.slice(0, 16).replace('T', ' ') + '</span>' : '';
            const commentLink = t.commentFile ? '<a href="/' + t.commentFile + '" style="color:#2b6cb0;font-size:0.85em;text-decoration:none" title="Se kommentar">📝</a>' : '';
            const hasNote = t.note && t.note.trim();
            const noteBtn = '<button onclick="openNoteModal(\\'' + t.id + '\\')" style="background:none;border:none;cursor:pointer;font-size:1em;opacity:' + (hasNote ? '1' : '0.35') + '" title="' + (hasNote ? 'Rediger notat' : 'Legg til notat') + '">📓</button>';
            const borderColor = t.done ? '#a0aec0' : '#2b6cb0';
            const noteHtml = hasNote ? '<div class="md-content" style="padding:4px 14px 8px 46px;font-size:0.85em;color:#4a5568;background:#fffdf7;border-left:4px solid ' + borderColor + ';border-radius:0 0 8px 8px;margin-top:-4px">' + linkMentions(marked.parse(t.note)) + '</div>' : '';
            const handle = t.done ? '' : '<span class="drag-handle" style="cursor:grab;color:#d6cdb6;font-size:1.1em;padding:0 2px;user-select:none" title="Dra for å sortere">⠿</span>';
            return '<div data-id="' + t.id + '" draggable="' + (!t.done) + '" style="margin:4px 0" ondragstart="onDragStart(event)" ondragover="onDragOver(event)" ondrop="onDrop(event)" ondragend="onDragEnd(event)">'
                + '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fffdf7;border-radius:' + (hasNote ? '8px 8px 0 0' : '8px') + ';border-left:4px solid ' + borderColor + '">'
                + handle
                + '<input type="checkbox" ' + checked + ' onchange="toggleTask(\\'' + t.id + '\\')" style="width:18px;height:18px;cursor:pointer" />'
                + '<span style="flex:1;' + textStyle + '">' + linkMentions(escapeHtml(t.text)) + '</span>'
                + completedDate
                + commentLink
                + noteBtn
                + '<button onclick="editTask(\\'' + t.id + '\\')" style="background:none;border:none;cursor:pointer;color:#2b6cb0;font-size:1em" title="Rediger">✏️</button>'
                + '<button onclick="deleteTask(\\'' + t.id + '\\')" style="background:none;border:none;cursor:pointer;color:#e53e3e;font-size:1.1em" title="Slett">✕</button>'
                + '</div>'
                + noteHtml
                + '</div>';
        }

        function escapeHtml(s) {
            return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        let mentionPeople = [];
        fetch('/api/people').then(r => r.json()).then(p => { mentionPeople = p; renderTasks(); });
        function linkMentions(html) {
            if (!html) return html;
            return html.replace(/(^|[\\s\\n(\\[>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g, function(m, pre, name) {
                const p = mentionPeople.find(x => x.name === name || (x.key && x.key === name.toLowerCase()));
                const display = p ? (p.firstName ? (p.lastName ? p.firstName + ' ' + p.lastName : p.firstName) : p.name) : name;
                const key = p ? (p.key || (p.name || '').toLowerCase()) : name.toLowerCase();
                return pre + '<a href="/people" class="mention-link" data-person-key="' + escapeHtml(key) + '">' + escapeHtml(display) + '</a>';
            });
        }

        async function addTask() {
            const text = taskInput.value.trim();
            if (!text) return;
            taskInput.value = '';
            const resp = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            tasks = await resp.json();
            renderTasks();
            taskInput.focus();
        }

        let pendingToggleId = null;

        function toggleTask(id) {
            const task = tasks.find(t => t.id === id);
            if (task && !task.done) {
                pendingToggleId = id;
                document.getElementById('commentTaskText').textContent = task.text;
                document.getElementById('commentText').value = '';
                document.getElementById('commentModal').style.display = 'flex';
                setTimeout(() => document.getElementById('commentText').focus(), 100);
            } else {
                doToggle(id, '');
            }
        }

        function cancelComment() {
            document.getElementById('commentModal').style.display = 'none';
            pendingToggleId = null;
            renderTasks();
        }

        async function submitComment(withComment) {
            const comment = withComment ? document.getElementById('commentText').value.trim() : '';
            document.getElementById('commentModal').style.display = 'none';
            await doToggle(pendingToggleId, comment);
            pendingToggleId = null;
        }

        async function doToggle(id, comment) {
            const resp = await fetch('/api/tasks/' + id + '/toggle', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment })
            });
            tasks = await resp.json();
            renderTasks();
        }

        document.addEventListener('keydown', function(e) {
            if (document.getElementById('commentModal').style.display === 'flex') {
                if (e.key === 'Escape') cancelComment();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(true);
            }
        });

        async function deleteTask(id) {
            if (!confirm('Er du sikker på at du vil slette denne oppgaven?')) return;
            const resp = await fetch('/api/tasks/' + id, { method: 'DELETE' });
            tasks = await resp.json();
            renderTasks();
        }

        async function editTask(id) {
            var task = tasks.find(t => t.id === id);
            if (!task) return;
            var newText = prompt('Rediger oppgave:', task.text);
            if (newText === null || newText.trim() === '' || newText.trim() === task.text) return;
            var resp = await fetch('/api/tasks/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: newText.trim() })
            });
            tasks = await resp.json();
            renderTasks();
        }

        let dragSrcId = null;
        function onDragStart(e) {
            dragSrcId = e.currentTarget.dataset.id;
            e.currentTarget.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
        }
        function dropZone(e) {
            const rect = e.currentTarget.getBoundingClientRect();
            const relY = (e.clientY - rect.top) / rect.height;
            return relY < 0.3 ? 'before' : relY > 0.7 ? 'after' : 'merge';
        }
        function clearDragStyles() {
            document.querySelectorAll('[data-id]').forEach(el => {
                el.style.borderTop = '';
                el.style.borderBottom = '';
                el.style.outline = '';
            });
        }
        function onDragOver(e) {
            e.preventDefault();
            clearDragStyles();
            const target = e.currentTarget;
            if (target.dataset.id === dragSrcId) return;
            const zone = dropZone(e);
            if (zone === 'before') target.style.borderTop = '2px solid #2b6cb0';
            else if (zone === 'after') target.style.borderBottom = '2px solid #2b6cb0';
            else target.style.outline = '2px solid #ed8936';
        }
        function onDragEnd(e) {
            e.currentTarget.style.opacity = '';
            clearDragStyles();
        }
        async function onDrop(e) {
            e.preventDefault();
            clearDragStyles();
            const targetId = e.currentTarget.dataset.id;
            if (!dragSrcId || dragSrcId === targetId) return;
            const zone = dropZone(e);
            if (zone === 'merge') {
                const src = tasks.find(t => t.id === dragSrcId);
                const tgt = tasks.find(t => t.id === targetId);
                if (!src || !tgt) return;
                document.getElementById('mergeSrcText').textContent = src.text;
                document.getElementById('mergeTgtText').textContent = tgt.text;
                pendingMerge = { srcId: dragSrcId, tgtId: targetId };
                document.getElementById('mergeModal').style.display = 'flex';
            } else {
                const srcIdx = tasks.findIndex(t => t.id === dragSrcId);
                let tgtIdx = tasks.findIndex(t => t.id === targetId);
                const moved = tasks.splice(srcIdx, 1)[0];
                if (zone === 'after') tgtIdx = tasks.findIndex(t => t.id === targetId) + 1;
                else tgtIdx = tasks.findIndex(t => t.id === targetId);
                tasks.splice(tgtIdx, 0, moved);
                renderTasks();
                await fetch('/api/tasks/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: tasks.map(t => t.id) })
                });
            }
        }
        let pendingNoteId = null;
        let pendingMerge = null;
        function closeMergeModal() {
            document.getElementById('mergeModal').style.display = 'none';
            pendingMerge = null;
        }
        async function confirmMerge() {
            if (!pendingMerge) return;
            const resp = await fetch('/api/tasks/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pendingMerge)
            });
            tasks = await resp.json();
            closeMergeModal();
            renderTasks();
        }
        function openNoteModal(id) {
            const task = tasks.find(t => t.id === id);
            if (!task) return;
            pendingNoteId = id;
            document.getElementById('noteTaskText').textContent = task.text;
            document.getElementById('noteText').value = task.note || '';
            document.getElementById('noteModal').style.display = 'flex';
            setTimeout(() => document.getElementById('noteText').focus(), 100);
        }
        function closeNoteModal() {
            document.getElementById('noteModal').style.display = 'none';
            pendingNoteId = null;
        }
        async function saveNote() {
            if (!pendingNoteId) return;
            const note = document.getElementById('noteText').value.trim();
            const resp = await fetch('/api/tasks/' + pendingNoteId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note })
            });
            tasks = await resp.json();
            closeNoteModal();
            renderTasks();
        }
        document.addEventListener('keydown', function(e) {
            if (document.getElementById('noteModal').style.display === 'flex') {
                if (e.key === 'Escape') closeNoteModal();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote();
            }
            if (document.getElementById('mergeModal').style.display === 'flex') {
                if (e.key === 'Escape') closeMergeModal();
                if (e.key === 'Enter') confirmMerge();
            }
        });

        document.getElementById('showDone').checked = localStorage.getItem('showDone') === 'true';
        renderTasks();
        </script>
        <script src="/mention-autocomplete.js"></script>
        <script>
        initMentionAutocomplete(document.getElementById('taskInput'));
        // Init autocomplete on note modal textarea when it opens
        (function() {
            const orig = window.openNoteModal;
            window.openNoteModal = function(id) { orig(id); setTimeout(() => initMentionAutocomplete(document.getElementById('noteText')), 120); };
        })();
        // Init autocomplete on comment modal textarea when it opens
        (function() {
            const orig = window.showCommentModal;
            window.showCommentModal = function(el) { orig(el); setTimeout(() => initMentionAutocomplete(document.getElementById('commentText')), 120); };
        })();
        </script>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Oppgaver', body));
        return;
    }

    // API: merge tasks
    if (pathname === '/api/tasks/merge' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const tasks = loadTasks();
        const src = tasks.find(t => t.id === body.srcId);
        const tgt = tasks.find(t => t.id === body.tgtId);
        if (src && tgt) {
            const parts = [tgt.note, src.text, src.note].filter(Boolean);
            const mergedNote = parts.join('\n');
            syncTaskNote(tgt, mergedNote);
            const filtered = tasks.filter(t => t.id !== body.srcId);
            // Remove results for deleted src task
            saveResults(loadResults().filter(r => r.taskId !== body.srcId));
            saveTasks(filtered);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(filtered));
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Task not found' }));
        }
        return;
    }

    // API: reorder tasks
    if (pathname === '/api/tasks/reorder' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const ids = body.ids;
        const tasks = loadTasks();
        const ordered = ids.map(id => tasks.find(t => t.id === id)).filter(Boolean);
        const rest = tasks.filter(t => !ids.includes(t.id));
        saveTasks([...ordered, ...rest]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: get all results
    if (pathname === '/api/results' && req.method === 'GET') {
        const week = new URL('http://x' + req.url).searchParams.get('week');
        let results = loadResults();
        if (week) results = results.filter(r => r.week === week);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
        return;
    }

    // API: edit result
    const editResultMatch = pathname.match(/^\/api\/results\/([^/]+)$/);
    if (editResultMatch && req.method === 'PUT') {
        const data = JSON.parse(await readBody(req));
        const results = loadResults();
        const r = results.find(r => r.id === editResultMatch[1]);
        if (!r) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
        if (data.text) r.text = data.text.trim();
        saveResults(results);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: delete result
    if (editResultMatch && req.method === 'DELETE') {
        saveResults(loadResults().filter(r => r.id !== editResultMatch[1]));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: get all people
    if (pathname === '/api/people' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadPeople()));
        return;
    }

    // API: list meetings (?week=YYYY-WNN, ?upcoming=N days)
    if (pathname === '/api/meeting-types' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadMeetingTypes()));
        return;
    }
    if (pathname === '/api/meeting-types' && req.method === 'PUT') {
        try {
            const data = JSON.parse(await readBody(req) || '[]');
            if (!Array.isArray(data)) throw new Error('expected array');
            const seenKeys = new Set();
            const cleaned = data.map(t => {
                let key = (t && typeof t.key === 'string') ? t.key.trim() : '';
                const label = (t && typeof t.label === 'string') ? t.label.trim() : '';
                const icon = (t && typeof t.icon === 'string') ? t.icon.trim() : '';
                if (!label) return null;
                if (!key || seenKeys.has(key)) {
                    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
                    key = base;
                    let n = 2;
                    while (seenKeys.has(key)) key = base + '-' + (n++);
                }
                seenKeys.add(key);
                return { key, icon, label };
            }).filter(Boolean);
            saveMeetingTypes(cleaned);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, types: cleaned }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        }
        return;
    }

    if (pathname === '/api/meetings' && req.method === 'GET') {
        const sp = new URL('http://x' + req.url).searchParams;
        let meetings = loadMeetings();
        if (sp.get('week')) {
            const w = sp.get('week');
            meetings = meetings.filter(m => dateToIsoWeek(new Date(m.date + 'T00:00:00Z')) === w);
        }
        if (sp.get('upcoming')) {
            const days = parseInt(sp.get('upcoming'), 10) || 7;
            const now = new Date();
            const today = now.toISOString().slice(0, 10);
            const cutoff = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
            meetings = meetings.filter(m => m.date >= today && m.date <= cutoff);
        }
        meetings.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(meetings));
        return;
    }

    // API: create meeting
    if (pathname === '/api/meetings' && req.method === 'POST') {
        const data = JSON.parse(await readBody(req) || '{}');
        if (!data.date || !data.title) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'date and title required' }));
            return;
        }
        const meetings = loadMeetings();
        const validTypes = loadMeetingTypes().map(t => t.key);
        const m = {
            id: meetingId(),
            date: data.date,
            start: data.start || '',
            end: data.end || '',
            title: String(data.title).trim(),
            type: validTypes.includes(data.type) ? data.type : 'meeting',
            attendees: Array.isArray(data.attendees) ? data.attendees : extractMentions(data.attendees || ''),
            location: (data.location || '').trim(),
            notes: (data.notes || '').trim(),
            created: new Date().toISOString()
        };
        meetings.push(m);
        saveMeetings(meetings);
        try { syncMentions(m.title, m.notes, (m.attendees || []).map(a => '@' + a).join(' ')); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    // API: update / delete meeting
    const meetingMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
    if (meetingMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
        const id = meetingMatch[1];
        const meetings = loadMeetings();
        const idx = meetings.findIndex(m => m.id === id);
        if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'not found' }));
            return;
        }
        if (req.method === 'DELETE') {
            meetings.splice(idx, 1);
            saveMeetings(meetings);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }
        const data = JSON.parse(await readBody(req) || '{}');
        const m = meetings[idx];
        if (data.date !== undefined) m.date = data.date;
        if (data.start !== undefined) m.start = data.start;
        if (data.end !== undefined) m.end = data.end;
        if (data.title !== undefined) m.title = String(data.title).trim();
        if (data.type !== undefined && loadMeetingTypes().some(t => t.key === data.type)) m.type = data.type;
        if (data.attendees !== undefined) m.attendees = Array.isArray(data.attendees) ? data.attendees : extractMentions(data.attendees || '');
        if (data.location !== undefined) m.location = (data.location || '').trim();
        if (data.notes !== undefined) m.notes = (data.notes || '').trim();
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        try { syncMentions(m.title, m.notes, (m.attendees || []).map(a => '@' + a).join(' ')); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    // API: list all contexts (with active flag)
    if (pathname === '/api/contexts' && req.method === 'GET') {
        const active = getActiveContext();
        const list = listContexts().map(name => ({
            id: name,
            active: name === active,
            settings: getContextSettings(name)
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ active, contexts: list }));
        return;
    }

    // API: switch active context
    if (pathname === '/api/contexts/switch' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { id } = JSON.parse(body || '{}');
                const next = setActiveContext(id);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, active: next }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
        });
        return;
    }

    // API: create new context
    if (pathname === '/api/contexts' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { name, icon, description, remote } = JSON.parse(body || '{}');
                if (!name) throw new Error('Mangler navn');
                const id = createContext(name, { name, icon: icon || '📁', description: description || '', remote: remote || '' });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, id }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
        });
        return;
    }

    // API: read/update context settings
    const ctxMeetingTypesMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/meeting-types$/);
    if (ctxMeetingTypesMatch && req.method === 'GET') {
        const id = safeName(ctxMeetingTypesMatch[1]);
        if (!listContexts().includes(id)) { res.writeHead(404); res.end('[]'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadMeetingTypes(id)));
        return;
    }
    if (ctxMeetingTypesMatch && req.method === 'PUT') {
        const id = safeName(ctxMeetingTypesMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'context not found' }));
            return;
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '[]');
                if (!Array.isArray(data)) throw new Error('expected array');
                const seenKeys = new Set();
                const cleaned = data.map(t => {
                    let key = (t && typeof t.key === 'string') ? t.key.trim() : '';
                    const label = (t && typeof t.label === 'string') ? t.label.trim() : '';
                    const icon = (t && typeof t.icon === 'string') ? t.icon.trim() : '';
                    if (!label) return null;
                    if (!key || seenKeys.has(key)) {
                        const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
                        key = base;
                        let n = 2;
                        while (seenKeys.has(key)) key = base + '-' + (n++);
                    }
                    seenKeys.add(key);
                    return { key, icon, label };
                }).filter(Boolean);
                saveMeetingTypes(cleaned, id);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, types: cleaned }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
        });
        return;
    }

    const ctxSettingsMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/settings$/);
    if (ctxSettingsMatch && req.method === 'GET') {
        const id = safeName(ctxSettingsMatch[1]);
        if (!listContexts().includes(id)) { res.writeHead(404); res.end('{}'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getContextSettings(id)));
        return;
    }
    if (ctxSettingsMatch && req.method === 'PUT') {
        const id = safeName(ctxSettingsMatch[1]);
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                setContextSettings(id, data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
        });
        return;
    }

    // API: commit pending changes in a context
    const ctxCommitMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/commit$/);
    if (ctxCommitMatch && req.method === 'POST') {
        const id = safeName(ctxCommitMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            const dir = path.join(CONTEXTS_DIR, id);
            gitInitIfNeeded(dir, getContextSettings(id).name || id);
            let message = '';
            try { message = JSON.parse(body || '{}').message || ''; } catch {}
            const result = gitCommitAll(dir, message || `Manuell commit (${new Date().toISOString()})`);
            res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    // API: git status for a context (dirty + last commit)
    const ctxStatusMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/git$/);
    if (ctxStatusMatch && req.method === 'GET') {
        const id = safeName(ctxStatusMatch[1]);
        if (!listContexts().includes(id)) { res.writeHead(404); res.end('{}'); return; }
        const dir = path.join(CONTEXTS_DIR, id);
        const isRepo = gitIsRepo(dir);
        const dirty = isRepo ? gitIsDirty(dir) : false;
        const last = isRepo ? gitLastCommit(dir) : null;
        const remote = isRepo ? gitGetRemote(dir) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ isRepo, dirty, last, remote }));
        return;
    }

    // API: push a context's repo
    const ctxPushMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/push$/);
    if (ctxPushMatch && req.method === 'POST') {
        const id = safeName(ctxPushMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        const dir = path.join(CONTEXTS_DIR, id);
        const result = gitPush(dir);
        res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: get rendered note content
    const noteViewMatch = pathname.match(/^\/api\/notes\/([^/]+)\/([^/]+)\/render$/);
    if (noteViewMatch && req.method === 'GET') {
        const week = decodeURIComponent(noteViewMatch[1]);
        const file = decodeURIComponent(noteViewMatch[2]);
        const filePath = path.join(dataDir(), week, file);
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const html = linkMentions(marked(raw));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, html, name: file.replace(/\.md$/, ''), week }));
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Not found' }));
        }
        return;
    }

    // API: update person
    const peopleUpdateMatch = pathname.match(/^\/api\/people\/([^/]+)$/);
    if (peopleUpdateMatch && req.method === 'PUT') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const people = loadAllPeople();
                const idx = people.findIndex(p => p.id === peopleUpdateMatch[1]);
                if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
                const person = people[idx];
                if (data.firstName) {
                    person.firstName = data.firstName;
                    person.lastName = data.lastName || '';
                    // @mention key stays as first name for compatibility
                    person.name = data.firstName;
                    person.key = data.firstName.toLowerCase();
                }
                if (data.title !== undefined) person.title = data.title;
                if (data.email !== undefined) person.email = data.email;
                if (data.phone !== undefined) person.phone = data.phone;
                if (data.notes !== undefined) person.notes = data.notes;
                if (data.inactive !== undefined) person.inactive = !!data.inactive;
                savePeople(people);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, person }));
            } catch { res.writeHead(400); res.end(JSON.stringify({ ok: false })); }
        });
        return;
    }

    if (peopleUpdateMatch && req.method === 'DELETE') {
        const people = loadAllPeople();
        const idx = people.findIndex(p => p.id === peopleUpdateMatch[1]);
        if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Not found' }));
            return;
        }
        // Tombstone instead of removing, so syncMentions does not recreate
        // the person from existing @-references in notes/tasks.
        people[idx].deleted = true;
        people[idx].deletedAt = new Date().toISOString();
        savePeople(people);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: get all tasks
    if (pathname === '/api/tasks' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadTasks()));
        return;
    }

    // API: add task
    if (pathname === '/api/tasks' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const tasks = loadTasks();
        tasks.push({ id: Date.now().toString(36), text: body.text, done: false, created: new Date().toISOString(), week: body.week || getCurrentYearWeek() });
        saveTasks(tasks);
        syncMentions(body.text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: edit task text / note
    const editTaskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (editTaskMatch && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req));
        const tasks = loadTasks();
        const task = tasks.find(t => t.id === editTaskMatch[1]);
        if (task) {
            if (body.text) task.text = body.text.trim();
            if (body.note !== undefined) syncTaskNote(task, body.note);
            else syncMentions(task.text, task.note);
            saveTasks(tasks);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: toggle task
    const toggleMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/toggle$/);
    if (toggleMatch && req.method === 'PUT') {
        let comment = '';
        try {
            const body = JSON.parse(await readBody(req));
            comment = (body.comment || '').trim();
        } catch {}

        const tasks = loadTasks();
        const task = tasks.find(t => t.id === toggleMatch[1]);
        if (task) {
            task.done = !task.done;
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            if (task.done) {
                task.completedAt = now.toISOString();
                task.completedWeek = getCurrentYearWeek();
            } else {
                delete task.completedAt;
                delete task.completedWeek;
            }
            if (task.done && comment) {
                const week = task.completedWeek || task.week || getCurrentYearWeek();
                const { results: resultTexts, cleanNote: cleanComment } = extractResults(comment);
                if (resultTexts.length > 0) {
                    const mentionNames = extractMentions(comment);
                    let allResults = loadResults();
                    resultTexts.forEach(text => {
                        const textMentions = extractMentions(text);
                        const allMentions = [...new Set([...mentionNames, ...textMentions])];
                        allResults.push({
                            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                            text,
                            week,
                            taskId: task.id,
                            taskText: task.text,
                            people: allMentions,
                            created: new Date().toISOString()
                        });
                    });
                    saveResults(allResults);
                    syncMentions(task.text, comment);
                }
                const fileName = `oppgave-${task.id}.md`;
                fs.mkdirSync(path.join(dataDir(), week), { recursive: true });
                fs.writeFileSync(path.join(dataDir(), week, fileName),
                    `# ✅ ${task.text}\n\n${cleanComment}\n\n---\n*Fullført: ${dateStr}*\n`, 'utf-8');
                task.commentFile = `${week}/${fileName}`;
                setNoteMeta(week, fileName, { type: 'task' });
            }
        }
        saveTasks(tasks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: delete task
    const deleteMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
        let tasks = loadTasks();
        tasks = tasks.filter(t => t.id !== deleteMatch[1]);
        saveTasks(tasks);
        // Remove results for deleted task
        saveResults(loadResults().filter(r => r.taskId !== deleteMatch[1]));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: get note metadata
    const metaMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/meta$/);
    if (metaMatch && req.method === 'GET') {
        const [, week, file] = metaMatch;
        const meta = getNoteMeta(week, decodeURIComponent(file));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(meta));
        return;
    }

    // API: toggle pin
    const pinMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/pin$/);
    if (pinMatch && req.method === 'PUT') {
        const [, week, file] = pinMatch;
        const existing = getNoteMeta(week, decodeURIComponent(file));
        setNoteMeta(week, decodeURIComponent(file), { pinned: !existing.pinned });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pinned: !existing.pinned }));
        return;
    }

    // API: delete note
    const deleteNoteMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)$/);
    if (deleteNoteMatch && req.method === 'DELETE') {
        const [, week, file] = deleteNoteMatch;
        const filePath = path.join(dataDir(), week, decodeURIComponent(file));
        try {
            fs.unlinkSync(filePath);
            deleteNoteMeta(week, decodeURIComponent(file));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Filen finnes ikke' }));
        }
        return;
    }

    // Shared mention autocomplete script
    if (pathname === '/mention-autocomplete.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(`
function initMentionAutocomplete(el) {
    let people = [];
    let dropdown = null;
    fetch('/api/people').then(r => r.json()).then(p => { people = (p || []).filter(x => !x.inactive); });

    function getMentionQuery() {
        const val = el.value, pos = el.selectionStart;
        const before = val.slice(0, pos);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) return null;
        const afterAt = before.slice(atIdx + 1);
        if (/\\s/.test(afterAt)) return null;
        if (atIdx > 0 && !/[\\s\\n(,;]/.test(before[atIdx - 1])) return null;
        return afterAt.toLowerCase();
    }

    function showDropdown(query) {
        closeDropdown();
        const matches = people.filter(p => p.key.startsWith(query));
        if (matches.length === 0) return;
        dropdown = document.createElement('div');
        dropdown.style.cssText = 'position:fixed;background:white;border:1px solid #e8e2d2;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;min-width:180px;overflow:hidden;font-family:inherit';
        matches.forEach((p, i) => {
            const item = document.createElement('div');
            item.textContent = '@' + p.name;
            item.dataset.name = p.name;
            item.dataset.idx = i;
            item.style.cssText = 'padding:8px 14px;cursor:pointer;font-size:0.9em;color:#2d3748';
            item.addEventListener('mouseenter', () => setActive(i));
            item.addEventListener('mousedown', e => { e.preventDefault(); selectPerson(p.name); });
            dropdown.appendChild(item);
        });
        const rect = el.getBoundingClientRect();
        document.body.appendChild(dropdown);
        const ddRect = dropdown.getBoundingClientRect();
        const vh = window.innerHeight;
        let top = rect.bottom + 4;
        // If we'd overflow the viewport bottom, place above the field instead
        if (top + ddRect.height > vh - 8) {
            top = Math.max(8, rect.top - ddRect.height - 4);
        }
        dropdown.style.top = top + 'px';
        dropdown.style.left = Math.max(8, rect.left) + 'px';
        setActive(0);
    }

    function setActive(idx) {
        if (!dropdown) return;
        dropdown.querySelectorAll('div').forEach((el, i) => {
            el.style.background = i === idx ? '#ebf8ff' : '';
            el.style.color = i === idx ? '#2b6cb0' : '#2d3748';
            el.dataset.active = i === idx ? 'true' : '';
        });
    }

    function getActiveIdx() {
        if (!dropdown) return -1;
        return [...dropdown.querySelectorAll('div')].findIndex(el => el.dataset.active === 'true');
    }

    function selectPerson(name) {
        const val = el.value, pos = el.selectionStart;
        const before = val.slice(0, pos);
        const atIdx = before.lastIndexOf('@');
        const newBefore = before.slice(0, atIdx) + '@' + name + ' ';
        el.value = newBefore + val.slice(pos);
        el.selectionStart = el.selectionEnd = newBefore.length;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        closeDropdown();
        el.focus();
    }

    function closeDropdown() {
        if (dropdown) { dropdown.remove(); dropdown = null; }
    }

    el.addEventListener('input', () => {
        const q = getMentionQuery();
        if (q === null) { closeDropdown(); return; }
        showDropdown(q);
    });

    el.addEventListener('keydown', e => {
        if (!dropdown) return;
        const items = dropdown.querySelectorAll('div');
        const idx = getActiveIdx();
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(idx + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(idx - 1, 0)); }
        else if (e.key === 'Tab' || e.key === 'Enter') {
            if (idx >= 0) { e.preventDefault(); e.stopPropagation(); selectPerson(items[idx].dataset.name); }
        }
        else if (e.key === 'Escape') closeDropdown();
    });

    document.addEventListener('click', e => {
        if (dropdown && !dropdown.contains(e.target) && e.target !== el) closeDropdown();
    }, true);
}
`);
        return;
    }

    // 404 fallback
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageHtml('Ikke funnet', '<h1>404</h1><p><a href="/">← Tilbake</a></p>'));
});

server.listen(PORT, () => {
    console.log(`Weeks server running at http://localhost:${PORT}/`);
    checkExternalTools();
    try { ensureAllContextsInitialised(); } catch (e) { console.error('ctx init', e.message); }
    console.log('Press Ctrl+C to stop');
});
