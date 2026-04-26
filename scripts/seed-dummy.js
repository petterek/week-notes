// Seed two demo contexts (demo-jobb, demo-hjem) with dummy data.
// Idempotent-ish: refuses to overwrite an existing context.
// Run from repo root:   node scripts/seed-dummy.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

function dateToIsoWeek(d) {
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function isoWeekMonday(yw) {
    const [y, w] = yw.split('-W').map(n => parseInt(n, 10));
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const dow = (jan4.getUTCDay() + 6) % 7;
    const w1 = new Date(jan4); w1.setUTCDate(jan4.getUTCDate() - dow);
    const mon = new Date(w1); mon.setUTCDate(w1.getUTCDate() + (w - 1) * 7);
    return mon;
}
function shiftWeek(yw, delta) {
    const m = isoWeekMonday(yw); m.setUTCDate(m.getUTCDate() + delta * 7);
    return dateToIsoWeek(m);
}
function dateInWeek(yw, dayIdx) {
    const m = isoWeekMonday(yw); m.setUTCDate(m.getUTCDate() + dayIdx);
    return m.toISOString().slice(0, 10);
}

const NOW = new Date();
const W0 = dateToIsoWeek(NOW);
const Wm1 = shiftWeek(W0, -1);
const Wm2 = shiftWeek(W0, -2);
const Wm3 = shiftWeek(W0, -3);

let WN_VERSION = 'unknown';
try { WN_VERSION = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim(); } catch {}

function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function newPerson(key, first, last, extra = {}) {
    return Object.assign({
        id: rid(), key, name: `${first} ${last}`.trim(), firstName: first, lastName: last,
        created: new Date().toISOString()
    }, extra);
}

function writeContext(id, settings, data) {
    const dir = path.join(DATA, id);
    if (fs.existsSync(dir)) { console.log(`! ${id} exists, skipping`); return; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
    fs.writeFileSync(path.join(dir, '.week-notes'), JSON.stringify({ type: 'week-notes', version: WN_VERSION }, null, 2));
    fs.writeFileSync(path.join(dir, 'people.json'), JSON.stringify(data.people, null, 2));
    fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify(data.tasks, null, 2));
    fs.writeFileSync(path.join(dir, 'meetings.json'), JSON.stringify(data.meetings, null, 2));
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(data.results, null, 2));
    if (data.notes) {
        for (const [week, files] of Object.entries(data.notes)) {
            const wdir = path.join(dir, week);
            fs.mkdirSync(wdir, { recursive: true });
            for (const [name, body] of Object.entries(files)) {
                fs.writeFileSync(path.join(wdir, name), body);
            }
        }
    }
    try {
        execSync('git init -q', { cwd: dir });
        execSync('git add -A', { cwd: dir });
        execSync('git -c user.email=demo@example.com -c user.name=demo commit -q -m "Seed demo data" --no-verify', { cwd: dir });
    } catch (e) { console.warn('git init/commit failed for', id, e.message); }
    console.log(`✓ ${id} seeded`);
}

