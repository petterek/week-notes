# 📅 Ukenotater (Week Notes)

> 🌀 **Totally vibe-coded.** No specs, no tickets, no roadmap — just a long conversation with an AI pair-programmer and a steady stream of "ooh, what if it also did this?" Every feature here exists because it felt right in the moment. Reader discretion advised.

A self-hosted, single-binary Node.js web app for keeping structured weekly notes, tasks, people and results across multiple isolated **contexts** — each one its own git repo.

Built for the daily reality of knowledge work: notes are markdown, tasks live next to the week they came up in, and everything is plain files on disk you can grep, back up, and version with git.

---

## 📜 Changelog

### 2026-05-04 (oppgaver: redigering, frist med tid, kommentar-notater i ukevisningen)
- Ny **`<task-view>`**-komponent: skrivebeskyttet modal som viser alle felt på en oppgave, med norske labels (Forfatter, Ansvarlig, Frist, Fullført av, Fullført uke, …) og rød/fet markering når frist er passert.
- Ny **`<task-edit-modal>`**-komponent: redigér åpne oppgaver (tekst, ansvarlig, frist, notat). Bruker `<date-time-picker>` i `datetime`-modus for frist, så tidspunkt kan settes ned til 5-minutters oppløsning.
- **Frist (`dueDate`)** lagres som `YYYY-MM-DD` (legacy) eller `YYYY-MM-DD HH:MM`. Server + skjema validerer begge formater. Forfalt-sammenligning bruker faktisk `Date`-aritmetikk.
- **`completedBy`** settes på alle 4 fullføringsstier (toggle, close-from-note, to auto-complete-stier ved notatlagring) basert på aktiv `@me`. Vises i `<task-view>` når oppgaven er fullført.
- **`<task-open-list>`**-rader viser frist-pille (grå, rød+fet hvis forfalt), bedre kontrast på handlings-ikoner (📓/✎/🗑) via `--text`/`--accent`/`--danger`-variabler i stedet for hardkodede grå nyanser.
- **Oppgave-kommentarnotater** (`oppgave-<id>.md` som skrives ved fullføring med kommentar) får nå `created`-tidsstempel i meta og dukker opp under riktig dag i ukevisningen i stedet for "Uten dato". Eksisterende filer er backfillet basert på `task.completedAt`.
- **`<inline-task>`**-pille bruker nå `--surface-alt`/`--border`/`--text` i stedet for ikke-eksisterende `--neutral`/`--neutral-soft`-variabler — fikser kontrasten på nerd-temaet (lys grå pille på svart bakgrunn).

### 2026-05-03 (date-time-picker, `/`-søk, ny meeting-create-modal, home-layout)
- Ny **`<date-time-picker>`**-komponent: egen kalender-popup (Mon-først, norske ukedags-/månedsnavn, "I dag"-snarvei, Avbryt/OK) med valgfri timer-/minutt-velger i `datetime`-modus. Erstatter native `<input type="date">` slik at popup-en faktisk åpner seg fra `Ctrl+D`/`Ctrl+Shift+D`-snarveiene i markdown-editoren.
  - Public `focus()` fanger tastatur globalt mens picker-en er åpen og frigjør det igjen ved commit/avbryt; piltaster, Enter (kjedet dag → time → minutt → commit), Alt+Enter (universal commit) og Esc (avbryt).
  - Events: `datetime-selected` (`{ value }`) og `datetime-cancelled` — begge bobler/composed.
  - Brukes både fra moderne `<note-editor>` (via `wn-date-trigger.js`) og legacy `mention-autocomplete.js` (lazy module-load).
- Global **`/`-snarvei** åpner søk (norsk-tastatur-vennlig — `e.key === '/'` matcher uavhengig av Shift). Snarveien vises i navbar-lenken og i snarvei-baren nederst.
- `<note-editor>`-snarveier: byttet "tema"-label til **"tag"** for `#`-snarveien for å matche faktisk semantikk.
- **Hjem-layout:**
  - `<today-calendar>` ligger nå alltid **nederst** i venstre-sidebar (flexbox `margin-top: auto`), uavhengig av om innholdet over scroller.
  - Fjernet det innebygde `+ Nytt møte`-knapp inne i `<today-calendar>` til fordel for en ny gjenbrukbar komponent.
  - Senterspalten scroller nå alene; sidebar og hovedlayout står stille (`main#content:has(.home-layout) { overflow: hidden }` + `.home-main { overflow-y: auto; height: 100% }`).
- Ny **`<meeting-create-modal>`**-komponent: tynn wrapper rundt `<modal-container>` + `<meeting-create>`. Render-er som en `+`-knapp (`label`/`title` overstyres) og lazy-mounter modalet til `document.body` ved klikk. Re-emitter `meeting-create:created/cancel/error` og auto-lukker ved created/cancel. Plassert flytende oppe-til-høyre på dagskalenderen i hjem-sidebaren.

### 2026-05-03 (UI-tester: Playwright + delt scenario-bibliotek)
- Ny `tests/scenarios.js` med 24 delte UI-scenarioer som kjører både via **Playwright** (`npm test`) og live i nettleser fra `/debug/tests`. Hvert scenario er en selvstendig `async`-funksjon som driver en `/debug/<komponent>`-side med mock-tjenester.
- `/debug/tests` viser scenarioene **gruppert per komponent** med Run-/Details-knapper, Run all / Run failed only og en "Last Playwright run"-rute som leser `tests/.last-run.json`.
- **Details-modal:** se og rediger `run(ctx)`-kildekoden direkte i nettleseren (in-memory; reload for å reverte). Apply & Run anvender og kjører i samme klikk.
- Dekning: task-open-list / task-create / task-add-modal / task-completed / task-complete-modal / people-page / modal-container / json-table / global-search / icon-picker / time-picker / week-pill / markdown-preview / note-card / help-modal / upcoming-meetings / person-card / ctx-switcher.
- Mock-tjenestene (i `domains/_mock-services.js`) eksponerer `MockTaskService`/`MockPeopleService`/`MockMeetingsService` osv. — komponenter på debug-sider binder seg via `service="MockXxx"`-attributter.
- Ny `agents/tests.md` dokumenterer scenario-kontrakten og fallgruvene (lys vs. shadow DOM, dobbel json-table render, mock-seeding-races).
- AGENTS.md: ny seksjon **"Bug fixing workflow"** — når en bug oppdages, reproduser den først som et failing scenario før du fikser, og la testen stå som regresjonsvakt.

### 2026-05-02 (notater: forfatter-sporing)
- Hver note-sidecar tracker nå **`createdBy`** (settes ved første eksplisitte lagring) og **`lastSavedBy`** (oppdateres ved hver eksplisitt lagring). Begge er nøkkel til person i registeret — basert på `@me`-mappingen for aktiv kontekst (`data/user.json`).
- `<note-meta-view>` viser "Opprettet av" og "Sist lagret av" som klikkbare person-chips.
- Autosaves attribueres ikke (de er midlertidige). Møte- og oppgave-notater får også `createdBy` ved opprettelse.

### 2026-05-02 (resultater: `[[X]]` → `[[?<id>]]` ved lagring)
- Inline-resultatmarkøren oppfører seg nå som inline-oppgaver: ved **eksplisitt** lagring opprettes resultatet og markøren skrives om til `[[?<id>]]` i kildenotatet — ikke lenger strippet til ren tekst. Det gir en stabil ref slik at resultatet kan rendres som chip og navigeres til fra notatet.
- Ny `<inline-result result-id="...">`-komponent (speiler `<inline-task>`): blå chip med 🏁 og resultatteksten, klikk navigerer til `/results#r-<id>`.
- `linkMentions` (server + klient) gjenkjenner både `[[X]]` (pre-save preview-pille via `<inline-action kind="result">`) og `[[?<id>]]` (linket chip).
- `computeNoteReferences` leser linket-formen direkte til `id`; legacy label-form fortsatt støttet via tekstmatch.
- Re-save av et notat med `[[?<id>]]` er idempotent — ingen duplikat-resultater.

