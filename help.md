# Hjelp

Velkommen til **Ukenotater** — et personlig system for ukenotater, oppgaver, møter og personer organisert per kontekst.

## Oversikt

Appen er bygget rundt **uker**. Hver uke har:

- **Notater** — markdown-filer (`yyyy-Www.md`) du kan redigere fritt
- **Oppgaver** — todo-elementer som kan fullføres med kommentar
- **Møter** — kalenderoppføringer med type og deltakere
- **Resultater** — utfall og leveranser knyttet til uka

## Kontekster

Alt innhold lever inne i en **kontekst** (f.eks. "Jobb", "Privat"). Hver kontekst har sin egen mappe med data og kan kobles til et eget git-repo for backup og versjonering.

Bytt kontekst via velgeren øverst i navigasjonen. Administrer kontekster på `/settings`.

## Hurtigtaster

| Tast | Side |
|------|------|
| `Alt+H` | 🏠 Hjem |
| `Alt+O` | ☑️ Oppgaver |
| `Alt+K` | 📅 Kalender |
| `Alt+P` | 👥 Personer og steder |
| `Alt+R` | ⚖️ Resultater |
| `Alt+N` | 📝 Nytt notat |
| `Alt+S` | ⚙️ Innstillinger |

## Hjem

Hjemskjermen viser inneværende uke med notater, møter og oppgaver. På venstre side er **åpne oppgaver** for alle uker; fullførte oppgaver vises sammen med uka de ble løst.

På høyre side ligger **resultater** som rulles fram fra tidligere uker.

## Oppgaver

- Klikk avkrysningsboksen for å fullføre en oppgave (legg til valgfri kommentar)
- Bruk `+` for å legge til en ny oppgave på en uke
- Fullførte oppgaver flyttes til uka der de ble fullført

## Møter

Møter har en **type** (møte, 1-på-1, standup, workshop osv.) som vises som et ikon i kalenderen og sidekortet.

Møtetyper konfigureres per kontekst på `/settings` under "Møtetyper". Velg ikoner fra det grupperte ikonpaletten (Personer, Kommunikasjon, Dokumenter, Sport, …).

## Resultater

Resultater er korte utsagn om utfall, beslutninger eller leveranser knyttet til en uke. De vises på `/results`, i hjemskjermens uke-sidekort, og inkluderes i ukentlige AI-oppsummeringer.

To måter å lage resultater på:

1. **Fra et oppgavenotat** (knyttet til oppgaven) — skriv `[teksten]` i firkantparenteser i notatet til en oppgave. Hver firkantparentes blir et eget resultat. Markdown-lenker (`[tekst](url)`) regnes ikke som resultater.

   Eksempel:
   > Vi diskuterte arkitektur-valget. [Bestemt: gå for PostgreSQL] — alle på laget enige.

2. **Manuelt** (frittstående) — klikk **➕ Nytt resultat** på `/results`, skriv tekst og velg uke. Disse er ikke knyttet til en oppgave.

`@navn`-omtaler i et resultat huskes som "involverte personer" og vises som lenker til personkortet.

## Personer og steder

Siden `/people` har tre faner: **Personer**, **Selskaper** og **Steder**.

### Personer
Personer refereres med `@kortnavn` i notater og oppgaver. Ved hover vises et tooltip med navn, tittel, hovedselskap og kontaktinfo. Bruk **➕ Ny person** for å opprette. Hver person kan ha:
- Et **hovedselskap** (én relasjon, primær)
- **Andre selskaper** (flere — for personer som jobber/har rolle hos flere)
- Inaktiv-flagg (skjules fra `@`-autofullføring men beholdes)

Kortet kan utvides for å se alle referanser: **Oppgaver**, **Møter**, **Resultater** og **Notater** med direktelenker.

### Selskaper
Selskaper deler `@kortnavn`-rommet med personer — du kan skrive `@acmeas` i et notat og få en lenke til selskapskortet (🏢 ikon). Lagre **org.nr**, **web**, **adresse** og notater. Selskapskortet viser alle medlemmer (personer med selskapet som hoved- eller bi-relasjon) pluss møter, resultater og notater som nevner selskapet.

### Steder
Steder brukes som valgfritt **registrert sted** når du oppretter et møte i kalenderen. De er ikke `@`-mentionable — du velger dem fra en nedtrekksliste. Hvert sted har navn, adresse, valgfri **geo-posisjon** og notater.

**Kart-velger:** Ved opprettelse/redigering av sted vises et OpenStreetMap-kart. Klikk for å plassere markøren; dra markøren for å justere. Lat/lng fylles automatisk. Mini-kart vises også på selve stedskortet når koordinater er satt.

I møte-modalen i kalenderen er det to felt for sted: **Sted (fritekst)** for ad hoc lokasjoner som "Teams" eller "Kafé X", og **Knytt til registrert sted** for å lenke møtet til et lagret sted (med kart-lenke).

## Notater

- Notatformat er markdown
- Lagre med `Ctrl+S` i editoren
- Bruk `>` for sitater, `|` for tabeller — det styles automatisk
- `@kortnavn` blir til lenker som peker på personkortet

## Kalender

Kalenderen på `/calendar` viser møter i en uke-grid. Klikk på et tidspunkt for å lage et møte; klikk på et møte for å redigere.

Bruk **✏️ Typer** for å justere møtetypene tilgjengelig i den aktive konteksten.

## Innstillinger

`/settings` har en **master/detail**-layout: kontekstene listes på venstre side, og valgt kontekst kan redigeres til høyre.

Hver kontekst har:

- **📦 Status** — git-status og commit-knapp
- **📝 Generelt** — navn, ikon, beskrivelse, remote URL
- **🗓️ Møtetyper** — egen liste med ikoner og labels

## Git og backup

Hvis en kontekst har en `remote`, blir endringer committet og kan pushes manuelt fra status-seksjonen. Data ligger i `data/<kontekst>/`.

> **Tips:** Notater committes ikke automatisk før destruktive operasjoner — bruk commit-knappen ofte hvis du jobber med viktige data.

## Snarveier i notater

| Syntaks | Resultat |
|---------|----------|
| `@navn` | Lenke til person |
| `> ...` | Blå sitat-blokk |
| `\`code\`` | Inline kode |
| `| a \| b |` | Tabell med stylet header |

---

Trykk `Esc` eller klikk utenfor for å lukke denne hjelpen.