const jobb = {
    settings: {
        name: 'Demo Jobb',
        icon: '💼',
        description: 'Demonstrasjons-kontekst med jobb-relaterte notater, oppgaver og møter.',
        remote: '',
        theme: 'paper'
    },
    people: [
        newPerson('anna', 'Anna', 'Berg', { title: 'Produkteier', email: 'anna.berg@example.com', phone: '+47 900 11 222', notes: 'Leder produktteamet. Ofte i møter på morgenen.' }),
        newPerson('bjorn', 'Bjørn', 'Dahl', { title: 'Tech Lead', email: 'bjorn.dahl@example.com', notes: 'Backend-arkitekt. Gode innspill på databasevalg.' }),
        newPerson('cecilie', 'Cecilie', 'Eng', { title: 'Designer', email: 'cecilie@example.com', notes: 'Jobber med ny dashboard-skisse.' }),
        newPerson('david', 'David', 'Foss', { title: 'Frontend-utvikler', email: 'david.foss@example.com' }),
        newPerson('eva', 'Eva', 'Grønn', { title: 'Kunde – Nordic Bank', email: 'eva.gronn@nordicbank.example', phone: '+47 905 00 000', notes: 'Hovedkontakt hos Nordic Bank. Foretrekker e-post.' })
    ],
    tasks: [
        { id: rid(), text: 'Forberede demo til @anna fredag', done: false, created: new Date().toISOString(), week: W0 },
        { id: rid(), text: 'Review PR fra @david om autentisering', done: false, created: new Date().toISOString(), week: W0 },
        { id: rid(), text: 'Skrive utkast til arkitektur-dokument med @bjorn', done: false, created: new Date().toISOString(), week: W0,
          note: 'Diskutere valg mellom PostgreSQL og MongoDB. @bjorn lener mot Postgres for konsistens.' },
        { id: rid(), text: 'Bestille konferansebilletter til JavaZone', done: false, created: new Date().toISOString(), week: W0 },
        { id: rid(), text: 'Oppdatere CV på intranettet', done: false, created: new Date().toISOString(), week: shiftWeek(W0, 1) },

        { id: rid(), text: 'Sette opp CI/CD pipeline', done: true, created: new Date().toISOString(), week: Wm1, completedWeek: Wm1, completed: dateInWeek(Wm1, 4) + 'T15:30:00Z' },
        { id: rid(), text: 'Onboarding-møte med @cecilie', done: true, created: new Date().toISOString(), week: Wm1, completedWeek: Wm1, completed: dateInWeek(Wm1, 1) + 'T10:00:00Z' },
        { id: rid(), text: 'Migrere legacy-tjeneste til ny plattform', done: true, created: new Date().toISOString(), week: Wm2, completedWeek: Wm2, completed: dateInWeek(Wm2, 3) + 'T16:00:00Z' },
        { id: rid(), text: 'Workshop om kodekvalitet for teamet', done: true, created: new Date().toISOString(), week: Wm3, completedWeek: Wm2, completed: dateInWeek(Wm2, 0) + 'T13:00:00Z' }
    ],
    meetings: [
        { id: 'm_' + rid(), date: dateInWeek(W0, 0), start: '09:00', end: '09:30', title: 'Daglig standup', type: 'standup', attendees: ['anna', 'bjorn', 'cecilie', 'david'], location: 'Teams', notes: 'Korte oppdateringer fra hver i teamet.', created: new Date().toISOString() },
        { id: 'm_' + rid(), date: dateInWeek(W0, 1), start: '13:00', end: '14:00', title: '1:1 med @anna', type: 'meeting', attendees: ['anna'], location: 'Møterom Fjord', notes: 'Kvartalsvis oppfølging.', created: new Date().toISOString() },
        { id: 'm_' + rid(), date: dateInWeek(W0, 2), start: '10:00', end: '11:30', title: 'Arkitektur-workshop', type: 'meeting', attendees: ['bjorn', 'david'], location: 'Møterom Bre', notes: 'Diskutere valg av database og messaging.', created: new Date().toISOString() },
        { id: 'm_' + rid(), date: dateInWeek(W0, 3), start: '14:00', end: '15:00', title: 'Kundemøte – @eva', type: 'meeting', attendees: ['eva', 'anna'], location: 'Hos kunde', notes: 'Demo av ny dashboard-funksjonalitet.', created: new Date().toISOString() },
        { id: 'm_' + rid(), date: dateInWeek(W0, 4), start: '11:00', end: '12:00', title: 'Sprint review', type: 'meeting', attendees: ['anna', 'bjorn', 'cecilie', 'david'], location: 'Storsalen', notes: '', created: new Date().toISOString() }
    ],
    results: [
        { id: rid(), text: 'CI/CD pipeline er live på prod – alle byggene grønne', week: Wm1, people: ['bjorn'], created: new Date().toISOString() },
        { id: rid(), text: 'Cecilie er fullt onboardet og har første tasks', week: Wm1, people: ['cecilie'], created: new Date().toISOString() },
        { id: rid(), text: 'Legacy-tjeneste migrert uten nedetid 🎉', week: Wm2, people: ['bjorn', 'david'], created: new Date().toISOString() },
        { id: rid(), text: 'Workshop holdt – teamet har nå felles linting-regler', week: Wm2, people: ['anna'], created: new Date().toISOString() }
    ],
    notes: {
        [W0]: {
            'mandag-planlegging.md': `# Mandag — planlegging\n\nUken starter rolig. Hovedfokus:\n\n- [ ] Forberede demo til @anna\n- [ ] Review av @david sin PR\n- [ ] Avklare arkitektur-spørsmål med @bjorn\n\nNotat fra standup: alle på sporet, ingen blockers.\n`,
            'tanker-arkitektur.md': `# Tanker rundt arkitektur\n\n@bjorn og jeg diskuterte i dag valg av database for ny tjeneste.\n\n## Alternativer\n\n| Alternativ | Fordel | Ulempe |\n|---|---|---|\n| PostgreSQL | Konsistens, rik query | Mindre fleksibel for nested data |\n| MongoDB | Fleksibel | Eventuell konsistens kan gi hodebry |\n\nKonklusjon: vi går for **PostgreSQL** med jsonb der vi trenger fleksibilitet.\n`
        },
        [Wm1]: {
            'retrospektiv.md': `# Retrospektiv\n\n## Det som fungerte\n\n- Pair-programming på CI-pipelinen ga god kunnskaps-deling\n- @cecilie kom raskt i gang\n\n## Det som kan bli bedre\n\n- Standupene drar ut — strammere format neste uke\n- For mange context-switches på onsdag\n`
        }
    }
};