### 2026-05-02 (per-bruker `@me`-mapping)
- Ny **👤 Min identitet**-fane under Applikasjonsinnstillinger. Velg hvilken person fra registeret som er `@me` — settes per kontekst.
- Mappingen lagres i `data/user.json` (utenfor alle kontekstenes git-repoer), så flere brukere kan dele samme kontekst med hver sin `@me` uten at det merges inn i delt git-historikk.
- `linkMentions` (server + klient) erstatter `@me` direkte med riktig person når notater rendres; ingen klient-side substitusjon eller cookies.

### 2026-05-01 (inline task-checkbokser i renderte notater)
- `{{X}}`-markører i ukenotater er nå **toveis koblet** til oppgaven: ved lagring rewrites markøren til `{{?<id>}}` (åpen) i filen, og oppgaven får `noteRef` til kildenotatet.
- I rendret notat vises `{{?<id>}}` / `{{!<id>}}` som en interaktiv checkbox (`<inline-task>`-komponenten) med oppgaveteksten. Klikk veksler done-status via `POST /api/tasks/:id/close-from-note`, som også flipper markøren i kildefilen mellom `?` og `!`.
- Komponenten emitter et bobblende `task-closed`-event (`{ taskId, done }`); shellen videresender det til de eksisterende `task:completed`/`task:uncompleted`-eventene så åpne/lukkede oppgavelister oppdateres uten reload.
- Editor-preview gjenkjenner nå alle tre markørformer: `{{X}}` og `{{?id}}` → fet, `{{!id}}` → gjennomstreking.

### 2026-05-01 (snarveier, snarvei-bar, småfikser)
- Slim **snarvei-bar** nederst på alle sider med alle aktive hurtigtaster (Alt+H/O/K/P/R/N/S, Esc, ?). Fast plassert; ingen opacity. `?` åpner hjelp-modalet (suppressed når man skriver i input/textarea).
- Alle Alt+ navigasjons-snarveier dokumentert i `help.md` er nå faktisk koblet (`Alt+H` → Hjem via brand-link, `Alt+O/K/P/R/S` → Oppgaver/Kalender/Personer/Resultater/Innstillinger).
- "Nytt"-knappene på `<task-open-list>` og `<today-calendar>` er stilt likt — kompakt accent-pille med bare `+`.
- Velkommen-fanen i Applikasjonsinnstillinger: fjernet `max-width`-kappene og satt `white-space: nowrap` på de fete labelne så ingen brytes midt i.
- `/tasks`: byttet ut udefinert `<open-tasks>` med fungerende `<task-open-list>` (siden var tom).

### 2026-04-30 (summarize: lokal modell + ekstern i ny app-settings-fane)
- Ny **📝 Oppsummer**-fane under Applikasjonsinnstillinger med samme tabell-/pill-mønster som Søk-fanen. Velg modell og slå funksjonen av/på.
- Modellutvalg: **GitHub Models · gpt-4o-mini** (☁ Ekstern, krever `gh auth login` / `GH_TOKEN` — best kvalitet, anbefalt) + lokale seq2seq-modeller `distilbart-cnn-6-6/12-6`, `bart-large-cnn`, `t5-small`. Alle Xenova-modellene er trent på engelsk; for norsk er Ekstern det eneste reelle alternativet.
- Lokale modeller kjøres i ny `summarize-worker.js` (mirror av `embed-worker.js`) med `transformers.js` `summarization`-pipeline. Lange ukenotater chunkes (~600 ord) før oppsummering.
- Eksisterende «✨ Oppsummer»-knapp på uke-visningen velger automatisk lokal worker når funksjonen er på og en lokal modell er valgt; ellers kalles GitHub Models som før.
- Nye endepunkter: `GET /api/summarize/status`, `GET /api/summarize/events` (SSE), `DELETE /api/app-settings/models/:id` håndterer både embed- og oppsummerings-modeller.
- Justert overlay-stil for «+ Nytt møte» i kalender og hjem-sidens dagsplan slik at den matcher «Lag oppgave»-modalet (samme bakgrunn, bredde, sentrering).

### 2026-04-30 (search: BM25-cache, app-settings panel, model picker)
- BM25 inverted index caches til `data/<ctx>/.cache/search-index.json` (signatur-versjonert) for rask kald-start; tokens-tabellen lagres komprimert.
- Ny **Applikasjonsinnstillinger**-seksjon på `/settings` med faner **👋 Velkommen** og **🔍 Søk**. Pillen i hver kort fungerer som av/på-bryter (Aktiv / Stoppet).
- Embedding-modeller vises som tabell med Navn|Størrelse|Språk|Beskrivelse|Status|Handling. Aktiv rad har grønn ramme; nedlasting viser progress-bar i Status-cellen og "⬇ Laster X%".
- Slett-knapp per modell rydder opp `models/<id>/`. Aktiv modell kan ikke slettes — slå av først.
- Når søk er stoppet og valgt modell ikke er på disk, leser pillen "⬇ Last ned og aktiver".
- Modellutvalg utvidet fra 5 til 12: la til `bge-base-en-v1.5`, `all-mpnet-base-v2`, `paraphrase-multilingual-mpnet-base-v2`, `gte-small`, `gte-base`, `jina-embeddings-v2-small-en`, `snowflake-arctic-embed-s`.
- Reverse indeks (BM25) kan slås av/på globalt; SSE-stream normaliserer `progress_total` (0..1) til prosent.
- Ny per-kontekst **🔍 Indekser**-fane med stats fra `GET /api/contexts/:id/index-stats` (filstørrelser, dok-antall, modell, dim).

### 2026-04-30 (gitignore: exclude .cache/ embed sidecar)
- `data/<ctx>/.cache/embeddings.json` (vektor-cachen for embedding-søk) skal ikke i git. La til `.cache/` i `gitignore-baseline`-migrasjonen, som også kjører `git rm --cached -r .cache` for kontekster der filen allerede var committet. Save-stien i serveren legger nå også til `.cache/` i `.gitignore` på første lagring.

### 2026-04-30 (note-view: close button + debug page)
- ✕-knappen i `<note-view>` lukket ikke modalet — click-listeneren stod på host-elementet, men shadow-DOM-eventer blir retargetet til host så `dataset.action`-sjekken matchet aldri. Flyttet listeneren inn i shadowRoot.
- La til en debug-side for `<note-view>` på `/debug/note-view` med en knapp som åpner et eksempelnotat mot `MockNotesService`.

### 2026-04-30 (search: note-view modal for note hits)
- Klikk på et notat-treff i globalt søk åpner nå notatet i et `<note-view>`-modal i stedet for å navigere bort fra siden. Esc/✕ lukker. Krever ingen sidenavigasjon, så søk-konteksten beholdes.
- Fikset `NotesService.renderHtml`: `/api/notes/.../render` returnerer JSON `{html, ...}`, men servicen sendte hele objektet videre. Henter nå ut `.html`-strengen.

### 2026-04-30 (search/embed: relations + note-card results)
- Søkeindeksen (token + embedding) inkluderer nå også notatets _relasjoner_: tags/temaer (`#tag`), `@mentions` (personer/firma), `{{oppgave}}`-referanser og `[[resultat]]`-referanser. Et notat som nevner `@anna` finnes nå på `anna`, og embeddinger fanger relasjoner i den semantiske rangeringen.
- Globalt søk-modal viser notat-treff som `<note-card>` (samme presentasjon som /notes), med tema-pils og snippet i stedet for en flat lenke. Andre typer (oppgaver, møter, personer, resultater) bruker fortsatt den enkle lenke-raden.

### 2026-04-30 (search: navigate to editor; meeting-create: skip empty ctx)
- Klikk på et notat-treff i globalt søk navigerte til `/note/...` som ikke finnes lenger; bruker nå `/editor/<uke>/<fil>`.
- `meeting-create` spurte etter `/api/contexts//meeting-types` med tomt context-id før attributtet var satt; tidlig retur når `context` er tomt fjerner 404-spammen i konsollen.

### 2026-04-30 (search: semantic toggle)
- Globalt søk har nå en 🧠-bryter for semantisk (vektor-) søk via `/api/embed-search`. Valget huskes i `localStorage` (`gs.embed`). Standard er fortsatt token-/substring-søket på `/api/search`.

### 2026-04-30 (search: highlight title and path)
- Globalt søk markerer nå treff i tittel og sti, ikke bare i utdraget. Filnavntreff (f.eks. `migrasjonP4Arena`) var allerede indeksert, men siden tittel ikke var markert virket det som om de manglet.

### 2026-04-30 (search: fix YYYY-WNN week dirs)
- `search-worker.js` brukte fortsatt det gamle `YYYY-NN`-formatet for ukemapper, og indekserte derfor ingen notater etter at konteksten var migrert til `YYYY-WNN`. Både `isWeekDir`-regexen og `dateToIsoWeek`-helperen oppdatert.

### 2026-04-30 (workflow: develop branch)
- Daglig arbeid skjer nå på `develop`-grenen. `main` flyttes kun framover ved release, og hver release-commit på `main` får tag `vN`. Workflow er dokumentert i `AGENTS.md` under "Git workflow".

### 2026-04-30 (migrate-context: tag-anchored cutoffs)
- Nytt hjelper `appliesBeforeTag('vN')` i `scripts/migrate-context.js` slik at framtidige migreringer kan ankres på release-tags i stedet for vilkårlige commit-SHAer. Konvensjonen er dokumentert i `AGENTS.md` under Git workflow. Første ankertag er `v1` (på `fc809ad`).

### 2026-04-30 (settings: migreringer på Git-fanen)
- Git-fanen viser nå alle registrerte datamigreringer for konteksten, hvilke som er ventende (PENDING) versus opp-til-dato, og lar deg krysse av og kjøre kun de manglende. Forhåndsvisning og `Quarantine ukjente filer`-veksling er tilgjengelig før du kjører. Drives av nye API-endepunkt `GET/POST /api/contexts/:id/migrations` som skaller ut til `scripts/migrate-context.js --json` (med nye `--json` og `--only id1,id2` flagg).

### 2026-04-30 (migrate-context: inventory + quarantine + gitignore baseline)
- `scripts/migrate-context.js` får (1) en inventering som flagger ukjente filer i kontekstrota og ikke-`.md`-filer i ukemapper, (2) `--quarantine`-flagg som flytter dem til `_quarantine/<tidsstempel>/`, og (3) ny migrering `gitignore-baseline` som legger til `.*.swp`, `.*.swo`, `.*.autosave` i `.gitignore`. JSON-strukturen til kjente rotfiler (`settings/tasks/results/people/meetings/meeting-types/companies/places/notes-meta`) valideres også.

### 2026-04-30 (scripts: migrate-context.js)
- Nytt verktøy `scripts/migrate-context.js` som leser `.week-notes`-versjonen i en kontekst og kjører registrerte datamigreringer (idempotente). Første migrering: `week-iso-format` (`YYYY-NN` → `YYYY-WNN` i mappenavn, `tasks.json`, `results.json`, `notes-meta.json` nøkler, `meetings.json`). Brukt for `arbeid`. Kjør: `node scripts/migrate-context.js --ctx <id> [--dry-run] [--commit]` eller `--all`.

### 2026-04-30 (settings: koble fra og klon tilbake)
- Git-fanen har nå en `🔌 Koble fra`-knapp som committer + pusher + sletter den lokale mappen, og husker remote-URL-en i `data/.disconnected.json`.
- Skinnen viser en sammenleggbar `🔌 Frakoblede`-liste med klon-tilbake (åpner Ny kontekst i klone-modus med remote/navn forhåndsutfylt) og glem (`✕`).

### 2026-04-30 (kontekst: skriv .week-notes først ved første lagring)
- `.week-notes`-markøren skrives ikke lenger eagerly når en kontekst opprettes eller klones — den opprettes automatisk ved første eksplisitte note-lagring (`/api/save`). Dette unngår å bumpe versjonen i markøren før brukeren faktisk har gjort noe i konteksten.

### 2026-04-30 (settings: legg til kontekst fra git)
- Dialogen «Ny kontekst» har nå to faner: ✨ Ny (opprett tom) og 📥 Klon fra git (kloner et eksisterende week-notes-repo). Begge går gjennom samme `needsConfirm`-flyt for repos som mangler `.week-notes`-markør.

### 2026-04-30 (settings: Git-fane per kontekst)
- Ny fane `📦 Git` på innstillinger viser status (rent/dirty), remote og siste commit for valgt kontekst, med knapper for Commit, Push, Pull og Oppdater.
- `remote`-feltet flyttet inn i Git-fanen og inkluderes i `_collectForm` slik at endringer lagres via `PUT /api/contexts/:id/settings`.

### 2026-04-30 (note editor: revert to historical version)
- Modalvinduet for en historisk versjon har en knapp `↩️ Tilbakestill til denne` som laster innholdet fra det commit'et inn i editoren. Bekreftelsesdialog forhindrer utilsiktet overskriving av ulagrede endringer. Endringen tar ikke effekt før du eksplisitt lagrer.

### 2026-04-30 (note editor: git history panel)
- Notatredigereren har nytt `🕘 Historikk`-panel under fotmetadataen som lister commits som har endret denne filen i kontekstens git-repo.
- Klikk på et innslag åpner en modal som viser markdown for den versjonen (rendret med strikethrough på lukkede oppgaver).
- Ny API: `GET /api/notes/:week/:file/history` (commit-liste) og `GET /api/notes/:week/:file/at/:hash` (innhold på et bestemt commit).

### 2026-04-30 (note editor: keep {{!id}} in source, render as ~~text~~)
- Når du velger en oppgave i `{{!`-popoveren settes nå `{{!<id>}}` inn i selve teksten (kompakt og stabil mens man redigerer).
- Forhåndsvisningen viser `{{!<id>}}` som `~~<oppgavetekst>~~` (gjennomstreking).
- Ved eksplisitt lagring erstatter serveren `{{!<id>}}` med `~~<oppgavetekst>~~` i den lagrede markdownen, og lukker oppgaven.

### 2026-04-30 (note editor: commit explicit saves to git)
- Ved eksplisitt lagring av et notat committes endringen automatisk til kontekstens git-repo (`data/<ctx>/`) med melding `Opprett`/`Oppdater <uke>/<fil>`. Autosave committes ikke.
- Ved init/oppdatering legges `.*.autosave` i `.gitignore` slik at midlertidige autosave-filer aldri havner i historikken.

### 2026-04-30 (note editor: autosave to temp file)
- Autosave skriver nå til en skjult midlertidig fil `.<file>.autosave` ved siden av notatet i stedet for å overskrive selve notatet.
- Ved eksplisitt lagring eller Avbryt fjernes temp-filen. Ny endepunkt: `DELETE /api/save/autosave`.