const hjem = {
    settings: {
        name: 'Demo Hjem',
        icon: '🏠',
        description: 'Demonstrasjons-kontekst for hjemme-relaterte notater og oppgaver.',
        remote: '',
        theme: 'forest'
    },
    people: [
        newPerson('mor', 'Kari', 'Hansen', { title: 'Mor', phone: '+47 911 22 333', notes: 'Bursdag i mai.' }),
        newPerson('far', 'Per', 'Hansen', { title: 'Far', phone: '+47 922 33 444' }),
        newPerson('lise', 'Lise', 'Hansen', { title: 'Søster', notes: 'Bor i Bergen.' }),
        newPerson('ole', 'Ole', 'Nilsen', { title: 'Nabo', notes: 'Hjelper med snømåking.' }),
        newPerson('marte', 'Marte', 'Vik', { title: 'Trener', notes: 'Crossfit, mandager kl 18.' })
    ],
    tasks: [
        { id: rid(), text: 'Handle inn til søndagsmiddag', done: false, created: new Date().toISOString(), week: W0 },
        { id: rid(), text: 'Bestille service på bilen', done: false, created: new Date().toISOString(), week: W0 },
        { id: rid(), text: 'Ringe @mor om bursdagsplanlegging', done: false, created: new Date().toISOString(), week: W0,
          note: 'Hun ønsker seg noe enkelt — kanskje middag hjemme med @lise?' },
        { id: rid(), text: 'Plante tomater i drivhuset', done: false, created: new Date().toISOString(), week: shiftWeek(W0, 1) },
        { id: rid(), text: 'Booke ferie til høsten', done: false, created: new Date().toISOString(), week: shiftWeek(W0, 2) },

        { id: rid(), text: 'Skifte sommerdekk', done: true, created: new Date().toISOString(), week: Wm1, completedWeek: Wm1, completed: dateInWeek(Wm1, 5) + 'T11:00:00Z' },
        { id: rid(), text: 'Klippe plenen første gang i år', done: true, created: new Date().toISOString(), week: Wm1, completedWeek: Wm1, completed: dateInWeek(Wm1, 6) + 'T14:30:00Z' },
        { id: rid(), text: 'Vårrydding i garasjen sammen med @far', done: true, created: new Date().toISOString(), week: Wm2, completedWeek: Wm2, completed: dateInWeek(Wm2, 5) + 'T16:00:00Z' },
        { id: rid(), text: 'Bestille legetime for årlig sjekk', done: true, created: new Date().toISOString(), week: Wm3, completedWeek: Wm3, completed: dateInWeek(Wm3, 1) + 'T09:30:00Z' }
    ],
    meetings: [
        { id: 'm_' + rid(), date: dateInWeek(W0, 0), start: '18:00', end: '19:00', title: 'Trening med @marte', type: 'meeting', attendees: ['marte'], location: 'Crossfit-senteret', notes: '', created: new Date().toISOString() },
        { id: 'm_' + rid(), date: dateInWeek(W0, 2), start: '17:30', end: '19:00', title: 'Middag hos @mor og @far', type: 'meeting', attendees: ['mor', 'far'], location: 'Foreldrenes hus', notes: '', created: new Date().toISOString() },
        { id: 'm_' + rid(), date: dateInWeek(W0, 5), start: '12:00', end: '14:00', title: 'Kaffe med @lise', type: 'meeting', attendees: ['lise'], location: 'Sentrum', notes: 'Hun er på besøk i helgen.', created: new Date().toISOString() }
    ],
    results: [
        { id: rid(), text: 'Sommerdekk på plass — bilen klar for våren', week: Wm1, people: [], created: new Date().toISOString() },
        { id: rid(), text: 'Plenen klippet og hagen ser bra ut', week: Wm1, people: [], created: new Date().toISOString() },
        { id: rid(), text: 'Garasjen ryddet og kvittet seg med 4 sekker søppel', week: Wm2, people: ['far'], created: new Date().toISOString() }
    ],
    notes: {
        [W0]: {
            'planer-uken.md': `# Planer for uken hjemme\n\n- Middag hos @mor og @far på onsdag\n- Kaffe med @lise når hun er i byen\n- Trening med @marte mandag\n\n## Innkjøpsliste\n\n- [ ] Melk\n- [ ] Brød\n- [ ] Tomater\n- [ ] Kaffe\n`,
            'tanker-bursdag.md': `# Bursdag for @mor\n\nHun blir 65 i mai. Diskutert med @lise:\n\n- Liten familie-middag hjemme\n- Bilde-bok med gamle bilder\n- Helgetur til hytta i juni som "ekstra"\n\nMå huske å booke restaurant hvis vi går ut.\n`
        }
    }
};

writeContext('demo-jobb', jobb.settings, jobb);
writeContext('demo-hjem', hjem.settings, hjem);

console.log('\nDone. Bytt kontekst i nav-baren for å se dem.');