### 2026-04-30 (note editor: close marker rendered as ~~strikethrough~~)
- Når du velger en oppgave i `{{!`-popoveren settes det nå inn `~~<oppgavetekst>~~` (markdown strikethrough) i stedet for `__...__`. Markøren forblir i den lagrede markdownen og renderes med gjennomstreking i previewet.
- Server-siden lukker en åpen oppgave hvis innholdet inneholder `~~<eksakt oppgavetekst>~~`. Eldre `{{!<id>}}`-markører fungerer fortsatt og fjernes som før.

### 2026-04-30 (note editor: close marker rendered as __bold__)
- Når du velger en oppgave i `{{!`-popoveren settes det nå inn `__<oppgavetekst>__` (markdown bold) i stedet for `{{!<id>}}`. Markøren forblir i den lagrede markdownen og renderes som fet skrift i previewet.
- Server-siden lukker en åpen oppgave hvis innholdet inneholder `__<eksakt oppgavetekst>__`. Eldre `{{!<id>}}`-markører fungerer fortsatt og fjernes som før.

### 2026-04-30 (note editor: close tasks via {{!id}})
- **Lukk-marker `{{!taskId}}`:** ved eksplisitt lagring lukker serveren oppgaven med matching id (setter `done`, `completedWeek`, `completedAt`) og fjerner markøren fra notatet. Antall lukkede returneres som `closedTasks` i save-responsen.
- **Autocomplete:** når du skriver `{{!` i notatets tekstfelt vises en popover med åpne oppgaver (filtrert på det du skriver etter `{{!`). Pil opp/ned + Enter velger oppgaven og setter inn `{{!<id>}}` for deg.

### 2026-04-30 (note editor: space after #tag commits as tag)
- I notatredigereren: når du skriver mellomrom rett etter `#tagName`, fjernes `#tagName` fra teksten og taggen legges til i tag-listen (om den ikke allerede finnes). Fungerer for alle tagger, ikke bare de i forslaglista.

### 2026-04-30 (notes: rename themes → tags, with backward compat)
- **`/api/save`** aksepterer nå `tags` (eller fortsatt `themes`) i body. På lagring skrives det samme arrayet til både `meta.tags` og `meta.themes`.
- **API-responser** (`GET /api/notes`, `GET /api/notes/:week/:file/{meta,card}`) speiler verdien i begge feltene `tags` og `themes`.
- **Klientkode** leser fra `n.tags || n.themes`; interne navn som `_filters.themes` → `_filters.tags`, `data-theme=` → `data-tag=`, `_themesEl` → `_tagsEl`, `.np-themes` → `.np-tags`, `.ne-themes` → `.ne-tags`. Eksisterende notater fortsetter å virke.

### 2026-04-30 (notes page: use note-card)
- **Notater-siden (`/notes`)** bruker nå `<note-card>`-komponenten for hver treff i listen, så type-ikon, themes/tagger, og handlinger (👁️ vis, ✏️ rediger, 🗑️ slett) er konsistent med resten av appen. Uke-etiketten vises til venstre for hvert kort.

### 2026-04-30 (notes filter: chips with counts)
- **Notater-siden (`/notes`):** filter-tagger vises igjen som klikkbare chips for alle brukte tagger, men hver chip viser nå `#tag (n)` der `n` er antall notater med den taggen.

### 2026-04-30 (tag-editor: counts on chips and suggestions)
- **`<tag-editor>`** har nytt valgfritt `counts` attributt (JSON `{tag: number}`). Når satt vises tellingen som `tag (n)` både i chip-listen og i forslagsnedtrekksmenyen.
- **Notater-siden (`/notes`):** filter-tagger viser nå hvor mange notater som har hver tag, både i forslag og på aktive chips.

### 2026-04-30 (tag editor: list view + notes page)
- **Innstillinger → Tagger:** vises nå som en lesbar liste (`#tag` per rad) med en **✏️ Rediger tagger**-knapp. Klikk for å bytte til `<tag-editor>` (chip-redigering), så **✓ Ferdig** for å gå tilbake til listevisning. Husk å trykke **💾 Lagre** for å lagre endringene.
- **Notater-siden (`/notes`):** filterchipsene er erstattet med `<tag-editor>` — typ inn for å legge til, × eller Backspace for å fjerne, autocomplete fra eksisterende tagger i notatene.

### 2026-04-30 (note editor: tag chips + #hashtag autocomplete)
- **Notat-redigerer** bruker nå `<tag-editor>` (samme komponent som i Innstillinger) for tag-feltet, med forslag automatisk hentet fra konteksten via `GET /api/notes/themes` (ny `NotesService.listThemes()`).
- **Hashtag autocomplete in textarea:** type `#tag…` and a popover offers matching available tags. Selecting one removes `#tag` from the markdown text and adds the tag to the chip list. Arrow keys / Enter / Escape supported.

### 2026-04-30 (tag editor component)
- **New `<tag-editor>` component:** chip-style tag input replacing the comma-separated text field on the **Innstillinger → Tagger** tab. Type and press Enter (or comma) to add a tag, click × to remove, Backspace on empty input removes the last chip, optional `suggestions` dropdown with arrow-key navigation. Form-associated (works inside both shadow DOM forms and plain `data-f` collectors).

### 2026-04-30 (json-table polish)
- **`<json-table>` ergonomics:** added a fullscreen overlay (⛶ button, Esc to close), a font-size dropdown (XS/S/M/L/XL), nested sub-tables for object/array cells, key/value rendering for plain objects, and horizontal scrolling for wide content. The debug `/services` Table view enables the toggle for any non-empty result.

### 2026-04-30 (json-table web component)
- **New component:** `<json-table>` — a reusable shadow-DOM web component that renders an array of objects (`element.data = […]`) as a sortable HTML table with sticky headers. Supports `columns`, `max-height` and `empty-text` attributes; primitives, booleans, numbers, nulls and objects each get their own cell class. Click a header to sort; click again to flip; a third click clears the sort.
- **Debug services:** the result panel's table view now uses `<json-table>` instead of inline DOM construction.

### 2026-04-30 (debug services: result close + table view)
- **Debug:** result panels on `/debug/services` now have a close (×) button and — when the result is an array of objects — a `▦ Table` toggle that flips the panel between pretty-printed JSON and a sticky-header table view. Toggling round-trips back to JSON. Works for any list endpoint (tasks, results, meetings, people, themes, etc.).

### 2026-04-30 (debug services: full CRUD coverage + shared http helper)
- **Debug:** `/debug/services` now exposes the full method surface of every service — POST, PUT and DELETE are listed alongside the existing GETs (59 methods across 10 services). Verb badges (GET/POST/PUT/DELETE) are color-coded; destructive methods (DELETE + a few POSTs that mutate live state) are highlighted with a red rail and require a confirm before running. Object-shaped params (e.g. `update(id, patch)`) render as a JSON textarea and are parsed before invocation. **Run all** still runs only parameter-less GETs.
- **Refactor:** every domain service now imports a shared `apiRequest` helper from `domains/_shared/http.js` (served at `/services/_shared/http.js`) — the per-file `req` duplication is gone.

### 2026-04-30 (debug services: View code in modal)
- **Debug:** the `</> View code` button on `/debug/services` now opens the source in a centered modal with title/path, a Copy button, and dismiss via the × button, backdrop click, or Escape. Source is fetched lazily and cached per file.

### 2026-04-30 (debug services page: view code)
- **Debug:** each service section on `/debug/services` now has a `</> View code` button that fetches and displays the service module's source inline (toggle to hide). Lazily loaded; the source is fetched once per section, then cached.

### 2026-04-30 (debug services page: complete coverage)
- **Debug:** `/debug/services` now lists all production services accurately. Added `CompaniesService` and `PlacesService` (both exported alongside `PeopleService` from `domains/people/service.js`) and `NotesService.listAll`. Section IDs/anchors are now keyed on the service name so multi-export modules don't collide.

### 2026-04-30 (services-only: components no longer fetch REST directly)
- **Refactor:** every active component now goes through its domain service for HTTP — no more direct `fetch('/api/...')` calls in component code.
  - `<settings-page>`: now uses `SettingsService` (listThemes / createTheme / saveSettings) and `ContextService` (list / create / switchTo) instead of raw fetches for contexts, themes, clone, save and switch.
  - `<today-calendar>` / `<week-notes-calendar>`: now use `ContextService.list()` to read the active context's settings (added `context_service` attribute on both pages).
  - `<global-search>`: requires `SearchService.search(q)` — the legacy direct-fetch fallback is gone.
  - `<task-create>`: now calls `TaskService.create(text)` via `tasks_service`. The `endpoint` attribute is removed; pages must wire `tasks_service`. `<task-create-modal>` forwards `tasks_service` to its inner `<task-create>`, and `<task-open-list>` forwards its own `tasks_service` to the modal.

### 2026-04-30 (context switch: apply theme immediately)
- **Context switching:** when switching context (via `<ctx-switcher>` or the Settings rail), the new context's theme is now applied to the page **before** the reload — no more flash of the previous theme while the page reloads.

### 2026-04-30 (settings: Tema tab + tab cleanup)
- **Settings:** added a `🎨 Tema` tab and brought back the swatch-grid theme picker — each tile previews the theme's actual palette (bg, surface-head, accent + line tones) and clicking selects it. Replaces the old `<select>`. Custom (non-builtin) themes are marked with a dashed border and a ✎ badge.
- **Settings → Tema:** added `🧬 Klon valgt tema` (prompts for a name, POSTs `/api/themes`, refreshes the grid and selects the new clone) and a `🎨 Åpne temaeditor ↗` link to the existing `/themes` builder.
- **Settings:** moved **Kommende møter (dager)** from Generelt to the `📅 Møter` tab next to Standard møtelengde.
- Tab order is now: Generelt, Tema, Tagger, Arbeidstid, Møter.

### 2026-04-30 (settings: Møter tab)
- **Settings:** added a `📅 Møter` tab. Moved **Møtetyper** out of the Arbeidstid tab into Møter, and added a per-context **Standard møtelengde (min)** field there (saved as `defaultMeetingMinutes`). Visible-hours and arbeidstid stay where they are.

### 2026-04-30 (icon-picker for context icon)
- **Settings:** the context icon (both in the detail form and in the `+ Ny kontekst` modal) is now a button that opens a popover with `<icon-picker>` (5×5 grid of 25 icons in two groups: Liv, Hobby — including ⛳ golf). Same shared popover infrastructure as the meeting-type icons; the icon set switches based on `data-icon-set` on the button.

### 2026-04-30 (icon-picker in meeting types)
- **Settings → Møtetyper:** the icon column is now a button that opens a popover with `<icon-picker>` (84 icons in 6 groups of 14: Jobb, Møter, Trening, Hjem, Reise, Annet). Click to pick; popover closes on selection, outside click or Esc.

### 2026-04-30 (`<icon-picker>`)
- New generic **`<icon-picker>`** component (Shared) — a configurable grid-based emoji / icon picker. Supports a flat `icons` JSON list (strings or `{icon, name}` objects), a sectioned `groups` mode, configurable `columns`/`size`, optional hidden form input via `name`, and a `readonly` flag. Emits `valueChanged` with `{value}` on selection. Demo at `/debug/icon-picker`.

### 2026-04-30 (settings: + Ny kontekst, default meeting length)
- **Settings page** got a `+ Ny kontekst` button at the bottom of the contexts rail. Opens a small modal (name / icon / description / optional git remote), `POST /api/contexts`, then auto-selects the new context. Replaces the legacy SSR `newCtxForm` that disappeared during the SPA port.
- **Meeting types** now have a per-type `defaultMinutes` field (number input next to the all-day toggle). When you create a meeting from the calendar (header `+ Nytt`, dblclick or right-click), the end time is computed as `start + type.defaultMinutes`, falling back to the context's `defaultMeetingMinutes` and finally 60. Wired in both `<today-calendar>` and `<week-notes-calendar>`.

### 2026-04-30 (today-calendar create)
- **`<today-calendar>`** can now create meetings: a `+ Nytt` button in the heading and a right-click / dblclick on the grid open an overlay with `<meeting-create>` (pre-filled with today's date or the picked slot). On save the overlay closes and the grid reloads.

### 2026-04-29 (today calendar on home)
- **`<today-calendar>`** added to the home page sidebar, below `<upcoming-meetings>`. Wraps a single-day `<week-calendar>` (start = end = today) and loads today's meetings from the meetings service. Picks up the active context's `workHours` / `visibleStartHour` / `visibleEndHour` from `/api/contexts`. Auto-rolls over at midnight via `nav-meta:newDay` and re-loads on `context-selected`. Heading shows the localized day + date.

### 2026-04-29 (nav-meta boundary events)
- **`<nav-meta>`** now emits `nav-meta:newMinute`, `nav-meta:newHour`, `nav-meta:newDay`, `nav-meta:newWeek`, `nav-meta:newMonth` and `nav-meta:newYear` (composed/bubbles) when the wall clock crosses each boundary. Detail payload contains the new value (`minute` / `hour` / `date` / `week` / `month` / `year`) and the `now` Date. No event fires on initial mount — only on actual transitions. Pages can listen on `document` to refresh "today / this week" derived UI without polling.

### 2026-04-29 (inline-create markers)
- **`{{X}}` and `[[X]]` markers in notes.** New shorthand for inline-creating entities while writing notes:
    - `{{X}}` → creates a new task with text X
    - `[[X]]` → creates a new result with text X (replaces the legacy single-bracket `[X]` syntax)
  Markers render as styled pills (green for tasks, blue for results) in any markdown preview via the new `<inline-action>` component, registered through `linkMentions` (server + client). On **explicit** save (Save / Lagre button on note editor, or task-note-modal save), the server creates the corresponding entities, strips the markers (keeping inner text), and writes a clean note. On **autosave** (the editor's 30s countdown), markers are preserved untouched so half-typed text like `{{Send rep` won't accidentally create a "Send rep" task. The `/api/save` response now includes `content` (cleaned) and `createdTasks` / `createdResults` counts; the note editor reflects the cleaned content back into the textarea after explicit save.

### 2026-04-29 (note editing modal + ➕ button on open list)
- **`<task-note-modal>`** — new dumb modal that edits a task's note. Same callback API as `<task-complete-modal>` / `<task-create-modal>`: `modal.open(task, cb)` runs the callback once with `{ saved, id, note }` (or `{ saved: false, id }` on Esc / backdrop / ✕). Markdown + `@mentions` are written through to the existing `tasks_service.update(id, { note })` API. Pre-fills the textarea with the existing note and places the cursor at the end. Esc / Ctrl-⌘+Enter shortcuts.
- **`<task-open-list>`** — note 📓 button now opens the new `<task-note-modal>` (mounted in shadow DOM) and persists via the service on save. Add (`＋`) button opens `<task-create-modal>` via the new callback API. The legacy `window.openNoteModal` on the SSR tasks page is left untouched for now.
- **`<task-create-modal>`** — refactored to a dumb callback API (`modal.open(cb)`); the trigger button is gone, the inner `<task-create>` still emits `task:created` so the global SPA cross-list refresh wiring keeps working.

### 2026-04-29 (results-page SPA)
- **`<results-page>`** — SPA replacement for `/results`. Lists results grouped by ISO week (descending), each card with edit / delete actions; header has a "Nytt resultat" button. Both edit and create use a shadow-local modal (Esc cancels, Ctrl/⌘+Enter saves). `@`-mentions render via `linkMentions` + `<entity-mention>` chips so they auto-resolve display names. Hash deep-link `/results#r-<id>` scrolls to and briefly flashes the matching card. `pages/results.html` now mounts the component; the legacy SSR `/results` body is unreachable (SPA stub wins) and will be removed in a follow-up.

### 2026-04-29 (callout + mention chip + modal callback)
- **`<entity-mention>` chip.** Reusable inline element representing a reference to a person, company or place. Given `kind` + `key` it auto-resolves the entity from `window['week-note-services']` (falling back to `window.MockServices`), shares one cached Promise per kind across the page, and re-renders with the friendly display name (`FirstName LastName` for people, `name` for companies/places). Optional `label` attribute skips the lookup. Emits `hover-{kind}` (with `{ key, entering, x, y }`) and `select-{kind}` (with `{ key }`). All `linkMentions` callsites now emit `<entity-mention>` instead of `.mention-link` anchors; the result-person renderer was switched too. Document-level `select-person`/`select-company`/`select-place` handlers in the SPA shell turn clicks into navigation.
- **`<entity-callout>` is fully dumb.** Refactored to a pure presentation tooltip: `setData({ kind, entity, key, x, y })`, `hide()`, public `position(x, y)`. No services, no document listeners, no cache. The SPA shell hosts a single `<entity-callout id="appEntityCallout">` and listens at `document` for `hover-*` events (composed events bubble across all shadow boundaries), resolves the entity from lazy-loaded services and drives the callout. A small `.mention-link` mouseover/mouseout/mousemove bridge converts any leftover legacy anchors to the same hover events.
- **`<person-tip>` removed.** Replaced entirely by the shell-level callout host + `.mention-link` bridge.
- **Card hover events carry coordinates.** `<person-card>`, `<company-card>` and `<place-card>` now include `x: e.clientX, y: e.clientY` on every `hover-*` detail. The header company-pill in `<person-card>` also emits `hover-company`/`select-company` via a `data-ref="company"` attribute.
- **`<task-complete-modal>`** (new) — replaces the legacy inline `commentModal` for completing a task with an optional comment. Centered modal, dumb component. **Callback API** (not events): `modal.open({ id, text }, (res) => …)` runs the callback once with `{ confirmed: true, id, comment }` or `{ confirmed: false, id }`. Esc / backdrop / ✕ cancel; Ctrl/⌘+Enter confirms. Closing the modal silently drops the callback.
- **`<open-tasks>` → `<task-open-list>`** (renamed: file, class, custom-element tag, events `task-open-list:toggle`/`:note`). Now mounts a `<task-complete-modal>` inside its shadow DOM and uses the callback API: clicking a checkbox opens the modal with the task; on confirm, calls `service.toggle(id, comment)` and refreshes (also re-emits `task-open-list:completed`); on cancel, reverts the checkbox. The legacy `window.showCommentModal` shim is gone.
- **Renamed for grouping consistency:** `complete-task-modal` → `task-complete-modal` (already noted above), `open-tasks` → `task-open-list`. References in mocks, docs and `COMPONENT_GROUPS` updated.

### 2026-04-29 (later)
- **Home page wired up to production services.** Each `domains/<name>/service.js` is now an ES module with a named export (`export const XService = ...`) plus a guarded `window.XService = XService` for backward-compat. Served from `/services/<name>.js` (and `/debug/services/<name>.js`). Home + editor pages load all 8 service modules in head before component modules so `<ctx-switcher service="ContextService">` and any other service-driven component resolve correctly. Without this, the production navbar's context dropdown was silently broken (component did `if (!this.service) return;` because no service was on `window`).
- **`/debug/services` page** lists every production service and its GET endpoints, imported as ES modules (no `window` indirection in the test page). Each method has inline params and a ▶ Run button that invokes the service against the live `/api/*` backend; **▶ Run all** fires every parameter-less GET. Sidebar and per-card method order is alphabetical.
- Debug page **components list** now alphabetised.

### 2026-04-29
- **SPA migration: domain folders, service pattern, debug page.** Components reorganized into `domains/{notes,tasks,meetings,people,results,search,settings,context,composit}/` with one `service.js` per domain wrapping the existing `/api/*` endpoints. Each visual component looks up its data source via a `service` attribute (`<thing service="MeetingsService">`) and renders `renderNoService()` when missing — making them mockable. `domains/_mock-services.js` provides browser-side mocks (Mock*Service) for the debug page so every component can render in isolation.
- **`<week-notes-calendar>`** wrapper around the dumb display `<week-calendar>`. Fetches `service.list({week})` + `listTypes()`, maps to calendar item shape `{startDate, endDate, heading, body, type, id}` with type-icon prefix and `@attendees · 📍 location` body, then calls `cal.setItems()`. `<week-calendar>` itself no longer requires a service — items are pushed in via `setItems()`.
- **`<nav-button>`** (renamed from `<app-brand>`) gained `size` (1–5) and `icon` (emoji) attributes.
- **Per-day note grouping** in `<week-section>`: pinned notes first (📌 Festet), then groups by ISO date with Norwegian day headings ("mandag 27.04"), counts per day, "Uten dato" catch-all.
- **Service pattern conversions**: `<person-tip>`, `<global-search>` now read from `service` attr (with fallback to direct fetch / cached loader). Cache invalidates on source change.
- **Debug page** at `/debug` lists every component with rendered demos using mock services; each `/debug/<tag>` route shows the component standalone with editable attributes.
- Pages directory `pages/` introduced for SPA shells (home, calendar, editor, people).
- Theme files gained 16 new `--*` CSS variables for component theming.

### 2026-04-26
- `<upcoming-meetings days="14">`, `<week-results week="...">`, `<task-completed week="...">` web components — finish moving the home sidebar widgets into self-loading custom elements. Each fetches its data via `/api/*` (cached per-page through a shared `components/_shared.js` helper), renders the same markup as before and bubbles `mention-clicked` for `@`-links so the page-level handler can navigate.
- `<task-open-list>` web component — replaces the inline task-open-list sidebar markup. Fetches `/api/tasks` + `/api/people` + `/api/companies`, renders heading + rows, calls `window.showCommentModal` / `window.openNoteModal` when present, otherwise dispatches `task-open-list:*` events. `@`-mentions emit a bubbling `mention-clicked` event handled at page level so navigation logic stays out of the component.
- All web components now use `var(--*)` theme variables exclusively; removed the few remaining hardcoded colors (`#2b6cb0`, `#a0aec0`, `#c53030`).
- `<note-card note="WEEK/file.md">` web component (`components/note-card.js`) — self-loading note summary card. Fetches `/api/notes/<week>/<file>/card` for type/pin/snippet and renders the markup; action buttons call existing globals (`openNoteViewModal`, `openPresentation`, `deleteNoteFromHome`) when present, otherwise dispatch `note-card:*` events. Home weekly view emits one `<note-card>` tag per note instead of inline markup.
- `<ctx-switcher>` web component (`components/ctx-switcher.js`) — owns the navbar context dropdown handlers (toggle, click-outside-close, switch-context, commit). Removed inline IIFEs from both the home shell and editor.
- `<help-modal>` web component (`components/help-modal.js`) — lazy-loads `/help.md` on first open, listens for `#helpBtn` clicks and the `help:open` custom event, handles Escape. Replaces the duplicated help-modal markup + IIFE in `pageHtml` and editor.
- `<person-tip>` web component (`components/person-tip.js`) — singleton hover tooltip for `.mention-link`. Loads people + companies once and renders the appropriate card (person or company) with edge-aware positioning.
- `<app-navbar>` web component (`components/app-navbar.js`) — wraps the navbar shell (height, background, border, optional `fixed` positioning) in shadow DOM with named slots (`brand`, `switcher`, `links`, `meta`). Slotted children stay in light DOM so existing CSS/JS (context switcher, alt-key shortcuts, mention tooltip on links) keep working unchanged.
- `<nav-meta>` web component (`components/nav-meta.js`) — encapsulates the navbar's date / ISO-week / clock display in shadow DOM. Served from `/components/<name>.js`. Replaces three inline ticker scripts.
- Date and ISO week now displayed next to the clock in the navbar on every page.
- run.sh: remember last-used port in `.server.port` (gitignored); restart without `-p` reuses it. Explicit `-p` or `$PORT` overrides. Falls back to 3001 when no record.
- Navbar extracted to a single `navbarHtml()` component shared by `pageHtml` and the editor page.
- People page expanded into tabbed directory: **Personer / Selskaper / Steder**. People + companies share the `@kortnavn` namespace and are both `@`-mentionable; places are picked from a dropdown.
- Companies (`🏢`): full CRUD with name, org.nr, web, address, notes. `@key` mentions render as company pills with their own tooltip. Company cards list members (people with this as primary or secondary relation) plus referenced meetings, results, tasks and notes.
- People gained two separate company relation fields: `primaryCompanyKey` (single, optional — "Hovedselskap") and `extraCompanyKeys[]` (additional). Edit modal has a dropdown for primary plus a checkbox list for extras (auto-deduped vs primary).
- Places (`📍`): name + address + optional geo coords + notes. Edit modal has a Leaflet + OpenStreetMap **map picker** — click to place marker, drag to refine. Each place card shows a read-only mini-map when expanded, plus all meetings tied to the place.
- Calendar: meeting modal gained a "Knytt til registrert sted" dropdown (places). When set, the meeting block in the grid shows the place name as a link to OpenStreetMap. Free-text "Sted" remains for ad-hoc locations.
- Tab state preserved in URL hash (`/people#tab=companies&key=acmeas`) for shareable deep links.
- Renamed nav label from "Personer" → "Personer og steder" (route stays `/people`). The directory is generic enough to also hold places, companies, and other named entities you mention with `@key`.
- People: `/people` overhauled. Reference detection now matches by `@key` (lowercase) instead of full display name, so all references that previously showed `0 ref.` are correctly counted. Person cards now also surface **Møter** and **Resultater** with deep links (in addition to Oppgaver and Notater).
- People: new **➕ Ny person** button on `/people` opens a modal that lets you create a person directly without going via an `@`-mention. Auto-generates a unique lowercase key from the first name. New `POST /api/people` endpoint.
- People: full restyle to use theme variables (was hardcoded `white`, `#a0aec0`, `#2b6cb0`, …); proper dark/forest/nord rendering. Person cards anchor on `#<key>` for deep linking; navigating to `/people#anna` expands and scrolls to that person.
- Results: `/results` page now has a **➕ Nytt resultat** button to create free-form results not tied to a task. New `POST /api/results` endpoint backs it.
- Results: fixed bug where markdown links in task notes (`[text](url)`) were treated as result entries — extractor now uses negative-lookahead for `(`.
- Results: `/results` page restyled to use theme variables instead of hardcoded colors (`white`, `#2b6cb0`, `#ebf8ff`, …); proper dark/forest/nord rendering. People rendered as `mention-link` with hover-tooltip and `/people#<key>` anchor. Within-week sort now `created` desc.
- Help and `agents/results.md` updated with the two creation paths.
- Fixed: home page now correctly highlights and expands the current week. The internal `getCurrentYearWeek()` helper was producing a non-canonical format (`2026-17`) that never matched the canonical week-folder format (`2026-W17`), so the "active" week was silently treated as a regular older week. Aliased to `dateToIsoWeek(new Date())`.
- Git tab: new "📥 Pull fra remote" button on contexts with a remote — runs `git pull --ff-only`, refuses to run if there are uncommitted changes
- New `scripts/seed-dummy.js` — creates two demo contexts (Demo Jobb / Demo Hjem) with people, tasks, meetings, results and notes for testing/showcase
- Settings: Generelt tab now shows the context's `.week-notes` marker version vs the running server version (color-coded match / mismatch / missing). Saving settings always refreshes the marker to the current server version.
- run.sh: when an existing server is detected, prompt `[y/N]` to restart it (gracefully SIGTERM, fall back to SIGKILL) instead of just exiting
- run.sh: on startup, check if origin has newer commits and offer (`[Y/n]`) to pull before launching the server
- Themes: new `/themes` builder — clone any theme, edit its CSS variables (colors, font-family, font-size) with color pickers + live preview, save as a custom theme in `data/_themes/` (gitignored). Built-ins are read-only.
- Themes: per-theme `--font-family` and `--font-size` vars; `body` reads them so the entire UI rescales when you change font-size on a theme. Form controls inherit. Nerd theme runs at 14px monospace by default.
- Settings: theme grid enumerates dynamically (built-ins + custom) with a "🎨 Tilpass tema →" link to the builder
- Welcome screen: after creating or cloning a context, switch to it and open `/settings` instead of the home page so the new context can be configured immediately
- Disconnected-repo memory now deduped by remote URL (read and write) so the same repo never appears twice in the known-repos picker
- Settings: known-repos picker shown on the "Klon fra remote" pane, mirroring the welcome page
- Welcome screen: known-repos picker on the clone form — click a remembered remote to prefill name + URL, ✕ to forget
- Disconnect context: new "🔌 Koble fra" button on the Git tab — commits + pushes any pending changes, removes the working tree, and remembers the remote URL in `data/.disconnected.json` (gitignored)
- Remote validation: a context-repo must contain a `.week-notes` marker file (with the week-notes git SHA as version); missing marker prompts the user to confirm before the marker is created and committed
- First-run: when there are no contexts yet, `/settings` shows a dedicated welcome screen with project intro + two side-by-side cards for creating a new context or cloning from a git-remote
- Settings: new "Klon fra remote" rail entry — `git clone`s an existing context-repo straight into `data/<name>/`
- Settings: when a git-remote is added (or changed) on a context the server now does a fetch + pull (allow-unrelated-histories) so existing remote content lands locally
- run.sh: if the chosen port is occupied, automatically falls back to a random free port instead of failing
- Settings: context detail split into Generelt / Møter / Git tabs; selected tab is remembered across reloads
- Settings: Arbeidstid editor laid out horizontally as seven day cards (Man–Søn) with a polished time-picker pill
- Settings: default meeting length is now per meeting type (with its own minutes input) rather than per context
- Settings: meeting types reorderable by drag handle
- Settings: clicking a theme swatch live-previews the look on the active context; persists on Save
- Contexts: list ordered by display name
- Theming: each context picks one of seven themes — paper, dark, nerd, solarized-light, nord, forest, ocean — selectable from `/settings`. Themes live as small CSS files in `themes/`.
- Calendar: drag a meeting to move it (across days too), drag the bottom edge to resize — snaps to 5-minute increments
- Calendar: red "now" line on today's column, auto-updating every minute
- Calendar: timestamped task/note/result activity markers on the day they were saved/completed, with toolbar chips to toggle each kind
- Calendar: restyled meeting modal — paper-theme header, consistent inputs, taller resizable notes, pinned action bar
- Search: global Ctrl+K / `/` modal on every page
- Search: now covers tasks, meetings, people and results in addition to notes
- Search: moved to a `worker_threads` inverted index that auto-rebuilds on file changes
- Context switch made async (git pull + reindex now run in the background)
- Calendar uses the full page width
- Click an upcoming-meeting card on the home page to jump to the calendar week and pulse-highlight the meeting
- Configurable default meeting length per context (used to prefill the end time)
- Per-context working hours (start/end + weekdays) rendered as a band on the calendar
- Meeting time picker uses hour/minute selects with 5-minute increments
- Calendar shows all 24 hours
- `+ Nytt møte` button and right-click type menu on the calendar

### 2026-04-25
- New: meetings calendar with week view + upcoming list on home
- Per-context meeting types with grouped 96-icon emoji picker
- Master/detail `/settings` layout (full-width)
- People: inactivate, delete with tombstones, mention autocomplete in meeting modal
- Calendar polish: 24h grid, aligned hour labels, meeting note shortcut
- In-app help: `❓ Hjelp` button renders `help.md`
- Configurable server port (`-p` / `PORT`), startup tool checks
- Initial README, MIT licence stated explicitly

---

## ✨ Features

### Weekly notes
- One folder per ISO week (`YYYY-WNN`) containing freeform markdown notes
- Live markdown editor with autosave
- `@person` mentions with hover tooltips backed by a people directory
- Pin notes to the top of a week, give them types/icons
- Render any note as a [reveal.js](https://revealjs.com/) presentation in **7 styles**: paper, noir, klassisk, levende, minimal, matrix (digital rain), and NAV (with Aksel design tokens + circular logo watermark)

### Tasks
- Open tasks list on the home page (left sidebar), completed tasks shown with the week they were closed in
- Inline edit, notes per task, due dates
- Add tasks per week with `+` button

### Calendar & meetings 📅
- Full-width week-grid calendar at `/calendar` covering all 24 hours
- Click an empty slot to create, right-click for the meeting-type list, or use the `+ Nytt møte` button
- Meetings have a **type** (1-on-1, standup, workshop, …) shown as an icon in the grid and the home sidebar
- Meeting types are **per-context** and editable from both the calendar (`✏️ Typer`) and the context's settings card
- Grouped emoji picker with sections (Personer, Kommunikasjon, Dokumenter, Planlegging, Arbeid, Sport, …)
- Time picker uses hour/minute selects with 5-minute steps (consistent across browsers)
- Per-context **working hours** (start/end + weekdays, default Mon–Fri 08:00–16:00) rendered as a band overlay
- Per-context **default meeting length** prefills the end time when creating new meetings
- Click an upcoming-meeting card on the home page to jump to that week and pulse-highlight the meeting

### People & results
- Lightweight CRM: name, title, email, phone, freeform notes
- **Inactivate** to hide from autocomplete; **delete** uses tombstones so `@mentions` don't auto-recreate them
- Result/outcome log per week

### Contexts (multiple workspaces)
Switch between completely isolated workspaces — e.g. **work**, **side-project**, **golf** — each with its own notes, tasks, people, meeting types, and settings.

- Top-left dropdown switcher, available on every page
- Curated emoji icon palette (including ⛳ 🏌️)
- Master/detail settings page at `/settings`: contexts on the left, full editor on the right
- Hot-switching: no restart needed

### In-app help ❓
- `❓ Hjelp` button in the navbar opens a modal with the rendered `help.md`
- Same markdown styling as notes (tables, blockquotes, code blocks)

### Git per context 🔀
Every context is a stand-alone git repository under `data/<context>/`.

- **Auto-init** on creation; existing contexts are initialised on server start
- **Auto-commit** of pending changes when you switch away from a context
- **Auto-pull** (`--ff-only`) of the target context on switch, if a remote is configured
- **Manual commit** button in the context dropdown
- **Manual push** button on each settings card (uses your host's git auth — SSH agent or credential helper)
- Dirty/clean status, last commit hash & timestamp shown on each card
- Set a `remote` URL per context to sync with GitHub/GitLab/etc.

Push remains manual — pull happens automatically on switch.

---

## 🚀 Quick start

### Requirements

| Tool       | Required? | Why                                                          |
|------------|-----------|--------------------------------------------------------------|
| **Node.js** ≥ 18 | ✅ yes | Runs the server                                              |
| **git**          | ✅ yes | Each context is a git repo (init / commit / push / pull)     |
| **gh** ([GitHub CLI](https://cli.github.com/)) | ⚪ optional | Used to fetch a GitHub token for week summaries; falls back to `GH_TOKEN` env var if missing |

The server checks for these on startup and refuses to start if `git` is missing.

### Install & run

```bash
git clone git@github.com:petterek/week-notes.git
cd week-notes
npm install
./run.sh                # default port 3001
./run.sh -p 8080        # custom port
PORT=8080 ./run.sh      # via env var
```

Open <http://localhost:3001/>.

To stop:

```bash
./stop.sh
```

`run.sh` is idempotent — running it when the server is already up is a no-op. PID is tracked in `.server.pid`.

---

## 📁 Project layout

```
weeks/
├── server.js           # the entire app (single-file Node.js, no framework)
├── package.json        # only dep: marked
├── run.sh / stop.sh    # PID-based start/stop scripts
├── .gitignore          # excludes data/ — context data is its own repo
└── data/
    ├── .active         # active context id
    └── <context>/      # one folder per context, each a git repo
        ├── .git/
        ├── settings.json
        ├── tasks.json
        ├── notes-meta.json
        ├── people.json
        ├── meetings.json
        ├── meeting-types.json   # optional, falls back to defaults
        ├── results.json
        └── <YYYY-WNN>/
            └── *.md
```

`data/` is `.gitignore`-d in the app repo because each context is independently versioned.

---

## ⌨️ Keyboard shortcuts

| Shortcut  | Action               |
|-----------|----------------------|
| `Alt+H`   | Home                 |
| `Alt+O`   | Tasks                |
| `Alt+K`   | Calendar             |
| `Alt+P`   | People               |
| `Alt+R`   | Results              |
| `Alt+N`   | New note             |
| `Alt+S`   | Settings (contexts)  |

---

## 🔌 API

Mostly JSON, mostly REST-shaped. Useful endpoints:

| Method | Path                                | Purpose                              |
|--------|-------------------------------------|--------------------------------------|
| GET    | `/api/contexts`                     | List all contexts + active           |
| POST   | `/api/contexts`                     | Create a new context                 |
| POST   | `/api/contexts/switch`              | Switch active context                |
| PUT    | `/api/contexts/:id/settings`        | Update name/icon/description/remote  |
| GET    | `/api/contexts/:id/git`             | `{isRepo, dirty, last, remote}`      |
| POST   | `/api/contexts/:id/commit`          | Commit pending changes               |
| POST   | `/api/contexts/:id/push`            | `git push origin HEAD`               |
| GET/PUT| `/api/contexts/:id/meeting-types`   | Per-context meeting type list        |
| GET    | `/api/people`                       | People directory (excludes tombstones) |
| GET    | `/api/meetings`                     | Meetings for the active context      |
| GET    | `/api/notes/:week/:file/render`     | Rendered markdown for hover/preview  |
| GET    | `/help.md`                          | In-app help content                  |

---

## 🛠️ Tech

- Node.js (no framework — built on `http`, `fs`, `child_process`)
- [`marked`](https://marked.js.org/) for markdown
- [reveal.js](https://revealjs.com/) for presentations (loaded from CDN)
- [Aksel design tokens](https://aksel.nav.no/) + Source Sans 3 for the NAV slide style

No build step. No bundler. ~4300 lines of `server.js`.

---

## 📜 License

MIT — see [`LICENSE`](LICENSE).
